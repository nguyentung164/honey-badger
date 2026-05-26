import type { CaseResultStatus, RunStatus } from 'shared/automation/types'
import { cn } from '@/lib/utils'

const rowBadgeLayout = 'inline-flex max-w-full items-center gap-1 border-0 capitalize shadow-none'

const passedBadgeTone =
  'bg-emerald-500/[0.22] text-emerald-950 dark:bg-emerald-400/18 dark:text-emerald-50'

/** Badge trạng thái từng case trong bảng kết quả run. */
export function caseResultStatusBadgeAttrs(status: CaseResultStatus): {
  variant: 'default' | 'destructive' | 'secondary' | 'outline'
  className: string
} {
  const base = 'capitalize'
  if (status === 'passed') {
    return {
      variant: 'secondary',
      className: cn(base, 'border-0 shadow-none', passedBadgeTone),
    }
  }
  if (status === 'failed' || status === 'timedOut' || status === 'interrupted') {
    return { variant: 'destructive', className: base }
  }
  if (status === 'flaky') {
    return { variant: 'secondary', className: base }
  }
  return { variant: 'outline', className: base }
}

/** Badge cho trạng thái run (History + Run detail). `cancelled` tách màu để không trùng nền `bg-accent` khi dòng được chọn. */
export function runSummaryStatusBadgeAttrs(status: RunStatus): {
  variant: 'default' | 'destructive' | 'secondary'
  className: string
} {
  if (status === 'passed') {
    return {
      variant: 'secondary',
      className: cn(rowBadgeLayout, passedBadgeTone),
    }
  }
  if (status === 'failed' || status === 'error') return { variant: 'destructive', className: rowBadgeLayout }
  if (status === 'cancelled') {
    return {
      variant: 'secondary',
      className: cn(
        rowBadgeLayout,
        'bg-amber-500/[0.22] text-amber-950 dark:bg-amber-400/18 dark:text-amber-50',
      ),
    }
  }
  return { variant: 'secondary', className: rowBadgeLayout }
}
