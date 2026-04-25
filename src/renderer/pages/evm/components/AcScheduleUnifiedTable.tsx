'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { eachDayOfInterval, format, isSameWeek } from 'date-fns'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EVMMaster, EVMProject, WBSRow } from 'shared/types/evm'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { formatDateDisplay, parseLocalDate, toYyyyMmDd } from '@/lib/dateUtils'
import {
  acRowMatchesWbsForEvmExcel,
  acRowPhaseAssigneeKey,
  EVM_PERCENT_DONE_OPTIONS_DEFAULT,
  evmAssigneeDisplayName,
  groupWbsRowsByPhaseAssigneeKey,
  isEvmCalendarWorkdayYmd,
  isYmdInPlanWorkingRange,
  snapPercentDoneToPresetOptions,
} from '@/lib/evmCalculations'
import i18n from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import {
  matchesEvmAssigneeFilterForAcGantt,
  matchesEvmPhaseFilterForAcGantt,
} from '@/lib/evmUi'
import { useEVMStore } from '@/stores/useEVMStore'
import { useEvmAiInsightStore } from '@/stores/useEvmAiInsightStore'
import {
  EVM_SCHEDULE_DAY_COL_PX,
  EVM_SCHEDULE_ROW_PX,
  EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
  useEvmScheduleColumnVirtualizer,
} from './useEvmScheduleColumnVirtualizer'

const WEEK_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

/** Cùng khối cột cố định với WBS Schedule (Excel). */
const PIN_W = [40, 72, 88, 88, 160, 88, 88, 88, 88, 48, 96] as const
const DAY_COL_PX = EVM_SCHEDULE_DAY_COL_PX

function pinLeft(colIndex: number): number {
  let s = 0
  for (let j = 0; j < colIndex; j++) {
    const w = PIN_W[j]
    if (w !== undefined) s += w
  }
  return s
}

function pinWidth(from: number, to: number): number {
  let s = 0
  for (let j = from; j < to && j < PIN_W.length; j++) {
    const w = PIN_W[j]
    if (w !== undefined) s += w
  }
  return s
}

const PIN_TOTAL = PIN_W.reduce((a, b) => a + b, 0)
/** Với border-separate: chỉ r+b (+ t/l ở mép bảng) để không dày gấp đôi giữa hai ô. */
const AC_STICKY_TH_BASE =
  'sticky z-40 box-border border-solid border-border/80 bg-muted text-foreground text-center align-middle text-sm font-semibold leading-tight'

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

function stickyTh(colIndex: number, className: string, children: ReactNode, rowSpan?: number) {
  const edge = colIndex === 0 ? 'border-t border-l border-r border-b' : 'border-t border-r border-b'
  return (
    <th
      rowSpan={rowSpan}
      className={cn(AC_STICKY_TH_BASE, 'px-1 py-1', edge, className)}
      style={{
        left: pinLeft(colIndex),
        top: 0,
        width: PIN_W[colIndex],
        minWidth: PIN_W[colIndex],
        maxWidth: colIndex === 4 ? 160 : PIN_W[colIndex],
      }}
    >
      <span
        className="flex items-center justify-center gap-0.5"
        style={{ minHeight: (rowSpan ?? 1) * EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX }}
      >
        {children}
      </span>
    </th>
  )
}

function acPinColSpanTh(fromCol: number, span: number, children: ReactNode) {
  return (
    <th
      colSpan={span}
      className={cn(AC_STICKY_TH_BASE, 'border-t border-r border-b')}
      style={{
        left: pinLeft(fromCol),
        width: pinWidth(fromCol, fromCol + span),
        minWidth: pinWidth(fromCol, fromCol + span),
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

function acDetailTh(colIndex: number, className: string, children: ReactNode, spanRows: number = 1) {
  return (
    <th
      rowSpan={spanRows > 1 ? spanRows : undefined}
      className={cn(AC_STICKY_TH_BASE, 'border-r border-b px-1 py-0.5', className)}
      style={{
        left: pinLeft(colIndex),
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

function stickyTd(colIndex: number, rowParity: number, className: string, children: ReactNode, title?: string) {
  const bg = rowParity % 2 === 1 ? 'bg-muted' : 'bg-background'
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
        left: pinLeft(colIndex),
        width: PIN_W[colIndex],
        minWidth: PIN_W[colIndex],
        maxWidth: colIndex === 4 ? 160 : PIN_W[colIndex],
      }}
      title={title}
    >
      {children}
    </td>
  )
}

export function AcScheduleUnifiedTable() {
  const { t } = useTranslation()
  const project = useEVMStore(s => s.project)
  const ac = useEVMStore(s => s.ac)
  const wbs = useEVMStore(s => s.wbs)
  const master = useEVMStore(s => s.master)
  const updateWbsRow = useEVMStore(s => s.updateWbsRow)
  const updateAcRow = useEVMStore(s => s.updateAcRow)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [editRow, setEditRow] = useState<WBSRow | null>(null)
  const filterPhase = useEvmAiInsightStore(s => s.schedulePhaseFilter)
  const filterAssignee = useEvmAiInsightStore(s => s.scheduleAssigneeFilter)

  const acForProject = useMemo(
    () => ac.filter(a => a.projectId === project.id),
    [ac, project.id],
  )

  const assigneeNameFromWbs = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of wbs) {
      if (r.assignee && r.assigneeName) m.set(r.assignee, r.assigneeName)
    }
    return m
  }, [wbs])

  const nonWorkingList = useMemo(() => (master.nonWorkingDays ?? []).map(n => n.date), [master.nonWorkingDays])

  const reportDateStr = toYyyyMmDd(project.reportDate) ?? ''
  const { projectDays, weekBands } = useMemo(() => computeProjectDaysAndWeekBands(project), [project])

  const dayStrs = useMemo(() => projectDays.map(d => format(d, 'yyyy-MM-dd')), [projectDays])

  const dayColMeta = useMemo(
    () =>
      dayStrs.map((ds, i) => {
        const dow = projectDays[i]?.getDay() ?? 0
        return {
          ds,
          isWeekend: dow === 0 || dow === 6,
          isReport: Boolean(reportDateStr && ds === reportDateStr),
        }
      }),
    [dayStrs, projectDays, reportDateStr],
  )

  const dayIndexByStr = useMemo(() => new Map(dayStrs.map((d, i) => [d, i])), [dayStrs])

  const sortedRows = useMemo(() => {
    return [...wbs]
      .filter(r => r.projectId === project.id)
      .filter(r => matchesEvmPhaseFilterForAcGantt(r.phase, filterPhase))
      .filter(r => matchesEvmAssigneeFilterForAcGantt(r.assignee, filterAssignee))
      .sort((a, b) => a.no - b.no)
  }, [wbs, project.id, filterPhase, filterAssignee])

  const wbsByPhaseAssignee = useMemo(() => groupWbsRowsByPhaseAssigneeKey(sortedRows), [sortedRows])

  /** Giờ theo ngày: cộng dồn mọi dòng AC khớp WBS (cùng quy tắc `acRowMatchesWbsForEvmExcel`). */
  const hoursByWbsId = useMemo(() => {
    const m = new Map<string, Float32Array>()
    const n = dayStrs.length
    for (const w of sortedRows) {
      m.set(w.id, new Float32Array(n))
    }
    for (const row of acForProject) {
      const d = toYyyyMmDd(row.date)
      if (!d) continue
      const ix = dayIndexByStr.get(d)
      if (ix == null) continue
      const h = row.workingHours ?? 0
      const candidates = wbsByPhaseAssignee.get(acRowPhaseAssigneeKey(row))
      if (!candidates?.length) continue
      for (const w of candidates) {
        if (!acRowMatchesWbsForEvmExcel(w, row)) continue
        const arr = m.get(w.id)
        if (arr) arr[ix] += h
      }
    }
    return m
  }, [sortedRows, acForProject, dayStrs, dayIndexByStr, wbsByPhaseAssignee])

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

  const saveEdit = useCallback(
    async (updates: {
      actualStartDate: string | null
      actualEndDate: string | null
      percentDone: number | null
    }) => {
      if (!editRow) return
      try {
        await updateWbsRow(editRow.id, {
          actualStartDate: updates.actualStartDate,
          actualEndDate: updates.actualEndDate,
          percentDone: updates.percentDone == null ? 0 : updates.percentDone,
        } as Partial<WBSRow>)
        const matches = acForProject.filter(a => acRowMatchesWbsForEvmExcel(editRow, a))
        for (const a of matches) {
          await updateAcRow(a.id, {
            actualStartDate: updates.actualStartDate,
            actualEndDate: updates.actualEndDate,
            percentDone: updates.percentDone,
          })
        }
        setEditRow(null)
        toast.success(t('common.save'))
      } catch {
        toast.error(t('evm.saveFailed'))
      }
    },
    [editRow, updateWbsRow, updateAcRow, acForProject, t],
  )

  if (!project.id) {
    return <p className="py-4 text-muted-foreground text-sm">{t('evm.ganttNoProject')}</p>
  }

  if (projectDays.length === 0) {
    return <p className="py-4 text-muted-foreground text-sm">{t('evm.wbsDayGridNoRange')}</p>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto rounded-md bg-muted/5 [overflow-anchor:none]"
      >
        {/** Header: bảng `table-layout` bình thường trong `sticky` — `display:block` + tbody absolute phá sticky trên `th`. */}
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
              <TableRow className="bg-muted/40">
                {stickyTh(0, 'tabular-nums', t('evm.tableNo'), 3)}
                {stickyTh(1, 'whitespace-normal', t('evm.tablePhase'), 3)}
                {stickyTh(2, 'whitespace-normal', t('evm.tableCategory'), 3)}
                {stickyTh(3, 'whitespace-normal', t('evm.tableFeature'), 3)}
                {stickyTh(4, 'whitespace-normal', t('evm.acColTask'), 3)}
                {acPinColSpanTh(5, 2, t('evm.wbsSchedulePlanGroup'))}
                {acPinColSpanTh(7, 2, t('evm.wbsScheduleActualGroup'))}
                {stickyTh(9, 'tabular-nums', t('evm.wbsSchedulePctDone'), 3)}
                {stickyTh(10, 'whitespace-normal', t('evm.tableAssignee'), 3)}
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
              <TableRow className="bg-muted/90">
                {acDetailTh(5, 'whitespace-nowrap tabular-nums', t('evm.planStart'), 2)}
                {acDetailTh(6, 'whitespace-nowrap tabular-nums', t('evm.planEnd'), 2)}
                {acDetailTh(7, 'whitespace-nowrap tabular-nums', t('evm.actualStart'), 2)}
                {acDetailTh(8, 'whitespace-nowrap tabular-nums', t('evm.actualEnd'), 2)}
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
                      minHeight: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
                      height: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
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
                            meta.isWeekend && 'bg-zinc-400/25 dark:bg-zinc-600/35',
                            !meta.isWeekend && 'bg-muted',
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
              <TableRow className="bg-muted/90">
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
                      minHeight: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
                      height: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
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
                            meta.isWeekend && 'bg-zinc-400/25 dark:bg-zinc-600/35',
                            !meta.isWeekend && 'bg-muted',
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
                  colSpan={12}
                  className="box-border border-t border-l border-r border-b border-solid border-border/60 px-2 py-8 text-center text-muted-foreground"
                >
                  {t('evm.acMatrixEmptyWbs')}
                </td>
              </TableRow>
            ) : (
              rowVirtualizer.getVirtualItems().map(vr => {
                const row = sortedRows[vr.index]
                if (!row) return null
                const ri = vr.index
                const arr = hoursByWbsId.get(row.id)
                const pctLabel =
                  row.percentDone != null && Number.isFinite(row.percentDone)
                    ? `${(row.percentDone * 100).toFixed(0)}%`
                    : '—'
                const taskLabel = row.task?.trim() ? row.task : '—'

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
                    {stickyTd(0, ri, 'text-center font-mono tabular-nums', row.no)}
                    {stickyTd(1, ri, 'max-w-[72px] truncate', row.phase ?? '—', row.phase ?? undefined)}
                    {stickyTd(2, ri, 'max-w-[88px] truncate', row.category?.trim() ? row.category : '—')}
                    {stickyTd(3, ri, 'max-w-[88px] truncate', row.feature?.trim() ? row.feature : '—')}
                    {stickyTd(4, ri, 'truncate font-medium', taskLabel, taskLabel)}
                    {stickyTd(5, ri, 'whitespace-nowrap', formatDateDisplay(row.planStartDate, i18n.language))}
                    {stickyTd(6, ri, 'whitespace-nowrap', formatDateDisplay(row.planEndDate, i18n.language))}
                    {stickyTd(7, ri, 'whitespace-nowrap', formatDateDisplay(row.actualStartDate, i18n.language))}
                    {stickyTd(8, ri, 'whitespace-nowrap', formatDateDisplay(row.actualEndDate, i18n.language))}
                    {stickyTd(9, ri, 'text-center tabular-nums', pctLabel)}
                    {stickyTd(
                      10,
                      ri,
                      'max-w-[96px] truncate',
                      evmAssigneeDisplayName(master, row.assignee, assigneeNameFromWbs.get(row.assignee ?? '') ?? null),
                    )}
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
                          const h = arr?.[vc.index] ?? 0
                          const isWork = isEvmCalendarWorkdayYmd(meta.ds, nonWorkingList)
                          const show = !isWork || h <= 0.0001 ? '' : h.toFixed(1)
                          const inPlanBand =
                            isWork && isYmdInPlanWorkingRange(meta.ds, row.planStartDate, row.planEndDate, nonWorkingList)
                          return (
                            <div
                              key={vc.key}
                              className={cn(
                                'absolute top-0 box-border flex h-full items-center justify-center border-r border-solid border-border/50 px-0 py-0.5 text-center text-xs tabular-nums last:border-r-0',
                                !isWork && 'bg-zinc-400/20 dark:bg-zinc-600/30',
                                isWork && inPlanBand && 'bg-sky-200/50 dark:bg-sky-900/45',
                                isWork && !inPlanBand && (ri % 2 === 1 ? 'bg-muted' : 'bg-background'),
                                meta.isReport && 'ring-1 ring-inset ring-amber-400/90 dark:ring-amber-500/55',
                              )}
                              style={{ left: vc.start - PIN_TOTAL, width: vc.size, height: '100%' }}
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
      </div>

      <EditAcSheetDialog
        row={editRow}
        master={master}
        open={!!editRow}
        onClose={() => setEditRow(null)}
        onSave={saveEdit}
      />
    </div>
  )
}

function EditAcSheetDialog({
  row,
  master,
  open,
  onClose,
  onSave,
}: {
  row: WBSRow | null
  master: EVMMaster
  open: boolean
  onClose: () => void
  onSave: (updates: {
    actualStartDate: string | null
    actualEndDate: string | null
    percentDone: number | null
  }) => Promise<void>
}) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [actualStartDate, setActualStartDate] = useState('')
  const [actualEndDate, setActualEndDate] = useState('')
  const [pct, setPct] = useState('')

  const pctOptions = master.percentDoneOptions ?? EVM_PERCENT_DONE_OPTIONS_DEFAULT

  const percentComboboxOptions = useMemo(() => {
    const base: { value: string; label: string }[] = [
      { value: '__empty__', label: '—' },
      ...pctOptions.map((p: number) => ({ value: String(p), label: `${(p * 100).toFixed(0)}%` })),
    ]
    if (!row || row.percentDone == null || !Number.isFinite(row.percentDone)) return base
    const snap = snapPercentDoneToPresetOptions(row.percentDone, pctOptions)
    if (!snap.choice) return base
    if (base.some(o => o.value === snap.choice)) return base
    return [...base, { value: snap.choice, label: snap.orphanLabel ?? snap.choice }]
  }, [row, pctOptions])

  const disp = useMemo(() => {
    if (!row) {
      return {
        phase: '',
        category: '',
        feature: '',
        task: '',
        planStart: '',
        planEnd: '',
        assigneeLabel: '',
      }
    }
    const assigneeCode = row.assignee ?? ''
    const assigneeName = row.assigneeName
    return {
      phase: row.phase ?? '',
      category: row.category ?? '',
      feature: row.feature ?? '',
      task: row.task?.trim() || '—',
      planStart: toYyyyMmDd(row.planStartDate) ?? '',
      planEnd: toYyyyMmDd(row.planEndDate) ?? '',
      assigneeLabel: assigneeCode ? evmAssigneeDisplayName(master, assigneeCode, assigneeName ?? null) : '—',
    }
  }, [row, master])

  const phaseLabel = (master.phases.find(p => p.code === disp.phase)?.name ?? disp.phase) || '—'

  useEffect(() => {
    if (!row || !open) return
    setActualStartDate(toYyyyMmDd(row.actualStartDate) ?? '')
    setActualEndDate(toYyyyMmDd(row.actualEndDate) ?? '')
    const snap = snapPercentDoneToPresetOptions(row.percentDone, pctOptions)
    setPct(snap.choice)
  }, [row, open, pctOptions])

  const handleSave = async () => {
    const ph = pct.trim()
    const payload = {
      actualStartDate: actualStartDate.trim() === '' ? null : actualStartDate.slice(0, 10),
      actualEndDate: actualEndDate.trim() === '' ? null : actualEndDate.slice(0, 10),
      percentDone: null as number | null,
    }
    if (ph === '') payload.percentDone = null
    else {
      const n = Number(ph)
      if (!Number.isFinite(n)) payload.percentDone = null
      else {
        const x = n > 1 ? n / 100 : n
        payload.percentDone = Math.min(1, Math.max(0, x))
      }
    }
    await onSave(payload)
  }

  if (!row) return null

  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="space-y-0 border-b px-4 py-3">
          <DialogTitle className="text-base">
            {t('common.edit')} — {t('evm.tableNo')} {row.no}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2.5 px-4 py-3 sm:grid-cols-2">
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">{t('evm.tablePhase')}</Label>
            <Input value={phaseLabel} readOnly disabled className="h-8 text-sm" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{t('evm.tableCategory')}</Label>
            <Input value={disp.category || '—'} readOnly disabled className="h-8 text-sm" placeholder="—" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{t('evm.tableFeature')}</Label>
            <Input value={disp.feature || '—'} readOnly disabled className="h-8 text-sm" placeholder="—" />
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">{t('evm.acColTask')}</Label>
            <Input value={disp.task} readOnly disabled className="h-8 text-sm" placeholder={t('evm.acTaskHint')} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{t('evm.planStart')}</Label>
            <Input type="date" value={disp.planStart} readOnly disabled className="h-8 text-sm" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{t('evm.planEnd')}</Label>
            <Input type="date" value={disp.planEnd} readOnly disabled className="h-8 text-sm" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{t('evm.actualStart')}</Label>
            <Input
              type="date"
              value={actualStartDate}
              onChange={e => setActualStartDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{t('evm.actualEnd')}</Label>
            <Input
              type="date"
              value={actualEndDate}
              onChange={e => setActualEndDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{t('evm.percentDone')}</Label>
            <Combobox
              value={pct === '' ? '__empty__' : pct}
              onValueChange={v => setPct(v === '__empty__' ? '' : v)}
              options={percentComboboxOptions}
              triggerClassName="h-8 border-border/60 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{t('evm.tableAssignee')}</Label>
            <Input value={disp.assigneeLabel} readOnly disabled className="h-8 text-sm" />
          </div>
        </div>
        <DialogFooter className="gap-2 border-t px-4 py-3 sm:justify-end">
          <Button type="button" variant={buttonVariant} size="sm" className="h-8" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" variant={buttonVariant} size="sm" className="h-8" onClick={() => void handleSave()}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
