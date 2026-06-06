/** File trong PR — shape khớp `PrChangedFile` main + preload. */
export type PrChangedFileView = {
  filename: string
  status: string
  patch: string | null
  patchTruncated: boolean
  additions: number
  deletions: number
  blobUrl: string | null
}

/** Cùng kích thước/style badge trên tab Files trong PrDetailDialog. */
export const PR_DETAIL_TAB_BADGE =
  'inline-flex h-4 min-h-4 items-center border-0 px-1.5 py-0 text-[10px] font-medium leading-4 shadow-none'

export const FILE_STATUS_BADGE = `${PR_DETAIL_TAB_BADGE} capitalize`

/** Badge số liệu (+/−) — cùng style tab Files (bg-muted/90, gộp trong một pill). */
export const METRIC_BADGE = `${PR_DETAIL_TAB_BADGE} gap-1 bg-muted/90`

export const COMPACT_STATUS_BADGE = `${PR_DETAIL_TAB_BADGE} capitalize`

export function fileStatusBadgeClass(status: string): string {
  const s = status.toLowerCase()
  if (s === 'added') return 'bg-emerald-500/20 text-emerald-900 dark:text-emerald-100'
  if (s === 'removed' || s === 'deleted') return 'bg-rose-500/20 text-rose-900 dark:text-rose-100'
  if (s === 'modified') return 'bg-sky-500/20 text-sky-950 dark:text-sky-100'
  if (s === 'renamed') return 'bg-violet-500/20 text-violet-950 dark:text-violet-100'
  return 'bg-muted/70 text-foreground'
}

/** Tên file từ path GitHub (`src/foo.ts` hoặc `src\\foo.ts`). */
export function changedFileBasename(filename: string): string {
  const i = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'))
  return i >= 0 ? filename.slice(i + 1) : filename
}
