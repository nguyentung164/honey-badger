import type { BulkActionKind } from './components/prBoardBulkResolve'

/** Nền + chữ header bulk — khớp màu icon từng nút toolbar trong PrBoard. */
export const BULK_DIALOG_CHROME: Record<BulkActionKind, { headerBar: string; title: string }> = {
  createPr: {
    headerBar: 'bg-sky-500/22 dark:bg-sky-500/16',
    title: 'text-sky-950 dark:text-sky-100',
  },
  merge: {
    headerBar: 'bg-violet-500/22 dark:bg-violet-500/16',
    title: 'text-violet-950 dark:text-violet-100',
  },
  approve: {
    headerBar: 'bg-teal-500/22 dark:bg-teal-500/16',
    title: 'text-teal-950 dark:text-teal-100',
  },
  close: {
    headerBar: 'bg-rose-500/22 dark:bg-rose-500/16',
    title: 'text-rose-950 dark:text-rose-100',
  },
  reopen: {
    headerBar: 'bg-orange-500/22 dark:bg-orange-500/16',
    title: 'text-orange-950 dark:text-orange-100',
  },
  draft: {
    headerBar: 'bg-slate-500/18 dark:bg-slate-600/20',
    title: 'text-slate-950 dark:text-slate-100',
  },
  ready: {
    headerBar: 'bg-emerald-500/[0.06] dark:bg-emerald-500/[0.05]',
    title: 'text-emerald-950 dark:text-emerald-100',
  },
  requestReviewers: {
    headerBar: 'bg-fuchsia-500/22 dark:bg-fuchsia-500/16',
    title: 'text-fuchsia-950 dark:text-fuchsia-100',
  },
  updateBranch: {
    headerBar: 'bg-indigo-500/22 dark:bg-indigo-500/16',
    title: 'text-indigo-950 dark:text-indigo-100',
  },
  deleteRemoteBranch: {
    headerBar: 'bg-red-500/22 dark:bg-red-500/16',
    title: 'text-red-950 dark:text-red-100',
  },
}
