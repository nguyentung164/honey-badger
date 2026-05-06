'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { eachDayOfInterval, format, isSameWeek } from 'date-fns'
import {
  type CSSProperties,
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
const DAY_COL_PX = EVM_SCHEDULE_DAY_COL_PX

const PIN_TOTAL = PIN_W.reduce((a, b) => a + b, 0)
const PIN_GRID_TEMPLATE_COLS = PIN_W.map(w => `${w}px`).join(' ')
const H = EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX

const DETAIL_HEADER_CELL =
  'box-border border-solid border-border/80 bg-muted text-foreground text-center text-sm font-semibold leading-tight flex items-center justify-center px-1 py-1'

function detailHeaderCellBorder(colIndex: number, row: 'top' | 'mid' | 'bot') {
  const l = colIndex === 0 ? 'border-l' : ''
  const t = row === 'top' ? 'border-t' : ''
  return cn(l, t, 'border-r border-b')
}

function detailBodyCellBorder(colIndex: number) {
  return colIndex === 0 ? 'border-l border-r border-b' : 'border-r border-b'
}

function detailBodyCell(
  colIndex: number,
  rowParity: number,
  className: string,
  children: ReactNode,
  title?: string,
) {
  const bg = rowParity % 2 === 1 ? 'bg-muted' : 'bg-background'
  const w = PIN_W[colIndex] ?? 40
  return (
    <div
      className={cn(
        'box-border shrink-0 border-solid border-border/55 px-1 py-0.5 text-sm flex items-center justify-center min-h-0 overflow-hidden',
        detailBodyCellBorder(colIndex),
        bg,
        className,
      )}
      style={{ width: w, minWidth: w, maxWidth: colIndex === 4 ? 160 : w }}
      title={title}
    >
      {children}
    </div>
  )
}

const WBS_EFFORT_OPTIONS = ['0.25', '0.50', '0.75', '0.00', '1.00', '2.00', '3.00', '4.00', '5.00'] as const

function effortToSelectValue(row: WBSRow | null): string {
  if (!row || row.effort == null || !Number.isFinite(row.effort)) return '1.00'
  const hit = WBS_EFFORT_OPTIONS.find(o => Math.abs(Number(o) - Number(row.effort)) < 1e-6)
  return hit ?? '1.00'
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
  const [dayEditTarget, setDayEditTarget] = useState<{ row: WBSRow; focusDs: string } | null>(null)
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

  const pinnedHeaderGridStyle = useMemo(
    (): CSSProperties => ({
      display: 'grid',
      gridTemplateColumns: PIN_GRID_TEMPLATE_COLS,
      gridTemplateRows: `repeat(3, ${H}px)`,
      width: PIN_TOTAL,
      minWidth: PIN_TOTAL,
      boxSizing: 'border-box',
    }),
    [],
  )

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

  const saveDayUnitsFromDialog = useCallback(
    async (rowId: string, entries: { workDate: string; unit: number }[]) => {
      const nw = nonWorkingDaysList
      try {
        await replaceWbsDayUnitsForRow(rowId, entries)
        const plan = deriveWbsPlanFromSparseDayUnits(entries, nw)
        await updateWbsRow(rowId, {
          planStartDate: (entries.length === 0 ? null : plan.planStartDate) as string | undefined,
          planEndDate: (entries.length === 0 ? null : plan.planEndDate) as string | undefined,
          durationDays: entries.length === 0 ? null : plan.durationDays,
        } as Partial<WBSRow>)
        setDayEditTarget(null)
        toast.success(t('common.save'))
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
            className="sticky top-0 z-[35] flex shrink-0 bg-muted shadow-[0_1px_0_0_var(--border)]"
            style={{ width: tableMinWidth, minWidth: tableMinWidth }}
          >
            <div className="sticky left-0 z-40 shrink-0 bg-muted" style={{ width: PIN_TOTAL }}>
              <div className="text-sm" style={pinnedHeaderGridStyle}>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'tabular-nums', detailHeaderCellBorder(0, 'top'))}
                  style={{ gridRow: '1 / 4', gridColumn: '1 / 2' }}
                >
                  {t('evm.tableNo')}
                </div>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'border-t border-r border-b')}
                  style={{ gridRow: '1 / 2', gridColumn: '2 / 6' }}
                >
                  {t('evm.wbsScheduleExcelGroupDetails')}
                </div>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'tabular-nums', detailHeaderCellBorder(5, 'top'))}
                  style={{ gridRow: '1 / 4', gridColumn: '6 / 7' }}
                >
                  {t('evm.durationDays')}
                </div>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'border-t border-r border-b')}
                  style={{ gridRow: '1 / 2', gridColumn: '7 / 9' }}
                >
                  {t('evm.wbsSchedulePlanGroup')}
                </div>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'tabular-nums', detailHeaderCellBorder(8, 'top'))}
                  style={{ gridRow: '1 / 4', gridColumn: '9 / 10' }}
                >
                  {t('evm.predecessor')}
                </div>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'border-t border-r border-b')}
                  style={{ gridRow: '1 / 2', gridColumn: '10 / 12' }}
                >
                  {t('evm.wbsScheduleActualGroup')}
                </div>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'whitespace-normal', detailHeaderCellBorder(11, 'top'))}
                  style={{ gridRow: '1 / 4', gridColumn: '12 / 13' }}
                >
                  {t('evm.tableAssignee')}
                </div>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'tabular-nums', detailHeaderCellBorder(12, 'top'))}
                  style={{ gridRow: '1 / 4', gridColumn: '13 / 14' }}
                >
                  {t('evm.percentDone')}
                </div>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'whitespace-normal', detailHeaderCellBorder(13, 'top'))}
                  style={{ gridRow: '1 / 4', gridColumn: '14 / 15' }}
                >
                  {t('evm.tableStatus')}
                </div>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'tabular-nums', detailHeaderCellBorder(14, 'top'))}
                  style={{ gridRow: '1 / 4', gridColumn: '15 / 16' }}
                >
                  {t('evm.effort')}
                </div>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'tabular-nums', detailHeaderCellBorder(15, 'top'))}
                  style={{ gridRow: '1 / 4', gridColumn: '16 / 17' }}
                >
                  {t('evm.estMd')}
                </div>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'whitespace-normal', detailHeaderCellBorder(1, 'mid'))}
                  style={{ gridRow: '2 / 4', gridColumn: '2 / 3' }}
                >
                  {t('evm.tablePhase')}
                </div>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'whitespace-normal', detailHeaderCellBorder(2, 'mid'))}
                  style={{ gridRow: '2 / 4', gridColumn: '3 / 4' }}
                >
                  {t('evm.tableCategory')}
                </div>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'whitespace-normal', detailHeaderCellBorder(3, 'mid'))}
                  style={{ gridRow: '2 / 4', gridColumn: '4 / 5' }}
                >
                  {t('evm.tableFeature')}
                </div>
                <div
                  className={cn(DETAIL_HEADER_CELL, 'whitespace-normal', detailHeaderCellBorder(4, 'mid'))}
                  style={{ gridRow: '2 / 4', gridColumn: '5 / 6' }}
                >
                  {t('evm.tableTask')}
                </div>
                <div
                  className={cn(
                    DETAIL_HEADER_CELL,
                    'whitespace-nowrap tabular-nums',
                    detailHeaderCellBorder(6, 'mid'),
                  )}
                  style={{ gridRow: '2 / 4', gridColumn: '7 / 8' }}
                >
                  {t('evm.planStart')}
                </div>
                <div
                  className={cn(
                    DETAIL_HEADER_CELL,
                    'whitespace-nowrap tabular-nums',
                    detailHeaderCellBorder(7, 'mid'),
                  )}
                  style={{ gridRow: '2 / 4', gridColumn: '8 / 9' }}
                >
                  {t('evm.planEnd')}
                </div>
                <div
                  className={cn(
                    DETAIL_HEADER_CELL,
                    'whitespace-nowrap tabular-nums',
                    detailHeaderCellBorder(9, 'mid'),
                  )}
                  style={{ gridRow: '2 / 4', gridColumn: '10 / 11' }}
                >
                  {t('evm.actualStart')}
                </div>
                <div
                  className={cn(
                    DETAIL_HEADER_CELL,
                    'whitespace-nowrap tabular-nums',
                    detailHeaderCellBorder(10, 'mid'),
                  )}
                  style={{ gridRow: '2 / 4', gridColumn: '11 / 12' }}
                >
                  {t('evm.actualEnd')}
                </div>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col bg-muted" style={{ width: dayTimelinePx, minWidth: dayTimelinePx }}>
              <div
                className="box-border flex h-full min-h-0 w-full shrink-0 flex-row border-t border-r border-b border-solid border-border/80"
                style={{ height: H, minHeight: H, width: dayTimelinePx }}
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
              <div
                className="relative box-border shrink-0 border-r border-b border-solid border-border/80 bg-muted"
                style={{
                  width: dayTimelinePx,
                  height: H,
                  minHeight: H,
                }}
              >
                <div
                  className="relative h-full min-h-0 w-full"
                  style={{
                    width: colVirtualizer.getTotalSize(),
                    height: H,
                    minHeight: H,
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
                        style={{ left: vc.start - PIN_TOTAL, width: vc.size, height: '100%' }}
                        title={meta.isReport ? t('evm.resourceGridReportCol') : meta.ds}
                      >
                        {format(pd, 'd')}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div
                className="relative box-border shrink-0 border-r border-b border-solid border-border/80 bg-muted text-sm"
                style={{
                  width: dayTimelinePx,
                  height: H,
                  minHeight: H,
                }}
              >
                <div
                  className="relative h-full min-h-0 w-full"
                  style={{
                    width: colVirtualizer.getTotalSize(),
                    height: H,
                    minHeight: H,
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
                        style={{ left: vc.start - PIN_TOTAL, width: vc.size, height: '100%' }}
                      >
                        {WEEK_LETTERS[d.getDay()]}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="text-sm" style={{ width: tableMinWidth, minWidth: tableMinWidth }}>
            <div
              className="relative"
              style={{
                width: tableMinWidth,
                ...(sortedRows.length === 0 ? undefined : { height: rowVirtualizer.getTotalSize() }),
              }}
            >
              {sortedRows.length === 0 ? (
                <div
                  className="box-border flex w-full border-t border-l border-r border-b border-solid border-border/60 px-2 py-8 text-center text-muted-foreground"
                  style={{ minHeight: EVM_SCHEDULE_ROW_PX * 3 }}
                >
                  {t('evm.ganttSidebarEmpty')}
                </div>
              ) : (
                rowVirtualizer.getVirtualItems().map(vr => {
                  const row = sortedRows[vr.index]
                  if (!row) return null
                  const ri = vr.index
                  const arr = unitsByRowId.get(row.id)
                  const estMdSum = sumWbsDayUnits(arr)
                  const estMdLabel = estMdSum > 1e-9 ? estMdSum.toFixed(1) : '—'
                  return (
                    <div
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      className="hover:bg-muted absolute left-0 box-border flex w-full cursor-pointer"
                      style={{
                        top: vr.start,
                        height: vr.size,
                        minHeight: vr.size,
                      }}
                      onClick={() => setEditRow(row)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setEditRow(row)
                        }
                      }}
                    >
                      <div
                        className={cn(
                          'sticky left-0 z-10 flex shrink-0 items-stretch self-stretch border-solid border-border/55',
                          ri % 2 === 1 ? 'bg-muted' : 'bg-background',
                        )}
                        style={{ width: PIN_TOTAL, minWidth: PIN_TOTAL }}
                      >
                        {detailBodyCell(0, ri, 'text-center font-mono tabular-nums text-muted-foreground', row.no)}
                        {detailBodyCell(1, ri, 'max-w-[72px] truncate justify-start', row.phase ?? '—', row.phase ?? undefined)}
                        {detailBodyCell(2, ri, 'max-w-[88px] truncate justify-start', row.category?.trim() ? row.category : '—')}
                        {detailBodyCell(3, ri, 'max-w-[88px] truncate justify-start', row.feature?.trim() ? row.feature : '—')}
                        {detailBodyCell(4, ri, 'truncate justify-start font-medium', row.task ?? '—', row.task ?? undefined)}
                        {detailBodyCell(5, ri, 'text-center tabular-nums', row.durationDays != null ? String(row.durationDays) : '—')}
                        {detailBodyCell(6, ri, 'whitespace-nowrap', formatDateDisplay(row.planStartDate, i18n.language))}
                        {detailBodyCell(7, ri, 'whitespace-nowrap', formatDateDisplay(row.planEndDate, i18n.language))}
                        {detailBodyCell(8, ri, 'text-center font-mono tabular-nums', row.predecessor?.trim() || '—')}
                        {detailBodyCell(9, ri, 'whitespace-nowrap', formatDateDisplay(row.actualStartDate, i18n.language))}
                        {detailBodyCell(10, ri, 'whitespace-nowrap', formatDateDisplay(row.actualEndDate, i18n.language))}
                        {detailBodyCell(
                          11,
                          ri,
                          'max-w-[96px] truncate justify-start',
                          evmAssigneeDisplayName(master, row.assignee, row.assigneeName),
                        )}
                        {detailBodyCell(12, ri, 'text-center tabular-nums', `${((row.percentDone ?? 0) * 100).toFixed(0)}%`)}
                        {detailBodyCell(
                          13,
                          ri,
                          'max-w-[68px] truncate justify-start',
                          row.statusName ?? row.status ?? '—',
                          row.statusName ?? row.status ?? undefined,
                        )}
                        {detailBodyCell(
                          14,
                          ri,
                          'text-center tabular-nums',
                          row.effort != null && Number.isFinite(row.effort) ? String(row.effort) : '—',
                        )}
                        {detailBodyCell(15, ri, 'justify-end text-right tabular-nums', estMdLabel)}
                      </div>
                      <div
                        className="relative shrink-0 self-stretch border-r border-b border-solid border-border/50"
                        style={{ width: dayTimelinePx, minWidth: dayTimelinePx }}
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
                            return (
                              <div
                                key={vc.key}
                                role={isWork ? 'button' : undefined}
                                tabIndex={isWork ? -1 : undefined}
                                className={cn(
                                  'absolute top-0 box-border flex items-center justify-center border-r border-border/50 px-0 py-0.5 text-center text-xs tabular-nums last:border-r-0',
                                  ri % 2 === 1 ? 'bg-muted' : 'bg-background',
                                  !meta.isWorkCal && 'bg-zinc-400/15 dark:bg-zinc-600/25',
                                  meta.isReport && 'bg-amber-100/70 dark:bg-amber-950/30',
                                  isWork && 'cursor-pointer select-none hover:bg-primary/10',
                                )}
                                style={{ left: vc.start - PIN_TOTAL, width: vc.size, height: '100%' }}
                                onClick={isWork ? () => setDayEditTarget({ row, focusDs: ds }) : undefined}
                                title={isWork ? t('evm.wbsGridDayUnitHint') : undefined}
                              >
                                {show}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
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

      <EditDayUnitsDialog
        row={dayEditTarget?.row ?? null}
        focusDs={dayEditTarget?.focusDs ?? ''}
        nonWorkingDays={nonWorkingDaysList}
        open={!!dayEditTarget}
        onClose={() => setDayEditTarget(null)}
        onSave={saveDayUnitsFromDialog}
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

const WEEK_LETTERS_DU = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

/** Dialog chỉnh sửa đơn vị ngày (effort/day) cho một dòng WBS. Chỉ mount khi mở — không có Input thường trực trên lưới. */
function EditDayUnitsDialog({
  row,
  focusDs,
  nonWorkingDays,
  open,
  onClose,
  onSave,
}: {
  row: WBSRow | null
  focusDs: string
  nonWorkingDays: string[]
  open: boolean
  onClose: () => void
  onSave: (rowId: string, entries: { workDate: string; unit: number }[]) => Promise<void>
}) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [values, setValues] = useState<Map<string, string>>(new Map())
  const [saving, setSaving] = useState(false)
  const focusRowRef = useRef<HTMLTableRowElement>(null)

  const planWorkDays = useMemo(() => {
    if (!row) return [] as string[]
    const start = parseLocalDate(row.planStartDate?.trim().slice(0, 10) ?? '')
    const end = parseLocalDate(row.planEndDate?.trim().slice(0, 10) ?? '')
    if (!start || !end || end < start) return [] as string[]
    return eachDayOfInterval({ start, end })
      .map(d => format(d, 'yyyy-MM-dd'))
      .filter(ds => isEvmCalendarWorkdayYmd(ds, nonWorkingDays))
  }, [row, nonWorkingDays])

  useEffect(() => {
    if (!open || !row) return
    const stored = useEVMStore.getState().wbsDayUnits ?? []
    const m = buildDayUnitMapForRow(row, stored, nonWorkingDays)
    const init = new Map<string, string>()
    for (const ds of planWorkDays) {
      const u = m.get(ds) ?? 0
      init.set(ds, u > 1e-9 ? u.toFixed(2) : '')
    }
    setValues(init)
  }, [open, row, planWorkDays, nonWorkingDays])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      focusRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
    }, 60)
    return () => clearTimeout(timer)
  }, [open, focusDs])

  const handleSave = async () => {
    const nw = nonWorkingDays
    const entries: { workDate: string; unit: number }[] = []
    for (const [ds, raw] of values) {
      const trimmed = raw.trim().replace(',', '.')
      if (trimmed === '' || trimmed === '0') continue
      const n = Number(trimmed)
      if (!Number.isFinite(n) || n < 0) {
        toast.error(t('evm.dayUnitInvalid'))
        return
      }
      if (n > 1e-9 && isEvmCalendarWorkdayYmd(ds, nw)) {
        const wd = normalizeEvmCalendarDay(ds) ?? ds.slice(0, 10)
        entries.push({ workDate: wd, unit: n })
      }
    }
    if (!row) return
    setSaving(true)
    try {
      await onSave(row.id, entries)
    } finally {
      setSaving(false)
    }
  }

  const hasPlan = planWorkDays.length > 0

  if (!row) return null

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-xs flex-col gap-0 overflow-hidden p-0 sm:max-w-sm">
        <DialogHeader className="shrink-0 space-y-0.5 border-b px-4 py-3">
          <DialogTitle className="text-base">
            {t('evm.editDayUnitsTitle')} — #{row.no}
          </DialogTitle>
          {row.task ? <p className="max-w-full truncate text-xs text-muted-foreground">{row.task}</p> : null}
        </DialogHeader>

        {hasPlan ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  <th className="border-b border-border/60 px-2 py-1 text-left font-semibold text-muted-foreground">
                    {t('evm.editDayUnitsColDate')}
                  </th>
                  <th className="w-6 border-b border-border/60 px-1 py-1 text-center font-semibold text-muted-foreground" />
                  <th className="w-20 border-b border-border/60 px-2 py-1 text-center font-semibold text-muted-foreground">
                    {t('evm.effort')} (MD)
                  </th>
                </tr>
              </thead>
              <tbody>
                {planWorkDays.map(ds => {
                  const d = parseLocalDate(ds)
                  const isFocus = ds === focusDs
                  const val = values.get(ds) ?? ''
                  return (
                    <tr
                      key={ds}
                      ref={isFocus ? focusRowRef : undefined}
                      className={cn('border-b border-border/30', isFocus && 'bg-primary/10')}
                    >
                      <td className="py-0.5 pl-2 pr-1 tabular-nums text-muted-foreground">{ds}</td>
                      <td className="py-0.5 px-1 text-center text-muted-foreground">
                        {d ? WEEK_LETTERS_DU[d.getDay()] : ''}
                      </td>
                      <td className="py-0.5 px-1">
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-6 rounded-sm border-border/50 px-1 text-center text-xs tabular-nums"
                          value={val}
                          onChange={e => {
                            const v = e.target.value
                            setValues(prev => {
                              const next = new Map(prev)
                              next.set(ds, v)
                              return next
                            })
                          }}
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex-1 px-4 py-8 text-center text-sm text-muted-foreground">
            {t('evm.editDayUnitsNoPlan')}
          </div>
        )}

        <DialogFooter className="shrink-0 gap-2 border-t px-4 py-3 sm:justify-end">
          <Button type="button" variant={buttonVariant} size="sm" className="h-8" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          {hasPlan && (
            <Button type="button" variant={buttonVariant} size="sm" className="h-8" onClick={() => void handleSave()} disabled={saving}>
              {t('common.save')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
