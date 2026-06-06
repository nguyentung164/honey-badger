'use client'

import { FileCode, FileDiff } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { MergeMetricAlignStatus } from './prBoardTableModel'

export type PrSizeMetricsProps = {
  changedFiles?: number | null
  additions?: number | null
  deletions?: number | null
  /** compact = board merge cell (2 cột cố định); tab = inline next to tab label */
  variant?: 'compact' | 'tab'
  className?: string
  /** So khớp metrics giữa các cột merge_* trên cùng dòng (chỉ compact). */
  alignment?: {
    files?: MergeMetricAlignStatus
    lines?: MergeMetricAlignStatus
  }
  onMismatchClick?: (kind: 'files' | 'lines') => void
}

/** Cột metrics trên board — căn thẳng hàng giữa các dòng. */
const COMPACT_SEGMENT_FILES = 'w-[2.25rem]'
const COMPACT_SEGMENT_LINES = 'w-[5.25rem]'
const COMPACT_GRID_COLS = 'grid-cols-[2.25rem_5.25rem]'

function compactCountTone(status: MergeMetricAlignStatus | undefined): string {
  if (status === 'match') return 'text-emerald-600 dark:text-emerald-400'
  if (status === 'mismatch') return 'text-red-600 dark:text-red-400'
  return 'text-muted-foreground'
}

function compactLinesBadgeCls(status: MergeMetricAlignStatus | undefined): string {
  if (status === 'match') {
    return 'rounded px-1.5 py-0.5 bg-emerald-500/18 text-emerald-800 dark:bg-emerald-500/22 dark:text-emerald-200'
  }
  if (status === 'mismatch') {
    return 'rounded px-1.5 py-0.5 bg-red-500/18 text-red-800 dark:bg-red-500/22 dark:text-red-200'
  }
  return 'rounded px-1.5 py-0.5 bg-muted/45 text-muted-foreground'
}

function showCount(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n) && n >= 0
}

function MetricSegment({
  segmentClass,
  label,
  visible,
  isCompact,
  clickable,
  onClick,
  children,
}: {
  segmentClass: string
  label: string
  visible: boolean
  isCompact: boolean
  clickable?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  const inner = (
    <button
      type="button"
      className={cn(
        'inline-flex h-6 w-full items-center justify-start gap-0.5 overflow-hidden border-0 bg-transparent p-0',
        isCompact && visible && 'pointer-events-auto',
        clickable && 'cursor-pointer hover:opacity-90'
      )}
      onClick={
        clickable
          ? e => {
            e.stopPropagation()
            onClick?.()
          }
          : undefined
      }
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )

  if (!visible) {
    return <div className={cn('shrink-0', segmentClass)} aria-hidden />
  }

  return (
    <div className={cn('shrink-0', segmentClass)}>
      {clickable ? (
        inner
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>{inner}</TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {label}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

export function PrSizeMetrics({
  changedFiles,
  additions,
  deletions,
  variant = 'compact',
  className,
  alignment,
  onMismatchClick,
}: PrSizeMetricsProps) {
  const { t } = useTranslation()
  const isCompact = variant === 'compact'
  const iconClass = isCompact ? 'h-3.5 w-3.5 shrink-0' : 'h-3 w-3 shrink-0 opacity-80'
  const textClass = isCompact ? 'min-w-0 truncate text-[10px] leading-none tabular-nums' : 'text-[9px] leading-none tabular-nums'
  const filesTone = compactCountTone(alignment?.files)
  const linesBadgeCls = compactLinesBadgeCls(alignment?.lines)
  const filesMismatch = alignment?.files === 'mismatch'
  const linesMismatch = alignment?.lines === 'mismatch'
  const hasClickableMismatch = isCompact && onMismatchClick != null && (filesMismatch || linesMismatch)

  const hasFiles = showCount(changedFiles)
  const hasAdds = showCount(additions)
  const hasDels = showCount(deletions)
  const hasLines = hasAdds || hasDels

  if (!hasFiles && !hasLines) return null

  if (isCompact) {
    return (
      <div
        className={cn(
          'grid shrink-0 items-center justify-items-start gap-0.5',
          COMPACT_GRID_COLS,
          !hasClickableMismatch && 'pointer-events-none',
          className
        )}
      >
        <MetricSegment
          segmentClass={COMPACT_SEGMENT_FILES}
          label={
            filesMismatch
              ? `${t('prManager.metrics.files', { count: hasFiles ? changedFiles : 0 })} — ${t('prManager.metricsCompare.clickToCompare')}`
              : t('prManager.metrics.files', { count: hasFiles ? changedFiles : 0 })
          }
          visible={hasFiles}
          isCompact
          clickable={filesMismatch}
          onClick={() => onMismatchClick?.('files')}
        >
          <FileCode className={cn(iconClass, filesTone)} aria-hidden />
          <span className={cn(textClass, filesTone)}>{changedFiles}</span>
        </MetricSegment>
        <MetricSegment
          segmentClass={COMPACT_SEGMENT_LINES}
          label={
            linesMismatch
              ? `${t('prManager.metrics.lines', {
                additions: hasAdds ? additions : 0,
                deletions: hasDels ? deletions : 0,
              })} — ${t('prManager.metricsCompare.clickToCompare')}`
              : t('prManager.metrics.lines', {
                additions: hasAdds ? additions : 0,
                deletions: hasDels ? deletions : 0,
              })
          }
          visible={hasLines}
          isCompact
          clickable={linesMismatch}
          onClick={() => onMismatchClick?.('lines')}
        >
          <span className={cn('inline-flex min-w-0 items-center gap-0.5', linesBadgeCls)}>
            <FileDiff className={cn(iconClass, 'shrink-0 opacity-90')} aria-hidden />
            <span className={cn('inline-flex min-w-0 items-center gap-px', textClass)}>
              {hasAdds ? <span>+{additions}</span> : null}
              {hasDels ? <span>−{deletions}</span> : null}
            </span>
          </span>
        </MetricSegment>
      </div>
    )
  }

  const wrap = (key: string, label: string, node: ReactNode) => (
    <Tooltip key={key}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 border-0 bg-transparent p-0"
        >
          {node}
          <span className="sr-only">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  )

  return (
    <div className={cn('flex shrink-0 items-center gap-1.5', className)}>
      {hasFiles
        ? wrap(
          'files',
          t('prManager.metrics.files', { count: changedFiles }),
          <>
            <FileCode className={iconClass} aria-hidden />
            <span className={textClass}>{changedFiles}</span>
          </>
        )
        : null}
      {hasLines
        ? wrap(
          'lines',
          t('prManager.metrics.lines', {
            additions: hasAdds ? additions : 0,
            deletions: hasDels ? deletions : 0,
          }),
          <>
            <FileDiff className={iconClass} aria-hidden />
            <span className={cn('inline-flex items-center gap-0.5', textClass)}>
              {hasAdds ? <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span> : null}
              {hasDels ? <span className="text-rose-600 dark:text-rose-400">−{deletions}</span> : null}
            </span>
          </>
        )
        : null}
    </div>
  )
}

/** Metrics từ checkpoint pr_* (board merge column). */
export function prSizeMetricsFromCheckpoint(cp: {
  ghPrChangedFiles?: number | null
  ghPrAdditions?: number | null
  ghPrDeletions?: number | null
}): Pick<PrSizeMetricsProps, 'changedFiles' | 'additions' | 'deletions'> {
  return {
    changedFiles: cp.ghPrChangedFiles,
    additions: cp.ghPrAdditions,
    deletions: cp.ghPrDeletions,
  }
}
