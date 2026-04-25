import mysql, { type RowDataPacket } from 'mysql2/promise'
import configurationStore from '../store/ConfigurationStore'

let pool: mysql.Pool | null = null
let poolResetPromise: Promise<void> | null = null

export const SCHEMA_ALREADY_EXISTS_CODE = 'SCHEMA_ALREADY_EXISTS'

export class SchemaAlreadyExistsError extends Error {
  code = SCHEMA_ALREADY_EXISTS_CODE
  constructor(message = 'Schema already applied. Init is not needed.') {
    super(message)
    this.name = 'SchemaAlreadyExistsError'
  }
}

function getConfig() {
  const store = configurationStore.store
  return {
    host: store.dbHost?.trim() || 'localhost',
    port: Number(store.dbPort) || 3306,
    user: store.dbUser?.trim() || 'root',
    password: store.dbPassword ?? '',
    database: store.dbName?.trim() || 'honey_badger',
  }
}

export function hasDbConfig(): boolean {
  const store = configurationStore.store
  return !!(store.dbHost?.trim() || store.dbName?.trim())
}

export function getPool(): mysql.Pool {
  if (!pool) {
    const config = getConfig()
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: true,
    })
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

/** Reset pool và đợi hoàn tất; dùng khi retry sau "Pool is closed" để tránh race với các query song song */
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

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T> {
  const run = async (): Promise<T> => {
    const p = getPool()
    const [rows] = await p.execute(sql, (params ?? []) as (string | number | boolean | Date | Buffer | null)[])
    return rows as T
  }
  try {
    return await run()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Pool is closed')) {
      await resetPoolAndWait()
      return run()
    }
    throw err
  }
}

/** Chỉ test kết nối tới MySQL server (host, port, user, password). Không kiểm tra schema/database. */
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!hasDbConfig()) {
    return { ok: false, error: 'Task database not configured' }
  }
  const config = getConfig()
  try {
    const conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
    })
    try {
      await conn.execute('SELECT 1')
      return { ok: true }
    } finally {
      await conn.end()
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

/** Chỉ cho phép tên DB: chữ, số, gạch dưới. Tránh SQL injection. */
function validateDatabaseName(name: string): void {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error('Invalid database name. Only alphanumeric and underscore allowed.')
  }
}

/** Tạo database nếu chưa tồn tại, dùng utf8mb4. Chạy trước initSchema. */
export async function ensureDatabase(): Promise<void> {
  if (!hasDbConfig()) {
    throw new Error('Task database not configured')
  }
  resetPool()
  const config = getConfig()
  validateDatabaseName(config.database)
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
  })
  try {
    const escapedDb = conn.escapeId(config.database)
    await conn.query(`CREATE DATABASE IF NOT EXISTS ${escapedDb} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  } finally {
    await conn.end()
  }
}

/**
 * Kiểm tra qua kết nối độc lập (không dùng pool) — phù hợp gọi trước khi có DB/schema,
 * không tạo database, không reset pool.
 */
export async function checkTaskSchemaAppliedOverConnection(): Promise<
  | { ok: true; applied: boolean }
  | { ok: false; code: 'TASK_DB_NOT_CONFIGURED' | 'TASK_DB_CHECK_FAILED'; error?: string }
> {
  if (!hasDbConfig()) {
    return { ok: false, code: 'TASK_DB_NOT_CONFIGURED' }
  }
  const config = getConfig()
  try {
    validateDatabaseName(config.database)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, code: 'TASK_DB_CHECK_FAILED', error: msg }
  }
  try {
    const conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
    })
    try {
      const [rows] = await conn.execute(
        'SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1',
        [config.database, 'task_statuses']
      )
      return { ok: true, applied: Array.isArray(rows) && rows.length > 0 }
    } finally {
      await conn.end()
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, code: 'TASK_DB_CHECK_FAILED', error: msg }
  }
}

/** true khi bảng task_statuses đã tồn tại (coi là schema task đã áp dụng). */
export async function isTaskSchemaApplied(): Promise<boolean> {
  const config = getConfig()
  const p = getPool()
  const [rows] = await p.execute('SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1', [config.database, 'task_statuses'])
  return Array.isArray(rows) && rows.length > 0
}

/** Kiểm tra schema đã tồn tại. Nếu có thì throw SchemaAlreadyExistsError. */
export async function checkSchemaExists(): Promise<void> {
  if (await isTaskSchemaApplied()) {
    throw new SchemaAlreadyExistsError()
  }
}

/**
 * Xóa mọi bảng (BASE TABLE) trong database cấu hình. Chỉ dùng khi reset schema;
 * database chuyên dụng cho task — không gọi trên DB dùng chung có bảng khác.
 */
export async function dropAllTablesInTaskDatabase(): Promise<void> {
  const config = getConfig()
  validateDatabaseName(config.database)
  const p = getPool()
  const conn = await p.getConnection()
  try {
    const [tableRows] = await conn.execute<RowDataPacket[]>(
      'SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ?',
      [config.database, 'BASE TABLE']
    )
    if (!Array.isArray(tableRows) || tableRows.length === 0) return
    await conn.query('SET FOREIGN_KEY_CHECKS=0')
    for (const row of tableRows) {
      const name = row.t as string
      if (!/^[a-zA-Z0-9_]+$/.test(name)) continue
      await conn.query(`DROP TABLE IF EXISTS ${conn.escapeId(name)}`)
    }
    await conn.query('SET FOREIGN_KEY_CHECKS=1')
  } catch (err) {
    await conn.query('SET FOREIGN_KEY_CHECKS=1').catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

/**
 * Chạy schema SQL theo chuẩn MySQL:
 * - SET FOREIGN_KEY_CHECKS=0 chạy riêng trước (đảm bảo session áp dụng)
 * - Schema chạy trong 1 batch
 * - SET FOREIGN_KEY_CHECKS=1 chạy riêng sau
 */
export async function executeSchemaSql(sql: string): Promise<void> {
  const p = getPool()
  const conn = await p.getConnection()
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0')
    await conn.query(sql)
    await conn.query('SET FOREIGN_KEY_CHECKS=1')
  } catch (err) {
    await conn.query('SET FOREIGN_KEY_CHECKS=1').catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

export type TransactionQuery = (sql: string, params?: unknown[]) => Promise<unknown>

export async function withTransaction<T>(fn: (txQuery: TransactionQuery) => Promise<T>): Promise<T> {
  const p = getPool()
  const conn = await p.getConnection()
  const txQuery: TransactionQuery = async (sql: string, params?: unknown[]) => {
    const [rows] = await conn.execute(sql, (params ?? []) as (string | number | boolean | Date | Buffer | null)[])
    return rows
  }
  try {
    await conn.query('START TRANSACTION')
    const result = await fn(txQuery)
    await conn.query('COMMIT')
    return result
  } catch (err) {
    await conn.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}
