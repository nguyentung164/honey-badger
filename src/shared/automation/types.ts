/**
 * Shared types cho tính năng Automation Test.
 * Import được cả main lẫn renderer — KHÔNG đưa Node API vào file này.
 */

import type { FlowConnectionStyle, FlowNodeVisualStyle } from '../flowDiagramStyle'

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

/** Nhóm catalog (module / suite) — có thể lồng nhau; page gán tối đa một group. */
export interface TestCatalogGroup {
  id: string
  projectId: string
  parentGroupId?: string | null
  name: string
  description?: string
  sortOrder: number
  diagramX?: number
  diagramY?: number
  diagramWidth?: number
  diagramHeight?: number
  /** Giao diện node group trên page map. */
  diagramStyle?: FlowNodeVisualStyle
  createdAt?: string
  updatedAt?: string
}

/** Ghi chú trên page map (React Flow) — không gắn test case. */
export interface TestPageMapAnnotation {
  id: string
  projectId: string
  content: string
  labelNumber: number
  diagramX?: number
  diagramY?: number
  diagramWidth?: number
  diagramHeight?: number
  style?: import('../pageMapAnnotationStyle').PageMapAnnotationStyle
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

/** Trang (Page) trong catalog test — tránh tên `AutomationPage` (component shell). */
export interface TestCatalogPage {
  id: string
  projectId: string
  name: string
  slug?: string
  description?: string
  sortOrder: number
  /** Thuộc nhóm catalog (map + run theo group); null = ở root canvas. */
  groupId?: string | null
  diagramX?: number
  diagramY?: number
  /** Giao diện node trên page map (JSON FlowNodeVisualStyle). */
  diagramStyle?: FlowNodeVisualStyle
  /** Bỏ qua khi chạy group / flow trên page map. */
  executionDisabled?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface TestFlow {
  id: string
  pageId: string
  name: string
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

export interface TestPageNavEdge {
  id: string
  projectId: string
  sourcePageId: string
  targetPageId: string
  label?: string
  /** Kiểu cạnh trên diagram — map từ cột style_json. */
  connectionStyle?: FlowConnectionStyle
  /** Thứ tự chạy trong flow (1 = nhánh đầu từ cùng source page). */
  runOrder?: number
  createdAt?: string
}

export interface TestCase {
  id: string
  projectId: string
  /** Thuộc flow trong catalog; có thể null khi dữ liệu cũ / import tạm. */
  flowId?: string | null
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

/** Explicit link between a task (master) project and an automation test project. */
export interface TestProjectTaskLink {
  id: string
  taskProjectId: string
  testProjectId: string
  taskProjectName?: string
  createdAt?: string
}

export interface TestSuite {
  id: string
  projectId: string
  name: string
  description?: string
  tagFilter?: string
}

export type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled' | 'error'

/** Page map node run indicator — shared between renderer map and DB hydration. */
export type PageMapNodeStatus = 'idle' | 'queued' | 'running' | 'done' | 'error' | 'cancelled'

/** Latest completed run mapped to catalog page statuses (from `test_case_results`). */
export interface PageMapLastRunStatus {
  runId: string | null
  runStatus: RunStatus | null
  finishedAt: string | null
  pageStatus: Record<string, PageMapNodeStatus>
}

export type CaseResultStatus = 'passed' | 'failed' | 'skipped' | 'flaky' | 'timedOut' | 'interrupted'

/** `error.location` từ JSON reporter Playwright khi có; bổ sung stack parse khi thiếu. */
export interface TestCaseFailureLocation {
  file: string
  line?: number
  column?: number
}

/** Một bước / một assertion lỗi (từ test.step hoặc tách errors[]) — dùng cho UI + DB JSON. */
export interface TestCaseFailureStep {
  /** Tiêu đề hiển thị (Playwright step title hoặc "Failure 1", …). */
  label: string
  message: string
  /** Vài dòng đầu (bỏ Call log) — điền lúc parse report; bản cũ có thể thiếu. */
  summary?: string
  /** Vị trí trong spec (JSON `location` hoặc trích từ stack). */
  location?: TestCaseFailureLocation
  screenshotPaths: string[]
  /** Ảnh failure-highlight-*.png từ hb-fixtures (một lỗi ↔ một ảnh khi có). */
  failureHighlightPaths?: string[]
  /** Playwright 1.60+ TestInfoError.errorContext (vd aria snapshot receiver khi matcher fail). */
  errorContext?: string
  /** Trích từ message (Locator / Expected / Received) + bổ sung từ `matcherResult` JSON khi có. */
  assertionHints?: TestCaseFailureAssertionHints
}

/** Gợi ý assertion từ format message Playwright hoặc matcherResult. */
export interface TestCaseFailureAssertionHints {
  locator?: string
  expected?: string
  received?: string
}

/** Một bước trong cây `results[].steps` của JSON reporter (flatten, có depth). */
export interface TestCaseReportStep {
  title: string
  category?: string
  durationMs?: number
  /** 0 = bước gốc trong `results[].steps` của lần chạy cuối. */
  depth: number
  /** Bước có `error` trong JSON. */
  failed?: boolean
  /** Rút gọn `error.message` khi failed. */
  errorSnippet?: string
  location?: TestCaseFailureLocation
  /** JSON step có `steps` con — icon › giống HTML report. */
  hasNestedSteps?: boolean
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
  /** Cây bước Playwright (hook / expect / click …) từ JSON reporter; rỗng nếu dữ liệu cũ hoặc reporter không ghi steps. */
  reportSteps?: TestCaseReportStep[]
  tracePath?: string
  screenshotPaths: string[]
  videoPath?: string
  stdoutPath?: string
}

/** Kết quả resolve phạm vi chạy theo catalog page (dùng cho Page map + IPC). */
export interface RunScopeResolution {
  caseIds: string[]
  /** pageId → danh sách case id (chỉ các page hợp lệ có ít nhất một flow/case). */
  caseIdsByPageId: Record<string, string[]>
  /** pageId → số case (trùng với độ dài caseIdsByPageId[pageId]). */
  caseCountByPageId: Record<string, number>
  /** Danh sách page id sau khi gộp pageIds + expand groupIds (thứ tự ổn định). */
  pageIdsExpanded: string[]
  /** groupId gốc (từ request) → case id thuộc cây group đó (Phase 1: optional UI). */
  caseIdsByGroupId?: Record<string, string[]>
  caseCountByGroupId?: Record<string, number>
  /** Cảnh báo (vd page id không thuộc project, page không có case). */
  warnings: string[]
  /** Thứ tự page khi chạy theo flow (subset của pageIdsExpanded). */
  orderedPageIds?: string[]
}

/** Tham số khi tạo run từ renderer. */
export interface RunRequest {
  projectId: string
  caseIds?: string[]
  /** Khi có: main gộp thành `caseIds` trước khi spawn (union với `caseIds` nếu có). */
  pageIds?: string[]
  /** Expand cây con → page → case; union với `pageIds`. */
  groupIds?: string[]
  flowIds?: string[]
  suiteId?: string
  browsers: AutomationBrowser[]
  workers: number
  retries: number
  headed?: boolean
  grep?: string
  triggeredBy?: string
  /** Chạy tuần tự theo từng page (page map flow). */
  pageSequence?: string[]
  /** Bắt buộc khi dùng pageSequence — case theo page. */
  caseIdsByPageId?: Record<string, string[]>
  /** Resolve scope theo thứ tự nav edge. */
  ordered?: boolean
  /** Entry page khi chạy flow từ một trang. */
  startPageId?: string
}

/** Sự kiện stream từ main → renderer khi run đang chạy. */
export type RunStreamEvent =
  | { kind: 'log'; runId: string; chunk: string; stream: 'stdout' | 'stderr' }
  | { kind: 'progress'; runId: string; total: number; passed: number; failed: number; skipped: number; currentTest?: string; activePageId?: string; activeEdgeId?: string }
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
  /** Ghi DB sau run thành công — dùng để hydrate page map từ run history. */
  | { kind: 'persisted'; runId: string; projectId: string }

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
}
