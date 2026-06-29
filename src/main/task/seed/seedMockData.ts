/**
 * Seed mock data for testing.
 * Plan: 3 projects (ECOM, CRM, Tiny), nhiều persona dev/PL (18 case QA). 1 năm ngày làm việc T2–T6.
 * Run: pnpm run seed:mock (script package.json set SEED_RANDOM=12345 → data cố định mỗi lần)
 * Requires: schema applied, achievements table (seeded automatically when using env vars).
 * With env (standalone): APP_DB_HOST APP_DB_NAME APP_DB_USER APP_DB_PASSWORD [APP_DB_PORT] [APP_DB_TLS=auto|required|disabled] [APP_DB_SSL=true legacy] [APP_DB_PG_SCHEMA=tên schema PG, mặc định public].
 * Tương thích cũ: TASK_DB_* cũng đọc được nếu chưa set APP_DB_*.
 * Ngẫu nhiên mỗi lần: gọi tsx trực tiếp và không set SEED_RANDOM (hoặc unset biến đó).
 * RNG: _uuidRng (UUID v7 khi seed) + _globalRng (EVM, notif, pick sau loop) + userDayRng(user, dayIdx) (task/commit/snapshot theo ngày)
 * From the app: Settings → Integrations → Seed mock data (đẩy cấu hình sang main rồi IPC); cần đăng nhập admin.
 */

import * as bcrypt from 'bcryptjs'
import { addDays, addHours, differenceInCalendarDays, format, getDay, subMonths, subYears } from 'date-fns'
import { Pool } from 'pg'
import { calculateRank } from 'shared/achievementRanks'
import { EVM_DEFAULT_PHASES } from 'shared/evmDefaults'
import { v7 as uuidV7 } from 'uuid'

import { ACHIEVEMENT_DEFINITIONS } from '../achievement/achievementSeed'
import { sqlPlaceholdersToPg } from '../schema/db'

function seedEnv(primary: string, fallback?: string): string {
  const a = process.env[primary]
  if (a != null && a !== '') return a
  if (fallback) {
    const b = process.env[fallback]
    if (b != null && b !== '') return b
  }
  return ''
}

export type SeedMockDbConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
  /** auto | required | disabled — khớp TaskDbTlsMode từ Settings */
  tls: string
  pgSchema: string
}

let _electronSeedOverride: SeedMockDbConfig | null = null

function sslForHostAndTls(tlsRaw: string, host: string): boolean | { rejectUnauthorized: boolean } {
  const tls = (tlsRaw || 'auto').toLowerCase()
  if (tls === 'disabled' || tls === 'off') return false
  if (tls === 'required' || tls === 'on') return { rejectUnauthorized: false }
  const h = host || ''
  if (/\bsupabase\.co\b|\bpooler\.supabase\.com\b/i.test(h)) {
    return { rejectUnauthorized: false }
  }
  if (process.env.APP_DB_SSL === 'true' || process.env.TASK_DB_SSL === 'true') {
    return { rejectUnauthorized: false }
  }
  return false
}

function getSslForSeed(): boolean | { rejectUnauthorized: boolean } {
  if (_electronSeedOverride) {
    return sslForHostAndTls(_electronSeedOverride.tls, _electronSeedOverride.host)
  }
  const tls = seedEnv('APP_DB_TLS', 'TASK_DB_TLS').toLowerCase()
  if (tls === 'disabled' || tls === 'off') return false
  if (tls === 'required' || tls === 'on') return { rejectUnauthorized: false }
  const host = seedEnv('APP_DB_HOST', 'TASK_DB_HOST')
  if (/\bsupabase\.co\b|\bpooler\.supabase\.com\b/i.test(host)) {
    return { rejectUnauthorized: false }
  }
  if (process.env.APP_DB_SSL === 'true' || process.env.TASK_DB_SSL === 'true') {
    return { rejectUnauthorized: false }
  }
  return false
}

// ========== Config: use env or app config ==========

function getSeedPgSchema(): string {
  if (_electronSeedOverride) {
    const t = (_electronSeedOverride.pgSchema ?? 'public').trim()
    return t !== '' ? t : 'public'
  }
  const t = seedEnv('APP_DB_PG_SCHEMA', 'TASK_DB_PG_SCHEMA').trim()
  return t !== '' ? t : 'public'
}

const USE_ENV = !!(seedEnv('APP_DB_HOST', 'TASK_DB_HOST') && seedEnv('APP_DB_NAME', 'TASK_DB_NAME'))

function seedDbPasswordFallback(): string {
  if (process.env.APP_DB_PASSWORD !== undefined) return process.env.APP_DB_PASSWORD
  if (process.env.TASK_DB_PASSWORD !== undefined) return process.env.TASK_DB_PASSWORD
  return '123456'
}

function getDbConfig(): { host: string; port: number; user: string; password: string; database: string; ssl: boolean | { rejectUnauthorized: boolean } } {
  if (_electronSeedOverride) {
    const c = _electronSeedOverride
    return {
      host: (c.host || '').trim() || 'localhost',
      port: Number.isFinite(c.port) && c.port > 0 ? c.port : 5432,
      user: (c.user || '').trim() || 'postgres',
      password: c.password ?? '',
      database: (c.database || '').trim() || 'postgres',
      ssl: sslForHostAndTls(c.tls, c.host),
    }
  }
  const ssl = getSslForSeed()
  return {
    host: seedEnv('APP_DB_HOST', 'TASK_DB_HOST') || 'localhost',
    port: Number(seedEnv('APP_DB_PORT', 'TASK_DB_PORT')) || 5432,
    user: seedEnv('APP_DB_USER', 'TASK_DB_USER') || 'postgres',
    password: seedDbPasswordFallback(),
    database: seedEnv('APP_DB_NAME', 'TASK_DB_NAME') || 'postgres',
    ssl,
  }
}

let pool: Pool | null = null

async function getPool(): Promise<Pool> {
  if (!pool) {
    const config = getDbConfig()
    const pgSchema = getSeedPgSchema()
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pgSchema)) {
      throw new Error('APP_DB_PG_SCHEMA (hoặc TASK_DB_PG_SCHEMA) không hợp lệ: chỉ [a-zA-Z0-9_], đầu phải là chữ hoặc _.')
    }
    pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: config.ssl === false ? undefined : config.ssl,
      max: 10,
      options: `-c search_path=${pgSchema},public`,
    })
  }
  return pool
}

async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T> {
  const p = await getPool()
  const { text, values } = sqlPlaceholdersToPg(sql, params)
  const res = await p.query(text, values as [])
  return res.rows as T
}

/** Gom nhiều row INSERT 1 lần — tham số Postgres */
const INSERT_BATCH_SIZE = 80
function createBatchInserter<T extends unknown[]>(
  table: string,
  columns: string[],
  rowPlaceholder: string,
  exec: (sql: string, params: unknown[]) => Promise<unknown>,
  suffix = ''
) {
  const rows: T[] = []
  return {
    add(row: T) {
      rows.push(row)
    },
    async flush() {
      if (rows.length === 0) return
      const valuesSql = rows.map(() => rowPlaceholder).join(', ')
      await exec(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valuesSql}${suffix}`, rows.flat())
      rows.length = 0
    },
    async maybeFlush() {
      if (rows.length >= INSERT_BATCH_SIZE) await this.flush()
    },
  }
}

type TxQuery = (sql: string, params?: unknown[]) => Promise<unknown>

async function withTransaction<T>(fn: (tx: TxQuery) => Promise<T>): Promise<T> {
  const p = await getPool()
  const conn = await p.connect()
  const tx: TxQuery = async (sql: string, params?: unknown[]) => {
    const { text, values } = sqlPlaceholdersToPg(sql, params)
    const res = await conn.query(text, values as [])
    return res.rows
  }
  try {
    await conn.query('BEGIN')
    const result = await fn(tx)
    await conn.query('COMMIT')
    return result
  } catch (err) {
    await conn.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

// ========== Helpers ==========

// Get working days Mon-Fri between start and end, inclusive.
function getWorkingDays(start: Date, end: Date): Date[] {
  const days: Date[] = []
  let d = new Date(start)
  d.setHours(0, 0, 0, 0)
  const endCopy = new Date(end)
  endCopy.setHours(23, 59, 59, 999)
  while (d <= endCopy) {
    const dow = getDay(d)
    if (dow >= 1 && dow <= 5) days.push(new Date(d))
    d = addDays(d, 1)
  }
  return days
}

function toDateStr(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function toDateTimeStr(d: Date): string {
  return format(d, 'yyyy-MM-dd HH:mm:ss')
}

/** Luồng RNG “global” cho seed (EVM, notif, pick sau vòng lặp…). Gán trong main khi có SEED_RANDOM. */
let _globalRng: () => number = () => Math.random()

function seedGlobalRand(): number {
  return _globalRng()
}

function pick<T>(arr: T[]): T {
  if (arr.length === 0) throw new Error('seedMockData: pick() mảng rỗng')
  return arr[Math.floor(seedGlobalRand() * arr.length)]
}

function pickRng<T>(rng: () => number, arr: T[]): T {
  if (arr.length === 0) throw new Error('seedMockData: pickRng() mảng rỗng')
  return arr[Math.floor(rng() * arr.length)]
}

/** Plan: weighted random - [['bug', 60], ['feature', 40]] => bug 60%, feature 40% */
function pickWeighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0)
  if (total <= 0 || items.length === 0) throw new Error('seedMockData: pickWeighted() total <= 0 hoặc rỗng')
  let r = seedGlobalRand() * total
  for (const [item, w] of items) {
    r -= w
    if (r <= 0) return item
  }
  return items[items.length - 1][0]
}

function pickWeightedRng<T>(rng: () => number, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0)
  if (total <= 0 || items.length === 0) throw new Error('seedMockData: pickWeightedRng() total <= 0 hoặc rỗng')
  let r = rng() * total
  for (const [item, w] of items) {
    r -= w
    if (r <= 0) return item
  }
  return items[items.length - 1][0]
}

function randBetween(min: number, max: number): number {
  return randBetweenRng(seedGlobalRand, min, max)
}

/** Số nguyên [min,max] từ RNG tùy chỉnh (đồng bộ với userDayRng / reproducible) */
function randBetweenRng(rng: () => number, min: number, max: number): number {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return Math.floor(rng() * (hi - lo + 1)) + lo
}

/** Mulberry32 seeded PRNG - mỗi user có chuỗi random riêng, reproducible */
function createSeededRng(seed: number) {
  return function next(): number {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** Hash string to số để seed RNG */
function hashToSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h >>> 0
}

/** Một stream Mulberry32 / key — gọi nhiều lần mới ra chuỗi khác nhau (không tạo RNG mới mỗi lần). */
const _userDayRngByKey = new Map<string, () => number>()

/** `() => number` có state: mỗi lần gọi ra giá trị tiếp theo cho cùng user+dayIdx */
function userDayRng(userId: string, dayIdx: number): () => number {
  const key = `${userId}-${dayIdx}`
  let gen = _userDayRngByKey.get(key)
  if (!gen) {
    const step = createSeededRng(hashToSeed(key))
    gen = () => step()
    _userDayRngByKey.set(key, gen)
  }
  return gen
}

/** Chuỗi riêng cho UUID (tách khỏi global + userDayRng → ít phụ thuộc thứ tự gọi pick/randBetween) */
let _uuidRng: (() => number) | null = null

/** Mốc ms cố định + chỉ số tăng — UUID v7 reproducible khi SEED_RANDOM. */
const _v7SeedMsecBase = 1_704_067_200_000
let _v7SeedCallIndex = 0

/** Khi SEED_RANDOM set: UUID v7 deterministic. Khi không: UUID v7 thật. */
function randomUUID(): string {
  const uuidRng = _uuidRng
  if (uuidRng) {
    return uuidV7({
      msecs: _v7SeedMsecBase + _v7SeedCallIndex++,
      rng: () => {
        const a = new Uint8Array(16)
        for (let i = 0; i < 16; i++) a[i] = Math.floor(uuidRng() * 256)
        return a
      },
    })
  }
  return uuidV7()
}

// ========== Constants ==========

const DEFAULT_PASSWORD = 'System@123'
/** Mã phase khớp EVM_DEFAULT_PHASES / EVM_Tool mục 6 */
const PHASES = EVM_DEFAULT_PHASES.map(p => p.code)

/** Giờ ghi nhận EVM (evm_ac.phase): phân bổ để seed có đủ phase */
const EVM_AC_PHASE_WEIGHTS: [string, number][] = [
  ['cd_ut', 26],
  ['it', 20],
  ['uat', 16],
  ['dd', 14],
  ['bd', 12],
  ['sd', 12],
]

function pickEvmAcPhase(rnd: () => number): string {
  return pickWeightedRng(rnd, EVM_AC_PHASE_WEIGHTS)
}

/**
 * EVM UI + evmCalculations: percent_done là phần 0–1 (không phải 0–100). BAC ~ giờ (hourlyRate=1 trong app).
 */
const EVM_MASTER_STATUSES_JSON = JSON.stringify([
  { code: 'new', name: 'New' },
  { code: 'in_progress', name: 'In Progress' },
  { code: 'resolved', name: 'Resolved' },
  { code: 'feedback', name: 'Feedback' },
  { code: 'closed', name: 'Closed' },
  { code: 'rejected', name: 'Rejected' },
])

/** Bước 10% — khớp pgEVMStore / EVM_Tool.txt. */
const EVM_MASTER_PERCENT_DONE_OPTIONS_JSON = JSON.stringify([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])

const EVM_MASTER_PHASE_REPORT_NOTES_JSON = JSON.stringify({
  sd: 'System design: chốt kiến trúc & interface trước Basic Design.',
  bd: 'Basic Design: mockup / luồng chính; sign-off trước Detail.',
  dd: 'Detail Design: spec API/DB đồng bộ WBS; tránh scope creep.',
  cd_ut: 'Coding: defect density; ưu tiên P0 trước Integration Test.',
  it: 'Integration Test: regression + smoke staging.',
  uat: 'UAT: checklist nghiệm thu & go-live.',
})

const EVM_MASTER_ISSUE_IMPORT_MAP_JSON = JSON.stringify({
  subject: 'A',
  status: 'B',
  done_ratio: 'C',
  tracker_id: 'D',
})

function sampleAssigneeReportNotesJson(devs: DevUser[]): string {
  const o: Record<string, string> = {}
  if (devs[0]) o[devs[0].id] = 'Ưu tiên đóng bug & đồng bộ AC/WBS.'
  if (devs[1]) o[devs[1].id] = 'Review tiến độ dashboard EVM; hỗ trợ PL.'
  return JSON.stringify(o)
}

function roundAcPercentDone01(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 1e6) / 1e6
}

/** Tiến độ detail WBS: DECIMAL(5,2), chuẩn 0..1 trong app. */
function roundWbsDetailProgress01(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100
}

/** Plan: phân bổ type mẫu (không gồm milestone — milestone chỉ PL/Tiny PL seed qua weights mở rộng). */
const TASK_TYPE_WEIGHTS: [string, number][] = [
  ['bug', 50],
  ['feature', 30],
  ['support', 12],
  ['task', 8],
]

const TASK_TYPE_WEIGHTS_WITH_MILESTONE: [string, number][] = [...TASK_TYPE_WEIGHTS, ['milestone', 3]]

/** Ưu tiên milestone: medium/low (mốc ít khi critical). */
const MILESTONE_PRIORITY_WEIGHTS: [string, number][] = [
  ['medium', 48],
  ['low', 38],
  ['high', 12],
  ['critical', 2],
]

const MILESTONE_TITLE_FRAGMENTS = [
  'Go-live production',
  'UAT ký nghiệm thu',
  'Kết thúc Sprint hardening',
  'Freeze scope — bắt đầu regression',
  'Bàn giao môi trường staging cho QA',
  'Mốc API contract lock (breaking change)',
  'Release candidate 1 (tag RC1)',
  'Hết hạn trial licence bên thứ 3',
]

const TASK_DESC_MILESTONE_BLOCKS = [
  'Mốc dùng chung toàn project; không gán effort — chỉ theo dõi ngày trên Gantt.',
  'Khi trễ mốc: nhánh release và WBS cần sync lại với PL/PM.',
  'Stakeholder sign-off theo checklist sprint; không tính vào velocity dev.',
  'Liên kết với gate UAT / go-live trong kế hoạch triển khai.',
]

function seedTaskTitlePrefix(typ: string): string {
  switch (typ) {
    case 'bug':
      return 'Bug'
    case 'feature':
      return 'Feature'
    case 'support':
      return 'Support'
    case 'task':
      return 'Task'
    case 'milestone':
      return 'Milestone'
    default:
      return typ ? typ.charAt(0).toUpperCase() + typ.slice(1) : 'Task'
  }
}
/** Plan: medium 50%, high 30%, low 15%, critical 5% */
const TASK_PRIORITY_WEIGHTS: [string, number][] = [
  ['medium', 50],
  ['high', 30],
  ['low', 15],
  ['critical', 5],
]
const WORK_DESCRIPTIONS = [
  'Fix login validation bug, implement cart API',
  'Refactor payment module, add unit tests',
  'Code review PR #123, fix merge conflicts',
  'Implement search filter, update documentation',
  'Fix memory leak in cache, optimize queries',
]
/** Tiêu đề task mẫu gần workflow thực tế (Redmine/Jira-style) */
const TASK_TITLE_FRAGMENTS = [
  'Điều chỉnh rule validation theo comment QA',
  'Bổ sung API export báo cáo EVM theo tuần',
  'Lỗi timeout đồng bộ SVN trên máy build agent',
  'Tối ưu truy vấn dashboard tác vụ (N+1)',
  'Refactor module thông báo desktop theo IPC mới',
  'Mapping trạng thái ticket từ Redmine sang in_app',
  'Unit test cho hàm tính BAC/EV từ WBS',
  'Hotfix: crash khi mở dialog daily report không network',
  'Cập nhật i18n màn hình task management',
  'Ràng buộc phân quyền reviewer theo project',
]

const TASK_DESC_ENV = ['Staging', 'UAT', 'Môi trường dev nội bộ', 'Bản build nightly', 'Production (tác động hạn chế)']
const TASK_DESC_BUG_BLOCKS = [
  'Log client báo exception khi gọi API sau khi session hết hạn; user thấy màn hình trắng.',
  'Ở một số máy Windows 11, cửa sổ Electron không restore đúng kích thước sau khi maximize.',
  'Đồng bộ SVN: retry quá nhanh làm queue bị lock; cần backoff và giới hạn concurrent.',
  'Filter task theo assignee + project kết hợp trả về duplicate khi join với bảng favorite.',
  'Parser daily report: dòng chứa ký tự đặc biệt làm mất commit hash trong preview.',
]
const TASK_DESC_FEATURE_BLOCKS = [
  'Bổ sung tùy chọn export CSV/Excel cho bảng WBS; giữ nguyên thứ tự cột như trên UI.',
  'Cho phép PL gán reviewer mặc định theo project; lưu vào metadata project.',
  'Hiển thị tooltip tiến độ EVM trên dashboard; dữ liệu lấy từ snapshot đã cache.',
  'API IPC mới: subscribe thay đổi task để renderer cập nhật không cần poll toàn bộ list.',
  'Màn hình cài đặt: toggle bật/tắt nhắc deadline và chọn khung giờ quiet hours.',
]
const TASK_DESC_REPRO = [
  'Các bước: (1) Đăng nhập user A. (2) Mở project X → tab Task. (3) Sort theo deadline → lỗi hiển thị.',
  'Tái hiện không ổn định (~30%): xảy ra khi vừa import batch ticket từ Redmine.',
  'Chỉ thấy trên DB có >10k task; scroll nhanh khiến virtual list mất sync selection.',
]
const TASK_DESC_ACCEPT = [
  'Pass regression smoke; không regression hiệu năng truy vấn list task (< 500ms / trang).',
  'i18n: nhãn mới có bản EN + VI; không cứng chuỗi trong component.',
  'Viết tối thiểu 2 testcase unit cho nhánh logic chính; CI xanh.',
  'Tài liệu ngắn trong wiki: luồng người dùng + screenshot 1–2 màn hình.',
]
const TASK_DESC_STATUS_NOTES: Record<string, string[]> = {
  new: ['Mới tạo ticket, chờ refine scope với BA.', 'Chưa estimate story point; dự kiến groom tuần này.'],
  in_progress: ['Đang làm nhánh feature/task-*; PR draft sẽ mở sau khi có test cơ bản.'],
  in_review: ['Đã gửi PL review; chờ comment trước khi merge.', 'Build CI xanh; cần duyệt wording thông báo.'],
  fixed: ['Dev đã fix trên develop; chờ QA verify trên bản staging.', 'Đã cherry-pick sang nhánh hotfix.'],
  feedback: ['Khách/QA yêu cầu chỉnh lại hành vi nút Cancel; cập nhật mock trong Figma.', 'Cần làm rõ edge case timezone khi export báo cáo.'],
  cancelled: ['Hủy theo quyết định PO: ưu tiên sprint khác.', 'Trùng ticket #xxxx; đóng để tránh trùng công việc.'],
  done: ['Đã verify trên UAT và release note ghi nhận.', 'Merge develop; tag bản phát hành hôm nay.'],
}

function buildSeedTaskDescription(rnd: () => number, typ: string, status: string, ticketId: string): string {
  const env = pickRng(rnd, TASK_DESC_ENV)
  if (typ === 'milestone') {
    const partsMs: string[] = [`${ticketId} — Mốc dự án (${env}).`, pickRng(rnd, TASK_DESC_MILESTONE_BLOCKS)]
    const notesMs = TASK_DESC_STATUS_NOTES[status]
    if (notesMs && rnd() < 0.35) {
      partsMs.push(pickRng(rnd, notesMs))
    } else if (rnd() < 0.2) {
      partsMs.push(`Tham chiếu: ${pickRng(rnd, ['Kế hoạch release', 'Biên bản PI planning', 'Roadmap Q', 'WBS phase gate'])}.`)
    }
    return partsMs.join('\n\n')
  }
  const parts: string[] = [`Ticket ${ticketId} — Môi trường: ${env}.`]
  if (typ === 'bug') {
    parts.push(pickRng(rnd, TASK_DESC_BUG_BLOCKS))
    if (rnd() < 0.5) {
      parts.push(`Cách tái hiện / ngữ cảnh:\n${pickRng(rnd, TASK_DESC_REPRO)}`)
    }
    if (rnd() < 0.35) {
      parts.push(`Ảnh hưởng: ${rnd() < 0.5 ? 'blocking một số user nội bộ' : 'severity trung bình, có workaround tạm'}.`)
    }
  } else {
    parts.push(pickRng(rnd, TASK_DESC_FEATURE_BLOCKS))
    if (rnd() < 0.55) {
      parts.push(`Tiêu chí nghiệm thu:\n- ${pickRng(rnd, TASK_DESC_ACCEPT)}\n- ${pickRng(rnd, TASK_DESC_ACCEPT)}`)
    }
  }
  const notes = TASK_DESC_STATUS_NOTES[status]
  if (notes && rnd() < 0.65) {
    parts.push(pickRng(rnd, notes))
  } else if (rnd() < 0.2) {
    parts.push(`Tham chiếu: ${pickRng(rnd, ['Wiki nội bộ', 'Thread Slack', 'Tài liệu API Swagger', 'Figma — màn Task mgmt'])}.`)
  }
  return parts.join('\n\n')
}

/** Gói WBS seed: tra cứu theo assignee + ngày để đồng bộ evm_ac (1 dev không làm song song 2 dòng WBS). */
type EvmWbsSegment = {
  projectId: string
  assigneeId: string
  planStart: string
  planEnd: string
  phase: string
  category: string | null
  feature: string | null
  task: string
  actualStart: string | null
  actualEnd: string | null
  /** 0..1 — khớp cột evm_ac.percent_done */
  percentDone: number
}

type EvmWbsGeneratedRow = {
  phase: string
  category: string | null
  feature: string | null
  task: string
  plan_start_date: string
  plan_end_date: string
  actual_start_date: string | null
  actual_end_date: string | null
  assignee_user_id: string
  percent_done: number
  status: string
  bac: number
}

const EVM_WBS_CATEGORY_POOL = ['Delivery', 'Product', 'Platform', 'Quality', 'Compliance']
const EVM_WBS_FEATURE_POOL = ['EVM Dashboard', 'Task sync', 'Daily report', 'Notification', 'Master data', 'Import/Export']

const EVM_WBS_NOTE_SNIPPETS = [
  'Rủi ro: phụ thuộc API bên thứ 3.',
  'Cần sign-off PL trước merge nhánh release.',
  'Ưu tiên sau khi xong dependency AUTH-12.',
  'Buffer 0,5 ngày cho review khách hàng.',
  'Đồng bộ với nhóm QA theo checklist sprint.',
]

function deriveWbsActualDates(
  planStartStr: string,
  planEndStr: string,
  percentDone: number,
  status: string,
  rnd: () => number
): { actual_start_date: string | null; actual_end_date: string | null } {
  if (status === 'new') {
    return { actual_start_date: null, actual_end_date: null }
  }
  const actStart = planStartStr
  if (status === 'done' || status === 'fixed' || status === 'cancelled' || percentDone >= 0.995) {
    return { actual_start_date: actStart, actual_end_date: planEndStr }
  }
  if (status === 'in_review' && rnd() < 0.45) {
    return { actual_start_date: actStart, actual_end_date: planEndStr }
  }
  return { actual_start_date: actStart, actual_end_date: null }
}

const EVM_NON_CODE_PHASE_TASKS: Record<string, string[]> = {
  sd: ['Workshop thu thập yêu cầu & phạm vi release', 'Hoàn thiện checklist gate trước Basic Design', 'Stakeholder sign-off phạm vi tài liệu khởi đầu'],
  bd: ['Thiết kế luồng dữ liệu WBS → BAC/EV trong tool', 'Review mockup báo cáo EVM với PL / khách', 'Đặc tả API đồng bộ master dự án & assignee'],
  dd: ['Chi tiết hóa spec API & schema cho module EVM', 'Rà soát ước lượng BAC theo lưới ngày kế hoạch', 'Đồng bộ checklist coding standards với PL'],
  it: ['Kiểm thử hồi quy trên staging trước đóng sprint', 'Triển khai bản build UAT & smoke test chính', 'Rà soát log triển khai và checklist go-live'],
  uat: ['Kịch bản nghiệm thu UAT với đại diện khách hàng', 'Ghi nhận lỗi UAT & phân công fix trước bản gold', 'Đóng hạng mục UAT và ký biên bản nghiệm thu'],
}

function pickEvmWbsTaskTitleForPhase(phase: string, rnd: () => number): string {
  if (phase === 'cd_ut') return pickRng(rnd, WORK_DESCRIPTIONS)
  const arr = EVM_NON_CODE_PHASE_TASKS[phase]
  return arr && arr.length > 0 ? pickRng(rnd, arr) : pickRng(rnd, WORK_DESCRIPTIONS)
}

function deriveWbsProgressAndStatus(planEndDay: Date, anchorEnd: Date, rnd: () => number): { percent_done: number; status: string } {
  const pe = new Date(planEndDay)
  pe.setHours(0, 0, 0, 0)
  const ae = new Date(anchorEnd)
  ae.setHours(0, 0, 0, 0)
  if (pe < ae) {
    const roll = rnd()
    if (roll < 0.7) return { percent_done: 1, status: 'done' }
    if (roll < 0.85) return { percent_done: randBetweenRng(rnd, 92, 99) / 100, status: 'fixed' }
    return { percent_done: randBetweenRng(rnd, 85, 97) / 100, status: 'in_review' }
  }
  if (pe.getTime() === ae.getTime()) {
    return { percent_done: randBetweenRng(rnd, 50, 88) / 100, status: 'in_progress' }
  }
  const daysUntil = differenceInCalendarDays(pe, ae)
  if (daysUntil <= 10) {
    return { percent_done: randBetweenRng(rnd, 40, 78) / 100, status: 'in_progress' }
  }
  if (daysUntil <= 30) {
    return { percent_done: randBetweenRng(rnd, 15, 55) / 100, status: rnd() < 0.2 ? 'new' : 'in_progress' }
  }
  return { percent_done: randBetweenRng(rnd, 5, 35) / 100, status: rnd() < 0.35 ? 'new' : 'in_progress' }
}

function lookupEvmWbsSegment(segments: EvmWbsSegment[], assigneeId: string, dateStr: string): EvmWbsSegment | undefined {
  return segments.find(s => s.assigneeId === assigneeId && dateStr >= s.planStart && dateStr <= s.planEnd)
}

/**
 * Chuỗi gói WBS nối tiếp trên từng assignee (ngày làm việc, không chồng lấn).
 * BAC ≈ số ngày làm việc × ~4–7h × bacScale.
 */
function generateRealisticEvmWbsForProject(
  projectId: string,
  rangeStart: Date,
  rangeEnd: Date,
  memberDevs: DevUser[],
  bacScale: number,
  rnd: () => number,
  anchorForProgress: Date,
  outSegments: EvmWbsSegment[]
): EvmWbsGeneratedRow[] {
  const cal = getWorkingDays(rangeStart, rangeEnd)
  if (cal.length < 10) return []

  const minSeg = bacScale < 0.5 ? 3 : 5
  const maxSeg = bacScale < 0.5 ? 12 : 22
  const toPlan = memberDevs.filter(d => d.seedActivity !== 'none')
  const planners = toPlan.length > 0 ? toPlan : memberDevs

  const rows: EvmWbsGeneratedRow[] = []

  planners.forEach((dev, assigneeOrd) => {
    let segIx = 0
    let startIdx = Math.min(assigneeOrd * 5 + Math.floor(rnd() * 14), Math.max(0, cal.length - minSeg))
    while (startIdx <= cal.length - minSeg) {
      const maxLen = Math.min(maxSeg, cal.length - startIdx)
      const segLen = randBetweenRng(rnd, minSeg, maxLen)
      const endIdx = startIdx + segLen - 1
      const planStart = cal[startIdx]
      const planEnd = cal[endIdx]
      const phase = PHASES[(segIx + assigneeOrd) % PHASES.length] ?? 'Code'
      segIx++
      const task = pickEvmWbsTaskTitleForPhase(phase, rnd)
      const { percent_done, status } = deriveWbsProgressAndStatus(planEnd, anchorForProgress, rnd)
      const bac = Math.max(6, Math.round(segLen * (4.2 + rnd() * 3.4) * bacScale * 100) / 100)
      const ps = toDateStr(planStart)
      const pe = toDateStr(planEnd)
      const category = pickRng(rnd, EVM_WBS_CATEGORY_POOL)
      const feature = pickRng(rnd, EVM_WBS_FEATURE_POOL)
      const { actual_start_date, actual_end_date } = deriveWbsActualDates(ps, pe, percent_done, status, rnd)
      const pctRounded = Math.round(percent_done * 100) / 100

      rows.push({
        phase,
        category,
        feature,
        task,
        plan_start_date: ps,
        plan_end_date: pe,
        actual_start_date,
        actual_end_date,
        assignee_user_id: dev.id,
        percent_done: pctRounded,
        status,
        bac,
      })
      outSegments.push({
        projectId,
        assigneeId: dev.id,
        planStart: ps,
        planEnd: pe,
        phase,
        category,
        feature,
        task,
        actualStart: actual_start_date,
        actualEnd: actual_end_date,
        percentDone: pctRounded,
      })

      const gap = randBetweenRng(rnd, 1, 3)
      startIdx = endIdx + gap
    }
  })

  return rows
}

const REPORT_SHORT = ['Fixed bugs.', 'Code review.', 'Implement feature.', 'Refactor.', 'Update doc.']
const REPORT_LONG = [
  'Completed implementation of user authentication flow. Fixed validation for email format. Added unit tests. Code review for PR #45. Documented API changes.',
  'Refactored payment module to support multiple providers. Resolved merge conflicts in checkout branch. Performance optimization for cart loading.',
]

type DevProfile = 'star' | 'good' | 'average' | 'below' | 'bad' | 'terrible'
type CommitVariance = 'stable' | 'burst' | 'spiky' // stable: đều, burst: ngày ít ngày nhiều, spiky: dao động mạnh

interface DevUser {
  id: string
  user_code: string
  name: string
  email: string
  profile: DevProfile
  tenureMonths: number
  lateTaskPercent: number
  commitVariance: CommitVariance
  targetRank: 'newbie' | 'contributor' | 'developer' | 'regular' | 'pro' | 'expert' | 'master' | 'legend' | 'mythic'
  /** Legacy: map sang reportStreakTailDays trong reportStreakTailDaysOf */
  wantsReportStreak?: 5 | 6 | 7
  /** Xóa override dayType cho N ngày làm việc cuối (báo cáo liên tiếp) */
  reportStreakTailDays?: number
  /** Ghi đè user_stats.current_report_streak_days (không dùng tính từ reportedByUserDay) */
  forceReportStreakInStats?: number
  roleP1?: 'dev' | 'pl'
  roleP2?: 'dev' | 'pl' | 'none'
  seedActivity?: 'full' | 'none'
  activityMode?: 'full' | 'commits_only' | 'tasks_only'
  neverDailyReport?: boolean
  noReportLastWorkingDays?: number
  breakReportSecondLastWorkingDay?: boolean
  joinOnLastWorkingDay?: boolean
}

/** N ngày cuối: ép không daily report (trừ khi neverDailyReport đã xử lý trước) */
function reportStreakTailDaysOf(dev: DevUser): number | undefined {
  return dev.reportStreakTailDays ?? dev.wantsReportStreak
}

function effectiveJoinDate(dev: DevUser, endDate: Date, workingDays: Date[]): Date {
  if (dev.joinOnLastWorkingDay && workingDays.length > 0) {
    const d = workingDays[workingDays.length - 1]
    if (d) {
      const x = new Date(d)
      x.setHours(0, 0, 0, 0)
      return x
    }
  }
  return subMonths(endDate, dev.tenureMonths)
}

function joinDayIndex(dev: DevUser, endDate: Date, workingDays: Date[]): number {
  const jd = effectiveJoinDate(dev, endDate, workingDays)
  const jdStr = toDateStr(jd)
  const idx = workingDays.findIndex(d => toDateStr(d) >= jdStr)
  return Math.max(0, idx)
}

/** Một dòng pending: reportId, userId, projectIdsJson, reportDate, workDesc, commitsJson */
type PendingDailyReportRowTuple = readonly [string, string, string, string, string, string]

function queueSeedDailyReport(
  pendingRows: PendingDailyReportRowTuple[],
  pendingDrsf: { userId: string; reportDate: string; upsfId: string }[],
  reportId: string,
  userId: string,
  projectIdsJson: string,
  reportDate: string,
  workDesc: string,
  commitsJson: string,
  upsfId?: string | null
) {
  pendingRows.push([reportId, userId, projectIdsJson, reportDate, workDesc, commitsJson])
  if (upsfId) pendingDrsf.push({ userId, reportDate, upsfId })
}

/**
 * Khớp progressStore.getTasksOverdueForDate: task vẫn mở (≠ done), có plan_end & đã quá hạn so với snapshot.
 */
function seedOverdueOpenedForTask(status: string, planEnd: string | null | undefined, snapshotDateStr: string): number {
  if (status === 'done') return 0
  if (planEnd == null || planEnd === '') return 0
  return planEnd < snapshotDateStr ? 1 : 0
}

function defaultRoleP1(dev: DevUser, indexInP1: number): 'dev' | 'pl' {
  return dev.roleP1 ?? (indexInP1 === 0 ? 'pl' : 'dev')
}

/** Milestone: một ngày làm việc trong tương lai (so với ngày seed hiện tại), không trước join. */
function pickMilestonePlanStartStr(workingDays: Date[], dayIdx: number, joinDate: Date, rng: () => number): string {
  if (workingDays.length === 0) return toDateStr(joinDate)
  const jStr = toDateStr(joinDate)
  let lowIdx = workingDays.findIndex(d => toDateStr(d) >= jStr)
  if (lowIdx < 0) lowIdx = workingDays.length - 1
  const baseIdx = Math.max(dayIdx, lowIdx)
  const room = workingDays.length - 1 - baseIdx
  if (room <= 0) return toDateStr(workingDays[baseIdx])
  const jump = randBetweenRng(rng, Math.min(5, room), Math.min(120, room))
  return toDateStr(workingDays[baseIdx + jump])
}

function canSeedMilestone(project: 'p1' | 'p2' | 'p3', dev: DevUser, devIdx: number, tinyIdx: number): boolean {
  if (project === 'p1') return defaultRoleP1(dev, devIdx) === 'pl'
  if (project === 'p2') return (dev.roleP2 ?? 'dev') === 'pl'
  return tinyIdx === 0
}

/**
 * Người cập nhật cuối (updated_by): chủ yếu assignee; đôi khi PL/peer cùng project — đặc biệt in_review, feedback, cancelled.
 */
function pickSeedTaskUpdatedById(rnd: () => number, status: string, assigneeId: string, projectPeerIds: string[]): string {
  const peers = [...new Set(projectPeerIds.filter(Boolean))]
  const others = peers.filter(id => id !== assigneeId)
  if (others.length === 0) return assigneeId
  const r = rnd()
  if (status === 'in_review') {
    return r < 0.52 ? pickRng(rnd, others) : assigneeId
  }
  if (status === 'feedback') {
    return r < 0.48 ? pickRng(rnd, others) : assigneeId
  }
  if (status === 'cancelled') {
    return r < 0.38 ? pickRng(rnd, others) : assigneeId
  }
  if (status === 'new' && r < 0.22) {
    return pickRng(rnd, others)
  }
  return r < 0.14 ? pickRng(rnd, others) : assigneeId
}

function isStreakTailDay(dev: DevUser, dayIdx: number, workingDaysLen: number): boolean {
  const n = reportStreakTailDaysOf(dev)
  return n != null && n > 0 && dayIdx >= workingDaysLen - n
}

const PROFILE_CONFIG: Record<DevProfile, { tasksPerDay: [number, number]; commitsPerDay: [number, number]; donePercent: number; reportPercent: number }> = {
  star: { tasksPerDay: [6, 8], commitsPerDay: [15, 22], donePercent: 98, reportPercent: 100 },
  good: { tasksPerDay: [5, 7], commitsPerDay: [10, 16], donePercent: 92, reportPercent: 98 },
  average: { tasksPerDay: [4, 5], commitsPerDay: [7, 12], donePercent: 85, reportPercent: 95 },
  below: { tasksPerDay: [3, 4], commitsPerDay: [4, 9], donePercent: 72, reportPercent: 85 },
  bad: { tasksPerDay: [2, 3], commitsPerDay: [2, 7], donePercent: 58, reportPercent: 70 },
  terrible: { tasksPerDay: [0, 2], commitsPerDay: [0, 4], donePercent: 45, reportPercent: 45 },
}

/** Giới hạn mock: mỗi user tối đa N task tạo trong cùng một ngày lịch, gộp cả P1 + P2 + P3 — tránh rank × scale tạo hàng chục task/ngày và chồng plan. */
const SEED_MAX_TASKS_PER_USER_PER_DAY = 5

/** Anchor lịch cho task thứ t trong batch cùng ngày — dời plan theo t ngày lịch để giảm trùng [plan_start, plan_end] cùng một ngày. */
function seedPlanAnchorDay(anchorDay: Date, taskIndex: number): Date {
  return addDays(anchorDay, taskIndex)
}

/** Chỉ số ngày làm việc cho milestone khi cùng batch (tránh nhiều milestone trùng anchor). */
function seedMilestoneDayIdx(dayIdx: number, taskIndex: number, wdLen: number): number {
  return Math.min(dayIdx + taskIndex, Math.max(0, wdLen - 1))
}

/** Xác suất commit đã chạy Coding rule check (dev hay quên → profile thấp hơn) */
const PROFILE_RULE_CHECK_P: Record<DevProfile, number> = {
  star: 0.93,
  good: 0.86,
  average: 0.78,
  below: 0.65,
  bad: 0.52,
  terrible: 0.38,
}
/** Xác suất commit đã chạy SpotBugs check */
const PROFILE_SPOTBUGS_P: Record<DevProfile, number> = {
  star: 0.91,
  good: 0.83,
  average: 0.72,
  below: 0.58,
  bad: 0.45,
  terrible: 0.32,
}

/**
 * Radar (DeveloperRadar + progressStore coding_days): ngày có snapshot nhưng commits_count = 0
 * → không tính coding_days — Velocity / Reliability / Collab (commitComp) giảm tự nhiên.
 */
const PROFILE_NO_COMMIT_DAY_P: Record<DevProfile, number> = {
  star: 0.05,
  good: 0.08,
  average: 0.11,
  below: 0.14,
  bad: 0.18,
  terrible: 0.24,
}

/** Có commit nhưng vẫn không gửi daily report (không streak) → reportComp / Reliability đa dạng */
const PROFILE_SKIP_REPORT_DESPITE_COMMITS_P: Record<DevProfile, number> = {
  star: 0.03,
  good: 0.05,
  average: 0.08,
  below: 0.11,
  bad: 0.15,
  terrible: 0.2,
}

const _radarNoCommitBoostByUser = new Map<string, number>()

/** Điều chỉnh nhỏ ± theo userId (reproducible) cho xác suất “ngày không commit” */
function radarNoCommitBoost(userId: string): number {
  let b = _radarNoCommitBoostByUser.get(userId)
  if (b === undefined) {
    b = (createSeededRng(hashToSeed(`radar-nocommit-${userId}`))() - 0.5) * 0.12
    _radarNoCommitBoostByUser.set(userId, b)
  }
  return b
}

/** Mỗi dev một “khung giờ quen” cố định từ userId (reproducible), tránh dồn 16–17h cho mọi người */
const _commitHourPrefsByUser = new Map<string, { peak: number; nightP: number; spread: number }>()

function commitHourPrefsForDev(userId: string): { peak: number; nightP: number; spread: number } {
  let p = _commitHourPrefsByUser.get(userId)
  if (!p) {
    const r0 = createSeededRng(hashToSeed(`commit-hour-${userId}`))
    p = {
      peak: 9 + Math.floor(r0() * 8),
      nightP: 0.06 + r0() * 0.14,
      spread: 2 + Math.floor(r0() * 5),
    }
    _commitHourPrefsByUser.set(userId, p)
  }
  return p
}

/**
 * Giờ commit: peak ± spread theo dev; night owl 18–21 theo nightP; thỉnh thoảng giờ muộn rải 15–19 (ít, không dồn 16–17).
 */
function pickCommitHour(commitIndex: number, prefs: { peak: number; nightP: number; spread: number }, rnd: () => number): number {
  if (rnd() < prefs.nightP) return 18 + (commitIndex % 4)
  if (rnd() < 0.03) return randBetweenRng(rnd, 15, 19)
  const delta = randBetweenRng(rnd, -prefs.spread, prefs.spread + 1)
  const h = prefs.peak + delta
  return Math.max(8, Math.min(19, h))
}

type SimTaskStatus = 'new' | 'in_progress' | 'in_review' | 'fixed' | 'feedback' | 'cancelled' | 'done'

/** Trọng số trạng thái: luôn có pipeline (review / fixed / feedback / cancel); done vs in_progress phụ thuộc profile. */
function simTaskStatusWeights(donePercent: number, inProgressBias: number | null | undefined): [string, number][] {
  const pipe: [string, number][] = [
    ['new', 6],
    ['in_review', 5],
    ['fixed', 5],
    ['feedback', 4],
    ['cancelled', 2],
  ]
  const pipeSum = pipe.reduce((s, [, w]) => s + w, 0)
  const slack = 100 - pipeSum
  if (inProgressBias != null && inProgressBias > 0) {
    const maxBias = Math.max(1, slack - 6)
    const bias = Math.min(inProgressBias, maxBias)
    const doneW = slack - bias
    return ([['in_progress', bias], ['done', doneW], ...pipe] as [string, number][]).filter(([, w]) => w > 0)
  }
  let inProgW = Math.round(slack * (1 - donePercent / 100) * 0.85)
  inProgW = Math.max(5, Math.min(24, inProgW))
  const doneW = slack - inProgW
  return ([['done', doneW], ['in_progress', inProgW], ...pipe] as [string, number][]).filter(([, w]) => w > 0)
}

function progressForSimStatus(status: SimTaskStatus, rnd: () => number): number {
  switch (status) {
    case 'done':
      return 100
    case 'new':
      return 0
    case 'cancelled':
      return randBetweenRng(rnd, 0, 40)
    case 'in_progress':
      return randBetweenRng(rnd, 12, 88)
    case 'in_review':
      return randBetweenRng(rnd, 80, 97)
    case 'fixed':
      return randBetweenRng(rnd, 94, 100)
    case 'feedback':
      return randBetweenRng(rnd, 38, 82)
    default:
      return 0
  }
}

/** Giờ làm gắn với daily report (project_user_daily_workload), đồng bộ evm_ac.working_hours. */
function roundSeedWorkHours(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(24, Math.round(n * 100) / 100)
}

/**
 * Tổng giờ làm theo user/ngày cho daily report:
 * - 80% ngày: đúng 8h
 * - 20% còn lại: under-time hoặc overtime (có ngày > 8h)
 */
function seedDailyReportTotalHours(userId: string, reportDate: string): number {
  const rng = createSeededRng(hashToSeed(`seed-daily-hours-${userId}-${reportDate}`))
  if (rng() < 0.8) return 8

  const bucket = rng()
  if (bucket < 0.4) {
    const under = randBetweenRng(rng, 6, 7) + (rng() < 0.35 ? 0.5 : 0)
    return roundSeedWorkHours(under)
  }
  if (bucket < 0.82) {
    const overtime = randBetweenRng(rng, 9, 11) + (rng() < 0.5 ? 0.5 : 0)
    return roundSeedWorkHours(overtime)
  }
  const heavy = randBetweenRng(rng, 12, 14) + (rng() < 0.35 ? 0.5 : 0)
  return roundSeedWorkHours(heavy)
}

/**
 * Chia tổng giờ trong ngày cho nhiều project cùng user+date.
 * Giữ tổng chính xác (round 2 chữ số) và không vượt 24h/ngày.
 */
function splitSeedHoursAcrossProjects(totalHours: number, projectCount: number, userId: string, reportDate: string): number[] {
  const n = Math.max(1, projectCount)
  const cappedTotal = roundSeedWorkHours(Math.min(24, totalHours))
  if (n === 1) return [cappedTotal]

  const rng = createSeededRng(hashToSeed(`seed-daily-hours-split-${userId}-${reportDate}-${n}`))
  const minPerProject = 0.5
  const minTotal = minPerProject * n
  if (cappedTotal <= minTotal) {
    const equal = roundSeedWorkHours(cappedTotal / n)
    const shares = new Array(n).fill(equal)
    const sumEq = shares.reduce((s, x) => s + x, 0)
    shares[n - 1] = roundSeedWorkHours(shares[n - 1] + (cappedTotal - sumEq))
    return shares
  }

  const weights = new Array(n).fill(0).map(() => 0.6 + rng())
  const weightSum = weights.reduce((s, x) => s + x, 0)
  const remaining = cappedTotal - minTotal
  const shares = weights.map(w => roundSeedWorkHours(minPerProject + (remaining * w) / weightSum))
  const sum = shares.reduce((s, x) => s + x, 0)
  shares[n - 1] = roundSeedWorkHours(shares[n - 1] + (cappedTotal - sum))
  return shares
}

/**
 * Ngày bắt đầu kế hoạch: trước hoặc trùng ngày bắt đầu thực tế, không sau plan_end, không trước joinDate (khi hợp lệ).
 * `taskOrdinal` tách các task tạo cùng ngày khỏi trùng plan_start; thêm nhiễu tránh dồn về join_date / act_start.
 */
function planStartForSeedTask(planEndStr: string, actStart: string | null, joinDate: Date, status: SimTaskStatus, rnd: () => number, taskOrdinal?: number): string {
  const peRaw = planEndStr.includes('T') ? (planEndStr.split('T')[0] ?? planEndStr) : planEndStr
  const pe = new Date(`${peRaw}T00:00:00`)
  pe.setHours(0, 0, 0, 0)
  const jd = new Date(joinDate)
  jd.setHours(0, 0, 0, 0)

  if (pe.getTime() < jd.getTime()) {
    const back = randBetweenRng(rnd, 0, 4)
    return toDateStr(addDays(pe, -back))
  }

  const minSpan = status === 'new' ? 1 : 2
  const maxSpan = status === 'new' ? 55 : 42
  const ordinalJitter = taskOrdinal != null ? (taskOrdinal % 11) + (Math.floor(taskOrdinal / 5) % 7) + (Math.floor(taskOrdinal / 13) % 4) : 0
  const span = randBetweenRng(rnd, minSpan, maxSpan) + ordinalJitter
  let ps = addDays(pe, -span)
  if (ps < jd) ps = new Date(jd)
  if (ps > pe) ps = new Date(pe)

  let actDay: Date | null = null
  if (actStart) {
    const asRaw = actStart.includes('T') ? (actStart.split('T')[0] ?? actStart) : actStart
    const as = new Date(`${asRaw}T00:00:00`)
    as.setHours(0, 0, 0, 0)
    actDay = as
    if (ps > as) ps = new Date(as)
  }

  if (ps > pe) ps = new Date(pe)
  if (ps < jd) ps = new Date(jd)
  if (ps > pe) ps = new Date(pe)

  const jdStr = toDateStr(jd)
  const psStrBefore = toDateStr(ps)
  if (psStrBefore === jdStr && rnd() < 0.48) {
    const fwd = randBetweenRng(rnd, 1, 12)
    const tryLater = addDays(ps, fwd)
    if (tryLater.getTime() <= pe.getTime()) ps = tryLater
  }

  if (actDay && rnd() < 0.56) {
    const asStr = toDateStr(actDay)
    if (toDateStr(ps) === asStr) {
      const back = randBetweenRng(rnd, 1, 18)
      const earlier = addDays(ps, -back)
      if (earlier.getTime() >= jd.getTime()) ps = earlier
    }
  }

  if (ps > pe) ps = new Date(pe)
  if (ps < jd) ps = new Date(jd)
  return toDateStr(ps)
}

/**
 * Ngày task gần thực tế:
 * - Đôi khi plan_end (deadline) < actual_start (chờ scope, bàn giao muộn, deadline lỗi thời)
 * - in_progress: có task bắt đầu từ rất lâu trước; deadline có thể đã qua
 * - in_review / fixed / feedback: vòng QA–PL–khách hàng
 * - cancelled: hủy trước khi làm hoặc dở dang; plan_end thường tương lai để tránh nhiễu “overdue” giả
 * - done: mix chu kỳ ngắn / trung / dài (feature epic vài tháng calendar, bug kẹt lâu)
 */
function planTaskDates(opts: {
  anchorDay: Date
  status: SimTaskStatus
  typ: string
  joinDate: Date
  lateTaskPercent: number
  rnd: () => number
  /** Thứ tự task trong ngày — làm loãng plan_start khi nhiều task cùng anchor */
  taskOrdinal?: number
}): {
  actStart: string | null
  actEnd: string | null
  planEnd: string
  planStart: string
  isLate: boolean
} {
  const { anchorDay, status, typ, joinDate, lateTaskPercent, rnd, taskOrdinal } = opts
  const ord = taskOrdinal
  const anchorStr = toDateStr(anchorDay)

  const jd = new Date(joinDate)
  jd.setHours(0, 0, 0, 0)
  const ad = new Date(anchorDay)
  ad.setHours(0, 0, 0, 0)
  const maxCycleFromJoin = Math.max(1, differenceInCalendarDays(ad, jd))

  if (status === 'new') {
    let planD = addDays(anchorDay, randBetweenRng(rnd, 5, 50))
    if (rnd() < 0.16) {
      planD = addDays(anchorDay, -randBetweenRng(rnd, 2, 120))
    }
    const planEndStr = toDateStr(planD)
    return {
      actStart: null,
      actEnd: null,
      planEnd: planEndStr,
      planStart: planStartForSeedTask(planEndStr, null, joinDate, 'new', rnd, ord),
      isLate: false,
    }
  }

  if (status === 'in_progress') {
    const startedAgo = Math.min(randBetweenRng(rnd, 2, 120), maxCycleFromJoin + 25)
    let startDay = addDays(anchorDay, -startedAgo)
    if (startDay < jd) startDay = new Date(jd)
    const roll = rnd()
    let planD: Date
    if (roll < 0.3) {
      planD = addDays(anchorDay, -randBetweenRng(rnd, 2, 65))
    } else if (roll < 0.66) {
      planD = addDays(anchorDay, randBetweenRng(rnd, 0, 22))
    } else {
      planD = addDays(anchorDay, randBetweenRng(rnd, 5, 85))
    }
    const planEndStr = toDateStr(planD)
    const actStartStr = toDateStr(startDay)
    return {
      actStart: actStartStr,
      actEnd: null,
      planEnd: planEndStr,
      planStart: planStartForSeedTask(planEndStr, actStartStr, joinDate, 'in_progress', rnd, ord),
      isLate: false,
    }
  }

  if (status === 'in_review') {
    const startedAgo = Math.min(randBetweenRng(rnd, 3, 95), maxCycleFromJoin + 30)
    let startDay = addDays(anchorDay, -startedAgo)
    if (startDay < jd) startDay = new Date(jd)
    let planD: Date
    if (rnd() < 0.38) {
      planD = addDays(anchorDay, -randBetweenRng(rnd, 1, 25))
    } else if (rnd() < 0.72) {
      planD = addDays(anchorDay, randBetweenRng(rnd, 0, 14))
    } else {
      planD = addDays(anchorDay, randBetweenRng(rnd, 3, 45))
    }
    const planEndStr = toDateStr(planD)
    const actStartStr = toDateStr(startDay)
    return {
      actStart: actStartStr,
      actEnd: null,
      planEnd: planEndStr,
      planStart: planStartForSeedTask(planEndStr, actStartStr, joinDate, 'in_review', rnd, ord),
      isLate: false,
    }
  }

  if (status === 'fixed') {
    const cycle = Math.min(randBetweenRng(rnd, 4, 52), maxCycleFromJoin + 20)
    let startDay = addDays(anchorDay, -cycle)
    if (startDay < jd) startDay = new Date(jd)
    let fixClose = addDays(anchorDay, -randBetweenRng(rnd, 0, 5))
    if (fixClose < startDay) fixClose = new Date(startDay)
    const planD = addDays(anchorDay, randBetweenRng(rnd, 2, 28))
    const planEndStr = toDateStr(planD)
    const actStartStr = toDateStr(startDay)
    return {
      actStart: actStartStr,
      actEnd: toDateStr(fixClose),
      planEnd: planEndStr,
      planStart: planStartForSeedTask(planEndStr, actStartStr, joinDate, 'fixed', rnd, ord),
      isLate: false,
    }
  }

  if (status === 'feedback') {
    const startedAgo = Math.min(randBetweenRng(rnd, 5, 100), maxCycleFromJoin + 28)
    let startDay = addDays(anchorDay, -startedAgo)
    if (startDay < jd) startDay = new Date(jd)
    let planD: Date
    if (rnd() < 0.42) {
      planD = addDays(anchorDay, randBetweenRng(rnd, 2, 24))
    } else if (rnd() < 0.78) {
      planD = addDays(anchorDay, -randBetweenRng(rnd, 1, 21))
    } else {
      planD = addDays(anchorDay, randBetweenRng(rnd, 5, 60))
    }
    const planEndStr = toDateStr(planD)
    const actStartStr = toDateStr(startDay)
    return {
      actStart: actStartStr,
      actEnd: null,
      planEnd: planEndStr,
      planStart: planStartForSeedTask(planEndStr, actStartStr, joinDate, 'feedback', rnd, ord),
      isLate: false,
    }
  }

  if (status === 'cancelled') {
    if (rnd() < 0.4) {
      const planFuture = addDays(anchorDay, randBetweenRng(rnd, 14, 120))
      const planEndStr = toDateStr(planFuture)
      return {
        actStart: null,
        actEnd: toDateStr(anchorDay),
        planEnd: planEndStr,
        planStart: planStartForSeedTask(planEndStr, null, joinDate, 'cancelled', rnd, ord),
        isLate: false,
      }
    }
    const startedAgo = Math.min(randBetweenRng(rnd, 2, 55), maxCycleFromJoin)
    let startDay = addDays(anchorDay, -startedAgo)
    if (startDay < jd) startDay = new Date(jd)
    const planFuture = addDays(anchorDay, randBetweenRng(rnd, 20, 90))
    const planEndStr = toDateStr(planFuture)
    const actStartStr = toDateStr(startDay)
    const rawCancelEnd = rnd() < 0.65 ? anchorStr : toDateStr(addDays(anchorDay, -randBetweenRng(rnd, 1, 8)))
    return {
      actStart: actStartStr,
      actEnd: rawCancelEnd >= actStartStr ? rawCancelEnd : actStartStr,
      planEnd: planEndStr,
      planStart: planStartForSeedTask(planEndStr, actStartStr, joinDate, 'cancelled', rnd, ord),
      isLate: false,
    }
  }

  const rCycle = rnd()
  let cycleDays: number
  if (rCycle < 0.34) {
    const hi = Math.max(1, Math.min(maxCycleFromJoin, typ === 'feature' ? 135 : typ === 'bug' ? 72 : 92))
    const lo = Math.max(1, Math.min(hi, typ === 'feature' ? 24 : typ === 'bug' ? 9 : 14))
    cycleDays = lo >= hi ? hi : randBetweenRng(rnd, lo, hi)
  } else if (rCycle < 0.72) {
    cycleDays = typ === 'bug' ? randBetweenRng(rnd, 2, 30) : typ === 'feature' ? randBetweenRng(rnd, 5, 52) : randBetweenRng(rnd, 4, 38)
    cycleDays = Math.max(1, Math.min(cycleDays, maxCycleFromJoin))
  } else {
    cycleDays = typ === 'bug' ? randBetweenRng(rnd, 1, 9) : typ === 'feature' ? randBetweenRng(rnd, 2, 24) : randBetweenRng(rnd, 2, 15)
    cycleDays = Math.max(1, Math.min(cycleDays, maxCycleFromJoin))
  }

  let startDay = addDays(anchorDay, -cycleDays)
  if (startDay < jd) startDay = new Date(jd)
  const actStart = toDateStr(startDay)
  const actEnd = anchorStr

  const rPlan = rnd()
  let planD: Date
  if (rPlan < 0.13) {
    planD = addDays(startDay, -randBetweenRng(rnd, 3, 60))
  } else if (rnd() * 100 < lateTaskPercent) {
    planD = addDays(anchorDay, -randBetweenRng(rnd, 1, 40))
  } else {
    planD = addDays(anchorDay, rnd() < 0.4 ? randBetweenRng(rnd, 0, 14) : randBetweenRng(rnd, 0, 5))
  }

  const planEndStr = toDateStr(planD)
  const isLate = actEnd > planEndStr

  return {
    actStart,
    actEnd,
    planEnd: planEndStr,
    planStart: planStartForSeedTask(planEndStr, actStart, joinDate, 'done', rnd, ord),
    isLate,
  }
}

/** Scale cường độ theo target rank (để XP đạt đúng tier) */
const RANK_SCALE: Record<string, number> = {
  newbie: 0.12,
  contributor: 0.3,
  developer: 0.5,
  regular: 0.7,
  pro: 0.95,
  expert: 1.3,
  master: 1.8,
  legend: 3.2,
  mythic: 4.0,
}

// ========== Main seed ==========

/**
 * Chạy seed mock từ Settings (đã sync electron-store). Pool nội bộ của module được đóng sau khi xong.
 */
export async function runSeedMockWithElectronDb(config: SeedMockDbConfig): Promise<void> {
  const host = (config.host || '').trim()
  const database = (config.database || '').trim()
  if (!host || !database) {
    throw new Error('DB host và database là bắt buộc để seed mock.')
  }
  const pgSchema = (config.pgSchema || 'public').trim() || 'public'
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pgSchema)) {
    throw new Error('PostgreSQL schema không hợp lệ: chỉ [a-zA-Z0-9_], đầu phải là chữ hoặc _.')
  }
  const portNum = Number(config.port)
  _electronSeedOverride = {
    host,
    port: Number.isFinite(portNum) && portNum > 0 ? portNum : 5432,
    user: (config.user || '').trim() || 'postgres',
    password: config.password ?? '',
    database,
    tls: (config.tls || 'auto').trim() || 'auto',
    pgSchema,
  }
  if (pool) {
    await pool.end().catch(() => {})
    pool = null
  }
  try {
    await runSeedMockCore()
  } finally {
    // runSeedMockCore có thể tạo lại pool; TS không theo dõi gán chéo module nên không narrow `pool` sau khối if phía trên
    const closing: Pool | null = pool as Pool | null
    if (closing) {
      await closing.end().catch(() => {})
      pool = null
    }
    _electronSeedOverride = null
  }
}

export async function main(): Promise<void> {
  if (!USE_ENV) {
    console.error('Error: Khi chạy seed:mock ngoài Electron, phải set APP_DB_HOST và APP_DB_NAME (hoặc TASK_DB_HOST / TASK_DB_NAME).')
    console.error(
      'Ví dụ (PowerShell): $env:APP_DB_HOST="localhost"; $env:APP_DB_PORT="5432"; $env:APP_DB_NAME="honey_badger"; $env:APP_DB_USER="postgres"; $env:APP_DB_PASSWORD="yourpass"; $env:APP_DB_TLS="disabled"; pnpm run seed:mock'
    )
    process.exit(1)
  }
  await runSeedMockCore()
}

async function runSeedMockCore(): Promise<void> {
  const seedVal = process.env.SEED_RANDOM
  if (seedVal) {
    const seedNum = parseInt(seedVal, 10) || 0
    _v7SeedCallIndex = 0
    _uuidRng = createSeededRng(seedNum)
    _globalRng = createSeededRng(hashToSeed(`seed-mock-global-${seedNum}`))
    Math.random = () => _globalRng()
    console.log(`Seed mock data: starting... (SEED_RANDOM=${seedNum} - reproducible)`)
  } else {
    _v7SeedCallIndex = 0
    _uuidRng = null
    _globalRng = () => Math.random()
    console.log('Seed mock data: starting...')
  }

  _userDayRngByKey.clear()
  _commitHourPrefsByUser.clear()
  _radarNoCommitBoostByUser.clear()

  const BATCH_SIZE = 15
  const rowPlaceholder = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  for (let i = 0; i < ACHIEVEMENT_DEFINITIONS.length; i += BATCH_SIZE) {
    const batch = ACHIEVEMENT_DEFINITIONS.slice(i, i + BATCH_SIZE)
    const valuesSql = batch.map(() => rowPlaceholder).join(', ')
    const params = batch.flatMap(def => [
      def.code,
      def.category,
      def.tier,
      def.name,
      def.description,
      def.icon,
      def.xp_reward,
      def.is_repeatable ? 1 : 0,
      def.condition_type,
      def.condition_threshold ?? null,
      def.is_negative ? 1 : 0,
      def.sort_order,
    ])
    await query(
      `INSERT INTO achievements (code, category, tier, name, description, icon, xp_reward, is_repeatable, condition_type, condition_threshold, is_negative, sort_order)
       VALUES ${valuesSql}
       ON CONFLICT (code) DO UPDATE SET
         category = EXCLUDED.category,
         tier = EXCLUDED.tier,
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         icon = EXCLUDED.icon,
         xp_reward = EXCLUDED.xp_reward,
         is_repeatable = EXCLUDED.is_repeatable,
         condition_type = EXCLUDED.condition_type,
         condition_threshold = EXCLUDED.condition_threshold,
         is_negative = EXCLUDED.is_negative,
         sort_order = EXCLUDED.sort_order`,
      params
    )
  }
  console.log(`Achievements seeded (${ACHIEVEMENT_DEFINITIONS.length})`)

  const endDate = new Date()
  endDate.setHours(0, 0, 0, 0)
  const startDate = subYears(endDate, 1)
  const workingDays = getWorkingDays(startDate, endDate)
  const project2Start = subMonths(endDate, 10)
  console.log(`Working days: ${workingDays.length} (${toDateStr(startDate)} to ${toDateStr(endDate)})`)

  // 1. Users — mở rộng 18 case (xem console cuối main: bảng map case → user_code)
  const devsP1: DevUser[] = [
    {
      id: randomUUID(),
      user_code: 'dev_legend',
      name: 'Legend Dev',
      email: 'dev.legend@company.com',
      profile: 'star',
      tenureMonths: 12,
      lateTaskPercent: 5,
      commitVariance: 'stable',
      targetRank: 'legend',
      roleP1: 'pl',
      roleP2: 'dev',
    },
    {
      id: randomUUID(),
      user_code: 'dev_pl_split',
      name: 'Dev PL Split',
      email: 'dev.plsplit@company.com',
      profile: 'good',
      tenureMonths: 8,
      lateTaskPercent: 12,
      commitVariance: 'stable',
      targetRank: 'pro',
      roleP1: 'dev',
      roleP2: 'pl',
    },
    {
      id: randomUUID(),
      user_code: 'dev_master',
      name: 'Master Dev',
      email: 'dev.master@company.com',
      profile: 'star',
      tenureMonths: 12,
      lateTaskPercent: 10,
      commitVariance: 'burst',
      targetRank: 'master',
    },
    {
      id: randomUUID(),
      user_code: 'dev_expert',
      name: 'Expert Dev',
      email: 'dev.expert@company.com',
      profile: 'good',
      tenureMonths: 10,
      lateTaskPercent: 15,
      commitVariance: 'stable',
      targetRank: 'expert',
      reportStreakTailDays: 6,
    },
    {
      id: randomUUID(),
      user_code: 'dev_pro',
      name: 'Pro Dev',
      email: 'dev.pro@company.com',
      profile: 'good',
      tenureMonths: 8,
      lateTaskPercent: 20,
      commitVariance: 'spiky',
      targetRank: 'pro',
      reportStreakTailDays: 7,
    },
    {
      id: randomUUID(),
      user_code: 'dev_regular',
      name: 'Regular Dev',
      email: 'dev.regular@company.com',
      profile: 'average',
      tenureMonths: 6,
      lateTaskPercent: 25,
      commitVariance: 'stable',
      targetRank: 'regular',
      reportStreakTailDays: 5,
    },
    {
      id: randomUUID(),
      user_code: 'dev_developer',
      name: 'Developer Dev',
      email: 'dev.developer@company.com',
      profile: 'average',
      tenureMonths: 4,
      lateTaskPercent: 30,
      commitVariance: 'burst',
      targetRank: 'developer',
    },
    {
      id: randomUUID(),
      user_code: 'dev_contributor',
      name: 'Contributor Dev',
      email: 'dev.contributor@company.com',
      profile: 'below',
      tenureMonths: 3,
      lateTaskPercent: 40,
      commitVariance: 'spiky',
      targetRank: 'contributor',
    },
    {
      id: randomUUID(),
      user_code: 'dev_newbie',
      name: 'Newbie Dev',
      email: 'dev.newbie@company.com',
      profile: 'bad',
      tenureMonths: 1,
      lateTaskPercent: 60,
      commitVariance: 'burst',
      targetRank: 'newbie',
    },
    {
      id: randomUUID(),
      user_code: 'dev_3m_avg',
      name: 'Dev 3 Tháng',
      email: 'dev.3m@company.com',
      profile: 'average',
      tenureMonths: 3,
      lateTaskPercent: 35,
      commitVariance: 'spiky',
      targetRank: 'contributor',
    },
    {
      id: randomUUID(),
      user_code: 'dev_6m_late',
      name: 'Dev Hay Trễ',
      email: 'dev.late@company.com',
      profile: 'below',
      tenureMonths: 6,
      lateTaskPercent: 55,
      commitVariance: 'burst',
      targetRank: 'developer',
    },
    {
      id: randomUUID(),
      user_code: 'dev_terrible',
      name: 'Dev Terrible',
      email: 'dev.terrible@company.com',
      profile: 'terrible',
      tenureMonths: 2,
      lateTaskPercent: 85,
      commitVariance: 'burst',
      targetRank: 'newbie',
    },
    {
      id: randomUUID(),
      user_code: 'dev_perfect',
      name: 'Dev Perfect',
      email: 'dev.perfect@company.com',
      profile: 'star',
      tenureMonths: 12,
      lateTaskPercent: 0,
      commitVariance: 'stable',
      targetRank: 'legend',
    },
    {
      id: randomUUID(),
      user_code: 'dev_streak_30',
      name: 'Dev Streak 30',
      email: 'dev.streak30@company.com',
      profile: 'good',
      tenureMonths: 6,
      lateTaskPercent: 12,
      commitVariance: 'stable',
      targetRank: 'regular',
      reportStreakTailDays: 30,
      forceReportStreakInStats: 30,
    },
    {
      id: randomUUID(),
      user_code: 'dev_join_last_day',
      name: 'Dev Mới Cuối',
      email: 'dev.joinlast@company.com',
      profile: 'average',
      tenureMonths: 0,
      lateTaskPercent: 25,
      commitVariance: 'stable',
      targetRank: 'newbie',
      joinOnLastWorkingDay: true,
    },
    {
      id: randomUUID(),
      user_code: 'dev_commits_only',
      name: 'Dev Chỉ Commit',
      email: 'dev.commitonly@company.com',
      profile: 'good',
      tenureMonths: 4,
      lateTaskPercent: 20,
      commitVariance: 'stable',
      targetRank: 'developer',
      activityMode: 'commits_only',
    },
    {
      id: randomUUID(),
      user_code: 'dev_tasks_only',
      name: 'Dev Chỉ Task',
      email: 'dev.taskonly@company.com',
      profile: 'average',
      tenureMonths: 4,
      lateTaskPercent: 25,
      commitVariance: 'stable',
      targetRank: 'developer',
      activityMode: 'tasks_only',
    },
    {
      id: randomUUID(),
      user_code: 'dev_silent_tail',
      name: 'Dev Im Cuối Kỳ',
      email: 'dev.silenttail@company.com',
      profile: 'average',
      tenureMonths: 6,
      lateTaskPercent: 28,
      commitVariance: 'stable',
      targetRank: 'regular',
      noReportLastWorkingDays: 14,
    },
    {
      id: randomUUID(),
      user_code: 'dev_streak_break',
      name: 'Dev Gãy Streak',
      email: 'dev.streakbreak@company.com',
      profile: 'good',
      tenureMonths: 5,
      lateTaskPercent: 15,
      commitVariance: 'stable',
      targetRank: 'pro',
      reportStreakTailDays: 25,
      breakReportSecondLastWorkingDay: true,
    },
    {
      id: randomUUID(),
      user_code: 'dev_never_report',
      name: 'Dev Không Report',
      email: 'dev.neverreport@company.com',
      profile: 'below',
      tenureMonths: 8,
      lateTaskPercent: 35,
      commitVariance: 'spiky',
      targetRank: 'developer',
      neverDailyReport: true,
    },
  ]
  const devsP2Extra: DevUser[] = [
    {
      id: randomUUID(),
      user_code: 'dev_p2_pro',
      name: 'P2 Pro',
      email: 'dev.p2.pro@company.com',
      profile: 'good',
      tenureMonths: 5,
      lateTaskPercent: 18,
      commitVariance: 'stable',
      targetRank: 'pro',
    },
    {
      id: randomUUID(),
      user_code: 'dev_p2_newbie',
      name: 'P2 Mới',
      email: 'dev.p2.new@company.com',
      profile: 'bad',
      tenureMonths: 1,
      lateTaskPercent: 50,
      commitVariance: 'spiky',
      targetRank: 'newbie',
    },
  ]
  const p2OnlyDevs: DevUser[] = [
    {
      id: randomUUID(),
      user_code: 'dev_p2_streak',
      name: 'P2 Streak Only',
      email: 'dev.p2.streak@company.com',
      profile: 'good',
      tenureMonths: 4,
      lateTaskPercent: 18,
      commitVariance: 'stable',
      targetRank: 'developer',
      roleP2: 'dev',
      reportStreakTailDays: 7,
      forceReportStreakInStats: 7,
    },
  ]
  const plOnlyUsers: DevUser[] = [
    {
      id: randomUUID(),
      user_code: 'pl_pure',
      name: 'PL Thuần',
      email: 'pl.pure@company.com',
      profile: 'star',
      tenureMonths: 12,
      lateTaskPercent: 0,
      commitVariance: 'stable',
      targetRank: 'expert',
      seedActivity: 'none',
      roleP1: 'pl',
      roleP2: 'none',
    },
    {
      id: randomUUID(),
      user_code: 'pl_p1_b',
      name: 'PL P1 Phụ',
      email: 'pl.p1b@company.com',
      profile: 'good',
      tenureMonths: 8,
      lateTaskPercent: 15,
      commitVariance: 'stable',
      targetRank: 'pro',
      seedActivity: 'none',
      roleP1: 'pl',
      roleP2: 'none',
    },
  ]
  const tinyTeamDevs: DevUser[] = [
    {
      id: randomUUID(),
      user_code: 'tiny_pl',
      name: 'Tiny PL',
      email: 'tiny.pl@company.com',
      profile: 'good',
      tenureMonths: 6,
      lateTaskPercent: 10,
      commitVariance: 'stable',
      targetRank: 'pro',
      roleP2: 'none',
    },
    {
      id: randomUUID(),
      user_code: 'tiny_dev_a',
      name: 'Tiny Dev A',
      email: 'tiny.a@company.com',
      profile: 'average',
      tenureMonths: 4,
      lateTaskPercent: 22,
      commitVariance: 'stable',
      targetRank: 'developer',
      roleP2: 'none',
    },
    {
      id: randomUUID(),
      user_code: 'tiny_dev_b',
      name: 'Tiny Dev B',
      email: 'tiny.b@company.com',
      profile: 'average',
      tenureMonths: 4,
      lateTaskPercent: 24,
      commitVariance: 'burst',
      targetRank: 'developer',
      roleP2: 'none',
    },
  ]

  const plP2User = devsP1.find(u => u.roleP2 === 'pl') ?? devsP1[0]
  if (!plP2User) throw new Error('seedMockData: devsP1 rỗng')
  const coreP2Codes = new Set(['dev_legend', 'dev_master', 'dev_expert', 'dev_pro', 'dev_regular'])
  const coreP2Row = devsP1.filter(u => coreP2Codes.has(u.user_code))
  const devsP2Ordered = [plP2User, ...coreP2Row.filter(u => u.id !== plP2User.id)]
  const devsP2 = [...devsP2Ordered, ...devsP2Extra, ...p2OnlyDevs].filter(u => (u.roleP2 ?? 'dev') !== 'none')

  const allSeedUsers: DevUser[] = [...devsP1, ...devsP2Extra, ...p2OnlyDevs, ...plOnlyUsers, ...tinyTeamDevs]

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10)

  await withTransaction(async tx => {
    for (const u of allSeedUsers) {
      await tx('INSERT INTO users (id, user_code, name, email, receive_commit_notification) VALUES (?, ?, ?, ?, TRUE) ON CONFLICT (user_code) DO NOTHING', [
        u.id,
        u.user_code,
        u.name,
        u.email,
      ])
      await tx('INSERT INTO users_password (id, user_id, password_hash, version) VALUES (?, ?, ?, 1) ON CONFLICT (user_id) DO NOTHING', [randomUUID(), u.id, passwordHash])
    }
  })
  // Đồng bộ id thực tế từ DB (ON CONFLICT DO NOTHING có thể bỏ qua khi user_code trùng → id trong memory != id trong DB)
  const userCodes = allSeedUsers.map(u => u.user_code)
  const placeholders = userCodes.map(() => '?').join(',')
  const rows = await query<{ id: string; user_code: string }>(`SELECT id, user_code FROM users WHERE user_code IN (${placeholders})`, userCodes)
  const idByCode = new Map((Array.isArray(rows) ? rows : []).map(r => [r.user_code, r.id]))
  for (const u of allSeedUsers) {
    const realId = idByCode.get(u.user_code)
    if (realId) u.id = realId
  }
  console.log('Users inserted')

  // 2. Projects — cleanup old seed data first for safe re-run
  const SEED_PROJECT_NOS = ['ECOM', 'CRM', 'TINY']
  const oldProjRows = (await query(`SELECT id FROM projects WHERE project_no IN (${SEED_PROJECT_NOS.map(() => '?').join(',')})`, SEED_PROJECT_NOS)) as { id: string }[]
  if (oldProjRows.length > 0) {
    const oldPids = oldProjRows.map(r => r.id)
    const ph = oldPids.map(() => '?').join(',')
    await query(`DELETE FROM task_notifications WHERE task_id IN (SELECT id FROM tasks WHERE project_id IN (${ph}))`, oldPids)
    await query(`DELETE FROM task_notifications WHERE task_id IS NULL AND type IN ('achievement_unlocked', 'rank_up')`, [])
    await query(`DELETE FROM task_links WHERE from_task_id IN (SELECT id FROM tasks WHERE project_id IN (${ph}))`, oldPids)
    await query(`DELETE FROM tasks WHERE project_id IN (${ph})`, oldPids)
    await query(`DELETE FROM task_ticket_sequences WHERE project_id IN (${ph})`, oldPids)
    await query(`DELETE FROM evm_wbs_detail WHERE wbs_master_id IN (SELECT id FROM evm_wbs_master WHERE project_id IN (${ph}))`, oldPids)
    await query(`DELETE FROM evm_wbs_master WHERE project_id IN (${ph})`, oldPids)
    await query(`DELETE FROM evm_ac WHERE project_id IN (${ph})`, oldPids)
    await query(`DELETE FROM evm_phases WHERE project_id IN (${ph})`, oldPids)
    await query(`DELETE FROM daily_reports WHERE project_id IN (${ph})`, oldPids)
    await query(`DELETE FROM project_user_daily_workload WHERE project_id IN (${ph})`, oldPids)
    await query(`DELETE FROM git_commit_queue WHERE source_folder_path IN (SELECT source_folder_path FROM user_project_source_folder WHERE project_id IN (${ph}))`, oldPids)
    await query(`DELETE FROM user_project_source_folder WHERE project_id IN (${ph})`, oldPids)
    await query(`DELETE FROM user_project_roles WHERE project_id IN (${ph})`, oldPids)
    await query(`DELETE FROM projects WHERE id IN (${ph})`, oldPids)
    console.log(`Cleaned up old seed data for projects: ${SEED_PROJECT_NOS.join(', ')} (${oldPids.length} projects)`)
  }

  const project1Id = randomUUID()
  const project2Id = randomUUID()
  const project3Id = randomUUID()
  const pathP3 = 'C:/workspace/tiny-team/repo'

  const reportDateStr = toDateStr(endDate)
  const projectsCols = 'id, project_no, name, start_date, end_date, report_date, end_user, daily_report_reminder_time'
  await query(`INSERT INTO projects (${projectsCols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`, [
    project1Id,
    'ECOM',
    'E-Commerce Platform',
    toDateStr(startDate),
    toDateStr(endDate),
    reportDateStr,
    'Retail Corp',
    '17:00:00',
  ])
  await query(`INSERT INTO projects (${projectsCols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`, [
    project2Id,
    'CRM',
    'Internal CRM',
    toDateStr(project2Start),
    toDateStr(endDate),
    reportDateStr,
    'Internal',
    '16:30:00',
  ])
  await query(`INSERT INTO projects (${projectsCols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`, [
    project3Id,
    'TINY',
    'Tiny Team',
    toDateStr(startDate),
    toDateStr(endDate),
    reportDateStr,
    'Internal',
    null,
  ])
  console.log('Projects inserted')

  const seedEvmPhasesForProject = async (projId: string) => {
    let ord = 0
    for (const p of EVM_DEFAULT_PHASES) {
      await query('INSERT INTO evm_phases (project_id, code, name, sort_order) VALUES (?, ?, ?, ?) ON CONFLICT (project_id, code) DO NOTHING', [projId, p.code, p.name, ord++])
    }
  }
  await seedEvmPhasesForProject(project1Id)
  await seedEvmPhasesForProject(project2Id)
  await seedEvmPhasesForProject(project3Id)

  // 3. Roles & source folders
  const upsfP1: { id: string; userId: string; projectId: string; path: string }[] = []
  const upsfP2: { id: string; userId: string; projectId: string; path: string }[] = []
  const upsfP3: { id: string; userId: string; projectId: string; path: string }[] = []
  const pathP1 = 'C:/workspace/ecom-platform/repo'
  const pathP2 = 'C:/workspace/internal-crm/repo'

  for (let i = 0; i < devsP1.length; i++) {
    const u = devsP1[i]
    await query('INSERT INTO user_project_roles (id, user_id, project_id, role, version) VALUES (?, ?, ?, ?, 1) ON CONFLICT (user_id, project_id_uk, role) DO NOTHING', [
      randomUUID(),
      u.id,
      project1Id,
      defaultRoleP1(u, i),
    ])
    const upsId = randomUUID()
    upsfP1.push({ id: upsId, userId: u.id, projectId: project1Id, path: pathP1 })
  }
  for (const u of plOnlyUsers) {
    await query('INSERT INTO user_project_roles (id, user_id, project_id, role, version) VALUES (?, ?, ?, ?, 1) ON CONFLICT (user_id, project_id_uk, role) DO NOTHING', [
      randomUUID(),
      u.id,
      project1Id,
      'pl',
    ])
    const upsId = randomUUID()
    upsfP1.push({ id: upsId, userId: u.id, projectId: project1Id, path: pathP1 })
  }
  for (const up of upsfP1) {
    await query(
      'INSERT INTO user_project_source_folder (id, user_id, project_id, source_folder_path, source_folder_name) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, project_id, source_folder_path) DO NOTHING',
      [up.id, up.userId, up.projectId, up.path, 'ecom-repo']
    )
  }

  for (let i = 0; i < devsP2.length; i++) {
    const u = devsP2[i]
    await query('INSERT INTO user_project_roles (id, user_id, project_id, role, version) VALUES (?, ?, ?, ?, 1) ON CONFLICT (user_id, project_id_uk, role) DO NOTHING', [
      randomUUID(),
      u.id,
      project2Id,
      i === 0 ? 'pl' : 'dev',
    ])
  }
  for (const u of devsP2) {
    const upsId = randomUUID()
    upsfP2.push({ id: upsId, userId: u.id, projectId: project2Id, path: pathP2 })
    await query(
      'INSERT INTO user_project_source_folder (id, user_id, project_id, source_folder_path, source_folder_name) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, project_id, source_folder_path) DO NOTHING',
      [upsId, u.id, project2Id, pathP2, 'crm-repo']
    )
  }

  for (let ti = 0; ti < tinyTeamDevs.length; ti++) {
    const u = tinyTeamDevs[ti]
    if (!u) continue
    await query('INSERT INTO user_project_roles (id, user_id, project_id, role, version) VALUES (?, ?, ?, ?, 1) ON CONFLICT (user_id, project_id_uk, role) DO NOTHING', [
      randomUUID(),
      u.id,
      project3Id,
      ti === 0 ? 'pl' : 'dev',
    ])
    const upsId = randomUUID()
    upsfP3.push({ id: upsId, userId: u.id, projectId: project3Id, path: pathP3 })
    await query(
      'INSERT INTO user_project_source_folder (id, user_id, project_id, source_folder_path, source_folder_name) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, project_id, source_folder_path) DO NOTHING',
      [upsId, u.id, project3Id, pathP3, 'tiny-repo']
    )
  }
  console.log('Roles & source folders inserted')

  await query(
    'INSERT INTO task_ticket_sequences (project_id, source, next_value) VALUES (?, ?, ?) ON CONFLICT (project_id, source) DO UPDATE SET next_value = GREATEST(task_ticket_sequences.next_value, EXCLUDED.next_value)',
    [project1Id, 'in_app', 1]
  )
  await query(
    'INSERT INTO task_ticket_sequences (project_id, source, next_value) VALUES (?, ?, ?) ON CONFLICT (project_id, source) DO UPDATE SET next_value = GREATEST(task_ticket_sequences.next_value, EXCLUDED.next_value)',
    [project2Id, 'in_app', 1]
  )
  await query(
    'INSERT INTO task_ticket_sequences (project_id, source, next_value) VALUES (?, ?, ?) ON CONFLICT (project_id, source) DO UPDATE SET next_value = GREATEST(task_ticket_sequences.next_value, EXCLUDED.next_value)',
    [project3Id, 'in_app', 1]
  )

  // EVM master (assignee list không lưu đây — lấy từ user_project_roles)
  const phasesJson = JSON.stringify(EVM_DEFAULT_PHASES.map(p => ({ code: p.code, name: p.name })))
  const evmMasterUpsertSuffix =
    ' ON CONFLICT (project_id) DO UPDATE SET phases = EXCLUDED.phases, statuses = EXCLUDED.statuses, non_working_days = EXCLUDED.non_working_days, hours_per_day = EXCLUDED.hours_per_day, phase_report_notes = EXCLUDED.phase_report_notes, assignee_report_notes = EXCLUDED.assignee_report_notes, percent_done_options = EXCLUDED.percent_done_options, issue_import_map = EXCLUDED.issue_import_map'
  const evmMasterCols = `project_id, phases, statuses, non_working_days, hours_per_day, phase_report_notes, assignee_report_notes, percent_done_options, issue_import_map`
  await query(`INSERT INTO evm_master (${evmMasterCols}) VALUES (?, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb)${evmMasterUpsertSuffix}`, [
    project1Id,
    phasesJson,
    EVM_MASTER_STATUSES_JSON,
    '[]',
    8,
    EVM_MASTER_PHASE_REPORT_NOTES_JSON,
    sampleAssigneeReportNotesJson(devsP1),
    EVM_MASTER_PERCENT_DONE_OPTIONS_JSON,
    EVM_MASTER_ISSUE_IMPORT_MAP_JSON,
  ])
  await query(`INSERT INTO evm_master (${evmMasterCols}) VALUES (?, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb)${evmMasterUpsertSuffix}`, [
    project2Id,
    phasesJson,
    EVM_MASTER_STATUSES_JSON,
    '[]',
    8,
    EVM_MASTER_PHASE_REPORT_NOTES_JSON,
    sampleAssigneeReportNotesJson(devsP2),
    EVM_MASTER_PERCENT_DONE_OPTIONS_JSON,
    EVM_MASTER_ISSUE_IMPORT_MAP_JSON,
  ])
  await query(`INSERT INTO evm_master (${evmMasterCols}) VALUES (?, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb)${evmMasterUpsertSuffix}`, [
    project3Id,
    phasesJson,
    EVM_MASTER_STATUSES_JSON,
    '[]',
    7.5,
    EVM_MASTER_PHASE_REPORT_NOTES_JSON,
    sampleAssigneeReportNotesJson(tinyTeamDevs),
    EVM_MASTER_PERCENT_DONE_OPTIONS_JSON,
    EVM_MASTER_ISSUE_IMPORT_MAP_JSON,
  ])

  const evmWbsSegmentsP1: EvmWbsSegment[] = []
  const evmWbsSegmentsP2: EvmWbsSegment[] = []
  const evmWbsSegmentsP3: EvmWbsSegment[] = []
  const rndWbsP1 = createSeededRng(hashToSeed('evm-wbs-seed-p1'))
  const rndWbsP2 = createSeededRng(hashToSeed('evm-wbs-seed-p2'))
  const rndWbsP3 = createSeededRng(hashToSeed('evm-wbs-seed-p3'))

  const insertEvmWbsGenerated = async (projId: string, generated: EvmWbsGeneratedRow[]) => {
    if (generated.length === 0) return
    const sorted = [...generated].sort((a, b) => {
      const c = a.plan_start_date.localeCompare(b.plan_start_date)
      return c !== 0 ? c : a.assignee_user_id.localeCompare(b.assignee_user_id)
    })
    const insertRnd = createSeededRng(hashToSeed(`evm-wbs-extra-${projId}`))
    const HPD = 8
    const groups = new Map<string, EvmWbsGeneratedRow[]>()
    for (const r of sorted) {
      const key = `${r.phase}\t${r.category}\t${r.feature}`
      let bucket = groups.get(key)
      if (!bucket) {
        bucket = []
        groups.set(key, bucket)
      }
      bucket.push(r)
    }
    const groupKeys = [...groups.keys()].sort((a, b) => {
      const rowsA = groups.get(a)
      const rowsB = groups.get(b)
      const af = rowsA?.[0]?.plan_start_date ?? ''
      const bf = rowsB?.[0]?.plan_start_date ?? ''
      return af.localeCompare(bf)
    })

    let sortNo = 0

    for (const gk of groupKeys) {
      const gRows = groups.get(gk)
      if (!gRows?.length) continue
      const masterId = randomUUID()
      const first = gRows[0]
      if (!first) continue
      const datesStart = [...gRows].map(r => r.plan_start_date).sort()
      const datesEnd = [...gRows].map(r => r.plan_end_date).sort()
      const planStart = datesStart[0]
      const planEnd = datesEnd.length ? datesEnd[datesEnd.length - 1] : undefined
      if (planStart == null || planEnd == null) continue
      const assigneePick = gRows.map(r => r.assignee_user_id).find(a => a != null && String(a).trim() !== '') ?? first.assignee_user_id
      const rollupBac = Math.round(gRows.reduce((s, r) => s + r.bac, 0) * 100) / 100
      const detailProgs = gRows.map(r => roundWbsDetailProgress01(r.percent_done))
      const rollupProgress = detailProgs.length ? Math.max(...detailProgs) : 0

      await query(
        `INSERT INTO evm_wbs_master (id, project_id, sort_no, phase, category, feature, note, plan_start_date, plan_end_date, actual_start_date, actual_end_date, assignee_user_id, bac, pv, ev, sv, spi, progress)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)`,
        [
          masterId,
          projId,
          sortNo++,
          first.phase,
          first.category,
          first.feature,
          planStart,
          planEnd,
          first.actual_start_date,
          first.actual_end_date,
          assigneePick ?? null,
          rollupBac,
          rollupProgress,
        ]
      )

      const sortedGroup = [...gRows].sort((a, b) => a.plan_start_date.localeCompare(b.plan_start_date) || a.assignee_user_id.localeCompare(b.assignee_user_id))
      let detailNo = 1
      for (const r of sortedGroup) {
        const id = randomUUID()
        const calDur = Math.max(1, differenceInCalendarDays(new Date(`${r.plan_end_date}T00:00:00`), new Date(`${r.plan_start_date}T00:00:00`)) + 1)
        const estMd = Math.round((r.bac / HPD) * 100) / 100
        const effort = Math.round(r.bac * 100) / 100
        const wbsNote = insertRnd() < 0.22 ? pickRng(insertRnd, EVM_WBS_NOTE_SNIPPETS) : null
        const predecessor = detailNo > 1 && insertRnd() < 0.3 ? detailNo - 1 : null

        await query(
          `INSERT INTO evm_wbs_details (id, project_id, evm_wbs_master_id, no, phase, category, feature, task, duration_days, plan_start_date, plan_end_date, predecessor, actual_start_date, actual_end_date, assignee_user_id, progress, status, effort, est_md, wbs_note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            projId,
            masterId,
            detailNo,
            r.phase,
            r.category,
            r.feature,
            r.task,
            calDur,
            r.plan_start_date,
            r.plan_end_date,
            predecessor,
            r.actual_start_date,
            r.actual_end_date,
            r.assignee_user_id,
            roundWbsDetailProgress01(r.percent_done),
            r.status,
            effort,
            estMd,
            wbsNote,
          ]
        )
        detailNo++
      }
    }
  }

  await insertEvmWbsGenerated(project1Id, generateRealisticEvmWbsForProject(project1Id, startDate, endDate, devsP1, 1, rndWbsP1, endDate, evmWbsSegmentsP1))
  await insertEvmWbsGenerated(project2Id, generateRealisticEvmWbsForProject(project2Id, project2Start, endDate, devsP2, 1, rndWbsP2, endDate, evmWbsSegmentsP2))
  await insertEvmWbsGenerated(project3Id, generateRealisticEvmWbsForProject(project3Id, startDate, endDate, tinyTeamDevs, 0.28, rndWbsP3, endDate, evmWbsSegmentsP3))

  const evmAiInsightSamples: [string, string][] = [
    ['EVM_EXPLAIN_METRICS', '## EVM (mock seed)\n- **CPI** dao động quanh 0,95–1,02 trên Coding / IT.\n- **EV**: theo BAC dòng WBS; vài gói design trễ nhẹ so kế hoạch.'],
    [
      'EVM_SCHEDULE_RISK',
      '## Rủi ro lịch (mock)\n- Giai đoạn **IT/UAT** sát mốc go-live — nên giữ buffer 2–3 ngày làm việc.\n- **System/Basic Design** nhạy scope creep; sync lại WBS nếu đổi phạm vi.',
    ],
  ]
  for (const projId of [project1Id, project2Id, project3Id]) {
    const aiRnd = createSeededRng(hashToSeed(`evm-ai-insight-${projId}`))
    for (const [insightType, md] of evmAiInsightSamples) {
      if (aiRnd() < 0.08) continue
      await query(`INSERT INTO evm_ai_insight (id, project_id, insight_type, output_markdown, input_payload_json) VALUES (?, ?, ?, ?, ?)`, [
        randomUUID(),
        projId,
        insightType,
        md,
        JSON.stringify({ source: 'seed:mock', version: 1 }),
      ])
    }
  }

  console.log('EVM phases, WBS master/details & AI insight samples inserted')

  // Build upsf lookup: userId -> { id, path } per project
  const upsfByUserP1 = new Map<string, { id: string; path: string }>()
  const upsfByUserP2 = new Map<string, { id: string; path: string }>()
  const upsfByUserP3 = new Map<string, { id: string; path: string }>()
  for (const up of upsfP1) upsfByUserP1.set(up.userId, { id: up.id, path: up.path })
  for (const up of upsfP2) upsfByUserP2.set(up.userId, { id: up.id, path: up.path })
  for (const up of upsfP3) upsfByUserP3.set(up.userId, { id: up.id, path: up.path })

  // 5. Loop: tasks, commits, reports, evm_ac, reviews, snapshots per working day
  let taskSeqP1 = 1
  let taskSeqP2 = 1
  let taskSeqP3 = 1
  let evmAcNoP1 = 1
  let evmAcNoP2 = 1
  let evmAcNoP3 = 1
  const exec = (sql: string, params: unknown[]) => query(sql, params)
  const batchTasks = createBatchInserter(
    'tasks',
    [
      'id',
      'project_id',
      'title',
      'description',
      'assignee_user_id',
      'status',
      'progress',
      'priority',
      'type',
      'source',
      'ticket_id',
      'plan_start_date',
      'plan_end_date',
      'actual_start_date',
      'actual_end_date',
      'created_at',
      'created_by',
      'updated_by',
    ],
    '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    exec
  )
  const batchCommits = createBatchInserter(
    'git_commit_queue',
    [
      'commit_hash',
      'commit_user',
      'commit_time',
      'commit_message',
      'added_files',
      'modified_files',
      'deleted_files',
      'has_check_coding_rule',
      'has_check_spotbugs',
      'branch_name',
      'insertions',
      'deletions',
      'changes',
      'source_folder_path',
    ],
    '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    exec,
    ' ON CONFLICT (commit_hash) DO UPDATE SET commit_user = EXCLUDED.commit_user'
  )
  const batchEvmAc = createBatchInserter(
    'evm_ac',
    [
      'id',
      'project_id',
      'no',
      'date',
      'phase',
      'category',
      'feature',
      'task',
      'plan_start_date',
      'plan_end_date',
      'actual_start_date',
      'actual_end_date',
      'percent_done',
      'assignee',
      'working_hours',
      'work_contents',
    ],
    '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    exec
  )
  const batchSnapshots = createBatchInserter(
    'user_daily_snapshots',
    [
      'id',
      'user_id',
      'snapshot_date',
      'commits_count',
      'lines_inserted',
      'lines_deleted',
      'files_changed',
      'commits_with_rule_check',
      'commits_with_spotbugs',
      'commits_total_in_queue',
      'tasks_done',
      'tasks_done_on_time',
      'tasks_overdue_opened',
      'has_daily_report',
      'evm_hours_logged',
    ],
    '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    exec,
    ' ON CONFLICT (user_id, snapshot_date) DO UPDATE SET commits_count = EXCLUDED.commits_count, lines_inserted = EXCLUDED.lines_inserted, lines_deleted = EXCLUDED.lines_deleted, files_changed = EXCLUDED.files_changed, commits_with_rule_check = EXCLUDED.commits_with_rule_check, commits_with_spotbugs = EXCLUDED.commits_with_spotbugs, commits_total_in_queue = EXCLUDED.commits_total_in_queue, tasks_done = EXCLUDED.tasks_done, tasks_done_on_time = EXCLUDED.tasks_done_on_time, tasks_overdue_opened = EXCLUDED.tasks_overdue_opened, has_daily_report = EXCLUDED.has_daily_report, evm_hours_logged = EXCLUDED.evm_hours_logged'
  )
  type DevAccum = {
    tasks: number
    commits: number
    reports: number
    onTime: number
    early: number
    late: number
    bugDone: number
    featureDone: number
    criticalDone: number
    spotbugsClean: number
    spotbugsFails: number
    pushes: number
    merges: number
    branches: number
    rebases: number
    filesCommitted: number
    insertions: number
  }
  const devStatsAccum = new Map<string, DevAccum>()
  const defaultAccum = (): DevAccum => ({
    tasks: 0,
    commits: 0,
    reports: 0,
    onTime: 0,
    early: 0,
    late: 0,
    bugDone: 0,
    featureDone: 0,
    criticalDone: 0,
    spotbugsClean: 0,
    spotbugsFails: 0,
    pushes: 0,
    merges: 0,
    branches: 0,
    rebases: 0,
    filesCommitted: 0,
    insertions: 0,
  })
  const initAccum = (id: string) => {
    if (!devStatsAccum.has(id)) devStatsAccum.set(id, defaultAccum())
  }

  // Precompute special days: nhiều trường hợp ngoài đời thực, random theo user
  type DayType =
    | 'off'
    | 'crunch'
    | 'normal'
    | 'business_trip'
    | 'hotfix'
    | 'training'
    | 'blocked'
    | 'refactor'
    | 'post_release'
    | 'quarter_end'
    | 'interview'
    | 'conference'
    | 'holiday_eve'
    | 'onboarding_support'
    | 'switching'
  const DAY_EFFECTS: Record<DayType, { taskFactor: number; commitFactor: number; inProgressBias?: number }> = {
    off: { taskFactor: 0, commitFactor: 0 },
    crunch: { taskFactor: 2.2, commitFactor: 2.2 },
    normal: { taskFactor: 1, commitFactor: 1 },
    business_trip: { taskFactor: 0, commitFactor: 0 },
    hotfix: { taskFactor: 2.5, commitFactor: 2.8 },
    training: { taskFactor: 0, commitFactor: 0 },
    blocked: { taskFactor: 1.2, commitFactor: 0.2, inProgressBias: 70 },
    refactor: { taskFactor: 0.4, commitFactor: 2 },
    post_release: { taskFactor: 0.4, commitFactor: 0.4 },
    quarter_end: { taskFactor: 1.3, commitFactor: 1.3 },
    interview: { taskFactor: 0.3, commitFactor: 0.3 },
    conference: { taskFactor: 0, commitFactor: 0 },
    holiday_eve: { taskFactor: 0.6, commitFactor: 0.6 },
    onboarding_support: { taskFactor: 0.5, commitFactor: 0.5 },
    switching: { taskFactor: 0.4, commitFactor: 0.4 },
  }
  const dayTypeByKey = new Map<string, DayType>()
  const scenarios: { type: DayType; len: [number, number]; p: number }[] = [
    { type: 'business_trip', len: [2, 3], p: 0.25 },
    { type: 'hotfix', len: [1, 1], p: 0.2 },
    { type: 'training', len: [1, 1], p: 0.22 },
    { type: 'blocked', len: [2, 4], p: 0.2 },
    { type: 'refactor', len: [3, 5], p: 0.18 },
    { type: 'post_release', len: [2, 3], p: 0.2 },
    { type: 'quarter_end', len: [5, 10], p: 0.3 },
    { type: 'interview', len: [1, 2], p: 0.22 },
    { type: 'conference', len: [1, 2], p: 0.15 },
    { type: 'holiday_eve', len: [1, 2], p: 0.12 },
    { type: 'onboarding_support', len: [2, 3], p: 0.2 },
    { type: 'switching', len: [2, 3], p: 0.15 },
  ]
  for (const dev of [...devsP1, ...p2OnlyDevs, ...tinyTeamDevs]) {
    if (dev.seedActivity === 'none') continue
    const joinDayIdx = joinDayIndex(dev, endDate, workingDays)
    const activeDays = workingDays.length - joinDayIdx
    if (activeDays < 10 && !dev.joinOnLastWorkingDay) continue
    const rng = createSeededRng(hashToSeed(`daytype-${dev.id}`))
    for (let i = joinDayIdx; i < workingDays.length; i++) {
      const rx = rng()
      if (rx < 0.03) dayTypeByKey.set(`${dev.id}-${i}`, 'off')
      else if (rx < 0.055) dayTypeByKey.set(`${dev.id}-${i}`, 'crunch')
    }
    const vacLen = randBetweenRng(rng, 3, 5)
    const vacStart = joinDayIdx + Math.floor(rng() * Math.max(1, activeDays - vacLen - 5))
    for (let v = 0; v < vacLen && vacStart + v < workingDays.length; v++) {
      dayTypeByKey.set(`${dev.id}-${vacStart + v}`, 'off')
    }
    for (let s = 0; s < randBetweenRng(rng, 1, 2); s++) {
      const idx = joinDayIdx + Math.floor(rng() * activeDays)
      if (idx < workingDays.length) dayTypeByKey.set(`${dev.id}-${idx}`, 'off')
    }
    const crunchLen = randBetweenRng(rng, 2, 3)
    const crunchStart = workingDays.length - crunchLen - Math.floor(rng() * 5)
    for (let c = 0; c < crunchLen && crunchStart + c < workingDays.length; c++) {
      if (crunchStart + c >= joinDayIdx) dayTypeByKey.set(`${dev.id}-${crunchStart + c}`, 'crunch')
    }
    for (const sc of scenarios) {
      if (rng() > sc.p) continue
      const [minLen, maxLen] = sc.len
      const len = randBetweenRng(rng, minLen, maxLen)
      let start: number
      if (sc.type === 'post_release') {
        start = crunchStart - len - Math.floor(rng() * 3)
      } else if (sc.type === 'quarter_end') {
        start = workingDays.length - len - Math.floor(rng() * 5)
      } else if (sc.type === 'holiday_eve') {
        start = Math.max(joinDayIdx, workingDays.length - len - randBetweenRng(rng, 3, 8))
      } else {
        start = joinDayIdx + Math.floor(rng() * Math.max(1, activeDays - len - 5))
      }
      for (let j = 0; j < len && start + j < workingDays.length; j++) {
        if (start + j >= joinDayIdx) dayTypeByKey.set(`${dev.id}-${start + j}`, sc.type)
      }
    }
    const tailN = reportStreakTailDaysOf(dev)
    if (tailN != null && tailN > 0) {
      for (let s = 0; s < tailN; s++) {
        dayTypeByKey.delete(`${dev.id}-${workingDays.length - 1 - s}`)
      }
    }
  }
  const reportedByUserDay = new Map<string, Set<number>>()
  const committedByDay = new Map<number, { hash: string; path: string }[]>()
  /** Cùng 1 user + ngày: P1 & P2 cùng tuân “ngày không push” (radar coding_days) */
  const radarCommitDayDecision = new Map<string, boolean>()
  const pendingDailyReportRows: PendingDailyReportRowTuple[] = []
  const pendingDailyReportDrsf: { userId: string; reportDate: string; upsfId: string }[] = []
  /** Daily report workload (project-level), giờ sẽ được phân bổ theo user+date khi flush. */
  const pendingReportWorkload: { userId: string; reportDate: string; projectId: string }[] = []

  async function flushPendingDailyReports(): Promise<void> {
    if (pendingDailyReportRows.length > 0) {
      const unique = new Map<string, PendingDailyReportRowTuple>()
      const mergedProjectIds = new Map<string, Set<string>>()
      for (const row of pendingDailyReportRows) {
        const userId = row[1]
        const reportDate = row[3]
        const key = `${userId}|${reportDate}`
        unique.set(key, row)
        if (!mergedProjectIds.has(key)) mergedProjectIds.set(key, new Set())
        try {
          const pids = JSON.parse(row[2]) as string[]
          for (const pid of pids) mergedProjectIds.get(key)?.add(pid)
        } catch {
          /* skip malformed */
        }
      }
      const rowsToInsert: PendingDailyReportRowTuple[] = [...unique.entries()].map(([key, row]) => {
        const pids = mergedProjectIds.get(key)
        if (pids && pids.size > 1) {
          return [row[0], row[1], JSON.stringify([...pids]), row[3], row[4], row[5]]
        }
        return row
      })
      for (let i = 0; i < rowsToInsert.length; i += INSERT_BATCH_SIZE) {
        const chunk = rowsToInsert.slice(i, i + INSERT_BATCH_SIZE)
        const ph = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')
        await query(
          `INSERT INTO daily_reports (id, user_id, project_ids, report_date, work_description, selected_commits)
           VALUES ${ph}
           ON CONFLICT (user_id, report_date) DO UPDATE SET
             work_description = EXCLUDED.work_description,
             project_ids = EXCLUDED.project_ids,
             selected_commits = EXCLUDED.selected_commits`,
          chunk.flatMap(r => [...r])
        )
      }
    }

    if (pendingDailyReportDrsf.length > 0) {
      const keys = new Set<string>()
      for (const d of pendingDailyReportDrsf) {
        keys.add(`${d.userId}|${d.reportDate}`)
      }
      const pairs = [...keys].map(k => {
        const sep = k.indexOf('|')
        return { userId: k.slice(0, sep), reportDate: k.slice(sep + 1) }
      })
      const inPh = pairs.map(() => '(?,?)').join(',')
      const flatParams = pairs.flatMap(p => [p.userId, p.reportDate])
      const idRowsRaw = (await query(`SELECT id, user_id, report_date FROM daily_reports WHERE (user_id, report_date) IN (${inPh})`, flatParams)) as unknown
      const idRows = idRowsRaw as { id: string; user_id: string; report_date: string | Date }[]
      const idByKey = new Map<string, string>()
      for (const r of idRows) {
        const rd =
          typeof r.report_date === 'string' ? (r.report_date.includes('T') ? (r.report_date.split('T')[0] ?? r.report_date) : r.report_date) : toDateStr(r.report_date as Date)
        idByKey.set(`${r.user_id}|${rd}`, r.id)
      }
      const drsfRows: unknown[][] = []
      for (const d of pendingDailyReportDrsf) {
        const aid = idByKey.get(`${d.userId}|${d.reportDate}`)
        if (aid) drsfRows.push([aid, d.upsfId, 0])
      }
      for (let i = 0; i < drsfRows.length; i += INSERT_BATCH_SIZE) {
        const ch = drsfRows.slice(i, i + INSERT_BATCH_SIZE)
        const ph2 = ch.map(() => '(?,?,?)').join(', ')
        await query(
          `INSERT INTO daily_report_source_folders (daily_report_id, user_project_source_folder_id, sort_order) VALUES ${ph2} ON CONFLICT (daily_report_id, user_project_source_folder_id) DO NOTHING`,
          ch.flat()
        )
      }
    }

    if (pendingReportWorkload.length > 0) {
      const uniqueByProject = new Map<string, { userId: string; reportDate: string; projectId: string }>()
      for (const w of pendingReportWorkload) {
        uniqueByProject.set(`${w.userId}|${w.reportDate}|${w.projectId}`, w)
      }

      const grouped = new Map<string, { userId: string; reportDate: string; projectIds: string[] }>()
      for (const w of uniqueByProject.values()) {
        const key = `${w.userId}|${w.reportDate}`
        let g = grouped.get(key)
        if (!g) {
          g = { userId: w.userId, reportDate: w.reportDate, projectIds: [] }
          grouped.set(key, g)
        }
        g.projectIds.push(w.projectId)
      }

      const wRows: { userId: string; reportDate: string; projectId: string; hours: number }[] = []
      for (const g of grouped.values()) {
        const totalHours = seedDailyReportTotalHours(g.userId, g.reportDate)
        const alloc = splitSeedHoursAcrossProjects(totalHours, g.projectIds.length, g.userId, g.reportDate)
        for (let i = 0; i < g.projectIds.length; i++) {
          const pid = g.projectIds[i]
          if (!pid) continue
          wRows.push({
            userId: g.userId,
            reportDate: g.reportDate,
            projectId: pid,
            hours: alloc[i] ?? 0,
          })
        }
      }

      for (let i = 0; i < wRows.length; i += INSERT_BATCH_SIZE) {
        const ch = wRows.slice(i, i + INSERT_BATCH_SIZE)
        const phw = ch.map(() => '(?, ?, ?, ?::date, ?, NULL, NULL, 1, ?, ?)').join(', ')
        await query(
          `INSERT INTO project_user_daily_workload (id, project_id, user_id, work_date, actual_work_hours, override_hours, note, version, created_by, updated_by)
           VALUES ${phw}
           ON CONFLICT (project_id, user_id, work_date)
           DO UPDATE SET
             actual_work_hours = EXCLUDED.actual_work_hours,
             version = project_user_daily_workload.version + 1,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
          ch.flatMap(w => [randomUUID(), w.projectId, w.userId, w.reportDate, roundSeedWorkHours(w.hours), w.userId, w.userId])
        )
      }
    }

    pendingDailyReportRows.length = 0
    pendingDailyReportDrsf.length = 0
    pendingReportWorkload.length = 0
  }

  const taskUpdatePeersP1 = [...new Set([...devsP1.map(d => d.id), ...plOnlyUsers.map(u => u.id)])]
  const taskUpdatePeersP2 = [...new Set(devsP2.map(d => d.id))]
  const taskUpdatePeersP3 = [...new Set(tinyTeamDevs.map(d => d.id))]
  let milestoneSeqP1 = 1
  let milestoneSeqP2 = 1
  let milestoneSeqP3 = 1

  /**
   * Tracks [plan_start, plan_end] windows for each user's tasks across ALL days.
   * Persists throughout the entire day loop so we can count how many tasks are
   * "active" (plan_start <= dateStr <= plan_end) on any given day, preventing
   * more than SEED_MAX_TASKS_PER_USER_PER_DAY overlapping tasks on the Gantt.
   */
  const userPlanWindows = new Map<string, Array<{ ps: string; pe: string }>>()
  const countActiveOnDay = (userId: string, dayStr: string): number => {
    const wins = userPlanWindows.get(userId)
    if (!wins || wins.length === 0) return 0
    return wins.reduce((n, w) => n + (w.ps <= dayStr && w.pe >= dayStr ? 1 : 0), 0)
  }
  const registerPlanWindow = (userId: string, ps: string, pe: string) => {
    let wins = userPlanWindows.get(userId)
    if (!wins) {
      wins = []
      userPlanWindows.set(userId, wins)
    }
    wins.push({ ps, pe })
  }
  const pruneExpiredWindows = (dayStr: string) => {
    for (const [uid, wins] of userPlanWindows) {
      const kept = wins.filter(w => w.pe >= dayStr)
      if (kept.length !== wins.length) userPlanWindows.set(uid, kept)
    }
  }

  for (let dayIdx = 0; dayIdx < workingDays.length; dayIdx++) {
    radarCommitDayDecision.clear()
    const day = workingDays[dayIdx]
    const dateStr = toDateStr(day)
    pruneExpiredWindows(dateStr)
    if (dayIdx > 0 && dayIdx % 50 === 0) console.log(`  Day ${dayIdx + 1} / ${workingDays.length}...`)

    const wdLen = workingDays.length
    for (let devIdx = 0; devIdx < devsP1.length; devIdx++) {
      const dev = devsP1[devIdx]
      if (dev.seedActivity === 'none') continue
      const joinDateP1 = effectiveJoinDate(dev, endDate, workingDays)
      if (day < joinDateP1) continue
      const upsf = upsfByUserP1.get(dev.id)
      if (!upsf) continue
      const pathP = pathP1
      const cfg = PROFILE_CONFIG[dev.profile]
      const scale = RANK_SCALE[dev.targetRank] ?? 1
      initAccum(dev.id)
      const acc = devStatsAccum.get(dev.id) ?? defaultAccum()
      const rnd = userDayRng(dev.id, dayIdx)

      const dayType = dayTypeByKey.get(`${dev.id}-${dayIdx}`) ?? 'normal'
      const streakTailDay = isStreakTailDay(dev, dayIdx, wdLen)
      const rampUp = dayIdx - joinDayIndex(dev, endDate, workingDays) < 10 ? 0.6 : 1
      const dow = getDay(day)
      const monFactor = dow === 1 ? 0.85 : dow === 5 ? 1.15 : 1
      const eff = DAY_EFFECTS[dayType]
      const taskFactor = eff.taskFactor
      const commitFactor = eff.commitFactor
      const baseTasks = taskFactor === 0 ? 0 : randBetweenRng(rnd, cfg.tasksPerDay[0], cfg.tasksPerDay[1])
      let numTasks = Math.max(0, Math.round(baseTasks * scale * rampUp * monFactor * taskFactor))
      if (dev.activityMode === 'commits_only') numTasks = 0
      numTasks = Math.min(numTasks, Math.max(0, SEED_MAX_TASKS_PER_USER_PER_DAY - countActiveOnDay(dev.id, dateStr)))
      const statusWeightsFiltered = simTaskStatusWeights(cfg.donePercent, eff.inProgressBias).filter(([, w]) => Number(w) > 0) as [string, number][]

      let doneToday = 0
      let onTimeDoneToday = 0
      let tasksOverdueOpenedToday = 0
      for (let t = 0; t < numTasks; t++) {
        const taskId = randomUUID()
        const typ = pickWeightedRng(rnd, canSeedMilestone('p1', dev, devIdx, 0) ? TASK_TYPE_WEIGHTS_WITH_MILESTONE : TASK_TYPE_WEIGHTS)

        if (typ === 'milestone') {
          const msLabel = `MS-P1-${milestoneSeqP1++}`
          const planStart = pickMilestonePlanStartStr(workingDays, seedMilestoneDayIdx(dayIdx, t, wdLen), joinDateP1, rnd)
          const prio = pickWeightedRng(rnd, MILESTONE_PRIORITY_WEIGHTS)
          const status: SimTaskStatus = planStart < dateStr ? (rnd() < 0.87 ? 'done' : 'new') : 'new'
          const progress = status === 'done' ? 100 : 0
          const assigneeMs = rnd() < 0.72 ? null : dev.id
          tasksOverdueOpenedToday += seedOverdueOpenedForTask(status, null, dateStr)
          acc.tasks++
          if (status === 'done') {
            doneToday++
            onTimeDoneToday++
            if (rnd() * 100 < 15) acc.early++
            else acc.onTime++
            if (prio === 'critical') acc.criticalDone++
          }
          const peerAudit = assigneeMs ?? dev.id
          const createdAtStr = `${dateStr} 10:00:00`
          batchTasks.add([
            taskId,
            project1Id,
            `${seedTaskTitlePrefix('milestone')}: ${pickRng(rnd, MILESTONE_TITLE_FRAGMENTS)} — ${msLabel}`,
            buildSeedTaskDescription(rnd, 'milestone', status, msLabel),
            assigneeMs,
            status,
            progress,
            prio,
            'milestone',
            'in_app',
            null,
            planStart,
            null,
            null,
            null,
            createdAtStr,
            dev.id,
            pickSeedTaskUpdatedById(rnd, status, peerAudit, taskUpdatePeersP1),
          ])
          await batchTasks.maybeFlush()
          continue
        }

        const ticketId = `P1-${taskSeqP1++}`
        const prio = pickWeightedRng(rnd, TASK_PRIORITY_WEIGHTS)
        const status = (statusWeightsFiltered.length ? pickWeightedRng(rnd, statusWeightsFiltered) : 'done') as SimTaskStatus
        const progress = progressForSimStatus(status, rnd)
        const planned = planTaskDates({
          anchorDay: seedPlanAnchorDay(day, t),
          status,
          typ,
          joinDate: joinDateP1,
          lateTaskPercent: dev.lateTaskPercent,
          rnd,
          taskOrdinal: t,
        })
        const { actStart, actEnd, planEnd, planStart, isLate } = planned
        tasksOverdueOpenedToday += seedOverdueOpenedForTask(status, planEnd, dateStr)

        acc.tasks++
        if (status === 'done') {
          doneToday++
          if (!isLate) onTimeDoneToday++
          if (isLate) acc.late++
          else if (rnd() * 100 < 20) acc.early++
          else acc.onTime++
          if (typ === 'bug') acc.bugDone++
          else if (typ === 'feature') acc.featureDone++
          if (prio === 'critical') acc.criticalDone++
        }
        const createdAtStr = status === 'new' || (status === 'cancelled' && !actStart) ? `${dateStr} 09:00:00` : actStart ? `${actStart} 09:30:00` : `${dateStr} 09:00:00`
        batchTasks.add([
          taskId,
          project1Id,
          `${seedTaskTitlePrefix(typ)}: ${pickRng(rnd, TASK_TITLE_FRAGMENTS)} — ${ticketId}`,
          buildSeedTaskDescription(rnd, typ, status, ticketId),
          dev.id,
          status,
          progress,
          prio,
          typ,
          'in_app',
          ticketId,
          planStart,
          planEnd,
          actStart,
          actEnd,
          createdAtStr,
          dev.id,
          pickSeedTaskUpdatedById(rnd, status, dev.id, taskUpdatePeersP1),
        ])
        await batchTasks.maybeFlush()
        registerPlanWindow(dev.id, planStart, planEnd)
      }

      const baseCommits = commitFactor === 0 ? 0 : randBetweenRng(rnd, cfg.commitsPerDay[0], cfg.commitsPerDay[1])
      let numCommits: number
      if (commitFactor === 0) numCommits = 0
      else if (dev.commitVariance === 'stable') numCommits = Math.max(0, Math.round(baseCommits * scale * monFactor * commitFactor))
      else if (dev.commitVariance === 'burst')
        numCommits = rnd() < 0.2 ? randBetweenRng(rnd, 0, 2) : Math.max(0, Math.round(baseCommits * scale * monFactor * commitFactor * (0.8 + rnd() * 0.5)))
      else numCommits = rnd() < 0.15 ? randBetweenRng(rnd, 0, 1) : Math.max(0, Math.round(baseCommits * scale * monFactor * commitFactor * (1 + rnd() * 1.5)))
      const commitDayJitter = 0.82 + rnd() * 0.28
      numCommits = Math.max(0, Math.round(numCommits * commitDayJitter))
      if (dev.activityMode === 'tasks_only') numCommits = 0
      const isWorkDayCommits = !(taskFactor === 0 && commitFactor === 0)
      const radarDayKey = `${dev.id}-${dayIdx}`
      if (isWorkDayCommits && numCommits > 0) {
        if (!radarCommitDayDecision.has(radarDayKey)) {
          const pNc = Math.min(0.42, Math.max(0.02, PROFILE_NO_COMMIT_DAY_P[dev.profile] + radarNoCommitBoost(dev.id)))
          radarCommitDayDecision.set(radarDayKey, rnd() < pNc)
        }
        if (radarCommitDayDecision.get(radarDayKey)) numCommits = 0
      }
      acc.commits += numCommits
      const ruleP = PROFILE_RULE_CHECK_P[dev.profile]
      const spotP = PROFILE_SPOTBUGS_P[dev.profile]
      let commitRuleOk = 0
      let commitSpotOk = 0
      const commitHourPrefs = commitHourPrefsForDev(dev.id)
      const commitsForDay: { hash: string; msg: string }[] = []
      for (let c = 0; c < numCommits; c++) {
        const hash = randomUUID().replace(/-/g, '').slice(0, 40)
        const msg = `Fix ${pickRng(rnd, WORK_DESCRIPTIONS).split(',')[0]} - ${dateStr}`
        commitsForDay.push({ hash, msg })
        const dayCommits = committedByDay.get(dayIdx) ?? []
        dayCommits.push({ hash, path: pathP })
        committedByDay.set(dayIdx, dayCommits)
        const hour = pickCommitHour(c, commitHourPrefs, rnd)
        const commitTime = addHours(day, hour)
        const ins = randBetweenRng(rnd, 20, 150)
        const del = randBetweenRng(rnd, 5, 80)
        const chg = randBetweenRng(rnd, 25, 200)
        const filesChg = randBetweenRng(rnd, 3, 25)
        acc.insertions += ins
        acc.filesCommitted += filesChg
        const hasRule = rnd() < ruleP ? 1 : 0
        const hasSpot = rnd() < spotP ? 1 : 0
        if (hasRule) commitRuleOk++
        if (hasSpot) commitSpotOk++
        if (hasSpot) {
          if (rnd() < 0.9) acc.spotbugsClean++
          else acc.spotbugsFails++
        }
        batchCommits.add([hash, dev.email, toDateTimeStr(commitTime), msg, '[]', '[]', '[]', hasRule, hasSpot, null, ins, del, chg, pathP])
        await batchCommits.maybeFlush()
      }
      if (rnd() < 0.08) acc.pushes += randBetweenRng(rnd, 1, 3)
      if (rnd() < 0.05) acc.merges++
      if (rnd() < 0.06) acc.branches++
      if (rnd() < 0.03) acc.rebases++

      const isOffDay = taskFactor === 0 && commitFactor === 0
      const activeWbsP1 = lookupEvmWbsSegment(evmWbsSegmentsP1, dev.id, dateStr)
      const evmHours = isOffDay ? 0 : randBetweenRng(rnd, 6, 8)
      let evmPhaseP1: string
      let evmNote: string
      if (isOffDay) {
        evmPhaseP1 = activeWbsP1?.phase ?? pickEvmAcPhase(rnd)
        evmNote = dayType === 'business_trip' ? 'Công tác' : dayType === 'training' ? 'Training' : dayType === 'conference' ? 'Conference' : 'Nghỉ phép / Off'
      } else if (activeWbsP1) {
        evmPhaseP1 = activeWbsP1.phase
        evmNote = activeWbsP1.task
      } else {
        evmPhaseP1 = pickEvmAcPhase(rnd)
        evmNote = pickRng(rnd, WORK_DESCRIPTIONS)
      }
      const seg1 = activeWbsP1

      let doReport = streakTailDay || (commitsForDay.length > 0 && rnd() * 100 < cfg.reportPercent)
      if (doReport && !streakTailDay && commitsForDay.length > 0 && rnd() < PROFILE_SKIP_REPORT_DESPITE_COMMITS_P[dev.profile]) {
        doReport = false
      }
      if (dev.neverDailyReport) doReport = false
      else if (dev.breakReportSecondLastWorkingDay && wdLen >= 2 && dayIdx === wdLen - 2) doReport = false
      else if (dev.noReportLastWorkingDays != null && dev.noReportLastWorkingDays > 0 && dayIdx >= wdLen - dev.noReportLastWorkingDays) {
        doReport = false
      }
      if (doReport) {
        acc.reports++
        let set = reportedByUserDay.get(dev.id)
        if (!set) {
          set = new Set<number>()
          reportedByUserDay.set(dev.id, set)
        }
        set.add(dayIdx)
      }
      if (doReport) {
        const reportId = randomUUID()
        const selectedCommits = commitsForDay.map(co => ({
          revision: co.hash,
          message: co.msg,
          author: dev.email,
          date: toDateTimeStr(day),
          sourceFolderPath: pathP,
        }))
        queueSeedDailyReport(
          pendingDailyReportRows,
          pendingDailyReportDrsf,
          reportId,
          dev.id,
          JSON.stringify([project1Id]),
          dateStr,
          rnd() < 0.2 ? pickRng(rnd, REPORT_SHORT) : rnd() < 0.15 ? pickRng(rnd, REPORT_LONG) : pickRng(rnd, WORK_DESCRIPTIONS),
          JSON.stringify(selectedCommits),
          upsf?.id ?? null
        )
        pendingReportWorkload.push({
          userId: dev.id,
          reportDate: dateStr,
          projectId: project1Id,
        })
      }

      batchEvmAc.add([
        randomUUID(),
        project1Id,
        evmAcNoP1++,
        dateStr,
        evmPhaseP1,
        seg1?.category ?? null,
        seg1?.feature ?? null,
        seg1?.task ?? null,
        seg1?.planStart ?? null,
        seg1?.planEnd ?? null,
        seg1?.actualStart ?? null,
        seg1?.actualEnd ?? null,
        seg1 ? roundAcPercentDone01(seg1.percentDone) : null,
        dev.id,
        evmHours,
        evmNote,
      ])
      await batchEvmAc.maybeFlush()

      const linesIns = isOffDay ? 0 : randBetweenRng(rnd, 200, 800)
      const linesDel = isOffDay ? 0 : randBetweenRng(rnd, 50, 300)
      const filesChg = isOffDay ? 0 : randBetweenRng(rnd, 5, 30)
      batchSnapshots.add([
        randomUUID(),
        dev.id,
        dateStr,
        numCommits,
        linesIns,
        linesDel,
        filesChg,
        isOffDay ? 0 : commitRuleOk,
        isOffDay ? 0 : commitSpotOk,
        isOffDay ? 0 : numCommits,
        isOffDay ? 0 : doneToday,
        isOffDay ? 0 : onTimeDoneToday,
        isOffDay ? 0 : tasksOverdueOpenedToday,
        doReport ? 1 : 0,
        evmHours,
      ])
      await batchSnapshots.maybeFlush()
    }

    if (day >= project2Start) {
      for (let devIdx = 0; devIdx < devsP2.length; devIdx++) {
        const dev = devsP2[devIdx]
        if (dev.seedActivity === 'none') continue
        const joinDateP2 = effectiveJoinDate(dev, endDate, workingDays)
        if (day < joinDateP2) continue
        const upsf = upsfByUserP2.get(dev.id)
        if (!upsf) continue
        const pathP = pathP2
        const cfg = PROFILE_CONFIG[dev.profile]
        const scaleP2 = RANK_SCALE[dev.targetRank] ?? 1
        const dayTypeP2 = dayTypeByKey.get(`${dev.id}-${dayIdx}`) ?? 'normal'
        const effP2 = DAY_EFFECTS[dayTypeP2]
        const taskFactorP2 = effP2.taskFactor
        const commitFactorP2 = effP2.commitFactor
        const streakTailDayP2 = isStreakTailDay(dev, dayIdx, wdLen)
        const joinDayIdxP2 = joinDayIndex(dev, endDate, workingDays)
        const rampUpP2 = dayIdx - joinDayIdxP2 < 10 ? 0.6 : 1
        const dowP2 = getDay(day)
        const monFactorP2 = dowP2 === 1 ? 0.85 : dowP2 === 5 ? 1.15 : 1
        initAccum(dev.id)
        const acc = devStatsAccum.get(dev.id) ?? defaultAccum()
        const rndP2 = userDayRng(dev.id, dayIdx + 10000)
        const baseTasksP2 = taskFactorP2 === 0 ? 0 : randBetweenRng(rndP2, cfg.tasksPerDay[0], cfg.tasksPerDay[1])
        let numTasksP2 = Math.max(0, Math.round(baseTasksP2 * scaleP2 * rampUpP2 * monFactorP2 * taskFactorP2))
        if (dev.activityMode === 'commits_only') numTasksP2 = 0
        numTasksP2 = Math.min(numTasksP2, Math.max(0, SEED_MAX_TASKS_PER_USER_PER_DAY - countActiveOnDay(dev.id, dateStr)))
        const statusWeightsP2 = simTaskStatusWeights(cfg.donePercent, effP2.inProgressBias).filter(([, w]) => Number(w) > 0) as [string, number][]
        let doneTodayP2 = 0
        let onTimeDoneTodayP2 = 0
        let tasksOverdueOpenedTodayP2 = 0
        for (let t = 0; t < numTasksP2; t++) {
          const taskId = randomUUID()
          const typ = pickWeightedRng(rndP2, canSeedMilestone('p2', dev, devIdx, 0) ? TASK_TYPE_WEIGHTS_WITH_MILESTONE : TASK_TYPE_WEIGHTS)

          if (typ === 'milestone') {
            const msLabel = `MS-P2-${milestoneSeqP2++}`
            const planStart = pickMilestonePlanStartStr(workingDays, seedMilestoneDayIdx(dayIdx, t, wdLen), joinDateP2, rndP2)
            const prio = pickWeightedRng(rndP2, MILESTONE_PRIORITY_WEIGHTS)
            const status: SimTaskStatus = planStart < dateStr ? (rndP2() < 0.87 ? 'done' : 'new') : 'new'
            const progress = status === 'done' ? 100 : 0
            const assigneeMs = rndP2() < 0.72 ? null : dev.id
            tasksOverdueOpenedTodayP2 += seedOverdueOpenedForTask(status, null, dateStr)
            acc.tasks++
            if (status === 'done') {
              doneTodayP2++
              onTimeDoneTodayP2++
              if (rndP2() * 100 < 15) acc.early++
              else acc.onTime++
              if (prio === 'critical') acc.criticalDone++
            }
            const peerAuditP2 = assigneeMs ?? dev.id
            const createdAtMsP2 = `${dateStr} 10:00:00`
            batchTasks.add([
              taskId,
              project2Id,
              `${seedTaskTitlePrefix('milestone')}: ${pickRng(rndP2, MILESTONE_TITLE_FRAGMENTS)} — ${msLabel}`,
              buildSeedTaskDescription(rndP2, 'milestone', status, msLabel),
              assigneeMs,
              status,
              progress,
              prio,
              'milestone',
              'in_app',
              null,
              planStart,
              null,
              null,
              null,
              createdAtMsP2,
              dev.id,
              pickSeedTaskUpdatedById(rndP2, status, peerAuditP2, taskUpdatePeersP2),
            ])
            await batchTasks.maybeFlush()
            continue
          }

          const ticketId = `P2-${taskSeqP2++}`
          const prio = pickWeightedRng(rndP2, TASK_PRIORITY_WEIGHTS)
          const status = (statusWeightsP2.length ? pickWeightedRng(rndP2, statusWeightsP2) : 'done') as SimTaskStatus
          const progress = progressForSimStatus(status, rndP2)
          const plannedP2 = planTaskDates({
            anchorDay: seedPlanAnchorDay(day, t),
            status,
            typ,
            joinDate: joinDateP2,
            lateTaskPercent: dev.lateTaskPercent,
            rnd: rndP2,
            taskOrdinal: t,
          })
          const { actStart, actEnd: actEndP2, planEnd: planEndP2, planStart: planStartP2, isLate: isLateP2 } = plannedP2
          tasksOverdueOpenedTodayP2 += seedOverdueOpenedForTask(status, planEndP2, dateStr)

          acc.tasks++
          if (status === 'done') {
            doneTodayP2++
            if (!isLateP2) onTimeDoneTodayP2++
            if (isLateP2) acc.late++
            else if (rndP2() * 100 < 20) acc.early++
            else acc.onTime++
            if (typ === 'bug') acc.bugDone++
            else if (typ === 'feature') acc.featureDone++
            if (prio === 'critical') acc.criticalDone++
          }
          const createdAtP2 = status === 'new' || (status === 'cancelled' && !actStart) ? `${dateStr} 09:00:00` : actStart ? `${actStart} 09:30:00` : `${dateStr} 09:00:00`
          batchTasks.add([
            taskId,
            project2Id,
            `${seedTaskTitlePrefix(typ)}: ${pickRng(rndP2, TASK_TITLE_FRAGMENTS)} — ${ticketId}`,
            buildSeedTaskDescription(rndP2, typ, status, ticketId),
            dev.id,
            status,
            progress,
            prio,
            typ,
            'in_app',
            ticketId,
            planStartP2,
            planEndP2,
            actStart,
            actEndP2,
            createdAtP2,
            dev.id,
            pickSeedTaskUpdatedById(rndP2, status, dev.id, taskUpdatePeersP2),
          ])
          await batchTasks.maybeFlush()
          registerPlanWindow(dev.id, planStartP2, planEndP2)
        }

        const baseCommitsP2 = commitFactorP2 === 0 ? 0 : randBetweenRng(rndP2, cfg.commitsPerDay[0], cfg.commitsPerDay[1])
        let numCommitsP2: number
        if (commitFactorP2 === 0) numCommitsP2 = 0
        else if (dev.commitVariance === 'stable') numCommitsP2 = Math.max(0, Math.round(baseCommitsP2 * scaleP2 * monFactorP2 * commitFactorP2))
        else if (dev.commitVariance === 'burst')
          numCommitsP2 = rndP2() < 0.2 ? randBetweenRng(rndP2, 0, 2) : Math.max(0, Math.round(baseCommitsP2 * scaleP2 * monFactorP2 * commitFactorP2 * (0.8 + rndP2() * 0.5)))
        else numCommitsP2 = rndP2() < 0.15 ? randBetweenRng(rndP2, 0, 1) : Math.max(0, Math.round(baseCommitsP2 * scaleP2 * monFactorP2 * commitFactorP2 * (1 + rndP2() * 1.5)))
        const commitDayJitterP2 = 0.82 + rndP2() * 0.28
        numCommitsP2 = Math.max(0, Math.round(numCommitsP2 * commitDayJitterP2))
        if (dev.activityMode === 'tasks_only') numCommitsP2 = 0
        const isWorkP2 = !(taskFactorP2 === 0 && commitFactorP2 === 0)
        const radarDayKeyP2 = `${dev.id}-${dayIdx}`
        if (isWorkP2 && numCommitsP2 > 0) {
          if (radarCommitDayDecision.has(radarDayKeyP2)) {
            if (radarCommitDayDecision.get(radarDayKeyP2)) numCommitsP2 = 0
          } else {
            const pNc = Math.min(0.42, Math.max(0.02, PROFILE_NO_COMMIT_DAY_P[dev.profile] + radarNoCommitBoost(dev.id)))
            radarCommitDayDecision.set(radarDayKeyP2, rndP2() < pNc)
            if (radarCommitDayDecision.get(radarDayKeyP2)) numCommitsP2 = 0
          }
        }
        acc.commits += numCommitsP2
        const ruleP2 = PROFILE_RULE_CHECK_P[dev.profile]
        const spotP2 = PROFILE_SPOTBUGS_P[dev.profile]
        let commitRuleOkP2 = 0
        let commitSpotOkP2 = 0
        const commitHourPrefsP2 = commitHourPrefsForDev(dev.id)
        const commitsForDayP2: { hash: string; msg: string }[] = []
        for (let c = 0; c < numCommitsP2; c++) {
          const hash = randomUUID().replace(/-/g, '').slice(0, 40)
          const msg = `Fix ${pickRng(rndP2, WORK_DESCRIPTIONS).split(',')[0]} - ${dateStr}`
          commitsForDayP2.push({ hash, msg })
          const hourP2 = pickCommitHour(c, commitHourPrefsP2, rndP2)
          const commitTimeP2 = addHours(day, hourP2)
          const insP2 = randBetweenRng(rndP2, 20, 150)
          const delP2 = randBetweenRng(rndP2, 5, 80)
          const chgP2 = randBetweenRng(rndP2, 25, 200)
          acc.insertions += insP2
          acc.filesCommitted += randBetweenRng(rndP2, 3, 25)
          const hasRuleP2 = rndP2() < ruleP2 ? 1 : 0
          const hasSpotP2 = rndP2() < spotP2 ? 1 : 0
          if (hasRuleP2) commitRuleOkP2++
          if (hasSpotP2) commitSpotOkP2++
          if (hasSpotP2) {
            if (rndP2() < 0.9) acc.spotbugsClean++
            else acc.spotbugsFails++
          }
          batchCommits.add([hash, dev.email, toDateTimeStr(commitTimeP2), msg, '[]', '[]', '[]', hasRuleP2, hasSpotP2, null, insP2, delP2, chgP2, pathP])
          await batchCommits.maybeFlush()
        }
        if (rndP2() < 0.08) acc.pushes += randBetweenRng(rndP2, 1, 3)
        if (rndP2() < 0.05) acc.merges++
        if (rndP2() < 0.06) acc.branches++
        if (rndP2() < 0.03) acc.rebases++

        const isOffDayP2 = taskFactorP2 === 0 && commitFactorP2 === 0
        const activeWbsP2 = lookupEvmWbsSegment(evmWbsSegmentsP2, dev.id, dateStr)
        const evmHoursP2 = isOffDayP2 ? 0 : randBetweenRng(rndP2, 6, 8)
        let evmPhaseP2: string
        let evmNoteP2: string
        if (isOffDayP2) {
          evmPhaseP2 = activeWbsP2?.phase ?? pickEvmAcPhase(rndP2)
          evmNoteP2 = dayTypeP2 === 'business_trip' ? 'Công tác' : dayTypeP2 === 'training' ? 'Training' : dayTypeP2 === 'conference' ? 'Conference' : 'Nghỉ / Off'
        } else if (activeWbsP2) {
          evmPhaseP2 = activeWbsP2.phase
          evmNoteP2 = activeWbsP2.task
        } else {
          evmPhaseP2 = pickEvmAcPhase(rndP2)
          evmNoteP2 = pickRng(rndP2, WORK_DESCRIPTIONS)
        }
        const seg2 = activeWbsP2

        let doReportP2 = streakTailDayP2 || (commitsForDayP2.length > 0 && rndP2() * 100 < cfg.reportPercent)
        if (doReportP2 && !streakTailDayP2 && commitsForDayP2.length > 0 && rndP2() < PROFILE_SKIP_REPORT_DESPITE_COMMITS_P[dev.profile]) {
          doReportP2 = false
        }
        if (dev.neverDailyReport) doReportP2 = false
        else if (dev.breakReportSecondLastWorkingDay && wdLen >= 2 && dayIdx === wdLen - 2) doReportP2 = false
        else if (dev.noReportLastWorkingDays != null && dev.noReportLastWorkingDays > 0 && dayIdx >= wdLen - dev.noReportLastWorkingDays) {
          doReportP2 = false
        }
        if (doReportP2) {
          // Only count once per day across all projects (shared P1+P2 users would otherwise double-count)
          const alreadyReportedToday = reportedByUserDay.get(dev.id)?.has(dayIdx) ?? false
          if (!alreadyReportedToday) acc.reports++
          let setP2 = reportedByUserDay.get(dev.id)
          if (!setP2) {
            setP2 = new Set<number>()
            reportedByUserDay.set(dev.id, setP2)
          }
          setP2.add(dayIdx)
        }
        if (doReportP2) {
          const reportId = randomUUID()
          const selectedCommits = commitsForDayP2.map(co => ({
            revision: co.hash,
            message: co.msg,
            author: dev.email,
            date: toDateTimeStr(day),
            sourceFolderPath: pathP,
          }))
          queueSeedDailyReport(
            pendingDailyReportRows,
            pendingDailyReportDrsf,
            reportId,
            dev.id,
            JSON.stringify([project2Id]),
            dateStr,
            rndP2() < 0.2 ? pickRng(rndP2, REPORT_SHORT) : rndP2() < 0.15 ? pickRng(rndP2, REPORT_LONG) : pickRng(rndP2, WORK_DESCRIPTIONS),
            JSON.stringify(selectedCommits),
            upsf.id
          )
          pendingReportWorkload.push({
            userId: dev.id,
            reportDate: dateStr,
            projectId: project2Id,
          })
        }

        batchEvmAc.add([
          randomUUID(),
          project2Id,
          evmAcNoP2++,
          dateStr,
          evmPhaseP2,
          seg2?.category ?? null,
          seg2?.feature ?? null,
          seg2?.task ?? null,
          seg2?.planStart ?? null,
          seg2?.planEnd ?? null,
          seg2?.actualStart ?? null,
          seg2?.actualEnd ?? null,
          seg2 ? roundAcPercentDone01(seg2.percentDone) : null,
          dev.id,
          evmHoursP2,
          evmNoteP2,
        ])
        await batchEvmAc.maybeFlush()

        const linesInsP2 = isOffDayP2 ? 0 : randBetweenRng(rndP2, 200, 800)
        const linesDelP2 = isOffDayP2 ? 0 : randBetweenRng(rndP2, 50, 300)
        const filesChgP2 = isOffDayP2 ? 0 : randBetweenRng(rndP2, 5, 30)
        const hasReport = doReportP2 ? 1 : 0
        const snapRuleP2 = isOffDayP2 ? 0 : commitRuleOkP2
        const snapSpotP2 = isOffDayP2 ? 0 : commitSpotOkP2
        const snapTotalCommitsP2 = isOffDayP2 ? 0 : numCommitsP2
        const snapDoneP2 = isOffDayP2 ? 0 : doneTodayP2
        const snapOnTimeP2 = isOffDayP2 ? 0 : onTimeDoneTodayP2
        const snapOverdueP2 = isOffDayP2 ? 0 : tasksOverdueOpenedTodayP2
        await query(
          `INSERT INTO user_daily_snapshots (
            id, user_id, snapshot_date, commits_count, lines_inserted, lines_deleted, files_changed,
            commits_with_rule_check, commits_with_spotbugs, commits_total_in_queue,
            tasks_done, tasks_done_on_time, tasks_overdue_opened, has_daily_report, evm_hours_logged
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
            commits_count = user_daily_snapshots.commits_count + EXCLUDED.commits_count,
            lines_inserted = user_daily_snapshots.lines_inserted + EXCLUDED.lines_inserted,
            lines_deleted = user_daily_snapshots.lines_deleted + EXCLUDED.lines_deleted,
            files_changed = user_daily_snapshots.files_changed + EXCLUDED.files_changed,
            commits_with_rule_check = user_daily_snapshots.commits_with_rule_check + EXCLUDED.commits_with_rule_check,
            commits_with_spotbugs = user_daily_snapshots.commits_with_spotbugs + EXCLUDED.commits_with_spotbugs,
            commits_total_in_queue = user_daily_snapshots.commits_total_in_queue + EXCLUDED.commits_total_in_queue,
            tasks_done = user_daily_snapshots.tasks_done + EXCLUDED.tasks_done,
            tasks_done_on_time = user_daily_snapshots.tasks_done_on_time + EXCLUDED.tasks_done_on_time,
            tasks_overdue_opened = user_daily_snapshots.tasks_overdue_opened + EXCLUDED.tasks_overdue_opened,
            has_daily_report = (GREATEST(user_daily_snapshots.has_daily_report::int, EXCLUDED.has_daily_report::int))::boolean,
            evm_hours_logged = user_daily_snapshots.evm_hours_logged + EXCLUDED.evm_hours_logged`,
          [
            randomUUID(),
            dev.id,
            dateStr,
            numCommitsP2,
            linesInsP2,
            linesDelP2,
            filesChgP2,
            snapRuleP2,
            snapSpotP2,
            snapTotalCommitsP2,
            snapDoneP2,
            snapOnTimeP2,
            snapOverdueP2,
            hasReport,
            evmHoursP2,
          ]
        )
      }
    }

    for (let tix = 0; tix < tinyTeamDevs.length; tix++) {
      const dev = tinyTeamDevs[tix]
      if (!dev || dev.seedActivity === 'none') continue
      const joinDateP3 = effectiveJoinDate(dev, endDate, workingDays)
      if (day < joinDateP3) continue
      const upsfT = upsfByUserP3.get(dev.id)
      if (!upsfT) continue
      const pathT = pathP3
      const cfgT = PROFILE_CONFIG[dev.profile]
      const scaleT = RANK_SCALE[dev.targetRank] ?? 1
      initAccum(dev.id)
      const accT = devStatsAccum.get(dev.id) ?? defaultAccum()
      const rndT = userDayRng(dev.id, dayIdx + 50000)
      const dayTypeT = dayTypeByKey.get(`${dev.id}-${dayIdx}`) ?? 'normal'
      const streakTailT = isStreakTailDay(dev, dayIdx, wdLen)
      const rampUpT = dayIdx - joinDayIndex(dev, endDate, workingDays) < 10 ? 0.6 : 1
      const dowT = getDay(day)
      const monFactorT = dowT === 1 ? 0.85 : dowT === 5 ? 1.15 : 1
      const effT = DAY_EFFECTS[dayTypeT]
      const taskFactorT = effT.taskFactor
      const commitFactorT = effT.commitFactor
      const baseTasksT = taskFactorT === 0 ? 0 : randBetweenRng(rndT, cfgT.tasksPerDay[0], cfgT.tasksPerDay[1])
      let numTasksT = Math.max(0, Math.round(baseTasksT * scaleT * rampUpT * monFactorT * taskFactorT))
      if (dev.activityMode === 'commits_only') numTasksT = 0
      numTasksT = Math.min(numTasksT, Math.max(0, SEED_MAX_TASKS_PER_USER_PER_DAY - countActiveOnDay(dev.id, dateStr)))
      const statusWeightsFilteredT = simTaskStatusWeights(cfgT.donePercent, effT.inProgressBias).filter(([, w]) => Number(w) > 0) as [string, number][]
      let doneTodayT = 0
      let onTimeDoneTodayT = 0
      let tasksOverdueOpenedTodayT = 0
      for (let t = 0; t < numTasksT; t++) {
        const taskId = randomUUID()
        const typ = pickWeightedRng(rndT, canSeedMilestone('p3', dev, 0, tix) ? TASK_TYPE_WEIGHTS_WITH_MILESTONE : TASK_TYPE_WEIGHTS)

        if (typ === 'milestone') {
          const msLabel = `MS-P3-${milestoneSeqP3++}`
          const planStart = pickMilestonePlanStartStr(workingDays, seedMilestoneDayIdx(dayIdx, t, wdLen), joinDateP3, rndT)
          const prio = pickWeightedRng(rndT, MILESTONE_PRIORITY_WEIGHTS)
          const status: SimTaskStatus = planStart < dateStr ? (rndT() < 0.87 ? 'done' : 'new') : 'new'
          const progress = status === 'done' ? 100 : 0
          const assigneeMs = rndT() < 0.72 ? null : dev.id
          tasksOverdueOpenedTodayT += seedOverdueOpenedForTask(status, null, dateStr)
          accT.tasks++
          if (status === 'done') {
            doneTodayT++
            onTimeDoneTodayT++
            if (rndT() * 100 < 15) accT.early++
            else accT.onTime++
            if (prio === 'critical') accT.criticalDone++
          }
          const peerAuditT = assigneeMs ?? dev.id
          const createdAtMsT = `${dateStr} 10:00:00`
          batchTasks.add([
            taskId,
            project3Id,
            `${seedTaskTitlePrefix('milestone')}: ${pickRng(rndT, MILESTONE_TITLE_FRAGMENTS)} — ${msLabel}`,
            buildSeedTaskDescription(rndT, 'milestone', status, msLabel),
            assigneeMs,
            status,
            progress,
            prio,
            'milestone',
            'in_app',
            null,
            planStart,
            null,
            null,
            null,
            createdAtMsT,
            dev.id,
            pickSeedTaskUpdatedById(rndT, status, peerAuditT, taskUpdatePeersP3),
          ])
          await batchTasks.maybeFlush()
          continue
        }

        const ticketId = `P3-${taskSeqP3++}`
        const prio = pickWeightedRng(rndT, TASK_PRIORITY_WEIGHTS)
        const status = (statusWeightsFilteredT.length ? pickWeightedRng(rndT, statusWeightsFilteredT) : 'done') as SimTaskStatus
        const progress = progressForSimStatus(status, rndT)
        const plannedT = planTaskDates({
          anchorDay: seedPlanAnchorDay(day, t),
          status,
          typ,
          joinDate: joinDateP3,
          lateTaskPercent: dev.lateTaskPercent,
          rnd: rndT,
          taskOrdinal: t,
        })
        const { actStart, actEnd, planEnd, planStart: planStartT, isLate } = plannedT
        tasksOverdueOpenedTodayT += seedOverdueOpenedForTask(status, planEnd, dateStr)
        accT.tasks++
        if (status === 'done') {
          doneTodayT++
          if (!isLate) onTimeDoneTodayT++
          if (isLate) accT.late++
          else if (rndT() * 100 < 20) accT.early++
          else accT.onTime++
          if (typ === 'bug') accT.bugDone++
          else if (typ === 'feature') accT.featureDone++
          if (prio === 'critical') accT.criticalDone++
        }
        const createdAtT = status === 'new' || (status === 'cancelled' && !actStart) ? `${dateStr} 09:00:00` : actStart ? `${actStart} 09:30:00` : `${dateStr} 09:00:00`
        batchTasks.add([
          taskId,
          project3Id,
          `${seedTaskTitlePrefix(typ)}: ${pickRng(rndT, TASK_TITLE_FRAGMENTS)} — ${ticketId}`,
          buildSeedTaskDescription(rndT, typ, status, ticketId),
          dev.id,
          status,
          progress,
          prio,
          typ,
          'in_app',
          ticketId,
          planStartT,
          planEnd,
          actStart,
          actEnd,
          createdAtT,
          dev.id,
          pickSeedTaskUpdatedById(rndT, status, dev.id, taskUpdatePeersP3),
        ])
        await batchTasks.maybeFlush()
        registerPlanWindow(dev.id, planStartT, planEnd)
      }
      const baseCommitsT = commitFactorT === 0 ? 0 : randBetweenRng(rndT, cfgT.commitsPerDay[0], cfgT.commitsPerDay[1])
      let numCommitsT: number
      if (commitFactorT === 0) numCommitsT = 0
      else if (dev.commitVariance === 'stable') numCommitsT = Math.max(0, Math.round(baseCommitsT * scaleT * monFactorT * commitFactorT))
      else if (dev.commitVariance === 'burst')
        numCommitsT = rndT() < 0.2 ? randBetweenRng(rndT, 0, 2) : Math.max(0, Math.round(baseCommitsT * scaleT * monFactorT * commitFactorT * (0.8 + rndT() * 0.5)))
      else numCommitsT = rndT() < 0.15 ? randBetweenRng(rndT, 0, 1) : Math.max(0, Math.round(baseCommitsT * scaleT * monFactorT * commitFactorT * (1 + rndT() * 1.5)))
      numCommitsT = Math.max(0, Math.round(numCommitsT * (0.82 + rndT() * 0.28)))
      if (dev.activityMode === 'tasks_only') numCommitsT = 0
      const isWorkT = !(taskFactorT === 0 && commitFactorT === 0)
      const radarKeyT = `${dev.id}-${dayIdx}`
      if (isWorkT && numCommitsT > 0) {
        if (!radarCommitDayDecision.has(radarKeyT)) {
          const pNc = Math.min(0.42, Math.max(0.02, PROFILE_NO_COMMIT_DAY_P[dev.profile] + radarNoCommitBoost(dev.id)))
          radarCommitDayDecision.set(radarKeyT, rndT() < pNc)
        }
        if (radarCommitDayDecision.get(radarKeyT)) numCommitsT = 0
      }
      accT.commits += numCommitsT
      const rulePT = PROFILE_RULE_CHECK_P[dev.profile]
      const spotPT = PROFILE_SPOTBUGS_P[dev.profile]
      let commitRuleOkT = 0
      let commitSpotOkT = 0
      const commitHourPrefsT = commitHourPrefsForDev(dev.id)
      const commitsForDayT: { hash: string; msg: string }[] = []
      for (let c = 0; c < numCommitsT; c++) {
        const hash = randomUUID().replace(/-/g, '').slice(0, 40)
        const msg = `Tiny ${pickRng(rndT, WORK_DESCRIPTIONS).split(',')[0]} - ${dateStr}`
        commitsForDayT.push({ hash, msg })
        const dayC = committedByDay.get(dayIdx) ?? []
        dayC.push({ hash, path: pathT })
        committedByDay.set(dayIdx, dayC)
        const hourT = pickCommitHour(c, commitHourPrefsT, rndT)
        const commitTimeT = addHours(day, hourT)
        const insT = randBetweenRng(rndT, 20, 150)
        const delT = randBetweenRng(rndT, 5, 80)
        const chgT = randBetweenRng(rndT, 25, 200)
        accT.insertions += insT
        accT.filesCommitted += randBetweenRng(rndT, 3, 25)
        const hasRuleT = rndT() < rulePT ? 1 : 0
        const hasSpotT = rndT() < spotPT ? 1 : 0
        if (hasRuleT) commitRuleOkT++
        if (hasSpotT) commitSpotOkT++
        if (hasSpotT) {
          if (rndT() < 0.9) accT.spotbugsClean++
          else accT.spotbugsFails++
        }
        batchCommits.add([hash, dev.email, toDateTimeStr(commitTimeT), msg, '[]', '[]', '[]', hasRuleT, hasSpotT, null, insT, delT, chgT, pathT])
        await batchCommits.maybeFlush()
      }
      const isOffT = taskFactorT === 0 && commitFactorT === 0
      const activeWbsP3 = lookupEvmWbsSegment(evmWbsSegmentsP3, dev.id, dateStr)
      const evmHoursT = isOffT ? 0 : randBetweenRng(rndT, 6, 8)
      let evmPhaseP3: string
      let evmNoteT: string
      if (isOffT) {
        evmPhaseP3 = activeWbsP3?.phase ?? pickEvmAcPhase(rndT)
        evmNoteT = 'Nghỉ / Off'
      } else if (activeWbsP3) {
        evmPhaseP3 = activeWbsP3.phase
        evmNoteT = activeWbsP3.task
      } else {
        evmPhaseP3 = pickEvmAcPhase(rndT)
        evmNoteT = pickRng(rndT, WORK_DESCRIPTIONS)
      }
      const seg3 = activeWbsP3

      let doReportT = streakTailT || (commitsForDayT.length > 0 && rndT() * 100 < cfgT.reportPercent)
      if (doReportT && !streakTailT && commitsForDayT.length > 0 && rndT() < PROFILE_SKIP_REPORT_DESPITE_COMMITS_P[dev.profile]) {
        doReportT = false
      }
      if (dev.neverDailyReport) doReportT = false
      else if (dev.breakReportSecondLastWorkingDay && wdLen >= 2 && dayIdx === wdLen - 2) doReportT = false
      else if (dev.noReportLastWorkingDays != null && dev.noReportLastWorkingDays > 0 && dayIdx >= wdLen - dev.noReportLastWorkingDays) {
        doReportT = false
      }
      if (doReportT) {
        accT.reports++
        let rs = reportedByUserDay.get(dev.id)
        if (!rs) {
          rs = new Set<number>()
          reportedByUserDay.set(dev.id, rs)
        }
        rs.add(dayIdx)
      }
      if (doReportT) {
        const reportIdT = randomUUID()
        const selT = commitsForDayT.map(co => ({
          revision: co.hash,
          message: co.msg,
          author: dev.email,
          date: toDateTimeStr(day),
          sourceFolderPath: pathT,
        }))
        queueSeedDailyReport(
          pendingDailyReportRows,
          pendingDailyReportDrsf,
          reportIdT,
          dev.id,
          JSON.stringify([project3Id]),
          dateStr,
          rndT() < 0.2 ? pickRng(rndT, REPORT_SHORT) : pickRng(rndT, WORK_DESCRIPTIONS),
          JSON.stringify(selT),
          upsfT.id
        )
        pendingReportWorkload.push({
          userId: dev.id,
          reportDate: dateStr,
          projectId: project3Id,
        })
      }
      batchEvmAc.add([
        randomUUID(),
        project3Id,
        evmAcNoP3++,
        dateStr,
        evmPhaseP3,
        seg3?.category ?? null,
        seg3?.feature ?? null,
        seg3?.task ?? null,
        seg3?.planStart ?? null,
        seg3?.planEnd ?? null,
        seg3?.actualStart ?? null,
        seg3?.actualEnd ?? null,
        seg3 ? roundAcPercentDone01(seg3.percentDone) : null,
        dev.id,
        evmHoursT,
        evmNoteT,
      ])
      await batchEvmAc.maybeFlush()
      const linesInsT = isOffT ? 0 : randBetweenRng(rndT, 200, 800)
      const linesDelT = isOffT ? 0 : randBetweenRng(rndT, 50, 300)
      const filesChgSnapT = isOffT ? 0 : randBetweenRng(rndT, 5, 30)
      batchSnapshots.add([
        randomUUID(),
        dev.id,
        dateStr,
        numCommitsT,
        linesInsT,
        linesDelT,
        filesChgSnapT,
        isOffT ? 0 : commitRuleOkT,
        isOffT ? 0 : commitSpotOkT,
        isOffT ? 0 : numCommitsT,
        isOffT ? 0 : doneTodayT,
        isOffT ? 0 : onTimeDoneTodayT,
        isOffT ? 0 : tasksOverdueOpenedTodayT,
        doReportT ? 1 : 0,
        evmHoursT,
      ])
      await batchSnapshots.maybeFlush()
    }

    await flushPendingDailyReports()
  }

  await batchTasks.flush()
  await batchCommits.flush()
  await batchEvmAc.flush()
  await batchSnapshots.flush()
  console.log('Batch inserts flushed')

  await query('UPDATE task_ticket_sequences SET next_value = GREATEST(next_value, ?) WHERE project_id = ? AND source = ?', [taskSeqP1 + 1, project1Id, 'in_app'])
  await query('UPDATE task_ticket_sequences SET next_value = GREATEST(next_value, ?) WHERE project_id = ? AND source = ?', [taskSeqP2 + 1, project2Id, 'in_app'])
  await query('UPDATE task_ticket_sequences SET next_value = GREATEST(next_value, ?) WHERE project_id = ? AND source = ?', [taskSeqP3 + 1, project3Id, 'in_app'])

  // Tasks để test notification deadline (dev mở app thấy task sắp/bị quá hạn)
  const todayStr = toDateStr(endDate)
  const tomorrowStr = toDateStr(addDays(endDate, 1))
  const yesterdayStr = toDateStr(addDays(endDate, -1))
  const deadlineTestDevs = devsP1.slice(0, 4)
  for (let i = 0; i < 3; i++) {
    const dev = deadlineTestDevs[i % deadlineTestDevs.length]
    const dtId = `P1-DT${i + 1}`
    const dtTyp = pickWeighted(TASK_TYPE_WEIGHTS)
    await query(
      `INSERT INTO tasks (id, project_id, title, description, assignee_user_id, status, progress, priority, type, source, ticket_id, plan_start_date, plan_end_date, actual_start_date, created_by, updated_by, version)
       VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, 'in_app', ?, ?, ?, ?, ?, ?, 1)`,
      [
        randomUUID(),
        project1Id,
        `[DEADLINE TODAY] Bug fix ${i + 1}`,
        buildSeedTaskDescription(seedGlobalRand, dtTyp, 'in_progress', dtId),
        dev.id,
        randBetween(30, 80),
        pickWeighted(TASK_PRIORITY_WEIGHTS),
        dtTyp,
        dtId,
        toDateStr(addDays(endDate, -7)),
        todayStr,
        yesterdayStr,
        dev.id,
        pickSeedTaskUpdatedById(seedGlobalRand, 'in_progress', dev.id, taskUpdatePeersP1),
      ]
    )
  }
  for (let i = 0; i < 3; i++) {
    const dev = deadlineTestDevs[(i + 1) % deadlineTestDevs.length]
    const dmId = `P1-DM${i + 1}`
    const dmTyp = pickWeighted(TASK_TYPE_WEIGHTS)
    await query(
      `INSERT INTO tasks (id, project_id, title, description, assignee_user_id, status, progress, priority, type, source, ticket_id, plan_start_date, plan_end_date, actual_start_date, created_by, updated_by, version)
       VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, 'in_app', ?, ?, ?, ?, ?, ?, 1)`,
      [
        randomUUID(),
        project1Id,
        `[DEADLINE TOMORROW] Feature ${i + 1}`,
        buildSeedTaskDescription(seedGlobalRand, dmTyp, 'in_progress', dmId),
        dev.id,
        randBetween(20, 60),
        pickWeighted(TASK_PRIORITY_WEIGHTS),
        dmTyp,
        dmId,
        toDateStr(addDays(endDate, -5)),
        tomorrowStr,
        todayStr,
        dev.id,
        pickSeedTaskUpdatedById(seedGlobalRand, 'in_progress', dev.id, taskUpdatePeersP1),
      ]
    )
  }
  for (let i = 0; i < 2; i++) {
    const dev = deadlineTestDevs[i % deadlineTestDevs.length]
    const ovId = `P1-OV${i + 1}`
    const ovTyp = pickWeighted(TASK_TYPE_WEIGHTS)
    await query(
      `INSERT INTO tasks (id, project_id, title, description, assignee_user_id, status, progress, priority, type, source, ticket_id, plan_start_date, plan_end_date, actual_start_date, created_by, updated_by, version)
       VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, 'in_app', ?, ?, ?, ?, ?, ?, 1)`,
      [
        randomUUID(),
        project1Id,
        `[OVERDUE] Task quá hạn ${i + 1}`,
        buildSeedTaskDescription(seedGlobalRand, ovTyp, 'in_progress', ovId),
        dev.id,
        randBetween(50, 90),
        pickWeighted(TASK_PRIORITY_WEIGHTS),
        ovTyp,
        ovId,
        toDateStr(addDays(endDate, -14)),
        yesterdayStr,
        toDateStr(addDays(endDate, -3)),
        dev.id,
        pickSeedTaskUpdatedById(seedGlobalRand, 'in_progress', dev.id, taskUpdatePeersP1),
      ]
    )
  }
  console.log('Deadline test tasks inserted (today, tomorrow, overdue)')

  // Tasks in_review để PL test notification "cần review" (dev1 = PL P1 & P2)
  const plReviewTaskIds: string[] = []
  for (let i = 0; i < 4; i++) {
    const assignee = devsP1[i + 1] ?? devsP1[1]
    const taskId = randomUUID()
    plReviewTaskIds.push(taskId)
    const rv1 = `P1-RV${i + 1}`
    const rv1Typ = pickWeighted(TASK_TYPE_WEIGHTS)
    await query(
      `INSERT INTO tasks (id, project_id, title, description, assignee_user_id, status, progress, priority, type, source, ticket_id, plan_start_date, plan_end_date, created_by, updated_by, version)
       VALUES (?, ?, ?, ?, ?, 'in_review', 90, ?, ?, 'in_app', ?, ?, ?, ?, ?, 1)`,
      [
        taskId,
        project1Id,
        `[CẦN REVIEW] Task P1 chờ PL duyệt ${i + 1}`,
        buildSeedTaskDescription(seedGlobalRand, rv1Typ, 'in_review', rv1),
        assignee.id,
        pickWeighted(TASK_PRIORITY_WEIGHTS),
        rv1Typ,
        rv1,
        toDateStr(addDays(endDate, -8)),
        tomorrowStr,
        assignee.id,
        pickSeedTaskUpdatedById(seedGlobalRand, 'in_review', assignee.id, taskUpdatePeersP1),
      ]
    )
  }
  for (let i = 0; i < 2; i++) {
    const assignee = devsP2[i + 1] ?? devsP2[1]
    const taskId = randomUUID()
    plReviewTaskIds.push(taskId)
    const rv2 = `P2-RV${i + 1}`
    const rv2Typ = pickWeighted(TASK_TYPE_WEIGHTS)
    await query(
      `INSERT INTO tasks (id, project_id, title, description, assignee_user_id, status, progress, priority, type, source, ticket_id, plan_start_date, plan_end_date, created_by, updated_by, version)
       VALUES (?, ?, ?, ?, ?, 'in_review', 85, ?, ?, 'in_app', ?, ?, ?, ?, ?, 1)`,
      [
        taskId,
        project2Id,
        `[CẦN REVIEW] Task P2 chờ PL duyệt ${i + 1}`,
        buildSeedTaskDescription(seedGlobalRand, rv2Typ, 'in_review', rv2),
        assignee.id,
        pickWeighted(TASK_PRIORITY_WEIGHTS),
        rv2Typ,
        rv2,
        toDateStr(addDays(endDate, -8)),
        tomorrowStr,
        assignee.id,
        pickSeedTaskUpdatedById(seedGlobalRand, 'in_review', assignee.id, taskUpdatePeersP2),
      ]
    )
  }
  if (plReviewTaskIds.length >= 2) {
    await query(`UPDATE tasks SET updated_at = NOW() - INTERVAL '4 days' WHERE id IN (?, ?)`, [plReviewTaskIds[0], plReviewTaskIds[1]])
  }
  console.log('PL review test tasks inserted (in_review, 2 long unreviewed)')

  // Gantt: epic (root) + subtask (parent_id) + link blocks (FS) lịch nối tiếp — vẽ cây và mũi tên trên board.
  {
    const pickActive = (devs: DevUser[]) => devs.find(x => x.seedActivity !== 'none') ?? devs[0]
    const leadP1 = pickActive(devsP1)
    const mateP1 = devsP1.find(x => x.id !== leadP1.id && x.seedActivity !== 'none') ?? leadP1
    const leadP2 = pickActive(devsP2)
    const mateP2 = devsP2.find(x => x.id !== leadP2.id && x.seedActivity !== 'none') ?? leadP2
    const tinyLeadG = pickActive(tinyTeamDevs)
    const tinyMateG = tinyTeamDevs.find(x => x.id !== tinyLeadG.id && x.seedActivity !== 'none') ?? tinyLeadG
    const wdLen = workingDays.length
    if (wdLen >= 36) {
      const iBase = Math.min(wdLen - 34, Math.max(6, Math.floor(wdLen * 0.28)))
      const dayAt = (off: number) => workingDays[Math.min(Math.max(0, iBase + off), wdLen - 1)]

      const insGanttTask = async (
        id: string,
        proj: string,
        title: string,
        ticket: string,
        assignee: string,
        pStart: Date,
        pEnd: Date,
        parentId: string | null,
        progress: number,
        typ: string,
        peers: string[]
      ) => {
        const ps = toDateStr(pStart)
        const pe = toDateStr(pEnd)
        await query(
          `INSERT INTO tasks (id, project_id, title, description, assignee_user_id, status, progress, priority, type, source, ticket_id, plan_start_date, plan_end_date, actual_start_date, actual_end_date, created_by, updated_by, parent_id, version)
           VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, 'in_app', ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            id,
            proj,
            title,
            buildSeedTaskDescription(seedGlobalRand, typ, 'in_progress', ticket),
            assignee,
            progress,
            pickWeighted(TASK_PRIORITY_WEIGHTS),
            typ,
            ticket,
            ps,
            pe,
            ps,
            null,
            assignee,
            pickSeedTaskUpdatedById(seedGlobalRand, 'in_progress', assignee, peers),
            parentId,
          ]
        )
      }

      const insGanttDoneTask = async (
        id: string,
        proj: string,
        title: string,
        ticket: string,
        assignee: string,
        pStart: Date,
        pEnd: Date,
        parentId: string | null,
        progress: number,
        typ: string,
        peers: string[]
      ) => {
        const ps = toDateStr(pStart)
        const pe = toDateStr(pEnd)
        await query(
          `INSERT INTO tasks (id, project_id, title, description, assignee_user_id, status, progress, priority, type, source, ticket_id, plan_start_date, plan_end_date, actual_start_date, actual_end_date, created_by, updated_by, parent_id, version)
           VALUES (?, ?, ?, ?, ?, 'done', ?, ?, ?, 'in_app', ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            id,
            proj,
            title,
            buildSeedTaskDescription(seedGlobalRand, typ, 'done', ticket),
            assignee,
            progress,
            pickWeighted(TASK_PRIORITY_WEIGHTS),
            typ,
            ticket,
            ps,
            pe,
            ps,
            pe,
            assignee,
            pickSeedTaskUpdatedById(seedGlobalRand, 'done', assignee, peers),
            parentId,
          ]
        )
      }

      const linkSafe = async (fromId: string, toId: string, linkType: 'blocks' | 'relates_to' | 'blocked_by') => {
        await query('INSERT INTO task_links (id, from_task_id, to_task_id, link_type) VALUES (?, ?, ?, ?) ON CONFLICT (from_task_id, to_task_id, link_type) DO NOTHING', [
          randomUUID(),
          fromId,
          toId,
          linkType,
        ])
      }

      const epic1 = randomUUID()
      const epic2 = randomUUID()
      const epic3 = randomUUID()
      const e1c1 = randomUUID()
      const e1c2 = randomUUID()
      const e1c3 = randomUUID()
      const e2c1 = randomUUID()
      const e2c2 = randomUUID()
      const e3c1 = randomUUID()
      const e3c2 = randomUUID()

      const e1s1Prog = 100
      const e1s2Prog = 100
      const e1s3Prog = 80
      const e1Prog = Math.round((e1s1Prog + e1s2Prog + e1s3Prog) / 3)
      await insGanttTask(epic1, project1Id, '[GANTT] Epic: Checkout & payment refactor', 'P1-GANTT-E1', leadP1.id, dayAt(0), dayAt(9), null, e1Prog, 'feature', taskUpdatePeersP1)
      await insGanttDoneTask(e1c1, project1Id, '[GANTT] Sub: API contract & error mapping', 'P1-GANTT-E1-S1', mateP1.id, dayAt(0), dayAt(3), epic1, 100, 'task', taskUpdatePeersP1)
      await insGanttDoneTask(
        e1c2,
        project1Id,
        '[GANTT] Sub: Service implementation & tests',
        'P1-GANTT-E1-S2',
        leadP1.id,
        dayAt(4),
        dayAt(7),
        epic1,
        100,
        'feature',
        taskUpdatePeersP1
      )
      await insGanttTask(e1c3, project1Id, '[GANTT] Sub: Feature flag & telemetry', 'P1-GANTT-E1-S3', mateP1.id, dayAt(8), dayAt(9), epic1, e1s3Prog, 'task', taskUpdatePeersP1)

      const e2s1Prog = 58
      const e2s2Prog = 34
      const e2Prog = Math.round((e2s1Prog + e2s2Prog) / 2)
      await insGanttTask(epic2, project1Id, '[GANTT] Epic: Fraud rules engine', 'P1-GANTT-E2', mateP1.id, dayAt(11), dayAt(20), null, e2Prog, 'feature', taskUpdatePeersP1)
      await insGanttTask(e2c1, project1Id, '[GANTT] Sub: Rule DSL & validation', 'P1-GANTT-E2-S1', leadP1.id, dayAt(11), dayAt(15), epic2, e2s1Prog, 'feature', taskUpdatePeersP1)
      await insGanttTask(e2c2, project1Id, '[GANTT] Sub: Evaluation & rollout', 'P1-GANTT-E2-S2', mateP1.id, dayAt(16), dayAt(20), epic2, e2s2Prog, 'task', taskUpdatePeersP1)

      const e3s1Prog = 22
      const e3s2Prog = 8
      const e3Prog = Math.round((e3s1Prog + e3s2Prog) / 2)
      await insGanttTask(epic3, project1Id, '[GANTT] Epic: Admin reconciliations UI', 'P1-GANTT-E3', leadP1.id, dayAt(22), dayAt(31), null, e3Prog, 'feature', taskUpdatePeersP1)
      await insGanttTask(
        e3c1,
        project1Id,
        '[GANTT] Sub: Grid, filters, bulk actions',
        'P1-GANTT-E3-S1',
        mateP1.id,
        dayAt(22),
        dayAt(26),
        epic3,
        e3s1Prog,
        'feature',
        taskUpdatePeersP1
      )
      await insGanttTask(e3c2, project1Id, '[GANTT] Sub: Export & audit trail', 'P1-GANTT-E3-S2', leadP1.id, dayAt(27), dayAt(31), epic3, e3s2Prog, 'task', taskUpdatePeersP1)

      await linkSafe(epic1, epic2, 'blocks')
      await linkSafe(epic2, epic3, 'blocks')
      await linkSafe(e1c2, e2c1, 'relates_to')

      const epic4 = randomUUID()
      const e4c1 = randomUUID()
      const e4c2 = randomUUID()
      const iDone = Math.max(0, iBase - 14)
      const dayAtDone = (off: number) => workingDays[Math.min(Math.max(0, iDone + off), wdLen - 1)]
      await insGanttDoneTask(
        epic4,
        project1Id,
        '[GANTT] Epic: Auth token refresh (done)',
        'P1-GANTT-E4',
        leadP1.id,
        dayAtDone(0),
        dayAtDone(8),
        null,
        100,
        'feature',
        taskUpdatePeersP1
      )
      await insGanttDoneTask(e4c1, project1Id, '[GANTT] Sub: Token rotation logic', 'P1-GANTT-E4-S1', mateP1.id, dayAtDone(0), dayAtDone(4), epic4, 100, 'task', taskUpdatePeersP1)
      await insGanttDoneTask(
        e4c2,
        project1Id,
        '[GANTT] Sub: Session invalidation tests',
        'P1-GANTT-E4-S2',
        leadP1.id,
        dayAtDone(5),
        dayAtDone(8),
        epic4,
        100,
        'task',
        taskUpdatePeersP1
      )
      await linkSafe(e4c1, e4c2, 'blocks')
      await linkSafe(epic4, epic1, 'blocks')

      const p2Epic = randomUUID()
      const p2s1 = randomUUID()
      const p2s2 = randomUUID()
      const p2s1Prog = 52
      const p2s2Prog = 28
      const p2EpicProg = Math.round((p2s1Prog + p2s2Prog) / 2)
      await insGanttTask(p2Epic, project2Id, '[GANTT] Epic: CRM lead scoring', 'P2-GANTT-E1', leadP2.id, dayAt(4), dayAt(17), null, p2EpicProg, 'feature', taskUpdatePeersP2)
      await insGanttTask(p2s1, project2Id, '[GANTT] Sub: Feature pipeline & storage', 'P2-GANTT-E1-S1', leadP2.id, dayAt(4), dayAt(10), p2Epic, p2s1Prog, 'task', taskUpdatePeersP2)
      await insGanttTask(
        p2s2,
        project2Id,
        '[GANTT] Sub: Calibration & monitoring',
        'P2-GANTT-E1-S2',
        leadP2.id,
        dayAt(11),
        dayAt(17),
        p2Epic,
        p2s2Prog,
        'feature',
        taskUpdatePeersP2
      )
      await linkSafe(p2s1, p2s2, 'blocks')

      // Thêm nhiều cụm epic/subtask theo wave (P1/P2/P3) — theme thật, plan lệch nhau, chuỗi blocks trong epic.
      type GanttWaveDef = {
        frac: number
        pid: string
        peers: string[]
        leadId: string
        mateId: string
        ticketEpic: string
        epicTitle: string
        epicOff0: number
        epicOff1: number
        doneCluster: boolean
        subs: Array<{ title: string; ticket: string; typ: string; o0: number; o1: number; prog: number; lead: boolean }>
      }
      const extraGanttWaves: GanttWaveDef[] = [
        {
          frac: 0.055,
          pid: project1Id,
          peers: taskUpdatePeersP1,
          leadId: leadP1.id,
          mateId: mateP1.id,
          ticketEpic: 'P1-GWT-OB-E1',
          epicTitle: '[GANTT] Epic: Observability & SLO baselines',
          epicOff0: 0,
          epicOff1: 14,
          doneCluster: false,
          subs: [
            { title: '[GANTT] Sub: RED metrics & burn-rate alerts', ticket: 'P1-GWT-OB-S1', typ: 'task', o0: 0, o1: 4, prog: 100, lead: true },
            { title: '[GANTT] Sub: Trace sampling & tail sampling policy', ticket: 'P1-GWT-OB-S2', typ: 'feature', o0: 5, o1: 10, prog: 68, lead: false },
            { title: '[GANTT] Sub: SLO dashboards & incident runbooks', ticket: 'P1-GWT-OB-S3', typ: 'task', o0: 11, o1: 14, prog: 35, lead: true },
          ],
        },
        {
          frac: 0.105,
          pid: project2Id,
          peers: taskUpdatePeersP2,
          leadId: leadP2.id,
          mateId: mateP2.id,
          ticketEpic: 'P2-GWT-DX-E1',
          epicTitle: '[GANTT] Epic: CRM data export & retention',
          epicOff0: 0,
          epicOff1: 12,
          doneCluster: false,
          subs: [
            { title: '[GANTT] Sub: Column-level policies & PII masking', ticket: 'P2-GWT-DX-S1', typ: 'feature', o0: 0, o1: 6, prog: 74, lead: true },
            { title: '[GANTT] Sub: Scheduled exports & audit log', ticket: 'P2-GWT-DX-S2', typ: 'task', o0: 7, o1: 12, prog: 41, lead: false },
          ],
        },
        {
          frac: 0.165,
          pid: project1Id,
          peers: taskUpdatePeersP1,
          leadId: leadP1.id,
          mateId: mateP1.id,
          ticketEpic: 'P1-GWT-RL-E1',
          epicTitle: '[GANTT] Epic: API rate limits & quota tiers',
          epicOff0: 0,
          epicOff1: 11,
          doneCluster: false,
          subs: [
            { title: '[GANTT] Sub: Token bucket service & config surface', ticket: 'P1-GWT-RL-S1', typ: 'feature', o0: 0, o1: 5, prog: 82, lead: false },
            { title: '[GANTT] Sub: Partner tier rollout & shadow mode', ticket: 'P1-GWT-RL-S2', typ: 'task', o0: 6, o1: 11, prog: 46, lead: true },
          ],
        },
        {
          frac: 0.375,
          pid: project1Id,
          peers: taskUpdatePeersP1,
          leadId: leadP1.id,
          mateId: mateP1.id,
          ticketEpic: 'P1-GWT-SR-E1',
          epicTitle: '[GANTT] Epic: Search & catalog browse',
          epicOff0: 0,
          epicOff1: 16,
          doneCluster: false,
          subs: [
            { title: '[GANTT] Sub: Index pipeline & incremental refresh', ticket: 'P1-GWT-SR-S1', typ: 'feature', o0: 0, o1: 6, prog: 71, lead: true },
            { title: '[GANTT] Sub: Facets, sort, zero-result UX', ticket: 'P1-GWT-SR-S2', typ: 'task', o0: 7, o1: 12, prog: 52, lead: false },
            { title: '[GANTT] Sub: Typeahead abuse guard & perf budget', ticket: 'P1-GWT-SR-S3', typ: 'bug', o0: 13, o1: 16, prog: 24, lead: true },
          ],
        },
        {
          frac: 0.435,
          pid: project2Id,
          peers: taskUpdatePeersP2,
          leadId: leadP2.id,
          mateId: mateP2.id,
          ticketEpic: 'P2-GWT-WH-E1',
          epicTitle: '[GANTT] Epic: Webhooks & integration hub',
          epicOff0: 0,
          epicOff1: 15,
          doneCluster: false,
          subs: [
            { title: '[GANTT] Sub: Delivery guarantees & DLQ replay', ticket: 'P2-GWT-WH-S1', typ: 'feature', o0: 0, o1: 6, prog: 62, lead: true },
            { title: '[GANTT] Sub: Connector SDK & HMAC rotation', ticket: 'P2-GWT-WH-S2', typ: 'task', o0: 7, o1: 11, prog: 55, lead: false },
            { title: '[GANTT] Sub: Admin UI — replay, pause, metrics', ticket: 'P2-GWT-WH-S3', typ: 'feature', o0: 12, o1: 15, prog: 30, lead: true },
          ],
        },
        {
          frac: 0.535,
          pid: project1Id,
          peers: taskUpdatePeersP1,
          leadId: leadP1.id,
          mateId: mateP1.id,
          ticketEpic: 'P1-GWT-NT-E1',
          epicTitle: '[GANTT] Epic: In-app notifications redesign',
          epicOff0: 0,
          epicOff1: 12,
          doneCluster: false,
          subs: [
            { title: '[GANTT] Sub: Preference matrix & quiet hours', ticket: 'P1-GWT-NT-S1', typ: 'feature', o0: 0, o1: 6, prog: 88, lead: false },
            { title: '[GANTT] Sub: Multi-channel fan-out & idempotency', ticket: 'P1-GWT-NT-S2', typ: 'task', o0: 7, o1: 12, prog: 44, lead: true },
          ],
        },
        {
          frac: 0.635,
          pid: project2Id,
          peers: taskUpdatePeersP2,
          leadId: leadP2.id,
          mateId: mateP2.id,
          ticketEpic: 'P2-GWT-RP-E1',
          epicTitle: '[GANTT] Epic: Reporting drill-down & saved views',
          epicOff0: 0,
          epicOff1: 14,
          doneCluster: true,
          subs: [
            { title: '[GANTT] Sub: Aggregate service & query cache', ticket: 'P2-GWT-RP-S1', typ: 'feature', o0: 0, o1: 6, prog: 100, lead: true },
            { title: '[GANTT] Sub: Dimension filters & URL state', ticket: 'P2-GWT-RP-S2', typ: 'task', o0: 7, o1: 11, prog: 100, lead: false },
            { title: '[GANTT] Sub: Export parity & print layout', ticket: 'P2-GWT-RP-S3', typ: 'task', o0: 12, o1: 14, prog: 100, lead: true },
          ],
        },
        {
          frac: 0.078,
          pid: project3Id,
          peers: taskUpdatePeersP3,
          leadId: tinyLeadG.id,
          mateId: tinyMateG.id,
          ticketEpic: 'P3-GWT-ST-E1',
          epicTitle: '[GANTT] Epic: TINY — Reliability hardening sprint',
          epicOff0: 0,
          epicOff1: 13,
          doneCluster: false,
          subs: [
            { title: '[GANTT] Sub: Error budget & flaky test quarantine', ticket: 'P3-GWT-ST-S1', typ: 'task', o0: 0, o1: 6, prog: 92, lead: true },
            { title: '[GANTT] Sub: Rollback playbooks & release gates', ticket: 'P3-GWT-ST-S2', typ: 'feature', o0: 7, o1: 13, prog: 58, lead: false },
          ],
        },
        {
          frac: 0.805,
          pid: project3Id,
          peers: taskUpdatePeersP3,
          leadId: tinyLeadG.id,
          mateId: tinyMateG.id,
          ticketEpic: 'P3-GWT-UX-E1',
          epicTitle: '[GANTT] Epic: TINY — Onboarding & empty states',
          epicOff0: 0,
          epicOff1: 12,
          doneCluster: false,
          subs: [
            { title: '[GANTT] Sub: First-run checklist & progressive disclosure', ticket: 'P3-GWT-UX-S1', typ: 'feature', o0: 0, o1: 5, prog: 66, lead: true },
            { title: '[GANTT] Sub: Copy sweep & a11y pass', ticket: 'P3-GWT-UX-S2', typ: 'task', o0: 6, o1: 12, prog: 40, lead: false },
          ],
        },
        {
          frac: 0.715,
          pid: project1Id,
          peers: taskUpdatePeersP1,
          leadId: leadP1.id,
          mateId: mateP1.id,
          ticketEpic: 'P1-GWT-PF-E1',
          epicTitle: '[GANTT] Epic: Cache warming & read-path performance',
          epicOff0: 0,
          epicOff1: 13,
          doneCluster: false,
          subs: [
            { title: '[GANTT] Sub: Hit ratio telemetry & eviction policy', ticket: 'P1-GWT-PF-S1', typ: 'task', o0: 0, o1: 6, prog: 77, lead: false },
            { title: '[GANTT] Sub: Stampede protection & bulkhead', ticket: 'P1-GWT-PF-S2', typ: 'feature', o0: 7, o1: 13, prog: 51, lead: true },
          ],
        },
      ]

      const clusterMeta: { pid: string; epicId: string; firstSubId: string | null; lastSubId: string | null }[] = []
      for (const wv of extraGanttWaves) {
        const i0 = Math.min(wdLen - 22, Math.max(5, Math.floor(wdLen * wv.frac)))
        const dayW = (off: number) => workingDays[Math.min(wdLen - 1, Math.max(0, i0 + off))]
        const epicId = randomUUID()
        const e0 = dayW(wv.epicOff0)
        const e1 = dayW(wv.epicOff1)
        const avgProg = Math.round(wv.subs.reduce((a, s) => a + s.prog, 0) / wv.subs.length)
        const epicAssign = wv.leadId
        if (wv.doneCluster) {
          await insGanttDoneTask(epicId, wv.pid, wv.epicTitle, wv.ticketEpic, epicAssign, e0, e1, null, 100, 'feature', wv.peers)
        } else {
          await insGanttTask(epicId, wv.pid, wv.epicTitle, wv.ticketEpic, epicAssign, e0, e1, null, avgProg, 'feature', wv.peers)
        }
        const subIds: string[] = []
        for (const s of wv.subs) {
          const sid = randomUUID()
          subIds.push(sid)
          const asg = s.lead ? wv.leadId : wv.mateId
          const s0 = dayW(s.o0)
          const s1 = dayW(s.o1)
          const subDone = wv.doneCluster || s.prog >= 99
          if (subDone) {
            await insGanttDoneTask(sid, wv.pid, s.title, s.ticket, asg, s0, s1, epicId, 100, s.typ, wv.peers)
          } else {
            await insGanttTask(sid, wv.pid, s.title, s.ticket, asg, s0, s1, epicId, s.prog, s.typ, wv.peers)
          }
        }
        for (let si = 0; si < subIds.length - 1; si++) await linkSafe(subIds[si], subIds[si + 1], 'blocks')
        clusterMeta.push({
          pid: wv.pid,
          epicId,
          firstSubId: subIds[0] ?? null,
          lastSubId: subIds.at(-1) ?? null,
        })
      }

      const p1Clusters = clusterMeta.filter(c => c.pid === project1Id)
      if (p1Clusters.length >= 2 && p1Clusters[0]?.lastSubId && p1Clusters[1]?.firstSubId) {
        await linkSafe(p1Clusters[0].lastSubId, p1Clusters[1].firstSubId, 'relates_to')
      }
      const p2Clusters = clusterMeta.filter(c => c.pid === project2Id)
      if (p2Clusters.length >= 2 && p2Clusters[0]?.lastSubId && p2Clusters[1]?.firstSubId) {
        await linkSafe(p2Clusters[0].lastSubId, p2Clusters[1].firstSubId, 'relates_to')
      }
      if (clusterMeta.length > 3 && clusterMeta[0]?.lastSubId && clusterMeta[3]?.firstSubId) {
        await linkSafe(clusterMeta[0].lastSubId, clusterMeta[3].firstSubId, 'relates_to')
      }
      if (clusterMeta.length > 8 && clusterMeta[7]?.lastSubId && clusterMeta[8]?.firstSubId) {
        await linkSafe(clusterMeta[7].lastSubId, clusterMeta[8].firstSubId, 'relates_to')
      }

      console.log(`Gantt demo tasks: core + ${extraGanttWaves.length} extra waves (P1/P2/P3), subtask chains & cross-cluster relates_to`)
    } else {
      console.log('Gantt demo tasks: skipped (working day range too short)')
    }
  }

  // Task links: cặp cùng assignee + plan_end <= plan_start (ứng viên FS hợp lý), không milestone.
  const insertSensibleTaskLinks = async (projectId: string, cap: number) => {
    const rows = await query<{ from_id: string; to_id: string }>(
      `SELECT t1.id AS from_id, t2.id AS to_id
       FROM tasks t1
       INNER JOIN tasks t2 ON t1.assignee_user_id = t2.assignee_user_id AND t1.project_id = t2.project_id
       WHERE t1.project_id = ?
         AND COALESCE(t1.type, '') <> 'milestone' AND COALESCE(t2.type, '') <> 'milestone'
         AND t1.plan_end_date IS NOT NULL AND t2.plan_start_date IS NOT NULL
         AND t1.plan_end_date::date <= t2.plan_start_date::date
         AND t1.id <> t2.id
       ORDER BY t1.plan_start_date::date, t1.id, t2.plan_start_date::date, t2.id
       LIMIT ?`,
      [projectId, cap]
    )
    const list = Array.isArray(rows) ? rows : []
    for (const r of list) {
      if (!r.from_id || !r.to_id) continue
      const lt = seedGlobalRand() < 0.72 ? 'blocks' : 'relates_to'
      await query('INSERT INTO task_links (id, from_task_id, to_task_id, link_type) VALUES (?, ?, ?, ?) ON CONFLICT (from_task_id, to_task_id, link_type) DO NOTHING', [
        randomUUID(),
        r.from_id,
        r.to_id,
        lt,
      ])
    }
  }
  await insertSensibleTaskLinks(project1Id, 140)
  await insertSensibleTaskLinks(project2Id, 120)
  await insertSensibleTaskLinks(project3Id, 80)

  const taskIds = await query<{ id: string }>('SELECT id FROM tasks WHERE project_id = ? ORDER BY plan_start_date NULLS LAST, id LIMIT 100', [project1Id])
  const tids = Array.isArray(taskIds) ? taskIds : []
  for (let i = 0; i < Math.min(25, tids.length); i++) {
    const dev = devsP1[i % devsP1.length]
    await query('INSERT INTO task_favorites (id, user_id, task_id) VALUES (?, ?, ?) ON CONFLICT (user_id, task_id) DO NOTHING', [randomUUID(), dev.id, tids[i]?.id])
  }
  console.log('Task links & favorites inserted')

  const allDevs = [...new Map([...devsP1, ...devsP2, ...tinyTeamDevs].filter(d => d.seedActivity !== 'none').map(d => [d.id, d] as const)).values()]

  // Task notifications (plan: ~30-50)
  const allTaskIds = await query<{ id: string }>('SELECT id FROM tasks ORDER BY random() LIMIT 80')
  const atids = Array.isArray(allTaskIds) ? allTaskIds : []
  const notifTypes = ['assign', 'done', 'review', 'feedback', 'deadline_today', 'deadline_tomorrow'] as const
  const nNotifs = randBetween(30, 50)
  for (let i = 0; i < nNotifs && i < atids.length; i++) {
    const task = atids[i]
    const targetDev = pick(allDevs)
    const nt = pick([...notifTypes])
    const titles: Record<string, string> = {
      assign: 'Task được assign cho bạn',
      done: 'Task đã hoàn thành',
      review: 'Cần review',
      feedback: 'Có phản hồi',
      deadline_today: 'Deadline hôm nay',
      deadline_tomorrow: 'Deadline ngày mai',
    }
    await query(
      `INSERT INTO task_notifications (id, target_user_id, type, title, body, task_id, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), targetDev.id, nt, titles[nt] || nt, 'Nội dung thông báo mẫu.', task?.id ?? null, seedGlobalRand() > 0.5]
    )
  }
  for (let i = 0; i < randBetween(8, 15); i++) {
    const targetDev = pick(allDevs)
    const achCode = pick(['task_10', 'task_50', 'git_first_commit', 'report_first'])
    await query(
      `INSERT INTO task_notifications (id, target_user_id, type, title, body, task_id, is_read)
       VALUES (?, ?, 'achievement_unlocked', ?, ?, NULL, ?)`,
      [randomUUID(), targetDev.id, `Achievement Unlocked: ${achCode}`, JSON.stringify({ code: achCode, tier: 'bronze', xpReward: 20, earnedCount: 1 }), seedGlobalRand() > 0.4]
    )
  }
  for (let i = 0; i < randBetween(3, 6); i++) {
    const targetDev = pick(allDevs)
    const newRank = pick(['contributor', 'developer', 'regular', 'pro'])
    await query(
      `INSERT INTO task_notifications (id, target_user_id, type, title, body, task_id, is_read)
       VALUES (?, ?, 'rank_up', ?, ?, NULL, ?)`,
      [randomUUID(), targetDev.id, `Rank Up! Bạn đã đạt rank ${newRank}`, JSON.stringify({ newRank }), seedGlobalRand() > 0.5]
    )
  }
  console.log('Task notifications inserted (incl. achievement_unlocked, rank_up)')

  // 6. user_stats & user_achievements - XP từ data thực, rank từ RANK_CONFIG
  const lastDayIdx = workingDays.length - 1
  const computeReportStreak = (userId: string): number => {
    const d = allDevs.find(x => x.id === userId)
    if (d?.forceReportStreakInStats != null) return d.forceReportStreakInStats
    const reported = reportedByUserDay.get(userId)
    if (!reported?.has(lastDayIdx)) return 0
    let streak = 0
    for (let i = lastDayIdx; i >= 0 && reported.has(i); i--) streak++
    return streak
  }
  const computeConsecutiveNoReport = (userId: string): number => {
    if (reportedByUserDay.get(userId)?.has(lastDayIdx)) return 0
    let count = 0
    for (let i = lastDayIdx; i >= 0 && !reportedByUserDay.get(userId)?.has(i); i--) count++
    return count
  }
  const earnedAchievementsByUser = new Map<string, string[]>()
  for (const dev of allDevs) {
    const acc = devStatsAccum.get(dev.id) ?? defaultAccum()
    const TOTAL_TASKS = acc.tasks
    const TASKS_DONE = acc.onTime + acc.early + acc.late
    const COMMITS = acc.commits
    const REPORTS = acc.reports
    const XP_BASE = 100
    const xp = XP_BASE + TASKS_DONE * 5 + COMMITS + REPORTS
    const rank = calculateRank(xp)
    const reportStreak = computeReportStreak(dev.id)
    const activityStreak = Math.min(7, reportStreak)
    const consecutiveNoReport = computeConsecutiveNoReport(dev.id)

    await query(
      `INSERT INTO user_stats (user_id, xp, current_rank, current_streak_days, current_report_streak_days,
        last_activity_date, total_tasks_done, total_tasks_created, total_commits, total_reports,
        total_tasks_on_time, total_tasks_early, total_tasks_late, total_tasks_bug_done, total_tasks_feature_done, total_tasks_critical_done,
        total_spotbugs_clean, total_spotbugs_fails, total_pushes, total_merges, total_branches_created, total_rebases,
        total_files_committed, total_insertions, consecutive_no_report_days,
        last_commit_date, last_report_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
        total_tasks_done = EXCLUDED.total_tasks_done,
        total_tasks_created = EXCLUDED.total_tasks_created,
        total_commits = EXCLUDED.total_commits,
        total_reports = EXCLUDED.total_reports,
        total_tasks_on_time = EXCLUDED.total_tasks_on_time,
        total_tasks_early = EXCLUDED.total_tasks_early,
        total_tasks_late = EXCLUDED.total_tasks_late,
        total_tasks_bug_done = EXCLUDED.total_tasks_bug_done,
        total_tasks_feature_done = EXCLUDED.total_tasks_feature_done,
        total_tasks_critical_done = EXCLUDED.total_tasks_critical_done,
        total_spotbugs_clean = EXCLUDED.total_spotbugs_clean,
        total_spotbugs_fails = EXCLUDED.total_spotbugs_fails,
        total_pushes = EXCLUDED.total_pushes,
        total_merges = EXCLUDED.total_merges,
        total_branches_created = EXCLUDED.total_branches_created,
        total_rebases = EXCLUDED.total_rebases,
        total_files_committed = EXCLUDED.total_files_committed,
        total_insertions = EXCLUDED.total_insertions,
        consecutive_no_report_days = EXCLUDED.consecutive_no_report_days,
        xp = EXCLUDED.xp,
        current_rank = EXCLUDED.current_rank,
        current_streak_days = EXCLUDED.current_streak_days,
        current_report_streak_days = EXCLUDED.current_report_streak_days,
        last_activity_date = EXCLUDED.last_activity_date`,
      [
        dev.id,
        xp,
        rank,
        activityStreak,
        reportStreak,
        toDateStr(endDate),
        TASKS_DONE,
        TOTAL_TASKS,
        COMMITS,
        REPORTS,
        acc.onTime,
        acc.early,
        acc.late,
        acc.bugDone,
        acc.featureDone,
        acc.criticalDone,
        acc.spotbugsClean,
        acc.spotbugsFails,
        acc.pushes,
        acc.merges,
        acc.branches,
        acc.rebases,
        acc.filesCommitted,
        acc.insertions,
        consecutiveNoReport,
        COMMITS > 0 ? toDateStr(endDate) : null,
        REPORTS > 0 ? toDateStr(endDate) : null,
      ]
    )

    const achievementsToAward: { code: string; check: boolean }[] = [
      { code: 'task_first', check: TASKS_DONE >= 1 },
      { code: 'task_10', check: TASKS_DONE >= 10 },
      { code: 'task_50', check: TASKS_DONE >= 50 },
      { code: 'task_100', check: TASKS_DONE >= 100 },
      { code: 'git_first_commit', check: COMMITS >= 1 },
      { code: 'git_commits_50', check: COMMITS >= 50 },
      { code: 'git_commits_200', check: COMMITS >= 200 },
      { code: 'report_first', check: REPORTS >= 1 },
      { code: 'report_50', check: REPORTS >= 50 },
    ]
    const earned: string[] = []
    for (const ach of achievementsToAward) {
      if (!ach.check) continue
      earned.push(ach.code)
      await query(
        `INSERT INTO user_achievements (id, user_id, achievement_code, earned_count, first_earned_at, last_earned_at) VALUES (?, ?, ?, 1, NOW(), NOW())
         ON CONFLICT (user_id, achievement_code) DO NOTHING`,
        [randomUUID(), dev.id, ach.code]
      )
    }
    earnedAchievementsByUser.set(dev.id, earned)
  }

  // user_badge_display: max 3 pin mỗi user, random 0–2 — only from earned achievements
  for (const dev of allDevs) {
    const earned = earnedAchievementsByUser.get(dev.id)
    if (!earned || earned.length === 0) continue
    const nPins = Math.min(randBetween(0, 2), earned.length)
    const picked = new Set<string>()
    for (let i = 0; i < nPins; i++) {
      const code = pick(earned.filter(c => !picked.has(c)))
      if (!code) break
      picked.add(code)
      await query('INSERT INTO user_badge_display (user_id, achievement_code, display_order) VALUES (?, ?, ?) ON CONFLICT (user_id, achievement_code) DO NOTHING', [
        dev.id,
        code,
        i,
      ])
    }
  }
  console.log('User badge display inserted (max 3 per user)')

  console.log('[Mock seed QA] Map case → user_code (18 scenarios)')
  console.log('  Ghi chú QA: forceReportStreakInStats chỉ dùng khi build streak trong stats/UI mock; không tự đồng bộ với mọi chỗ đọc daily_reports thực tế nếu logic khác.')
  console.log('  Case 16 (P2-only streak, dev_p2_streak) nằm trong mảng p2OnlyDevs — chỉ seed activity P2, không có vòng P1 cho user đó.')
  const qaLines = [
    '1,8 terrible/poor radar → dev_terrible',
    '2 PL thuần không activity → pl_pure',
    '3 Multi-PL P1 → pl_p1_b (+ Legend PL)',
    '4,9 star + lateTask 0 / excellent → dev_perfect',
    '5 Không review người khác → dev_terrible',
    '6 Streak ~30 + force stats → dev_streak_30',
    '7 Join ngày làm việc cuối → dev_join_last_day',
    '10 Dev P1 + PL P2 → dev_pl_split',
    '11 Legend chỉ PL P1 / PL P2 = split → dev_legend / dev_pl_split',
    '12 Chỉ commit → dev_commits_only',
    '13 Chỉ task → dev_tasks_only',
    '14 14 ngày cuối không report → dev_silent_tail',
    '15 Streak tail + gãy áp chót → dev_streak_break',
    '16 P2-only streak → dev_p2_streak',
    '17 Không daily report → dev_never_report',
    '18 Team nhỏ 2 dev + PL → project TINY: tiny_pl, tiny_dev_a, tiny_dev_b',
  ]
  for (const line of qaLines) console.log(`  ${line}`)

  console.log('Seed mock data: done.')
}
