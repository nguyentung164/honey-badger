'use client'

import { addDays, format, getDay, parse, startOfDay, startOfWeek } from 'date-fns'
import { enUS, ja, vi } from 'date-fns/locale'
import { type ComponentType, useCallback, useMemo, useRef, useState } from 'react'
import { Calendar, dateFnsLocalizer, type EventProps, Navigate, type View as RbcView } from 'react-big-calendar'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { TaskTableRowTask } from './TaskTableRow'
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
}) {
  const culture = pickCulture(language?.split('-')[0] ?? 'en')
  const canEditPlans = Boolean(onUpdatePlanDates)

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
        title: t.title || '—',
        start,
        end: toExclusiveEnd(endIncl),
        resource: t,
        allDay: true,
      })
    }
    return { events: ev, unscheduled: un }
  }, [tasks])

  const [view, setView] = useState<'month' | 'week' | 'day' | 'agenda'>('month')
  const [calendarDate, setCalendarDate] = useState(() => startOfDay(new Date()))
  /** Week/Day: thu gọn hàng all-day để nhìn rõ lưới giờ phía dưới */
  const [allDaySectionCollapsed, setAllDaySectionCollapsed] = useState(false)
  const viewRef = useRef(view)
  viewRef.current = view

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
        return (
          <div className="flex min-h-[1.35em] min-w-0 items-start gap-1 overflow-hidden py-0.5">
            <Checkbox
              className="mt-0.5 h-4 w-4 shrink-0"
              checked={selectedTaskIds?.has(ce.resource.id) ?? false}
              onCheckedChange={() => onToggleTaskSelect(ce.resource.id)}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              aria-label={ce.resource.title ? `Bulk select: ${ce.resource.title}` : 'Bulk select'}
            />
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
        /*
         * Vùng scroll giờ: RBC dùng overflow-y:auto + TimeGrid checkOverflow → margin header đổi theo scrollbar.
         * scrollbar-gutter:stable + auto dễ gây “dật” khi chuyển Week/Day. Dùng scroll luôn + overflow-anchor để ổn định.
         */
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

      <div className="min-h-0 min-w-0 flex-1 rounded-md border border-border/70 bg-card p-1.5 overflow-auto">
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
          tooltipAccessor={(calEvent: object) => (calEvent as CalEvent).resource.title ?? ''}
          components={calendarComponents}
          eventPropGetter={eventPropGetter}
        />
      </div>

      {unscheduled.length > 0 ? (
        <div className="flex min-h-0 max-h-[min(40vh,18rem)] flex-col rounded-md border border-border/60 bg-muted/10 p-3">
          <div className="mb-2 shrink-0 text-xs font-semibold text-muted-foreground">
            {unscheduledLabel} ({unscheduled.length})
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [-ms-overflow-style:auto] [scrollbar-gutter:stable]">
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
                    <button type="button" className="text-xs hover:bg-muted/60 max-w-full min-w-0 sm:max-w-[220px] truncate text-left" onClick={() => onSelectTask(t)}>
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
  )
}
