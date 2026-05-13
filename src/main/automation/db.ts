import { randomUuidV7 } from 'shared/randomUuidV7'
import type {
  AiRepairProposal,
  AutomationBrowser,
  RunStatus,
  TestCase,
  TestCaseFailureStep,
  TestCaseResult,
  TestProject,
  TestRunSummary,
  TestSuite,
  TestStep,
} from 'shared/automation/types'
import { exec, query } from '../task/schema/db'
import { getWorkspacePath } from './workspace'

interface ProjectRow {
  id: string
  name: string
  base_url: string
  description: string | null
  browsers: string[] | null
  workspace_path: string
  created_by: string | null
  created_at: string
  updated_at: string
}

function rowToProject(r: ProjectRow): TestProject {
  return {
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    description: r.description ?? undefined,
    browsers: (r.browsers ?? ['chromium']) as AutomationBrowser[],
    workspacePath: r.workspace_path,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listProjects(): Promise<TestProject[]> {
  const rows = await query<ProjectRow>(
    'SELECT id, name, base_url, description, browsers, workspace_path, created_by, created_at, updated_at FROM test_projects ORDER BY created_at DESC'
  )
  return rows.map(rowToProject)
}

export async function getProject(id: string): Promise<TestProject | null> {
  const rows = await query<ProjectRow>(
    'SELECT id, name, base_url, description, browsers, workspace_path, created_by, created_at, updated_at FROM test_projects WHERE id = ?',
    [id]
  )
  if (!rows.length) return null
  return rowToProject(rows[0])
}

export async function createProject(input: {
  name: string
  baseUrl: string
  description?: string
  browsers?: AutomationBrowser[]
  createdBy?: string | null
}): Promise<TestProject> {
  const id = randomUuidV7()
  const browsers = (input.browsers && input.browsers.length > 0 ? input.browsers : ['chromium']) as AutomationBrowser[]
  const workspacePath = getWorkspacePath(id)
  await exec(
    'INSERT INTO test_projects (id, name, base_url, description, browsers, workspace_path, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, input.name, input.baseUrl, input.description ?? null, browsers, workspacePath, input.createdBy ?? null]
  )
  const proj = await getProject(id)
  if (!proj) throw new Error('Failed to create project.')
  return proj
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<TestProject, 'name' | 'baseUrl' | 'description' | 'browsers'>>
): Promise<TestProject | null> {
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.name !== undefined) {
    fields.push('name = ?')
    values.push(patch.name)
  }
  if (patch.baseUrl !== undefined) {
    fields.push('base_url = ?')
    values.push(patch.baseUrl)
  }
  if (patch.description !== undefined) {
    fields.push('description = ?')
    values.push(patch.description)
  }
  if (patch.browsers !== undefined) {
    fields.push('browsers = ?')
    values.push(patch.browsers)
  }
  if (fields.length === 0) return getProject(id)
  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)
  await exec(`UPDATE test_projects SET ${fields.join(', ')} WHERE id = ?`, values)
  return getProject(id)
}

export async function deleteProject(id: string): Promise<void> {
  await exec('DELETE FROM test_projects WHERE id = ?', [id])
}

interface CaseRow {
  id: string
  project_id: string
  code: string
  title: string
  priority: string
  tags: string[] | null
  preconditions: string | null
  steps: unknown
  expected: string
  source: string
  spec_status: string
  ai_rationale: string | null
  created_at: string
  updated_at: string
}

function parseSteps(value: unknown): TestStep[] {
  if (!value) return []
  if (Array.isArray(value)) return value as TestStep[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as TestStep[]) : []
    } catch {
      return []
    }
  }
  return []
}

function rowToCase(r: CaseRow): TestCase {
  return {
    id: r.id,
    projectId: r.project_id,
    code: r.code,
    title: r.title,
    tags: r.tags ?? [],
    priority: r.priority as TestCase['priority'],
    preconditions: r.preconditions ?? undefined,
    steps: parseSteps(r.steps),
    expected: r.expected ?? '',
    source: r.source as TestCase['source'],
    specStatus: r.spec_status as TestCase['specStatus'],
    aiRationale: r.ai_rationale ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listCases(projectId: string): Promise<TestCase[]> {
  const rows = await query<CaseRow>(
    `SELECT id, project_id, code, title, priority, tags, preconditions, steps, expected, source, spec_status, ai_rationale, created_at, updated_at
     FROM test_cases WHERE project_id = ? ORDER BY code ASC`,
    [projectId]
  )
  return rows.map(rowToCase)
}

export async function getCase(id: string): Promise<TestCase | null> {
  const rows = await query<CaseRow>(
    `SELECT id, project_id, code, title, priority, tags, preconditions, steps, expected, source, spec_status, ai_rationale, created_at, updated_at
     FROM test_cases WHERE id = ?`,
    [id]
  )
  return rows.length ? rowToCase(rows[0]) : null
}

export async function getCaseByCode(projectId: string, code: string): Promise<TestCase | null> {
  const rows = await query<CaseRow>(
    `SELECT id, project_id, code, title, priority, tags, preconditions, steps, expected, source, spec_status, ai_rationale, created_at, updated_at
     FROM test_cases WHERE project_id = ? AND code = ?`,
    [projectId, code]
  )
  return rows.length ? rowToCase(rows[0]) : null
}

export async function upsertCases(projectId: string, cases: TestCase[]): Promise<TestCase[]> {
  const saved: TestCase[] = []
  for (const c of cases) {
    const existing = await getCaseByCode(projectId, c.code)
    const id = existing?.id ?? c.id
    const tagsArr = c.tags ?? []
    const stepsJson = JSON.stringify(c.steps ?? [])
    if (existing) {
      await exec(
        `UPDATE test_cases
         SET title = ?, priority = ?, tags = ?, preconditions = ?, steps = ?::jsonb, expected = ?, source = ?, spec_status = ?, ai_rationale = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [c.title, c.priority, tagsArr, c.preconditions ?? null, stepsJson, c.expected, c.source, c.specStatus, c.aiRationale ?? null, id]
      )
    } else {
      await exec(
        `INSERT INTO test_cases (id, project_id, code, title, priority, tags, preconditions, steps, expected, source, spec_status, ai_rationale)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?)`,
        [id, projectId, c.code, c.title, c.priority, tagsArr, c.preconditions ?? null, stepsJson, c.expected, c.source, c.specStatus, c.aiRationale ?? null]
      )
    }
    const next = await getCase(id)
    if (next) saved.push(next)
  }
  return saved
}

export async function deleteCase(id: string): Promise<void> {
  await exec('DELETE FROM test_cases WHERE id = ?', [id])
}

export async function setCaseSpecStatus(id: string, status: TestCase['specStatus']): Promise<void> {
  await exec('UPDATE test_cases SET spec_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id])
}

interface SuiteRow {
  id: string
  project_id: string
  name: string
  description: string | null
  tag_filter: string | null
}

function rowToSuite(r: SuiteRow): TestSuite {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    description: r.description ?? undefined,
    tagFilter: r.tag_filter ?? undefined,
  }
}

export async function listSuites(projectId: string): Promise<TestSuite[]> {
  const rows = await query<SuiteRow>(
    'SELECT id, project_id, name, description, tag_filter FROM test_suites WHERE project_id = ? ORDER BY name ASC',
    [projectId]
  )
  return rows.map(rowToSuite)
}

export async function createSuite(input: Omit<TestSuite, 'id'>): Promise<TestSuite> {
  const id = randomUuidV7()
  await exec(
    'INSERT INTO test_suites (id, project_id, name, description, tag_filter) VALUES (?, ?, ?, ?, ?)',
    [id, input.projectId, input.name, input.description ?? null, input.tagFilter ?? null]
  )
  return { id, ...input }
}

export async function updateSuite(id: string, patch: Partial<Omit<TestSuite, 'id' | 'projectId'>>): Promise<void> {
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.name !== undefined) {
    fields.push('name = ?')
    values.push(patch.name)
  }
  if (patch.description !== undefined) {
    fields.push('description = ?')
    values.push(patch.description)
  }
  if (patch.tagFilter !== undefined) {
    fields.push('tag_filter = ?')
    values.push(patch.tagFilter)
  }
  if (fields.length === 0) return
  values.push(id)
  await exec(`UPDATE test_suites SET ${fields.join(', ')} WHERE id = ?`, values)
}

export async function deleteSuite(id: string): Promise<void> {
  await exec('DELETE FROM test_suites WHERE id = ?', [id])
}

interface RunRow {
  id: string
  project_id: string
  status: string
  browsers: string[] | null
  workers: number
  retries: number
  grep: string | null
  total: number
  passed: number
  failed: number
  skipped: number
  flaky: number
  duration_ms: string | number
  started_at: string | null
  finished_at: string | null
  triggered_by: string | null
  report_path: string | null
  junit_path: string | null
  json_path: string | null
  cancel_reason: string | null
}

function rowToRun(r: RunRow): TestRunSummary {
  return {
    id: r.id,
    projectId: r.project_id,
    status: r.status as RunStatus,
    browsers: (r.browsers ?? ['chromium']) as AutomationBrowser[],
    workers: r.workers,
    retries: r.retries,
    grep: r.grep ?? undefined,
    total: r.total,
    passed: r.passed,
    failed: r.failed,
    skipped: r.skipped,
    flaky: r.flaky,
    durationMs: Number(r.duration_ms ?? 0),
    startedAt: r.started_at ?? undefined,
    finishedAt: r.finished_at ?? undefined,
    triggeredBy: r.triggered_by ?? undefined,
    reportPath: r.report_path ?? undefined,
    junitPath: r.junit_path ?? undefined,
    jsonPath: r.json_path ?? undefined,
    cancelReason: r.cancel_reason ?? undefined,
  }
}

export async function insertQueuedRun(summary: TestRunSummary): Promise<void> {
  await exec(
    `INSERT INTO test_runs (id, project_id, status, browsers, workers, retries, grep, started_at, triggered_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      summary.id,
      summary.projectId,
      summary.status,
      summary.browsers,
      summary.workers,
      summary.retries,
      summary.grep ?? null,
      summary.startedAt ?? null,
      summary.triggeredBy ?? null,
    ]
  )
}

/** Chuẩn hoá số ms cho cột Postgres BIGINT (Playwright đôi khi trả float). */
function toRoundedMs(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

function toSafeInt(value: unknown, fallback = 0): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return n
}

export async function finalizeRun(summary: TestRunSummary): Promise<void> {
  await exec(
    `UPDATE test_runs
     SET status = ?, total = ?, passed = ?, failed = ?, skipped = ?, flaky = ?, duration_ms = ?, finished_at = ?, report_path = ?, junit_path = ?, json_path = ?, cancel_reason = ?
     WHERE id = ?`,
    [
      summary.status,
      toSafeInt(summary.total),
      toSafeInt(summary.passed),
      toSafeInt(summary.failed),
      toSafeInt(summary.skipped),
      toSafeInt(summary.flaky),
      toRoundedMs(summary.durationMs),
      summary.finishedAt ?? null,
      summary.reportPath ?? null,
      summary.junitPath ?? null,
      summary.jsonPath ?? null,
      summary.cancelReason ?? null,
      summary.id,
    ]
  )
}

export async function listRuns(projectId: string, limit = 50): Promise<TestRunSummary[]> {
  const rows = await query<RunRow>(
    `SELECT id, project_id, status, browsers, workers, retries, grep, total, passed, failed, skipped, flaky, duration_ms, started_at, finished_at, triggered_by, report_path, junit_path, json_path, cancel_reason
     FROM test_runs WHERE project_id = ? ORDER BY started_at DESC NULLS LAST, created_at DESC LIMIT ?`,
    [projectId, limit]
  )
  return rows.map(rowToRun)
}

export async function getRunSummary(runId: string): Promise<TestRunSummary | null> {
  const rows = await query<RunRow>(
    `SELECT id, project_id, status, browsers, workers, retries, grep, total, passed, failed, skipped, flaky, duration_ms, started_at, finished_at, triggered_by, report_path, junit_path, json_path, cancel_reason
     FROM test_runs WHERE id = ?`,
    [runId]
  )
  return rows.length ? rowToRun(rows[0]) : null
}

interface ResultRow {
  id: string
  run_id: string
  case_id: string | null
  case_code: string | null
  test_title: string | null
  spec_file: string | null
  browser: string
  status: string
  duration_ms: string | number
  attempts: number
  error_message: string | null
  trace_path: string | null
  screenshot_paths: string[] | null
  video_path: string | null
  stdout_path: string | null
  failure_steps: string | null
}

function parseFailureStepsJson(raw: string | null | undefined): TestCaseFailureStep[] | undefined {
  if (!raw?.trim()) return undefined
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v) || v.length === 0) return undefined
    const out: TestCaseFailureStep[] = []
    for (const item of v) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const label = typeof o.label === 'string' ? o.label : 'Step'
      const message = typeof o.message === 'string' ? o.message : ''
      const sp = o.screenshotPaths
      const screenshotPaths = Array.isArray(sp) ? sp.filter((x): x is string => typeof x === 'string') : []
      const fh = o.failureHighlightPaths ?? (o as { failure_highlight_paths?: unknown }).failure_highlight_paths
      const failureHighlightPaths = Array.isArray(fh) ? fh.filter((x): x is string => typeof x === 'string') : []
      out.push({
        label,
        message,
        screenshotPaths,
        failureHighlightPaths: failureHighlightPaths.length > 0 ? failureHighlightPaths : undefined,
      })
    }
    return out.length > 0 ? out : undefined
  } catch {
    return undefined
  }
}

function rowToResult(r: ResultRow): TestCaseResult {
  return {
    id: r.id,
    runId: r.run_id,
    caseId: r.case_id ?? '',
    caseCode: r.case_code ?? undefined,
    testTitle: r.test_title ?? undefined,
    specFile: r.spec_file ?? undefined,
    browser: r.browser as AutomationBrowser,
    status: r.status as TestCaseResult['status'],
    durationMs: Number(r.duration_ms ?? 0),
    attempts: r.attempts,
    errorMessage: r.error_message ?? undefined,
    failureSteps: parseFailureStepsJson(r.failure_steps),
    tracePath: r.trace_path ?? undefined,
    screenshotPaths: r.screenshot_paths ?? [],
    videoPath: r.video_path ?? undefined,
    stdoutPath: r.stdout_path ?? undefined,
  }
}

export async function insertCaseResults(
  runId: string,
  rows: Array<Omit<TestCaseResult, 'id' | 'runId' | 'caseId'> & { caseId?: string | null }>
): Promise<void> {
  for (const row of rows) {
    await exec(
      `INSERT INTO test_case_results (id, run_id, case_id, case_code, test_title, spec_file, browser, status, duration_ms, attempts, error_message, failure_steps, trace_path, screenshot_paths, video_path, stdout_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUuidV7(),
        runId,
        row.caseId ?? null,
        row.caseCode ?? null,
        row.testTitle ?? null,
        row.specFile ?? null,
        row.browser,
        row.status,
        toRoundedMs(row.durationMs),
        toSafeInt(row.attempts, 1),
        row.errorMessage ?? null,
        row.failureSteps?.length ? JSON.stringify(row.failureSteps) : null,
        row.tracePath ?? null,
        row.screenshotPaths ?? [],
        row.videoPath ?? null,
        row.stdoutPath ?? null,
      ]
    )
  }
}

export async function listResults(runId: string): Promise<TestCaseResult[]> {
  const rows = await query<ResultRow>(
    `SELECT id, run_id, case_id, case_code, test_title, spec_file, browser, status, duration_ms, attempts, error_message, failure_steps, trace_path, screenshot_paths, video_path, stdout_path
     FROM test_case_results WHERE run_id = ? ORDER BY browser ASC, status ASC`,
    [runId]
  )
  return rows.map(rowToResult)
}

export async function getResult(id: string): Promise<TestCaseResult | null> {
  const rows = await query<ResultRow>(
    `SELECT id, run_id, case_id, case_code, test_title, spec_file, browser, status, duration_ms, attempts, error_message, failure_steps, trace_path, screenshot_paths, video_path, stdout_path
     FROM test_case_results WHERE id = ?`,
    [id]
  )
  return rows.length ? rowToResult(rows[0]) : null
}

interface ProposalRow {
  id: string
  case_result_id: string
  original_spec: string
  proposed_spec: string
  rationale: string | null
  status: string
  created_at: string
}

function rowToProposal(r: ProposalRow): AiRepairProposal {
  return {
    id: r.id,
    caseResultId: r.case_result_id,
    originalSpec: r.original_spec,
    proposedSpec: r.proposed_spec,
    rationale: r.rationale ?? '',
    status: r.status as AiRepairProposal['status'],
    createdAt: r.created_at,
  }
}

export async function insertRepairProposal(input: Omit<AiRepairProposal, 'id' | 'createdAt' | 'status'>): Promise<AiRepairProposal> {
  const id = randomUuidV7()
  await exec(
    'INSERT INTO ai_repair_proposals (id, case_result_id, original_spec, proposed_spec, rationale, status) VALUES (?, ?, ?, ?, ?, ?)',
    [id, input.caseResultId, input.originalSpec, input.proposedSpec, input.rationale ?? null, 'pending']
  )
  const rows = await query<ProposalRow>(
    'SELECT id, case_result_id, original_spec, proposed_spec, rationale, status, created_at FROM ai_repair_proposals WHERE id = ?',
    [id]
  )
  return rowToProposal(rows[0])
}

export async function updateRepairStatus(id: string, status: AiRepairProposal['status']): Promise<void> {
  await exec('UPDATE ai_repair_proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id])
}

export async function listRepairProposalsByResult(caseResultId: string): Promise<AiRepairProposal[]> {
  const rows = await query<ProposalRow>(
    'SELECT id, case_result_id, original_spec, proposed_spec, rationale, status, created_at FROM ai_repair_proposals WHERE case_result_id = ? ORDER BY created_at DESC',
    [caseResultId]
  )
  return rows.map(rowToProposal)
}

/** Lấy N run gần nhất để retention scheduler dùng. */
export async function listOldRunIds(projectId: string, keep: number): Promise<string[]> {
  const rows = await query<{ id: string }>(
    'SELECT id FROM test_runs WHERE project_id = ? ORDER BY started_at DESC NULLS LAST, created_at DESC OFFSET ?',
    [projectId, keep]
  )
  return rows.map(r => r.id)
}

export async function listAllProjectIds(): Promise<string[]> {
  const rows = await query<{ id: string }>('SELECT id FROM test_projects')
  return rows.map(r => r.id)
}

/** Xoá mọi run (và cascade test_case_results, ai_repair_proposals) của project. */
export async function deleteAllRunsForProject(projectId: string): Promise<void> {
  await exec('DELETE FROM test_runs WHERE project_id = ?', [projectId])
}

export async function deleteRunCascade(runId: string): Promise<void> {
  await exec('DELETE FROM test_runs WHERE id = ?', [runId])
}
