/** Nền + viền trái từng nhóm repo — dùng chung với PrBoard. */
export const PR_MANAGER_REPO_GROUP_VISUAL: ReadonlyArray<{
  row: string
  accent: string
  /** Nền header/accordion rõ hơn `row` (dialog, vùng hẹp). */
  rowHeader: string
}> = [
    {
      row: 'bg-slate-500/[0.035] dark:bg-slate-400/[0.06]',
      accent: 'border-l-[3px] border-l-sky-500/25 dark:border-l-sky-400/20',
      rowHeader: 'bg-sky-500/[0.14] dark:bg-sky-400/[0.11]',
    },
    {
      row: 'bg-emerald-500/[0.04] dark:bg-emerald-400/[0.07]',
      accent: 'border-l-[3px] border-l-emerald-500/25 dark:border-l-emerald-400/20',
      rowHeader: 'bg-emerald-500/[0.14] dark:bg-emerald-400/[0.11]',
    },
    {
      row: 'bg-violet-500/[0.04] dark:bg-violet-400/[0.07]',
      accent: 'border-l-[3px] border-l-violet-500/25 dark:border-l-violet-400/20',
      rowHeader: 'bg-violet-500/[0.14] dark:bg-violet-400/[0.11]',
    },
    {
      row: 'bg-amber-500/[0.04] dark:bg-amber-400/[0.07]',
      accent: 'border-l-[3px] border-l-amber-500/25 dark:border-l-amber-400/20',
      rowHeader: 'bg-amber-500/[0.14] dark:bg-amber-400/[0.11]',
    },
  ]
