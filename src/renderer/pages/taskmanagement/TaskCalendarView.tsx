'use client'

import { addDays, format, getDay, parse, startOfDay, startOfWeek } from 'date-fns'
import { enUS, ja, vi } from 'date-fns/locale'
import type { DragEvent } from 'react'
import { type ComponentType, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Calendar, dateFnsLocalizer, type EventProps, Navigate, type View as RbcView } from 'react-big-calendar'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import { useTranslation } from 'react-i18next'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { Briefcase, ChevronDown, ChevronRight, ChevronUp, Layers, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { PLAN_UNSCHED_TASK_DRAG_MIME } from './planUnschedTaskDragMime'
import { isTaskBulkSelectable, taskDisplayLabel, type TaskTableRowTask } from './TaskTableRow'
import {
  bucketTasksByGroup,
  loadTaskBoardRowGrouping,
  loadUnschedCollapsedSegments,
  saveTaskBoardRowGrouping,
  saveUnschedCollapsedSegments,
  type TaskBoardRowGrouping,
} from './taskBoardGroupBuckets'
import { taskStatusBarStyle } from './taskStatusVisual'
export type TaskCalendarMessages = {
  agenda: string
  month: string
  week: string
  day: string
  today: string
  previous: string
  next: string
  /** Nhãn kiểu Gantt « Zoom » — trước ToggleGroup chế độ xem */
  toolbarViewLabel: string
  /** Week/Day: aria cho nút thu gọn hàng all-day (ô góc cột giờ) */
  allDayCollapseAria: string
  allDayExpandAria: string
  /** Nhãn ngắn dưới icon (cột giờ hẹp) */
  allDayCollapseLabel: string
  allDayExpandLabel: string
}

/** HOC không khai báo generic theo kiểu sự kiện; ép kiểu để dùng `CalEvent` an toàn ở phía caller. */
const DragCalendar = withDragAndDrop(Calendar) as unknown as ComponentType<Record<string, unknown>>

/** Cột giờ (gutter) Week/Day: cố định px — đồng bộ header + lưới, tránh đo DOM đổi width khi chuyển view. */
const TIME_GUTTER_WIDTH_PX = 60

function parsePlanDate(raw: string | undefined): Date | null {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : startOfDay(d)
}

function pickCulture(language: string) {
  switch (language) {
    case 'vi':
      return 'vi'
    case 'ja':
      return 'ja'
    default:
      return 'en'
  }
}

/** react-big-calendar: allDay end là exclusive → +1 sau ngày kết thúc (inclusive DB). */
function toExclusiveEnd(endInclusive: Date) {
  return addDays(startOfDay(endInclusive), 1)
}

/** Từ `end` exclusive của RBC → ngày kết thúc inclusive (lưu DB). */
function exclusiveEndToInclusive(exclusiveEnd: Date) {
  return startOfDay(addDays(startOfDay(exclusiveEnd), -1))
}

type CalEvent = { title: string; start: Date; end: Date; resource: TaskTableRowTask; allDay: boolean }

/** Toolbar react-big-calendar — cùng pattern ToggleGroup + Button outline như TaskGanttView (zoom / điều hướng). */
function TaskCalendarToolbar({
  label,
  view,
  views,
  onView,
  onNavigate,
  localizer,
  toolbarViewLabel,
}: {
  label: string
  view: string
  views: string[]
  onView: (next: string) => void
  onNavigate: (action: string, date?: Date) => void
  localizer: { messages: Record<string, string> }
  toolbarViewLabel: string
}) {
  const m = localizer.messages
  return (
    <div className="mb-2 min-w-0 w-full shrink-0 overflow-x-auto pb-px [-ms-overflow-style:auto] [scrollbar-gutter:stable]">
      <div className="flex w-max min-w-full flex-nowrap items-center gap-2 sm:flex-wrap">
        <span className="text-muted-foreground text-xs">{toolbarViewLabel}</span>
        {views.length > 1 ? (
          <ToggleGroup type="single" value={view} onValueChange={v => v && onView(v)} variant="outline" size="sm">
            {views.map(name => (
              <ToggleGroupItem key={name} value={name} aria-label={m[name] ?? name}>
                {m[name] ?? name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
        <span className="min-w-[8rem] flex-1 truncate px-2 text-center text-sm font-semibold text-foreground sm:min-w-[12rem]">{label}</span>
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={() => onNavigate(Navigate.PREVIOUS)}>
          {m.previous}
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={() => onNavigate(Navigate.TODAY)}>
          {m.today}
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={() => onNavigate(Navigate.NEXT)}>
          {m.next}
        </Button>
      </div>
    </div>
  )
}

export function TaskCalendarView({
  tasks,
  language,
  messages,
  onSelectTask,
  unscheduledLabel,
  selectedTaskIds,
  onToggleTaskSelect,
  statusColorMap,
  onUpdatePlanDates,
  getAssigneeDisplay,
  disableUnschedGrouping = false,
  onApplyBulkTaskSelection,
}: {
  tasks: TaskTableRowTask[]
  language: string
  messages: TaskCalendarMessages
  onSelectTask: (task: TaskTableRowTask) => void
  unscheduledLabel: string
  selectedTaskIds?: Set<string>
  onToggleTaskSelect?: (taskId: string) => void
  /** Màu status master (giống bảng) */
  statusColorMap?: Record<string, string>
  onUpdatePlanDates?: (taskId: string, planStartDate: string, planEndDate: string, version?: number) => Promise<boolean>
  /** Giống Gantt — nhóm Unschedule theo assignee / project */
  getAssigneeDisplay?: (userId: string | null) => string
  /** Khi true (vd. user không có quyền group) — Unschedule luôn flat */
  disableUnschedGrouping?: boolean
  /** Chọn/bỏ chọn hàng loạt theo nhóm Unschedule (giống Gantt) */
  onApplyBulkTaskSelection?: (taskIds: string[], selected: boolean) => void
}) {
  const culture = pickCulture(language?.split('-')[0] ?? 'en')
  const canEditPlans = Boolean(onUpdatePlanDates)
  const { t } = useTranslation()

  const taskById = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks])
  const draggingUnschedTaskIdRef = useRef<string | null>(null)

  const [unschedGrouping, setUnschedGrouping] = useState<TaskBoardRowGrouping>(() => loadTaskBoardRowGrouping())

  useEffect(() => {
    saveTaskBoardRowGrouping(unschedGrouping)
  }, [unschedGrouping])

  const [collapsedUnschedGroupSegmentKeys, setCollapsedUnschedGroupSegmentKeys] = useState<Set<string>>(() => loadUnschedCollapsedSegments())

  const toggleUnschedGroupCollapsed = useCallback((segmentKey: string) => {
    setCollapsedUnschedGroupSegmentKeys(prev => {
      const next = new Set(prev)
      if (next.has(segmentKey)) next.delete(segmentKey)
      else next.add(segmentKey)
      saveUnschedCollapsedSegments(next)
      return next
    })
  }, [])

  const unschedGroupingEffective: TaskBoardRowGrouping = disableUnschedGrouping ? 'flat' : unschedGrouping

  const localizer = useMemo(
    () =>
      dateFnsLocalizer({
        format,
        parse,
        startOfWeek,
        getDay,
        locales: { en: enUS, ja, vi },
      }),
    []
  )

  const { events, unscheduled } = useMemo(() => {
    const ev: CalEvent[] = []
    const un: TaskTableRowTask[] = []
    for (const t of tasks) {
      const s = parsePlanDate(t.planStartDate)
      const e = parsePlanDate(t.planEndDate)
      if (!s || !e) {
        un.push(t)
        continue
      }
      const start = startOfDay(s <= e ? s : e)
      const endIncl = startOfDay(s <= e ? e : s)
      ev.push({
        title: taskDisplayLabel(t, '—'),
        start,
        end: toExclusiveEnd(endIncl),
        resource: t,
        allDay: true,
      })
    }
    return { events: ev, unscheduled: un }
  }, [tasks])

  const unscheduledGroups = useMemo(
    () => bucketTasksByGroup(unscheduled, unschedGroupingEffective, getAssigneeDisplay, 'title'),
    [unscheduled, unschedGroupingEffective, getAssigneeDisplay]
  )

  const [view, setView] = useState<'month' | 'week' | 'day' | 'agenda'>('month')
  const viewRef = useRef(view)
  viewRef.current = view

  const [calendarDate, setCalendarDate] = useState(() => startOfDay(new Date()))
  /** Week/Day: thu gọn hàng all-day để nhìn rõ lưới giờ phía dưới */
  const [allDaySectionCollapsed, setAllDaySectionCollapsed] = useState(false)
  const calendarShellRef = useRef<HTMLDivElement>(null)

  /*
   * RBC chỉ chừa scrollbar trên `.rbc-time-header` khi `.rbc-overflowing`; với overflow-y cố định (scroll)
   * thì width cột trong `.rbc-time-content` phụ thuộc chỗ scrollbar thật (= offsetWidth − clientWidth).
   * Đo động (Electron/Chromium/WebView) và gộp khớp `-1px` như TimeGridHeader (scrollbarSize − 1).
   */
  useLayoutEffect(() => {
    const root = calendarShellRef.current
    if (!root) return

    const clearVar = () => {
      root.style.removeProperty('--task-cal-measured-vscrollbar-px')
    }

    if (view !== 'week' && view !== 'day') {
      clearVar()
      return
    }

    let cancelled = false
    let raf = 0
    let observedContent: HTMLElement | null = null
    let innerRo: ResizeObserver | null = null

    let measure: () => void
    const schedule: () => void = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (cancelled) return
        measure()
        raf = requestAnimationFrame(measure)
      })
    }

    measure = () => {
      const content = root.querySelector<HTMLElement>('.rbc-time-view .rbc-time-content')
      if (!content) {
        clearVar()
        if (innerRo && observedContent) {
          innerRo.disconnect()
          innerRo = null
          observedContent = null
        }
        return
      }
      if (content !== observedContent) {
        if (innerRo) innerRo.disconnect()
        observedContent = content
        innerRo = new ResizeObserver(schedule)
        innerRo.observe(content)
      }
      const v = Math.max(0, content.offsetWidth - content.clientWidth)
      root.style.setProperty('--task-cal-measured-vscrollbar-px', `${v}px`)
    }

    schedule()
    const outerRo = new ResizeObserver(schedule)
    outerRo.observe(root)
    window.addEventListener('resize', schedule)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      outerRo.disconnect()
      innerRo?.disconnect()
      window.removeEventListener('resize', schedule)
      innerRo = null
      observedContent = null
      clearVar()
    }
  }, [view, allDaySectionCollapsed, calendarDate])

  const persistFromInteraction = useCallback(
    async (raw: CalEvent, start: Date, endExclusive: Date) => {
      if (!onUpdatePlanDates) return
      let s = startOfDay(start)
      let endIncl = exclusiveEndToInclusive(endExclusive)
      if (endIncl < s) [s, endIncl] = [endIncl, s]
      const ps = format(s, 'yyyy-MM-dd')
      const pe = format(endIncl, 'yyyy-MM-dd')
      await onUpdatePlanDates(raw.resource.id, ps, pe, raw.resource.version)
    },
    [onUpdatePlanDates]
  )

  const handleEventDrop = useCallback(
    async (interaction: { event: object; start: Date; end: Date }) => {
      const ce = interaction.event as CalEvent
      await persistFromInteraction(ce, interaction.start, interaction.end)
    },
    [persistFromInteraction]
  )

  const handleEventResize = useCallback(
    async (interaction: { event: object; start: Date; end: Date }) => {
      const ce = interaction.event as CalEvent
      await persistFromInteraction(ce, interaction.start, interaction.end)
    },
    [persistFromInteraction]
  )

  const handleCalendarDragOver = useCallback((e: DragEvent) => {
    if ([...e.dataTransfer.types].includes(PLAN_UNSCHED_TASK_DRAG_MIME)) {
      e.preventDefault()
    }
  }, [])

  const handleDropFromOutside = useCallback(
    async (args: { start: Date | string; end: Date | string; allDay: boolean }) => {
      const taskId = draggingUnschedTaskIdRef.current
      draggingUnschedTaskIdRef.current = null
      if (!taskId || !onUpdatePlanDates) return
      const task = taskById.get(taskId)
      if (!task) return
      const s0 = parsePlanDate(task.planStartDate)
      const e0 = parsePlanDate(task.planEndDate)
      if (s0 && e0) return

      const dropDay = startOfDay(new Date(args.start))
      const endExclusive = toExclusiveEnd(dropDay)
      const stub: CalEvent = {
        title: taskDisplayLabel(task, '—'),
        start: dropDay,
        end: endExclusive,
        resource: task,
        allDay: true,
      }
      await persistFromInteraction(stub, dropDay, endExclusive)
    },
    [onUpdatePlanDates, persistFromInteraction, taskById]
  )

  const rbcMessages = useMemo(
    () => ({
      date: messages.day,
      day: messages.day,
      agenda: messages.agenda,
      month: messages.month,
      week: messages.week,
      today: messages.today,
      previous: messages.previous,
      next: messages.next,
    }),
    [messages]
  )

  const eventPropGetter = useMemo(() => {
    return (ev: CalEvent, _start: Date, _end: Date, _isSel: boolean) => {
      const sty = taskStatusBarStyle(statusColorMap?.[ev.resource.status])
      if (!sty) return {}
      /* Agenda: style lên <tr> — chỉ set biến CSS, nền/viền status áp vào cột Giờ + Event (không tô cột Ngày). */
      if (viewRef.current === 'agenda') {
        return {
          style: {
            ['--cal-agenda-row-bg' as string]: String(sty.backgroundColor ?? 'transparent'),
            ['--cal-agenda-row-bd' as string]: String(sty.borderColor ?? 'transparent'),
          },
        }
      }
      return {
        style: { ...sty, borderRadius: 4 },
      }
    }
  }, [statusColorMap])

  const selectableComponents = useMemo(() => {
    if (!onToggleTaskSelect) return undefined
    return {
      event: (p: EventProps<CalEvent>) => {
        const ce = p.event
        const ms = (ce.resource.type ?? 'bug') === 'milestone'
        const bulkSelectLabel = taskDisplayLabel(ce.resource, '—')
        const bulkSelectAria =
          ce.resource.title?.trim() || ce.resource.ticketId?.trim()
            ? `Bulk select: ${bulkSelectLabel}`
            : 'Bulk select'
        return (
          <div className="flex min-h-[1.35em] min-w-0 items-start gap-1 overflow-hidden py-0.5">
            {!ms && onToggleTaskSelect ? (
              <Checkbox
                className="mt-0.5 h-4 w-4 shrink-0"
                checked={selectedTaskIds?.has(ce.resource.id) ?? false}
                onCheckedChange={() => onToggleTaskSelect(ce.resource.id)}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
                aria-label={bulkSelectAria}
              />
            ) : null}
            <button
              type="button"
              className="min-w-0 flex-1 cursor-pointer truncate rounded-sm text-left text-xs leading-snug"
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation()
                onSelectTask(ce.resource)
              }}
            >
              {ce.title || '—'}
            </button>
          </div>
        )
      },
    }
  }, [selectedTaskIds, onToggleTaskSelect, onSelectTask])

  const calendarComponents = useMemo(() => {
    const Toolbar = (props: {
      label: string
      view: string
      views: string[]
      onView: (v: string) => void
      onNavigate: (action: string, d?: Date) => void
      localizer: { messages: Record<string, string> }
    }) => <TaskCalendarToolbar {...props} toolbarViewLabel={messages.toolbarViewLabel} />
    const TimeGutterHeader = () => {
      const aria = allDaySectionCollapsed ? messages.allDayExpandAria : messages.allDayCollapseAria
      const textLabel = allDaySectionCollapsed ? messages.allDayExpandLabel : messages.allDayCollapseLabel
      return (
        <div className="flex h-full min-h-8 w-full items-stretch justify-center py-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="group h-auto min-h-0 w-full max-w-full shrink-0 flex-col gap-0.5 px-0.5 py-1 text-muted-foreground hover:text-foreground"
            aria-expanded={!allDaySectionCollapsed}
            title={aria}
            aria-label={aria}
            onClick={() => setAllDaySectionCollapsed(c => !c)}
          >
            {allDaySectionCollapsed ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />}
            <span className="max-w-full text-center text-[10px] font-medium leading-tight text-muted-foreground group-hover:text-foreground">{textLabel}</span>
          </Button>
        </div>
      )
    }
    const base = { toolbar: Toolbar, timeGutterHeader: TimeGutterHeader }
    return selectableComponents ? { ...base, ...selectableComponents } : base
  }, [
    allDaySectionCollapsed,
    messages.allDayCollapseAria,
    messages.allDayCollapseLabel,
    messages.allDayExpandAria,
    messages.allDayExpandLabel,
    messages.toolbarViewLabel,
    selectableComponents,
  ])

  return (
    <div
      ref={calendarShellRef}
      className={`task-management-calendar flex min-h-0 min-w-0 w-full flex-1 flex-col gap-3${allDaySectionCollapsed ? ' task-cal-allday-collapsed' : ''}`}
      style={{ ['--task-cal-time-gutter-px' as string]: `${TIME_GUTTER_WIDTH_PX}px` }}
    >
      <style>{`
        .task-management-calendar .rbc-calendar { min-height: min(520px, 58vh); }

        .task-management-calendar .rbc-time-header-gutter,
        .task-management-calendar .rbc-time-content > .rbc-time-gutter {
          width: var(--task-cal-time-gutter-px) !important;
          min-width: var(--task-cal-time-gutter-px) !important;
          max-width: var(--task-cal-time-gutter-px) !important;
          flex: 0 0 var(--task-cal-time-gutter-px) !important;
          box-sizing: border-box;
        }

        /*
         * Week/Day: thu gọn khối all-day có transition (RBC mặc height:100% trên .rbc-allday-cell → gỡ để max-height hoạt động).
         */
        .task-management-calendar .rbc-time-view .rbc-time-header-content > .rbc-allday-cell {
          height: auto !important;
          min-height: 0 !important;
          flex-shrink: 1;
          max-height: min(90vh, 800px);
          overflow: hidden;
          opacity: 1;
          transition:
            max-height 0.32s cubic-bezier(0.4, 0, 0.2, 1),
            opacity 0.24s ease,
            padding-block 0.24s ease,
            border-width 0.2s ease;
        }
        .task-management-calendar.task-cal-allday-collapsed .rbc-time-header-content > .rbc-allday-cell {
          max-height: 0 !important;
          opacity: 0;
          padding-block: 0 !important;
          pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .task-management-calendar .rbc-time-view .rbc-time-header-content > .rbc-allday-cell {
            transition-duration: 0.01ms !important;
          }
        }

        /* Lưới + chữ: token theme (oklch), không dùng hsl(var(...)) */
        .task-management-calendar .rbc-month-view,
        .task-management-calendar .rbc-time-view {
          border: 1px solid var(--border);
        }
        .task-management-calendar .rbc-header {
          font-size: 12px;
          line-height: 1.2;
          padding: 6px 4px;
          font-weight: 600;
          background: color-mix(in oklab, var(--muted) 52%, transparent);
          color: var(--muted-foreground);
          border-bottom: 1px solid var(--border);
        }
        .task-management-calendar .rbc-header + .rbc-header {
          border-left: 1px solid var(--border);
        }
        .task-management-calendar .rbc-rtl .rbc-header + .rbc-header {
          border-left: none;
          border-right: 1px solid var(--border);
        }
        .task-management-calendar .rbc-day-bg + .rbc-day-bg {
          border-left: 1px solid var(--border);
        }
        .task-management-calendar .rbc-rtl .rbc-day-bg + .rbc-day-bg {
          border-left: none;
          border-right: 1px solid var(--border);
        }
        .task-management-calendar .rbc-month-row + .rbc-month-row {
          border-top: 1px solid var(--border);
        }
        .task-management-calendar .rbc-off-range { color: var(--muted-foreground); }
        .task-management-calendar .rbc-off-range-bg {
          background: color-mix(in oklab, var(--muted) 12%, transparent);
        }
        .task-management-calendar .rbc-date-cell,
        .task-management-calendar .rbc-date-cell > a {
          color: var(--foreground);
        }

        .task-management-calendar .rbc-today {
          background: color-mix(in oklab, var(--accent) 22%, transparent);
        }

        /* Event nằm trên lưới — tránh viền ô đè lên thanh task */
        .task-management-calendar .rbc-month-view .rbc-row-bg { z-index: 0; }
        .task-management-calendar .rbc-month-view .rbc-row-content { z-index: 5; }
        .task-management-calendar .rbc-month-view .rbc-event {
          position: relative;
          z-index: 1;
        }
        /*
         * Month: RBC đo chiều cao event bằng dummy (không có checkbox bulk-select) → rowLimit hơi lớn,
         * hàng +N more có thể bị cắt bởi .rbc-month-row { overflow:hidden }. Dự phòng + z-index.
         */
        .task-management-calendar .rbc-month-row > .rbc-row-content {
          padding-bottom: 28px;
        }
        .task-management-calendar .rbc-month-view .rbc-row-segment {
          overflow: visible;
        }
        .task-management-calendar .rbc-time-view .rbc-allday-events { z-index: 6; }
        .task-management-calendar .rbc-day-slot .rbc-events-container { z-index: 4; }

        .task-management-calendar .rbc-event {
          font-size: 12px;
          line-height: 1.3;
          padding: 3px 6px;
          min-height: 1.75em;
          border-radius: calc(var(--radius) - 2px);
          border-width: 1px;
          border-style: solid;
        }
        .task-management-calendar .rbc-event:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 1px;
        }
        .task-management-calendar .rbc-event-content { line-height: 1.35; font-size: 12px; }

        /* +N more… — dark/light */
        .task-management-calendar .rbc-show-more {
          position: relative;
          z-index: 12;
          font-weight: 600;
          font-size: 11px;
          line-height: 1.3;
          height: auto;
          padding: 2px 4px;
          margin-top: 1px;
          border-radius: calc(var(--radius) - 4px);
          color: var(--primary);
          background: color-mix(in oklab, var(--primary) 14%, transparent);
        }
        .task-management-calendar .rbc-show-more:hover,
        .task-management-calendar .rbc-show-more:focus {
          color: var(--foreground);
          background: color-mix(in oklab, var(--primary) 26%, transparent);
        }

        .task-management-calendar .rbc-overlay {
          border: 1px solid var(--border);
          background: var(--popover);
          color: var(--popover-foreground);
          box-shadow: 0 8px 28px color-mix(in oklab, var(--foreground) 18%, transparent);
        }
        .task-management-calendar .rbc-overlay-header {
          border-bottom: 1px solid var(--border);
          color: var(--foreground);
        }

        /* Agenda: viền thống nhất var(--border); cột Ngày không nền status; Giờ + Event nền/viền accent từ biến --cal-agenda-* trên <tr> */
        .task-management-calendar .rbc-agenda-view table.rbc-agenda-table {
          font-size: 12px;
          border: 1px solid var(--border);
          border-collapse: collapse;
        }
        .task-management-calendar .rbc-agenda-view table.rbc-agenda-table thead > tr > th {
          font-size: 12px;
          font-weight: 600;
          padding: 8px 10px;
          color: var(--foreground);
          background: color-mix(in oklab, var(--muted) 40%, transparent);
          border-bottom: 1px solid var(--border);
        }
        .task-management-calendar .rbc-agenda-view table.rbc-agenda-table thead > tr > th + th {
          border-inline-start: 1px solid var(--border);
        }
        .task-management-calendar .rbc-agenda-view table.rbc-agenda-table tbody > tr > td {
          padding: 8px 10px;
          font-size: 12px;
          color: var(--foreground);
          vertical-align: top;
          border-top: 1px solid var(--border);
        }
        .task-management-calendar .rbc-agenda-view table.rbc-agenda-table tbody > tr:first-child > td {
          border-top: none;
        }
        .task-management-calendar .rbc-agenda-view table.rbc-agenda-table tbody > tr > td.rbc-agenda-date-cell {
          background: transparent !important;
          color: inherit;
          border-inline-end: 1px solid var(--border);
          box-shadow: none;
        }
        .task-management-calendar .rbc-agenda-view table.rbc-agenda-table tbody > tr > td.rbc-agenda-time-cell,
        .task-management-calendar .rbc-agenda-view table.rbc-agenda-table tbody > tr > td.rbc-agenda-event-cell {
          background: var(--cal-agenda-row-bg, transparent);
        }
        .task-management-calendar .rbc-agenda-view table.rbc-agenda-table tbody > tr > td.rbc-agenda-event-cell {
          box-shadow: inset 3px 0 0 0 var(--cal-agenda-row-bd, transparent);
        }
        .task-management-calendar .rbc-agenda-view table.rbc-agenda-table tbody > tr > td.rbc-agenda-date-cell + td.rbc-agenda-time-cell {
          border-inline-start: 1px solid var(--border);
        }
        .task-management-calendar .rbc-agenda-view table.rbc-agenda-table tbody > tr > td.rbc-agenda-time-cell + td.rbc-agenda-event-cell {
          border-inline-start: 1px solid var(--border);
        }
        .task-management-calendar .rbc-agenda-view table.rbc-agenda-table tbody > tr > td.rbc-agenda-time-cell:first-child {
          border-inline-start: none;
        }
        .task-management-calendar .rbc-agenda-view table.rbc-agenda-table tbody > tr > td.rbc-agenda-time-cell:first-child + td.rbc-agenda-event-cell {
          border-inline-start: 1px solid var(--border);
        }

        .task-management-calendar .rbc-time-view .rbc-time-header > .rbc-row:first-child,
        .task-management-calendar .rbc-time-view .rbc-time-header > .rbc-row.rbc-row-resource {
          border-bottom: 1px solid var(--border);
        }
        .task-management-calendar .rbc-time-view .rbc-time-header-content {
          border-left: 1px solid var(--border);
        }
        .task-management-calendar .rbc-time-view .rbc-allday-cell + .rbc-allday-cell {
          border-left: 1px solid var(--border);
        }
        /* RBC .rbc-row-bg mặc right: 1px — nền cột All-day hẹp hơn header → chỉnh right: 0. */
        .task-management-calendar .rbc-time-view .rbc-allday-cell .rbc-row-bg {
          right: 0 !important;
        }
        .task-management-calendar .rbc-time-header.rbc-overflowing {
          border-right: 1px solid var(--border);
        }
        /*
         Vùng .rbc-time-content: scrollbar được đo vào --task-cal-measured-vscrollbar-px.
         Khi không .rbc-overflowing, TimeGrid không gán margin inline → margin bù scrollbarSize − 1.
         */
        .task-management-calendar .rbc-time-view > .rbc-time-header:not(.rbc-overflowing) {
          margin-inline-end: max(0px, calc(var(--task-cal-measured-vscrollbar-px, 0px) - 1px));
        }
        .task-management-calendar .rbc-time-content {
          overflow-y: scroll;
          overflow-anchor: none;
          border-top: 1px solid var(--border);
        }
        .task-management-calendar .rbc-time-content > * + * > * {
          border-left: 1px solid var(--border);
        }
        .task-management-calendar .rbc-timeslot-group {
          border-bottom: 1px solid var(--border);
        }
        .task-management-calendar .rbc-time-slot {
          border-top: 1px solid color-mix(in oklab, var(--border) 45%, transparent);
        }
        .task-management-calendar .rbc-time-gutter,
        .task-management-calendar .rbc-time-header-gutter {
          background: var(--background);
          color: var(--muted-foreground);
          font-size: 11px;
        }
        .task-management-calendar .rbc-label { font-size: 11px; }

        .task-management-calendar .rbc-addons-dnd .rbc-addons-dnd-resize-ns-anchor,
        .task-management-calendar .rbc-addons-dnd-resize-ns-icon { display: none; }
      `}</style>

      <div className="min-h-0 min-w-0 flex-1 rounded-md bg-card p-2 overflow-x-hidden overflow-y-auto">
        <DragCalendar
          localizer={localizer}
          culture={culture}
          date={calendarDate}
          width={TIME_GUTTER_WIDTH_PX}
          onNavigate={(d: Date) => setCalendarDate(startOfDay(d))}
          events={events}
          startAccessor={(e: object) => (e as CalEvent).start}
          endAccessor={(e: object) => (e as CalEvent).end}
          view={view}
          onView={(next: RbcView) => {
            if (next === 'month' || next === 'week' || next === 'day' || next === 'agenda') setView(next)
          }}
          messages={rbcMessages}
          allDayAccessor={(e: object) => Boolean((e as CalEvent).allDay)}
          onSelectEvent={(calEvent: object) => {
            const ce = calEvent as CalEvent
            onSelectTask(ce.resource)
          }}
          views={['month', 'week', 'day', 'agenda']}
          selectable
          draggableAccessor={canEditPlans ? () => true : () => false}
          resizableAccessor={canEditPlans ? () => true : () => false}
          resizable={canEditPlans}
          onEventDrop={(x: unknown) => void handleEventDrop(x as { event: object; start: Date; end: Date })}
          onEventResize={(x: unknown) => void handleEventResize(x as { event: object; start: Date; end: Date })}
          onDragOver={canEditPlans ? handleCalendarDragOver : undefined}
          onDropFromOutside={canEditPlans ? (x: unknown) => void handleDropFromOutside(x as { start: Date | string; end: Date | string; allDay: boolean }) : undefined}
          tooltipAccessor={(calEvent: object) => taskDisplayLabel((calEvent as CalEvent).resource, '')}
          components={calendarComponents}
          eventPropGetter={eventPropGetter}
        />
      </div>

      {unscheduled.length > 0 ? (
        <div className="flex min-h-0 max-h-[min(40vh,18rem)] flex-col rounded-md border border-border/60 bg-muted/10 p-2 sm:p-3">
          <div className="mb-2 flex min-w-0 flex-col gap-2 sm:mb-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0 shrink text-[10px] font-semibold text-muted-foreground sm:text-[11px]">
              {unscheduledLabel} <span className="tabular-nums">({unscheduled.length})</span>
            </div>
            {!disableUnschedGrouping ? (
              <ToggleGroup
                type="single"
                value={unschedGrouping}
                onValueChange={v => v && setUnschedGrouping(v as TaskBoardRowGrouping)}
                variant="outline"
                size="sm"
                className="w-full justify-start gap-px sm:w-auto"
              >
                <ToggleGroupItem
                  value="flat"
                  className="h-8 flex-1 px-2 sm:flex-none"
                  title={t('taskManagement.ganttGroupingFlat')}
                  aria-label={t('taskManagement.ganttGroupingFlat')}
                >
                  <Layers className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{t('taskManagement.ganttGroupingFlat')}</span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="assignee"
                  className="h-8 flex-1 px-2 sm:flex-none"
                  title={t('taskManagement.ganttGroupingByAssignee')}
                  aria-label={t('taskManagement.ganttGroupingByAssignee')}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{t('taskManagement.ganttGroupingByAssignee')}</span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="project"
                  className="h-8 flex-1 px-2 sm:flex-none"
                  title={t('taskManagement.ganttGroupingByProject')}
                  aria-label={t('taskManagement.ganttGroupingByProject')}
                >
                  <Briefcase className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{t('taskManagement.ganttGroupingByProject')}</span>
                </ToggleGroupItem>
              </ToggleGroup>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-ms-overflow-style:auto] [scrollbar-gutter:stable] sm:pr-0.5">
            <div className="flex flex-col gap-3 sm:gap-3.5">
              {unscheduledGroups.map(group => {
                const hasHeader = Boolean(group.title)
                const groupExpanded = !hasHeader || !collapsedUnschedGroupSegmentKeys.has(group.segmentKey)
                const groupBulkIds = group.tasks.filter(isTaskBulkSelectable).map(t => t.id)
                return (
                  <div key={group.segmentKey} className="min-w-0">
                    {hasHeader ? (
                      <div className="mb-1.5 flex min-h-[28px] min-w-0 items-center gap-1.5 border-b border-border/50 bg-muted px-2 sm:mb-2">
                        <button
                          type="button"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm hover:bg-muted/80"
                          onClick={() => toggleUnschedGroupCollapsed(group.segmentKey)}
                          aria-expanded={groupExpanded}
                          aria-label={groupExpanded ? t('taskManagement.ganttCollapseGroupSection') : t('taskManagement.ganttExpandGroupSection')}
                        >
                          {groupExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/90 sm:text-[11px]">{group.title}</span>
                        {onToggleTaskSelect && onApplyBulkTaskSelection && groupBulkIds.length > 0 ? (
                          <Checkbox
                            className="h-4 w-4 shrink-0"
                            checked={groupBulkIds.every(id => selectedTaskIds?.has(id)) ? true : groupBulkIds.some(id => selectedTaskIds?.has(id)) ? 'indeterminate' : false}
                            onCheckedChange={v => onApplyBulkTaskSelection(groupBulkIds, v === true)}
                            onClick={e => e.stopPropagation()}
                            aria-label={t('taskManagement.ganttBulkSelectGroupAria', { group: group.title })}
                          />
                        ) : null}
                      </div>
                    ) : null}
                    {groupExpanded ? (
                      <ul className="grid grid-cols-1 gap-1 pb-0.5 min-[420px]:grid-cols-2 min-[420px]:gap-1.5 min-[640px]:grid-cols-3 min-[880px]:grid-cols-4 min-[1120px]:grid-cols-5 min-[1440px]:grid-cols-6">
                        {group.tasks.map(task => {
                          const sh = statusColorMap?.[task.status]?.trim()
                          return (
                            <li
                              key={task.id}
                              draggable={canEditPlans}
                              onDragStart={
                                canEditPlans
                                  ? e => {
                                    e.dataTransfer.setData(PLAN_UNSCHED_TASK_DRAG_MIME, task.id)
                                    e.dataTransfer.setData('text/plain', task.id)
                                    e.dataTransfer.effectAllowed = 'copyMove'
                                    draggingUnschedTaskIdRef.current = task.id
                                  }
                                  : undefined
                              }
                              onDragEnd={canEditPlans ? () => (draggingUnschedTaskIdRef.current = null) : undefined}
                              className={cn(
                                'flex min-h-9 w-full min-w-0 items-center gap-1.5 rounded-md border border-border/80 bg-background/60 px-1.5 py-1 shadow-sm transition-colors hover:bg-muted/40 sm:min-h-8 sm:gap-2 sm:px-2 sm:py-1.5',
                                canEditPlans && 'cursor-grab active:cursor-grabbing'
                              )}
                            >
                              <div
                                className="w-1 shrink-0 self-stretch rounded-sm min-h-[1.35rem] sm:min-h-[1.25rem]"
                                style={{ backgroundColor: sh || 'hsl(var(--primary))' }}
                                aria-hidden
                              />
                              {onToggleTaskSelect && (task.type ?? 'bug') !== 'milestone' ? (
                                <Checkbox
                                  className="h-4 w-4 shrink-0"
                                  checked={selectedTaskIds?.has(task.id) ?? false}
                                  onCheckedChange={() => onToggleTaskSelect(task.id)}
                                  onClick={e => e.stopPropagation()}
                                  aria-label={
                                    task.title?.trim() || task.ticketId?.trim()
                                      ? `Bulk select: ${taskDisplayLabel(task, '—')}`
                                      : 'Bulk select'
                                  }
                                />
                              ) : null}
                              <button
                                type="button"
                                className="min-w-0 flex-1 truncate text-left text-[10px] leading-tight hover:bg-muted/50 sm:text-[11px]"
                                onClick={() => onSelectTask(task)}
                              >
                                {taskDisplayLabel(task, '—')}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
