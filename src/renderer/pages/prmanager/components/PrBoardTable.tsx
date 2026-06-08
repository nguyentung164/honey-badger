'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { cn } from '@/lib/utils'
import { checkpointTableHeadGroupClass } from '../checkpointHeaderGroup'
import type { PrCheckpointTemplate } from '../hooks/usePrData'
import type { RepoBaseInsightsMap } from '../repoBaseBranchInsights'
import { PrBoardTableRepoCell } from './PrBoardTableRepoCell'
import { PrBoardTableRow } from './PrBoardTableRow'
import type { PrBoardRowAction } from './prBoardRowActions'
import type { PrBoardTableViewModel } from './prBoardTableModel'
import {
  COL_BRANCH,
  COL_DIVIDER_B,
  COL_DIVIDER_RB,
  COL_PR_CHECKPOINT,
  PAGE_SIZE_OPTIONS,
  PR_BOARD_REPO_GROUP_TBODY_HOVER_CLASS,
  SHOW_NOTE_COLUMN,
  writePrBoardPageSize,
  type PageSizeChoice,
  type PrMergeCellVisualStyle,
} from './prBoardTableConstants'

type GithubSyncUiState = { kind: 'idle' } | { kind: 'full' } | { kind: 'repo'; repoId: string } | { kind: 'branch'; rowId: string }

type PrBoardTableProps = {
  viewModel: PrBoardTableViewModel
  activeTemplates: PrCheckpointTemplate[]
  orderedPrCheckpointTemplates: PrCheckpointTemplate[]
  showTableBlockingOverlay: boolean
  showTableBorders: boolean
  prMergeCellStyle: PrMergeCellVisualStyle
  filteredRowsEmpty: boolean
  existenceCheckPending: boolean
  searchRowsCount: number
  remoteFilteredRowsEmpty: boolean
  onlyExistingOnRemote: boolean
  projectId: string
  pageSize: PageSizeChoice
  projectBaseBranches: string[]
  repoBaseInsights: RepoBaseInsightsMap
  repoBaseInsightsLoading: boolean
  githubTokenOk: boolean
  userId: string | null
  isAnyGithubSync: boolean
  githubSyncUi: GithubSyncUiState
  noteDraft: Record<string, string>
  prColumnLegendItems: Array<{ dotBright: string; label: string }>
  autoSyncGithub: boolean
  onScrollCapture?: () => void
  onToggleSelectAllPage: () => void
  onPageChange: (page: number | ((p: number) => number)) => void
  onPageSizeChange: (size: PageSizeChoice) => void
  onPersistTableBorders: (on: boolean) => void
  onPersistPrMergeCellStyle: (s: PrMergeCellVisualStyle) => void
  onNoteChange: (rowId: string, value: string) => void
  dispatchRowAction: (action: PrBoardRowAction) => void
  onSyncRepo: (repoId: string) => void
}

export const PrBoardTable = memo(function PrBoardTable({
  viewModel,
  activeTemplates,
  orderedPrCheckpointTemplates,
  showTableBlockingOverlay,
  showTableBorders,
  prMergeCellStyle,
  filteredRowsEmpty,
  existenceCheckPending,
  searchRowsCount,
  remoteFilteredRowsEmpty,
  onlyExistingOnRemote,
  projectId,
  pageSize,
  projectBaseBranches,
  repoBaseInsights,
  repoBaseInsightsLoading,
  githubTokenOk,
  userId,
  isAnyGithubSync,
  githubSyncUi,
  noteDraft,
  prColumnLegendItems,
  autoSyncGithub,
  onScrollCapture,
  onToggleSelectAllPage,
  onPageChange,
  onPageSizeChange,
  onPersistTableBorders,
  onPersistPrMergeCellStyle,
  onNoteChange,
  dispatchRowAction,
  onSyncRepo,
}: PrBoardTableProps) {
  const { t } = useTranslation()
  const syncDisabled = isAnyGithubSync || !githubTokenOk || !userId?.trim()
  const canOpenInApp = githubTokenOk

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
      {showTableBlockingOverlay ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/60 backdrop-blur-[1px]" aria-busy="true" aria-live="polite">
          <GlowLoader className="h-10 w-10" />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain" onScrollCapture={autoSyncGithub ? onScrollCapture : undefined}>
        <Table>
          <TableHeader className="border-b-2 border-b-border shadow-sm">
            <TableRow className="hover:bg-transparent">
              <TableHead
                className={cn(
                  'sticky top-0 z-20 w-0 min-w-[220px] max-w-[min(900px,96vw)] whitespace-normal bg-muted/95 px-2 pr-3 text-left align-top backdrop-blur-sm',
                  showTableBorders && COL_DIVIDER_RB
                )}
              >
                {t('prManager.board.colRepo')}
              </TableHead>
              <TableHead className={cn(COL_BRANCH, 'sticky top-0 z-20 bg-muted/95 backdrop-blur-sm', showTableBorders && COL_DIVIDER_RB)}>
                <span className="block truncate">{t('prManager.board.colBranch')}</span>
              </TableHead>
              {activeTemplates.map(tpl => (
                <TableHead
                  key={tpl.id}
                  className={cn(
                    'sticky top-0 z-20 min-w-[72px] whitespace-normal px-1.5 text-center align-top backdrop-blur-sm',
                    checkpointTableHeadGroupClass(tpl.headerGroupId),
                    COL_PR_CHECKPOINT,
                    showTableBorders && COL_DIVIDER_RB
                  )}
                >
                  <span className="block w-full truncate text-xs font-medium" title={tpl.label}>
                    {tpl.label}
                  </span>
                </TableHead>
              ))}
              {SHOW_NOTE_COLUMN && (
                <TableHead className={cn('sticky top-0 z-20 min-w-[180px] bg-muted/95 backdrop-blur-sm', showTableBorders && COL_DIVIDER_RB)}>
                  {t('prManager.board.colNote')}
                </TableHead>
              )}
              <TableHead className={cn('sticky top-0 z-20 w-10 bg-muted/95 px-1 text-center backdrop-blur-sm', showTableBorders && COL_DIVIDER_B)}>
                <Checkbox
                  checked={viewModel.allPageSelected ? true : viewModel.somePageSelected ? 'indeterminate' : false}
                  onCheckedChange={() => onToggleSelectAllPage()}
                  disabled={viewModel.pageRowIds.length === 0}
                  aria-label={t('prManager.bulk.selectPage')}
                  className="mx-auto"
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          {filteredRowsEmpty ? (
            <TableBody>
              <TableRow className={showTableBorders ? 'border-b-0' : undefined}>
                <TableCell
                  colSpan={3 + activeTemplates.length + (SHOW_NOTE_COLUMN ? 1 : 0)}
                  className={cn('py-8 text-center text-sm text-muted-foreground', showTableBorders && COL_DIVIDER_B)}
                >
                  {existenceCheckPending && searchRowsCount > 0
                    ? t('prManager.board.emptyFilterChecking')
                    : onlyExistingOnRemote && !existenceCheckPending && searchRowsCount > 0 && remoteFilteredRowsEmpty
                      ? t('prManager.board.emptyNoRemote')
                      : t('prManager.board.emptyNoMatch')}
                </TableCell>
              </TableRow>
            </TableBody>
          ) : (
            viewModel.groups.map(group => (
              <TableBody
                key={group.repoKey}
                className={cn('[&>tr:nth-child(odd)]:bg-transparent [&>tr:nth-child(even)]:bg-transparent [&>tr:hover]:bg-transparent', PR_BOARD_REPO_GROUP_TBODY_HOVER_CLASS)}
              >
                {group.rows.map(rowVm => (
                  <PrBoardTableRow
                    key={rowVm.rowId}
                    rowVm={rowVm}
                    activeTemplates={activeTemplates}
                    showTableBorders={showTableBorders}
                    prMergeCellStyle={prMergeCellStyle}
                    canOpenInApp={canOpenInApp}
                    isBranchSyncing={githubSyncUi.kind === 'branch' && githubSyncUi.rowId === rowVm.rowId}
                    syncDisabled={syncDisabled}
                    noteDraft={noteDraft[rowVm.rowId]}
                    noteValue={rowVm.row.note ?? ''}
                    onNoteChange={onNoteChange}
                    dispatchRowAction={dispatchRowAction}
                    repoCell={
                      rowVm.isFirstInGroup ? (
                        <PrBoardTableRepoCell
                          group={group}
                          showTableBorders={showTableBorders}
                          isRepoSyncing={githubSyncUi.kind === 'repo' && githubSyncUi.repoId === group.repoId}
                          syncDisabled={syncDisabled}
                          orderedPrCheckpointTemplates={orderedPrCheckpointTemplates}
                          repoBaseInsights={repoBaseInsights}
                          repoBaseInsightsLoading={repoBaseInsightsLoading}
                          projectBaseBranches={projectBaseBranches}
                          onSyncRepo={onSyncRepo}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </TableBody>
            ))
          )}
        </Table>
      </div>
      {!filteredRowsEmpty && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border/50 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground dark:bg-muted/12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {viewModel.totalRowCount === 0
                ? t('prManager.board.zeroRows')
                : t('prManager.board.showRows', {
                  from: (viewModel.safePage - 1) * pageSize + 1,
                  to: Math.min(viewModel.safePage * pageSize, viewModel.totalRowCount),
                  total: viewModel.totalRowCount,
                })}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5">
                <span className="whitespace-nowrap">{t('prManager.board.rowsPerPage')}</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={v => {
                    const n = Number(v) as PageSizeChoice
                    onPageSizeChange(n)
                    writePrBoardPageSize(projectId, n)
                    onPageChange(1)
                  }}
                >
                  <SelectTrigger className="h-8 w-[84px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map(n => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-0.5">
                <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={viewModel.safePage <= 1} onClick={() => onPageChange(1)} title={t('prManager.board.firstPage')}>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={viewModel.safePage <= 1} onClick={() => onPageChange(p => Math.max(1, p - 1))} title={t('prManager.board.prevPage')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[4.5rem] px-1 text-center tabular-nums text-foreground">
                  {viewModel.safePage} / {viewModel.totalPages}
                </span>
                <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={viewModel.safePage >= viewModel.totalPages} onClick={() => onPageChange(p => Math.min(viewModel.totalPages, p + 1))} title={t('prManager.board.nextPage')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={viewModel.safePage >= viewModel.totalPages} onClick={() => onPageChange(viewModel.totalPages)} title={t('prManager.board.lastPage')}>
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 border-l border-border/60 pl-3 sm:pl-4">
                <Label htmlFor="pr-board-table-borders" className="cursor-pointer whitespace-nowrap text-xs text-muted-foreground" title={t('prManager.board.tableBordersHelp')}>
                  {t('prManager.board.tableBordersSwitch')}
                </Label>
                <Switch id="pr-board-table-borders" size="sm" checked={showTableBorders} onCheckedChange={v => onPersistTableBorders(v === true)} title={t('prManager.board.tableBordersHelp')} />
              </div>
              <div className="flex min-w-0 max-w-full flex-1 items-center gap-2 border-l border-border/60 pl-3 sm:pl-4 sm:max-w-[min(100%,20rem)]">
                <span className="shrink-0 text-xs text-muted-foreground" title={t('prManager.board.prMergeCellStyleHelp')}>
                  {t('prManager.board.prMergeCellStyleLabel')}
                </span>
                <Select
                  value={String(prMergeCellStyle)}
                  onValueChange={v => {
                    const n = Number(v)
                    if (n === 2 || n === 3 || n === 4) onPersistPrMergeCellStyle(n)
                    else onPersistPrMergeCellStyle(1)
                  }}
                >
                  <SelectTrigger id="pr-board-pr-merge-style" size="sm" className="h-8 min-w-0 flex-1 text-xs" title={t('prManager.board.prMergeCellStyleHelp')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('prManager.board.prMergeCellStyle1')}</SelectItem>
                    <SelectItem value="2">{t('prManager.board.prMergeCellStyle2')}</SelectItem>
                    <SelectItem value="3">{t('prManager.board.prMergeCellStyle3')}</SelectItem>
                    <SelectItem value="4">{t('prManager.board.prMergeCellStyle4')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div role="list" aria-label={t('prManager.board.prColumnLegendAria')} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/35 pt-2 text-muted-foreground/90 dark:text-muted-foreground/85">
            <span className="shrink-0 font-medium text-foreground/65 dark:text-foreground/55">{t('prManager.board.prColumnLegendTitle')}</span>
            {prColumnLegendItems.map((item, i) => (
              <span key={i} role="listitem" className="inline-flex items-center gap-1.5">
                <span className={cn('h-4 w-4 shrink-0 rounded-full border border-border/40 dark:border-border/35', item.dotBright)} aria-hidden />
                <span className="text-[11px] leading-none text-muted-foreground">{item.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})
