/**
 * Chuẩn hóa ngày lịch / instant giữa Postgres (Electron main) và renderer.
 *
 * - **Calendar (plan/actual task, DATE EVM, …)**: yyyy-MM-dd theo timezone local của process main
 *   (cùng máy user → khớp UI); không dùng `toISOString().slice(0,10)` (đó là ngày UTC).
 * - **Instant thực** (GitHub `updated_at`, audit): chuỗi SQL lấy thành phần UTC.
 */

/** Ghi cột TIMESTAMPTZ cho trường “ngày lịch”: yyyy-MM-dd giữ nguyên lịch; ISO đầy đủ → thành phần UTC. */
export function calendarInputToPgTimestamptzSql(value: string | null | undefined): string | null {
  if (value == null || value === '') return null
  const trimmed = typeof value === 'string' ? value.trim() : String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed} 00:00:00`
  }
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

/** Đọc DATE / TIMESTAMPTZ từ PG → `yyyy-MM-dd` (local process). Chuỗi date-only giữ nguyên. */
export function dbValueToCalendarYmd(val: Date | string | null | undefined): string {
  if (val == null || val === '') return ''
  if (typeof val === 'string') {
    const s = val.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s.length >= 10 ? s.slice(0, 10) : ''
    return dateToLocalYmd(d)
  }
  return dateToLocalYmd(val)
}

function dateToLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Instant (ISO GitHub / …) → `'YYYY-MM-DD HH:mm:ss'` bằng thành phần UTC cho Postgres. */
export function isoInstantToPgUtcDatetimeSql(iso: string | Date | null | undefined): string | null {
  if (iso == null || iso === '') return null
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

/** Hôm nay (local) dạng yyyy-MM-dd — thay cho `new Date().toISOString().slice(0, 10)`. */
export function todayCalendarYmd(): string {
  return dateToLocalYmd(new Date())
}

/**
 * CSV import Redmine / chuỗi tự do → `YYYY-MM-DD HH:mm:ss` cho Postgres TIMESTAMPTZ.
 * - Đã đúng `YYYY-MM-DD HH:mm:ss` → giữ nguyên (khớp output `parseRedmineDate`).
 * - Chỉ ngày `yyyy-MM-dd` → `… 00:00:00` (cùng ngữ nghĩa ngày lịch với `calendarInputToPgTimestamptzSql`).
 * - Còn lại (ISO, v.v.) → `Date` rồi **wall-clock local** (giữ hành vi import CSV trước đây).
 */
export function csvLegacyInputToPgSqlDatetime(value: string | null | undefined): string | null {
  if (value == null || value === '') return null
  const s = typeof value === 'string' ? value.trim() : String(value).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const sec = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}:${sec}`
}
