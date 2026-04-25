import path from 'node:path'
import { randomUuidV7 } from 'shared/randomUuidV7'
import { query, withTransaction } from './db'
import { createTasksFromCsv, createUsersFromCsv, parseCSVRows } from './importCsv'
import { getNextTicketId } from './ticketSequence'

function throwVersionConflict(): never {
  const e = new Error('Task not found or was modified by another user')
    ; (e as Error & { code: string }).code = 'VERSION_CONFLICT'
  throw e
}

/** ISO-8601 từ renderer (vd. …T…Z) không được MySQL DATETIME chấp nhận; chuẩn hóa thành YYYY-MM-DD HH:mm:ss (UTC). */
function toMysqlDateTime(value: string | null | undefined): string | null {
  if (value == null || value === '') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

export type TaskStatus = 'new' | 'in_progress' | 'in_review' | 'fixed' | 'cancelled' | 'done' | 'feedback'
export type TaskType = 'bug' | 'feature' | 'support' | 'task'
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'

export interface Task {
  id: string
  title: string
  description: string
  assigneeUserId: string | null
  status: TaskStatus
  progress: number
  priority: TaskPriority
  type?: TaskType
  source?: string
  ticketId?: string
  project?: string
  projectId?: string
  planStartDate: string
  planEndDate: string
  actualStartDate: string
  actualEndDate: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
  createdByName: string
  createdByAvatarUrl: string | null
  updatedByName: string
  updatedByAvatarUrl: string | null
  parentId?: string | null
  version?: number
}

export interface CreateTaskInput {
  title: string
  description?: string
  assigneeUserId?: string | null
  status?: TaskStatus
  progress?: number
  priority?: TaskPriority
  type?: TaskType
  source?: string
  ticketId?: string
  project?: string
  projectId?: string
  planStartDate?: string
  planEndDate?: string
  actualStartDate?: string
  actualEndDate?: string
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}

export type UpdateTaskInput = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'assigneeUserId'
    | 'status'
    | 'progress'
    | 'priority'
    | 'type'
    | 'source'
    | 'ticketId'
    | 'projectId'
    | 'planStartDate'
    | 'planEndDate'
    | 'actualStartDate'
    | 'actualEndDate'
    | 'parentId'
    | 'version'
  >
>

export interface User {
  id: string
  userCode: string
  name: string
  email: string
  avatarUrl?: string | null
  receiveCommitNotification: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateUserInput {
  userCode: string
  name: string
  email?: string
}

export interface Project {
  id: string
  name: string
  createdAt: string
  version?: number
}

export type UserRole = 'dev' | 'pl' | 'pm'

export interface UserProjectRole {
  id: string
  userId: string
  projectId: string | null
  role: UserRole
  createdAt: string
  updatedAt: string
}

export interface MasterItem {
  code: string
  name: string
  sort_order?: number
  color?: string
  is_active?: boolean
}

const TASK_SELECT_JOIN =
  'SELECT t.*, p.name as project_name, u.name as assignee_name, ' +
  'cu.name AS created_by_display_name, cu.avatar_data AS created_by_avatar_data, ' +
  'uu.name AS updated_by_display_name, uu.avatar_data AS updated_by_avatar_data ' +
  'FROM tasks t LEFT JOIN projects p ON t.project_id = p.id ' +
  'LEFT JOIN users u ON t.assignee_user_id = u.id ' +
  'LEFT JOIN users cu ON t.created_by = cu.id ' +
  'LEFT JOIN users uu ON t.updated_by = uu.id'

function avatarDataToUrl(data: string | null | undefined): string | null {
  if (!data || typeof data !== 'string' || data.length === 0) return null
  return data.startsWith('data:') ? data : `data:image/png;base64,${data}`
}

function mapTask(row: any): Task {
  const createdBy = row.created_by != null ? String(row.created_by) : ''
  const updatedBy = row.updated_by != null ? String(row.updated_by) : ''
  const createdByDisplay = row.created_by_display_name != null ? String(row.created_by_display_name) : ''
  const updatedByDisplay = row.updated_by_display_name != null ? String(row.updated_by_display_name) : ''
  return {
    id: row.id,
    title: row.title ?? '',
    description: row.description ?? '',
    assigneeUserId: row.assignee_user_id ?? null,
    status: row.status || 'new',
    progress: row.progress ?? 0,
    priority: row.priority || 'medium',
    type: row.type || 'bug',
    source: row.source || 'in_app',
    ticketId: row.ticket_id ?? '',
    project: row.project_name ?? '',
    projectId: row.project_id,
    planStartDate: row.plan_start_date ? new Date(row.plan_start_date).toISOString() : '',
    planEndDate: row.plan_end_date ? new Date(row.plan_end_date).toISOString() : '',
    actualStartDate: row.actual_start_date ? new Date(row.actual_start_date).toISOString() : '',
    actualEndDate: row.actual_end_date ? new Date(row.actual_end_date).toISOString() : '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
    createdBy,
    updatedBy,
    createdByName: createdByDisplay,
    createdByAvatarUrl: avatarDataToUrl(row.created_by_avatar_data),
    updatedByName: updatedByDisplay,
    updatedByAvatarUrl: avatarDataToUrl(row.updated_by_avatar_data),
    parentId: row.parent_id ?? null,
    version: row.version ?? 1,
  }
}

export async function getTask(id: string): Promise<Task | null> {
  const rows = await query<any[]>(`${TASK_SELECT_JOIN} WHERE t.id = ?`, [id])
  const row = rows?.[0]
  return row ? mapTask(row) : null
}

/** Lấy danh sách user_id có role PL trong project (dùng cho notification). */
export async function getProjectPlUserIds(projectId: string): Promise<string[]> {
  const rows = await query<any[]>('SELECT user_id FROM user_project_roles WHERE project_id = ? AND role = ?', [projectId, 'pl'])
  return (rows ?? []).map(r => r.user_id)
}

/** Lấy emails của PL có receive_commit_notification = true và email không rỗng. */
export async function getPlEmailsForProject(projectId: string): Promise<string[]> {
  const rows = await query<any[]>(
    `SELECT u.email FROM users u
     JOIN user_project_roles upr ON upr.user_id = u.id
     WHERE upr.project_id = ? AND upr.role = 'pl'
       AND COALESCE(u.receive_commit_notification, 1) = 1
       AND u.email IS NOT NULL AND TRIM(u.email) != ''`,
    [projectId]
  )
  return (rows ?? []).map(r => String(r.email).trim()).filter(Boolean)
}

/** Kiểm tra user có role pl trong ít nhất 1 project. */
export async function hasPlRole(userId: string): Promise<boolean> {
  const rows = await query<any[]>('SELECT 1 FROM user_project_roles WHERE user_id = ? AND role = ? LIMIT 1', [userId, 'pl'])
  return (rows?.length ?? 0) > 0
}

/** Phần Developer / Project Lead trong Today's Reminders theo user_project_roles. */
export async function getReminderSectionVisibility(userId: string): Promise<{ showDev: boolean; showPl: boolean }> {
  if (await isAppAdmin(userId)) return { showDev: true, showPl: true }
  const rows = await query<{ role: string }[]>(
    `SELECT DISTINCT role FROM user_project_roles WHERE user_id = ? AND role IN ('dev', 'pl')`,
    [userId]
  )
  const set = new Set((rows ?? []).map(r => r.role))
  const hasDev = set.has('dev')
  const hasPl = set.has('pl')
  if (hasDev && hasPl) return { showDev: true, showPl: true }
  if (hasDev) return { showDev: true, showPl: false }
  if (hasPl) return { showDev: false, showPl: true }
  return { showDev: true, showPl: true }
}

function normalizePath(p: string): string {
  return path.normalize(path.resolve(p))
}

export interface UserProjectSourceFolderMapping {
  projectId: string
  sourceFolderPath: string
}

/** Validate path chưa dùng cho project khác; INSERT hoặc UPDATE. Trả về { success, error? }. */
export async function upsertUserProjectSourceFolder(
  userId: string,
  projectId: string,
  sourceFolderPath: string,
  sourceFolderName?: string
): Promise<{ success: boolean; error?: string }> {
  const normalized = normalizePath(sourceFolderPath)
  const existing = await query<any[]>('SELECT project_id FROM user_project_source_folder WHERE user_id = ? AND source_folder_path = ?', [userId, normalized])
  if (existing?.length && existing[0].project_id !== projectId) {
    const linkedProjectId = existing[0].project_id
    const projectRows = await query<any[]>(`SELECT name FROM projects WHERE id = ?`, [linkedProjectId])
    const projectName = projectRows?.[0]?.name
    const detail = projectName ? ` (project: ${projectName})` : ''
    return { success: false, error: `Đường dẫn này đã được liên kết với project khác.${detail}` }
  }
  const existingRow = await query<any[]>('SELECT id FROM user_project_source_folder WHERE user_id = ? AND project_id = ? AND source_folder_path = ?', [
    userId,
    projectId,
    normalized,
  ])
  try {
    if (existingRow?.length) {
      if (sourceFolderName != null) {
        await query('UPDATE user_project_source_folder SET source_folder_name = ?, updated_at = NOW() WHERE user_id = ? AND project_id = ? AND source_folder_path = ?', [
          sourceFolderName,
          userId,
          projectId,
          normalized,
        ])
      }
      return { success: true }
    }
    const id = randomUuidV7()
    await query('INSERT INTO user_project_source_folder (id, user_id, project_id, source_folder_path, source_folder_name) VALUES (?, ?, ?, ?, ?)', [
      id,
      userId,
      projectId,
      normalized,
      sourceFolderName ?? null,
    ])
    return { success: true }
  } catch (err: unknown) {
    const e = err as { code?: string; errno?: number }
    if (e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062) {
      return { success: false, error: 'Đường dẫn này đã được liên kết với project khác. 2' }
    }
    throw err
  }
}

/** Trả về projectId hoặc null. Chuẩn hóa path trước khi so sánh. */
export async function getProjectIdByUserAndPath(userId: string, sourceFolderPath: string): Promise<string | null> {
  const normalized = normalizePath(sourceFolderPath)
  const rows = await query<any[]>('SELECT project_id FROM user_project_source_folder WHERE user_id = ? AND source_folder_path = ?', [userId, normalized])
  return rows?.[0]?.project_id ?? null
}

/** Trả về mappings của user. */
export async function getUserProjectSourceFolderMappings(userId: string): Promise<UserProjectSourceFolderMapping[]> {
  const rows = await query<any[]>('SELECT project_id, source_folder_path FROM user_project_source_folder WHERE user_id = ? ORDER BY source_folder_path', [userId])
  return (rows ?? []).map(r => ({ projectId: r.project_id, sourceFolderPath: r.source_folder_path }))
}

/** Xóa mapping khi xóa source folder. */
export async function deleteUserProjectSourceFolder(userId: string, sourceFolderPath: string): Promise<void> {
  const normalized = normalizePath(sourceFolderPath)
  await query('DELETE FROM user_project_source_folder WHERE user_id = ? AND source_folder_path = ?', [userId, normalized])
}

/** Trả về danh sách source folder của user cho project. */
export async function getSourceFoldersByProject(
  userId: string,
  projectId: string
): Promise<{ id: string; name: string; path: string }[]> {
  const rows = await query<any[]>(
    'SELECT id, source_folder_path, source_folder_name FROM user_project_source_folder WHERE user_id = ? AND project_id = ? ORDER BY source_folder_path',
    [userId, projectId]
  )
  return (rows ?? []).map(r => ({
    id: r.id,
    name: r.source_folder_name ?? r.source_folder_path,
    path: r.source_folder_path,
  }))
}

/** Trả về danh sách source folder hợp nhất (union theo path) của user cho nhiều project. */
export async function getSourceFoldersByProjects(
  userId: string,
  projectIds: string[]
): Promise<{ id: string; name: string; path: string }[]> {
  if (projectIds.length === 0) return []
  const placeholders = projectIds.map(() => '?').join(',')
  const rows = await query<any[]>(
    `SELECT id, source_folder_path, source_folder_name FROM user_project_source_folder
     WHERE user_id = ? AND project_id IN (${placeholders}) ORDER BY source_folder_path`,
    [userId, ...projectIds]
  )
  const byPath = new Map<string, { id: string; name: string; path: string }>()
  for (const r of rows ?? []) {
    const p = r.source_folder_path
    if (p && !byPath.has(p)) {
      byPath.set(p, {
        id: r.id,
        name: r.source_folder_name ?? r.source_folder_path,
        path: p,
      })
    }
  }
  return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path))
}

/** Projects mà user có role (user_project_roles) hoặc là app_admin. Admin: tất cả projects. */
export async function getProjectsForUser(userId: string): Promise<Project[]> {
  if (await isAppAdmin(userId)) {
    return getProjects()
  }
  const rows = await query<any[]>(
    `SELECT DISTINCT p.id, p.name, p.created_at, p.version
     FROM projects p
     JOIN user_project_roles upr ON upr.project_id = p.id
     WHERE upr.user_id = ?
     ORDER BY p.created_at DESC`,
    [userId]
  )
  return (rows ?? []).map(r => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    version: r.version ?? 1,
  }))
}

/** Phạm vi combobox Bảng xếp hạng: admin = mọi project; managed = chỉ project user làm PL/PM; dev = chỉ project user làm dev (khi không có PL/PM ở project nào). */
export type LeaderboardPickerScope = 'admin' | 'managed' | 'dev'

export async function getProjectsForLeaderboardPicker(userId: string): Promise<{
  scope: LeaderboardPickerScope
  projects: Project[]
}> {
  if (await isAppAdmin(userId)) {
    return { scope: 'admin', projects: await getProjects() }
  }

  const rows = await query<{ project_id: string; role: string }[]>(
    `SELECT upr.project_id, upr.role
     FROM user_project_roles upr
     WHERE upr.user_id = ? AND upr.project_id IS NOT NULL`,
    [userId]
  )

  const rolesByProject = new Map<string, Set<string>>()
  for (const r of rows ?? []) {
    const pid = r.project_id
    if (!pid) continue
    let set = rolesByProject.get(pid)
    if (!set) {
      set = new Set()
      rolesByProject.set(pid, set)
    }
    set.add(r.role)
  }

  let targetIds: string[]
  let scope: LeaderboardPickerScope

  const managedIds = [...rolesByProject.entries()]
    .filter(([, roles]) => [...roles].some(role => role === 'pl' || role === 'pm'))
    .map(([pid]) => pid)

  if (managedIds.length > 0) {
    scope = 'managed'
    targetIds = managedIds
  } else {
    scope = 'dev'
    targetIds = [...rolesByProject.entries()]
      .filter(([, roles]) => roles.has('dev'))
      .map(([pid]) => pid)
  }

  if (targetIds.length === 0) {
    return { scope, projects: [] }
  }

  const placeholders = targetIds.map(() => '?').join(',')
  const prows = await query<any[]>(
    `SELECT id, name, created_at, version FROM projects WHERE id IN (${placeholders}) ORDER BY created_at DESC`,
    targetIds
  )
  const projects = (prows ?? []).map(r => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    version: r.version ?? 1,
  }))
  return { scope, projects }
}

/** Kiểm tra user có quyền xóa task (chỉ pl hoặc pm của project) */
export async function canUserDeleteTask(userId: string, projectId: string): Promise<boolean> {
  const [hasPl, hasPm] = await Promise.all([hasRole(userId, projectId, 'pl'), hasRole(userId, projectId, 'pm')])
  return hasPl || hasPm
}

/** Kiểm tra user có quyền sửa task (pl/pm của project, hoặc dev là assignee). Dùng hasRole theo project, không dùng session.role. */
export async function canUserUpdateTask(userId: string, projectId: string, assigneeUserId: string | null, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true
  const [hasPl, hasPm, hasDev] = await Promise.all([hasRole(userId, projectId, 'pl'), hasRole(userId, projectId, 'pm'), hasRole(userId, projectId, 'dev')])
  if (hasPl || hasPm) return true
  if (hasDev && assigneeUserId === userId) return true
  return false
}

/** Chỉ admin hoặc PL/PM của project mới được update/delete task đã done. Dùng hasRole theo project. */
export async function canUserUpdateOrDeleteDoneTask(userId: string, projectId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true
  const [hasPl, hasPm] = await Promise.all([hasRole(userId, projectId, 'pl'), hasRole(userId, projectId, 'pm')])
  return hasPl || hasPm
}

export async function getTasks(projectId?: string): Promise<Task[]> {
  let sql = `${TASK_SELECT_JOIN} WHERE 1=1`
  const params: unknown[] = []
  if (projectId) {
    sql += ' AND t.project_id = ?'
    params.push(projectId)
  }
  sql += ' ORDER BY t.created_at DESC'
  const rows = await query<any[]>(sql, params)
  return (rows || []).map(mapTask)
}

/** Project được xem trong Task UI: null = toàn bộ (admin). */
export async function getTaskListVisibleProjectIds(userId: string, appRole: string): Promise<string[] | null> {
  if (await isAppAdmin(userId)) return null
  const r = (appRole || '').toLowerCase()
  if (r === 'admin') return null
  if (r === 'pl' || r === 'pm') {
    const rows = await query<{ project_id: string }[]>(
      `SELECT DISTINCT project_id FROM user_project_roles WHERE user_id = ? AND role IN ('pl','pm')`,
      [userId]
    )
    return (rows ?? []).map(x => x.project_id).filter(Boolean)
  }
  const rows = await query<{ project_id: string }[]>(
    `SELECT DISTINCT project_id FROM user_project_roles WHERE user_id = ? AND role = 'dev'`,
    [userId]
  )
  return (rows ?? []).map(x => x.project_id).filter(Boolean)
}

export async function getProjectsForTaskManagement(userId: string, appRole: string): Promise<Project[]> {
  const visible = await getTaskListVisibleProjectIds(userId, appRole)
  if (visible === null) return getProjects()
  if (visible.length === 0) return []
  const ph = visible.map(() => '?').join(',')
  const rows = await query<any[]>(
    `SELECT id, name, created_at, version FROM projects WHERE id IN (${ph}) ORDER BY created_at DESC`,
    visible
  )
  return (rows ?? []).map(r => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    version: r.version ?? 1,
  }))
}

export async function getTasksForSession(userId: string, appRole: string, projectId?: string): Promise<Task[]> {
  const visible = await getTaskListVisibleProjectIds(userId, appRole)
  let sql = `${TASK_SELECT_JOIN} WHERE 1=1`
  const params: unknown[] = []
  if (visible !== null) {
    if (visible.length === 0) return []
    if (projectId) {
      if (!visible.includes(projectId)) return []
      sql += ' AND t.project_id = ?'
      params.push(projectId)
    } else {
      const ph = visible.map(() => '?').join(',')
      sql += ` AND t.project_id IN (${ph})`
      params.push(...visible)
    }
  } else if (projectId) {
    sql += ' AND t.project_id = ?'
    params.push(projectId)
  }
  sql += ' ORDER BY t.created_at DESC'
  const rows = await query<any[]>(sql, params)
  return (rows || []).map(mapTask)
}

/** Một dòng tối giản cho UI picker (không map full Task). */
export type TaskPickerListItem = {
  id: string
  title: string
  ticketId: string
  projectId: string | null
}

export type ListTasksForPickerParams = {
  offset: number
  limit: number
  search?: string
  /** link: mọi task trong scope session; subtask: thêm lọc project như form gán con */
  pickerMode: 'link' | 'subtask'
  /** Khi pickerMode=subtask: project của task cha (null = chỉ task không project) */
  contextProjectId?: string | null
  excludeTaskIds: string[]
}

const MAX_PICKER_PAGE = 100

/**
 * Danh sách task phân trang cho combobox (scroll load thêm).
 * Cùng quy tắc project visibility với getTasksForSession (không lọc projectId đơn — toàn bộ project được phép).
 */
export async function listTasksForPickerPage(
  userId: string,
  appRole: string,
  params: ListTasksForPickerParams
): Promise<{ items: TaskPickerListItem[]; hasMore: boolean }> {
  const offN = Number(params.offset)
  const limN = Number(params.limit)
  const offset = Number.isFinite(offN) ? Math.max(0, Math.floor(offN)) : 0
  const limit = Number.isFinite(limN) ? Math.min(MAX_PICKER_PAGE, Math.max(1, Math.floor(limN))) : Math.min(MAX_PICKER_PAGE, 80)
  const excludeIds = [...new Set((params.excludeTaskIds || []).filter(Boolean))]
  const searchRaw = (params.search || '').trim().slice(0, 200)
  const visible = await getTaskListVisibleProjectIds(userId, appRole)
  let sql = `${TASK_SELECT_JOIN} WHERE 1=1`
  const sqlParams: unknown[] = []

  if (visible !== null) {
    if (visible.length === 0) return { items: [], hasMore: false }
    const ph = visible.map(() => '?').join(',')
    sql += ` AND t.project_id IN (${ph})`
    sqlParams.push(...visible)
  }

  if (params.pickerMode === 'subtask') {
    const cp = params.contextProjectId
    if (cp) {
      sql += ' AND (t.project_id IS NULL OR t.project_id = ?)'
      sqlParams.push(cp)
    } else {
      sql += ' AND t.project_id IS NULL'
    }
  }

  if (excludeIds.length > 0) {
    const ph = excludeIds.map(() => '?').join(',')
    sql += ` AND t.id NOT IN (${ph})`
    sqlParams.push(...excludeIds)
  }

  if (searchRaw) {
    const safe = searchRaw.replace(/[%_\\]/g, ' ').trim()
    if (safe) {
      const like = `%${safe}%`
      sql += ' AND (t.title LIKE ? OR t.ticket_id LIKE ? OR CAST(t.id AS CHAR) LIKE ?)'
      sqlParams.push(like, like, like)
    }
  }

  // Không bind LIMIT/OFFSET: mysql2 prepared statement + LIMIT ? OFFSET ? dễ gây "Incorrect arguments to mysqld_stmt_execute" trên một số server.
  const fetchCap = limit + 1
  sql += ` ORDER BY t.created_at DESC LIMIT ${fetchCap} OFFSET ${offset}`

  const rows = await query<any[]>(sql, sqlParams)
  const raw = rows ?? []
  const hasMore = raw.length > limit
  const slice = hasMore ? raw.slice(0, limit) : raw
  const items: TaskPickerListItem[] = slice.map(r => ({
    id: r.id,
    title: r.title ?? '',
    ticketId: r.ticket_id ?? '',
    projectId: r.project_id ?? null,
  }))
  return { items, hasMore }
}

/** FROM + JOIN cho Task Management (lọc/search; không gồm favorite). */
const MANAGEMENT_TASKS_FROM =
  'FROM tasks t LEFT JOIN projects p ON t.project_id = p.id LEFT JOIN users u ON t.assignee_user_id = u.id ' +
  'LEFT JOIN users cu ON t.created_by = cu.id LEFT JOIN users uu ON t.updated_by = uu.id'

const MAX_MANAGEMENT_PAGE_SIZE = 100

const MANAGEMENT_CHART_MAX_ROWS = 50_000

export type TaskManagementOmitFacet = 'status' | 'priority' | 'type' | 'assignee' | 'project'

export type TaskManagementListParams = {
  page: number
  limit: number
  search?: string
  statusCodes?: string[]
  assigneeUserIds?: string[]
  typeCodes?: string[]
  priorityCodes?: string[]
  projectIds?: string[]
  /** `from` / `to`: chuỗi ngày YYYY-MM-DD */
  dateRange?: { from: string; to?: string }
  sortColumn?: string | null
  sortDirection?: 'asc' | 'desc'
}

export type TaskManagementFacetCounts = {
  status: Record<string, number>
  priority: Record<string, number>
  type: Record<string, number>
  assignee: Record<string, number>
  project: Record<string, number>
}

/** Dữ liệu tối thiểu cho tab Chart (khớp ChartTask phía renderer). */
export type TaskManagementChartRow = {
  id: string
  status: string
  progress: number
  priority: string
  assigneeUserId: string | null
  planStartDate: string
  planEndDate: string
  actualEndDate: string
  actualStartDate: string
  createdAt: string
  updatedAt: string
}

export type TaskManagementScopeMeta = {
  hasUnassignedTask: boolean
  assigneeIdsOnTasks: string[]
}

export type TaskManagementListResponse = {
  tasks: Task[]
  total: number
  /** null khi client chỉ cần trang mới (sort/page), không chạy GROUP BY facet */
  facets: TaskManagementFacetCounts | null
}

function normalizeManagementSearch(raw: string): string {
  return raw.trim().slice(0, 200).replace(/[%_\\]/g, ' ').trim()
}

/**
 * Điều kiện WHERE cho Task Management (visibility + filter UI).
 * `omitFacet`: bỏ một chiều filter để đếm facet trong popover.
 */
function buildManagementWhereParts(
  visible: string[] | null,
  p: TaskManagementListParams,
  omitFacet: TaskManagementOmitFacet | undefined
): { parts: string[]; params: unknown[]; isEmptyScope: boolean } {
  const parts: string[] = []
  const params: unknown[] = []

  if (visible !== null) {
    if (visible.length === 0) return { parts: [], params: [], isEmptyScope: true }
    const ph = visible.map(() => '?').join(',')
    parts.push(`t.project_id IN (${ph})`)
    params.push(...visible)
  }

  const searchSafe = normalizeManagementSearch(p.search || '')
  if (searchSafe) {
    const like = `%${searchSafe}%`
    parts.push(
      '(t.title LIKE ? OR t.description LIKE ? OR t.ticket_id LIKE ? OR CAST(t.assignee_user_id AS CHAR) LIKE ? OR u.name LIKE ? OR p.name LIKE ?)'
    )
    params.push(like, like, like, like, like, like)
  }

  const st = p.statusCodes?.filter(Boolean) ?? []
  if (omitFacet !== 'status' && st.length > 0) {
    const ph = st.map(() => '?').join(',')
    parts.push(`t.status IN (${ph})`)
    params.push(...st)
  }

  const assignees = p.assigneeUserIds ?? []
  if (omitFacet !== 'assignee' && assignees.length > 0) {
    const hasEmpty = assignees.includes('_empty')
    const ids = assignees.filter((x): x is string => Boolean(x) && x !== '_empty')
    const sub: string[] = []
    if (hasEmpty) sub.push('t.assignee_user_id IS NULL')
    if (ids.length > 0) {
      const ph = ids.map(() => '?').join(',')
      sub.push(`t.assignee_user_id IN (${ph})`)
      params.push(...ids)
    }
    if (sub.length > 0) parts.push(`(${sub.join(' OR ')})`)
  }

  const types = p.typeCodes?.filter(Boolean) ?? []
  if (omitFacet !== 'type' && types.length > 0) {
    const ph = types.map(() => '?').join(',')
    parts.push(`COALESCE(t.type, 'bug') IN (${ph})`)
    params.push(...types)
  }

  const prios = p.priorityCodes?.filter(Boolean) ?? []
  if (omitFacet !== 'priority' && prios.length > 0) {
    const ph = prios.map(() => '?').join(',')
    parts.push(`COALESCE(t.priority, 'medium') IN (${ph})`)
    params.push(...prios)
  }

  const projs = p.projectIds ?? []
  if (omitFacet !== 'project' && projs.length > 0) {
    const hasEmpty = projs.includes('')
    const ids = projs.filter(Boolean)
    const sub: string[] = []
    if (hasEmpty) sub.push('t.project_id IS NULL')
    if (ids.length > 0) {
      const ph = ids.map(() => '?').join(',')
      sub.push(`t.project_id IN (${ph})`)
      params.push(...ids)
    }
    if (sub.length > 0) parts.push(`(${sub.join(' OR ')})`)
  }

  const dr = p.dateRange
  if (dr?.from) {
    const fromKey = dr.from.slice(0, 10)
    const toKey = (dr.to ?? dr.from).slice(0, 10)
    parts.push(
      `((t.actual_end_date IS NOT NULL AND DATE(t.actual_end_date) BETWEEN ? AND ?) OR ` +
        `(t.actual_end_date IS NULL AND DATE(COALESCE(t.updated_at, t.created_at)) BETWEEN ? AND ?))`,
    )
    params.push(fromKey, toKey, fromKey, toKey)
  }

  return { parts, params, isEmptyScope: false }
}

function managementWhereClause(parts: string[]): string {
  if (parts.length === 0) return '1=1'
  return parts.join(' AND ')
}

const MANAGEMENT_SORT_SQL: Record<string, string> = {
  type: "COALESCE(t.type, 'bug')",
  ticketId: 't.ticket_id',
  project: 'p.name',
  title: 't.title',
  assigneeUserId: 't.assignee_user_id',
  status: 't.status',
  priority: 't.priority',
  progress: 't.progress',
  planStartDate: 't.plan_start_date',
  planEndDate: 't.plan_end_date',
  actualStartDate: 't.actual_start_date',
  actualEndDate: 't.actual_end_date',
}

function getManagementOrderBySql(sortColumn: string | null | undefined, sortDirection: 'asc' | 'desc' | undefined): string {
  const favFirst = '(fav.id IS NOT NULL) DESC'
  const dir = sortDirection === 'desc' ? 'DESC' : 'ASC'
  const col = sortColumn && MANAGEMENT_SORT_SQL[sortColumn] ? MANAGEMENT_SORT_SQL[sortColumn] : null
  if (!col) return `${favFirst}, t.created_at DESC, t.id ASC`
  return `${favFirst}, ${col} ${dir}, t.id ASC`
}

function mapManagementChartRow(row: any): TaskManagementChartRow {
  return {
    id: row.id,
    status: row.status || 'new',
    progress: row.progress ?? 0,
    priority: row.priority || 'medium',
    assigneeUserId: row.assignee_user_id ?? null,
    planStartDate: row.plan_start_date ? new Date(row.plan_start_date).toISOString() : '',
    planEndDate: row.plan_end_date ? new Date(row.plan_end_date).toISOString() : '',
    actualEndDate: row.actual_end_date ? new Date(row.actual_end_date).toISOString() : '',
    actualStartDate: row.actual_start_date ? new Date(row.actual_start_date).toISOString() : '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
  }
}

async function managementBaseParams(
  userId: string,
  appRole: string,
  p: TaskManagementListParams,
  omitFacet: TaskManagementOmitFacet | undefined
): Promise<{ whereSql: string; params: unknown[]; isEmptyScope: boolean }> {
  const visible = await getTaskListVisibleProjectIds(userId, appRole)
  const { parts, params, isEmptyScope } = buildManagementWhereParts(visible, p, omitFacet)
  if (isEmptyScope) return { whereSql: '1=0', params: [], isEmptyScope: true }
  return { whereSql: managementWhereClause(parts), params, isEmptyScope: false }
}

async function runFacetGroup(
  userId: string,
  appRole: string,
  p: TaskManagementListParams,
  omit: TaskManagementOmitFacet,
  groupExpr: string,
  keyAlias: string
): Promise<Record<string, number>> {
  const { whereSql, params, isEmptyScope } = await managementBaseParams(userId, appRole, p, omit)
  if (isEmptyScope) return {}
  const sql = `SELECT ${groupExpr} as ${keyAlias}, COUNT(*) as c ${MANAGEMENT_TASKS_FROM} WHERE ${whereSql} GROUP BY ${groupExpr}`
  const rows = await query<Record<string, unknown>[]>(sql, params)
  const out: Record<string, number> = {}
  for (const r of rows ?? []) {
    let k = r[keyAlias] as string | null
    if (omit === 'assignee') {
      k = k == null || k === '' ? '_empty' : String(k)
    } else if (omit === 'project') {
      k = k == null || k === '' ? '' : String(k)
    } else {
      k = String(k ?? '')
    }
    out[k] = Number(r.c ?? 0)
  }
  return out
}

export async function getTaskManagementFacetCounts(
  userId: string,
  appRole: string,
  p: TaskManagementListParams
): Promise<TaskManagementFacetCounts> {
  const [status, priority, type, assignee, project] = await Promise.all([
    runFacetGroup(userId, appRole, p, 'status', 't.status', 'k'),
    runFacetGroup(userId, appRole, p, 'priority', "COALESCE(t.priority, 'medium')", 'k'),
    runFacetGroup(userId, appRole, p, 'type', "COALESCE(t.type, 'bug')", 'k'),
    runFacetGroup(userId, appRole, p, 'assignee', 't.assignee_user_id', 'k'),
    runFacetGroup(userId, appRole, p, 'project', 't.project_id', 'k'),
  ])
  return { status, priority, type, assignee, project }
}

export async function getManagementScopeMeta(userId: string, appRole: string): Promise<TaskManagementScopeMeta> {
  const visible = await getTaskListVisibleProjectIds(userId, appRole)
  if (visible !== null && visible.length === 0) {
    return { hasUnassignedTask: false, assigneeIdsOnTasks: [] }
  }
  const visParts: string[] = []
  const visParams: unknown[] = []
  if (visible !== null) {
    const ph = visible.map(() => '?').join(',')
    visParts.push(`t.project_id IN (${ph})`)
    visParams.push(...visible)
  }
  const w = visParts.length > 0 ? visParts.join(' AND ') : '1=1'
  const [unRows, distRows] = await Promise.all([
    query<{ x: number }[]>(`SELECT 1 as x ${MANAGEMENT_TASKS_FROM} WHERE ${w} AND t.assignee_user_id IS NULL LIMIT 1`, visParams),
    query<{ id: string }[]>(
      `SELECT DISTINCT t.assignee_user_id as id ${MANAGEMENT_TASKS_FROM} WHERE ${w} AND t.assignee_user_id IS NOT NULL`,
      visParams
    ),
  ])
  return {
    hasUnassignedTask: (unRows?.length ?? 0) > 0,
    assigneeIdsOnTasks: (distRows ?? []).map(r => r.id).filter(Boolean),
  }
}

export async function listTasksForManagementPage(
  userId: string,
  appRole: string,
  p: TaskManagementListParams
): Promise<{ tasks: Task[]; total: number }> {
  const pageN = Number(p.page)
  const limN = Number(p.limit)
  const page = Number.isFinite(pageN) ? Math.max(1, Math.floor(pageN)) : 1
  const limit = Number.isFinite(limN) ? Math.min(MAX_MANAGEMENT_PAGE_SIZE, Math.max(1, Math.floor(limN))) : 25
  const offset = (page - 1) * limit

  const { whereSql, params, isEmptyScope } = await managementBaseParams(userId, appRole, p, undefined)
  if (isEmptyScope) return { tasks: [], total: 0 }

  const countSql = `SELECT COUNT(*) as cnt ${MANAGEMENT_TASKS_FROM} WHERE ${whereSql}`
  const countRows = await query<{ cnt: number }[]>(countSql, params)
  const total = Number(countRows?.[0]?.cnt ?? 0)

  const orderBy = getManagementOrderBySql(p.sortColumn, p.sortDirection)
  const listSql =
    `SELECT t.*, p.name as project_name, u.name as assignee_name, ` +
    `cu.name AS created_by_display_name, cu.avatar_data AS created_by_avatar_data, ` +
    `uu.name AS updated_by_display_name, uu.avatar_data AS updated_by_avatar_data ` +
    `${MANAGEMENT_TASKS_FROM} LEFT JOIN task_favorites fav ON fav.task_id = t.id AND fav.user_id = ? WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`
  const listParams: unknown[] = [userId, ...params]
  const rows = await query<any[]>(listSql, listParams)
  return { tasks: (rows || []).map(mapTask), total }
}

export async function listTasksForManagementForCharts(
  userId: string,
  appRole: string,
  p: Omit<TaskManagementListParams, 'page' | 'limit' | 'sortColumn' | 'sortDirection'>
): Promise<TaskManagementChartRow[]> {
  const { whereSql, params, isEmptyScope } = await managementBaseParams(userId, appRole, { page: 1, limit: 1, ...p }, undefined)
  if (isEmptyScope) return []
  const sql = `SELECT t.id, t.status, t.progress, t.priority, t.assignee_user_id, t.plan_start_date, t.plan_end_date, t.actual_end_date, t.actual_start_date, t.created_at, t.updated_at ${MANAGEMENT_TASKS_FROM} WHERE ${whereSql} ORDER BY t.created_at DESC LIMIT ${MANAGEMENT_CHART_MAX_ROWS}`
  const rows = await query<any[]>(sql, params)
  return (rows || []).map(mapManagementChartRow)
}

export async function listTasksForManagementWithFacets(
  userId: string,
  appRole: string,
  p: TaskManagementListParams,
  options?: { includeFacets?: boolean }
): Promise<TaskManagementListResponse> {
  const includeFacets = options?.includeFacets !== false
  if (!includeFacets) {
    const pageBlock = await listTasksForManagementPage(userId, appRole, p)
    return { tasks: pageBlock.tasks, total: pageBlock.total, facets: null }
  }
  const [pageBlock, facets] = await Promise.all([
    listTasksForManagementPage(userId, appRole, p),
    getTaskManagementFacetCounts(userId, appRole, p),
  ])
  return { tasks: pageBlock.tasks, total: pageBlock.total, facets }
}

export async function canUserViewTaskByScope(userId: string, appRole: string, task: Task | null): Promise<boolean> {
  if (!task?.projectId) return false
  const visible = await getTaskListVisibleProjectIds(userId, appRole)
  if (visible === null) return true
  return visible.includes(task.projectId)
}

/** Lấy danh sách task_id mà user đã favorite */
export async function getFavoriteTaskIds(userId: string): Promise<Set<string>> {
  const rows = await query<any[]>('SELECT task_id FROM task_favorites WHERE user_id = ?', [userId])
  return new Set((rows || []).map(r => r.task_id))
}

/** Thêm task vào favorite của user */
export async function addTaskFavorite(userId: string, taskId: string): Promise<void> {
  await ensureUserExists(userId)
  const taskRows = await query<any[]>('SELECT id FROM tasks WHERE id = ?', [taskId])
  if (!taskRows?.length) throw new Error('Task not found')
  const id = randomUuidV7()
  try {
    await query('INSERT INTO task_favorites (id, user_id, task_id) VALUES (?, ?, ?)', [id, userId, taskId])
  } catch (err: unknown) {
    const e = err as { code?: string; errno?: number }
    if (e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062) {
      return
    }
    throw err
  }
}

/** Xóa task khỏi favorite của user */
export async function removeTaskFavorite(userId: string, taskId: string): Promise<void> {
  const result = await query<{ affectedRows?: number }>('DELETE FROM task_favorites WHERE user_id = ? AND task_id = ?', [userId, taskId])
  if (result?.affectedRows === 0) return
}

/** Tạo bản sao task (copy) - cùng project, title thêm " (Copy)", status = new, progress = 0. Không copy task Redmine. */
export async function copyTask(taskId: string, createdBy: string): Promise<Task> {
  const task = await getTask(taskId)
  if (!task) throw new Error('Task not found')
  const src = (task.source || 'in_app').toLowerCase().replace(/\s+/g, '_')
  if (src === 'redmine') throw new Error('CANNOT_COPY_REDMINE_TASK')
  const copyTitle = `${(task.title || '').trim()} (Copy)`
  return createTask({
    title: copyTitle,
    description: task.description,
    assigneeUserId: task.assigneeUserId,
    status: 'new',
    progress: 0,
    priority: (task.priority || 'medium') as TaskPriority,
    type: (task.type || 'bug') as TaskType,
    source: task.source || 'in_app',
    ticketId: '',
    projectId: task.projectId,
    planStartDate: task.planStartDate || undefined,
    planEndDate: task.planEndDate || undefined,
    actualStartDate: undefined,
    actualEndDate: undefined,
    createdBy,
  })
}

async function ensureUserExists(userId: string | null | undefined): Promise<void> {
  if (!userId) return
  const rows = await query<any[]>('SELECT id FROM users WHERE id = ?', [userId])
  if (!rows?.length) throw new Error('User not found')
}

const MASTER_TABLES: Record<string, string> = {
  statuses: 'task_statuses',
  priorities: 'task_priorities',
  types: 'task_types',
  sources: 'task_sources',
}

const MASTER_LABELS: Record<string, string> = {
  statuses: 'status',
  priorities: 'priority',
  types: 'type',
  sources: 'source',
}

async function ensureMasterCodeExists(kind: 'statuses' | 'priorities' | 'types' | 'sources', code: string): Promise<void> {
  const table = MASTER_TABLES[kind]
  const rows = await query<any[]>(`SELECT 1 FROM ${table} WHERE code = ?`, [code])
  if (!rows?.length) throw new Error(`Invalid ${MASTER_LABELS[kind]}`)
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const title = (input.title ?? '').toString().trim()
  if (!title) throw new Error('title is required')
  const projectId = input.projectId
  if (!projectId || typeof projectId !== 'string') throw new Error('projectId is required')
  const projRows = await query<any[]>('SELECT id FROM projects WHERE id = ?', [projectId])
  const proj = projRows?.[0]
  if (!proj) throw new Error('Project not found')
  await ensureUserExists(input.assigneeUserId)

  const effectiveSource = (input.source || 'in_app').toLowerCase().replace(/\s+/g, '_')
  const ticketIdInput = (input.ticketId || '').trim()
  let ticketId = ticketIdInput
  if (!ticketId) {
    ticketId = await getNextTicketId(projectId, effectiveSource)
  }

  const progress = Math.min(100, Math.max(0, Number(input.progress) ?? 0))
  const id = randomUuidV7()
  const creator = (input.createdBy || '').trim() || null
  await query(
    `INSERT INTO tasks (id, project_id, title, description, assignee_user_id, status, progress, priority, type, source, ticket_id, plan_start_date, plan_end_date, actual_start_date, actual_end_date, created_by, updated_by, parent_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      projectId,
      title,
      input.description || '',
      input.assigneeUserId ?? null,
      input.status || 'new',
      progress,
      input.priority || 'medium',
      input.type || 'bug',
      effectiveSource,
      ticketId,
      input.planStartDate ? toMysqlDateTime(input.planStartDate) : null,
      input.planEndDate ? toMysqlDateTime(input.planEndDate) : null,
      input.actualStartDate ? toMysqlDateTime(input.actualStartDate) : null,
      input.actualEndDate ? toMysqlDateTime(input.actualEndDate) : null,
      creator,
      creator,
      (input as any).parentId || null,
    ]
  )
  const taskRows = await query<any[]>(`${TASK_SELECT_JOIN} WHERE t.id = ?`, [id])
  const row = taskRows?.[0]
  if (!row) throw new Error('Failed to fetch created task')
  return mapTask(row)
}

export async function updateTaskStatus(id: string, status: TaskStatus, version?: number, updatedByUserId?: string): Promise<void> {
  const doneDates = status === 'done' ? ', actual_end_date = COALESCE(actual_end_date, CURDATE())' : ''
  const up = updatedByUserId?.trim()
  const auditSql = up ? ', updated_by = ?' : ''
  const sql =
    version !== undefined
      ? `UPDATE tasks SET status = ?, updated_at = NOW(), version = version + 1${doneDates}${auditSql} WHERE id = ? AND version = ?`
      : `UPDATE tasks SET status = ?, updated_at = NOW(), version = version + 1${doneDates}${auditSql} WHERE id = ?`
  const params =
    version !== undefined ? (up ? [status, up, id, version] : [status, id, version]) : up ? [status, up, id] : [status, id]
  const result = await query<{ affectedRows?: number }>(sql, params)
  if (result?.affectedRows === 0) throwVersionConflict()
}

export async function updateTaskProgress(id: string, progress: number, version?: number, updatedByUserId?: string): Promise<void> {
  const clamped = Math.min(100, Math.max(0, Number(progress) ?? 0))
  const up = updatedByUserId?.trim()
  const auditSql = up ? ', updated_by = ?' : ''
  const sql =
    version !== undefined
      ? `UPDATE tasks SET progress = ?, updated_at = NOW(), version = version + 1${auditSql} WHERE id = ? AND version = ?`
      : `UPDATE tasks SET progress = ?, updated_at = NOW(), version = version + 1${auditSql} WHERE id = ?`
  const params =
    version !== undefined ? (up ? [clamped, up, id, version] : [clamped, id, version]) : up ? [clamped, up, id] : [clamped, id]
  const result = await query<{ affectedRows?: number }>(sql, params)
  if (result?.affectedRows === 0) throwVersionConflict()
}

export async function updateTaskDates(
  id: string,
  dates: { planStartDate?: string; planEndDate?: string; actualStartDate?: string; actualEndDate?: string },
  version?: number,
  updatedByUserId?: string
): Promise<void> {
  const updates: string[] = []
  const params: unknown[] = []
  if (dates.planStartDate !== undefined) {
    updates.push('plan_start_date = ?')
    params.push(dates.planStartDate ? toMysqlDateTime(dates.planStartDate) : null)
  }
  if (dates.planEndDate !== undefined) {
    updates.push('plan_end_date = ?')
    params.push(dates.planEndDate ? toMysqlDateTime(dates.planEndDate) : null)
  }
  if (dates.actualStartDate !== undefined) {
    updates.push('actual_start_date = ?')
    params.push(dates.actualStartDate ? toMysqlDateTime(dates.actualStartDate) : null)
  }
  if (dates.actualEndDate !== undefined) {
    updates.push('actual_end_date = ?')
    params.push(dates.actualEndDate ? toMysqlDateTime(dates.actualEndDate) : null)
  }
  if (updates.length === 0) return
  const up = updatedByUserId?.trim()
  if (up) {
    updates.push('updated_by = ?')
    params.push(up)
  }
  updates.push('updated_at = NOW()', 'version = version + 1')
  params.push(id)
  if (version !== undefined) params.push(version)
  const whereClause = version !== undefined ? 'WHERE id = ? AND version = ?' : 'WHERE id = ?'
  const result = await query<{ affectedRows?: number }>(`UPDATE tasks SET ${updates.join(', ')} ${whereClause}`, params)
  if (result?.affectedRows === 0) throwVersionConflict()
}

export async function assignTask(id: string, assigneeUserId: string | null, version?: number, updatedByUserId?: string): Promise<void> {
  await ensureUserExists(assigneeUserId)
  const up = updatedByUserId?.trim()
  const auditSql = up ? ', updated_by = ?' : ''
  const sql =
    version !== undefined
      ? `UPDATE tasks SET assignee_user_id = ?, updated_at = NOW(), version = version + 1${auditSql} WHERE id = ? AND version = ?`
      : `UPDATE tasks SET assignee_user_id = ?, updated_at = NOW(), version = version + 1${auditSql} WHERE id = ?`
  const params =
    version !== undefined
      ? up
        ? [assigneeUserId ?? null, up, id, version]
        : [assigneeUserId ?? null, id, version]
      : up
        ? [assigneeUserId ?? null, up, id]
        : [assigneeUserId ?? null, id]
  const result = await query<{ affectedRows?: number }>(sql, params)
  if (result?.affectedRows === 0) throwVersionConflict()
}

export async function updateTask(id: string, input: UpdateTaskInput, updatedByUserId?: string): Promise<void> {
  const rows = await query<any[]>('SELECT * FROM tasks WHERE id = ?', [id])
  if (!rows?.length) throw new Error('Task not found')

  const projectId = (input as any).projectId
  if (projectId !== undefined && projectId !== null && projectId !== '') {
    const proj = await query<any[]>('SELECT id FROM projects WHERE id = ?', [projectId])
    if (!proj?.length) throw new Error('Project not found')
  }
  await ensureUserExists((input as any).assigneeUserId)

  const updates: string[] = []
  const params: unknown[] = []
  const parentId = (input as any).parentId
  if (parentId !== undefined && parentId !== null && parentId !== '') {
    if (parentId === id) throw new Error('Task cannot be its own parent')
    const parentRows = await query<any[]>('SELECT parent_id FROM tasks WHERE id = ?', [parentId])
    if (!parentRows?.length) throw new Error('Parent task not found')
    let current: string | null = parentId
    while (current) {
      if (current === id) throw new Error('Cannot set parent: would create cycle')
      const rows = await query<any[]>('SELECT parent_id FROM tasks WHERE id = ?', [current])
      current = rows?.[0]?.parent_id ?? null
    }
  }

  const map: Record<string, string> = {
    title: 'title',
    description: 'description',
    assigneeUserId: 'assignee_user_id',
    status: 'status',
    progress: 'progress',
    priority: 'priority',
    type: 'type',
    source: 'source',
    ticketId: 'ticket_id',
    projectId: 'project_id',
    planStartDate: 'plan_start_date',
    planEndDate: 'plan_end_date',
    actualStartDate: 'actual_start_date',
    actualEndDate: 'actual_end_date',
    parentId: 'parent_id',
  }
  const inputVersion = (input as any).version
  for (const [key, dbKey] of Object.entries(map)) {
    let val = (input as any)[key]
    if (val === undefined) continue
    if (key === 'projectId' && (val === null || val === '')) continue
    if (key === 'assigneeUserId' && (val === null || val === '')) val = null
    if (key === 'parentId' && (val === null || val === '')) val = null
    if ((key === 'planStartDate' || key === 'planEndDate' || key === 'actualStartDate' || key === 'actualEndDate') && (val === null || val === '')) val = null
    if (key === 'title' && (val === null || (typeof val === 'string' && !val.trim()))) {
      throw new Error('title cannot be empty')
    }
    if (key === 'ticketId' && (val === null || (typeof val === 'string' && !val.trim()))) {
      throw new Error('ticket_id cannot be empty')
    }
    if (key === 'progress') val = Math.min(100, Math.max(0, Number(val) ?? 0))
    if (key === 'status') await ensureMasterCodeExists('statuses', String(val))
    if (key === 'priority') await ensureMasterCodeExists('priorities', String(val))
    if (key === 'type') await ensureMasterCodeExists('types', String(val))
    if (key === 'source') await ensureMasterCodeExists('sources', String(val))
    if (key === 'planStartDate' || key === 'planEndDate' || key === 'actualStartDate' || key === 'actualEndDate') {
      val = val === null ? null : toMysqlDateTime(val as string)
    }
    updates.push(`${dbKey} = ?`)
    params.push(val)
  }
  const inputStatus = (input as { status?: string }).status
  const hasActualEndKey = Object.hasOwn(input, 'actualEndDate')
  if (inputStatus === 'done' && !hasActualEndKey) {
    updates.push('actual_end_date = COALESCE(actual_end_date, CURDATE())')
  }
  if (updates.length === 0) return
  const actor = updatedByUserId?.trim()
  if (actor) {
    updates.push('updated_by = ?')
    params.push(actor)
  }
  updates.push('updated_at = NOW()', 'version = version + 1')
  params.push(id)
  const whereClause = inputVersion !== undefined ? 'WHERE id = ? AND version = ?' : 'WHERE id = ?'
  if (inputVersion !== undefined) params.push(inputVersion)
  const result = await query<{ affectedRows?: number }>(`UPDATE tasks SET ${updates.join(', ')} ${whereClause}`, params)
  if (result?.affectedRows === 0) throwVersionConflict()
}

export async function deleteTask(id: string, version?: number): Promise<void> {
  await withTransaction(async txQuery => {
    // Xóa tất cả links liên quan (tránh lỗi FK khi task có links)
    await txQuery('DELETE FROM task_links WHERE from_task_id = ? OR to_task_id = ?', [id, id])
    // Gỡ parent của các sub-task (tránh lỗi FK khi task có children)
    await txQuery('UPDATE tasks SET parent_id = NULL WHERE parent_id = ?', [id])
    // Xóa task
    const sql = version !== undefined ? 'DELETE FROM tasks WHERE id = ? AND version = ?' : 'DELETE FROM tasks WHERE id = ?'
    const params = version !== undefined ? [id, version] : [id]
    const result = (await txQuery(sql, params)) as { affectedRows?: number }
    if (result?.affectedRows === 0) throwVersionConflict()
  })
}

export interface TaskLink {
  id: string
  fromTaskId: string
  toTaskId: string
  linkType: string
  toTitle?: string
  toTicketId?: string
  fromTitle?: string
  fromTicketId?: string
  version?: number
}

export interface TaskLinksResponse {
  outgoing: TaskLink[]
  incoming: TaskLink[]
}

export async function getTaskChildren(taskId: string): Promise<Task[]> {
  const rows = await query<any[]>(`${TASK_SELECT_JOIN} WHERE t.parent_id = ? ORDER BY t.created_at`, [taskId])
  return (rows || []).map(mapTask)
}

export async function createTaskChild(taskId: string, input: CreateTaskInput): Promise<Task> {
  const title = (input.title ?? '').toString().trim()
  if (!title) throw new Error('title is required')
  const parentRows = await query<any[]>('SELECT project_id FROM tasks WHERE id = ?', [taskId])
  const parent = parentRows?.[0]
  if (!parent) throw new Error('Parent task not found')
  const projectId = parent.project_id
  await ensureUserExists(input.assigneeUserId)

  const effectiveSource = (input.source || 'in_app').toLowerCase().replace(/\s+/g, '_')
  const ticketIdInput = (input.ticketId || '').trim()
  let ticketId = ticketIdInput
  if (!ticketId) {
    ticketId = await getNextTicketId(projectId, effectiveSource)
  }

  const progress = Math.min(100, Math.max(0, Number(input.progress) ?? 0))
  const id = randomUuidV7()
  const creator = (input.createdBy || '').trim() || null
  await query(
    `INSERT INTO tasks (id, project_id, title, description, assignee_user_id, status, progress, priority, type, source, ticket_id, plan_start_date, plan_end_date, actual_start_date, actual_end_date, created_by, updated_by, parent_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      projectId,
      title,
      input.description || '',
      input.assigneeUserId ?? null,
      input.status || 'new',
      progress,
      input.priority || 'medium',
      input.type || 'bug',
      effectiveSource,
      ticketId,
      input.planStartDate ? toMysqlDateTime(input.planStartDate) : null,
      input.planEndDate ? toMysqlDateTime(input.planEndDate) : null,
      input.actualStartDate ? toMysqlDateTime(input.actualStartDate) : null,
      input.actualEndDate ? toMysqlDateTime(input.actualEndDate) : null,
      creator,
      creator,
      taskId,
    ]
  )
  const childTaskRows = await query<any[]>(`${TASK_SELECT_JOIN} WHERE t.id = ?`, [id])
  const row = childTaskRows?.[0]
  if (!row) throw new Error('Failed to fetch created sub-task')
  return mapTask(row)
}

export async function getTaskLinks(taskId: string): Promise<TaskLinksResponse> {
  const out = await query<any[]>(
    'SELECT tl.*, t.title as to_title, t.ticket_id as to_ticket_id FROM task_links tl JOIN tasks t ON tl.to_task_id = t.id WHERE tl.from_task_id = ?',
    [taskId]
  )
  const inc = await query<any[]>(
    'SELECT tl.*, t.title as from_title, t.ticket_id as from_ticket_id FROM task_links tl JOIN tasks t ON tl.from_task_id = t.id WHERE tl.to_task_id = ?',
    [taskId]
  )
  return {
    outgoing: (out || []).map(r => ({
      id: r.id,
      fromTaskId: r.from_task_id,
      toTaskId: r.to_task_id,
      linkType: r.link_type,
      toTitle: r.to_title,
      toTicketId: r.to_ticket_id || undefined,
      version: r.version ?? 1,
    })),
    incoming: (inc || []).map(r => ({
      id: r.id,
      fromTaskId: r.from_task_id,
      toTaskId: r.to_task_id,
      linkType: r.link_type,
      fromTitle: r.from_title,
      fromTicketId: r.from_ticket_id || undefined,
      version: r.version ?? 1,
    })),
  }
}

export async function createTaskLink(taskId: string, toTaskId: string, linkType: string): Promise<TaskLink> {
  const lt = (linkType ?? '').trim()
  if (!lt) throw new Error('linkType is required')
  if (taskId === toTaskId) throw new Error('Cannot link task to itself')
  const [fromRows, toRows, existingLink, linkTypeRows] = await Promise.all([
    query<any[]>('SELECT id FROM tasks WHERE id = ?', [taskId]),
    query<any[]>('SELECT id FROM tasks WHERE id = ?', [toTaskId]),
    query<any[]>('SELECT id FROM task_links WHERE from_task_id = ? AND to_task_id = ? AND link_type = ?', [taskId, toTaskId, lt]),
    query<any[]>('SELECT code FROM task_link_types WHERE code = ?', [lt]),
  ])
  if (!fromRows?.length) throw new Error('Source task not found')
  if (!toRows?.length) throw new Error('Target task not found')
  if (!linkTypeRows?.length) throw new Error('Invalid link type')
  if (existingLink?.length) throw new Error('Link already exists')

  const id = randomUuidV7()
  await query('INSERT INTO task_links (id, from_task_id, to_task_id, link_type) VALUES (?, ?, ?, ?)', [id, taskId, toTaskId, lt])
  const rows = await query<any[]>('SELECT * FROM task_links WHERE id = ?', [id])
  const row = rows?.[0]
  if (!row) throw new Error('Failed to fetch created link')
  return {
    id: row.id,
    fromTaskId: row.from_task_id,
    toTaskId: row.to_task_id,
    linkType: row.link_type,
    version: row.version ?? 1,
  }
}

export async function deleteTaskLink(taskId: string, linkId: string, version?: number): Promise<void> {
  const sql =
    version !== undefined
      ? 'DELETE FROM task_links WHERE id = ? AND (from_task_id = ? OR to_task_id = ?) AND version = ?'
      : 'DELETE FROM task_links WHERE id = ? AND (from_task_id = ? OR to_task_id = ?)'
  const params = version !== undefined ? [linkId, taskId, taskId, version] : [linkId, taskId, taskId]
  const result = await query<{ affectedRows?: number }>(sql, params)
  if (result?.affectedRows === 0) throw new Error('Link not found or was modified by another user')
}

function mapRowToUser(r: Record<string, unknown>): User {
  const avatarData = r.avatar_data as string | null | undefined
  const avatarUrl = avatarData && typeof avatarData === 'string' && avatarData.length > 0
    ? (avatarData.startsWith('data:') ? avatarData : `data:image/png;base64,${avatarData}`)
    : null
  return {
    id: r.id as string,
    userCode: r.user_code as string,
    name: r.name as string,
    email: (r.email as string) || '',
    avatarUrl,
    receiveCommitNotification: r.receive_commit_notification !== 0 && r.receive_commit_notification !== false,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export async function getUserByUserCode(userCode: string): Promise<User | null> {
  const code = String(userCode).trim().toLowerCase()
  if (!code) return null
  const rows = await query<any[]>('SELECT * FROM users WHERE LOWER(user_code) = ?', [code])
  const row = rows?.[0]
  if (!row) return null
  return mapRowToUser(row)
}

/** Lấy user theo user_code hoặc email (để đăng nhập). */
export async function getUserByUserCodeOrEmail(identifier: string): Promise<User | null> {
  const val = String(identifier).trim()
  if (!val) return null
  const lower = val.toLowerCase()
  const rows = await query<any[]>("SELECT * FROM users WHERE LOWER(user_code) = ? OR (email IS NOT NULL AND TRIM(email) != '' AND LOWER(TRIM(email)) = ?)", [lower, lower])
  const row = rows?.[0]
  if (!row) return null
  return mapRowToUser(row)
}

export async function getUsers(): Promise<User[]> {
  const rows = await query<any[]>('SELECT * FROM users ORDER BY user_code')
  return (rows || []).map(mapRowToUser)
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const code = input.userCode?.trim()
  const name = input.name?.trim()
  if (!code || !name) throw new Error('userCode and name are required')
  const existing = await query<any[]>('SELECT id FROM users WHERE LOWER(user_code) = ?', [code.toLowerCase()])
  if (existing?.length) throw new Error(`Mã user "${code}" đã tồn tại`)
  const id = randomUuidV7()
  await query('INSERT INTO users (id, user_code, name, email, receive_commit_notification) VALUES (?, ?, ?, ?, 1)', [id, code, name, input.email || ''])
  const rows = await query<any[]>('SELECT * FROM users WHERE id = ?', [id])
  const row = rows?.[0]
  if (!row) throw new Error('Failed to fetch created user')
  return mapRowToUser(row)
}

export async function updateUser(id: string, data: { userCode?: string; name?: string; email?: string; receiveCommitNotification?: boolean }): Promise<void> {
  if (data.userCode !== undefined) {
    const code = String(data.userCode).trim()
    if (!code) throw new Error('Mã user không được để trống')
    const dup = await query<any[]>('SELECT id FROM users WHERE LOWER(user_code) = ? AND id != ?', [code.toLowerCase(), id])
    if (dup?.length) throw new Error(`Mã user "${code}" đã tồn tại`)
  }
  const existing = await query<any[]>('SELECT * FROM users WHERE id = ?', [id])
  if (!existing?.length) throw new Error('Người dùng không tồn tại')
  const u = existing[0]
  const newCode = data.userCode !== undefined ? String(data.userCode).trim() : u.user_code
  const newName = data.name !== undefined ? String(data.name).trim() : u.name
  if (data.name !== undefined && !newName) throw new Error('Tên không được để trống')
  const newEmail = data.email !== undefined ? data.email : u.email
  const version = u.version ?? 1
  const updates: string[] = ['user_code = ?', 'name = ?', 'email = ?']
  const params: unknown[] = [newCode, newName, newEmail]
  if (data.receiveCommitNotification !== undefined) {
    updates.push('receive_commit_notification = ?')
    params.push(data.receiveCommitNotification ? 1 : 0)
  }
  updates.push('version = version + 1')
  params.push(id, version)
  const result = await query<{ affectedRows?: number }>(`UPDATE users SET ${updates.join(', ')} WHERE id = ? AND version = ?`, params)
  if (result?.affectedRows === 0) throw new Error('Người dùng không tồn tại hoặc đã bị sửa bởi người khác')
}

/** Lưu avatar base64 vào DB. avatarBase64: chuỗi base64 thuần hoặc data URL đầy đủ. */
export async function updateUserAvatar(userId: string, avatarBase64: string | null): Promise<void> {
  let data = avatarBase64
  if (data?.startsWith('data:image')) {
    const comma = data.indexOf(',')
    data = comma >= 0 ? data.slice(comma + 1) : ''
  }
  await query('UPDATE users SET avatar_data = ? WHERE id = ?', [data || null, userId])
}

/** Trả về data URL để hiển thị avatar (hoạt động trên mọi máy vì lưu trong DB). */
export async function getUserAvatarUrl(userId: string): Promise<string | null> {
  const rows = await query<any[]>('SELECT avatar_data FROM users WHERE id = ?', [userId])
  const data = rows?.[0]?.avatar_data
  if (!data || typeof data !== 'string' || data.length === 0) return null
  return data.startsWith('data:') ? data : `data:image/png;base64,${data}`
}

export async function getPasswordHash(userId: string): Promise<string | null> {
  const rows = await query<any[]>('SELECT password_hash FROM users_password WHERE user_id = ?', [userId])
  return rows?.[0]?.password_hash ?? null
}

/** Lấy email của user theo userId. Dùng cho daily report tìm commit theo user. */
export async function getUserEmailById(userId: string): Promise<string | null> {
  const rows = await query<any[]>('SELECT email FROM users WHERE id = ?', [userId])
  const email = rows?.[0]?.email
  return typeof email === 'string' && email.trim() ? email.trim() : null
}

export async function isAppAdmin(userId: string): Promise<boolean> {
  const rows = await query<any[]>('SELECT 1 FROM app_admins WHERE user_id = ?', [userId])
  return (rows?.length ?? 0) > 0
}

export async function getFirstAdminUserId(): Promise<string | null> {
  const rows = await query<any[]>('SELECT user_id FROM app_admins LIMIT 1')
  return rows?.[0]?.user_id ?? null
}

export async function setPasswordHash(userId: string, passwordHash: string): Promise<void> {
  await ensureUserExists(userId)
  if (!passwordHash?.trim()) throw new Error('passwordHash is required')
  const rows = await query<any[]>('SELECT id, version FROM users_password WHERE user_id = ?', [userId])
  if (rows?.length) {
    const version = rows[0].version ?? 1
    const result = await query<{ affectedRows?: number }>(
      'UPDATE users_password SET password_hash = ?, updated_at = NOW(), version = version + 1 WHERE user_id = ? AND version = ?',
      [passwordHash, userId, version]
    )
    if (result?.affectedRows === 0) throw new Error('Password record was modified by another user')
  } else {
    const id = randomUuidV7()
    await query('INSERT INTO users_password (id, user_id, password_hash) VALUES (?, ?, ?)', [id, userId, passwordHash])
  }
}

export async function deleteUser(id: string): Promise<void> {
  const rows = await query<any[]>('SELECT id FROM users WHERE id = ?', [id])
  if (!rows?.length) throw new Error('Người dùng không tồn tại')
  if (await isAppAdmin(id)) {
    const adminCount = await query<any[]>('SELECT COUNT(*) as c FROM app_admins')
    if ((adminCount?.[0]?.c ?? 0) <= 1) throw new Error('Không thể xóa admin cuối cùng')
  }
  await withTransaction(async txQuery => {
    await txQuery('UPDATE tasks SET assignee_user_id = NULL, updated_at = NOW(), version = version + 1 WHERE assignee_user_id = ?', [id])
    await txQuery('DELETE FROM user_project_roles WHERE user_id = ?', [id])
    await txQuery('DELETE FROM app_admins WHERE user_id = ?', [id])
    await txQuery('DELETE FROM users_password WHERE user_id = ?', [id])
    await txQuery('DELETE FROM users WHERE id = ?', [id])
  })
}

export async function getUserRoles(userId: string): Promise<UserProjectRole[]> {
  const rows = await query<any[]>('SELECT id, user_id, project_id, role, created_at, updated_at FROM user_project_roles WHERE user_id = ? ORDER BY project_id', [userId])
  return (rows || []).map(r => ({
    id: r.id,
    userId: r.user_id,
    projectId: r.project_id,
    role: r.role,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : '',
  }))
}

export async function getUserRolesForProject(userId: string, projectId: string | null): Promise<UserRole[]> {
  const rows = await query<any[]>('SELECT role FROM user_project_roles WHERE user_id = ? AND (project_id <=> ?)', [userId, projectId])
  const roles = [...new Set((rows || []).map(r => r.role))]
  if (projectId) {
    const globalRows = await query<any[]>('SELECT role FROM user_project_roles WHERE user_id = ? AND project_id IS NULL', [userId])
    for (const r of globalRows || []) roles.push(r.role)
  }
  return [...new Set(roles)]
}

export async function setUserProjectRole(userId: string, projectId: string | null, role: UserRole): Promise<void> {
  await ensureUserExists(userId)
  if (projectId) {
    const proj = await query<any[]>('SELECT id FROM projects WHERE id = ?', [projectId])
    if (!proj?.length) throw new Error('Project not found')
  }
  const existing = await query<any[]>('SELECT id FROM user_project_roles WHERE user_id = ? AND (project_id <=> ?) AND role = ?', [userId, projectId, role])
  if (existing?.length) return
  const id = randomUuidV7()
  await query('INSERT INTO user_project_roles (id, user_id, project_id, role) VALUES (?, ?, ?, ?)', [id, userId, projectId, role])
}

export async function removeUserProjectRole(userId: string, projectId: string | null, role: UserRole): Promise<void> {
  await query('DELETE FROM user_project_roles WHERE user_id = ? AND (project_id <=> ?) AND role = ?', [userId, projectId, role])
}

export interface ProjectMember {
  userId: string
  name: string
  userCode: string
  role: UserRole
}

export interface ProjectMembers {
  pls: ProjectMember[]
  devs: ProjectMember[]
  pms: ProjectMember[]
}

export async function getProjectMembers(projectId: string): Promise<ProjectMembers> {
  const rows = await query<any[]>(
    `SELECT upr.user_id, upr.role, u.name, u.user_code
     FROM user_project_roles upr
     JOIN users u ON u.id = upr.user_id
     WHERE upr.project_id = ? AND upr.role IN ('pl', 'dev', 'pm')`,
    [projectId]
  )
  const pls: ProjectMember[] = []
  const devs: ProjectMember[] = []
  const pms: ProjectMember[] = []
  for (const r of rows || []) {
    const m = { userId: r.user_id, name: r.name ?? '', userCode: r.user_code ?? '', role: r.role }
    if (r.role === 'pl') pls.push(m)
    else if (r.role === 'pm') pms.push(m)
    else devs.push(m)
  }
  return { pls, devs, pms }
}

export async function hasRole(userId: string, projectId: string | null, role: UserRole): Promise<boolean> {
  const rows = await query<any[]>('SELECT 1 FROM user_project_roles WHERE user_id = ? AND (project_id <=> ?) AND role = ? LIMIT 1', [userId, projectId, role])
  if (rows?.length) return true
  if (projectId) {
    const globalRows = await query<any[]>('SELECT 1 FROM user_project_roles WHERE user_id = ? AND project_id IS NULL AND role = ? LIMIT 1', [userId, role])
    if (globalRows?.length) return true
  }
  return false
}

/** PM có thể set PL, PM, Dev. PL chỉ set Dev. Admin full. Dùng cho Manage members (projectId bắt buộc). */
export async function canUserManageProjectRole(managerUserId: string, projectId: string, targetRole: UserRole): Promise<boolean> {
  if (await isAppAdmin(managerUserId)) return true
  if (await hasRole(managerUserId, projectId, 'pm')) return true
  if (targetRole === 'dev' && (await hasRole(managerUserId, projectId, 'pl'))) return true
  return false
}

export async function getCanManageProjectRoles(managerUserId: string, projectId: string): Promise<{ canManagePl: boolean; canManagePm: boolean; canManageDev: boolean }> {
  const [canManagePl, canManagePm, canManageDev] = await Promise.all([
    canUserManageProjectRole(managerUserId, projectId, 'pl'),
    canUserManageProjectRole(managerUserId, projectId, 'pm'),
    canUserManageProjectRole(managerUserId, projectId, 'dev'),
  ])
  return { canManagePl, canManagePm, canManageDev }
}

export async function getProjects(): Promise<Project[]> {
  const rows = await query<any[]>('SELECT id, name, created_at, version FROM projects ORDER BY created_at DESC')
  return (rows || []).map(r => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    version: r.version ?? 1,
  }))
}

/**
 * Create project - Task Management flow (minimal: id, name).
 * For EVM projects with full metadata, use mysqlEVMStore.createProject.
 */
export async function createProject(name: string, pmUserId?: string | null): Promise<Project> {
  if (!name || typeof name !== 'string' || !name.trim()) throw new Error('name is required')
  await ensureUserExists(pmUserId)
  const id = randomUuidV7()
  await query('INSERT INTO projects (id, name) VALUES (?, ?)', [id, name.trim()])
  if (pmUserId) {
    await setUserProjectRole(pmUserId, id, 'pm')
  }
  const rows = await query<any[]>('SELECT id, name, created_at, version FROM projects WHERE id = ?', [id])
  const row = rows?.[0]
  if (!row) throw new Error('Failed to fetch created project')
  return { id: row.id, name: row.name, createdAt: row.created_at, version: row.version ?? 1 }
}

export async function updateProject(id: string, name: string, version?: number): Promise<Project> {
  if (!name || typeof name !== 'string' || !name.trim()) throw new Error('name is required')
  const sql =
    version !== undefined ? 'UPDATE projects SET name = ?, version = version + 1 WHERE id = ? AND version = ?' : 'UPDATE projects SET name = ?, version = version + 1 WHERE id = ?'
  const params = version !== undefined ? [name.trim(), id, version] : [name.trim(), id]
  const result = await query<{ affectedRows?: number }>(sql, params)
  if (result?.affectedRows === 0) throw new Error('Project not found or was modified by another user')
  const rows = await query<any[]>('SELECT id, name, created_at, version FROM projects WHERE id = ?', [id])
  const row = rows?.[0]
  if (!row) throw new Error('Project not found')
  return { id: row.id, name: row.name, createdAt: row.created_at, version: row.version ?? 1 }
}

/**
 * Delete project. Order: evm_* first (explicit, FK CASCADE would also delete them), then projects.
 * CASCADE handles: tasks, task_links, task_favorites, user_project_roles, task_ticket_sequences, daily_reports.
 */
/** Lấy giờ nhắc báo cáo của project. Trả về "HH:mm" hoặc null. */
export async function getProjectReminderTime(projectId: string): Promise<string | null> {
  const rows = await query<any[]>('SELECT daily_report_reminder_time FROM projects WHERE id = ?', [projectId])
  const val = rows?.[0]?.daily_report_reminder_time
  if (!val) return null
  const s = String(val)
  if (s.includes(':')) return s.slice(0, 5)
  return null
}

/** Cập nhật giờ nhắc báo cáo. time: "HH:mm" hoặc null để tắt. */
export async function updateProjectReminderTime(projectId: string, time: string | null): Promise<void> {
  const timeVal = time ? `${time}:00` : null
  await query('UPDATE projects SET daily_report_reminder_time = ? WHERE id = ?', [timeVal, projectId])
}

/** Lấy projects có daily_report_reminder_time khớp giờ hiện tại (HH:mm). */
export async function getProjectsWithReminderAtTime(currentTimeHhMm: string): Promise<{ id: string; name: string }[]> {
  const timeVal = `${currentTimeHhMm}:00`
  const rows = await query<any[]>('SELECT id, name FROM projects WHERE daily_report_reminder_time = ?', [timeVal])
  return (rows ?? []).map(r => ({ id: r.id, name: r.name }))
}

export async function deleteProject(id: string, version?: number): Promise<void> {
  await withTransaction(async txQuery => {
    await txQuery('DELETE FROM evm_wbs_details WHERE project_id = ?', [id])
    await txQuery('DELETE FROM evm_wbs_master WHERE project_id = ?', [id])
    await txQuery('DELETE FROM evm_phases WHERE project_id = ?', [id])
    await txQuery('DELETE FROM evm_wbs WHERE project_id = ?', [id])
    await txQuery('DELETE FROM evm_ac WHERE project_id = ?', [id])
    await txQuery('DELETE FROM evm_master WHERE project_id = ?', [id])
    await txQuery('DELETE FROM evm_ai_insight WHERE project_id = ?', [id])
    const sql = version !== undefined ? 'DELETE FROM projects WHERE id = ? AND version = ?' : 'DELETE FROM projects WHERE id = ?'
    const params = version !== undefined ? [id, version] : [id]
    const result = (await txQuery(sql, params)) as { affectedRows?: number }
    if (result?.affectedRows === 0) throw new Error('Project not found or was modified by another user')
  })
}

async function getMaster(kind: 'statuses' | 'priorities' | 'types' | 'sources', all = false): Promise<MasterItem[]> {
  const tables = { statuses: 'task_statuses', priorities: 'task_priorities', types: 'task_types', sources: 'task_sources' }
  const table = tables[kind]
  const sql = all ? `SELECT * FROM ${table} ORDER BY sort_order, code` : `SELECT * FROM ${table} WHERE is_active = 1 ORDER BY sort_order, code`
  const rows = await query<any[]>(sql)
  return (rows || []).map(r => ({
    code: r.code,
    name: r.name,
    sort_order: r.sort_order,
    color: r.color,
    is_active: r.is_active,
  }))
}

export async function getMasterStatusesAll(): Promise<MasterItem[]> {
  return getMaster('statuses', true)
}
export async function getMasterPrioritiesAll(): Promise<MasterItem[]> {
  return getMaster('priorities', true)
}
export async function getMasterTypesAll(): Promise<MasterItem[]> {
  return getMaster('types', true)
}
export async function getMasterSourcesAll(): Promise<MasterItem[]> {
  return getMaster('sources', true)
}

export interface TaskLinkTypeItem {
  code: string
  name: string
  sort_order?: number
}

export async function getMasterTaskLinkTypesAll(): Promise<TaskLinkTypeItem[]> {
  const rows = await query<any[]>('SELECT code, name, sort_order FROM task_link_types WHERE is_active = 1 ORDER BY sort_order, code')
  return (rows || []).map(r => ({
    code: r.code,
    name: r.name,
    sort_order: r.sort_order ?? 0,
  }))
}

async function createMaster(
  kind: 'statuses' | 'priorities' | 'types' | 'sources',
  input: { code: string; name: string; sort_order?: number; color?: string }
): Promise<MasterItem> {
  const tables = { statuses: 'task_statuses', priorities: 'task_priorities', types: 'task_types', sources: 'task_sources' }
  const table = tables[kind]
  const code = String(input.code).trim()
  const name = String(input.name).trim()
  if (!code || !name) throw new Error('code and name are required')
  try {
    if (kind === 'priorities' || kind === 'statuses' || kind === 'types') {
      await query(`INSERT INTO ${table} (code, name, sort_order, color) VALUES (?, ?, ?, ?)`, [code, name, input.sort_order ?? 0, input.color ?? null])
    } else {
      await query(`INSERT INTO ${table} (code, name, sort_order) VALUES (?, ?, ?)`, [code, name, input.sort_order ?? 0])
    }
  } catch (err: unknown) {
    const e = err as { code?: string; errno?: number }
    if (e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062) {
      throw new Error(`Code "${code}" already exists`)
    }
    throw err
  }
  const rows = await query<any[]>(`SELECT * FROM ${table} WHERE code = ?`, [code])
  const row = rows?.[0]
  if (!row) throw new Error('Failed to fetch created master record')
  return { code: row.code, name: row.name, sort_order: row.sort_order, color: row.color, is_active: row.is_active }
}

async function updateMaster(
  kind: 'statuses' | 'priorities' | 'types' | 'sources',
  code: string,
  data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }
): Promise<MasterItem> {
  const tables = { statuses: 'task_statuses', priorities: 'task_priorities', types: 'task_types', sources: 'task_sources' }
  const table = tables[kind]
  const updates: string[] = []
  const params: unknown[] = []
  if (data.name !== undefined) {
    updates.push('name = ?')
    params.push(String(data.name).trim())
  }
  if (data.sort_order !== undefined) {
    updates.push('sort_order = ?')
    params.push(Number(data.sort_order))
  }
  if (data.color !== undefined && (kind === 'priorities' || kind === 'statuses' || kind === 'types')) {
    updates.push('color = ?')
    params.push(data.color)
  }
  if (data.is_active !== undefined) {
    updates.push('is_active = ?')
    params.push(Boolean(data.is_active))
  }
  if (updates.length === 0) {
    const rows = await query<any[]>(`SELECT * FROM ${table} WHERE code = ?`, [code])
    const row = rows?.[0]
    if (!row) throw new Error('Master record not found')
    return row
  }
  updates.push('version = version + 1')
  params.push(code)
  const result = await query<{ affectedRows?: number }>(`UPDATE ${table} SET ${updates.join(', ')} WHERE code = ?`, params)
  if (result?.affectedRows === 0) throw new Error('Master record not found or was modified by another user')
  const rows = await query<any[]>(`SELECT * FROM ${table} WHERE code = ?`, [code])
  const row = rows?.[0]
  if (!row) throw new Error('Master record not found')
  return row
}

const MASTER_TO_TASK_COLUMN: Record<string, string> = {
  statuses: 'status',
  priorities: 'priority',
  types: 'type',
  sources: 'source',
}

async function deleteMaster(kind: 'statuses' | 'priorities' | 'types' | 'sources', code: string): Promise<void> {
  const tables = { statuses: 'task_statuses', priorities: 'task_priorities', types: 'task_types', sources: 'task_sources' }
  const table = tables[kind]
  const taskColumn = MASTER_TO_TASK_COLUMN[kind]
  const inUse = await query<any[]>(`SELECT 1 FROM tasks WHERE ${taskColumn} = ? LIMIT 1`, [code])
  if (inUse?.length) {
    throw new Error(`Không thể xóa: có task đang sử dụng ${MASTER_LABELS[kind]} "${code}"`)
  }
  const result = await query<{ affectedRows?: number }>(`UPDATE ${table} SET is_active = 0, version = version + 1 WHERE code = ?`, [code])
  if (result?.affectedRows === 0) throw new Error('Master record not found')
}

export async function createMasterStatus(input: { code: string; name: string; sort_order?: number; color?: string }): Promise<MasterItem> {
  return createMaster('statuses', input)
}
export async function updateMasterStatus(code: string, data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }): Promise<MasterItem> {
  return updateMaster('statuses', code, data)
}
export async function deleteMasterStatus(code: string): Promise<void> {
  return deleteMaster('statuses', code)
}
export async function createMasterPriority(input: { code: string; name: string; sort_order?: number; color?: string }): Promise<MasterItem> {
  return createMaster('priorities', input)
}
export async function updateMasterPriority(code: string, data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }): Promise<MasterItem> {
  return updateMaster('priorities', code, data)
}
export async function deleteMasterPriority(code: string): Promise<void> {
  return deleteMaster('priorities', code)
}
export async function createMasterType(input: { code: string; name: string; sort_order?: number; color?: string }): Promise<MasterItem> {
  return createMaster('types', input)
}
export async function updateMasterType(code: string, data: { name?: string; sort_order?: number; color?: string; is_active?: boolean }): Promise<MasterItem> {
  return updateMaster('types', code, data)
}
export async function deleteMasterType(code: string): Promise<void> {
  return deleteMaster('types', code)
}
export async function createMasterSource(input: { code: string; name: string; sort_order?: number }): Promise<MasterItem> {
  return createMaster('sources', input)
}
export async function updateMasterSource(code: string, data: { name?: string; sort_order?: number; is_active?: boolean }): Promise<MasterItem> {
  return updateMaster('sources', code, data)
}
export async function deleteMasterSource(code: string): Promise<void> {
  return deleteMaster('sources', code)
}

export async function createTasksFromRedmineCsv(csvContent: string, _users: User[], createdBy = ''): Promise<{ created: number; updated: number; errors: string[] }> {
  const rows = parseCSVRows(csvContent)
  if (rows.length < 2) return { created: 0, updated: 0, errors: ['CSV trống hoặc không có dữ liệu'] }
  const tablesCheck = await query<any[]>("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'")
  if (!tablesCheck?.length) {
    throw new Error('Database chưa được khởi tạo schema. Vui lòng khởi tạo schema trước khi import CSV.')
  }
  const users = await query<any[]>('SELECT * FROM users')
  const userList = (users || []).map((u: any) => ({
    userCode: u.user_code,
    name: u.name,
  }))
  await createUsersFromCsv(rows, userList)
  const usersAfter = await query<any[]>('SELECT * FROM users')
  const userListAfter = (usersAfter || []).map((u: any) => ({
    id: u.id,
    userCode: u.user_code,
    name: u.name,
  }))
  const { created: taskCreated, updated: taskUpdated, errors, assigneeProjectDevLinks } = await createTasksFromCsv(rows, userListAfter, createdBy)
  for (const { userId, projectId } of assigneeProjectDevLinks) {
    await setUserProjectRole(userId, projectId, 'dev')
  }
  return { created: taskCreated, updated: taskUpdated, errors }
}

export async function ensureTaskFile(): Promise<void> {
  const { testConnection } = await import('./db')
  const res = await testConnection()
  if (!res.ok) throw new Error(res.error || 'Database connection failed')
}

// --- Commit Review (MySQL) ---
export interface CommitReviewRecord {
  id: string
  sourceFolderPath: string
  commitId: string
  vcsType: 'git' | 'svn'
  reviewedAt: string
  reviewerUserId?: string | null
  note?: string | null
  version?: number
}

export async function getCommitReview(sourceFolderPath: string, commitId: string): Promise<CommitReviewRecord | null> {
  const rows = await query<any[]>('SELECT * FROM commit_reviews WHERE source_folder_path = ? AND commit_id = ?', [sourceFolderPath, commitId])
  const row = rows?.[0]
  if (!row) return null
  return {
    id: row.id,
    sourceFolderPath: row.source_folder_path,
    commitId: row.commit_id,
    vcsType: row.vcs_type,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : '',
    reviewerUserId: row.reviewer_user_id ?? null,
    note: row.note ?? null,
    version: row.version ?? 1,
  }
}

export async function saveCommitReview(record: {
  sourceFolderPath: string
  commitId: string
  vcsType: 'git' | 'svn'
  reviewerUserId?: string | null
  note?: string | null
}): Promise<void> {
  if (!record.sourceFolderPath?.trim() || !record.commitId?.trim()) {
    throw new Error('sourceFolderPath and commitId are required')
  }
  await ensureUserExists(record.reviewerUserId)
  const reviewedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const existing = await getCommitReview(record.sourceFolderPath, record.commitId)
  if (existing) {
    const result = await query<{ affectedRows?: number }>(
      `UPDATE commit_reviews SET reviewed_at = ?, reviewer_user_id = ?, note = ?, version = version + 1 WHERE source_folder_path = ? AND commit_id = ?`,
      [reviewedAt, record.reviewerUserId ?? null, record.note ?? null, record.sourceFolderPath, record.commitId]
    )
    if (result?.affectedRows === 0) throw new Error('Commit review was modified by another user')
  } else {
    const id = randomUuidV7()
    await query(
      `INSERT INTO commit_reviews (id, source_folder_path, commit_id, vcs_type, reviewed_at, reviewer_user_id, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, record.sourceFolderPath, record.commitId, record.vcsType, reviewedAt, record.reviewerUserId ?? null, record.note ?? null]
    )
  }
}

export async function deleteCommitReview(sourceFolderPath: string, commitId: string, version?: number): Promise<void> {
  if (!sourceFolderPath?.trim() || !commitId?.trim()) {
    throw new Error('sourceFolderPath and commitId are required')
  }
  const sql =
    version !== undefined
      ? 'DELETE FROM commit_reviews WHERE source_folder_path = ? AND commit_id = ? AND version = ?'
      : 'DELETE FROM commit_reviews WHERE source_folder_path = ? AND commit_id = ?'
  const params = version !== undefined ? [sourceFolderPath, commitId, version] : [sourceFolderPath, commitId]
  const result = await query<{ affectedRows?: number }>(sql, params)
  if (result?.affectedRows === 0) throw new Error('Commit review not found or was modified by another user')
}

export async function getCommitReviewsBySourceFolder(sourceFolderPath: string): Promise<CommitReviewRecord[]> {
  const rows = await query<any[]>('SELECT * FROM commit_reviews WHERE source_folder_path = ? ORDER BY reviewed_at DESC', [sourceFolderPath])
  return (rows || []).map(r => ({
    id: r.id,
    sourceFolderPath: r.source_folder_path,
    commitId: r.commit_id,
    vcsType: r.vcs_type,
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : '',
    reviewerUserId: r.reviewer_user_id ?? null,
    note: r.note ?? null,
    version: r.version ?? 1,
  }))
}

export async function getReviewedCommitIds(sourceFolderPath: string): Promise<Set<string>> {
  const rows = await query<any[]>('SELECT commit_id FROM commit_reviews WHERE source_folder_path = ?', [sourceFolderPath])
  return new Set((rows || []).map(r => r.commit_id))
}

export interface ReminderTaskItem {
  id: string
  title: string
  ticketId?: string
  planEndDate?: string
  updatedAt?: string
}

export interface ReminderStats {
  /** Hiển thị block Developer / Project Lead trong UI nhắc nhở. */
  reminderSections?: { showDev: boolean; showPl: boolean }
  devStats: {
    todayCount: number
    tomorrowCount: number
    nearDeadlineCount: number
    overdueCount: number
    todayTasks?: ReminderTaskItem[]
    tomorrowTasks?: ReminderTaskItem[]
    nearDeadlineTasks?: ReminderTaskItem[]
    overdueTasks?: ReminderTaskItem[]
  }
  plStats: {
    needReviewCount: number
    longUnreviewedCount: number
    needReviewTasks?: ReminderTaskItem[]
    longUnreviewedTasks?: ReminderTaskItem[]
  }
}

async function reminderTaskProjectFilterSql(userId: string, appRole: string): Promise<{ sql: string; params: unknown[] }> {
  const visible = await getTaskListVisibleProjectIds(userId, appRole)
  if (visible === null) return { sql: '', params: [] }
  if (visible.length === 0) return { sql: ' AND 1=0', params: [] }
  const ph = visible.map(() => '?').join(',')
  return { sql: ` AND t.project_id IN (${ph})`, params: [...visible] }
}

export async function getReminderStats(userId: string, appRole: string): Promise<ReminderStats> {
  const reminderSections = await getReminderSectionVisibility(userId)
  const pf = await reminderTaskProjectFilterSql(userId, appRole)
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const tomorrow = new Date(d)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  const dayAfterTomorrow = new Date(d)
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)
  const dayAfterTomorrowStr = `${dayAfterTomorrow.getFullYear()}-${String(dayAfterTomorrow.getMonth() + 1).padStart(2, '0')}-${String(dayAfterTomorrow.getDate()).padStart(2, '0')}`
  const dayAfterThreeDaysLater = new Date(d)
  dayAfterThreeDaysLater.setDate(dayAfterThreeDaysLater.getDate() + 4)
  const dayAfterThreeDaysLaterStr = `${dayAfterThreeDaysLater.getFullYear()}-${String(dayAfterThreeDaysLater.getMonth() + 1).padStart(2, '0')}-${String(dayAfterThreeDaysLater.getDate()).padStart(2, '0')}`

  const devStatuses = ['new', 'in_progress', 'in_review', 'feedback']
  const placeholders = devStatuses.map(() => '?').join(', ')
  const taskCols = 't.id, t.title, t.ticket_id, t.plan_end_date, t.updated_at'

  const [todayRows, tomorrowRows, nearDeadlineRows, overdueRows, inReviewRows, longUnreviewedRows] = await Promise.all([
    query<any[]>(
      `SELECT ${taskCols} FROM tasks t WHERE t.assignee_user_id = ? AND t.status IN (${placeholders}) AND t.plan_end_date >= ? AND t.plan_end_date < ?${pf.sql} ORDER BY t.plan_end_date`,
      [userId, ...devStatuses, today, tomorrowStr, ...pf.params]
    ),
    query<any[]>(
      `SELECT ${taskCols} FROM tasks t WHERE t.assignee_user_id = ? AND t.status IN (${placeholders}) AND t.plan_end_date >= ? AND t.plan_end_date < ?${pf.sql} ORDER BY t.plan_end_date`,
      [userId, ...devStatuses, tomorrowStr, dayAfterTomorrowStr, ...pf.params]
    ),
    query<any[]>(
      `SELECT ${taskCols} FROM tasks t WHERE t.assignee_user_id = ? AND t.status IN (${placeholders}) AND t.plan_end_date > ? AND t.plan_end_date < ?${pf.sql} ORDER BY t.plan_end_date`,
      [userId, ...devStatuses, dayAfterTomorrowStr, dayAfterThreeDaysLaterStr, ...pf.params]
    ),
    query<any[]>(
      `SELECT ${taskCols} FROM tasks t WHERE t.assignee_user_id = ? AND t.status IN (${placeholders}) AND t.plan_end_date IS NOT NULL AND t.plan_end_date < ? AND t.actual_end_date IS NULL${pf.sql} ORDER BY t.plan_end_date`,
      [userId, ...devStatuses, today, ...pf.params]
    ),
    query<any[]>(
      `SELECT t.id, t.title, t.ticket_id, t.plan_end_date, t.updated_at FROM tasks t
       JOIN user_project_roles upr ON upr.project_id = t.project_id AND upr.role IN ('pl','pm') AND upr.user_id = ?
       WHERE t.status = 'in_review'${pf.sql} ORDER BY t.updated_at`,
      [userId, ...pf.params]
    ),
    query<any[]>(
      `SELECT t.id, t.title, t.ticket_id, t.plan_end_date, t.updated_at FROM tasks t
       JOIN user_project_roles upr ON upr.project_id = t.project_id AND upr.role IN ('pl','pm') AND upr.user_id = ?
       WHERE t.status = 'in_review' AND t.updated_at < DATE_SUB(NOW(), INTERVAL 3 DAY)${pf.sql} ORDER BY t.updated_at`,
      [userId, ...pf.params]
    ),
  ])

  const mapTask = (r: any): ReminderTaskItem => ({
    id: r.id,
    title: r.title || '',
    ticketId: r.ticket_id || undefined,
    planEndDate: r.plan_end_date || undefined,
    updatedAt: r.updated_at || undefined,
  })

  return {
    reminderSections,
    devStats: {
      todayCount: (todayRows as any[])?.length ?? 0,
      tomorrowCount: (tomorrowRows as any[])?.length ?? 0,
      nearDeadlineCount: (nearDeadlineRows as any[])?.length ?? 0,
      overdueCount: (overdueRows as any[])?.length ?? 0,
      todayTasks: (todayRows as any[])?.map(mapTask) ?? [],
      tomorrowTasks: (tomorrowRows as any[])?.map(mapTask) ?? [],
      nearDeadlineTasks: (nearDeadlineRows as any[])?.map(mapTask) ?? [],
      overdueTasks: (overdueRows as any[])?.map(mapTask) ?? [],
    },
    plStats: {
      needReviewCount: (inReviewRows as any[])?.length ?? 0,
      longUnreviewedCount: (longUnreviewedRows as any[])?.length ?? 0,
      needReviewTasks: (inReviewRows as any[])?.map(mapTask) ?? [],
      longUnreviewedTasks: (longUnreviewedRows as any[])?.map(mapTask) ?? [],
    },
  }
}

// ========== Coding Rules (DB) ==========

export interface CodingRuleItem {
  id: string
  name: string
  content: string
  projectId: string | null
  scope: 'global' | 'project'
  createdBy: string
}

export interface CreateCodingRuleInput {
  name: string
  content: string
  projectId: string | null
  createdBy: string
}

/** Rules for selection: global + project rules (if user has linked folder to project). */
export async function getCodingRulesForSelection(userId: string, sourceFolderPath: string): Promise<CodingRuleItem[]> {
  const projectId = await getProjectIdByUserAndPath(userId, sourceFolderPath)
  const rows = projectId
    ? await query<any[]>(
      `SELECT id, name, content, project_id, created_by FROM coding_rules
         WHERE project_id IS NULL OR project_id = ?
         ORDER BY project_id IS NULL DESC, name`,
      [projectId]
    )
    : await query<any[]>('SELECT id, name, content, project_id, created_by FROM coding_rules WHERE project_id IS NULL ORDER BY name')
  return (rows ?? []).map(r => ({
    id: r.id,
    name: r.name,
    content: r.content ?? '',
    projectId: r.project_id ?? null,
    scope: r.project_id ? ('project' as const) : ('global' as const),
    createdBy: r.created_by,
  }))
}

/** Get rules for selection when not logged in: only global rules. */
export async function getCodingRulesGlobalOnly(): Promise<CodingRuleItem[]> {
  const rows = await query<any[]>('SELECT id, name, content, project_id, created_by FROM coding_rules WHERE project_id IS NULL ORDER BY name')
  return (rows ?? []).map(r => ({
    id: r.id,
    name: r.name,
    content: r.content ?? '',
    projectId: null,
    scope: 'global' as const,
    createdBy: r.created_by,
  }))
}

/** Get content by id. Returns null if not found. For global rules only when no auth. */
export async function getCodingRuleById(id: string): Promise<{ content: string; name: string } | null> {
  const rows = await query<any[]>('SELECT content, name FROM coding_rules WHERE id = ?', [id])
  const r = rows?.[0]
  return r ? { content: r.content ?? '', name: r.name ?? '' } : null
}

/** Get content by id. When no auth: only resolve if rule is global (project_id IS NULL). */
export async function getCodingRuleContentByIdOrName(idOrName: string, options?: { sourceFolderPath?: string; userId?: string }): Promise<string | null> {
  if (!idOrName?.trim()) return null
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName)
  if (isUuid) {
    const rows = await query<any[]>('SELECT content, project_id FROM coding_rules WHERE id = ?', [idOrName])
    const r = rows?.[0]
    if (!r) return null
    if (!options?.userId && r.project_id) return null
    if (options?.userId && options?.sourceFolderPath) {
      const projectId = await getProjectIdByUserAndPath(options.userId, options.sourceFolderPath)
      if (r.project_id && r.project_id !== projectId) return null
    }
    return r.content ?? null
  }
  let projectId: string | null = null
  if (options?.userId && options?.sourceFolderPath) {
    projectId = await getProjectIdByUserAndPath(options.userId, options.sourceFolderPath)
  }
  const rows = await query<any[]>('SELECT content FROM coding_rules WHERE name = ? AND (project_id <=> ?)', [idOrName, projectId])
  const r = rows?.[0]
  return r?.content ?? null
}

/** Get rules for management: admin = all, PL = only rules of projects where user has pl role. */
export async function getCodingRulesForManagement(userId: string): Promise<CodingRuleItem[]> {
  let rows: any[]
  if (await isAppAdmin(userId)) {
    rows =
      (await query<any[]>(
        `SELECT cr.id, cr.name, cr.content, cr.project_id, cr.created_by, p.name as project_name
       FROM coding_rules cr
       LEFT JOIN projects p ON p.id = cr.project_id
       ORDER BY cr.project_id IS NULL DESC, p.name, cr.name`
      )) ?? []
  } else {
    rows =
      (await query<any[]>(
        `SELECT cr.id, cr.name, cr.content, cr.project_id, cr.created_by, p.name as project_name
       FROM coding_rules cr
       LEFT JOIN projects p ON p.id = cr.project_id
       WHERE cr.project_id IS NULL
          OR EXISTS (SELECT 1 FROM user_project_roles upr WHERE upr.user_id = ? AND upr.project_id = cr.project_id AND upr.role = 'pl')
       ORDER BY cr.project_id IS NULL DESC, p.name, cr.name`,
        [userId]
      )) ?? []
  }
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    content: r.content ?? '',
    projectId: r.project_id ?? null,
    scope: r.project_id ? ('project' as const) : ('global' as const),
    createdBy: r.created_by,
  }))
}

/** Create coding rule. Admin: global or any project. PL: only projects with pl role. */
export async function createCodingRule(input: CreateCodingRuleInput): Promise<CodingRuleItem> {
  const { name, content, projectId, createdBy } = input
  if (!name?.trim() || !content?.trim()) throw new Error('Name and content are required')
  const isAdmin = await isAppAdmin(createdBy)
  if (projectId) {
    const proj = await query<any[]>('SELECT id FROM projects WHERE id = ?', [projectId])
    if (!proj?.length) throw new Error('Project not found')
    if (!isAdmin) {
      const hasPl = await hasRole(createdBy, projectId, 'pl')
      if (!hasPl) throw new Error('Chỉ PL của project mới được tạo rule cho project này')
    }
  } else {
    if (!isAdmin) throw new Error('Chỉ admin mới được tạo rule áp dụng toàn bộ dự án')
  }
  const existing = await query<any[]>('SELECT id FROM coding_rules WHERE name = ? AND (project_id <=> ?)', [name.trim(), projectId])
  if (existing?.length) throw new Error('Tên rule đã tồn tại trong phạm vi này')
  const id = randomUuidV7()
  await query('INSERT INTO coding_rules (id, name, content, project_id, created_by) VALUES (?, ?, ?, ?, ?)', [id, name.trim(), content, projectId, createdBy])
  const rows = await query<any[]>('SELECT id, name, content, project_id, created_by FROM coding_rules WHERE id = ?', [id])
  const r = rows?.[0]
  return {
    id: r.id,
    name: r.name,
    content: r.content ?? '',
    projectId: r.project_id ?? null,
    scope: r.project_id ? 'project' : 'global',
    createdBy: r.created_by,
  }
}

/** Update coding rule. Only creator or admin. */
export async function updateCodingRule(id: string, input: { name?: string; content?: string }, userId: string): Promise<CodingRuleItem> {
  const rows = await query<any[]>('SELECT id, created_by FROM coding_rules WHERE id = ?', [id])
  const r = rows?.[0]
  if (!r) throw new Error('Coding rule not found')
  const isAdmin = await isAppAdmin(userId)
  if (!isAdmin && r.created_by !== userId) throw new Error('Chỉ người tạo hoặc admin mới được sửa')
  if (input.name?.trim()) {
    const crRow = await query<any[]>('SELECT project_id FROM coding_rules WHERE id = ?', [id])
    const projectId = crRow?.[0]?.project_id ?? null
    const existing = await query<any[]>('SELECT id FROM coding_rules WHERE name = ? AND (project_id <=> ?) AND id != ?', [input.name.trim(), projectId, id])
    if (existing?.length) throw new Error('Tên rule đã tồn tại trong phạm vi này')
    await query('UPDATE coding_rules SET name = ?, updated_at = NOW() WHERE id = ?', [input.name.trim(), id])
  }
  if (input.content != null) {
    await query('UPDATE coding_rules SET content = ?, updated_at = NOW() WHERE id = ?', [input.content, id])
  }
  const updated = await query<any[]>('SELECT id, name, content, project_id, created_by FROM coding_rules WHERE id = ?', [id])
  const u = updated?.[0]
  return {
    id: u.id,
    name: u.name,
    content: u.content ?? '',
    projectId: u.project_id ?? null,
    scope: u.project_id ? 'project' : 'global',
    createdBy: u.created_by,
  }
}

/** Delete coding rule. Only creator or admin. */
export async function deleteCodingRule(id: string, userId: string): Promise<void> {
  const rows = await query<any[]>('SELECT id, created_by FROM coding_rules WHERE id = ?', [id])
  const r = rows?.[0]
  if (!r) throw new Error('Coding rule not found')
  const isAdmin = await isAppAdmin(userId)
  if (!isAdmin && r.created_by !== userId) throw new Error('Chỉ người tạo hoặc admin mới được xóa')
  await query('DELETE FROM coding_rules WHERE id = ?', [id])
}
