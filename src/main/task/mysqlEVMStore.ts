import { EVM_DEFAULT_PHASES } from 'shared/evmDefaults'
import { randomUuidV7 } from 'shared/randomUuidV7'
import type {
  ACRow,
  EVMData,
  EVMMaster,
  EVMMasterUpdatePayload,
  EVMProject,
  EvmProjectRoleUser,
  WBSRow,
  WbsDayUnitRow,
  WbsMasterRow,
} from 'shared/types/evm'
import { query, withTransaction } from './db'
import { migrateProjectsDropLegacyPmPlColumns } from './taskDbPatches'

const PROJECT_SELECT_SQL =
  'SELECT id, name as project_name, project_no, end_user, start_date, end_date, report_date FROM projects'

const DEFAULT_PHASES = EVM_DEFAULT_PHASES.map(p => ({ code: p.code, name: p.name }))

/** Khớp EVM_Tool.txt (mục 6). */
const DEFAULT_STATUSES = [
  { code: 'new', name: 'New' },
  { code: 'in_progress', name: 'In Progress' },
  { code: 'resolved', name: 'Resolved' },
  { code: 'feedback', name: 'Feedback' },
  { code: 'closed', name: 'Closed' },
  { code: 'rejected', name: 'Rejected' },
]

/** Progress 0…100% bước 10 — lưu JSON 0…1. */
const DEFAULT_PERCENT_DONE = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]

function parsePercentDoneOptionsJson(raw: unknown): number[] | null {
  if (raw == null || raw === '') return null
  let v: unknown = raw
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw) as unknown
    } catch {
      return null
    }
  }
  if (!Array.isArray(v)) return null
  const nums = v
    .map(x => Number(x))
    .filter(x => Number.isFinite(x) && x >= 0 && x <= 1)
  if (nums.length === 0) return null
  return [...new Set(nums)].sort((a, b) => a - b)
}

function parseIssueImportMapJson(raw: unknown): EVMMaster['issueImportMap'] | undefined {
  if (raw == null || raw === '') return undefined
  let v: unknown = raw
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw) as unknown
    } catch {
      return undefined
    }
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' && val.trim()) out[k] = val.trim().toUpperCase().slice(0, 8)
  }
  return Object.keys(out).length ? (out as EVMMaster['issueImportMap']) : undefined
}

/**
 * Chuỗi ngày YYYY-MM-DD cho UI / khớp lưới local — không dùng toISOString (UTC),
 * vì MySQL DATE + timezone có thể lệch 1 ngày so với ngày lịch người dùng.
 */
function toDateStr(val: Date | string | null | undefined): string {
  if (val == null || val === '') return ''
  if (typeof val === 'string') {
    const s = val.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s.length >= 10 ? s.slice(0, 10) : ''
    return dateToLocalYmd(d)
  }
  return dateToLocalYmd(val)
}

function dateToLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mapProject(row: Record<string, unknown>): EVMProject {
  const endRaw = row.end_user
  return {
    id: String(row.id ?? ''),
    projectNo: row.project_no != null ? String(row.project_no) : undefined,
    projectName: String(row.project_name ?? row.name ?? ''),
    endUser: endRaw != null ? String(endRaw) : undefined,
    startDate: toDateStr(row.start_date as string),
    endDate: toDateStr(row.end_date as string),
    reportDate: toDateStr(row.report_date as string),
  }
}

/** PM/PL từ `user_project_roles` (chip trong UI). */
export async function listEvmProjectPmPlUsers(projectId: string): Promise<EvmProjectRoleUser[]> {
  const rows = await query<{ user_id: string; user_code: string; name: string; role: string }[]>(
    `SELECT u.id as user_id, u.user_code, u.name, upr.role
     FROM user_project_roles upr
     INNER JOIN users u ON u.id = upr.user_id
     WHERE upr.project_id = ? AND upr.role IN ('pm','pl')
     ORDER BY upr.role, u.name`,
    [projectId],
  )
  return (rows ?? []).map(r => ({
    userId: String(r.user_id),
    name: r.name != null ? String(r.name) : undefined,
    userCode: r.user_code != null ? String(r.user_code) : undefined,
    role: r.role === 'pm' ? 'pm' : 'pl',
  }))
}

/** Chi tiết WBS: percent_done trong DB 0..1 hoặc 0..100 (legacy). */
function normalizeDetailPercentDone(raw: unknown): number {
  const n = Number(raw ?? 0)
  if (!Number.isFinite(n)) return 0
  if (n > 1) return Math.min(1, n / 100)
  return Math.min(1, Math.max(0, n))
}

function percentDoneToDb(ui: number | null | undefined): number {
  if (ui == null || !Number.isFinite(ui)) return 0
  const n = ui > 1 ? ui / 100 : ui
  return Math.min(1, Math.max(0, n))
}

function mapWbsMaster(row: Record<string, unknown>): WbsMasterRow {
  return {
    id: String(row.id ?? ''),
    projectId: String(row.project_id ?? ''),
    sortNo: Number(row.sort_no ?? 0),
    phase: row.phase != null ? String(row.phase) : undefined,
    category: row.category != null ? String(row.category) : undefined,
    feature: row.feature != null ? String(row.feature) : undefined,
    note: row.note != null ? String(row.note) : undefined,
    planStartDate: row.plan_start_date ? toDateStr(row.plan_start_date as string) : undefined,
    planEndDate: row.plan_end_date ? toDateStr(row.plan_end_date as string) : undefined,
    actualStartDate: row.actual_start_date ? toDateStr(row.actual_start_date as string) : undefined,
    actualEndDate: row.actual_end_date ? toDateStr(row.actual_end_date as string) : undefined,
    assignee: row.assignee_user_id != null ? String(row.assignee_user_id) : undefined,
    assigneeName: row.assignee_name != null ? String(row.assignee_name) : undefined,
    bac: row.bac != null ? Number(row.bac) : undefined,
    pv: row.pv != null ? Number(row.pv) : undefined,
    ev: row.ev != null ? Number(row.ev) : undefined,
    sv: row.sv != null ? Number(row.sv) : undefined,
    spi: row.spi != null ? Number(row.spi) : undefined,
    progress: row.progress != null ? normalizeDetailPercentDone(row.progress) : undefined,
  }
}

function parseJsonStringRecord(raw: unknown): Record<string, string> {
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw) as unknown
      return parseJsonStringRecord(o)
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v != null && String(v).trim() !== '') out[k] = String(v)
    }
    return out
  }
  return {}
}

function mapWbsDetail(row: Record<string, unknown>): WBSRow {
  const pred = row.predecessor
  return {
    id: String(row.id ?? ''),
    projectId: String(row.project_id ?? ''),
    masterId: String(row.evm_wbs_master_id ?? ''),
    no: Number(row.no ?? 0),
    phase: row.phase != null ? String(row.phase) : undefined,
    category: row.category != null ? String(row.category) : undefined,
    feature: row.feature != null ? String(row.feature) : undefined,
    task: row.task != null ? String(row.task) : undefined,
    planStartDate: row.plan_start_date ? toDateStr(row.plan_start_date as string) : undefined,
    planEndDate: row.plan_end_date ? toDateStr(row.plan_end_date as string) : undefined,
    actualStartDate: row.actual_start_date ? toDateStr(row.actual_start_date as string) : undefined,
    actualEndDate: row.actual_end_date ? toDateStr(row.actual_end_date as string) : undefined,
    assignee: (row.assignee_user_id ?? row.assignee) != null ? String(row.assignee_user_id ?? row.assignee) : undefined,
    assigneeName: row.assignee_name != null ? String(row.assignee_name) : undefined,
    percentDone: normalizeDetailPercentDone(row.progress ?? row.percent_done),
    status: row.status != null ? String(row.status) : undefined,
    statusName: row.status_name != null ? String(row.status_name) : undefined,
    bac: row.bac != null ? Number(row.bac) : undefined,
    wbsNote: row.wbs_note != null ? String(row.wbs_note) : undefined,
    durationDays: row.duration_days != null && row.duration_days !== '' ? Number(row.duration_days) : null,
    predecessor: pred != null && pred !== '' ? String(pred) : undefined,
    effort: row.effort != null && row.effort !== '' ? Number(row.effort) : null,
    estMd: row.est_md != null && row.est_md !== '' ? Number(row.est_md) : null,
  }
}

function mapAc(row: Record<string, unknown>): ACRow {
  return {
    id: String(row.id ?? ''),
    projectId: String(row.project_id ?? ''),
    no: Number(row.no ?? 0),
    date: row.date ? toDateStr(row.date as string) : undefined,
    phase: row.phase != null ? String(row.phase) : undefined,
    category: row.category != null ? String(row.category) : undefined,
    feature: row.feature != null ? String(row.feature) : undefined,
    task: row.task != null ? String(row.task) : undefined,
    planStartDate: row.plan_start_date ? toDateStr(row.plan_start_date as string) : undefined,
    planEndDate: row.plan_end_date ? toDateStr(row.plan_end_date as string) : undefined,
    actualStartDate: row.actual_start_date ? toDateStr(row.actual_start_date as string) : undefined,
    actualEndDate: row.actual_end_date ? toDateStr(row.actual_end_date as string) : undefined,
    percentDone:
      row.percent_done != null && row.percent_done !== '' ? normalizeDetailPercentDone(row.percent_done) : undefined,
    assignee: row.assignee != null ? String(row.assignee) : undefined,
    workingHours: Number(row.working_hours ?? 0),
    workContents: row.work_contents != null ? String(row.work_contents) : undefined,
  }
}

type EvmAssigneeEntry = { code: string; name?: string; userCode?: string }

/** Thành viên dự án (`user_project_roles` → users): danh sách Assignee cho EVM. */
async function fetchProjectMemberAssignees(projectId: string): Promise<EvmAssigneeEntry[]> {
  const rows = await query<{ id: string; user_code: string; name: string }[]>(
    `SELECT DISTINCT u.id, u.user_code, u.name
     FROM user_project_roles upr
     INNER JOIN users u ON u.id = upr.user_id
     WHERE upr.project_id = ?`,
    [projectId],
  )
  return (rows ?? []).map(u => ({
    code: String(u.id),
    name: u.name != null ? String(u.name) : undefined,
    userCode: u.user_code != null ? String(u.user_code) : undefined,
  }))
}

async function attachProjectAssignees(master: EVMMaster, projectId: string): Promise<EVMMaster> {
  const assignees = await fetchProjectMemberAssignees(projectId)
  return { ...master, assignees }
}

function mapMaster(row: Record<string, unknown>): EVMMaster {
  const phases = (row.phases as unknown[]) ?? DEFAULT_PHASES
  const statuses = (row.statuses as unknown[]) ?? DEFAULT_STATUSES
  const nonWorkingDays = (row.non_working_days as unknown[]) ?? []
  return {
    projectId: String(row.project_id ?? ''),
    phases: Array.isArray(phases)
      ? phases.map((p: unknown) =>
        typeof p === 'object' && p && 'code' in p ? { code: String((p as { code: string }).code), name: (p as { name?: string }).name } : { code: String(p) }
      )
      : DEFAULT_PHASES,
    assignees: [],
    statuses: Array.isArray(statuses)
      ? statuses.map((s: unknown) =>
        typeof s === 'object' && s && 'code' in s ? { code: String((s as { code: string }).code), name: (s as { name?: string }).name } : { code: String(s) }
      )
      : DEFAULT_STATUSES,
    nonWorkingDays: Array.isArray(nonWorkingDays)
      ? nonWorkingDays.map((n: unknown) =>
        typeof n === 'object' && n && 'date' in n ? { date: String((n as { date: string }).date), note: (n as { note?: string }).note } : { date: String(n) }
      )
      : [],
    hoursPerDay: row.hours_per_day != null ? Number(row.hours_per_day) : 8,
    phaseReportNotes: parseJsonStringRecord(row.phase_report_notes),
    assigneeReportNotes: parseJsonStringRecord(row.assignee_report_notes),
    percentDoneOptions: parsePercentDoneOptionsJson(row.percent_done_options) ?? [...DEFAULT_PERCENT_DONE],
    issueImportMap: parseIssueImportMapJson(row.issue_import_map),
  }
}

async function seedProjectPhasesFromDefaults(projectId: string): Promise<void> {
  let ord = 0
  for (const p of DEFAULT_PHASES) {
    await query(
      'INSERT IGNORE INTO evm_phases (project_id, code, name, sort_order) VALUES (?, ?, ?, ?)',
      [projectId, p.code, p.name ?? p.code, ord++]
    )
  }
}

type WbsDetailInput = Omit<WBSRow, 'id' | 'projectId' | 'no'> & { masterId?: string }

export async function getEVMData(projectId?: string): Promise<EVMData | null> {
  await migrateProjectsDropLegacyPmPlColumns()
  let project: EVMProject | null = null
  const projSql = `${PROJECT_SELECT_SQL} WHERE `
  if (projectId) {
    const rows = await query<Record<string, unknown>[]>(`${projSql} id = ?`, [projectId])
    project = rows?.[0] ? mapProject(rows[0]) : null
  }
  if (!project) {
    const rows = await query<Record<string, unknown>[]>(
      `${projSql} start_date IS NOT NULL ORDER BY updated_at DESC LIMIT 1`
    )
    project = rows?.[0] ? mapProject(rows[0]) : null
  }
  if (!project) return null

  const [masterWbsRows, wbsRows, acRows, masterRows, dayUnitRows] = await Promise.all([
    query<Record<string, unknown>[]>(
      `SELECT m.*, u.name as assignee_name FROM evm_wbs_master m
       LEFT JOIN users u ON m.assignee_user_id = u.id
       WHERE m.project_id = ? ORDER BY m.sort_no ASC, m.id ASC`,
      [project.id]
    ),
    query<Record<string, unknown>[]>(
      `SELECT w.*, ts.name as status_name, u.name as assignee_name FROM evm_wbs_details w
       LEFT JOIN task_statuses ts ON w.status = ts.code
       LEFT JOIN users u ON w.assignee_user_id = u.id
       WHERE w.project_id = ? ORDER BY w.no ASC`,
      [project.id]
    ),
    query<Record<string, unknown>[]>('SELECT * FROM evm_ac WHERE project_id = ? ORDER BY no', [project.id]),
    query<Record<string, unknown>[]>('SELECT * FROM evm_master WHERE project_id = ?', [project.id]),
    query<{ wbs_id: string; work_date: string | Date; unit: number }[]>(
      `SELECT d.wbs_id, d.work_date, d.unit FROM evm_wbs_day_unit d
       INNER JOIN evm_wbs_details w ON w.id = d.wbs_id AND w.project_id = ?
       ORDER BY d.wbs_id, d.work_date`,
      [project.id]
    ),
  ])

  const wbsMaster = (masterWbsRows ?? []).map(mapWbsMaster)
  const wbs = (wbsRows ?? []).map(mapWbsDetail)
  const ac = (acRows ?? []).map(mapAc)
  let master = masterRows?.[0]
    ? mapMaster(masterRows[0])
    : {
      projectId: project.id,
      phases: [...DEFAULT_PHASES],
      assignees: [] as { code: string; name?: string; userCode?: string }[],
      statuses: [...DEFAULT_STATUSES],
      percentDoneOptions: [...DEFAULT_PERCENT_DONE],
      nonWorkingDays: [],
      hoursPerDay: 8,
      phaseReportNotes: {},
      assigneeReportNotes: {},
    }

  master = await attachProjectAssignees(master, project.id)

  const wbsDayUnits: WbsDayUnitRow[] = (dayUnitRows ?? []).map(r => ({
    wbsId: String(r.wbs_id),
    workDate: toDateStr(r.work_date as string),
    unit: Number(r.unit ?? 0),
  }))

  return { project, wbsMaster, wbs, ac, master, wbsDayUnits }
}

/** Đảm bảo project có EVM setup (start_date, evm_master). Dùng khi import vào project từ Task Management. */
export async function ensureProjectForEvm(projectId: string): Promise<EVMProject> {
  await migrateProjectsDropLegacyPmPlColumns()
  const rows = await query<Record<string, unknown>[]>('SELECT id, name, start_date FROM projects WHERE id = ?', [projectId])
  const row = rows?.[0]
  if (!row) throw new Error('Project not found')
  const today = new Date().toISOString().slice(0, 10)
  const start = new Date()
  start.setMonth(start.getMonth() - 3)
  const end = new Date()
  end.setMonth(end.getMonth() + 3)
  if (!row.start_date) {
    await query('UPDATE projects SET start_date = ?, end_date = ?, report_date = ? WHERE id = ?', [
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
      today,
      projectId,
    ])
  }
  const masterRows = await query<Record<string, unknown>[]>('SELECT 1 FROM evm_master WHERE project_id = ?', [projectId])
  if (!masterRows?.length) {
    await query(
      'INSERT INTO evm_master (project_id, phases, statuses, non_working_days, hours_per_day, phase_report_notes, assignee_report_notes, percent_done_options, issue_import_map) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        projectId,
        JSON.stringify(DEFAULT_PHASES),
        JSON.stringify(DEFAULT_STATUSES),
        JSON.stringify([]),
        8,
        null,
        null,
        JSON.stringify(DEFAULT_PERCENT_DONE),
        null,
      ]
    )
    await seedProjectPhasesFromDefaults(projectId)
  }
  const projRows = await query<Record<string, unknown>[]>(`${PROJECT_SELECT_SQL} WHERE id = ?`, [projectId])
  return mapProject(projRows?.[0])
}

export async function getProjects(): Promise<EVMProject[]> {
  const rows = await query<Record<string, unknown>[]>(
    `${PROJECT_SELECT_SQL} WHERE start_date IS NOT NULL ORDER BY updated_at DESC`
  )
  return (rows ?? []).map(mapProject)
}

/**
 * Create project - EVM flow (full metadata + evm_master).
 * For Task Management minimal projects, use mysqlTaskStore.createProject.
 */
export async function createProject(input: Partial<EVMProject>): Promise<EVMProject> {
  const id = input.id ?? randomUuidV7()
  const today = new Date().toISOString().slice(0, 10)
  const start = input.startDate ?? today
  const end = input.endDate ?? today
  const report = input.reportDate ?? today

  const name = input.projectName ?? 'New Project'
  const endUser = (input as Partial<EVMProject & { customerName?: string }>).endUser ?? (input as { customerName?: string }).customerName
  await query(
    `INSERT INTO projects (id, name, project_no, end_user, start_date, end_date, report_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, name, input.projectNo ?? null, endUser ?? null, start, end, report]
  )
  const rows = await query<Record<string, unknown>[]>(`${PROJECT_SELECT_SQL} WHERE id = ?`, [id])
  const project = mapProject(rows?.[0])
  await query(
    'INSERT INTO evm_master (project_id, phases, statuses, non_working_days, hours_per_day, phase_report_notes, assignee_report_notes, percent_done_options, issue_import_map) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, JSON.stringify(DEFAULT_PHASES), JSON.stringify(DEFAULT_STATUSES), JSON.stringify([]), 8, null, null, JSON.stringify(DEFAULT_PERCENT_DONE), null]
  )
  await seedProjectPhasesFromDefaults(id)
  return project
}

/** Cập nhật metadata dự án EVM (bảng `projects`) — khớp EVM_Tool.txt Dashboard. */
export async function updateEvmProject(projectId: string, updates: Partial<EVMProject>): Promise<EVMProject> {
  const setCols: string[] = []
  const vals: unknown[] = []
  if (updates.projectNo !== undefined) {
    setCols.push('project_no = ?')
    vals.push((updates.projectNo ?? '').trim() === '' ? null : String(updates.projectNo).trim())
  }
  if (updates.projectName !== undefined) {
    setCols.push('name = ?')
    const n = String(updates.projectName ?? '').trim()
    vals.push(n === '' ? 'Untitled' : n)
  }
  if (updates.endUser !== undefined) {
    setCols.push('end_user = ?')
    vals.push((updates.endUser ?? '').trim() === '' ? null : String(updates.endUser).trim())
  }
  if (updates.startDate !== undefined) {
    setCols.push('start_date = ?')
    const s = String(updates.startDate ?? '').trim()
    vals.push(s === '' ? null : s.slice(0, 10))
  }
  if (updates.endDate !== undefined) {
    setCols.push('end_date = ?')
    const s = String(updates.endDate ?? '').trim()
    vals.push(s === '' ? null : s.slice(0, 10))
  }
  if (updates.reportDate !== undefined) {
    setCols.push('report_date = ?')
    const s = String(updates.reportDate ?? '').trim()
    vals.push(s === '' ? null : s.slice(0, 10))
  }
  if (setCols.length > 0) {
    vals.push(projectId)
    await query(`UPDATE projects SET ${setCols.join(', ')} WHERE id = ?`, vals)
  }
  const rows = await query<Record<string, unknown>[]>(`${PROJECT_SELECT_SQL} WHERE id = ?`, [projectId])
  if (!rows?.[0]) throw new Error('Project not found')
  return mapProject(rows[0])
}

function parsePredecessorInt(p: string | null | undefined): number | null {
  if (p == null || p === '') return null
  const n = parseInt(String(p).trim(), 10)
  return Number.isFinite(n) ? n : null
}

type SqlExec = (sql: string, params?: unknown[]) => Promise<unknown>

/** Predecessor = số thứ tự WBS (no) trước đó; phải < no hiện tại và tồn tại trong cùng project. */
/**
 * Khi AC và WBS khớp phase+category+feature+task và chỉ có **đúng một** dòng WBS — bổ sung actual/% từ AC
 * nếu các ô WBS còn trống / tiến độ = 0 (tối thiểu EVM_Tool mirror sheet).
 */
async function maybeSyncWbsDetailFromAc(projectId: string, ac: ACRow): Promise<void> {
  const phase = (ac.phase ?? '').trim()
  const category = (ac.category ?? '').trim()
  const feature = (ac.feature ?? '').trim()
  const task = (ac.task ?? ac.workContents ?? '').trim()
  if (!task) return
  const candidates = (await query<Record<string, unknown>[]>(
    `SELECT id, actual_start_date, actual_end_date, progress FROM evm_wbs_details WHERE project_id = ?
     AND COALESCE(phase,'') = ? AND COALESCE(category,'') = ? AND COALESCE(feature,'') = ?
     AND COALESCE(task,'') = ?`,
    [projectId, phase, category, feature, task],
  )) as Record<string, unknown>[]
  if (!candidates || candidates.length !== 1) return
  const w = candidates[0]
  const wbsId = String(w.id)
  const acStart = ac.actualStartDate?.trim()
  const acEnd = ac.actualEndDate?.trim()
  const acPct =
    ac.percentDone != null && Number.isFinite(ac.percentDone) ? percentDoneToDb(ac.percentDone as number) : null
  const hasStart = Boolean((w.actual_start_date as string | null) && String(w.actual_start_date).trim())
  const hasEnd = Boolean((w.actual_end_date as string | null) && String(w.actual_end_date).trim())
  const wProg = w.progress != null ? Number(w.progress) : null
  const pctEmpty = wProg == null || !Number.isFinite(wProg) || wProg < 1e-9

  const patches: string[] = []
  const vals: unknown[] = []
  if (acStart && !hasStart) {
    patches.push('actual_start_date = ?')
    vals.push(acStart.slice(0, 10))
  }
  if (acEnd && !hasEnd) {
    patches.push('actual_end_date = ?')
    vals.push(acEnd.slice(0, 10))
  }
  if (acPct != null && pctEmpty) {
    patches.push('progress = ?')
    vals.push(acPct)
  }
  if (patches.length === 0) return
  vals.push(wbsId)
  await query(`UPDATE evm_wbs_details SET ${patches.join(', ')} WHERE id = ?`, vals)
}

async function assertPredecessorValidTx(
  exec: SqlExec,
  projectId: string,
  rowNo: number,
  predecessor: number | null,
): Promise<void> {
  if (predecessor == null) return
  if (!Number.isInteger(predecessor) || predecessor < 1) {
    throw new Error('Predecessor must be a positive integer (WBS no).')
  }
  if (predecessor >= rowNo) {
    throw new Error('Predecessor must reference an earlier row (smaller No.) in this project.')
  }
  const hit = (await exec(
    'SELECT 1 FROM evm_wbs_details WHERE project_id = ? AND no = ? LIMIT 1',
    [projectId, predecessor],
  )) as Record<string, unknown>[]
  if (!hit?.[0]) {
    throw new Error(`Predecessor No.${predecessor} was not found in this project.`)
  }
}

export async function createWbsRowsBatch(projectId: string, rows: WbsDetailInput[]): Promise<WBSRow[]> {
  if (rows.length === 0) return []
  const result = await withTransaction(async tx => {
    const maxRows = (await tx('SELECT COALESCE(MAX(no), 0) as max_no FROM evm_wbs_details WHERE project_id = ?', [projectId])) as Record<string, unknown>[]
    let no = ((maxRows?.[0]?.max_no as number) ?? 0) + 1
    const ids: string[] = []
    for (const row of rows) {
      const pred = parsePredecessorInt(row.predecessor)
      await assertPredecessorValidTx(tx, projectId, no, pred)
      const masterId =
        row.masterId && row.masterId.trim() !== ''
          ? row.masterId
          : await findOrCreateWbsMasterIdTx(tx, projectId, row.phase, row.category)
      const id = randomUuidV7()
      ids.push(id)
      await tx(
        `INSERT INTO evm_wbs_details (id, project_id, evm_wbs_master_id, no, phase, category, feature, task, duration_days, plan_start_date, plan_end_date, predecessor, actual_start_date, actual_end_date, assignee_user_id, progress, status, effort, est_md, wbs_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          projectId,
          masterId,
          no++,
          row.phase ?? null,
          row.category ?? null,
          row.feature ?? null,
          row.task ?? null,
          row.durationDays ?? null,
          row.planStartDate ?? null,
          row.planEndDate ?? null,
          parsePredecessorInt(row.predecessor),
          row.actualStartDate ?? null,
          row.actualEndDate ?? null,
          row.assignee ?? null,
          percentDoneToDb(row.percentDone),
          row.status ?? null,
          row.effort ?? null,
          row.estMd ?? null,
          row.wbsNote ?? null,
        ]
      )
    }
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(', ')
    const selectRows = (await tx(
      `SELECT w.*, ts.name as status_name, u.name as assignee_name FROM evm_wbs_details w
       LEFT JOIN task_statuses ts ON w.status = ts.code LEFT JOIN users u ON w.assignee_user_id = u.id WHERE w.id IN (${placeholders}) ORDER BY w.no`,
      ids
    )) as Record<string, unknown>[]
    return (selectRows ?? []).map(r => mapWbsDetail(r))
  })
  return result
}

type TxFn = (sql: string, params?: unknown[]) => Promise<unknown>

/** Một dòng Master = gom mọi WBS Detail cùng Phase + Category (không tách theo Feature/Ghi chú). */
async function findOrCreateWbsMasterIdTx(
  tx: TxFn,
  projectId: string,
  phase?: string | null,
  category?: string | null,
): Promise<string> {
  const ph = phase ?? ''
  const cat = category ?? ''
  const rows = (await tx(
    `SELECT id FROM evm_wbs_master WHERE project_id = ? AND COALESCE(phase,'') = ? AND COALESCE(category,'') = ? ORDER BY sort_no ASC, id ASC LIMIT 1`,
    [projectId, ph, cat],
  )) as Record<string, unknown>[]
  if (rows?.[0]?.id) return String(rows[0].id)
  const maxSort = (await tx('SELECT COALESCE(MAX(sort_no), -1) as m FROM evm_wbs_master WHERE project_id = ?', [projectId])) as Record<string, unknown>[]
  const sortNo = Number(maxSort?.[0]?.m ?? -1) + 1
  const id = randomUuidV7()
  await tx(
    `INSERT INTO evm_wbs_master (id, project_id, sort_no, phase, category, feature, note, progress) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, projectId, sortNo, phase || null, category || null, null, null],
  )
  return id
}

export async function createWbsRow(projectId: string, row: WbsDetailInput): Promise<WBSRow> {
  const created = await withTransaction(async tx => {
    const maxRows = (await tx('SELECT COALESCE(MAX(no), 0) as max_no FROM evm_wbs_details WHERE project_id = ?', [projectId])) as Record<string, unknown>[]
    const no = ((maxRows?.[0]?.max_no as number) ?? 0) + 1
    const id = randomUuidV7()
    await assertPredecessorValidTx(tx, projectId, no, parsePredecessorInt(row.predecessor))
    const masterId =
      row.masterId && row.masterId.trim() !== ''
        ? row.masterId
        : await findOrCreateWbsMasterIdTx(tx, projectId, row.phase, row.category)
    await tx(
      `INSERT INTO evm_wbs_details (id, project_id, evm_wbs_master_id, no, phase, category, feature, task, duration_days, plan_start_date, plan_end_date, predecessor, actual_start_date, actual_end_date, assignee_user_id, progress, status, effort, est_md, wbs_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        masterId,
        no,
        row.phase ?? null,
        row.category ?? null,
        row.feature ?? null,
        row.task ?? null,
        row.durationDays ?? null,
        row.planStartDate ?? null,
        row.planEndDate ?? null,
        parsePredecessorInt(row.predecessor),
        row.actualStartDate ?? null,
        row.actualEndDate ?? null,
        row.assignee ?? null,
        percentDoneToDb(row.percentDone),
        row.status ?? null,
        row.effort ?? null,
        row.estMd ?? null,
        row.wbsNote ?? null,
      ]
    )
    const rows = (await tx(
      `SELECT w.*, ts.name as status_name, u.name as assignee_name FROM evm_wbs_details w
       LEFT JOIN task_statuses ts ON w.status = ts.code LEFT JOIN users u ON w.assignee_user_id = u.id WHERE w.id = ?`,
      [id]
    )) as Record<string, unknown>[]
    return mapWbsDetail(rows?.[0])
  })
  return created
}

export async function updateWbsRow(id: string, updates: Partial<WBSRow>): Promise<WBSRow> {
  const pre = (await query<Record<string, unknown>[]>(
    `SELECT project_id, no, predecessor, phase, category, feature, wbs_note FROM evm_wbs_details WHERE id = ?`,
    [id],
  )) as Record<string, unknown>[]
  if (!pre?.[0]) throw new Error('WBS row not found')
  const projectId = String(pre[0].project_id)
  const curNo = Number(pre[0].no)
  const curPred =
    pre[0].predecessor != null && pre[0].predecessor !== ''
      ? parsePredecessorInt(String(pre[0].predecessor))
      : null
  const mergedPred = updates.predecessor !== undefined ? parsePredecessorInt(updates.predecessor as string) : curPred
  await assertPredecessorValidTx(query, projectId, curNo, mergedPred)
  const curPhase = pre[0].phase as string | null | undefined
  const curCategory = pre[0].category as string | null | undefined
  const mergedPhase = updates.phase !== undefined ? (updates.phase as string | null | undefined) : curPhase
  const mergedCategory = updates.category !== undefined ? (updates.category as string | null | undefined) : curCategory
  const masterGroupKeyTouched = updates.phase !== undefined || updates.category !== undefined
  const explicitMaster = updates.masterId !== undefined
  let remappedMasterId: string | null = null
  if (masterGroupKeyTouched && !explicitMaster) {
    remappedMasterId = await withTransaction(async tx =>
      findOrCreateWbsMasterIdTx(tx, projectId, mergedPhase, mergedCategory),
    )
  }

  const cols: string[] = []
  const vals: unknown[] = []
  const map: Record<string, string> = {
    phase: 'phase',
    category: 'category',
    feature: 'feature',
    task: 'task',
    planStartDate: 'plan_start_date',
    planEndDate: 'plan_end_date',
    actualStartDate: 'actual_start_date',
    actualEndDate: 'actual_end_date',
    assignee: 'assignee_user_id',
    percentDone: 'progress',
    status: 'status',
    wbsNote: 'wbs_note',
    durationDays: 'duration_days',
    predecessor: 'predecessor',
    effort: 'effort',
    estMd: 'est_md',
    masterId: 'evm_wbs_master_id',
  }
  const nullableStringCols = new Set([
    'phase',
    'category',
    'feature',
    'task',
    'plan_start_date',
    'plan_end_date',
    'actual_start_date',
    'actual_end_date',
    'assignee_user_id',
    'status',
    'wbs_note',
    'evm_wbs_master_id',
  ])
  const numericNullableCols = new Set(['duration_days', 'effort', 'est_md', 'predecessor'])
  for (const [k, dbCol] of Object.entries(map)) {
    const v = (updates as Record<string, unknown>)[k]
    if (v !== undefined) {
      cols.push(`${dbCol} = ?`)
      if (k === 'percentDone') {
        vals.push(percentDoneToDb(v as number))
      } else if (k === 'predecessor') {
        vals.push(parsePredecessorInt(v as string))
      } else if (numericNullableCols.has(dbCol)) {
        if (v === '' || v == null || (typeof v === 'number' && !Number.isFinite(v))) vals.push(null)
        else vals.push(Number(v))
      } else {
        vals.push(nullableStringCols.has(dbCol) && v === '' ? null : v)
      }
    }
  }
  if (remappedMasterId != null) {
    cols.push('evm_wbs_master_id = ?')
    vals.push(remappedMasterId)
  }
  if (cols.length > 0) {
    vals.push(id)
    await query(`UPDATE evm_wbs_details SET ${cols.join(', ')} WHERE id = ?`, vals)
  }
  const rows = await query<Record<string, unknown>[]>(
    `SELECT w.*, ts.name as status_name, u.name as assignee_name FROM evm_wbs_details w
     LEFT JOIN task_statuses ts ON w.status = ts.code LEFT JOIN users u ON w.assignee_user_id = u.id WHERE w.id = ?`,
    [id]
  )
  if (!rows?.[0]) throw new Error('WBS row not found')
  return mapWbsDetail(rows[0])
}

export type WbsMasterUpdatePayload = {
  phase?: string | null
  category?: string | null
  feature?: string | null
  note?: string | null
  assignee?: string | null
}

/** Cập nhật dòng `evm_wbs_master` và đồng bộ phase/category/feature/wbs_note xuống mọi `evm_wbs_details` cùng master. */
export async function updateWbsMasterRow(
  masterId: string,
  updates: WbsMasterUpdatePayload,
): Promise<{ master: WbsMasterRow; details: WBSRow[] }> {
  const hit = (await query('SELECT 1 as ok FROM evm_wbs_master WHERE id = ? LIMIT 1', [masterId])) as Record<string, unknown>[]
  if (!hit?.[0]) throw new Error('WBS master not found')

  const masterCols: string[] = []
  const masterVals: unknown[] = []
  if (updates.phase !== undefined) {
    masterCols.push('phase = ?')
    masterVals.push(updates.phase === '' || updates.phase == null ? null : String(updates.phase))
  }
  if (updates.category !== undefined) {
    masterCols.push('category = ?')
    masterVals.push(updates.category === '' || updates.category == null ? null : String(updates.category))
  }
  if (updates.feature !== undefined) {
    masterCols.push('feature = ?')
    masterVals.push(updates.feature === '' || updates.feature == null ? null : String(updates.feature))
  }
  if (updates.note !== undefined) {
    masterCols.push('note = ?')
    masterVals.push(updates.note === '' || updates.note == null ? null : String(updates.note))
  }
  if (updates.assignee !== undefined) {
    masterCols.push('assignee_user_id = ?')
    masterVals.push(updates.assignee === '' || updates.assignee == null ? null : String(updates.assignee))
  }
  if (masterCols.length > 0) {
    masterVals.push(masterId)
    await query(`UPDATE evm_wbs_master SET ${masterCols.join(', ')} WHERE id = ?`, masterVals)
  }

  const keySync =
    updates.phase !== undefined ||
    updates.category !== undefined ||
    updates.feature !== undefined ||
    updates.note !== undefined
  if (keySync) {
    const snap = (await query('SELECT phase, category, feature, note FROM evm_wbs_master WHERE id = ?', [
      masterId,
    ])) as Record<string, unknown>[]
    const s = snap?.[0]
    await query(
      'UPDATE evm_wbs_details SET phase = ?, category = ?, feature = ?, wbs_note = ? WHERE evm_wbs_master_id = ?',
      [s?.phase ?? null, s?.category ?? null, s?.feature ?? null, s?.note ?? null, masterId],
    )
  }

  const mrows = await query<Record<string, unknown>[]>(
    `SELECT m.*, u.name as assignee_name FROM evm_wbs_master m
     LEFT JOIN users u ON m.assignee_user_id = u.id WHERE m.id = ?`,
    [masterId],
  )
  if (!mrows?.[0]) throw new Error('WBS master not found')
  const drows = await query<Record<string, unknown>[]>(
    `SELECT w.*, ts.name as status_name, u.name as assignee_name FROM evm_wbs_details w
     LEFT JOIN task_statuses ts ON w.status = ts.code
     LEFT JOIN users u ON w.assignee_user_id = u.id
     WHERE w.evm_wbs_master_id = ? ORDER BY w.no`,
    [masterId],
  )
  return {
    master: mapWbsMaster(mrows[0]),
    details: (drows ?? []).map(mapWbsDetail),
  }
}

export async function deleteWbsRow(id: string): Promise<void> {
  await withTransaction(async tx => {
    type Snap = { id: string; no: number; predecessor: number | null }
    const hit = (await tx('SELECT project_id FROM evm_wbs_details WHERE id = ?', [id])) as Record<string, unknown>[]
    if (!hit?.[0]) return
    const projectId = String(hit[0].project_id)

    const snapshot = (await tx(
      'SELECT id, no, predecessor FROM evm_wbs_details WHERE project_id = ? ORDER BY no ASC',
      [projectId],
    )) as Snap[]
    const noToId = new Map<number, string>()
    for (const s of snapshot) noToId.set(Number(s.no), String(s.id))

    await tx('DELETE FROM evm_wbs_details WHERE id = ?', [id])

    const rem = (await tx(
      'SELECT id, predecessor FROM evm_wbs_details WHERE project_id = ? ORDER BY no ASC',
      [projectId],
    )) as { id: string; predecessor: number | null }[]

    const remIdSet = new Set(rem.map(r => String(r.id)))

    if (rem.length === 0) {
      try {
        await tx(
          'DELETE m FROM evm_wbs_master m LEFT JOIN evm_wbs_details d ON d.evm_wbs_master_id = m.id WHERE m.project_id = ? AND d.id IS NULL',
          [projectId],
        )
      } catch {
        /* ignore */
      }
      return
    }

    const idToNewNo = new Map<string, number>()
    for (let i = 0; i < rem.length; i++) {
      idToNewNo.set(String(rem[i].id), i + 1)
    }

    for (let i = 0; i < rem.length; i++) {
      const r = rem[i]
      let newPred: number | null = null
      const op = r.predecessor
      if (op != null && Number.isFinite(Number(op))) {
        const targetId = noToId.get(Number(op))
        if (targetId && remIdSet.has(targetId)) newPred = idToNewNo.get(targetId) ?? null
      }
      await tx('UPDATE evm_wbs_details SET no = ?, predecessor = ? WHERE id = ?', [i + 1, newPred, r.id])
    }

    try {
      await tx(
        'DELETE m FROM evm_wbs_master m LEFT JOIN evm_wbs_details d ON d.evm_wbs_master_id = m.id WHERE m.project_id = ? AND d.id IS NULL',
        [projectId],
      )
    } catch {
      /* ignore */
    }
  })
}

export async function createAcRow(projectId: string, row: Omit<ACRow, 'id' | 'projectId' | 'no'>): Promise<ACRow> {
  const created = await withTransaction(async tx => {
    const maxRows = (await tx('SELECT COALESCE(MAX(no), 0) as max_no FROM evm_ac WHERE project_id = ?', [projectId])) as Record<string, unknown>[]
    const no = ((maxRows?.[0]?.max_no as number) ?? 0) + 1
    const id = randomUuidV7()
    await tx(
      `INSERT INTO evm_ac (id, project_id, no, date, phase, category, feature, task, plan_start_date, plan_end_date, actual_start_date, actual_end_date, percent_done, assignee, working_hours, work_contents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        no,
        row.date ?? null,
        row.phase ?? null,
        row.category ?? null,
        row.feature ?? null,
        row.task ?? null,
        row.planStartDate ?? null,
        row.planEndDate ?? null,
        row.actualStartDate ?? null,
        row.actualEndDate ?? null,
        row.percentDone != null && Number.isFinite(row.percentDone) ? percentDoneToDb(row.percentDone) : null,
        row.assignee ?? null,
        row.workingHours ?? 0,
        row.workContents ?? null,
      ]
    )
    const rows = (await tx('SELECT * FROM evm_ac WHERE id = ?', [id])) as Record<string, unknown>[]
    return mapAc(rows?.[0])
  })
  await maybeSyncWbsDetailFromAc(projectId, created)
  return created
}

export async function createAcRowsBatch(projectId: string, rows: Omit<ACRow, 'id' | 'projectId' | 'no'>[]): Promise<ACRow[]> {
  if (rows.length === 0) return []
  const created = await withTransaction(async tx => {
    const maxRows = (await tx('SELECT COALESCE(MAX(no), 0) as max_no FROM evm_ac WHERE project_id = ?', [projectId])) as Record<string, unknown>[]
    let no = ((maxRows?.[0]?.max_no as number) ?? 0) + 1
    const ids: string[] = []
    for (const row of rows) {
      const id = randomUuidV7()
      ids.push(id)
      await tx(
        `INSERT INTO evm_ac (id, project_id, no, date, phase, category, feature, task, plan_start_date, plan_end_date, actual_start_date, actual_end_date, percent_done, assignee, working_hours, work_contents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          projectId,
          no++,
          row.date ?? null,
          row.phase ?? null,
          row.category ?? null,
          row.feature ?? null,
          row.task ?? null,
          row.planStartDate ?? null,
          row.planEndDate ?? null,
          row.actualStartDate ?? null,
          row.actualEndDate ?? null,
          row.percentDone != null && Number.isFinite(row.percentDone) ? percentDoneToDb(row.percentDone) : null,
          row.assignee ?? null,
          row.workingHours ?? 0,
          row.workContents ?? null,
        ]
      )
    }
    const placeholders = ids.map(() => '?').join(', ')
    const selectRows = (await tx(`SELECT * FROM evm_ac WHERE id IN (${placeholders}) ORDER BY no`, ids)) as Record<string, unknown>[]
    return (selectRows ?? []).map(r => mapAc(r))
  })
  for (const ac of created) await maybeSyncWbsDetailFromAc(projectId, ac)
  return created
}

/** Phase: ưu tiên bảng evm_phases; fallback JSON evm_master. */
export async function getEvmMasterPhases(projectId: string): Promise<{ code: string; name?: string }[]> {
  const tableRows = await query<{ code: string; name: string }[]>(
    'SELECT code, name FROM evm_phases WHERE project_id = ? ORDER BY sort_order ASC, code ASC',
    [projectId]
  )
  if (tableRows?.length) {
    return tableRows.map(r => ({ code: r.code, name: r.name }))
  }
  const rows = await query<Record<string, unknown>[]>('SELECT phases FROM evm_master WHERE project_id = ?', [projectId])
  const raw = rows?.[0]?.phases
  const phases = (raw as unknown[]) ?? DEFAULT_PHASES
  if (!Array.isArray(phases) || phases.length === 0) {
    return DEFAULT_PHASES.map(p => ({ code: p.code, name: p.name }))
  }
  return phases.map((p: unknown) =>
    typeof p === 'object' && p && 'code' in p
      ? { code: String((p as { code: string }).code), name: (p as { name?: string }).name }
      : { code: String(p) }
  )
}

async function syncEvmPhasesTableFromPhasesJson(projectId: string, phasesJson: unknown): Promise<void> {
  let phases: { code: string; name?: string }[] = DEFAULT_PHASES
  if (Array.isArray(phasesJson)) {
    phases = phasesJson.map((p: unknown) =>
      typeof p === 'object' && p && 'code' in p
        ? { code: String((p as { code: string }).code), name: (p as { name?: string }).name }
        : { code: String(p) }
    )
  }
  await query('DELETE FROM evm_phases WHERE project_id = ?', [projectId])
  let ord = 0
  for (const p of phases) {
    await query('INSERT INTO evm_phases (project_id, code, name, sort_order) VALUES (?, ?, ?, ?)', [
      projectId,
      p.code,
      p.name ?? p.code,
      ord++,
    ])
  }
}

export async function updateAcRow(id: string, updates: Omit<Partial<ACRow>, 'percentDone'> & { percentDone?: number | null }): Promise<ACRow> {
  const cols: string[] = []
  const vals: unknown[] = []
  if (updates.date !== undefined) {
    cols.push('date = ?')
    vals.push(updates.date)
  }
  if (updates.phase !== undefined) {
    cols.push('phase = ?')
    vals.push(updates.phase)
  }
  if (updates.assignee !== undefined) {
    cols.push('assignee = ?')
    vals.push(updates.assignee)
  }
  if (updates.workingHours !== undefined) {
    cols.push('working_hours = ?')
    vals.push(updates.workingHours)
  }
  if (updates.workContents !== undefined) {
    cols.push('work_contents = ?')
    vals.push(updates.workContents)
  }
  if (updates.category !== undefined) {
    cols.push('category = ?')
    vals.push(updates.category)
  }
  if (updates.feature !== undefined) {
    cols.push('feature = ?')
    vals.push(updates.feature)
  }
  if (updates.task !== undefined) {
    cols.push('task = ?')
    vals.push(updates.task)
  }
  if (updates.planStartDate !== undefined) {
    cols.push('plan_start_date = ?')
    vals.push(updates.planStartDate)
  }
  if (updates.planEndDate !== undefined) {
    cols.push('plan_end_date = ?')
    vals.push(updates.planEndDate)
  }
  if (updates.actualStartDate !== undefined) {
    cols.push('actual_start_date = ?')
    vals.push(updates.actualStartDate)
  }
  if (updates.actualEndDate !== undefined) {
    cols.push('actual_end_date = ?')
    vals.push(updates.actualEndDate)
  }
  if ('percentDone' in updates) {
    cols.push('percent_done = ?')
    const p = updates.percentDone
    vals.push(p != null && Number.isFinite(p) ? percentDoneToDb(p) : null)
  }
  if (cols.length > 0) {
    vals.push(id)
    await query(`UPDATE evm_ac SET ${cols.join(', ')} WHERE id = ?`, vals)
  }
  const rows = await query<Record<string, unknown>[]>('SELECT * FROM evm_ac WHERE id = ?', [id])
  if (!rows?.[0]) throw new Error('AC row not found')
  const ac = mapAc(rows[0])
  await maybeSyncWbsDetailFromAc(String(ac.projectId), ac)
  return ac
}

export async function deleteAcRow(id: string): Promise<void> {
  const rows = await query<Record<string, unknown>[]>('SELECT project_id FROM evm_ac WHERE id = ?', [id])
  const projectId = rows?.[0] ? String(rows[0].project_id) : null
  await query('DELETE FROM evm_ac WHERE id = ?', [id])
  if (projectId) {
    const remaining = await query<Record<string, unknown>[]>('SELECT id FROM evm_ac WHERE project_id = ? ORDER BY no', [projectId])
    const rem = (remaining ?? []) as { id: string }[]
    if (rem.length > 0) {
      const caseParts = rem.map(() => 'WHEN ? THEN ?').join(' ')
      const params = rem.flatMap((r, i) => [r.id, i + 1])
      await query(`UPDATE evm_ac SET no = CASE id ${caseParts} END WHERE id IN (${rem.map(() => '?').join(', ')})`, [...params, ...rem.map(r => r.id)])
    }
  }
}

export async function updateMaster(projectId: string, updates: EVMMasterUpdatePayload): Promise<EVMMaster> {
  const existing = await query<Record<string, unknown>[]>('SELECT * FROM evm_master WHERE project_id = ?', [projectId])
  const phases = updates.phases ?? (existing?.[0] ? (existing[0].phases as unknown) : DEFAULT_PHASES)
  const statuses = updates.statuses ?? (existing?.[0] ? (existing[0].statuses as unknown) : DEFAULT_STATUSES)
  const nonWorkingDays = updates.nonWorkingDays ?? (existing?.[0] ? (existing[0].non_working_days as unknown) : [])
  let hoursPerDay =
    existing?.[0]?.hours_per_day != null && existing[0].hours_per_day !== ''
      ? Number(existing[0].hours_per_day)
      : 8
  if (updates.hoursPerDay !== undefined) hoursPerDay = updates.hoursPerDay

  const phaseReportNotes =
    updates.phaseReportNotes !== undefined
      ? updates.phaseReportNotes
      : parseJsonStringRecord(existing?.[0]?.phase_report_notes)
  const assigneeReportNotes =
    updates.assigneeReportNotes !== undefined
      ? updates.assigneeReportNotes
      : parseJsonStringRecord(existing?.[0]?.assignee_report_notes)

  const percentDoneOptionsExisting =
    parsePercentDoneOptionsJson(existing?.[0]?.percent_done_options) ?? [...DEFAULT_PERCENT_DONE]
  const percentDoneOptions =
    updates.percentDoneOptions !== undefined
      ? [...new Set(updates.percentDoneOptions.filter(x => Number.isFinite(x) && x >= 0 && x <= 1))].sort((a, b) => a - b)
      : percentDoneOptionsExisting

  const issueMapExisting = parseIssueImportMapJson(existing?.[0]?.issue_import_map)
  const issueImportMap = updates.issueImportMap !== undefined ? updates.issueImportMap : issueMapExisting

  if (existing?.length) {
    await query(
      'UPDATE evm_master SET phases = ?, statuses = ?, non_working_days = ?, hours_per_day = ?, phase_report_notes = ?, assignee_report_notes = ?, percent_done_options = ?, issue_import_map = ? WHERE project_id = ?',
      [
        JSON.stringify(phases),
        JSON.stringify(statuses),
        JSON.stringify(nonWorkingDays),
        hoursPerDay,
        JSON.stringify(phaseReportNotes),
        JSON.stringify(assigneeReportNotes),
        JSON.stringify(percentDoneOptions.length ? percentDoneOptions : DEFAULT_PERCENT_DONE),
        issueImportMap && Object.keys(issueImportMap).length ? JSON.stringify(issueImportMap) : null,
        projectId,
      ]
    )
    if (updates.phases !== undefined) {
      await syncEvmPhasesTableFromPhasesJson(projectId, phases)
    }
  } else {
    await query(
      'INSERT INTO evm_master (project_id, phases, statuses, non_working_days, hours_per_day, phase_report_notes, assignee_report_notes, percent_done_options, issue_import_map) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        projectId,
        JSON.stringify(phases),
        JSON.stringify(statuses),
        JSON.stringify(nonWorkingDays),
        hoursPerDay,
        JSON.stringify(phaseReportNotes),
        JSON.stringify(assigneeReportNotes),
        JSON.stringify(percentDoneOptions.length ? percentDoneOptions : DEFAULT_PERCENT_DONE),
        issueImportMap && Object.keys(issueImportMap).length ? JSON.stringify(issueImportMap) : null,
      ]
    )
    await syncEvmPhasesTableFromPhasesJson(projectId, phases)
  }
  const rows = await query<Record<string, unknown>[]>('SELECT * FROM evm_master WHERE project_id = ?', [projectId])
  const row = rows?.[0]
  if (!row) throw new Error('evm_master row missing after update')
  return attachProjectAssignees(mapMaster(row), projectId)
}

/** Thay thế toàn bộ ô ngày của một dòng WBS (sau khi đổi plan). */
export async function replaceWbsDayUnitsForWbs(
  projectId: string,
  wbsId: string,
  entries: { workDate: string; unit: number }[]
): Promise<void> {
  const ok = await query<{ id: string }[]>('SELECT id FROM evm_wbs_details WHERE project_id = ? AND id = ? LIMIT 1', [projectId, wbsId])
  if (!ok?.length) throw new Error('WBS row not in project')
  await withTransaction(async tx => {
    await tx('DELETE FROM evm_wbs_day_unit WHERE wbs_id = ?', [wbsId])
    for (const e of entries) {
      if (!Number.isFinite(e.unit) || e.unit <= 0) continue
      await tx(
        `INSERT INTO evm_wbs_day_unit (id, wbs_id, work_date, unit) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE unit = VALUES(unit), updated_at = CURRENT_TIMESTAMP`,
        [randomUuidV7(), wbsId, e.workDate, e.unit]
      )
    }
  })
}

const EVM_AI_PAYLOAD_MAX_LEN = 65500

export interface EvmAiInsightRecord {
  id: string
  projectId: string
  insightType: string
  outputMarkdown: string
  inputPayloadJson: string | null
  createdAt: string
}

function mapEvmAiInsightRow(row: Record<string, unknown>): EvmAiInsightRecord {
  const ca = row.created_at
  let createdAt = ''
  if (ca instanceof Date) createdAt = ca.toISOString()
  else if (ca != null) createdAt = String(ca)
  return {
    id: String(row.id ?? ''),
    projectId: String(row.project_id ?? ''),
    insightType: String(row.insight_type ?? ''),
    outputMarkdown: String(row.output_markdown ?? ''),
    inputPayloadJson: row.input_payload_json != null ? String(row.input_payload_json) : null,
    createdAt,
  }
}

export async function insertEvmAiInsight(input: {
  projectId: string
  insightType: string
  outputMarkdown: string
  inputPayloadJson?: string | null
}): Promise<EvmAiInsightRecord> {
  let payload = input.inputPayloadJson ?? null
  if (payload && payload.length > EVM_AI_PAYLOAD_MAX_LEN) {
    payload = `${payload.slice(0, EVM_AI_PAYLOAD_MAX_LEN)}...[truncated]`
  }
  const id = randomUuidV7()
  await query(
    'INSERT INTO evm_ai_insight (id, project_id, insight_type, output_markdown, input_payload_json) VALUES (?, ?, ?, ?, ?)',
    [id, input.projectId, input.insightType, input.outputMarkdown, payload]
  )
  const insRows = await query<Record<string, unknown>[]>(
    'SELECT id, project_id, insight_type, output_markdown, input_payload_json, created_at FROM evm_ai_insight WHERE id = ?',
    [id]
  )
  const row = insRows?.[0]
  if (!row) throw new Error('Failed to read evm_ai_insight after insert')
  return mapEvmAiInsightRow(row)
}

export async function listEvmAiInsights(
  projectId: string,
  insightType?: string,
  limit = 50,
  offset = 0
): Promise<EvmAiInsightRecord[]> {
  const lim = Math.min(200, Math.max(1, limit))
  const off = Math.max(0, Math.floor(offset))
  const params: unknown[] = [projectId]
  let sql =
    'SELECT id, project_id, insight_type, output_markdown, input_payload_json, created_at FROM evm_ai_insight WHERE project_id = ?'
  if (insightType) {
    sql += ' AND insight_type = ?'
    params.push(insightType)
  }
  // Không bind LIMIT/OFFSET: mysql2 prepared statement + LIMIT ? OFFSET ? dễ gây "Incorrect arguments to mysqld_stmt_execute" trên một số server.
  sql += ` ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`
  const rows = await query<Record<string, unknown>[]>(sql, params)
  return (rows ?? []).map(mapEvmAiInsightRow)
}
