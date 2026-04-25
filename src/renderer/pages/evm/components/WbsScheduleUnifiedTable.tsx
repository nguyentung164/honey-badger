'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { eachDayOfInterval, format, isSameWeek } from 'date-fns'
import {
  type ReactNode,
  type RefObject,
  type UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { EVMMaster, EVMProject, WBSRow, WbsDayUnitRow } from 'shared/types/evm'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { formatDateDisplay, parseLocalDate, toYyyyMmDd } from '@/lib/dateUtils'
import {
  buildWbsDayUnitsFromPlan,
  deriveWbsPlanFromSparseDayUnits,
  evmAssigneeDisplayName,
  isEvmCalendarWorkdayYmd,
  mergeWbsDayUnitsStoredWithPlan,
  normalizeEvmCalendarDay,
  planEndFromStartAndDurationWorkdays,
  planStartWbsDetailLine90,
} from '@/lib/evmCalculations'
import i18n from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useEVMStore } from '@/stores/useEVMStore'
import { useEvmToolbarLayoutStore } from '@/stores/useEvmToolbarLayoutStore'
import {
  EVM_SCHEDULE_DAY_COL_PX,
  EVM_SCHEDULE_ROW_PX,
  EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
  EVM_WBS_PINNED_COL_WIDTHS,
  useEvmScheduleColumnVirtualizer,
} from './useEvmScheduleColumnVirtualizer'
import { AddWBSDialog } from './WbsTaskTable'

const WEEK_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

/**
 * Khớp EVM_Tool WBS Details: No | nhóm Details (Phase…Task) như Rollup Master | Duration, Plan×2, Pred, Actual×2,
 * Assignee, %Done, Status, Effort, Est(MD) — timeline (chỉnh sửa: click hàng + dialog).
 * Độ rộng 16 cột = `EVM_WBS_PINNED_COL_WIDTHS`.
 */
const PIN_W = EVM_WBS_PINNED_COL_WIDTHS
const PIN_COLS = PIN_W.length
const DAY_COL_PX = EVM_SCHEDULE_DAY_COL_PX

function detailPinLeft(i: number): number {
  let s = 0
  for (let j = 0; j < i && j < PIN_W.length; j++) {
    const w = PIN_W[j]
    if (w !== undefined) s += w
  }
  return s
}

function detailPinWidth(from: number, to: number): number {
  let s = 0
  for (let j = from; j < to && j < PIN_W.length; j++) {
    const w = PIN_W[j]
    if (w !== undefined) s += w
  }
  return s
}

const PIN_TOTAL = PIN_W.reduce((a, b) => a + b, 0)

const WBS_EFFORT_OPTIONS = ['0.25', '0.50', '0.75', '0.00', '1.00', '2.00', '3.00', '4.00', '5.00'] as const

function effortToSelectValue(row: WBSRow | null): string {
  if (!row || row.effort == null || !Number.isFinite(row.effort)) return '1.00'
  const hit = WBS_EFFORT_OPTIONS.find(o => Math.abs(Number(o) - Number(row.effort)) < 1e-6)
  return hit ?? '1.00'
}

const DETAIL_STICKY_TH_BASE =
  'sticky z-40 box-border border-solid border-border/80 bg-muted text-foreground text-center align-middle text-sm font-semibold leading-tight'

function detailHeaderThEdges(colIndex: number) {
  return colIndex === 0 ? 'border-t border-l border-r border-b' : 'border-t border-r border-b'
}

/** Hàng 1 WBS Detail: ô ghim rowspan=3 hoặc nhóm Plan/Actual colSpan=2 — đúng bố cục Excel Detail. */
function detailHeaderTh(colIndex: number, className: string, children: ReactNode, rowSpan?: number) {
  const rs = rowSpan ?? 1
  return (
    <th
      rowSpan={rowSpan}
      className={cn(DETAIL_STICKY_TH_BASE, 'px-1 py-1', detailHeaderThEdges(colIndex), className)}
      style={{
        left: detailPinLeft(colIndex),
        width: PIN_W[colIndex],
        minWidth: PIN_W[colIndex],
        maxWidth: colIndex === 4 ? 160 : PIN_W[colIndex],
      }}
    >
      <span
        className="flex items-center justify-center gap-0.5"
        style={{ minHeight: rs * EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX }}
      >
        {children}
      </span>
    </th>
  )
}

function detailPinColSpanTh(fromCol: number, span: number, className: string, children: ReactNode) {
  return (
    <th
      colSpan={span}
      className={cn(DETAIL_STICKY_TH_BASE, 'border-t border-r border-b', className)}
      style={{
        left: detailPinLeft(fromCol),
        width: detailPinWidth(fromCol, fromCol + span),
        minWidth: detailPinWidth(fromCol, fromCol + span),
      }}
    >
      <span
        className="flex items-center justify-center gap-0.5 text-center leading-tight"
        style={{ minHeight: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX }}
      >
        {children}
      </span>
    </th>
  )
}

function detailDetailTh(colIndex: number, className: string, children: ReactNode, spanRows: number = 1) {
  return (
    <th
      rowSpan={spanRows > 1 ? spanRows : undefined}
      className={cn(DETAIL_STICKY_TH_BASE, 'border-r border-b px-1 py-0.5', className)}
      style={{
        left: detailPinLeft(colIndex),
        width: PIN_W[colIndex],
        minWidth: PIN_W[colIndex],
        maxWidth: colIndex === 4 ? 160 : PIN_W[colIndex],
      }}
    >
      <span
        className="flex items-center justify-center gap-0.5"
        style={{ minHeight: spanRows * EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX }}
      >
        {children}
      </span>
    </th>
  )
}

function detailStickyTd(
  colIndex: number,
  rowParity: number,
  className: string,
  children: ReactNode,
  title?: string,
) {
  const bg = rowParity % 2 === 1 ? 'bg-muted' : 'bg-background'
  const w = PIN_W[colIndex] ?? 40
  const edge = colIndex === 0 ? 'border-l border-r border-b' : 'border-r border-b'
  return (
    <td
      className={cn(
        'sticky z-10 box-border border-solid border-border/55 px-1 py-0.5 text-sm',
        edge,
        bg,
        className,
      )}
      style={{
        left: detailPinLeft(colIndex),
        width: w,
        minWidth: w,
        maxWidth: colIndex === 4 ? 160 : w,
      }}
      title={title}
    >
      {children}
    </td>
  )
}

function groupConsecutiveDaysByWeek(days: Date[]): Date[][] {
  if (days.length === 0) return []
  const groups: Date[][] = []
  let cur: Date[] = [days[0]]
  for (let i = 1; i < days.length; i++) {
    const d = days[i]
    const prev = days[i - 1]
    if (isSameWeek(d, prev, { weekStartsOn: 0 })) cur.push(d)
    else {
      groups.push(cur)
      cur = [d]
    }
  }
  groups.push(cur)
  return groups
}

function weekBandLabel(first: Date, last: Date): string {
  return `${format(first, 'M/d')} - ${format(last, 'M/d')}`
}

function computeProjectDaysAndWeekBands(project: EVMProject): {
  projectDays: Date[]
  weekBands: { startIdx: number; len: number; label: string }[]
} {
  if (!project.startDate?.trim() || !project.endDate?.trim()) {
    return { projectDays: [], weekBands: [] }
  }
  try {
    const start = parseLocalDate(project.startDate.trim().slice(0, 10))
    const end = parseLocalDate(project.endDate.trim().slice(0, 10))
    if (!start || !end || end < start) {
      return { projectDays: [], weekBands: [] }
    }
    const projectDays = eachDayOfInterval({ start, end })
    const weekGroups = groupConsecutiveDaysByWeek(projectDays)
    let idx = 0
    const weekBands = weekGroups.map(g => {
      const band = { startIdx: idx, len: g.length, label: weekBandLabel(g[0], g[g.length - 1]) }
      idx += g.length
      return band
    })
    return { projectDays, weekBands }
  } catch {
    return { projectDays: [], weekBands: [] }
  }
}

function dayUnitKey(wbsId: string, workDate: string): string {
  const ymd = normalizeEvmCalendarDay(workDate) ?? workDate.slice(0, 10)
  return `${wbsId}\t${ymd}`
}

/** Est (MD) trên lưới WBS Detail = tổng các ô ngày (đơn vị/ngày) của dòng. */
function sumWbsDayUnits(arr: Float32Array | undefined): number {
  if (!arr?.length) return 0
  let s = 0
  for (let i = 0; i < arr.length; i++) s += arr[i]
  return s
}

/** Merge đơn vị/ngày: kế hoạch mặc định từ plan row + bản ghi DB (ô lưới). */
function buildDayUnitMapForRow(row: WBSRow, stored: WbsDayUnitRow[], nw: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of buildWbsDayUnitsFromPlan(row, nw)) {
    const wd = normalizeEvmCalendarDay(e.workDate) ?? e.workDate
    m.set(wd, e.unit)
  }
  for (const u of stored) {
    if (u.wbsId !== row.id) continue
    const wd = normalizeEvmCalendarDay(u.workDate) ?? u.workDate.slice(0, 10)
    m.set(wd, u.unit)
  }
  return m
}

export function WbsScheduleUnifiedTable({
  wbsRows,
  scrollContainerRef,
  horizontalScrollPeerRef,
}: {
  wbsRows: WBSRow[]
  scrollContainerRef?: RefObject<HTMLDivElement | null>
  horizontalScrollPeerRef?: RefObject<HTMLElement | null>
}) {
  const { t } = useTranslation()
  const project = useEVMStore(s => s.project)
  const master = useEVMStore(s => s.master)
  const wbsDayUnits = useEVMStore(s => s.wbsDayUnits ?? [])
  const updateWbsRow = useEVMStore(s => s.updateWbsRow)
  const removeWbsRow = useEVMStore(s => s.removeWbsRow)
  const replaceWbsDayUnitsForRow = useEVMStore(s => s.replaceWbsDayUnitsForRow)
  const nonWorkingDaysList = useMemo(() => master.nonWorkingDays.map(n => n.date), [master.nonWorkingDays])

  const localScrollRef = useRef<HTMLDivElement>(null)
  const scrollRef = scrollContainerRef ?? localScrollRef

  const onSyncHorizontalScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const peer = horizontalScrollPeerRef?.current
      if (!peer) return
      const left = e.currentTarget.scrollLeft
      if (peer.scrollLeft !== left) peer.scrollLeft = left
    },
    [horizontalScrollPeerRef],
  )

  const [showAdd, setShowAdd] = useState(false)
  const [toDelete, setToDelete] = useState<string | null>(null)
  const [editRow, setEditRow] = useState<WBSRow | null>(null)
  const wbsAddSignal = useEvmToolbarLayoutStore(s => s.wbsAddSignal)
  const lastWbsAddSignalRef = useRef<number | null>(null)
  const lastWbsAddProjectRef = useRef<string | null>(null)

  useEffect(() => {
    if (lastWbsAddProjectRef.current !== project.id) {
      lastWbsAddProjectRef.current = project.id
      lastWbsAddSignalRef.current = wbsAddSignal
      return
    }
    if (lastWbsAddSignalRef.current === null) {
      lastWbsAddSignalRef.current = wbsAddSignal
      return
    }
    if (wbsAddSignal <= 0 || wbsAddSignal === lastWbsAddSignalRef.current) return
    lastWbsAddSignalRef.current = wbsAddSignal
    setShowAdd(true)
  }, [wbsAddSignal, project.id])

  const reportDateStr = toYyyyMmDd(project.reportDate) ?? ''
  const { projectDays, weekBands } = useMemo(() => computeProjectDaysAndWeekBands(project), [project])

  const dayStrs = useMemo(() => projectDays.map(d => format(d, 'yyyy-MM-dd')), [projectDays])

  const dayColMeta = useMemo(
    () =>
      dayStrs.map((ds, i) => {
        const dow = projectDays[i]?.getDay() ?? 0
        const isWorkCal = isEvmCalendarWorkdayYmd(ds, nonWorkingDaysList)
        return {
          ds,
          isWeekend: dow === 0 || dow === 6,
          isWorkCal,
          isReport: Boolean(reportDateStr && ds === reportDateStr),
        }
      }),
    [dayStrs, projectDays, reportDateStr, nonWorkingDaysList],
  )

  const sortedRows = useMemo(() => [...wbsRows].sort((a, b) => a.no - b.no), [wbsRows])

  const effectiveWbsDayUnits = useMemo(
    () => mergeWbsDayUnitsStoredWithPlan(sortedRows, wbsDayUnits, nonWorkingDaysList),
    [sortedRows, wbsDayUnits, nonWorkingDaysList],
  )

  const unitByWbsDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const u of effectiveWbsDayUnits) {
      m.set(dayUnitKey(u.wbsId, u.workDate), u.unit)
    }
    return m
  }, [effectiveWbsDayUnits])

  const unitsByRowId = useMemo(() => {
    const m = new Map<string, Float32Array>()
    const n = dayStrs.length
    for (const row of sortedRows) {
      const arr = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const ds = dayStrs[i]
        if (ds) arr[i] = unitByWbsDate.get(dayUnitKey(row.id, ds)) ?? 0
      }
      m.set(row.id, arr)
    }
    return m
  }, [sortedRows, dayStrs, unitByWbsDate])

  const colVirtualizer = useEvmScheduleColumnVirtualizer(scrollRef, dayStrs.length, {
    leadingPinnedWidthPx: PIN_TOTAL,
  })
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => EVM_SCHEDULE_ROW_PX,
    overscan: 10,
  })
  const dayTimelinePx = dayStrs.length * DAY_COL_PX

  const tableMinWidth = PIN_TOTAL + dayTimelinePx

  const handleDelete = useCallback(async () => {
    if (!toDelete) return
    try {
      await removeWbsRow(toDelete)
      setToDelete(null)
      toast.success(t('common.save'))
    } catch {
      toast.error(t('evm.saveFailed'))
    }
  }, [toDelete, removeWbsRow, t])

  const saveEdit = useCallback(
    async (updates: Partial<WBSRow>) => {
      if (!editRow) return
      try {
        await updateWbsRow(editRow.id, updates)
        if (
          updates.planStartDate !== undefined ||
          updates.planEndDate !== undefined ||
          updates.effort !== undefined ||
          updates.durationDays !== undefined
        ) {
          const cur = useEVMStore.getState().wbs.find(r => r.id === editRow.id)
          if (cur) {
            const merged = { ...cur, ...updates } as WBSRow
            await replaceWbsDayUnitsForRow(editRow.id, buildWbsDayUnitsFromPlan(merged, nonWorkingDaysList))
          }
        }
        setEditRow(null)
        toast.success(t('common.save'))
      } catch {
        toast.error(t('evm.saveFailed'))
      }
    },
    [editRow, updateWbsRow, replaceWbsDayUnitsForRow, nonWorkingDaysList, t],
  )

  const persistDayUnitCell = useCallback(
    async (row: WBSRow, ds: string, raw: string) => {
      const nw = nonWorkingDaysList
      if (!isEvmCalendarWorkdayYmd(ds, nw)) return
      const normalized = normalizeEvmCalendarDay(ds) ?? ds.slice(0, 10)
      const trimmed = raw.trim().replace(',', '.')
      let nextU = 0
      if (trimmed !== '') {
        const n = Number(trimmed)
        if (!Number.isFinite(n) || n < 0) {
          toast.error(t('evm.dayUnitInvalid'))
          return
        }
        nextU = n
      }
      const stored = useEVMStore.getState().wbsDayUnits ?? []
      const m = buildDayUnitMapForRow(row, stored, nw)
      const prevU = m.get(normalized) ?? 0
      if (Math.abs(prevU - nextU) < 1e-9) return
      if (nextU > 1e-9) m.set(normalized, nextU)
      else m.delete(normalized)
      const entries = [...m.entries()]
        .filter(([, u]) => u > 1e-9)
        .map(([workDate, unit]) => ({ workDate, unit }))
      try {
        await replaceWbsDayUnitsForRow(row.id, entries)
        const plan = deriveWbsPlanFromSparseDayUnits(entries, nw)
        await updateWbsRow(row.id, {
          planStartDate: (entries.length === 0 ? null : plan.planStartDate) as string | undefined,
          planEndDate: (entries.length === 0 ? null : plan.planEndDate) as string | undefined,
          durationDays: entries.length === 0 ? null : plan.durationDays,
        } as Partial<WBSRow>)
      } catch {
        toast.error(t('evm.saveFailed'))
      }
    },
    [nonWorkingDaysList, replaceWbsDayUnitsForRow, updateWbsRow, t],
  )

  if (projectDays.length === 0) {
    return <p className="py-4 text-muted-foreground text-sm">{t('evm.wbsDayGridNoRange')}</p>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="bg-card/20">
        <div
          ref={scrollRef}
          onScroll={horizontalScrollPeerRef ? onSyncHorizontalScroll : undefined}
          className="max-h-[min(52vh,520px)] overflow-auto rounded-md border border-border/40 [overflow-anchor:none]"
        >
          <div
            className="sticky top-0 z-[35] bg-muted shadow-[0_1px_0_0_var(--border)]"
            style={{ width: tableMinWidth, minWidth: tableMinWidth }}
          >
            <table
              className="border-separate border-spacing-0 text-sm"
              style={{ width: tableMinWidth, tableLayout: 'fixed' }}
            >
              <colgroup>
                {PIN_W.map((w, i) => (
                  <col key={i} style={{ width: w, minWidth: w }} />
                ))}
                <col style={{ minWidth: dayTimelinePx, width: dayTimelinePx }} />
              </colgroup>
              <thead className="bg-muted">
                <TableRow className="bg-muted/90 text-sm font-semibold">
                  {detailHeaderTh(0, 'tabular-nums', t('evm.tableNo'), 3)}
                  {detailPinColSpanTh(1, 4, '', t('evm.wbsScheduleExcelGroupDetails'))}
                  {detailHeaderTh(5, 'tabular-nums', t('evm.durationDays'), 3)}
                  {detailPinColSpanTh(6, 2, '', t('evm.wbsSchedulePlanGroup'))}
                  {detailHeaderTh(8, 'tabular-nums', t('evm.predecessor'), 3)}
                  {detailPinColSpanTh(9, 2, '', t('evm.wbsScheduleActualGroup'))}
                  {detailHeaderTh(11, 'whitespace-normal', t('evm.tableAssignee'), 3)}
                  {detailHeaderTh(12, 'tabular-nums', t('evm.percentDone'), 3)}
                  {detailHeaderTh(13, 'whitespace-normal', t('evm.tableStatus'), 3)}
                  {detailHeaderTh(14, 'tabular-nums', t('evm.effort'), 3)}
                  {detailHeaderTh(15, 'tabular-nums', t('evm.estMd'), 3)}
                  <th
                    className="box-border border-t border-r border-b border-solid border-border/80 bg-muted p-0 align-stretch"
                    style={{
                      minWidth: dayTimelinePx,
                      width: dayTimelinePx,
                      height: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
                    }}
                  >
                    <div
                      className="flex h-full min-h-0 w-full flex-row"
                      style={{ width: dayTimelinePx, minHeight: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX }}
                    >
                      {weekBands.map((band, bi) => (
                        <div
                          key={bi}
                          className="flex h-full shrink-0 items-center justify-center border-r border-solid border-border/80 px-0 py-0 text-center text-foreground text-xs font-semibold leading-tight whitespace-nowrap last:border-r-0"
                          style={{ width: band.len * DAY_COL_PX }}
                        >
                          {band.label}
                        </div>
                      ))}
                    </div>
                  </th>
                </TableRow>
                <TableRow className="bg-muted/90 text-sm font-semibold">
                  {detailDetailTh(1, 'whitespace-normal', t('evm.tablePhase'), 2)}
                  {detailDetailTh(2, 'whitespace-normal', t('evm.tableCategory'), 2)}
                  {detailDetailTh(3, 'whitespace-normal', t('evm.tableFeature'), 2)}
                  {detailDetailTh(4, 'whitespace-normal', t('evm.tableTask'), 2)}
                  {detailDetailTh(6, 'whitespace-nowrap tabular-nums', t('evm.planStart'), 2)}
                  {detailDetailTh(7, 'whitespace-nowrap tabular-nums', t('evm.planEnd'), 2)}
                  {detailDetailTh(9, 'whitespace-nowrap tabular-nums', t('evm.actualStart'), 2)}
                  {detailDetailTh(10, 'whitespace-nowrap tabular-nums', t('evm.actualEnd'), 2)}
                  <th
                    className="box-border border-r border-b border-solid border-border/80 bg-muted p-0 align-stretch"
                    style={{
                      minWidth: dayTimelinePx,
                      width: dayTimelinePx,
                      height: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
                    }}
                  >
                    <div
                      className="relative box-border h-full! min-h-0"
                      style={{
                        width: colVirtualizer.getTotalSize(),
                        height: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
                        minHeight: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
                      }}
                    >
                      {colVirtualizer.getVirtualItems().map(vc => {
                        const meta = dayColMeta[vc.index]
                        const pd = projectDays[vc.index]
                        if (!meta || !pd) return null
                        return (
                          <div
                            key={vc.key}
                            className={cn(
                              'absolute top-0 box-border flex h-full items-center justify-center border-r border-solid border-border/80 px-0 py-0 text-center text-foreground text-sm font-semibold tabular-nums last:border-r-0',
                              !meta.isWorkCal && 'bg-zinc-400/25 dark:bg-zinc-600/35',
                              meta.isWorkCal && 'bg-muted',
                              meta.isReport && 'bg-amber-200/90 dark:bg-amber-900/45',
                            )}
                            style={{ left: vc.start - PIN_TOTAL, width: vc.size }}
                            title={meta.isReport ? t('evm.resourceGridReportCol') : meta.ds}
                          >
                            {format(pd, 'd')}
                          </div>
                        )
                      })}
                    </div>
                  </th>
                </TableRow>
                <TableRow className="bg-muted/90 text-sm">
                  <th
                    className="box-border border-r border-b border-solid border-border/80 bg-muted p-0 align-stretch"
                    style={{
                      minWidth: dayTimelinePx,
                      width: dayTimelinePx,
                      height: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
                    }}
                  >
                    <div
                      className="relative box-border h-full! min-h-0"
                      style={{
                        width: colVirtualizer.getTotalSize(),
                        height: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
                        minHeight: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
                      }}
                    >
                      {colVirtualizer.getVirtualItems().map(vc => {
                        const d = projectDays[vc.index]
                        const meta = dayColMeta[vc.index]
                        if (!d || !meta) return null
                        return (
                          <div
                            key={vc.key}
                            className={cn(
                              'absolute top-0 box-border flex h-full items-center justify-center border-r border-solid border-border/80 px-0 py-0 text-center text-foreground text-xs font-semibold last:border-r-0',
                              !meta.isWorkCal && 'bg-zinc-400/25 dark:bg-zinc-600/35',
                              meta.isWorkCal && 'bg-muted',
                              meta.isReport && 'bg-amber-200/90 dark:bg-amber-900/45',
                            )}
                            style={{ left: vc.start - PIN_TOTAL, width: vc.size }}
                          >
                            {WEEK_LETTERS[d.getDay()]}
                          </div>
                        )
                      })}
                    </div>
                  </th>
                </TableRow>
              </thead>
            </table>
          </div>

          <table
            className="border-separate border-spacing-0 text-sm"
            style={{ display: 'block', width: tableMinWidth, minWidth: tableMinWidth }}
          >
            <colgroup>
              {PIN_W.map((w, i) => (
                <col key={i} style={{ width: w, minWidth: w }} />
              ))}
              <col style={{ minWidth: dayTimelinePx, width: dayTimelinePx }} />
            </colgroup>
            <tbody
              className="relative block"
              style={{
                width: tableMinWidth,
                ...(sortedRows.length === 0 ? undefined : { height: rowVirtualizer.getTotalSize() }),
              }}
            >
              {sortedRows.length === 0 ? (
                <TableRow style={{ display: 'table', width: '100%', tableLayout: 'fixed' }}>
                  <td
                    colSpan={PIN_COLS + 1}
                    className="box-border border-t border-l border-r border-b border-solid border-border/60 px-2 py-8 text-center text-muted-foreground"
                  >
                    {t('evm.ganttSidebarEmpty')}
                  </td>
                </TableRow>
              ) : (
                rowVirtualizer.getVirtualItems().map(vr => {
                  const row = sortedRows[vr.index]
                  if (!row) return null
                  const ri = vr.index
                  const arr = unitsByRowId.get(row.id)
                  const estMdSum = sumWbsDayUnits(arr)
                  const estMdLabel = estMdSum > 1e-9 ? estMdSum.toFixed(1) : '—'
                  return (
                    <TableRow
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      className="hover:bg-muted cursor-pointer"
                      style={{
                        display: 'table',
                        position: 'absolute',
                        top: vr.start,
                        left: 0,
                        width: '100%',
                        tableLayout: 'fixed',
                        height: vr.size,
                        boxSizing: 'border-box',
                      }}
                      onClick={() => setEditRow(row)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setEditRow(row)
                        }
                      }}
                    >
                      {detailStickyTd(0, ri, 'text-center font-mono tabular-nums text-muted-foreground', row.no)}
                      {detailStickyTd(1, ri, 'max-w-[72px] truncate', row.phase ?? '—', row.phase ?? undefined)}
                      {detailStickyTd(2, ri, 'max-w-[88px] truncate', row.category?.trim() ? row.category : '—')}
                      {detailStickyTd(3, ri, 'max-w-[88px] truncate', row.feature?.trim() ? row.feature : '—')}
                      {detailStickyTd(4, ri, 'truncate font-medium', row.task ?? '—', row.task ?? undefined)}
                      {detailStickyTd(5, ri, 'text-center tabular-nums', row.durationDays != null ? String(row.durationDays) : '—')}
                      {detailStickyTd(6, ri, 'whitespace-nowrap', formatDateDisplay(row.planStartDate, i18n.language))}
                      {detailStickyTd(7, ri, 'whitespace-nowrap', formatDateDisplay(row.planEndDate, i18n.language))}
                      {detailStickyTd(8, ri, 'text-center font-mono tabular-nums', row.predecessor?.trim() || '—')}
                      {detailStickyTd(9, ri, 'whitespace-nowrap', formatDateDisplay(row.actualStartDate, i18n.language))}
                      {detailStickyTd(10, ri, 'whitespace-nowrap', formatDateDisplay(row.actualEndDate, i18n.language))}
                      {detailStickyTd(11, ri, 'max-w-[96px] truncate', evmAssigneeDisplayName(master, row.assignee, row.assigneeName))}
                      {detailStickyTd(12, ri, 'text-center tabular-nums', `${((row.percentDone ?? 0) * 100).toFixed(0)}%`)}
                      {detailStickyTd(13, ri, 'max-w-[68px] truncate', row.statusName ?? row.status ?? '—', row.statusName ?? row.status ?? undefined)}
                      {detailStickyTd(
                        14,
                        ri,
                        'text-center tabular-nums',
                        row.effort != null && Number.isFinite(row.effort) ? String(row.effort) : '—',
                      )}
                      {detailStickyTd(15, ri, 'text-right tabular-nums', estMdLabel)}
                      <td
                        className="box-border border-r border-b border-solid border-border/50 p-0 align-stretch"
                        style={{ minWidth: dayTimelinePx, width: dayTimelinePx }}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => e.stopPropagation()}
                      >
                        <div className="relative" style={{ width: colVirtualizer.getTotalSize(), height: EVM_SCHEDULE_ROW_PX }}>
                          {colVirtualizer.getVirtualItems().map(vc => {
                            const meta = dayColMeta[vc.index]
                            if (!meta) return null
                            const ds = dayStrs[vc.index] ?? ''
                            const u = arr?.[vc.index] ?? 0
                            const isWork = meta.isWorkCal
                            const show = !isWork || u <= 0.0001 ? '' : u.toFixed(1)
                            const workCol = Boolean(ds && isEvmCalendarWorkdayYmd(ds, nonWorkingDaysList))
                            return (
                              <div
                                key={vc.key}
                                className={cn(
                                  'absolute top-0 box-border flex items-center justify-center border-r border-border/50 px-0 py-0.5 text-center text-xs tabular-nums last:border-r-0',
                                  ri % 2 === 1 ? 'bg-muted' : 'bg-background',
                                  !meta.isWorkCal && 'bg-zinc-400/15 dark:bg-zinc-600/25',
                                  meta.isReport && 'bg-amber-100/70 dark:bg-amber-950/30',
                                )}
                                style={{ left: vc.start - PIN_TOTAL, width: vc.size, height: '100%' }}
                              >
                                {workCol ? (
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    title={t('evm.wbsGridDayUnitHint')}
                                    className={cn(
                                      'h-full min-h-0 w-full min-w-0 max-w-full rounded-none border-0 bg-transparent px-0.5 py-0 text-center font-normal tabular-nums leading-tight shadow-none',
                                      'text-xs md:text-xs',
                                      'focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-ring',
                                    )}
                                    defaultValue={show}
                                    key={`${row.id}-${ds}-${show}`}
                                    onBlur={e => void persistDayUnitCell(row, ds, e.target.value)}
                                  />
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      </td>
                    </TableRow>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddWBSDialog open={showAdd} onClose={() => setShowAdd(false)} master={master} />
      <EditWbsRowSheetDialog
        row={editRow}
        master={master}
        open={!!editRow}
        onClose={() => setEditRow(null)}
        onSave={saveEdit}
        onRequestDelete={id => setToDelete(id)}
      />

      <AlertDialog open={!!toDelete} onOpenChange={open => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
          <AlertDialogDescription>{t('common.delete')}?</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Chỉnh sửa WBS chi tiết: Phase, Category, Feature, Task, Duration, Predecessor, Assignee, Effort (plan/actual, %, status, est… do hệ thống hoặc chỗ khác). */
function EditWbsRowSheetDialog({
  row,
  master,
  open,
  onClose,
  onSave,
  onRequestDelete,
}: {
  row: WBSRow | null
  master: EVMMaster
  open: boolean
  onClose: () => void
  onSave: (updates: Partial<WBSRow>) => Promise<void>
  onRequestDelete?: (rowId: string) => void
}) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [phase, setPhase] = useState('')
  const [category, setCategory] = useState('')
  const [feature, setFeature] = useState('')
  const [task, setTask] = useState('')
  const [assignee, setAssignee] = useState('')
  const [durationDays, setDurationDays] = useState('')
  const [predecessor, setPredecessor] = useState('')
  const [effort, setEffort] = useState('')

  const projectStartYmd = useEVMStore(s => s.project.startDate)
  const allWbs = useEVMStore(s => s.wbs)

  useEffect(() => {
    if (!row || !open) return
    setPhase(row.phase ?? '')
    setCategory(row.category ?? '')
    setFeature(row.feature ?? '')
    setTask(row.task ?? '')
    setAssignee(row.assignee ?? '')
    setDurationDays(row.durationDays != null ? String(row.durationDays) : '')
    setPredecessor(row.predecessor ?? '')
    setEffort(effortToSelectValue(row))
  }, [row, open])

  const handleSave = async () => {
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
      effort: Number.isFinite(Number(effort)) ? Number(effort) : null,
    }

    if (dura != null && dura >= 1) {
      let planStartOut: string | undefined
      const predTrim = predecessor.trim()
      const predNum = predTrim ? Number(predTrim) : NaN
      const hasPred = predTrim !== '' && Number.isFinite(predNum) && predNum !== row.no
      const predRow = hasPred ? allWbs.find(r => r.no === predNum && r.id !== row.id) : undefined
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

    await onSave(updates)
  }

  if (!row) return null

  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg gap-0 overflow-y-auto p-0 sm:max-w-md">
        <DialogHeader className="space-y-0 border-b px-4 py-3">
          <DialogTitle className="text-base">
            {t('evm.editWbsDetailRow')} — {t('evm.tableNo')} {row.no}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2.5 px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">{t('evm.tablePhase')}</Label>
              <Combobox
                value={phase}
                onValueChange={setPhase}
                options={master.phases.map(p => ({ value: p.code, label: p.name ?? p.code }))}
                placeholder="—"
                triggerClassName="h-8 border-border/60 text-sm"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">{t('evm.tableCategory')}</Label>
              <Input className="h-8 text-sm" value={category} onChange={e => setCategory(e.target.value)} placeholder="—" />
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">{t('evm.tableFeature')}</Label>
              <Input className="h-8 text-sm" value={feature} onChange={e => setFeature(e.target.value)} placeholder="—" />
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{t('evm.tableTask')}</Label>
            <Input className="h-8 text-sm" value={task} onChange={e => setTask(e.target.value)} placeholder="—" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">{t('evm.durationDays')}</Label>
              <Input
                value={durationDays}
                onChange={e => setDurationDays(e.target.value)}
                type="number"
                min={0}
                className="h-8 text-sm"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">{t('evm.predecessor')}</Label>
              <Input className="h-8 text-sm" value={predecessor} onChange={e => setPredecessor(e.target.value)} placeholder="—" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">{t('evm.effort')}</Label>
              <Select value={effort} onValueChange={setEffort}>
                <SelectTrigger className="h-8 w-full min-w-0 text-sm" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WBS_EFFORT_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{t('evm.tableAssignee')}</Label>
            <Combobox
              value={assignee}
              onValueChange={setAssignee}
              options={master.assignees.map(a => ({ value: a.code, label: a.name ?? a.code }))}
              placeholder="—"
              triggerClassName="h-8 border-border/60 text-sm"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 border-t px-4 py-3 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {onRequestDelete ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  onRequestDelete(row.id)
                  onClose()
                }}
              >
                {t('common.delete')}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button type="button" variant={buttonVariant} onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant={buttonVariant} onClick={() => void handleSave()}>
              {t('common.save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
