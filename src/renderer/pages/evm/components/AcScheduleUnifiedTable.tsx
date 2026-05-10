'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { eachDayOfInterval, format, isSameWeek } from 'date-fns'
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EVMMaster, EVMProject, WBSRow } from 'shared/types/evm'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { matchesEvmAssigneeFilterForAcGantt, matchesEvmPhaseFilterForAcGantt } from '@/lib/evmUi'
import i18n from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useEVMStore } from '@/stores/useEVMStore'
import { useEvmAiInsightStore } from '@/stores/useEvmAiInsightStore'
import { EVM_SCHEDULE_DAY_COL_PX, EVM_SCHEDULE_ROW_PX, EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX, useEvmScheduleColumnVirtualizer } from './useEvmScheduleColumnVirtualizer'

const WEEK_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

/** Cùng khối cột cố định với WBS Schedule (Excel). */
const PIN_W = [40, 72, 88, 88, 160, 88, 88, 88, 88, 48, 96] as const
const DAY_COL_PX = EVM_SCHEDULE_DAY_COL_PX
const PIN_TOTAL = PIN_W.reduce((a, b) => a + b, 0)
const PIN_GRID_TEMPLATE_COLS = PIN_W.map(w => `${w}px`).join(' ')
const H = EVM_SCHEDULE_TIMELINE_HEADER_ROW_PX

const AC_HEADER_CELL =
  'box-border border-solid border-border/80 bg-muted text-foreground text-center text-sm font-semibold leading-tight flex items-center justify-center px-1 py-1'

function acHeaderCellBorder(colIndex: number, row: 'top' | 'mid' | 'bot') {
  const l = colIndex === 0 ? 'border-l' : ''
  const t = row === 'top' ? 'border-t' : ''
  return cn(l, t, 'border-r border-b')
}

function acBodyCellBorder(colIndex: number) {
  return colIndex === 0 ? 'border-l border-r border-b' : 'border-r border-b'
}

function acBodyCell(colIndex: number, rowParity: number, className: string, children: ReactNode, title?: string) {
  const bg = rowParity % 2 === 1 ? 'bg-muted' : 'bg-background'
  const w = PIN_W[colIndex] ?? 40
  return (
    <div
      className={cn(
        'box-border shrink-0 border-solid border-border/55 px-1 py-0.5 text-sm flex items-center justify-center min-h-0 overflow-hidden',
        acBodyCellBorder(colIndex),
        bg,
        className
      )}
      style={{ width: w, minWidth: w, maxWidth: colIndex === 4 ? 160 : w }}
      title={title}
    >
      {children}
    </div>
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

  const acForProject = useMemo(() => ac.filter(a => a.projectId === project.id), [ac, project.id])

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
    [dayStrs, projectDays, reportDateStr]
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

  const pinnedHeaderGridStyle = useMemo(
    (): CSSProperties => ({
      display: 'grid',
      gridTemplateColumns: PIN_GRID_TEMPLATE_COLS,
      gridTemplateRows: `repeat(3, ${H}px)`,
      width: PIN_TOTAL,
      minWidth: PIN_TOTAL,
      boxSizing: 'border-box',
    }),
    []
  )

  const saveEdit = useCallback(
    async (updates: { actualStartDate: string | null; actualEndDate: string | null; percentDone: number | null }) => {
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
    [editRow, updateWbsRow, updateAcRow, acForProject, t]
  )

  if (!project.id) {
    return <p className="py-4 text-muted-foreground text-sm">{t('evm.ganttNoProject')}</p>
  }

  if (projectDays.length === 0) {
    return <p className="py-4 text-muted-foreground text-sm">{t('evm.wbsDayGridNoRange')}</p>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded-md bg-muted/5 [overflow-anchor:none]">
        {/** Header: div grid + timeline (không dùng `<table>` để sticky/ghim khớp TaskGanttView). */}
        <div className="sticky top-0 z-[35] flex shrink-0 bg-muted shadow-[0_1px_0_0_var(--border)]" style={{ width: tableMinWidth, minWidth: tableMinWidth }}>
          <div className="sticky left-0 z-40 shrink-0 bg-muted" style={{ width: PIN_TOTAL }}>
            <div className="text-sm" style={pinnedHeaderGridStyle}>
              <div className={cn(AC_HEADER_CELL, 'tabular-nums', acHeaderCellBorder(0, 'top'))} style={{ gridRow: '1 / 4', gridColumn: '1 / 2' }}>
                {t('evm.tableNo')}
              </div>
              <div className={cn(AC_HEADER_CELL, 'whitespace-normal', acHeaderCellBorder(1, 'top'))} style={{ gridRow: '1 / 4', gridColumn: '2 / 3' }}>
                {t('evm.tablePhase')}
              </div>
              <div className={cn(AC_HEADER_CELL, 'whitespace-normal', acHeaderCellBorder(2, 'top'))} style={{ gridRow: '1 / 4', gridColumn: '3 / 4' }}>
                {t('evm.tableCategory')}
              </div>
              <div className={cn(AC_HEADER_CELL, 'whitespace-normal', acHeaderCellBorder(3, 'top'))} style={{ gridRow: '1 / 4', gridColumn: '4 / 5' }}>
                {t('evm.tableFeature')}
              </div>
              <div className={cn(AC_HEADER_CELL, 'whitespace-normal', acHeaderCellBorder(4, 'top'))} style={{ gridRow: '1 / 4', gridColumn: '5 / 6' }}>
                {t('evm.acColTask')}
              </div>
              <div className={cn(AC_HEADER_CELL, 'border-t border-r border-b')} style={{ gridRow: '1 / 2', gridColumn: '6 / 8' }}>
                {t('evm.wbsSchedulePlanGroup')}
              </div>
              <div className={cn(AC_HEADER_CELL, 'border-t border-r border-b')} style={{ gridRow: '1 / 2', gridColumn: '8 / 10' }}>
                {t('evm.wbsScheduleActualGroup')}
              </div>
              <div className={cn(AC_HEADER_CELL, 'tabular-nums', acHeaderCellBorder(9, 'top'))} style={{ gridRow: '1 / 4', gridColumn: '10 / 11' }}>
                {t('evm.wbsSchedulePctDone')}
              </div>
              <div className={cn(AC_HEADER_CELL, 'whitespace-normal', acHeaderCellBorder(10, 'top'))} style={{ gridRow: '1 / 4', gridColumn: '11 / 12' }}>
                {t('evm.tableAssignee')}
              </div>
              <div className={cn(AC_HEADER_CELL, 'whitespace-nowrap tabular-nums', acHeaderCellBorder(5, 'mid'))} style={{ gridRow: '2 / 4', gridColumn: '6 / 7' }}>
                {t('evm.planStart')}
              </div>
              <div className={cn(AC_HEADER_CELL, 'whitespace-nowrap tabular-nums', acHeaderCellBorder(6, 'mid'))} style={{ gridRow: '2 / 4', gridColumn: '7 / 8' }}>
                {t('evm.planEnd')}
              </div>
              <div className={cn(AC_HEADER_CELL, 'whitespace-nowrap tabular-nums', acHeaderCellBorder(7, 'mid'))} style={{ gridRow: '2 / 4', gridColumn: '8 / 9' }}>
                {t('evm.actualStart')}
              </div>
              <div className={cn(AC_HEADER_CELL, 'whitespace-nowrap tabular-nums', acHeaderCellBorder(8, 'mid'))} style={{ gridRow: '2 / 4', gridColumn: '9 / 10' }}>
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
                        meta.isWeekend && 'bg-zinc-400/25 dark:bg-zinc-600/35',
                        !meta.isWeekend && 'bg-muted',
                        meta.isReport && 'bg-amber-200/90 dark:bg-amber-900/45'
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
                        meta.isWeekend && 'bg-zinc-400/25 dark:bg-zinc-600/35',
                        !meta.isWeekend && 'bg-muted',
                        meta.isReport && 'bg-amber-200/90 dark:bg-amber-900/45'
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
                {t('evm.acMatrixEmptyWbs')}
              </div>
            ) : (
              rowVirtualizer.getVirtualItems().map(vr => {
                const row = sortedRows[vr.index]
                if (!row) return null
                const ri = vr.index
                const arr = hoursByWbsId.get(row.id)
                const pctLabel = row.percentDone != null && Number.isFinite(row.percentDone) ? `${(row.percentDone * 100).toFixed(0)}%` : '—'
                const taskLabel = row.task?.trim() ? row.task : '—'

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
                      className={cn('sticky left-0 z-10 flex shrink-0 items-stretch self-stretch border-solid border-border/55', ri % 2 === 1 ? 'bg-muted' : 'bg-background')}
                      style={{ width: PIN_TOTAL, minWidth: PIN_TOTAL }}
                    >
                      {acBodyCell(0, ri, 'text-center font-mono tabular-nums', row.no)}
                      {acBodyCell(1, ri, 'max-w-[72px] truncate justify-start', row.phase ?? '—', row.phase ?? undefined)}
                      {acBodyCell(2, ri, 'max-w-[88px] truncate justify-start', row.category?.trim() ? row.category : '—')}
                      {acBodyCell(3, ri, 'max-w-[88px] truncate justify-start', row.feature?.trim() ? row.feature : '—')}
                      {acBodyCell(4, ri, 'truncate justify-start font-medium', taskLabel, taskLabel)}
                      {acBodyCell(5, ri, 'whitespace-nowrap', formatDateDisplay(row.planStartDate, i18n.language))}
                      {acBodyCell(6, ri, 'whitespace-nowrap', formatDateDisplay(row.planEndDate, i18n.language))}
                      {acBodyCell(7, ri, 'whitespace-nowrap', formatDateDisplay(row.actualStartDate, i18n.language))}
                      {acBodyCell(8, ri, 'whitespace-nowrap', formatDateDisplay(row.actualEndDate, i18n.language))}
                      {acBodyCell(9, ri, 'text-center tabular-nums', pctLabel)}
                      {acBodyCell(10, ri, 'max-w-[96px] truncate justify-start', evmAssigneeDisplayName(master, row.assignee, assigneeNameFromWbs.get(row.assignee ?? '') ?? null))}
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
                          const h = arr?.[vc.index] ?? 0
                          const isWork = isEvmCalendarWorkdayYmd(meta.ds, nonWorkingList)
                          const show = !isWork || h <= 0.0001 ? '' : h.toFixed(1)
                          const inPlanBand = isWork && isYmdInPlanWorkingRange(meta.ds, row.planStartDate, row.planEndDate, nonWorkingList)
                          return (
                            <div
                              key={vc.key}
                              className={cn(
                                'absolute top-0 box-border flex h-full items-center justify-center border-r border-solid border-border/50 px-0 py-0.5 text-center text-xs tabular-nums last:border-r-0',
                                !isWork && 'bg-zinc-400/20 dark:bg-zinc-600/30',
                                isWork && inPlanBand && 'bg-sky-200/50 dark:bg-sky-900/45',
                                isWork && !inPlanBand && (ri % 2 === 1 ? 'bg-muted' : 'bg-background'),
                                meta.isReport && 'ring-1 ring-inset ring-amber-400/90 dark:ring-amber-500/55'
                              )}
                              style={{ left: vc.start - PIN_TOTAL, width: vc.size, height: '100%' }}
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

      <EditAcSheetDialog row={editRow} master={master} open={!!editRow} onClose={() => setEditRow(null)} onSave={saveEdit} />
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
  onSave: (updates: { actualStartDate: string | null; actualEndDate: string | null; percentDone: number | null }) => Promise<void>
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
            <Input type="date" value={actualStartDate} onChange={e => setActualStartDate(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">{t('evm.actualEnd')}</Label>
            <Input type="date" value={actualEndDate} onChange={e => setActualEndDate(e.target.value)} className="h-8 text-sm" />
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
