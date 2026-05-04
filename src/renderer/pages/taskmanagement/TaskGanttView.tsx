'use client'

import type { Locale } from 'date-fns'
import { addDays, addMonths, differenceInCalendarDays, format, getISOWeek, startOfDay, startOfMonth } from 'date-fns'
import { Briefcase, Layers, Users } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { parseLocalDate, toYyyyMmDd } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
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
  /** Viền lưới (hàng / cột ngày) */
  gridBordersSwitch?: string
  gridBordersHelp?: string
}

const LS_GANTT_ROWS = 'honey_badger.taskGantt.rowGroup.v1'
const LS_GANTT_LABEL_W = 'honey_badger.taskGantt.labelWidth.v1'
const LS_GANTT_GRID_BORDERS = 'honey_badger.taskGantt.gridBorders.v1'
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

/** px / ngày — giảm dần = zoom xa (xem phạm vi dài hơn). Hai tuần phải nhỏ hơn Tuần (month), không lớn hơn. */
function ganttPixelPerDay(scale: TaskGanttScale): number {
  switch (scale) {
    case 'week':
      return 40
    case 'month':
      return 16
    case 'twoWeek':
      return 12
    case 'monthly':
      return 8
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

function loadGanttGridBorders(): boolean {
  try {
    if (typeof window === 'undefined') return true
    const v = window.localStorage.getItem(LS_GANTT_GRID_BORDERS)
    if (v === null) return true
    return v === '1'
  } catch {
    return true
  }
}

function saveGanttGridBorders(on: boolean) {
  try {
    window.localStorage.setItem(LS_GANTT_GRID_BORDERS, on ? '1' : '0')
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
const HEADER_H = 40

function ganttUiLang(language: string | undefined): 'en' | 'vi' | 'ja' {
  const base = (language ?? 'en').toLowerCase().split('-')[0]
  if (base === 'vi') return 'vi'
  if (base === 'ja') return 'ja'
  return 'en'
}

/** Chỉ dùng cho flash viền (trang trí); cuộn Gantt luôn dùng `scrollTo({ behavior: 'smooth' })` vì đây là điều hướng không gian, không cần khớp OS reduce như parallax. */
function ganttReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

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

/**
 * Trục X chart: cạnh trái = 0, rộng = totalDays * pixelPerDay.
 * - Day (scale week): lưới mỗi ngày.
 * - Week / 2 tuần: lưới theo cột 7 ngày (trùng tick), không mỗi ngày.
 * - Month (monthly): lưới theo đầu tháng (trùng tick), thêm mép trái/phải.
 */
function ganttVerticalGridLeftPx(
  scale: TaskGanttScale,
  start: Date,
  totalDays: number,
  pixelPerDay: number
): number[] {
  const chartW = totalDays * pixelPerDay
  const s0 = startOfDay(start)
  const acc = new Set<number>()

  if (scale === 'week') {
    for (let i = 0; i <= totalDays; i++) {
      acc.add(i * pixelPerDay)
    }
    return Array.from(acc).sort((a, b) => a - b)
  }

  if (scale === 'month' || scale === 'twoWeek') {
    for (let dayIdx = 0; dayIdx <= totalDays; dayIdx += 7) {
      acc.add(dayIdx * pixelPerDay)
    }
    acc.add(chartW)
    return Array.from(acc)
      .filter(x => x >= 0 && x <= chartW)
      .sort((a, b) => a - b)
  }

  const endExclusive = addDays(s0, totalDays)
  for (let d = startOfMonth(s0); d < endExclusive; d = addMonths(d, 1)) {
    const dayIndex = differenceInCalendarDays(d, s0)
    if (dayIndex >= 0 && dayIndex <= totalDays) {
      acc.add(dayIndex * pixelPerDay)
    }
  }
  acc.add(0)
  acc.add(chartW)
  return Array.from(acc)
    .filter(x => x >= 0 && x <= chartW)
    .sort((a, b) => a - b)
}

export function TaskGanttView({
  tasks,
  locale,
  language,
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
  /** i18n language (vd. `vi`, `en`, `ja-JP`) — định dạng tick timeline */
  language: string
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
  const { t } = useTranslation()
  const [scale, setScale] = useState<TaskGanttScale>('week')
  const [tightWindow, setTightWindow] = useState(false)
  const [rowGrouping, setRowGrouping] = useState<GanttRowGrouping>(() => loadGanttRowGrouping())
  const [labelColumnWidth, setLabelColumnWidth] = useState(() => loadGanttLabelWidth())
  const [showGridBorders, setShowGridBorders] = useState(() => loadGanttGridBorders())
  const pixelPerDay = ganttPixelPerDay(scale)

  const persistGridBorders = useCallback((on: boolean) => {
    setShowGridBorders(on)
    saveGanttGridBorders(on)
  }, [])

  const labelResizeDragRef = useRef<{ pointerId: number; startX: number; startW: number } | null>(null)

  const groupingEffective: GanttRowGrouping = disableRowGrouping ? 'flat' : rowGrouping

  useEffect(() => {
    if (disableRowGrouping) return
    saveGanttRowGrouping(rowGrouping)
  }, [disableRowGrouping, rowGrouping])

  const outerScrollRef = useRef<HTMLDivElement>(null)
  const fitScrollGenRef = useRef(0)
  const lastAppliedFitGenRef = useRef(0)
  const scrollToChartPixelRef = useRef<((pixel: number) => void) | null>(null)
  const chromeFlashTimeoutRef = useRef(0)
  const [timelineChromeFlash, setTimelineChromeFlash] = useState(false)

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
    const raw: { d: Date; left: number; line1: string; line2?: string }[] = []
    const uiLang = ganttUiLang(language)
    const chartW = totalDays * pixelPerDay

    if (scale === 'monthly') {
      const endExclusive = addDays(start, totalDays)
      for (let d = startOfMonth(start); d < endExclusive; d = addMonths(d, 1)) {
        const dayIndex = differenceInCalendarDays(d, start)
        if (dayIndex < 0 || dayIndex > totalDays) continue
        const line1 =
          uiLang === 'ja' ? format(d, 'yyyy/MM', { locale }) : format(d, 'MM/yyyy', { locale })
        raw.push({ d, left: dayIndex * pixelPerDay, line1 })
      }
      if (raw.length === 0) {
        const d0 = startOfMonth(start)
        raw.push({
          d: d0,
          left: 0,
          line1: uiLang === 'ja' ? format(d0, 'yyyy/MM', { locale }) : format(d0, 'MM/yyyy', { locale }),
        })
      }
    } else {
      const step = scale === 'week' ? 1 : 7
      for (let i = 0; i <= totalDays; i += step) {
        const d = addDays(start, i)
        if (scale === 'week') {
          raw.push({
            d,
            left: i * pixelPerDay,
            line1: format(d, 'EEE', { locale }),
            line2: uiLang === 'ja' ? format(d, 'M/d', { locale }) : format(d, 'dd/MM', { locale }),
          })
        } else {
          raw.push({
            d,
            left: i * pixelPerDay,
            line1: t('taskManagement.ganttTickWeekLine1', { week: getISOWeek(d) }),
            line2: uiLang === 'ja' ? format(d, 'M/d', { locale }) : format(d, 'dd/MM', { locale }),
          })
        }
      }
    }

    const visible = raw.filter(m => m.left < chartW - 0.5)
    return visible.map((m, j) => {
      const nextLeft = j + 1 < visible.length ? visible[j + 1].left : chartW
      const cellWidth = Math.max(8, nextLeft - m.left)
      return { ...m, cellWidth }
    })
  }, [start, totalDays, pixelPerDay, scale, locale, language, t])

  const verticalGridLeftPx = useMemo(
    () => ganttVerticalGridLeftPx(scale, start, totalDays, pixelPerDay),
    [scale, start, totalDays, pixelPerDay]
  )

  const flashTimelineChrome = useCallback(() => {
    if (ganttReducedMotion()) return
    if (chromeFlashTimeoutRef.current) window.clearTimeout(chromeFlashTimeoutRef.current)
    setTimelineChromeFlash(true)
    chromeFlashTimeoutRef.current = window.setTimeout(() => {
      chromeFlashTimeoutRef.current = 0
      setTimelineChromeFlash(false)
    }, 420)
  }, [])

  /** Cuộn ngang: `Element.scrollTo({ behavior: 'smooth' })` — không đọc `prefers-reduced-motion` (OS của user có thể bật reduce nhưng vẫn muốn pan timeline mượt). */
  const scrollToChartPixel = useCallback(
    (pixelInTimeline: number) => {
      const el = outerScrollRef.current
      if (!el) return
      const target = Math.max(0, labelColumnWidth + pixelInTimeline - Math.max(80, el.clientWidth / 3))
      const startLeft = el.scrollLeft
      const delta = target - startLeft

      const noHorizontalMotion =
        Math.abs(delta) < 1 || el.scrollWidth <= el.clientWidth + 2

      if (noHorizontalMotion) {
        flashTimelineChrome()
        return
      }

      el.scrollTo({ left: target, top: el.scrollTop, behavior: 'smooth' })
    },
    [labelColumnWidth, flashTimelineChrome]
  )

  scrollToChartPixelRef.current = scrollToChartPixel

  const scrollToToday = useCallback(() => {
    scrollToChartPixel(Math.max(0, todayPxCenter))
  }, [todayPxCenter, scrollToChartPixel])

  useEffect(() => {
    return () => {
      if (chromeFlashTimeoutRef.current) window.clearTimeout(chromeFlashTimeoutRef.current)
    }
  }, [])

  useLayoutEffect(() => {
    const g = fitScrollGenRef.current
    if (g === 0) return
    if (g === lastAppliedFitGenRef.current) return
    lastAppliedFitGenRef.current = g
    scrollToChartPixelRef.current?.(0)
  }, [tightWindow])

  const onFitTimelineClick = useCallback(() => {
    fitScrollGenRef.current += 1
    setTightWindow(v => !v)
  }, [])

  const showTodayLine = todayPxCenter >= 0 && todayPxCenter <= chartWidth

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="min-w-0 w-full shrink-0 overflow-x-auto pb-px [-ms-overflow-style:auto] [scrollbar-gutter:stable]">
        <div className="flex min-w-full w-full flex-nowrap items-start gap-2 sm:items-center">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
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
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-2 sm:gap-x-3">
            {(labels.gridBordersSwitch || labels.gridBordersHelp) && (
              <div className="flex items-center gap-2 border-border/60 sm:border-l sm:pl-3">
                {labels.gridBordersSwitch ? (
                  <Label
                    htmlFor="task-gantt-grid-borders"
                    className="cursor-pointer whitespace-nowrap text-xs text-muted-foreground"
                    title={labels.gridBordersHelp}
                  >
                    {labels.gridBordersSwitch}
                  </Label>
                ) : null}
                <Switch
                  id="task-gantt-grid-borders"
                  size="sm"
                  className="shrink-0 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-500 dark:data-[state=checked]:bg-blue-600"
                  checked={showGridBorders}
                  onCheckedChange={v => persistGridBorders(v === true)}
                  title={labels.gridBordersHelp}
                  aria-label={labels.gridBordersHelp ?? labels.gridBordersSwitch}
                />
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                'h-8 text-xs transition-[transform,box-shadow] duration-150 ease-out active:scale-[0.94] active:shadow-inner',
                'motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:active:shadow-none'
              )}
              onClick={onFitTimelineClick}
            >
              {labels.fitRange}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                'h-8 text-xs transition-[transform,box-shadow] duration-150 ease-out active:scale-[0.94] active:shadow-inner',
                'motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:active:shadow-none'
              )}
              onClick={scrollToToday}
            >
              {labels.goToToday}
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={outerScrollRef}
        className={cn(
          'min-h-0 min-w-0 flex-1 overflow-auto scroll-smooth rounded-md border border-border/70 bg-muted/10',
          'transition-[box-shadow,background-color] duration-300 ease-out motion-reduce:transition-none',
          timelineChromeFlash && 'bg-primary/[0.07] shadow-[inset_0_0_0_2px_hsl(var(--primary)/0.22)] motion-reduce:bg-muted/10 motion-reduce:shadow-none'
        )}
      >
        {scheduled.length === 0 ? (
          <div className="p-4 text-muted-foreground text-sm">{labels.emptyScheduled}</div>
        ) : (
          <div className="relative inline-block min-w-max bg-background/30" style={{ width: labelColumnWidth + chartWidth }}>
            <div
              className={cn(
                'sticky top-0 z-40 flex bg-muted/90',
                showGridBorders ? 'divide-x divide-border/60 border-b border-b-border/60' : 'divide-x divide-border/35 border-b border-b-border/35'
              )}
              style={{ height: HEADER_H }}
            >
              <div className="sticky left-0 z-[41] shrink-0 bg-muted/95 backdrop-blur-sm relative" style={{ width: labelColumnWidth }}>
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
                {showGridBorders ? (
                  <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
                    {verticalGridLeftPx.map(left => (
                      <div
                        key={left}
                        className="absolute top-0 bottom-0 w-px bg-border/85 dark:bg-border/70"
                        style={{ left }}
                      />
                    ))}
                  </div>
                ) : null}
                {tickMarks.map(mark => (
                  <div
                    key={`${+mark.d}-${mark.left}`}
                    className="absolute top-0 z-[2] flex h-full flex-col items-center justify-center gap-px leading-tight text-center"
                    style={{ left: mark.left, width: mark.cellWidth, height: HEADER_H }}
                  >
                    <span className="w-full max-w-full truncate px-0.5 text-[9px] font-semibold text-muted-foreground">{mark.line1}</span>
                    {mark.line2 != null && mark.line2 !== '' ? (
                      <span className="w-full max-w-full truncate px-0.5 text-[9px] tabular-nums text-muted-foreground/90">{mark.line2}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className={cn('relative flex flex-col', showGridBorders ? 'bg-border/30' : 'bg-border/20')}>
              {showGridBorders ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute top-0 bottom-0 z-[1]"
                  style={{ left: labelColumnWidth, width: chartWidth }}
                >
                  {verticalGridLeftPx.map(left => (
                    <div
                      key={left}
                      className="absolute top-0 bottom-0 w-px bg-border/85 dark:bg-border/70"
                      style={{ left }}
                    />
                  ))}
                </div>
              ) : null}
              {scheduledGroups.map(group => (
                <div key={group.segmentKey} className={cn('flex flex-col', showGridBorders && 'relative z-[2]')}>
                  {group.title ? (
                    <div
                      className={cn(
                        'flex min-w-max shrink-0 items-stretch bg-muted/70',
                        showGridBorders ? 'relative z-[2] divide-x divide-border/60 border-b border-b-border/60' : 'divide-x divide-border/50 border-b border-b-border/50'
                      )}
                      style={{ width: labelColumnWidth + chartWidth }}
                    >
                      <div
                        className="sticky left-0 z-[25] flex shrink-0 items-center bg-muted/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm"
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
                      showGridBorders={showGridBorders}
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
  showGridBorders,
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
  showGridBorders: boolean
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
    <div
      className={cn(
        'relative flex min-h-[36px] w-full shrink-0 items-stretch hover:bg-muted/25',
        showGridBorders
          ? 'z-[2] divide-x divide-border/60 border-b border-b-border/60 bg-transparent'
          : 'divide-x divide-border/40 border-b border-b-border/[0.12] bg-background/97'
      )}
    >
      <div className="sticky left-0 z-20 flex min-w-0 shrink-0 items-center gap-1 bg-background/95 px-1.5 py-1 backdrop-blur-sm" style={{ width: labelColumnWidth }}>
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

      <div
        className={cn('relative flex min-h-[36px] min-w-0', showGridBorders && 'border-r border-r-border/55 bg-muted/15')}
        style={{ width: chartWidth }}
      >
        <div className="relative my-2 h-[26px] w-full shrink-0" style={{ width: chartWidth }}>
          <div
            role="presentation"
            className={cn(
              'absolute top-0 z-[3] flex h-[26px] min-w-[8px] select-none rounded border-none! text-[11px] font-medium text-foreground',
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
