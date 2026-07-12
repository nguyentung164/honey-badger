'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import type { Locale } from 'date-fns'
import { addDays, addMonths, differenceInCalendarDays, format, getDay, getISOWeek, startOfDay, startOfMonth } from 'date-fns'
import { enUS } from 'date-fns/locale'
import type { TFunction } from 'i18next'
import { Briefcase, ChevronDown, ChevronRight, ChevronsRight, FoldVertical, Layers, Loader2, UnfoldVertical, Users } from 'lucide-react'
import type { CSSProperties, DragEvent, ReactNode, RefObject, UIEvent } from 'react'
import { Activity, lazy, memo, Suspense, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { ShellTabActiveProps } from 'shared/shellTabTypes'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { parseLocalDate, toYyyyMmDd } from '@/lib/dateUtils'
import { workingDaysBetweenInclusive } from '@/lib/evmCalculations'
import { cn, getProgressColor } from '@/lib/utils'
import { GanttTimelineGridOverlay } from './GanttTimelineGridOverlay'
import { GANTT_LEADING_FIXED_W, GANTT_LEFT_META_FIXED_W, HB_GANTT_GRID_V_VAR, HB_GANTT_NAME_W_VAR, HB_GANTT_TODAY_LINE_MARK, hbGantt, hbGanttRootStyle } from './ganttLayoutCssVars'
import { PLAN_UNSCHED_TASK_DRAG_MIME } from './planUnschedTaskDragMime'
import { isTaskBulkSelectable, type TaskTableRowTask, taskDisplayLabel } from './TaskTableRow'
import {
  bucketTasksByGroup,
  loadTaskBoardRowGrouping,
  loadUnschedCollapsedSegments,
  saveTaskBoardRowGrouping,
  saveUnschedCollapsedSegments,
  type TaskBoardRowGrouping,
} from './taskBoardGroupBuckets'
import { WORKLOAD_EXPANDED_MINI_MAX_SCROLL_PX } from './taskGanttWorkloadConstants'
import type { WorkloadBoardSegment, WorkloadDisplayMode, WorkloadOverrideUpsertInput } from './taskGanttWorkloadTypes'
import { Z_GANTT_META_RAIL_FLOATING_TOGGLE, Z_GANTT_STICKY_TOP_HEADER } from './taskGanttZIndex'
import { taskStatusBarParentFillStyle, taskStatusBarStyle } from './taskStatusVisual'
import { WorkloadGanttPaneRailControlStack } from './WorkloadGanttPaneRailControlStack'

const TaskGanttWorkloadLazy = lazy(async () => {
  const m = await import('./TaskGanttWorkload')
  return { default: m.TaskGanttWorkload }
})

export type TaskGanttScale = 'week' | 'month' | 'monthly'

/** Layout của board Gantt: chỉ timeline, chỉ workload, hoặc split (cả hai). */
export type TaskGanttLayoutMode = 'gantt' | 'workload' | 'combine'

export type GanttTaskLink = {
  id: string
  fromTaskId: string
  toTaskId: string
  linkType: string
}

export type TaskGanttViewLabels = {
  week: string
  month: string
  monthly: string
  unscheduled: string
  zoom: string
  /** Toolbar — nhãn nhóm cho Timeline / Workload / Both (trước Zoom). */
  layoutModeGroup?: string
  /** Toolbar — chế độ bố cục (trước Zoom). */
  layoutTimeline: string
  layoutWorkload: string
  layoutBoth: string
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
  /** Tooltip prefix cho milestone */
  milestoneLabel?: string
  /** Switch — hiện thanh actual (thực tế) dưới thanh plan */
  actualBarsSwitch?: string
  actualBarsHelp?: string
  /** Tooltip thanh actual (tiền tố trước khoảng ngày) */
  actualBarRangeTitle?: string
  /** Gợi ý tooltip khi thanh actual lệch so với plan */
  actualBarHintLateStart?: string
  actualBarHintLateFinish?: string
  actualBarHintLateBoth?: string
  actualBarHintEarly?: string
  actualBarHintOntime?: string
}

const LS_GANTT_LABEL_W = 'honey_badger.taskGantt.labelWidth.v1'
const LS_GANTT_GRID_BORDERS = 'honey_badger.taskGantt.gridBorders.v1'
const LS_GANTT_ACTUAL_BARS = 'honey_badger.taskGantt.showActualBars.v1'
const LS_GANTT_EXPANDED_PARENTS = 'honey_badger.taskGantt.expandedParents.v1'
/** segmentKey của nhóm By Assignee / By Project đang thu gọn (ẩn các task trong nhóm). */
const LS_GANTT_COLLAPSED_GROUP_SEGMENTS = 'honey_badger.taskGantt.collapsedGroupSegments.v1'
const LS_GANTT_META_RAIL_EXPANDED = 'honey_badger.taskGantt.metaRailExpanded.v1'
const LS_GANTT_WORKLOAD_SPLIT = 'honey_badger.taskGantt.workloadSplitShare.v1'
const LS_GANTT_LAYOUT_MODE = 'honey_badger.taskGantt.layoutMode.v1'
/** Phần chiều cao dành cho khối Gantt khi Workload hiển thị (0–1). */
const DEFAULT_GANTT_WORKLOAD_SPLIT = 0.7
const MIN_GANTT_WORKLOAD_SPLIT = 0.22
const MAX_GANTT_WORKLOAD_SPLIT = 0.9
const DEFAULT_GANTT_LABEL_W = 216
const MIN_GANTT_LABEL_W = 160
const MAX_GANTT_LABEL_W = 520

/** Row height in px — matches Tailwind min-h-[36px] on every task/milestone row. */
const GANTT_ROW_H = 36
/** Khoảng cách từ đáy hàng tới đường ngang vòng dependency (backward/overlap) — luôn vòng phía dưới bar. */
const _GANTT_DEP_BELOW_PAD = 10
/** Group segment header height in px — matches min-h-[28px] on segment title rows. */
const GROUP_HEADER_H = 28

function ganttProgressClamped(progress: number | undefined): number {
  return Math.min(100, Math.max(0, Number(progress ?? 0)))
}

function ganttProgressPercentDisplay(progress: number | undefined): string {
  return `${Math.round(ganttProgressClamped(progress))}%`
}

/** Vòng gauge tiến độ (cung theo %) — màu cung dùng `getProgressColor` giống slider trong AddOrEditTaskDialog. */
function GanttProgressGauge({ progress }: { progress: number | undefined }) {
  const clamped = ganttProgressClamped(progress)
  const pct = Math.round(clamped)
  const ratio = clamped / 100
  const arcColor = getProgressColor(ratio)
  const size = 14
  const stroke = 2
  const r = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const dashOffset = circumference - ratio * circumference

  return (
    <span className="inline-flex min-w-0 items-center justify-start gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill="none" className="stroke-muted-foreground/30" strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={arcColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <span className="truncate text-xs text-muted-foreground">{pct}%</span>
    </span>
  )
}

/** Viền dọc giữa các cột meta — cùng token với Workload (`border-border/50`). */
const GANTT_META_COL_DIVIDER = 'border-r border-border/50'
/**
 * Vạch lưới dọc timeline — header và body chart **phải** dùng chung (cùng `w-px` + màu).
 * Trước đây header dùng outline/`w-0` nên Chromium căn khác body → lệch ~1px ngang.
 */

/** Dải cột meta (TASK TITLE, …) phải trên thanh meta body (45) khi scroll dọc, nhưng dưới `Popover`/`z-50` (DateRange, filter) — tránh lịch/tooltip bị chìm. */
const Z_GANTT_STICKY_BODY_LEFT_RAIL = 35
const Z_GANTT_STICKY_ROW_META_FULL = 30
/**
 * Toàn bộ hàng (meta sticky + chart) phải trên `GanttBodyChartLayers` lưới dọc (`z-[1]`).
 * Nếu để `z-index: auto`, Chromium đôi khi composite lớp lưới lên trên `transform-gpu` của hàng → vạch timeline lộ lên cột đầu khi scroll ngang.
 */
const Z_GANTT_BODY_ROWS = 5
/**
 * SVG dependency — phải **dưới** `Z_GANTT_BODY_ROWS` để path/stroke/marker không đè cột frozen
 * (lớp chart absolute đôi khi composite chồng mép sticky). Vẫn trên lưới (`z-[1]`).
 */
const Z_GANTT_BODY_DEPENDENCIES = 3
/** Đường Today trên chart — giữ trên hàng để dễ nhìn trên bar rỗng. */
const Z_GANTT_BODY_TODAY = 5

/** Stable empty array — tránh `Array.from()` mỗi render trong renderGanttVirtualRowSlice, ngăn phá memo GanttTaskRow. */
const EMPTY_NON_WORKING: string[] = []

type GanttRowGrouping = TaskBoardRowGrouping

/** full: một hàng meta+chart (workload mini). meta|chart: chỉ một nửa — dùng trong layout 2 cột để overlay timeline không đè sticky meta. */
export type GanttRowSegment = 'full' | 'meta' | 'chart'

/** px / ngày — giảm dần = zoom xa (xem phạm vi dài hơn). */
function ganttPixelPerDay(scale: TaskGanttScale): number {
  switch (scale) {
    case 'week':
      return 40
    case 'month':
      return 16
    case 'monthly':
      return 8
    default:
      return 40
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

function loadGanttShowActualBars(): boolean {
  try {
    if (typeof window === 'undefined') return true
    const v = window.localStorage.getItem(LS_GANTT_ACTUAL_BARS)
    if (v === null) return true
    return v === '1'
  } catch {
    return true
  }
}

function saveGanttShowActualBars(on: boolean) {
  try {
    window.localStorage.setItem(LS_GANTT_ACTUAL_BARS, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function loadExpandedParents(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_GANTT_EXPANDED_PARENTS)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set((arr as unknown[]).filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function saveExpandedParents(ids: Set<string>) {
  try {
    localStorage.setItem(LS_GANTT_EXPANDED_PARENTS, JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
}

function loadCollapsedGroupSegments(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_GANTT_COLLAPSED_GROUP_SEGMENTS)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set((arr as unknown[]).filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function saveCollapsedGroupSegments(ids: Set<string>) {
  try {
    localStorage.setItem(LS_GANTT_COLLAPSED_GROUP_SEGMENTS, JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
}

function loadMetaRailExpanded(): boolean {
  try {
    if (typeof window === 'undefined') return true
    const v = window.localStorage.getItem(LS_GANTT_META_RAIL_EXPANDED)
    if (v === null) return true
    return v === '1'
  } catch {
    return true
  }
}

function saveMetaRailExpanded(expanded: boolean) {
  try {
    window.localStorage.setItem(LS_GANTT_META_RAIL_EXPANDED, expanded ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function loadGanttWorkloadSplitShare(): number {
  try {
    const raw = localStorage.getItem(LS_GANTT_WORKLOAD_SPLIT)
    if (!raw) return DEFAULT_GANTT_WORKLOAD_SPLIT
    const n = Number(JSON.parse(raw) as unknown)
    if (!Number.isFinite(n)) return DEFAULT_GANTT_WORKLOAD_SPLIT
    return Math.min(MAX_GANTT_WORKLOAD_SPLIT, Math.max(MIN_GANTT_WORKLOAD_SPLIT, n))
  } catch {
    return DEFAULT_GANTT_WORKLOAD_SPLIT
  }
}

function saveGanttWorkloadSplitShare(v: number) {
  try {
    localStorage.setItem(LS_GANTT_WORKLOAD_SPLIT, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

function loadTaskGanttLayoutMode(): TaskGanttLayoutMode {
  try {
    const raw = localStorage.getItem(LS_GANTT_LAYOUT_MODE)
    if (!raw) return 'combine'
    const v = JSON.parse(raw) as string
    if (v === 'gantt' || v === 'workload' || v === 'combine') return v
  } catch {
    /* ignore */
  }
  return 'combine'
}

function saveTaskGanttLayoutMode(mode: TaskGanttLayoutMode) {
  try {
    localStorage.setItem(LS_GANTT_LAYOUT_MODE, JSON.stringify(mode))
  } catch {
    /* ignore */
  }
}

function bucketGanttScheduled(
  scheduled: TaskTableRowTask[],
  mode: GanttRowGrouping,
  getAssigneeDisplay?: (id: string | null) => string
): { segmentKey: string; title: string; tasks: TaskTableRowTask[] }[] {
  return bucketTasksByGroup(scheduled, mode, getAssigneeDisplay, 'planStart')
}

const HEADER_H = 40

function ganttUiLang(language: string | undefined): 'en' | 'vi' | 'ja' {
  const base = (language ?? 'en').toLowerCase().split('-')[0]
  if (base === 'vi') return 'vi'
  if (base === 'ja') return 'ja'
  return 'en'
}

/** Chỉ dùng cho flash viền (trang trí); điều hướng timeline dùng `scrollTo({ behavior: 'auto' })` để tránh spam scroll trong animation. */
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

/** Trạng thái kết thúc — không kéo actual đến “hôm nay”. */
function ganttStatusTerminalForActualBar(status: string | undefined): boolean {
  const s = (status ?? '').trim()
  return s === 'done' || s === 'fixed' || s === 'cancelled'
}

/**
 * Khoảng ngày thực tế để vẽ thanh actual.
 * - Có cả start/end: min–max theo lịch.
 * - Chỉ end: một ngày tại end.
 * - Chỉ start: nếu terminal → một ngày; không thì start → hôm nay (startOfDay).
 */
function resolveGanttActualBarDayRange(task: TaskTableRowTask): { start: Date; end: Date } | null {
  const aS = parsePlanDate(task.actualStartDate)
  const aE = parsePlanDate(task.actualEndDate)
  const today = startOfDay(new Date())

  if (aS && aE) {
    const lo = aS <= aE ? aS : aE
    const hi = aS <= aE ? aE : aS
    return { start: lo, end: hi }
  }
  if (aS && !aE) {
    if (ganttStatusTerminalForActualBar(task.status)) {
      return { start: aS, end: aS }
    }
    const end = today < aS ? aS : today
    return { start: aS, end }
  }
  if (!aS && aE) {
    return { start: aE, end: aE }
  }
  return null
}

/** Có actual start nhưng chưa có actual end và task chưa terminal — mép phải thanh là «đến hôm nay», chưa phải ngày hoàn thành. */
function ganttActualBarHasProvisionalEnd(task: TaskTableRowTask): boolean {
  if (ganttStatusTerminalForActualBar(task.status)) return false
  const aS = parsePlanDate(task.actualStartDate)
  const aE = parsePlanDate(task.actualEndDate)
  return Boolean(aS && !aE)
}

type GanttActualBarTone = 'late_start' | 'late_finish' | 'late_both' | 'early' | 'on_time'

/** Chênh lệch ngày làm việc (NETWORKDAYS): + = muộn hơn mốc kế hoạch, 0 = trùng ngày, − = sớm hơn. */
function ganttSignedWorkingDayDelta(planDay: Date, actualDay: Date, nonWorking: string[]): number {
  const p = startOfDay(planDay)
  const a = startOfDay(actualDay)
  if (a.getTime() === p.getTime()) return 0
  if (a.getTime() > p.getTime()) {
    return workingDaysBetweenInclusive(addDays(p, 1), a, nonWorking)
  }
  return -workingDaysBetweenInclusive(addDays(a, 1), p, nonWorking)
}

/**
 * So với plan (ngày làm việc): tách trễ bắt đầu / trễ kết thúc / cả hai; ưu tiên báo trễ deadline (`late_finish`) khi chỉ một mốc trễ kết thúc.
 */
function ganttActualBarWorkingVariance(
  planStart: Date,
  planEnd: Date,
  actual: { start: Date; end: Date },
  nonWorking: string[]
): { startDelta: number; endDelta: number; tone: GanttActualBarTone } {
  const startDelta = ganttSignedWorkingDayDelta(planStart, actual.start, nonWorking)
  const endDelta = ganttSignedWorkingDayDelta(planEnd, actual.end, nonWorking)
  const lateStart = startDelta > 0
  const lateFinish = endDelta > 0
  let tone: GanttActualBarTone
  if (lateStart && lateFinish) tone = 'late_both'
  else if (lateFinish) tone = 'late_finish'
  else if (lateStart) tone = 'late_start'
  else if (startDelta < 0 || endDelta < 0) tone = 'early'
  else tone = 'on_time'
  return { startDelta, endDelta, tone }
}

function ganttActualBarVarianceDayLinesFromDeltas(t: TFunction, startDelta: number, endDelta: number): string[] {
  const startLine =
    startDelta > 0
      ? t('taskManagement.ganttActualVarStartLate', { count: startDelta })
      : startDelta < 0
        ? t('taskManagement.ganttActualVarStartEarly', { count: -startDelta })
        : t('taskManagement.ganttActualVarStartOnPlan')
  const endLine =
    endDelta > 0
      ? t('taskManagement.ganttActualVarEndLate', { count: endDelta })
      : endDelta < 0
        ? t('taskManagement.ganttActualVarEndEarly', { count: -endDelta })
        : t('taskManagement.ganttActualVarEndOnPlan')
  return [startLine, endLine]
}

function ganttActualBarStripSurfaceClass(tone: GanttActualBarTone): string {
  switch (tone) {
    case 'late_both':
      return 'border-rose-950/40 bg-rose-700/93 dark:border-rose-200/35 dark:bg-rose-600/90'
    case 'late_finish':
      return 'border-rose-900/32 bg-rose-600/91 dark:border-rose-300/28 dark:bg-rose-500/86'
    case 'late_start':
      return 'border-amber-950/35 bg-amber-600/90 dark:border-amber-300/28 dark:bg-amber-500/85'
    case 'early':
      return 'border-emerald-900/22 bg-emerald-500/78 dark:border-emerald-300/18 dark:bg-emerald-400/74'
    default:
      return 'border-emerald-900/30 bg-emerald-600/88 dark:border-emerald-300/22 dark:bg-emerald-500/82'
  }
}

function calendarSpanInclusive(a: Date, b: Date): number {
  return Math.max(1, differenceInCalendarDays(startOfDay(b), startOfDay(a)) + 1)
}

function ganttChartDayIndexFromClientX(
  clientX: number,
  scrollEl: HTMLDivElement,
  leftBlockWidth: number,
  pixelPerDay: number,
  chartWidth: number,
  totalDays: number
): number | null {
  const rect = scrollEl.getBoundingClientRect()
  const xInContent = clientX - rect.left + scrollEl.scrollLeft
  const xChart = xInContent - leftBlockWidth
  if (xChart < 0 || xChart > chartWidth) return null
  const idx = Math.floor(xChart / pixelPerDay)
  return Math.max(0, Math.min(totalDays - 1, idx))
}

/**
 * Trục X chart: cạnh trái = 0, rộng = totalDays * pixelPerDay.
 * - Day (scale week): lưới mỗi ngày.
 * - Week columns (scale month): lưới theo cột 7 ngày (trùng tick), không mỗi ngày.
 * - Month (monthly): lưới theo đầu tháng (trùng tick), thêm mép trái/phải.
 */
function ganttVerticalGridLeftPx(scale: TaskGanttScale, start: Date, totalDays: number, pixelPerDay: number): number[] {
  const chartW = totalDays * pixelPerDay
  const s0 = startOfDay(start)
  const acc = new Set<number>()

  if (scale === 'week') {
    for (let i = 0; i <= totalDays; i++) {
      acc.add(i * pixelPerDay)
    }
    return Array.from(acc).sort((a, b) => a - b)
  }

  if (scale === 'month') {
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

/** Cột theo lịch (Thứ 7 / CN) — trục X: left = dayIndex * pixelPerDay. */
function ganttWeekendColumnRects(start: Date, totalDays: number, pixelPerDay: number): { left: number; width: number }[] {
  const s0 = startOfDay(start)
  const rects: { left: number; width: number }[] = []
  for (let i = 0; i < totalDays; i++) {
    const dow = getDay(addDays(s0, i))
    if (dow === 0 || dow === 6) {
      rects.push({ left: i * pixelPerDay, width: pixelPerDay })
    }
  }
  return rects
}

/**
 * Map parentId → danh sách con (chỉ task có parent nằm trong `allTasks`).
 * Dùng toàn bộ board tasks để parent có chevron kể cả khi con chưa có plan dates.
 */
function buildChildrenMapFromAllTasks(allTasks: TaskTableRowTask[]): Map<string, TaskTableRowTask[]> {
  const idSet = new Set(allTasks.map(t => t.id))
  const childrenMap = new Map<string, TaskTableRowTask[]>()
  for (const t of allTasks) {
    const pid = t.parentId
    if (!pid || !idSet.has(pid)) continue
    const arr = childrenMap.get(pid) ?? []
    arr.push(t)
    childrenMap.set(pid, arr)
  }
  for (const [pid, children] of childrenMap) {
    childrenMap.set(
      pid,
      children.slice().sort((a, b) => {
        const pa = parsePlanDate(a.planStartDate)?.getTime() ?? 0
        const pb = parsePlanDate(b.planStartDate)?.getTime() ?? 0
        return pa - pb
      })
    )
  }
  return childrenMap
}

function taskMatchesGanttScheduledGroup(child: TaskTableRowTask, sample: TaskTableRowTask | undefined, mode: GanttRowGrouping): boolean {
  if (mode === 'flat' || !sample) return true
  if (mode === 'assignee') {
    const ca = (child.assigneeUserId ?? '').trim()
    const sa = (sample.assigneeUserId ?? '').trim()
    const ck = ca !== '' ? ca : '_none'
    const sk = sa !== '' ? sa : '_none'
    return ck === sk
  }
  const cp = (child.projectId ?? '').trim()
  const sp = (sample.projectId ?? '').trim()
  const ck = cp !== '' ? cp : '_none'
  const sk = sp !== '' ? sp : '_none'
  return ck === sk
}

/** Task có đủ dữ liệu để vẽ trên trục thời gian Gantt (bar hoặc milestone). */
function isTaskScheduledForGantt(t: TaskTableRowTask): boolean {
  const s = parsePlanDate(t.planStartDate)
  const e = parsePlanDate(t.planEndDate)
  if (t.type === 'milestone') return Boolean(s)
  return Boolean(s && e)
}

/** Một dòng “phẳng” cho virtualizer (trùng thứ tự với render cũ: header nhóm → task gốc → con mở rộng). */
export type GanttVirtualFlatRow =
  | { kind: 'groupHeader'; key: string; segmentKey: string; title: string; groupBodyVisible: boolean }
  | {
    kind: 'dataRow'
    key: string
    task: TaskTableRowTask
    indentLevel: number
    hasChildren: boolean
    isExpanded: boolean
    subtaskNoPlanHint: string
    /** `null`: milestone (không đánh số) hoặc sub-task khi parent không có No. */
    displayNo: string | null
  }

function buildGanttVirtualFlatRows(
  groupTrees: {
    segmentKey: string
    title?: string | null
    tree: { roots: TaskTableRowTask[]; childrenMap: Map<string, TaskTableRowTask[]> }
  }[],
  collapsedGroupSegmentKeys: Set<string>,
  expandedParentIds: Set<string>,
  subtaskNoPlanHint: string
): GanttVirtualFlatRow[] {
  const rows: GanttVirtualFlatRow[] = []
  let rootSeq = 0
  for (const group of groupTrees) {
    const groupBodyVisible = !group.title || !collapsedGroupSegmentKeys.has(group.segmentKey)
    if (group.title) {
      rows.push({
        kind: 'groupHeader',
        key: `gh:${group.segmentKey}`,
        segmentKey: group.segmentKey,
        title: group.title,
        groupBodyVisible,
      })
    }
    if (!groupBodyVisible) continue
    const { roots, childrenMap } = group.tree
    for (const task of roots) {
      const children = childrenMap.get(task.id) ?? []
      const hasChildren = children.length > 0
      const isExpanded = hasChildren && expandedParentIds.has(task.id)
      const visibleChildren = isExpanded ? children : []
      const rootIsMilestone = task.type === 'milestone'
      let rootDisplayNo: string | null = null
      if (!rootIsMilestone) {
        rootSeq += 1
        rootDisplayNo = String(rootSeq)
      }
      rows.push({
        kind: 'dataRow',
        key: `tr:${task.id}`,
        task,
        indentLevel: 0,
        hasChildren,
        isExpanded,
        subtaskNoPlanHint,
        displayNo: rootDisplayNo,
      })
      let childOrd = 0
      for (const child of visibleChildren) {
        const childIsMilestone = child.type === 'milestone'
        let displayNo: string | null = null
        if (!childIsMilestone && rootDisplayNo != null) {
          childOrd += 1
          displayNo = `${rootDisplayNo}.${childOrd}`
        }
        rows.push({
          kind: 'dataRow',
          key: `tr:${child.id}`,
          task: child,
          indentLevel: 1,
          hasChildren: false,
          isExpanded: false,
          subtaskNoPlanHint,
          displayNo,
        })
      }
    }
  }
  return rows
}

export type GanttVirtualSliceStableCtx = {
  /** Khớp header: khi thu rail meta, ô Task title là ô cuối — không `border-r` trùng mép timeline. */
  metaRailExpanded: boolean
  chartWidth: number
  start: Date
  pixelPerDay: number
  weekendColumnRects: { left: number; width: number }[]
  /** Ngày nghỉ theo project (khớp workload / NETWORKDAYS) — key = `projectId`. */
  planNonWorkingByProjectId: ReadonlyMap<string, readonly string[]>
  statusColorMap?: Record<string, string>
  /** `selectedTaskIds` đã tách ra khỏi sliceStable — truyền trực tiếp qua GanttVirtualRowsPane → isSelected boolean per row. */
  onToggleTaskSelect?: (taskId: string) => void
  onOpenTaskById: (taskId: string) => void
  onUpdatePlanDates?: (taskId: string, planStartDate: string, planEndDate: string, version?: number) => Promise<boolean>
  getAssigneeDisplay?: (assigneeUserId: string | null) => string
  getStatusLabel: (status: string) => string
  getPriorityLabel: (priority: string) => string
  getStatusIcon: (status: string) => ReactNode
  getPriorityIcon: (priority: string) => ReactNode
  getStatusToneClass: (code: string) => string
  getPriorityToneClass: (code: string) => string
  /** Màu chip priority (master data) — khớp TaskManagement / bảng task. */
  priorityColorMap?: Record<string, string>
  getBadgeStyle?: (code: string, colorMap: Record<string, string>) => CSSProperties | undefined
  locale: Locale
  milestoneLabel?: string
  toggleGroupSegmentCollapsed: (segmentKey: string) => void
  toggleExpand: (taskId: string) => void
  t: TFunction
}

/** Viền dưới hàng Gantt: `showGridBorders === undefined` → theo `data-gantt-grid` trên sheet (group). */
function ganttRowSheetBorderClasses(showGridBorders: boolean | undefined, rowSelected: boolean, omitBottom = false) {
  if (omitBottom) {
    if (showGridBorders === true) {
      return rowSelected ? 'bg-primary/[0.09] dark:bg-primary/12' : 'bg-transparent'
    }
    if (showGridBorders === false) {
      return !rowSelected ? 'bg-transparent' : undefined
    }
    return cn(
      rowSelected
        ? 'group-data-[gantt-grid=on]/ganttGridShell:bg-primary/[0.09] dark:group-data-[gantt-grid=on]/ganttGridShell:bg-primary/12'
        : 'group-data-[gantt-grid=on]/ganttGridShell:bg-transparent'
    )
  }
  if (showGridBorders === true) {
    return cn('border-b border-b-border/60', rowSelected ? 'bg-primary/[0.09] dark:bg-primary/12' : 'bg-transparent')
  }
  if (showGridBorders === false) {
    return !rowSelected ? cn('border-b border-b-border/[0.12]', 'bg-transparent') : undefined
  }
  return cn(
    !rowSelected && cn('border-b border-b-border/[0.12]', 'bg-transparent'),
    'group-data-[gantt-grid=on]/ganttGridShell:border-b-border/60',
    rowSelected
      ? 'group-data-[gantt-grid=on]/ganttGridShell:bg-primary/[0.09] dark:group-data-[gantt-grid=on]/ganttGridShell:bg-primary/12'
      : 'group-data-[gantt-grid=on]/ganttGridShell:bg-transparent'
  )
}

/** Cờ / tooltip actual — tách khỏi `sliceStable`; không gồm lưới ngang (lưới dọc timeline + viền hàng theo CSS var / `data-gantt-grid`). */
export type GanttVirtualRowActualChrome = {
  showActualBars: boolean
  actualBarRangeTitle?: string
  actualBarHintLateStart?: string
  actualBarHintLateFinish?: string
  actualBarHintLateBoth?: string
  actualBarHintEarly?: string
  actualBarHintOntime?: string
}

/** Ref mini workload: actual + viền hàng explicit (không có ancestor `group/ganttGridShell`). */
export type GanttVirtualRowChromePrefs = GanttVirtualRowActualChrome & {
  showGridBorders: boolean
  scale: TaskGanttScale
  verticalGridLineLeftPx: number[]
  /** Khớp workload Hours/Tasks: lưới dọc timeline mini-Gantt chỉ khi Hours. */
  workloadDisplayMode: WorkloadDisplayMode
}

function renderGanttVirtualRowSlice(
  flatRow: GanttVirtualFlatRow,
  stable: GanttVirtualSliceStableCtx,
  actualChrome: GanttVirtualRowActualChrome,
  isSelected: boolean
): { meta: ReactNode; chart: ReactNode } {
  if (flatRow.kind === 'groupHeader') {
    const expanded = flatRow.groupBodyVisible
    const meta = (
      <div
        className={cn(
          'flex h-full w-full min-h-0 shrink-0 flex-row items-center gap-1.5 border-b border-border/50 bg-muted px-2 border-r',
          'group-data-[gantt-grid=on]/ganttGridShell:border-b-border/60'
        )}
        style={hbGantt.leftBlock}
      >
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm hover:bg-muted/80"
          onClick={() => stable.toggleGroupSegmentCollapsed(flatRow.segmentKey)}
          aria-expanded={expanded}
          aria-label={expanded ? stable.t('taskManagement.ganttCollapseGroupSection') : stable.t('taskManagement.ganttExpandGroupSection')}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-muted-foreground">{flatRow.title}</span>
      </div>
    )
    const chart = (
      <div
        className={cn('h-full w-full shrink-0 border-b border-border/25 bg-muted', 'group-data-[gantt-grid=on]/ganttGridShell:border-b-border/60')}
        style={{ width: stable.chartWidth }}
        aria-hidden
      />
    )
    return { meta, chart }
  }

  const displayNo = flatRow.displayNo
  const taskProps = {
    metaRailExpanded: stable.metaRailExpanded,
    task: flatRow.task,
    start: stable.start,
    pixelPerDay: stable.pixelPerDay,
    chartWidth: stable.chartWidth,
    weekendColumnRects: stable.weekendColumnRects,
    statusColorMap: stable.statusColorMap,
    isSelected,
    onToggleTaskSelect: stable.onToggleTaskSelect,
    onOpenTaskById: stable.onOpenTaskById,
    getAssigneeDisplay: stable.getAssigneeDisplay,
    getStatusLabel: stable.getStatusLabel,
    getPriorityLabel: stable.getPriorityLabel,
    getStatusIcon: stable.getStatusIcon,
    getPriorityIcon: stable.getPriorityIcon,
    getStatusToneClass: stable.getStatusToneClass,
    getPriorityToneClass: stable.getPriorityToneClass,
    priorityColorMap: stable.priorityColorMap,
    getBadgeStyle: stable.getBadgeStyle,
    planNonWorkingDatesForTask: (stable.planNonWorkingByProjectId.get((flatRow.task.projectId ?? '').trim()) as string[] | undefined) ?? EMPTY_NON_WORKING,
    showActualBars: actualChrome.showActualBars,
    locale: stable.locale,
    actualBarRangeTitle: actualChrome.actualBarRangeTitle,
    actualBarHintLateStart: actualChrome.actualBarHintLateStart,
    actualBarHintLateFinish: actualChrome.actualBarHintLateFinish,
    actualBarHintLateBoth: actualChrome.actualBarHintLateBoth,
    actualBarHintEarly: actualChrome.actualBarHintEarly,
    actualBarHintOntime: actualChrome.actualBarHintOntime,
    indentLevel: flatRow.indentLevel,
    hasChildren: flatRow.hasChildren,
    isExpanded: flatRow.isExpanded,
    onToggleExpand: stable.toggleExpand,
    displayNo,
  }

  if (!isTaskScheduledForGantt(flatRow.task)) {
    const unschedBase = {
      metaRailExpanded: stable.metaRailExpanded,
      task: flatRow.task,
      chartWidth: stable.chartWidth,
      isSelected,
      onToggleTaskSelect: stable.onToggleTaskSelect,
      onOpenTaskById: stable.onOpenTaskById,
      getAssigneeDisplay: stable.getAssigneeDisplay,
      getStatusLabel: stable.getStatusLabel,
      getPriorityLabel: stable.getPriorityLabel,
      getStatusIcon: stable.getStatusIcon,
      getPriorityIcon: stable.getPriorityIcon,
      getStatusToneClass: stable.getStatusToneClass,
      getPriorityToneClass: stable.getPriorityToneClass,
      priorityColorMap: stable.priorityColorMap,
      noPlanHint: flatRow.subtaskNoPlanHint,
      indentLevel: flatRow.indentLevel,
      displayNo,
    }
    return {
      meta: <GanttUnscheduledSubtaskRow {...unschedBase} rowSegment="meta" />,
      chart: <GanttUnscheduledSubtaskRow {...unschedBase} rowSegment="chart" />,
    }
  }

  if (flatRow.task.type === 'milestone') {
    return {
      meta: (
        <GanttMilestoneRow
          task={flatRow.task}
          start={stable.start}
          pixelPerDay={stable.pixelPerDay}
          chartWidth={stable.chartWidth}
          weekendColumnRects={stable.weekendColumnRects}
          isSelected={isSelected}
          onOpenTaskById={stable.onOpenTaskById}
          milestoneLabel={stable.milestoneLabel}
          indentLevel={flatRow.indentLevel}
          hasChildren={flatRow.hasChildren}
          isExpanded={flatRow.isExpanded}
          onToggleExpand={stable.toggleExpand}
          rowSegment="meta"
        />
      ),
      chart: (
        <GanttMilestoneRow
          task={flatRow.task}
          start={stable.start}
          pixelPerDay={stable.pixelPerDay}
          chartWidth={stable.chartWidth}
          weekendColumnRects={stable.weekendColumnRects}
          isSelected={isSelected}
          onOpenTaskById={stable.onOpenTaskById}
          milestoneLabel={stable.milestoneLabel}
          indentLevel={flatRow.indentLevel}
          hasChildren={flatRow.hasChildren}
          isExpanded={flatRow.isExpanded}
          onToggleExpand={stable.toggleExpand}
          rowSegment="chart"
        />
      ),
    }
  }

  return {
    meta: <GanttTaskRow {...taskProps} onUpdatePlanDates={stable.onUpdatePlanDates} rowSegment="meta" />,
    chart: <GanttTaskRow {...taskProps} onUpdatePlanDates={stable.onUpdatePlanDates} rowSegment="chart" />,
  }
}

/** Band cuối tuần + lưới + today + SVG dependency — tách khỏi `TaskGanttView` để cuộn dọc không re-render (virtualizer nằm trong con). */
type GanttBodyChartLayersProps = {
  chartWidth: number
  totalBodyPx: number
  scale: TaskGanttScale
  pixelPerDay: number
  weekendColumnRects: { left: number; width: number }[]
  verticalGridLineLeftPx: number[]
  showTodayLine: boolean
  todayPxCenter: number
  todayMark: string
  arrowPaths: { id: string; d: string }[]
}

const GanttBodyChartLayers = memo(function GanttBodyChartLayers({
  chartWidth,
  totalBodyPx,
  scale,
  pixelPerDay,
  weekendColumnRects,
  verticalGridLineLeftPx,
  showTodayLine,
  todayPxCenter,
  todayMark,
  arrowPaths,
}: GanttBodyChartLayersProps) {
  return (
    <>
      {/* `sticky left-0` — không dùng absolute: cuộn ngang sheet thì vạch frozen không trôi theo nội dung */}
      <div
        aria-hidden
        className="pointer-events-none sticky left-0 top-0 z-[2] shrink-0 flex-1 isolate transform-gpu border-r border-border/50 bg-background"
        style={{
          ...hbGantt.leftBlock,
          minHeight: totalBodyPx,
          alignSelf: 'flex-start',
        }}
      />
      <div aria-hidden className="pointer-events-none absolute top-0 z-0 overflow-hidden" style={{ ...hbGantt.chartAreaFromMetaRail(chartWidth), top: 0, bottom: 0 }}>
        {weekendColumnRects.map((r, i) => (
          <div
            key={`gantt-chart-col-wk-${r.left}-${i}`}
            className="absolute top-0 bottom-0 bg-slate-500/[0.11] dark:bg-slate-400/[0.05]"
            style={{ left: r.left, width: r.width }}
          />
        ))}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 z-[1] overflow-hidden"
        style={{
          ...hbGantt.chartAreaFromMetaRail(chartWidth),
          top: 0,
          bottom: 0,
          opacity: `var(${HB_GANTT_GRID_V_VAR}, 0)`,
        }}
      >
        <GanttTimelineGridOverlay scale={scale} pixelPerDay={pixelPerDay} chartWidth={chartWidth} verticalGridLineLeftPx={verticalGridLineLeftPx} />
      </div>
      {arrowPaths.length > 0 ? (
        <div
          className="pointer-events-none absolute top-0 overflow-hidden"
          style={{ ...hbGantt.chartAreaFromMetaRail(chartWidth), height: totalBodyPx, zIndex: Z_GANTT_BODY_DEPENDENCIES }}
          aria-hidden
        >
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden text-primary/70 dark:text-primary/80" aria-hidden>
            <defs>
              <marker id="gantt-dep-arrow" markerWidth="6" markerHeight="6" refX="5.2" refY="3" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                <path d="M 0.35,0.35 L 5.65,3 L 0.35,5.65 z" fill="currentColor" stroke="currentColor" strokeWidth={0.35} strokeLinejoin="round" />
              </marker>
            </defs>
            {arrowPaths.map(p => (
              <path
                key={p.id}
                d={p.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={0.85}
                strokeLinecap="butt"
                strokeLinejoin="miter"
                strokeMiterlimit={2}
                shapeRendering="optimizeSpeed"
                markerEnd="url(#gantt-dep-arrow)"
              />
            ))}
          </svg>
        </div>
      ) : null}
      {showTodayLine ? (
        <div
          className="pointer-events-none absolute top-0 overflow-hidden"
          style={{ ...hbGantt.chartAreaFromMetaRail(chartWidth), height: totalBodyPx, zIndex: Z_GANTT_BODY_TODAY }}
          aria-hidden
        >
          <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: chartWidth }}>
            <div className={HB_GANTT_TODAY_LINE_MARK} style={{ left: todayPxCenter }} title={todayMark} />
          </div>
        </div>
      ) : null}
    </>
  )
})

/**
 * Virtualizer **phải** nằm trong component nhỏ: cuộn dọc chỉ re-render các hàng visible,
 * không kéo theo toàn bộ `TaskGanttView` (toolbar, header, workload, …).
 * Không dùng `measureElement`: mọi hàng có chiều cao cố định (GROUP_HEADER_H / GANTT_ROW_H).
 */
type GanttVirtualRowsPaneProps = {
  scrollRef: RefObject<HTMLDivElement | null>
  flatRows: GanttVirtualFlatRow[]
  sliceStable: GanttVirtualSliceStableCtx
  rowActualChrome: GanttVirtualRowActualChrome
  chartWidth: number
  /** Đổi khi mode layout board đổi — đo lại viewport scroll thay vì remount + `setState` ở parent. */
  virtualMeasureEpoch: TaskGanttLayoutMode
  /** Truyền trực tiếp — không đi qua sliceStable để tránh invalidate toàn bộ visible rows khi selection thay đổi. */
  selectedTaskIds?: Set<string>
}

/** Mỗi virtual row là một memo component riêng — khi `selectedTaskIds` đổi chỉ 1-2 row có `isSelected` thay đổi re-render. */
type GanttVirtualRowSliceItemProps = {
  flatRow: GanttVirtualFlatRow
  sliceStable: GanttVirtualSliceStableCtx
  rowActualChrome: GanttVirtualRowActualChrome
  chartWidth: number
  isSelected: boolean
  vRowStart: number
  vRowSize: number
}

const GanttVirtualRowSliceItem = memo(function GanttVirtualRowSliceItem({
  flatRow,
  sliceStable,
  rowActualChrome,
  chartWidth,
  isSelected,
  vRowStart,
  vRowSize,
}: GanttVirtualRowSliceItemProps) {
  const { meta, chart } = renderGanttVirtualRowSlice(flatRow, sliceStable, rowActualChrome, isSelected)
  return (
    <div
      className="absolute left-0 flex flex-row items-stretch transform-gpu"
      style={{
        top: vRowStart,
        height: vRowSize,
        zIndex: Z_GANTT_BODY_ROWS,
        ...hbGantt.sheet(chartWidth),
      }}
    >
      <div className="sticky left-0 isolate shrink-0 transform-gpu border-r border-border/50 bg-background" style={{ ...hbGantt.leftBlock, zIndex: Z_GANTT_STICKY_BODY_LEFT_RAIL }}>
        {meta}
      </div>
      <div className="relative shrink-0 overflow-hidden" style={{ width: chartWidth, height: vRowSize }}>
        {chart}
      </div>
    </div>
  )
})

const GanttVirtualRowsPane = memo(function GanttVirtualRowsPane({
  scrollRef,
  flatRows,
  sliceStable,
  rowActualChrome,
  chartWidth,
  virtualMeasureEpoch,
  selectedTaskIds,
}: GanttVirtualRowsPaneProps) {
  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: index => (flatRows[index]?.kind === 'groupHeader' ? GROUP_HEADER_H : GANTT_ROW_H),
    overscan: 5,
    getItemKey: index => flatRows[index]?.key ?? `idx:${index}`,
  })

  useLayoutEffect(() => {
    const v = virtualizer as { measure?: () => void }
    v.measure?.()
  }, [virtualMeasureEpoch])

  return (
    <>
      {virtualizer.getVirtualItems().map(vRow => {
        const flatRow = flatRows[vRow.index]
        if (!flatRow) return null
        const isSelected = flatRow.kind === 'dataRow' ? (selectedTaskIds?.has(flatRow.task.id) ?? false) : false
        return (
          <GanttVirtualRowSliceItem
            key={vRow.key}
            flatRow={flatRow}
            sliceStable={sliceStable}
            rowActualChrome={rowActualChrome}
            chartWidth={chartWidth}
            isSelected={isSelected}
            vRowStart={vRow.start}
            vRowSize={vRow.size}
          />
        )
      })}
    </>
  )
})

/**
 * Sắp xếp lại danh sách tasks theo DFS dependency-first:
 * Nếu A có FS link đến B, B xuất hiện ngay sau A thay vì nằm rải rác.
 * Tasks không có link giữ nguyên thứ tự tương đối (theo planStartDate).
 */
function depSortTasks(tasks: TaskTableRowTask[], links: GanttTaskLink[]): TaskTableRowTask[] {
  if (links.length === 0) return tasks
  const ids = new Set(tasks.map(t => t.id))
  const succ = new Map<string, string[]>()
  for (const link of links) {
    if (!ids.has(link.fromTaskId) || !ids.has(link.toTaskId)) continue
    const arr = succ.get(link.fromTaskId) ?? []
    arr.push(link.toTaskId)
    succ.set(link.fromTaskId, arr)
  }
  const visited = new Set<string>()
  const result: TaskTableRowTask[] = []
  const map = new Map(tasks.map(t => [t.id, t]))
  const visit = (id: string) => {
    if (visited.has(id)) return
    visited.add(id)
    const t = map.get(id)
    if (t) result.push(t)
    for (const s of succ.get(id) ?? []) visit(s)
  }
  for (const t of tasks) visit(t.id)
  return result
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
  onApplyBulkTaskSelection,
  statusColorMap,
  onUpdatePlanDates,
  getAssigneeDisplay,
  getStatusLabel,
  getPriorityLabel,
  getStatusIcon,
  getPriorityIcon,
  getStatusToneClass,
  getPriorityToneClass,
  priorityColorMap,
  getBadgeStyle,
  disableRowGrouping = false,
  workloadSegments = [],
  workloadCapTruncated = null,
  workloadLoading = false,
  onUpsertWorkloadOverride,
  getUserAvatarUrl,
  taskLinks,
  onBoardLayoutEffectiveChange,
  shellTabActive = true,
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
  /** Chọn/bỏ chọn hàng loạt theo danh sách id (vd. header “chọn tất cả” trên Gantt). */
  onApplyBulkTaskSelection?: (taskIds: string[], selected: boolean) => void
  statusColorMap?: Record<string, string>
  onUpdatePlanDates?: (taskId: string, planStartDate: string, planEndDate: string, version?: number) => Promise<boolean>
  getAssigneeDisplay?: (assigneeUserId: string | null) => string
  getStatusLabel: (status: string) => string
  getPriorityLabel: (priority: string) => string
  getStatusIcon: (status: string) => ReactNode
  getPriorityIcon: (priority: string) => ReactNode
  /** Màu chữ + icon (vd. filter status trong TaskManagement — không badge nền). */
  getStatusToneClass: (code: string) => string
  getPriorityToneClass: (code: string) => string
  priorityColorMap?: Record<string, string>
  getBadgeStyle?: (code: string, colorMap: Record<string, string>) => CSSProperties | undefined
  /** Admin / PL / PM — khi false: luôn flat, ẩn nhóm hàng */
  disableRowGrouping?: boolean
  /** Workload theo từng project (mỗi segment một `getWorkload`). */
  workloadSegments?: WorkloadBoardSegment[]
  /** Khi danh sách project bị cắt theo giới hạn an toàn. */
  workloadCapTruncated?: { total: number; shown: number } | null
  workloadLoading?: boolean
  onUpsertWorkloadOverride?: (input: WorkloadOverrideUpsertInput) => Promise<void> | void
  getUserAvatarUrl?: (userId: string) => string | null | undefined
  /** Dependency links giữa các tasks — được load bulk từ server khi Gantt đang active. */
  taskLinks?: GanttTaskLink[]
  /** Báo layout board hiệu lực (sau khi biết có workload hay không) — parent có thể điều chỉnh toolbar. */
  onBoardLayoutEffectiveChange?: (mode: TaskGanttLayoutMode) => void
} & ShellTabActiveProps) {
  const { t } = useTranslation()
  const [scale, setScale] = useState<TaskGanttScale>('week')
  const [tightWindow, setTightWindow] = useState(false)
  const [rowGrouping, setRowGrouping] = useState<GanttRowGrouping>(() => loadTaskBoardRowGrouping())
  const [labelColumnWidth, setLabelColumnWidth] = useState(() => loadGanttLabelWidth())
  const [showGridBorders, setShowGridBorders] = useState(() => loadGanttGridBorders())
  const [showActualBars, setShowActualBars] = useState(() => loadGanttShowActualBars())
  const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(() => loadExpandedParents())
  const [collapsedGroupSegmentKeys, setCollapsedGroupSegmentKeys] = useState<Set<string>>(() => loadCollapsedGroupSegments())
  const [metaRailExpanded, setMetaRailExpanded] = useState(() => loadMetaRailExpanded())
  const [ganttWorkloadSplitShare, setGanttWorkloadSplitShare] = useState(() => loadGanttWorkloadSplitShare())
  const [ganttWorkloadSplitShellH, setGanttWorkloadSplitShellH] = useState(0)
  const [layoutMode, setLayoutMode] = useState<TaskGanttLayoutMode>(() => loadTaskGanttLayoutMode())
  /** Transition — React doc: cập nhật subtree nặng không chặn input (toolbar); không giảm tổng thời gian layout. */
  const [layoutModeTransitionPending, startLayoutModeTransition] = useTransition()
  const pixelPerDay = ganttPixelPerDay(scale)

  const taskNameColumnWidth = labelColumnWidth
  const leftBlockWidth = useMemo(() => GANTT_LEADING_FIXED_W + taskNameColumnWidth + (metaRailExpanded ? GANTT_LEFT_META_FIXED_W : 0), [taskNameColumnWidth, metaRailExpanded])

  const ganttLayoutRootStyle = useMemo(() => hbGanttRootStyle(labelColumnWidth, metaRailExpanded, showGridBorders), [labelColumnWidth, metaRailExpanded, showGridBorders])

  const toggleMetaRail = useCallback(() => {
    setMetaRailExpanded(prev => {
      const next = !prev
      saveMetaRailExpanded(next)
      return next
    })
  }, [])

  const persistGridBorders = useCallback((on: boolean) => {
    saveGanttGridBorders(on)
    startTransition(() => {
      setShowGridBorders(on)
    })
  }, [])

  const persistShowActualBars = useCallback((on: boolean) => {
    saveGanttShowActualBars(on)
    startTransition(() => {
      setShowActualBars(on)
    })
  }, [])

  const toggleExpand = useCallback((taskId: string) => {
    setExpandedParentIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      saveExpandedParents(next)
      return next
    })
  }, [])

  const toggleGroupSegmentCollapsed = useCallback((segmentKey: string) => {
    setCollapsedGroupSegmentKeys(prev => {
      const next = new Set(prev)
      if (next.has(segmentKey)) next.delete(segmentKey)
      else next.add(segmentKey)
      saveCollapsedGroupSegments(next)
      return next
    })
  }, [])

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

  const labelResizeDragRef = useRef<{ pointerId: number; startX: number; startW: number } | null>(null)
  const ganttLayoutRootRef = useRef<HTMLDivElement>(null)

  const groupingEffective: GanttRowGrouping = disableRowGrouping ? 'flat' : rowGrouping

  useEffect(() => {
    if (disableRowGrouping) return
    saveTaskBoardRowGrouping(rowGrouping)
  }, [disableRowGrouping, rowGrouping])

  useEffect(() => {
    saveTaskGanttLayoutMode(layoutMode)
  }, [layoutMode])

  /** Body Gantt: cuộn dọc + ngang; strip timeline translate theo scroll (không dùng overflow-x thứ hai). */
  const ganttScrollRef = useRef<HTMLDivElement>(null)
  /** Bỏ qua handler đồng bộ ngang khi scroll dọc (scrollLeft không đổi) — giảm work mỗi frame. */
  const ganttLastScrollLeftSeenRef = useRef<number | null>(null)
  const ganttWorkloadSplitRef = useRef<HTMLDivElement>(null)
  const ganttWorkloadPaneRef = useRef<HTMLDivElement>(null)
  const ganttWorkloadSplitDragRef = useRef<{ pointerId: number } | null>(null)
  /** Đồng bộ ResizeObserver — không setState shell height khi đang kéo (tránh tranh layout). */
  const ganttWorkloadSplitDraggingRef = useRef(false)
  /** Cache layout shell khi pointerdown — pointermove chỉ dùng clientY + cache (không gọi getBoundingClientRect mỗi event → tránh layout thrashing). */
  const ganttSplitShellLayoutCacheRef = useRef<{ top: number; height: number } | null>(null)
  const ganttSplitDragRafRef = useRef<number | null>(null)
  const ganttSplitDragPendingShareRef = useRef<number | null>(null)
  const splitDragRestoreBodyUserSelectRef = useRef<(() => void) | null>(null)
  const ganttChartIdealHeightPxRef = useRef(96)
  const ganttWorkloadSplitShareRef = useRef<number>(ganttWorkloadSplitShare)
  const workloadScrollRef = useRef<HTMLDivElement>(null)
  const workloadLastScrollLeftSeenRef = useRef<number | null>(null)
  /** Vùng timeline trong header — đồng bộ bằng transform, không scroll mirror. */
  const ganttHeaderTimelineRef = useRef<HTMLDivElement>(null)
  const workloadHeaderTimelineRef = useRef<HTMLDivElement>(null)
  /** Tránh vòng lặp khi mirror scrollLeft giữa hai body + transform header. */
  const syncingHScrollRef = useRef(false)
  /** Offset ngang đã commit (transform + hai body); bỏ qua scroll event trùng offset. */
  const lastCommittedHScrollRef = useRef<number | null>(null)
  const fitScrollGenRef = useRef(0)
  const lastAppliedFitGenRef = useRef(0)
  const scrollToChartPixelRef = useRef<((pixel: number) => void) | null>(null)
  /** Đồng bộ mỗi render từ `ganttRowActualChrome` + `showGridBorders` — `renderMiniGanttForUser` giữ identity ổn định (Workload `memo`). */
  const miniGanttDisplayPrefsRef = useRef<GanttVirtualRowChromePrefs>({
    showGridBorders: true,
    showActualBars: true,
    scale: 'week',
    verticalGridLineLeftPx: [],
    workloadDisplayMode: 'hours',
  })
  const renderMiniGanttForUserRef = useRef<(userId: string, projectId: string | null) => ReactNode>(null)
  const chromeFlashTimeoutRef = useRef(0)
  const shellTabActiveRef = useRef(shellTabActive)
  shellTabActiveRef.current = shellTabActive
  const [timelineChromeFlash, setTimelineChromeFlash] = useState(false)
  /** Đồng bộ Hours/Tasks giữa header và body khi tách hai mount. */
  const [workloadDisplayMode, setWorkloadDisplayMode] = useState<WorkloadDisplayMode>('hours')
  /** Thu project + mở mini-Gantt — một nguồn cho cả header workload và body khi split mount. */
  const [workloadCollapsedProjectIds, setWorkloadCollapsedProjectIds] = useState<Set<string>>(() => new Set())
  const [workloadExpandedRowKeys, setWorkloadExpandedRowKeys] = useState<Set<string>>(() => new Set())

  const onLabelResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      labelResizeDragRef.current = { pointerId: e.pointerId, startX: e.clientX, startW: labelColumnWidth }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [labelColumnWidth]
  )

  const onLabelResizePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const ctx = labelResizeDragRef.current
    if (!ctx || e.pointerId !== ctx.pointerId) return
    const next = Math.min(MAX_GANTT_LABEL_W, Math.max(MIN_GANTT_LABEL_W, Math.round(ctx.startW + (e.clientX - ctx.startX))))
    const root = ganttLayoutRootRef.current
    if (root) root.style.setProperty(HB_GANTT_NAME_W_VAR, `${next}px`)
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
    const next = Math.min(MAX_GANTT_LABEL_W, Math.max(MIN_GANTT_LABEL_W, Math.round(ctx.startW + (e.clientX - ctx.startX))))
    setLabelColumnWidth(next)
    saveGanttLabelWidth(next)
  }, [])

  // Milestone tasks (type === 'milestone') chỉ cần planStartDate để vào scheduled
  const taskById = useMemo(() => {
    const m = new Map<string, TaskTableRowTask>()
    for (const t of tasks) m.set(t.id, t)
    return m
  }, [tasks])

  const openTaskById = useCallback(
    (taskId: string) => {
      const task = taskById.get(taskId)
      if (task) onSelectTask(task)
    },
    [taskById, onSelectTask]
  )

  const { scheduled, unscheduled } = useMemo(() => {
    const sched: TaskTableRowTask[] = []
    const unsched: TaskTableRowTask[] = []
    for (const t of tasks) {
      const s = parsePlanDate(t.planStartDate)
      const e = parsePlanDate(t.planEndDate)
      const isMilestone = t.type === 'milestone'
      if (s && e) sched.push(t)
      else if (isMilestone && s) sched.push(t)
      else unsched.push(t)
    }
    return { scheduled: sched, unscheduled: unsched }
  }, [tasks])

  const unscheduledBulkSelectableIds = useMemo(() => unscheduled.filter(isTaskBulkSelectable).map(t => t.id), [unscheduled])

  const unscheduledGroups = useMemo(() => bucketTasksByGroup(unscheduled, groupingEffective, getAssigneeDisplay, 'title'), [unscheduled, groupingEffective, getAssigneeDisplay])

  const unschedGroupedSegmentKeys = useMemo(
    () => (groupingEffective !== 'flat' ? unscheduledGroups.filter(g => Boolean(g.title)).map(g => g.segmentKey) : []),
    [groupingEffective, unscheduledGroups]
  )

  const scheduledGroups = useMemo(() => bucketGanttScheduled(scheduled, groupingEffective, getAssigneeDisplay), [scheduled, groupingEffective, getAssigneeDisplay])

  /** Con của mỗi task — từ toàn bộ board `tasks`, lọc theo segment khi nhóm hàng. */
  const childrenByParentFull = useMemo(() => buildChildrenMapFromAllTasks(tasks), [tasks])

  const groupTrees = useMemo(() => {
    return scheduledGroups.map(g => {
      const sample = g.tasks[0]
      const idScheduledInGroup = new Set(g.tasks.map(t => t.id))

      // 1. Filter roots (tasks that are not children of another scheduled task in this group)
      // 2. Sort by planStartDate (primary order)
      // 3. Re-sort with DFS dependency-first so linked tasks sit adjacent to each other
      const rootsByDate = g.tasks
        .filter(t => {
          const pid = t.parentId
          if (!pid) return true
          return !idScheduledInGroup.has(pid)
        })
        .sort((a, b) => {
          const pa = parsePlanDate(a.planStartDate)?.getTime() ?? 0
          const pb = parsePlanDate(b.planStartDate)?.getTime() ?? 0
          return pa - pb
        })
      const roots = depSortTasks(rootsByDate, taskLinks ?? [])

      const childrenMap = new Map<string, TaskTableRowTask[]>()
      for (const root of roots) {
        const kids = (childrenByParentFull.get(root.id) ?? []).filter(c => taskMatchesGanttScheduledGroup(c, sample, groupingEffective))
        if (kids.length > 0) childrenMap.set(root.id, kids)
      }
      return { ...g, tree: { roots, childrenMap } }
    })
  }, [scheduledGroups, childrenByParentFull, groupingEffective, taskLinks])

  const scheduledGroupSegmentKeys = useMemo(() => groupTrees.filter(g => Boolean(g.title)).map(g => g.segmentKey), [groupTrees])

  const toggleAllScheduledGroupSegmentsCollapsed = useCallback(() => {
    const keys = groupTrees.filter(g => Boolean(g.title)).map(g => g.segmentKey)
    if (!keys.length) return
    setCollapsedGroupSegmentKeys(prev => {
      const allCollapsed = keys.every(k => prev.has(k))
      const next = new Set(prev)
      if (allCollapsed) {
        for (const k of keys) next.delete(k)
      } else {
        for (const k of keys) next.add(k)
      }
      saveCollapsedGroupSegments(next)
      return next
    })
  }, [groupTrees])

  const toggleAllUnschedGroupSegmentsCollapsed = useCallback(() => {
    if (groupingEffective === 'flat') return
    const keys = unscheduledGroups.filter(g => Boolean(g.title)).map(g => g.segmentKey)
    if (!keys.length) return
    setCollapsedUnschedGroupSegmentKeys(prev => {
      const allCollapsed = keys.every(k => prev.has(k))
      const next = new Set(prev)
      if (allCollapsed) {
        for (const k of keys) next.delete(k)
      } else {
        for (const k of keys) next.add(k)
      }
      saveUnschedCollapsedSegments(next)
      return next
    })
  }, [groupingEffective, unscheduledGroups])

  const allScheduledGroupsCollapsed = useMemo(
    () => scheduledGroupSegmentKeys.length > 0 && scheduledGroupSegmentKeys.every(k => collapsedGroupSegmentKeys.has(k)),
    [collapsedGroupSegmentKeys, scheduledGroupSegmentKeys]
  )

  const allUnschedGroupsCollapsed = useMemo(
    () => unschedGroupedSegmentKeys.length > 0 && unschedGroupedSegmentKeys.every(k => collapsedUnschedGroupSegmentKeys.has(k)),
    [collapsedUnschedGroupSegmentKeys, unschedGroupedSegmentKeys]
  )

  const { start, totalDays } = useMemo(() => {
    let minD: Date | null = null
    let maxD: Date | null = null
    for (const t of scheduled) {
      const s = parsePlanDate(t.planStartDate)
      const e = parsePlanDate(t.planEndDate)
      if (!s) continue
      const effectiveEnd = e ?? s // milestone: dùng start làm end
      const rs = startOfDay(s <= effectiveEnd ? s : effectiveEnd)
      const re = startOfDay(s <= effectiveEnd ? effectiveEnd : s)
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

  const onGanttUnschedDragOverCapture = useCallback(
    (e: DragEvent) => {
      if (!onUpdatePlanDates) return
      const types = e.dataTransfer.types
      if (![...types].includes(PLAN_UNSCHED_TASK_DRAG_MIME)) return
      const scrollEl = ganttScrollRef.current
      if (!scrollEl) return
      const dayIdx = ganttChartDayIndexFromClientX(e.clientX, scrollEl, leftBlockWidth, pixelPerDay, chartWidth, totalDays)
      if (dayIdx === null) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
    },
    [chartWidth, leftBlockWidth, onUpdatePlanDates, pixelPerDay, totalDays]
  )

  const onGanttUnschedDropCapture = useCallback(
    (e: DragEvent) => {
      if (!onUpdatePlanDates) return
      let taskId = e.dataTransfer.getData(PLAN_UNSCHED_TASK_DRAG_MIME)
      if (!taskId) taskId = e.dataTransfer.getData('text/plain')
      taskId = taskId.trim()
      if (!taskId) return
      const scrollEl = ganttScrollRef.current
      if (!scrollEl) return
      const dayIdx = ganttChartDayIndexFromClientX(e.clientX, scrollEl, leftBlockWidth, pixelPerDay, chartWidth, totalDays)
      if (dayIdx === null) return
      const task = taskById.get(taskId)
      if (!task) return
      const s0 = parsePlanDate(task.planStartDate)
      const e0 = parsePlanDate(task.planEndDate)
      const isMilestone = task.type === 'milestone'
      if (s0 && e0) return
      if (isMilestone && s0) return
      e.preventDefault()
      e.stopPropagation()
      const dropDay = startOfDay(addDays(start, dayIdx))
      const ps = toYyyyMmDd(dropDay)
      if (!ps) return
      const pe = ps
      void onUpdatePlanDates(task.id, ps, pe, task.version)
    },
    [chartWidth, leftBlockWidth, onUpdatePlanDates, pixelPerDay, start, taskById, totalDays]
  )

  const workloadDataAvailable = workloadLoading === true || workloadSegments.length > 0
  const layoutModeEffective: TaskGanttLayoutMode = !workloadDataAvailable ? 'gantt' : layoutMode
  const showCombineSplit = layoutModeEffective === 'combine' && workloadDataAvailable
  const showGanttMain = layoutModeEffective !== 'workload'
  const showWorkloadBlock = layoutModeEffective !== 'gantt' && workloadDataAvailable
  /** Bảng workload có segment thật: header cố định ngoài overflow-y (không sticky dọc → hết lệch subpixel Chrome). */
  const workloadSplitScroll = Boolean(workloadDataAvailable && workloadSegments.length > 0)
  const toolbarLayoutValue: TaskGanttLayoutMode = workloadDataAvailable ? layoutMode : 'gantt'

  useEffect(() => {
    onBoardLayoutEffectiveChange?.(layoutModeEffective)
  }, [layoutModeEffective, onBoardLayoutEffectiveChange])

  const tickMarks = useMemo(() => {
    const raw: { d: Date; left: number; line1: string; line2?: string }[] = []
    const uiLang = ganttUiLang(language)
    const chartW = totalDays * pixelPerDay

    if (scale === 'monthly') {
      const endExclusive = addDays(start, totalDays)
      for (let d = startOfMonth(start); d < endExclusive; d = addMonths(d, 1)) {
        const dayIndex = differenceInCalendarDays(d, start)
        if (dayIndex < 0 || dayIndex > totalDays) continue
        const line1 = uiLang === 'ja' ? format(d, 'yyyy/MM', { locale }) : format(d, 'MM/yyyy', { locale })
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

  const verticalGridLeftPx = useMemo(() => ganttVerticalGridLeftPx(scale, start, totalDays, pixelPerDay), [scale, start, totalDays, pixelPerDay])
  /** Vạch dọc trong timeline: không vẽ tại left=0 — mép trái chart đã có `border-r` khối meta (không đôi vạch với Workload). */
  const verticalGridLineLeftPx = useMemo(() => verticalGridLeftPx.filter(left => left > 0), [verticalGridLeftPx])

  const weekendColumnRects = useMemo(() => ganttWeekendColumnRects(start, totalDays, pixelPerDay), [start, totalDays, pixelPerDay])

  const ganttVirtualFlatRows = useMemo(
    () => buildGanttVirtualFlatRows(groupTrees, collapsedGroupSegmentKeys, expandedParentIds, t('taskManagement.ganttSubtaskNoPlanDates')),
    [groupTrees, collapsedGroupSegmentKeys, expandedParentIds, t]
  )

  const ganttScheduledBulkSelectableIds = useMemo(() => {
    const ids: string[] = []
    for (const row of ganttVirtualFlatRows) {
      if (row.kind === 'dataRow' && isTaskBulkSelectable(row.task)) ids.push(row.task.id)
    }
    return ids
  }, [ganttVirtualFlatRows])

  /**
   * Map từ taskId → top pixel offset tính từ đầu chart body (không kể HEADER_H).
   * Dùng để tính vị trí Y cho dependency arrows — đồng bộ với `ganttVirtualFlatRows`.
   */
  const { taskRowTopPx, ganttBodyScrollHeightPx } = useMemo(() => {
    const map = new Map<string, number>()
    let px = 0
    for (const row of ganttVirtualFlatRows) {
      if (row.kind === 'groupHeader') {
        px += GROUP_HEADER_H
      } else {
        map.set(row.task.id, px)
        px += GANTT_ROW_H
      }
    }
    return { taskRowTopPx: map, ganttBodyScrollHeightPx: px }
  }, [ganttVirtualFlatRows])

  const ganttChartIdealHeightPx = useMemo(() => {
    if (scheduled.length === 0) return 96
    return HEADER_H + ganttBodyScrollHeightPx
  }, [scheduled.length, ganttBodyScrollHeightPx])

  ganttChartIdealHeightPxRef.current = ganttChartIdealHeightPx

  /**
   * Tính SVG path cho dependency arrows (Finish-to-Start).
   *
   * Xuất phát từ trung điểm cạnh PHẢI của bar predecessor,
   * kết thúc tại trung điểm cạnh TRÁI của bar successor.
   *
   * Bảng sweep-flag (screen coords y-down, verified với Frappe Gantt):
   *   CW  sweep=1 : right→down, down→left, left→up,   up→right
   *   CCW sweep=0 : right→up,   down→right, left→down, up→left
   *
   * Ba chiến lược routing:
   *
   * 1) Forward (horiGap > FWD_MIN) — successor ở cùng hàng: đường ngang.
   * 2) Forward — successor ở hàng khác: L-elbow 2 góc bo qua midX.
   *    Đi right → arc → vertical → arc → right đến successor.
   * 3) Backward / tight (horiGap ≤ FWD_MIN) — successor ở DƯỚI predecessor:
   *    Sử dụng lane nằm ngay dưới predecessor (giữa 2 hàng), path:
   *    right→ arc(R→D) →down→ arc(D→L) →left-in-lane→ arc(L→D) →down→ arc(D→R)
   *    Đây là path người dùng mô tả: đi xuống → vòng trái → xuống → vào trái task 2.
   * 4) Backward / tight — cùng hàng hoặc successor ở TRÊN:
   *    U-shape đi xuống dưới predecessor rồi vòng lên:
   *    right→ arc(R→D) →down→ arc(D→L) →left→ arc(L→U) →up→ arc(U→R)
   */
  const arrowPaths = useMemo(() => {
    if (!taskLinks || taskLinks.length === 0) return []
    const taskMap = new Map(scheduled.map(t => [t.id, t]))

    const R = 3 // corner arc radius px
    const JOG = 12 // right jog from predecessor before turning down
    const JOG_LEFT = 12 // left jog past successor before turning toward it
    const LANE_PAD = 0 // px gap below predecessor row for the inter-row lane
    const FWD_MIN = 5 // min forward horizontal gap to use L-elbow; below → U-shape

    return taskLinks.flatMap(link => {
      const from = taskMap.get(link.fromTaskId)
      const to = taskMap.get(link.toTaskId)
      if (!from || !to) return []
      const fromTop = taskRowTopPx.get(link.fromTaskId)
      const toTop = taskRowTopPx.get(link.toTaskId)
      if (fromTop === undefined || toTop === undefined) return []

      const fromS = parsePlanDate(from.planStartDate)
      const fromE = parsePlanDate(from.planEndDate) ?? fromS
      const toS = parsePlanDate(to.planStartDate)
      if (!fromS || !fromE || !toS) return []

      const fromSI = differenceInCalendarDays(fromS, start)
      const fromEI = differenceInCalendarDays(fromE, start)
      const toSI = differenceInCalendarDays(toS, start)

      // Attachment: mid-right of predecessor bar.
      let fromX: number
      if (from.type === 'milestone') {
        fromX = fromSI * pixelPerDay + pixelPerDay / 2 + 10 // right apex of diamond
      } else {
        const span = Math.max(1, fromEI - fromSI + 1)
        fromX = fromSI * pixelPerDay + span * pixelPerDay // bar right (widthPx = span * pixelPerDay)
      }

      // Attachment: mid-left of successor bar.
      let toX: number
      if (to.type === 'milestone') {
        toX = toSI * pixelPerDay + pixelPerDay / 2 - 10 // left apex of diamond
      } else {
        toX = Math.max(0, toSI * pixelPerDay) // bar left edge
      }

      const fromY = fromTop + GANTT_ROW_H / 2
      const toY = toTop + GANTT_ROW_H / 2
      const horiGap = toX - fromX // positive = forward, negative = backward
      const goingDown = toTop > fromTop // successor is visually below predecessor

      let d: string
      const r = R

      if (horiGap > FWD_MIN) {
        // ── FORWARD: L-elbow via midX ──
        const er = Math.max(2, Math.min(r, Math.floor(horiGap / 2) - 1))
        if (fromTop === toTop) {
          // Same row, straight horizontal.
          d = `M ${fromX},${fromY} H ${toX}`
        } else {
          const midX = Math.round((fromX + toX) / 2)
          if (goingDown) {
            d = [
              `M ${fromX},${fromY}`,
              `H ${midX - er}`,
              `a ${er} ${er} 0 0 1 ${er} ${er}`, // right→down (CW)
              `V ${toY - er}`,
              `a ${er} ${er} 0 0 0 ${er} ${er}`, // down→right (CCW)
              `H ${toX}`,
            ].join(' ')
          } else {
            d = [
              `M ${fromX},${fromY}`,
              `H ${midX - er}`,
              `a ${er} ${er} 0 0 0 ${er} ${-er}`, // right→up (CCW)
              `V ${toY + er}`,
              `a ${er} ${er} 0 0 1 ${er} ${-er}`, // up→right (CW)
              `H ${toX}`,
            ].join(' ')
          }
        }
      } else if (goingDown) {
        // ── BACKWARD / TIGHT — successor below predecessor ──
        // Route through inter-row lane (just below predecessor's row):
        //   right → arc(R→D) → down → arc(D→L) → left in lane
        //   → arc(L→D) → down → arc(D→R) → arrive at (anchorX, toY)
        const laneY = fromTop + GANTT_ROW_H + LANE_PAD
        // Go JOG_LEFT past successor's left edge before turning down, then enter right.
        const leftAnchor = Math.max(r * 2, toX - JOG_LEFT)
        d = [
          `M ${fromX},${fromY}`,
          `H ${fromX + JOG - r}`,
          `a ${r} ${r} 0 0 1 ${r} ${r}`, // right→down (CW, sweep=1)
          `V ${laneY - r}`,
          `a ${r} ${r} 0 0 1 ${-r} ${r}`, // down→left (CW, sweep=1)
          `H ${leftAnchor}`, // slide left, past successor by JOG_LEFT
          `a ${r} ${r} 0 0 0 ${-r} ${r}`, // left→down (CCW, sweep=0)
          `V ${toY - r}`,
          `a ${r} ${r} 0 0 0 ${r} ${r}`, // down→right (CCW, sweep=0) → arrives (leftAnchor, toY)
          `H ${toX}`, // go right into successor's left edge
        ].join(' ')
      } else {
        // ── BACKWARD / TIGHT — same row or successor above predecessor ──
        // Classic U below the lower task (predecessor), then come back up:
        //   right → arc(R→D) → down → arc(D→L) → left
        //   → arc(L→U) → up → arc(U→R) → arrive at (toX, toY)
        const laneY = fromTop + GANTT_ROW_H + LANE_PAD // fromTop is the lower of the two
        // Go JOG_LEFT past successor's left edge before turning up, then enter right.
        const leftAnchorUp = Math.max(r * 2, toX - JOG_LEFT)
        d = [
          `M ${fromX},${fromY}`,
          `H ${fromX + JOG - r}`,
          `a ${r} ${r} 0 0 1 ${r} ${r}`, // right→down (CW, sweep=1)
          `V ${laneY - r}`,
          `a ${r} ${r} 0 0 1 ${-r} ${r}`, // down→left (CW, sweep=1)
          `H ${leftAnchorUp}`, // slide left, past successor by JOG_LEFT
          `a ${r} ${r} 0 0 1 ${-r} ${-r}`, // left→up (CW, sweep=1)
          `V ${toY + r}`,
          `a ${r} ${r} 0 0 1 ${r} ${-r}`, // up→right (CW, sweep=1) → arrives (leftAnchorUp, toY)
          `H ${toX}`, // go right into successor's left edge
        ].join(' ')
      }

      return [{ id: link.id, d }]
    })
  }, [taskLinks, taskRowTopPx, scheduled, start, pixelPerDay])

  const flashTimelineChrome = useCallback(() => {
    if (!shellTabActiveRef.current) return
    if (ganttReducedMotion()) return
    if (chromeFlashTimeoutRef.current) window.clearTimeout(chromeFlashTimeoutRef.current)
    setTimelineChromeFlash(true)
    chromeFlashTimeoutRef.current = window.setTimeout(() => {
      chromeFlashTimeoutRef.current = 0
      setTimelineChromeFlash(false)
    }, 420)
  }, [])

  /** Cuộn ngang trên body Gantt / workload; strip timeline header dịch bằng transform (không mirror scrollLeft). */
  const scrollToChartPixel = useCallback(
    (pixelInTimeline: number) => {
      const el = showGanttMain ? ganttScrollRef.current : workloadScrollRef.current
      if (!el) return
      const target = Math.max(0, leftBlockWidth + pixelInTimeline - Math.max(80, el.clientWidth / 3))
      const startLeft = el.scrollLeft
      const delta = target - startLeft

      const noHorizontalMotion = Math.abs(delta) < 1 || el.scrollWidth <= el.clientWidth + 2

      if (noHorizontalMotion) {
        flashTimelineChrome()
        return
      }

      el.scrollTo({ left: target, top: el.scrollTop, behavior: 'auto' })
    },
    [leftBlockWidth, flashTimelineChrome, showGanttMain]
  )

  scrollToChartPixelRef.current = scrollToChartPixel

  const applyTimelineTransforms = useCallback((scrollLeftPx: number) => {
    const tx = `translate3d(${-scrollLeftPx}px,0,0)`
    const gh = ganttHeaderTimelineRef.current
    const wh = workloadHeaderTimelineRef.current
    if (gh && gh.style.transform !== tx) gh.style.transform = tx
    if (wh && wh.style.transform !== tx) wh.style.transform = tx
  }, [])

  const syncHorizontalScrollFromRef = useRef<(source: 'ganttBody' | 'workloadBody') => void>(() => { })

  const syncHorizontalScrollFrom = useCallback(
    (source: 'ganttBody' | 'workloadBody') => {
      if (!shellTabActiveRef.current) return
      if (syncingHScrollRef.current) return
      const g = ganttScrollRef.current
      const w = workloadScrollRef.current
      const sl = source === 'ganttBody' ? (g?.scrollLeft ?? null) : (w?.scrollLeft ?? null)
      if (sl == null) return

      const gAligned = !g || Math.abs(g.scrollLeft - sl) < 0.5
      const wAligned = !w || Math.abs(w.scrollLeft - sl) < 0.5
      const prev = lastCommittedHScrollRef.current
      const transformFresh = prev !== null && Math.abs(prev - sl) < 0.25

      if (gAligned && wAligned && transformFresh) return

      syncingHScrollRef.current = true
      try {
        if (g && Math.abs(g.scrollLeft - sl) >= 0.5) g.scrollLeft = sl
        if (w && Math.abs(w.scrollLeft - sl) >= 0.5) w.scrollLeft = sl
        applyTimelineTransforms(sl)
        lastCommittedHScrollRef.current = sl
      } finally {
        syncingHScrollRef.current = false
      }
    },
    [applyTimelineTransforms]
  )

  syncHorizontalScrollFromRef.current = syncHorizontalScrollFrom

  const scrollToToday = useCallback(() => {
    scrollToChartPixel(Math.max(0, todayPxCenter))
  }, [todayPxCenter, scrollToChartPixel])

  useEffect(() => {
    return () => {
      if (chromeFlashTimeoutRef.current) window.clearTimeout(chromeFlashTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (shellTabActive !== false) return
    if (chromeFlashTimeoutRef.current) window.clearTimeout(chromeFlashTimeoutRef.current)
    chromeFlashTimeoutRef.current = 0
    setTimelineChromeFlash(false)
    if (ganttSplitDragRafRef.current != null) {
      cancelAnimationFrame(ganttSplitDragRafRef.current)
      ganttSplitDragRafRef.current = null
    }
  }, [shellTabActive])

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

  const workloadScheduledRefs = useMemo(
    () =>
      scheduled
        .filter(t => t.type !== 'milestone')
        .map(t => ({
          id: t.id,
          projectId: (t.projectId ?? '').trim() || null,
          assigneeUserId: t.assigneeUserId,
          planStartDate: t.planStartDate,
          planEndDate: t.planEndDate,
        })),
    [scheduled]
  )

  useEffect(() => {
    const g = showGanttMain ? ganttScrollRef.current : null
    const w = showWorkloadBlock ? workloadScrollRef.current : null
    const opts: AddEventListenerOptions = { passive: true }
    const onGantt = () => {
      const el = ganttScrollRef.current
      if (!el) return
      const sl = el.scrollLeft
      if (ganttLastScrollLeftSeenRef.current === sl) return
      ganttLastScrollLeftSeenRef.current = sl
      syncHorizontalScrollFromRef.current('ganttBody')
    }
    const onWorkload = () => {
      const el = workloadScrollRef.current
      if (!el) return
      const sl = el.scrollLeft
      if (workloadLastScrollLeftSeenRef.current === sl) return
      workloadLastScrollLeftSeenRef.current = sl
      syncHorizontalScrollFromRef.current('workloadBody')
    }
    g?.addEventListener('scroll', onGantt, opts)
    w?.addEventListener('scroll', onWorkload, opts)
    return () => {
      g?.removeEventListener('scroll', onGantt)
      w?.removeEventListener('scroll', onWorkload)
    }
  }, [showGanttMain, showWorkloadBlock, workloadSplitScroll, scheduled.length])

  const renderMiniGanttForUserInvoker = useCallback((userId: string, projectId: string | null) => {
    const fn = renderMiniGanttForUserRef.current
    return fn ? fn(userId, projectId) : null
  }, [])

  const workloadSharedProps = useMemo(
    () => ({
      segments: workloadSegments,
      capTruncated: workloadCapTruncated,
      scale,
      start,
      totalDays,
      pixelPerDay,
      chartWidth,
      weekendColumnRects,
      verticalGridLeftPx: verticalGridLineLeftPx,
      showGridBorders,
      showActualBars,
      locale,
      language,
      loading: Boolean(workloadLoading),
      scheduledGanttTasks: workloadScheduledRefs,
      renderMiniGanttForUser: renderMiniGanttForUserInvoker,
      onUpsertOverride: onUpsertWorkloadOverride,
      getUserAvatarUrl,
      workloadRowGrouping: groupingEffective,
      showTimelineDayStrip: !showCombineSplit,
      timelineTicks: tickMarks,
      bodyScrollRef: workloadScrollRef,
      leftBlockWidthPx: leftBlockWidth,
      collapsedProjectIdsShared: workloadCollapsedProjectIds,
      setCollapsedProjectIdsShared: setWorkloadCollapsedProjectIds,
      expandedRowKeysShared: workloadExpandedRowKeys,
      setExpandedRowKeysShared: setWorkloadExpandedRowKeys,
      displayMode: workloadDisplayMode,
      onDisplayModeChange: setWorkloadDisplayMode,
    }),
    [
      workloadCollapsedProjectIds,
      workloadExpandedRowKeys,
      workloadDisplayMode,
      workloadSegments,
      workloadCapTruncated,
      scale,
      start,
      totalDays,
      pixelPerDay,
      chartWidth,
      weekendColumnRects,
      verticalGridLineLeftPx,
      showGridBorders,
      showActualBars,
      locale,
      language,
      workloadLoading,
      workloadScheduledRefs,
      renderMiniGanttForUserInvoker,
      onUpsertWorkloadOverride,
      getUserAvatarUrl,
      groupingEffective,
      showCombineSplit,
      tickMarks,
      workloadScrollRef,
      leftBlockWidth,
    ]
  )

  const workloadSuspenseFallback = (
    <div className="flex min-h-[140px] flex-1 items-center justify-center bg-background/30">
      <GlowLoader className="h-8 w-8" />
    </div>
  )

  const renderWorkloadBoardPane = () => (
    <Suspense fallback={workloadSuspenseFallback}>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {workloadSplitScroll ? (
          <>
            <div className="min-w-0 shrink-0 overflow-x-hidden bg-background/30">
              <TaskGanttWorkloadLazy {...workloadSharedProps} segment="header" headerTimelineTrackRef={workloadHeaderTimelineRef} />
            </div>
            <div ref={workloadScrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-auto [overflow-anchor:none] [scrollbar-gutter:stable]">
              {/* flex-1 fills scrollport when content is short; % min-height is unreliable inside overflow:auto */}
              <div className="relative flex min-h-0 w-full flex-1 flex-col min-w-0 bg-background/30" style={hbGantt.sheet(chartWidth)}>
                <TaskGanttWorkloadLazy {...workloadSharedProps} segment="body" />
              </div>
            </div>
          </>
        ) : (
          <div ref={workloadScrollRef} className="flex min-h-0 flex-1 flex-col overflow-auto [overflow-anchor:none] [scrollbar-gutter:stable]">
            <div className="relative flex min-h-0 w-full flex-1 flex-col min-w-0 bg-background/30" style={hbGantt.sheet(chartWidth)}>
              <TaskGanttWorkloadLazy {...workloadSharedProps} segment="full" />
            </div>
          </div>
        )}
        <WorkloadGanttPaneRailControlStack
          metaRailExpanded={metaRailExpanded}
          onMetaRailToggle={toggleMetaRail}
          segments={workloadSegments}
          workloadRowGrouping={groupingEffective}
          showActualBars={showActualBars}
          collapsedProjectIds={workloadCollapsedProjectIds}
          setCollapsedProjectIds={setWorkloadCollapsedProjectIds}
          expandedRowKeys={workloadExpandedRowKeys}
          setExpandedRowKeys={setWorkloadExpandedRowKeys}
          includeMetaRail={!showCombineSplit}
        />
      </div>
    </Suspense>
  )

  ganttWorkloadSplitShareRef.current = ganttWorkloadSplitShare

  /** Chiều cao pane Gantt từ state — chỉ khi không đang kéo (kéo = DOM riêng). */
  const commitGanttWorkloadPaneLayoutDom = useCallback((ideal: number, shellH: number, share: number) => {
    const pane = ganttWorkloadPaneRef.current
    if (!pane) return
    if (shellH > 0) {
      const cap = shellH * share
      const paneH = Math.min(ideal, cap)
      pane.style.height = `${paneH}px`
      pane.style.maxHeight = `${cap}px`
    } else {
      pane.style.height = `${ideal}px`
      pane.style.removeProperty('max-height')
    }
  }, [])

  const applyGanttWorkloadPaneDragVisual = useCallback((share: number) => {
    const pane = ganttWorkloadPaneRef.current
    const layout = ganttSplitShellLayoutCacheRef.current
    if (!pane || !layout || layout.height < 48) return
    const cap = layout.height * share
    const ideal = ganttChartIdealHeightPxRef.current
    pane.style.height = `${Math.min(ideal, cap)}px`
    pane.style.maxHeight = `${cap}px`
  }, [])

  const scheduleGanttWorkloadSplitDragVisualFlush = useCallback(() => {
    if (ganttSplitDragRafRef.current != null) return
    ganttSplitDragRafRef.current = window.requestAnimationFrame(() => {
      ganttSplitDragRafRef.current = null
      const share = ganttSplitDragPendingShareRef.current
      if (share == null) return
      applyGanttWorkloadPaneDragVisual(share)
    })
  }, [applyGanttWorkloadPaneDragVisual])

  useLayoutEffect(() => {
    if (!showCombineSplit) {
      setGanttWorkloadSplitShellH(0)
      return
    }
    const el = ganttWorkloadSplitRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      if (ganttWorkloadSplitDraggingRef.current) return
      const h = entries[0]?.contentRect.height ?? 0
      setGanttWorkloadSplitShellH(h)
    })
    ro.observe(el)
    if (!ganttWorkloadSplitDraggingRef.current) {
      setGanttWorkloadSplitShellH(el.getBoundingClientRect().height)
    }
    return () => ro.disconnect()
  }, [showCombineSplit])

  useEffect(() => {
    if (!showCombineSplit) {
      if (ganttSplitDragRafRef.current != null) {
        cancelAnimationFrame(ganttSplitDragRafRef.current)
        ganttSplitDragRafRef.current = null
      }
      ganttSplitDragPendingShareRef.current = null
      splitDragRestoreBodyUserSelectRef.current?.()
      splitDragRestoreBodyUserSelectRef.current = null
      ganttWorkloadSplitDraggingRef.current = false
      ganttSplitShellLayoutCacheRef.current = null
      ganttWorkloadSplitDragRef.current = null
    }
  }, [showCombineSplit])

  const onGanttWorkloadSplitPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!showCombineSplit) return
      e.preventDefault()
      const shell = ganttWorkloadSplitRef.current
      if (!shell) return
      const r = shell.getBoundingClientRect()
      ganttSplitShellLayoutCacheRef.current = { top: r.top, height: r.height }
      ganttWorkloadSplitDragRef.current = { pointerId: e.pointerId }
      ganttWorkloadSplitDraggingRef.current = true
      ganttSplitDragPendingShareRef.current = null
      if (ganttSplitDragRafRef.current != null) {
        cancelAnimationFrame(ganttSplitDragRafRef.current)
        ganttSplitDragRafRef.current = null
      }
      const prevSel = document.body.style.userSelect
      document.body.style.userSelect = 'none'
      splitDragRestoreBodyUserSelectRef.current = () => {
        document.body.style.userSelect = prevSel
      }
      applyGanttWorkloadPaneDragVisual(ganttWorkloadSplitShareRef.current)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [showCombineSplit, applyGanttWorkloadPaneDragVisual]
  )

  const onGanttWorkloadSplitPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const ctx = ganttWorkloadSplitDragRef.current
      if (!ctx || e.pointerId !== ctx.pointerId) return
      const layout = ganttSplitShellLayoutCacheRef.current
      if (!layout || layout.height < 48) return
      const rel = (e.clientY - layout.top) / layout.height
      const next = Math.min(MAX_GANTT_WORKLOAD_SPLIT, Math.max(MIN_GANTT_WORKLOAD_SPLIT, rel))
      ganttSplitDragPendingShareRef.current = next
      scheduleGanttWorkloadSplitDragVisualFlush()
    },
    [scheduleGanttWorkloadSplitDragVisualFlush]
  )

  const endGanttWorkloadSplitPointer = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const ctx = ganttWorkloadSplitDragRef.current
    if (!ctx || e.pointerId !== ctx.pointerId) return
    if (ganttSplitDragRafRef.current != null) {
      cancelAnimationFrame(ganttSplitDragRafRef.current)
      ganttSplitDragRafRef.current = null
    }
    ganttSplitDragPendingShareRef.current = null
    ganttWorkloadSplitDragRef.current = null
    ganttWorkloadSplitDraggingRef.current = false
    ganttSplitShellLayoutCacheRef.current = null
    splitDragRestoreBodyUserSelectRef.current?.()
    splitDragRestoreBodyUserSelectRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const shell = ganttWorkloadSplitRef.current
    let next = ganttWorkloadSplitShareRef.current
    if (shell) {
      const rect = shell.getBoundingClientRect()
      const h = rect.height
      if (h >= 48) {
        const rel = (e.clientY - rect.top) / h
        next = Math.min(MAX_GANTT_WORKLOAD_SPLIT, Math.max(MIN_GANTT_WORKLOAD_SPLIT, rel))
      }
    }
    setGanttWorkloadSplitShare(next)
    saveGanttWorkloadSplitShare(next)
  }, [])

  useLayoutEffect(() => {
    if (!showCombineSplit) {
      const pane = ganttWorkloadPaneRef.current
      if (pane) {
        pane.style.removeProperty('height')
        pane.style.removeProperty('max-height')
      }
      return
    }
    if (ganttWorkloadSplitDraggingRef.current) return
    commitGanttWorkloadPaneLayoutDom(ganttChartIdealHeightPx, ganttWorkloadSplitShellH, ganttWorkloadSplitShare)
  }, [showCombineSplit, ganttChartIdealHeightPx, ganttWorkloadSplitShellH, ganttWorkloadSplitShare, commitGanttWorkloadPaneLayoutDom])

  /** Căn workload body + transform timeline header khi đổi độ rộng / mount. */
  useLayoutEffect(() => {
    const g = ganttScrollRef.current
    const w = workloadScrollRef.current
    const anchor = showGanttMain ? g : w
    if (!anchor) return
    const sl = anchor.scrollLeft
    syncingHScrollRef.current = true
    try {
      if (showCombineSplit) {
        if (g && Math.abs(g.scrollLeft - sl) >= 0.5) g.scrollLeft = sl
        if (w && Math.abs(w.scrollLeft - sl) >= 0.5) w.scrollLeft = sl
      }
      applyTimelineTransforms(sl)
      lastCommittedHScrollRef.current = sl
    } finally {
      syncingHScrollRef.current = false
    }
  }, [showCombineSplit, showGanttMain, workloadSplitScroll, chartWidth, leftBlockWidth, scheduled.length, applyTimelineTransforms])

  const planNonWorkingByProjectId = useMemo(() => {
    const m = new Map<string, readonly string[]>()
    for (const seg of workloadSegments) {
      m.set(seg.projectId, seg.data.nonWorkingDates ?? [])
    }
    return m
  }, [workloadSegments])

  const ganttVirtualSliceStable = useMemo(
    (): GanttVirtualSliceStableCtx => ({
      metaRailExpanded,
      chartWidth,
      start,
      pixelPerDay,
      weekendColumnRects,
      planNonWorkingByProjectId,
      statusColorMap,
      // selectedTaskIds đã được tách ra — truyền trực tiếp qua prop GanttVirtualRowsPane
      onToggleTaskSelect,
      onOpenTaskById: openTaskById,
      onUpdatePlanDates,
      getAssigneeDisplay,
      getStatusLabel,
      getPriorityLabel,
      getStatusIcon,
      getPriorityIcon,
      getStatusToneClass,
      getPriorityToneClass,
      priorityColorMap,
      getBadgeStyle,
      locale,
      milestoneLabel: labels.milestoneLabel,
      toggleGroupSegmentCollapsed,
      toggleExpand,
      t,
    }),
    [
      metaRailExpanded,
      chartWidth,
      start,
      pixelPerDay,
      weekendColumnRects,
      planNonWorkingByProjectId,
      statusColorMap,
      onToggleTaskSelect,
      openTaskById,
      onUpdatePlanDates,
      getAssigneeDisplay,
      getStatusLabel,
      getPriorityLabel,
      getStatusIcon,
      getPriorityIcon,
      getStatusToneClass,
      getPriorityToneClass,
      priorityColorMap,
      getBadgeStyle,
      locale,
      labels.milestoneLabel,
      toggleGroupSegmentCollapsed,
      toggleExpand,
      t,
    ]
  )

  const ganttRowActualChrome = useMemo(
    (): GanttVirtualRowActualChrome => ({
      showActualBars,
      actualBarRangeTitle: labels.actualBarRangeTitle,
      actualBarHintLateStart: labels.actualBarHintLateStart,
      actualBarHintLateFinish: labels.actualBarHintLateFinish,
      actualBarHintLateBoth: labels.actualBarHintLateBoth,
      actualBarHintEarly: labels.actualBarHintEarly,
      actualBarHintOntime: labels.actualBarHintOntime,
    }),
    [
      showActualBars,
      labels.actualBarRangeTitle,
      labels.actualBarHintLateStart,
      labels.actualBarHintLateFinish,
      labels.actualBarHintLateBoth,
      labels.actualBarHintEarly,
      labels.actualBarHintOntime,
    ]
  )

  miniGanttDisplayPrefsRef.current = {
    ...ganttRowActualChrome,
    showGridBorders,
    scale,
    verticalGridLineLeftPx,
    workloadDisplayMode,
  }

  const renderMiniGanttForUser = useCallback(
    (userId: string, projectId: string | null) => {
      const wg = miniGanttDisplayPrefsRef.current
      const userTasks = scheduled
        .filter(t => {
          if ((t.assigneeUserId || '') !== userId || t.type === 'milestone') return false
          if (projectId == null) return true
          return (t.projectId || '').trim() === projectId
        })
        .slice()
        .sort((a, b) => {
          const pa = parsePlanDate(a.planStartDate)?.getTime() ?? 0
          const pb = parsePlanDate(b.planStartDate)?.getTime() ?? 0
          if (pa !== pb) return pa - pb
          return (a.title ?? '').localeCompare(b.title ?? '', undefined, { sensitivity: 'base' })
        })

      if (userTasks.length === 0) {
        return (
          <div className="relative flex w-full min-w-0 shrink-0 flex-row items-stretch bg-background">
            <div
              className="sticky left-0 isolate shrink-0 border-r border-border/50 bg-background transform-gpu"
              style={{ ...hbGantt.leftBlock, zIndex: Z_GANTT_STICKY_ROW_META_FULL }}
              aria-hidden
            />
            <div className="relative flex min-h-[36px] min-w-0 shrink-0 items-center px-3 text-[10px] italic leading-snug text-muted-foreground" style={{ width: chartWidth }}>
              {labels.emptyScheduled}
            </div>
          </div>
        )
      }

      const miniPanelProps = {
        userTasks,
        chartWidth,
        start,
        pixelPerDay,
        weekendColumnRects,
        statusColorMap,
        selectedTaskIds,
        onToggleTaskSelect,
        onOpenTaskById: openTaskById,
        onUpdatePlanDates,
        getAssigneeDisplay,
        getStatusLabel,
        getPriorityLabel,
        getStatusIcon,
        getPriorityIcon,
        getStatusToneClass,
        getPriorityToneClass,
        priorityColorMap,
        getBadgeStyle,
        metaRailExpanded,
        wg,
        locale,
        planNonWorkingByProjectId,
      } as const

      return <WorkloadMiniGanttSplitPanel {...miniPanelProps} />
    },
    [
      scheduled,
      chartWidth,
      labels.emptyScheduled,
      start,
      pixelPerDay,
      weekendColumnRects,
      statusColorMap,
      selectedTaskIds,
      onToggleTaskSelect,
      openTaskById,
      onUpdatePlanDates,
      getAssigneeDisplay,
      getStatusLabel,
      getPriorityLabel,
      getStatusIcon,
      getPriorityIcon,
      getStatusToneClass,
      getPriorityToneClass,
      priorityColorMap,
      getBadgeStyle,
      locale,
      metaRailExpanded,
      planNonWorkingByProjectId,
    ]
  )

  renderMiniGanttForUserRef.current = renderMiniGanttForUser

  const renderGanttPanelBody = (): React.ReactNode => {
    if (scheduled.length === 0) {
      return (
        <div
          ref={ganttScrollRef}
          className={cn('min-h-0 flex-1 [overflow-anchor:none]', showCombineSplit ? 'overflow-y-auto overflow-x-scroll [&::-webkit-scrollbar]:h-0' : 'overflow-auto')}
        >
          <div className="p-4 text-muted-foreground text-sm">{labels.emptyScheduled}</div>
        </div>
      )
    }
    const totalBodyPx = ganttBodyScrollHeightPx
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden relative">
        <div className={cn('flex w-full min-w-0 shrink-0 overflow-hidden bg-muted', showGridBorders ? 'border-b border-b-border/60' : 'border-b border-b-border/35')}>
          <div
            className="flex shrink-0 flex-row items-stretch border-r border-border/50 bg-muted transform-gpu"
            style={{ ...hbGantt.leftBlock, zIndex: Z_GANTT_STICKY_TOP_HEADER }}
          >
            <div className={cn('flex shrink-0 items-center justify-center bg-background px-0.5', GANTT_META_COL_DIVIDER)} style={hbGantt.colNo}>
              <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.ganttColumnNo')}</span>
            </div>
            <div className={cn('flex shrink-0 items-center justify-center bg-background px-0.5', GANTT_META_COL_DIVIDER)} style={hbGantt.colCheckbox}>
              {onToggleTaskSelect && onApplyBulkTaskSelection ? (
                <Checkbox
                  className="h-4 w-4 shrink-0"
                  disabled={ganttScheduledBulkSelectableIds.length === 0}
                  checked={
                    ganttScheduledBulkSelectableIds.length === 0
                      ? false
                      : ganttScheduledBulkSelectableIds.every(id => selectedTaskIds?.has(id))
                        ? true
                        : ganttScheduledBulkSelectableIds.some(id => selectedTaskIds?.has(id))
                          ? 'indeterminate'
                          : false
                  }
                  onCheckedChange={v => {
                    onApplyBulkTaskSelection(ganttScheduledBulkSelectableIds, v === true)
                  }}
                  aria-label={t('taskManagement.ganttBulkSelectAll')}
                />
              ) : (
                <span className="sr-only">{t('taskManagement.ganttColumnBulkSelect')}</span>
              )}
            </div>
            <div
              className={cn('relative flex shrink-0 items-center justify-center bg-background px-1 border-r-1', metaRailExpanded && GANTT_META_COL_DIVIDER)}
              style={hbGantt.nameCol}
            >
              <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.taskTitle')}</span>
              <button
                type="button"
                tabIndex={-1}
                aria-label={labels.resizeLabelColumn ?? t('taskManagement.ganttResizeLabelColumn')}
                title={labels.resizeLabelColumn ?? t('taskManagement.ganttResizeLabelColumn')}
                className="absolute inset-y-0 right-0 z-[2] w-2 cursor-col-resize touch-none border-0 bg-transparent p-0 hover:bg-primary/15 active:bg-primary/25"
                onPointerDown={onLabelResizePointerDown}
                onPointerMove={onLabelResizePointerMove}
                onPointerUp={onLabelResizePointerEnd}
                onPointerCancel={onLabelResizePointerEnd}
              />
            </div>
            <div className={cn('flex min-w-0 shrink items-center justify-center bg-background', metaRailExpanded && GANTT_META_COL_DIVIDER)} style={hbGantt.colAssignee}>
              <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.assignee')}</span>
            </div>
            <div className={cn('flex min-w-0 shrink items-center justify-center bg-background', metaRailExpanded && GANTT_META_COL_DIVIDER)} style={hbGantt.colStatus}>
              <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.status')}</span>
            </div>
            <div className={cn('flex min-w-0 shrink items-center justify-center bg-background', metaRailExpanded && GANTT_META_COL_DIVIDER)} style={hbGantt.colPriority}>
              <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.priority')}</span>
            </div>
            <div className="flex min-w-0 shrink items-center justify-start bg-background" style={hbGantt.colProgress}>
              <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.progress')}</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 overflow-x-hidden">
            <div
              ref={ganttHeaderTimelineRef}
              className="relative isolate text-[10px] text-muted-foreground will-change-transform [contain:layout_paint_size]"
              style={{ width: chartWidth, height: HEADER_H }}
            >
              <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                {weekendColumnRects.map((r, i) => (
                  <div key={`hdr-wk-${r.left}-${i}`} className="absolute top-0 bottom-0 bg-slate-500/[0.11] dark:bg-slate-400/[0.05]" style={{ left: r.left, width: r.width }} />
                ))}
              </div>
              <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" style={{ opacity: `var(${HB_GANTT_GRID_V_VAR}, 0)` }}>
                <GanttTimelineGridOverlay scale={scale} pixelPerDay={pixelPerDay} chartWidth={chartWidth} verticalGridLineLeftPx={verticalGridLineLeftPx} />
              </div>
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
        </div>
        <div
          ref={ganttScrollRef}
          className={cn(
            'flex min-h-0 flex-1 flex-col [overflow-anchor:none]',
            showCombineSplit ? 'overflow-y-auto overflow-x-scroll [&::-webkit-scrollbar]:h-0' : 'overflow-y-auto overflow-x-auto'
          )}
        >
          <div
            className={cn('relative flex min-h-0 min-w-max w-max flex-1 flex-col bg-background/30', 'group/ganttGridShell')}
            data-gantt-grid={showGridBorders ? 'on' : 'off'}
            onDragOverCapture={onGanttUnschedDragOverCapture}
            onDropCapture={onGanttUnschedDropCapture}
            style={{
              ...hbGantt.sheet(chartWidth),
              minHeight: totalBodyPx,
            }}
          >
            <GanttBodyChartLayers
              chartWidth={chartWidth}
              totalBodyPx={totalBodyPx}
              scale={scale}
              pixelPerDay={pixelPerDay}
              weekendColumnRects={weekendColumnRects}
              verticalGridLineLeftPx={verticalGridLineLeftPx}
              showTodayLine={showTodayLine}
              todayPxCenter={todayPxCenter}
              todayMark={labels.todayMark}
              arrowPaths={arrowPaths}
            />
            <GanttVirtualRowsPane
              scrollRef={ganttScrollRef}
              flatRows={ganttVirtualFlatRows}
              sliceStable={ganttVirtualSliceStable}
              rowActualChrome={ganttRowActualChrome}
              chartWidth={chartWidth}
              virtualMeasureEpoch={layoutModeEffective}
              selectedTaskIds={selectedTaskIds}
            />
          </div>
        </div>
        {scheduled.length > 0 ? (
          <div
            className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-r-md border border-border/80 border-l-0 bg-background/95 shadow-sm"
            style={{
              ...hbGantt.metaRailToggleLeft,
              top: `calc(${HEADER_H}px + (100% - ${HEADER_H}px) / 2)`,
              transform: 'translate(-1px, -50%)',
              zIndex: Z_GANTT_META_RAIL_FLOATING_TOGGLE,
            }}
          >
            <button
              type="button"
              className={cn(
                'flex h-7 w-5 shrink-0 items-center justify-center',
                'text-muted-foreground transition-[background-color,box-shadow] duration-200 ease-out',
                'hover:bg-muted hover:text-foreground',
                'motion-safe:active:scale-[0.97] motion-reduce:active:scale-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset'
              )}
              onClick={e => {
                e.stopPropagation()
                toggleMetaRail()
              }}
              aria-expanded={metaRailExpanded}
              aria-label={metaRailExpanded ? t('taskManagement.ganttMetaRailCollapse') : t('taskManagement.ganttMetaRailExpand')}
              title={metaRailExpanded ? t('taskManagement.ganttMetaRailCollapse') : t('taskManagement.ganttMetaRailExpand')}
            >
              <ChevronsRight
                className={cn(
                  'h-4 w-4 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none',
                  metaRailExpanded && 'rotate-180'
                )}
                aria-hidden
              />
            </button>
            {(groupingEffective === 'assignee' || groupingEffective === 'project') && scheduledGroupSegmentKeys.length > 0 ? (
              <button
                type="button"
                className={cn(
                  'flex h-7 w-5 shrink-0 items-center justify-center border-t border-border/60',
                  'text-muted-foreground transition-[background-color,color] duration-200 ease-out',
                  'hover:bg-muted hover:text-foreground',
                  'motion-safe:active:scale-[0.97] motion-reduce:active:scale-100',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset'
                )}
                aria-label={allScheduledGroupsCollapsed ? t('taskManagement.ganttBulkUnfoldAllTimelineGroupsAria') : t('taskManagement.ganttBulkFoldAllTimelineGroupsAria')}
                title={allScheduledGroupsCollapsed ? t('taskManagement.ganttBulkUnfoldAllTimelineGroupsAria') : t('taskManagement.ganttBulkFoldAllTimelineGroupsAria')}
                onClick={e => {
                  e.stopPropagation()
                  toggleAllScheduledGroupSegmentsCollapsed()
                }}
              >
                {allScheduledGroupsCollapsed ? <UnfoldVertical className="h-3.5 w-3.5" aria-hidden /> : <FoldVertical className="h-3.5 w-3.5" aria-hidden />}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="min-w-0 w-full shrink-0 overflow-x-auto pb-px [-ms-overflow-style:auto] [scrollbar-gutter:stable]">
        <div className="flex min-w-full w-full flex-nowrap items-start gap-2 sm:items-center">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2">
            <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
              {labels.layoutModeGroup ? <span className="text-muted-foreground text-xs whitespace-nowrap">{labels.layoutModeGroup}</span> : null}
              <div className="flex shrink-0 items-center gap-1.5">
                <ToggleGroup
                  type="single"
                  value={toolbarLayoutValue}
                  onValueChange={v => {
                    if (!v) return
                    startLayoutModeTransition(() => setLayoutMode(v as TaskGanttLayoutMode))
                  }}
                  variant="outline"
                  size="sm"
                  disabled={layoutModeTransitionPending}
                  className={cn('justify-start gap-px shrink-0', layoutModeTransitionPending && 'motion-safe:opacity-85')}
                  aria-label={labels.layoutModeGroup}
                >
                  <ToggleGroupItem value="gantt" className="h-8 px-2" title={labels.layoutTimeline} aria-label={labels.layoutTimeline}>
                    {labels.layoutTimeline}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="workload" className="h-8 px-2" disabled={!workloadDataAvailable} title={labels.layoutWorkload} aria-label={labels.layoutWorkload}>
                    {labels.layoutWorkload}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="combine" className="h-8 px-2" disabled={!workloadDataAvailable} title={labels.layoutBoth} aria-label={labels.layoutBoth}>
                    {labels.layoutBoth}
                  </ToggleGroupItem>
                </ToggleGroup>
                {layoutModeTransitionPending ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden /> : null}
              </div>
            </div>

            <Separator orientation="vertical" className="hidden h-7 shrink-0 self-center sm:block" />

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs whitespace-nowrap">{labels.zoom}</span>
              <ToggleGroup type="single" value={scale} onValueChange={v => v && setScale(v as TaskGanttScale)} variant="outline" size="sm">
                <ToggleGroupItem value="week" aria-label={labels.week}>
                  {labels.week}
                </ToggleGroupItem>
                <ToggleGroupItem value="month" aria-label={labels.month}>
                  {labels.month}
                </ToggleGroupItem>
                <ToggleGroupItem value="monthly" aria-label={labels.monthly}>
                  {labels.monthly}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {!disableRowGrouping && (labels.groupRows || labels.groupingFlat || labels.groupingByAssignee || labels.groupingByProject) ? (
              <>
                <Separator orientation="vertical" className="hidden h-7 shrink-0 self-center sm:block" />
                <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
                  {labels.groupRows ? <span className="hidden text-muted-foreground text-xs whitespace-nowrap sm:inline">{labels.groupRows}</span> : null}
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
                </div>
              </>
            ) : null}
          </div>
          <Separator orientation="vertical" className="hidden h-7 shrink-0 self-center sm:block" />
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-2 sm:gap-x-3">
            {labels.gridBordersSwitch || labels.gridBordersHelp ? (
              <div className="flex items-center gap-2">
                {labels.gridBordersSwitch ? (
                  <Label htmlFor="task-gantt-grid-borders" className="cursor-pointer whitespace-nowrap text-xs text-muted-foreground" title={labels.gridBordersHelp}>
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
            ) : null}
            {(labels.gridBordersSwitch || labels.gridBordersHelp) && (labels.actualBarsSwitch || labels.actualBarsHelp) ? (
              <Separator orientation="vertical" className="hidden h-7 shrink-0 self-center sm:block" />
            ) : null}
            {labels.actualBarsSwitch || labels.actualBarsHelp ? (
              <div className="flex items-center gap-2">
                {labels.actualBarsSwitch ? (
                  <Label htmlFor="task-gantt-actual-bars" className="cursor-pointer whitespace-nowrap text-xs text-muted-foreground" title={labels.actualBarsHelp}>
                    {labels.actualBarsSwitch}
                  </Label>
                ) : null}
                <Switch
                  id="task-gantt-actual-bars"
                  size="sm"
                  className="shrink-0 data-[state=checked]:border-emerald-700 data-[state=checked]:bg-emerald-600 data-[state=checked]:text-white dark:data-[state=checked]:border-emerald-600 dark:data-[state=checked]:bg-emerald-600"
                  checked={showActualBars}
                  onCheckedChange={v => persistShowActualBars(v === true)}
                  title={labels.actualBarsHelp}
                  aria-label={labels.actualBarsHelp ?? labels.actualBarsSwitch}
                />
              </div>
            ) : null}
            {labels.gridBordersSwitch || labels.gridBordersHelp || labels.actualBarsSwitch || labels.actualBarsHelp ? (
              <Separator orientation="vertical" className="hidden h-7 shrink-0 self-center sm:block" />
            ) : null}
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
        ref={ganttLayoutRootRef}
        data-gantt-layout-root
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col rounded-md border border-border/70 bg-muted/10',
          timelineChromeFlash && 'bg-primary/[0.07] shadow-[inset_0_0_0_2px_hsl(var(--primary)/0.22)] motion-reduce:bg-muted/10 motion-reduce:shadow-none',
          layoutModeTransitionPending && 'motion-safe:opacity-[0.98]'
        )}
        style={ganttLayoutRootStyle}
        aria-busy={layoutModeTransitionPending}
      >
        {/*
          `combine` dùng cây split riêng. Timeline-only ↔ workload-only: React 19 `<Activity>` giữ subtree mounted (ẩn bằng mode hidden)
          để đổi tab nhanh; không dùng key trên flex wrapper để tránh remount cả board.
        */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {showCombineSplit ? (
            <div ref={ganttWorkloadSplitRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div ref={ganttWorkloadPaneRef} className="flex min-h-0 w-full min-w-0 flex-col overflow-hidden" style={{ flexShrink: 0 }}>
                {renderGanttPanelBody()}
              </div>
              <button
                type="button"
                aria-label={t('taskManagement.ganttWorkloadSplitResize')}
                className={cn(
                  'relative z-[15] flex w-full shrink-0 cursor-ns-resize touch-none items-center justify-center',
                  'rounded-none border-0 border-y border-[0.5px] border-border/50 bg-muted/40 p-0 hover:bg-muted/70',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
                )}
                onPointerDown={onGanttWorkloadSplitPointerDown}
                onPointerMove={onGanttWorkloadSplitPointerMove}
                onPointerUp={endGanttWorkloadSplitPointer}
                onPointerCancel={endGanttWorkloadSplitPointer}
              ></button>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">{renderWorkloadBoardPane()}</div>
            </div>
          ) : !showGanttMain && !showWorkloadBlock ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{renderGanttPanelBody()}</div>
          ) : (
            <>
              <Activity mode={showGanttMain ? 'visible' : 'hidden'} name="task-gantt-timeline-standalone">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{renderGanttPanelBody()}</div>
              </Activity>
              <Activity mode={showWorkloadBlock ? 'visible' : 'hidden'} name="task-gantt-workload-standalone">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{renderWorkloadBoardPane()}</div>
              </Activity>
            </>
          )}
        </div>

        {unscheduled.length > 0 ? (
          <div className="flex max-h-[min(40vh,18rem)] min-h-0 flex-col border-t border-border bg-background">
            <div
              className={cn('flex w-full min-w-0 shrink-0 items-stretch border-b bg-muted', showGridBorders ? 'border-border/70' : 'border-b-border/[0.08]')}
              style={{ height: HEADER_H }}
            >
              <div className="flex min-h-0 min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden px-2 sm:px-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {onToggleTaskSelect && onApplyBulkTaskSelection ? (
                    <Checkbox
                      className="h-4 w-4 shrink-0"
                      disabled={unscheduledBulkSelectableIds.length === 0}
                      checked={
                        unscheduledBulkSelectableIds.length === 0
                          ? false
                          : unscheduledBulkSelectableIds.every(id => selectedTaskIds?.has(id))
                            ? true
                            : unscheduledBulkSelectableIds.some(id => selectedTaskIds?.has(id))
                              ? 'indeterminate'
                              : false
                      }
                      onCheckedChange={v => {
                        onApplyBulkTaskSelection(unscheduledBulkSelectableIds, v === true)
                      }}
                      aria-label={t('taskManagement.ganttBulkSelectAllUnscheduled')}
                    />
                  ) : null}
                  <div className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[11px]">
                    {labels.unscheduled} <span className="tabular-nums">({unscheduled.length})</span>
                  </div>
                  {(groupingEffective === 'assignee' || groupingEffective === 'project') && unschedGroupedSegmentKeys.length > 0 ? (
                    <button
                      type="button"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground"
                      aria-label={allUnschedGroupsCollapsed ? t('taskManagement.ganttBulkUnfoldUnscheduledGroupsAria') : t('taskManagement.ganttBulkFoldUnscheduledGroupsAria')}
                      title={allUnschedGroupsCollapsed ? t('taskManagement.ganttBulkUnfoldUnscheduledGroupsAria') : t('taskManagement.ganttBulkFoldUnscheduledGroupsAria')}
                      onClick={e => {
                        e.stopPropagation()
                        toggleAllUnschedGroupSegmentsCollapsed()
                      }}
                    >
                      {allUnschedGroupsCollapsed ? <UnfoldVertical className="h-3.5 w-3.5" /> : <FoldVertical className="h-3.5 w-3.5" />}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex min-w-0 flex-col">
                {unscheduledGroups.map(group => {
                  const hasHeader = Boolean(group.title)
                  const groupExpanded = !hasHeader || !collapsedUnschedGroupSegmentKeys.has(group.segmentKey)
                  const groupBulkIds = group.tasks.filter(isTaskBulkSelectable).map(t => t.id)
                  return (
                    <div key={group.segmentKey} className="min-w-0">
                      {hasHeader ? (
                        <div className="flex min-h-[28px] min-w-0 items-center gap-1.5 border-b border-border/50 bg-muted px-2">
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
                        <ul className="p-1.5 grid grid-cols-1 gap-1 min-[420px]:grid-cols-2 min-[420px]:gap-1.5 min-[640px]:grid-cols-3 min-[880px]:grid-cols-4 min-[1120px]:grid-cols-5 min-[1440px]:grid-cols-6">
                          {group.tasks.map(uTask => {
                            const sh = statusColorMap?.[uTask.status]?.trim()
                            const bulkTitle = taskDisplayLabel(uTask, t('taskManagement.ganttNoTitle'))
                            return (
                              <li
                                key={uTask.id}
                                draggable={Boolean(onUpdatePlanDates && showGanttMain)}
                                onDragStart={
                                  onUpdatePlanDates && showGanttMain
                                    ? e => {
                                      e.dataTransfer.setData(PLAN_UNSCHED_TASK_DRAG_MIME, uTask.id)
                                      e.dataTransfer.setData('text/plain', uTask.id)
                                      e.dataTransfer.effectAllowed = 'copyMove'
                                    }
                                    : undefined
                                }
                                className={cn(
                                  'flex min-h-9 w-full min-w-0 items-center gap-1.5 rounded-md border border-border/80 bg-muted/20 px-1.5 py-1 shadow-sm transition-colors hover:bg-muted/35 sm:min-h-8 sm:gap-2 sm:px-2 sm:py-1.5',
                                  onUpdatePlanDates && showGanttMain && 'cursor-grab active:cursor-grabbing'
                                )}
                              >
                                <div
                                  className="w-1 shrink-0 self-stretch rounded-sm min-h-[1.35rem] sm:min-h-[1.25rem]"
                                  style={{ backgroundColor: sh || 'hsl(var(--primary))' }}
                                  aria-hidden
                                />
                                {onToggleTaskSelect && isTaskBulkSelectable(uTask) ? (
                                  <Checkbox
                                    className="h-4 w-4 shrink-0"
                                    checked={selectedTaskIds?.has(uTask.id) ?? false}
                                    onCheckedChange={() => onToggleTaskSelect(uTask.id)}
                                    onClick={e => e.stopPropagation()}
                                    aria-label={t('taskManagement.ganttBulkSelectTaskAria', { title: bulkTitle })}
                                  />
                                ) : null}
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 truncate text-left text-[10px] leading-tight hover:bg-muted/50 sm:text-[11px]"
                                  onClick={() => onSelectTask(uTask)}
                                >
                                  {taskDisplayLabel(uTask, t('taskManagement.ganttNoTitle'))}
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
    </div>
  )
}

/** Màu nền/chữ chip priority trên plan bar — khớp `TaskBoardCard` khi không có hex master; khi có thì `getBadgeStyle` ghi đè qua inline style. */
function planBarPriorityChipFallbackClass(priority: string) {
  switch (priority) {
    case 'critical':
      return 'bg-red-500/25 text-red-700 dark:text-red-400'
    case 'high':
      return 'bg-orange-500/25 text-orange-700 dark:text-orange-400'
    case 'medium':
      return 'bg-sky-500/20 text-sky-700 dark:text-sky-400'
    case 'low':
      return 'bg-emerald-500/25 text-emerald-700 dark:text-emerald-400'
    default:
      return ''
  }
}

const GanttTaskRow = memo(function GanttTaskRow({
  task,
  start,
  pixelPerDay,
  chartWidth,
  weekendColumnRects: weekendColumnRectsProp,
  statusColorMap,
  isSelected,
  onToggleTaskSelect,
  onOpenTaskById,
  onUpdatePlanDates,
  getAssigneeDisplay,
  getStatusLabel,
  getPriorityLabel,
  getStatusIcon,
  getPriorityIcon,
  getStatusToneClass,
  getPriorityToneClass,
  showGridBorders: showGridBordersProp,
  showActualBars = false,
  locale,
  actualBarRangeTitle,
  actualBarHintLateStart,
  actualBarHintLateFinish,
  actualBarHintLateBoth,
  actualBarHintEarly,
  actualBarHintOntime,
  planNonWorkingDatesForTask,
  indentLevel = 0,
  hasChildren = false,
  isExpanded = false,
  onToggleExpand,
  rowSegment = 'full',
  displayNo,
  metaRailExpanded = true,
  priorityColorMap,
  getBadgeStyle,
  /** Mini-Gantt trong Workload: hàng cuối khung con — viền đáy do wrapper `WorkloadUserWorkloadRow` đảm nhiệm. */
  omitBottomRowBorder = false,
}: {
  task: TaskTableRowTask
  start: Date
  pixelPerDay: number
  chartWidth: number
  weekendColumnRects?: { left: number; width: number }[]
  statusColorMap?: Record<string, string>
  /** Boolean per-row — tách khỏi selectedTaskIds Set để memo() so sánh primitive thay vì Set reference. */
  isSelected?: boolean
  onToggleTaskSelect?: (taskId: string) => void
  onOpenTaskById: (taskId: string) => void
  onUpdatePlanDates?: (taskId: string, planStartDate: string, planEndDate: string, version?: number) => Promise<boolean>
  getAssigneeDisplay?: (assigneeUserId: string | null) => string
  getStatusLabel: (status: string) => string
  getPriorityLabel: (priority: string) => string
  getStatusIcon: (status: string) => ReactNode
  getPriorityIcon: (priority: string) => ReactNode
  getStatusToneClass: (code: string) => string
  getPriorityToneClass: (code: string) => string
  priorityColorMap?: Record<string, string>
  getBadgeStyle?: (code: string, colorMap: Record<string, string>) => CSSProperties | undefined
  /** `undefined` = theo `data-gantt-grid` + `group/ganttGridShell` trên sheet Gantt. */
  showGridBorders?: boolean
  showActualBars?: boolean
  locale?: Locale
  actualBarRangeTitle?: string
  actualBarHintLateStart?: string
  actualBarHintLateFinish?: string
  actualBarHintLateBoth?: string
  actualBarHintEarly?: string
  actualBarHintOntime?: string
  /** Ngày nghỉ project (YYYY-MM-DD) — khớp workload / NETWORKDAYS; rỗng = chỉ trừ cuối tuần. */
  planNonWorkingDatesForTask?: string[]
  /** Mức indent cho sub-task (0 = root, 1 = child). */
  indentLevel?: number
  /** Task này có sub-task con hay không. */
  hasChildren?: boolean
  /** Accordion đang mở không. */
  isExpanded?: boolean
  /** Callback toggle accordion — parent giữ reference ổn định (`toggleExpand`). */
  onToggleExpand?: (taskId: string) => void
  rowSegment?: GanttRowSegment
  displayNo: string | null
  metaRailExpanded?: boolean
  omitBottomRowBorder?: boolean
}) {
  const { t } = useTranslation()
  const sRaw = parsePlanDate(task.planStartDate)
  const eRaw = parsePlanDate(task.planEndDate)
  const sNorm = sRaw && eRaw ? startOfDay(sRaw <= eRaw ? sRaw : eRaw) : null
  const eNorm = sRaw && eRaw ? startOfDay(sRaw <= eRaw ? eRaw : sRaw) : null

  const handleOpenTask = useCallback(() => {
    onOpenTaskById(task.id)
  }, [onOpenTaskById, task.id])

  const handleToggleExpand = useCallback(() => {
    onToggleExpand?.(task.id)
  }, [onToggleExpand, task.id])

  const handleToggleSelect = useCallback(() => {
    onToggleTaskSelect?.(task.id)
  }, [onToggleTaskSelect, task.id])

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

  const planNw = planNonWorkingDatesForTask ?? []
  const show = dragPreview ?? { start: sNorm, end: eNorm }
  const showOffset = differenceInCalendarDays(show.start, start)
  const showSpan = calendarSpanInclusive(show.start, show.end)
  const leftPx = Math.max(0, showOffset * pixelPerDay)
  const widthPx = Math.max(pixelPerDay * 0.5, showSpan * pixelPerDay)

  const timelineDays = Math.max(1, Math.round(chartWidth / pixelPerDay))
  const actualDayRange = showActualBars ? resolveGanttActualBarDayRange(task) : null
  const dateLocale = locale ?? enUS
  let actualStrip: {
    leftPx: number
    widthPx: number
    title: string
    tone: GanttActualBarTone
    sectionTitle: string
    rangeLine: string
    planWorkdaySpan: number
    actualCalendarSpan: number
    provisionalEndHint: string
    varianceLines: string[]
    hintText: string
  } | null = null
  if (actualDayRange) {
    const sIdx = differenceInCalendarDays(actualDayRange.start, start)
    const eIdx = differenceInCalendarDays(actualDayRange.end, start)
    if (eIdx >= 0 && sIdx < timelineDays) {
      const clS = Math.max(0, sIdx)
      const clE = Math.min(timelineDays - 1, eIdx)
      const al = clS * pixelPerDay
      const aw = Math.max(pixelPerDay * 0.5, (clE - clS + 1) * pixelPerDay)
      const maxW = chartWidth - al
      const sectionTitle = (actualBarRangeTitle ?? '').trim() || t('taskManagement.ganttActualBarRangeTitle')
      const { tone, startDelta, endDelta } = ganttActualBarWorkingVariance(sNorm, eNorm, actualDayRange, planNw)
      let hintRaw: string | undefined
      switch (tone) {
        case 'late_start':
          hintRaw = actualBarHintLateStart
          break
        case 'late_finish':
          hintRaw = actualBarHintLateFinish
          break
        case 'late_both':
          hintRaw = actualBarHintLateBoth
          break
        case 'early':
          hintRaw = actualBarHintEarly
          break
        default:
          hintRaw = actualBarHintOntime
      }
      const hintText = (hintRaw ?? '').trim()
      const rangeLine = `${format(actualDayRange.start, 'P', { locale: dateLocale })} – ${format(actualDayRange.end, 'P', { locale: dateLocale })}`
      const planWdForActualTip = workingDaysBetweenInclusive(sNorm, eNorm, planNw)
      const actualCalSpan = calendarSpanInclusive(actualDayRange.start, actualDayRange.end)
      const provisionalEndHint = ganttActualBarHasProvisionalEnd(task) ? (t('taskManagement.ganttActualBarProvisionalEndHint') ?? '').trim() : ''
      const varianceLines = ganttActualBarVarianceDayLinesFromDeltas(t, startDelta, endDelta)
      const variancePart = varianceLines.length ? ` · ${varianceLines.join(' · ')}` : ''
      const hintPart = hintText ? ` · ${hintText}` : ''
      const planPartAria = t('taskManagement.ganttPlanDurationDays', { count: planWdForActualTip })
      const actualCalAria = t('taskManagement.ganttActualCalendarDuration', { count: actualCalSpan })
      const provPart = provisionalEndHint ? ` ${provisionalEndHint}` : ''
      actualStrip = {
        leftPx: al,
        widthPx: Math.min(aw, maxW),
        tone,
        sectionTitle,
        rangeLine,
        planWorkdaySpan: planWdForActualTip,
        actualCalendarSpan: actualCalSpan,
        provisionalEndHint,
        varianceLines,
        hintText,
        title: `${sectionTitle}: ${rangeLine}. ${t('taskManagement.ganttActualBarComparePlanWorkdays')}: ${planPartAria}. ${t('taskManagement.ganttActualBarCompareActualCalendar')}: ${actualCalAria}.${provPart}${variancePart}${hintPart}`,
      }
    }
  }
  const hasActualStrip = Boolean(actualStrip)
  const planBarHeightPx = hasActualStrip ? 22 : 26
  const actualStripHeightPx = 4

  const statusHex = statusColorMap?.[task.status]
  const barTint = taskStatusBarStyle(statusHex)
  const barChartSurfaceStyle = hasChildren ? { ...(barTint ?? {}), backgroundColor: undefined, ...taskStatusBarParentFillStyle(statusHex) } : (barTint ?? {})

  const canDrag = Boolean(onUpdatePlanDates)
  const rowSelected = Boolean(isSelected)
  const assigneeText = getAssigneeDisplay?.(task.assigneeUserId) ?? (task.assigneeUserId?.trim() ? task.assigneeUserId : '—')
  const displayStatus = task.status
  const priority = (task.priority ?? 'medium') as string
  const statusLabel = getStatusLabel(displayStatus)
  const priorityLabel = getPriorityLabel(priority)

  const planRangeLine = `${format(show.start, 'P', { locale: dateLocale })} – ${format(show.end, 'P', { locale: dateLocale })}`
  const planWorkdaySpan = workingDaysBetweenInclusive(show.start, show.end, planNw)
  const planDurationCompact = t('taskManagement.ganttPlanBarDurationCompact', { count: planWorkdaySpan })
  const ganttNoTitle = t('taskManagement.ganttNoTitle')
  const planBarTitleShort = taskDisplayLabel(task, ganttNoTitle)
  const ticketBarText = task.ticketId?.trim() ?? ''
  const planBarAriaLabel = `${planBarTitleShort}. ${t('taskManagement.planStartDate')} / ${t('taskManagement.deadline')}: ${planRangeLine}. ${t('taskManagement.ganttPlanDurationAria', { count: planWorkdaySpan })}. ${statusLabel}. ${priorityLabel}. ${assigneeText}. ${t('taskManagement.progress')} ${ganttProgressPercentDisplay(task.progress)}.`
  const priorityBadgeStyle = getBadgeStyle?.(priority, priorityColorMap ?? {})
  const priorityHex = priorityColorMap?.[priority]?.trim()
  const priorityMetaTextStyle: CSSProperties | undefined = priorityHex ? { color: priorityHex } : undefined
  const planProgressPct = ganttProgressClamped(task.progress)
  const planProgressColor = getProgressColor(planProgressPct / 100)

  const indentPx = indentLevel * 16
  const seg = rowSegment

  const rowChromeFull = cn(
    'relative flex w-full shrink-0 items-stretch hover:bg-muted/25',
    rowSelected && 'bg-primary/[0.11] hover:bg-primary/[0.14] dark:bg-primary/15 dark:hover:bg-primary/[0.18]',
    ganttRowSheetBorderClasses(showGridBordersProp, rowSelected, omitBottomRowBorder)
  )
  const rowChromeHalf = cn(
    'flex shrink-0 items-stretch hover:bg-muted/25',
    rowSelected && 'bg-primary/[0.11] hover:bg-primary/[0.14] dark:bg-primary/15 dark:hover:bg-primary/[0.18]',
    ganttRowSheetBorderClasses(showGridBordersProp, rowSelected, omitBottomRowBorder)
  )

  const metaCellBg = rowSelected ? 'bg-transparent' : 'bg-background'

  const metaBlock = (
    <div
      className={cn(
        'flex shrink-0 flex-row items-stretch border-r border-border/50 transform-gpu',
        seg === 'full' && 'sticky left-0',
        rowSelected ? 'bg-transparent' : seg === 'meta' ? 'bg-background' : 'bg-background'
      )}
      style={{
        ...hbGantt.leftBlock,
        ...(seg === 'full' ? { zIndex: Z_GANTT_STICKY_ROW_META_FULL } : {}),
      }}
    >
      <div className={cn('flex min-w-0 shrink-0 items-center justify-center px-0.5 py-1 tabular-nums', metaCellBg, GANTT_META_COL_DIVIDER)} style={hbGantt.colNo}>
        <span className="truncate text-xs text-muted-foreground">{displayNo ?? ''}</span>
      </div>
      <div className={cn('flex min-w-0 shrink-0 items-center justify-center py-1', metaCellBg, GANTT_META_COL_DIVIDER)} style={hbGantt.colCheckbox}>
        {onToggleTaskSelect && isTaskBulkSelectable(task) ? (
          <Checkbox
            checked={isSelected ?? false}
            onCheckedChange={handleToggleSelect}
            className="h-4 w-4 shrink-0"
            aria-label={t('taskManagement.ganttBulkSelectTaskAria', {
              title: taskDisplayLabel(task, ganttNoTitle),
            })}
          />
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" aria-hidden />
        )}
      </div>
      <div
        className={cn('flex min-h-0 min-w-0 flex-1 flex-row items-center gap-1 px-2 py-1 transform-gpu bg-background', metaCellBg, metaRailExpanded && GANTT_META_COL_DIVIDER)}
        style={hbGantt.nameCol}
      >
        {indentPx > 0 ? <span className="shrink-0" style={{ width: indentPx }} aria-hidden /> : null}
        {hasChildren ? (
          <button
            type="button"
            className="flex h-5 w-5 shrink-0 items-center justify-center"
            onClick={handleToggleExpand}
            aria-label={isExpanded ? t('taskManagement.ganttCollapseSubtasks') : t('taskManagement.ganttExpandSubtasks')}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : indentLevel > 0 ? (
          <span className="h-5 w-5 shrink-0" aria-hidden />
        ) : null}
        <button
          type="button"
          className={cn(
            'min-w-0 flex-1 truncate text-left text-xs font-medium leading-tight text-foreground underline-offset-2 hover:underline',
            indentLevel > 0 && 'text-muted-foreground'
          )}
          title={taskDisplayLabel(task, ganttNoTitle)}
          onClick={handleOpenTask}
        >
          {taskDisplayLabel(task, ganttNoTitle)}
        </button>
      </div>
      <div className={cn('flex min-w-0 shrink items-center py-1', metaCellBg, metaRailExpanded && GANTT_META_COL_DIVIDER)} style={hbGantt.colAssignee} title={assigneeText}>
        <span className="truncate text-xs text-muted-foreground">{assigneeText}</span>
      </div>
      <div className={cn('flex min-w-0 shrink items-center py-1', metaCellBg, metaRailExpanded && GANTT_META_COL_DIVIDER)} style={hbGantt.colStatus} title={statusLabel}>
        <span className={cn('flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-tight [&_svg]:shrink-0', getStatusToneClass(displayStatus))}>
          <span className="[&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
            {getStatusIcon(displayStatus)}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{statusLabel}</span>
        </span>
      </div>
      <div className={cn('flex min-w-0 shrink items-center py-1', metaCellBg, metaRailExpanded && GANTT_META_COL_DIVIDER)} style={hbGantt.colPriority} title={priorityLabel}>
        <span
          className={cn(
            'flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-tight [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0',
            !priorityHex && getPriorityToneClass(priority)
          )}
          style={priorityMetaTextStyle}
        >
          <span className="[&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
            {getPriorityIcon(priority)}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{priorityLabel}</span>
        </span>
      </div>
      <div
        className={cn('flex min-w-0 shrink items-center justify-start py-1 tabular-nums', metaCellBg)}
        style={hbGantt.colProgress}
        title={ganttProgressPercentDisplay(task.progress)}
      >
        <GanttProgressGauge progress={task.progress} />
      </div>
    </div>
  )

  const chartBlock = (
    <div className="relative flex min-h-0 min-w-0 overflow-hidden bg-transparent" style={{ width: chartWidth }}>
      {weekendColumnRectsProp && weekendColumnRectsProp.length > 0 ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
          {weekendColumnRectsProp.map((r, i) => (
            <div
              key={`row-wk-${task.id}-${r.left}-${i}`}
              className="absolute top-0 bottom-0 bg-slate-500/[0.11] dark:bg-slate-400/[0.05]"
              style={{ left: r.left, width: r.width }}
            />
          ))}
        </div>
      ) : null}
      <div className="relative z-[2] my-[0.35rem] h-[26px] w-full shrink-0" style={{ width: chartWidth }}>
        {actualStrip ? (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <div
                role="img"
                aria-label={actualStrip.title}
                className={cn('pointer-events-auto absolute z-[2] cursor-default rounded-sm border h-[4px]! shadow-sm', ganttActualBarStripSurfaceClass(actualStrip.tone))}
                style={{
                  left: actualStrip.leftPx,
                  width: actualStrip.widthPx,
                  top: planBarHeightPx,
                  height: actualStripHeightPx,
                  maxWidth: chartWidth - actualStrip.leftPx,
                }}
              />
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={8}
              className="max-w-[18rem] w-[min(18rem,calc(100vw-1.5rem))] border border-border/70 bg-popover p-0 text-popover-foreground shadow-lg"
            >
              <div className="relative overflow-hidden px-3.5 pb-3 pt-3">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent" aria-hidden />
                <p className="relative text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{actualStrip.sectionTitle}</p>
                <p className="relative mt-1 line-clamp-2 text-left text-xs font-medium leading-snug text-foreground">{taskDisplayLabel(task, ganttNoTitle)}</p>
                <p className="relative mt-2 text-sm font-semibold tabular-nums leading-snug text-foreground">{actualStrip.rangeLine}</p>
                <div className="relative mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-border/60 pt-2 text-[11px] leading-snug text-muted-foreground">
                  <span>
                    {t('taskManagement.ganttActualBarComparePlanWorkdays')}:
                    <span className="ml-1 font-medium tabular-nums text-foreground">{t('taskManagement.ganttPlanDurationDays', { count: actualStrip.planWorkdaySpan })}</span>
                  </span>
                  <span className="text-muted-foreground/50" aria-hidden>
                    ·
                  </span>
                  <span>
                    {t('taskManagement.ganttActualBarCompareActualCalendar')}:
                    <span className="ml-1 font-medium tabular-nums text-foreground">
                      {t('taskManagement.ganttActualCalendarDuration', { count: actualStrip.actualCalendarSpan })}
                    </span>
                  </span>
                </div>
                {actualStrip.provisionalEndHint ? (
                  <p className="relative mt-2 rounded-md border border-amber-500/35 bg-amber-500/[0.08] px-2 py-1.5 text-[11px] leading-snug text-foreground dark:border-amber-400/28 dark:bg-amber-500/10">
                    {actualStrip.provisionalEndHint}
                  </p>
                ) : null}
                <ul className="relative mt-2 space-y-1 border-t border-border/60 pt-2 text-[11px] leading-snug text-muted-foreground">
                  <li className="tabular-nums">{actualStrip.varianceLines[0]}</li>
                  <li className="tabular-nums">{actualStrip.varianceLines[1]}</li>
                </ul>
                {actualStrip.hintText ? (
                  <p className="relative mt-2 border-t border-border/60 pt-2 text-[11px] leading-snug text-muted-foreground">{actualStrip.hintText}</p>
                ) : null}
                <div className={cn('relative mt-2 h-1.5 w-full overflow-hidden rounded-full border', ganttActualBarStripSurfaceClass(actualStrip.tone))} aria-hidden />
              </div>
            </TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            {/* biome-ignore lint/a11y/useSemanticElements: plan bar groups drag handles; not a form fieldset. */}
            <div
              role="group"
              aria-label={planBarAriaLabel}
              className={cn(
                'absolute top-0 z-[3] flex min-w-[8px] border-none! select-none rounded-xs text-[11px] font-medium text-foreground',
                hasActualStrip && 'rounded-b-none',
                !hasChildren && !barTint && 'bg-primary/25'
              )}
              style={{
                left: leftPx,
                width: widthPx,
                maxWidth: chartWidth - leftPx,
                height: planBarHeightPx,
                ...barChartSurfaceStyle,
              }}
            >
              {canDrag ? (
                <button
                  type="button"
                  aria-label={t('taskManagement.ganttResizePlanStart')}
                  className="h-full w-2 shrink-0 cursor-ew-resize touch-none rounded-l-[3px] hover:bg-black/10 dark:hover:bg-white/15"
                  onPointerDown={e => beginDrag('resize-l', e)}
                />
              ) : (
                <span className="w-1 shrink-0" />
              )}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: Gantt timeline drag */}
              <div
                role="presentation"
                className={cn('flex min-h-0 min-w-0 flex-1 cursor-default items-center gap-1 overflow-hidden px-0.5', canDrag && 'cursor-grab active:cursor-grabbing')}
                style={{ minHeight: planBarHeightPx }}
                onPointerDown={e => canDrag && beginDrag('move', e)}
                onDoubleClick={handleOpenTask}
              >
                <div className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-hidden">
                  <span
                    className={cn(
                      'inline-flex max-h-[16px] shrink-0 items-center gap-0.5 rounded px-1 py-px text-[9px] font-semibold leading-none [&_svg]:h-2.5 [&_svg]:w-2.5 [&_svg]:shrink-0',
                      planBarPriorityChipFallbackClass(priority)
                    )}
                    style={priorityBadgeStyle}
                    title={priorityLabel}
                  >
                    {getPriorityIcon(priority)}
                    <span className="max-w-[4rem] truncate">{priorityLabel}</span>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left text-[9px] font-semibold tabular-nums text-foreground/90" title={planBarTitleShort}>
                    {planBarTitleShort}
                  </span>
                </div>
                <span className="pointer-events-none shrink-0 text-[10px] font-semibold tabular-nums text-foreground/90">{planDurationCompact}</span>
              </div>
              {canDrag ? (
                <button
                  type="button"
                  aria-label={t('taskManagement.ganttResizePlanEnd')}
                  className="h-full w-2 shrink-0 cursor-ew-resize touch-none rounded-r-[3px] hover:bg-black/10 dark:hover:bg-white/15"
                  onPointerDown={e => beginDrag('resize-r', e)}
                />
              ) : null}
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            sideOffset={8}
            className="max-w-[18rem] w-[min(18rem,calc(100vw-1.5rem))] border border-border/70 bg-popover p-0 text-popover-foreground shadow-lg"
          >
            <div className="relative overflow-hidden px-3.5 pb-3 pt-3">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent" aria-hidden />
              <p className="relative text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('taskManagement.planStartDate')} · {t('taskManagement.deadline')}
              </p>
              <p className="relative mt-1 line-clamp-2 text-left text-xs font-medium leading-snug text-foreground">{planBarTitleShort}</p>
              <p className="relative mt-2 text-sm font-semibold tabular-nums leading-snug text-foreground">{planRangeLine}</p>
              <p className="relative mt-1.5 text-[11px] tabular-nums leading-tight text-muted-foreground">
                {t('taskManagement.ganttPlanDuration')}:{' '}
                <span className="font-medium text-foreground">{t('taskManagement.ganttPlanDurationDays', { count: planWorkdaySpan })}</span>
              </p>
              <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-primary/15 ring-1 ring-border/50">
                <div className="h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${planProgressPct}%`, backgroundColor: planProgressColor }} />
              </div>
              <dl className="relative mt-3 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[11px] leading-tight">
                <dt className="text-muted-foreground">{t('taskManagement.status')}</dt>
                <dd className="min-w-0 text-right font-medium text-foreground">{statusLabel}</dd>
                <dt className="text-muted-foreground">{t('taskManagement.priority')}</dt>
                <dd className="min-w-0 text-right font-medium text-foreground">{priorityLabel}</dd>
                {ticketBarText ? (
                  <>
                    <dt className="text-muted-foreground">{t('taskManagement.ticketId')}</dt>
                    <dd className="min-w-0 truncate text-right font-medium text-foreground">{ticketBarText}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">{t('taskManagement.assignee')}</dt>
                <dd className="min-w-0 truncate text-right text-foreground">{assigneeText}</dd>
                <dt className="text-muted-foreground">{t('taskManagement.progress')}</dt>
                <dd className="text-right font-semibold tabular-nums" style={{ color: planProgressColor }}>
                  {Math.round(planProgressPct)}%
                </dd>
              </dl>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )

  if (seg === 'meta') {
    return (
      <div className={cn(rowChromeHalf, 'w-full')} style={{ height: GANTT_ROW_H }}>
        {metaBlock}
      </div>
    )
  }
  if (seg === 'chart') {
    return (
      <div className={cn(rowChromeHalf, 'relative w-full overflow-hidden')} style={{ height: GANTT_ROW_H, width: chartWidth }}>
        {chartBlock}
      </div>
    )
  }

  return (
    <div className={rowChromeFull} style={{ height: GANTT_ROW_H }}>
      {metaBlock}
      {chartBlock}
    </div>
  )
})

/** Mini-Gantt trong workload expand: meta và chart tách cột; cuộn dọc chỉ trong con để `sticky left` của khối meta bám đúng scrollport ngang của workload (không bọc cả hai trong một `overflow-y-auto`). */
const WorkloadMiniGanttSplitPanel = memo(function WorkloadMiniGanttSplitPanel({
  userTasks,
  chartWidth,
  start,
  pixelPerDay,
  weekendColumnRects,
  statusColorMap,
  selectedTaskIds,
  onToggleTaskSelect,
  onOpenTaskById,
  onUpdatePlanDates,
  getAssigneeDisplay,
  getStatusLabel,
  getPriorityLabel,
  getStatusIcon,
  getPriorityIcon,
  getStatusToneClass,
  getPriorityToneClass,
  priorityColorMap,
  getBadgeStyle,
  metaRailExpanded,
  wg,
  locale,
  planNonWorkingByProjectId,
}: {
  userTasks: TaskTableRowTask[]
  chartWidth: number
  start: Date
  pixelPerDay: number
  weekendColumnRects: { left: number; width: number }[]
  statusColorMap?: Record<string, string>
  selectedTaskIds?: Set<string>
  onToggleTaskSelect?: (taskId: string) => void
  onOpenTaskById: (taskId: string) => void
  onUpdatePlanDates?: (taskId: string, planStartDate: string, planEndDate: string, version?: number) => Promise<boolean>
  getAssigneeDisplay?: (assigneeUserId: string | null) => string
  getStatusLabel: (status: string) => string
  getPriorityLabel: (priority: string) => string
  getStatusIcon: (status: string) => ReactNode
  getPriorityIcon: (priority: string) => ReactNode
  getStatusToneClass: (code: string) => string
  getPriorityToneClass: (code: string) => string
  priorityColorMap?: Record<string, string>
  getBadgeStyle?: (code: string, colorMap: Record<string, string>) => CSSProperties | undefined
  metaRailExpanded: boolean
  wg: GanttVirtualRowChromePrefs
  locale: Locale
  planNonWorkingByProjectId: ReadonlyMap<string, readonly string[]>
}) {
  const metaScrollRef = useRef<HTMLDivElement>(null)
  const chartScrollRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)

  const syncFromMeta = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (syncingRef.current) return
    syncingRef.current = true
    const top = e.currentTarget.scrollTop
    const other = chartScrollRef.current
    if (other) other.scrollTop = top
    syncingRef.current = false
  }, [])

  const syncFromChart = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (syncingRef.current) return
    syncingRef.current = true
    const top = e.currentTarget.scrollTop
    const other = metaScrollRef.current
    if (other) other.scrollTop = top
    syncingRef.current = false
  }, [])

  const paneHeight = Math.min(userTasks.length * GANTT_ROW_H, WORKLOAD_EXPANDED_MINI_MAX_SCROLL_PX)

  return (
    <div className="relative flex min-w-0 flex-row items-stretch bg-background" style={{ height: paneHeight }}>
      <div
        className="sticky left-0 isolate flex h-full min-h-0 shrink-0 flex-col border-r border-border/50 bg-background transform-gpu"
        style={{ ...hbGantt.leftBlock, zIndex: Z_GANTT_STICKY_ROW_META_FULL }}
      >
        <div ref={metaScrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden" onScroll={syncFromMeta}>
          {userTasks.map((task, index) => (
            <GanttTaskRow
              key={`workload-mini-m-${task.id}`}
              task={task}
              start={start}
              pixelPerDay={pixelPerDay}
              chartWidth={chartWidth}
              weekendColumnRects={weekendColumnRects}
              statusColorMap={statusColorMap}
              isSelected={selectedTaskIds?.has(task.id) ?? false}
              onToggleTaskSelect={onToggleTaskSelect}
              onOpenTaskById={onOpenTaskById}
              onUpdatePlanDates={onUpdatePlanDates}
              getAssigneeDisplay={getAssigneeDisplay}
              getStatusLabel={getStatusLabel}
              getPriorityLabel={getPriorityLabel}
              getStatusIcon={getStatusIcon}
              getPriorityIcon={getPriorityIcon}
              getStatusToneClass={getStatusToneClass}
              getPriorityToneClass={getPriorityToneClass}
              priorityColorMap={priorityColorMap}
              getBadgeStyle={getBadgeStyle}
              metaRailExpanded={metaRailExpanded}
              showGridBorders={wg.showGridBorders}
              showActualBars={wg.showActualBars}
              locale={locale}
              actualBarRangeTitle={wg.actualBarRangeTitle}
              actualBarHintLateStart={wg.actualBarHintLateStart}
              actualBarHintLateFinish={wg.actualBarHintLateFinish}
              actualBarHintLateBoth={wg.actualBarHintLateBoth}
              actualBarHintEarly={wg.actualBarHintEarly}
              actualBarHintOntime={wg.actualBarHintOntime}
              planNonWorkingDatesForTask={(planNonWorkingByProjectId.get((task.projectId ?? '').trim()) as string[] | undefined) ?? EMPTY_NON_WORKING}
              hasChildren={false}
              indentLevel={0}
              isExpanded={false}
              rowSegment="meta"
              displayNo={String(index + 1)}
              omitBottomRowBorder={index === userTasks.length - 1}
            />
          ))}
        </div>
      </div>
      <div className="relative flex h-full min-h-0 shrink-0 flex-col overflow-x-clip" style={{ width: chartWidth }}>
        {wg.showGridBorders && wg.workloadDisplayMode === 'hours' ? (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-[1] overflow-hidden" style={{ width: chartWidth }}>
            <GanttTimelineGridOverlay scale={wg.scale} pixelPerDay={pixelPerDay} chartWidth={chartWidth} verticalGridLineLeftPx={wg.verticalGridLineLeftPx} />
          </div>
        ) : null}
        <div ref={chartScrollRef} className="relative z-[2] min-h-0 flex-1 overflow-y-auto overflow-x-clip" onScroll={syncFromChart}>
          {userTasks.map((task, index) => (
            <GanttTaskRow
              key={`workload-mini-c-${task.id}`}
              task={task}
              start={start}
              pixelPerDay={pixelPerDay}
              chartWidth={chartWidth}
              weekendColumnRects={weekendColumnRects}
              statusColorMap={statusColorMap}
              isSelected={selectedTaskIds?.has(task.id) ?? false}
              onToggleTaskSelect={onToggleTaskSelect}
              onOpenTaskById={onOpenTaskById}
              onUpdatePlanDates={onUpdatePlanDates}
              getAssigneeDisplay={getAssigneeDisplay}
              getStatusLabel={getStatusLabel}
              getPriorityLabel={getPriorityLabel}
              getStatusIcon={getStatusIcon}
              getPriorityIcon={getPriorityIcon}
              getStatusToneClass={getStatusToneClass}
              getPriorityToneClass={getPriorityToneClass}
              priorityColorMap={priorityColorMap}
              getBadgeStyle={getBadgeStyle}
              metaRailExpanded={metaRailExpanded}
              showGridBorders={wg.showGridBorders}
              showActualBars={wg.showActualBars}
              locale={locale}
              actualBarRangeTitle={wg.actualBarRangeTitle}
              actualBarHintLateStart={wg.actualBarHintLateStart}
              actualBarHintLateFinish={wg.actualBarHintLateFinish}
              actualBarHintLateBoth={wg.actualBarHintLateBoth}
              actualBarHintEarly={wg.actualBarHintEarly}
              actualBarHintOntime={wg.actualBarHintOntime}
              planNonWorkingDatesForTask={(planNonWorkingByProjectId.get((task.projectId ?? '').trim()) as string[] | undefined) ?? EMPTY_NON_WORKING}
              hasChildren={false}
              indentLevel={0}
              isExpanded={false}
              rowSegment="chart"
              displayNo={String(index + 1)}
              omitBottomRowBorder={index === userTasks.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  )
})

const GanttMilestoneRow = memo(function GanttMilestoneRow({
  task,
  start,
  pixelPerDay,
  chartWidth,
  weekendColumnRects: weekendColumnRectsProp,
  isSelected,
  onOpenTaskById,
  showGridBorders: showGridBordersProp,
  milestoneLabel,
  indentLevel = 0,
  hasChildren = false,
  isExpanded = false,
  onToggleExpand,
  rowSegment = 'full',
}: {
  task: TaskTableRowTask
  start: Date
  pixelPerDay: number
  chartWidth: number
  weekendColumnRects?: { left: number; width: number }[]
  isSelected?: boolean
  onOpenTaskById: (taskId: string) => void
  /** `undefined` = theo `data-gantt-grid` trên sheet Gantt. */
  showGridBorders?: boolean
  milestoneLabel?: string
  indentLevel?: number
  hasChildren?: boolean
  isExpanded?: boolean
  onToggleExpand?: (taskId: string) => void
  rowSegment?: GanttRowSegment
}) {
  const { t } = useTranslation()
  const milestoneDate = parsePlanDate(task.planStartDate)

  const handleOpenTask = useCallback(() => {
    onOpenTaskById(task.id)
  }, [onOpenTaskById, task.id])

  const handleToggleExpand = useCallback(() => {
    onToggleExpand?.(task.id)
  }, [onToggleExpand, task.id])

  if (!milestoneDate) return null

  const dayIndex = differenceInCalendarDays(milestoneDate, start)
  const centerPx = dayIndex * pixelPerDay + pixelPerDay / 2

  const rowSelected = Boolean(isSelected)
  const indentPx = indentLevel * 16
  const titleShown = taskDisplayLabel(task, t('taskManagement.ganttNoTitle'))
  const typeShown = (milestoneLabel ?? '').trim() || t('taskManagement.ganttMilestoneLabel')
  const tooltipText = t('taskManagement.ganttMilestoneMarkerAria', { type: typeShown, title: titleShown })
  const seg = rowSegment

  const rowChromeFull = cn(
    'relative flex w-full shrink-0 items-stretch hover:bg-muted/25',
    rowSelected && 'bg-primary/[0.11] hover:bg-primary/[0.14] dark:bg-primary/15 dark:hover:bg-primary/[0.18]',
    ganttRowSheetBorderClasses(showGridBordersProp, rowSelected)
  )
  const rowChromeHalf = cn(
    'flex shrink-0 items-stretch hover:bg-muted/25',
    rowSelected && 'bg-primary/[0.11] hover:bg-primary/[0.14] dark:bg-primary/15 dark:hover:bg-primary/[0.18]',
    ganttRowSheetBorderClasses(showGridBordersProp, rowSelected)
  )

  /** Một hàng meta duy nhất trải toàn block trái — không No / checkbox / rail. */
  const metaBlock = (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-row items-center gap-1 px-2 py-1 transform-gpu',
        seg === 'full' && 'sticky left-0',
        rowSelected ? 'bg-transparent' : 'bg-background'
      )}
      style={{
        ...hbGantt.leftBlock,
        ...(seg === 'full' ? { zIndex: Z_GANTT_STICKY_ROW_META_FULL } : {}),
      }}
    >
      {indentPx > 0 ? <span className="shrink-0" style={{ width: indentPx }} aria-hidden /> : null}
      {hasChildren ? (
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          onClick={handleToggleExpand}
          aria-label={isExpanded ? t('taskManagement.ganttCollapseSubtasks') : t('taskManagement.ganttExpandSubtasks')}
          aria-expanded={isExpanded}
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      ) : indentLevel > 0 ? (
        <span className="h-5 w-5 shrink-0" aria-hidden />
      ) : null}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-amber-500" aria-hidden>
          <svg viewBox="0 0 12 12" className="h-[14px] w-[14px] fill-current">
            <path d="M6 0 L12 6 L6 12 L0 6 Z" />
          </svg>
        </span>
        <button
          type="button"
          className="min-w-0 max-w-full truncate text-center text-sm font-semibold uppercase tracking-wide leading-tight text-amber-600 dark:text-amber-400 underline-offset-2 hover:underline"
          title={tooltipText}
          onClick={handleOpenTask}
        >
          {titleShown}
        </button>
      </div>
    </div>
  )

  const chartBlock = (
    <div className="relative flex min-h-0 min-w-0 overflow-hidden bg-transparent" style={{ width: chartWidth }}>
      {weekendColumnRectsProp && weekendColumnRectsProp.length > 0 ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
          {weekendColumnRectsProp.map((r, i) => (
            <div
              key={`ms-wk-${task.id}-${r.left}-${i}`}
              className="absolute top-0 bottom-0 bg-slate-500/[0.11] dark:bg-slate-400/[0.05]"
              style={{ left: r.left, width: r.width }}
            />
          ))}
        </div>
      ) : null}
      <div className="relative z-[2] my-[0.35rem] h-[26px] w-full shrink-0" style={{ width: chartWidth }}>
        {centerPx >= 0 && centerPx <= chartWidth ? (
          <button
            type="button"
            className="absolute z-[3] -translate-x-1/2 -translate-y-1/2 p-1 group"
            style={{ left: centerPx, top: '50%' }}
            title={tooltipText}
            onDoubleClick={handleOpenTask}
            onClick={handleOpenTask}
            aria-label={tooltipText}
          >
            <div
              className={cn(
                'h-[14px] w-[14px] rotate-45 rounded-[2px] border-2 transition-transform duration-100 group-hover:scale-125',
                !hasChildren && !rowSelected && 'border-amber-500 bg-amber-400/80 dark:border-amber-400 dark:bg-amber-500/60',
                hasChildren && !rowSelected && 'border-amber-600 dark:border-amber-400',
                rowSelected && !hasChildren && 'border-primary bg-primary/70 dark:border-primary dark:bg-primary/60',
                rowSelected && hasChildren && 'border-primary dark:border-primary'
              )}
              style={
                hasChildren && !rowSelected
                  ? {
                    backgroundImage:
                      'linear-gradient(to bottom, rgba(217, 119, 6, 0.95) 0%, rgba(217, 119, 6, 0.95) 50%, rgba(251, 191, 36, 0.72) 50%, rgba(251, 191, 36, 0.72) 100%)',
                  }
                  : hasChildren && rowSelected
                    ? {
                      backgroundImage:
                        'linear-gradient(to bottom, hsl(var(--primary) / 0.88) 0%, hsl(var(--primary) / 0.88) 50%, hsl(var(--primary) / 0.58) 50%, hsl(var(--primary) / 0.58) 100%)',
                    }
                    : undefined
              }
            />
          </button>
        ) : null}
      </div>
    </div>
  )

  if (seg === 'meta') {
    return (
      <div className={cn(rowChromeHalf, 'w-full')} style={{ height: GANTT_ROW_H }}>
        {metaBlock}
      </div>
    )
  }
  if (seg === 'chart') {
    return (
      <div className={cn(rowChromeHalf, 'relative w-full overflow-hidden')} style={{ height: GANTT_ROW_H, width: chartWidth }}>
        {chartBlock}
      </div>
    )
  }

  return (
    <div className={rowChromeFull} style={{ height: GANTT_ROW_H }}>
      {metaBlock}
      {chartBlock}
    </div>
  )
})

const GanttUnscheduledSubtaskRow = memo(function GanttUnscheduledSubtaskRow({
  task,
  chartWidth,
  weekendColumnRects: weekendColumnRectsProp,
  isSelected,
  onToggleTaskSelect,
  onOpenTaskById,
  getAssigneeDisplay,
  getStatusLabel,
  getPriorityLabel,
  getStatusIcon,
  getPriorityIcon,
  getStatusToneClass,
  getPriorityToneClass,
  priorityColorMap,
  showGridBorders: showGridBordersProp,
  noPlanHint,
  indentLevel = 1,
  rowSegment = 'full',
  displayNo,
  metaRailExpanded = true,
}: {
  task: TaskTableRowTask
  chartWidth: number
  weekendColumnRects?: { left: number; width: number }[]
  isSelected?: boolean
  onToggleTaskSelect?: (taskId: string) => void
  onOpenTaskById: (taskId: string) => void
  getAssigneeDisplay?: (assigneeUserId: string | null) => string
  getStatusLabel: (status: string) => string
  getPriorityLabel: (priority: string) => string
  getStatusIcon: (status: string) => ReactNode
  getPriorityIcon: (priority: string) => ReactNode
  getStatusToneClass: (code: string) => string
  getPriorityToneClass: (code: string) => string
  priorityColorMap?: Record<string, string>
  /** `undefined` = theo `data-gantt-grid` trên sheet Gantt. */
  showGridBorders?: boolean
  noPlanHint: string
  indentLevel?: number
  rowSegment?: GanttRowSegment
  displayNo: string | null
  metaRailExpanded?: boolean
}) {
  const { t } = useTranslation()
  const handleOpenTask = useCallback(() => {
    onOpenTaskById(task.id)
  }, [onOpenTaskById, task.id])

  const handleToggleSelect = useCallback(() => {
    onToggleTaskSelect?.(task.id)
  }, [onToggleTaskSelect, task.id])

  const rowSelected = Boolean(isSelected)
  const assigneeText = getAssigneeDisplay?.(task.assigneeUserId) ?? (task.assigneeUserId?.trim() ? task.assigneeUserId : '—')
  const displayStatus = task.status
  const priority = (task.priority ?? 'medium') as string
  const statusLabel = getStatusLabel(displayStatus)
  const priorityLabel = getPriorityLabel(priority)
  const priorityHex = priorityColorMap?.[priority]?.trim()
  const priorityMetaTextStyle: CSSProperties | undefined = priorityHex ? { color: priorityHex } : undefined
  const indentPx = indentLevel * 16
  const seg = rowSegment
  const isMilestoneUnsched = task.type === 'milestone'
  const ganttNoTitle = t('taskManagement.ganttNoTitle')

  const rowChromeFull = cn(
    'relative flex w-full shrink-0 items-stretch hover:bg-muted/25',
    rowSelected && 'bg-primary/[0.11] hover:bg-primary/[0.14] dark:bg-primary/15 dark:hover:bg-primary/[0.18]',
    ganttRowSheetBorderClasses(showGridBordersProp, rowSelected)
  )
  const rowChromeHalf = cn(
    'flex shrink-0 items-stretch hover:bg-muted/25',
    rowSelected && 'bg-primary/[0.11] hover:bg-primary/[0.14] dark:bg-primary/15 dark:hover:bg-primary/[0.18]',
    ganttRowSheetBorderClasses(showGridBordersProp, rowSelected)
  )

  const metaCellBg = rowSelected ? 'bg-transparent' : 'bg-background'

  const metaBlock = isMilestoneUnsched ? (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-row items-center gap-1 px-2 py-1 transform-gpu',
        seg === 'full' && 'sticky left-0',
        rowSelected ? 'bg-transparent' : 'bg-background'
      )}
      style={{
        ...hbGantt.leftBlock,
        ...(seg === 'full' ? { zIndex: Z_GANTT_STICKY_ROW_META_FULL } : {}),
      }}
    >
      {indentPx > 0 ? <span className="shrink-0" style={{ width: indentPx }} aria-hidden /> : null}
      <span className="h-5 w-5 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-amber-500" aria-hidden>
          <svg viewBox="0 0 12 12" className="h-[14px] w-[14px] fill-current">
            <path d="M6 0 L12 6 L6 12 L0 6 Z" />
          </svg>
        </span>
        <button
          type="button"
          className="min-w-0 max-w-full truncate text-center text-sm font-semibold uppercase tracking-wide leading-tight text-amber-600 dark:text-amber-400 underline-offset-2 hover:underline"
          title={taskDisplayLabel(task, ganttNoTitle)}
          onClick={handleOpenTask}
        >
          {taskDisplayLabel(task, ganttNoTitle)}
        </button>
      </div>
    </div>
  ) : (
    <div
      className={cn(
        'flex shrink-0 flex-row items-stretch border-r border-border/50 transform-gpu',
        seg === 'full' && 'sticky left-0',
        rowSelected ? 'bg-transparent' : seg === 'meta' ? 'bg-background' : 'bg-background'
      )}
      style={{
        ...hbGantt.leftBlock,
        ...(seg === 'full' ? { zIndex: Z_GANTT_STICKY_ROW_META_FULL } : {}),
      }}
    >
      <div className={cn('flex min-w-0 shrink-0 items-center justify-center px-0.5 py-1 tabular-nums', metaCellBg, GANTT_META_COL_DIVIDER)} style={hbGantt.colNo}>
        <span className="truncate text-xs text-muted-foreground">{displayNo ?? ''}</span>
      </div>
      <div className={cn('flex min-w-0 shrink-0 items-center justify-center py-1', metaCellBg, GANTT_META_COL_DIVIDER)} style={hbGantt.colCheckbox}>
        {onToggleTaskSelect && isTaskBulkSelectable(task) ? (
          <Checkbox
            checked={isSelected ?? false}
            onCheckedChange={handleToggleSelect}
            className="h-4 w-4 shrink-0"
            aria-label={t('taskManagement.ganttBulkSelectTaskAria', {
              title: taskDisplayLabel(task, ganttNoTitle),
            })}
          />
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" aria-hidden />
        )}
      </div>
      <div className={cn('flex min-w-0 shrink-0 items-center gap-1 px-1.5 py-3', metaCellBg, metaRailExpanded && GANTT_META_COL_DIVIDER)} style={hbGantt.nameCol}>
        {indentPx > 0 ? <span className="shrink-0" style={{ width: indentPx }} aria-hidden /> : null}
        <span className="h-5 w-5 shrink-0" aria-hidden />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-xs font-medium leading-tight text-muted-foreground underline-offset-2 hover:underline"
          title={taskDisplayLabel(task, ganttNoTitle)}
          onClick={handleOpenTask}
        >
          {taskDisplayLabel(task, ganttNoTitle)}
        </button>
      </div>
      <div className={cn('flex min-w-0 shrink items-center py-1', metaCellBg, metaRailExpanded && GANTT_META_COL_DIVIDER)} style={hbGantt.colAssignee} title={assigneeText}>
        <span className="truncate text-xs text-muted-foreground">{assigneeText}</span>
      </div>
      <div className={cn('flex min-w-0 shrink items-center py-1', metaCellBg, metaRailExpanded && GANTT_META_COL_DIVIDER)} style={hbGantt.colStatus} title={statusLabel}>
        <span className={cn('flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-tight [&_svg]:shrink-0', getStatusToneClass(displayStatus))}>
          <span className="[&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
            {getStatusIcon(displayStatus)}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{statusLabel}</span>
        </span>
      </div>
      <div className={cn('flex min-w-0 shrink items-center py-1', metaCellBg, metaRailExpanded && GANTT_META_COL_DIVIDER)} style={hbGantt.colPriority} title={priorityLabel}>
        <span
          className={cn(
            'flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-tight [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0',
            !priorityHex && getPriorityToneClass(priority)
          )}
          style={priorityMetaTextStyle}
        >
          <span className="[&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
            {getPriorityIcon(priority)}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{priorityLabel}</span>
        </span>
      </div>
      <div
        className={cn('flex min-w-0 shrink items-center justify-start py-1 tabular-nums', metaCellBg)}
        style={hbGantt.colProgress}
        title={ganttProgressPercentDisplay(task.progress)}
      >
        <GanttProgressGauge progress={task.progress} />
      </div>
    </div>
  )

  const chartBlock = (
    <div className="relative flex min-h-0 min-w-0 items-center overflow-hidden bg-transparent" style={{ width: chartWidth }}>
      {weekendColumnRectsProp && weekendColumnRectsProp.length > 0 ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
          {weekendColumnRectsProp.map((r, i) => (
            <div
              key={`usub-wk-${task.id}-${r.left}-${i}`}
              className="absolute top-0 bottom-0 bg-slate-500/[0.11] dark:bg-slate-400/[0.05]"
              style={{ left: r.left, width: r.width }}
            />
          ))}
        </div>
      ) : null}
      <span className="relative z-[2] truncate px-2 text-[11px] italic text-muted-foreground">{noPlanHint}</span>
    </div>
  )

  if (seg === 'meta') {
    return (
      <div className={cn(rowChromeHalf, 'w-full')} style={{ height: GANTT_ROW_H }}>
        {metaBlock}
      </div>
    )
  }
  if (seg === 'chart') {
    return (
      <div className={cn(rowChromeHalf, 'relative w-full overflow-hidden')} style={{ height: GANTT_ROW_H, width: chartWidth }}>
        {chartBlock}
      </div>
    )
  }

  return (
    <div className={rowChromeFull} style={{ height: GANTT_ROW_H }}>
      {metaBlock}
      {chartBlock}
    </div>
  )
})
