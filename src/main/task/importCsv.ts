import * as bcrypt from 'bcryptjs'
import { randomUuidV7 } from 'shared/randomUuidV7'
import { query } from './db'

const DEFAULT_PASSWORD = '123456'

const UTF8_BOM = '\uFEFF'

function parseCSVRowsWithSep(content: string, sep: ',' | ';'): string[][] {
  let s = content
  if (s.startsWith(UTF8_BOM)) s = s.slice(UTF8_BOM.length)
  const rows: string[][] = []
  let i = 0
  const len = s.length

  const readRow = (): string[] => {
    const cells: string[] = []
    let cell = ''
    while (i < len) {
      const c = s[i]
      if (c === '"') {
        i++
        while (i < len) {
          if (s[i] === '"') {
            i++
            if (s[i] === '"') {
              cell += '"'
              i++
            } else break
          } else {
            cell += s[i]
            i++
          }
        }
        continue
      }
      if (c === sep) {
        cells.push(cell)
        cell = ''
        i++
        continue
      }
      if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++
        i++
        cells.push(cell)
        return cells
      }
      cell += c
      i++
    }
    cells.push(cell)
    return cells
  }

  while (i < len) {
    const row = readRow()
    if (row.some(c => c.trim() !== '')) rows.push(row)
  }
  return rows
}

/** Parse CSV, tự động phát hiện dấu phân cách (`,` hoặc `;` - Excel một số locale dùng `;`) */
export function parseCSVRows(content: string): string[][] {
  const rowsComma = parseCSVRowsWithSep(content, ',')
  const rowsSemicolon = parseCSVRowsWithSep(content, ';')
  const colsComma = rowsComma[0]?.length ?? 0
  const colsSemicolon = rowsSemicolon[0]?.length ?? 0
  return colsSemicolon > colsComma && colsSemicolon >= 2 ? rowsSemicolon : rowsComma
}

/** Chuyển ISO string hoặc MySQL format sang MySQL datetime (YYYY-MM-DD HH:MM:SS) */
function toMySQLDatetime(isoOrEmpty: string): string | null {
  if (!isoOrEmpty?.trim()) return null
  const s = isoOrEmpty.trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const sec = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}:${sec}`
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Parse Redmine date (DD-MM-YYYY hoặc DD-MM-YYYY HH:MM) -> MySQL format YYYY-MM-DD HH:MM:SS, không convert timezone */
function parseRedmineDate(s: string): string {
  if (!s?.trim()) return ''
  const trimmed = s.trim()
  const withTime = /^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(trimmed)
  if (withTime) {
    const [, d, m, y, h, min] = withTime
    return `${y}-${pad2(Number(m))}-${pad2(Number(d))} ${pad2(Number(h))}:${pad2(Number(min))}:00`
  }
  const dateOnly = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(trimmed)
  if (dateOnly) {
    const [, d, m, y] = dateOnly
    return `${y}-${pad2(Number(m))}-${pad2(Number(d))} 00:00:00`
  }
  return trimmed
}

function mapRedmineType(s: string): string {
  const v = (s ?? '').toLowerCase().trim()
  if (v.includes('support') || v.includes('サポート') || v.includes('ヘルプ')) return 'support'
  if (v.includes('機能') || v.includes('feature') || v.includes('design')) return 'feature'
  if (v.includes('タスク') || v.includes('task')) return 'task'
  return 'bug'
}

function mapRedmineStatus(s: string): string {
  const v = (s ?? '').trim()
  if (v === '新規' || v === 'new') return 'new'
  if (v === '進行中' || v === 'in progress') return 'in_progress'
  if (v === '解決' || v === 'resolved') return 'fixed'
  if (v === 'フィードバック' || v === 'feedback') return 'feedback'
  if (v === '終了' || v === 'closed' || v === 'done') return 'done'
  if (v === 'キャンセル' || v === 'cancelled') return 'cancelled'
  return 'new'
}

function mapRedminePriority(s: string): string {
  const v = (s ?? '').trim()
  if (v === '今すぐ' || v === 'immediate' || v === 'urgent') return 'critical'
  if (v === '高め' || v === 'high') return 'high'
  if (v === '低め' || v === 'low') return 'low'
  return 'medium'
}

const getCol = (row: string[], idx: number): string => (row[idx] ?? '').trim()

interface MasterCodes {
  statuses: Set<string>
  priorities: Set<string>
  types: Set<string>
  sources: Set<string>
}

/** Load tất cả master codes một lần để tránh N+1 */
async function loadMasterCodes(): Promise<MasterCodes> {
  const [statuses, priorities, types, sources] = await Promise.all([
    query<{ code: string }[]>('SELECT code FROM task_statuses'),
    query<{ code: string }[]>('SELECT code FROM task_priorities'),
    query<{ code: string }[]>('SELECT code FROM task_types'),
    query<{ code: string }[]>('SELECT code FROM task_sources'),
  ])
  return {
    statuses: new Set((statuses ?? []).map(r => r.code)),
    priorities: new Set((priorities ?? []).map(r => r.code)),
    types: new Set((types ?? []).map(r => r.code)),
    sources: new Set((sources ?? []).map(r => r.code)),
  }
}

function validateMasterCode(kind: 'statuses' | 'priorities' | 'types' | 'sources', code: string, cache: MasterCodes): void {
  const set = cache[kind]
  if (!set.has(code)) throw new Error(`Invalid ${kind}: "${code}"`)
}

/** Tìm index cột theo tên header (hỗ trợ nhiều ngôn ngữ) */
function findColIndex(header: string[], patterns: RegExp[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = (header[i] ?? '').trim().toLowerCase()
    for (const p of patterns) {
      if (p.test(h)) return i
    }
  }
  return -1
}

const COL_PATTERNS = {
  ticketId: [/#|id|トラッカー/i],
  type: [/kiểu vấn đề|type|トラッカー|種別/i],
  status: [/trạng thái|status|状態/i],
  priority: [/mức ưu tiên|priority|優先度/i],
  title: [/chủ đề|subject|タイトル|件名/i],
  assignee: [/phân công cho|assignee|担当者/i],
  created: [/tạo|created|作成/i],
  updated: [/cập nhật|updated|更新/i],
  start: [/bắt đầu|start|開始/i],
  deadline: [/hết hạn|deadline|期日|期限/i],
  progress: [/tiến độ|progress|進捗|done/i],
  project: [/project|プロジェクト|dự án/i],
  description: [/mô tả|description|説明/i],
}

/** Tìm index cột thứ n (0=đầu tiên, 1=thứ hai...) - dùng khi có nhiều cột trùng tên như "Chủ đề" */
function findColIndexNth(header: string[], patterns: RegExp[], nth = 0): number {
  let matchCount = 0
  for (let i = 0; i < header.length; i++) {
    const h = (header[i] ?? '').trim().toLowerCase()
    for (const p of patterns) {
      if (p.test(h)) {
        if (matchCount === nth) return i
        matchCount++
        break
      }
    }
  }
  return -1
}

export interface CsvImportDiagnostic {
  rowCount: number
  headerCols: number
  header: string[]
  colIndices: Record<string, number>
  firstDataRowCols: number
  firstDataRowTitle: string
  firstDataRowTitleCol: number
  skippedReasons: string[]
}

export async function createUsersFromCsv(rows: string[][], existingUsers: { userCode: string; name: string }[]): Promise<{ created: number }> {
  if (rows.length < 2) return { created: 0 }
  const header = rows[0]
  const assigneeColIdx = header.findIndex(h => /phân công cho|assignee|担当/i.test((h ?? '').trim()))
  const assigneeIdx = assigneeColIdx >= 0 ? assigneeColIdx : 5
  const assigneeRawSet = new Set<string>()
  for (let r = 1; r < rows.length; r++) {
    const raw = getCol(rows[r], assigneeIdx)
    if (raw) assigneeRawSet.add(raw)
  }
  const userByCode = new Map(existingUsers.map(u => [u.userCode.toLowerCase(), u.userCode]))
  let created = 0
  for (const raw of assigneeRawSet) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    let trimmedCode: string
    let trimmedName: string
    const m = /^(\S+)\s+(.+)$/.exec(trimmed)
    if (m) {
      trimmedCode = (m[1] as string).trim()
      trimmedName = (m[2] as string).trim()
    } else {
      trimmedCode = trimmed
      trimmedName = trimmed
    }
    if (!trimmedCode || userByCode.has(trimmedCode.toLowerCase())) continue
    const id = randomUuidV7()
    await query('INSERT INTO users (id, user_code, name, email) VALUES (?, ?, ?, ?)', [id, trimmedCode, trimmedName, ''])
    const pwId = randomUuidV7()
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
    await query('INSERT INTO users_password (id, user_id, password_hash) VALUES (?, ?, ?)', [pwId, id, passwordHash])
    userByCode.set(trimmedCode.toLowerCase(), trimmedCode)
    created++
  }
  return { created }
}

function resolveColIndices(header: string[]): Record<string, number> {
  const idx = (key: keyof typeof COL_PATTERNS, fallback: number) => {
    const i = findColIndex(header, COL_PATTERNS[key])
    return i >= 0 ? i : fallback
  }
  const titleIdx = findColIndexNth(header, COL_PATTERNS.title, 0)
  const projectByHeader = findColIndex(header, COL_PATTERNS.project)
  const projectIdx = projectByHeader >= 0 ? projectByHeader : findColIndexNth(header, COL_PATTERNS.title, 1)
  return {
    ticketId: idx('ticketId', 0),
    type: idx('type', 1),
    status: idx('status', 2),
    priority: idx('priority', 3),
    title: titleIdx >= 0 ? titleIdx : 4,
    assignee: idx('assignee', 5),
    created: idx('created', 6),
    updated: idx('updated', 7),
    start: idx('start', 8),
    deadline: idx('deadline', 9),
    progress: idx('progress', 10),
    project: projectIdx >= 0 ? projectIdx : 11,
    description: idx('description', 12),
  }
}

export async function createTasksFromCsv(
  rows: string[][],
  users: { id: string; userCode: string; name: string }[],
  createdBy = ''
): Promise<{
  created: number
  updated: number
  errors: string[]
  diagnostic?: CsvImportDiagnostic
  /** Cặp (user, project) từ dòng CSV import thành công — gán role dev trên project */
  assigneeProjectDevLinks: { userId: string; projectId: string }[]
}> {
  const errors: string[] = []
  let created = 0
  let updated = 0
  const assigneeDevKeys = new Set<string>()
  const header = rows[0]
  const col = resolveColIndices(header)
  const userByCode = new Map(users.map(u => [u.userCode.toLowerCase(), u.id]))
  const userByName = new Map(users.map(u => [u.name.toLowerCase(), u.id]))

  const masterCodes = await loadMasterCodes()
  const projectCache = new Map<string, { id: string; name: string }>()
  const ticketKeyToTaskId = new Map<string, string>()

  const existingRows = await query<{ id: string; project_id: string; ticket_id: string }[]>(
    "SELECT id, project_id, ticket_id FROM tasks WHERE source = 'redmine' AND ticket_id IS NOT NULL AND ticket_id != ''"
  )
  const existingTasksFromDb = new Map<string, string>((existingRows ?? []).map(r => [`${r.project_id}:redmine:${r.ticket_id}`, r.id]))

  const buildDiagnostic = (): CsvImportDiagnostic => {
    const firstRow = rows[1]
    const titleVal = firstRow ? getCol(firstRow, col.title) : ''
    const skippedReasons: string[] = []
    if (rows.length < 2) skippedReasons.push('Chỉ có header, không có dòng dữ liệu')
    else if (!firstRow) skippedReasons.push('Không có dòng dữ liệu đầu tiên')
    else {
      if (firstRow.length < col.title + 1) skippedReasons.push(`Dòng 1 chỉ có ${firstRow.length} cột, cần ít nhất ${col.title + 1} (title ở cột ${col.title})`)
      if (!titleVal) skippedReasons.push(`Cột title (index ${col.title}) rỗng cho dòng đầu`)
    }
    return {
      rowCount: rows.length,
      headerCols: header?.length ?? 0,
      header: header ?? [],
      colIndices: { ...col },
      firstDataRowCols: firstRow?.length ?? 0,
      firstDataRowTitle: titleVal ? `${titleVal.slice(0, 50)}${titleVal.length > 50 ? '...' : ''}` : '(rỗng)',
      firstDataRowTitleCol: col.title,
      skippedReasons,
    }
  }

  const matchAssigneeUserId = (raw: string): string | null => {
    if (!raw) return null
    const r = raw.trim()
    const codeMatch = /^([\w.-]+)\s+/.exec(r)
    if (codeMatch) {
      const code = codeMatch[1].toLowerCase()
      const id = userByCode.get(code)
      if (id) return id
    }
    const codeOnly = r.toLowerCase()
    const idByCode = userByCode.get(codeOnly)
    if (idByCode) return idByCode
    const namePart = r.split(/\s+/)[0]
    if (namePart) {
      const idByName = userByName.get(namePart.toLowerCase())
      if (idByName) return idByName
    }
    return null
  }

  const getOrCreateProject = async (name: string): Promise<{ id: string; name: string }> => {
    const n = name.trim() || 'Default'
    const cached = projectCache.get(n)
    if (cached) return cached
    const existing = await query<any[]>('SELECT id, name FROM projects WHERE name = ?', [n])
    if (existing?.length) {
      projectCache.set(n, existing[0])
      return existing[0]
    }
    const id = randomUuidV7()
    await query('INSERT INTO projects (id, name) VALUES (?, ?)', [id, n])
    const result = { id, name: n }
    projectCache.set(n, result)
    return result
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    try {
      const title = getCol(row, col.title)
      if (!title) continue
      const projectName = getCol(row, col.project)
      const project = await getOrCreateProject(projectName)
      const ticketId = (getCol(row, col.ticketId) || '').trim()
      if (!ticketId) {
        errors.push(`Row ${r + 1}: ticket_id is required`)
        continue
      }
      const type = mapRedmineType(getCol(row, col.type))
      const status = mapRedmineStatus(getCol(row, col.status))
      const priority = mapRedminePriority(getCol(row, col.priority))
      const assigneeRaw = getCol(row, col.assignee)
      const assigneeUserId = matchAssigneeUserId(assigneeRaw)
      const createdAt = parseRedmineDate(getCol(row, col.created))
      const updatedAt = parseRedmineDate(getCol(row, col.updated))
      const planStartDate = parseRedmineDate(getCol(row, col.start))
      const actualStartDate = planStartDate
      const planEndDate = parseRedmineDate(getCol(row, col.deadline))
      const progress = Math.min(100, Math.max(0, parseInt(getCol(row, col.progress), 10) || 0))
      const description = getCol(row, col.description)

      validateMasterCode('statuses', status, masterCodes)
      validateMasterCode('priorities', priority, masterCodes)
      validateMasterCode('types', type, masterCodes)
      validateMasterCode('sources', 'redmine', masterCodes)

      const now = new Date().toISOString()
      const actualEndDate = status === 'done' && updatedAt ? updatedAt : ''
      const finalUpdatedAt = status === 'done' && actualEndDate ? actualEndDate : updatedAt || now

      const ticketKey = ticketId ? `${project.id}:redmine:${ticketId}` : null
      const existingTaskId = ticketKey ? (ticketKeyToTaskId.get(ticketKey) ?? existingTasksFromDb.get(ticketKey)) : null

      if (existingTaskId) {
        const auditBy = createdBy?.trim() || null
        await query(
          `UPDATE tasks SET
            title = ?, description = ?, assignee_user_id = ?, status = ?, progress = ?, priority = ?, type = ?,
            plan_end_date = ?, actual_start_date = ?, actual_end_date = ?, updated_at = ?, updated_by = ?, version = version + 1
           WHERE id = ?`,
          [
            title,
            description,
            assigneeUserId,
            status,
            progress,
            priority,
            type,
            toMySQLDatetime(planEndDate),
            toMySQLDatetime(actualStartDate),
            toMySQLDatetime(actualEndDate),
            toMySQLDatetime(finalUpdatedAt) ?? toMySQLDatetime(now),
            auditBy,
            existingTaskId,
          ]
        )
        if (ticketKey) ticketKeyToTaskId.set(ticketKey, existingTaskId)
        updated++
      } else {
        const id = randomUuidV7()
        const createdAtVal = createdAt || now
        const finalUpdatedAtVal = finalUpdatedAt
        const creatorIns = createdBy?.trim() || null
        await query(
          `INSERT INTO tasks (id, project_id, title, description, assignee_user_id, status, progress, priority, type, source, ticket_id, plan_start_date, plan_end_date, actual_start_date, actual_end_date, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            project.id,
            title,
            description,
            assigneeUserId,
            status,
            progress,
            priority,
            type,
            'redmine',
            ticketId,
            toMySQLDatetime(planStartDate),
            toMySQLDatetime(planEndDate),
            toMySQLDatetime(actualStartDate),
            toMySQLDatetime(actualEndDate),
            toMySQLDatetime(createdAtVal) ?? toMySQLDatetime(now),
            toMySQLDatetime(finalUpdatedAtVal) ?? toMySQLDatetime(now),
            creatorIns,
            creatorIns,
          ]
        )
        if (ticketKey) ticketKeyToTaskId.set(ticketKey, id)
        created++
      }
      if (assigneeUserId) {
        assigneeDevKeys.add(`${assigneeUserId}\x1e${project.id}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Row ${r + 1}: ${msg}`)
    }
  }
  const assigneeProjectDevLinks = [...assigneeDevKeys].map(k => {
    const i = k.indexOf('\x1e')
    return { userId: k.slice(0, i), projectId: k.slice(i + 1) }
  })

  const result: {
    created: number
    updated: number
    errors: string[]
    diagnostic?: CsvImportDiagnostic
    assigneeProjectDevLinks: { userId: string; projectId: string }[]
  } = {
    created,
    updated,
    errors,
    assigneeProjectDevLinks,
  }
  if (created === 0 && updated === 0 && rows.length >= 2) {
    result.diagnostic = buildDiagnostic()
    const d = result.diagnostic
    errors.push(
      `[DEBUG] Parse: ${d.rowCount} dòng, header ${d.headerCols} cột. Dòng 1: ${d.firstDataRowCols} cột. Title col=${d.firstDataRowTitleCol}, value="${d.firstDataRowTitle}". ${d.skippedReasons.join('; ')}`
    )
  }
  return result
}
