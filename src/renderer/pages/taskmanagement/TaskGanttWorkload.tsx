'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import type { VirtualItem } from '@tanstack/virtual-core'
import type { Locale } from 'date-fns'
import { addDays, addMonths, differenceInCalendarDays, format, getDay, startOfDay, startOfMonth } from 'date-fns'
import { ChevronDown, ChevronRight, ChevronsDown, ChevronsRight, Crown, FoldVertical, Layers, Lock, Trash2, UnfoldVertical } from 'lucide-react'
import type { CSSProperties, Dispatch, MouseEvent, ReactNode, RefObject, SetStateAction } from 'react'
import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { parseLocalDate, toYyyyMmDd } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { GanttTimelineGridOverlay } from './GanttTimelineGridOverlay'
import { HB_GANTT_GRID_V_VAR, HB_GANTT_TODAY_LINE_MARK, hbGantt } from './ganttLayoutCssVars'
import { Z_GANTT_META_RAIL_FLOATING_TOGGLE } from './taskGanttZIndex'

export type WorkloadDayCell = {
  userId: string
  date: string
  derivedHours: number
  /** Giờ thực tế (daily report); hiển thị khi không có override */
  actualWorkHours: number | null
  overrideHours: number | null
  taskCount: number
  taskIds: string[]
}

export type WorkloadUserMeta = {
  userId: string
  name: string
  userCode: string
  role: 'pm' | 'pl' | 'dev'
}

export type WorkloadData = {
  users: WorkloadUserMeta[]
  days: WorkloadDayCell[]
  hoursPerDay: number
  nonWorkingDates: string[]
  canEditAll: boolean
  selfUserId: string
}

/** Một khối workload theo project — Gantt có thể ghép nhiều segment. */
export type WorkloadBoardSegment = {
  projectId: string
  projectLabel: string
  data: WorkloadData
}

export type WorkloadScale = 'week' | 'month' | 'monthly'

export type WorkloadDisplayMode = 'hours' | 'tasks'

/** `full`: một khối (banner / đợi load). `header`|`body`: tách header khỏi overflow-y — không dùng sticky dọc, tránh lệch subpixel Chrome. */
export type WorkloadTableSegment = 'full' | 'header' | 'body'

export type WorkloadOverrideUpsertInput = {
  projectId: string
  userId: string
  workDate: string
  overrideHours: number | null
  note: string | null
}

/** Một dòng chọn ngày trong Dialog override (snapshot khi mở — không đọc cellMap lại trong ô). */
export type WorkloadOverrideChoiceSnapshot = {
  iso: string
  weekend: boolean
  label: string
  overrideHours: number | null
}

/** Payload mở editor override duy nhất cho pane workload. */
export type WorkloadOverrideEditSnapshot = {
  projectId: string
  userId: string
  canEditAll: boolean
  choices: WorkloadOverrideChoiceSnapshot[]
  /** Ngày chọn mặc định (ưu tiên ngày làm việc đầu trong bucket). */
  initialIso: string
}

/** Task đã lên lịch trên Gantt — đếm Tasks theo trùng plan với **ngày trong tuần** trong bucket (không T7/CN). */
export type WorkloadGanttScheduledTaskRef = {
  id: string
  projectId: string | null
  assigneeUserId: string | null
  planStartDate: string
  planEndDate: string
}

type WorkloadProps = {
  segments: WorkloadBoardSegment[]
  /** Đã cắt danh sách project theo giới hạn an toàn (hiển thị tooltip một dòng). */
  capTruncated?: { total: number; shown: number } | null
  scale: WorkloadScale
  start: Date
  totalDays: number
  pixelPerDay: number
  chartWidth: number
  weekendColumnRects: { left: number; width: number }[]
  verticalGridLeftPx: number[]
  showGridBorders: boolean
  /** Khớp công tắc Actual bar trên Gantt — khi false, giờ / fill dùng plan (`derivedHours`). */
  showActualBars: boolean
  locale: Locale
  language: string
  loading?: boolean
  /** Task có plan trên Gantt (cùng view) — Tasks mode: giao plan với T2–T6 trong bucket (bỏ T7/CN). */
  scheduledGanttTasks?: WorkloadGanttScheduledTaskRef[]
  /** Slot mini-Gantt khi expand row → render filtered GanttTaskRow của user. `projectId === null` = tất cả project (Assignee). */
  renderMiniGanttForUser?: (userId: string, projectId: string | null) => ReactNode
  /**
   * Khớp chế độ group hàng Gantt: `project` = nhóm theo project (mặc định);
   * `flat` = danh sách phẳng, tên project cạnh subtitle; `assignee` = cộng giờ theo user/ngày.
   */
  workloadRowGrouping?: 'flat' | 'assignee' | 'project'
  onUpsertOverride?: (input: WorkloadOverrideUpsertInput) => Promise<void> | void
  getUserAvatarUrl?: (userId: string) => string | null | undefined
  segment?: WorkloadTableSegment
  /** Khi `segment` là `header` hoặc `body`: controlled mode để hai mount dùng chung Hours/Tasks. */
  displayMode?: WorkloadDisplayMode
  onDisplayModeChange?: (mode: WorkloadDisplayMode) => void
  /** Ref vào vùng timeline (chartWidth) của strip header — parent đồng bộ translateX với Gantt, không mirror scroll. */
  headerTimelineTrackRef?: RefObject<HTMLDivElement | null>
  /**
   * Board chỉ Workload: vẽ ngày / lưới / T7–CN giống header Gantt.
   * Board Both (`combine`): Gantt đã có dải ngày — tắt để không trùng.
   */
  showTimelineDayStrip?: boolean
  /** Tick timeline từ parent (đồng bộ với Gantt). Chỉ dùng khi `showTimelineDayStrip`. */
  timelineTicks?: { d: Date; left: number; line1: string; line2?: string; cellWidth: number }[]
  /**
   * Scroll container của pane workload (body / full) — bật virtualize hàng khi đủ nhiều hàng phẳng.
   * Header-only (`segment="header"`) không truyền.
   */
  bodyScrollRef?: RefObject<HTMLElement | null>
  /** Độ rộng khối meta trái (px), khớp Gantt `leftBlockWidth` — dùng `scrollMargin` cho virtualizer ngang chart. */
  leftBlockWidthPx?: number
  /**
   * Khi tách `segment="header"` và `segment="body"` (split scroll): parent phải nâng state để thu project / mở mini-Gantt
   * áp dụng cùng một nguồn cho cả header (nút bulk) và body (hàng).
   */
  collapsedProjectIdsShared?: Set<string>
  setCollapsedProjectIdsShared?: Dispatch<SetStateAction<Set<string>>>
  expandedRowKeysShared?: Set<string>
  setExpandedRowKeysShared?: Dispatch<SetStateAction<Set<string>>>
}

function isWeekend(d: Date): boolean {
  const dow = getDay(d)
  return dow === 0 || dow === 6
}

const HEADER_H = 40
const ROW_H = 40

/**
 * Khi tắt “Grid lines”: đường kẻ ngang là **border** (`border-bottom` / `border-top`), không phải `outline`.
 * Nhạt hơn hàng Gantt — layout workload dễ **chồng hai border** (header nhóm + viền đáy panel).
 */
const WL_NO_GRID_LINE = 'border-b-border/[0.08]'
const WL_NO_GRID_BODY_CHILD_B = '[&>*]:border-b-border/[0.08]'
const WL_NO_GRID_EXPAND_TOP = 'border-t-border/[0.08]'

/** Nền trục thời gian chart — khớp sheet Gantt (`bg-background/30` + lớp slate cuối tuần). */
const WL_CHART_SURFACE_BG = 'bg-background/30'

/** Nền cột thứ 7 / CN — cùng token Gantt (`GanttBodyChartLayers` / từng hàng `row-wk`). */
const WL_WEEKEND_COLUMN_BG = 'bg-slate-500/[0.11] dark:bg-slate-400/[0.05]'

/** Cột meta trái trong strip header (sticky ngang trong overflow-x của header). */
const Z_WORKLOAD_HEADER_STRIP_META = 0
const Z_WORKLOAD_STICKY_ROW_META = 30
/** Lớp nội dung hàng workload — trên today line để frozen column luôn “thắng” stacking với sibling. */
const Z_WORKLOAD_BODY_STACK = 5
/** Timeline chart (weekend + lưới + today) — pointer-events-none, dưới hàng (z-[2]). */
const Z_WORKLOAD_INNER_TIMELINE_DECOR = 1

/** Ngưỡng bucket timeline — bật virtual ngang khi đủ nhiều ô (giữ DOM ô trong viewport ± overscan). */
const WORKLOAD_CHART_HZ_VIRTUAL_MIN_BUCKETS = 40

/** Ngưỡng hàng phẳng (header nhóm + user) để bật `@tanstack/react-virtual`. */
const WORKLOAD_VIRTUAL_MIN_ROWS = 28
const PROJECT_HEADER_ROW_H = 28
/** Ước lượng chiều cao mini-Gantt trong hàng expand — khớp TaskGanttView `GANTT_ROW_H`. */
const WORKLOAD_MINI_GANTT_ROW_EST = 36
/** Sync chiều cao scroll mini-Gantt expand với `WorkloadMiniGanttSplitPanel` (TaskGanttView). */
export const WORKLOAD_EXPANDED_MINI_MAX_SCROLL_PX = 300

/** Stable empty array — tránh tạo `[]` mới mỗi render khi không có scheduled tasks, ngăn flatRows useMemo invalidate thừa. */
const EMPTY_SCHED: WorkloadGanttScheduledTaskRef[] = []

type Bucket = { left: number; width: number; startDate: Date; endDate: Date; days: Date[] }

/** Virtual ngang chart — chỉ render bucket trong viewport ± overscan. */
type WorkloadChartCellsVirtual = { enabled: false } | { enabled: true; scrollMargin: number; items: VirtualItem[] }

/** Gói mở Dialog override — ô chỉ gửi payload, không mount Radix Popover. */
type WorkloadOverrideEditOpenPayload = {
  projectId: string
  userId: string
  bucket: Bucket
  cellMap: Map<string, WorkloadDayCell>
  locale: Locale
  allowEdit: boolean
  canEditAll: boolean
}

/** Kết quả gộp bucket — tiền tính để tránh gọi aggregate trong từng ô. */
export type WorkloadBucketAgg = {
  hours: number
  tasks: number
  workingDays: number
  isFullyNonWorking: boolean
  hasOverride: boolean
}

type WorkloadFlatRow =
  | {
    kind: 'projectHeader'
    key: string
    segment: WorkloadBoardSegment
    projectBodyVisible: boolean
  }
  | {
    kind: 'user'
    key: string
    segment: WorkloadBoardSegment
    user: WorkloadUserMeta
    rk: string
    miniGanttTaskCount: number
  }

type WorkloadSegmentDerived = {
  normalizedDays: WorkloadDayCell[]
  cellMap: Map<string, WorkloadDayCell>
  nonWorkingSet: Set<string>
  scheduledByAssignee: Map<string, WorkloadGanttScheduledTaskRef[]>
  totalHoursPerUser: Map<string, number>
  aggMatrix: Map<string, WorkloadBucketAgg[]>
}

function workloadRowKey(projectId: string, userId: string): string {
  return `${projectId}|${userId}`
}

function aggregateBucketForUserWithCtx(
  userId: string,
  bucket: Bucket,
  cellMap: Map<string, WorkloadDayCell>,
  nonWorkingSet: Set<string>,
  scheduledByAssignee: Map<string, WorkloadGanttScheduledTaskRef[]>,
  showActualBars: boolean
): WorkloadBucketAgg {
  let hours = 0
  let tasks = 0
  let workingDays = 0
  let nonWorking = 0
  let hasOverride = false
  const seenTaskIds = new Set<string>()
  const uidKey = (userId || '').trim()
  const ganttList = scheduledByAssignee.get(uidKey)
  const useGanttTaskCount = Boolean(ganttList && ganttList.length > 0)

  for (const d of bucket.days) {
    const iso = toYyyyMmDd(d) || ''
    const isNw = isWeekend(d) || nonWorkingSet.has(iso)
    if (isNw) {
      nonWorking++
    } else {
      workingDays++
    }
    const cell = cellMap.get(`${userId}|${iso}`)
    if (cell) {
      hours += effectiveHoursOfCell(cell, showActualBars)
      if (cell.overrideHours != null) hasOverride = true
      if (!useGanttTaskCount && cell.taskCount > 0) {
        for (const tid of cell.taskIds) {
          if (tid && !seenTaskIds.has(tid)) {
            seenTaskIds.add(tid)
            tasks++
          }
        }
      }
    }
  }
  if (useGanttTaskCount && ganttList) {
    tasks = countDistinctTasksOverlappingBucketCalendar(bucket, ganttList)
  }
  return { hours, tasks, workingDays, isFullyNonWorking: nonWorking === bucket.days.length && bucket.days.length > 0, hasOverride }
}

function buildWorkloadSegmentDerived(
  projectId: string,
  data: WorkloadData,
  scheduledGanttTasks: WorkloadGanttScheduledTaskRef[],
  showActualBars: boolean,
  buckets: Bucket[]
): WorkloadSegmentDerived | null {
  if (!data?.users?.length) return null
  const normalizedDays = !data.days?.length ? ([] as WorkloadDayCell[]) : data.days.map(d => normalizeWorkloadDay(d as WorkloadDayCell & Record<string, unknown>))
  const cellMap = new Map<string, WorkloadDayCell>()
  for (const d of normalizedDays) {
    cellMap.set(`${d.userId}|${d.date}`, d)
  }
  const nonWorkingSet = new Set<string>(data.nonWorkingDates ?? [])
  const scheduledByAssignee = new Map<string, WorkloadGanttScheduledTaskRef[]>()
  if (scheduledGanttTasks?.length) {
    for (const t of scheduledGanttTasks) {
      const uid = (t.assigneeUserId ?? '').trim()
      if (!uid) continue
      const arr = scheduledByAssignee.get(uid)
      if (arr) arr.push(t)
      else scheduledByAssignee.set(uid, [t])
    }
  }
  const totalHoursPerUser = new Map<string, number>()
  for (const d of normalizedDays) {
    totalHoursPerUser.set(d.userId, (totalHoursPerUser.get(d.userId) ?? 0) + effectiveHoursOfCell(d, showActualBars))
  }
  const aggMatrix = new Map<string, WorkloadBucketAgg[]>()
  for (const user of data.users) {
    const rk = workloadRowKey(projectId, user.userId)
    aggMatrix.set(
      rk,
      buckets.map(b => aggregateBucketForUserWithCtx(user.userId, b, cellMap, nonWorkingSet, scheduledByAssignee, showActualBars))
    )
  }
  return { normalizedDays, cellMap, nonWorkingSet, scheduledByAssignee, totalHoursPerUser, aggMatrix }
}

function buildWorkloadFlatRows(
  displaySegments: WorkloadBoardSegment[],
  panelLayout: 'project' | 'flat' | 'assignee',
  collapsedProjectIds: Set<string>,
  boardHasRenderableWorkloadGrid: boolean,
  scheduledTasksByProject: Map<string, WorkloadGanttScheduledTaskRef[]>,
  assigneeScheduledTasks: WorkloadGanttScheduledTaskRef[]
): WorkloadFlatRow[] {
  const rows: WorkloadFlatRow[] = []
  for (const seg of displaySegments) {
    const empty = seg.data.users.length === 0 || seg.data.days.length === 0
    if (boardHasRenderableWorkloadGrid && empty) continue

    const projectBodyVisible = panelLayout === 'project' ? !collapsedProjectIds.has(seg.projectId) : true

    if (panelLayout === 'project' && !empty) {
      rows.push({ kind: 'projectHeader', key: `wl-ph:${seg.projectId}`, segment: seg, projectBodyVisible })
    }
    if (!projectBodyVisible || empty) continue

    const tasksForSeg = panelLayout === 'assignee' ? assigneeScheduledTasks : (scheduledTasksByProject.get(seg.projectId) ?? [])

    // Precompute O(T) thay vì O(users × T) — tránh gọi filter trong từng user
    const miniCountByUid = new Map<string, number>()
    for (const t of tasksForSeg) {
      const uid = (t.assigneeUserId ?? '').trim()
      if (!uid) continue
      if (panelLayout !== 'assignee' && (t.projectId ?? '').trim() !== seg.projectId) continue
      miniCountByUid.set(uid, (miniCountByUid.get(uid) ?? 0) + 1)
    }

    for (const user of seg.data.users) {
      const rk = workloadRowKey(seg.projectId, user.userId)
      rows.push({
        kind: 'user',
        key: rk,
        segment: seg,
        user,
        rk,
        miniGanttTaskCount: miniCountByUid.get((user.userId || '').trim()) ?? 0,
      })
    }
  }
  return rows
}

function estimateWorkloadFlatRowHeight(row: WorkloadFlatRow, expandedKeys: Set<string>): number {
  if (row.kind === 'projectHeader') return PROJECT_HEADER_ROW_H
  if (!expandedKeys.has(row.rk)) return ROW_H
  const rawMini = row.miniGanttTaskCount * WORKLOAD_MINI_GANTT_ROW_EST
  const miniH = Math.min(Math.max(rawMini, WORKLOAD_MINI_GANTT_ROW_EST), WORKLOAD_EXPANDED_MINI_MAX_SCROLL_PX)
  return ROW_H + miniH
}

/** Một lớp timeline duy nhất cho toàn workload body — tránh N× SVG lưới / band cuối tuần trên mỗi hàng. */
function WorkloadInnerTimelineDecor({
  chartWidth,
  scale,
  pixelPerDay,
  weekendColumnRects,
  verticalGridLeftPx,
  showTodayLine,
  todayPxCenter,
  todayTitle,
  displayMode,
}: {
  chartWidth: number
  scale: WorkloadScale
  pixelPerDay: number
  weekendColumnRects: { left: number; width: number }[]
  verticalGridLeftPx: number[]
  showTodayLine: boolean
  todayPxCenter: number
  todayTitle: string
  displayMode: WorkloadDisplayMode
}) {
  /** Hours: lưới dọc + nền T7/CN phía sau ô; Tasks: không vạch dọc / không band chồng (ô đã tự tô). */
  const showWorkloadTimelineVerticalDecor = displayMode === 'hours'
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 min-h-full overflow-hidden"
      style={{ ...(hbGantt.chartAreaFromMetaRail(chartWidth) as CSSProperties), zIndex: Z_WORKLOAD_INNER_TIMELINE_DECOR }}
    >
      {showWorkloadTimelineVerticalDecor ? (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {weekendColumnRects.map((r, i) => (
            <div key={`wl-inner-wk-${r.left}-${i}`} className={cn('absolute top-0 bottom-0', WL_WEEKEND_COLUMN_BG)} style={{ left: r.left, width: r.width }} />
          ))}
        </div>
      ) : null}
      {showWorkloadTimelineVerticalDecor ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" style={{ opacity: `var(${HB_GANTT_GRID_V_VAR}, 0)` }}>
          <GanttTimelineGridOverlay scale={scale} pixelPerDay={pixelPerDay} chartWidth={chartWidth} verticalGridLineLeftPx={verticalGridLeftPx} />
        </div>
      ) : null}
      {showTodayLine ? (
        <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" aria-hidden>
          <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: chartWidth }}>
            <div className={HB_GANTT_TODAY_LINE_MARK} style={{ left: todayPxCenter }} title={todayTitle} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function parsePlanDateWorkload(raw: string | undefined): Date | null {
  if (!raw?.trim()) return null
  const trimmed = raw.trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const x = parseLocalDate(trimmed)
    return x != null ? startOfDay(x) : null
  }
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return startOfDay(d)
}

/** [from, to] inclusive — chỉ các ngày T2–T6 trong bucket; T7/CN không tham gia đếm Tasks. */
function bucketWorkingWeekdaysRangeInclusive(bucket: Bucket): { from: Date; to: Date } | null {
  const weekdays = bucket.days.map(d => startOfDay(d)).filter(d => !isWeekend(d))
  if (weekdays.length === 0) return null
  let minT = weekdays[0].getTime()
  let maxT = minT
  for (const x of weekdays) {
    const t = x.getTime()
    if (t < minT) minT = t
    if (t > maxT) maxT = t
  }
  return { from: new Date(minT), to: new Date(maxT) }
}

/** Số task khác nhau có plan giao khoảng **ngày trong tuần** của bucket (bỏ T7/CN). */
function countDistinctTasksOverlappingBucketCalendar(bucket: Bucket, tasksForUser: WorkloadGanttScheduledTaskRef[]): number {
  const b = bucketWorkingWeekdaysRangeInclusive(bucket)
  if (!b) return 0
  const seen = new Set<string>()
  for (const task of tasksForUser) {
    const s0 = parsePlanDateWorkload(task.planStartDate)
    const e0 = parsePlanDateWorkload(task.planEndDate)
    if (!s0 || !e0) continue
    const ts = s0.getTime() <= e0.getTime() ? s0 : e0
    const te = s0.getTime() <= e0.getTime() ? e0 : s0
    if (ts.getTime() <= b.to.getTime() && te.getTime() >= b.from.getTime()) {
      seen.add(task.id)
    }
  }
  return seen.size
}

/** Sinh các bucket theo `scale` để bucket workload. */
function buildBuckets(scale: WorkloadScale, start: Date, totalDays: number, pixelPerDay: number): Bucket[] {
  const s0 = startOfDay(start)
  const out: Bucket[] = []
  if (scale === 'week') {
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(s0, i)
      out.push({ left: i * pixelPerDay, width: pixelPerDay, startDate: d, endDate: d, days: [d] })
    }
    return out
  }
  if (scale === 'monthly') {
    const endExclusive = addDays(s0, totalDays)
    let cur = startOfMonth(s0)
    while (cur < endExclusive) {
      const next = addMonths(cur, 1)
      const startIdx = Math.max(0, differenceInCalendarDays(cur, s0))
      const endIdx = Math.min(totalDays, differenceInCalendarDays(next, s0))
      if (endIdx > startIdx) {
        const left = startIdx * pixelPerDay
        const width = (endIdx - startIdx) * pixelPerDay
        const days: Date[] = []
        for (let i = startIdx; i < endIdx; i++) days.push(addDays(s0, i))
        out.push({ left, width, startDate: addDays(s0, startIdx), endDate: addDays(s0, endIdx - 1), days })
      }
      cur = next
    }
    return out
  }
  for (let i = 0; i < totalDays; i += 7) {
    const span = Math.min(7, totalDays - i)
    const days: Date[] = []
    for (let k = 0; k < span; k++) days.push(addDays(s0, i + k))
    out.push({
      left: i * pixelPerDay,
      width: span * pixelPerDay,
      startDate: days[0],
      endDate: days[days.length - 1],
      days,
    })
  }
  return out
}

/** Chuẩn hoá payload IPC / legacy (snake_case) → một shape duy nhất — tránh mất giờ do đọc sai field. */
function normalizeWorkloadDay(raw: WorkloadDayCell & Record<string, unknown>): WorkloadDayCell {
  const userId = String(raw.userId ?? raw.user_id ?? '').trim()
  const date = String(raw.date ?? '')
    .trim()
    .slice(0, 10)
  const d0 = Number(raw.derivedHours ?? raw.derived_hours)
  const derivedHours = Number.isFinite(d0) ? d0 : 0
  const a0 = raw.actualWorkHours ?? raw.actual_work_hours
  const actualWorkHours =
    a0 == null || a0 === '' || (typeof a0 === 'number' && Number.isNaN(a0))
      ? null
      : (() => {
        const n = Number(a0)
        return Number.isFinite(n) ? n : null
      })()
  const o0 = raw.overrideHours ?? raw.override_hours
  const overrideHours =
    o0 == null || o0 === '' || (typeof o0 === 'number' && Number.isNaN(o0))
      ? null
      : (() => {
        const n = Number(o0)
        return Number.isFinite(n) ? n : null
      })()
  const tc0 = Number(raw.taskCount ?? raw.task_count)
  const taskCount = Number.isFinite(tc0) ? Math.max(0, Math.floor(tc0)) : 0
  const idsRaw = raw.taskIds ?? raw.task_ids
  const taskIds = taskCount > 0 && Array.isArray(idsRaw) ? idsRaw.map(x => String(x).trim()).filter(Boolean) : []
  return { userId, date, derivedHours, actualWorkHours, overrideHours, taskCount, taskIds }
}

function effectiveHoursOfCell(cell: WorkloadDayCell | undefined, preferActual: boolean): number {
  if (!cell) return 0
  if (cell.overrideHours != null) return Number(cell.overrideHours) || 0
  if (preferActual && cell.actualWorkHours != null) return Number(cell.actualWorkHours) || 0
  return Number(cell.derivedHours) || 0
}

/** Gộp workload nhiều project → một user một dòng, cộng giờ / task theo ngày (Assignee mode). */
function mergeWorkloadSegmentsByAssignee(segments: WorkloadBoardSegment[], preferActual: boolean): WorkloadBoardSegment {
  const orderedUserIds: string[] = []
  const userMetaById = new Map<string, WorkloadUserMeta>()
  const dayMerge = new Map<string, WorkloadDayCell>()
  const nonWorkingDates = new Set<string>()
  let hoursPerDay = 8
  let canEditAll = false
  let selfUserId = ''

  for (const seg of segments) {
    const d = seg.data
    hoursPerDay = d.hoursPerDay ?? hoursPerDay
    canEditAll = canEditAll || d.canEditAll
    if (!selfUserId && d.selfUserId) selfUserId = d.selfUserId
    for (const nw of d.nonWorkingDates ?? []) nonWorkingDates.add(nw)
    for (const u of d.users) {
      if (!userMetaById.has(u.userId)) {
        userMetaById.set(u.userId, u)
        orderedUserIds.push(u.userId)
      }
    }
    for (const raw of d.days) {
      const n = normalizeWorkloadDay(raw as WorkloadDayCell & Record<string, unknown>)
      const k = `${n.userId}|${n.date}`
      const prev = dayMerge.get(k)
      if (!prev) {
        dayMerge.set(k, { ...n })
      } else {
        const effSum = effectiveHoursOfCell(prev, preferActual) + effectiveHoursOfCell(n, preferActual)
        const taskIdSet = new Set<string>([...prev.taskIds, ...n.taskIds])
        const mergedIds = Array.from(taskIdSet)
        dayMerge.set(k, {
          userId: n.userId,
          date: n.date,
          derivedHours: effSum,
          actualWorkHours: null,
          overrideHours: null,
          taskCount: mergedIds.length,
          taskIds: mergedIds,
        })
      }
    }
  }

  const users = orderedUserIds.map(id => userMetaById.get(id)).filter((u): u is WorkloadUserMeta => Boolean(u))
  const days = Array.from(dayMerge.values())

  return {
    projectId: '__workload_assignee__',
    projectLabel: '',
    data: {
      users,
      days,
      hoursPerDay,
      nonWorkingDates: Array.from(nonWorkingDates).sort(),
      canEditAll,
      selfUserId,
    },
  }
}

/** By-project workload: đóng (0) → mở khối project (1) → mở mini-Gantt user (2) → đóng. Khi không có user row thì chỉ 0↔1. */
function getWorkloadProjectBulkCyclePhase(
  projectIds: string[],
  userRowKeys: string[],
  collapsedProjectIds: Set<string>,
  expandedRowKeys: Set<string>
): 0 | 1 | 2 {
  if (!projectIds.length) return 0
  const allCollapsed = projectIds.every(id => collapsedProjectIds.has(id))
  const allExpanded = projectIds.every(id => !collapsedProjectIds.has(id))
  const allMinisOpen = userRowKeys.length > 0 && userRowKeys.every(k => expandedRowKeys.has(k))

  if (allCollapsed) return 0
  if (allExpanded && allMinisOpen) return 2
  if (allExpanded) return 1
  return 0
}

function useWorkloadPaneBulkExpand(
  segments: WorkloadBoardSegment[],
  workloadRowGrouping: 'flat' | 'assignee' | 'project',
  showActualBars: boolean,
  collapsedProjectIds: Set<string>,
  setCollapsedProjectIds: Dispatch<SetStateAction<Set<string>>>,
  expandedRowKeys: Set<string>,
  setExpandedRowKeys: Dispatch<SetStateAction<Set<string>>>
) {
  const displaySegments = useMemo((): WorkloadBoardSegment[] => {
    if (workloadRowGrouping === 'assignee' && segments.length > 0) {
      return [mergeWorkloadSegmentsByAssignee(segments, showActualBars)]
    }
    return segments
  }, [workloadRowGrouping, segments, showActualBars])

  const panelLayout: 'project' | 'flat' | 'assignee' =
    workloadRowGrouping === 'flat' ? 'flat' : workloadRowGrouping === 'assignee' ? 'assignee' : 'project'

  const workloadProjectBulkIds = useMemo(
    () =>
      panelLayout === 'project'
        ? displaySegments.filter(s => s.data.users.length > 0 && s.data.days.length > 0).map(s => s.projectId)
        : [],
    [displaySegments, panelLayout]
  )

  /** Assignee + flat: cùng mini-Gantt theo `rk = workloadRowKey(projectId, userId)`. */
  const workloadMiniGanttBulkRowKeys = useMemo(() => {
    if (workloadRowGrouping !== 'assignee' && workloadRowGrouping !== 'flat') return []
    const keys: string[] = []
    for (const seg of displaySegments) {
      if (seg.data.users.length === 0 || seg.data.days.length === 0) continue
      for (const u of seg.data.users) {
        keys.push(workloadRowKey(seg.projectId, u.userId))
      }
    }
    return keys
  }, [displaySegments, workloadRowGrouping])

  /** By-project: mọi khóa hàng user trong workload (mở mini-Gantt hàng loạt). */
  const workloadProjectBulkUserRowKeys = useMemo(() => {
    if (workloadRowGrouping !== 'project') return []
    const keys: string[] = []
    for (const seg of displaySegments) {
      if (seg.data.users.length === 0 || seg.data.days.length === 0) continue
      for (const u of seg.data.users) {
        keys.push(workloadRowKey(seg.projectId, u.userId))
      }
    }
    return keys
  }, [displaySegments, workloadRowGrouping])

  const workloadProjectBulkPhase = useMemo(() => {
    if (workloadRowGrouping !== 'project' || !workloadProjectBulkIds.length) return 0 as const
    return getWorkloadProjectBulkCyclePhase(
      workloadProjectBulkIds,
      workloadProjectBulkUserRowKeys,
      collapsedProjectIds,
      expandedRowKeys
    )
  }, [
    workloadRowGrouping,
    workloadProjectBulkIds,
    workloadProjectBulkUserRowKeys,
    collapsedProjectIds,
    expandedRowKeys,
  ])

  const workloadProjectBulkUpcomingPhase = useMemo(() => {
    if (workloadRowGrouping !== 'project' || !workloadProjectBulkIds.length) return 0 as const
    const cycleLen = workloadProjectBulkUserRowKeys.length > 0 ? 3 : 2
    return ((workloadProjectBulkPhase + 1) % cycleLen) as 0 | 1 | 2
  }, [workloadRowGrouping, workloadProjectBulkIds.length, workloadProjectBulkPhase, workloadProjectBulkUserRowKeys.length])

  const cycleWorkloadProjectBulkExpand = useCallback(() => {
    const projectIds = workloadProjectBulkIds
    const rowKeys = workloadProjectBulkUserRowKeys
    if (!projectIds.length) return

    const phase = getWorkloadProjectBulkCyclePhase(projectIds, rowKeys, collapsedProjectIds, expandedRowKeys)
    const cycleLen = rowKeys.length > 0 ? 3 : 2
    const next = ((phase + 1) % cycleLen) as 0 | 1 | 2

    if (next === 0) {
      setCollapsedProjectIds(prev => {
        const n = new Set(prev)
        for (const id of projectIds) n.add(id)
        return n
      })
      setExpandedRowKeys(new Set())
    } else if (next === 1) {
      setCollapsedProjectIds(prev => {
        const n = new Set(prev)
        for (const id of projectIds) n.delete(id)
        return n
      })
      setExpandedRowKeys(new Set())
    } else {
      setCollapsedProjectIds(prev => {
        const n = new Set(prev)
        for (const id of projectIds) n.delete(id)
        return n
      })
      setExpandedRowKeys(new Set(rowKeys))
    }
  }, [
    collapsedProjectIds,
    expandedRowKeys,
    setCollapsedProjectIds,
    setExpandedRowKeys,
    workloadProjectBulkIds,
    workloadProjectBulkUserRowKeys,
  ])

  const toggleWorkloadAssigneeMiniBulk = useCallback(() => {
    const keys = workloadMiniGanttBulkRowKeys
    if (!keys.length) return
    setExpandedRowKeys(prev => {
      const anyOpen = keys.some(k => prev.has(k))
      if (anyOpen) return new Set<string>()
      return new Set(keys)
    })
  }, [setExpandedRowKeys, workloadMiniGanttBulkRowKeys])

  const anyWorkloadAssigneeMiniOpen = useMemo(
    () => workloadMiniGanttBulkRowKeys.some(k => expandedRowKeys.has(k)),
    [expandedRowKeys, workloadMiniGanttBulkRowKeys]
  )

  const bulkVisible =
    (workloadRowGrouping === 'project' && workloadProjectBulkIds.length > 0) ||
    ((workloadRowGrouping === 'assignee' || workloadRowGrouping === 'flat') &&
      workloadMiniGanttBulkRowKeys.length > 0)

  return {
    bulkVisible,
    workloadRowGrouping,
    workloadProjectBulkUpcomingPhase,
    anyWorkloadAssigneeMiniOpen,
    cycleWorkloadProjectBulkExpand,
    toggleWorkloadAssigneeMiniBulk,
  }
}

function formatHours(n: number): string {
  if (!Number.isFinite(n) || n === 0) return ''
  if (n >= 100) return `${Math.round(n)}h`
  return n % 1 === 0 ? `${n.toFixed(0)}h` : `${n.toFixed(1)}h`
}

function bucketTone(loadRatio: number): { bg: string; text: string } {
  if (loadRatio <= 0) return { bg: 'bg-background', text: 'text-muted-foreground' }
  if (loadRatio < 0.6) return { bg: 'bg-emerald-100/48 dark:bg-emerald-950/45', text: 'text-emerald-800 dark:text-emerald-200' }
  if (loadRatio < 1.0) return { bg: 'bg-emerald-200/48 dark:bg-emerald-900/45', text: 'text-emerald-900 dark:text-emerald-100' }
  if (loadRatio < 1.2) return { bg: 'bg-amber-100/48 dark:bg-amber-950/45', text: 'text-amber-900 dark:text-amber-200' }
  return { bg: 'bg-rose-100/48 dark:bg-rose-950/45', text: 'text-rose-800 dark:text-rose-200' }
}

/** Từ tỷ lệ này trở lên (và không vượt cap) coi là “đủ” → xanh; dưới → cam nhạt (underutilized). */
const WORKLOAD_HOURS_OK_MIN_RATIO = 0.98

type WorkloadHoursFillBand = 'under' | 'ok' | 'over'

/**
 * Fill (giờ mode): `bucketCapacity` (thường workingDays×h/ngày) = 100%.
 * - under: ít hơn ngưỡng đủ việc → cam nhạt
 * - ok: đủ trong capacity → xanh
 * - over: vượt capacity → đỏ
 * Không tô khi bucket không có ngà làm việc hoặc 0 giờ.
 */
function workloadHoursFillStyle(hours: number, bucketCapacity: number, workingDays: number): { fillPct: number; band: WorkloadHoursFillBand } | null {
  if (workingDays <= 0) return null
  const cap = Math.max(0.5, bucketCapacity)
  const h = Number(hours)
  const safeH = Number.isFinite(h) ? Math.max(0, h) : 0
  if (safeH <= 0) return null
  const fillPct = Math.min(100, (safeH / cap) * 100)
  if (safeH > cap) return { fillPct, band: 'over' }
  const ratio = safeH / cap
  if (ratio >= WORKLOAD_HOURS_OK_MIN_RATIO) return { fillPct, band: 'ok' }
  return { fillPct, band: 'under' }
}

function workloadHoursFillClass(band: WorkloadHoursFillBand): string {
  switch (band) {
    case 'under':
      return 'bg-yellow-600/28 dark:bg-yellow-500/32'
    case 'ok':
      return 'bg-emerald-600/38 dark:bg-emerald-500/34'
    case 'over':
      return 'bg-rose-600/38 dark:bg-rose-500/34'
  }
}

function userInitials(meta: WorkloadUserMeta): string {
  const src = (meta.name || meta.userCode || '').trim()
  if (!src) return '?'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export const TaskGanttWorkload = memo(function TaskGanttWorkload({
  segments,
  capTruncated,
  scale,
  start,
  totalDays,
  pixelPerDay,
  chartWidth,
  weekendColumnRects,
  verticalGridLeftPx,
  showGridBorders,
  showActualBars = true,
  locale,
  language: _language,
  loading = false,
  scheduledGanttTasks,
  renderMiniGanttForUser,
  onUpsertOverride,
  getUserAvatarUrl,
  segment = 'full',
  displayMode: displayModeProp,
  onDisplayModeChange,
  headerTimelineTrackRef,
  showTimelineDayStrip = true,
  timelineTicks,
  workloadRowGrouping = 'project',
  bodyScrollRef,
  leftBlockWidthPx,
  collapsedProjectIdsShared,
  setCollapsedProjectIdsShared,
  expandedRowKeysShared,
  setExpandedRowKeysShared,
}: WorkloadProps) {
  const { t } = useTranslation()
  const [internalDisplayMode, setInternalDisplayMode] = useState<WorkloadDisplayMode>('hours')
  const displayControlled = displayModeProp !== undefined && onDisplayModeChange !== undefined
  const displayMode = displayControlled ? displayModeProp : internalDisplayMode
  const setDisplayMode = displayControlled ? onDisplayModeChange : setInternalDisplayMode
  const [localExpandedRowKeys, setLocalExpandedRowKeys] = useState<Set<string>>(() => new Set())
  const [localCollapsedProjectIds, setLocalCollapsedProjectIds] = useState<Set<string>>(() => new Set())

  const collapsedProjectIds = collapsedProjectIdsShared ?? localCollapsedProjectIds
  const setCollapsedProjectIds = setCollapsedProjectIdsShared ?? setLocalCollapsedProjectIds
  const expandedRowKeys = expandedRowKeysShared ?? localExpandedRowKeys
  const setExpandedRowKeys = setExpandedRowKeysShared ?? setLocalExpandedRowKeys

  const displaySegments = useMemo((): WorkloadBoardSegment[] => {
    if (workloadRowGrouping === 'assignee' && segments.length > 0) {
      return [mergeWorkloadSegmentsByAssignee(segments, showActualBars)]
    }
    return segments
  }, [workloadRowGrouping, segments, showActualBars])

  /** Đã có ít nhất một segment có lưới user×ngày — segment khác chỉ `empty` sẽ không render (tránh lặp message). */
  const boardHasRenderableWorkloadGrid = useMemo(() => displaySegments.some(s => s.data.users.length > 0 && s.data.days.length > 0), [displaySegments])

  const panelLayout: 'project' | 'flat' | 'assignee' = workloadRowGrouping === 'flat' ? 'flat' : workloadRowGrouping === 'assignee' ? 'assignee' : 'project'

  const buckets = useMemo(() => buildBuckets(scale, start, totalDays, pixelPerDay), [scale, start, totalDays, pixelPerDay])

  const todayPxCenter = useMemo(() => {
    const idx = differenceInCalendarDays(startOfDay(new Date()), startOfDay(start))
    return idx * pixelPerDay + pixelPerDay / 2
  }, [start, pixelPerDay])
  const showTodayLine = todayPxCenter >= 0 && todayPxCenter <= chartWidth
  const todayMark = t('taskManagement.ganttTodayTooltip')

  const scheduledTasksByProject = useMemo(() => {
    const m = new Map<string, WorkloadGanttScheduledTaskRef[]>()
    if (!scheduledGanttTasks?.length) return m
    for (const t of scheduledGanttTasks) {
      const pid = (t.projectId ?? '').trim()
      if (!pid) continue
      const arr = m.get(pid)
      if (arr) arr.push(t)
      else m.set(pid, [t])
    }
    return m
  }, [scheduledGanttTasks])

  const toggleRowKey = useCallback((key: string) => {
    setExpandedRowKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleProjectSegmentCollapsed = useCallback((projectId: string) => {
    setCollapsedProjectIds(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }, [])

  const headerHoursPerDay = useMemo(() => {
    const filled = displaySegments.find(s => s.data.users.length > 0 && s.data.days.length > 0)
    const pick = filled ?? displaySegments[0]
    return pick?.data.hoursPerDay ?? segments[0]?.data.hoursPerDay ?? 8
  }, [displaySegments, segments])

  const workloadHeaderRow = useMemo(
    () => (
      <div className={cn('flex w-full min-w-0 shrink-0 items-stretch border-b bg-muted', showGridBorders ? 'border-border/70' : WL_NO_GRID_LINE)} style={{ height: HEADER_H }}>
        <div
          className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 overflow-hidden border-r border-border/50 bg-muted px-3"
          style={{ ...hbGantt.leftBlock, zIndex: Z_WORKLOAD_HEADER_STRIP_META }}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.workloadTitle')}</div>
          </div>
          <ToggleGroup
            type="single"
            value={displayMode}
            onValueChange={v => {
              if (!v) return
              startTransition(() => setDisplayMode(v as WorkloadDisplayMode))
            }}
            variant="outline"
            size="sm"
            className="gap-px"
          >
            <ToggleGroupItem value="hours" className="h-6 px-2 text-[10px]">
              {t('taskManagement.workloadHours')}
            </ToggleGroupItem>
            <ToggleGroupItem value="tasks" className="h-6 px-2 text-[10px]">
              {t('taskManagement.workloadTasks')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
          <div
            ref={headerTimelineTrackRef}
            className="relative isolate min-h-0 flex-1 shrink-0 bg-muted text-[10px] text-muted-foreground will-change-transform [contain:layout_paint_size]"
            style={{ width: chartWidth, height: HEADER_H }}
          >
            {showTimelineDayStrip ? (
              <>
                {displayMode === 'hours' ? (
                  <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                    {weekendColumnRects.map((r, i) => (
                      <div
                        key={`wl-hdr-wk-${r.left}-${i}`}
                        className="absolute top-0 bottom-0 bg-slate-500/[0.11] dark:bg-slate-400/[0.05]"
                        style={{ left: r.left, width: r.width }}
                      />
                    ))}
                  </div>
                ) : null}
                {displayMode === 'hours' ? (
                  <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" style={{ opacity: `var(${HB_GANTT_GRID_V_VAR}, 0)` }}>
                    <GanttTimelineGridOverlay scale={scale} pixelPerDay={pixelPerDay} chartWidth={chartWidth} verticalGridLineLeftPx={verticalGridLeftPx} />
                  </div>
                ) : null}
                {(timelineTicks ?? []).map(mark => (
                  <div
                    key={`wl-hdr-tick-${+mark.d}-${mark.left}`}
                    className="absolute top-0 z-[2] flex h-full flex-col items-center justify-center gap-px leading-tight text-center"
                    style={{ left: mark.left, width: mark.cellWidth, height: HEADER_H }}
                  >
                    <span className="w-full max-w-full truncate px-0.5 text-[9px] font-semibold text-muted-foreground">{mark.line1}</span>
                    {mark.line2 != null && mark.line2 !== '' ? (
                      <span className="w-full max-w-full truncate px-0.5 text-[9px] tabular-nums text-muted-foreground/90">{mark.line2}</span>
                    ) : null}
                  </div>
                ))}
              </>
            ) : null}
            <div className="pointer-events-none absolute inset-y-0 right-3 z-[3] flex items-center justify-end text-[10px] text-muted-foreground/80">
              {t('taskManagement.workloadHoursPerDayLabel', { hours: headerHoursPerDay })}
            </div>
          </div>
        </div>
      </div>
    ),
    [
      chartWidth,
      displayMode,
      headerHoursPerDay,
      headerTimelineTrackRef,
      pixelPerDay,
      scale,
      setDisplayMode,
      showGridBorders,
      showTimelineDayStrip,
      t,
      timelineTicks,
      verticalGridLeftPx,
      weekendColumnRects,
    ]
  )

  const capBanner =
    capTruncated && capTruncated.total > capTruncated.shown ? (
      <div className="border-b border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[10px] text-amber-900 dark:text-amber-200">
        {t('taskManagement.workloadProjectsCapped', { shown: capTruncated.shown, total: capTruncated.total })}
      </div>
    ) : null

  const assigneeScheduledTasks = scheduledGanttTasks ?? EMPTY_SCHED

  const bodyInner =
    segments.length === 0 ? (
      <div className="sticky left-0 z-[2] bg-background px-3 py-3 text-xs text-muted-foreground" style={hbGantt.leftPlusChartMin(chartWidth, 720)}>
        {loading ? t('common.loading') : t('taskManagement.workloadEmptyNoProjects')}
      </div>
    ) : (
      <WorkloadScrollBodySection
        bodyScrollRef={bodyScrollRef}
        displaySegments={displaySegments}
        panelLayout={panelLayout}
        boardHasRenderableWorkloadGrid={boardHasRenderableWorkloadGrid}
        collapsedProjectIds={collapsedProjectIds}
        scheduledTasksByProject={scheduledTasksByProject}
        assigneeScheduledTasks={assigneeScheduledTasks}
        buckets={buckets}
        displayMode={displayMode}
        expandedRowKeys={expandedRowKeys}
        toggleRowKey={toggleRowKey}
        toggleProjectSegmentCollapsed={toggleProjectSegmentCollapsed}
        chartWidth={chartWidth}
        scale={scale}
        pixelPerDay={pixelPerDay}
        weekendColumnRects={weekendColumnRects}
        verticalGridLeftPx={verticalGridLeftPx}
        showGridBorders={showGridBorders}
        showActualBars={showActualBars}
        locale={locale}
        onUpsertOverride={onUpsertOverride}
        getUserAvatarUrl={getUserAvatarUrl}
        renderMiniGanttForUser={renderMiniGanttForUser}
        capBanner={capBanner}
        showTodayLine={showTodayLine}
        todayPxCenter={todayPxCenter}
        todayMark={todayMark}
        leftBlockWidthPx={leftBlockWidthPx}
      />
    )

  if (segment === 'header') {
    return <div className="w-full min-w-0 bg-background">{workloadHeaderRow}</div>
  }

  if (segment === 'body') {
    return (
      <div className="relative grid min-h-0 w-full flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] min-w-0 bg-background" style={hbGantt.sheet(chartWidth)}>
        {segments.length > 0 ? <WorkloadFrozenMetaBleed /> : null}
        <div
          className={cn('relative col-start-1 row-start-1 flex min-h-0 flex-col [&>*]:border-b', showGridBorders ? '[&>*]:border-b-border/60' : WL_NO_GRID_BODY_CHILD_B)}
          style={{ zIndex: Z_WORKLOAD_BODY_STACK }}
        >
          {bodyInner}
        </div>
      </div>
    )
  }

  if (segment === 'full') {
    if (segments.length === 0 && !loading) {
      return (
        <div className="border-t border-border" style={hbGantt.sheet(chartWidth)}>
          <div className="sticky left-0 z-[20] flex items-center gap-2 bg-muted/80 px-3 py-2 backdrop-blur-sm" style={hbGantt.leftPlusChartMin(chartWidth, 1200)}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.workloadTitle')}</div>
          </div>
          <div className="bg-background px-3 py-2 text-xs text-muted-foreground">{t('taskManagement.workloadEmptyNoProjects')}</div>
        </div>
      )
    }
    if (segments.length === 0 && loading) {
      return (
        <div className="border-t border-border" style={hbGantt.sheet(chartWidth)}>
          <div className="sticky left-0 z-[20] flex items-center gap-2 bg-muted/80 px-3 py-2 backdrop-blur-sm" style={hbGantt.leftPlusChartMin(chartWidth, 1200)}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.workloadTitle')}</div>
            <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
          </div>
        </div>
      )
    }
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col border-t border-border" style={hbGantt.sheet(chartWidth)}>
        <div className="shrink-0">{workloadHeaderRow}</div>
        <div className="relative grid min-h-0 w-full flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] bg-background" style={hbGantt.sheet(chartWidth)}>
          {segments.length > 0 ? <WorkloadFrozenMetaBleed /> : null}
          <div
            className={cn('relative col-start-1 row-start-1 flex min-h-0 flex-col [&>*]:border-b', showGridBorders ? '[&>*]:border-b-border/60' : WL_NO_GRID_BODY_CHILD_B)}
            style={{ zIndex: Z_WORKLOAD_BODY_STACK }}
          >
            {bodyInner}
          </div>
        </div>
      </div>
    )
  }

  return null
})

/** Khớp meta hàng (`isolate transform-gpu bg-background`) — z trên lớp lưới chart để vạch timeline không lộ qua khe/slack */
function WorkloadFrozenMetaBleed() {
  return (
    <div
      aria-hidden
      className="pointer-events-none sticky left-0 top-0 z-[2] col-start-1 row-start-1 justify-self-start isolate transform-gpu border-r border-border/50 bg-background"
      style={{ ...hbGantt.leftBlock, height: '100%', minHeight: '100%' }}
    />
  )
}

/** Cạnh timeline pane workload: meta rail + bulk (icon, không nhãn). */
export function WorkloadGanttPaneRailControlStack({
  metaRailExpanded,
  onMetaRailToggle,
  segments,
  workloadRowGrouping,
  showActualBars,
  collapsedProjectIds,
  setCollapsedProjectIds,
  expandedRowKeys,
  setExpandedRowKeys,
  /** Chế độ Both: pane Timeline đã có nút meta — ẩn hàng meta ở đây, chỉ giữ nút workload. */
  includeMetaRail = true,
  includeWorkloadBulk = true,
}: {
  metaRailExpanded: boolean
  onMetaRailToggle: () => void
  segments: WorkloadBoardSegment[]
  workloadRowGrouping: 'flat' | 'assignee' | 'project'
  showActualBars: boolean
  collapsedProjectIds: Set<string>
  setCollapsedProjectIds: Dispatch<SetStateAction<Set<string>>>
  expandedRowKeys: Set<string>
  setExpandedRowKeys: Dispatch<SetStateAction<Set<string>>>
  includeMetaRail?: boolean
  includeWorkloadBulk?: boolean
}) {
  const { t } = useTranslation()
  const {
    bulkVisible,
    workloadRowGrouping: grouping,
    workloadProjectBulkUpcomingPhase,
    anyWorkloadAssigneeMiniOpen,
    cycleWorkloadProjectBulkExpand,
    toggleWorkloadAssigneeMiniBulk,
  } = useWorkloadPaneBulkExpand(
    segments,
    workloadRowGrouping,
    showActualBars,
    collapsedProjectIds,
    setCollapsedProjectIds,
    expandedRowKeys,
    setExpandedRowKeys
  )

  const showBulk = includeWorkloadBulk && bulkVisible
  const showMeta = includeMetaRail
  if (!showMeta && !showBulk) return null

  const bulkAria =
    grouping === 'project'
      ? workloadProjectBulkUpcomingPhase === 0
        ? t('taskManagement.workloadBulkByProjectCycleCloseAllAria')
        : workloadProjectBulkUpcomingPhase === 1
          ? t('taskManagement.workloadBulkByProjectCycleOpenProjectsAria')
          : t('taskManagement.workloadBulkByProjectCycleOpenUsersAria')
      : anyWorkloadAssigneeMiniOpen
        ? t('taskManagement.workloadBulkCollapseAllMiniGanttAria')
        : t('taskManagement.workloadBulkExpandAllMiniGanttAria')

  return (
    <div
      className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-r-md border border-border/80 border-l-0 bg-background/95 shadow-sm"
      style={{
        ...hbGantt.metaRailToggleLeft,
        top: 'calc(50% + 20px)',
        transform: 'translate(-1px, -50%)',
        zIndex: Z_GANTT_META_RAIL_FLOATING_TOGGLE,
      }}
    >
      {showMeta ? (
        <button
          type="button"
          className={cn(
            'flex h-7 w-5 shrink-0 items-center justify-center',
            'text-muted-foreground transition-[background-color,box-shadow,color] duration-200 ease-out',
            'hover:bg-muted hover:text-foreground',
            'motion-safe:active:scale-[0.97] motion-reduce:active:scale-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset'
          )}
          onClick={e => {
            e.stopPropagation()
            onMetaRailToggle()
          }}
          aria-expanded={metaRailExpanded}
          aria-label={metaRailExpanded ? t('taskManagement.ganttMetaRailCollapse') : t('taskManagement.ganttMetaRailExpand')}
          title={metaRailExpanded ? t('taskManagement.ganttMetaRailCollapse') : t('taskManagement.ganttMetaRailExpand')}
        >
          <ChevronsRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none',
              metaRailExpanded && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
      ) : null}

      {showBulk ? (
        <button
          type="button"
          className={cn(
            'flex h-7 w-5 shrink-0 items-center justify-center',
            'text-muted-foreground transition-[background-color,color] duration-200 ease-out',
            'hover:bg-muted hover:text-foreground',
            'motion-safe:active:scale-[0.97] motion-reduce:active:scale-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset',
            showMeta && 'border-t border-border/60'
          )}
          aria-label={bulkAria}
          title={bulkAria}
          onClick={e => {
            e.stopPropagation()
            if (grouping === 'project') cycleWorkloadProjectBulkExpand()
            else toggleWorkloadAssigneeMiniBulk()
          }}
        >
          {grouping === 'project' ? (
            workloadProjectBulkUpcomingPhase === 0 ? (
              <FoldVertical className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : workloadProjectBulkUpcomingPhase === 1 ? (
              <UnfoldVertical className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <ChevronsDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )
          ) : anyWorkloadAssigneeMiniOpen ? (
            <FoldVertical className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <UnfoldVertical className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  )
}

const WorkloadUserWorkloadRow = memo(function WorkloadUserWorkloadRow({
  projectId,
  projectLabel,
  panelLayout,
  data,
  user,
  rk,
  expanded,
  derived,
  buckets,
  displayMode,
  chartWidth,
  showGridBorders,
  locale,
  onRequestWorkloadOverrideEdit,
  getUserAvatarUrl,
  renderMiniGanttForUser,
  toggleRowKey,
  chartCellsVirtual,
  stickyMetaTopGridLine = true,
}: {
  projectId: string
  projectLabel: string
  panelLayout: 'project' | 'flat' | 'assignee'
  data: WorkloadData
  user: WorkloadUserMeta
  rk: string
  expanded: boolean
  derived: WorkloadSegmentDerived
  buckets: Bucket[]
  displayMode: WorkloadDisplayMode
  chartWidth: number
  showGridBorders: boolean
  locale: Locale
  onRequestWorkloadOverrideEdit?: (payload: WorkloadOverrideEditOpenPayload) => void
  getUserAvatarUrl?: (userId: string) => string | null | undefined
  renderMiniGanttForUser?: (userId: string, projectId: string | null) => ReactNode
  toggleRowKey: (key: string) => void
  chartCellsVirtual: WorkloadChartCellsVirtual
  stickyMetaTopGridLine?: boolean
}) {
  const totalH = derived.totalHoursPerUser.get(user.userId) ?? 0
  const allowEditRow = (data.canEditAll || user.userId === data.selfUserId) && panelLayout !== 'assignee'
  const dailyCapacity = data?.hoursPerDay ?? 8
  const aggRow = derived.aggMatrix.get(rk)
  const { cellMap } = derived

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col border-b', showGridBorders ? 'border-b-border/60' : WL_NO_GRID_LINE)}>
      {/* biome-ignore lint/a11y/useSemanticElements: không bọc hàng bằng <button> — hàng có các ô <button> con (expand vs ô workload). */}
      <div
        role="button"
        tabIndex={0}
        className={cn(
          'group relative z-[2] flex cursor-pointer items-stretch text-left transition-colors hover:bg-muted/40',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary'
        )}
        style={{ height: ROW_H }}
        onClick={() => toggleRowKey(rk)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggleRowKey(rk)
          }
        }}
        aria-expanded={expanded}
        aria-label={panelLayout === 'assignee' ? `${user.name || user.userCode}` : `${projectLabel ? `${projectLabel} ` : ''}${user.name || user.userCode}`}
      >
        <div
          className={cn(
            'sticky left-0 isolate flex min-w-0 shrink-0 transform-gpu items-center gap-2 bg-background border-r border-border/50 px-3',
            stickyMetaTopGridLine &&
            (showGridBorders ? 'border-t border-t-border/60' : cn('border-t', 'border-t-border/[0.08]'))
          )}
          style={{ ...hbGantt.leftBlock, zIndex: Z_WORKLOAD_STICKY_ROW_META }}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors group-hover:bg-muted/60" aria-hidden>
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
          <Avatar className="size-6 shrink-0">
            <AvatarImage src={getUserAvatarUrl?.(user.userId) ?? undefined} alt={user.name || user.userCode} />
            <AvatarFallback className="text-[10px]">{userInitials(user)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium">{user.name || user.userCode}</span>
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
              {user.role === 'pm' ? <Crown className="h-3 w-3 shrink-0 text-amber-500" aria-hidden /> : null}
              {user.role === 'pl' ? <Crown className="h-3 w-3 shrink-0 text-sky-500" aria-hidden /> : null}
              <span className="uppercase tracking-wide">{user.role}</span>
              {panelLayout === 'flat' && projectLabel.trim() ? (
                <>
                  <span className="shrink-0 text-muted-foreground/45" aria-hidden>
                    ·
                  </span>
                  <span className="min-w-0 truncate font-normal normal-case tracking-normal">{projectLabel}</span>
                </>
              ) : null}
              {!allowEditRow && panelLayout !== 'assignee' ? <Lock className="ml-1 h-3 w-3 shrink-0" aria-hidden /> : null}
            </span>
          </div>
          <span className="ml-auto shrink-0 rounded bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground">{formatHours(totalH) || '0h'}</span>
        </div>
        <div className={cn('relative z-[2] h-full shrink-0', WL_CHART_SURFACE_BG)} style={{ width: chartWidth }}>
          <div className={cn('relative z-[2] h-full min-h-0 min-w-0', chartCellsVirtual.enabled ? 'overflow-hidden' : 'flex items-stretch')}>
            {chartCellsVirtual.enabled
              ? chartCellsVirtual.items.map(vCol => {
                const idx = vCol.index
                const bucket = buckets[idx]
                if (!bucket) return null
                const left = vCol.start - chartCellsVirtual.scrollMargin
                return (
                  <div key={vCol.key} className="absolute top-0 bottom-0 flex min-h-0 min-w-0 flex-col" style={{ left, width: vCol.size }}>
                    <WorkloadBucketCell
                      projectId={projectId}
                      bucket={bucket}
                      userId={user.userId}
                      displayMode={displayMode}
                      dailyCapacity={dailyCapacity}
                      agg={aggRow?.[idx] ?? { hours: 0, tasks: 0, workingDays: 0, isFullyNonWorking: false, hasOverride: false }}
                      allowEdit={allowEditRow}
                      cellMap={cellMap}
                      canEditAll={data.canEditAll}
                      onRequestWorkloadOverrideEdit={onRequestWorkloadOverrideEdit}
                      locale={locale}
                    />
                  </div>
                )
              })
              : buckets.map((bucket, idx) => (
                <WorkloadBucketCell
                  key={`${rk}-${idx}-${bucket.left}`}
                  projectId={projectId}
                  bucket={bucket}
                  userId={user.userId}
                  displayMode={displayMode}
                  dailyCapacity={dailyCapacity}
                  agg={aggRow?.[idx] ?? { hours: 0, tasks: 0, workingDays: 0, isFullyNonWorking: false, hasOverride: false }}
                  allowEdit={allowEditRow}
                  cellMap={cellMap}
                  canEditAll={data.canEditAll}
                  onRequestWorkloadOverrideEdit={onRequestWorkloadOverrideEdit}
                  locale={locale}
                />
              ))}
          </div>
        </div>
      </div>

      {expanded ? (
        <div className={cn('relative z-[2] flex flex-col bg-background', showGridBorders ? 'border-t border-border/60' : cn('border-t', WL_NO_GRID_EXPAND_TOP))}>
          {renderMiniGanttForUser ? (
            <div className="relative z-[2] flex min-w-0 flex-col">{renderMiniGanttForUser(user.userId, panelLayout === 'assignee' ? null : projectId)}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})

const WorkloadVirtualProjectHeader = memo(function WorkloadVirtualProjectHeader({
  seg,
  projectId,
  projectBodyVisible,
  chartWidth,
  showGridBorders,
  toggleProjectSegmentCollapsed,
}: {
  seg: WorkloadBoardSegment
  projectId: string
  projectBodyVisible: boolean
  chartWidth: number
  showGridBorders: boolean
  toggleProjectSegmentCollapsed: (projectId: string) => void
}) {
  const { t } = useTranslation()
  const projectLabel = seg.projectLabel
  return (
    <div className="group relative flex min-h-0 w-full shrink-0 items-stretch bg-muted">
      <div
        className={cn(
          'sticky left-0 isolate flex h-8 min-h-0 min-w-0 shrink-0 transform-gpu flex-row items-center gap-1.5 border-t-0 border-r border-border/50 bg-muted px-2',
          showGridBorders ? 'border-b border-b-border/60' : !projectBodyVisible ? 'border-b-0' : cn('border-b', WL_NO_GRID_LINE)
        )}
        style={{ ...hbGantt.leftBlock, zIndex: Z_WORKLOAD_STICKY_ROW_META }}
      >
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm hover:bg-muted/80"
          onClick={e => {
            e.stopPropagation()
            toggleProjectSegmentCollapsed(projectId)
          }}
          aria-expanded={projectBodyVisible}
          aria-label={projectBodyVisible ? t('taskManagement.ganttCollapseGroupSection') : t('taskManagement.ganttExpandGroupSection')}
        >
          {projectBodyVisible ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-muted-foreground">{projectLabel}</span>
      </div>
      <div
        className={cn(
          'relative z-[2] h-8 min-h-0 shrink-0 border-t-0 bg-muted',
          showGridBorders ? 'border-b border-b-border/60' : !projectBodyVisible ? 'border-b-0' : cn('border-b', WL_NO_GRID_LINE)
        )}
        style={{ width: chartWidth }}
        aria-hidden
      />
    </div>
  )
})

function WorkloadVirtualizedWorkloadBody({
  scrollRef,
  flatRows,
  expandedRowKeys,
  segmentDerivedByProjectId,
  buckets,
  displayMode,
  panelLayout,
  chartWidth,
  showGridBorders,
  locale,
  onRequestWorkloadOverrideEdit,
  getUserAvatarUrl,
  renderMiniGanttForUser,
  toggleRowKey,
  toggleProjectSegmentCollapsed,
  chartCellsVirtual,
}: {
  scrollRef: RefObject<HTMLElement | null>
  flatRows: WorkloadFlatRow[]
  expandedRowKeys: Set<string>
  segmentDerivedByProjectId: Map<string, WorkloadSegmentDerived>
  buckets: Bucket[]
  displayMode: WorkloadDisplayMode
  panelLayout: 'project' | 'flat' | 'assignee'
  chartWidth: number
  showGridBorders: boolean
  locale: Locale
  onRequestWorkloadOverrideEdit?: (payload: WorkloadOverrideEditOpenPayload) => void
  getUserAvatarUrl?: (userId: string) => string | null | undefined
  renderMiniGanttForUser?: (userId: string, projectId: string | null) => ReactNode
  toggleRowKey: (key: string) => void
  toggleProjectSegmentCollapsed: (projectId: string) => void
  chartCellsVirtual: WorkloadChartCellsVirtual
}) {
  const expandedKeyStr = useMemo(() => [...expandedRowKeys].sort().join('\x1e'), [expandedRowKeys])

  const estimateSize = useCallback(
    (index: number) => {
      const flat = flatRows[index]
      return flat ? estimateWorkloadFlatRowHeight(flat, expandedRowKeys) : ROW_H
    },
    [flatRows, expandedRowKeys]
  )

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: 5,
    getItemKey: index => flatRows[index]?.key ?? `wl:${String(index)}`,
  })

  const virtualizerRef = useRef(virtualizer)
  virtualizerRef.current = virtualizer

  useLayoutEffect(() => {
    virtualizerRef.current.measure()
    // Chỉ khi expand/collapse hoặc đổi số hàng — KHÔNG phụ thuộc `virtualizer` (reference đổi mỗi render → measure() mỗi scroll = rất chậm).
  }, [expandedKeyStr, flatRows.length])

  return (
    <div className="relative w-full min-w-0" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map(vRow => {
        const row = flatRows[vRow.index]
        if (!row) return null
        if (row.kind === 'projectHeader') {
          return (
            <div
              key={vRow.key}
              className={cn('absolute left-0 w-full border-b', showGridBorders ? 'border-b-border/60' : WL_NO_GRID_LINE)}
              style={{ top: vRow.start, height: vRow.size }}
            >
              <WorkloadVirtualProjectHeader
                seg={row.segment}
                projectId={row.segment.projectId}
                projectBodyVisible={row.projectBodyVisible}
                chartWidth={chartWidth}
                showGridBorders={showGridBorders}
                toggleProjectSegmentCollapsed={toggleProjectSegmentCollapsed}
              />
            </div>
          )
        }
        const derived = segmentDerivedByProjectId.get(row.segment.projectId)
        if (!derived) return null
        const seg = row.segment
        return (
          <div key={vRow.key} className="absolute left-0 w-full" style={{ top: vRow.start, height: vRow.size }}>
            <WorkloadUserWorkloadRow
              projectId={seg.projectId}
              projectLabel={seg.projectLabel}
              panelLayout={panelLayout}
              data={seg.data}
              user={row.user}
              rk={row.rk}
              expanded={expandedRowKeys.has(row.rk)}
              derived={derived}
              buckets={buckets}
              displayMode={displayMode}
              chartWidth={chartWidth}
              showGridBorders={showGridBorders}
              locale={locale}
              onRequestWorkloadOverrideEdit={onRequestWorkloadOverrideEdit}
              getUserAvatarUrl={getUserAvatarUrl}
              renderMiniGanttForUser={renderMiniGanttForUser}
              toggleRowKey={toggleRowKey}
              chartCellsVirtual={chartCellsVirtual}
              stickyMetaTopGridLine={vRow.index > 0}
            />
          </div>
        )
      })}
    </div>
  )
}

function WorkloadOverrideEditorDialog({
  snapshot,
  onDismiss,
  onUpsertOverride,
}: {
  snapshot: WorkloadOverrideEditSnapshot | null
  onDismiss: () => void
  onUpsertOverride?: (input: WorkloadOverrideUpsertInput) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [hoursInput, setHoursInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!snapshot) return
    const pick = snapshot.choices.find(c => c.iso === snapshot.initialIso) ?? snapshot.choices[0]
    setEditingDate(pick?.iso ?? null)
    setHoursInput(pick?.overrideHours != null ? String(pick.overrideHours) : '')
    setNoteInput('')
    setSubmitting(false)
  }, [snapshot])

  const submit = useCallback(async () => {
    if (!onUpsertOverride || !snapshot || !editingDate) return
    setSubmitting(true)
    try {
      const trimmed = hoursInput.trim()
      const parsed = trimmed === '' ? null : Number(trimmed)
      const value = parsed != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null
      await onUpsertOverride({
        projectId: snapshot.projectId,
        userId: snapshot.userId,
        workDate: editingDate,
        overrideHours: value,
        note: noteInput.trim() ? noteInput.trim() : null,
      })
      onDismiss()
    } finally {
      setSubmitting(false)
    }
  }, [onUpsertOverride, snapshot, editingDate, hoursInput, noteInput, onDismiss])

  const reset = useCallback(async () => {
    if (!onUpsertOverride || !snapshot || !editingDate) return
    setSubmitting(true)
    try {
      await onUpsertOverride({
        projectId: snapshot.projectId,
        userId: snapshot.userId,
        workDate: editingDate,
        overrideHours: null,
        note: null,
      })
      onDismiss()
    } finally {
      setSubmitting(false)
    }
  }, [onUpsertOverride, snapshot, editingDate, onDismiss])

  const open = snapshot != null

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onDismiss()
      }}
    >
      <DialogContent
        className="gap-3 p-3 sm:max-w-[18rem]"
        showCloseButton
        closeDisabled={submitting}
        onPointerDownOutside={e => {
          if (submitting) e.preventDefault()
        }}
        onEscapeKeyDown={e => {
          if (submitting) e.preventDefault()
        }}
      >
        <DialogHeader className="gap-0 space-y-0 p-0 text-left">
          <DialogTitle className="text-xs font-semibold">{t('taskManagement.workloadOverrideTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {snapshot && snapshot.choices.length > 1 ? (
            <div className="flex flex-wrap gap-1">
              {snapshot.choices.map(c => (
                <Button
                  key={c.iso}
                  type="button"
                  variant={editingDate === c.iso ? 'default' : 'outline'}
                  size="sm"
                  className={cn('h-7 px-2 text-[11px]', c.weekend && 'opacity-70')}
                  disabled={submitting}
                  onClick={() => {
                    setEditingDate(c.iso)
                    setHoursInput(c.overrideHours != null ? String(c.overrideHours) : '')
                    setNoteInput('')
                  }}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          ) : null}
          <Input
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={hoursInput}
            onChange={e => setHoursInput(e.target.value)}
            placeholder={t('taskManagement.workloadOverridePlaceholder')}
            className="h-8 text-xs"
            disabled={submitting}
          />
          <Textarea
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            placeholder={t('taskManagement.workloadOverrideNotePlaceholder')}
            className="min-h-[60px] text-xs"
            disabled={submitting}
          />
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => void reset()} disabled={submitting}>
              <Trash2 className="mr-1 h-3 w-3" />
              {t('taskManagement.workloadOverrideReset')}
            </Button>
            <Button type="button" size="sm" onClick={() => void submit()} disabled={submitting}>
              {t('taskManagement.workloadOverrideSave')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function WorkloadScrollBodySection({
  bodyScrollRef,
  displaySegments,
  panelLayout,
  boardHasRenderableWorkloadGrid,
  collapsedProjectIds,
  scheduledTasksByProject,
  assigneeScheduledTasks,
  buckets,
  displayMode,
  expandedRowKeys,
  toggleRowKey,
  toggleProjectSegmentCollapsed,
  chartWidth,
  scale,
  pixelPerDay,
  weekendColumnRects,
  verticalGridLeftPx,
  showGridBorders,
  showActualBars,
  locale,
  onUpsertOverride,
  getUserAvatarUrl,
  renderMiniGanttForUser,
  capBanner,
  showTodayLine,
  todayPxCenter,
  todayMark,
  leftBlockWidthPx,
}: {
  bodyScrollRef?: RefObject<HTMLElement | null>
  displaySegments: WorkloadBoardSegment[]
  panelLayout: 'project' | 'flat' | 'assignee'
  boardHasRenderableWorkloadGrid: boolean
  collapsedProjectIds: Set<string>
  scheduledTasksByProject: Map<string, WorkloadGanttScheduledTaskRef[]>
  assigneeScheduledTasks: WorkloadGanttScheduledTaskRef[]
  buckets: Bucket[]
  displayMode: WorkloadDisplayMode
  expandedRowKeys: Set<string>
  toggleRowKey: (key: string) => void
  toggleProjectSegmentCollapsed: (projectId: string) => void
  chartWidth: number
  scale: WorkloadScale
  pixelPerDay: number
  weekendColumnRects: { left: number; width: number }[]
  verticalGridLeftPx: number[]
  showGridBorders: boolean
  showActualBars: boolean
  locale: Locale
  onUpsertOverride?: (input: WorkloadOverrideUpsertInput) => Promise<void> | void
  getUserAvatarUrl?: (userId: string) => string | null | undefined
  renderMiniGanttForUser?: (userId: string, projectId: string | null) => ReactNode
  capBanner: ReactNode
  showTodayLine: boolean
  todayPxCenter: number
  todayMark: string
  leftBlockWidthPx?: number
}) {
  const flatRows = useMemo(
    () => buildWorkloadFlatRows(displaySegments, panelLayout, collapsedProjectIds, boardHasRenderableWorkloadGrid, scheduledTasksByProject, assigneeScheduledTasks),
    [assigneeScheduledTasks, boardHasRenderableWorkloadGrid, collapsedProjectIds, displaySegments, panelLayout, scheduledTasksByProject]
  )

  const segmentDerivedByProjectId = useMemo(() => {
    const m = new Map<string, WorkloadSegmentDerived>()
    for (const seg of displaySegments) {
      const scheduled = panelLayout === 'assignee' ? assigneeScheduledTasks : (scheduledTasksByProject.get(seg.projectId) ?? [])
      const der = buildWorkloadSegmentDerived(seg.projectId, seg.data, scheduled, showActualBars, buckets)
      if (der) m.set(seg.projectId, der)
    }
    return m
  }, [assigneeScheduledTasks, buckets, displaySegments, panelLayout, scheduledTasksByProject, showActualBars])

  const hzColsEnabled = Boolean(bodyScrollRef && typeof leftBlockWidthPx === 'number' && leftBlockWidthPx > 0 && buckets.length >= WORKLOAD_CHART_HZ_VIRTUAL_MIN_BUCKETS)

  const estimateColumnSize = useCallback((index: number) => buckets[index]?.width ?? pixelPerDay, [buckets, pixelPerDay])

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: buckets.length,
    getScrollElement: () => bodyScrollRef?.current ?? null,
    estimateSize: estimateColumnSize,
    overscan: 12,
    scrollMargin: leftBlockWidthPx ?? 0,
    enabled: hzColsEnabled,
    getItemKey: (index: number) => `wl-col:${index}`,
  })

  const columnVirtualizerRef = useRef(columnVirtualizer)
  columnVirtualizerRef.current = columnVirtualizer

  useLayoutEffect(() => {
    columnVirtualizerRef.current.measure?.()
  }, [buckets.length, chartWidth, leftBlockWidthPx, pixelPerDay, hzColsEnabled])

  const chartCellsVirtual: WorkloadChartCellsVirtual =
    hzColsEnabled && typeof leftBlockWidthPx === 'number' ? { enabled: true, scrollMargin: leftBlockWidthPx, items: columnVirtualizer.getVirtualItems() } : { enabled: false }

  const [overrideEditorSnapshot, setOverrideEditorSnapshot] = useState<WorkloadOverrideEditSnapshot | null>(null)
  const dismissOverrideEditor = useCallback(() => setOverrideEditorSnapshot(null), [])

  const onRequestWorkloadOverrideEdit = useCallback(
    (payload: WorkloadOverrideEditOpenPayload) => {
      if (!payload.allowEdit || !onUpsertOverride) return
      const choices: WorkloadOverrideChoiceSnapshot[] = payload.bucket.days.map(d => {
        const iso = toYyyyMmDd(d) || ''
        const cell = payload.cellMap.get(`${payload.userId}|${iso}`)
        return {
          iso,
          weekend: isWeekend(d),
          label: format(d, 'EEE dd/MM', { locale: payload.locale }),
          overrideHours: cell?.overrideHours ?? null,
        }
      })
      const firstWorking = choices.find(c => !c.weekend) ?? choices[0]
      if (!firstWorking) return
      setOverrideEditorSnapshot({
        projectId: payload.projectId,
        userId: payload.userId,
        canEditAll: payload.canEditAll,
        choices,
        initialIso: firstWorking.iso,
      })
    },
    [onUpsertOverride]
  )

  const useVirtual = bodyScrollRef != null && flatRows.length >= WORKLOAD_VIRTUAL_MIN_ROWS

  return (
    <>
      <WorkloadOverrideEditorDialog snapshot={overrideEditorSnapshot} onDismiss={dismissOverrideEditor} onUpsertOverride={onUpsertOverride} />
      {capBanner}
      <div className="relative w-full min-w-0">
        {flatRows.length > 0 ? (
          <WorkloadInnerTimelineDecor
            chartWidth={chartWidth}
            scale={scale}
            pixelPerDay={pixelPerDay}
            weekendColumnRects={weekendColumnRects}
            verticalGridLeftPx={verticalGridLeftPx}
            showTodayLine={showTodayLine}
            todayPxCenter={todayPxCenter}
            todayTitle={todayMark}
            displayMode={displayMode}
          />
        ) : null}
        <div className={cn('relative z-[2] min-w-0', showGridBorders ? '[&>*]:border-b-border/60' : WL_NO_GRID_BODY_CHILD_B)}>
          {useVirtual && bodyScrollRef ? (
            <WorkloadVirtualizedWorkloadBody
              scrollRef={bodyScrollRef}
              flatRows={flatRows}
              expandedRowKeys={expandedRowKeys}
              segmentDerivedByProjectId={segmentDerivedByProjectId}
              buckets={buckets}
              displayMode={displayMode}
              panelLayout={panelLayout}
              chartWidth={chartWidth}
              showGridBorders={showGridBorders}
              locale={locale}
              onRequestWorkloadOverrideEdit={onRequestWorkloadOverrideEdit}
              getUserAvatarUrl={getUserAvatarUrl}
              renderMiniGanttForUser={renderMiniGanttForUser}
              toggleRowKey={toggleRowKey}
              toggleProjectSegmentCollapsed={toggleProjectSegmentCollapsed}
              chartCellsVirtual={chartCellsVirtual}
            />
          ) : (
            displaySegments.map((seg, segmentIndex) => (
              <WorkloadProjectSegmentPanel
                key={seg.projectId}
                segmentIndex={segmentIndex}
                projectId={seg.projectId}
                projectLabel={seg.projectLabel}
                panelLayout={panelLayout}
                boardHasRenderableWorkloadGrid={boardHasRenderableWorkloadGrid}
                projectBodyVisible={panelLayout === 'project' ? !collapsedProjectIds.has(seg.projectId) : true}
                toggleProjectSegmentCollapsed={toggleProjectSegmentCollapsed}
                data={seg.data}
                scheduledGanttTasks={panelLayout === 'assignee' ? assigneeScheduledTasks : (scheduledTasksByProject.get(seg.projectId) ?? [])}
                buckets={buckets}
                displayMode={displayMode}
                expandedRowKeys={expandedRowKeys}
                toggleRowKey={toggleRowKey}
                chartWidth={chartWidth}
                showGridBorders={showGridBorders}
                showActualBars={showActualBars}
                locale={locale}
                onRequestWorkloadOverrideEdit={onRequestWorkloadOverrideEdit}
                getUserAvatarUrl={getUserAvatarUrl}
                renderMiniGanttForUser={renderMiniGanttForUser}
                chartCellsVirtual={chartCellsVirtual}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

const WorkloadProjectSegmentPanel = memo(function WorkloadProjectSegmentPanel({
  segmentIndex,
  projectId,
  projectLabel,
  panelLayout,
  boardHasRenderableWorkloadGrid,
  projectBodyVisible,
  toggleProjectSegmentCollapsed,
  data,
  scheduledGanttTasks,
  buckets,
  displayMode,
  expandedRowKeys,
  toggleRowKey,
  chartWidth,
  showGridBorders,
  showActualBars,
  locale,
  onRequestWorkloadOverrideEdit,
  getUserAvatarUrl,
  renderMiniGanttForUser,
  chartCellsVirtual,
}: {
  segmentIndex: number
  projectId: string
  projectLabel: string
  panelLayout: 'project' | 'flat' | 'assignee'
  /** Board đã có ít nhất một segment có user + ô ngày — segment `empty` khác bị ẩn hẳn (không chỉ banner). */
  boardHasRenderableWorkloadGrid: boolean
  /** Khớp Gantt `groupBodyVisible` — false khi thu gọn khối project. */
  projectBodyVisible: boolean
  toggleProjectSegmentCollapsed: (projectId: string) => void
  data: WorkloadData
  scheduledGanttTasks: WorkloadGanttScheduledTaskRef[]
  buckets: Bucket[]
  displayMode: WorkloadDisplayMode
  expandedRowKeys: Set<string>
  toggleRowKey: (key: string) => void
  chartWidth: number
  showGridBorders: boolean
  showActualBars: boolean
  locale: Locale
  onRequestWorkloadOverrideEdit?: (payload: WorkloadOverrideEditOpenPayload) => void
  getUserAvatarUrl?: (userId: string) => string | null | undefined
  renderMiniGanttForUser?: (userId: string, projectId: string | null) => ReactNode
  chartCellsVirtual: WorkloadChartCellsVirtual
}) {
  const { t } = useTranslation()

  const derived = useMemo(
    () => buildWorkloadSegmentDerived(projectId, data, scheduledGanttTasks, showActualBars, buckets),
    [buckets, data, projectId, scheduledGanttTasks, showActualBars]
  )

  const users = data.users
  const empty = users.length === 0 || data.days.length === 0

  if (boardHasRenderableWorkloadGrid && empty) {
    return null
  }

  return (
    <div className="flex flex-col">
      {panelLayout === 'project' ? (
        <div className="group relative flex min-h-0 w-full shrink-0 items-stretch bg-muted">
          <div
            className={cn(
              'sticky left-0 isolate flex h-8 min-h-0 min-w-0 shrink-0 transform-gpu flex-row items-center gap-1.5 border-t-0 border-r border-border/50 bg-muted px-2',
              showGridBorders ? 'border-b border-b-border/60' : !projectBodyVisible ? 'border-b-0' : cn('border-b', WL_NO_GRID_LINE)
            )}
            style={{ ...hbGantt.leftBlock, zIndex: Z_WORKLOAD_STICKY_ROW_META }}
          >
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm hover:bg-muted/80"
              onClick={e => {
                e.stopPropagation()
                toggleProjectSegmentCollapsed(projectId)
              }}
              aria-expanded={projectBodyVisible}
              aria-label={projectBodyVisible ? t('taskManagement.ganttCollapseGroupSection') : t('taskManagement.ganttExpandGroupSection')}
            >
              {projectBodyVisible ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-muted-foreground">{projectLabel}</span>
          </div>
          <div
            className={cn(
              'relative z-[2] h-8 min-h-0 shrink-0 border-t-0 bg-muted',
              showGridBorders ? 'border-b border-b-border/60' : !projectBodyVisible ? 'border-b-0' : cn('border-b', WL_NO_GRID_LINE)
            )}
            style={{ width: chartWidth }}
            aria-hidden
          />
        </div>
      ) : null}
      {!projectBodyVisible ? null : empty ? (
        <div className="sticky left-0 z-[2] bg-background px-3 py-2 text-xs text-muted-foreground" style={hbGantt.leftPlusChartMin(chartWidth, 720)}>
          {t('taskManagement.workloadEmpty')}
        </div>
      ) : derived ? (
        <div className="flex flex-col">
          {users.map((user, userIdx) => {
            const rk = workloadRowKey(projectId, user.userId)
            const expanded = expandedRowKeys.has(rk)
            return (
              <WorkloadUserWorkloadRow
                key={rk}
                projectId={projectId}
                projectLabel={projectLabel}
                panelLayout={panelLayout}
                data={data}
                user={user}
                rk={rk}
                expanded={expanded}
                derived={derived}
                buckets={buckets}
                displayMode={displayMode}
                chartWidth={chartWidth}
                showGridBorders={showGridBorders}
                locale={locale}
                onRequestWorkloadOverrideEdit={onRequestWorkloadOverrideEdit}
                getUserAvatarUrl={getUserAvatarUrl}
                renderMiniGanttForUser={renderMiniGanttForUser}
                toggleRowKey={toggleRowKey}
                chartCellsVirtual={chartCellsVirtual}
                stickyMetaTopGridLine={
                  userIdx > 0 || (panelLayout === 'project' && userIdx === 0) || (panelLayout !== 'project' && segmentIndex > 0)
                }
              />
            )
          })}
        </div>
      ) : null}
    </div>
  )
})

const WorkloadBucketCell = memo(function WorkloadBucketCell({
  projectId,
  bucket,
  userId,
  displayMode,
  dailyCapacity,
  agg,
  allowEdit,
  cellMap,
  canEditAll,
  onRequestWorkloadOverrideEdit,
  locale,
}: {
  projectId: string
  bucket: Bucket
  userId: string
  displayMode: WorkloadDisplayMode
  dailyCapacity: number
  agg: WorkloadBucketAgg
  allowEdit: boolean
  cellMap: Map<string, WorkloadDayCell>
  canEditAll: boolean
  onRequestWorkloadOverrideEdit?: (payload: WorkloadOverrideEditOpenPayload) => void
  locale: Locale
}) {
  const { t } = useTranslation()
  const cap = Math.max(1, agg.workingDays * dailyCapacity)
  const ratio = agg.workingDays > 0 ? agg.hours / cap : 0
  const tone = bucketTone(ratio)
  const hoursFill = displayMode === 'hours' ? workloadHoursFillStyle(agg.hours, cap, agg.workingDays) : null
  const hoursContrastOnFill = displayMode === 'hours' && agg.workingDays > 0 && ratio >= 0.28

  const display = (() => {
    if (displayMode === 'tasks') return String(agg.tasks)
    return formatHours(agg.hours)
  })()

  /** Một bucket = một ngày (scale week): tô nền T7/CN trong ô — khớp chart Gantt. */
  const singleDayWeekend = bucket.days.length === 1 && isWeekend(bucket.days[0])

  const onCellClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!allowEdit || !onRequestWorkloadOverrideEdit) return
    onRequestWorkloadOverrideEdit({
      projectId,
      userId,
      bucket,
      cellMap,
      locale,
      allowEdit,
      canEditAll,
    })
  }

  return (
    <button
      type="button"
      onClick={onCellClick}
      className={cn(
        'relative flex h-full items-center justify-center overflow-hidden border-0 px-1 text-[10px] font-semibold tabular-nums transition-colors shadow-none',
        displayMode === 'hours' ? 'bg-transparent' : singleDayWeekend ? 'bg-transparent' : cn(tone.bg, tone.text),
        agg.isFullyNonWorking && 'text-muted-foreground',
        !allowEdit && 'cursor-default'
      )}
      style={{ width: bucket.width }}
      title={!allowEdit && !canEditAll ? t('taskManagement.workloadOverrideReadOnly') : ratio > 1 ? t('taskManagement.workloadOverloadTooltip') : undefined}
      aria-label={display ? `${display} ${userId}` : ''}
    >
      {displayMode === 'tasks' && singleDayWeekend ? (
        <>
          <span aria-hidden className={cn('pointer-events-none absolute inset-0 z-0', WL_WEEKEND_COLUMN_BG)} />
          <span aria-hidden className={cn('pointer-events-none absolute inset-0 z-[1]', tone.bg, 'opacity-[0.68]')} />
        </>
      ) : null}
      {displayMode === 'hours' && hoursFill != null && hoursFill.fillPct > 0 ? (
        <span
          aria-hidden
          className={cn('pointer-events-none absolute bottom-0 right-0 z-[1] left-px', workloadHoursFillClass(hoursFill.band))}
          style={{ height: `${hoursFill.fillPct}%` }}
        />
      ) : null}
      <span
        className={cn(
          'relative z-[2] font-semibold text-foreground',
          agg.isFullyNonWorking && displayMode === 'hours' && 'opacity-70',
          hoursContrastOnFill ? '[text-shadow:0_0_0.5px_hsl(var(--background)/0.9),0_1px_2px_hsl(var(--background)/0.55)]' : '',
          displayMode !== 'hours' ? tone.text : ''
        )}
      >
        {display}
      </span>
      {agg.hasOverride ? (
        <span aria-hidden className="pointer-events-none absolute right-1 top-1 z-[3] box-border h-1 w-1 shrink-0 rounded-full bg-orange-500 dark:bg-orange-400" />
      ) : null}
    </button>
  )
})
