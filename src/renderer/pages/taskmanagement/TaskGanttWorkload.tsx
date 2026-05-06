'use client'

import type { Locale } from 'date-fns'
import { addDays, addMonths, differenceInCalendarDays, format, getDay, startOfDay, startOfMonth } from 'date-fns'
import { ChevronDown, ChevronRight, Crown, Lock, Pencil, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { parseLocalDate, toYyyyMmDd } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'

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

export type WorkloadScale = 'week' | 'month' | 'monthly'

export type WorkloadDisplayMode = 'hours' | 'tasks'

/** `full`: một khối (banner / đợi load). `header`|`body`: tách header khỏi overflow-y — không dùng sticky dọc, tránh lệch subpixel Chrome. */
export type WorkloadTableSegment = 'full' | 'header' | 'body'

export type WorkloadOverrideUpsertInput = {
  userId: string
  workDate: string
  overrideHours: number | null
  note: string | null
}

/** Task đã lên lịch trên Gantt — đếm Tasks theo trùng plan với **ngày trong tuần** trong bucket (không T7/CN). */
export type WorkloadGanttScheduledTaskRef = {
  id: string
  assigneeUserId: string | null
  planStartDate: string
  planEndDate: string
}

type WorkloadProps = {
  data: WorkloadData | null | undefined
  scale: WorkloadScale
  start: Date
  totalDays: number
  pixelPerDay: number
  leftBlockWidth: number
  chartWidth: number
  weekendColumnRects: { left: number; width: number }[]
  verticalGridLeftPx: number[]
  showGridBorders: boolean
  locale: Locale
  language: string
  loading?: boolean
  /** Hiển thị banner khi đa project (data sẽ là null). */
  multiProject?: boolean
  /** Task có plan trên Gantt (cùng view) — Tasks mode: giao plan với T2–T6 trong bucket (bỏ T7/CN). */
  scheduledGanttTasks?: WorkloadGanttScheduledTaskRef[]
  /** Slot mini-Gantt khi expand row → render filtered GanttTaskRow của user. Component không tự render task. */
  renderMiniGanttForUser?: (userId: string) => ReactNode
  onUpsertOverride?: (input: WorkloadOverrideUpsertInput) => Promise<void> | void
  getUserAvatarUrl?: (userId: string) => string | null | undefined
  segment?: WorkloadTableSegment
  /** Khi `segment` là `header` hoặc `body`: controlled mode để hai mount dùng chung Hours/Tasks. */
  displayMode?: WorkloadDisplayMode
  onDisplayModeChange?: (mode: WorkloadDisplayMode) => void
}

function isWeekend(d: Date): boolean {
  const dow = getDay(d)
  return dow === 0 || dow === 6
}

const HEADER_H = 40
const ROW_H = 40
const CAPACITY_ROW_H = 28

/** Cột meta trái trong strip header (sticky ngang trong overflow-x của header). */
const Z_WORKLOAD_HEADER_STRIP_META = 10
const Z_WORKLOAD_STICKY_ROW_META = 40
/** Hàng capacity trong expanded block — trên mini-Gantt meta khi chồng lấn */
const Z_WORKLOAD_STICKY_CAPACITY_META = 42

type Bucket = { left: number; width: number; startDate: Date; endDate: Date; days: Date[] }

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
function countDistinctTasksOverlappingBucketCalendar(
  bucket: Bucket,
  tasksForUser: WorkloadGanttScheduledTaskRef[]
): number {
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
  const date = String(raw.date ?? '').trim().slice(0, 10)
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
  const taskIds =
    taskCount > 0 && Array.isArray(idsRaw) ? idsRaw.map(x => String(x).trim()).filter(Boolean) : []
  return { userId, date, derivedHours, actualWorkHours, overrideHours, taskCount, taskIds }
}

function effectiveHoursOfCell(cell: WorkloadDayCell | undefined): number {
  if (!cell) return 0
  if (cell.overrideHours != null) return Number(cell.overrideHours) || 0
  if (cell.actualWorkHours != null) return Number(cell.actualWorkHours) || 0
  return Number(cell.derivedHours) || 0
}

function formatHours(n: number): string {
  if (!Number.isFinite(n) || n === 0) return ''
  if (n >= 100) return `${Math.round(n)}h`
  return n % 1 === 0 ? `${n.toFixed(0)}h` : `${n.toFixed(1)}h`
}

function bucketTone(loadRatio: number): { bg: string; text: string } {
  if (loadRatio <= 0) return { bg: 'bg-muted/30', text: 'text-muted-foreground' }
  if (loadRatio < 0.6) return { bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300' }
  if (loadRatio < 1.0) return { bg: 'bg-emerald-500/25', text: 'text-emerald-700 dark:text-emerald-300' }
  if (loadRatio < 1.2) return { bg: 'bg-amber-500/30', text: 'text-amber-800 dark:text-amber-300' }
  return { bg: 'bg-rose-500/30', text: 'text-rose-700 dark:text-rose-300' }
}

/** Fill dọc (giờ mode): dailyCapacity h = 100% chiều cao ô; dưới ngưỡng xanh, trên ngưỡng đỏ. */
function workloadHoursFillStyle(hours: number, dailyCapacity: number): { fillPct: number; overload: boolean } {
  const cap = Math.max(0.5, dailyCapacity)
  const h = Number(hours)
  const safeH = Number.isFinite(h) ? Math.max(0, h) : 0
  const fillPct = Math.min(100, (safeH / cap) * 100)
  return { fillPct, overload: safeH > cap }
}

function userInitials(meta: WorkloadUserMeta): string {
  const src = (meta.name || meta.userCode || '').trim()
  if (!src) return '?'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function TaskGanttWorkload({
  data,
  scale,
  start,
  totalDays,
  pixelPerDay,
  leftBlockWidth,
  chartWidth,
  weekendColumnRects,
  verticalGridLeftPx,
  showGridBorders,
  locale,
  language: _language,
  loading = false,
  multiProject = false,
  scheduledGanttTasks,
  renderMiniGanttForUser,
  onUpsertOverride,
  getUserAvatarUrl,
  segment = 'full',
  displayMode: displayModeProp,
  onDisplayModeChange,
}: WorkloadProps) {
  const { t } = useTranslation()
  const [internalDisplayMode, setInternalDisplayMode] = useState<WorkloadDisplayMode>('hours')
  const displayControlled = displayModeProp !== undefined && onDisplayModeChange !== undefined
  const displayMode = displayControlled ? displayModeProp! : internalDisplayMode
  const setDisplayMode = displayControlled ? onDisplayModeChange! : setInternalDisplayMode
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set())

  const buckets = useMemo(() => buildBuckets(scale, start, totalDays, pixelPerDay), [scale, start, totalDays, pixelPerDay])

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

  /** Task theo assignee — đếm Tasks mode bằng trùng plan lịch với Gantt. */
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

  /**
   * - Hours: cộng effectiveHours mọi ngày trong bucket (override cuối tuần vẫn tính).
   * - Tasks: nếu có `scheduledGanttTasks` → số task **khác nhau** có [planStart, planEnd] giao phần **T2–T6**
   *   của bucket (T7/CN trong bucket không dùng để đếm; ô chỉ có T7/CN → 0). Không có list Gantt → fallback ô API.
   */
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
          hours += effectiveHoursOfCell(cell)
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
    [cellMap, nonWorkingSet, scheduledByAssignee]
  )

  const totalHoursPerUser = useMemo(() => {
    const totals = new Map<string, number>()
    for (const d of normalizedDays) {
      totals.set(d.userId, (totals.get(d.userId) ?? 0) + effectiveHoursOfCell(d))
    }
    return totals
  }, [normalizedDays])

  const toggleUser = useCallback((userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }, [])

  const dailyCapacity = data?.hoursPerDay ?? 8

  if (multiProject) {
    if (segment !== 'full') return null
    return (
      <div className="border-t border-border" style={{ width: leftBlockWidth + chartWidth }}>
        <div
          className="sticky left-0 z-[30] flex items-center justify-between gap-2 bg-muted/80 px-3 py-2 backdrop-blur-sm"
          style={{ width: leftBlockWidth + Math.min(chartWidth, 1200) }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.workloadTitle')}</div>
          <div className="text-xs text-muted-foreground italic">{t('taskManagement.workloadNeedsSingleProject')}</div>
        </div>
      </div>
    )
  }

  if (!data) {
    if (segment !== 'full') return null
    return (
      <div className="border-t border-border" style={{ width: leftBlockWidth + chartWidth }}>
        <div className="sticky left-0 z-[30] flex items-center gap-2 bg-muted/80 px-3 py-2 backdrop-blur-sm" style={{ width: leftBlockWidth + Math.min(chartWidth, 1200) }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('taskManagement.workloadTitle')}</div>
          {loading ? <span className="text-xs text-muted-foreground">…</span> : null}
        </div>
      </div>
    )
  }

  const users = data.users
  const empty = users.length === 0 || data.days.length === 0

  const workloadHeaderRow = (
    <div
      className={cn(
        'flex shrink-0 items-stretch border-b bg-muted',
        showGridBorders ? 'border-border/70' : 'border-border/40'
      )}
      style={{ height: HEADER_H }}
    >
      <div
        className="sticky left-0 flex shrink-0 items-center justify-between gap-2 border-r border-border/50 bg-muted px-3"
        style={{ width: leftBlockWidth, zIndex: Z_WORKLOAD_HEADER_STRIP_META }}
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
      <div className="relative shrink-0 bg-muted text-[10px] text-muted-foreground" style={{ width: chartWidth }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {weekendColumnRects.map((r, i) => (
            <div key={`wl-hdr-wk-${r.left}-${i}`} className="absolute top-0 bottom-0" style={{ left: r.left, width: r.width }} />
          ))}
        </div>
        <div className="absolute inset-y-0 right-3 flex items-center justify-end text-[10px] text-muted-foreground/80">
          {t('taskManagement.workloadHoursPerDayLabel', { hours: dailyCapacity })}
        </div>
      </div>
    </div>
  )

  if (segment === 'header') {
    return <div className="bg-background" style={{ width: leftBlockWidth + chartWidth }}>{workloadHeaderRow}</div>
  }

  if (segment === 'body') {
    return (
      <div
        className={cn('relative bg-background', showGridBorders ? 'divide-y divide-border/60' : 'divide-y divide-border/40')}
        style={{ width: leftBlockWidth + chartWidth }}
      >
      {empty ? (
        <div className="sticky left-0 z-[2] bg-background px-3 py-3 text-xs text-muted-foreground" style={{ width: leftBlockWidth + Math.min(chartWidth, 720) }}>
          {t('taskManagement.workloadEmpty')}
        </div>
      ) : null}

      {users.map(user => {
        const expanded = expandedUsers.has(user.userId)
        const totalH = totalHoursPerUser.get(user.userId) ?? 0
        const allowEditRow = data.canEditAll || user.userId === data.selfUserId

        return (
          <div key={user.userId} className="flex flex-col">
            {/* biome-ignore lint/a11y/useSemanticElements: không dùng <button> bọc hàng — các ô có PopoverTrigger là <button> (invalid nesting). */}
            <div
              role="button"
              tabIndex={0}
              className={cn(
                'group relative flex cursor-pointer items-stretch text-left transition-colors hover:bg-muted/40',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary'
              )}
              style={{ height: ROW_H }}
              onClick={() => toggleUser(user.userId)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleUser(user.userId)
                }
              }}
              aria-expanded={expanded}
              aria-label={user.name || user.userCode}
            >
              <div
                className="sticky left-0 flex shrink-0 transform-gpu items-center gap-2 border-r border-border/50 bg-background px-3"
                style={{ width: leftBlockWidth, zIndex: Z_WORKLOAD_STICKY_ROW_META }}
              >
                <span className="text-muted-foreground/80 transition-transform" aria-hidden>
                  {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
                <Avatar className="size-6 shrink-0">
                  <AvatarImage src={getUserAvatarUrl?.(user.userId) ?? undefined} alt={user.name || user.userCode} />
                  <AvatarFallback className="text-[10px]">{userInitials(user)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-medium">{user.name || user.userCode}</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {user.role === 'pm' ? <Crown className="h-3 w-3 text-amber-500" aria-hidden /> : null}
                    {user.role === 'pl' ? <Crown className="h-3 w-3 text-sky-500" aria-hidden /> : null}
                    <span className="uppercase tracking-wide">{user.role}</span>
                    {!allowEditRow ? <Lock className="ml-1 h-3 w-3" aria-hidden /> : null}
                  </span>
                </div>
                <span className="ml-auto shrink-0 rounded bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground">{formatHours(totalH) || '0h'}</span>
              </div>
              <div className="relative shrink-0" style={{ width: chartWidth }}>
                <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                  {weekendColumnRects.map((r, i) => (
                    <div
                      key={`wl-row-wk-${user.userId}-${r.left}-${i}`}
                      className="absolute top-0 bottom-0 bg-slate-500/[0.07] dark:bg-slate-400/[0.04]"
                      style={{ left: r.left, width: r.width }}
                    />
                  ))}
                </div>
                {showGridBorders ? (
                  <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
                    {verticalGridLeftPx.map(left => (
                      <div key={`wl-row-grid-${user.userId}-${left}`} className="absolute top-0 bottom-0 w-px bg-border/55 dark:bg-border/35" style={{ left }} />
                    ))}
                  </div>
                ) : null}
                <div className="absolute inset-0 z-[2] flex min-h-0 min-w-0 items-stretch">
                  {buckets.map((bucket, idx) => (
                    <WorkloadBucketCell
                      key={`${user.userId}-${idx}-${bucket.left}`}
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
                      showGridBorders={showGridBorders}
                    />
                  ))}
                </div>
              </div>
            </div>

            {expanded ? (
              <div className={cn('flex flex-col bg-muted/15', showGridBorders ? 'border-t border-border/60' : 'border-t border-border/30')}>
                <div className="flex items-stretch" style={{ height: CAPACITY_ROW_H }}>
                  <div
                    className="sticky left-0 flex shrink-0 transform-gpu items-center gap-2 border-r border-border/40 bg-muted/40 px-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    style={{ width: leftBlockWidth, zIndex: Z_WORKLOAD_STICKY_CAPACITY_META }}
                  >
                    {t('taskManagement.workloadCapacityRow')}
                  </div>
                  <div className="relative shrink-0" style={{ width: chartWidth }}>
                    <div className="absolute inset-0 flex items-stretch">
                      {buckets.map((bucket, idx) => {
                        const agg = aggregateBucketForUser(user.userId, bucket)
                        const cap = Math.max(1, agg.workingDays * dailyCapacity)
                        const ratio = cap > 0 ? agg.hours / cap : 0
                        const tone = bucketTone(ratio)
                        const fillPct = Math.min(100, ratio * 100)
                        return (
                          <div
                            key={`cap-${user.userId}-${idx}`}
                            className={cn(
                              'relative h-full',
                              showGridBorders && 'border-r border-border/30 last:border-r-0',
                              tone.bg
                            )}
                            style={{ left: 0, width: bucket.width }}
                            title={ratio > 1 ? t('taskManagement.workloadOverloadTooltip') : undefined}
                          >
                            <div
                              aria-hidden
                              className={cn('absolute inset-y-1 left-0 rounded-sm', ratio > 1 ? 'bg-rose-500/55' : ratio >= 1 ? 'bg-amber-500/55' : 'bg-emerald-500/55')}
                              style={{ width: `${fillPct}%`, maxWidth: '100%' }}
                            />
                            <div className={cn('relative z-[1] flex h-full items-center justify-center text-[9px] font-semibold tabular-nums', tone.text)}>
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
                    {showGridBorders ? (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute top-0 bottom-0 z-[1] overflow-hidden"
                        style={{ left: leftBlockWidth, width: chartWidth }}
                      >
                        {verticalGridLeftPx.map(left => (
                          <div
                            key={`wl-mini-${user.userId}-grid-${left}`}
                            className="absolute top-0 bottom-0 w-px bg-border/85 dark:bg-border/70"
                            style={{ left }}
                          />
                        ))}
                      </div>
                    ) : null}
                    <div className="relative z-[2] flex min-w-0 flex-col">{renderMiniGanttForUser(user.userId)}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
      </div>
    )
  }

  return null
}

function WorkloadBucketCell({
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
  showGridBorders,
}: {
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
  showGridBorders: boolean
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
  const hoursFill = displayMode === 'hours' ? workloadHoursFillStyle(agg.hours, dailyCapacity) : null

  const display = (() => {
    if (displayMode === 'tasks') return String(agg.tasks)
    return formatHours(agg.hours)
  })()

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
      await onUpsertOverride({ userId, workDate: editingDate, overrideHours: value, note: noteInput.trim() ? noteInput.trim() : null })
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }, [onUpsertOverride, editingDate, hoursInput, noteInput, userId])

  const reset = useCallback(async () => {
    if (!onUpsertOverride || !editingDate) return
    setSubmitting(true)
    try {
      await onUpsertOverride({ userId, workDate: editingDate, overrideHours: null, note: null })
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }, [onUpsertOverride, editingDate, userId])

  return (
    <Popover open={open} onOpenChange={v => (allowEdit ? setOpen(v) : setOpen(false))}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={openPopover}
          className={cn(
            'relative flex h-full items-center justify-center overflow-hidden px-1 text-[10px] font-semibold tabular-nums transition-colors',
            showGridBorders && 'border-r border-border/30 last:border-r-0',
            displayMode === 'hours' ? 'z-[2] bg-background dark:bg-background' : cn(tone.bg, tone.text),
            agg.isFullyNonWorking && 'opacity-50',
            !allowEdit && 'cursor-default'
          )}
          style={{ width: bucket.width }}
          title={
            !allowEdit && !canEditAll
              ? t('taskManagement.workloadOverrideReadOnly')
              : displayMode === 'hours' && hoursFill?.overload
                ? t('taskManagement.workloadOverloadTooltip')
                : ratio > 1
                  ? t('taskManagement.workloadOverloadTooltip')
                  : undefined
          }
          aria-label={display ? `${display} ${userId}` : ''}
        >
          {displayMode === 'hours' && hoursFill != null && hoursFill.fillPct > 0 ? (
            <span
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-x-0 bottom-0 z-0',
                hoursFill.overload
                  ? 'bg-rose-600/[0.48] dark:bg-rose-600/[0.45]'
                  : 'bg-emerald-600/[0.44] dark:bg-emerald-600/[0.42]'
              )}
              style={{ height: `${hoursFill.fillPct}%` }}
            />
          ) : null}
          <span
            className={cn(
              'relative z-[1] font-semibold text-foreground',
              displayMode === 'hours' && hoursFill != null && hoursFill.fillPct >= 28
                ? '[text-shadow:0_0_0.5px_hsl(var(--background)/0.9),0_1px_2px_hsl(var(--background)/0.55)]'
                : '',
              displayMode !== 'hours' ? tone.text : ''
            )}
          >
            {display}
          </span>
          {agg.hasOverride ? (
            <Pencil
              className={cn(
                'absolute right-0.5 top-0.5 z-[2] h-2.5 w-2.5 opacity-90',
                displayMode === 'hours' && hoursFill != null && hoursFill.fillPct >= 28 ? 'text-foreground' : 'text-muted-foreground'
              )}
              aria-hidden
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
