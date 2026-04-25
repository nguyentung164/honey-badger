import { parseISO } from 'date-fns'
import type { ACRow, WBSRow } from 'shared/types/evm'
import { toYyyyMmDd } from '@/lib/dateUtils'
import { workingDaysBetweenInclusive } from '@/lib/evmCalculations'

/** Dữ liệu task tối thiểu IPC `task.getAll` trả về (khớp `Task` trong mysqlTaskStore). */
export type TaskLikeForEvmImport = {
  id?: string
  title: string
  description?: string
  status?: string
  assigneeUserId?: string | null
  progress?: number
  actualStartDate?: string
  actualEndDate?: string
  planStartDate?: string
  planEndDate?: string
  type?: string
  ticketId?: string
  priority?: string
  parentId?: string | null
}

function parseYyyyMmDd(ymd: string | undefined): Date | null {
  if (!ymd?.trim()) return null
  const d = parseISO(ymd.trim().slice(0, 10))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Trạng thái Task Management → mã EVM (`new`, `in_progress`, … — EVM_Tool.txt).
 */
export function taskStatusToEvmStatus(status: string | undefined): string | undefined {
  const s = String(status ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
  const map: Record<string, string> = {
    new: 'new',
    in_progress: 'in_progress',
    in_review: 'feedback',
    fixed: 'resolved',
    cancelled: 'rejected',
    done: 'closed',
    feedback: 'feedback',
  }
  if (map[s]) return map[s]
  if (!s) return undefined
  return s
}

/**
 * `tasks.type` → cột Category trên WBS / AC (gần các nhãn sheet: FixBug, Feature, …).
 */
export function taskTypeToEvmCategory(type: string | undefined): string | undefined {
  const t = String(type ?? 'task')
    .toLowerCase()
    .trim()
  const map: Record<string, string> = {
    bug: 'FixBug',
    feature: 'Feature',
    support: 'Support',
    task: 'Task',
  }
  if (map[t]) return map[t]
  if (!t) return undefined
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** % Done: task `done` → 1; còn lại theo progress 0–100. */
export function percentDoneFromTask(task: TaskLikeForEvmImport): number {
  let p = Math.min(1, Math.max(0, (task.progress ?? 0) / 100))
  const st = String(task.status ?? '').toLowerCase()
  if (st === 'done') p = 1
  return p
}

function buildImportWbsNote(task: TaskLikeForEvmImport, ticket: string): string | undefined {
  const parts: string[] = ['[Tasks→EVM]']
  if (ticket) parts.push(`#${ticket}`)
  if (task.id) parts.push(`task:${String(task.id).slice(0, 8)}`)
  if (task.priority) parts.push(`${task.priority}`)
  if (task.parentId) parts.push('subtask')
  return parts.length > 1 ? parts.join(' · ') : undefined
}

export type WbsImportRow = Omit<WBSRow, 'id' | 'projectId' | 'no' | 'assigneeName' | 'statusName'>

export type MapTaskToWbsOptions = {
  defaultBac: number
  /** Mã phase trên EVM Master (vd. sd, bd, cd_ut). Bỏ trống nếu không gán. */
  defaultPhase?: string
  /** Ngày nghỉ Master EVM — dùng cho Dur. (NETWORKDAYS) khi import. */
  nonWorkingDays?: string[]
}

/**
 * Một dòng WBS khi import từ Task Management — khớp bảng chi tiết `evm_wbs_details` và logic BAC Excel (Q = P×ngày làm khi có lịch).
 */
export function mapTaskLikeToWbsImportRow(task: TaskLikeForEvmImport, options: MapTaskToWbsOptions): WbsImportRow {
  const ticket = (task.ticketId ?? '').trim()
  const phase = (options.defaultPhase ?? '').trim() || undefined
  const planStart = toYyyyMmDd(task.planStartDate)
  const planEnd = toYyyyMmDd(task.planEndDate)
  const hasPlanRange = Boolean(planStart && planEnd)
  const nw = options.nonWorkingDays ?? []

  let durationDays: number | undefined
  if (hasPlanRange) {
    const a = parseYyyyMmDd(planStart)
    const b = parseYyyyMmDd(planEnd)
    if (a && b) durationDays = workingDaysBetweenInclusive(a, b, nw)
  }

  const wbsNote = buildImportWbsNote(task, ticket)
  const bacFallback = Math.max(1e-9, Math.max(0, Number(options.defaultBac) || 1))

  return {
    task: task.title,
    phase,
    category: taskTypeToEvmCategory(task.type),
    feature: ticket || undefined,
    assignee: task.assigneeUserId ?? undefined,
    percentDone: percentDoneFromTask(task),
    status: taskStatusToEvmStatus(task.status),
    planStartDate: planStart,
    planEndDate: planEnd,
    actualStartDate: toYyyyMmDd(task.actualStartDate),
    actualEndDate: toYyyyMmDd(task.actualEndDate),
    // Có plan start/end: để bac/estMd trống — `taskBudgetMdLikeExcel` dùng effort/ngày (mặc định 1)×NETWORKDAYS. Không có lịch: BAC ô nhập mặc định.
    bac: hasPlanRange ? undefined : bacFallback,
    estMd: undefined,
    wbsNote,
    durationDays: durationDays ?? undefined,
  }
}

/**
 * Snapshot một dòng AC tại ngày báo cáo — cùng khóa Phase/Category/Feature/Task & lịch với WBS vừa import (giống sheet AC Excel).
 * `workingHours` = 0; bổ sung giờ thực tế trên UI sau.
 */
export function mapWbsImportRowToAcSnapshotRow(
  wbs: WbsImportRow,
  reportDate: string,
  descriptionPlain?: string,
): Omit<ACRow, 'id' | 'projectId' | 'no'> {
  const title = (wbs.task ?? '').trim()
  const desc = (descriptionPlain ?? '')
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
  let workContents: string | undefined
  if (title && desc) {
    const short = desc.length > 400 ? `${desc.slice(0, 400)}…` : desc
    workContents = `${title} — ${short}`
  } else if (title) workContents = title
  else if (desc) workContents = desc.length > 500 ? `${desc.slice(0, 500)}…` : desc

  const dateYmd = (reportDate || '').slice(0, 10)
  return {
    date: dateYmd || undefined,
    phase: wbs.phase,
    category: wbs.category,
    feature: wbs.feature,
    task: wbs.task,
    planStartDate: wbs.planStartDate,
    planEndDate: wbs.planEndDate,
    actualStartDate: wbs.actualStartDate,
    actualEndDate: wbs.actualEndDate,
    percentDone: wbs.percentDone,
    assignee: wbs.assignee,
    workingHours: 0,
    workContents,
  }
}
