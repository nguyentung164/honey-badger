'use client'

import type { TFunction } from 'i18next'
import type { Locale } from 'date-fns'
import { addDays, addMonths, differenceInCalendarDays, format, getDay, getISOWeek, startOfDay, startOfMonth } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { Briefcase, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Layers, Users } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'
import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { parseLocalDate, toYyyyMmDd } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import {
  GANTT_LEADING_FIXED_W,
  GANTT_LEFT_META_FIXED_W,
  HB_GANTT_GRID_V_VAR,
  HB_GANTT_NAME_W_VAR,
  hbGantt,
  hbGanttRootStyle,
} from './ganttLayoutCssVars'
import { GanttTimelineGridOverlay } from './GanttTimelineGridOverlay'
import { TaskGanttWorkload, type WorkloadBoardSegment, type WorkloadDisplayMode, type WorkloadOverrideUpsertInput } from './TaskGanttWorkload'
import { isTaskBulkSelectable, type TaskTableRowTask } from './TaskTableRow'
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

const LS_GANTT_ROWS = 'honey_badger.taskGantt.rowGroup.v1'
const LS_GANTT_LABEL_W = 'honey_badger.taskGantt.labelWidth.v1'
const LS_GANTT_GRID_BORDERS = 'honey_badger.taskGantt.gridBorders.v1'
const LS_GANTT_ACTUAL_BARS = 'honey_badger.taskGantt.showActualBars.v1'
const LS_GANTT_EXPANDED_PARENTS = 'honey_badger.taskGantt.expandedParents.v1'
/** segmentKey của nhóm By Assignee / By Project đang thu gọn (ẩn các task trong nhóm). */
const LS_GANTT_COLLAPSED_GROUP_SEGMENTS = 'honey_badger.taskGantt.collapsedGroupSegments.v1'
const LS_GANTT_META_RAIL_EXPANDED = 'honey_badger.taskGantt.metaRailExpanded.v1'
const LS_GANTT_WORKLOAD_SPLIT = 'honey_badger.taskGantt.workloadSplitShare.v1'
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

/** Dải cột meta (TASK TITLE, …) phải trên thanh meta body (45) khi scroll dọc, nhưng dưới `Popover`/`z-50` (DateRange, filter) — tránh lịch/tooltip bị chìm. */
const Z_GANTT_STICKY_TOP_HEADER = 36
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
const Z_GANTT_BODY_TODAY = 10

/** Lớp nổi trong panel Gantt: trên sticky (≤48), dưới Popover/DatePicker (`z-50`). Dùng cho overlay loading (`TaskManagement`) và nút đóng/mở cột meta. */
export const Z_GANTT_BOARD_LOADING_OVERLAY = Z_GANTT_STICKY_TOP_HEADER + 1

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

type GanttActualBarTone = 'late_start' | 'late_finish' | 'late_both' | 'early' | 'on_time'

/**
 * So với plan: tách trễ bắt đầu / trễ kết thúc / cả hai; ưu tiên báo trễ deadline (`late_finish`) khi chỉ một mốc trễ kết thúc.
 */
function ganttActualBarVarianceTone(planStart: Date, planEnd: Date, actual: { start: Date; end: Date }): GanttActualBarTone {
  const ps = startOfDay(planStart).getTime()
  const pe = startOfDay(planEnd).getTime()
  const aS = startOfDay(actual.start).getTime()
  const aE = startOfDay(actual.end).getTime()
  const lateStart = aS > ps
  const lateFinish = aE > pe
  if (lateStart && lateFinish) return 'late_both'
  if (lateFinish) return 'late_finish'
  if (lateStart) return 'late_start'

  const earlyStart = aS < ps
  const earlyFinish = aE < pe
  if (earlyStart || earlyFinish) return 'early'
  return 'on_time'
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
      return 'border-sky-950/30 bg-sky-600/90 dark:border-sky-300/25 dark:bg-sky-500/85'
    default:
      return 'border-emerald-900/30 bg-emerald-600/88 dark:border-emerald-300/22 dark:bg-emerald-500/82'
  }
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
  locale: Locale
  milestoneLabel?: string
  toggleGroupSegmentCollapsed: (segmentKey: string) => void
  toggleExpand: (taskId: string) => void
  t: TFunction
}

/** Viền dưới hàng Gantt: `showGridBorders === undefined` → theo `data-gantt-grid` trên sheet (group). */
function ganttRowSheetBorderClasses(showGridBorders: boolean | undefined, rowSelected: boolean) {
  if (showGridBorders === true) {
    return cn(
      'border-b border-b-border/60',
      rowSelected ? 'bg-primary/[0.09] dark:bg-primary/12' : 'bg-transparent'
    )
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
export type GanttVirtualRowChromePrefs = GanttVirtualRowActualChrome & { showGridBorders: boolean }

function renderGanttVirtualRowSlice(
  flatRow: GanttVirtualFlatRow,
  stable: GanttVirtualSliceStableCtx,
  actualChrome: GanttVirtualRowActualChrome
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
        className={cn(
          'h-full w-full shrink-0 border-b border-border/25 bg-muted',
          'group-data-[gantt-grid=on]/ganttGridShell:border-b-border/60'
        )}
        style={{ width: stable.chartWidth }}
        aria-hidden
      />
    )
    return { meta, chart }
  }

  const displayNo = flatRow.displayNo
  const taskProps = {
    task: flatRow.task,
    start: stable.start,
    pixelPerDay: stable.pixelPerDay,
    chartWidth: stable.chartWidth,
    weekendColumnRects: stable.weekendColumnRects,
    statusColorMap: stable.statusColorMap,
    selectedTaskIds: stable.selectedTaskIds,
    onToggleTaskSelect: stable.onToggleTaskSelect,
    onOpenTaskById: stable.onOpenTaskById,
    getAssigneeDisplay: stable.getAssigneeDisplay,
    getStatusLabel: stable.getStatusLabel,
    getPriorityLabel: stable.getPriorityLabel,
    getStatusIcon: stable.getStatusIcon,
    getPriorityIcon: stable.getPriorityIcon,
    getStatusToneClass: stable.getStatusToneClass,
    getPriorityToneClass: stable.getPriorityToneClass,
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
      task: flatRow.task,
      chartWidth: stable.chartWidth,
      selectedTaskIds: stable.selectedTaskIds,
      onToggleTaskSelect: stable.onToggleTaskSelect,
      onOpenTaskById: stable.onOpenTaskById,
      getAssigneeDisplay: stable.getAssigneeDisplay,
      getStatusLabel: stable.getStatusLabel,
      getPriorityLabel: stable.getPriorityLabel,
      getStatusIcon: stable.getStatusIcon,
      getPriorityIcon: stable.getPriorityIcon,
      getStatusToneClass: stable.getStatusToneClass,
      getPriorityToneClass: stable.getPriorityToneClass,
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
          selectedTaskIds={stable.selectedTaskIds}
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
          selectedTaskIds={stable.selectedTaskIds}
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
    meta: (
      <GanttTaskRow
        {...taskProps}
        onUpdatePlanDates={stable.onUpdatePlanDates}
        rowSegment="meta"
      />
    ),
    chart: (
      <GanttTaskRow
        {...taskProps}
        onUpdatePlanDates={stable.onUpdatePlanDates}
        rowSegment="chart"
      />
    ),
  }
}

/** Band cuối tuần + lưới + today + SVG dependency — tách khỏi `TaskGanttView` để cuộn dọc không re-render (virtualizer nằm trong con). */
type GanttBodyChartLayersProps = {
  leftBlockWidth: number
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
  leftBlockWidth,
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
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 z-0 overflow-hidden"
        style={{ left: leftBlockWidth, width: chartWidth, top: 0, bottom: 0 }}
      >
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
          left: leftBlockWidth,
          width: chartWidth,
          top: 0,
          bottom: 0,
          opacity: `var(${HB_GANTT_GRID_V_VAR}, 0)`,
        }}
      >
        <GanttTimelineGridOverlay
          scale={scale}
          pixelPerDay={pixelPerDay}
          chartWidth={chartWidth}
          verticalGridLineLeftPx={verticalGridLineLeftPx}
        />
      </div>
      {arrowPaths.length > 0 ? (
        <div
          className="pointer-events-none absolute top-0 overflow-hidden"
          style={{ left: leftBlockWidth, width: chartWidth, height: totalBodyPx, zIndex: Z_GANTT_BODY_DEPENDENCIES }}
          aria-hidden
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden text-primary/70 dark:text-primary/80"
            aria-hidden
          >
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
                <path
                  d="M 0.35,0.35 L 5.65,3 L 0.35,5.65 z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth={0.35}
                  strokeLinejoin="round"
                />
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
          style={{ left: leftBlockWidth, width: chartWidth, height: totalBodyPx, zIndex: Z_GANTT_BODY_TODAY }}
          aria-hidden
        >
          <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: chartWidth }}>
            <div className="absolute top-0 bottom-0 w-px bg-rose-600/95" style={{ left: todayPxCenter }} title={todayMark} />
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
}

const GanttVirtualRowsPane = memo(function GanttVirtualRowsPane({
  scrollRef,
  flatRows,
  sliceStable,
  rowActualChrome,
  chartWidth,
}: GanttVirtualRowsPaneProps) {
  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: index => (flatRows[index]?.kind === 'groupHeader' ? GROUP_HEADER_H : GANTT_ROW_H),
    overscan: 5,
    getItemKey: index => flatRows[index]?.key ?? `idx:${index}`,
  })

  return (
    <>
      {virtualizer.getVirtualItems().map(vRow => {
        const flatRow = flatRows[vRow.index]
        if (!flatRow) return null
        const { meta, chart } = renderGanttVirtualRowSlice(flatRow, sliceStable, rowActualChrome)
        return (
          <div
            key={vRow.key}
            className="absolute left-0 flex flex-row items-stretch transform-gpu"
            style={{
              top: vRow.start,
              height: vRow.size,
              zIndex: Z_GANTT_BODY_ROWS,
              ...hbGantt.sheet(chartWidth),
            }}
          >
            <div
              className="sticky left-0 isolate shrink-0 transform-gpu border-r border-border/50 bg-background"
              style={{ ...hbGantt.leftBlock, zIndex: Z_GANTT_STICKY_BODY_LEFT_RAIL }}
            >
              {meta}
            </div>
            <div className="relative shrink-0 overflow-hidden" style={{ width: chartWidth, height: vRow.size }}>
              {chart}
            </div>
          </div>
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
  workloadSegments = [],
  workloadCapTruncated = null,
  workloadLoading = false,
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
  /** Workload theo từng project (mỗi segment một `getWorkload`). */
  workloadSegments?: WorkloadBoardSegment[]
  /** Khi danh sách project bị cắt theo giới hạn an toàn. */
  workloadCapTruncated?: { total: number; shown: number } | null
  workloadLoading?: boolean
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
  const [showActualBars, setShowActualBars] = useState(() => loadGanttShowActualBars())
  const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(() => loadExpandedParents())
  const [collapsedGroupSegmentKeys, setCollapsedGroupSegmentKeys] = useState<Set<string>>(() => loadCollapsedGroupSegments())
  const [metaRailExpanded, setMetaRailExpanded] = useState(() => loadMetaRailExpanded())
  const [ganttWorkloadSplitShare, setGanttWorkloadSplitShare] = useState(() => loadGanttWorkloadSplitShare())
  const [ganttWorkloadSplitShellH, setGanttWorkloadSplitShellH] = useState(0)
  const pixelPerDay = ganttPixelPerDay(scale)

  const taskNameColumnWidth = labelColumnWidth
  const leftBlockWidth = useMemo(
    () => GANTT_LEADING_FIXED_W + taskNameColumnWidth + (metaRailExpanded ? GANTT_LEFT_META_FIXED_W : 0),
    [taskNameColumnWidth, metaRailExpanded]
  )

  const ganttLayoutRootStyle = useMemo(
    () => hbGanttRootStyle(labelColumnWidth, metaRailExpanded, showGridBorders),
    [labelColumnWidth, metaRailExpanded, showGridBorders]
  )

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

  const labelResizeDragRef = useRef<{ pointerId: number; startX: number; startW: number } | null>(null)
  const ganttLayoutRootRef = useRef<HTMLDivElement>(null)

  const groupingEffective: GanttRowGrouping = disableRowGrouping ? 'flat' : rowGrouping

  useEffect(() => {
    if (disableRowGrouping) return
    saveGanttRowGrouping(rowGrouping)
  }, [disableRowGrouping, rowGrouping])

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
  })
  const renderMiniGanttForUserRef = useRef<(userId: string, projectId: string | null) => ReactNode>(null)
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

  const ganttVirtualFlatRows = useMemo(
    () => buildGanttVirtualFlatRows(groupTrees, collapsedGroupSegmentKeys, expandedParentIds, t('taskManagement.ganttSubtaskNoPlanDates')),
    [groupTrees, collapsedGroupSegmentKeys, expandedParentIds, t]
  )

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
  const showWorkload = workloadLoading === true || workloadSegments.length > 0
  /** Bảng workload có data: header cố định ngoài overflow-y (không sticky dọc → hết lệch subpixel Chrome). */
  const workloadSplitScroll = Boolean(showWorkload && workloadSegments.length > 0)

  const workloadScheduledRefs = useMemo(
    () =>
      scheduled.map(t => ({
        id: t.id,
        projectId: (t.projectId ?? '').trim() || null,
        assigneeUserId: t.assigneeUserId,
        planStartDate: t.planStartDate,
        planEndDate: t.planEndDate,
      })),
    [scheduled]
  )

  useEffect(() => {
    const g = ganttScrollRef.current
    const w = workloadScrollRef.current
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
  }, [showWorkload, workloadSplitScroll, scheduled.length])

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
      leftBlockWidthPx: leftBlockWidth,
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
    }),
    [
      workloadSegments,
      workloadCapTruncated,
      scale,
      start,
      totalDays,
      pixelPerDay,
      chartWidth,
      leftBlockWidth,
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
    ]
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
    if (!showWorkload) {
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
  }, [showWorkload])

  useEffect(() => {
    if (!showWorkload) {
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
  }, [showWorkload])

  const onGanttWorkloadSplitPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!showWorkload) return
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
    [showWorkload, applyGanttWorkloadPaneDragVisual]
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
    if (!showWorkload) return
    if (ganttWorkloadSplitDraggingRef.current) return
    commitGanttWorkloadPaneLayoutDom(ganttChartIdealHeightPx, ganttWorkloadSplitShellH, ganttWorkloadSplitShare)
  }, [showWorkload, ganttChartIdealHeightPx, ganttWorkloadSplitShellH, ganttWorkloadSplitShare, commitGanttWorkloadPaneLayoutDom])

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

  const ganttVirtualSliceStable = useMemo(
    (): GanttVirtualSliceStableCtx => ({
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
      locale,
      milestoneLabel: labels.milestoneLabel,
      toggleGroupSegmentCollapsed,
      toggleExpand,
      t,
    }),
    [
      chartWidth,
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

  miniGanttDisplayPrefsRef.current = { ...ganttRowActualChrome, showGridBorders }

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
          <div
            className="sticky left-0 z-[2] border-b border-b-border/35 bg-background px-3 py-2 text-[10px] italic text-muted-foreground"
            style={hbGantt.leftPlusChartMin(chartWidth, 720)}
          >
            {labels.emptyScheduled}
          </div>
        )
      }

      return userTasks.map((task, index) => (
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
          onOpenTaskById={openTaskById}
          onUpdatePlanDates={onUpdatePlanDates}
          getAssigneeDisplay={getAssigneeDisplay}
          getStatusLabel={getStatusLabel}
          getPriorityLabel={getPriorityLabel}
          getStatusIcon={getStatusIcon}
          getPriorityIcon={getPriorityIcon}
          getStatusToneClass={getStatusToneClass}
          getPriorityToneClass={getPriorityToneClass}
          showGridBorders={wg.showGridBorders}
          showActualBars={wg.showActualBars}
          locale={locale}
          actualBarRangeTitle={wg.actualBarRangeTitle}
          actualBarHintLateStart={wg.actualBarHintLateStart}
          actualBarHintLateFinish={wg.actualBarHintLateFinish}
          actualBarHintLateBoth={wg.actualBarHintLateBoth}
          actualBarHintEarly={wg.actualBarHintEarly}
          actualBarHintOntime={wg.actualBarHintOntime}
          hasChildren={false}
          indentLevel={0}
          isExpanded={false}
          displayNo={String(index + 1)}
        />
      ))
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
      locale,
    ]
  )

  renderMiniGanttForUserRef.current = renderMiniGanttForUser

  const renderGanttPanelBody = (): React.ReactNode => {
    if (scheduled.length === 0) {
      return (
        <div ref={ganttScrollRef} className={cn('min-h-0 flex-1 [overflow-anchor:none]', showWorkload ? 'overflow-y-auto overflow-x-scroll [&::-webkit-scrollbar]:h-0' : 'overflow-auto')}>
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
            <div
              className={cn('flex shrink-0 items-center justify-center bg-background px-0.5', GANTT_META_COL_DIVIDER)}
              style={hbGantt.colNo}
            >
              <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.ganttColumnNo')}</span>
            </div>
            <div
              className={cn('flex shrink-0 items-center justify-center bg-background px-0.5', GANTT_META_COL_DIVIDER)}
              style={hbGantt.colCheckbox}
            >
              <span className="sr-only">{t('taskManagement.ganttColumnBulkSelect')}</span>
            </div>
            <div className={cn('relative flex shrink-0 items-center justify-center bg-background px-1', GANTT_META_COL_DIVIDER)} style={hbGantt.nameCol}>
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
            <div className={cn('flex shrink-0 items-center justify-center bg-background px-1', GANTT_META_COL_DIVIDER)} style={hbGantt.colAssignee}>
              <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.assignee')}</span>
            </div>
            <div className={cn('flex shrink-0 items-center justify-center bg-background px-1', GANTT_META_COL_DIVIDER)} style={hbGantt.colStatus}>
              <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.status')}</span>
            </div>
            <div className={cn('flex shrink-0 items-center justify-center bg-background px-1', GANTT_META_COL_DIVIDER)} style={hbGantt.colPriority}>
              <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.priority')}</span>
            </div>
            <div className={cn('flex shrink-0 items-center justify-center bg-background px-1', GANTT_META_COL_DIVIDER)} style={hbGantt.colProgress}>
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
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
                style={{ opacity: `var(${HB_GANTT_GRID_V_VAR}, 0)` }}
              >
                <GanttTimelineGridOverlay
                  scale={scale}
                  pixelPerDay={pixelPerDay}
                  chartWidth={chartWidth}
                  verticalGridLineLeftPx={verticalGridLineLeftPx}
                />
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
            showWorkload ? 'overflow-y-auto overflow-x-scroll [&::-webkit-scrollbar]:h-0' : 'overflow-y-auto overflow-x-auto'
          )}
        >
          <div
            className={cn('relative min-h-0 w-max min-w-max grow shrink-0 bg-background/30', 'group/ganttGridShell')}
            data-gantt-grid={showGridBorders ? 'on' : 'off'}
            style={{
              ...hbGantt.sheet(chartWidth),
              minHeight: totalBodyPx,
            }}
          >
            <GanttBodyChartLayers
              leftBlockWidth={leftBlockWidth}
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
            />
          </div>
        </div>
        {scheduled.length > 0 ? (
          <button
            type="button"
            className={cn(
              'pointer-events-auto absolute flex h-7 w-5 items-center justify-center',
              'rounded-r-md border border-border/80 border-l-0 bg-background/95 shadow-sm',
              'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
            )}
            style={{
              ...hbGantt.metaRailToggleLeft,
              top: 'calc(50% + 20px)',
              transform: 'translate(-1px, -50%)',
              zIndex: Z_GANTT_BOARD_LOADING_OVERLAY,
            }}
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
    )
  }

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
            {(labels.actualBarsSwitch || labels.actualBarsHelp) && (
              <div className="flex items-center gap-2 border-border/60 sm:border-l sm:pl-3">
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
        ref={ganttLayoutRootRef}
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col rounded-md border border-border/70 bg-muted/10',
          'transition-[box-shadow,background-color] duration-300 ease-out motion-reduce:transition-none',
          timelineChromeFlash && 'bg-primary/[0.07] shadow-[inset_0_0_0_2px_hsl(var(--primary)/0.22)] motion-reduce:bg-muted/10 motion-reduce:shadow-none'
        )}
        style={ganttLayoutRootStyle}
      >
        {showWorkload ? (
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
            >
            </button>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
                  <div ref={workloadScrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-auto [overflow-anchor:none] [scrollbar-gutter:stable]">
                    <div className="relative block bg-background/30" style={hbGantt.sheet(chartWidth)}>
                      <TaskGanttWorkload {...workloadSharedProps} segment="body" displayMode={workloadDisplayMode} onDisplayModeChange={setWorkloadDisplayMode} />
                    </div>
                  </div>
                </>
              ) : (
                <div ref={workloadScrollRef} className="min-h-0 flex-1 overflow-auto [overflow-anchor:none] [scrollbar-gutter:stable]">
                  <div className="relative block bg-background/30" style={hbGantt.sheet(chartWidth)}>
                    <TaskGanttWorkload {...workloadSharedProps} segment="full" />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{renderGanttPanelBody()}</div>
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

const GanttTaskRow = memo(function GanttTaskRow({
  task,
  start,
  pixelPerDay,
  chartWidth,
  weekendColumnRects: weekendColumnRectsProp,
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
  showGridBorders: showGridBordersProp,
  showActualBars = false,
  locale,
  actualBarRangeTitle,
  actualBarHintLateStart,
  actualBarHintLateFinish,
  actualBarHintLateBoth,
  actualBarHintEarly,
  actualBarHintOntime,
  indentLevel = 0,
  hasChildren = false,
  isExpanded = false,
  onToggleExpand,
  rowSegment = 'full',
  displayNo,
}: {
  task: TaskTableRowTask
  start: Date
  pixelPerDay: number
  chartWidth: number
  weekendColumnRects?: { left: number; width: number }[]
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
}) {
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

  const show = dragPreview ?? { start: sNorm, end: eNorm }
  const showOffset = differenceInCalendarDays(show.start, start)
  const showSpan = calendarSpanInclusive(show.start, show.end)
  const leftPx = Math.max(0, showOffset * pixelPerDay)
  const widthPx = Math.max(pixelPerDay * 0.5, showSpan * pixelPerDay)

  const timelineDays = Math.max(1, Math.round(chartWidth / pixelPerDay))
  const actualDayRange = showActualBars ? resolveGanttActualBarDayRange(task) : null
  const dateLocale = locale ?? enUS
  let actualStrip: { leftPx: number; widthPx: number; title: string; tone: GanttActualBarTone } | null = null
  if (actualDayRange) {
    const sIdx = differenceInCalendarDays(actualDayRange.start, start)
    const eIdx = differenceInCalendarDays(actualDayRange.end, start)
    if (eIdx >= 0 && sIdx < timelineDays) {
      const clS = Math.max(0, sIdx)
      const clE = Math.min(timelineDays - 1, eIdx)
      const al = clS * pixelPerDay
      const aw = Math.max(pixelPerDay * 0.5, (clE - clS + 1) * pixelPerDay)
      const maxW = chartWidth - al
      const prefix = (actualBarRangeTitle ?? '').trim() || 'Actual'
      const tone = ganttActualBarVarianceTone(sNorm, eNorm, actualDayRange)
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
      const hint = (hintRaw ?? '').trim()
      const hintPart = hint ? ` · ${hint}` : ''
      actualStrip = {
        leftPx: al,
        widthPx: Math.min(aw, maxW),
        tone,
        title: `${prefix}: ${format(actualDayRange.start, 'P', { locale: dateLocale })} – ${format(actualDayRange.end, 'P', { locale: dateLocale })}${hintPart}`,
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
  const rowSelected = Boolean(selectedTaskIds?.has(task.id))
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
    ganttRowSheetBorderClasses(showGridBordersProp, rowSelected)
  )
  const rowChromeHalf = cn(
    'flex shrink-0 items-stretch hover:bg-muted/25',
    rowSelected && 'bg-primary/[0.11] hover:bg-primary/[0.14] dark:bg-primary/15 dark:hover:bg-primary/[0.18]',
    ganttRowSheetBorderClasses(showGridBordersProp, rowSelected)
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
      <div
        className={cn('flex min-w-0 shrink-0 items-center justify-center px-0.5 py-1 tabular-nums', metaCellBg, GANTT_META_COL_DIVIDER)}
        style={hbGantt.colNo}
      >
        <span className="truncate text-xs text-muted-foreground">{displayNo ?? ''}</span>
      </div>
      <div className={cn('flex min-w-0 shrink-0 items-center justify-center py-1', metaCellBg, GANTT_META_COL_DIVIDER)} style={hbGantt.colCheckbox}>
        {onToggleTaskSelect && isTaskBulkSelectable(task) ? (
          <Checkbox
            checked={selectedTaskIds?.has(task.id) ?? false}
            onCheckedChange={handleToggleSelect}
            className="h-4 w-4 shrink-0"
            aria-label={`Select ${task.title || 'task'}`}
          />
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" aria-hidden />
        )}
      </div>
      <div className={cn('flex min-w-0 shrink-0 items-center gap-1 px-1.5 py-1', metaCellBg, GANTT_META_COL_DIVIDER)} style={hbGantt.nameCol}>
        {indentPx > 0 ? <span className="shrink-0" style={{ width: indentPx }} aria-hidden /> : null}
        {hasChildren ? (
          <button
            type="button"
            className="flex h-5 w-5 shrink-0 items-center justify-center"
            onClick={handleToggleExpand}
            aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
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
          title={task.title}
          onClick={handleOpenTask}
        >
          {task.title || '—'}
        </button>
      </div>
      <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', metaCellBg, GANTT_META_COL_DIVIDER)} style={hbGantt.colAssignee} title={assigneeText}>
        <span className="truncate text-xs text-muted-foreground">{assigneeText}</span>
      </div>
      <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', metaCellBg, GANTT_META_COL_DIVIDER)} style={hbGantt.colStatus} title={statusLabel}>
        <span className={cn('flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-tight [&_svg]:shrink-0', getStatusToneClass(displayStatus))}>
          <span className="[&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
            {getStatusIcon(displayStatus)}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{statusLabel}</span>
        </span>
      </div>
      <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', metaCellBg, GANTT_META_COL_DIVIDER)} style={hbGantt.colPriority} title={priorityLabel}>
        <span className={cn('flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-tight [&_svg]:shrink-0', getPriorityToneClass(priority))}>
          <span className="[&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
            {getPriorityIcon(priority)}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{priorityLabel}</span>
        </span>
      </div>
      <div
        className={cn('flex min-w-0 shrink-0 items-center justify-end px-1.5 py-1 tabular-nums', metaCellBg, GANTT_META_COL_DIVIDER)}
        style={hbGantt.colProgress}
        title={ganttProgressPercentDisplay(task.progress)}
      >
        <span className="truncate text-xs text-muted-foreground">{ganttProgressPercentDisplay(task.progress)}</span>
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
          <div
            aria-hidden
            className={cn('pointer-events-none absolute z-[2] rounded-b-[2px] border', ganttActualBarStripSurfaceClass(actualStrip.tone))}
            style={{
              left: actualStrip.leftPx,
              width: actualStrip.widthPx,
              top: planBarHeightPx,
              height: actualStripHeightPx,
              maxWidth: chartWidth - actualStrip.leftPx,
            }}
            title={actualStrip.title}
          />
        ) : null}
        <div
          role="presentation"
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
            className={cn('min-w-0 flex-1 cursor-default truncate px-1', canDrag && 'cursor-grab active:cursor-grabbing')}
            style={{ lineHeight: `${planBarHeightPx}px` }}
            onPointerDown={e => canDrag && beginDrag('move', e)}
            onDoubleClick={handleOpenTask}
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
})

const GanttMilestoneRow = memo(function GanttMilestoneRow({
  task,
  start,
  pixelPerDay,
  chartWidth,
  weekendColumnRects: weekendColumnRectsProp,
  selectedTaskIds,
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
  selectedTaskIds?: Set<string>
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

  const rowSelected = Boolean(selectedTaskIds?.has(task.id))
  const indentPx = indentLevel * 16
  const tooltipText = milestoneLabel ? `${milestoneLabel}: ${task.title}` : task.title
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
        'flex min-h-0 min-w-0 flex-1 flex-row items-center gap-1 border-r border-border/50 px-2 py-1 transform-gpu',
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
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-xs font-medium leading-tight text-amber-600 dark:text-amber-400 underline-offset-2 hover:underline"
        title={tooltipText}
        onClick={handleOpenTask}
      >
        {task.title || '—'}
      </button>
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
  selectedTaskIds,
  onToggleTaskSelect,
  onOpenTaskById,
  getAssigneeDisplay,
  getStatusLabel,
  getPriorityLabel,
  getStatusIcon,
  getPriorityIcon,
  getStatusToneClass,
  getPriorityToneClass,
  showGridBorders: showGridBordersProp,
  noPlanHint,
  indentLevel = 1,
  rowSegment = 'full',
  displayNo,
}: {
  task: TaskTableRowTask
  chartWidth: number
  weekendColumnRects?: { left: number; width: number }[]
  selectedTaskIds?: Set<string>
  onToggleTaskSelect?: (taskId: string) => void
  onOpenTaskById: (taskId: string) => void
  getAssigneeDisplay?: (assigneeUserId: string | null) => string
  getStatusLabel: (status: string) => string
  getPriorityLabel: (priority: string) => string
  getStatusIcon: (status: string) => ReactNode
  getPriorityIcon: (priority: string) => ReactNode
  getStatusToneClass: (code: string) => string
  getPriorityToneClass: (code: string) => string
  /** `undefined` = theo `data-gantt-grid` trên sheet Gantt. */
  showGridBorders?: boolean
  noPlanHint: string
  indentLevel?: number
  rowSegment?: GanttRowSegment
  displayNo: string | null
}) {
  const handleOpenTask = useCallback(() => {
    onOpenTaskById(task.id)
  }, [onOpenTaskById, task.id])

  const handleToggleSelect = useCallback(() => {
    onToggleTaskSelect?.(task.id)
  }, [onToggleTaskSelect, task.id])

  const rowSelected = Boolean(selectedTaskIds?.has(task.id))
  const assigneeText = getAssigneeDisplay?.(task.assigneeUserId) ?? (task.assigneeUserId?.trim() ? task.assigneeUserId : '—')
  const displayStatus = task.status
  const priority = (task.priority ?? 'medium') as string
  const statusLabel = getStatusLabel(displayStatus)
  const priorityLabel = getPriorityLabel(priority)
  const indentPx = indentLevel * 16
  const seg = rowSegment
  const isMilestoneUnsched = task.type === 'milestone'

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
        'flex min-h-0 min-w-0 flex-1 flex-row items-center gap-1 border-r border-border/50 px-2 py-1 transform-gpu',
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
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-amber-500" aria-hidden>
        <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
          <path d="M6 0 L12 6 L6 12 L0 6 Z" />
        </svg>
      </span>
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-xs font-medium leading-tight text-amber-600 dark:text-amber-400 underline-offset-2 hover:underline"
        title={task.title}
        onClick={handleOpenTask}
      >
        {task.title || '—'}
      </button>
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
      <div
        className={cn('flex min-w-0 shrink-0 items-center justify-center px-0.5 py-1 tabular-nums', metaCellBg, GANTT_META_COL_DIVIDER)}
        style={hbGantt.colNo}
      >
        <span className="truncate text-xs text-muted-foreground">{displayNo ?? ''}</span>
      </div>
      <div className={cn('flex min-w-0 shrink-0 items-center justify-center py-1', metaCellBg, GANTT_META_COL_DIVIDER)} style={hbGantt.colCheckbox}>
        {onToggleTaskSelect && isTaskBulkSelectable(task) ? (
          <Checkbox
            checked={selectedTaskIds?.has(task.id) ?? false}
            onCheckedChange={handleToggleSelect}
            className="h-4 w-4 shrink-0"
            aria-label={`Select ${task.title || 'task'}`}
          />
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" aria-hidden />
        )}
      </div>
      <div className={cn('flex min-w-0 shrink-0 items-center gap-1 px-1.5 py-1', metaCellBg, GANTT_META_COL_DIVIDER)} style={hbGantt.nameCol}>
        {indentPx > 0 ? <span className="shrink-0" style={{ width: indentPx }} aria-hidden /> : null}
        <span className="h-5 w-5 shrink-0" aria-hidden />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-xs font-medium leading-tight text-muted-foreground underline-offset-2 hover:underline"
          title={task.title}
          onClick={handleOpenTask}
        >
          {task.title || '—'}
        </button>
      </div>
      <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', metaCellBg, GANTT_META_COL_DIVIDER)} style={hbGantt.colAssignee} title={assigneeText}>
        <span className="truncate text-xs text-muted-foreground">{assigneeText}</span>
      </div>
      <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', metaCellBg, GANTT_META_COL_DIVIDER)} style={hbGantt.colStatus} title={statusLabel}>
        <span className={cn('flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-tight [&_svg]:shrink-0', getStatusToneClass(displayStatus))}>
          <span className="[&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
            {getStatusIcon(displayStatus)}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{statusLabel}</span>
        </span>
      </div>
      <div className={cn('flex min-w-0 shrink-0 items-center px-1.5 py-1', metaCellBg, GANTT_META_COL_DIVIDER)} style={hbGantt.colPriority} title={priorityLabel}>
        <span className={cn('flex min-w-0 max-w-full items-center gap-1.5 text-xs leading-tight [&_svg]:shrink-0', getPriorityToneClass(priority))}>
          <span className="[&_svg]:h-3.5 [&_svg]:w-3.5" aria-hidden>
            {getPriorityIcon(priority)}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{priorityLabel}</span>
        </span>
      </div>
      <div
        className={cn('flex min-w-0 shrink-0 items-center justify-end px-1.5 py-1 tabular-nums', metaCellBg, GANTT_META_COL_DIVIDER)}
        style={hbGantt.colProgress}
        title={ganttProgressPercentDisplay(task.progress)}
      >
        <span className="truncate text-xs text-muted-foreground">{ganttProgressPercentDisplay(task.progress)}</span>
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
