import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUuidV7 } from 'shared/randomUuidV7'
import type { AutomationBrowser, CaseResultStatus, RunStatus, TestCaseResult, TestRunSummary } from 'shared/automation/types'

interface PlaywrightAttachment {
  name: string
  path?: string
  contentType?: string
}

interface PlaywrightTestResult {
  status?: string
  duration?: number
  retry?: number
  attachments?: PlaywrightAttachment[]
  errors?: Array<{ message?: string }>
  error?: { message?: string }
  stdout?: Array<{ text?: string } | string>
  stderr?: Array<{ text?: string } | string>
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
  errors?: Array<{ message?: string }>
}

export interface ParsedRunReport {
  summary: Pick<TestRunSummary, 'total' | 'passed' | 'failed' | 'skipped' | 'flaky' | 'durationMs' | 'startedAt' | 'finishedAt'>
  results: Array<Omit<TestCaseResult, 'id' | 'runId' | 'caseId'> & { caseCode?: string; title?: string; specFile?: string }>
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
  return JSON.parse(raw) as PlaywrightJsonReport
}

/** Đợi file JSON reporter (ghi muộn sau khi process thoát). */
export async function readReportJsonWithRetry(
  filePath: string,
  opts?: { maxWaitMs?: number; intervalMs?: number }
): Promise<PlaywrightJsonReport> {
  const maxWaitMs = opts?.maxWaitMs ?? 8000
  const intervalMs = opts?.intervalMs ?? 100
  const deadline = Date.now() + maxWaitMs
  let lastErr: unknown
  while (Date.now() < deadline) {
    try {
      return await readReportJson(filePath)
    } catch (e) {
      lastErr = e
      const code = (e as NodeJS.ErrnoException)?.code
      if (code !== 'ENOENT') throw e
      await new Promise<void>(resolve => {
        setTimeout(resolve, intervalMs)
      })
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
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

      const screenshots: string[] = []
      let tracePath: string | undefined
      let videoPath: string | undefined
      for (const att of last?.attachments ?? []) {
        if (!att.path) continue
        if (att.name === 'trace' || att.contentType === 'application/zip') tracePath = att.path
        else if (att.name === 'screenshot' || att.contentType?.startsWith('image/')) screenshots.push(att.path)
        else if (att.name === 'video' || att.contentType?.startsWith('video/')) videoPath = att.path
      }
      const errorMessage =
        last?.errors?.map(e => e?.message).filter(Boolean).join('\n---\n') ?? last?.error?.message ?? undefined

      out.results.push({
        caseCode: extractCaseCodeFromTitle(test.title) ?? extractCaseCodeFromTitle(spec.title) ?? extractCaseCodeFromFile(spec.file),
        title: test.title ?? spec.title,
        specFile: spec.file,
        browser: browserFromName(test.projectName),
        status: isFlaky ? 'flaky' : status,
        durationMs: roundMs(last?.duration ?? 0),
        attempts: test.results?.length ?? 1,
        errorMessage,
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
