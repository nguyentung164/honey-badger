import l from 'electron-log'
import { randomUuidV7 } from 'shared/randomUuidV7'
import { query, type TransactionQuery } from './db'
import { getProjectMembers, hasRole, isAppAdmin } from './pgTaskStore'

const PUDW = 'project_user_daily_workload'

export type WorkloadDay = {
  userId: string
  /** yyyy-mm-dd (local) */
  date: string
  /** Tổng giờ derive từ tasks (đã chia đều theo working day trong task span) */
  derivedHours: number
  /** Giờ thực tế user khai qua daily report; hiển thị sau derived, trước override */
  actualWorkHours: number | null
  /** Override do PM/PL/Admin nhập tay; ưu tiên hiển thị */
  overrideHours: number | null
  /** Số task assigned cho user vào ngày đó (đếm distinct task_id), dùng cho toggle Tasks */
  taskCount: number
  /** Danh sách task id assigned ngày đó (để mini-Gantt highlight) */
  taskIds: string[]
}

export type WorkloadUser = {
  userId: string
  name: string
  userCode: string
  role: 'pm' | 'pl' | 'dev'
}

export type WorkloadResponse = {
  /** Tất cả member project (gồm PM/PL/Dev) + assignees từ tasks (đã dedupe). */
  users: WorkloadUser[]
  /** Mỗi cell `(user, date)` chỉ xuất hiện 1 lần. */
  days: WorkloadDay[]
  /** hours/ngày mặc định cho project (từ evm_master, fallback 8). */
  hoursPerDay: number
  /** Ngày nghỉ project (yyyy-mm-dd) — không tính vào working day. */
  nonWorkingDates: string[]
  /** PM/PL/Admin → true; dev → false. UI dùng để mở/khoá popover override. */
  canEditAll: boolean
  /** session.userId — UI dùng cho dev (chỉ row của chính mình mới mở popover). */
  selfUserId: string
}

export type WorkloadOverrideInput = {
  projectId: string
  userId: string
  /** yyyy-mm-dd */
  workDate: string
  /** null hoặc undefined = clear override (delete row) */
  overrideHours: number | null
  note: string | null
  /** Optimistic locking */
  version?: number
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toIsoDateLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function parseLocalDate(yyyyMmDd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd)
  if (!m) {
    const d = new Date(yyyyMmDd)
    return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  return new Date(y, mo - 1, da)
}

function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() + n)
  return x
}

function isWeekend(d: Date): boolean {
  const dow = d.getDay()
  return dow === 0 || dow === 6
}

async function loadProjectMaster(projectId: string): Promise<{ hoursPerDay: number; nonWorkingDates: Set<string> }> {
  const rows = await query<Record<string, unknown>>('SELECT hours_per_day, non_working_days FROM evm_master WHERE project_id = ? LIMIT 1', [projectId])
  const row = rows?.[0]
  let hoursPerDay = 8
  const nonWorking = new Set<string>()
  if (row) {
    const hpd = Number(row.hours_per_day)
    if (Number.isFinite(hpd) && hpd > 0) hoursPerDay = hpd
    const nwRaw = row.non_working_days as unknown
    if (Array.isArray(nwRaw)) {
      for (const item of nwRaw) {
        if (typeof item === 'string') {
          nonWorking.add(item.slice(0, 10))
        } else if (item && typeof item === 'object' && 'date' in item) {
          const v = (item as { date?: unknown }).date
          if (typeof v === 'string') nonWorking.add(v.slice(0, 10))
        }
      }
    }
  }
  return { hoursPerDay, nonWorkingDates: nonWorking }
}

/** Tính số working day trong [start,end] (inclusive) trừ weekend + nonWorking. */
function countWorkingDays(start: Date, end: Date, nonWorking: Set<string>): number {
  if (start.getTime() > end.getTime()) return 0
  let cnt = 0
  let d = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  while (d.getTime() <= last.getTime()) {
    if (!isWeekend(d) && !nonWorking.has(toIsoDateLocal(d))) cnt++
    d = addDaysLocal(d, 1)
  }
  return cnt
}

async function getProjectMemberUsers(projectId: string): Promise<WorkloadUser[]> {
  const m = await getProjectMembers(projectId)
  const out: WorkloadUser[] = []
  for (const x of m.pms) out.push({ userId: x.userId, name: x.name, userCode: x.userCode, role: 'pm' })
  for (const x of m.pls) out.push({ userId: x.userId, name: x.name, userCode: x.userCode, role: 'pl' })
  for (const x of m.devs) out.push({ userId: x.userId, name: x.name, userCode: x.userCode, role: 'dev' })
  return out
}

async function fetchAssigneeFallbackUsers(userIds: string[]): Promise<WorkloadUser[]> {
  if (userIds.length === 0) return []
  const ph = userIds.map(() => '?').join(',')
  const rows = await query<Record<string, unknown>>(`SELECT id, name, user_code FROM users WHERE id IN (${ph})`, userIds)
  return (rows || []).map(r => ({ userId: String(r.id), name: (r.name as string) ?? '', userCode: (r.user_code as string) ?? '', role: 'dev' as const }))
}

/**
 * Lấy workload trong khoảng [from, to] cho project.
 *
 * - derived: chia đều estMd*hoursPerDay / workingDaysInTaskSpan của task (estMd null/0 → 0).
 *   Mẫu số dùng TOÀN BỘ task span (không phụ thuộc range hiển thị) để cell phản ánh đúng tải/ngày.
 * - actual / override: lấy từ project_user_daily_workload theo (project, user, date).
 * - users: union (member project) ∪ (assignee xuất hiện trong tasks overlap range).
 *
 * Permission: caller PHẢI đảm bảo session là member của project (handler IPC kiểm tra).
 */
export async function getWorkload(input: { projectId: string; from: string; to: string; sessionUserId: string; sessionRole: string }): Promise<WorkloadResponse> {
  const { projectId, from, to, sessionUserId, sessionRole } = input
  const fromD = parseLocalDate(from)
  const toD = parseLocalDate(to)
  if (!fromD || !toD || fromD.getTime() > toD.getTime()) {
    return {
      users: [],
      days: [],
      hoursPerDay: 8,
      nonWorkingDates: [],
      canEditAll: false,
      selfUserId: sessionUserId,
    }
  }

  const [{ hoursPerDay, nonWorkingDates }, members] = await Promise.all([loadProjectMaster(projectId), getProjectMemberUsers(projectId)])

  const taskRows = await query<Record<string, unknown>>(
    `SELECT id, assignee_user_id, plan_start_date, plan_end_date
     FROM tasks
     WHERE project_id = ? AND assignee_user_id IS NOT NULL
       AND plan_start_date IS NOT NULL AND plan_end_date IS NOT NULL
       AND plan_start_date::date <= ?::date AND plan_end_date::date >= ?::date`,
    [projectId, to, from]
  )

  const overrideRows = await query<Record<string, unknown>>(
    `SELECT user_id, work_date, actual_work_hours, override_hours, version FROM ${PUDW} WHERE project_id = ? AND work_date BETWEEN ?::date AND ?::date`,
    [projectId, from, to]
  )

  const cellMap = new Map<string, WorkloadDay>()
  const assigneeIds = new Set<string>()
  const memberIds = new Set(members.map(m => m.userId))

  const cellKey = (uid: string, dateIso: string) => `${uid}|${dateIso}`

  const ensureCell = (uid: string, dateIso: string): WorkloadDay => {
    const k = cellKey(uid, dateIso)
    let c = cellMap.get(k)
    if (!c) {
      c = { userId: uid, date: dateIso, derivedHours: 0, actualWorkHours: null, overrideHours: null, taskCount: 0, taskIds: [] }
      cellMap.set(k, c)
    }
    return c
  }

  for (const r of taskRows ?? []) {
    const uid = String(r.assignee_user_id ?? '')
    if (!uid) continue
    assigneeIds.add(uid)
    const taskId = String(r.id)
    const taskStartRaw = r.plan_start_date instanceof Date ? r.plan_start_date : new Date(String(r.plan_start_date ?? ''))
    const taskEndRaw = r.plan_end_date instanceof Date ? r.plan_end_date : new Date(String(r.plan_end_date ?? ''))
    if (Number.isNaN(taskStartRaw.getTime()) || Number.isNaN(taskEndRaw.getTime())) continue
    const taskStart = new Date(taskStartRaw.getFullYear(), taskStartRaw.getMonth(), taskStartRaw.getDate())
    const taskEnd = new Date(taskEndRaw.getFullYear(), taskEndRaw.getMonth(), taskEndRaw.getDate())
    if (taskEnd.getTime() < taskStart.getTime()) continue

    const totalWorkingDays = countWorkingDays(taskStart, taskEnd, nonWorkingDates)
    /** Tasks chưa có cột est_md trong schema hiện tại — derived = 0; UI vẫn hiển thị task_count và override. */
    const estMd = 0
    const perDay = totalWorkingDays > 0 && estMd > 0 ? (estMd * hoursPerDay) / totalWorkingDays : 0

    const visibleStart = taskStart.getTime() > fromD.getTime() ? taskStart : fromD
    const visibleEnd = taskEnd.getTime() < toD.getTime() ? taskEnd : toD
    let d = new Date(visibleStart.getFullYear(), visibleStart.getMonth(), visibleStart.getDate())
    const last = new Date(visibleEnd.getFullYear(), visibleEnd.getMonth(), visibleEnd.getDate())
    while (d.getTime() <= last.getTime()) {
      const iso = toIsoDateLocal(d)
      const isWorking = !isWeekend(d) && !nonWorkingDates.has(iso)
      if (isWorking) {
        const cell = ensureCell(uid, iso)
        cell.derivedHours += perDay
        cell.taskCount += 1
        if (!cell.taskIds.includes(taskId)) cell.taskIds.push(taskId)
      }
      d = addDaysLocal(d, 1)
    }
  }

  for (const r of overrideRows ?? []) {
    const uid = String(r.user_id ?? '')
    if (!uid) continue
    const dateIso = (r.work_date instanceof Date ? toIsoDateLocal(r.work_date) : String(r.work_date ?? '')).slice(0, 10)
    const cell = ensureCell(uid, dateIso)
    const ah = r.actual_work_hours
    cell.actualWorkHours = ah == null || ah === '' ? null : Number(ah)
    const oh = r.override_hours
    cell.overrideHours = oh == null || oh === '' ? null : Number(oh)
  }

  const extraAssigneeIds: string[] = []
  for (const uid of assigneeIds) {
    if (!memberIds.has(uid)) extraAssigneeIds.push(uid)
  }
  const extraUsers = await fetchAssigneeFallbackUsers(extraAssigneeIds)

  const users = [...members, ...extraUsers].sort((a, b) => {
    const roleRank: Record<string, number> = { pm: 0, pl: 1, dev: 2 }
    const ra = roleRank[a.role] ?? 9
    const rb = roleRank[b.role] ?? 9
    if (ra !== rb) return ra - rb
    return (a.name || a.userCode || '').localeCompare(b.name || b.userCode || '', undefined, { sensitivity: 'base' })
  })

  const isAdmin = (sessionRole || '').toLowerCase() === 'admin' || (await isAppAdmin(sessionUserId))
  let canEditAll = isAdmin
  if (!canEditAll) {
    const [pl, pm] = await Promise.all([hasRole(sessionUserId, projectId, 'pl'), hasRole(sessionUserId, projectId, 'pm')])
    canEditAll = pl || pm
  }

  return {
    users,
    days: [...cellMap.values()],
    hoursPerDay,
    nonWorkingDates: [...nonWorkingDates].sort(),
    canEditAll,
    selfUserId: sessionUserId,
  }
}

/** Kiểm tra permission write theo plan: admin / PM / PL → all; dev → chỉ chính mình. */
async function canWriteWorkload(args: { sessionUserId: string; sessionRole: string; projectId: string; targetUserId: string }): Promise<boolean> {
  const role = (args.sessionRole || '').toLowerCase()
  if (role === 'admin') return true
  if (await isAppAdmin(args.sessionUserId)) return true
  const [isPl, isPm] = await Promise.all([hasRole(args.sessionUserId, args.projectId, 'pl'), hasRole(args.sessionUserId, args.projectId, 'pm')])
  if (isPl || isPm) return true
  return args.sessionUserId === args.targetUserId
}

/**
 * Upsert override hours cho 1 ô (project, user, date).
 *
 * - overrideHours === null & note rỗng: xóa hàng (clear override).
 * - Có version: optimistic check; nếu mismatch → throw VERSION_CONFLICT.
 */
export async function upsertWorkloadOverride(
  input: WorkloadOverrideInput,
  actorUserId: string,
  sessionRole: string
): Promise<{ overrideHours: number | null; note: string | null; version: number; deleted: boolean }> {
  const projectId = (input.projectId || '').trim()
  const userId = (input.userId || '').trim()
  const workDate = (input.workDate || '').slice(0, 10)
  if (!projectId || !userId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    throw new Error('Invalid workload override input')
  }

  const can = await canWriteWorkload({ sessionUserId: actorUserId, sessionRole, projectId, targetUserId: userId })
  if (!can) {
    const e = new Error('Bạn chỉ có quyền sửa workload của chính mình')
    ;(e as Error & { code: string }).code = 'FORBIDDEN'
    throw e
  }

  const noteIn = input.note != null && String(input.note).trim() !== '' ? String(input.note) : null
  const oh = input.overrideHours
  const ohNorm = oh == null || (typeof oh === 'number' && Number.isNaN(oh)) ? null : Number(oh)

  if (ohNorm === null && noteIn === null) {
    const sel = await query<Record<string, unknown>>(
      `SELECT id, version, actual_work_hours FROM ${PUDW} WHERE project_id = ? AND user_id = ? AND work_date = ? LIMIT 1`,
      [projectId, userId, workDate]
    )
    const cur = sel?.[0]
    if (!cur) return { overrideHours: null, note: null, version: 0, deleted: true }
    if (input.version !== undefined && Number(cur.version) !== input.version) {
      const e = new Error('Workload override was modified by another user')
      ;(e as Error & { code: string }).code = 'VERSION_CONFLICT'
      throw e
    }
    const aw = cur.actual_work_hours
    const hasActual = aw != null && aw !== '' && Number.isFinite(Number(aw))
    if (hasActual) {
      const nextVer = Number(cur.version) + 1
      await query(`UPDATE ${PUDW} SET override_hours = NULL, note = NULL, version = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`, [
        nextVer,
        actorUserId,
        cur.id as string,
      ])
      return { overrideHours: null, note: null, version: nextVer, deleted: false }
    }
    await query(`DELETE FROM ${PUDW} WHERE id = ?`, [cur.id as string])
    return { overrideHours: null, note: null, version: 0, deleted: true }
  }

  const sel = await query<Record<string, unknown>>(`SELECT id, version FROM ${PUDW} WHERE project_id = ? AND user_id = ? AND work_date = ? LIMIT 1`, [
    projectId,
    userId,
    workDate,
  ])
  const cur = sel?.[0]
  if (!cur) {
    const id = randomUuidV7()
    await query(
      `INSERT INTO ${PUDW} (id, project_id, user_id, work_date, actual_work_hours, override_hours, note, version, created_by, updated_by) VALUES (?, ?, ?, ?, NULL, ?, ?, 1, ?, ?)`,
      [id, projectId, userId, workDate, ohNorm, noteIn, actorUserId, actorUserId]
    )
    return { overrideHours: ohNorm, note: noteIn, version: 1, deleted: false }
  }

  if (input.version !== undefined && Number(cur.version) !== input.version) {
    const e = new Error('Workload override was modified by another user')
    ;(e as Error & { code: string }).code = 'VERSION_CONFLICT'
    throw e
  }
  const nextVer = Number(cur.version) + 1
  await query(`UPDATE ${PUDW} SET override_hours = ?, note = ?, version = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`, [
    ohNorm,
    noteIn,
    nextVer,
    actorUserId,
    cur.id as string,
  ])
  return { overrideHours: ohNorm, note: noteIn, version: nextVer, deleted: false }
}

export async function deleteWorkloadOverride(
  input: { projectId: string; userId: string; workDate: string; version?: number },
  actorUserId: string,
  sessionRole: string
): Promise<{ deleted: boolean }> {
  const projectId = (input.projectId || '').trim()
  const userId = (input.userId || '').trim()
  const workDate = (input.workDate || '').slice(0, 10)
  if (!projectId || !userId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    throw new Error('Invalid workload override input')
  }
  const can = await canWriteWorkload({ sessionUserId: actorUserId, sessionRole, projectId, targetUserId: userId })
  if (!can) {
    const e = new Error('Bạn chỉ có quyền sửa workload của chính mình')
    ;(e as Error & { code: string }).code = 'FORBIDDEN'
    throw e
  }
  try {
    const sel = await query<Record<string, unknown>>(
      `SELECT id, version, actual_work_hours, override_hours, note FROM ${PUDW} WHERE project_id = ? AND user_id = ? AND work_date = ? LIMIT 1`,
      [projectId, userId, workDate]
    )
    const cur = sel?.[0]
    if (!cur) return { deleted: false }
    if (input.version !== undefined && Number(cur.version) !== input.version) {
      const e = new Error('Workload override was modified by another user')
      ;(e as Error & { code: string }).code = 'VERSION_CONFLICT'
      throw e
    }
    const aw = cur.actual_work_hours
    const hasActual = aw != null && aw !== '' && Number.isFinite(Number(aw))
    if (hasActual) {
      const nextVer = Number(cur.version) + 1
      await query(`UPDATE ${PUDW} SET override_hours = NULL, note = NULL, version = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`, [
        nextVer,
        actorUserId,
        cur.id as string,
      ])
      return { deleted: false }
    }
    await query(`DELETE FROM ${PUDW} WHERE id = ?`, [cur.id as string])
    return { deleted: true }
  } catch (e) {
    l.error('deleteWorkloadOverride failed', e)
    throw e
  }
}

function clampWorkHours(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(24, Math.round(n * 100) / 100)
}

/**
 * Ghi `actual_work_hours` (daily report) trong transaction. Không sửa `override_hours` / `note`.
 * `actorUserId` phải trùng `userId` hoặc app admin.
 */
export async function upsertActualWorkHoursInTransaction(
  txQuery: TransactionQuery,
  input: { projectId: string; userId: string; workDate: string; actualWorkHours: number | null },
  actorUserId: string
): Promise<void> {
  const projectId = (input.projectId || '').trim()
  const userId = (input.userId || '').trim()
  const workDate = (input.workDate || '').slice(0, 10)
  if (!projectId || !userId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    throw new Error('Invalid actual work hours input')
  }
  if (actorUserId !== userId && !(await isAppAdmin(actorUserId))) {
    const e = new Error('Forbidden')
    ;(e as Error & { code: string }).code = 'FORBIDDEN'
    throw e
  }

  const raw = input.actualWorkHours
  const num = raw == null || (typeof raw === 'number' && Number.isNaN(raw)) ? null : clampWorkHours(Number(raw))

  if (num === null) {
    const sel = (await txQuery(`SELECT id FROM ${PUDW} WHERE project_id = ? AND user_id = ? AND work_date = ?::date LIMIT 1`, [projectId, userId, workDate])) as {
      id: string
    }[]
    const cur = Array.isArray(sel) && sel[0] ? sel[0] : null
    if (!cur) return
    await txQuery(`UPDATE ${PUDW} SET actual_work_hours = NULL, version = version + 1, updated_by = ?, updated_at = NOW() WHERE id = ?`, [
      actorUserId,
      cur.id,
    ])
    await txQuery(
      `DELETE FROM ${PUDW} WHERE id = ? AND override_hours IS NULL AND actual_work_hours IS NULL AND (note IS NULL OR BTRIM(COALESCE(note, '')) = '')`,
      [cur.id]
    )
    return
  }

  const id = randomUuidV7()
  await txQuery(
    `INSERT INTO ${PUDW} (id, project_id, user_id, work_date, actual_work_hours, override_hours, note, version, created_by, updated_by)
     VALUES (?, ?, ?, ?::date, ?, NULL, NULL, 1, ?, ?)
     ON CONFLICT (project_id, user_id, work_date)
     DO UPDATE SET
       actual_work_hours = EXCLUDED.actual_work_hours,
       version = ${PUDW}.version + 1,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [id, projectId, userId, workDate, num, actorUserId, actorUserId]
  )
}
