import type {
  CommitWorkflowGraphJson,
  CommitWorkflowListFilters,
  CommitWorkflowRunRecord,
  CommitWorkflowRunStatus,
  CommitWorkflowStepKind,
  CommitWorkflowStepRecord,
  CommitWorkflowStepStatus,
  CommitWorkflowStepSummary,
  CommitWorkflowContextSnapshot,
} from 'shared/commitWorkflow/types'
import { randomUuidV7 } from 'shared/randomUuidV7'
import { exec, query } from '../task/schema/db'

interface RunRow {
  id: string
  project_id: string | null
  user_id: string
  commit_hash: string
  repo_path: string
  workflow_id: string | null
  workflow_version: number
  graph_snapshot: unknown
  status: string
  context_snapshot: unknown
  started_at: string | null
  finished_at: string | null
  created_at: string
  supersedes_run_id?: string | null
}

interface StepRow {
  id: string
  run_id: string
  step_key: string
  step_kind: string
  sort_order: number
  status: string
  started_at: string | null
  finished_at: string | null
  summary_json: unknown
  external_ref: string | null
}

function pgTimestampToIso(v: unknown): string | null {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString()
  const s = String(v)
  return s.length ? s : null
}

/** Sort runs newest-first; safe when `startedAt` is a PG Date or ISO string. */
export function compareCommitWorkflowRunsByStartedAtDesc(
  a: { startedAt?: string | Date | null },
  b: { startedAt?: string | Date | null }
): number {
  const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0
  const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0
  return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
}

function rowToStep(r: StepRow): CommitWorkflowStepRecord {
  return {
    id: r.id,
    runId: r.run_id,
    stepKey: r.step_key,
    stepKind: r.step_kind as CommitWorkflowStepKind,
    sortOrder: r.sort_order,
    status: r.status as CommitWorkflowStepStatus,
    startedAt: pgTimestampToIso(r.started_at),
    finishedAt: pgTimestampToIso(r.finished_at),
    summary: (r.summary_json as CommitWorkflowStepSummary) ?? null,
    externalRef: r.external_ref,
  }
}

export async function insertCommitWorkflowRun(input: {
  userId: string
  projectId: string | null
  commitHash: string
  repoPath: string
  workflowId: string | null
  workflowVersion: number
  graphSnapshot: CommitWorkflowGraphJson
  contextSnapshot: CommitWorkflowContextSnapshot
  steps: Array<{ stepKey: string; stepKind: CommitWorkflowStepKind; sortOrder: number }>
  supersedesRunId?: string | null
}): Promise<CommitWorkflowRunRecord> {
  const runId = randomUuidV7()
  await exec(
    `INSERT INTO commit_workflow_runs (id, project_id, user_id, commit_hash, repo_path, workflow_id, workflow_version, graph_snapshot, status, context_snapshot, started_at, supersedes_run_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, 'queued', ?::jsonb, CURRENT_TIMESTAMP, ?)`,
    [
      runId,
      input.projectId,
      input.userId,
      input.commitHash,
      input.repoPath,
      input.workflowId,
      input.workflowVersion,
      JSON.stringify(input.graphSnapshot),
      JSON.stringify(input.contextSnapshot),
      input.supersedesRunId ?? null,
    ]
  )
  for (const s of input.steps) {
    await exec(
      `INSERT INTO commit_workflow_steps (id, run_id, step_key, step_kind, sort_order, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
      [randomUuidV7(), runId, s.stepKey, s.stepKind, s.sortOrder]
    )
  }
  const run = await getCommitWorkflowRun(runId)
  if (!run) throw new Error('Failed to load created run')
  return run
}

export async function updateCommitWorkflowStep(
  runId: string,
  stepKey: string,
  patch: {
    status?: CommitWorkflowStepStatus
    startedAt?: string | null
    finishedAt?: string | null
    summary?: CommitWorkflowStepSummary | null
    externalRef?: string | null
  }
): Promise<void> {
  const sets: string[] = []
  const vals: unknown[] = []
  if (patch.status !== undefined) {
    sets.push('status = ?')
    vals.push(patch.status)
  }
  if (patch.startedAt !== undefined) {
    sets.push('started_at = ?')
    vals.push(patch.startedAt)
  }
  if (patch.finishedAt !== undefined) {
    sets.push('finished_at = ?')
    vals.push(patch.finishedAt)
  }
  if (patch.summary !== undefined) {
    sets.push('summary_json = ?::jsonb')
    vals.push(patch.summary != null ? JSON.stringify(patch.summary) : null)
  }
  if (patch.externalRef !== undefined) {
    sets.push('external_ref = ?')
    vals.push(patch.externalRef)
  }
  if (!sets.length) return
  vals.push(runId, stepKey)
  await exec(`UPDATE commit_workflow_steps SET ${sets.join(', ')} WHERE run_id = ? AND step_key = ?`, vals)
}

export async function finalizeCommitWorkflowRun(runId: string, status: CommitWorkflowRunStatus): Promise<void> {
  await exec(`UPDATE commit_workflow_runs SET status = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, runId])
}

export async function updateCommitWorkflowRunStatus(runId: string, status: CommitWorkflowRunStatus): Promise<void> {
  await exec(`UPDATE commit_workflow_runs SET status = ? WHERE id = ?`, [status, runId])
}

export async function findCommitWorkflowRunByCommit(
  repoPath: string,
  commitHash: string,
  userId: string
): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM commit_workflow_runs
     WHERE repo_path = ? AND commit_hash = ? AND user_id = ? AND status NOT IN ('superseded', 'cancelled')
     ORDER BY created_at DESC LIMIT 1`,
    [repoPath, commitHash, userId]
  )
  return rows[0]?.id ?? null
}

export async function markCommitWorkflowRunSuperseded(runId: string): Promise<void> {
  await exec(
    `UPDATE commit_workflow_runs SET status = 'superseded', finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP) WHERE id = ?`,
    [runId]
  )
}

export async function linkGitCommitQueueWorkflow(
  commitHash: string,
  workflowRunId: string,
  userId: string | null,
  projectId: string | null,
  flags: { hasCheckCodingRule: boolean; hasCheckSpotbugs: boolean }
): Promise<void> {
  await exec(
    `UPDATE git_commit_queue SET workflow_run_id = ?, user_id = COALESCE(?, user_id), project_id = COALESCE(?, project_id),
     has_check_coding_rule = ?, has_check_spotbugs = ? WHERE commit_hash = ?`,
    [workflowRunId, userId, projectId, flags.hasCheckCodingRule ? 1 : 0, flags.hasCheckSpotbugs ? 1 : 0, commitHash]
  )
}

export async function getCommitWorkflowRun(runId: string): Promise<CommitWorkflowRunRecord | null> {
  const rows = await query<RunRow>(
    `SELECT id, project_id, user_id, commit_hash, repo_path, workflow_id, workflow_version, graph_snapshot, status, context_snapshot, started_at, finished_at, created_at, supersedes_run_id
     FROM commit_workflow_runs WHERE id = ?`,
    [runId]
  )
  if (!rows.length) return null
  const r = rows[0]
  const steps = await query<StepRow>(
    `SELECT id, run_id, step_key, step_kind, sort_order, status, started_at, finished_at, summary_json, external_ref
     FROM commit_workflow_steps WHERE run_id = ? ORDER BY sort_order ASC`,
    [runId]
  )
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    commitHash: r.commit_hash,
    repoPath: r.repo_path,
    workflowId: r.workflow_id,
    workflowVersion: r.workflow_version,
    graphSnapshot: r.graph_snapshot as CommitWorkflowGraphJson,
    status: r.status as CommitWorkflowRunStatus,
    startedAt: pgTimestampToIso(r.started_at),
    finishedAt: pgTimestampToIso(r.finished_at),
    contextSnapshot: r.context_snapshot as CommitWorkflowContextSnapshot,
    steps: steps.map(rowToStep),
    supersedesRunId: r.supersedes_run_id ?? null,
  }
}

export async function listCommitWorkflowRuns(filters: CommitWorkflowListFilters & { userIds?: string[] }): Promise<CommitWorkflowRunRecord[]> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)
  const wh: string[] = []
  const vals: unknown[] = []
  if (filters.projectId) {
    wh.push('r.project_id = ?')
    vals.push(filters.projectId)
  }
  if (filters.userId) {
    wh.push('r.user_id = ?')
    vals.push(filters.userId)
  }
  if (filters.userIds?.length) {
    wh.push(`r.user_id IN (${filters.userIds.map(() => '?').join(',')})`)
    vals.push(...filters.userIds)
  }
  if (filters.repoPath) {
    wh.push('r.repo_path = ?')
    vals.push(filters.repoPath)
  }
  if (filters.status) {
    wh.push('r.status = ?')
    vals.push(filters.status)
  }
  if (filters.from) {
    wh.push('r.created_at >= ?::timestamptz')
    vals.push(filters.from)
  }
  if (filters.to) {
    wh.push('r.created_at <= ?::timestamptz')
    vals.push(filters.to)
  }
  wh.push("r.status != 'superseded'")
  const where = wh.length ? `WHERE ${wh.join(' AND ')}` : ''
  const rows = await query<RunRow>(
    `SELECT r.id, r.project_id, r.user_id, r.commit_hash, r.repo_path, r.workflow_id, r.workflow_version, r.graph_snapshot, r.status, r.context_snapshot, r.started_at, r.finished_at, r.created_at, r.supersedes_run_id
     FROM commit_workflow_runs r ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [...vals, limit, offset]
  )
  if (!rows.length) return []

  const runIds = rows.map(r => r.id)
  const stepPlaceholders = runIds.map(() => '?').join(',')
  const allSteps = await query<StepRow>(
    `SELECT id, run_id, step_key, step_kind, sort_order, status, started_at, finished_at, summary_json, external_ref
     FROM commit_workflow_steps WHERE run_id IN (${stepPlaceholders}) ORDER BY sort_order`,
    runIds
  )
  const stepsByRun = new Map<string, CommitWorkflowStepRecord[]>()
  for (const s of allSteps) {
    const list = stepsByRun.get(s.run_id) ?? []
    list.push(rowToStep(s))
    stepsByRun.set(s.run_id, list)
  }

  return rows.map(r => ({
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    commitHash: r.commit_hash,
    repoPath: r.repo_path,
    workflowId: r.workflow_id,
    workflowVersion: r.workflow_version,
    graphSnapshot: r.graph_snapshot as CommitWorkflowGraphJson,
    status: r.status as CommitWorkflowRunStatus,
    startedAt: pgTimestampToIso(r.started_at),
    finishedAt: pgTimestampToIso(r.finished_at),
    contextSnapshot: r.context_snapshot as CommitWorkflowContextSnapshot,
    steps: stepsByRun.get(r.id) ?? [],
    supersedesRunId: r.supersedes_run_id ?? null,
  }))
}

export async function deleteCommitWorkflowRunsOlderThan(days: number): Promise<number> {
  const rows = await query<{ id: string }>(
    `DELETE FROM commit_workflow_runs WHERE created_at < CURRENT_TIMESTAMP - (? || ' days')::interval RETURNING id`,
    [String(days)]
  )
  return rows.length
}

/** Aggregate workflow pass metrics for a user on a calendar date (for daily snapshots). */
export async function getWorkflowDailyMetrics(
  userId: string,
  date: string
): Promise<{
  commits_with_rule_pass: number
  commits_with_spotbugs_pass: number
  commits_with_playwright_pass: number
  commits_with_workflow_completed: number
}> {
  const detail = await query<{ run_id: string; status: string; step_kind: string; step_status: string }>(
    `SELECT r.id AS run_id, r.status, s.step_kind, s.status AS step_status
     FROM commit_workflow_runs r
     LEFT JOIN commit_workflow_steps s ON s.run_id = r.id
     WHERE r.user_id = ? AND r.created_at::date = ?::date AND r.status NOT IN ('superseded', 'cancelled')`,
    [userId, date]
  )

  let commits_with_workflow_completed = 0
  const completedRuns = new Set<string>()
  const runSteps = new Map<string, { coding?: string; spotbugs?: string; playwright?: string }>()

  for (const d of detail) {
    if (d.status === 'completed') completedRuns.add(d.run_id)
    if (!d.step_kind) continue
    if (!runSteps.has(d.run_id)) runSteps.set(d.run_id, {})
    const m = runSteps.get(d.run_id)!
    if (d.step_kind === 'coding-rules') m.coding = d.step_status
    if (d.step_kind === 'spotbugs') m.spotbugs = d.step_status
    if (d.step_kind === 'playwright') m.playwright = d.step_status
  }
  commits_with_workflow_completed = completedRuns.size

  let commits_with_rule_pass = 0
  let commits_with_spotbugs_pass = 0
  let commits_with_playwright_pass = 0
  for (const [, m] of runSteps) {
    if (m.coding === 'pass' || m.coding === 'skipped') commits_with_rule_pass++
    if (m.spotbugs === 'pass' || m.spotbugs === 'skipped') commits_with_spotbugs_pass++
    if (m.playwright === 'pass' || m.playwright === 'skipped') commits_with_playwright_pass++
  }

  return {
    commits_with_rule_pass,
    commits_with_spotbugs_pass,
    commits_with_playwright_pass,
    commits_with_workflow_completed,
  }
}

/** Upsert run + steps from offline sync payload. */
export async function upsertCommitWorkflowRunFromSync(run: CommitWorkflowRunRecord): Promise<void> {
  const existing = await query<{ id: string }>('SELECT id FROM commit_workflow_runs WHERE id = ?', [run.id])
  if (!existing.length) {
    await exec(
      `INSERT INTO commit_workflow_runs (id, project_id, user_id, commit_hash, repo_path, workflow_id, workflow_version, graph_snapshot, status, context_snapshot, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?::jsonb, ?, ?)`,
      [
        run.id,
        run.projectId,
        run.userId,
        run.commitHash,
        run.repoPath,
        run.workflowId,
        run.workflowVersion,
        JSON.stringify(run.graphSnapshot),
        run.status,
        JSON.stringify(run.contextSnapshot),
        run.startedAt,
        run.finishedAt,
      ]
    )
  } else {
    await exec(
      `UPDATE commit_workflow_runs SET status = ?, finished_at = ?, context_snapshot = ?::jsonb WHERE id = ?`,
      [run.status, run.finishedAt, JSON.stringify(run.contextSnapshot), run.id]
    )
  }
  for (const s of run.steps) {
    const stepExists = await query('SELECT id FROM commit_workflow_steps WHERE run_id = ? AND step_key = ?', [run.id, s.stepKey])
    if (!stepExists.length) {
      await exec(
        `INSERT INTO commit_workflow_steps (id, run_id, step_key, step_kind, sort_order, status, started_at, finished_at, summary_json, external_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)`,
        [
          s.id,
          run.id,
          s.stepKey,
          s.stepKind,
          s.sortOrder,
          s.status,
          s.startedAt,
          s.finishedAt,
          s.summary != null ? JSON.stringify(s.summary) : null,
          s.externalRef,
        ]
      )
    } else {
      await updateCommitWorkflowStep(run.id, s.stepKey, {
        status: s.status,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        summary: s.summary,
        externalRef: s.externalRef,
      })
    }
  }
}
