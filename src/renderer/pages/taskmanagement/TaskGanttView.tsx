'use client'

import type { Locale } from 'date-fns'
import { addDays, addMonths, differenceInCalendarDays, format, getDay, getISOWeek, startOfDay, startOfMonth } from 'date-fns'
import { Briefcase, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Layers, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { parseLocalDate, toYyyyMmDd } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { TaskGanttWorkload, type WorkloadData, type WorkloadDisplayMode, type WorkloadOverrideUpsertInput } from './TaskGanttWorkload'
import type { TaskTableRowTask } from './TaskTableRow'
import { taskStatusBarParentFillStyle, taskStatusBarStyle } from './taskStatusVisual'

export type TaskGanttScale = 'week' | 'month' | 'monthly'

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
}

const LS_GANTT_ROWS = 'honey_badger.taskGantt.rowGroup.v1'
const LS_GANTT_LABEL_W = 'honey_badger.taskGantt.labelWidth.v1'
const LS_GANTT_GRID_BORDERS = 'honey_badger.taskGantt.gridBorders.v1'
const LS_GANTT_EXPANDED_PARENTS = 'honey_badger.taskGantt.expandedParents.v1'
/** segmentKey của nhóm By Assignee / By Project đang thu gọn (ẩn các task trong nhóm). */
const LS_GANTT_COLLAPSED_GROUP_SEGMENTS = 'honey_badger.taskGantt.collapsedGroupSegments.v1'
const LS_GANTT_META_RAIL_EXPANDED = 'honey_badger.taskGantt.metaRailExpanded.v1'
const DEFAULT_GANTT_LABEL_W = 216
const MIN_GANTT_LABEL_W = 160
const MAX_GANTT_LABEL_W = 520

/** Row height in px — matches Tailwind min-h-[36px] on every task/milestone row. */
const GANTT_ROW_H = 36
/** Khoảng cách từ đáy hàng tới đường ngang vòng dependency (backward/overlap) — luôn vòng phía dưới bar. */
const GANTT_DEP_BELOW_PAD = 10
/** Group segment header height in px — matches min-h-[28px] on segment title rows. */
const GROUP_HEADER_H = 28

/** Cột meta cố định (px) — sau Task Name. */
const GANTT_COL_ASSIGNEE_W = 128
const GANTT_COL_STATUS_W = 96
const GANTT_COL_PRIORITY_W = 84
/** % hoàn thành — sau Priority. */
const GANTT_COL_PROGRESS_W = 58
const GANTT_LEFT_META_FIXED_W =
  GANTT_COL_ASSIGNEE_W + GANTT_COL_STATUS_W + GANTT_COL_PRIORITY_W + GANTT_COL_PROGRESS_W

function ganttProgressPercentDisplay(progress: number | undefined): string {
  const n = Math.round(Math.min(100, Math.max(0, Number(progress ?? 0))))
  return `${n}%`
}

/** Viền dọc giữa các cột meta — cùng token với Workload (`border-border/50`). */
const GANTT_META_COL_DIVIDER = 'border-r border-border/50'
/**
 * Vạch lưới dọc timeline — header và body chart **phải** dùng chung (cùng `w-px` + màu).
 * Trước đây header dùng outline/`w-0` nên Chromium căn khác body → lệch ~1px ngang.
 */
const GANTT_TIMELINE_GRID_V_LINE =
  'pointer-events-none absolute top-0 bottom-0 z-[1] w-px bg-border/85 dark:bg-border/70 transform-gpu'

/** Dải cột meta (TASK TITLE, …) phải trên thanh meta body (45) khi scroll dọc, nhưng dưới `Popover`/`z-50` (DateRange, filter) — tránh lịch/tooltip bị chìm. */
const Z_GANTT_STICKY_TOP_HEADER = 48
const Z_GANTT_STICKY_BODY_LEFT_RAIL = 45
const Z_GANTT_STICKY_ROW_META_FULL = 40

type GanttRowGrouping = 'flat' | 'assignee' | 'project'

/** full: một hàng meta+chart (workload mini). meta|chart: chỉ một nửa — dùng trong layout 2 cột để overlay timeline không đè sticky meta. */
export type GanttRowSegment = 'full' | 'meta' | 'chart'

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

function calendarSpanInclusive(a: Date, b: Date): number {
  return Math.max(1, differenceInCalendarDays(startOfDay(b), startOfDay(a)) + 1)
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
  statusColorMap,
  onUpdatePlanDates,
  getAssigneeDisplay,
  getStatusLabel,
  getPriorityLabel,
  getStatusIcon,
  getPriorityIcon,
  getStatusToneClass,
  getPriorityToneClass,
  disableRowGrouping = false,
  workloadData,
  workloadLoading,
  workloadMultiProject,
  onUpsertWorkloadOverride,
  getUserAvatarUrl,
  taskLinks,
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
  getStatusLabel: (status: string) => string
  getPriorityLabel: (priority: string) => string
  getStatusIcon: (status: string) => ReactNode
  getPriorityIcon: (priority: string) => ReactNode
  /** Màu chữ + icon (vd. filter status trong TaskManagement — không badge nền). */
  getStatusToneClass: (code: string) => string
  getPriorityToneClass: (code: string) => string
  /** Admin / PL / PM — khi false: luôn flat, ẩn nhóm hàng */
  disableRowGrouping?: boolean
  /** Workload data cho project hiện tại (server đã thêm canEditAll/selfUserId). null = chưa load / đa project. */
  workloadData?: WorkloadData | null
  workloadLoading?: boolean
  /** True khi đang chọn nhiều project hoặc 0 project: ẩn workload, hiện banner. */
  workloadMultiProject?: boolean
  onUpsertWorkloadOverride?: (input: WorkloadOverrideUpsertInput) => Promise<void> | void
  getUserAvatarUrl?: (userId: string) => string | null | undefined
  /** Dependency links giữa các tasks — được load bulk từ server khi Gantt đang active. */
  taskLinks?: GanttTaskLink[]
}) {
  const { t } = useTranslation()
  const [scale, setScale] = useState<TaskGanttScale>('week')
  const [tightWindow, setTightWindow] = useState(false)
  const [rowGrouping, setRowGrouping] = useState<GanttRowGrouping>(() => loadGanttRowGrouping())
  const [labelColumnWidth, setLabelColumnWidth] = useState(() => loadGanttLabelWidth())
  const [showGridBorders, setShowGridBorders] = useState(() => loadGanttGridBorders())
  const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(() => loadExpandedParents())
  const [collapsedGroupSegmentKeys, setCollapsedGroupSegmentKeys] = useState<Set<string>>(() => loadCollapsedGroupSegments())
  const [metaRailExpanded, setMetaRailExpanded] = useState(() => loadMetaRailExpanded())
  const pixelPerDay = ganttPixelPerDay(scale)

  const taskNameColumnWidth = labelColumnWidth
  const leftBlockWidth = useMemo(
    () => taskNameColumnWidth + (metaRailExpanded ? GANTT_LEFT_META_FIXED_W : 0),
    [taskNameColumnWidth, metaRailExpanded]
  )

  const toggleMetaRail = useCallback(() => {
    setMetaRailExpanded(prev => {
      const next = !prev
      saveMetaRailExpanded(next)
      return next
    })
  }, [])

  const persistGridBorders = useCallback((on: boolean) => {
    setShowGridBorders(on)
    saveGanttGridBorders(on)
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

  const labelResizeDragRef = useRef<{ pointerId: number; startX: number; startW: number } | null>(null)

  const groupingEffective: GanttRowGrouping = disableRowGrouping ? 'flat' : rowGrouping

  useEffect(() => {
    if (disableRowGrouping) return
    saveGanttRowGrouping(rowGrouping)
  }, [disableRowGrouping, rowGrouping])

  /** Body Gantt: cuộn dọc + ngang; strip timeline translate theo scroll (không dùng overflow-x thứ hai). */
  const ganttScrollRef = useRef<HTMLDivElement>(null)
  const workloadScrollRef = useRef<HTMLDivElement>(null)
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
  const chromeFlashTimeoutRef = useRef(0)
  const [timelineChromeFlash, setTimelineChromeFlash] = useState(false)
  /** Đồng bộ Hours/Tasks giữa header và body khi tách hai mount. */
  const [workloadDisplayMode, setWorkloadDisplayMode] = useState<WorkloadDisplayMode>('hours')

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
    const next = Math.min(MAX_GANTT_LABEL_W, Math.max(MIN_GANTT_LABEL_W, Math.round(ctx.startW + (e.clientX - ctx.startX))))
    setLabelColumnWidth(next)
    saveGanttLabelWidth(next)
  }, [])

  // Milestone tasks (type === 'milestone') chỉ cần planStartDate để vào scheduled
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
        const kids = (childrenByParentFull.get(root.id) ?? []).filter(c =>
          taskMatchesGanttScheduledGroup(c, sample, groupingEffective)
        )
        if (kids.length > 0) childrenMap.set(root.id, kids)
      }
      return { ...g, tree: { roots, childrenMap } }
    })
  }, [scheduledGroups, childrenByParentFull, groupingEffective, taskLinks])

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

  /**
   * Map từ taskId → top pixel offset tính từ đầu chart body (không kể HEADER_H).
   * Dùng để tính vị trí Y cho dependency arrows.
   */
  const taskRowTopPx = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>()
    let px = 0
    for (const group of groupTrees) {
      if (group.title) px += GROUP_HEADER_H
      const groupBodyVisible = !group.title || !collapsedGroupSegmentKeys.has(group.segmentKey)
      if (!groupBodyVisible) continue
      const { roots, childrenMap } = group.tree
      for (const root of roots) {
        map.set(root.id, px)
        px += GANTT_ROW_H
        if (expandedParentIds.has(root.id)) {
          for (const child of childrenMap.get(root.id) ?? []) {
            map.set(child.id, px)
            px += GANTT_ROW_H
          }
        }
      }
    }
    return map
  }, [groupTrees, expandedParentIds, collapsedGroupSegmentKeys])

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

    const R = 1         // corner arc radius px
    const JOG = 12      // right jog from predecessor before turning down
    const JOG_LEFT = 12 // left jog past successor before turning toward it
    const LANE_PAD = 0  // px gap below predecessor row for the inter-row lane
    const FWD_MIN = 5   // min forward horizontal gap to use L-elbow; below → U-shape

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
        fromX = fromSI * pixelPerDay + pixelPerDay / 2 + 10  // right apex of diamond
      } else {
        const span = Math.max(1, fromEI - fromSI + 1)
        fromX = fromSI * pixelPerDay + span * pixelPerDay // bar right (widthPx = span * pixelPerDay)
      }

      // Attachment: mid-left of successor bar.
      let toX: number
      if (to.type === 'milestone') {
        toX = toSI * pixelPerDay + pixelPerDay / 2 - 10  // left apex of diamond
      } else {
        toX = Math.max(0, toSI * pixelPerDay)  // bar left edge
      }

      const fromY = fromTop + GANTT_ROW_H / 2
      const toY = toTop + GANTT_ROW_H / 2
      const horiGap = toX - fromX         // positive = forward, negative = backward
      const goingDown = toTop > fromTop   // successor is visually below predecessor

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
              `a ${er} ${er} 0 0 1 ${er} ${er}`,  // right→down (CW)
              `V ${toY - er}`,
              `a ${er} ${er} 0 0 0 ${er} ${er}`,  // down→right (CCW)
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
          `a ${r} ${r} 0 0 1 ${r} ${r}`,  // right→down (CW, sweep=1)
          `V ${laneY - r}`,
          `a ${r} ${r} 0 0 1 ${-r} ${r}`, // down→left (CW, sweep=1)
          `H ${leftAnchor}`,               // slide left, past successor by JOG_LEFT
          `a ${r} ${r} 0 0 0 ${-r} ${r}`, // left→down (CCW, sweep=0)
          `V ${toY - r}`,
          `a ${r} ${r} 0 0 0 ${r} ${r}`,  // down→right (CCW, sweep=0) → arrives (leftAnchor, toY)
          `H ${toX}`,                      // go right into successor's left edge
        ].join(' ')
      } else {
        // ── BACKWARD / TIGHT — same row or successor above predecessor ──
        // Classic U below the lower task (predecessor), then come back up:
        //   right → arc(R→D) → down → arc(D→L) → left
        //   → arc(L→U) → up → arc(U→R) → arrive at (toX, toY)
        const laneY = fromTop + GANTT_ROW_H + LANE_PAD  // fromTop is the lower of the two
        // Go JOG_LEFT past successor's left edge before turning up, then enter right.
        const leftAnchorUp = Math.max(r * 2, toX - JOG_LEFT)
        d = [
          `M ${fromX},${fromY}`,
          `H ${fromX + JOG - r}`,
          `a ${r} ${r} 0 0 1 ${r} ${r}`,   // right→down (CW, sweep=1)
          `V ${laneY - r}`,
          `a ${r} ${r} 0 0 1 ${-r} ${r}`,  // down→left (CW, sweep=1)
          `H ${leftAnchorUp}`,              // slide left, past successor by JOG_LEFT
          `a ${r} ${r} 0 0 1 ${-r} ${-r}`, // left→up (CW, sweep=1)
          `V ${toY + r}`,
          `a ${r} ${r} 0 0 1 ${r} ${-r}`,  // up→right (CW, sweep=1) → arrives (leftAnchorUp, toY)
          `H ${toX}`,                       // go right into successor's left edge
        ].join(' ')
      }

      return [{ id: link.id, d }]
    })
  }, [taskLinks, taskRowTopPx, scheduled, start, pixelPerDay])

  const flashTimelineChrome = useCallback(() => {
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
      const el = ganttScrollRef.current
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
    [leftBlockWidth, flashTimelineChrome]
  )

  scrollToChartPixelRef.current = scrollToChartPixel

  const applyTimelineTransforms = useCallback((scrollLeftPx: number) => {
    const tx = `translate3d(${-scrollLeftPx}px,0,0)`
    const gh = ganttHeaderTimelineRef.current
    const wh = workloadHeaderTimelineRef.current
    if (gh && gh.style.transform !== tx) gh.style.transform = tx
    if (wh && wh.style.transform !== tx) wh.style.transform = tx
  }, [])

  const syncHorizontalScrollFromRef = useRef<(source: 'ganttBody' | 'workloadBody') => void>(() => {})

  const syncHorizontalScrollFrom = useCallback(
    (source: 'ganttBody' | 'workloadBody') => {
      if (syncingHScrollRef.current) return
      const g = ganttScrollRef.current
      const w = workloadScrollRef.current
      const sl = source === 'ganttBody' ? g?.scrollLeft ?? null : w?.scrollLeft ?? null
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

  const renderMiniGanttForUser = useCallback(
    (userId: string) => {
      const userTasks = scheduled.filter(t => (t.assigneeUserId || '') === userId && t.type !== 'milestone')
      if (userTasks.length === 0) {
        return (
          <div className="sticky left-0 z-[2] bg-background/60 px-3 py-2 text-[10px] italic text-muted-foreground" style={{ width: leftBlockWidth + Math.min(chartWidth, 720) }}>
            {labels.emptyScheduled}
          </div>
        )
      }
      return userTasks.map(task => (
        <GanttTaskRow
          key={`workload-mini-${task.id}`}
          task={task}
          start={start}
          pixelPerDay={pixelPerDay}
          chartWidth={chartWidth}
          weekendColumnRects={weekendColumnRects}
          statusColorMap={statusColorMap}
          selectedTaskIds={selectedTaskIds}
          onToggleTaskSelect={onToggleTaskSelect}
          onOpenTask={() => onSelectTask(task)}
          onUpdatePlanDates={onUpdatePlanDates}
          taskNameColumnWidth={taskNameColumnWidth}
          getAssigneeDisplay={getAssigneeDisplay}
          getStatusLabel={getStatusLabel}
          getPriorityLabel={getPriorityLabel}
          getStatusIcon={getStatusIcon}
          getPriorityIcon={getPriorityIcon}
          getStatusToneClass={getStatusToneClass}
          getPriorityToneClass={getPriorityToneClass}
          showGridBorders={showGridBorders}
          showMetaDetailColumns={metaRailExpanded}
        />
      ))
    },
    [
      scheduled,
      leftBlockWidth,
      chartWidth,
      labels.emptyScheduled,
      start,
      pixelPerDay,
      weekendColumnRects,
      statusColorMap,
      selectedTaskIds,
      onToggleTaskSelect,
      onSelectTask,
      onUpdatePlanDates,
      taskNameColumnWidth,
      getAssigneeDisplay,
      getStatusLabel,
      getPriorityLabel,
      getStatusIcon,
      getPriorityIcon,
      getStatusToneClass,
      getPriorityToneClass,
      showGridBorders,
      metaRailExpanded,
    ]
  )

  const showWorkload = workloadMultiProject || workloadData != null || workloadLoading === true
  /** Bảng workload có data: header cố định ngoài overflow-y (không sticky dọc → hết lệch subpixel Chrome). */
  const workloadSplitScroll = Boolean(showWorkload && !workloadMultiProject && workloadData != null)

  useEffect(() => {
    const g = ganttScrollRef.current
    const w = workloadScrollRef.current
    const opts: AddEventListenerOptions = { passive: true }
    const onGantt = () => {
      syncHorizontalScrollFromRef.current('ganttBody')
    }
    const onWorkload = () => {
      syncHorizontalScrollFromRef.current('workloadBody')
    }
    g?.addEventListener('scroll', onGantt, opts)
    w?.addEventListener('scroll', onWorkload, opts)
    return () => {
      g?.removeEventListener('scroll', onGantt)
      w?.removeEventListener('scroll', onWorkload)
    }
  }, [showWorkload, workloadSplitScroll, scheduled.length])

  const workloadSharedProps = useMemo(
    () => ({
      data: workloadData ?? null,
      scale,
      start,
      totalDays,
      pixelPerDay,
      leftBlockWidth,
      chartWidth,
      weekendColumnRects,
      verticalGridLeftPx: verticalGridLineLeftPx,
      showGridBorders,
      locale,
      language,
      loading: Boolean(workloadLoading),
      multiProject: Boolean(workloadMultiProject),
      scheduledGanttTasks: scheduled,
      renderMiniGanttForUser,
      onUpsertOverride: onUpsertWorkloadOverride,
      getUserAvatarUrl,
    }),
    [
      workloadData,
      scale,
      start,
      totalDays,
      pixelPerDay,
      leftBlockWidth,
      chartWidth,
      weekendColumnRects,
      verticalGridLineLeftPx,
      showGridBorders,
      locale,
      language,
      workloadLoading,
      workloadMultiProject,
      scheduled,
      renderMiniGanttForUser,
      onUpsertWorkloadOverride,
      getUserAvatarUrl,
    ]
  )

  /** Căn workload body + transform timeline header khi đổi độ rộng / mount. */
  useLayoutEffect(() => {
    const g = ganttScrollRef.current
    if (!g) return
    const sl = g.scrollLeft
    const w = workloadScrollRef.current
    syncingHScrollRef.current = true
    try {
      if (showWorkload && w && Math.abs(w.scrollLeft - sl) >= 0.5) w.scrollLeft = sl
      applyTimelineTransforms(sl)
      lastCommittedHScrollRef.current = sl
    } finally {
      syncingHScrollRef.current = false
    }
  }, [showWorkload, workloadSplitScroll, chartWidth, leftBlockWidth, scheduled.length, applyTimelineTransforms])

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
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col rounded-md border border-border/70 bg-muted/10',
          'transition-[box-shadow,background-color] duration-300 ease-out motion-reduce:transition-none',
          timelineChromeFlash && 'bg-primary/[0.07] shadow-[inset_0_0_0_2px_hsl(var(--primary)/0.22)] motion-reduce:bg-muted/10 motion-reduce:shadow-none'
        )}
      >
        <div
          className={cn(
            'flex min-h-0 flex-col overflow-hidden',
            showWorkload ? 'flex-[7]' : 'min-h-0 flex-1'
          )}
        >
          {scheduled.length === 0 ? (
            <div
              ref={ganttScrollRef}
              className={cn(
                'min-h-0 flex-1',
                showWorkload ? 'overflow-y-auto overflow-x-scroll [&::-webkit-scrollbar]:h-0' : 'overflow-auto'
              )}
            >
              <div className="p-4 text-muted-foreground text-sm">{labels.emptyScheduled}</div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden relative">
              <div
                className={cn(
                  'flex w-full min-w-0 shrink-0 overflow-hidden bg-muted/90',
                  showGridBorders ? 'border-b border-b-border/60' : 'border-b border-b-border/35'
                )}
              >
                <div
                  className="flex shrink-0 flex-row items-stretch border-r border-border/50 bg-muted/95 backdrop-blur-sm transform-gpu"
                  style={{ width: leftBlockWidth, zIndex: Z_GANTT_STICKY_TOP_HEADER }}
                >
                  <div className={cn('relative flex shrink-0 items-center justify-center px-1', GANTT_META_COL_DIVIDER)} style={{ width: taskNameColumnWidth }}>
                    <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.taskTitle')}</span>
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
                  {metaRailExpanded ? (
                    <>
                      <div className={cn('flex shrink-0 items-center justify-center px-1', GANTT_META_COL_DIVIDER)} style={{ width: GANTT_COL_ASSIGNEE_W }}>
                        <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.assignee')}</span>
                      </div>
                      <div className={cn('flex shrink-0 items-center justify-center px-1', GANTT_META_COL_DIVIDER)} style={{ width: GANTT_COL_STATUS_W }}>
                        <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.status')}</span>
                      </div>
                      <div className={cn('flex shrink-0 items-center justify-center px-1', GANTT_META_COL_DIVIDER)} style={{ width: GANTT_COL_PRIORITY_W }}>
                        <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.priority')}</span>
                      </div>
                      <div className={cn('flex shrink-0 items-center justify-center px-1', GANTT_META_COL_DIVIDER)} style={{ width: GANTT_COL_PROGRESS_W }}>
                        <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.progress')}</span>
                      </div>
                    </>
                  ) : null}
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
                    {showGridBorders ? (
                      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
                        {verticalGridLineLeftPx.map(left => (
                          <div key={left} className={GANTT_TIMELINE_GRID_V_LINE} style={{ left }} />
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
              </div>
              <div
                ref={ganttScrollRef}
                className={cn(
                  'min-h-0 flex-1',
                  showWorkload ? 'overflow-y-auto overflow-x-scroll [&::-webkit-scrollbar]:h-0' : 'overflow-y-auto overflow-x-auto'
                )}
              >
                <div className="relative inline-block min-w-max bg-background/30" style={{ width: leftBlockWidth + chartWidth }}>
                  <div className="flex min-w-max flex-row items-stretch" style={{ width: leftBlockWidth + chartWidth }}>
                  <div
                    className="sticky left-0 isolate flex shrink-0 flex-col border-r border-border/50 bg-background transform-gpu"
                    style={{ width: leftBlockWidth, zIndex: Z_GANTT_STICKY_BODY_LEFT_RAIL }}
                  >
                    {groupTrees.map(group => {
                      const groupBodyVisible = !group.title || !collapsedGroupSegmentKeys.has(group.segmentKey)
                      return (
                        <Fragment key={group.segmentKey}>
                          {group.title ? (
                            <div
                              className={cn(
                                'flex shrink-0 flex-row items-center gap-2 bg-muted/80 px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm',
                                showGridBorders ? 'border-b border-b-border/60' : 'border-b border-b-border/50'
                              )}
                              style={{ width: leftBlockWidth, height: GROUP_HEADER_H }}
                            >
                              <button
                                type="button"
                                className="flex h-5 w-5 shrink-0 items-center justify-center"
                                onClick={() => toggleGroupSegmentCollapsed(group.segmentKey)}
                                aria-expanded={groupBodyVisible}
                                aria-label={
                                  groupBodyVisible
                                    ? t('taskManagement.ganttCollapseGroupSection')
                                    : t('taskManagement.ganttExpandGroupSection')
                                }
                                title={group.title}
                              >
                                {groupBodyVisible ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                              <span className="min-w-0 flex-1 truncate">{group.title}</span>
                            </div>
                          ) : null}
                          {groupBodyVisible
                            ? group.tree.roots.map(task => {
                                const children = group.tree.childrenMap.get(task.id) ?? []
                                const hasChildren = children.length > 0
                                const isExpanded = hasChildren && expandedParentIds.has(task.id)
                                const visibleChildren = isExpanded ? children : []
                                const subtaskNoPlanHint = t('taskManagement.ganttSubtaskNoPlanDates')
                                return (
                                  <Fragment key={task.id}>
                                    {task.type === 'milestone' ? (
                                      <GanttMilestoneRow
                                        task={task}
                                        start={start}
                                        pixelPerDay={pixelPerDay}
                                        chartWidth={chartWidth}
                                        weekendColumnRects={weekendColumnRects}
                                        statusColorMap={statusColorMap}
                                        selectedTaskIds={selectedTaskIds}
                                        onToggleTaskSelect={onToggleTaskSelect}
                                        onOpenTask={() => onSelectTask(task)}
                                        taskNameColumnWidth={taskNameColumnWidth}
                                        getAssigneeDisplay={getAssigneeDisplay}
                                        getStatusLabel={getStatusLabel}
                                        getPriorityLabel={getPriorityLabel}
                                        getStatusIcon={getStatusIcon}
                                        getPriorityIcon={getPriorityIcon}
                                        getStatusToneClass={getStatusToneClass}
                                        getPriorityToneClass={getPriorityToneClass}
                                        showGridBorders={showGridBorders}
                                        showMetaDetailColumns={metaRailExpanded}
                                        milestoneLabel={labels.milestoneLabel}
                                        hasChildren={hasChildren}
                                        isExpanded={isExpanded}
                                        onToggleExpand={hasChildren ? () => toggleExpand(task.id) : undefined}
                                        rowSegment="meta"
                                      />
                                    ) : (
                                      <GanttTaskRow
                                        task={task}
                                        start={start}
                                        pixelPerDay={pixelPerDay}
                                        chartWidth={chartWidth}
                                        weekendColumnRects={weekendColumnRects}
                                        statusColorMap={statusColorMap}
                                        selectedTaskIds={selectedTaskIds}
                                        onToggleTaskSelect={onToggleTaskSelect}
                                        onOpenTask={() => onSelectTask(task)}
                                        onUpdatePlanDates={onUpdatePlanDates}
                                        taskNameColumnWidth={taskNameColumnWidth}
                                        getAssigneeDisplay={getAssigneeDisplay}
                                        getStatusLabel={getStatusLabel}
                                        getPriorityLabel={getPriorityLabel}
                                        getStatusIcon={getStatusIcon}
                                        getPriorityIcon={getPriorityIcon}
                                        getStatusToneClass={getStatusToneClass}
                                        getPriorityToneClass={getPriorityToneClass}
                                        showGridBorders={showGridBorders}
                                        showMetaDetailColumns={metaRailExpanded}
                                        hasChildren={hasChildren}
                                        isExpanded={isExpanded}
                                        onToggleExpand={hasChildren ? () => toggleExpand(task.id) : undefined}
                                        rowSegment="meta"
                                      />
                                    )}
                                    {visibleChildren.map(child =>
                                      !isTaskScheduledForGantt(child) ? (
                                        <GanttUnscheduledSubtaskRow
                                          key={child.id}
                                          task={child}
                                          taskNameColumnWidth={taskNameColumnWidth}
                                          chartWidth={chartWidth}
                                          weekendColumnRects={weekendColumnRects}
                                          selectedTaskIds={selectedTaskIds}
                                          onToggleTaskSelect={onToggleTaskSelect}
                                          onOpenTask={() => onSelectTask(child)}
                                          getAssigneeDisplay={getAssigneeDisplay}
                                          getStatusLabel={getStatusLabel}
                                          getPriorityLabel={getPriorityLabel}
                                          getStatusIcon={getStatusIcon}
                                          getPriorityIcon={getPriorityIcon}
                                          getStatusToneClass={getStatusToneClass}
                                          getPriorityToneClass={getPriorityToneClass}
                                          showGridBorders={showGridBorders}
                                          showMetaDetailColumns={metaRailExpanded}
                                          noPlanHint={subtaskNoPlanHint}
                                          indentLevel={1}
                                          rowSegment="meta"
                                        />
                                      ) : child.type === 'milestone' ? (
                                        <GanttMilestoneRow
                                          key={child.id}
                                          task={child}
                                          start={start}
                                          pixelPerDay={pixelPerDay}
                                          chartWidth={chartWidth}
                                          weekendColumnRects={weekendColumnRects}
                                          statusColorMap={statusColorMap}
                                          selectedTaskIds={selectedTaskIds}
                                          onToggleTaskSelect={onToggleTaskSelect}
                                          onOpenTask={() => onSelectTask(child)}
                                          taskNameColumnWidth={taskNameColumnWidth}
                                          getAssigneeDisplay={getAssigneeDisplay}
                                          getStatusLabel={getStatusLabel}
                                          getPriorityLabel={getPriorityLabel}
                                          getStatusIcon={getStatusIcon}
                                          getPriorityIcon={getPriorityIcon}
                                          getStatusToneClass={getStatusToneClass}
                                          getPriorityToneClass={getPriorityToneClass}
                                          showGridBorders={showGridBorders}
                                          showMetaDetailColumns={metaRailExpanded}
                                          milestoneLabel={labels.milestoneLabel}
                                          indentLevel={1}
                                          rowSegment="meta"
                                        />
                                      ) : (
                                        <GanttTaskRow
                                          key={child.id}
                                          task={child}
                                          start={start}
                                          pixelPerDay={pixelPerDay}
                                          chartWidth={chartWidth}
                                          weekendColumnRects={weekendColumnRects}
                                          statusColorMap={statusColorMap}
                                          selectedTaskIds={selectedTaskIds}
                                          onToggleTaskSelect={onToggleTaskSelect}
                                          onOpenTask={() => onSelectTask(child)}
                                          onUpdatePlanDates={onUpdatePlanDates}
                                          taskNameColumnWidth={taskNameColumnWidth}
                                          getAssigneeDisplay={getAssigneeDisplay}
                                          getStatusLabel={getStatusLabel}
                                          getPriorityLabel={getPriorityLabel}
                                          getStatusIcon={getStatusIcon}
                                          getPriorityIcon={getPriorityIcon}
                                          getStatusToneClass={getStatusToneClass}
                                          getPriorityToneClass={getPriorityToneClass}
                                          showGridBorders={showGridBorders}
                                          showMetaDetailColumns={metaRailExpanded}
                                          indentLevel={1}
                                          rowSegment="meta"
                                        />
                                      )
                                    )}
                                  </Fragment>
                                )
                              })
                            : null}
                        </Fragment>
                      )
                    })}
                  </div>

                  <div
                    className={cn('relative flex shrink-0 flex-col overflow-hidden', showGridBorders ? 'bg-border/30' : 'bg-border/20')}
                    style={{ width: chartWidth }}
                  >
                    {showGridBorders ? (
                      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
                        {verticalGridLineLeftPx.map(left => (
                          <div key={left} className={GANTT_TIMELINE_GRID_V_LINE} style={{ left }} />
                        ))}
                      </div>
                    ) : null}
                    {groupTrees.map(group => {
                      const groupBodyVisible = !group.title || !collapsedGroupSegmentKeys.has(group.segmentKey)
                      return (
                        <Fragment key={`${group.segmentKey}-chart`}>
                          {group.title ? (
                            <div
                              className={cn(
                                'relative z-[2] shrink-0 overflow-hidden border-x-0 bg-muted outline-none ring-0',
                                showGridBorders ? 'border-b border-b-border/60' : 'border-b border-b-border/50'
                              )}
                              style={{ width: chartWidth, height: GROUP_HEADER_H }}
                              aria-hidden
                            >
                              {weekendColumnRects.map((r, i) => (
                                <div
                                  key={`grp-wk-${group.segmentKey}-${r.left}-${i}`}
                                  className="pointer-events-none absolute top-0 bottom-0"
                                  style={{ left: r.left, width: r.width }}
                                />
                              ))}
                            </div>
                          ) : null}
                          {groupBodyVisible
                            ? group.tree.roots.map(task => {
                                const children = group.tree.childrenMap.get(task.id) ?? []
                                const hasChildren = children.length > 0
                                const isExpanded = hasChildren && expandedParentIds.has(task.id)
                                const visibleChildren = isExpanded ? children : []
                                const subtaskNoPlanHint = t('taskManagement.ganttSubtaskNoPlanDates')
                                return (
                                  <Fragment key={task.id}>
                                    {task.type === 'milestone' ? (
                                      <GanttMilestoneRow
                                        task={task}
                                        start={start}
                                        pixelPerDay={pixelPerDay}
                                        chartWidth={chartWidth}
                                        weekendColumnRects={weekendColumnRects}
                                        statusColorMap={statusColorMap}
                                        selectedTaskIds={selectedTaskIds}
                                        onToggleTaskSelect={onToggleTaskSelect}
                                        onOpenTask={() => onSelectTask(task)}
                                        taskNameColumnWidth={taskNameColumnWidth}
                                        getAssigneeDisplay={getAssigneeDisplay}
                                        getStatusLabel={getStatusLabel}
                                        getPriorityLabel={getPriorityLabel}
                                        getStatusIcon={getStatusIcon}
                                        getPriorityIcon={getPriorityIcon}
                                        getStatusToneClass={getStatusToneClass}
                                        getPriorityToneClass={getPriorityToneClass}
                                        showGridBorders={showGridBorders}
                                        showMetaDetailColumns={metaRailExpanded}
                                        milestoneLabel={labels.milestoneLabel}
                                        hasChildren={hasChildren}
                                        isExpanded={isExpanded}
                                        onToggleExpand={hasChildren ? () => toggleExpand(task.id) : undefined}
                                        rowSegment="chart"
                                      />
                                    ) : (
                                      <GanttTaskRow
                                        task={task}
                                        start={start}
                                        pixelPerDay={pixelPerDay}
                                        chartWidth={chartWidth}
                                        weekendColumnRects={weekendColumnRects}
                                        statusColorMap={statusColorMap}
                                        selectedTaskIds={selectedTaskIds}
                                        onToggleTaskSelect={onToggleTaskSelect}
                                        onOpenTask={() => onSelectTask(task)}
                                        onUpdatePlanDates={onUpdatePlanDates}
                                        taskNameColumnWidth={taskNameColumnWidth}
                                        getAssigneeDisplay={getAssigneeDisplay}
                                        getStatusLabel={getStatusLabel}
                                        getPriorityLabel={getPriorityLabel}
                                        getStatusIcon={getStatusIcon}
                                        getPriorityIcon={getPriorityIcon}
                                        getStatusToneClass={getStatusToneClass}
                                        getPriorityToneClass={getPriorityToneClass}
                                        showGridBorders={showGridBorders}
                                        showMetaDetailColumns={metaRailExpanded}
                                        hasChildren={hasChildren}
                                        isExpanded={isExpanded}
                                        onToggleExpand={hasChildren ? () => toggleExpand(task.id) : undefined}
                                        rowSegment="chart"
                                      />
                                    )}
                                    {visibleChildren.map(child =>
                                      !isTaskScheduledForGantt(child) ? (
                                        <GanttUnscheduledSubtaskRow
                                          key={child.id}
                                          task={child}
                                          taskNameColumnWidth={taskNameColumnWidth}
                                          chartWidth={chartWidth}
                                          weekendColumnRects={weekendColumnRects}
                                          selectedTaskIds={selectedTaskIds}
                                          onToggleTaskSelect={onToggleTaskSelect}
                                          onOpenTask={() => onSelectTask(child)}
                                          getAssigneeDisplay={getAssigneeDisplay}
                                          getStatusLabel={getStatusLabel}
                                          getPriorityLabel={getPriorityLabel}
                                          getStatusIcon={getStatusIcon}
                                          getPriorityIcon={getPriorityIcon}
                                          getStatusToneClass={getStatusToneClass}
                                          getPriorityToneClass={getPriorityToneClass}
                                          showGridBorders={showGridBorders}
                                          showMetaDetailColumns={metaRailExpanded}
                                          noPlanHint={subtaskNoPlanHint}
                                          indentLevel={1}
                                          rowSegment="chart"
                                        />
                                      ) : child.type === 'milestone' ? (
                                        <GanttMilestoneRow
                                          key={child.id}
                                          task={child}
                                          start={start}
                                          pixelPerDay={pixelPerDay}
                                          chartWidth={chartWidth}
                                          weekendColumnRects={weekendColumnRects}
                                          statusColorMap={statusColorMap}
                                          selectedTaskIds={selectedTaskIds}
                                          onToggleTaskSelect={onToggleTaskSelect}
                                          onOpenTask={() => onSelectTask(child)}
                                          taskNameColumnWidth={taskNameColumnWidth}
                                          getAssigneeDisplay={getAssigneeDisplay}
                                          getStatusLabel={getStatusLabel}
                                          getPriorityLabel={getPriorityLabel}
                                          getStatusIcon={getStatusIcon}
                                          getPriorityIcon={getPriorityIcon}
                                          getStatusToneClass={getStatusToneClass}
                                          getPriorityToneClass={getPriorityToneClass}
                                          showGridBorders={showGridBorders}
                                          showMetaDetailColumns={metaRailExpanded}
                                          milestoneLabel={labels.milestoneLabel}
                                          indentLevel={1}
                                          rowSegment="chart"
                                        />
                                      ) : (
                                        <GanttTaskRow
                                          key={child.id}
                                          task={child}
                                          start={start}
                                          pixelPerDay={pixelPerDay}
                                          chartWidth={chartWidth}
                                          weekendColumnRects={weekendColumnRects}
                                          statusColorMap={statusColorMap}
                                          selectedTaskIds={selectedTaskIds}
                                          onToggleTaskSelect={onToggleTaskSelect}
                                          onOpenTask={() => onSelectTask(child)}
                                          onUpdatePlanDates={onUpdatePlanDates}
                                          taskNameColumnWidth={taskNameColumnWidth}
                                          getAssigneeDisplay={getAssigneeDisplay}
                                          getStatusLabel={getStatusLabel}
                                          getPriorityLabel={getPriorityLabel}
                                          getStatusIcon={getStatusIcon}
                                          getPriorityIcon={getPriorityIcon}
                                          getStatusToneClass={getStatusToneClass}
                                          getPriorityToneClass={getPriorityToneClass}
                                          showGridBorders={showGridBorders}
                                          showMetaDetailColumns={metaRailExpanded}
                                          indentLevel={1}
                                          rowSegment="chart"
                                        />
                                      )
                                    )}
                                  </Fragment>
                                )
                              })
                            : null}
                        </Fragment>
                      )
                    })}
                    {(showTodayLine || arrowPaths.length > 0) ? (
                      <div className="pointer-events-none absolute inset-0 z-[10] overflow-hidden" aria-hidden>
                        {showTodayLine ? (
                          <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: chartWidth }}>
                            <div className="absolute top-0 bottom-0 w-px bg-rose-600/95" style={{ left: todayPxCenter }} title={labels.todayMark} />
                          </div>
                        ) : null}
                        {arrowPaths.length > 0 ? (
                          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden text-primary/70 dark:text-primary/80" aria-hidden>
                            <defs>
                              <marker
                                id="gantt-dep-arrow"
                                markerWidth="6"
                                markerHeight="6"
                                refX="5.2"
                                refY="3"
                                orient="auto-start-reverse"
                                markerUnits="userSpaceOnUse"
                              >
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
                                shapeRendering="geometricPrecision"
                                markerEnd="url(#gantt-dep-arrow)"
                              />
                            ))}
                          </svg>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              </div>
              {scheduled.length > 0 ? (
                <button
                  type="button"
                  className={cn(
                    'pointer-events-auto absolute z-[55] flex h-7 w-5 items-center justify-center',
                    'rounded-r-md border border-border/80 border-l-0 bg-background/95 shadow-sm backdrop-blur-sm',
                    'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
                  )}
                  style={{ left: leftBlockWidth, top: '50%', transform: 'translate(-1px, -50%)' }}
                  onClick={e => {
                    e.stopPropagation()
                    toggleMetaRail()
                  }}
                  aria-expanded={metaRailExpanded}
                  aria-label={metaRailExpanded ? t('taskManagement.ganttMetaRailCollapse') : t('taskManagement.ganttMetaRailExpand')}
                  title={metaRailExpanded ? t('taskManagement.ganttMetaRailCollapse') : t('taskManagement.ganttMetaRailExpand')}
                >
                  {metaRailExpanded ? <ChevronsLeft className="h-4 w-4" aria-hidden /> : <ChevronsRight className="h-4 w-4" aria-hidden />}
                </button>
              ) : null}
            </div>
          )}
        </div>

        {showWorkload ? (
          <div className="flex min-h-0 min-w-0 flex-[3] flex-col border-t border-border/60">
            {workloadSplitScroll ? (
              <>
                <div className="min-w-0 shrink-0 overflow-x-hidden bg-background/30">
                  <TaskGanttWorkload
                    {...workloadSharedProps}
                    segment="header"
                    displayMode={workloadDisplayMode}
                    onDisplayModeChange={setWorkloadDisplayMode}
                    headerTimelineTrackRef={workloadHeaderTimelineRef}
                  />
                </div>
                <div
                  ref={workloadScrollRef}
                  className="min-h-0 flex-1 overflow-y-auto overflow-x-auto [overflow-anchor:none] [scrollbar-gutter:stable]"
                >
                  <div className="relative inline-block min-w-max bg-background/30" style={{ width: leftBlockWidth + chartWidth }}>
                    <TaskGanttWorkload
                      {...workloadSharedProps}
                      segment="body"
                      displayMode={workloadDisplayMode}
                      onDisplayModeChange={setWorkloadDisplayMode}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div
                ref={workloadScrollRef}
                className="min-h-0 flex-1 overflow-auto [overflow-anchor:none] [scrollbar-gutter:stable]"
              >
                <div className="relative inline-block min-w-max bg-background/30" style={{ width: leftBlockWidth + chartWidth }}>
                  <TaskGanttWorkload {...workloadSharedProps} segment="full" />
                </div>
              </div>
            )}
          </div>
        ) : null}

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
  weekendColumnRects,
  statusColorMap,
  selectedTaskIds,
  onToggleTaskSelect,
  onOpenTask,
  onUpdatePlanDates,
  taskNameColumnWidth,
  getAssigneeDisplay,
  getStatusLabel,
  getPriorityLabel,
  getStatusIcon,
  getPriorityIcon,
  getStatusToneClass,
  getPriorityToneClass,
  showGridBorders,
  indentLevel = 0,
  hasChildren = false,
  isExpanded = false,
  onToggleExpand,
  rowSegment = 'full',
  showMetaDetailColumns = true,
}: {
  task: TaskTableRowTask
  start: Date
  pixelPerDay: number
  chartWidth: number
  weekendColumnRects: { left: number; width: number }[]
  statusColorMap?: Record<string, string>
  selectedTaskIds?: Set<string>
  onToggleTaskSelect?: (taskId: string) => void
  onOpenTask: () => void
  onUpdatePlanDates?: (taskId: string, planStartDate: string, planEndDate: string, version?: number) => Promise<boolean>
  taskNameColumnWidth: number
  getAssigneeDisplay?: (assigneeUserId: string | null) => string
  getStatusLabel: (status: string) => string
  getPriorityLabel: (priority: string) => string
  getStatusIcon: (status: string) => ReactNode
  getPriorityIcon: (priority: string) => ReactNode
  getStatusToneClass: (code: string) => string
  getPriorityToneClass: (code: string) => string
  showGridBorders: boolean
  /** Mức indent cho sub-task (0 = root, 1 = child). */
  indentLevel?: number
  /** Task này có sub-task con hay không. */
  hasChildren?: boolean
  /** Accordion đang mở không. */
  isExpanded?: boolean
  /** Callback toggle accordion. */
  onToggleExpand?: () => void
  rowSegment?: GanttRowSegment
  /** false: chỉ cột task title — ẩn Assignee / Status / Priority / Progress */
  showMetaDetailColumns?: boolean
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
  const widthPx = Math.max(pixelPerDay * 0.5, showSpan * pixelPerDay)

  const statusHex = statusColorMap?.[task.status]
  const barTint = taskStatusBarStyle(statusHex)
  const barChartSurfaceStyle = hasChildren
    ? { ...(barTint ?? {}), backgroundColor: undefined, ...taskStatusBarParentFillStyle(statusHex) }
    : (barTint ?? {})

  const canDrag = Boolean(onUpdatePlanDates)
  const rowSelected = Boolean(selectedTaskIds?.has(task.id))
  const leftBlockWidth = taskNameColumnWidth + (showMetaDetailColumns ? GANTT_LEFT_META_FIXED_W : 0)
  const assigneeText = getAssigneeDisplay?.(task.assigneeUserId) ?? (task.assigneeUserId?.trim() ? task.assigneeUserId : '—')
  const displayStatus = task.status
  const priority = (task.priority ?? 'medium') as string
  const statusLabel = getStatusLabel(displayStatus)
  const priorityLabel = getPriorityLabel(priority)

  const indentPx = indentLevel * 16
  const seg = rowSegment

  const rowChromeFull = cn(
    'relative flex w-full shrink-0 items-stretch hover:bg-muted/25',
    rowSelected && 'bg-primary/[0.11] hover:bg-primary/[0.14] dark:bg-primary/15 dark:hover:bg-primary/[0.18]',
    showGridBorders
      ? cn('border-b border-b-border/60', rowSelected ? 'bg-primary/[0.09] dark:bg-primary/12' : 'bg-transparent')
      : !rowSelected && 'border-b border-b-border/[0.12] bg-transparent',
    rowSelected && !showGridBorders && 'border-b border-b-border/[0.12]'
  )
  const rowChromeHalf = cn(
    'flex shrink-0 items-stretch hover:bg-muted/25',
    rowSelected && 'bg-primary/[0.11] hover:bg-primary/[0.14] dark:bg-primary/15 dark:hover:bg-primary/[0.18]',
    showGridBorders
      ? cn('border-b border-b-border/60', rowSelected ? 'bg-primary/[0.09] dark:bg-primary/12' : 'bg-transparent')
      : !rowSelected && 'border-b border-b-border/[0.12] bg-transparent',
    rowSelected && !showGridBorders && 'border-b border-b-border/[0.12]'
  )

  const metaBlock = (
      <div
        className={cn(
          'flex shrink-0 flex-row items-stretch border-r border-border/50 backdrop-blur-sm transform-gpu',
          seg === 'full' && 'sticky left-0',
          rowSelected ? 'bg-transparent' : seg === 'meta' ? 'bg-background' : 'bg-background/95'
        )}
        style={{
          width: leftBlockWidth,
          ...(seg === 'full' ? { zIndex: Z_GANTT_STICKY_ROW_META_FULL } : {}),
        }}
      >
        <div className={cn('flex min-w-0 shrink-0 items-center gap-1 px-1.5 py-1', GANTT_META_COL_DIVIDER)} style={{ width: taskNameColumnWidth }}>
          {indentPx > 0 ? <span className="shrink-0" style={{ width: indentPx }} aria-hidden /> : null}
          {hasChildren ? (
            <button
              type="button"
              className="flex h-5 w-5 shrink-0 items-center justify-center"
              onClick={onToggleExpand}
              aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
              aria-expanded={isExpanded}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : indentLevel > 0 ? (
            <span className="h-5 w-5 shrink-0" aria-hidden />
          ) : null}
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
            className={cn(
              'min-w-0 flex-1 truncate text-left text-xs font-medium leading-tight text-foreground underline-offset-2 hover:underline',
              indentLevel > 0 && 'text-muted-foreground'
            )}
            title={task.title}
            onClick={onOpenTask}
          >
            {task.title || '—'}
          </button>
        </div>
        {showMetaDetailColumns ? (
          <>
            <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', GANTT_META_COL_DIVIDER)} style={{ width: GANTT_COL_ASSIGNEE_W }} title={assigneeText}>
              <span className="truncate text-xs text-muted-foreground">{assigneeText}</span>
            </div>
            <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', GANTT_META_COL_DIVIDER)} style={{ width: GANTT_COL_STATUS_W }} title={statusLabel}>
              <span className={cn('flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-tight [&_svg]:shrink-0', getStatusToneClass(displayStatus))}>
                <span className="[&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
                  {getStatusIcon(displayStatus)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{statusLabel}</span>
              </span>
            </div>
            <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', GANTT_META_COL_DIVIDER)} style={{ width: GANTT_COL_PRIORITY_W }} title={priorityLabel}>
              <span className={cn('flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-tight [&_svg]:shrink-0', getPriorityToneClass(priority))}>
                <span className="[&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
                  {getPriorityIcon(priority)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{priorityLabel}</span>
              </span>
            </div>
            <div
              className={cn('flex min-w-0 shrink-0 items-center justify-end px-1.5 py-1 tabular-nums', GANTT_META_COL_DIVIDER)}
              style={{ width: GANTT_COL_PROGRESS_W }}
              title={ganttProgressPercentDisplay(task.progress)}
            >
              <span className="truncate text-xs text-muted-foreground">{ganttProgressPercentDisplay(task.progress)}</span>
            </div>
          </>
        ) : null}
      </div>
  )

  const chartBlock = (
      <div className="relative flex min-h-0 min-w-0 overflow-hidden bg-transparent" style={{ width: chartWidth }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
          {weekendColumnRects.map((r, i) => (
            <div
              key={`row-wk-${task.id}-${r.left}-${i}`}
              className="absolute top-0 bottom-0 bg-slate-500/[0.11] dark:bg-slate-400/[0.05]"
              style={{ left: r.left, width: r.width }}
            />
          ))}
        </div>
        <div className="relative z-[2] my-[0.35rem] h-[26px] w-full shrink-0" style={{ width: chartWidth }}>
          <div
            role="presentation"
            className={cn(
              'absolute top-0 z-[3] flex h-[26px] min-w-[8px] border-none! select-none rounded-xs text-[11px] font-medium text-foreground',
              !hasChildren && !barTint && 'bg-primary/25'
            )}
            style={{
              left: leftPx,
              width: widthPx,
              maxWidth: chartWidth - leftPx,
              ...barChartSurfaceStyle,
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
            {/* biome-ignore lint/a11y/noStaticElementInteractions: Gantt timeline drag */}
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
}

function GanttMilestoneRow({
  task,
  start,
  pixelPerDay,
  chartWidth,
  weekendColumnRects,
  statusColorMap,
  selectedTaskIds,
  onToggleTaskSelect,
  onOpenTask,
  taskNameColumnWidth,
  getAssigneeDisplay,
  getStatusLabel,
  getPriorityLabel,
  getStatusIcon,
  getPriorityIcon,
  getStatusToneClass,
  getPriorityToneClass,
  showGridBorders,
  milestoneLabel,
  indentLevel = 0,
  hasChildren = false,
  isExpanded = false,
  onToggleExpand,
  rowSegment = 'full',
  showMetaDetailColumns = true,
}: {
  task: TaskTableRowTask
  start: Date
  pixelPerDay: number
  chartWidth: number
  weekendColumnRects: { left: number; width: number }[]
  statusColorMap?: Record<string, string>
  selectedTaskIds?: Set<string>
  onToggleTaskSelect?: (taskId: string) => void
  onOpenTask: () => void
  taskNameColumnWidth: number
  getAssigneeDisplay?: (assigneeUserId: string | null) => string
  getStatusLabel: (status: string) => string
  getPriorityLabel: (priority: string) => string
  getStatusIcon: (status: string) => ReactNode
  getPriorityIcon: (priority: string) => ReactNode
  getStatusToneClass: (code: string) => string
  getPriorityToneClass: (code: string) => string
  showGridBorders: boolean
  milestoneLabel?: string
  indentLevel?: number
  hasChildren?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
  rowSegment?: GanttRowSegment
  showMetaDetailColumns?: boolean
}) {
  const milestoneDate = parsePlanDate(task.planStartDate)
  if (!milestoneDate) return null

  const dayIndex = differenceInCalendarDays(milestoneDate, start)
  const centerPx = dayIndex * pixelPerDay + pixelPerDay / 2

  const rowSelected = Boolean(selectedTaskIds?.has(task.id))
  const leftBlockWidth = taskNameColumnWidth + (showMetaDetailColumns ? GANTT_LEFT_META_FIXED_W : 0)
  const assigneeText = getAssigneeDisplay?.(task.assigneeUserId) ?? (task.assigneeUserId?.trim() ? task.assigneeUserId : '—')
  const displayStatus = task.status
  const priority = (task.priority ?? 'medium') as string
  const statusLabel = getStatusLabel(displayStatus)
  const priorityLabel = getPriorityLabel(priority)
  const indentPx = indentLevel * 16
  const tooltipText = milestoneLabel ? `${milestoneLabel}: ${task.title}` : task.title
  const seg = rowSegment

  const rowChromeFull = cn(
    'relative flex w-full shrink-0 items-stretch hover:bg-muted/25',
    rowSelected && 'bg-primary/[0.11] hover:bg-primary/[0.14] dark:bg-primary/15 dark:hover:bg-primary/[0.18]',
    showGridBorders
      ? cn('border-b border-b-border/60', rowSelected ? 'bg-primary/[0.09] dark:bg-primary/12' : 'bg-transparent')
      : !rowSelected && 'border-b border-b-border/[0.12] bg-transparent',
    rowSelected && !showGridBorders && 'border-b border-b-border/[0.12]'
  )
  const rowChromeHalf = cn(
    'flex shrink-0 items-stretch hover:bg-muted/25',
    rowSelected && 'bg-primary/[0.11] hover:bg-primary/[0.14] dark:bg-primary/15 dark:hover:bg-primary/[0.18]',
    showGridBorders
      ? cn('border-b border-b-border/60', rowSelected ? 'bg-primary/[0.09] dark:bg-primary/12' : 'bg-transparent')
      : !rowSelected && 'border-b border-b-border/[0.12] bg-transparent',
    rowSelected && !showGridBorders && 'border-b border-b-border/[0.12]'
  )

  const metaBlock = (
      <div
        className={cn(
          'flex shrink-0 flex-row items-stretch border-r border-border/50 backdrop-blur-sm transform-gpu',
          seg === 'full' && 'sticky left-0',
          rowSelected ? 'bg-transparent' : seg === 'meta' ? 'bg-background' : 'bg-background/95'
        )}
        style={{
          width: leftBlockWidth,
          ...(seg === 'full' ? { zIndex: Z_GANTT_STICKY_ROW_META_FULL } : {}),
        }}
      >
        <div className={cn('flex min-w-0 shrink-0 items-center gap-1 px-1.5 py-1', GANTT_META_COL_DIVIDER)} style={{ width: taskNameColumnWidth }}>
          {indentPx > 0 ? <span className="shrink-0" style={{ width: indentPx }} aria-hidden /> : null}
          {hasChildren ? (
            <button
              type="button"
              className="flex h-5 w-5 shrink-0 items-center justify-center"
              onClick={onToggleExpand}
              aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
              aria-expanded={isExpanded}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : indentLevel > 0 ? (
            <span className="h-5 w-5 shrink-0" aria-hidden />
          ) : null}
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-amber-500" aria-hidden>
            <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
              <path d="M6 0 L12 6 L6 12 L0 6 Z" />
            </svg>
          </span>
          {onToggleTaskSelect ? (
            <Checkbox
              checked={selectedTaskIds?.has(task.id) ?? false}
              onCheckedChange={() => onToggleTaskSelect(task.id)}
              className="h-4 w-4 shrink-0"
              aria-label={`Select ${task.title || 'milestone'}`}
            />
          ) : null}
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-xs font-medium leading-tight text-amber-600 dark:text-amber-400 underline-offset-2 hover:underline"
            title={tooltipText}
            onClick={onOpenTask}
          >
            {task.title || '—'}
          </button>
        </div>
        {showMetaDetailColumns ? (
          <>
            <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', GANTT_META_COL_DIVIDER)} style={{ width: GANTT_COL_ASSIGNEE_W }} title={assigneeText}>
              <span className="truncate text-xs text-muted-foreground">{assigneeText}</span>
            </div>
            <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', GANTT_META_COL_DIVIDER)} style={{ width: GANTT_COL_STATUS_W }} title={statusLabel}>
              <span className={cn('flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-tight [&_svg]:shrink-0', getStatusToneClass(displayStatus))}>
                <span className="[&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
                  {getStatusIcon(displayStatus)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{statusLabel}</span>
              </span>
            </div>
            <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', GANTT_META_COL_DIVIDER)} style={{ width: GANTT_COL_PRIORITY_W }} title={priorityLabel}>
              <span className={cn('flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-tight [&_svg]:shrink-0', getPriorityToneClass(priority))}>
                <span className="[&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
                  {getPriorityIcon(priority)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{priorityLabel}</span>
              </span>
            </div>
            <div
              className={cn('flex min-w-0 shrink-0 items-center justify-end px-1.5 py-1 tabular-nums', GANTT_META_COL_DIVIDER)}
              style={{ width: GANTT_COL_PROGRESS_W }}
              title={ganttProgressPercentDisplay(task.progress)}
            >
              <span className="truncate text-xs text-muted-foreground">{ganttProgressPercentDisplay(task.progress)}</span>
            </div>
          </>
        ) : null}
      </div>
  )

  const chartBlock = (
      <div className="relative flex min-h-0 min-w-0 overflow-hidden bg-transparent" style={{ width: chartWidth }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
          {weekendColumnRects.map((r, i) => (
            <div
              key={`ms-wk-${task.id}-${r.left}-${i}`}
              className="absolute top-0 bottom-0 bg-slate-500/[0.11] dark:bg-slate-400/[0.05]"
              style={{ left: r.left, width: r.width }}
            />
          ))}
        </div>
        <div className="relative z-[2] my-[0.35rem] h-[26px] w-full shrink-0" style={{ width: chartWidth }}>
          {centerPx >= 0 && centerPx <= chartWidth ? (
            <button
              type="button"
              className="absolute z-[3] -translate-x-1/2 -translate-y-1/2 p-1 group"
              style={{ left: centerPx, top: '50%' }}
              title={tooltipText}
              onDoubleClick={onOpenTask}
              onClick={onOpenTask}
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
}

function GanttUnscheduledSubtaskRow({
  task,
  taskNameColumnWidth,
  chartWidth,
  weekendColumnRects,
  selectedTaskIds,
  onToggleTaskSelect,
  onOpenTask,
  getAssigneeDisplay,
  getStatusLabel,
  getPriorityLabel,
  getStatusIcon,
  getPriorityIcon,
  getStatusToneClass,
  getPriorityToneClass,
  showGridBorders,
  noPlanHint,
  indentLevel = 1,
  rowSegment = 'full',
  showMetaDetailColumns = true,
}: {
  task: TaskTableRowTask
  taskNameColumnWidth: number
  chartWidth: number
  weekendColumnRects: { left: number; width: number }[]
  selectedTaskIds?: Set<string>
  onToggleTaskSelect?: (taskId: string) => void
  onOpenTask: () => void
  getAssigneeDisplay?: (assigneeUserId: string | null) => string
  getStatusLabel: (status: string) => string
  getPriorityLabel: (priority: string) => string
  getStatusIcon: (status: string) => ReactNode
  getPriorityIcon: (priority: string) => ReactNode
  getStatusToneClass: (code: string) => string
  getPriorityToneClass: (code: string) => string
  showGridBorders: boolean
  noPlanHint: string
  indentLevel?: number
  rowSegment?: GanttRowSegment
  showMetaDetailColumns?: boolean
}) {
  const rowSelected = Boolean(selectedTaskIds?.has(task.id))
  const leftBlockWidth = taskNameColumnWidth + (showMetaDetailColumns ? GANTT_LEFT_META_FIXED_W : 0)
  const assigneeText = getAssigneeDisplay?.(task.assigneeUserId) ?? (task.assigneeUserId?.trim() ? task.assigneeUserId : '—')
  const displayStatus = task.status
  const priority = (task.priority ?? 'medium') as string
  const statusLabel = getStatusLabel(displayStatus)
  const priorityLabel = getPriorityLabel(priority)
  const indentPx = indentLevel * 16
  const seg = rowSegment

  const rowChromeFull = cn(
    'relative flex w-full shrink-0 items-stretch hover:bg-muted/25',
    rowSelected && 'bg-primary/[0.11] hover:bg-primary/[0.14] dark:bg-primary/15 dark:hover:bg-primary/[0.18]',
    showGridBorders
      ? cn('border-b border-b-border/60', rowSelected ? 'bg-primary/[0.09] dark:bg-primary/12' : 'bg-transparent')
      : !rowSelected && 'border-b border-b-border/[0.12] bg-transparent',
    rowSelected && !showGridBorders && 'border-b border-b-border/[0.12]'
  )
  const rowChromeHalf = cn(
    'flex shrink-0 items-stretch hover:bg-muted/25',
    rowSelected && 'bg-primary/[0.11] hover:bg-primary/[0.14] dark:bg-primary/15 dark:hover:bg-primary/[0.18]',
    showGridBorders
      ? cn('border-b border-b-border/60', rowSelected ? 'bg-primary/[0.09] dark:bg-primary/12' : 'bg-transparent')
      : !rowSelected && 'border-b border-b-border/[0.12] bg-transparent',
    rowSelected && !showGridBorders && 'border-b border-b-border/[0.12]'
  )

  const metaBlock = (
      <div
        className={cn(
          'flex shrink-0 flex-row items-stretch border-r border-border/50 backdrop-blur-sm transform-gpu',
          seg === 'full' && 'sticky left-0',
          rowSelected ? 'bg-transparent' : seg === 'meta' ? 'bg-background' : 'bg-background/95'
        )}
        style={{
          width: leftBlockWidth,
          ...(seg === 'full' ? { zIndex: Z_GANTT_STICKY_ROW_META_FULL } : {}),
        }}
      >
        <div className={cn('flex min-w-0 shrink-0 items-center gap-1 px-1.5 py-1', GANTT_META_COL_DIVIDER)} style={{ width: taskNameColumnWidth }}>
          {indentPx > 0 ? <span className="shrink-0" style={{ width: indentPx }} aria-hidden /> : null}
          <span className="h-5 w-5 shrink-0" aria-hidden />
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
            className="min-w-0 flex-1 truncate text-left text-xs font-medium leading-tight text-muted-foreground underline-offset-2 hover:underline"
            title={task.title}
            onClick={onOpenTask}
          >
            {task.title || '—'}
          </button>
        </div>
        {showMetaDetailColumns ? (
          <>
            <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', GANTT_META_COL_DIVIDER)} style={{ width: GANTT_COL_ASSIGNEE_W }} title={assigneeText}>
              <span className="truncate text-xs text-muted-foreground">{assigneeText}</span>
            </div>
            <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', GANTT_META_COL_DIVIDER)} style={{ width: GANTT_COL_STATUS_W }} title={statusLabel}>
              <span className={cn('flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-tight [&_svg]:shrink-0', getStatusToneClass(displayStatus))}>
                <span className="[&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
                  {getStatusIcon(displayStatus)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{statusLabel}</span>
              </span>
            </div>
            <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', GANTT_META_COL_DIVIDER)} style={{ width: GANTT_COL_PRIORITY_W }} title={priorityLabel}>
              <span className={cn('flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-tight [&_svg]:shrink-0', getPriorityToneClass(priority))}>
                <span className="[&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
                  {getPriorityIcon(priority)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{priorityLabel}</span>
              </span>
            </div>
            <div
              className={cn('flex min-w-0 shrink-0 items-center justify-end px-1.5 py-1 tabular-nums', GANTT_META_COL_DIVIDER)}
              style={{ width: GANTT_COL_PROGRESS_W }}
              title={ganttProgressPercentDisplay(task.progress)}
            >
              <span className="truncate text-xs text-muted-foreground">{ganttProgressPercentDisplay(task.progress)}</span>
            </div>
          </>
        ) : null}
      </div>
  )

  const chartBlock = (
      <div className="relative flex min-h-0 min-w-0 items-center overflow-hidden bg-transparent" style={{ width: chartWidth }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
          {weekendColumnRects.map((r, i) => (
            <div
              key={`usub-wk-${task.id}-${r.left}-${i}`}
              className="absolute top-0 bottom-0 bg-slate-500/[0.11] dark:bg-slate-400/[0.05]"
              style={{ left: r.left, width: r.width }}
            />
          ))}
        </div>
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
}
