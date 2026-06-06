'use client'

import { FileDiff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const PR_METRIC_ICON = 'h-2 w-2 shrink-0 opacity-80'

export function PrMetricLines({
  additions,
  deletions,
  className,
  badgeClassName,
  includeZero = false,
}: {
  additions?: number | null
  deletions?: number | null
  className?: string
  badgeClassName?: string
  /** Hiển thị +0/−0 khi API trả về 0 (tab PR summary). */
  includeZero?: boolean
}) {
  const hasAdds = additions != null && (includeZero || additions > 0)
  const hasDels = deletions != null && (includeZero || deletions > 0)
  if (!hasAdds && !hasDels) return null

  const content = (
    <span className={cn('inline-flex items-center gap-0.5 tabular-nums', className)}>
      <FileDiff className={PR_METRIC_ICON} aria-hidden />
      {hasAdds ? <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span> : null}
      {hasDels ? <span className="text-rose-600 dark:text-rose-400">−{deletions}</span> : null}
    </span>
  )

  if (badgeClassName) {
    return (
      <Badge variant="secondary" className={badgeClassName}>
        {content}
      </Badge>
    )
  }

  return content
}
