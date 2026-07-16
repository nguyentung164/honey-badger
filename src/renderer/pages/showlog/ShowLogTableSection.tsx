'use client'

import { type ColumnDef, flexRender, getCoreRowModel, getSortedRowModel, type Row, type SortingState, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { format } from 'date-fns'
import { BarChart3, CalendarIcon, History, Loader2, RefreshCcw, Search, Sparkles, ArrowDown, ArrowUp } from 'lucide-react'
import type React from 'react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { STATUS_ICON } from '@/components/ui-elements/StatusIcon'
import { getDateFnsLocale, getDateOnlyPattern } from '@/lib/dateUtils'
import i18n from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { LogEntry } from './ShowLog'

const ROW_HEIGHT = 24
const FILTER_CONTROL_CLASS = 'h-9 text-xs'

interface ShowLogVirtualRowProps {
  row: Row<LogEntry>
  virtualStart: number
  currentRevision: string
  versionControlSystem?: 'git' | 'svn'
  headCommitId?: string
  showGitActions: boolean
  onSelectRow: (rowId: string, revision: string, isSelected: boolean) => void
  onCherryPick?: (entry: LogEntry) => void
  onReset?: (entry: LogEntry, mode: 'soft' | 'mixed' | 'hard') => void
  onInteractiveRebase?: (entry: LogEntry) => void
}

const ShowLogVirtualRow = memo(function ShowLogVirtualRow({
  row,
  virtualStart,
  currentRevision,
  versionControlSystem,
  headCommitId,
  showGitActions,
  onSelectRow,
  onCherryPick,
  onReset,
  onInteractiveRebase,
}: ShowLogVirtualRowProps) {
  const { t } = useTranslation()
  const entry = row.original
  const commitId = entry.fullCommitId || entry.revision
  const isHead = versionControlSystem === 'git' && headCommitId && (commitId === headCommitId || entry.revision === headCommitId?.substring(0, 8))
  const isIncoming = entry.syncStatus === 'incoming'
  const isOutgoing = entry.syncStatus === 'outgoing'
  const isSelected = row.getIsSelected()

  const rowContent = (
    <TableRow
      data-selected={isSelected ? 'true' : undefined}
      onClick={() => onSelectRow(row.id, entry.revision, isSelected)}
      className={cn(
        'cursor-pointer absolute top-0 left-0 w-full flex',
        isSelected && '!bg-primary/15 hover:!bg-primary/10',
        isIncoming && '!bg-sky-500/10 hover:!bg-sky-500/15 text-sky-700 dark:text-sky-300',
        isOutgoing && '!bg-emerald-500/10 hover:!bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
      )}
      style={{
        transform: `translateY(${virtualStart}px)`,
        height: `${ROW_HEIGHT}px`,
      }}
    >
      {row.getVisibleCells().map((cell, index) => {
        const isCurrentRevision = row.getValue('revision') === currentRevision
        const cellContent = flexRender(cell.column.columnDef.cell, cell.getContext())
        const isMessageCell = cell.column.id === 'referenceId'
        return (
          <TableCell
            key={cell.id}
            className={cn(
              'p-0 h-6 px-2 flex items-center',
              index === 0 && 'justify-center',
              cell.column.id === 'filePath' && 'cursor-pointer',
              cell.column.id === 'referenceId' && 'overflow-hidden min-w-0',
              isCurrentRevision && !isIncoming && !isOutgoing && 'text-blue-700 dark:text-yellow-400',
            )}
            style={
              cell.column.id === 'referenceId'
                ? { flex: '1 1 0%', minWidth: 0 }
                : {
                    minWidth: `${cell.column.columnDef.minSize ?? cell.column.getSize()}px`,
                    width: `${cell.column.getSize()}px`,
                    flexShrink: 0,
                  }
            }
          >
            {isMessageCell ? (
              <div className="w-full min-h-full min-w-0 overflow-hidden cursor-default flex items-center" title={entry.message || String(row.getValue('referenceId') ?? '')}>
                {cellContent}
              </div>
            ) : (
              cellContent
            )}
          </TableCell>
        )
      })}
    </TableRow>
  )

  if (!showGitActions) return rowContent

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
      <ContextMenuContent>
        {onCherryPick && <ContextMenuItem onClick={() => onCherryPick(entry)}>{t('git.cherryPick.title')}</ContextMenuItem>}
        {onInteractiveRebase && (
          <ContextMenuItem onClick={() => onInteractiveRebase(entry)}>{t('git.interactiveRebase.fromHere', 'Interactive rebase from here')}</ContextMenuItem>
        )}
        {onReset && !isHead && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>{t('git.reset.title')}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onClick={() => onReset(entry, 'soft')}>{t('git.reset.soft')}</ContextMenuItem>
              <ContextMenuItem onClick={() => onReset(entry, 'mixed')}>{t('git.reset.mixed')}</ContextMenuItem>
              <ContextMenuItem onClick={() => onReset(entry, 'hard')} variant="destructive">
                {t('git.reset.hard')}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})

interface ShowLogTableSectionProps {
  filteredLogData: LogEntry[]
  columns: ColumnDef<LogEntry>[]
  rowSelection: Record<string, boolean>
  setRowSelection: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  selectRevision: (revision: string) => void
  currentRevision: string
  sorting: SortingState
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>
  searchTerm: string
  setSearchTerm: (s: string) => void
  isLoading: boolean
  totalEntriesFromBackend: number
  variant: 'default' | 'outline' | 'ghost' | 'link' | 'destructive' | 'secondary'
  versionControlSystem?: 'git' | 'svn'
  headCommitId?: string
  onCherryPick?: (entry: LogEntry) => void
  onReset?: (entry: LogEntry, mode: 'soft' | 'mixed' | 'hard') => void
  onInteractiveRebase?: (entry: LogEntry) => void
  dateRange?: DateRange
  setDateRange?: (range: DateRange | undefined) => void
  onRefresh?: () => void
  onOpenStatistic?: () => void
  onOpenAIAnalysis?: () => void
  onOpenAnalysisHistory?: () => void
  logSyncUpstream?: string | null
  logSyncCompareRef?: string | null
  incomingCommitCount?: number
  outgoingCommitCount?: number
  logSyncUpstreamSource?: 'tracking' | 'origin_branch' | 'origin_head' | 'none' | null
  hasMoreGitLog?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
  loadedGitLogCount?: number
  onGitPull?: () => void | Promise<void>
  isGitPulling?: boolean
  onGitPush?: () => void | Promise<void>
  isGitPushing?: boolean
}

export const ShowLogTableSection = memo(function ShowLogTableSection({
  filteredLogData,
  columns,
  rowSelection,
  setRowSelection,
  selectRevision,
  currentRevision,
  sorting,
  setSorting,
  searchTerm,
  setSearchTerm,
  isLoading,
  totalEntriesFromBackend,
  variant,
  versionControlSystem,
  headCommitId,
  onCherryPick,
  onReset,
  onInteractiveRebase,
  dateRange,
  setDateRange,
  onRefresh,
  onOpenStatistic,
  onOpenAIAnalysis,
  onOpenAnalysisHistory,
  logSyncUpstream,
  logSyncCompareRef,
  incomingCommitCount = 0,
  outgoingCommitCount = 0,
  logSyncUpstreamSource,
  hasMoreGitLog = false,
  isLoadingMore = false,
  onLoadMore,
  loadedGitLogCount = 0,
  onGitPull,
  isGitPulling = false,
  onGitPush,
  isGitPushing = false,
}: ShowLogTableSectionProps) {
  const { t } = useTranslation()
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [datePickerValue, setDatePickerValue] = useState<DateRange | undefined>(undefined)

  const tableContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDatePickerValue(dateRange)
  }, [dateRange])

  const locale = getDateFnsLocale(i18n.language)
  const dateFormat = getDateOnlyPattern(i18n.language)

  const table = useReactTable({
    data: filteredLogData,
    columns,
    getRowId: row => row.revision,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: true,
    enableRowSelection: true,
    state: {
      sorting,
      rowSelection,
      columnVisibility: { message: false },
    },
  })

  const { rows } = table.getRowModel()

  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    onChange: instance => {
      if (versionControlSystem !== 'git' || !onLoadMore || !hasMoreGitLog || isLoadingMore || isLoading) return
      const items = instance.getVirtualItems()
      const lastItem = items[items.length - 1]
      if (lastItem && lastItem.index >= instance.options.count - 8) {
        onLoadMore()
      }
    },
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const showGitActions = versionControlSystem === 'git' && !!(onCherryPick || onReset || onInteractiveRebase)

  const handleSelectRow = useCallback(
    (rowId: string, revision: string, isSelected: boolean) => {
      if (!isSelected) {
        setRowSelection({ [rowId]: true })
        selectRevision(revision)
      }
    },
    [selectRevision, setRowSelection],
  )

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="mb-2 flex items-center gap-2 shrink-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative w-100 shrink-0">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('dialog.showLogs.placeholderSearch')}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={cn('w-full pl-8', FILTER_CONTROL_CLASS)}
            />
          </div>

          {setDateRange && versionControlSystem !== 'git' ? (
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={variant}
                  className={cn(
                    FILTER_CONTROL_CLASS,
                    'shrink-0 justify-start px-3 font-normal',
                    !dateRange?.from && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {dateRange?.from
                      ? dateRange.to
                        ? `${format(dateRange.from, dateFormat, { locale })} - ${format(dateRange.to, dateFormat, { locale })}`
                        : format(dateRange.from, dateFormat, { locale })
                      : t('taskManagement.chartAllTime')}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  locale={locale}
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={datePickerValue ?? dateRange}
                  onSelect={v => setDatePickerValue(v)}
                  numberOfMonths={2}
                />
                <div className="flex gap-2 border-t p-2">
                  <Button
                    variant={variant}
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setDateRange(undefined)
                      setDatePickerValue(undefined)
                      setDatePickerOpen(false)
                      setTimeout(() => onRefresh?.(), 100)
                    }}
                  >
                    {t('taskManagement.chartAllTime')}
                  </Button>
                  <Button
                    variant={variant}
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      const value = datePickerValue ?? dateRange
                      if (value?.from) {
                        setDateRange(value)
                        setDatePickerOpen(false)
                        setTimeout(() => onRefresh?.(), 100)
                      }
                    }}
                  >
                    {t('common.confirm')}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}

          {onRefresh ? (
            <Button variant={variant} className={cn(FILTER_CONTROL_CLASS, 'shrink-0 gap-1.5 px-3')} disabled={isLoading} onClick={onRefresh}>
              {isLoading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5 shrink-0" />}
              <span>{t('common.refresh')}</span>
            </Button>
          ) : null}

          {versionControlSystem === 'git' && onGitPull && !isLoading && incomingCommitCount > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={variant}
                  className={cn(
                    FILTER_CONTROL_CLASS,
                    'shrink-0 gap-1.5 px-3 border border-sky-500/40 bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 dark:text-sky-300',
                  )}
                  disabled={isLoading || isGitPulling}
                  onClick={() => void onGitPull()}
                >
                  {isGitPulling ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <ArrowDown className="h-3.5 w-3.5 shrink-0" />}
                  <span>
                    {t('showlog.incomingCommit')} ({incomingCommitCount})
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('showlog.incomingCommitHint', { upstream: logSyncUpstream ?? 'origin' })}</TooltipContent>
            </Tooltip>
          ) : null}

          {versionControlSystem === 'git' && onGitPush && !isLoading && outgoingCommitCount > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={variant}
                  className={cn(
                    FILTER_CONTROL_CLASS,
                    'shrink-0 gap-1.5 px-3 border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300',
                  )}
                  disabled={isLoading || isGitPushing}
                  onClick={() => void onGitPush()}
                >
                  {isGitPushing ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5 shrink-0" />}
                  <span>
                    {t('showlog.outgoingCommitAction')} ({outgoingCommitCount})
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('showlog.outgoingCommitHint', { upstream: logSyncUpstream ?? 'origin' })}</TooltipContent>
            </Tooltip>
          ) : null}

          {versionControlSystem === 'git' && logSyncUpstreamSource === 'none' && !isLoading ? (
            <span
              className="inline-flex max-w-[280px] shrink-0 items-center rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300"
              title={t('showlog.noUpstreamHint')}
            >
              {t('showlog.noUpstreamHint')}
            </span>
          ) : null}

          {versionControlSystem === 'git' && logSyncUpstream && logSyncUpstreamSource && logSyncUpstreamSource !== 'none' ? (
            <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground">
              <span
                className="truncate max-w-[160px]"
                title={
                  logSyncUpstreamSource === 'tracking'
                    ? t('showlog.incomingCommitHint', { upstream: logSyncUpstream })
                    : t('showlog.inferredUpstreamHint', { upstream: logSyncUpstream })
                }
              >
                {logSyncCompareRef && logSyncCompareRef !== 'HEAD' ? `${logSyncCompareRef} → ` : ''}
                {logSyncUpstream}
              </span>
              {logSyncUpstreamSource !== 'tracking' ? (
                <span
                  className="inline-flex shrink-0 items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-800 dark:text-amber-300"
                  title={t('showlog.inferredUpstreamHint', { upstream: logSyncUpstream })}
                >
                  {t('showlog.inferredUpstream')}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {onOpenStatistic ? (
            <Button variant={variant} className={cn(FILTER_CONTROL_CLASS, 'shrink-0 gap-1.5 px-3')} disabled={isLoading} onClick={onOpenStatistic}>
              <BarChart3 className="h-3.5 w-3.5 shrink-0" />
              <span>{t('showlog.statistics')}</span>
            </Button>
          ) : null}

          {onOpenAIAnalysis ? (
            <Button variant={variant} className={cn(FILTER_CONTROL_CLASS, 'shrink-0 gap-1.5 px-3')} disabled={isLoading} onClick={onOpenAIAnalysis}>
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>{t('showlog.aiAnalysis')}</span>
            </Button>
          ) : null}

          {onOpenAnalysisHistory ? (
            <Button variant={variant} className={cn(FILTER_CONTROL_CLASS, 'shrink-0 gap-1.5 px-3')} disabled={isLoading} onClick={onOpenAnalysisHistory}>
              <History className="h-3.5 w-3.5 shrink-0" />
              <span>{t('showlog.analysisHistory')}</span>
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col border rounded-md flex-1 min-h-0 overflow-hidden">
        <div ref={tableContainerRef} className="overflow-auto flex-1 min-h-0 relative">
          {rows.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">{t('common.noData')}</p>
            </div>
          ) : (
            <table className="w-full caption-bottom text-sm table-auto border-collapse" style={{ display: 'grid' }}>
              <TableHeader sticky style={{ display: 'grid', position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'var(--table-header-bg)' }}>
                {table.getHeaderGroups().map(headerGroup => (
                  <TableRow key={headerGroup.id} className="flex w-full">
                    {headerGroup.headers.map((header, index) => (
                      <TableHead
                        key={header.id}
                        style={
                          header.column.id === 'referenceId'
                            ? { flex: '1 1 0%', minWidth: 0 }
                            : ['revision', 'date', 'author'].includes(header.column.id)
                              ? { minWidth: `${header.column.columnDef.minSize ?? header.getSize()}px`, width: '1%', flexShrink: 0 }
                              : { width: `${header.getSize()}px`, minWidth: `${header.column.columnDef.minSize ?? 0}px`, flexShrink: 0 }
                        }
                        className={cn('relative group h-9 px-2 flex items-center', '!text-[var(--table-header-fg)]', index === 0 && 'justify-center')}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody
                className="relative [&>tr[data-selected=true]]:!bg-primary/15 [&>tr[data-selected=true]]:hover:!bg-primary/10"
                style={{
                  display: 'grid',
                  height: `${rowVirtualizer.getTotalSize()}px`,
                }}
              >
                {virtualItems.map(virtualRow => {
                  const row = rows[virtualRow.index] as Row<LogEntry>
                  return (
                    <ShowLogVirtualRow
                      key={row.id}
                      row={row}
                      virtualStart={virtualRow.start}
                      currentRevision={currentRevision}
                      versionControlSystem={versionControlSystem}
                      headCommitId={headCommitId}
                      showGitActions={showGitActions}
                      onSelectRow={handleSelectRow}
                      onCherryPick={onCherryPick}
                      onReset={onReset}
                      onInteractiveRebase={onInteractiveRebase}
                    />
                  )
                })}
              </TableBody>
            </table>
          )}
        </div>
      </div>
      {isLoading && filteredLogData.length === 0 && <div className="flex shrink-0 items-center pt-2 px-1 text-sm text-muted-foreground">Loading...</div>}
      {!isLoading && filteredLogData.length > 0 && (
        <div className="flex shrink-0 items-center gap-3 pt-2 px-1">
          {versionControlSystem === 'git' ? (
            <>
              <span className="text-xs text-muted-foreground sm:text-sm">
                {searchTerm.trim()
                  ? t('dialog.showLogs.filtered', { 0: filteredLogData.length })
                  : t('dialog.showLogs.totalEntries', { 0: loadedGitLogCount })}
                {hasMoreGitLog ? ` · ${t('showlog.scrollForMore', 'Scroll for more')}` : ''}
              </span>
              {isLoadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
            </>
          ) : (
            <span className="text-xs text-muted-foreground sm:text-sm">
              {`${t('dialog.showLogs.totalEntries', { 0: totalEntriesFromBackend })} ${searchTerm.trim() ? `(${t('dialog.showLogs.filtered', { 0: filteredLogData.length })})` : ''}`}
            </span>
          )}
        </div>
      )}
    </div>
  )
})
