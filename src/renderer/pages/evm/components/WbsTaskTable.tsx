'use client'

import { format } from 'date-fns'
import { MoreVertical, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ACRow, EVMMaster, WBSRow } from 'shared/types/evm'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TablePaginationBar } from '@/components/ui/table-pagination-bar'
import toast from '@/components/ui-elements/Toast'
import { formatDateDisplay } from '@/lib/dateUtils'
import {
  acRowMatchesWbsForEvmExcel,
  buildWbsDayUnitsFromPlan,
  EVM_PERCENT_DONE_OPTIONS_DEFAULT,
  evmAssigneeDisplayName,
  evmScheduleSlipWorkingDays,
  planEndFromStartAndDurationWorkdays,
  planStartWbsDetailLine90,
} from '@/lib/evmCalculations'
import { cn } from '@/lib/utils'
import { matchesEvmAssigneeFilter, matchesEvmPhaseFilter } from '@/lib/evmUi'
import i18n from '@/lib/i18n'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useEVMStore } from '@/stores/useEVMStore'
import { useEvmAiInsightStore } from '@/stores/useEvmAiInsightStore'
import { EVM_SCHEDULE_ROW_PX } from './useEvmScheduleColumnVirtualizer'
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

/** Gán giờ AC vào dòng WBS theo phase + assignee + task/workContents (không có FK). */
export function buildAcHoursByWbsRowId(wbs: WBSRow[], ac: ACRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const w of wbs) {
    let sum = 0
    for (const a of ac) {
      if (!acRowMatchesWbsForEvmExcel(w, a)) continue
      sum += a.workingHours ?? 0
    }
    m.set(w.id, sum)
  }
  return m
}

export function WbsTaskTable({
  syncScheduleFilters = true,
  showAddButton = true,
  showCategoryFeatureColumns = true,
  acHoursByWbsId,
  trailingMetaColumns: trailingMetaColumnsProp,
  detailTableMode = 'full',
  hideFilterBar = false,
  parentPhaseFilter = 'all',
  parentAssigneeFilter = 'all',
}: {
  syncScheduleFilters?: boolean
  showAddButton?: boolean
  showCategoryFeatureColumns?: boolean
  acHoursByWbsId?: Map<string, number>
  trailingMetaColumns?: 'statusBac' | 'acHours' | 'none'
  detailTableMode?: 'full' | 'actualOnly'
  hideFilterBar?: boolean
  parentPhaseFilter?: string
  parentAssigneeFilter?: string
}) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const wbs = useEVMStore(s => s.wbs)
  const project = useEVMStore(s => s.project)
  const master = useEVMStore(s => s.master)
  const setScheduleFilters = useEvmAiInsightStore(s => s.setScheduleFilters)
  const updateWbsRow = useEVMStore(s => s.updateWbsRow)
  const removeWbsRow = useEVMStore(s => s.removeWbsRow)
  const replaceWbsDayUnitsForRow = useEVMStore(s => s.replaceWbsDayUnitsForRow)
  const nonWorkingDaysList = useMemo(() => master.nonWorkingDays.map(n => n.date), [master.nonWorkingDays])

  const [filterPhase, setFilterPhase] = useState<string>('all')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')
  const effPhase = hideFilterBar ? parentPhaseFilter : filterPhase
  const effAssignee = hideFilterBar ? parentAssigneeFilter : filterAssignee
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<string | null>(null)

  const filteredWbs = useMemo(() => {
    let list = wbs
    list = list.filter(r => matchesEvmPhaseFilter(r.phase, effPhase))
    list = list.filter(r => matchesEvmAssigneeFilter(r.assignee, effAssignee))
    return list
  }, [wbs, effPhase, effAssignee])

  const paginatedWbs = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredWbs.slice(start, start + pageSize)
  }, [filteredWbs, page, pageSize])

  const totalPages = Math.max(1, Math.ceil(filteredWbs.length / pageSize))

  const detailEditRow = useMemo(
    () => (editingId ? wbs.find(r => r.id === editingId) ?? null : null),
    [editingId, wbs],
  )

  useEffect(() => {
    setPage(1)
  }, [filterPhase, filterAssignee])

  useEffect(() => {
    setPage(1)
  }, [pageSize])

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  useEffect(() => {
    if (syncScheduleFilters) setScheduleFilters(effPhase, effAssignee)
  }, [effPhase, effAssignee, setScheduleFilters, syncScheduleFilters])

  const handleDelete = useCallback(async () => {
    if (toDelete) {
      try {
        await removeWbsRow(toDelete)
        setToDelete(null)
        toast.success(t('common.save'))
      } catch {
        toast.error(t('evm.saveFailed'))
      }
    }
  }, [toDelete, removeWbsRow, t])

  const trailingMeta: 'statusBac' | 'acHours' | 'none' =
    detailTableMode === 'actualOnly' ? 'none' : trailingMetaColumnsProp ?? (acHoursByWbsId ? 'acHours' : 'statusBac')
  const showSchedExtras = true

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {!hideFilterBar && (
      <div className="flex shrink-0 flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap text-sm">{t('evm.filterPhase')}:</Label>
          <Combobox
            value={filterPhase}
            onValueChange={setFilterPhase}
            options={[{ value: 'all', label: t('evm.filterAll') }, ...master.phases.map(p => ({ value: p.code, label: p.name ?? p.code }))]}
            placeholder={t('evm.filterAll')}
            triggerClassName="w-[140px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap text-sm">{t('evm.filterAssignee')}:</Label>
          <Combobox
            value={filterAssignee}
            onValueChange={setFilterAssignee}
            options={[{ value: 'all', label: t('evm.filterAll') }, ...master.assignees.map(a => ({ value: a.code, label: a.name ?? a.code }))]}
            placeholder={t('evm.filterAll')}
            triggerClassName="w-[140px]"
          />
        </div>
        {showAddButton && detailTableMode === 'full' && (
          <Button variant={buttonVariant} size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('common.add')}
          </Button>
        )}
      </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-md border border-border/40 bg-card/20 shadow-sm">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">
          <Table
            className={cn(
              'w-max min-w-full text-xs',
              '[&_tbody>tr]:h-[length:var(--evm-schedule-row)] [&_tbody>tr]:overflow-hidden',
              '[&_tbody_td]:px-1 [&_tbody_td]:py-0.5 [&_tbody_td]:text-[10px] [&_tbody_td]:align-middle',
            )}
            style={{ ['--evm-schedule-row' as string]: `${EVM_SCHEDULE_ROW_PX}px` }}
          >
            <TableHeader sticky>
              <TableRow className="border-b border-border/70 bg-muted/90 text-[10px] font-semibold">
                <TableHead className="w-12">{t('evm.tableNo')}</TableHead>
                <TableHead className="w-24">{t('evm.tablePhase')}</TableHead>
                {showCategoryFeatureColumns && (
                  <>
                    <TableHead className="w-28">{t('evm.tableCategory')}</TableHead>
                    <TableHead className="w-28">{t('evm.tableFeature')}</TableHead>
                  </>
                )}
                <TableHead className="min-w-[120px]">{t('evm.tableTask')}</TableHead>
                {showSchedExtras && (
                  <>
                    <TableHead className="w-16">{t('evm.durationDays')}</TableHead>
                    <TableHead className="w-28 whitespace-nowrap">{t('evm.planStart')}</TableHead>
                    <TableHead className="w-28 whitespace-nowrap">{t('evm.planEnd')}</TableHead>
                    <TableHead className="w-24">{t('evm.predecessor')}</TableHead>
                    <TableHead className="w-28 whitespace-nowrap">{t('evm.actualStart')}</TableHead>
                    <TableHead className="w-28 whitespace-nowrap">{t('evm.actualEnd')}</TableHead>
                  </>
                )}
                <TableHead className="w-24">{t('evm.tableAssignee')}</TableHead>
                <TableHead className="w-20 whitespace-nowrap">{t('evm.percentDone')}</TableHead>
                {trailingMeta === 'statusBac' && (
                  <>
                    <TableHead className="w-24">{t('evm.tableStatus')}</TableHead>
                    <TableHead className="w-24 whitespace-nowrap">{t('evm.kpiBAC')}</TableHead>
                  </>
                )}
                {showSchedExtras && (
                  <>
                    <TableHead className="w-16">{t('evm.effort')}</TableHead>
                    <TableHead className="w-16 whitespace-nowrap">{t('evm.estMd')}</TableHead>
                    <TableHead className="min-w-[88px]">{t('evm.wbsNote')}</TableHead>
                  </>
                )}
                {trailingMeta === 'acHours' && <TableHead className="w-24 text-right">{t('evm.acHoursMatched')}</TableHead>}
                {detailTableMode === 'full' && <TableHead className="w-16" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedWbs.map(row =>
                detailTableMode === 'actualOnly' ? (
                  <WBSRowActualOnly key={row.id} row={row} master={master} showCategoryFeatureColumns={showCategoryFeatureColumns} />
                ) : (
                  <WBSRowEdit
                    key={row.id}
                    row={row}
                    master={master}
                    acHours={acHoursByWbsId?.get(row.id)}
                    showCategoryFeatureColumns={showCategoryFeatureColumns}
                    showSchedExtras={showSchedExtras}
                    trailingMeta={trailingMeta}
                    onEdit={() => setEditingId(row.id)}
                    onDelete={() => setToDelete(row.id)}
                  />
                )
              )}
            </TableBody>
          </Table>
        </div>
        {filteredWbs.length > 0 && (
          <TablePaginationBar
            page={page}
            totalPages={totalPages}
            totalItems={filteredWbs.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        )}
      </div>

      {filteredWbs.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{wbs.length === 0 ? t('evm.wbsEmptyHint') : t('evm.filterNoRows')}</p>}

      {detailTableMode === 'full' && (
        <WbsDetailEditDialog
          open={!!detailEditRow}
          onOpenChange={open => {
            if (!open) setEditingId(null)
          }}
          row={detailEditRow}
          master={master}
          projectStartYmd={project.startDate ?? ''}
          wbsForLookup={wbs}
          showCategoryFeatureColumns={showCategoryFeatureColumns}
          showSchedExtras={showSchedExtras}
          onSave={async updates => {
            if (!detailEditRow) return
            try {
              await updateWbsRow(detailEditRow.id, updates)
              if (
                updates.planStartDate !== undefined ||
                updates.planEndDate !== undefined ||
                updates.effort !== undefined ||
                updates.durationDays !== undefined
              ) {
                const merged = { ...detailEditRow, ...updates } as WBSRow
                const entries = buildWbsDayUnitsFromPlan(merged, nonWorkingDaysList)
                await replaceWbsDayUnitsForRow(detailEditRow.id, entries)
              }
              setEditingId(null)
              toast.success(t('common.save'))
            } catch {
              toast.error(t('evm.saveFailed'))
            }
          }}
        />
      )}
      {showAddButton && detailTableMode === 'full' && (
        <AddWBSDialog
          open={showAdd}
          onClose={() => setShowAdd(false)}
          master={master}
          showCategoryFeatureColumns={showCategoryFeatureColumns}
          showSchedExtras={showSchedExtras}
        />
      )}
      <AlertDialog open={!!toDelete} onOpenChange={open => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
          <AlertDialogDescription>{t('common.delete')}?</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function WBSRowActualOnly({
  row,
  master,
  showCategoryFeatureColumns,
}: {
  row: WBSRow
  master: EVMMaster
  showCategoryFeatureColumns: boolean
}) {
  const { t } = useTranslation()
  const updateWbsRow = useEVMStore(s => s.updateWbsRow)
  const [as, setAs] = useState(row.actualStartDate ?? '')
  const [ae, setAe] = useState(row.actualEndDate ?? '')
  const [pct, setPct] = useState(row.percentDone ?? 0)
  const percentOptions = master.percentDoneOptions ?? EVM_PERCENT_DONE_OPTIONS_DEFAULT

  useEffect(() => {
    setAs(row.actualStartDate ?? '')
    setAe(row.actualEndDate ?? '')
    setPct(row.percentDone ?? 0)
  }, [row.id, row.actualStartDate, row.actualEndDate, row.percentDone])

  const savePartial = async (updates: Partial<WBSRow>) => {
    try {
      await updateWbsRow(row.id, updates)
      toast.success(t('common.save'))
    } catch {
      toast.error(t('evm.saveFailed'))
    }
  }

  return (
    <TableRow className="hover:bg-muted/20">
      <TableCell className="font-mono">{row.no}</TableCell>
      <TableCell className="max-w-[88px] truncate" title={row.phase ?? undefined}>
        {row.phase ?? '—'}
      </TableCell>
      {showCategoryFeatureColumns && (
        <>
          <TableCell className="max-w-[88px] truncate" title={row.category?.trim() || undefined}>
            {row.category?.trim() ? row.category : '—'}
          </TableCell>
          <TableCell className="max-w-[88px] truncate" title={row.feature?.trim() || undefined}>
            {row.feature?.trim() ? row.feature : '—'}
          </TableCell>
        </>
      )}
      <TableCell className="max-w-[200px] truncate" title={row.task ?? undefined}>
        {row.task ?? '—'}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{row.durationDays ?? '—'}</TableCell>
      <TableCell>{formatDateDisplay(row.planStartDate, i18n.language)}</TableCell>
      <TableCell>{formatDateDisplay(row.planEndDate, i18n.language)}</TableCell>
      <TableCell className="max-w-[100px] truncate text-muted-foreground">{row.predecessor ?? '—'}</TableCell>
      <TableCell className="px-1 py-0">
        <Input
          type="date"
          className="h-[22px] w-[124px] px-1 text-[10px]"
          value={as}
          onChange={e => setAs(e.target.value)}
          onBlur={() => {
            const v = as.trim()
            const cur = row.actualStartDate?.slice(0, 10) ?? ''
            if (v !== cur) void savePartial({ actualStartDate: v || undefined })
          }}
        />
      </TableCell>
      <TableCell className="px-1 py-0">
        <Input
          type="date"
          className="h-[22px] w-[124px] px-1 text-[10px]"
          value={ae}
          onChange={e => setAe(e.target.value)}
          onBlur={() => {
            const v = ae.trim()
            const cur = row.actualEndDate?.slice(0, 10) ?? ''
            if (v !== cur) void savePartial({ actualEndDate: v || undefined })
          }}
        />
      </TableCell>
      <TableCell className="max-w-[120px] truncate" title={evmAssigneeDisplayName(master, row.assignee, row.assigneeName)}>
        {evmAssigneeDisplayName(master, row.assignee, row.assigneeName)}
      </TableCell>
      <TableCell className="px-1 py-0">
        <Combobox
          value={String(pct)}
          onValueChange={v => {
            const n = Number(v)
            setPct(n)
            void savePartial({ percentDone: n })
          }}
          options={percentOptions.map((p: number) => ({ value: String(p), label: `${(p * 100).toFixed(0)}%` }))}
          size="sm"
          triggerClassName="h-[22px] min-h-[22px] px-1.5 text-[10px]"
        />
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{row.effort ?? '—'}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{row.estMd ?? '—'}</TableCell>
      <TableCell className="max-w-[120px] truncate text-muted-foreground" title={row.wbsNote}>
        {row.wbsNote ?? '—'}
      </TableCell>
    </TableRow>
  )
}

function WBSRowEdit({
  row,
  master,
  acHours,
  showCategoryFeatureColumns,
  showSchedExtras,
  trailingMeta,
  onEdit,
  onDelete,
}: {
  row: WBSRow
  master: EVMMaster
  acHours?: number
  showCategoryFeatureColumns: boolean
  showSchedExtras: boolean
  trailingMeta: 'statusBac' | 'acHours' | 'none'
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const nonWorkingList = useMemo(() => master.nonWorkingDays.map(n => n.date), [master.nonWorkingDays])
  const scheduleSlipWd = useMemo(() => {
    const ref = format(new Date(), 'yyyy-MM-dd')
    return evmScheduleSlipWorkingDays(row.planEndDate, row.actualEndDate, ref, nonWorkingList)
  }, [row.planEndDate, row.actualEndDate, row.id, nonWorkingList])

  return (
    <TableRow className="hover:bg-muted/20">
      <TableCell className="font-mono">{row.no}</TableCell>
      <TableCell className="max-w-[88px] truncate" title={row.phase ?? undefined}>
        {row.phase ?? '-'}
      </TableCell>
      {showCategoryFeatureColumns && (
        <>
          <TableCell className="max-w-[88px] truncate" title={row.category?.trim() || undefined}>
            {row.category?.trim() ? row.category : '—'}
          </TableCell>
          <TableCell className="max-w-[88px] truncate" title={row.feature?.trim() || undefined}>
            {row.feature?.trim() ? row.feature : '—'}
          </TableCell>
        </>
      )}
      <TableCell className="max-w-[200px] truncate" title={row.task ?? undefined}>
        {row.task ?? '-'}
      </TableCell>
      {showSchedExtras && (
        <>
          <TableCell className="text-right tabular-nums">{row.durationDays ?? '—'}</TableCell>
          <TableCell>{formatDateDisplay(row.planStartDate, i18n.language)}</TableCell>
          <TableCell>{formatDateDisplay(row.planEndDate, i18n.language)}</TableCell>
          <TableCell className="max-w-[100px] truncate">{row.predecessor ?? '—'}</TableCell>
          <TableCell>{formatDateDisplay(row.actualStartDate, i18n.language)}</TableCell>
          <TableCell>{formatDateDisplay(row.actualEndDate, i18n.language)}</TableCell>
        </>
      )}
      <TableCell className="max-w-[120px] truncate" title={evmAssigneeDisplayName(master, row.assignee, row.assigneeName)}>
        {evmAssigneeDisplayName(master, row.assignee, row.assigneeName)}
      </TableCell>
      <TableCell>{((row.percentDone ?? 0) * 100).toFixed(0)}%</TableCell>
      {trailingMeta === 'statusBac' ? (
        <>
          <TableCell className="max-w-[160px]">
            <div className="flex min-w-0 flex-nowrap items-center gap-1">
              <span className="min-w-0 truncate">{row.statusName ?? row.status ?? '-'}</span>
              {scheduleSlipWd != null && scheduleSlipWd > 0 ? (
                <span
                  className="shrink-0 whitespace-nowrap rounded bg-destructive/15 px-1 py-0 text-[9px] font-medium text-destructive"
                  title={t('evm.scheduleSlipHint')}
                >
                  {t('evm.scheduleSlipBadge', { days: scheduleSlipWd })}
                </span>
              ) : null}
            </div>
          </TableCell>
          <TableCell>{row.bac != null ? row.bac : '-'}</TableCell>
        </>
      ) : null}
      {showSchedExtras && (
        <>
          <TableCell className="text-right tabular-nums">{row.effort ?? '—'}</TableCell>
          <TableCell className="text-right tabular-nums">{row.estMd ?? '—'}</TableCell>
          <TableCell className="max-w-[120px] truncate" title={row.wbsNote}>
            {row.wbsNote ?? '—'}
          </TableCell>
        </>
      )}
      {trailingMeta === 'acHours' ? (
        <TableCell className="text-right font-mono tabular-nums">{(acHours ?? 0).toFixed(1)}</TableCell>
      ) : null}
      <TableCell className="w-10 px-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant={buttonVariant} size="icon" className="h-6 w-6 shrink-0">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>{t('common.edit')}</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

/** Dialog sửa WBS chi tiết: chỉ Phase, Category, Feature, Task, Duration, Predecessor, Assignee, Effort (còn lại tự tính / không sửa ở đây). */
function WbsDetailEditDialog({
  open,
  onOpenChange,
  row,
  master,
  projectStartYmd,
  wbsForLookup,
  showCategoryFeatureColumns,
  showSchedExtras,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: WBSRow | null
  master: EVMMaster
  projectStartYmd: string
  wbsForLookup: WBSRow[]
  showCategoryFeatureColumns: boolean
  showSchedExtras: boolean
  onSave: (updates: Partial<WBSRow>) => Promise<void>
}) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [phase, setPhase] = useState('')
  const [category, setCategory] = useState('')
  const [feature, setFeature] = useState('')
  const [task, setTask] = useState('')
  const [durationDays, setDurationDays] = useState('')
  const [predecessor, setPredecessor] = useState('')
  const [assignee, setAssignee] = useState('')
  const [effort, setEffort] = useState('')

  useEffect(() => {
    if (!open || !row) return
    setPhase(row.phase ?? '')
    setCategory(row.category ?? '')
    setFeature(row.feature ?? '')
    setTask(row.task ?? '')
    setDurationDays(row.durationDays != null ? String(row.durationDays) : '')
    setPredecessor(row.predecessor ?? '')
    setAssignee(row.assignee ?? '')
    setEffort(row.effort != null ? String(row.effort) : '')
  }, [open, row])

  const handleSave = () => {
    if (!row) return
    const nw = master.nonWorkingDays.map(n => n.date)
    const duraRaw = durationDays.trim()
    const dura = duraRaw ? Number(durationDays) : null

    const updates: Partial<WBSRow> = {
      phase: phase || undefined,
      category: category.trim(),
      feature: feature.trim(),
      task: task || undefined,
      assignee: assignee || undefined,
      predecessor: predecessor.trim() || undefined,
      effort: effort.trim() ? Number(effort) : null,
    }

    if (dura != null && dura >= 1) {
      let planStartOut: string | undefined
      const predTrim = predecessor.trim()
      const predNum = predTrim ? Number(predTrim) : NaN
      const hasPred = predTrim !== '' && Number.isFinite(predNum) && predNum !== row.no
      const predRow = hasPred ? wbsForLookup.find(r => r.no === predNum && r.id !== row.id) : undefined
      const computedStart = planStartWbsDetailLine90({
        projectStartYmd,
        predecessorNo: hasPred ? predNum : null,
        predecessorPlanStartYmd: predRow?.planStartDate,
        predecessorPlanEndYmd: predRow?.planEndDate,
        nonWorkingDays: nw,
      })
      if (computedStart) planStartOut = computedStart
      if (!planStartOut) planStartOut = row.planStartDate?.trim() || undefined

      let planEndOut: string | undefined = row.planEndDate?.trim() || undefined
      if (planStartOut) {
        const computed = planEndFromStartAndDurationWorkdays(planStartOut, dura, nw)
        if (computed) planEndOut = computed
      }
      updates.planStartDate = planStartOut
      updates.planEndDate = planEndOut
      updates.durationDays = dura
    } else {
      updates.durationDays = duraRaw ? Number(durationDays) : null
    }

    void onSave(updates)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('evm.editWbsDetailRow')}</DialogTitle>
          {row ? (
            <p className="text-muted-foreground text-xs font-normal">
              {t('evm.tableNo')} {row.no}
            </p>
          ) : null}
        </DialogHeader>
        {row ? (
          <div className="grid gap-3 py-1">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>{t('evm.tablePhase')}</Label>
                <Combobox
                  value={phase}
                  onValueChange={setPhase}
                  options={master.phases.map(p => ({ value: p.code, label: p.name ?? p.code }))}
                  placeholder="—"
                />
              </div>
              {showCategoryFeatureColumns ? (
                <>
                  <div className="grid gap-1.5">
                    <Label>{t('evm.tableCategory')}</Label>
                    <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="—" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t('evm.tableFeature')}</Label>
                    <Input value={feature} onChange={e => setFeature(e.target.value)} placeholder="—" />
                  </div>
                </>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label>{t('evm.tableTask')}</Label>
              <Input value={task} onChange={e => setTask(e.target.value)} placeholder="—" />
            </div>
            {showSchedExtras ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>{t('evm.durationDays')}</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-9"
                    value={durationDays}
                    onChange={e => setDurationDays(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t('evm.predecessor')}</Label>
                  <Input className="h-9" value={predecessor} onChange={e => setPredecessor(e.target.value)} placeholder="—" />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label>{t('evm.effort')}</Label>
                  <Input type="number" className="h-9 max-w-xs" value={effort} onChange={e => setEffort(e.target.value)} />
                </div>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label>{t('evm.tableAssignee')}</Label>
              <Combobox
                value={assignee}
                onValueChange={setAssignee}
                options={master.assignees.map(a => ({ value: a.code, label: a.name ?? a.code }))}
                placeholder="—"
              />
            </div>
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant={buttonVariant} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" variant={buttonVariant} disabled={!row} onClick={handleSave}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Thêm dòng WBS: cùng trường & bố cục với dialog sửa chi tiết (plan được tính từ Duration + Predecessor). */
function AddWBSDialog({
  open,
  onClose,
  master,
  showCategoryFeatureColumns = true,
  showSchedExtras = true,
}: {
  open: boolean
  onClose: () => void
  master: EVMMaster
  showCategoryFeatureColumns?: boolean
  showSchedExtras?: boolean
}) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [phase, setPhase] = useState('')
  const [category, setCategory] = useState('')
  const [feature, setFeature] = useState('')
  const [task, setTask] = useState('')
  const [durationDays, setDurationDays] = useState('')
  const [predecessor, setPredecessor] = useState('')
  const [assignee, setAssignee] = useState('')
  const [effort, setEffort] = useState('')

  const reset = useCallback(() => {
    setPhase(master.phases[0]?.code ?? '')
    setCategory('')
    setFeature('')
    setTask('')
    setDurationDays('')
    setPredecessor('')
    setAssignee(master.assignees[0]?.code ?? '')
    setEffort('')
  }, [master.phases, master.assignees])

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      onClose()
      reset()
    }
  }

  const handleAdd = async () => {
    const addWbsRow = useEVMStore.getState().addWbsRow
    const replaceWbsDayUnitsForRow = useEVMStore.getState().replaceWbsDayUnitsForRow
    const m = useEVMStore.getState().master
    const project = useEVMStore.getState().project
    const wbsList = useEVMStore.getState().wbs
    if (!project.id) return

    const nw = m.nonWorkingDays.map(n => n.date)
    const projectStartYmd = project.startDate ?? ''
    const nextNo = wbsList.reduce((max, r) => Math.max(max, r.no), 0) + 1

    const duraRaw = durationDays.trim()
    const dura = duraRaw ? Number(durationDays) : null

    let planStartOut: string | undefined
    let planEndOut: string | undefined
    let durationOut: number | null = duraRaw ? Number(durationDays) : null

    if (dura != null && dura >= 1) {
      const predTrim = predecessor.trim()
      const predNum = predTrim ? Number(predTrim) : NaN
      const hasPred = predTrim !== '' && Number.isFinite(predNum) && predNum !== nextNo
      const predRow = hasPred ? wbsList.find(r => r.no === predNum) : undefined
      const computedStart = planStartWbsDetailLine90({
        projectStartYmd,
        predecessorNo: hasPred ? predNum : null,
        predecessorPlanStartYmd: predRow?.planStartDate,
        predecessorPlanEndYmd: predRow?.planEndDate,
        nonWorkingDays: nw,
      })
      if (computedStart) planStartOut = computedStart
      if (planStartOut) {
        const computedEnd = planEndFromStartAndDurationWorkdays(planStartOut, dura, nw)
        if (computedEnd) planEndOut = computedEnd
      }
      durationOut = dura
    } else {
      durationOut = duraRaw ? Number(durationDays) : null
    }

    try {
      const created = await addWbsRow({
        phase: phase || undefined,
        category: category.trim() || undefined,
        feature: feature.trim() || undefined,
        task: task || undefined,
        planStartDate: planStartOut,
        planEndDate: planEndOut,
        assignee: assignee || undefined,
        durationDays: durationOut,
        predecessor: predecessor.trim() || undefined,
        effort: effort.trim() ? Number(effort) : null,
        percentDone: 0,
      })
      if (created) {
        const entries = buildWbsDayUnitsFromPlan(created, nw)
        try {
          await replaceWbsDayUnitsForRow(created.id, entries)
        } catch {
          /* day grid optional */
        }
      }
      toast.success(t('common.save'))
      onClose()
      reset()
    } catch {
      toast.error(t('evm.saveFailed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('evm.addWbsRow')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>{t('evm.tablePhase')}</Label>
              <Combobox
                value={phase}
                onValueChange={setPhase}
                options={master.phases.map(p => ({ value: p.code, label: p.name ?? p.code }))}
                placeholder="—"
              />
            </div>
            {showCategoryFeatureColumns ? (
              <>
                <div className="grid gap-1.5">
                  <Label>{t('evm.tableCategory')}</Label>
                  <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="—" />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t('evm.tableFeature')}</Label>
                  <Input value={feature} onChange={e => setFeature(e.target.value)} placeholder="—" />
                </div>
              </>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label>{t('evm.tableTask')}</Label>
            <Input value={task} onChange={e => setTask(e.target.value)} placeholder="—" />
          </div>
          {showSchedExtras ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>{t('evm.durationDays')}</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-9"
                  value={durationDays}
                  onChange={e => setDurationDays(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t('evm.predecessor')}</Label>
                <Input className="h-9" value={predecessor} onChange={e => setPredecessor(e.target.value)} placeholder="—" />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>{t('evm.effort')}</Label>
                <Input type="number" className="h-9 max-w-xs" value={effort} onChange={e => setEffort(e.target.value)} />
              </div>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label>{t('evm.tableAssignee')}</Label>
            <Combobox
              value={assignee}
              onValueChange={setAssignee}
              options={master.assignees.map(a => ({ value: a.code, label: a.name ?? a.code }))}
              placeholder="—"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant={buttonVariant} onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant={buttonVariant} onClick={() => void handleAdd()}>
            {t('common.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { AddWBSDialog }
