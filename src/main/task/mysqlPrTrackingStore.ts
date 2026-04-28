import { randomUuidV7 } from 'shared/randomUuidV7'
import { query } from './db'

export interface PrRepo {
  id: string
  userId: string
  projectId: string
  name: string
  localPath: string | null
  remoteUrl: string
  hosting: string
  owner: string
  repo: string
  defaultBaseBranch: string | null
  createdAt: string
  updatedAt: string
}

export interface PrCheckpointTemplate {
  id: string
  userId: string
  projectId: string
  code: string
  label: string
  targetBranch: string | null
  sortOrder: number
  isActive: boolean
  /** 0-9 = màu nhóm header cột trên PR Board; null = nền mặc định. */
  headerGroupId: number | null
  createdAt: string
}

export interface PrTrackedBranch {
  id: string
  userId: string
  projectId: string
  repoId: string
  branchName: string
  assigneeUserId: string | null
  status: string
  note: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export interface PrBranchCheckpoint {
  id: string
  userId: string
  trackedBranchId: string
  templateId: string
  isDone: boolean
  prNumber: number | null
  prUrl: string | null
  mergedAt: string | null
  mergedBy: string | null
  /** GitHub: draft; null = ch\u01b0a \u0111\u1ed3ng b\u1ed9. */
  ghPrDraft: boolean | null
  /** GitHub: open | closed. */
  ghPrState: 'open' | 'closed' | null
  /** GitHub: \u0111\u00e3 merge v\u00e0o base. */
  ghPrMerged: boolean | null
  /** GitHub `user.login` c\u1ee7a PR (ng\u01b0\u1eddi t\u1ea1o). */
  ghPrAuthor: string | null
  /** Ti\u00eau \u0111\u1ec1 PR t\u1eeb GitHub. */
  ghPrTitle: string | null
  /** updated_at t\u1eeb GitHub API (ISO). */
  ghPrUpdatedAt: string | null
  /** S\u1ed1 d\u00f2ng th\u00eam; ch\u1ec9 c\u00f3 khi sync qua getPR. */
  ghPrAdditions: number | null
  ghPrDeletions: number | null
  ghPrChangedFiles: number | null
  /** clean|dirty|blocked|behind|unknown|unstable|draft; ch\u1ec9 c\u00f3 khi sync qua getPR. */
  ghPrMergeableState: string | null
  ghPrAssignees: Array<{ login: string; id: number; avatarUrl?: string | null }> | null
  ghPrLabels: Array<{ name: string; color: string }> | null
  updatedAt: string
}

export interface PrAutomation {
  id: string
  userId: string
  repoId: string
  name: string | null
  triggerEvent: string
  sourcePattern: string | null
  targetBranch: string | null
  action: string
  nextTarget: string | null
  prTitleTemplate: string | null
  prBodyTemplate: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface TrackedBranchWithDetails extends PrTrackedBranch {
  repoName: string
  repoOwner: string
  repoRepo: string
  assigneeName: string | null
  checkpoints: PrBranchCheckpoint[]
}

function mapRepo(r: any): PrRepo {
  return {
    id: r.id,
    userId: r.user_id,
    projectId: r.project_id,
    name: r.name,
    localPath: r.local_path ?? null,
    remoteUrl: r.remote_url,
    hosting: r.hosting,
    owner: r.owner,
    repo: r.repo,
    defaultBaseBranch: r.default_base_branch ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function normalizeHeaderGroupId(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  if (i < 0 || i > 9) return null
  return i
}

function mapTemplate(r: any): PrCheckpointTemplate {
  return {
    id: r.id,
    userId: r.user_id,
    projectId: r.project_id,
    code: r.code,
    label: r.label,
    targetBranch: r.target_branch ?? null,
    sortOrder: r.sort_order ?? 0,
    isActive: !!r.is_active,
    headerGroupId: normalizeHeaderGroupId(r.header_group_id),
    createdAt: r.created_at,
  }
}

function mapTracked(r: any): PrTrackedBranch {
  return {
    id: r.id,
    userId: r.user_id,
    projectId: r.project_id,
    repoId: r.repo_id,
    branchName: r.branch_name,
    assigneeUserId: r.assignee_user_id ?? null,
    status: r.status ?? 'Staged',
    note: r.note ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    version: r.version ?? 1,
  }
}

function parseJsonField<T>(v: any): T | null {
  if (v == null) return null
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return null
    try {
      return JSON.parse(s) as T
    } catch {
      return null
    }
  }
  return v as T
}

function mapCheckpoint(r: any): PrBranchCheckpoint {
  return {
    id: r.id,
    userId: r.user_id,
    trackedBranchId: r.tracked_branch_id,
    templateId: r.template_id,
    isDone: !!r.is_done,
    prNumber: r.pr_number ?? null,
    prUrl: r.pr_url ?? null,
    mergedAt: r.merged_at ?? null,
    mergedBy: r.merged_by ?? null,
    ghPrDraft: r.gh_pr_draft == null ? null : !!r.gh_pr_draft,
    ghPrState: (r.gh_pr_state as 'open' | 'closed') || null,
    ghPrMerged: r.gh_pr_merged == null ? null : !!r.gh_pr_merged,
    ghPrAuthor: r.gh_pr_author ?? null,
    ghPrTitle: r.gh_pr_title ?? null,
    ghPrUpdatedAt: r.gh_pr_updated_at ?? null,
    ghPrAdditions: r.gh_pr_additions ?? null,
    ghPrDeletions: r.gh_pr_deletions ?? null,
    ghPrChangedFiles: r.gh_pr_changed_files ?? null,
    ghPrMergeableState: r.gh_pr_mergeable_state ?? null,
    ghPrAssignees: parseJsonField<PrBranchCheckpoint['ghPrAssignees']>(r.gh_pr_assignees) ?? null,
    ghPrLabels: parseJsonField<PrBranchCheckpoint['ghPrLabels']>(r.gh_pr_labels) ?? null,
    updatedAt: r.updated_at,
  }
}

function mapAutomation(r: any): PrAutomation {
  return {
    id: r.id,
    userId: r.user_id,
    repoId: r.repo_id,
    name: r.name ?? null,
    triggerEvent: r.trigger_event,
    sourcePattern: r.source_pattern ?? null,
    targetBranch: r.target_branch ?? null,
    action: r.action,
    nextTarget: r.next_target ?? null,
    prTitleTemplate: r.pr_title_template ?? null,
    prBodyTemplate: r.pr_body_template ?? null,
    isActive: !!r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// ========== REPOS ==========
export async function listPrRepos(userId: string, projectId: string): Promise<PrRepo[]> {
  const rows = await query<any[]>(
    'SELECT * FROM pr_repos WHERE user_id = ? AND project_id = ? ORDER BY name',
    [userId, projectId],
  )
  return (rows ?? []).map(mapRepo)
}

export async function getPrRepoById(id: string): Promise<PrRepo | null> {
  const rows = await query<any[]>('SELECT * FROM pr_repos WHERE id = ? LIMIT 1', [id])
  return rows?.[0] ? mapRepo(rows[0]) : null
}

export async function upsertPrRepo(input: {
  id?: string
  userId: string
  projectId: string
  name: string
  localPath?: string | null
  remoteUrl: string
  hosting?: string
  owner: string
  repo: string
  defaultBaseBranch?: string | null
}): Promise<PrRepo> {
  const existing = await query<any[]>(
    'SELECT id FROM pr_repos WHERE user_id = ? AND project_id = ? AND owner = ? AND repo = ? LIMIT 1',
    [input.userId, input.projectId, input.owner, input.repo],
  )
  if (existing?.[0]) {
    const id = existing[0].id
    await query(
      `UPDATE pr_repos SET name=?, local_path=?, remote_url=?, hosting=?, default_base_branch=?
       WHERE id=?`,
      [
        input.name,
        input.localPath ?? null,
        input.remoteUrl,
        input.hosting ?? 'github',
        input.defaultBaseBranch ?? 'stage',
        id,
      ],
    )
    const row = await getPrRepoById(id)
    if (!row) throw new Error('Repo not found after upsert')
    return row
  }
  const id = input.id ?? randomUuidV7()
  await query(
    `INSERT INTO pr_repos (id, user_id, project_id, name, local_path, remote_url, hosting, owner, repo, default_base_branch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      input.projectId,
      input.name,
      input.localPath ?? null,
      input.remoteUrl,
      input.hosting ?? 'github',
      input.owner,
      input.repo,
      input.defaultBaseBranch ?? 'stage',
    ],
  )
  const row = await getPrRepoById(id)
  if (!row) throw new Error('Repo not created')
  return row
}

export async function deletePrRepo(userId: string, id: string): Promise<void> {
  await query('DELETE FROM pr_repos WHERE id = ? AND user_id = ?', [id, userId])
}

// ========== CHECKPOINT TEMPLATES ==========
export async function listCheckpointTemplates(userId: string, projectId: string): Promise<PrCheckpointTemplate[]> {
  const rows = await query<any[]>(
    'SELECT * FROM pr_checkpoint_templates WHERE user_id = ? AND project_id = ? ORDER BY sort_order, created_at',
    [userId, projectId],
  )
  return (rows ?? []).map(mapTemplate)
}

export async function upsertCheckpointTemplate(input: {
  id?: string
  userId: string
  projectId: string
  code: string
  label: string
  targetBranch?: string | null
  sortOrder?: number
  isActive?: boolean
  /** Truyền `null` để xóa màu nhóm; bỏ qua field này để giữ giá trị DB khi cập nhật. */
  headerGroupId?: number | null
}): Promise<PrCheckpointTemplate> {
  const existing = await query<any[]>(
    'SELECT id FROM pr_checkpoint_templates WHERE user_id = ? AND project_id = ? AND code = ? LIMIT 1',
    [input.userId, input.projectId, input.code],
  )
  if (existing?.[0]) {
    const id = existing[0].id
    if (input.headerGroupId !== undefined) {
      await query(
        `UPDATE pr_checkpoint_templates SET label=?, target_branch=?, sort_order=?, is_active=?, header_group_id=? WHERE id=?`,
        [
          input.label,
          input.targetBranch ?? null,
          input.sortOrder ?? 0,
          input.isActive ?? true,
          normalizeHeaderGroupId(input.headerGroupId),
          id,
        ],
      )
    } else {
      await query(
        `UPDATE pr_checkpoint_templates SET label=?, target_branch=?, sort_order=?, is_active=? WHERE id=?`,
        [input.label, input.targetBranch ?? null, input.sortOrder ?? 0, input.isActive ?? true, id],
      )
    }
    const row = (await query<any[]>('SELECT * FROM pr_checkpoint_templates WHERE id=?', [id]))?.[0]
    return mapTemplate(row)
  }
  const id = input.id ?? randomUuidV7()
  await query(
    `INSERT INTO pr_checkpoint_templates (id, user_id, project_id, code, label, target_branch, sort_order, is_active, header_group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      input.projectId,
      input.code,
      input.label,
      input.targetBranch ?? null,
      input.sortOrder ?? 0,
      input.isActive ?? true,
      normalizeHeaderGroupId(input.headerGroupId ?? null),
    ],
  )
  const row = (await query<any[]>('SELECT * FROM pr_checkpoint_templates WHERE id=?', [id]))?.[0]
  return mapTemplate(row)
}

export async function deleteCheckpointTemplate(userId: string, id: string): Promise<void> {
  await query('DELETE FROM pr_checkpoint_templates WHERE id = ? AND user_id = ?', [id, userId])
}

export async function reorderCheckpointTemplates(
  userId: string,
  projectId: string,
  orderedIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await query(
      'UPDATE pr_checkpoint_templates SET sort_order = ? WHERE id = ? AND project_id = ? AND user_id = ?',
      [i, orderedIds[i], projectId, userId],
    )
  }
}

/** Seed template mặc định cho project nếu chưa có. */
export async function seedDefaultCheckpointTemplates(userId: string, projectId: string): Promise<void> {
  const existing = await listCheckpointTemplates(userId, projectId)
  if (existing.length > 0) return
  const defaults = [
    { code: 'pr_stage', label: 'PR Stage', target: 'stage', order: 0 },
    { code: 'merge_stage', label: 'Merge Stage', target: 'stage', order: 1 },
    { code: 'pr_main', label: 'PR Main', target: 'main', order: 2 },
    { code: 'merge_main', label: 'Merge Main', target: 'main', order: 3 },
  ]
  for (const t of defaults) {
    await upsertCheckpointTemplate({
      userId,
      projectId,
      code: t.code,
      label: t.label,
      targetBranch: t.target,
      sortOrder: t.order,
      isActive: true,
    })
  }
}

// ========== TRACKED BRANCHES ==========
export async function listTrackedBranches(userId: string, projectId: string): Promise<TrackedBranchWithDetails[]> {
  const branchRows = await query<any[]>(
    `SELECT b.*, r.name AS repo_name, r.owner AS repo_owner, r.repo AS repo_repo,
            u.name AS assignee_name
     FROM pr_tracked_branches b
     JOIN pr_repos r ON r.id = b.repo_id
     LEFT JOIN users u ON u.id = b.assignee_user_id
     WHERE b.user_id = ? AND b.project_id = ?
     ORDER BY b.updated_at DESC`,
    [userId, projectId],
  )
  if (!branchRows || branchRows.length === 0) return []
  const ids = branchRows.map(r => r.id)
  const placeholders = ids.map(() => '?').join(',')
  const cpRows = await query<any[]>(
    `SELECT * FROM pr_branch_checkpoints WHERE tracked_branch_id IN (${placeholders})`,
    ids
  )
  const cpMap = new Map<string, PrBranchCheckpoint[]>()
  for (const cp of cpRows ?? []) {
    const mapped = mapCheckpoint(cp)
    const arr = cpMap.get(mapped.trackedBranchId) ?? []
    arr.push(mapped)
    cpMap.set(mapped.trackedBranchId, arr)
  }
  return branchRows.map(r => ({
    ...mapTracked(r),
    repoName: r.repo_name,
    repoOwner: r.repo_owner,
    repoRepo: r.repo_repo,
    assigneeName: r.assignee_name ?? null,
    checkpoints: cpMap.get(r.id) ?? [],
  }))
}

export async function getTrackedBranchById(id: string): Promise<PrTrackedBranch | null> {
  const rows = await query<any[]>('SELECT * FROM pr_tracked_branches WHERE id = ? LIMIT 1', [id])
  return rows?.[0] ? mapTracked(rows[0]) : null
}

export async function findTrackedBranch(
  userId: string,
  repoId: string,
  branchName: string,
): Promise<PrTrackedBranch | null> {
  const rows = await query<any[]>(
    'SELECT * FROM pr_tracked_branches WHERE user_id = ? AND repo_id = ? AND branch_name = ? LIMIT 1',
    [userId, repoId, branchName],
  )
  return rows?.[0] ? mapTracked(rows[0]) : null
}

async function resolveUserIdForRepo(repoId: string): Promise<string | null> {
  const rows = await query<Array<{ user_id: string }>>('SELECT user_id FROM pr_repos WHERE id = ? LIMIT 1', [repoId])
  return rows?.[0]?.user_id ?? null
}

export async function upsertTrackedBranch(input: {
  id?: string
  userId?: string
  projectId: string
  repoId: string
  branchName: string
  assigneeUserId?: string | null
  note?: string | null
}): Promise<PrTrackedBranch> {
  let uid = input.userId?.trim()
  if (!uid) {
    const fromRepo = await resolveUserIdForRepo(input.repoId)
    if (!fromRepo) throw new Error('Cannot resolve user_id for tracked branch')
    uid = fromRepo
  }
  const existing = await findTrackedBranch(uid, input.repoId, input.branchName)
  if (existing) {
    // Ph\u00e2n bi\u1ec7t undefined (gi\u1eef nguy\u00ean) vs null (x\u00f3a explicit)
    const nextAssignee =
      'assigneeUserId' in input ? (input.assigneeUserId ?? null) : existing.assigneeUserId
    const nextNote = 'note' in input ? (input.note ?? null) : existing.note
    await query(
      `UPDATE pr_tracked_branches SET assignee_user_id=?, status=?, note=?, version=version+1
       WHERE id=?`,
      [nextAssignee, existing.status, nextNote, existing.id],
    )
    const row = await getTrackedBranchById(existing.id)
    if (!row) throw new Error('Branch not found after update')
    return row
  }
  const id = input.id ?? randomUuidV7()
  await query(
    `INSERT INTO pr_tracked_branches (id, user_id, project_id, repo_id, branch_name, assignee_user_id, status, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      uid,
      input.projectId,
      input.repoId,
      input.branchName,
      input.assigneeUserId ?? null,
      'Staged',
      input.note ?? null,
    ],
  )
  const row = await getTrackedBranchById(id)
  if (!row) throw new Error('Branch not created')
  return row
}

export async function updateTrackedBranchStatusNote(
  id: string,
  patch: { note?: string | null; assigneeUserId?: string | null }
): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []
  if (patch.note !== undefined) {
    sets.push('note = ?')
    params.push(patch.note)
  }
  if (patch.assigneeUserId !== undefined) {
    sets.push('assignee_user_id = ?')
    params.push(patch.assigneeUserId)
  }
  if (sets.length === 0) return
  sets.push('version = version + 1')
  params.push(id)
  await query(`UPDATE pr_tracked_branches SET ${sets.join(', ')} WHERE id = ?`, params)
}

export async function deleteTrackedBranch(id: string): Promise<void> {
  await query('DELETE FROM pr_tracked_branches WHERE id = ?', [id])
}

async function resolveUserIdFromTrackedBranch(trackedBranchId: string): Promise<string | null> {
  const rows = await query<Array<{ user_id: string }>>(
    'SELECT user_id FROM pr_tracked_branches WHERE id = ? LIMIT 1',
    [trackedBranchId],
  )
  return rows?.[0]?.user_id ?? null
}

// ========== CHECKPOINTS ==========
export async function upsertBranchCheckpoint(input: {
  trackedBranchId: string
  templateId: string
  isDone?: boolean
  prNumber?: number | null
  prUrl?: string | null
  mergedAt?: string | null
  mergedBy?: string | null
  ghPrDraft?: boolean | null
  ghPrState?: 'open' | 'closed' | null
  ghPrMerged?: boolean | null
  ghPrAuthor?: string | null
  ghPrTitle?: string | null
  ghPrUpdatedAt?: string | null
  ghPrAdditions?: number | null
  ghPrDeletions?: number | null
  ghPrChangedFiles?: number | null
  ghPrMergeableState?: string | null
  ghPrAssignees?: Array<{ login: string; id: number; avatarUrl?: string | null }> | null
  ghPrLabels?: Array<{ name: string; color: string }> | null
}): Promise<PrBranchCheckpoint> {
  const checkpointUserId = await resolveUserIdFromTrackedBranch(input.trackedBranchId)
  if (!checkpointUserId) throw new Error('upsertBranchCheckpoint: tracked branch missing user_id')

  const assigneesJson =
    'ghPrAssignees' in input && input.ghPrAssignees != null ? JSON.stringify(input.ghPrAssignees) : null
  const labelsJson =
    'ghPrLabels' in input && input.ghPrLabels != null ? JSON.stringify(input.ghPrLabels) : null
  const updatedAtDb = 'ghPrUpdatedAt' in input ? toMysqlDateTime(input.ghPrUpdatedAt ?? null) : null
  const existing = await query<any[]>(
    'SELECT id FROM pr_branch_checkpoints WHERE tracked_branch_id = ? AND template_id = ? LIMIT 1',
    [input.trackedBranchId, input.templateId]
  )
  if (existing?.[0]) {
    const id = existing[0].id
    const toI = (v: boolean | null | undefined) =>
      v === null || v === undefined ? null : v ? 1 : 0
    await query(
      `UPDATE pr_branch_checkpoints
       SET user_id = COALESCE(?, user_id),
           is_done = COALESCE(?, is_done),
           pr_number = COALESCE(?, pr_number),
           pr_url = COALESCE(?, pr_url),
           merged_at = COALESCE(?, merged_at),
           merged_by = COALESCE(?, merged_by),
           gh_pr_draft = COALESCE(?, gh_pr_draft),
           gh_pr_state = COALESCE(?, gh_pr_state),
           gh_pr_merged = COALESCE(?, gh_pr_merged),
           gh_pr_author = COALESCE(?, gh_pr_author),
           gh_pr_title = COALESCE(?, gh_pr_title),
           gh_pr_updated_at = COALESCE(?, gh_pr_updated_at),
           gh_pr_additions = COALESCE(?, gh_pr_additions),
           gh_pr_deletions = COALESCE(?, gh_pr_deletions),
           gh_pr_changed_files = COALESCE(?, gh_pr_changed_files),
           gh_pr_mergeable_state = COALESCE(?, gh_pr_mergeable_state),
           gh_pr_assignees = COALESCE(?, gh_pr_assignees),
           gh_pr_labels = COALESCE(?, gh_pr_labels)
       WHERE id = ?`,
      [
        checkpointUserId,
        input.isDone ?? null,
        input.prNumber ?? null,
        input.prUrl ?? null,
        input.mergedAt ?? null,
        input.mergedBy ?? null,
        'ghPrDraft' in input ? toI(input.ghPrDraft as boolean | null) : null,
        'ghPrState' in input ? input.ghPrState : null,
        'ghPrMerged' in input ? toI(input.ghPrMerged as boolean | null) : null,
        'ghPrAuthor' in input ? (input.ghPrAuthor ?? null) : null,
        'ghPrTitle' in input ? (input.ghPrTitle ?? null) : null,
        updatedAtDb,
        'ghPrAdditions' in input ? (input.ghPrAdditions ?? null) : null,
        'ghPrDeletions' in input ? (input.ghPrDeletions ?? null) : null,
        'ghPrChangedFiles' in input ? (input.ghPrChangedFiles ?? null) : null,
        'ghPrMergeableState' in input ? (input.ghPrMergeableState ?? null) : null,
        assigneesJson,
        labelsJson,
        id,
      ]
    )
    const row = (await query<any[]>('SELECT * FROM pr_branch_checkpoints WHERE id=?', [id]))?.[0]
    return mapCheckpoint(row)
  }
  const id = randomUuidV7()
  const d = (v: boolean | null | undefined) =>
    v === null || v === undefined ? null : v ? 1 : 0
  await query(
    `INSERT INTO pr_branch_checkpoints
       (id, user_id, tracked_branch_id, template_id, is_done, pr_number, pr_url, merged_at, merged_by,
        gh_pr_draft, gh_pr_state, gh_pr_merged, gh_pr_author,
        gh_pr_title, gh_pr_updated_at, gh_pr_additions, gh_pr_deletions,
        gh_pr_changed_files, gh_pr_mergeable_state, gh_pr_assignees, gh_pr_labels)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      checkpointUserId,
      input.trackedBranchId,
      input.templateId,
      input.isDone ?? false,
      input.prNumber ?? null,
      input.prUrl ?? null,
      input.mergedAt ?? null,
      input.mergedBy ?? null,
      'ghPrDraft' in input ? d(input.ghPrDraft as boolean | null) : null,
      'ghPrState' in input ? input.ghPrState : null,
      'ghPrMerged' in input ? d(input.ghPrMerged as boolean | null) : null,
      'ghPrAuthor' in input ? (input.ghPrAuthor ?? null) : null,
      'ghPrTitle' in input ? (input.ghPrTitle ?? null) : null,
      updatedAtDb,
      'ghPrAdditions' in input ? (input.ghPrAdditions ?? null) : null,
      'ghPrDeletions' in input ? (input.ghPrDeletions ?? null) : null,
      'ghPrChangedFiles' in input ? (input.ghPrChangedFiles ?? null) : null,
      'ghPrMergeableState' in input ? (input.ghPrMergeableState ?? null) : null,
      assigneesJson,
      labelsJson,
    ]
  )
  const row = (await query<any[]>('SELECT * FROM pr_branch_checkpoints WHERE id=?', [id]))?.[0]
  return mapCheckpoint(row)
}

/** Chuyển ISO string về dạng 'YYYY-MM-DD HH:MM:SS' để ghi vào cột DATETIME. */
function toMysqlDateTime(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  )
}

/** C\u00e1c checkpoint tr\u00f9ng repo + s\u1ed1 PR \u2014 \u0111\u1ed3ng b\u1ed9 gh_* sau merge/draft/close tr\u00ean GitHub. */
export async function listCheckpointKeysForRepoPr(
  owner: string,
  repo: string,
  prNumber: number
): Promise<Array<{ trackedBranchId: string; templateId: string }>> {
  const o = owner.trim()
  const r = repo.trim()
  if (!o || !r || !Number.isFinite(prNumber) || prNumber < 1) return []
  const rows = await query<any[]>(
    `SELECT bc.tracked_branch_id AS trackedBranchId, bc.template_id AS templateId
     FROM pr_branch_checkpoints bc
     INNER JOIN pr_tracked_branches tb ON tb.id = bc.tracked_branch_id
     INNER JOIN pr_repos pr ON pr.id = tb.repo_id
     WHERE LOWER(pr.owner) = LOWER(?) AND LOWER(pr.repo) = LOWER(?) AND bc.pr_number = ?`,
    [o, r, prNumber]
  )
  return (rows ?? []).map(row => ({
    trackedBranchId: String(row.trackedBranchId ?? row.tracked_branch_id ?? ''),
    templateId: String(row.templateId ?? row.template_id ?? ''),
  })).filter(k => k.trackedBranchId && k.templateId)
}

/** T\u1ea5t c\u1ea3 checkpoint \u0111ang m\u1edf (is_done=false v\u00e0 c\u00f3 pr_number) \u2014 d\u00f9ng cho scheduler sync. */
export async function listPendingCheckpoints(): Promise<
  Array<PrBranchCheckpoint & { repoId: string; owner: string; repo: string; branchName: string; projectId: string }>
> {
  const rows = await query<any[]>(
    `SELECT bc.*, b.repo_id, b.branch_name, b.project_id, r.owner, r.repo
     FROM pr_branch_checkpoints bc
     JOIN pr_tracked_branches b ON b.id = bc.tracked_branch_id
     JOIN pr_repos r ON r.id = b.repo_id
     WHERE bc.is_done = FALSE AND bc.pr_number IS NOT NULL`
  )
  return (rows ?? []).map(r => ({
    ...mapCheckpoint(r),
    repoId: r.repo_id,
    owner: r.owner,
    repo: r.repo,
    branchName: r.branch_name,
    projectId: r.project_id,
  }))
}

// ========== AUTOMATIONS ==========
export async function listAutomations(userId: string, repoId?: string): Promise<PrAutomation[]> {
  const sql = repoId
    ? 'SELECT * FROM pr_automations WHERE user_id = ? AND repo_id = ? ORDER BY created_at DESC'
    : 'SELECT * FROM pr_automations WHERE user_id = ? ORDER BY created_at DESC'
  const rows = await query<any[]>(sql, repoId ? [userId, repoId] : [userId])
  return (rows ?? []).map(mapAutomation)
}

export async function listAutomationsForTrigger(
  repoId: string,
  triggerEvent: string,
): Promise<PrAutomation[]> {
  const rows = await query<any[]>(
    'SELECT * FROM pr_automations WHERE repo_id = ? AND trigger_event = ? AND is_active = TRUE',
    [repoId, triggerEvent],
  )
  return (rows ?? []).map(mapAutomation)
}

export async function upsertAutomation(input: {
  id?: string
  repoId: string
  name?: string | null
  triggerEvent: string
  sourcePattern?: string | null
  targetBranch?: string | null
  action: string
  nextTarget?: string | null
  prTitleTemplate?: string | null
  prBodyTemplate?: string | null
  isActive?: boolean
}): Promise<PrAutomation> {
  const uid = await resolveUserIdForRepo(input.repoId)
  if (!uid) throw new Error('upsertAutomation: repo missing user_id')

  if (input.id) {
    await query(
      `UPDATE pr_automations SET user_id=?, name=?, trigger_event=?, source_pattern=?, target_branch=?, action=?,
       next_target=?, pr_title_template=?, pr_body_template=?, is_active=? WHERE id = ?`,
      [
        uid,
        input.name ?? null,
        input.triggerEvent,
        input.sourcePattern ?? null,
        input.targetBranch ?? null,
        input.action,
        input.nextTarget ?? null,
        input.prTitleTemplate ?? null,
        input.prBodyTemplate ?? null,
        input.isActive ?? true,
        input.id,
      ],
    )
    const row = (await query<any[]>('SELECT * FROM pr_automations WHERE id = ?', [input.id]))?.[0]
    return mapAutomation(row)
  }
  const id = randomUuidV7()
  await query(
    `INSERT INTO pr_automations (id, user_id, repo_id, name, trigger_event, source_pattern, target_branch,
     action, next_target, pr_title_template, pr_body_template, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      uid,
      input.repoId,
      input.name ?? null,
      input.triggerEvent,
      input.sourcePattern ?? null,
      input.targetBranch ?? null,
      input.action,
      input.nextTarget ?? null,
      input.prTitleTemplate ?? null,
      input.prBodyTemplate ?? null,
      input.isActive ?? true,
    ],
  )
  const row = (await query<any[]>('SELECT * FROM pr_automations WHERE id = ?', [id]))?.[0]
  return mapAutomation(row)
}

export async function deleteAutomation(id: string): Promise<void> {
  await query('DELETE FROM pr_automations WHERE id = ?', [id])
}

export async function setAutomationActive(id: string, isActive: boolean): Promise<void> {
  await query('UPDATE pr_automations SET is_active = ? WHERE id = ?', [isActive, id])
}

// ========== USER BOARD SKIP BRANCHES (PR Board filter — per user per project) ==========

function normalizeSkippedBranchPatterns(lines: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

export async function getPrBoardSkippedBranchPatterns(userId: string, projectId: string): Promise<string[]> {
  const rows = await query<Array<{ patterns_text: string | null }>>(
    `SELECT patterns_text FROM pr_user_board_skip_branches WHERE user_id = ? AND project_id = ? LIMIT 1`,
    [userId, projectId],
  )
  const raw = rows?.[0]?.patterns_text
  if (raw == null || raw === '') return []
  return normalizeSkippedBranchPatterns(String(raw).split(/\r?\n/))
}

export async function upsertPrBoardSkippedBranchPatterns(userId: string, projectId: string, lines: readonly string[]): Promise<void> {
  const normalized = normalizeSkippedBranchPatterns(lines)
  const text = normalized.join('\n')
  await query(
    `INSERT INTO pr_user_board_skip_branches (user_id, project_id, patterns_text) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE patterns_text = VALUES(patterns_text), updated_at = CURRENT_TIMESTAMP`,
    [userId, projectId, text],
  )
}

/** Tin nhắn có thể JSON.stringify cho PR AI Assist (đồng nhất renderer). */
export type PrAiAssistChatLineJson =
  | { role: 'user'; text: string; createdAtMs?: number }
  | {
      role: 'assistant'
      text: string
      createdAtMs?: number
      action?:
        | { kind: 'openCreatePr'; payload: { repoId: string; head: string; base: string; suggestedTitle?: string; suggestedBody?: string } }
        | { kind: 'openBulkCreatePr'; trackedRowIds: string[] }
    }

export async function getPrAiAssistChatLines(userId: string, projectId: string): Promise<PrAiAssistChatLineJson[]> {
  const rows = await query<Array<{ messages_json: string | null }>>(
    `SELECT messages_json FROM pr_ai_assist_chats WHERE user_id = ? AND project_id = ? LIMIT 1`,
    [userId, projectId],
  )
  const raw = rows?.[0]?.messages_json
  if (raw == null || raw === '') return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as PrAiAssistChatLineJson[]) : []
  } catch {
    return []
  }
}

export async function upsertPrAiAssistChatLines(userId: string, projectId: string, lines: PrAiAssistChatLineJson[]): Promise<void> {
  const payload = JSON.stringify(lines)
  if (payload.length > 1_500_000) {
    throw new Error('Chat quá lớn để lưu.')
  }
  await query(
    `INSERT INTO pr_ai_assist_chats (user_id, project_id, messages_json) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE messages_json = VALUES(messages_json), updated_at = CURRENT_TIMESTAMP`,
    [userId, projectId, payload],
  )
}
