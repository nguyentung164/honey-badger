'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { eachDayOfInterval, format, isSameWeek } from 'date-fns'
import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { parseLocalDate, toYyyyMmDd } from '@/lib/dateUtils'
import {
  DEFAULT_EVM_HOURS_PER_DAY,
  evmAssigneeDisplayName,
  isEvmCalendarWorkdayYmd,
  mergeWbsDayUnitsStoredWithPlan,
  resourceHoursFromWbsDayUnitsForAssignee,
  taskBudgetMdLikeExcel,
} from '@/lib/evmCalculations'
import { cn } from '@/lib/utils'
import { useEVMStore } from '@/stores/useEVMStore'
import { useEvmAiInsightStore } from '@/stores/useEvmAiInsightStore'
import {
  EVM_SCHEDULE_DAY_COL_PX,
  EVM_SCHEDULE_ROW_PX,
  EVM_SCHEDULE_TIMELINE_HEADER_3_ROWS_PX,
  EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
  useEvmScheduleColumnVirtualizer,
} from './components/useEvmScheduleColumnVirtualizer'

const WEEK_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

/** Chia dải ngày dự án thành các cụm theo tuần lịch (Chủ nhật = đầu tuần, như lưới Excel). */
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

export function ResourceUsageTab() {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const project = useEVMStore(s => s.project)
  const wbs = useEVMStore(s => s.wbs)
  const ac = useEVMStore(s => s.ac)
  const master = useEVMStore(s => s.master)
  const wbsDayUnits = useEVMStore(s => s.wbsDayUnits ?? [])
  const scheduleAssigneeFilter = useEvmAiInsightStore(s => s.scheduleAssigneeFilter)

  const nonWorkingDays = useMemo(() => master.nonWorkingDays.map(n => n.date), [master.nonWorkingDays])
  const hpd = master.hoursPerDay ?? DEFAULT_EVM_HOURS_PER_DAY

  const assigneeNameFromWbs = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of wbs) {
      if (r.assignee && r.assigneeName) m.set(r.assignee, r.assigneeName)
    }
    return m
  }, [wbs])

  const assigneeCodes = useMemo(() => {
    const set = new Set<string>()
    for (const a of master.assignees) set.add(a.code)
    for (const r of wbs) {
      if (r.assignee) set.add(r.assignee)
    }
    for (const r of ac) {
      if (r.assignee) set.add(r.assignee)
    }
    const sorted = [...set].sort((a, b) =>
      evmAssigneeDisplayName(master, a, assigneeNameFromWbs.get(a) ?? null).localeCompare(
        evmAssigneeDisplayName(master, b, assigneeNameFromWbs.get(b) ?? null),
        undefined,
        { sensitivity: 'base' },
      ),
    )
    if (scheduleAssigneeFilter !== 'all') {
      return sorted.filter(c => c === scheduleAssigneeFilter)
    }
    return sorted
  }, [master.assignees, wbs, ac, master, assigneeNameFromWbs, scheduleAssigneeFilter])

  const reportDateStr = toYyyyMmDd(project.reportDate) ?? ''

  const { projectDays, weekBands } = useMemo(() => {
    if (!project.startDate?.trim() || !project.endDate?.trim()) {
      return { projectDays: [] as Date[], weekBands: [] as { startIdx: number; len: number; label: string }[] }
    }
    try {
      const start = parseLocalDate(project.startDate.trim().slice(0, 10))
      const end = parseLocalDate(project.endDate.trim().slice(0, 10))
      if (!start || !end || end < start) {
        return { projectDays: [] as Date[], weekBands: [] as { startIdx: number; len: number; label: string }[] }
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
      return { projectDays: [] as Date[], weekBands: [] as { startIdx: number; len: number; label: string }[] }
    }
  }, [project.startDate, project.endDate])

  const bacByAssignee = useMemo(() => {
    const m = new Map<string, number>()
    for (const code of assigneeCodes) {
      const bac = wbs.filter(r => (r.assignee ?? '') === code).reduce((s, r) => s + taskBudgetMdLikeExcel(r, nonWorkingDays), 0)
      m.set(code, bac)
    }
    return m
  }, [assigneeCodes, wbs, nonWorkingDays])

  const effectiveWbsDayUnits = useMemo(
    () => mergeWbsDayUnitsStoredWithPlan(wbs, wbsDayUnits, nonWorkingDays),
    [wbs, wbsDayUnits, nonWorkingDays],
  )

  /** Một Float32Array / assignee theo chỉ số cột ngày — tránh Map chuỗi khi vẽ lưới ảo. */
  const hoursByAssignee = useMemo(() => {
    const n = projectDays.length
    const dateStrs = projectDays.map(d => format(d, 'yyyy-MM-dd'))
    const m = new Map<string, Float32Array>()
    for (const code of assigneeCodes) {
      const arr = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const ds = dateStrs[i]
        if (ds)
          arr[i] = resourceHoursFromWbsDayUnitsForAssignee(code, ds, wbs, effectiveWbsDayUnits, hpd, nonWorkingDays)
      }
      m.set(code, arr)
    }
    return m
  }, [assigneeCodes, projectDays, wbs, effectiveWbsDayUnits, hpd, nonWorkingDays])

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

  const resourceLeadingPinnedPx = useMemo(() => {
    const remSum = 2.5 + 9 + 4.5
    if (typeof document === 'undefined') return remSum * 16
    const fs = parseFloat(getComputedStyle(document.documentElement).fontSize)
    return remSum * (Number.isFinite(fs) ? fs : 16)
  }, [])

  const colVirtualizer = useEvmScheduleColumnVirtualizer(scrollRef, projectDays.length, {
    leadingPinnedWidthPx: resourceLeadingPinnedPx,
  })
  const rowVirtualizer = useVirtualizer({
    count: assigneeCodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => EVM_SCHEDULE_ROW_PX,
    overscan: 10,
  })

  const dayTimelinePx = projectDays.length * EVM_SCHEDULE_DAY_COL_PX

  if (!project.id) {
    return <p className="p-4 text-muted-foreground text-sm">{t('evm.ganttNoProject')}</p>
  }

  const pinNoW = '2.5rem'
  const pinAssigneeW = '9rem'
  const pinBacW = '4.5rem'
  const pinLeftBac = `calc(${pinNoW} + ${pinAssigneeW})`
  const tableScrollMinWidth = `calc(${pinNoW} + ${pinAssigneeW} + ${pinBacW} + ${dayTimelinePx}px)`

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4">

      {projectDays.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('evm.wbsDayGridNoRange')}</p>
      ) : (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto rounded-md bg-muted/5 [overflow-anchor:none]"
        >
          <div
            className="sticky top-0 z-[35] bg-muted shadow-[0_1px_0_0_var(--border)]"
            style={{ width: tableScrollMinWidth, minWidth: tableScrollMinWidth }}
          >
            <table
              className="border-separate border-spacing-0 text-sm"
              style={{ width: tableScrollMinWidth, tableLayout: 'fixed' }}
            >
              <colgroup>
                <col style={{ minWidth: pinNoW, width: pinNoW }} />
                <col style={{ minWidth: pinAssigneeW, width: pinAssigneeW }} />
                <col style={{ minWidth: pinBacW, width: pinBacW }} />
                <col style={{ minWidth: dayTimelinePx, width: dayTimelinePx }} />
              </colgroup>
              <thead className="bg-muted">
                <tr className="bg-muted">
                  <th
                    rowSpan={3}
                    className={cn(
                      'sticky left-0 z-40 box-border border-t border-l border-r border-b border-solid border-border/80 bg-muted px-1 py-1 text-center align-middle text-foreground text-sm font-semibold',
                    )}
                    style={{ minWidth: pinNoW, width: pinNoW, maxWidth: pinNoW, minHeight: EVM_SCHEDULE_TIMELINE_HEADER_3_ROWS_PX }}
                  >
                    {t('evm.tableNo')}
                  </th>
                  <th
                    rowSpan={3}
                    className={cn(
                      'sticky z-40 box-border border-t border-r border-b border-solid border-border/80 bg-muted px-1 py-1 text-center align-middle text-foreground text-sm font-semibold',
                    )}
                    style={{
                      left: pinNoW,
                      minWidth: pinAssigneeW,
                      width: pinAssigneeW,
                      minHeight: EVM_SCHEDULE_TIMELINE_HEADER_3_ROWS_PX,
                    }}
                  >
                    {t('evm.tableAssignee')}
                  </th>
                  <th
                    rowSpan={3}
                    className={cn(
                      'sticky z-40 box-border border-t border-r border-b border-solid border-border/80 bg-muted px-1 py-1 text-center align-middle text-foreground text-sm font-semibold',
                    )}
                    style={{ left: pinLeftBac, minWidth: pinBacW, width: pinBacW, minHeight: EVM_SCHEDULE_TIMELINE_HEADER_3_ROWS_PX }}
                  >
                    {t('evm.kpiBAC')} (MD)
                  </th>
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
                </tr>
                <tr>
                  <th
                    className="box-border border-r border-b border-solid border-border/80 bg-muted p-0 align-stretch"
                    style={{
                      minWidth: dayTimelinePx,
                      width: dayTimelinePx,
                      height: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
                    }}
                  >
                    <div
                      className="relative box-border h-full min-h-0"
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
                            style={{ left: vc.start - resourceLeadingPinnedPx, width: vc.size }}
                            title={meta.isReport ? t('evm.resourceGridReportCol') : meta.ds}
                          >
                            {format(pd, 'd')}
                          </div>
                        )
                      })}
                    </div>
                  </th>
                </tr>
                <tr>
                  <th
                    className="box-border border-r border-b border-solid border-border/80 bg-muted p-0 align-stretch"
                    style={{
                      minWidth: dayTimelinePx,
                      width: dayTimelinePx,
                      height: EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX,
                    }}
                  >
                    <div
                      className="relative box-border h-full min-h-0"
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
                            style={{ left: vc.start - resourceLeadingPinnedPx, width: vc.size }}
                          >
                            {WEEK_LETTERS[d.getDay()]}
                          </div>
                        )
                      })}
                    </div>
                  </th>
                </tr>
              </thead>
            </table>
          </div>

          <table
            className="border-separate border-spacing-0 text-sm"
            style={{ display: 'block', width: tableScrollMinWidth, minWidth: tableScrollMinWidth }}
          >
            <colgroup>
              <col style={{ minWidth: pinNoW, width: pinNoW }} />
              <col style={{ minWidth: pinAssigneeW, width: pinAssigneeW }} />
              <col style={{ minWidth: pinBacW, width: pinBacW }} />
              <col style={{ minWidth: dayTimelinePx, width: dayTimelinePx }} />
            </colgroup>
            <tbody
              className="relative block"
              style={{
                width: tableScrollMinWidth,
                ...(assigneeCodes.length === 0 ? undefined : { height: rowVirtualizer.getTotalSize() }),
              }}
            >
              {assigneeCodes.length === 0 ? (
                <tr style={{ display: 'table', width: '100%', tableLayout: 'fixed' }}>
                  <td colSpan={4} className="box-border border-t border-l border-r border-b border-solid border-border/60 px-2 py-6 text-center text-muted-foreground">
                    {t('evm.resourceGridNoAssignees')}
                  </td>
                </tr>
              ) : (
                rowVirtualizer.getVirtualItems().map(vr => {
                  const code = assigneeCodes[vr.index]
                  if (!code) return null
                  const rowIdx = vr.index
                  const arr = hoursByAssignee.get(code)
                  return (
                    <tr
                      key={code}
                      className="hover:bg-muted"
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
                    >
                      <td
                        className={cn(
                          'sticky z-10 box-border border-l border-r border-b border-solid border-border/55 px-1 py-0.5 text-center text-sm tabular-nums',
                          rowIdx % 2 === 1 ? 'bg-muted' : 'bg-background',
                        )}
                        style={{ left: 0, minWidth: pinNoW, width: pinNoW }}
                      >
                        {rowIdx + 1}
                      </td>
                      <td
                        className={cn(
                          'sticky z-10 max-w-[9rem] truncate box-border border-r border-b border-solid border-border/55 px-1 py-0.5 text-sm font-medium',
                          rowIdx % 2 === 1 ? 'bg-muted' : 'bg-background',
                        )}
                        style={{ left: pinNoW, minWidth: pinAssigneeW, width: pinAssigneeW }}
                        title={evmAssigneeDisplayName(master, code, assigneeNameFromWbs.get(code) ?? null)}
                      >
                        {evmAssigneeDisplayName(master, code, assigneeNameFromWbs.get(code) ?? null)}
                      </td>
                      <td
                        className={cn(
                          'sticky z-10 box-border border-r border-b border-solid border-border/55 px-1 py-0.5 text-right text-sm tabular-nums',
                          rowIdx % 2 === 1 ? 'bg-muted' : 'bg-background',
                        )}
                        style={{ left: pinLeftBac, minWidth: pinBacW, width: pinBacW }}
                      >
                        {(bacByAssignee.get(code) ?? 0).toFixed(1)}
                      </td>
                      <td className="box-border border-r border-b border-solid border-border/50 p-0 align-stretch" style={{ minWidth: dayTimelinePx, width: dayTimelinePx }}>
                        <div className="relative" style={{ width: colVirtualizer.getTotalSize(), height: vr.size }}>
                          {colVirtualizer.getVirtualItems().map(vc => {
                            const meta = dayColMeta[vc.index]
                            if (!meta) return null
                            const h = arr?.[vc.index] ?? 0
                            const isWork = isEvmCalendarWorkdayYmd(meta.ds, nonWorkingDays)
                            const show = !isWork || h <= 0.0001 ? '' : h.toFixed(1)
                            const overload = isWork && h > hpd + 1e-3
                            return (
                              <div
                                key={vc.key}
                                className={cn(
                                  'box-border absolute top-0 flex h-full items-center justify-center border-r border-border/50 px-0 py-0.5 text-center text-xs tabular-nums last:border-r-0',
                                  rowIdx % 2 === 1 ? 'bg-muted' : 'bg-background',
                                  meta.isWeekend && 'bg-zinc-400/20 dark:bg-zinc-600/30',
                                  meta.isReport && 'ring-1 ring-inset ring-amber-400/70 dark:ring-amber-600/50',
                                  overload && 'bg-red-500/25 font-medium text-destructive dark:bg-red-950/45',
                                )}
                                style={{ left: vc.start - resourceLeadingPinnedPx, width: vc.size }}
                                title={overload ? t('evm.resourceOverloadDay', { hours: hpd }) : undefined}
                              >
                                {show}
                              </div>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
