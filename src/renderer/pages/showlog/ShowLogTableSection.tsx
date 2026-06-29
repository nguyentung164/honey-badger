'use client'

import { type ColumnDef, flexRender, getCoreRowModel, getSortedRowModel, type Row, type SortingState, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { format } from 'date-fns'
import { BarChart3, CalendarIcon, History, Loader2, RefreshCcw, Search, Sparkles } from 'lucide-react'
import type React from 'react'
import { memo, useEffect, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'
import { GIT_STATUS_COLOR_CLASS_MAP, GIT_STATUS_TEXT, STATUS_COLOR_CLASS_MAP, STATUS_TEXT } from '@/components/shared/constants'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DEFAULT_TABLE_PAGE_SIZE_OPTIONS, TablePaginationBar } from '@/components/ui/table-pagination-bar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { STATUS_ICON } from '@/components/ui-elements/StatusIcon'
import { getDateFnsLocale, getDateOnlyPattern } from '@/lib/dateUtils'
import i18n from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { LogEntry } from './ShowLog'

const ROW_HEIGHT = 24
const FILTER_CONTROL_CLASS = 'h-9 text-xs'

function LogRowTooltipContent({ entry, versionControlSystem }: { entry: LogEntry; versionControlSystem?: 'git' | 'svn' }) {
  const { t } = useTranslation()
  const statusTextMap = versionControlSystem === 'git' ? GIT_STATUS_TEXT : STATUS_TEXT
  const colorMap = versionControlSystem === 'git' ? GIT_STATUS_COLOR_CLASS_MAP : STATUS_COLOR_CLASS_MAP
  const actionCounts = new Map<string, number>()
  for (const file of entry.changedFiles || []) {
    const count = actionCounts.get(file.action) || 0
    actionCounts.set(file.action, count + 1)
  }
  return (
    <div className="flex flex-col gap-2.5 min-w-[200px] max-w-[560px] text-popover-foreground">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <span className="font-medium shrink-0 text-muted-foreground">{t('dialog.showLogs.author')}</span>
        <span className="text-popover-foreground break-words">{entry.author}</span>
        {entry.email && (
          <>
            <span className="font-medium shrink-0 text-muted-foreground">{t('dialog.showLogs.email')}</span>
            <span className="text-popover-foreground break-words">{entry.email}</span>
          </>
        )}
        <span className="font-medium shrink-0 text-muted-foreground">{t('dialog.showLogs.date')}</span>
        <span className="text-popover-foreground">{entry.date}</span>
        <span className="font-medium shrink-0 pt-0.5 text-muted-foreground">{t('dialog.showLogs.action')}</span>
        <div className="flex flex-wrap gap-1.5 items-center">
          {entry.action.map(code => {
            const label = (statusTextMap as Record<string, string>)[code] ? t((statusTextMap as Record<string, string>)[code]) : code
            const Icon = (STATUS_ICON as Record<string, React.ElementType>)[code]
            const colorClass = (colorMap as Record<string, string>)[code] ?? 'text-popover-foreground'
            const count = actionCounts.get(code) ?? 0
            return (
              <span key={code} className="inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded">
                {Icon ? <Icon strokeWidth={2.5} className={cn('w-3.5 h-3.5', colorClass)} /> : null}
                <span className="text-popover-foreground">{label}</span>
                {count > 0 && <span className="text-muted-foreground text-[10px]">({count})</span>}
              </span>
            )
          })}
        </div>
      </div>
      <div className="border-t border-border pt-2">
        <span className="font-medium text-xs block mb-1 text-muted-foreground">{t('dialog.showLogs.message')}</span>
        <span className="text-popover-foreground text-xs whitespace-pre-wrap break-words block max-h-[200px] overflow-y-auto leading-relaxed">{entry.message || '-'}</span>
      </div>
    </div>
  )
}

interface ShowLogTableSectionProps {
  dataForCurrentPage: LogEntry[]
  columns: ColumnDef<LogEntry>[]
  rowSelection: Record<string, boolean>
  setRowSelection: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  selectRevision: (revision: string) => void
  currentRevision: string
  sorting: SortingState
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>
  searchTerm: string
  setSearchTerm: (s: string) => void
  filteredLogData: LogEntry[]
  isLoading: boolean
  totalEntriesFromBackend: number
  handlePageChange: (page: number) => void
  currentPage: number
  totalPages: number
  pageSize: number
  onPageSizeChange: (size: number) => void
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
}

export const ShowLogTableSection = memo(function ShowLogTableSection({
  dataForCurrentPage,
  columns,
  rowSelection,
  setRowSelection,
  selectRevision,
  currentRevision,
  sorting,
  setSorting,
  searchTerm,
  setSearchTerm,
  filteredLogData,
  isLoading,
  totalEntriesFromBackend,
  handlePageChange,
  currentPage,
  totalPages,
  pageSize,
  onPageSizeChange,
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
    data: dataForCurrentPage,
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
    overscan: 10,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

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

          {setDateRange ? (
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
                            : ['revision', 'date', 'author', 'action'].includes(header.column.id)
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
                className="relative [&>tr[data-state=selected]]:!bg-primary/15 [&>tr[data-state=selected]]:hover:!bg-primary/10"
                style={{
                  display: 'grid',
                  height: `${rowVirtualizer.getTotalSize()}px`,
                }}
              >
                {virtualItems.map(virtualRow => {
                  const row = rows[virtualRow.index] as Row<LogEntry>
                  const entry = row.original
                  const commitId = entry.fullCommitId || entry.revision
                  const isHead = versionControlSystem === 'git' && headCommitId && (commitId === headCommitId || entry.revision === headCommitId?.substring(0, 8))
                  const showGitActions = versionControlSystem === 'git' && (onCherryPick || onReset)

                  const rowContent = (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      onClick={() => {
                        if (!row.getIsSelected()) {
                          setRowSelection({ [row.id]: true })
                          selectRevision(row.original.revision)
                        }
                      }}
                      className="cursor-pointer data-[state=selected]:!bg-primary/15 data-[state=selected]:hover:!bg-primary/10 absolute top-0 left-0 w-full flex"
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
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
                              isCurrentRevision && 'text-blue-700 dark:text-yellow-400'
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
                              <Tooltip delayDuration={300}>
                                <TooltipTrigger asChild>
                                  <div className="w-full min-h-full min-w-0 overflow-hidden cursor-default flex items-center">{cellContent}</div>
                                </TooltipTrigger>
                                <TooltipContent side="top" sideOffset={2} className="max-w-[560px] p-3 shadow-lg">
                                  <LogRowTooltipContent entry={entry} versionControlSystem={versionControlSystem} />
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              cellContent
                            )}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )

                  return showGitActions ? (
                    <ContextMenu key={row.id}>
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
                  ) : (
                    rowContent
                  )
                })}
              </TableBody>
            </table>
          )}
        </div>
      </div>
      {isLoading && filteredLogData.length === 0 && <div className="flex shrink-0 items-center pt-2 px-1 text-sm text-muted-foreground">Loading...</div>}
      {!isLoading && filteredLogData.length > 0 && (
        <TablePaginationBar
          className="pt-2"
          page={currentPage}
          totalPages={Math.max(1, totalPages)}
          totalItems={filteredLogData.length}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={onPageSizeChange}
          leftSlot={
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="text-xs text-muted-foreground sm:text-sm">
                {`${t('dialog.showLogs.totalEntries', { 0: totalEntriesFromBackend })} ${searchTerm.trim() ? `(${t('dialog.showLogs.filtered', { 0: filteredLogData.length })})` : ''}`}
              </span>
              <Select value={String(pageSize)} onValueChange={v => onPageSizeChange(Number(v))}>
                <SelectTrigger className="w-[90px]" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_TABLE_PAGE_SIZE_OPTIONS.map(n => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="whitespace-nowrap text-sm text-muted-foreground">{t('taskManagement.perPage', 'per page')}</span>
            </div>
          }
        />
      )}
    </div>
  )
})
