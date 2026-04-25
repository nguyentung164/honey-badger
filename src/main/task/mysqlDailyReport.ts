import { randomUuidV7 } from 'shared/randomUuidV7'
import { parseISO } from 'date-fns'
import { query, withTransaction } from './db'
import { getProjectMembers } from './mysqlTaskStore'

export interface SelectedSourceFolderRef {
  id: string
  path: string
  name: string
}

export interface SelectedCommit {
  /** Git: full hash. SVN: r123 */
  revision: string
  message: string
  author: string
  date: string
  files?: { filePath: string; status: string }[]
  /** Path của repo chứa commit (đa source folder) */
  sourceFolderPath?: string
  /** Git branch name (from refs). SVN: undefined. */
  branch?: string
  /** VCS của repo chứa commit (khi báo cáo đa folder có thể trộn Git + SVN) */
  vcsType?: 'git' | 'svn'
}

export interface DailyReportRecord {
  id: string
  userId: string
  projectId: string | null
  projectIds: string[]
  projectNames?: string[]
  reportDate: string
  workDescription: string | null
  selectedCommits: SelectedCommit[] | null
  /** user_project_source_folder.id đã chọn, theo thứ tự */
  selectedSourceFolders: SelectedSourceFolderRef[]
  /** Derive từ junction (tương thích UI cũ) */
  selectedSourceFolderPaths: string[] | null
  createdAt: string
  updatedAt: string
  /** Chuẩn hóa cho UI (PL detail) */
  vcsType?: string | null
}

function parseSelectedCommitsFromDb(raw: unknown): SelectedCommit[] | null {
  if (raw == null) return null
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    try {
      const p = JSON.parse(raw.toString('utf8')) as unknown
      return Array.isArray(p) ? (p as SelectedCommit[]) : null
    } catch {
      return null
    }
  }
  if (Array.isArray(raw)) return raw as SelectedCommit[]
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      return Array.isArray(p) ? (p as SelectedCommit[]) : null
    } catch {
      return null
    }
  }
  return null
}

function countSelectedCommitsRaw(raw: unknown): number {
  const a = parseSelectedCommitsFromDb(raw)
  return a?.length ?? 0
}

export interface DailyReportInput {
  workDescription: string
  selectedCommits: SelectedCommit[]
  reportDate: string
  /** Required: at least one project. */
  projectIds?: string[]
  projectId?: string | null
  /** Id bảng user_project_source_folder, theo thứ tự hiển thị */
  selectedUserProjectSourceFolderIds?: string[] | null
}

function parseProjectIds(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string')
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }
  return []
}

/** Lấy vcsType từ commit đầu trong selected_commits (hoặc đoán từ revision cho dữ liệu cũ). */
function deriveVcsTypeFromCommits(selectedCommits: SelectedCommit[] | null): string | null {
  if (!selectedCommits?.length) return null
  const first = selectedCommits[0]
  if (first.vcsType === 'git' || first.vcsType === 'svn') return first.vcsType
  if (first.revision?.match(/^r\d+$/)) return 'svn'
  if (first.revision && first.revision.length >= 32) return 'git'
  return null
}

async function loadSelectedSourceFoldersForReport(dailyReportId: string): Promise<SelectedSourceFolderRef[]> {
  const rows = await query<
    { id: string; source_folder_path: string; source_folder_name: string | null; sort_order: number }[]
  >(
    `SELECT upsf.id, upsf.source_folder_path, upsf.source_folder_name, drsf.sort_order
     FROM daily_report_source_folders drsf
     JOIN user_project_source_folder upsf ON upsf.id = drsf.user_project_source_folder_id
     WHERE drsf.daily_report_id = ?
     ORDER BY drsf.sort_order ASC`,
    [dailyReportId]
  )
  if (!Array.isArray(rows)) return []
  return rows.map(r => ({
    id: r.id,
    path: r.source_folder_path,
    name: r.source_folder_name?.trim() ? (r.source_folder_name as string) : r.source_folder_path,
  }))
}

export async function saveDailyReport(userId: string, input: DailyReportInput): Promise<void> {
  const projectIds = (input.projectIds && input.projectIds.length > 0)
    ? input.projectIds
    : (input.projectId ? [input.projectId] : [])
  const rawFolderIds = input.selectedUserProjectSourceFolderIds ?? []
  const folderIdsOrdered: string[] = []
  const seenFolder = new Set<string>()
  for (const id of rawFolderIds) {
    if (!id?.trim() || seenFolder.has(id)) continue
    seenFolder.add(id)
    folderIdsOrdered.push(id)
  }
  if (folderIdsOrdered.length > 0) {
    const placeholders = folderIdsOrdered.map(() => '?').join(',')
    const rows = await query<{ id: string; project_id: string }[]>(
      `SELECT id, project_id FROM user_project_source_folder WHERE user_id = ? AND id IN (${placeholders})`,
      [userId, ...folderIdsOrdered]
    )
    const found = new Map((rows ?? []).map(r => [r.id, r.project_id]))
    if (found.size !== folderIdsOrdered.length) {
      throw new Error('Một hoặc nhiều source folder không hợp lệ hoặc không thuộc tài khoản của bạn')
    }
    const projectSet = new Set(projectIds)
    for (const fid of folderIdsOrdered) {
      const pid = found.get(fid)
      if (!pid || !projectSet.has(pid)) {
        throw new Error('Source folder phải thuộc một trong các project đã chọn trong báo cáo')
      }
    }
  }

  const selectedCommitsJson = JSON.stringify(input.selectedCommits)
  const projectIdsJson = projectIds.length > 0 ? JSON.stringify(projectIds) : null

  await withTransaction(async txQuery => {
    const existingRows = (await txQuery(
      'SELECT id FROM daily_reports WHERE user_id = ? AND report_date = ? LIMIT 1',
      [userId, input.reportDate]
    )) as { id: string }[]
    const existing = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null
    let reportId: string
    if (existing) {
      reportId = existing.id
      await txQuery(
        `UPDATE daily_reports SET work_description = ?, selected_commits = ?, project_ids = ? WHERE id = ?`,
        [input.workDescription, selectedCommitsJson, projectIdsJson, reportId]
      )
    } else {
      reportId = randomUuidV7()
      await txQuery(
        `INSERT INTO daily_reports (id, user_id, project_ids, report_date, work_description, selected_commits)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [reportId, userId, projectIdsJson, input.reportDate, input.workDescription, selectedCommitsJson]
      )
    }
    await txQuery('DELETE FROM daily_report_source_folders WHERE daily_report_id = ?', [reportId])
    let sortOrder = 0
    for (const upsfId of folderIdsOrdered) {
      await txQuery(
        `INSERT INTO daily_report_source_folders (daily_report_id, user_project_source_folder_id, sort_order) VALUES (?, ?, ?)`,
        [reportId, upsfId, sortOrder]
      )
      sortOrder += 1
    }
  })
}

export async function getDailyReportByUserAndDate(userId: string, reportDate: string): Promise<DailyReportRecord | null> {
  const rows = await query<
    {
      id: string
      user_id: string
      project_ids: string | unknown[] | null
      report_date: string
      work_description: string | null
      selected_commits: string | unknown[] | null
      created_at: string
      updated_at: string
    }[]
  >(
    'SELECT id, user_id, project_ids, report_date, work_description, selected_commits, created_at, updated_at FROM daily_reports WHERE user_id = ? AND report_date = ? LIMIT 1',
    [userId, reportDate]
  )
  if (!Array.isArray(rows) || rows.length === 0) return null
  const r = rows[0]
  const resolvedProjectIds = parseProjectIds((r as { project_ids?: unknown }).project_ids)
  const nameMapForDetail = resolvedProjectIds.length > 0 ? await getProjectNamesByIds(resolvedProjectIds) : new Map<string, string>()
  const projectNames = resolvedProjectIds.map(id => nameMapForDetail.get(id) ?? id)
  const selectedCommits = parseSelectedCommitsFromDb(r.selected_commits)
  const selectedSourceFolders = await loadSelectedSourceFoldersForReport(r.id)
  const selectedSourceFolderPaths =
    selectedSourceFolders.length > 0 ? selectedSourceFolders.map(f => f.path) : null
  return {
    id: r.id,
    userId: r.user_id,
    projectId: resolvedProjectIds[0] ?? null,
    projectIds: resolvedProjectIds,
    projectNames,
    reportDate: r.report_date,
    workDescription: r.work_description,
    selectedCommits,
    selectedSourceFolders,
    selectedSourceFolderPaths,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    vcsType: deriveVcsTypeFromCommits(selectedCommits),
  }
}

export interface DailyReportListItem {
  id: string
  userId: string
  userName: string
  userCode: string
  projectId: string | null
  projectName: string | null
  projectIds: string[]
  projectNames: string[]
  reportDate: string
  workDescription: string | null
  selectedCommitsCount: number
  sourceFolderPath: string | null
  vcsType: string | null
  createdAt: string
}

async function getProjectNamesByIds(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  const distinct = [...new Set(ids)]
  const placeholders = distinct.map(() => '?').join(',')
  const rows = await query<{ id: string; name: string }[]>(
    `SELECT id, name FROM projects WHERE id IN (${placeholders})`,
    distinct
  )
  if (Array.isArray(rows)) {
    for (const row of rows) {
      map.set(row.id, row.name ?? row.id)
    }
  }
  return map
}

export async function listDailyReportsForPl(reportDate: string, projectId?: string | null): Promise<DailyReportListItem[]> {
  let sql = `
    SELECT dr.id, dr.user_id, u.name AS user_name, u.user_code, dr.project_ids,
           dr.report_date, dr.work_description, dr.selected_commits, dr.created_at,
           (SELECT upsf.source_folder_path FROM daily_report_source_folders drsf
            INNER JOIN user_project_source_folder upsf ON upsf.id = drsf.user_project_source_folder_id
            WHERE drsf.daily_report_id = dr.id ORDER BY drsf.sort_order ASC LIMIT 1) AS rep_source_folder_path
    FROM daily_reports dr
    JOIN users u ON u.id = dr.user_id
    WHERE dr.report_date = ?
  `
  const params: (string | null)[] = [reportDate]
  if (projectId) {
    sql += ` AND JSON_CONTAINS(COALESCE(dr.project_ids, JSON_ARRAY()), JSON_QUOTE(?), '$') = 1`
    params.push(projectId)
  }
  sql += ' ORDER BY u.name ASC'

  const rows = await query<
    {
      id: string
      user_id: string
      user_name: string
      user_code: string
      project_ids: string | unknown[] | null
      report_date: string
      work_description: string | null
      selected_commits: string | unknown[] | null
      created_at: string
      rep_source_folder_path: string | null
    }[]
  >(sql, params)

  if (!Array.isArray(rows)) return []

  const allIds = new Set<string>()
  for (const r of rows) {
    for (const id of parseProjectIds((r as { project_ids?: unknown }).project_ids)) allIds.add(id)
  }
  const nameMap = await getProjectNamesByIds([...allIds])

  return rows.map(r => {
    const selectedCommitsCount = countSelectedCommitsRaw(r.selected_commits)
    const resolvedIds = parseProjectIds((r as { project_ids?: unknown }).project_ids)
    const projectNames = resolvedIds.map(id => nameMap.get(id) ?? id)
    const listVcsType = deriveVcsTypeFromCommits(parseSelectedCommitsFromDb(r.selected_commits))
    const repPath = (r as { rep_source_folder_path?: string | null }).rep_source_folder_path ?? null
    return {
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      userCode: r.user_code,
      projectId: resolvedIds[0] ?? null,
      projectName: resolvedIds[0] ? nameMap.get(resolvedIds[0]) ?? null : null,
      projectIds: resolvedIds,
      projectNames,
      reportDate: r.report_date,
      workDescription: r.work_description,
      selectedCommitsCount,
      sourceFolderPath: repPath,
      vcsType: listVcsType,
      createdAt: r.created_at,
    }
  })
}

export async function listDailyReportsForPlByDateRange(
  dateFrom: string,
  dateTo: string,
  projectId?: string | null
): Promise<DailyReportListItem[]> {
  const fromStr = String(dateFrom).trim().substring(0, 10)
  const toStr = String(dateTo).trim().substring(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    return []
  }
  let sql = `
    SELECT dr.id, dr.user_id, u.name AS user_name, u.user_code, dr.project_ids,
           dr.report_date, dr.work_description, dr.selected_commits, dr.created_at,
           (SELECT upsf.source_folder_path FROM daily_report_source_folders drsf
            INNER JOIN user_project_source_folder upsf ON upsf.id = drsf.user_project_source_folder_id
            WHERE drsf.daily_report_id = dr.id ORDER BY drsf.sort_order ASC LIMIT 1) AS rep_source_folder_path
    FROM daily_reports dr
    JOIN users u ON u.id = dr.user_id
    WHERE dr.report_date BETWEEN ? AND ?
  `
  const params: (string | null)[] = [fromStr, toStr]
  if (projectId) {
    sql += ` AND JSON_CONTAINS(COALESCE(dr.project_ids, JSON_ARRAY()), JSON_QUOTE(?), '$') = 1`
    params.push(projectId)
  }
  sql += ' ORDER BY dr.report_date DESC, u.name ASC'

  const rows = await query<
    {
      id: string
      user_id: string
      user_name: string
      user_code: string
      project_ids: string | unknown[] | null
      report_date: string
      work_description: string | null
      selected_commits: string | unknown[] | null
      created_at: string
      rep_source_folder_path: string | null
    }[]
  >(sql, params)

  if (!Array.isArray(rows)) return []

  const allIds = new Set<string>()
  for (const r of rows) {
    for (const id of parseProjectIds((r as { project_ids?: unknown }).project_ids)) allIds.add(id)
  }
  const nameMap = await getProjectNamesByIds([...allIds])

  return rows.map(r => {
    const selectedCommitsCount = countSelectedCommitsRaw(r.selected_commits)
    const resolvedIds = parseProjectIds((r as { project_ids?: unknown }).project_ids)
    const projectNames = resolvedIds.map(id => nameMap.get(id) ?? id)
    const listVcsType = deriveVcsTypeFromCommits(parseSelectedCommitsFromDb(r.selected_commits))
    const repPath = (r as { rep_source_folder_path?: string | null }).rep_source_folder_path ?? null
    return {
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      userCode: r.user_code,
      projectId: resolvedIds[0] ?? null,
      projectName: resolvedIds[0] ? nameMap.get(resolvedIds[0]) ?? null : null,
      projectIds: resolvedIds,
      projectNames,
      reportDate: r.report_date,
      workDescription: r.work_description,
      selectedCommitsCount,
      sourceFolderPath: repPath,
      vcsType: listVcsType,
      createdAt: r.created_at,
    }
  })
}

export interface DailyReportHistoryItem {
  id: string
  reportDate: string
  projectId: string | null
  projectName: string | null
  projectIds: string[]
  projectNames: string[]
  workDescription: string | null
  selectedCommitsCount: number
  createdAt: string
}

export async function getDailyReportHistoryByUser(
  userId: string,
  dateFrom: string,
  dateTo: string,
  limit?: number,
  offset?: number
): Promise<DailyReportHistoryItem[]> {
  if (!userId || !dateFrom || !dateTo) {
    return []
  }
  const fromStr = String(dateFrom).trim().substring(0, 10)
  const toStr = String(dateTo).trim().substring(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    return []
  }
  let sql = `
    SELECT dr.id, dr.report_date, dr.project_ids,
           dr.work_description, dr.selected_commits, dr.created_at
    FROM daily_reports dr
    WHERE dr.user_id = ? AND dr.report_date BETWEEN ? AND ?
    ORDER BY dr.report_date DESC
  `
  const params: (string | number)[] = [userId, fromStr, toStr]
  if (limit != null) {
    const limitNum = Math.max(0, Math.floor(Number(limit)))
    sql += ` LIMIT ${limitNum}`
  }
  if (offset != null) {
    const offsetNum = Math.max(0, Math.floor(Number(offset)))
    sql += ` OFFSET ${offsetNum}`
  }

  const rows = await query<
    {
      id: string
      report_date: string
      project_ids: string | unknown[] | null
      work_description: string | null
      selected_commits: string | unknown[] | null
      created_at: string
    }[]
  >(sql, params)

  if (!Array.isArray(rows)) return []

  const allIds = new Set<string>()
  for (const r of rows) {
    for (const id of parseProjectIds((r as { project_ids?: unknown }).project_ids)) allIds.add(id)
  }
  const nameMap = await getProjectNamesByIds([...allIds])

  return rows.map(r => {
    const selectedCommitsCount = countSelectedCommitsRaw(r.selected_commits)
    const resolvedIds = parseProjectIds((r as { project_ids?: unknown }).project_ids)
    const projectNames = resolvedIds.map(id => nameMap.get(id) ?? id)
    return {
      id: r.id,
      reportDate: r.report_date,
      projectId: resolvedIds[0] ?? null,
      projectName: resolvedIds[0] ? nameMap.get(resolvedIds[0]) ?? null : null,
      projectIds: resolvedIds,
      projectNames,
      workDescription: r.work_description,
      selectedCommitsCount,
      createdAt: r.created_at,
    }
  })
}

export interface ReportStatistics {
  reportDate: string
  projectId: string | null
  projectName: string | null
  totalDevs: number
  reportedCount: number
  reportedDevs: { userId: string; userName: string; userCode: string }[]
  notReportedDevs: { userId: string; userName: string; userCode: string }[]
  reportRatePercent: number
  missedDaysStats: { userId: string; userName: string; userCode: string; missedDates: string[] }[]
  /** Khi dùng date range: group reported theo ngày */
  reportedByDate?: { date: string; users: { userId: string; userName: string; userCode: string }[] }[]
  /** Khi dùng date range: group not reported theo ngày */
  notReportedByDate?: { date: string; users: { userId: string; userName: string; userCode: string }[] }[]
  /** Khi dùng date range: dateFrom và dateTo */
  dateFrom?: string
  dateTo?: string
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Format ngày theo calendar local (YYYY-MM-DD), tránh lệch múi giờ khi DB trả về Date. */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Chuẩn hóa report_date từ DB (Date hoặc string) thành 'YYYY-MM-DD' để dùng làm key trong Map/Set. Dùng local date để khớp với List. */
function normalizeReportDateKey(value: unknown): string {
  if (value instanceof Date) return toLocalDateStr(value)
  return String(value ?? '').trim().slice(0, 10)
}

export async function getReportStatistics(
  reportDate: string,
  projectId: string
): Promise<ReportStatistics> {
  const members = await getProjectMembers(projectId)
  const devs = members.devs

  const projRows = await query<{ name: string }[]>(
    'SELECT name FROM projects WHERE id = ? LIMIT 1',
    [projectId]
  )
  const projectName = projRows?.[0]?.name ?? null

  if (devs.length === 0) {
    return {
      reportDate,
      projectId,
      projectName,
      totalDevs: 0,
      reportedCount: 0,
      reportedDevs: [],
      notReportedDevs: [],
      reportRatePercent: 0,
      missedDaysStats: [],
    }
  }

  const reports = await listDailyReportsForPl(reportDate, projectId)
  const reportedUserIds = new Set(reports.map(r => r.userId))
  const reportedDevs = devs.filter(d => reportedUserIds.has(d.userId))
  const notReportedDevs = devs.filter(d => !reportedUserIds.has(d.userId))
  const reportRatePercent = (reportedDevs.length / devs.length) * 100

  const dateTo = new Date(`${reportDate}T12:00:00Z`)
  const dateFrom = new Date(dateTo)
  dateFrom.setUTCDate(dateFrom.getUTCDate() - 30)
  const fromStr = toDateStr(dateFrom)
  const toStr = toDateStr(dateTo)

  const devIds = devs.map(d => d.userId)
  const placeholders = devIds.map(() => '?').join(',')
  const reportRows = await query<{ user_id: string; report_date: string }[]>(
    `SELECT user_id, report_date FROM daily_reports
     WHERE user_id IN (${placeholders}) AND report_date BETWEEN ? AND ?
     AND JSON_CONTAINS(COALESCE(project_ids, JSON_ARRAY()), JSON_QUOTE(?), '$') = 1`,
    [...devIds, fromStr, toStr, projectId]
  )

  const reportedByUser = new Map<string, Set<string>>()
  for (const r of reportRows || []) {
    const dateKey = normalizeReportDateKey(r.report_date)
    if (!reportedByUser.has(r.user_id)) {
      reportedByUser.set(r.user_id, new Set())
    }
    reportedByUser.get(r.user_id)?.add(dateKey)
  }

  const dateFromLocal = parseISO(fromStr)
  const dateToLocal = parseISO(toStr)
  const missedDaysStats: ReportStatistics['missedDaysStats'] = []
  for (const d of devs) {
    const reportedDates = reportedByUser.get(d.userId) ?? new Set()
    const missed: string[] = []
    const cur = new Date(dateFromLocal)
    while (cur <= dateToLocal) {
      const dStr = toLocalDateStr(cur)
      const day = cur.getDay()
      if (day !== 0 && day !== 6 && !reportedDates.has(dStr)) {
        missed.push(dStr)
      }
      cur.setDate(cur.getDate() + 1)
    }
    missedDaysStats.push({
      userId: d.userId,
      userName: d.name,
      userCode: d.userCode,
      missedDates: missed,
    })
  }

  return {
    reportDate,
    projectId,
    projectName,
    totalDevs: devs.length,
    reportedCount: reportedDevs.length,
    reportedDevs: reportedDevs.map(d => ({ userId: d.userId, userName: d.name, userCode: d.userCode })),
    notReportedDevs: notReportedDevs.map(d => ({ userId: d.userId, userName: d.name, userCode: d.userCode })),
    reportRatePercent,
    missedDaysStats,
  }
}

export async function getReportStatisticsByDateRange(
  dateFrom: string,
  dateTo: string,
  projectId: string
): Promise<ReportStatistics> {
  const fromStr = String(dateFrom).trim().substring(0, 10)
  const toStr = String(dateTo).trim().substring(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    return {
      reportDate: fromStr,
      projectId,
      projectName: null,
      totalDevs: 0,
      reportedCount: 0,
      reportedDevs: [],
      notReportedDevs: [],
      reportRatePercent: 0,
      missedDaysStats: [],
      dateFrom: fromStr,
      dateTo: toStr,
    }
  }

  const members = await getProjectMembers(projectId)
  const devs = members.devs

  const projRows = await query<{ name: string }[]>(
    'SELECT name FROM projects WHERE id = ? LIMIT 1',
    [projectId]
  )
  const projectName = projRows?.[0]?.name ?? null

  if (devs.length === 0) {
    return {
      reportDate: fromStr,
      projectId,
      projectName,
      totalDevs: 0,
      reportedCount: 0,
      reportedDevs: [],
      notReportedDevs: [],
      reportRatePercent: 0,
      missedDaysStats: [],
      reportedByDate: [],
      notReportedByDate: [],
      dateFrom: fromStr,
      dateTo: toStr,
    }
  }

  const devIds = devs.map(d => d.userId)
  const placeholders = devIds.map(() => '?').join(',')
  const reportRows = await query<{ user_id: string; report_date: string }[]>(
    `SELECT user_id, report_date FROM daily_reports
     WHERE user_id IN (${placeholders}) AND report_date BETWEEN ? AND ?
     AND JSON_CONTAINS(COALESCE(project_ids, JSON_ARRAY()), JSON_QUOTE(?), '$') = 1`,
    [...devIds, fromStr, toStr, projectId]
  )
  if (process.env.NODE_ENV !== 'production' && reportRows?.length) {
    console.debug('[getReportStatisticsByDateRange] reportRows.length', reportRows.length, 'report_date sample type', typeof reportRows[0]?.report_date)
  }

  const reportedByUser = new Map<string, Set<string>>()
  const reportedByDateMap = new Map<string, Set<string>>()
  for (const r of reportRows || []) {
    const dateKey = normalizeReportDateKey(r.report_date)
    if (!reportedByUser.has(r.user_id)) {
      reportedByUser.set(r.user_id, new Set())
    }
    reportedByUser.get(r.user_id)?.add(dateKey)
    if (!reportedByDateMap.has(dateKey)) {
      reportedByDateMap.set(dateKey, new Set())
    }
    reportedByDateMap.get(dateKey)?.add(r.user_id)
  }

  const reportedUserIdsInRange = new Set((reportRows || []).map(r => r.user_id))
  const reportedDevs = devs.filter(d => reportedUserIdsInRange.has(d.userId))
  const notReportedDevs = devs.filter(d => !reportedUserIdsInRange.has(d.userId))

  const dateFromObj = parseISO(fromStr)
  const dateToObj = parseISO(toStr)

  const reportedByDate: { date: string; users: { userId: string; userName: string; userCode: string }[] }[] = []
  const notReportedByDate: { date: string; users: { userId: string; userName: string; userCode: string }[] }[] = []

  const cur = new Date(dateFromObj)

  while (cur <= dateToObj) {
    const dStr = toLocalDateStr(cur)
    const day = cur.getDay()
    if (day !== 0 && day !== 6) {
      const reportedUserIds = reportedByDateMap.get(dStr) ?? new Set()
      const reportedUsers = devs.filter(d => reportedUserIds.has(d.userId))
      const notReportedUsers = devs.filter(d => !reportedUserIds.has(d.userId))
      reportedByDate.push({
        date: dStr,
        users: reportedUsers.map(d => ({ userId: d.userId, userName: d.name, userCode: d.userCode })),
      })
      notReportedByDate.push({
        date: dStr,
        users: notReportedUsers.map(d => ({ userId: d.userId, userName: d.name, userCode: d.userCode })),
      })
    }
    cur.setDate(cur.getDate() + 1)
  }
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[getReportStatisticsByDateRange] reportedByDate.length', reportedByDate.length)
  }

  const missedDaysStats: ReportStatistics['missedDaysStats'] = []
  for (const d of devs) {
    const reportedDates = reportedByUser.get(d.userId) ?? new Set()
    const missed: string[] = []
    const cur2 = new Date(dateFromObj)
    while (cur2 <= dateToObj) {
      const dStr = toLocalDateStr(cur2)
      const day = cur2.getDay()
      if (day !== 0 && day !== 6 && !reportedDates.has(dStr)) {
        missed.push(dStr)
      }
      cur2.setDate(cur2.getDate() + 1)
    }
    missedDaysStats.push({
      userId: d.userId,
      userName: d.name,
      userCode: d.userCode,
      missedDates: missed,
    })
  }

  const reportRatePercent = devs.length > 0 ? (reportedDevs.length / devs.length) * 100 : 0

  return {
    reportDate: fromStr,
    projectId,
    projectName,
    totalDevs: devs.length,
    reportedCount: reportedDevs.length,
    reportedDevs: reportedDevs.map(d => ({ userId: d.userId, userName: d.name, userCode: d.userCode })),
    notReportedDevs: notReportedDevs.map(d => ({ userId: d.userId, userName: d.name, userCode: d.userCode })),
    reportRatePercent,
    missedDaysStats,
    reportedByDate,
    notReportedByDate,
    dateFrom: fromStr,
    dateTo: toStr,
  }
}
