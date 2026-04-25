'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { eachDayOfInterval, format, isSameWeek } from 'date-fns'
import { type ReactNode, type RefObject, type UIEvent, useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EVMMaster, EVMProject, WBSRow, WbsMasterRow } from 'shared/types/evm'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TableBody, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { formatDateDisplay, parseLocalDate, toYyyyMmDd } from '@/lib/dateUtils'
import {
  computeWbsMasterRollupRows,
  isEvmCalendarWorkdayYmd,
  mergeWbsDayUnitsStoredWithPlan,
  sumMergedDayUnitsForDetailRowsOnDate,
  type WbsMasterRollupRow,
  wbsDetailRowsForRollupKey,
} from '@/lib/evmCalculations'
import i18n from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useEVMStore } from '@/stores/useEVMStore'
import {
  EVM_SCHEDULE_DAY_COL_PX,
  EVM_SCHEDULE_ROW_PX,
  EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
  EVM_WBS_PINNED_COL_WIDTHS,
  useEvmScheduleColumnVirtualizer,
} from './useEvmScheduleColumnVirtualizer'

const WEEK_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

/** Cột meta ghim — cùng chỉ số/độ rộng với WBS Schedule detail (`EVM_WBS_PINNED_COL_WIDTHS`). */
const META_PIN = EVM_WBS_PINNED_COL_WIDTHS

function metaPinLeft(i: number): number {
  let s = 0
  for (let j = 0; j < i && j < META_PIN.length; j++) {
    const w = META_PIN[j]
    if (w !== undefined) s += w
  }
  return s
}

function metaPinWidth(from: number, to: number): number {
  let s = 0
  for (let j = from; j < to && j < META_PIN.length; j++) {
    const w = META_PIN[j]
    if (w !== undefined) s += w
  }
  return s
}

/** border-separate: chỉ r+b (+ t/l mép) — tránh viền dày gấp đôi giữa hai ô. */
const META_STICKY_TH_BASE =
  'sticky z-40 box-border border-solid border-border/80 bg-muted text-foreground text-center align-middle text-sm font-semibold leading-tight'

function metaHeaderThEdges(colIndex: number) {
  return colIndex === 0 ? 'border-t border-l border-r border-b' : 'border-t border-r border-b'
}

/** Ô ghim hàng 1 (rowspan) — cạnh ô gộp colspan không bị đứt nhờ box-border. */
function metaHeaderTh(colIndex: number, className: string, children: ReactNode, rowSpan: number) {
  return (
    <th
      rowSpan={rowSpan}
      className={cn(META_STICKY_TH_BASE, 'px-1 py-1', metaHeaderThEdges(colIndex), className)}
      style={{
        left: metaPinLeft(colIndex),
        width: META_PIN[colIndex],
        minWidth: META_PIN[colIndex],
        maxWidth: colIndex === 4 ? 160 : META_PIN[colIndex],
      }}
    >
      <span
        className="flex items-center justify-center gap-0.5"
        style={{ minHeight: rowSpan * EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX }}
      >
        {children}
      </span>
    </th>
  )
}

/** Một ô header nhóm (colspan) ghim trái. */
function metaGroupTh(fromCol: number, toCol: number, className: string, children: ReactNode) {
  const span = toCol - fromCol
  return (
    <th
      colSpan={span}
      className={cn(META_STICKY_TH_BASE, 'border-t border-r border-b', className)}
      style={{
        left: metaPinLeft(fromCol),
        width: metaPinWidth(fromCol, toCol),
        minWidth: metaPinWidth(fromCol, toCol),
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

function metaDetailTh(colIndex: number, className: string, children: ReactNode, rowSpan?: number) {
  const rs = rowSpan ?? 1
  const spanMin = rs * EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX
  return (
    <th
      rowSpan={rs > 1 ? rs : undefined}
      className={cn(
        META_STICKY_TH_BASE,
        'border-r border-b px-1 py-0.5 text-sm leading-tight',
        className,
      )}
      style={{
        left: metaPinLeft(colIndex),
        width: META_PIN[colIndex],
        minWidth: META_PIN[colIndex],
        maxWidth: colIndex === 4 ? 160 : META_PIN[colIndex],
      }}
    >
      <span className="flex items-center justify-center gap-0.5" style={{ minHeight: spanMin }}>
        {children}
      </span>
    </th>
  )
}

function metaStickyTd(
  colIndex: number,
  rowParity: number,
  className: string,
  children: ReactNode,
  title?: string,
) {
  const bg = rowParity % 2 === 1 ? 'bg-muted' : 'bg-background'
  const w = META_PIN[colIndex] ?? 40
  const edge = colIndex === 0 ? 'border-l border-r border-b' : 'border-r border-b'
  return (
    <td
      className={cn(
        'sticky z-10 box-border border-solid border-border/55 px-1 py-0.5 text-sm',
        edge,
        bg,
        className,
      )}
      style={{ left: metaPinLeft(colIndex), width: w, minWidth: w, maxWidth: colIndex === 4 ? 160 : w }}
      title={title}
    >
      {children}
    </td>
  )
}

function fmt(n: number, d: number) {
  return Number.isFinite(n) ? n.toFixed(d) : '—'
}

function rollupAssigneeLabel(r: WbsMasterRollupRow, wbsMaster: WbsMasterRow[], evmMaster: EVMMaster): string {
  if (r.masterId) {
    const rec = wbsMaster.find(m => m.id === r.masterId)
    const code = rec?.assignee?.trim() ?? ''
    if (!code) return '—'
    const a = evmMaster.assignees.find(x => x.code === code)
    return (a?.name ?? a?.code ?? code).trim() || '—'
  }
  return r.assigneeSummary?.trim() || '—'
}

function groupConsecutiveDaysByWeek(days: Date[]): Date[][] {
  if (days.length === 0) return []
  const head = days[0]
  if (!head) return []
  const groups: Date[][] = []
  let cur: Date[] = [head]
  for (let i = 1; i < days.length; i++) {
    const d = days[i]
    const prev = days[i - 1]
    if (!d || !prev) continue
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

function computeProjectDays(project: EVMProject): Date[] {
  if (!project.startDate?.trim() || !project.endDate?.trim()) return []
  const start = parseLocalDate(project.startDate)
  const end = parseLocalDate(project.endDate)
  if (!start || !end) return []
  if (end < start) return []
  return eachDayOfInterval({ start, end })
}

export function WbsRollupTable({
  master,
  wbsFiltered,
  nonWorkingDays,
  scrollContainerRef,
  horizontalScrollPeerRef,
}: {
  master: EVMMaster
  wbsFiltered: WBSRow[]
  nonWorkingDays: string[]
  scrollContainerRef?: RefObject<HTMLDivElement | null>
  horizontalScrollPeerRef?: RefObject<HTMLElement | null>
}) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const project = useEVMStore(s => s.project)
  const wbsMaster = useEVMStore(s => s.wbsMaster)
  const wbsDayUnits = useEVMStore(s => s.wbsDayUnits ?? [])
  const wbsAll = useEVMStore(s => s.wbs)
  const updateWbsRow = useEVMStore(s => s.updateWbsRow)
  const updateWbsMaster = useEVMStore(s => s.updateWbsMaster)

  const rollups = useMemo(() => {
    const computed = computeWbsMasterRollupRows(project, wbsFiltered, nonWorkingDays, wbsDayUnits)
    const masterOrder = new Map(wbsMaster.map(m => [m.id, m.sortNo]))
    return computed.sort((a, b) => {
      const rowsA = wbsDetailRowsForRollupKey(wbsFiltered, a.rollupKey)
      const rowsB = wbsDetailRowsForRollupKey(wbsFiltered, b.rollupKey)
      const sortA = rowsA[0]?.masterId ? masterOrder.get(rowsA[0].masterId) ?? 1e9 : 1e9
      const sortB = rowsB[0]?.masterId ? masterOrder.get(rowsB[0].masterId) ?? 1e9 : 1e9
      if (sortA !== sortB) return sortA - sortB
      return a.phase.localeCompare(b.phase) || a.category.localeCompare(b.category) || a.feature.localeCompare(b.feature)
    })
  }, [project, wbsFiltered, nonWorkingDays, wbsMaster, wbsDayUnits])

  const projectDays = useMemo(() => computeProjectDays(project), [project])
  const merged = useMemo(
    () => mergeWbsDayUnitsStoredWithPlan(wbsFiltered, wbsDayUnits, nonWorkingDays),
    [wbsFiltered, wbsDayUnits, nonWorkingDays],
  )
  const reportNorm = project.reportDate?.trim() ? toYyyyMmDd(project.reportDate.slice(0, 10)) : ''

  const dayColMeta = useMemo(() => {
    return projectDays.map(d => {
      const ds = toYyyyMmDd(d) ?? format(d, 'yyyy-MM-dd')
      const isWorkCal = isEvmCalendarWorkdayYmd(ds, nonWorkingDays)
      const isReport = !!reportNorm && ds === reportNorm
      return { ds, isWorkCal, isReport }
    })
  }, [projectDays, reportNorm, nonWorkingDays])

  const weekBands = useMemo(() => {
    if (projectDays.length === 0) return []
    const groups = groupConsecutiveDaysByWeek(projectDays)
    let startIdx = 0
    return groups.map(g => {
      const g0 = g[0]
      const gLast = g[g.length - 1]
      const label = g0 && gLast ? weekBandLabel(g0, gLast) : ''
      const len = g.length
      const row = { startIdx, len, label }
      startIdx += len
      return row
    })
  }, [projectDays])

  const unitsMatrix = useMemo(() => {
    return rollups.map(r => {
      const details = wbsDetailRowsForRollupKey(wbsFiltered, r.rollupKey)
      return projectDays.map(d => {
        const ds = toYyyyMmDd(d) ?? format(d, 'yyyy-MM-dd')
        return sumMergedDayUnitsForDetailRowsOnDate(details, merged, ds, nonWorkingDays)
      })
    })
  }, [rollups, wbsFiltered, merged, projectDays, nonWorkingDays])

  const localScrollRef = useRef<HTMLDivElement>(null)
  const scrollRef = scrollContainerRef ?? localScrollRef
  const metaPinTotalPx = metaPinWidth(0, META_PIN.length)

  const onSyncHorizontalScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const peer = horizontalScrollPeerRef?.current
      if (!peer) return
      const left = e.currentTarget.scrollLeft
      if (peer.scrollLeft !== left) peer.scrollLeft = left
    },
    [horizontalScrollPeerRef],
  )
  const colVirtualizer = useEvmScheduleColumnVirtualizer(scrollRef, projectDays.length, {
    leadingPinnedWidthPx: metaPinTotalPx,
  })
  const rowVirtualizer = useVirtualizer({
    count: rollups.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => EVM_SCHEDULE_ROW_PX,
    overscan: 10,
  })
  const dayTimelinePx = projectDays.length > 0 ? colVirtualizer.getTotalSize() : 0
  const tableMinWidth = metaPinTotalPx + dayTimelinePx

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<WbsMasterRollupRow | null>(null)
  const [phase, setPhase] = useState('')
  const [category, setCategory] = useState('')
  const [feature, setFeature] = useState('')
  const [note, setNote] = useState('')
  const [assignee, setAssignee] = useState('')

  const openEdit = useCallback((r: WbsMasterRollupRow) => {
    setEditing(r)
    setPhase(r.phase)
    setCategory(r.category)
    setFeature(r.feature)
    setNote(r.note)
    const masterRec = r.masterId ? wbsMaster.find(m => m.id === r.masterId) : undefined
    setAssignee(masterRec?.assignee ?? '')
    setEditOpen(true)
  }, [wbsMaster])

  const applyBulk = useCallback(async () => {
    if (!editing) return
    const targets = wbsDetailRowsForRollupKey(wbsAll, editing.rollupKey)
    if (targets.length === 0) {
      setEditOpen(false)
      return
    }
    const phaseVal = phase.trim() || undefined
    const catVal = category.trim() || undefined
    const featVal = feature.trim() || undefined
    const noteVal = note.trim() || undefined
    try {
      if (editing.masterId) {
        await updateWbsMaster(editing.masterId, {
          phase: phase.trim() === '' ? null : phase.trim(),
          category: category.trim() === '' ? null : category.trim(),
          feature: feature.trim() === '' ? null : feature.trim(),
          note: note.trim() === '' ? null : note.trim(),
          assignee: assignee.trim() === '' ? null : assignee.trim(),
        })
      } else {
        for (const row of targets) {
          await updateWbsRow(row.id, {
            phase: phaseVal,
            category: catVal,
            feature: featVal,
            wbsNote: noteVal,
          })
        }
      }
      toast.success(t('common.save'))
      setEditOpen(false)
      setEditing(null)
    } catch {
      toast.error(t('evm.saveFailed'))
    }
  }, [editing, wbsAll, phase, category, feature, note, assignee, updateWbsRow, updateWbsMaster, t])

  const hasTimeline = projectDays.length > 0
  const rollupColSpan = META_PIN.length + 1

  return (
    <>
      <div className="bg-card/20">
        <div
          ref={hasTimeline ? scrollRef : undefined}
          onScroll={hasTimeline && horizontalScrollPeerRef ? onSyncHorizontalScroll : undefined}
          className="max-h-[min(52vh,520px)] overflow-auto rounded-md border border-border/40 [overflow-anchor:none]"
        >
          {hasTimeline ? (
            <>
              <div
                className="sticky top-0 z-[35] bg-muted shadow-[0_1px_0_0_var(--border)]"
                style={{ width: tableMinWidth, minWidth: tableMinWidth }}
              >
                <table
                  className="border-separate border-spacing-0 text-sm"
                  style={{ width: tableMinWidth, tableLayout: 'fixed' }}
                >
                  <colgroup>
                    {META_PIN.map((w, i) => (
                      <col key={i} style={{ width: w, minWidth: w }} />
                    ))}
                    <col style={{ minWidth: dayTimelinePx, width: dayTimelinePx }} />
                  </colgroup>
                  <thead className="bg-muted">
                    <TableRow className="bg-muted/40">
                      {metaHeaderTh(0, '', t('evm.tableNo'), 3)}
                      {metaGroupTh(1, 5, '', t('evm.wbsMasterExcelGroupMaster'))}
                      {metaGroupTh(5, 7, '', t('evm.wbsSchedulePlanGroup'))}
                      {metaGroupTh(7, 9, '', t('evm.wbsScheduleActualGroup'))}
                      {metaHeaderTh(9, '', t('evm.tableAssignee'), 3)}
                      {metaGroupTh(10, 16, '', t('evm.wbsMasterExcelGroupEvm'))}
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
                              style={{ width: band.len * EVM_SCHEDULE_DAY_COL_PX }}
                            >
                              {band.label}
                            </div>
                          ))}
                        </div>
                      </th>
                    </TableRow>
                    <TableRow className="bg-muted/90">
                      {metaDetailTh(1, 'whitespace-normal', t('evm.tablePhase'), 2)}
                      {metaDetailTh(2, 'whitespace-normal', t('evm.tableCategory'), 2)}
                      {metaDetailTh(3, 'whitespace-normal', t('evm.tableFeature'), 2)}
                      {metaDetailTh(4, 'whitespace-normal', t('evm.wbsNote'), 2)}
                      {metaDetailTh(5, 'whitespace-nowrap tabular-nums', t('evm.planStart'), 2)}
                      {metaDetailTh(6, 'whitespace-nowrap tabular-nums', t('evm.planEnd'), 2)}
                      {metaDetailTh(7, 'whitespace-nowrap tabular-nums', t('evm.actualStart'), 2)}
                      {metaDetailTh(8, 'whitespace-nowrap tabular-nums', t('evm.actualEnd'), 2)}
                      {metaDetailTh(10, 'tabular-nums', t('evm.kpiBAC'), 2)}
                      {metaDetailTh(11, 'tabular-nums', t('evm.kpiPV'), 2)}
                      {metaDetailTh(12, 'tabular-nums', t('evm.kpiEV'), 2)}
                      {metaDetailTh(13, 'tabular-nums', t('evm.kpiSV'), 2)}
                      {metaDetailTh(14, 'tabular-nums', t('evm.kpiSPI'), 2)}
                      {metaDetailTh(15, 'tabular-nums', t('evm.kpiProgress'), 2)}
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
                                style={{ left: vc.start - metaPinTotalPx, width: vc.size, height: '100%' }}
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
                                style={{ left: vc.start - metaPinTotalPx, width: vc.size, height: '100%' }}
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
                  {META_PIN.map((w, i) => (
                    <col key={i} style={{ width: w, minWidth: w }} />
                  ))}
                  <col style={{ minWidth: dayTimelinePx, width: dayTimelinePx }} />
                </colgroup>
                <tbody
                  className="relative block"
                  style={{
                    width: tableMinWidth,
                    ...(rollups.length === 0 ? undefined : { height: rowVirtualizer.getTotalSize() }),
                  }}
                >
                  {rollups.length === 0 ? (
                    <TableRow style={{ display: 'table', width: '100%', tableLayout: 'fixed' }}>
                      <td
                        colSpan={rollupColSpan}
                        className="box-border border-t border-l border-r border-b border-solid border-border/60 px-2 py-8 text-center text-muted-foreground"
                      >
                        {t('evm.rollupEmpty')}
                      </td>
                    </TableRow>
                  ) : (
                    rowVirtualizer.getVirtualItems().map(vr => {
                    const r = rollups[vr.index]
                    if (!r) return null
                    const ri = vr.index
                    const band = unitsMatrix[ri] ?? []
                    const assigneeLabel = rollupAssigneeLabel(r, wbsMaster, master)
                    return (
                      <TableRow
                        key={r.rollupKey}
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
                        onClick={() => openEdit(r)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openEdit(r)
                          }
                        }}
                      >
                        {metaStickyTd(0, ri, 'text-center font-mono tabular-nums text-muted-foreground', ri + 1)}
                        {metaStickyTd(1, ri, 'max-w-[72px] truncate', r.phase || '—', r.phase ?? undefined)}
                        {metaStickyTd(2, ri, 'max-w-[88px] truncate', r.category || '—')}
                        {metaStickyTd(3, ri, 'max-w-[88px] truncate', r.feature || '—')}
                        {metaStickyTd(4, ri, 'max-w-[120px] truncate', r.note || '—', r.note ?? undefined)}
                        {metaStickyTd(5, ri, 'whitespace-nowrap', formatDateDisplay(r.planStartMin, i18n.language))}
                        {metaStickyTd(6, ri, 'whitespace-nowrap', formatDateDisplay(r.planEndMax, i18n.language))}
                        {metaStickyTd(7, ri, 'whitespace-nowrap', formatDateDisplay(r.actualStartMin, i18n.language))}
                        {metaStickyTd(8, ri, 'whitespace-nowrap', formatDateDisplay(r.actualEndMax, i18n.language))}
                        {metaStickyTd(
                          9,
                          ri,
                          'max-w-[100px] truncate',
                          assigneeLabel,
                          assigneeLabel !== '—' ? assigneeLabel : undefined,
                        )}
                        {metaStickyTd(10, ri, 'text-right tabular-nums', fmt(r.bac, 2))}
                        {metaStickyTd(11, ri, 'text-right tabular-nums', fmt(r.pv, 2))}
                        {metaStickyTd(12, ri, 'text-right tabular-nums', fmt(r.ev, 2))}
                        {metaStickyTd(13, ri, 'text-right tabular-nums', fmt(r.sv, 2))}
                        {metaStickyTd(14, ri, 'text-right tabular-nums', fmt(r.spi, 3))}
                        {metaStickyTd(15, ri, 'text-right tabular-nums', `${(r.progress * 100).toFixed(1)}%`)}
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
                              const u = band[vc.index] ?? 0
                              const isWork = meta?.isWorkCal ?? false
                              const show = !isWork || u <= 0.0001 ? '' : u.toFixed(1)
                              return (
                                <div
                                  key={vc.key}
                                  className={cn(
                                    'absolute top-0 flex items-center justify-center border-r border-border/50 px-0 py-0.5 text-center text-xs tabular-nums last:border-r-0',
                                    ri % 2 === 1 ? 'bg-muted' : 'bg-background',
                                    !meta.isWorkCal && 'bg-zinc-400/15 dark:bg-zinc-600/25',
                                    meta.isReport && 'bg-amber-100/70 dark:bg-amber-950/30',
                                  )}
                                  style={{ left: vc.start - metaPinTotalPx, width: vc.size, height: '100%' }}
                                >
                                  {show}
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
            </>
          ) : (
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-muted">
                <TableRow className="bg-muted/40">
                  {metaHeaderTh(0, '', t('evm.tableNo'), 2)}
                  {metaGroupTh(1, 5, '', t('evm.wbsMasterExcelGroupMaster'))}
                  {metaGroupTh(5, 7, '', t('evm.wbsSchedulePlanGroup'))}
                  {metaGroupTh(7, 9, '', t('evm.wbsScheduleActualGroup'))}
                  {metaHeaderTh(9, '', t('evm.tableAssignee'), 2)}
                  {metaGroupTh(10, 16, '', t('evm.wbsMasterExcelGroupEvm'))}
                  <th
                    rowSpan={2}
                    className="sticky top-0 z-30 box-border border-t border-r border-b border-solid border-border/80 bg-muted px-2 py-2 text-center align-middle text-foreground text-sm font-semibold leading-tight"
                  >
                    {t('evm.wbsMasterTimelinePlaceholder')}
                  </th>
                </TableRow>
                <TableRow className="bg-muted/90">
                  {metaDetailTh(1, 'whitespace-normal', t('evm.tablePhase'))}
                  {metaDetailTh(2, 'whitespace-normal', t('evm.tableCategory'))}
                  {metaDetailTh(3, 'whitespace-normal', t('evm.tableFeature'))}
                  {metaDetailTh(4, 'whitespace-normal', t('evm.wbsNote'))}
                  {metaDetailTh(5, 'whitespace-nowrap tabular-nums', t('evm.planStart'))}
                  {metaDetailTh(6, 'whitespace-nowrap tabular-nums', t('evm.planEnd'))}
                  {metaDetailTh(7, 'whitespace-nowrap tabular-nums', t('evm.actualStart'))}
                  {metaDetailTh(8, 'whitespace-nowrap tabular-nums', t('evm.actualEnd'))}
                  {metaDetailTh(10, 'tabular-nums', t('evm.kpiBAC'))}
                  {metaDetailTh(11, 'tabular-nums', t('evm.kpiPV'))}
                  {metaDetailTh(12, 'tabular-nums', t('evm.kpiEV'))}
                  {metaDetailTh(13, 'tabular-nums', t('evm.kpiSV'))}
                  {metaDetailTh(14, 'tabular-nums', t('evm.kpiSPI'))}
                  {metaDetailTh(15, 'tabular-nums', t('evm.kpiProgress'))}
                </TableRow>
              </thead>
              <TableBody>
                {rollups.length === 0 ? (
                  <TableRow>
                    <td
                      colSpan={rollupColSpan}
                      className="box-border border-t border-l border-r border-b border-solid border-border/60 px-2 py-8 text-center text-muted-foreground"
                    >
                      {t('evm.rollupEmpty')}
                    </td>
                  </TableRow>
                ) : (
                  rollups.map((r, idx) => {
                  const ri = idx
                  const assigneeLabel = rollupAssigneeLabel(r, wbsMaster, master)
                  return (
                    <TableRow
                      key={r.rollupKey}
                      role="button"
                      tabIndex={0}
                      className="hover:bg-muted cursor-pointer"
                      style={{ height: EVM_SCHEDULE_ROW_PX }}
                      onClick={() => openEdit(r)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openEdit(r)
                        }
                      }}
                    >
                      {metaStickyTd(0, ri, 'text-center font-mono tabular-nums text-muted-foreground', idx + 1)}
                      {metaStickyTd(1, ri, 'max-w-[72px] truncate', r.phase || '—', r.phase ?? undefined)}
                      {metaStickyTd(2, ri, 'max-w-[88px] truncate', r.category || '—')}
                      {metaStickyTd(3, ri, 'max-w-[88px] truncate', r.feature || '—')}
                      {metaStickyTd(4, ri, 'max-w-[120px] truncate', r.note || '—', r.note ?? undefined)}
                      {metaStickyTd(5, ri, 'whitespace-nowrap', formatDateDisplay(r.planStartMin, i18n.language))}
                      {metaStickyTd(6, ri, 'whitespace-nowrap', formatDateDisplay(r.planEndMax, i18n.language))}
                      {metaStickyTd(7, ri, 'whitespace-nowrap', formatDateDisplay(r.actualStartMin, i18n.language))}
                      {metaStickyTd(8, ri, 'whitespace-nowrap', formatDateDisplay(r.actualEndMax, i18n.language))}
                      {metaStickyTd(
                        9,
                        ri,
                        'max-w-[100px] truncate',
                        assigneeLabel,
                        assigneeLabel !== '—' ? assigneeLabel : undefined,
                      )}
                      {metaStickyTd(10, ri, 'text-right tabular-nums', fmt(r.bac, 2))}
                      {metaStickyTd(11, ri, 'text-right tabular-nums', fmt(r.pv, 2))}
                      {metaStickyTd(12, ri, 'text-right tabular-nums', fmt(r.ev, 2))}
                      {metaStickyTd(13, ri, 'text-right tabular-nums', fmt(r.sv, 2))}
                      {metaStickyTd(14, ri, 'text-right tabular-nums', fmt(r.spi, 3))}
                      {metaStickyTd(15, ri, 'text-right tabular-nums', `${(r.progress * 100).toFixed(1)}%`)}
                      <td className="box-border border-r border-b border-solid border-border/50 px-2 py-1 text-center text-muted-foreground">
                        —
                      </td>
                    </TableRow>
                  )
                })
                )}
              </TableBody>
            </table>
          )}
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={o => !o && setEditOpen(false)}>
        <DialogContent className="max-w-md gap-0 p-0 sm:max-w-lg">
          <DialogHeader className="space-y-0 border-b px-4 py-3">
            <DialogTitle className="text-base">{t('evm.rollupBulkEditTitle')}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-2 px-4 py-3 sm:grid-cols-2">
              <div className="grid gap-1 sm:col-span-2">
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
                <Input className="h-8 text-sm" value={category} onChange={e => setCategory(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">{t('evm.tableFeature')}</Label>
                <Input className="h-8 text-sm" value={feature} onChange={e => setFeature(e.target.value)} />
              </div>
              <div className="grid gap-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">{t('evm.wbsNote')}</Label>
                <Input className="h-8 text-sm" value={note} onChange={e => setNote(e.target.value)} />
              </div>
              {editing.masterId ? (
                <div className="grid gap-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">{t('evm.tableAssignee')}</Label>
                  <Combobox
                    value={assignee}
                    onValueChange={setAssignee}
                    options={[
                      { value: '', label: '—' },
                      ...master.assignees.map(a => ({ value: a.code, label: a.name ?? a.code })),
                    ]}
                    placeholder="—"
                    triggerClassName="h-8 border-border/60 text-sm"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2 border-t px-4 py-3 sm:justify-end">
            <Button type="button" variant={buttonVariant} size="sm" className="h-8" onClick={() => setEditOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant={buttonVariant} size="sm" className="h-8" onClick={() => void applyBulk()}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
