'use client'

import type { Locale } from 'date-fns'
import { addDays, addMonths, differenceInCalendarDays, format, startOfDay, startOfMonth } from 'date-fns'
import { Briefcase, Layers, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { parseLocalDate, toYyyyMmDd } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import type { TaskTableRowTask } from './TaskTableRow'
import { taskStatusBarStyle } from './taskStatusVisual'

export type TaskGanttScale = 'week' | 'twoWeek' | 'month' | 'monthly'

export type TaskGanttViewLabels = {
  week: string
  month: string
  twoWeek: string
  monthly: string
  unscheduled: string
  zoom: string
  emptyScheduled: string
  fitRange: string
  goToToday: string
  todayMark: string
  groupRows?: string
  groupingFlat?: string
  groupingByAssignee?: string
  groupingByProject?: string
  resizeLabelColumn?: string
}

const LS_GANTT_ROWS = 'honey_badger.taskGantt.rowGroup.v1'
const LS_GANTT_LABEL_W = 'honey_badger.taskGantt.labelWidth.v1'
const DEFAULT_GANTT_LABEL_W = 216
const MIN_GANTT_LABEL_W = 160
const MAX_GANTT_LABEL_W = 520

type GanttRowGrouping = 'flat' | 'assignee' | 'project'

function loadGanttRowGrouping(): GanttRowGrouping {
  try {
    const raw = localStorage.getItem(LS_GANTT_ROWS)
    if (!raw) return 'flat'
    const v = JSON.parse(raw) as string
    if (v === 'flat' || v === 'assignee' || v === 'project') return v
  } catch {
    /* ignore */
  }
  return 'flat'
}

function ganttPixelPerDay(scale: TaskGanttScale): number {
  switch (scale) {
    case 'week':
      return 40
    case 'twoWeek':
      return 28
    case 'month':
      return 16
    case 'monthly':
      return 9
    default:
      return 40
  }
}

function saveGanttRowGrouping(mode: GanttRowGrouping) {
  try {
    localStorage.setItem(LS_GANTT_ROWS, JSON.stringify(mode))
  } catch {
    /* ignore */
  }
}

function loadGanttLabelWidth(): number {
  try {
    const raw = localStorage.getItem(LS_GANTT_LABEL_W)
    if (!raw) return DEFAULT_GANTT_LABEL_W
    const n = Number(JSON.parse(raw) as unknown)
    if (!Number.isFinite(n)) return DEFAULT_GANTT_LABEL_W
    return Math.min(MAX_GANTT_LABEL_W, Math.max(MIN_GANTT_LABEL_W, Math.round(n)))
  } catch {
    return DEFAULT_GANTT_LABEL_W
  }
}

function saveGanttLabelWidth(w: number) {
  try {
    localStorage.setItem(LS_GANTT_LABEL_W, JSON.stringify(w))
  } catch {
    /* ignore */
  }
}

function bucketGanttScheduled(
  scheduled: TaskTableRowTask[],
  mode: GanttRowGrouping,
  getAssigneeDisplay?: (id: string | null) => string
): { segmentKey: string; title: string; tasks: TaskTableRowTask[] }[] {
  if (mode === 'flat') {
    return [{ segmentKey: 'flat', title: '', tasks: scheduled }]
  }

  const m = new Map<string, { title: string; tasks: TaskTableRowTask[] }>()
  for (const t of scheduled) {
    let key = ''
    let title = ''
    if (mode === 'assignee') {
      const uid = (t.assigneeUserId || '').trim()
      key = uid !== '' ? uid : '_none'
      title = uid !== '' ? (getAssigneeDisplay?.(uid) ?? uid) : '(—)'
    } else {
      const pid = (t.projectId || '').trim()
      key = pid !== '' ? pid : '_none'
      title = ((t.project && String(t.project).trim()) || (pid !== '' ? pid : null)) ?? '(—)'
    }
    const ex = m.get(key)
    if (ex) ex.tasks.push(t)
    else m.set(key, { title, tasks: [t] })
  }

  const entries = [...m.entries()].sort(([ka, a], [kb, b]) => {
    const na = ka === '_none' ? 1 : 0
    const nb = kb === '_none' ? 1 : 0
    if (na !== nb) return na - nb
    return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
  })

  return entries.map(([segmentKey, g], i) => ({
    segmentKey: `${segmentKey}_${i}`,
    title: g.title,
    tasks: [...g.tasks].sort((a, b) => {
      const pa = parsePlanDate(a.planStartDate)?.getTime() ?? 0
      const pb = parsePlanDate(b.planStartDate)?.getTime() ?? 0
      return pa - pb
    }),
  }))
}
const HEADER_H = 32

function parsePlanDate(raw: string | undefined): Date | null {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null
  const trimmed = raw.trim().slice(0, 10)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? (parseLocalDate(trimmed) ?? null) : new Date(raw)
  if (!d || Number.isNaN(d.getTime())) return null
  return startOfDay(d)
}

function calendarSpanInclusive(a: Date, b: Date): number {
  return Math.max(1, differenceInCalendarDays(startOfDay(b), startOfDay(a)) + 1)
}

export function TaskGanttView({
  tasks,
  locale,
  filterRange,
  onSelectTask,
  labels,
  selectedTaskIds,
  onToggleTaskSelect,
  statusColorMap,
  onUpdatePlanDates,
  getAssigneeDisplay,
  disableRowGrouping = false,
}: {
  tasks: TaskTableRowTask[]
  locale: Locale
  filterRange?: { from: Date; to: Date }
  onSelectTask: (task: TaskTableRowTask) => void
  labels: TaskGanttViewLabels
  selectedTaskIds?: Set<string>
  onToggleTaskSelect?: (taskId: string) => void
  statusColorMap?: Record<string, string>
  onUpdatePlanDates?: (taskId: string, planStartDate: string, planEndDate: string, version?: number) => Promise<boolean>
  getAssigneeDisplay?: (assigneeUserId: string | null) => string
  /** Admin / PL / PM — khi false: luôn flat, ẩn nhóm hàng */
  disableRowGrouping?: boolean
}) {
  const [scale, setScale] = useState<TaskGanttScale>('week')
  const [tightWindow, setTightWindow] = useState(false)
  const [rowGrouping, setRowGrouping] = useState<GanttRowGrouping>(() => loadGanttRowGrouping())
  const [labelColumnWidth, setLabelColumnWidth] = useState(() => loadGanttLabelWidth())
  const pixelPerDay = ganttPixelPerDay(scale)

  const labelResizeDragRef = useRef<{ pointerId: number; startX: number; startW: number } | null>(null)

  const groupingEffective: GanttRowGrouping = disableRowGrouping ? 'flat' : rowGrouping

  useEffect(() => {
    if (disableRowGrouping) return
    saveGanttRowGrouping(rowGrouping)
  }, [disableRowGrouping, rowGrouping])

  const outerScrollRef = useRef<HTMLDivElement>(null)

  const onLabelResizePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    labelResizeDragRef.current = { pointerId: e.pointerId, startX: e.clientX, startW: labelColumnWidth }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [labelColumnWidth])

  const onLabelResizePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const ctx = labelResizeDragRef.current
    if (!ctx || e.pointerId !== ctx.pointerId) return
    const next = Math.min(
      MAX_GANTT_LABEL_W,
      Math.max(MIN_GANTT_LABEL_W, Math.round(ctx.startW + (e.clientX - ctx.startX)))
    )
    setLabelColumnWidth(next)
  }, [])

  const onLabelResizePointerEnd = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const ctx = labelResizeDragRef.current
    if (!ctx || e.pointerId !== ctx.pointerId) return
    labelResizeDragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const next = Math.min(
      MAX_GANTT_LABEL_W,
      Math.max(MIN_GANTT_LABEL_W, Math.round(ctx.startW + (e.clientX - ctx.startX)))
    )
    setLabelColumnWidth(next)
    saveGanttLabelWidth(next)
  }, [])

  const { scheduled, unscheduled } = useMemo(() => {
    const sched: TaskTableRowTask[] = []
    const unsched: TaskTableRowTask[] = []
    for (const t of tasks) {
      const s = parsePlanDate(t.planStartDate)
      const e = parsePlanDate(t.planEndDate)
      if (s && e) sched.push(t)
      else unsched.push(t)
    }
    return { scheduled: sched, unscheduled: unsched }
  }, [tasks])

  const scheduledGroups = useMemo(() => bucketGanttScheduled(scheduled, groupingEffective, getAssigneeDisplay), [scheduled, groupingEffective, getAssigneeDisplay])

  const { start, totalDays } = useMemo(() => {
    let minD: Date | null = null
    let maxD: Date | null = null
    for (const t of scheduled) {
      const s = parsePlanDate(t.planStartDate)
      const e = parsePlanDate(t.planEndDate)
      if (!s || !e) continue
      const rs = startOfDay(s <= e ? s : e)
      const re = startOfDay(s <= e ? e : s)
      if (!minD || rs.getTime() < minD.getTime()) minD = rs
      if (!maxD || re.getTime() > maxD.getTime()) maxD = re
    }
    const today = startOfDay(new Date())
    if (!minD) minD = addDays(today, -14)
    if (!maxD) maxD = addDays(today, 14)
    let startD = minD
    let endD = maxD
    if (startD > endD) [startD, endD] = [endD, startD]

    if (filterRange) {
      let fs = startOfDay(filterRange.from)
      let fe = startOfDay(filterRange.to)
      if (fs > fe) [fs, fe] = [fe, fs]
      const low = minD ? (minD < fs ? minD : fs) : fs
      const high = maxD ? (maxD > fe ? maxD : fe) : fe
      startD = low
      endD = high
    }

    const days = differenceInCalendarDays(endD, startD) + 1
    const padding = tightWindow && scheduled.length > 0 ? 2 : Math.max(2, Math.min(60, Math.floor(days * 0.05)))
    startD = addDays(startD, -padding)
    endD = addDays(endD, padding)

    const total = differenceInCalendarDays(endD, startD) + 1
    return { start: startD, totalDays: total }
  }, [scheduled, filterRange, tightWindow])

  const chartWidth = totalDays * pixelPerDay
  const todayDayIndex = differenceInCalendarDays(startOfDay(new Date()), start)
  const todayPxCenter = todayDayIndex * pixelPerDay + pixelPerDay / 2

  const tickMarks = useMemo(() => {
    const marks: { d: Date; left: number; label: string }[] = []
    if (scale === 'monthly') {
      const endExclusive = addDays(start, totalDays)
      for (let d = startOfMonth(start); d < endExclusive; d = addMonths(d, 1)) {
        const dayIndex = differenceInCalendarDays(d, start)
        if (dayIndex < 0 || dayIndex > totalDays) continue
        marks.push({
          d,
          left: dayIndex * pixelPerDay,
          label: format(d, 'MMM yyyy', { locale }),
        })
      }
      if (marks.length === 0) {
        marks.push({ d: start, left: 0, label: format(start, 'MMM yyyy', { locale }) })
      }
      return marks
    }
    const step = scale === 'week' ? 1 : 7
    for (let i = 0; i <= totalDays; i += step) {
      const d = addDays(start, i)
      marks.push({
        d,
        left: i * pixelPerDay,
        label: scale === 'week' ? format(d, 'EEE d', { locale }) : format(d, 'MMM d', { locale }),
      })
    }
    return marks
  }, [start, totalDays, pixelPerDay, scale, locale])

  const scrollToChartPixel = useCallback(
    (pixelInTimeline: number, behavior: ScrollBehavior = 'smooth') => {
      const el = outerScrollRef.current
      if (!el) return
      const target = Math.max(0, labelColumnWidth + pixelInTimeline - Math.max(80, el.clientWidth / 3))
      el.scrollTo({ left: target, behavior })
    },
    [labelColumnWidth]
  )

  const scrollToToday = useCallback(() => {
    scrollToChartPixel(Math.max(0, todayPxCenter))
  }, [todayPxCenter, scrollToChartPixel])

  const showTodayLine = todayPxCenter >= 0 && todayPxCenter <= chartWidth

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="min-w-0 w-full shrink-0 overflow-x-auto pb-px [-ms-overflow-style:auto] [scrollbar-gutter:stable]">
        <div className="flex w-max min-w-full flex-nowrap items-center gap-2 sm:flex-wrap">
          <span className="text-muted-foreground text-xs">{labels.zoom}</span>
          <ToggleGroup type="single" value={scale} onValueChange={v => v && setScale(v as TaskGanttScale)} variant="outline" size="sm">
            <ToggleGroupItem value="week" aria-label="week scale">
              {labels.week}
            </ToggleGroupItem>
            <ToggleGroupItem value="month" aria-label="month scale">
              {labels.month}
            </ToggleGroupItem>
            <ToggleGroupItem value="twoWeek" aria-label="two week scale">
              {labels.twoWeek}
            </ToggleGroupItem>
            <ToggleGroupItem value="monthly" aria-label="monthly scale">
              {labels.monthly}
            </ToggleGroupItem>
          </ToggleGroup>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setTightWindow(v => !v)}>
            {labels.fitRange}
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={scrollToToday}>
            {labels.goToToday}
          </Button>
          {!disableRowGrouping && (labels.groupRows || labels.groupingFlat || labels.groupingByAssignee || labels.groupingByProject) && (
            <>
              <span className="mx-1 hidden text-muted-foreground sm:inline text-xs">{labels.groupRows ?? ''}</span>
              <ToggleGroup
                type="single"
                value={rowGrouping}
                onValueChange={v => v && setRowGrouping(v as GanttRowGrouping)}
                variant="outline"
                size="sm"
                className="justify-start gap-px"
              >
                <ToggleGroupItem value="flat" className="h-8 px-2" title={labels.groupingFlat} aria-label={labels.groupingFlat}>
                  <Layers className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{labels.groupingFlat}</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="assignee" className="h-8 px-2" title={labels.groupingByAssignee} aria-label={labels.groupingByAssignee}>
                  <Users className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{labels.groupingByAssignee}</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="project" className="h-8 px-2" title={labels.groupingByProject} aria-label={labels.groupingByProject}>
                  <Briefcase className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{labels.groupingByProject}</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </>
          )}
        </div>
      </div>

      <div ref={outerScrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border border-border/70 bg-muted/10">
        {scheduled.length === 0 ? (
          <div className="p-4 text-muted-foreground text-sm">{labels.emptyScheduled}</div>
        ) : (
          <div className="relative inline-block min-w-max bg-background/30" style={{ width: labelColumnWidth + chartWidth }}>
            <div className="sticky top-0 z-40 flex bg-muted/90" style={{ height: HEADER_H }}>
              <div
                className="sticky left-0 z-[41] shrink-0 border-r border-border/60 bg-muted/95 backdrop-blur-sm relative"
                style={{ width: labelColumnWidth }}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={labels.resizeLabelColumn ?? 'Resize label column'}
                  title={labels.resizeLabelColumn ?? 'Resize label column'}
                  className="absolute inset-y-0 right-0 z-[2] w-2 cursor-col-resize touch-none border-0 bg-transparent p-0 hover:bg-primary/15 active:bg-primary/25"
                  onPointerDown={onLabelResizePointerDown}
                  onPointerMove={onLabelResizePointerMove}
                  onPointerUp={onLabelResizePointerEnd}
                  onPointerCancel={onLabelResizePointerEnd}
                />
              </div>
              <div className="relative shrink-0 text-[10px] text-muted-foreground" style={{ width: chartWidth }}>
                {tickMarks.map(({ d, left, label }) => (
                  <span key={+d} className="absolute top-2 whitespace-nowrap" style={{ left }}>
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative flex flex-col bg-border/20">
              {scheduledGroups.map(group => (
                <div key={group.segmentKey} className="flex flex-col">
                  {group.title ? (
                    <div className="flex min-w-max shrink-0 items-stretch border-b border-border/50 bg-muted/70" style={{ width: labelColumnWidth + chartWidth }}>
                      <div
                        className="sticky left-0 z-[25] flex shrink-0 items-center border-r border-border/60 bg-muted/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm"
                        style={{ width: labelColumnWidth }}
                      >
                        {group.title}
                      </div>
                      <div className="min-h-[28px] flex-1 bg-muted/40" aria-hidden />
                    </div>
                  ) : null}
                  {group.tasks.map(task => (
                    <GanttTaskRow
                      key={task.id}
                      task={task}
                      start={start}
                      pixelPerDay={pixelPerDay}
                      chartWidth={chartWidth}
                      statusColorMap={statusColorMap}
                      selectedTaskIds={selectedTaskIds}
                      onToggleTaskSelect={onToggleTaskSelect}
                      onOpenTask={() => onSelectTask(task)}
                      onUpdatePlanDates={onUpdatePlanDates}
                      labelColumnWidth={labelColumnWidth}
                    />
                  ))}
                </div>
              ))}
              {showTodayLine ? (
                <div
                  className="pointer-events-none absolute inset-y-0 z-[18]"
                  style={{ left: labelColumnWidth, width: chartWidth }}
                  aria-hidden
                >
                  <div
                    className="absolute top-0 bottom-0 w-px bg-rose-600/95"
                    style={{ left: todayPxCenter }}
                    title={labels.todayMark}
                  />
                </div>
              ) : null}
            </div>
          </div>
        )}

        {unscheduled.length > 0 ? (
          <div className="flex max-h-[min(40vh,18rem)] min-h-0 flex-col border-t border-border p-3">
            <div className="mb-2 shrink-0 text-xs font-semibold text-muted-foreground">
              {labels.unscheduled} ({unscheduled.length})
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
              <ul className="flex flex-wrap content-start gap-2 pb-1">
                {unscheduled.map(t => {
                  const sh = statusColorMap?.[t.status]?.trim()
                  return (
                    <li key={t.id} className="flex items-center gap-1 rounded border border-border/80 px-1 py-0.5 min-w-0">
                      <div className="w-1 shrink-0 self-stretch rounded-sm min-h-[1.25rem]" style={{ backgroundColor: sh || 'hsl(var(--primary))' }} aria-hidden />
                      {onToggleTaskSelect ? (
                        <Checkbox
                          className="h-4 w-4 shrink-0"
                          checked={selectedTaskIds?.has(t.id) ?? false}
                          onCheckedChange={() => onToggleTaskSelect(t.id)}
                          onClick={e => e.stopPropagation()}
                          aria-label={t.title ? `Bulk select: ${t.title}` : 'Bulk select'}
                        />
                      ) : null}
                      <button type="button" className="text-xs hover:bg-muted/60 max-w-[200px] truncate" onClick={() => onSelectTask(t)}>
                        {t.title || '—'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function GanttTaskRow({
  task,
  start,
  pixelPerDay,
  chartWidth,
  statusColorMap,
  selectedTaskIds,
  onToggleTaskSelect,
  onOpenTask,
  onUpdatePlanDates,
  labelColumnWidth,
}: {
  task: TaskTableRowTask
  start: Date
  pixelPerDay: number
  chartWidth: number
  statusColorMap?: Record<string, string>
  selectedTaskIds?: Set<string>
  onToggleTaskSelect?: (taskId: string) => void
  onOpenTask: () => void
  onUpdatePlanDates?: (taskId: string, planStartDate: string, planEndDate: string, version?: number) => Promise<boolean>
  labelColumnWidth: number
}) {
  const sRaw = parsePlanDate(task.planStartDate)
  const eRaw = parsePlanDate(task.planEndDate)
  const sNorm = sRaw && eRaw ? startOfDay(sRaw <= eRaw ? sRaw : eRaw) : null
  const eNorm = sRaw && eRaw ? startOfDay(sRaw <= eRaw ? eRaw : sRaw) : null

  type DragMode = 'move' | 'resize-l' | 'resize-r'
  const dragRef = useRef<null | { mode: DragMode; originX: number; s: Date; e: Date }>(null)
  const [dragPreview, setDragPreview] = useState<{ start: Date; end: Date } | null>(null)
  const previewLiveRef = useRef<{ start: Date; end: Date } | null>(null)

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const ctx = dragRef.current
      if (!ctx) return
      const dx = e.clientX - ctx.originX
      const deltaDays = Math.round(dx / pixelPerDay)
      let nextStart: Date
      let nextEnd: Date
      if (ctx.mode === 'move') {
        nextStart = startOfDay(addDays(ctx.s, deltaDays))
        nextEnd = startOfDay(addDays(ctx.e, deltaDays))
      } else if (ctx.mode === 'resize-l') {
        nextStart = startOfDay(addDays(ctx.s, deltaDays))
        let ne = startOfDay(ctx.e)
        if (nextStart > ne) ne = nextStart
        nextEnd = ne
      } else {
        const ns = startOfDay(ctx.s)
        let ne = startOfDay(addDays(ctx.e, deltaDays))
        if (ne < ns) ne = ns
        nextStart = ns
        nextEnd = ne
      }
      const next = { start: nextStart, end: nextEnd }
      previewLiveRef.current = next
      setDragPreview(next)
    },
    [pixelPerDay]
  )

  const persistIfChanged = useCallback(
    async (a: Date, b: Date) => {
      if (!onUpdatePlanDates || !sNorm || !eNorm) return
      let aa = startOfDay(a)
      let bb = startOfDay(b)
      if (aa > bb) [aa, bb] = [bb, aa]
      if (aa.getTime() === sNorm.getTime() && bb.getTime() === eNorm.getTime()) return
      const ps = toYyyyMmDd(aa)
      const pe = toYyyyMmDd(bb)
      if (!ps || !pe) return
      await onUpdatePlanDates(task.id, ps, pe, task.version)
    },
    [eNorm, sNorm, onUpdatePlanDates, task.id, task.version]
  )

  const onPointerUp = useCallback(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    dragRef.current = null
    const snap = previewLiveRef.current
    previewLiveRef.current = null
    setDragPreview(null)
    if (snap) void persistIfChanged(snap.start, snap.end)
  }, [onPointerMove, persistIfChanged])

  const beginDrag = (mode: DragMode, ev: React.PointerEvent) => {
    if (!onUpdatePlanDates || !sNorm || !eNorm) return
    ev.preventDefault()
    ev.stopPropagation()
    dragRef.current = { mode, originX: ev.clientX, s: sNorm, e: eNorm }
    previewLiveRef.current = { start: sNorm, end: eNorm }
    setDragPreview({ start: sNorm, end: eNorm })
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      dragRef.current = null
    },
    [onPointerMove, onPointerUp]
  )

  if (!sRaw || !eRaw || !sNorm || !eNorm) return null

  const show = dragPreview ?? { start: sNorm, end: eNorm }
  const showOffset = differenceInCalendarDays(show.start, start)
  const showSpan = calendarSpanInclusive(show.start, show.end)
  const leftPx = Math.max(0, showOffset * pixelPerDay)
  const widthPx = Math.max(pixelPerDay * 0.5, showSpan * pixelPerDay - 4)

  const barTint = taskStatusBarStyle(statusColorMap?.[task.status])
  const canDrag = Boolean(onUpdatePlanDates)

  return (
    <div className="relative flex min-h-[36px] w-full shrink-0 items-stretch divide-x divide-border/40 bg-background/97 hover:bg-muted/30">
      <div
        className="sticky left-0 z-20 flex min-w-0 shrink-0 items-center gap-1 border-r border-border/50 bg-background/95 px-1.5 py-1 backdrop-blur-sm"
        style={{ width: labelColumnWidth }}
      >
        {onToggleTaskSelect ? (
          <Checkbox
            checked={selectedTaskIds?.has(task.id) ?? false}
            onCheckedChange={() => onToggleTaskSelect(task.id)}
            className="h-4 w-4 shrink-0"
            aria-label={`Select ${task.title || 'task'}`}
          />
        ) : null}
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-xs font-medium leading-tight text-foreground underline-offset-2 hover:underline"
          title={task.title}
          onClick={onOpenTask}
        >
          {task.title || '—'}
        </button>
      </div>

      <div className="relative flex min-h-[36px] min-w-0" style={{ width: chartWidth }}>
        <div className="relative my-2 h-[26px] w-full shrink-0" style={{ width: chartWidth }}>
          <div
            role="presentation"
            className={cn(
              'absolute top-0 flex h-[26px] min-w-[8px] select-none rounded border-none! text-[11px] font-medium text-foreground',
              !barTint && 'border-primary/45 bg-primary/25'
            )}
            style={{
              left: leftPx,
              width: widthPx,
              maxWidth: chartWidth - leftPx,
              ...(barTint ?? {}),
            }}
          >
            {canDrag ? (
              <button
                type="button"
                aria-label="Resize plan start"
                className="h-full w-2 shrink-0 cursor-ew-resize touch-none rounded-l-[3px] hover:bg-black/10 dark:hover:bg-white/15"
                onPointerDown={e => beginDrag('resize-l', e)}
              />
            ) : (
              <span className="w-1 shrink-0" />
            )}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: Gantt timeline bar drag */}
            <div
              role="presentation"
              className={cn('min-w-0 flex-1 cursor-default truncate px-1 leading-[26px]', canDrag && 'cursor-grab active:cursor-grabbing')}
              onPointerDown={e => canDrag && beginDrag('move', e)}
              onDoubleClick={onOpenTask}
            />
            {canDrag ? (
              <button
                type="button"
                aria-label="Resize plan end"
                className="h-full w-2 shrink-0 cursor-ew-resize touch-none rounded-r-[3px] hover:bg-black/10 dark:hover:bg-white/15"
                onPointerDown={e => beginDrag('resize-r', e)}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
