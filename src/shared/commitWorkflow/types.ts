/**
 * Commit Workflow — shared types (main + renderer).
 */

export type CommitWorkflowStepKind = 'coding-rules' | 'spotbugs' | 'playwright'

export type CommitWorkflowStepStatus =
  | 'pending'
  | 'running'
  | 'pass'
  | 'fail'
  | 'skipped'
  | 'error'
  | 'not_run'

export type CommitWorkflowRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'superseded'

export type CommitWorkflowNodeData = {
  label: string
  stepKind: CommitWorkflowStepKind
  /** When false, step is skipped with status `skipped`. */
  enabled?: boolean
  codingRuleId?: string | null
  codingRuleName?: string | null
  automationProjectId?: string | null
  suiteId?: string | null
  catalogPageId?: string | null
  catalogFlowId?: string | null
  catalogPageName?: string | null
  catalogFlowName?: string | null
  pageIds?: string[]
}

export type CommitWorkflowPersistedNode = {
  id: string
  type: 'commitWorkflowStep'
  position: { x: number; y: number }
  data: CommitWorkflowNodeData
}

export type CommitWorkflowPersistedEdge = {
  id: string
  source: string
  target: string
}

export type CommitWorkflowGraphJson = {
  version: number
  nodes: CommitWorkflowPersistedNode[]
  edges: CommitWorkflowPersistedEdge[]
}

export type CommitWorkflowSettings = {
  automationProjectId?: string | null
  suiteId?: string | null
  pageIds?: string[]
  catalogPageId?: string | null
  catalogFlowId?: string | null
  flowIds?: string[]
  notifyOnFail?: Array<'pl' | 'pm' | 'admin'>
  codingRuleId?: string | null
  codingRuleName?: string | null
}

export type CodingRulesStepSummary = {
  violationCount: number
  pass: boolean
  topViolations: string[]
}

export type SpotbugsStepSummary = {
  totalBugs: number
  high: number
  medium: number
  low: number
  pass: boolean
}

export type PlaywrightStepSummary = {
  testRunId: string
  passed: number
  failed: number
  skipped: number
  flaky: number
  pass: boolean
}

export type CommitWorkflowStepSummary =
  | CodingRulesStepSummary
  | SpotbugsStepSummary
  | PlaywrightStepSummary
  | Record<string, unknown>

export type CommitWorkflowStepRecord = {
  id: string
  runId: string
  stepKey: string
  stepKind: CommitWorkflowStepKind
  sortOrder: number
  status: CommitWorkflowStepStatus
  startedAt: string | null
  finishedAt: string | null
  summary: CommitWorkflowStepSummary | null
  externalRef: string | null
}

export type CommitWorkflowContextSnapshot = {
  commitMessage: string
  branch?: string
  addedFiles: string[]
  modifiedFiles: string[]
  deletedFiles: string[]
  runChoices?: import('./runChoices').CommitWorkflowRunChoices
  /** Pre-built diff for SVN coding-rules when git commit hash unavailable. */
  svnDiffContent?: string
}

export type CommitWorkflowRunRecord = {
  id: string
  projectId: string | null
  userId: string
  commitHash: string
  repoPath: string
  workflowId: string | null
  workflowVersion: number
  graphSnapshot: CommitWorkflowGraphJson
  status: CommitWorkflowRunStatus
  startedAt: string | null
  finishedAt: string | null
  contextSnapshot: CommitWorkflowContextSnapshot
  steps: CommitWorkflowStepRecord[]
  /** When set, this run replaces a prior run (e.g. after amend). */
  supersedesRunId?: string | null
}

export type CommitWorkflowRunSummary = Omit<CommitWorkflowRunRecord, 'steps' | 'graphSnapshot' | 'contextSnapshot'> & {
  stepCount?: number
  passCount?: number
  failCount?: number
}

export type ProjectCommitWorkflow = {
  id: string
  projectId: string
  version: number
  graph: CommitWorkflowGraphJson
  settings: CommitWorkflowSettings
  updatedBy: string | null
  updatedAt: string
}

export type CommitWorkflowStartPayload = {
  commitHash: string
  repoPath: string
  projectId?: string | null
  isAmend?: boolean
  /** Commit hash before amend — used to link superseded workflow run. */
  replacesCommitHash?: string
  runChoices: import('./runChoices').CommitWorkflowRunChoices
  commitInfo: {
    commitMessage: string
    branch?: string
    addedFiles: string[]
    modifiedFiles: string[]
    deletedFiles: string[]
    svnDiffContent?: string
  }
}

export type CommitWorkflowStepStatusEntry = {
  status: CommitWorkflowStepStatus
  stepKind: CommitWorkflowStepKind
  label: string
  startedAt?: string
  finishedAt?: string
  message?: string
  summary?: CommitWorkflowStepSummary | null
  externalRef?: string | null
}

export type CommitWorkflowRunStreamPayload = {
  runId: string
  repoPath: string
  commitHash: string
  projectId?: string | null
  runStatus: CommitWorkflowRunStatus
  activeStepKey: string | null
  stepStatus: Record<string, CommitWorkflowStepStatusEntry>
  elapsedMs?: number
  runChoices?: import('./runChoices').CommitWorkflowRunChoices
}

export type CommitWorkflowListFilters = {
  projectId?: string
  userId?: string
  repoPath?: string
  from?: string
  to?: string
  status?: CommitWorkflowRunStatus
  limit?: number
  offset?: number
}
