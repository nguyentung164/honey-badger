'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { eachDayOfInterval, format, isSameWeek } from 'date-fns'
import { type CSSProperties, type ReactNode, type RefObject, type UIEvent, useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EVMMaster, EVMProject, WBSRow, WbsMasterRow } from 'shared/types/evm'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

function metaPinWidth(from: number, to: number): number {
  let s = 0
  for (let j = from; j < to && j < META_PIN.length; j++) {
    const w = META_PIN[j]
    if (w !== undefined) s += w
  }
  return s
}

const META_STICKY_HEADER_CELL =
  'box-border border-solid border-border/80 bg-muted text-foreground text-center text-sm font-semibold leading-tight flex items-center justify-center px-1 py-1'

const META_PIN_GRID_TEMPLATE_COLS = META_PIN.map(w => `${w}px`).join(' ')

function metaHeaderCellBorder(colIndex: number, row: 'top' | 'mid' | 'bot') {
  const l = colIndex === 0 ? 'border-l' : ''
  const t = row === 'top' ? 'border-t' : ''
  const b = 'border-b'
  const r = 'border-r'
  return cn(l, t, b, r)
}

function metaBodyCellBorder(colIndex: number) {
  const edge = colIndex === 0 ? 'border-l border-r border-b' : 'border-r border-b'
  return edge
}

function metaBodyCell(
  colIndex: number,
  rowParity: number,
  className: string,
  children: ReactNode,
  title?: string,
) {
  const bg = rowParity % 2 === 1 ? 'bg-muted' : 'bg-background'
  const w = META_PIN[colIndex] ?? 40
  return (
    <div
      className={cn(
        'box-border shrink-0 border-solid border-border/55 px-1 py-0.5 text-sm flex items-center justify-center min-h-0 overflow-hidden',
        metaBodyCellBorder(colIndex),
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

const H = EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX

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

  const openEdit = useCallback(
    (r: WbsMasterRollupRow) => {
      setEditing(r)
      setPhase(r.phase)
      setCategory(r.category)
      setFeature(r.feature)
      setNote(r.note)
      const masterRec = r.masterId ? wbsMaster.find(m => m.id === r.masterId) : undefined
      setAssignee(masterRec?.assignee ?? '')
      setEditOpen(true)
    },
    [wbsMaster],
  )

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

  const pinnedHeaderGridStyle = useMemo(
    (): CSSProperties => ({
      display: 'grid',
      gridTemplateColumns: META_PIN_GRID_TEMPLATE_COLS,
      gridTemplateRows: `repeat(3, ${H}px)`,
      width: metaPinTotalPx,
      minWidth: metaPinTotalPx,
      boxSizing: 'border-box',
    }),
    [metaPinTotalPx],
  )

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
                className="sticky top-0 z-[35] flex shrink-0 bg-muted shadow-[0_1px_0_0_var(--border)]"
                style={{ width: tableMinWidth, minWidth: tableMinWidth }}
              >
                <div className="sticky left-0 z-40 shrink-0 bg-muted" style={{ width: metaPinTotalPx }}>
                  <div className="text-sm" style={pinnedHeaderGridStyle}>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, metaHeaderCellBorder(0, 'top'))}
                      style={{ gridRow: '1 / 4', gridColumn: '1 / 2' }}
                    >
                      {t('evm.tableNo')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'border-t border-r border-b')}
                      style={{ gridRow: '1 / 2', gridColumn: '2 / 6' }}
                    >
                      {t('evm.wbsMasterExcelGroupMaster')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'border-t border-r border-b')}
                      style={{ gridRow: '1 / 2', gridColumn: '6 / 8' }}
                    >
                      {t('evm.wbsSchedulePlanGroup')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'border-t border-r border-b')}
                      style={{ gridRow: '1 / 2', gridColumn: '8 / 10' }}
                    >
                      {t('evm.wbsScheduleActualGroup')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, metaHeaderCellBorder(9, 'top'))}
                      style={{ gridRow: '1 / 4', gridColumn: '10 / 11' }}
                    >
                      {t('evm.tableAssignee')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'border-t border-r border-b')}
                      style={{ gridRow: '1 / 2', gridColumn: '11 / 17' }}
                    >
                      {t('evm.wbsMasterExcelGroupEvm')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-normal', metaHeaderCellBorder(1, 'mid'))}
                      style={{ gridRow: '2 / 4', gridColumn: '2 / 3' }}
                    >
                      {t('evm.tablePhase')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-normal', metaHeaderCellBorder(2, 'mid'))}
                      style={{ gridRow: '2 / 4', gridColumn: '3 / 4' }}
                    >
                      {t('evm.tableCategory')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-normal', metaHeaderCellBorder(3, 'mid'))}
                      style={{ gridRow: '2 / 4', gridColumn: '4 / 5' }}
                    >
                      {t('evm.tableFeature')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-normal', metaHeaderCellBorder(4, 'mid'))}
                      style={{ gridRow: '2 / 4', gridColumn: '5 / 6' }}
                    >
                      {t('evm.wbsNote')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-nowrap tabular-nums', metaHeaderCellBorder(5, 'mid'))}
                      style={{ gridRow: '2 / 4', gridColumn: '6 / 7' }}
                    >
                      {t('evm.planStart')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-nowrap tabular-nums', metaHeaderCellBorder(6, 'mid'))}
                      style={{ gridRow: '2 / 4', gridColumn: '7 / 8' }}
                    >
                      {t('evm.planEnd')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-nowrap tabular-nums', metaHeaderCellBorder(7, 'mid'))}
                      style={{ gridRow: '2 / 4', gridColumn: '8 / 9' }}
                    >
                      {t('evm.actualStart')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-nowrap tabular-nums', metaHeaderCellBorder(8, 'mid'))}
                      style={{ gridRow: '2 / 4', gridColumn: '9 / 10' }}
                    >
                      {t('evm.actualEnd')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'tabular-nums', metaHeaderCellBorder(10, 'mid'))}
                      style={{ gridRow: '2 / 4', gridColumn: '11 / 12' }}
                    >
                      {t('evm.kpiBAC')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'tabular-nums', metaHeaderCellBorder(11, 'mid'))}
                      style={{ gridRow: '2 / 4', gridColumn: '12 / 13' }}
                    >
                      {t('evm.kpiPV')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'tabular-nums', metaHeaderCellBorder(12, 'mid'))}
                      style={{ gridRow: '2 / 4', gridColumn: '13 / 14' }}
                    >
                      {t('evm.kpiEV')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'tabular-nums', metaHeaderCellBorder(13, 'mid'))}
                      style={{ gridRow: '2 / 4', gridColumn: '14 / 15' }}
                    >
                      {t('evm.kpiSV')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'tabular-nums', metaHeaderCellBorder(14, 'mid'))}
                      style={{ gridRow: '2 / 4', gridColumn: '15 / 16' }}
                    >
                      {t('evm.kpiSPI')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'tabular-nums', metaHeaderCellBorder(15, 'mid'))}
                      style={{ gridRow: '2 / 4', gridColumn: '16 / 17' }}
                    >
                      {t('evm.kpiProgress')}
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
                        style={{ width: band.len * EVM_SCHEDULE_DAY_COL_PX }}
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
                            style={{ left: vc.start - metaPinTotalPx, width: vc.size, height: '100%' }}
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
                            style={{ left: vc.start - metaPinTotalPx, width: vc.size, height: '100%' }}
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
                    ...(rollups.length === 0 ? undefined : { height: rowVirtualizer.getTotalSize() }),
                  }}
                >
                  {rollups.length === 0 ? (
                    <div
                      className="box-border flex w-full border-t border-l border-r border-b border-solid border-border/60 px-2 py-8 text-center text-muted-foreground"
                      style={{ minHeight: EVM_SCHEDULE_ROW_PX * 3 }}
                    >
                      {t('evm.rollupEmpty')}
                    </div>
                  ) : (
                    rowVirtualizer.getVirtualItems().map(vr => {
                      const r = rollups[vr.index]
                      if (!r) return null
                      const ri = vr.index
                      const band = unitsMatrix[ri] ?? []
                      const assigneeLabel = rollupAssigneeLabel(r, wbsMaster, master)
                      return (
                        <div
                          key={r.rollupKey}
                          role="button"
                          tabIndex={0}
                          className="hover:bg-muted absolute left-0 box-border flex w-full cursor-pointer"
                          style={{
                            top: vr.start,
                            height: vr.size,
                            minHeight: vr.size,
                          }}
                          onClick={() => openEdit(r)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              openEdit(r)
                            }
                          }}
                        >
                          <div
                            className={cn(
                              'sticky left-0 z-10 flex shrink-0 items-stretch self-stretch border-solid border-border/55',
                              ri % 2 === 1 ? 'bg-muted' : 'bg-background',
                            )}
                            style={{ width: metaPinTotalPx, minWidth: metaPinTotalPx }}
                          >
                            {metaBodyCell(0, ri, 'text-center font-mono tabular-nums text-muted-foreground', ri + 1)}
                            {metaBodyCell(1, ri, 'max-w-[72px] truncate justify-start', r.phase || '—', r.phase ?? undefined)}
                            {metaBodyCell(2, ri, 'max-w-[88px] truncate justify-start', r.category || '—')}
                            {metaBodyCell(3, ri, 'max-w-[88px] truncate justify-start', r.feature || '—')}
                            {metaBodyCell(4, ri, 'max-w-[120px] truncate justify-start', r.note || '—', r.note ?? undefined)}
                            {metaBodyCell(5, ri, 'whitespace-nowrap', formatDateDisplay(r.planStartMin, i18n.language))}
                            {metaBodyCell(6, ri, 'whitespace-nowrap', formatDateDisplay(r.planEndMax, i18n.language))}
                            {metaBodyCell(7, ri, 'whitespace-nowrap', formatDateDisplay(r.actualStartMin, i18n.language))}
                            {metaBodyCell(8, ri, 'whitespace-nowrap', formatDateDisplay(r.actualEndMax, i18n.language))}
                            {metaBodyCell(
                              9,
                              ri,
                              'max-w-[100px] truncate justify-start',
                              assigneeLabel,
                              assigneeLabel !== '—' ? assigneeLabel : undefined,
                            )}
                            {metaBodyCell(10, ri, 'justify-end text-right tabular-nums', fmt(r.bac, 2))}
                            {metaBodyCell(11, ri, 'justify-end text-right tabular-nums', fmt(r.pv, 2))}
                            {metaBodyCell(12, ri, 'justify-end text-right tabular-nums', fmt(r.ev, 2))}
                            {metaBodyCell(13, ri, 'justify-end text-right tabular-nums', fmt(r.sv, 2))}
                            {metaBodyCell(14, ri, 'justify-end text-right tabular-nums', fmt(r.spi, 3))}
                            {metaBodyCell(15, ri, 'justify-end text-right tabular-nums', `${(r.progress * 100).toFixed(1)}%`)}
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
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="w-max min-w-full text-sm">
              <div className="sticky top-0 z-[35] flex shrink-0 bg-muted shadow-[0_1px_0_0_var(--border)]" style={{ minWidth: '100%' }}>
                <div className="sticky left-0 z-40 shrink-0 bg-muted" style={{ width: metaPinTotalPx }}>
                  <div
                    className="grid text-sm"
                    style={{
                      gridTemplateColumns: META_PIN_GRID_TEMPLATE_COLS,
                      gridTemplateRows: `repeat(2, ${H}px)`,
                      width: metaPinTotalPx,
                      minWidth: metaPinTotalPx,
                    }}
                  >
                    <div
                      className={cn(META_STICKY_HEADER_CELL, metaHeaderCellBorder(0, 'top'))}
                      style={{ gridRow: '1 / 3', gridColumn: '1 / 2' }}
                    >
                      {t('evm.tableNo')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'border-t border-r border-b')}
                      style={{ gridRow: '1 / 2', gridColumn: '2 / 6' }}
                    >
                      {t('evm.wbsMasterExcelGroupMaster')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'border-t border-r border-b')}
                      style={{ gridRow: '1 / 2', gridColumn: '6 / 8' }}
                    >
                      {t('evm.wbsSchedulePlanGroup')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'border-t border-r border-b')}
                      style={{ gridRow: '1 / 2', gridColumn: '8 / 10' }}
                    >
                      {t('evm.wbsScheduleActualGroup')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, metaHeaderCellBorder(9, 'top'))}
                      style={{ gridRow: '1 / 3', gridColumn: '10 / 11' }}
                    >
                      {t('evm.tableAssignee')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'border-t border-r border-b')}
                      style={{ gridRow: '1 / 2', gridColumn: '11 / 17' }}
                    >
                      {t('evm.wbsMasterExcelGroupEvm')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-normal', metaHeaderCellBorder(1, 'bot'))}
                      style={{ gridRow: '2 / 3', gridColumn: '2 / 3' }}
                    >
                      {t('evm.tablePhase')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-normal', metaHeaderCellBorder(2, 'bot'))}
                      style={{ gridRow: '2 / 3', gridColumn: '3 / 4' }}
                    >
                      {t('evm.tableCategory')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-normal', metaHeaderCellBorder(3, 'bot'))}
                      style={{ gridRow: '2 / 3', gridColumn: '4 / 5' }}
                    >
                      {t('evm.tableFeature')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-normal', metaHeaderCellBorder(4, 'bot'))}
                      style={{ gridRow: '2 / 3', gridColumn: '5 / 6' }}
                    >
                      {t('evm.wbsNote')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-nowrap tabular-nums', metaHeaderCellBorder(5, 'bot'))}
                      style={{ gridRow: '2 / 3', gridColumn: '6 / 7' }}
                    >
                      {t('evm.planStart')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-nowrap tabular-nums', metaHeaderCellBorder(6, 'bot'))}
                      style={{ gridRow: '2 / 3', gridColumn: '7 / 8' }}
                    >
                      {t('evm.planEnd')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-nowrap tabular-nums', metaHeaderCellBorder(7, 'bot'))}
                      style={{ gridRow: '2 / 3', gridColumn: '8 / 9' }}
                    >
                      {t('evm.actualStart')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'whitespace-nowrap tabular-nums', metaHeaderCellBorder(8, 'bot'))}
                      style={{ gridRow: '2 / 3', gridColumn: '9 / 10' }}
                    >
                      {t('evm.actualEnd')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'tabular-nums', metaHeaderCellBorder(10, 'bot'))}
                      style={{ gridRow: '2 / 3', gridColumn: '11 / 12' }}
                    >
                      {t('evm.kpiBAC')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'tabular-nums', metaHeaderCellBorder(11, 'bot'))}
                      style={{ gridRow: '2 / 3', gridColumn: '12 / 13' }}
                    >
                      {t('evm.kpiPV')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'tabular-nums', metaHeaderCellBorder(12, 'bot'))}
                      style={{ gridRow: '2 / 3', gridColumn: '13 / 14' }}
                    >
                      {t('evm.kpiEV')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'tabular-nums', metaHeaderCellBorder(13, 'bot'))}
                      style={{ gridRow: '2 / 3', gridColumn: '14 / 15' }}
                    >
                      {t('evm.kpiSV')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'tabular-nums', metaHeaderCellBorder(14, 'bot'))}
                      style={{ gridRow: '2 / 3', gridColumn: '15 / 16' }}
                    >
                      {t('evm.kpiSPI')}
                    </div>
                    <div
                      className={cn(META_STICKY_HEADER_CELL, 'tabular-nums', metaHeaderCellBorder(15, 'bot'))}
                      style={{ gridRow: '2 / 3', gridColumn: '16 / 17' }}
                    >
                      {t('evm.kpiProgress')}
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    META_STICKY_HEADER_CELL,
                    'sticky top-0 z-30 min-w-[120px] flex-1 border-t border-r border-b px-2 py-2',
                  )}
                >
                  {t('evm.wbsMasterTimelinePlaceholder')}
                </div>
              </div>

              <div className="min-w-full">
                {rollups.length === 0 ? (
                  <div
                    className="box-border flex w-full border-t border-l border-r border-b border-solid border-border/60 px-2 py-8 text-center text-muted-foreground"
                    style={{ minWidth: metaPinTotalPx + 120 }}
                  >
                    {t('evm.rollupEmpty')}
                  </div>
                ) : (
                  rollups.map((r, idx) => {
                    const ri = idx
                    const assigneeLabel = rollupAssigneeLabel(r, wbsMaster, master)
                    return (
                      <div
                        key={r.rollupKey}
                        role="button"
                        tabIndex={0}
                        className="hover:bg-muted flex w-full min-w-0 cursor-pointer"
                        style={{ height: EVM_SCHEDULE_ROW_PX }}
                        onClick={() => openEdit(r)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openEdit(r)
                          }
                        }}
                      >
                        <div
                          className={cn(
                            'sticky left-0 z-10 flex shrink-0 items-stretch border-solid border-border/55',
                            ri % 2 === 1 ? 'bg-muted' : 'bg-background',
                          )}
                          style={{ width: metaPinTotalPx, minWidth: metaPinTotalPx }}
                        >
                          {metaBodyCell(0, ri, 'text-center font-mono tabular-nums text-muted-foreground', idx + 1)}
                          {metaBodyCell(1, ri, 'max-w-[72px] truncate justify-start', r.phase || '—', r.phase ?? undefined)}
                          {metaBodyCell(2, ri, 'max-w-[88px] truncate justify-start', r.category || '—')}
                          {metaBodyCell(3, ri, 'max-w-[88px] truncate justify-start', r.feature || '—')}
                          {metaBodyCell(4, ri, 'max-w-[120px] truncate justify-start', r.note || '—', r.note ?? undefined)}
                          {metaBodyCell(5, ri, 'whitespace-nowrap', formatDateDisplay(r.planStartMin, i18n.language))}
                          {metaBodyCell(6, ri, 'whitespace-nowrap', formatDateDisplay(r.planEndMax, i18n.language))}
                          {metaBodyCell(7, ri, 'whitespace-nowrap', formatDateDisplay(r.actualStartMin, i18n.language))}
                          {metaBodyCell(8, ri, 'whitespace-nowrap', formatDateDisplay(r.actualEndMax, i18n.language))}
                          {metaBodyCell(
                            9,
                            ri,
                            'max-w-[100px] truncate justify-start',
                            assigneeLabel,
                            assigneeLabel !== '—' ? assigneeLabel : undefined,
                          )}
                          {metaBodyCell(10, ri, 'justify-end text-right tabular-nums', fmt(r.bac, 2))}
                          {metaBodyCell(11, ri, 'justify-end text-right tabular-nums', fmt(r.pv, 2))}
                          {metaBodyCell(12, ri, 'justify-end text-right tabular-nums', fmt(r.ev, 2))}
                          {metaBodyCell(13, ri, 'justify-end text-right tabular-nums', fmt(r.sv, 2))}
                          {metaBodyCell(14, ri, 'justify-end text-right tabular-nums', fmt(r.spi, 3))}
                          {metaBodyCell(15, ri, 'justify-end text-right tabular-nums', `${(r.progress * 100).toFixed(1)}%`)}
                        </div>
                        <div className="box-border flex min-w-[120px] flex-1 items-center justify-center border-r border-b border-solid border-border/50 px-2 py-1 text-center text-muted-foreground">
                          —
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
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
