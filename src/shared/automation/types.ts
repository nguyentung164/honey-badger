/**
 * Shared types cho tính năng Automation Test.
 * Import được cả main lẫn renderer — KHÔNG đưa Node API vào file này.
 */

export type TestCaseSource = 'manual' | 'excel' | 'pdf' | 'csv' | 'markdown' | 'ai'

export type TestCasePriority = 'low' | 'medium' | 'high' | 'critical'

export type TestSpecStatus = 'none' | 'draft' | 'saved'

export type TestStepAction = 'navigate' | 'click' | 'fill' | 'select' | 'expect' | 'wait' | 'custom'

export interface TestStep {
  order: number
  action: TestStepAction
  /** Selector / URL / wait target tuỳ action. */
  target?: string
  value?: string
  expected?: string
  note?: string
}

export interface TestCase {
  id: string
  projectId: string
  code: string
  title: string
  tags: string[]
  priority: TestCasePriority
  preconditions?: string
  steps: TestStep[]
  expected: string
  source: TestCaseSource
  specStatus: TestSpecStatus
  aiRationale?: string
  createdAt?: string
  updatedAt?: string
}

export type AutomationBrowser = 'chromium' | 'firefox' | 'webkit'

export interface TestProject {
  id: string
  name: string
  baseUrl: string
  description?: string
  browsers: AutomationBrowser[]
  workspacePath: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
}

export interface TestSuite {
  id: string
  projectId: string
  name: string
  description?: string
  tagFilter?: string
}

export type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled' | 'error'

export type CaseResultStatus = 'passed' | 'failed' | 'skipped' | 'flaky' | 'timedOut' | 'interrupted'

/** Một bước / một assertion lỗi (từ test.step hoặc tách errors[]) — dùng cho UI + DB JSON. */
export interface TestCaseFailureStep {
  /** Tiêu đề hiển thị (Playwright step title hoặc "Failure 1", …). */
  label: string
  message: string
  screenshotPaths: string[]
  /** Ảnh failure-highlight-*.png từ hb-fixtures (một lỗi ↔ một ảnh khi có). */
  failureHighlightPaths?: string[]
}

export interface TestRunSummary {
  id: string
  projectId: string
  status: RunStatus
  browsers: AutomationBrowser[]
  workers: number
  retries: number
  grep?: string
  total: number
  passed: number
  failed: number
  skipped: number
  flaky: number
  durationMs: number
  startedAt?: string
  finishedAt?: string
  triggeredBy?: string
  reportPath?: string
  junitPath?: string
  jsonPath?: string
  cancelReason?: string
}

export interface TestCaseResult {
  id: string
  runId: string
  /** Liên kết `test_cases.id` khi resolve được theo code; có thể rỗng. */
  caseId: string
  /** Mã TC trích từ report (ví dụ TC-01) — luôn có khi parser nhận diện được. */
  caseCode?: string
  /** Tiêu đề test Playwright (hiển thị khi không có UUID case trong app). */
  testTitle?: string
  /** File spec Playwright (đường dẫn tương đối). */
  specFile?: string
  browser: AutomationBrowser
  status: CaseResultStatus
  durationMs: number
  attempts: number
  errorMessage?: string
  /** Chi tiết từng lỗi (soft nhiều assert, hoặc test.step); rỗng nếu dữ liệu cũ. */
  failureSteps?: TestCaseFailureStep[]
  tracePath?: string
  screenshotPaths: string[]
  videoPath?: string
  stdoutPath?: string
}

/** Tham số khi tạo run từ renderer. */
export interface RunRequest {
  projectId: string
  caseIds?: string[]
  suiteId?: string
  browsers: AutomationBrowser[]
  workers: number
  retries: number
  headed?: boolean
  grep?: string
  triggeredBy?: string
}

/** Sự kiện stream từ main → renderer khi run đang chạy. */
export type RunStreamEvent =
  | { kind: 'log'; runId: string; chunk: string; stream: 'stdout' | 'stderr' }
  | { kind: 'progress'; runId: string; total: number; passed: number; failed: number; skipped: number; currentTest?: string }
  | { kind: 'started'; runId: string; projectId: string; startedAt: string }
  | {
      kind: 'finished'
      runId: string
      status: RunStatus
      summary: TestRunSummary
      /** Gợi ý ngắn (tail log / mã thoát) khi lỗi hoặc không parse được report. */
      failureDetail?: string
    }
  /** Ghi DB sau run thất bại (finalize / insert results). */
  | { kind: 'persist_failed'; runId: string; projectId: string; message: string }

/** Output từ parser khi import file -> preview ở renderer. */
export interface ImportPreview {
  cases: TestCase[]
  warnings: string[]
}

/** Layout file Excel/CSV để parser tự nhận diện. */
export type ImportLayout = 'row-per-step' | 'row-per-case'

export interface AiRepairProposal {
  id: string
  caseResultId: string
  originalSpec: string
  proposedSpec: string
  rationale: string
  status: 'pending' | 'applied' | 'rejected'
  createdAt?: string
}

export interface AutomationSettingsState {
  defaultWorkers: number
  defaultRetries: number
  runRetention: number
  /** Override provider AI cho tính năng automation (null = dùng activeApiProvider global). */
  aiProviderOverride?: 'openai' | 'claude' | 'google' | null
}
