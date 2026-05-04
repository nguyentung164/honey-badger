import type { DateRange } from 'react-day-picker'

export type TaskManagementViewPersisted = 'table' | 'board' | 'gantt' | 'calendar'

export function isPersistedTaskView(x: unknown): x is TaskManagementViewPersisted {
  return x === 'table' || x === 'board' || x === 'gantt' || x === 'calendar'
}

const STORAGE_PREFIX = 'task-management-saved-views:v1:'

/** Khớp PAGE_SIZE_OPTIONS TaskManagement (buildSnapshot + coerce lưu trữ). */
export function coerceTaskManagementPageSize(n: number): number {
  return n === 25 || n === 50 || n === 100 ? n : 25
}

/** Các cột có thể sort trong Task Management (khớp SortHeader TaskManagement). */
const SORTABLE_COLUMNS = new Set<string>([
  'type',
  'ticketId',
  'project',
  'title',
  'assigneeUserId',
  'status',
  'priority',
  'progress',
  'planStartDate',
  'planEndDate',
  'actualStartDate',
  'actualEndDate',
])

export type TaskManagementSavedViewSnapshot = {
  v: 1
  searchQuery: string
  statusCodes: string[]
  assigneeUserIds: string[]
  typeCodes: string[]
  priorityCodes: string[]
  projectIds: string[]
  dateRangeAllTime: boolean
  dateRangeFromKey: string | null
  dateRangeToKey: string | null
  createdRangeAllTime: boolean
  createdRangeFromKey: string | null
  createdRangeToKey: string | null
  updatedRangeAllTime: boolean
  updatedRangeFromKey: string | null
  updatedRangeToKey: string | null
  sortColumn: string | null
  sortDirection: 'asc' | 'desc'
  taskView: TaskManagementViewPersisted
  pageSize: number
  visibleColumnIds: string[]
}

export type TaskManagementSavedView = {
  id: string
  name: string
  snapshot: TaskManagementSavedViewSnapshot
}

function sortedCopy(arr: string[]): string[] {
  return [...arr].sort()
}

export function normalizeSnapshot(s: TaskManagementSavedViewSnapshot): TaskManagementSavedViewSnapshot {
  return {
    ...s,
    statusCodes: sortedCopy(s.statusCodes),
    assigneeUserIds: sortedCopy(s.assigneeUserIds),
    typeCodes: sortedCopy(s.typeCodes),
    priorityCodes: sortedCopy(s.priorityCodes),
    projectIds: sortedCopy(s.projectIds),
    visibleColumnIds: [...new Set(s.visibleColumnIds)].sort(),
  }
}

export function snapshotFingerprint(s: TaskManagementSavedViewSnapshot): string {
  const n = normalizeSnapshot(s)
  return JSON.stringify(n)
}

export function snapshotsAreEqual(a: TaskManagementSavedViewSnapshot, b: TaskManagementSavedViewSnapshot): boolean {
  return snapshotFingerprint(a) === snapshotFingerprint(b)
}

export function snapshotsMatchAnySaved(saved: TaskManagementSavedView[], candidate: TaskManagementSavedViewSnapshot): TaskManagementSavedView | null {
  const norm = normalizeSnapshot(candidate)
  for (const x of saved) {
    if (snapshotsAreEqual(norm, x.snapshot)) return x
  }
  return null
}

export function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`
}

const SESSION_SNAPSHOT_STORAGE_PREFIX = 'task-management-session-snapshot:v1:'
const SESSION_ACTIVE_TAB_STORAGE_PREFIX = 'task-management-session-active-tab:v1:'

export function taskManagementSessionSnapshotKey(userId: string): string {
  return `${SESSION_SNAPSHOT_STORAGE_PREFIX}${userId}`
}

export function taskManagementSessionActiveTabKey(userId: string): string {
  return `${SESSION_ACTIVE_TAB_STORAGE_PREFIX}${userId}`
}

export function coerceTaskManagementSavedViewSnapshot(raw: unknown): TaskManagementSavedViewSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const vr = typeof s.v === 'number' ? s.v : 0
  if (vr !== 1) return null
  const ar = <T extends string>(x: unknown, fn: (k: unknown) => k is string): T[] => (Array.isArray(x) ? (x.filter(fn) as T[]) : [])
  const snapshot: TaskManagementSavedViewSnapshot = {
    v: 1,
    searchQuery: typeof s.searchQuery === 'string' ? s.searchQuery : '',
    statusCodes: ar<string>(s.statusCodes, z => typeof z === 'string'),
    assigneeUserIds: ar<string>(s.assigneeUserIds, z => typeof z === 'string'),
    typeCodes: ar<string>(s.typeCodes, z => typeof z === 'string'),
    priorityCodes: ar<string>(s.priorityCodes, z => typeof z === 'string'),
    projectIds: ar<string>(s.projectIds, z => typeof z === 'string'),
    dateRangeAllTime: Boolean(s.dateRangeAllTime),
    dateRangeFromKey: typeof s.dateRangeFromKey === 'string' ? s.dateRangeFromKey : null,
    dateRangeToKey: typeof s.dateRangeToKey === 'string' ? s.dateRangeToKey : null,
    createdRangeAllTime: typeof s.createdRangeAllTime === 'boolean' ? s.createdRangeAllTime : true,
    createdRangeFromKey: typeof s.createdRangeFromKey === 'string' ? s.createdRangeFromKey : null,
    createdRangeToKey: typeof s.createdRangeToKey === 'string' ? s.createdRangeToKey : null,
    updatedRangeAllTime: typeof s.updatedRangeAllTime === 'boolean' ? s.updatedRangeAllTime : true,
    updatedRangeFromKey: typeof s.updatedRangeFromKey === 'string' ? s.updatedRangeFromKey : null,
    updatedRangeToKey: typeof s.updatedRangeToKey === 'string' ? s.updatedRangeToKey : null,
    sortColumn: typeof s.sortColumn === 'string' || s.sortColumn === null ? (s.sortColumn as string | null) : null,
    sortDirection: s.sortDirection === 'desc' ? 'desc' : 'asc',
    taskView: isPersistedTaskView(s.taskView) ? s.taskView : 'table',
    pageSize: coerceTaskManagementPageSize(typeof s.pageSize === 'number' && Number.isFinite(s.pageSize) ? Math.floor(s.pageSize) : 25),
    visibleColumnIds: ar<string>(s.visibleColumnIds, z => typeof z === 'string'),
  }
  return normalizeSnapshot(snapshot)
}

export function loadTaskManagementSessionSnapshot(userId: string): TaskManagementSavedViewSnapshot | null {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(taskManagementSessionSnapshotKey(userId))
    if (!raw) return null
    return coerceTaskManagementSavedViewSnapshot(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function saveTaskManagementSessionSnapshot(userId: string, snapshot: TaskManagementSavedViewSnapshot): void {
  if (!userId) return
  try {
    localStorage.setItem(taskManagementSessionSnapshotKey(userId), JSON.stringify(normalizeSnapshot(snapshot)))
  } catch {
    /* ignore quota */
  }
}

export type TaskManagementPersistedTasksTab = 'tasks' | 'chart'

export function loadTaskManagementSessionActiveTab(userId: string): TaskManagementPersistedTasksTab | null {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(taskManagementSessionActiveTabKey(userId))
    if (raw === 'tasks' || raw === 'chart') return raw
    return null
  } catch {
    return null
  }
}

export function saveTaskManagementSessionActiveTab(userId: string, tab: TaskManagementPersistedTasksTab): void {
  if (!userId) return
  try {
    localStorage.setItem(taskManagementSessionActiveTabKey(userId), tab)
  } catch {
    /* ignore quota */
  }
}

export function loadSavedViewsFromStorage(userId: string): TaskManagementSavedView[] {
  if (!userId) return []
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: TaskManagementSavedView[] = []
    for (const row of parsed) {
      const v = coerceSavedView(row)
      if (v) out.push(v)
    }
    return out
  } catch {
    return []
  }
}

export function saveSavedViewsToStorage(userId: string, views: TaskManagementSavedView[]): void {
  if (!userId) return
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(views))
  } catch {
    /* ignore quota */
  }
}

function coerceSavedView(row: unknown): TaskManagementSavedView | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : ''
  const name = typeof r.name === 'string' ? r.name.trim() : ''
  const snapRaw = r.snapshot
  if (!id || !name || !snapRaw || typeof snapRaw !== 'object') return null
  const snapshot = coerceTaskManagementSavedViewSnapshot(snapRaw)
  if (!snapshot) return null
  return { id, name: name.slice(0, 80), snapshot }
}

export function sanitizeSortColumnKey(col: string | null): string | null {
  if (!col) return null
  return SORTABLE_COLUMNS.has(col) ? col : null
}

/** Parse YYYY-MM-DD thành Date local noon tránh DST lệch. */
export function dateKeyToLocalDate(key: string | null): Date | undefined {
  if (!key || typeof key !== 'string' || key.length < 8) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim())
  if (!m) return undefined
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return undefined
  return new Date(y, mo - 1, d)
}

export function dateRangeToKeys(range: DateRange | undefined): { allTime: boolean; fromKey: string | null; toKey: string | null } {
  if (!range?.from) return { allTime: true, fromKey: null, toKey: null }
  const fk = `${range.from.getFullYear()}-${String(range.from.getMonth() + 1).padStart(2, '0')}-${String(range.from.getDate()).padStart(2, '0')}`
  const toKey = range.to ? `${range.to.getFullYear()}-${String(range.to.getMonth() + 1).padStart(2, '0')}-${String(range.to.getDate()).padStart(2, '0')}` : fk
  return { allTime: false, fromKey: fk, toKey }
}

export function keysToDateRange(fromKey: string | null, toKey: string | null, allTime: boolean): DateRange | undefined {
  if (allTime) return undefined
  const from = dateKeyToLocalDate(fromKey)
  if (!from) return undefined
  const toCand = dateKeyToLocalDate(toKey)
  const to = toCand && toCand.getTime() >= from.getTime() ? toCand : from
  return { from, to }
}

/** Khớp logic cột hiển thị trong TaskManagement (migrate id + required trước). */
export function sanitizeVisibleColumnIds(ids: string[], taskColumnIds: readonly string[], requiredIds: readonly string[]): string[] {
  const valid = new Set(taskColumnIds)
  const req = [...requiredIds]
  const migrated = ids.map(id => (id === 'deadline' ? 'planEndDate' : id === 'actualCompletionDate' ? 'actualEndDate' : id))
  const optionalOrdered: string[] = []
  const seen = new Set<string>(req)
  for (const id of migrated) {
    if (!valid.has(id) || seen.has(id)) continue
    seen.add(id)
    optionalOrdered.push(id)
  }
  return [...req.filter(id => valid.has(id)), ...optionalOrdered.filter(id => !(requiredIds as readonly string[]).includes(id))]
}

export const MAX_TASK_SAVED_VIEWS = 30

export function buildSavedViewSnapshot(input: {
  searchQuery: string
  statusCodes: string[]
  assigneeUserIds: string[]
  typeCodes: string[]
  priorityCodes: string[]
  projectIds: string[]
  dateRange: DateRange | undefined
  createdDateRange: DateRange | undefined
  updatedDateRange: DateRange | undefined
  sortColumnKey: string | null
  sortDirection: 'asc' | 'desc'
  taskView: TaskManagementViewPersisted
  pageSize: number
  visibleColumnIds: string[]
  taskColumnIds: readonly string[]
  requiredColumnIds: readonly string[]
}): TaskManagementSavedViewSnapshot {
  const dk = dateRangeToKeys(input.dateRange)
  const ck = dateRangeToKeys(input.createdDateRange)
  const uk = dateRangeToKeys(input.updatedDateRange)
  const vis = sanitizeVisibleColumnIds(input.visibleColumnIds, input.taskColumnIds, input.requiredColumnIds)
  return normalizeSnapshot({
    v: 1,
    searchQuery: input.searchQuery,
    statusCodes: [...input.statusCodes],
    assigneeUserIds: [...input.assigneeUserIds],
    typeCodes: [...input.typeCodes],
    priorityCodes: [...input.priorityCodes],
    projectIds: [...input.projectIds],
    dateRangeAllTime: dk.allTime,
    dateRangeFromKey: dk.fromKey,
    dateRangeToKey: dk.allTime ? null : dk.toKey,
    createdRangeAllTime: ck.allTime,
    createdRangeFromKey: ck.fromKey,
    createdRangeToKey: ck.allTime ? null : ck.toKey,
    updatedRangeAllTime: uk.allTime,
    updatedRangeFromKey: uk.fromKey,
    updatedRangeToKey: uk.allTime ? null : uk.toKey,
    sortColumn: sanitizeSortColumnKey(input.sortColumnKey),
    sortDirection: input.sortDirection,
    taskView: input.taskView,
    pageSize: coerceTaskManagementPageSize(input.pageSize),
    visibleColumnIds: vis,
  })
}
