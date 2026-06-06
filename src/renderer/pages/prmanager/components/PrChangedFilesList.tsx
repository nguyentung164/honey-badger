'use client'

import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { PrChangedFileView } from './prChangedFileTypes'
import {
  COMPACT_STATUS_BADGE,
  FILE_STATUS_BADGE,
  METRIC_BADGE,
  changedFileBasename,
  fileStatusBadgeClass,
} from './prChangedFileTypes'
import { DiffPatchBlock } from './prDiffPatch'
import { PrMetricLines } from './prMetricBadgeContent'

type PrChangedFilesListProps = {
  files: PrChangedFileView[]
  openFilename: string | null
  onOpenFilename: (filename: string | null) => void
  /** Highlight row (e.g. selected from union summary). */
  highlightFilenames?: Set<string>
  /** Filename có line count khác nhau giữa các panel PR. */
  lineMismatchFilenames?: Set<string>
  emptyLabel?: string
  onOpenBlobUrl?: (url: string) => void
  /** Ref callback per file row for scroll-into-view. */
  fileRowRef?: (filename: string, el: HTMLDivElement | null) => void
  panelId?: string
  registerDiffScrollContainer?: (panelId: string, filename: string, el: HTMLDivElement | null) => void
  onDiffScrollSync?: (sourcePanelId: string, scrollTop: number, scrollLeft: number) => void
  compact?: boolean
  diffMaxHeightClass?: string
}

export function PrChangedFilesList({
  files,
  openFilename,
  onOpenFilename,
  highlightFilenames,
  lineMismatchFilenames,
  emptyLabel,
  onOpenBlobUrl,
  fileRowRef,
  panelId,
  registerDiffScrollContainer,
  onDiffScrollSync,
  compact = false,
  diffMaxHeightClass,
}: PrChangedFilesListProps) {
  const { t } = useTranslation()

  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel ?? t('prManager.detail.noFileData')}</p>
  }

  return (
    <div className={cn('space-y-1.5', compact && 'space-y-1')}>
      {files.map(f => {
        const key = f.filename
        const isOpen = openFilename === key
        const highlighted = highlightFilenames?.has(key)
        const lineMismatch = lineMismatchFilenames?.has(key)
        const syncScroll = isOpen && panelId && registerDiffScrollContainer && onDiffScrollSync
        return (
          <div key={key} ref={el => fileRowRef?.(key, el)}>
            <Collapsible
              open={isOpen}
              onOpenChange={o => onOpenFilename(o ? key : openFilename === key ? null : openFilename)}
              className="overflow-hidden rounded-lg border border-border/60 bg-card/30"
            >
              <CollapsibleTrigger
                className={cn(
                  'flex w-full min-w-0 gap-2 px-2.5 text-left font-medium hover:bg-muted/50',
                  compact ? 'items-center py-1.5 text-[11px]' : 'items-start py-2 text-xs',
                  highlighted && 'bg-primary/15 dark:bg-primary/20 hover:bg-primary/20 dark:hover:bg-primary/25'
                )}
                type="button"
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Badge
                    className={cn(
                      compact ? COMPACT_STATUS_BADGE : FILE_STATUS_BADGE,
                      fileStatusBadgeClass(f.status),
                      'shrink-0'
                    )}
                  >
                    {f.status}
                  </Badge>
                  <span
                    className={cn(
                      'min-w-0 flex-1 [overflow-wrap:anywhere] break-words text-left leading-snug',
                      compact && 'truncate',
                      lineMismatch && 'text-red-600 dark:text-red-400'
                    )}
                    title={f.filename}
                  >
                    {compact ? changedFileBasename(f.filename) : f.filename}
                  </span>
                </div>
                <span
                  className={cn(
                    'flex shrink-0 flex-wrap items-center justify-end gap-0.5',
                    compact ? 'max-w-[40%]' : 'mt-0.5 max-w-[48%] sm:max-w-[40%]'
                  )}
                >
                  {f.patchTruncated ? (
                    <Badge variant="secondary" className={cn(METRIC_BADGE, 'font-normal text-amber-800 dark:text-amber-200')}>
                      {t('prManager.detail.patchTruncated')}
                    </Badge>
                  ) : null}
                  {f.additions > 0 || f.deletions > 0 ? (
                    <Badge variant="secondary" className={METRIC_BADGE}>
                      <PrMetricLines additions={f.additions} deletions={f.deletions} />
                    </Badge>
                  ) : null}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-border/40 p-1.5 pt-0">
                  {!f.patch ? (
                    <p className="pt-1 text-xs text-amber-800 dark:text-amber-200">
                      {t('prManager.detail.noPatch')}{' '}
                      {f.blobUrl && onOpenBlobUrl ? (
                        <button type="button" className="underline" onClick={() => onOpenBlobUrl(f.blobUrl!)}>
                          {t('prManager.detail.onGithub')}
                        </button>
                      ) : null}
                    </p>
                  ) : (
                    <div className="pt-1">
                      <DiffPatchBlock
                        patch={f.patch}
                        maxHeightClass={diffMaxHeightClass}
                        scrollContainerRef={
                          syncScroll ? el => registerDiffScrollContainer!(panelId!, key, el) : undefined
                        }
                        onScrollSync={
                          syncScroll ? (top, left) => onDiffScrollSync!(panelId!, top, left) : undefined
                        }
                      />
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )
      })}
    </div>
  )
}
