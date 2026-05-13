import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { createWriteStream, type WriteStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, type WebContents } from 'electron'
import l from 'electron-log'
import _ from 'lodash'
import { randomUuidV7 } from 'shared/randomUuidV7'
import type { AutomationBrowser, RunRequest, RunStreamEvent, TestProject, TestRunSummary } from 'shared/automation/types'
import { IPC } from 'main/constants'
import {
  buildPlaywrightSpawnEnv,
  bootstrapWorkspace,
  getReportDir,
  getRunArtifactsDir,
  getRunJsonFile,
  getRunJunitFile,
  getRunLogFile,
  resolvePlaywrightCliPath,
} from './workspace'
import {
  overallStatusFromSummary,
  parsePlaywrightReport,
  readReportJsonWithRetry,
  type ParsedRunReport,
} from './reportParser'

interface ActiveRun {
  runId: string
  projectId: string
  proc: ChildProcessWithoutNullStreams
  startedAt: string
  cancel: () => void
  result: Promise<RunOutcome>
}

export interface RunOutcome {
  runId: string
  status: TestRunSummary['status']
  parsed?: ParsedRunReport
  logFile: string
  jsonFile: string
  junitFile: string
  reportDir: string
  startedAt: string
  finishedAt: string
  cancelled: boolean
}

/** Một run / project. Project khác chạy song song được. */
const projectLocks = new Map<string, ActiveRun>()
const runIndex = new Map<string, ActiveRun>()

function broadcast(event: RunStreamEvent): void {
  const channel = event.kind === 'progress' ? IPC.AUTOMATION.STREAM_PROGRESS : IPC.AUTOMATION.STREAM_LOG
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(channel, event)
    } catch {
      // ignore
    }
  }
}

/** IPC handler gọi khi ghi DB sau run thất bại — cùng kênh stream như `finished`. */
export function broadcastAutomationRunEvent(event: RunStreamEvent): void {
  broadcast(event)
}

function sendTo(target: WebContents | undefined, event: RunStreamEvent): void {
  const channel = event.kind === 'progress' ? IPC.AUTOMATION.STREAM_PROGRESS : IPC.AUTOMATION.STREAM_LOG
  try {
    target?.send(channel, event)
  } catch {
    // ignore
  }
}

interface ProgressTally {
  total: number
  passed: number
  failed: number
  skipped: number
  currentTest?: string
}

async function readLogTailString(file: string, maxChars: number): Promise<string | undefined> {
  try {
    const buf = await fs.readFile(file)
    const s = buf.toString('utf8')
    return s.length <= maxChars ? s : s.slice(-maxChars)
  } catch {
    return undefined
  }
}

/** Rút đoạn ngắn từ tail run.log cho UI + toast (song song với electron-log). */
export function extractPlaywrightFailureSnippet(
  tail: string | undefined,
  exitCode: number | null | undefined
): string {
  const codeHint =
    exitCode != null && exitCode !== 0 ? `Playwright exited with code ${exitCode}. ` : ''
  if (!tail?.trim()) {
    return `${codeHint}No log output captured.`
  }
  const lines = tail
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
  const hit = lines.find(l => /\bERR_[A-Z0-9_]+\b|Error:|error TS|SyntaxError|MODULE_NOT_FOUND|Cannot find module/i.test(l))
  const snippet = (hit ?? lines.slice(-5).join('\n')).slice(0, 900)
  return `${codeHint}${snippet}`
}

/** Khi `report.json` không tạo được (reporter lỗi / thoát sớm) nhưng list reporter đã đếm dòng. */
function parsedFromListTally(tally: ProgressTally, startedAt: string, finishedAt: string): ParsedRunReport {
  return {
    summary: {
      total: tally.total,
      passed: tally.passed,
      failed: tally.failed,
      skipped: tally.skipped,
      flaky: 0,
      durationMs: 0,
      startedAt,
      finishedAt,
    },
    results: [],
  }
}

function parseListReporterLine(line: string, tally: ProgressTally): boolean {
  let changed = false
  // Playwright `list` reporter prints lines like:  "  ok  1 [chromium] › example.spec.ts:5:1 › sample"
  //                                                "  x   2 [chromium] › example.spec.ts:5:1 › fails"
  //                                                "  -   3 [chromium] › skipped"
  const m = /^\s*(ok|x|-)\s+\d+\s+(.*)$/.exec(line)
  if (m) {
    const mark = m[1]
    tally.total += 1
    if (mark === 'ok') tally.passed += 1
    else if (mark === 'x') tally.failed += 1
    else tally.skipped += 1
    tally.currentTest = m[2]
    changed = true
  } else {
    // Total summary line ("  5 passed (3.2s)")
    const totals = /(\d+)\s+passed/.exec(line)
    if (totals) {
      // best-effort sync (in case mark parsing missed)
      const n = Number(totals[1])
      if (!Number.isNaN(n) && n > tally.passed) {
        tally.passed = n
        changed = true
      }
    }
  }
  return changed
}

function buildArgs(req: RunRequest, workspacePath: string, runId: string): string[] {
  const args: string[] = ['test']
  for (const b of req.browsers) {
    args.push(`--project=${b}`)
  }
  args.push(`--workers=${Math.max(1, req.workers)}`)
  args.push(`--retries=${Math.max(0, req.retries)}`)
  if (req.grep?.trim()) args.push(`--grep=${req.grep.trim()}`)
  if (req.headed) args.push('--headed')

  // Không trùng thư mục với report.json/junit: Playwright dọn `--output` có thể gây mất file hoặc race khi đọc JSON.
  args.push(`--output=${getRunArtifactsDir(req.projectId, runId)}`)
  args.push(`--config=${path.join(workspacePath, 'playwright.config.ts')}`)

  return args
}

/**
 * Env bổ sung cho Playwright (một số phiên bản đọc PLAYWRIGHT_* khi resolve reporter).
 */
function buildReporterEnv(jsonFile: string, junitFile: string): Record<string, string> {
  return {
    HB_PLAYWRIGHT_JSON_FILE: jsonFile,
    HB_PLAYWRIGHT_JUNIT_FILE: junitFile,
    PLAYWRIGHT_JSON_OUTPUT_FILE: jsonFile,
    PLAYWRIGHT_JUNIT_OUTPUT_FILE: junitFile,
  }
}

export function isRunBusy(projectId: string): boolean {
  return projectLocks.has(projectId)
}

export function getRun(runId: string): ActiveRun | undefined {
  return runIndex.get(runId)
}

export function cancelRun(runId: string, reason = 'user-cancel'): boolean {
  const active = runIndex.get(runId)
  if (!active) return false
  l.info(`[automation] cancel run ${runId} (${reason})`)
  active.cancel()
  return true
}

interface StartRunArgs {
  project: TestProject
  request: RunRequest
  sender?: WebContents
  /** Bí mật theo project (env passthrough) — chỉ tồn tại trong child process. */
  secretEnv?: Record<string, string>
}

export interface StartRunResult {
  runId: string
  startedAt: string
  workspacePath: string
}

/**
 * Khởi chạy Playwright cho project. Throws nếu project đang có run hoạt động.
 * Trả về promise resolve khi process kết thúc (kèm parsed report nếu có).
 */
export async function startRun(args: StartRunArgs): Promise<{ start: StartRunResult; outcome: Promise<RunOutcome> }> {
  const { project, request, sender, secretEnv } = args
  if (isRunBusy(project.id)) {
    throw new Error(`Project ${project.name} already has an active run.`)
  }

  const runId = randomUuidV7()
  const startedAt = new Date().toISOString()

  await fs.mkdir(path.dirname(getRunLogFile(project.id, runId)), { recursive: true })
  const logFile = getRunLogFile(project.id, runId)
  const jsonFile = getRunJsonFile(project.id, runId)
  const junitFile = getRunJunitFile(project.id, runId)
  const reportDir = getReportDir(project.id, runId)
  await fs.mkdir(reportDir, { recursive: true })

  const workspacePath = await bootstrapWorkspace(project, {
    jsonFile,
    junitFile,
  })

  const baseEnv = buildPlaywrightSpawnEnv({
    ...buildReporterEnv(jsonFile, junitFile),
    HB_RUN_ID: runId,
    HB_PROJECT_ID: project.id,
    ...(secretEnv ?? {}),
  })

  const cliPath = resolvePlaywrightCliPath()
  const spawnArgs = buildArgs(request, workspacePath, runId)

  l.info(`[automation] start run ${runId} project=${project.id} cli=${cliPath} args=`, spawnArgs)
  const proc = spawn(process.execPath, [cliPath, ...spawnArgs], {
    cwd: workspacePath,
    env: baseEnv,
  }) as ChildProcessWithoutNullStreams

  let logStream: WriteStream | null = createWriteStream(logFile, { flags: 'w' })
  let cancelled = false
  let killTimer: NodeJS.Timeout | null = null
  const tally: ProgressTally = { total: 0, passed: 0, failed: 0, skipped: 0 }

  const emitProgress = _.throttle(() => {
    const event: RunStreamEvent = {
      kind: 'progress',
      runId,
      total: tally.total,
      passed: tally.passed,
      failed: tally.failed,
      skipped: tally.skipped,
      currentTest: tally.currentTest,
    }
    broadcast(event)
    sendTo(sender, event)
  }, 250)

  const flushLog = _.throttle(
    (chunk: string, stream: 'stdout' | 'stderr') => {
      const event: RunStreamEvent = { kind: 'log', runId, chunk, stream }
      broadcast(event)
      sendTo(sender, event)
    },
    100,
    { leading: true, trailing: true }
  )

  proc.stdout.setEncoding('utf8')
  proc.stderr.setEncoding('utf8')

  let stdoutBuffer = ''
  proc.stdout.on('data', (data: string) => {
    stdoutBuffer += data
    for (;;) {
      const idx = stdoutBuffer.indexOf('\n')
      if (idx === -1) break
      const line = stdoutBuffer.slice(0, idx)
      stdoutBuffer = stdoutBuffer.slice(idx + 1)
      const changed = parseListReporterLine(line, tally)
      if (changed) emitProgress()
    }
    if (logStream) logStream.write(data)
    flushLog(data, 'stdout')
  })

  proc.stderr.on('data', (data: string) => {
    if (logStream) logStream.write(data)
    flushLog(data, 'stderr')
  })

  const cancel = (): void => {
    if (cancelled) return
    cancelled = true
    try {
      proc.kill('SIGTERM')
    } catch {
      // ignore
    }
    killTimer = setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {
        // ignore
      }
    }, 3000)
  }

  const outcomeP = new Promise<RunOutcome>(resolve => {
    proc.on('exit', async (code, signal) => {
      if (killTimer) clearTimeout(killTimer)
      try {
        if (logStream) {
          logStream.end()
          logStream = null
        }
      } catch {
        // ignore
      }
      const finishedAt = new Date().toISOString()

      let parsed: ParsedRunReport | undefined
      let logTailForFailure: string | undefined
      try {
        const report = await readReportJsonWithRetry(jsonFile)
        try {
          parsed = parsePlaywrightReport(report)
        } catch (parseErr) {
          l.warn('[automation] parsePlaywrightReport failed', parseErr)
          logTailForFailure = await readLogTailString(logFile, 12000)
        }
      } catch (err) {
        l.warn(`[automation] could not read JSON report ${jsonFile} (child exitCode=${code ?? 'unknown'})`, err)
        logTailForFailure = await readLogTailString(logFile, 12000)
        if (logTailForFailure?.trim()) {
          l.warn('[automation] playwright run.log (tail)', logTailForFailure)
        }
        if (tally.total > 0) {
          parsed = parsedFromListTally(tally, startedAt, finishedAt)
          l.info('[automation] using list-reporter tally fallback (report.json missing)')
        }
      }

      const status = parsed ? overallStatusFromSummary(parsed.summary, cancelled) : cancelled ? 'cancelled' : 'error'

      let failureDetail: string | undefined
      if (!cancelled && status === 'error') {
        const tail = logTailForFailure ?? (await readLogTailString(logFile, 12000))
        failureDetail = extractPlaywrightFailureSnippet(tail, code)
      }

      const finishedEvent: RunStreamEvent = {
        kind: 'finished',
        runId,
        status,
        failureDetail,
        summary: {
          id: runId,
          projectId: project.id,
          status,
          browsers: request.browsers,
          workers: request.workers,
          retries: request.retries,
          grep: request.grep,
          total: parsed?.summary.total ?? tally.total,
          passed: parsed?.summary.passed ?? tally.passed,
          failed: parsed?.summary.failed ?? tally.failed,
          skipped: parsed?.summary.skipped ?? tally.skipped,
          flaky: parsed?.summary.flaky ?? 0,
          durationMs: parsed?.summary.durationMs ?? 0,
          startedAt,
          finishedAt,
          triggeredBy: request.triggeredBy,
          reportPath: reportDir,
          junitPath: junitFile,
          jsonPath: jsonFile,
          cancelReason: cancelled ? 'user-cancel' : undefined,
        },
      }
      broadcast(finishedEvent)
      sendTo(sender, finishedEvent)
      if (signal) l.info(`[automation] run ${runId} exited via signal ${signal}`)

      projectLocks.delete(project.id)
      runIndex.delete(runId)

      resolve({
        runId,
        status,
        parsed,
        logFile,
        jsonFile,
        junitFile,
        reportDir,
        startedAt,
        finishedAt,
        cancelled,
      })
    })
    proc.on('error', err => {
      l.error(`[automation] run ${runId} process error`, err)
    })
  })

  const active: ActiveRun = {
    runId,
    projectId: project.id,
    proc,
    startedAt,
    cancel,
    result: outcomeP,
  }
  projectLocks.set(project.id, active)
  runIndex.set(runId, active)

  const startedEvent: RunStreamEvent = {
    kind: 'started',
    runId,
    projectId: project.id,
    startedAt,
  }
  broadcast(startedEvent)
  sendTo(sender, startedEvent)

  return {
    start: { runId, startedAt, workspacePath },
    outcome: outcomeP,
  }
}

/** Hủy mọi run đang chạy (logout, app quit). */
export function cancelAllRuns(reason = 'shutdown'): void {
  for (const active of Array.from(runIndex.values())) {
    active.cancel()
    l.info(`[automation] cancel-all → ${active.runId} (${reason})`)
  }
}

/** Cài Chromium qua Electron-as-Node. Stream output ra channel STREAM_INSTALL. */
export async function installBrowsers(
  browsers: AutomationBrowser[],
  sender?: WebContents
): Promise<{ status: 'ok' | 'error'; message?: string }> {
  if (!browsers.length) return { status: 'error', message: 'No browsers selected.' }
  const cliPath = resolvePlaywrightCliPath()
  const env = buildPlaywrightSpawnEnv()
  return new Promise(resolve => {
    const proc = spawn(process.execPath, [cliPath, 'install', ...browsers], { env, cwd: app.getAppPath() })
    proc.stdout?.setEncoding('utf8')
    proc.stderr?.setEncoding('utf8')
    const send = (chunk: string) => {
      try {
        sender?.send(IPC.AUTOMATION.STREAM_INSTALL, chunk)
      } catch {
        // ignore
      }
    }
    proc.stdout?.on('data', send)
    proc.stderr?.on('data', send)
    proc.on('error', err => resolve({ status: 'error', message: err.message }))
    proc.on('exit', code => {
      if (code === 0) resolve({ status: 'ok' })
      else resolve({ status: 'error', message: `Playwright install exited with code ${code}` })
    })
  })
}
