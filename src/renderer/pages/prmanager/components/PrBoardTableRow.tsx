'use client'

import { ShieldAlert } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { TableCell, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { PrCheckpointTemplate } from '../hooks/usePrData'
import { PrBoardCheckpointCell } from './PrBoardCheckpointCell'
import { PrBoardScopedSyncIcon, PrSyncStatusChangeDot } from './PrBoardScopedSyncIcon'
import type { PrBoardRowAction } from './prBoardRowActions'
import type { PrBoardRowViewModel } from './prBoardTableModel'
import { COL_BRANCH, COL_DIVIDER_B, COL_DIVIDER_RB, COL_PR_CHECKPOINT, SHOW_NOTE_COLUMN } from './prBoardTableConstants'
import { formatScopedSyncTooltip } from './prBoardSyncStorage'

type PrBoardTableRowProps = {
  rowVm: PrBoardRowViewModel
  activeTemplates: PrCheckpointTemplate[]
  showTableBorders: boolean
  prMergeCellStyle: import('./prBoardTableConstants').PrMergeCellVisualStyle
  canOpenInApp: boolean
  isBranchSyncing: boolean
  syncDisabled: boolean
  noteDraft: string | undefined
  noteValue: string
  onNoteChange: (rowId: string, value: string) => void
  dispatchRowAction: (action: PrBoardRowAction) => void
  repoCell?: React.ReactNode
}

export const PrBoardTableRow = memo(function PrBoardTableRow({
  rowVm,
  activeTemplates,
  showTableBorders,
  prMergeCellStyle,
  canOpenInApp,
  isBranchSyncing,
  syncDisabled,
  noteDraft,
  noteValue,
  onNoteChange,
  dispatchRowAction,
  repoCell,
}: PrBoardTableRowProps) {
  const { t, i18n } = useTranslation()
  const {
    row,
    rowId,
    vis,
    isSelected,
    mergeMetricsAlignment,
    isRowSyncLocked,
    branchProtected,
    branchHasStatusChange,
    branchStatusChangeCount,
    branchSyncMs,
  } = rowVm
  const rowToneCls = isSelected ? 'bg-primary/15 dark:bg-primary/10' : vis.row

  return (
    <TableRow
      key={rowId}
      data-row-id={rowId}
      className={cn(
        'align-top',
        showTableBorders ? 'border-b-0' : 'border-b border-b-border/60',
        rowToneCls,
        isRowSyncLocked && 'pointer-events-none opacity-[0.65]'
      )}
    >
      {repoCell}
      <TableCell className={cn(COL_BRANCH, showTableBorders && COL_DIVIDER_RB, 'text-xs align-top', rowToneCls)}>
        <div className="flex min-w-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 justify-start hover:bg-accent/60"
                  disabled={syncDisabled}
                  aria-label={
                    branchHasStatusChange
                      ? t('prManager.board.syncBranchStatusChangedAria', { count: branchStatusChangeCount })
                      : t('prManager.board.syncBranchFromGithubTitle')
                  }
                  onClick={e => {
                    e.stopPropagation()
                    dispatchRowAction({ type: 'syncBranch', rowId })
                  }}
                >
                  <PrBoardScopedSyncIcon syncMs={rowVm.effectiveBranchSyncMs} isSyncing={isBranchSyncing} />
                </Button>
                {branchHasStatusChange ? (
                  <PrSyncStatusChangeDot title={t('prManager.board.syncBranchStatusChangedHint', { count: branchStatusChangeCount })} />
                ) : null}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs space-y-1 text-xs">
              <p>{t('prManager.board.syncBranchFromGithubTitle')}</p>
              {branchHasStatusChange ? (
                <p className="text-emerald-800 dark:text-emerald-200">
                  {t('prManager.board.syncBranchStatusChangedHint', { count: branchStatusChangeCount })}
                </p>
              ) : null}
            </TooltipContent>
          </Tooltip>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate rounded-sm text-left text-xs font-inherit text-foreground hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => dispatchRowAction({ type: 'openBranchUrl', rowId })}
                >
                  {row.branchName}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {formatScopedSyncTooltip(branchSyncMs, i18n.language, t)}
              </TooltipContent>
            </Tooltip>
            {branchProtected ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    role="img"
                    className="inline-flex shrink-0 text-amber-600 dark:text-amber-400"
                    aria-label={t('prManager.board.branchGithubProtectedBadge')}
                  >
                    <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  {t('prManager.board.branchGithubProtectedBadge')}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
      </TableCell>
      {activeTemplates.map(tpl => {
        const cellVm = rowVm.mergeCellsByTplId.get(tpl.id)
        if (!cellVm) return null
        return (
          <TableCell
            key={tpl.id}
            className={cn(
              COL_PR_CHECKPOINT,
              showTableBorders && COL_DIVIDER_RB,
              'p-1 text-center align-middle !whitespace-normal',
              rowToneCls
            )}
          >
            <PrBoardCheckpointCell
              rowId={rowId}
              tpl={tpl}
              cp={cellVm.cp}
              companionPrCp={cellVm.companionPrCp}
              mergeMetricsAlignment={mergeMetricsAlignment}
              hasStatusChange={cellVm.hasStatusChange}
              statusChangeDetail={cellVm.statusChangeDetail}
              cellVisualStyle={prMergeCellStyle}
              canOpenInApp={canOpenInApp}
              dispatchRowAction={dispatchRowAction}
            />
          </TableCell>
        )
      })}
      {SHOW_NOTE_COLUMN && (
        <TableCell className={cn(showTableBorders && COL_DIVIDER_RB, rowToneCls)}>
          <Input
            value={noteDraft ?? noteValue}
            onChange={e => onNoteChange(rowId, e.target.value)}
            onBlur={() => dispatchRowAction({ type: 'noteBlur', rowId })}
            placeholder={t('prManager.board.notePlaceholder')}
            className="h-7 border-transparent bg-transparent text-xs focus-visible:border-input focus-visible:bg-background"
          />
        </TableCell>
      )}
      <TableCell className={cn('w-10 p-1 text-center align-middle', showTableBorders && COL_DIVIDER_B, rowToneCls)} onClick={e => e.stopPropagation()}>
        <Checkbox
          checked={rowVm.isSelected}
          onCheckedChange={() => dispatchRowAction({ type: 'toggleSelect', rowId })}
          aria-label={t('prManager.bulk.selectRow')}
          className="mx-auto"
        />
      </TableCell>
    </TableRow>
  )
})
