'use client'

import type { Locale } from 'date-fns'
import { addDays, addMonths, differenceInCalendarDays, format, getDay, startOfDay, startOfMonth } from 'date-fns'
import { ChevronDown, ChevronRight, Crown, Layers, Lock, Trash2 } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'
import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { parseLocalDate, toYyyyMmDd } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { GanttTimelineGridOverlay } from './GanttTimelineGridOverlay'
import { HB_GANTT_GRID_V_VAR, hbGantt } from './ganttLayoutCssVars'

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
  /** Trùng `leftBlockWidth` của Gantt — px số, khớp lớp lưới `left: leftBlockWidth` (tránh lệch 1px với `calc()` + sticky). */
  leftBlockWidthPx: number
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
}

function isWeekend(d: Date): boolean {
  const dow = getDay(d)
  return dow === 0 || dow === 6
}

const HEADER_H = 40
const ROW_H = 40
const CAPACITY_ROW_H = 28

/**
 * Khi tắt “Grid lines”: đường kẻ ngang là **border** (`border-bottom` / `border-top`), không phải `outline`.
 * Nhạt hơn hàng Gantt — layout workload dễ **chồng hai border** (header nhóm + viền đáy panel).
 */
const WL_NO_GRID_LINE = 'border-b-border/[0.08]'
const WL_NO_GRID_BODY_CHILD_B = '[&>*]:border-b-border/[0.08]'
const WL_NO_GRID_USER_SIB_B = '[&>*:not(:last-child)]:border-b-border/[0.08]'
const WL_NO_GRID_EXPAND_TOP = 'border-t-border/[0.08]'

/** Nền trục thời gian chart — khớp sheet Gantt (`bg-background/30` + lớp slate cuối tuần). */
const WL_CHART_SURFACE_BG = 'bg-background/30'

/** Nền cột thứ 7 / CN — cùng token Gantt (`GanttBodyChartLayers` / từng hàng `row-wk`). */
const WL_WEEKEND_COLUMN_BG = 'bg-slate-500/[0.11] dark:bg-slate-400/[0.05]'

/** Cột meta trái trong strip header (sticky ngang trong overflow-x của header). */
const Z_WORKLOAD_HEADER_STRIP_META = 0
const Z_WORKLOAD_STICKY_ROW_META = 30
/** Hàng capacity trong expanded block — trên mini-Gantt meta khi chồng lấn */
const Z_WORKLOAD_STICKY_CAPACITY_META = 32

type Bucket = { left: number; width: number; startDate: Date; endDate: Date; days: Date[] }

function workloadRowKey(projectId: string, userId: string): string {
  return `${projectId}|${userId}`
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

  const users = orderedUserIds.map(id => userMetaById.get(id)!).filter(Boolean)
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
function workloadHoursFillStyle(
  hours: number,
  bucketCapacity: number,
  workingDays: number
): { fillPct: number; band: WorkloadHoursFillBand } | null {
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
  leftBlockWidthPx,
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
  workloadRowGrouping = 'project',
}: WorkloadProps) {
  const { t } = useTranslation()
  const [internalDisplayMode, setInternalDisplayMode] = useState<WorkloadDisplayMode>('hours')
  const displayControlled = displayModeProp !== undefined && onDisplayModeChange !== undefined
  const displayMode = displayControlled ? displayModeProp : internalDisplayMode
  const setDisplayMode = displayControlled ? onDisplayModeChange : setInternalDisplayMode
  const [expandedRowKeys, setExpandedRowKeys] = useState<Set<string>>(() => new Set())
  /** Project segments có thể thu gọn — mặc định mở (không có trong set). */
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(() => new Set())

  const displaySegments = useMemo((): WorkloadBoardSegment[] => {
    if (workloadRowGrouping === 'assignee' && segments.length > 0) {
      return [mergeWorkloadSegmentsByAssignee(segments, showActualBars)]
    }
    return segments
  }, [workloadRowGrouping, segments, showActualBars])

  const panelLayout: 'project' | 'flat' | 'assignee' =
    workloadRowGrouping === 'flat' ? 'flat' : workloadRowGrouping === 'assignee' ? 'assignee' : 'project'

  const buckets = useMemo(() => buildBuckets(scale, start, totalDays, pixelPerDay), [scale, start, totalDays, pixelPerDay])

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

  const headerHoursPerDay = displaySegments[0]?.data.hoursPerDay ?? segments[0]?.data.hoursPerDay ?? 8

  const workloadHeaderRow = (
    <div
      className={cn(
        'flex w-full min-w-0 shrink-0 items-stretch border-b bg-muted',
        showGridBorders ? 'border-border/70' : WL_NO_GRID_LINE
      )}
      style={{ height: HEADER_H }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-2 overflow-hidden border-r border-border/50 bg-muted px-3"
        style={{ width: leftBlockWidthPx, zIndex: Z_WORKLOAD_HEADER_STRIP_META }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.workloadTitle')}</div>
        <ToggleGroup type="single" value={displayMode} onValueChange={v => v && setDisplayMode(v as WorkloadDisplayMode)} variant="outline" size="sm" className="gap-px">
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
          className="relative min-h-0 flex-1 shrink-0 bg-muted text-[10px] text-muted-foreground will-change-transform"
          style={{ width: chartWidth }}
        >
          <div className="absolute inset-y-0 right-3 flex items-center justify-end text-[10px] text-muted-foreground/80">
            {t('taskManagement.workloadHoursPerDayLabel', { hours: headerHoursPerDay })}
          </div>
        </div>
      </div>
    </div>
  )

  const capBanner =
    capTruncated && capTruncated.total > capTruncated.shown ? (
      <div className="border-b border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[10px] text-amber-900 dark:text-amber-200">
        {t('taskManagement.workloadProjectsCapped', { shown: capTruncated.shown, total: capTruncated.total })}
      </div>
    ) : null

  const bodyInner =
    segments.length === 0 ? (
      <div className="sticky left-0 z-[2] bg-background px-3 py-3 text-xs text-muted-foreground" style={hbGantt.leftPlusChartMin(chartWidth, 720)}>
        {loading ? t('common.loading') : t('taskManagement.workloadEmptyNoProjects')}
      </div>
    ) : (
      <>
        {capBanner}
        {displaySegments.map(seg => (
          <WorkloadProjectSegmentPanel
            key={seg.projectId}
            projectId={seg.projectId}
            projectLabel={seg.projectLabel}
            panelLayout={panelLayout}
            projectBodyVisible={panelLayout === 'project' ? !collapsedProjectIds.has(seg.projectId) : true}
            onToggleProjectSegmentCollapsed={() => toggleProjectSegmentCollapsed(seg.projectId)}
            data={seg.data}
            scheduledGanttTasks={
              panelLayout === 'assignee' ? (scheduledGanttTasks ?? []) : (scheduledTasksByProject.get(seg.projectId) ?? [])
            }
            buckets={buckets}
            displayMode={displayMode}
            expandedRowKeys={expandedRowKeys}
            toggleRowKey={toggleRowKey}
            chartWidth={chartWidth}
            leftBlockWidthPx={leftBlockWidthPx}
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
          />
        ))}
      </>
    )

  if (segment === 'header') {
    return <div className="w-full min-w-0 bg-background">{workloadHeaderRow}</div>
  }

  if (segment === 'body') {
    return (
      <div
        className={cn(
          'relative bg-background [&>*]:border-b',
          showGridBorders ? '[&>*]:border-b-border/60' : WL_NO_GRID_BODY_CHILD_B
        )}
        style={hbGantt.sheet(chartWidth)}
      >
        {bodyInner}
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
      <div className="flex min-w-0 flex-col border-t border-border" style={hbGantt.sheet(chartWidth)}>
        {workloadHeaderRow}
        <div
          className={cn(
            'relative bg-background [&>*]:border-b',
            showGridBorders ? '[&>*]:border-b-border/60' : WL_NO_GRID_BODY_CHILD_B
          )}
          style={hbGantt.sheet(chartWidth)}
        >
          {bodyInner}
        </div>
      </div>
    )
  }

  return null
})

function WorkloadProjectSegmentPanel({
  projectId,
  projectLabel,
  panelLayout,
  projectBodyVisible,
  onToggleProjectSegmentCollapsed,
  data,
  scheduledGanttTasks,
  buckets,
  displayMode,
  expandedRowKeys,
  toggleRowKey,
  chartWidth,
  leftBlockWidthPx,
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
}: {
  projectId: string
  projectLabel: string
  panelLayout: 'project' | 'flat' | 'assignee'
  /** Khớp Gantt `groupBodyVisible` — false khi thu gọn khối project. */
  projectBodyVisible: boolean
  onToggleProjectSegmentCollapsed: () => void
  data: WorkloadData
  scheduledGanttTasks: WorkloadGanttScheduledTaskRef[]
  buckets: Bucket[]
  displayMode: WorkloadDisplayMode
  expandedRowKeys: Set<string>
  toggleRowKey: (key: string) => void
  chartWidth: number
  leftBlockWidthPx: number
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
}) {
  const { t } = useTranslation()

  const normalizedDays = useMemo(() => {
    if (!data?.days?.length) return [] as WorkloadDayCell[]
    return data.days.map(d => normalizeWorkloadDay(d as WorkloadDayCell & Record<string, unknown>))
  }, [data])

  const cellMap = useMemo(() => {
    const m = new Map<string, WorkloadDayCell>()
    for (const d of normalizedDays) {
      m.set(`${d.userId}|${d.date}`, d)
    }
    return m
  }, [normalizedDays])

  const nonWorkingSet = useMemo(() => new Set<string>(data?.nonWorkingDates ?? []), [data])

  const scheduledByAssignee = useMemo(() => {
    const m = new Map<string, WorkloadGanttScheduledTaskRef[]>()
    if (!scheduledGanttTasks?.length) return m
    for (const t of scheduledGanttTasks) {
      const uid = (t.assigneeUserId ?? '').trim()
      if (!uid) continue
      const arr = m.get(uid)
      if (arr) arr.push(t)
      else m.set(uid, [t])
    }
    return m
  }, [scheduledGanttTasks])

  const aggregateBucketForUser = useCallback(
    (userId: string, bucket: Bucket): { hours: number; tasks: number; workingDays: number; isFullyNonWorking: boolean; hasOverride: boolean } => {
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
    },
    [cellMap, nonWorkingSet, scheduledByAssignee, showActualBars]
  )

  const totalHoursPerUser = useMemo(() => {
    const totals = new Map<string, number>()
    for (const d of normalizedDays) {
      totals.set(d.userId, (totals.get(d.userId) ?? 0) + effectiveHoursOfCell(d, showActualBars))
    }
    return totals
  }, [normalizedDays, showActualBars])

  const dailyCapacity = data?.hoursPerDay ?? 8
  const users = data.users
  const empty = users.length === 0 || data.days.length === 0

  return (
    <div className="flex flex-col">
      {panelLayout === 'project' ? (
        <div className="group relative flex min-h-0 w-full shrink-0 items-stretch bg-muted">
          <div
            className={cn(
              'sticky left-0 isolate flex h-7 min-h-0 shrink-0 transform-gpu flex-row items-center gap-1.5 overflow-hidden border-t-0 border-r border-border/50 bg-muted px-2',
              showGridBorders
                ? 'border-b border-b-border/60'
                : !projectBodyVisible
                  ? 'border-b-0'
                  : cn('border-b', WL_NO_GRID_LINE)
            )}
            style={{ width: leftBlockWidthPx, zIndex: Z_WORKLOAD_STICKY_ROW_META }}
          >
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm hover:bg-muted/80"
              onClick={e => {
                e.stopPropagation()
                onToggleProjectSegmentCollapsed()
              }}
              aria-expanded={projectBodyVisible}
              aria-label={
                projectBodyVisible ? t('taskManagement.ganttCollapseGroupSection') : t('taskManagement.ganttExpandGroupSection')
              }
            >
              {projectBodyVisible ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-muted-foreground">{projectLabel}</span>
          </div>
          <div
            className={cn(
              'relative h-7 min-h-0 shrink-0 border-t-0 bg-muted',
              showGridBorders
                ? 'border-b border-b-border/60'
                : !projectBodyVisible
                  ? 'border-b-0'
                  : cn('border-b', WL_NO_GRID_LINE)
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
      ) : (
        <div
          className={cn(
            '[&>*:not(:last-child)]:border-b',
            showGridBorders ? '[&>*:not(:last-child)]:border-b-border/60' : WL_NO_GRID_USER_SIB_B
          )}
        >
          {users.map(user => {
            const rk = workloadRowKey(projectId, user.userId)
            const expanded = expandedRowKeys.has(rk)
            const totalH = totalHoursPerUser.get(user.userId) ?? 0
            const allowEditRow = (data.canEditAll || user.userId === data.selfUserId) && panelLayout !== 'assignee'

            return (
              <div key={rk} className="flex flex-col">
                {/* biome-ignore lint/a11y/useSemanticElements: không dùng <button> bọc hàng — các ô có PopoverTrigger là <button> (invalid nesting). */}
                <div
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'group relative flex cursor-pointer items-stretch text-left transition-colors hover:bg-muted/40',
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
                aria-label={
                  panelLayout === 'assignee'
                    ? `${user.name || user.userCode}`
                    : `${projectLabel ? `${projectLabel} ` : ''}${user.name || user.userCode}`
                }
              >
                <div
                  className="sticky left-0 isolate flex shrink-0 transform-gpu items-center gap-2 overflow-hidden border-r border-border/50 bg-background px-3"
                  style={{ width: leftBlockWidthPx, zIndex: Z_WORKLOAD_STICKY_ROW_META }}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors group-hover:bg-muted/60"
                    aria-hidden
                  >
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
                <div className={cn('relative shrink-0', WL_CHART_SURFACE_BG)} style={{ width: chartWidth }}>
                  <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                    {weekendColumnRects.map((r, i) => (
                      <div
                        key={`wl-row-wk-${rk}-${r.left}-${i}`}
                        className={cn('absolute top-0 bottom-0', WL_WEEKEND_COLUMN_BG)}
                        style={{ left: r.left, width: r.width }}
                      />
                    ))}
                  </div>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-[3] overflow-hidden"
                    style={{ opacity: `var(${HB_GANTT_GRID_V_VAR}, 0)` }}
                  >
                    <GanttTimelineGridOverlay
                      scale={scale}
                      pixelPerDay={pixelPerDay}
                      chartWidth={chartWidth}
                      verticalGridLineLeftPx={verticalGridLeftPx}
                      className="z-[3]"
                    />
                  </div>
                  <div className="absolute inset-0 z-[2] flex min-h-0 min-w-0 items-stretch">
                    {buckets.map((bucket, idx) => (
                      <WorkloadBucketCell
                        key={`${rk}-${idx}-${bucket.left}`}
                        projectId={projectId}
                        bucket={bucket}
                        userId={user.userId}
                        displayMode={displayMode}
                        dailyCapacity={dailyCapacity}
                        aggregate={aggregateBucketForUser}
                        allowEdit={allowEditRow}
                        cellMap={cellMap}
                        canEditAll={data.canEditAll}
                        onUpsertOverride={onUpsertOverride}
                        locale={locale}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {expanded ? (
                <div
                  className={cn(
                    'flex flex-col bg-background',
                    showGridBorders ? 'border-t border-border/60' : cn('border-t', WL_NO_GRID_EXPAND_TOP)
                  )}
                >
                  <div
                    className={cn(
                      'flex items-stretch border-b bg-background',
                      showGridBorders ? 'border-b-border/60' : cn('border-b', WL_NO_GRID_LINE)
                    )}
                    style={{ height: CAPACITY_ROW_H }}
                  >
                    <div
                      className="sticky left-0 isolate flex shrink-0 transform-gpu items-center gap-2 overflow-hidden border-r border-border/50 bg-background px-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                      style={{ width: leftBlockWidthPx, zIndex: Z_WORKLOAD_STICKY_CAPACITY_META }}
                    >
                      {t('taskManagement.workloadCapacityRow')}
                    </div>
                    <div className={cn('relative shrink-0', WL_CHART_SURFACE_BG)} style={{ width: chartWidth }}>
                      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                        {weekendColumnRects.map((r, i) => (
                          <div
                            key={`wl-cap-wk-${rk}-${r.left}-${i}`}
                            className={cn('absolute top-0 bottom-0', WL_WEEKEND_COLUMN_BG)}
                            style={{ left: r.left, width: r.width }}
                          />
                        ))}
                      </div>
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 z-[3] overflow-hidden"
                        style={{ opacity: `var(${HB_GANTT_GRID_V_VAR}, 0)` }}
                      >
                        <GanttTimelineGridOverlay
                          scale={scale}
                          pixelPerDay={pixelPerDay}
                          chartWidth={chartWidth}
                          verticalGridLineLeftPx={verticalGridLeftPx}
                          className="z-[3]"
                        />
                      </div>
                      <div className="absolute inset-0 z-[2] flex items-stretch">
                        {buckets.map((bucket, idx) => {
                          const agg = aggregateBucketForUser(user.userId, bucket)
                          const cap = Math.max(1, agg.workingDays * dailyCapacity)
                          const ratio = agg.workingDays > 0 ? agg.hours / cap : 0
                          const hoursFill = workloadHoursFillStyle(agg.hours, cap, agg.workingDays)
                          const hoursContrastOnFill = agg.workingDays > 0 && ratio >= 0.28
                          return (
                            <div
                              key={`cap-${rk}-${idx}`}
                              className="relative h-full bg-transparent"
                              style={{ left: 0, width: bucket.width }}
                              title={hoursFill?.band === 'over' ? t('taskManagement.workloadOverloadTooltip') : undefined}
                            >
                              {hoursFill != null && hoursFill.fillPct > 0 ? (
                                <div
                                  aria-hidden
                                  className={cn('absolute inset-y-1 left-0 z-0 rounded-sm', workloadHoursFillClass(hoursFill.band))}
                                  style={{ width: `${hoursFill.fillPct}%`, maxWidth: '100%' }}
                                />
                              ) : null}
                              <div
                                className={cn(
                                  'relative z-[1] flex h-full items-center justify-center text-[9px] font-semibold tabular-nums text-foreground',
                                  hoursContrastOnFill &&
                                    '[text-shadow:0_0_0.5px_hsl(var(--background)/0.9),0_1px_2px_hsl(var(--background)/0.55)]'
                                )}
                              >
                                {agg.workingDays > 0 ? `${formatHours(agg.hours) || '0h'} / ${formatHours(cap) || '0h'}` : ''}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  {renderMiniGanttForUser ? (
                    <div className="relative flex min-w-0 flex-col">
                      <div
                        aria-hidden
                        className="pointer-events-none absolute top-0 bottom-0 z-[1] overflow-hidden"
                        style={{ ...hbGantt.chartAreaFromMetaRail(chartWidth), opacity: `var(${HB_GANTT_GRID_V_VAR}, 0)` }}
                      >
                        <GanttTimelineGridOverlay
                          scale={scale}
                          pixelPerDay={pixelPerDay}
                          chartWidth={chartWidth}
                          verticalGridLineLeftPx={verticalGridLeftPx}
                        />
                      </div>
                      <div className="relative z-[2] flex min-w-0 flex-col">
                        {renderMiniGanttForUser?.(user.userId, panelLayout === 'assignee' ? null : projectId)}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
        </div>
      )}
    </div>
  )
}

function WorkloadBucketCell({
  projectId,
  bucket,
  userId,
  displayMode,
  dailyCapacity,
  aggregate,
  allowEdit,
  cellMap,
  canEditAll,
  onUpsertOverride,
  locale,
}: {
  projectId: string
  bucket: Bucket
  userId: string
  displayMode: WorkloadDisplayMode
  dailyCapacity: number
  aggregate: (userId: string, bucket: Bucket) => { hours: number; tasks: number; workingDays: number; isFullyNonWorking: boolean; hasOverride: boolean }
  allowEdit: boolean
  cellMap: Map<string, WorkloadDayCell>
  canEditAll: boolean
  onUpsertOverride?: (input: WorkloadOverrideUpsertInput) => Promise<void> | void
  locale: Locale
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [hoursInput, setHoursInput] = useState<string>('')
  const [noteInput, setNoteInput] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  const agg = aggregate(userId, bucket)
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

  const choices = useMemo(() => {
    return bucket.days.map(d => {
      const iso = toYyyyMmDd(d) || ''
      const cell = cellMap.get(`${userId}|${iso}`)
      return { iso, cell, weekend: isWeekend(d), label: format(d, 'EEE dd/MM', { locale }) }
    })
  }, [bucket, cellMap, userId, locale])

  const openPopover = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!allowEdit) return
    const firstWorking = choices.find(c => !c.weekend) ?? choices[0]
    if (!firstWorking) return
    setEditingDate(firstWorking.iso)
    setHoursInput(firstWorking.cell?.overrideHours != null ? String(firstWorking.cell.overrideHours) : '')
    setNoteInput('')
    setOpen(true)
  }

  const submit = useCallback(async () => {
    if (!onUpsertOverride || !editingDate) return
    setSubmitting(true)
    try {
      const trimmed = hoursInput.trim()
      const parsed = trimmed === '' ? null : Number(trimmed)
      const value = parsed != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null
      await onUpsertOverride({ projectId, userId, workDate: editingDate, overrideHours: value, note: noteInput.trim() ? noteInput.trim() : null })
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }, [onUpsertOverride, editingDate, hoursInput, noteInput, userId, projectId])

  const reset = useCallback(async () => {
    if (!onUpsertOverride || !editingDate) return
    setSubmitting(true)
    try {
      await onUpsertOverride({ projectId, userId, workDate: editingDate, overrideHours: null, note: null })
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }, [onUpsertOverride, editingDate, userId, projectId])

  return (
    <Popover open={open} onOpenChange={v => (allowEdit ? setOpen(v) : setOpen(false))}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={openPopover}
          className={cn(
            'relative flex h-full items-center justify-center overflow-hidden border-0 px-1 text-[10px] font-semibold tabular-nums transition-colors shadow-none',
            displayMode === 'hours'
              ? 'bg-transparent'
              : singleDayWeekend
                ? 'bg-transparent'
                : cn(tone.bg, tone.text),
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
              className={cn(
                'pointer-events-none absolute bottom-0 right-0 z-[1] left-px',
                workloadHoursFillClass(hoursFill.band)
              )}
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
            <span
              aria-hidden
              className="pointer-events-none absolute right-1 top-1 z-[3] box-border h-1 w-1 shrink-0 rounded-full bg-orange-500 dark:bg-orange-400"
            />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span>{t('taskManagement.workloadOverrideTitle')}</span>
          </div>
          {choices.length > 1 ? (
            <div className="flex flex-wrap gap-1">
              {choices.map(c => (
                <Button
                  key={c.iso}
                  type="button"
                  variant={editingDate === c.iso ? 'default' : 'outline'}
                  size="sm"
                  className={cn('h-7 px-2 text-[11px]', c.weekend && 'opacity-70')}
                  onClick={() => {
                    setEditingDate(c.iso)
                    setHoursInput(c.cell?.overrideHours != null ? String(c.cell.overrideHours) : '')
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
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={submitting}>
              <Trash2 className="mr-1 h-3 w-3" />
              {t('taskManagement.workloadOverrideReset')}
            </Button>
            <Button type="button" size="sm" onClick={submit} disabled={submitting}>
              {t('taskManagement.workloadOverrideSave')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
