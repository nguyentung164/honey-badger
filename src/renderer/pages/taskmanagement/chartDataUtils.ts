/**
 * Utils tính toán dữ liệu cho Burndown, Burnup, CFD, Completion Trend charts.
 *
 * Dữ liệu thực tế:
 * - Chỉ done tasks có actualEndDate (luôn === updatedAt).
 * - Non-done tasks chỉ có createdAt đáng tin cậy.
 * - actualStartDate gần như không được dùng (~2% tasks).
 * - Không có state transition log → dùng current status làm xấp xỉ cho lịch sử.
 */

import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'

export type TaskStatus = string
export type TaskPriority = string

export interface ChartTask {
  id: string
  status: TaskStatus
  progress: number
  priority: TaskPriority
  assigneeUserId: string | null
  planStartDate?: string
  planEndDate?: string
  actualEndDate: string
  actualStartDate: string
  createdAt: string
  updatedAt: string
}

export function toDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function toDateKeyFromISO(s: string | undefined): string | null {
  if (!s || typeof s !== 'string') return null
  const trimmed = s.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  return toDateKey(d)
}

/** Parse chuỗi ngày an toàn, trả về null nếu invalid hoặc empty. */
function _parseDateSafe(s: string | undefined): Date | null {
  if (!s || typeof s !== 'string') return null
  const trimmed = s.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Bản task đã parse createdAt / actualEndDate một lần (dùng trong vòng ngày×task).
 * getStatusAtDatePrepared: null nếu chưa tồn tại tại D; done khi actualEndDate ≤ D; in_review → in_progress.
 */
export interface PreparedChartTask {
  createdKey: string | null
  compKey: string | null
  status: TaskStatus
}

export function prepareChartTasks(tasks: ChartTask[]): PreparedChartTask[] {
  const out: PreparedChartTask[] = []
  for (const t of tasks) {
    const createdKey = toDateKeyFromISO(t.createdAt)
    const compKey = t.status === 'done' ? toDateKeyFromISO(t.actualEndDate) : null
    out.push({ createdKey, compKey, status: t.status })
  }
  return out
}

/** Chỉ task không cancelled — khớp thứ tự với các hàm dùng `tasks.filter(t => t.status !== 'cancelled')`. */
export function prepareActiveChartTasks(tasks: ChartTask[]): PreparedChartTask[] {
  const out: PreparedChartTask[] = []
  for (const t of tasks) {
    if (t.status === 'cancelled') continue
    const createdKey = toDateKeyFromISO(t.createdAt)
    const compKey = t.status === 'done' ? toDateKeyFromISO(t.actualEndDate) : null
    out.push({ createdKey, compKey, status: t.status })
  }
  return out
}

function getStatusAtDatePrepared(task: PreparedChartTask, dateKey: string): TaskStatus | null {
  if (!task.createdKey || task.createdKey > dateKey) return null
  if (task.status === 'done') {
    if (task.compKey && task.compKey <= dateKey) return 'done'
    return 'in_progress'
  }
  if (task.status === 'in_review') return 'in_progress'
  return task.status
}

/**
 * Lấy ngày hoàn thành task. Chỉ trả về actualEndDate khi nó thực sự có giá trị.
 * Không fallback sang updatedAt/createdAt vì chúng không phải ngày hoàn thành.
 */
export function getCompletionDate(task: ChartTask): string | null {
  if (task.status !== 'done') return null
  const comp = task.actualEndDate?.trim()
  return comp || null
}

/**
 * Lấy ngày hoàn thành mở rộng.
 * countFixedAsDone: nếu true, task 'fixed' có actualEndDate cũng được coi là completed.
 * Chỉ trả về actualEndDate thực sự có giá trị, KHÔNG fallback updatedAt/createdAt.
 */
export function getCompletionDateEx(task: ChartTask, countFixedAsDone: boolean): string | null {
  if (task.status === 'done') {
    const comp = task.actualEndDate?.trim()
    return comp || null
  }
  if (countFixedAsDone && task.status === 'fixed') {
    const comp = task.actualEndDate?.trim()
    return comp || null
  }
  return null
}

export function getDateRange(tasks: ChartTask[], dateRange?: DateRange | null): string[] {
  const dates = new Set<string>()
  const today = toDateKey(new Date())
  dates.add(today)

  for (const t of tasks) {
    const created = toDateKeyFromISO(t.createdAt)
    if (created) dates.add(created)
    const comp = toDateKeyFromISO(t.actualEndDate)
    if (comp) dates.add(comp)
    const started = toDateKeyFromISO(t.actualStartDate)
    if (started) dates.add(started)
    const planStart = toDateKeyFromISO(t.planStartDate)
    if (planStart) dates.add(planStart)
    const dl = toDateKeyFromISO(t.planEndDate)
    if (dl) dates.add(dl)
  }

  const sorted = [...dates].sort()
  if (sorted.length === 0) return [today]

  let start: Date
  let end: Date
  if (dateRange?.from) {
    start = new Date(dateRange.from)
    end = dateRange.to ? new Date(dateRange.to) : new Date(dateRange.from)
    const todayObj = new Date(today)
    if (end > todayObj) end = todayObj
  } else {
    start = new Date(sorted[0])
    end = new Date(sorted[sorted.length - 1])
  }

  let rangeStart = start
  let rangeEnd = end
  if (rangeStart > rangeEnd) {
    ;[rangeStart, rangeEnd] = [rangeEnd, rangeStart]
  }
  const range: string[] = []
  const cur = new Date(rangeStart)
  const endKey = toDateKey(rangeEnd)
  while (toDateKey(cur) <= endKey) {
    range.push(toDateKey(cur))
    cur.setDate(cur.getDate() + 1)
    if (range.length > 365) break
  }
  if (range.length === 0) return [today]
  return range
}

/**
 * Tính velocity (số task done trung bình mỗi ngày) dựa trên dữ liệu thực tế.
 */
function computeVelocity(dailyDone: Map<string, number>, dates: string[], todayKey: string, lookbackDays = 7): number {
  const relevantDates = dates.filter(d => d <= todayKey)
  const recent = relevantDates.slice(-lookbackDays)
  if (recent.length === 0) return 0
  const totalDone = recent.reduce((sum, d) => sum + (dailyDone.get(d) ?? 0), 0)
  return totalDone / recent.length
}

/**
 * Tạo map đếm số task done theo từng ngày.
 * Chỉ đếm task có actualEndDate thực sự.
 */
function buildDailyDoneMap(activeTasks: ChartTask[], countFixedAsDone = false): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of activeTasks) {
    const comp = getCompletionDateEx(t, countFixedAsDone)
    if (comp) {
      const key = toDateKeyFromISO(comp)
      if (key) map.set(key, (map.get(key) ?? 0) + 1)
    }
  }
  return map
}

/**
 * Burndown: remaining = tasks tồn tại tại D mà chưa done.
 * Dùng getStatusAtDatePrepared trên dữ liệu đã chuẩn bị.
 */
export function computeBurndownData(
  tasks: ChartTask[],
  dateRange?: DateRange | null,
  countFixedAsDone = false
): { date: string; remaining: number; ideal: number; forecast: number | null }[] {
  const activeTasks = tasks.filter(t => t.status !== 'cancelled')
  const prepared = prepareActiveChartTasks(tasks)
  const dates = getDateRange(tasks, dateRange)
  if (dates.length === 0) return []

  const totalDays = Math.max(1, dates.length - 1)
  const todayKey = toDateKey(new Date())
  const dailyDone = buildDailyDoneMap(activeTasks, countFixedAsDone)

  const firstDateKey = dates[0]
  const initialTotal = prepared.filter(t => {
    const s = getStatusAtDatePrepared(t, firstDateKey)
    return s !== null
  }).length

  const completedStatuses: Set<TaskStatus> = new Set(['done'])
  if (countFixedAsDone) completedStatuses.add('fixed')

  const raw = dates.map((d, i) => {
    let existsCount = 0
    let doneCount = 0

    for (const t of prepared) {
      const s = getStatusAtDatePrepared(t, d)
      if (s === null) continue
      existsCount++
      if (completedStatuses.has(s)) doneCount++
    }

    const remaining = Math.max(0, existsCount - doneCount)
    const ideal = Math.max(0, initialTotal - (initialTotal / totalDays) * i)

    return { date: d, remaining, ideal, forecast: null as number | null }
  })

  const velocity = computeVelocity(dailyDone, dates, todayKey)
  if (velocity > 0) {
    const todayIdx = dates.findIndex(d => d >= todayKey)
    const startIdx = todayIdx >= 0 ? todayIdx : dates.length - 1
    const baseRemaining = raw[startIdx]?.remaining ?? 0

    for (let i = startIdx; i < raw.length; i++) {
      const daysFromStart = i - startIdx
      raw[i].forecast = Math.max(0, baseRemaining - velocity * daysFromStart)
    }
  }

  return raw
}

/**
 * Burnup: completed, inProgress và total tại cùng thời điểm D.
 * Dùng getStatusAtDatePrepared trên dữ liệu đã chuẩn bị.
 */
export function computeBurnupData(
  tasks: ChartTask[],
  dateRange?: DateRange | null,
  countFixedAsDone = false
): { date: string; completed: number; total: number; inProgress: number; forecast: number | null }[] {
  const activeTasks = tasks.filter(t => t.status !== 'cancelled')
  const prepared = prepareActiveChartTasks(tasks)
  const dates = getDateRange(tasks, dateRange)

  const todayKey = toDateKey(new Date())
  const dailyDone = buildDailyDoneMap(activeTasks, countFixedAsDone)

  const completedStatuses: Set<TaskStatus> = new Set(['done'])
  if (countFixedAsDone) completedStatuses.add('fixed')

  const inProgressStatuses: Set<TaskStatus> = new Set(['in_progress', 'fixed', 'feedback'])
  if (countFixedAsDone) inProgressStatuses.delete('fixed')

  const raw = dates.map(d => {
    let total = 0
    let completed = 0
    let inProgress = 0

    for (const t of prepared) {
      const s = getStatusAtDatePrepared(t, d)
      if (s === null) continue
      total++
      if (completedStatuses.has(s)) completed++
      else if (inProgressStatuses.has(s)) inProgress++
    }

    return { date: d, completed, total, inProgress, forecast: null as number | null }
  })

  const velocity = computeVelocity(dailyDone, dates, todayKey)
  if (velocity > 0) {
    const todayIdx = dates.findIndex(d => d >= todayKey)
    const startIdx = todayIdx >= 0 ? todayIdx : dates.length - 1
    const baseCompleted = raw[startIdx]?.completed ?? 0

    for (let i = startIdx; i < raw.length; i++) {
      const daysFromStart = i - startIdx
      raw[i].forecast = baseCompleted + velocity * daysFromStart
    }
  }

  return raw
}

export interface CFDDataPoint {
  date: string
  new: number
  inProgress: number
  fixed: number
  feedback: number
  done: number
}

/**
 * CFD (Cumulative Flow Diagram): phân bố theo status tại mỗi ngày D.
 * Dùng getStatusAtDatePrepared trên dữ liệu đã chuẩn bị.
 * Ràng buộc: new + inProgress + fixed + feedback + done = totalAtD.
 */
export function computeCFDData(tasks: ChartTask[], dateRange?: DateRange | null): CFDDataPoint[] {
  const prepared = prepareActiveChartTasks(tasks)
  const dates = getDateRange(tasks, dateRange)

  return dates.map(d => {
    let newCount = 0
    let inProgressCount = 0
    let fixedCount = 0
    let feedbackCount = 0
    let doneCount = 0

    for (const t of prepared) {
      const s = getStatusAtDatePrepared(t, d)
      if (s === null) continue
      switch (s) {
        case 'done':
          doneCount++
          break
        case 'fixed':
          fixedCount++
          break
        case 'feedback':
          feedbackCount++
          break
        case 'in_progress':
          inProgressCount++
          break
        case 'new':
          newCount++
          break
      }
    }

    return {
      date: d,
      new: newCount,
      inProgress: inProgressCount,
      fixed: fixedCount,
      feedback: feedbackCount,
      done: doneCount,
    }
  })
}

/**
 * Completion Trend: số task done mỗi ngày + 7-day moving average + cumulative.
 * Chỉ đếm task có actualEndDate thực sự.
 */
export function computeCompletionTrendData(
  tasks: ChartTask[],
  dateRange?: DateRange | null,
  countFixedAsDone = true
): { date: string; completed: number; movingAvg: number; cumulative: number }[] {
  const activeTasks = tasks.filter(t => t.status !== 'cancelled')
  const dates = getDateRange(tasks, dateRange)

  const completedByDate = new Map<string, number>()
  for (const t of activeTasks) {
    const comp = getCompletionDateEx(t, countFixedAsDone)
    if (comp) {
      const key = toDateKeyFromISO(comp)
      if (key) completedByDate.set(key, (completedByDate.get(key) ?? 0) + 1)
    }
  }

  const dailyValues = dates.map(d => completedByDate.get(d) ?? 0)

  let cumSum = 0
  return dates.map((d, i) => {
    const completed = dailyValues[i]
    cumSum += completed

    const windowStart = Math.max(0, i - 6)
    const window = dailyValues.slice(windowStart, i + 1)
    const movingAvg = window.reduce((a, b) => a + b, 0) / window.length

    return {
      date: d,
      completed,
      movingAvg: Math.round(movingAvg * 100) / 100,
      cumulative: cumSum,
    }
  })
}
