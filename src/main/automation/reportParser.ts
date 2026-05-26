import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUuidV7 } from 'shared/randomUuidV7'
import { derivePlaywrightFailureDisplay, extractPlaywrightStackLocation } from 'shared/automation/playwrightFailureSummary'
import type {
  AutomationBrowser,
  CaseResultStatus,
  RunStatus,
  TestCaseFailureLocation,
  TestCaseFailureStep,
  TestCaseReportStep,
  TestCaseResult,
  TestRunSummary,
} from 'shared/automation/types'
import { isPlaywrightDefaultFailureScreenshotPath } from 'shared/automation/playwrightFailureScreenshots'

interface PlaywrightAttachment {
  name: string
  path?: string
  contentType?: string
}

/** Lỗi từ JSON reporter (expect / expect.soft); có thể có errorContext từ Playwright 1.60+; location theo JSONReportError; matcherResult khi reporter ghi. */
interface PlaywrightTestError {
  message?: string
  errorContext?: string
  location?: { file?: string; line?: number; column?: number }
  matcherResult?: unknown
}

interface PlaywrightTestResult {
  status?: string
  duration?: number
  retry?: number
  attachments?: PlaywrightAttachment[]
  errors?: PlaywrightTestError[]
  error?: PlaywrightTestError
  stdout?: Array<{ text?: string } | string>
  stderr?: Array<{ text?: string } | string>
  /** test.step — có thể lồng nhau; từng step có thể có attachments riêng. */
  steps?: PlaywrightStep[]
}

interface PlaywrightStep {
  title?: string
  category?: string
  error?: PlaywrightTestError
  duration?: number
  attachments?: PlaywrightAttachment[]
  steps?: PlaywrightStep[]
  /** Vị trí call site (expect, click…) — JSON reporter giống cột phải HTML report. */
  location?: { file?: string; line?: number; column?: number }
}

interface PlaywrightTest {
  testId?: string
  title?: string
  projectName?: string
  projectId?: string
  results?: PlaywrightTestResult[]
  expectedStatus?: string
  outcome?: string
}

interface PlaywrightSpec {
  /** Playwright `test.id` — khớp file `hb-full-steps.json` từ custom reporter. */
  id?: string
  title?: string
  file?: string
  tests?: PlaywrightTest[]
}

interface PlaywrightSuite {
  title?: string
  file?: string
  specs?: PlaywrightSpec[]
  suites?: PlaywrightSuite[]
}

interface PlaywrightJsonReport {
  config?: { rootDir?: string; projects?: Array<{ name?: string }> }
  suites?: PlaywrightSuite[]
  stats?: { duration?: number; startTime?: string; expected?: number; unexpected?: number; flaky?: number; skipped?: number }
  errors?: PlaywrightTestError[]
}

export interface ParsedRunReport {
  summary: Pick<TestRunSummary, 'total' | 'passed' | 'failed' | 'skipped' | 'flaky' | 'durationMs' | 'startedAt' | 'finishedAt'>
  results: Array<
    Omit<TestCaseResult, 'id' | 'runId' | 'caseId'> & {
      caseCode?: string
      title?: string
      specFile?: string
      /** Chỉ dùng lúc merge hb-full-steps.json; bị xóa trước khi ghi DB. */
      playwrightTestId?: string
    }
  >
}

function mapStatus(status?: string): CaseResultStatus {
  switch (status) {
    case 'passed':
      return 'passed'
    case 'failed':
      return 'failed'
    case 'skipped':
      return 'skipped'
    case 'timedOut':
      return 'timedOut'
    case 'interrupted':
      return 'interrupted'
    case 'flaky':
      return 'flaky'
    default:
      return (status as CaseResultStatus) ?? 'failed'
  }
}

function browserFromName(name?: string): AutomationBrowser {
  const n = (name ?? '').toLowerCase()
  if (n.includes('firefox')) return 'firefox'
  if (n.includes('webkit') || n.includes('safari')) return 'webkit'
  return 'chromium'
}

function extractCaseCodeFromTitle(title?: string): string | undefined {
  if (!title) return undefined
  const m = /\b(TC[-_]?[A-Za-z0-9-]+)\b/.exec(title)
  return m?.[1]
}

function extractCaseCodeFromFile(file?: string): string | undefined {
  if (!file) return undefined
  const base = path.basename(file, path.extname(file))
  if (/^TC/i.test(base)) return base
  return undefined
}

function joinStream(s?: Array<{ text?: string } | string>): string {
  if (!s) return ''
  return s.map(part => (typeof part === 'string' ? part : part.text ?? '')).join('')
}

/** Playwright JSON đôi khi trả duration dạng float; DB dùng BIGINT ms. */
function roundMs(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

function walkSuites(suites: PlaywrightSuite[] | undefined, out: Array<{ spec: PlaywrightSpec; suite: PlaywrightSuite }>): void {
  if (!suites) return
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      out.push({ spec, suite })
    }
    walkSuites(suite.suites, out)
  }
}

export async function readReportJson(filePath: string): Promise<PlaywrightJsonReport> {
  const raw = await fs.readFile(filePath, 'utf8')
  let trimmed = raw.trim()
  if (trimmed.charCodeAt(0) === 0xfeff) trimmed = trimmed.slice(1)
  return JSON.parse(trimmed) as PlaywrightJsonReport
}

/** Đợi file JSON reporter (ghi muộn sau khi process thoát). */
export async function readReportJsonWithRetry(
  filePath: string,
  opts?: { maxWaitMs?: number; intervalMs?: number }
): Promise<PlaywrightJsonReport> {
  const maxWaitMs = opts?.maxWaitMs ?? 15000
  const intervalMs = opts?.intervalMs ?? 100
  const deadline = Date.now() + maxWaitMs
  let lastErr: unknown
  const sleep = () =>
    new Promise<void>(resolve => {
      setTimeout(resolve, intervalMs)
    })
  while (Date.now() < deadline) {
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      let trimmed = raw.trim()
      if (trimmed.charCodeAt(0) === 0xfeff) trimmed = trimmed.slice(1)
      if (!trimmed) {
        lastErr = new Error('report.json is empty')
        await sleep()
        continue
      }
      return JSON.parse(trimmed) as PlaywrightJsonReport
    } catch (e) {
      lastErr = e
      const code = (e as NodeJS.ErrnoException)?.code
      const isSyntax = e instanceof SyntaxError
      const retryable =
        code === 'ENOENT' ||
        code === 'EBUSY' ||
        code === 'EPERM' ||
        code === 'EACCES' ||
        isSyntax
      if (!retryable) throw e
      await sleep()
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/** Chọn path trace từ attachments: ưu tiên `name: trace`, không gán mọi file zip làm trace. */
function pickTracePath(attachments: PlaywrightAttachment[] | undefined): string | undefined {
  if (!attachments?.length) return undefined
  for (const att of attachments) {
    if (att.path && att.name === 'trace') return att.path
  }
  for (const att of attachments) {
    if (!att.path || att.contentType !== 'application/zip') continue
    const base = path.basename(att.path).toLowerCase()
    if (base === 'trace.zip' || base.endsWith('-trace.zip')) return att.path
  }
  return undefined
}

function isHbFailureHighlightName(name: string | undefined): boolean {
  return typeof name === 'string' && /^failure-highlight(?:-\d+)?\.png$/i.test(name)
}

function isHbFailureHighlightBasename(filePath: string): boolean {
  return /^failure-highlight(?:-\d+)?\.png$/i.test(path.basename(filePath))
}

/** Nhận diện attachment highlight từ `name` hoặc basename của `path` (JSON reporter đôi khi thiếu name). */
function failureHighlightPairFromAttachment(att: PlaywrightAttachment): { n: number; path: string } | null {
  if (!att.path) return null
  const base = path.basename(att.path)
  const name = typeof att.name === 'string' && att.name.trim() ? att.name.trim() : base
  const m = /^failure-highlight(?:-(\d+))?\.png$/i.exec(name) ?? /^failure-highlight(?:-(\d+))?\.png$/i.exec(base)
  if (!m) return null
  const n = m[1] ? parseInt(m[1], 10) : 1
  return { n, path: att.path }
}

/** Đường dẫn ảnh failure-highlight-1.png … theo thứ tự lỗi (hb-fixtures). */
function collectFailureHighlightPathsSorted(attachments: PlaywrightAttachment[] | undefined): string[] {
  const pairs: { n: number; path: string }[] = []
  for (const att of attachments ?? []) {
    const pair = failureHighlightPairFromAttachment(att)
    if (pair) pairs.push(pair)
  }
  pairs.sort((a, b) => a.n - b.n)
  return pairs.map(p => p.path)
}

function trimErrorContext(raw?: string): string | undefined {
  const t = raw?.trim()
  return t ? t : undefined
}

/** Ảnh / video / trace từ mảng attachments của một result hoặc một step (bỏ ảnh failure-highlight — xử lý riêng). */
function collectMediaFromAttachments(attachments: PlaywrightAttachment[] | undefined): {
  screenshotPaths: string[]
  videoPath?: string
  tracePath?: string
} {
  const screenshotPaths: string[] = []
  let videoPath: string | undefined
  const hlAny = collectFailureHighlightPathsSorted(attachments).length > 0
  for (const att of attachments ?? []) {
    if (!att.path) continue
    if (isHbFailureHighlightName(att.name) || isHbFailureHighlightBasename(att.path)) continue
    if (hlAny && isPlaywrightDefaultFailureScreenshotPath(att.path)) continue
    if (att.name === 'screenshot' || att.contentType?.startsWith('image/')) screenshotPaths.push(att.path)
    else if (att.name === 'video' || att.contentType?.startsWith('video/')) videoPath = att.path
  }
  const tracePath = pickTracePath(attachments)
  return { screenshotPaths, videoPath, tracePath }
}

function pickFailureLocation(
  message: string,
  jsonLoc?: { file?: string; line?: number; column?: number }
): TestCaseFailureLocation | undefined {
  if (jsonLoc?.file) {
    return { file: jsonLoc.file, line: jsonLoc.line, column: jsonLoc.column }
  }
  const fromStack = extractPlaywrightStackLocation(message)
  if (fromStack) return fromStack
  return undefined
}

function failureStepFromParts(
  label: string,
  message: string,
  screenshotPaths: string[],
  failureHighlightPaths: string[] | undefined,
  errorContext: string | undefined,
  jsonLocation?: { file?: string; line?: number; column?: number },
  matcherResult?: unknown
): TestCaseFailureStep {
  const d = derivePlaywrightFailureDisplay(message, matcherResult)
  return {
    label,
    message,
    summary: d.summary,
    assertionHints: d.assertionHints,
    location: pickFailureLocation(message, jsonLocation),
    screenshotPaths,
    failureHighlightPaths,
    errorContext,
  }
}

const MAX_REPORT_STEPS = 500

function pickReportStepLocation(
  stepLoc: PlaywrightStep['location'],
  errLoc: PlaywrightTestError['location']
): TestCaseFailureLocation | undefined {
  const loc = stepLoc?.file ? stepLoc : errLoc?.file ? errLoc : undefined
  if (!loc?.file || typeof loc.file !== 'string') return undefined
  const line = typeof loc.line === 'number' && Number.isFinite(loc.line) ? loc.line : undefined
  const column = typeof loc.column === 'number' && Number.isFinite(loc.column) ? loc.column : undefined
  return { file: loc.file, line, column }
}

/**
 * Flatten cây `results[].steps` của JSON reporter (hook, expect, click…)
 * để UI hiển thị giống panel “Test steps” của Playwright HTML report.
 */
export function buildReportStepsList(last: PlaywrightTestResult | undefined): TestCaseReportStep[] {
  if (!last?.steps?.length) return []
  const out: TestCaseReportStep[] = []
  const walk = (steps: PlaywrightStep[] | undefined, depth: number): void => {
    if (!steps?.length || out.length >= MAX_REPORT_STEPS) return
    for (const s of steps) {
      if (out.length >= MAX_REPORT_STEPS) break
      const title = s.title?.trim() || (s.category === 'hook' ? 'Hook' : 'Step')
      const err = s.error as PlaywrightTestError | undefined
      const errMsg = err?.message?.trim()
      const failed = Boolean(errMsg)
      const snippet =
        failed && errMsg ? (errMsg.length > 400 ? `${errMsg.slice(0, 400)}…` : errMsg) : undefined
      const hasNested = Boolean(s.steps?.length)
      const location = pickReportStepLocation(s.location, err?.location)
      out.push({
        title,
        category: typeof s.category === 'string' && s.category.trim() ? s.category.trim() : undefined,
        durationMs: roundMs(s.duration),
        depth,
        failed: failed || undefined,
        errorSnippet: snippet,
        location,
        hasNestedSteps: hasNested || undefined,
      })
      walk(s.steps, depth + 1)
    }
  }
  walk(last.steps, 0)
  return out
}

/**
 * Tách từng lỗi để UI hiển thị: ưu tiên test.step có error; không thì tách errors[] / error đơn.
 * Media cấp test được gắn vào mỗi bước khi bước không có ảnh/video/trace riêng (Playwright thường attach một lần cuối).
 */
export function buildFailureStepsList(last: PlaywrightTestResult | undefined): TestCaseFailureStep[] {
  if (!last) return []
  const root = collectMediaFromAttachments(last.attachments)
  const hlRoot = collectFailureHighlightPathsSorted(last.attachments)

  const errorEntries = (last.errors ?? [])
    .map(e => {
      const err = e as PlaywrightTestError
      return {
        message: typeof err?.message === 'string' ? err.message.trim() : '',
        errorContext: trimErrorContext(err?.errorContext),
        location: err?.location,
        matcherResult: err.matcherResult,
      }
    })
    .filter(e => e.message)

  /** Nhiều lỗi trong `errors[]` (expect.soft, …): luôn tách theo errors — không dùng `steps` lồng (Playwright hay có step nội bộ, làm lệch mapping ảnh highlight). */
  if (errorEntries.length > 1) {
    return errorEntries.map((e, i) =>
      failureStepFromParts(
        `Failure ${i + 1}`,
        e.message,
        [...root.screenshotPaths],
        hlRoot[i] ? [hlRoot[i]] : undefined,
        e.errorContext,
        e.location,
        e.matcherResult
      )
    )
  }

  const fromNested: Array<{
    label: string
    message: string
    screenshotPaths: string[]
    errorContext?: string
    location?: { file?: string; line?: number; column?: number }
    matcherResult?: unknown
  }> = []
  const walk = (steps: PlaywrightStep[] | undefined): void => {
    if (!steps?.length) return
    for (const s of steps) {
      walk(s.steps)
      const msg = s.error?.message?.trim()
      if (!msg) continue
      const own = collectMediaFromAttachments(s.attachments)
      const err = s.error as PlaywrightTestError | undefined
      fromNested.push({
        label: s.title?.trim() || 'Step',
        message: msg,
        screenshotPaths: own.screenshotPaths,
        errorContext: trimErrorContext(s.error?.errorContext),
        location: s.error?.location,
        matcherResult: err?.matcherResult,
      })
    }
  }
  walk(last.steps)

  if (fromNested.length > 0) {
    return fromNested.map((s, i) =>
      failureStepFromParts(
        s.label,
        s.message,
        s.screenshotPaths.length > 0 ? s.screenshotPaths : [...root.screenshotPaths],
        hlRoot[i] ? [hlRoot[i]] : undefined,
        s.errorContext,
        s.location,
        s.matcherResult
      )
    )
  }

  const single = last.error?.message?.trim()
  let rows: Array<{
    message: string
    errorContext?: string
    location?: { file?: string; line?: number; column?: number }
    matcherResult?: unknown
  }> = []
  if (errorEntries.length === 1) {
    const e0 = errorEntries[0]
    if (e0)
      rows = [
        {
          message: e0.message,
          errorContext: e0.errorContext,
          location: e0.location,
          matcherResult: e0.matcherResult,
        },
      ]
  } else if (single) {
    const err = last.error as PlaywrightTestError | undefined
    rows = [
      {
        message: single,
        errorContext: trimErrorContext(last.error?.errorContext),
        location: last.error?.location,
        matcherResult: err?.matcherResult,
      },
    ]
  }
  if (rows.length === 0) return []

  return rows.map((row, i) =>
    failureStepFromParts(
      rows.length > 1 ? `Failure ${i + 1}` : 'Failure',
      row.message,
      [...root.screenshotPaths],
      hlRoot[i] ? [hlRoot[i]] : undefined,
      row.errorContext,
      row.location,
      row.matcherResult
    )
  )
}

/**
 * JSON reporter Playwright chỉ giữ `test.step` (category `test.step`).
 * Reporter `./hb-full-steps-reporter.ts` ghi `hb-full-steps.json` với đủ pw:api / expect / hook — merge vào `reportSteps`.
 */
export function mergeHbFullStepsFromDisk(parsed: ParsedRunReport, hbStepsPath: string): void {
  try {
    if (existsSync(hbStepsPath)) {
      const raw = readFileSync(hbStepsPath, 'utf8').trim()
      if (raw) {
        const data = JSON.parse(raw) as { tests?: Record<string, TestCaseReportStep[]> }
        const map = data.tests
        if (map && typeof map === 'object') {
          for (const row of parsed.results) {
            const id = row.playwrightTestId
            if (!id) continue
            const steps = map[id]
            if (!Array.isArray(steps) || steps.length === 0) continue
            row.reportSteps = steps
          }
        }
      }
    }
  } catch {
    // ignore corrupt hb-full-steps.json
  }
  for (const row of parsed.results) {
    delete row.playwrightTestId
  }
}

/** Parse JSON reporter của Playwright thành dữ liệu ghi DB. */
export function parsePlaywrightReport(report: PlaywrightJsonReport): ParsedRunReport {
  const out: ParsedRunReport = {
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      durationMs: roundMs(report.stats?.duration ?? 0),
      startedAt: report.stats?.startTime ?? undefined,
      finishedAt: report.stats?.startTime
        ? new Date(new Date(report.stats.startTime).getTime() + roundMs(report.stats?.duration ?? 0)).toISOString()
        : undefined,
    },
    results: [],
  }

  const flat: Array<{ spec: PlaywrightSpec; suite: PlaywrightSuite }> = []
  walkSuites(report.suites, flat)

  for (const { spec } of flat) {
    for (const test of spec.tests ?? []) {
      out.summary.total += 1
      const last = test.results?.[test.results.length - 1]
      const status = mapStatus(last?.status)
      const isFlaky = (test.results?.length ?? 0) > 1 && status === 'passed'
      if (status === 'passed') out.summary.passed += 1
      else if (status === 'failed' || status === 'timedOut' || status === 'interrupted') out.summary.failed += 1
      else if (status === 'skipped') out.summary.skipped += 1
      if (isFlaky) out.summary.flaky += 1

      const rootMedia = collectMediaFromAttachments(last?.attachments)
      const hlOrdered = collectFailureHighlightPathsSorted(last?.attachments)
      const screenshots = [...hlOrdered, ...rootMedia.screenshotPaths.filter(p => !hlOrdered.includes(p))]
      const videoPath = rootMedia.videoPath
      const tracePath = rootMedia.tracePath
      const errorMessage =
        last?.errors?.map(e => e?.message).filter(Boolean).join('\n---\n') ?? last?.error?.message ?? undefined
      const failureSteps = buildFailureStepsList(last)
      const reportStepsFromJson = buildReportStepsList(last)

      out.results.push({
        playwrightTestId: spec.id,
        caseCode: extractCaseCodeFromTitle(test.title) ?? extractCaseCodeFromTitle(spec.title) ?? extractCaseCodeFromFile(spec.file),
        title: test.title ?? spec.title,
        specFile: spec.file,
        browser: browserFromName(test.projectName),
        status: isFlaky ? 'flaky' : status,
        durationMs: roundMs(last?.duration ?? 0),
        attempts: test.results?.length ?? 1,
        errorMessage,
        failureSteps: failureSteps.length > 0 ? failureSteps : undefined,
        reportSteps: reportStepsFromJson.length > 0 ? reportStepsFromJson : undefined,
        tracePath,
        screenshotPaths: screenshots,
        videoPath,
        stdoutPath: undefined,
      })
    }
  }
  return out
}

export function overallStatusFromSummary(summary: ParsedRunReport['summary'], cancelled = false): RunStatus {
  if (cancelled) return 'cancelled'
  if (summary.failed > 0) return 'failed'
  if (summary.total === 0) return 'error'
  return 'passed'
}

/** Helper sinh ID cho row test_case_results khi caller ghi DB. */
export function newCaseResultId(): string {
  return randomUuidV7()
}

/** Best-effort dump stdout/stderr ra file để có thể "Open full log". */
export function persistableStreams(last?: PlaywrightTestResult): { stdout: string; stderr: string } {
  return {
    stdout: joinStream(last?.stdout),
    stderr: joinStream(last?.stderr),
  }
}
