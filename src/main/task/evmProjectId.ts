/** Khóa `projects.id` trong app: UUID chuẩn 36 ký tự (có dấu gạch). */

const UUID_36_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidEvmProjectId(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  const s = raw.trim()
  return s.length === 36 && UUID_36_RE.test(s)
}

export function assertEvmProjectId(raw: unknown): string {
  if (!isValidEvmProjectId(raw)) throw new Error('Invalid project id')
  return raw.trim()
}

/** Cùng định dạng UUID 36 ký tự cho khóa WBS/AC/master/detail. */
export function assertEvmRecordId(raw: unknown, label = 'id'): string {
  if (!isValidEvmProjectId(raw)) throw new Error(`Invalid ${label}`)
  return raw.trim()
}
