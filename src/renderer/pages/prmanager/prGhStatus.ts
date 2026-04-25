/** Cùng bộ khóa với bộ lọc PR trên PrBoard. */
export const PR_GH_STATUS_IDS = ['open', 'draft', 'merged', 'closed'] as const
export type PrGhStatusKind = (typeof PR_GH_STATUS_IDS)[number]

export const PR_GH_STATUS_LABELS: Record<PrGhStatusKind, string> = {
  open: 'Open',
  draft: 'Draft',
  merged: 'Merged',
  closed: 'Closed',
}

/** Màu chữ — đồng bộ label chip lọc PrBoard. */
export const PR_GH_STATUS_TEXT_CLASS: Record<PrGhStatusKind, string> = {
  open: 'text-emerald-700 dark:text-emerald-300',
  draft: 'text-slate-600 dark:text-slate-400',
  merged: 'text-violet-700 dark:text-violet-300',
  closed: 'text-rose-700 dark:text-rose-300',
}

/**
 * Nền + chữ cho badge trạng thái (header PrDetailDialog) — cùng hệ màu với {@link PR_GH_STATUS_TEXT_CLASS}.
 */
export const PR_GH_STATUS_BADGE_CLASS: Record<PrGhStatusKind, string> = {
  open: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  draft: 'bg-slate-500/16 text-slate-700 dark:text-slate-300',
  merged: 'bg-violet-500/16 text-violet-900 dark:text-violet-200',
  closed: 'bg-rose-500/16 text-rose-900 dark:text-rose-200',
}

export const PR_GH_STATUS_TOOLTIP: Record<PrGhStatusKind, string> = {
  open: 'This pull request is open.',
  draft: 'This pull request is a draft.',
  merged: 'This pull request has been merged.',
  closed: 'This pull request is closed (not merged).',
}

export function prSummaryToGhStatusKind(pr: {
  merged: boolean
  state: 'open' | 'closed'
  draft: boolean
}): PrGhStatusKind {
  if (pr.merged) return 'merged'
  if (pr.state === 'closed') return 'closed'
  if (pr.draft) return 'draft'
  return 'open'
}
