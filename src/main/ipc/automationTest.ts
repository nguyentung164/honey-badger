import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain, shell } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { randomUuidV7 } from 'shared/randomUuidV7'
import type {
  AutomationBrowser,
  AutomationSettingsState,
  ImportLayout,
  RunRequest,
  TestCase,
  TestCaseResult,
  TestProject,
  TestRunSummary,
} from 'shared/automation/types'
import { isPlaywrightDefaultFailureScreenshotPath } from 'shared/automation/playwrightFailureScreenshots'
import { generateSpecCode } from '../automation/aiSpecCodegen'
import { proposeSpecRepair } from '../automation/aiSpecRepair'
import { generateTestCases } from '../automation/aiTestCase'
import {
  createProject,
  createSuite,
  deleteCase,
  deleteProject,
  deleteSuite,
  finalizeRun,
  getCase,
  getCaseByCode,
  getProject,
  getResult,
  getRunSummary,
  insertCaseResults,
  insertQueuedRun,
  insertRepairProposal,
  listAllProjectIds,
  listCases,
  listOldRunIds,
  listProjects,
  listRepairProposalsByResult,
  listResults,
  listRuns,
  listSuites,
  setCaseSpecStatus,
  updateProject,
  updateRepairStatus,
  updateSuite,
  upsertCases,
  deleteRunCascade,
  deleteAllRunsForProject,
} from '../automation/db'
import { parseImportFile } from '../automation/importers'
import { excelSelectionsToMarkdown, listExcelWorkbookSheets } from '../automation/importers/excelMarkdown'
import {
  broadcastAutomationRunEvent,
  cancelAllRuns,
  cancelRun,
  installBrowsers,
  isRunBusy,
  startRun,
} from '../automation/runner'
import {
  clearProjectSecrets,
  getAutomationSettings,
  getProjectSecrets,
  setAutomationSettings,
  setProjectSecrets,
} from '../automation/settingsStore'
import {
  assertResolvedPathInsideProjectWorkspace,
  bootstrapWorkspace,
  buildPlaywrightSpawnEnv,
  clearRunHistoryArtifactsFromWorkspace,
  detectInstalledBrowsers,
  getSpecFile,
  getWorkspacePath,
  patchSpecPlaywrightImport,
  removeWorkspace,
  resolvePlaywrightCliPath,
  resolveStoredArtifactPathForOpen,
  resolveStoredTracePathForOpen,
  resolveTraceArtifactAbsolutePath,
} from '../automation/workspace'
import { getTokenFromStore, verifyToken } from '../task/auth'
import { query } from '../task/schema/db'

const PREVIEW_IMAGE_MAX_BYTES = 15 * 1024 * 1024

function safeResolveRunArtifact(args: { artifactPath: string; projectId: string; runId: string }): string {
  const abs = resolveStoredArtifactPathForOpen(args.artifactPath, { projectId: args.projectId, runId: args.runId })
  assertResolvedPathInsideProjectWorkspace(args.projectId, abs)
  return abs
}

function mimeForImagePreview(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'application/octet-stream'
}

interface Envelope<T = unknown> {
  status: 'success' | 'error'
  data?: T
  message?: string
}

function ok<T>(data?: T): Envelope<T> {
  return { status: 'success', data }
}

function fail(message: string): Envelope<never> {
  l.warn('[automation] handler error:', message)
  return { status: 'error', message }
}

function currentUserId(): string | null {
  const token = getTokenFromStore()
  if (!token) return null
  const session = verifyToken(token)
  return session?.userId ?? null
}

function projectContextText(project: TestProject): string {
  return `Name: ${project.name}\nBase URL: ${project.baseUrl}\nDescription: ${project.description ?? ''}\nBrowsers: ${project.browsers.join(', ')}`
}

async function readSpecOrEmpty(projectId: string, code: string): Promise<string> {
  const file = getSpecFile(projectId, code)
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return ''
  }
}

async function writeSpec(projectId: string, code: string, content: string): Promise<string> {
  const file = getSpecFile(projectId, code)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, patchSpecPlaywrightImport(content), 'utf8')
  return file
}

function preferredScreenshotPathForRepair(result: TestCaseResult): string | undefined {
  const paths = result.screenshotPaths ?? []
  const hl = paths.find(p => /failure-highlight(?:-\d+)?\.png$/i.test(path.basename(p)))
  if (hl) return hl
  return paths.find(p => !isPlaywrightDefaultFailureScreenshotPath(p)) ?? paths[0]
}

export function registerAutomationTestIpcHandlers(): void {
  l.info('🔄 Registering Automation Test IPC Handlers...')

  // -------------------- Project CRUD --------------------
  ipcMain.handle(IPC.AUTOMATION.PROJECT_LIST, async () => {
    try {
      const items = await listProjects()
      return ok(items)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.PROJECT_GET, async (_e, id: string) => {
    try {
      const item = await getProject(id)
      return ok(item)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(
    IPC.AUTOMATION.PROJECT_CREATE,
    async (_e, input: { name: string; baseUrl: string; description?: string; browsers?: AutomationBrowser[] }) => {
      try {
        const proj = await createProject({
          name: input.name,
          baseUrl: input.baseUrl,
          description: input.description,
          browsers: input.browsers,
          createdBy: currentUserId(),
        })
        await bootstrapWorkspace(proj)
        return ok(proj)
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )

  ipcMain.handle(
    IPC.AUTOMATION.PROJECT_UPDATE,
    async (_e, args: { id: string; patch: Partial<Pick<TestProject, 'name' | 'baseUrl' | 'description' | 'browsers'>> }) => {
      try {
        const proj = await updateProject(args.id, args.patch)
        if (proj) await bootstrapWorkspace(proj)
        return ok(proj)
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )

  ipcMain.handle(IPC.AUTOMATION.PROJECT_DELETE, async (_e, id: string) => {
    try {
      if (isRunBusy(id)) cancelRun(id, 'project-deleted')
      await deleteProject(id)
      await removeWorkspace(id)
      clearProjectSecrets(id)
      return ok({ deleted: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  // -------------------- Suite CRUD --------------------
  ipcMain.handle(IPC.AUTOMATION.SUITE_LIST, async (_e, projectId: string) => {
    try {
      return ok(await listSuites(projectId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.SUITE_CREATE, async (_e, input: Parameters<typeof createSuite>[0]) => {
    try {
      return ok(await createSuite(input))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.SUITE_UPDATE, async (_e, args: { id: string; patch: Parameters<typeof updateSuite>[1] }) => {
    try {
      await updateSuite(args.id, args.patch)
      return ok({ updated: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.SUITE_DELETE, async (_e, id: string) => {
    try {
      await deleteSuite(id)
      return ok({ deleted: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  // -------------------- Case CRUD --------------------
  ipcMain.handle(IPC.AUTOMATION.CASE_LIST, async (_e, projectId: string) => {
    try {
      return ok(await listCases(projectId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.CASE_GET, async (_e, id: string) => {
    try {
      return ok(await getCase(id))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.CASE_CREATE, async (_e, c: TestCase) => {
    try {
      const saved = await upsertCases(c.projectId, [{ ...c, id: c.id || randomUuidV7() }])
      return ok(saved[0])
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.CASE_UPDATE, async (_e, c: TestCase) => {
    try {
      const saved = await upsertCases(c.projectId, [c])
      return ok(saved[0])
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.CASE_BULK_CREATE, async (_e, args: { projectId: string; cases: TestCase[] }) => {
    try {
      const saved = await upsertCases(args.projectId, args.cases)
      return ok(saved)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.CASE_DELETE, async (_e, id: string) => {
    try {
      await deleteCase(id)
      return ok({ deleted: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.CASE_READ_SPEC, async (_e, args: { projectId: string; code: string }) => {
    try {
      return ok(await readSpecOrEmpty(args.projectId, args.code))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(
    IPC.AUTOMATION.CASE_WRITE_SPEC,
    async (_e, args: { projectId: string; code: string; content: string; markSaved?: boolean }) => {
      try {
        const file = await writeSpec(args.projectId, args.code, args.content)
        if (args.markSaved) {
          const c = await getCaseByCode(args.projectId, args.code)
          if (c) await setCaseSpecStatus(c.id, 'saved')
        }
        return ok({ file })
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )

  // -------------------- Importers --------------------
  ipcMain.handle(IPC.AUTOMATION.IMPORT_PICK_FILE, async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Test cases', extensions: ['xlsx', 'xls', 'csv', 'md', 'markdown', 'feature', 'pdf'] },
          { name: 'All files', extensions: ['*'] },
        ],
      })
      if (result.canceled || result.filePaths.length === 0) return ok({ filePath: null })
      return ok({ filePath: result.filePaths[0] })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(
    IPC.AUTOMATION.IMPORT_PARSE,
    async (_e, args: { projectId: string; filePath: string; layout: ImportLayout }) => {
      try {
        const preview = await parseImportFile(args.projectId, args.filePath, { layout: args.layout })
        return ok(preview)
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )

  ipcMain.handle(IPC.AUTOMATION.IMPORT_EXCEL_LIST_SHEETS, async (_e, filePath: string) => {
    try {
      const { sheets, warnings } = await listExcelWorkbookSheets(filePath)
      return ok({ sheets, warnings })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(
    IPC.AUTOMATION.IMPORT_EXCEL_MARKDOWN,
    async (
      _e,
      args: {
        filePath: string
        sheetNames: string[]
        headerRow: number
        firstDataRow?: number
        lastRow?: number
        firstCol?: number
        lastCol?: number
      }
    ) => {
      try {
        const { markdown, warnings } = await excelSelectionsToMarkdown({
          filePath: args.filePath,
          sheetNames: args.sheetNames,
          headerRow: args.headerRow,
          firstDataRow: args.firstDataRow,
          lastRow: args.lastRow,
          firstCol: args.firstCol,
          lastCol: args.lastCol,
        })
        return ok({ markdown, warnings })
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )

  ipcMain.handle(IPC.AUTOMATION.AI_PICK_SCREENSHOTS, async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
          { name: 'All files', extensions: ['*'] },
        ],
      })
      if (result.canceled || result.filePaths.length === 0) return ok({ filePaths: [] as string[] })
      return ok({ filePaths: result.filePaths })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  // -------------------- AI --------------------
  ipcMain.handle(
    IPC.AUTOMATION.AI_GEN_CASES,
    async (
      _e,
      args: { projectId: string; inputText: string; imagePaths?: string[] }
    ) => {
      try {
        const project = await getProject(args.projectId)
        if (!project) return fail('Project not found.')
        const preview = await generateTestCases({
          projectId: project.id,
          projectContext: projectContextText(project),
          inputText: args.inputText ?? '',
          imagePaths: args.imagePaths,
        })
        return ok(preview)
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )

  ipcMain.handle(IPC.AUTOMATION.AI_GEN_SPEC, async (_e, args: { caseId: string }) => {
    try {
      const tc = await getCase(args.caseId)
      if (!tc) return fail('Case not found.')
      const project = await getProject(tc.projectId)
      if (!project) return fail('Project not found.')
      const result = await generateSpecCode({
        projectContext: projectContextText(project),
        testCase: tc,
      })
      return ok(result)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.AI_REPAIR, async (_e, args: { caseResultId: string }) => {
    try {
      const result = await getResult(args.caseResultId)
      if (!result) return fail('Test result not found.')
      let originalSpec = ''
      if (result.caseId) {
        const tc = await getCase(result.caseId)
        if (tc) originalSpec = await readSpecOrEmpty(tc.projectId, tc.code)
      }
      const proposal = await proposeSpecRepair({
        originalSpec,
        errorMessage: result.errorMessage ?? '',
        stdoutTail: '',
        screenshotPath: preferredScreenshotPathForRepair(result),
      })
      const saved = await insertRepairProposal({
        caseResultId: result.id,
        originalSpec,
        proposedSpec: proposal.proposedSpec,
        rationale: proposal.rationale,
      })
      return ok(saved)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.AI_REPAIR_APPLY, async (_e, args: { proposalId: string }) => {
    try {
      const proposals = await query_all_repair_by_id(args.proposalId)
      const proposal = proposals[0]
      if (!proposal) return fail('Proposal not found.')
      const result = await getResult(proposal.caseResultId)
      if (!result) return fail('Result not found.')
      if (!result.caseId) return fail('Result has no case binding.')
      const tc = await getCase(result.caseId)
      if (!tc) return fail('Case not found.')
      await writeSpec(tc.projectId, tc.code, proposal.proposedSpec)
      await setCaseSpecStatus(tc.id, 'saved')
      await updateRepairStatus(proposal.id, 'applied')
      return ok({ applied: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.AI_REPAIR_REJECT, async (_e, args: { proposalId: string }) => {
    try {
      await updateRepairStatus(args.proposalId, 'rejected')
      return ok({ rejected: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.AI_REPAIR_LIST, async (_e, caseResultId: string) => {
    try {
      return ok(await listRepairProposalsByResult(caseResultId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  // -------------------- Run --------------------
  ipcMain.handle(IPC.AUTOMATION.RUN_START, async (event, request: RunRequest) => {
    try {
      const project = await getProject(request.projectId)
      if (!project) return fail('Project not found.')
      if (isRunBusy(project.id)) return fail('A run is already active for this project.')

      const secretEnv = getProjectSecrets(project.id)
      const userId = currentUserId() ?? undefined
      const triggeredBy = request.triggeredBy ?? userId

      const { start, outcome } = await startRun({
        project,
        request: { ...request, triggeredBy },
        secretEnv,
      })

      const initialSummary: TestRunSummary = {
        id: start.runId,
        projectId: project.id,
        status: 'running',
        browsers: request.browsers,
        workers: request.workers,
        retries: request.retries,
        grep: request.grep,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        flaky: 0,
        durationMs: 0,
        startedAt: start.startedAt,
        triggeredBy,
      }
      await insertQueuedRun(initialSummary)

      void outcome
        .then(async result => {
          const finalSummary: TestRunSummary = {
            id: result.runId,
            projectId: project.id,
            status: result.status,
            browsers: request.browsers,
            workers: request.workers,
            retries: request.retries,
            grep: request.grep,
            total: result.parsed?.summary.total ?? 0,
            passed: result.parsed?.summary.passed ?? 0,
            failed: result.parsed?.summary.failed ?? 0,
            skipped: result.parsed?.summary.skipped ?? 0,
            flaky: result.parsed?.summary.flaky ?? 0,
            durationMs: result.parsed?.summary.durationMs ?? 0,
            startedAt: result.startedAt,
            finishedAt: result.finishedAt,
            triggeredBy,
            reportPath: result.reportDir,
            junitPath: result.junitFile,
            jsonPath: result.jsonFile,
            cancelReason: result.cancelled ? 'user-cancel' : undefined,
          }
          await finalizeRun(finalSummary)
          if (result.parsed) {
            const resolved = await Promise.all(
              result.parsed.results.map(async r => {
                let caseId: string | null = null
                if (r.caseCode) {
                  const found = await getCaseByCode(project.id, r.caseCode)
                  caseId = found?.id ?? null
                }
                return {
                  caseId,
                  caseCode: r.caseCode,
                  testTitle: r.title,
                  specFile: r.specFile,
                  browser: r.browser,
                  status: r.status,
                  durationMs: r.durationMs,
                  attempts: r.attempts,
                  errorMessage: r.errorMessage,
                  failureSteps: r.failureSteps?.length
                    ? r.failureSteps.map(s => ({
                        label: s.label,
                        message: s.message,
                        screenshotPaths: (s.screenshotPaths ?? [])
                          .map(p => resolveTraceArtifactAbsolutePath(project.id, result.runId, p) ?? p)
                          .filter(Boolean),
                        failureHighlightPaths: (s.failureHighlightPaths ?? [])
                          .map(p => resolveTraceArtifactAbsolutePath(project.id, result.runId, p) ?? p)
                          .filter(Boolean),
                      }))
                    : undefined,
                  tracePath: resolveTraceArtifactAbsolutePath(project.id, result.runId, r.tracePath),
                  screenshotPaths: r.screenshotPaths,
                  videoPath: r.videoPath,
                  stdoutPath: r.stdoutPath,
                }
              })
            )
            await insertCaseResults(result.runId, resolved)
          }
        })
        .catch(err => {
          const msg = err instanceof Error ? err.message : String(err)
          l.error('[automation] run outcome handler failed', err)
          broadcastAutomationRunEvent({
            kind: 'persist_failed',
            runId: start.runId,
            projectId: project.id,
            message: msg,
          })
        })

      return ok({ runId: start.runId })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.RUN_CANCEL, async (_e, runId: string) => {
    try {
      const cancelled = cancelRun(runId, 'user-cancel')
      return ok({ cancelled })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.RUN_LIST, async (_e, args: { projectId: string; limit?: number }) => {
    try {
      return ok(await listRuns(args.projectId, args.limit ?? 50))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.RUN_GET, async (_e, runId: string) => {
    try {
      return ok(await getRunSummary(runId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.RUN_RESULTS, async (_e, runId: string) => {
    try {
      return ok(await listResults(runId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.RUN_OPEN_REPORT, async (_e, runId: string) => {
    try {
      const run = await getRunSummary(runId)
      if (!run?.reportPath) return fail('Report path missing.')
      const indexHtml = path.join(run.reportPath, 'index.html')
      try {
        await fs.access(indexHtml)
        await shell.openPath(indexHtml)
      } catch {
        await shell.openPath(run.reportPath)
      }
      return ok({ opened: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.RUN_OPEN_LOG, async (_e, args: { projectId: string; runId: string }) => {
    try {
      const logFile = path.join(getWorkspacePath(args.projectId), 'test-results', args.runId, 'run.log')
      await shell.openPath(logFile)
      return ok({ opened: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.RUN_OPEN_TRACE, async (_e, args: { tracePath: string; projectId?: string; runId?: string }) => {
    try {
      const hints =
        args.projectId && args.runId ? { projectId: args.projectId, runId: args.runId } : undefined
      const abs = resolveStoredTracePathForOpen(args.tracePath, hints)
      if (hints) assertResolvedPathInsideProjectWorkspace(hints.projectId, abs)
      try {
        await fs.access(abs)
      } catch {
        return fail(`Trace file not found: ${abs}`)
      }
      /** Playwright docs: `show-trace path/to/trace.zip` — native path, not file:// (Windows URL form often breaks). */
      const traceArg = path.normalize(abs)
      const { spawn } = await import('node:child_process')
      const proc = spawn(process.execPath, [resolvePlaywrightCliPath(), 'show-trace', traceArg], {
        env: buildPlaywrightSpawnEnv(),
        detached: true,
        stdio: 'ignore',
        cwd: hints ? getWorkspacePath(hints.projectId) : undefined,
      })
      try {
        await new Promise<void>((resolve, reject) => {
          proc.once('spawn', () => resolve())
          proc.once('error', reject)
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        l.warn('[automation] show-trace spawn failed', msg)
        return fail(`Could not start trace viewer: ${msg}`)
      }
      proc.unref()
      l.info('[automation] show-trace spawned', traceArg)
      return ok({ opened: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(
    IPC.AUTOMATION.RUN_OPEN_SCREENSHOT,
    async (_e, args: { screenshotPath: string; projectId: string; runId: string }) => {
      try {
        const abs = safeResolveRunArtifact({
          artifactPath: args.screenshotPath,
          projectId: args.projectId,
          runId: args.runId,
        })
        await fs.access(abs)
        await shell.openPath(abs)
        return ok({ opened: true })
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )

  ipcMain.handle(IPC.AUTOMATION.RUN_OPEN_VIDEO, async (_e, args: { videoPath: string; projectId: string; runId: string }) => {
    try {
      const abs = safeResolveRunArtifact({ artifactPath: args.videoPath, projectId: args.projectId, runId: args.runId })
      await fs.access(abs)
      await shell.openPath(abs)
      return ok({ opened: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(
    IPC.AUTOMATION.RUN_READ_SCREENSHOT_PREVIEW,
    async (_e, args: { screenshotPath: string; projectId: string; runId: string }) => {
      try {
        const abs = safeResolveRunArtifact({
          artifactPath: args.screenshotPath,
          projectId: args.projectId,
          runId: args.runId,
        })
        const ext = path.extname(abs).toLowerCase()
        if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
          return fail('Unsupported image type for preview.')
        }
        const st = await fs.stat(abs)
        if (st.size > PREVIEW_IMAGE_MAX_BYTES) return fail('Screenshot too large for in-app preview.')
        const mime = mimeForImagePreview(abs)
        if (mime === 'application/octet-stream') return fail('Unsupported image type for preview.')
        const buf = await fs.readFile(abs)
        const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
        return ok({ dataUrl })
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )

  ipcMain.handle(IPC.AUTOMATION.RUN_OPEN_WORKSPACE, async (_e, projectId: string) => {
    try {
      await shell.openPath(getWorkspacePath(projectId))
      return ok({ opened: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.RUN_CLEAR_HISTORY, async (_e, projectId: string) => {
    try {
      if (isRunBusy(projectId)) {
        return fail('CLEAR_HISTORY_BUSY')
      }
      await deleteAllRunsForProject(projectId)
      await clearRunHistoryArtifactsFromWorkspace(projectId)
      return ok({ cleared: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  // -------------------- Browsers --------------------
  ipcMain.handle(IPC.AUTOMATION.BROWSERS_INSTALL, async (event, args: { browsers?: AutomationBrowser[] }) => {
    try {
      const list = args.browsers && args.browsers.length > 0 ? args.browsers : (['chromium'] as AutomationBrowser[])
      const result = await installBrowsers(list, event.sender)
      return result.status === 'ok' ? ok({ installed: list }) : fail(result.message ?? 'install failed')
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.BROWSERS_STATUS, async () => {
    try {
      const installed = await detectInstalledBrowsers()
      return ok({ installed })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  // -------------------- Dashboard summary --------------------
  ipcMain.handle(IPC.AUTOMATION.DASHBOARD_SUMMARY, async (_e, projectId: string) => {
    try {
      const runs = await listRuns(projectId, 20)
      const last = runs[0]
      const lastResults = last ? await listResults(last.id) : []
      // Flaky aggregation across last 5 runs.
      const recent = runs.slice(0, 5)
      const codeCounter = new Map<string, { passes: number; fails: number }>()
      for (const r of recent) {
        const results = await listResults(r.id)
        for (const res of results) {
          const key = res.caseId || `${r.id}:${res.id}`
          const e = codeCounter.get(key) ?? { passes: 0, fails: 0 }
          if (res.status === 'passed') e.passes += 1
          else if (res.status === 'failed' || res.status === 'flaky') e.fails += 1
          codeCounter.set(key, e)
        }
      }
      const flaky = Array.from(codeCounter.entries())
        .filter(([, v]) => v.passes > 0 && v.fails > 0)
        .map(([k, v]) => ({ caseId: k, passes: v.passes, fails: v.fails }))
        .sort((a, b) => b.fails - a.fails)
        .slice(0, 10)
      return ok({ runs, last, lastResults, flaky })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  // -------------------- Settings --------------------
  ipcMain.handle(IPC.AUTOMATION.SETTINGS_GET, async () => {
    try {
      return ok(getAutomationSettings())
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.SETTINGS_SET, async (_e, patch: Partial<AutomationSettingsState>) => {
    try {
      return ok(setAutomationSettings(patch))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  // -------------------- Project secrets --------------------
  ipcMain.handle('automation:secrets:get', async (_e, projectId: string) => {
    try {
      const all = getProjectSecrets(projectId)
      const masked = Object.fromEntries(Object.keys(all).map(k => [k, '••••••••']))
      return ok({ keys: Object.keys(all), masked })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle('automation:secrets:set', async (_e, args: { projectId: string; secrets: Record<string, string> }) => {
    try {
      setProjectSecrets(args.projectId, args.secrets)
      return ok({ saved: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  // -------------------- Auth reset --------------------
  ipcMain.handle(IPC.AUTOMATION.AUTH_RESET, async () => {
    try {
      cancelAllRuns('auth-reset')
      return ok({ ok: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  l.info('✅ Automation Test IPC Handlers Registered')
}

// ----- helpers -----
async function query_all_repair_by_id(id: string) {
  // listRepairProposalsByResult takes a result id; nhưng đôi khi caller chỉ có
  // proposalId → query trực tiếp 1 dòng.
  const rows = await query<{
    id: string
    case_result_id: string
    original_spec: string
    proposed_spec: string
    rationale: string | null
    status: string
    created_at: string
  }>(
    'SELECT id, case_result_id, original_spec, proposed_spec, rationale, status, created_at FROM ai_repair_proposals WHERE id = ?',
    [id]
  )
  return rows.map(r => ({
    id: r.id,
    caseResultId: r.case_result_id,
    originalSpec: r.original_spec,
    proposedSpec: r.proposed_spec,
    rationale: r.rationale ?? '',
    status: r.status as 'pending' | 'applied' | 'rejected',
    createdAt: r.created_at,
  }))
}

/** Retention helper (gọi từ scheduler) — không phải IPC nhưng đặt cạnh để re-export. */
export async function retentionPruneRuns(projectId: string, keep: number): Promise<void> {
  const idsToDelete = await listOldRunIds(projectId, keep)
  for (const id of idsToDelete) {
    try {
      const summary = await getRunSummary(id)
      if (summary?.reportPath) await fs.rm(summary.reportPath, { recursive: true, force: true })
      if (summary?.jsonPath) await fs.rm(summary.jsonPath, { force: true })
      if (summary?.junitPath) await fs.rm(summary.junitPath, { force: true })
      // test-results folder mỗi run nằm cạnh các file trên.
      const runFolder = path.join(getWorkspacePath(projectId), 'test-results', id)
      await fs.rm(runFolder, { recursive: true, force: true })
    } catch (err) {
      l.warn(`[automation] retention prune failed for run ${id}:`, err)
    }
    await deleteRunCascade(id)
  }
}

export async function retentionPruneAll(keep: number): Promise<void> {
  const projects = await listAllProjectIds()
  for (const id of projects) {
    await retentionPruneRuns(id, keep)
  }
}
