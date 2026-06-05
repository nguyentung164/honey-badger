'use client'

import { FileCode, FileDiff, GitCommit } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type PrSizeMetricsProps = {
  commits?: number | null
  changedFiles?: number | null
  additions?: number | null
  deletions?: number | null
  /** compact = board merge cell (3 cột cố định); tab = inline next to tab label */
  variant?: 'compact' | 'tab'
  className?: string
}

/** Cột metrics trên board — căn thẳng hàng giữa các dòng. */
const COMPACT_SEGMENT_COMMIT = 'w-[2.25rem]'
const COMPACT_SEGMENT_FILES = 'w-[2.25rem]'
const COMPACT_SEGMENT_LINES = 'w-[5.25rem]'
const COMPACT_GRID_COLS = 'grid-cols-[2.25rem_2.25rem_5.25rem]'

/** Tách màu metrics khỏi màu status (emerald/violet/rose/…) của ô merge. */
const COMPACT_METRIC_COMMIT = 'text-sky-600 dark:text-sky-400'
const COMPACT_METRIC_FILES = 'text-cyan-600 dark:text-cyan-400'
const COMPACT_METRIC_LINES_ICON = 'text-indigo-500 dark:text-indigo-400'
const COMPACT_METRIC_ADD = 'text-green-600 dark:text-green-400'
const COMPACT_METRIC_DEL = 'text-orange-600 dark:text-orange-400'

function showCount(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n) && n >= 0
}

function MetricSegment({
  segmentClass,
  label,
  visible,
  isCompact,
  children,
}: {
  segmentClass: string
  label: string
  visible: boolean
  isCompact: boolean
  children: ReactNode
}) {
  const inner = (
    <button
      type="button"
      className={cn(
        'inline-flex h-3.5 w-full items-center justify-start gap-0.5 overflow-hidden border-0 bg-transparent p-0',
        isCompact && visible && 'pointer-events-auto'
      )}
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
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

export function PrSizeMetrics({
  commits,
  changedFiles,
  additions,
  deletions,
  variant = 'compact',
  className,
}: PrSizeMetricsProps) {
  const { t } = useTranslation()
  const isCompact = variant === 'compact'
  const iconClass = isCompact ? 'h-3 w-3 shrink-0' : 'h-3 w-3 shrink-0 opacity-80'
  const textClass = isCompact ? 'min-w-0 truncate text-[10px] leading-none tabular-nums' : 'text-[10px] leading-none tabular-nums'

  const hasCommits = showCount(commits)
  const hasFiles = showCount(changedFiles)
  const hasAdds = showCount(additions)
  const hasDels = showCount(deletions)
  const hasLines = hasAdds || hasDels

  if (!hasCommits && !hasFiles && !hasLines) return null

  if (isCompact) {
    return (
      <div
        className={cn(
          'grid shrink-0 items-center justify-items-start gap-0.5',
          COMPACT_GRID_COLS,
          'pointer-events-none',
          className
        )}
      >
        <MetricSegment
          segmentClass={COMPACT_SEGMENT_COMMIT}
          label={t('prManager.metrics.commits', { count: hasCommits ? commits : 0 })}
          visible={hasCommits}
          isCompact
        >
          <GitCommit className={cn(iconClass, COMPACT_METRIC_COMMIT)} aria-hidden />
          <span className={cn(textClass, COMPACT_METRIC_COMMIT)}>{commits}</span>
        </MetricSegment>
        <MetricSegment
          segmentClass={COMPACT_SEGMENT_FILES}
          label={t('prManager.metrics.files', { count: hasFiles ? changedFiles : 0 })}
          visible={hasFiles}
          isCompact
        >
          <FileCode className={cn(iconClass, COMPACT_METRIC_FILES)} aria-hidden />
          <span className={cn(textClass, COMPACT_METRIC_FILES)}>{changedFiles}</span>
        </MetricSegment>
        <MetricSegment
          segmentClass={COMPACT_SEGMENT_LINES}
          label={t('prManager.metrics.lines', {
            additions: hasAdds ? additions : 0,
            deletions: hasDels ? deletions : 0,
          })}
          visible={hasLines}
          isCompact
        >
          <FileDiff className={cn(iconClass, COMPACT_METRIC_LINES_ICON)} aria-hidden />
          <span className={cn('inline-flex min-w-0 items-center gap-px', textClass)}>
            {hasAdds ? <span className={COMPACT_METRIC_ADD}>+{additions}</span> : null}
            {hasDels ? <span className={COMPACT_METRIC_DEL}>−{deletions}</span> : null}
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
      {hasCommits
        ? wrap(
            'commits',
            t('prManager.metrics.commits', { count: commits }),
            <>
              <GitCommit className={iconClass} aria-hidden />
              <span className={textClass}>{commits}</span>
            </>
          )
        : null}
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
  ghPrCommits?: number | null
  ghPrChangedFiles?: number | null
  ghPrAdditions?: number | null
  ghPrDeletions?: number | null
}): Pick<PrSizeMetricsProps, 'commits' | 'changedFiles' | 'additions' | 'deletions'> {
  return {
    commits: cp.ghPrCommits,
    changedFiles: cp.ghPrChangedFiles,
    additions: cp.ghPrAdditions,
    deletions: cp.ghPrDeletions,
  }
}
