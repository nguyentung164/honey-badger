/** Max chars for Monaco `before` blame label (fits ~176px at 10px font). */
export const DIFF_VIEWER_BLAME_INLINE_MAX_CHARS = 30

export function formatBlameAuthor(author: string): string {
  const trimmed = (author || '').trim()
  if (!trimmed || trimmed === 'Not Committed Yet') return 'local'
  if (trimmed.length <= 14) return trimmed
  return `${trimmed.slice(0, 13)}…`
}

/** Compact blame timestamp: `dd/MM HH:mm` */
export function formatBlameDate(dateIso: string): string {
  if (!dateIso) return '--/-- --:--'
  const d = new Date(dateIso)
  if (Number.isNaN(d.getTime())) return '--/-- --:--'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} ${hh}:${min}`
}

export function formatBlameInlineLabel(author: string, dateIso: string): string {
  const label = `${formatBlameDate(dateIso)}  ${formatBlameAuthor(author)}`
  if (label.length <= DIFF_VIEWER_BLAME_INLINE_MAX_CHARS) return label
  return `${label.slice(0, DIFF_VIEWER_BLAME_INLINE_MAX_CHARS - 1)}…`
}

export function formatBlameHoverMessage(shortHash: string, author: string, dateIso: string): string {
  const fullDate = dateIso ? new Date(dateIso).toLocaleString() : ''
  return `${shortHash} — ${author}${fullDate ? `\n${fullDate}` : ''}`
}
