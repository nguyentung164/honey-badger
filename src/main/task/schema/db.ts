import { Client, Pool, type PoolClient, type QueryResultRow } from 'pg'
import configurationStore from '../../store/ConfigurationStore'

let pool: Pool | null = null
let poolResetPromise: Promise<void> | null = null

export const SCHEMA_ALREADY_EXISTS_CODE = 'SCHEMA_ALREADY_EXISTS'

export class SchemaAlreadyExistsError extends Error {
  code = SCHEMA_ALREADY_EXISTS_CODE
  constructor(message = 'Schema already applied. Init is not needed.') {
    super(message)
    this.name = 'SchemaAlreadyExistsError'
  }
}

function isHostedSupabaseHost(host: string): boolean {
  const h = host.toLowerCase()
  return h.includes('supabase.co') || h.includes('pooler.supabase.com')
}

/** SSL cho Supabase / khi ép bật/tắt. Local thường tắt. */
export function sslConfigForPg(): boolean | { rejectUnauthorized: boolean } {
  const store = configurationStore.store
  const host = store.dbHost?.trim() ?? ''
  const mode = (store.dbTls ?? 'auto') as 'auto' | 'required' | 'disabled'
  if (mode === 'disabled') return false
  if (mode === 'required') return { rejectUnauthorized: false }
  return isHostedSupabaseHost(host) ? { rejectUnauthorized: false } : false
}

function pgSchemaFromStore(): string {
  const t = configurationStore.store.dbPgSchema?.trim()
  return t !== undefined && t.length > 0 ? t : 'public'
}

/** Tên schema PG (namespace) đã được kiểm tra an toàn tham vào động. */
export function validatedPgSchemaName(): string {
  const s = pgSchemaFromStore()
  if (!s || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) {
    throw new Error('PostgreSQL schema (namespace): chỉ chữ, số, gạch dưới; ký tự đầu phải là chữ hoặc _.')
  }
  return s
}

function pgStartupSearchPathOption(): string {
  const schema = validatedPgSchemaName()
  return `-c search_path=${schema},public`
}

function quotePgIdentValidated(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function getConfig(): {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl: boolean | { rejectUnauthorized: boolean }
} {
  const store = configurationStore.store
  return {
    host: store.dbHost?.trim() || 'localhost',
    port: Number(store.dbPort) || 5432,
    user: store.dbUser?.trim() || 'postgres',
    password: store.dbPassword ?? '',
    database: store.dbName?.trim() || 'postgres',
    ssl: sslConfigForPg(),
  }
}

export function hasDbConfig(): boolean {
  const store = configurationStore.store
  return !!(store.dbHost?.trim() || store.dbName?.trim())
}

/**
 * Chuyển placeholder positional `?` → `$1`, `$2`, … cho driver `pg` (node-postgres).
 */
export function sqlPlaceholdersToPg(sql: string, params: unknown[] | undefined): { text: string; values: unknown[] } {
  const values = params ?? []
  if (sql.includes('?')) {
    let n = 0
    const text = sql.replace(/\?/g, () => `$${++n}`)
    return { text, values }
  }
  return { text: sql, values }
}

/** `omitSearchPath`: kết nối máy chủ/catalog (vd. tạo database) — không set search_path của schema ứng dụng */
function newAdhocClient(overrides: { database?: string; omitSearchPath?: boolean } = {}): Client {
  const config = getConfig()
  const ssl = config.ssl
  const startupSearchPath = overrides.omitSearchPath === true ? undefined : pgStartupSearchPathOption()
  return new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: overrides.database ?? config.database,
    ssl: ssl === false ? undefined : ssl,
    ...(startupSearchPath !== undefined ? { options: startupSearchPath } : {}),
    connectionTimeoutMillis: 15_000,
  })
}

export function getPool(): Pool {
  if (!pool) {
    const config = getConfig()
    const ssl = config.ssl
    pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: ssl === false ? undefined : ssl,
      options: pgStartupSearchPathOption(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    })
    pool.on('error', () => {})
  }
  return pool
}

export function resetPool(): void {
  if (pool) {
    pool.end().catch(() => {})
    pool = null
  }
  poolResetPromise = null
}

export async function resetPoolAndWait(): Promise<void> {
  if (poolResetPromise) return poolResetPromise
  if (!pool) return
  const p = pool
  pool = null
  poolResetPromise = p
    .end()
    .catch(() => {})
    .finally(() => {
      poolResetPromise = null
    })
  return poolResetPromise
}

async function execWithRetries<T>(runner: () => Promise<T>): Promise<T> {
  try {
    return await runner()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/Pool is closed|Connection terminated unexpectedly/i.test(msg)) {
      await resetPoolAndWait()
      return runner()
    }
    throw err
  }
}

/** `T` là kiểu một dòng; hàm trả về mảng các dòng. */
export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]> {
  return execWithRetries(async () => {
    const p = getPool()
    const { text, values } = sqlPlaceholdersToPg(sql, params)
    const res = await p.query<T>(text, values as [])
    return res.rows
  })
}

/** INSERT/UPDATE/DELETE: trả về số dòng như `affectedRows` MySQL (Postgres `rowCount`). */
export async function exec(sql: string, params?: unknown[]): Promise<{ affectedRows: number }> {
  return execWithRetries(async () => {
    const p = getPool()
    const { text, values } = sqlPlaceholdersToPg(sql, params)
    const res = await p.query(text, values as [])
    return { affectedRows: res.rowCount ?? 0 }
  })
}

/**
 * Trả về index ngay sau chuỗi dollar-quote nếu tại `start` có `$$ … $$` hoặc `$tag$ … $tag$`.
 * `$1` không phải dollar-quote và trả null.
 */
function tryConsumeDollarQuotedString(blob: string, start: number): number | null {
  if (blob[start] !== '$' || start + 1 >= blob.length) return null
  let delimEndIdx: number
  const c1 = blob[start + 1]
  if (c1 === '$') {
    delimEndIdx = start + 1
  } else if (/[A-Za-z_]/.test(c1)) {
    let j = start + 1
    while (j < blob.length && /[A-Za-z0-9_]/.test(blob[j])) j++
    if (j >= blob.length || blob[j] !== '$') return null
    delimEndIdx = j
  } else {
    return null
  }
  const delim = blob.slice(start, delimEndIdx + 1)
  const closeIdx = blob.indexOf(delim, delimEndIdx + 1)
  if (closeIdx === -1) return null
  return closeIdx + delim.length
}

/** Tách DDL (comment `--`, `/* … *\/`, `'…'`, `"…"`, và dollar-quote `$$…$$`). */
export function splitPostgresStatements(sqlBlob: string): string[] {
  const statements: string[] = []
  let cur = ''
  let inSq = false
  let inDq = false
  let inLineComment = false
  let inBlock = false

  for (let i = 0; i < sqlBlob.length; i++) {
    const ch = sqlBlob[i]
    const next = sqlBlob[i + 1]

    if (inLineComment) {
      cur += ch
      if (ch === '\n') inLineComment = false
      continue
    }

    if (inBlock) {
      cur += ch
      if (ch === '*' && next === '/') {
        cur += '/'
        i++
        inBlock = false
      }
      continue
    }

    if (!inSq && !inDq && ch === '-' && next === '-') {
      inLineComment = true
      cur += '-'
      continue
    }

    if (!inSq && !inDq && ch === '/' && next === '*') {
      inBlock = true
      cur += '/*'
      i++
      continue
    }

    // Không chia tại ';' trong thân FUNCTION/DO (plpgsql trong $$ … $$).
    if (!inSq && !inDq && ch === '$') {
      const afterQuote = tryConsumeDollarQuotedString(sqlBlob, i)
      if (afterQuote !== null) {
        cur += sqlBlob.slice(i, afterQuote)
        i = afterQuote - 1
        continue
      }
    }

    if (!inDq && ch === "'") {
      if (inSq && next === "'") {
        cur += "''"
        i++
        continue
      }
      inSq = !inSq
      cur += ch
      continue
    }

    if (!inSq && ch === '"') {
      inDq = !inDq
      cur += ch
      continue
    }

    if (ch === ';' && !inSq && !inDq) {
      const stmt = cur.trim()
      if (stmt.length > 0) statements.push(stmt)
      cur = ''
      continue
    }

    cur += ch
  }
  const last = cur.trim()
  if (last.length > 0) statements.push(last)
  return statements
}

/** Chỉ test kết nối Postgres tới database đã cấu hình. */
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!hasDbConfig()) {
    return { ok: false, error: 'Task database not configured' }
  }
  const config = getConfig()
  let client: Client
  try {
    client = newAdhocClient({ database: config.database })
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  try {
    await client.connect()
    await client.query('SELECT 1')
    return { ok: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  } finally {
    await client.end().catch(() => {})
  }
}

function validateDatabaseName(name: string): void {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error('Invalid database name. Only alphanumeric and underscore allowed.')
  }
}

/**
 * Trên Supabase không tạo database từ app. Local/self-host: CREATE DATABASE nếu chưa có.
 */
export async function ensureDatabase(): Promise<void> {
  if (!hasDbConfig()) {
    throw new Error('Task database not configured')
  }
  const config = getConfig()
  resetPool()
  if (isHostedSupabaseHost(config.host)) {
    return
  }
  validateDatabaseName(config.database)
  const admin = newAdhocClient({ database: 'postgres', omitSearchPath: true })
  try {
    await admin.connect()
    const exists = await admin.query<{ exists: boolean }>('SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists', [config.database])
    if (!exists.rows[0]?.exists) {
      await admin.query(`CREATE DATABASE ${config.database} ENCODING 'UTF8'`)
    }
  } finally {
    await admin.end().catch(() => {})
  }
}

export async function checkTaskSchemaAppliedOverConnection(): Promise<
  { ok: true; applied: boolean } | { ok: false; code: 'APP_DB_NOT_CONFIGURED' | 'APP_DB_CHECK_FAILED'; error?: string }
> {
  if (!hasDbConfig()) {
    return { ok: false, code: 'APP_DB_NOT_CONFIGURED' }
  }
  const config = getConfig()
  let schemaSql: string
  try {
    validateDatabaseName(config.database)
    schemaSql = validatedPgSchemaName()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, code: 'APP_DB_CHECK_FAILED', error: msg }
  }
  const client = newAdhocClient({ database: config.database })
  try {
    await client.connect()
    const r = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`, [schemaSql, 'task_statuses'])
    return { ok: true, applied: r.rows.length > 0 }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, code: 'APP_DB_CHECK_FAILED', error: msg }
  } finally {
    await client.end().catch(() => {})
  }
}

export async function isTaskSchemaApplied(): Promise<boolean> {
  const schema = validatedPgSchemaName()
  const rows = await query<{ one: number }>(`SELECT 1 AS one FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`, [schema, 'task_statuses'])
  return rows.length > 0
}

export async function checkSchemaExists(): Promise<void> {
  if (await isTaskSchemaApplied()) {
    throw new SchemaAlreadyExistsError()
  }
}

export async function dropAllTablesInTaskDatabase(): Promise<void> {
  validateDatabaseName(getConfig().database)
  await execWithRetries(async () => {
    const p = getPool()
    const client: PoolClient = await p.connect()
    try {
      const schemaSql = validatedPgSchemaName()
      const qSch = quotePgIdentValidated(schemaSql)
      const { rows } = await client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = $1`, [schemaSql])
      for (const { tablename } of rows) {
        if (!/^[a-zA-Z0-9_]+$/.test(tablename)) continue
        const qTbl = quotePgIdentValidated(tablename)
        await client.query(`DROP TABLE IF EXISTS ${qSch}.${qTbl} CASCADE`)
      }
    } finally {
      client.release()
    }
  })
}

export async function executeSchemaSql(sql: string): Promise<void> {
  if (!hasDbConfig()) {
    throw new Error('Task database not configured')
  }
  validateDatabaseName(getConfig().database)
  validatedPgSchemaName()
  const stmts = splitPostgresStatements(sql)
  await execWithRetries(async () => {
    const p = getPool()
    const client = await p.connect()
    try {
      await client.query('BEGIN')
      try {
        for (const stmt of stmts) {
          if (stmt.length === 0) continue
          await client.query(stmt)
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
      }
    } finally {
      client.release()
    }
  })
}

export type TransactionQuery = (sql: string, params?: unknown[]) => Promise<unknown>

export type TransactionExec = (sql: string, params?: unknown[]) => Promise<{ affectedRows: number }>

export async function withTransaction<T>(fn: (txQuery: TransactionQuery, txExec: TransactionExec) => Promise<T>): Promise<T> {
  const p = getPool()
  const client = await p.connect()
  const txQuery: TransactionQuery = async (sql: string, params?: unknown[]) => {
    const { text, values } = sqlPlaceholdersToPg(sql, params)
    const res = await client.query(text, values as [])
    return res.rows
  }
  const txExec: TransactionExec = async (sql: string, params?: unknown[]) => {
    const { text, values } = sqlPlaceholdersToPg(sql, params)
    const res = await client.query(text, values as [])
    return { affectedRows: res.rowCount ?? 0 }
  }
  try {
    await client.query('BEGIN')
    const result = await fn(txQuery, txExec)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
