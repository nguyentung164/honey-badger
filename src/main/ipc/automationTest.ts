import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app, clipboard, dialog, ipcMain, shell } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { isPlaywrightDefaultFailureScreenshotPath } from 'shared/automation/playwrightFailureScreenshots'
import type {
  AutomationBrowser,
  AutomationSettingsState,
  ImportLayout,
  RunRequest,
  TestCase,
  TestCaseResult,
  TestCatalogGroup,
  TestCatalogPage,
  TestFlow,
  TestProject,
  TestRunSummary,
} from 'shared/automation/types'
import { randomUuidV7 } from 'shared/randomUuidV7'
import { generateSpecCode } from '../automation/aiSpecCodegen'
import { proposeSpecRepair } from '../automation/aiSpecRepair'
import { generateTestCases } from '../automation/aiTestCase'
import {
  caseCountByCatalogPageForProject,
  createCatalogGroup,
  createPageMapAnnotation,
  duplicatePageMapAnnotation,
  createCatalogPage,
  createFlow,
  createNavEdge,
  createProject,
  createSuite,
  deleteAllRunsForProject,
  deleteCase,
  deleteCatalogGroup,
  deleteCatalogPage,
  deleteFlow,
  deleteNavEdge,
  deletePageMapAnnotation,
  deleteProject,
  deleteRunCascade,
  deleteSuite,
  duplicateCatalogPageDeep,
  ensureDefaultCatalogForProject,
  finalizeRun,
  getCase,
  getCaseByCode,
  getProject,
  getResult,
  getPageMapStatusFromLatestRun,
  getRunSummary,
  insertCaseResults,
  insertQueuedRun,
  insertRepairProposal,
  listAllProjectIds,
  listCases,
  listCatalogGraph,
  listCatalogGroups,
  listCatalogPages,
  listFlowsForPage,
  listNavEdges,
  listOldRunIds,
  listProjects,
  listRepairProposalsByResult,
  listResults,
  listRuns,
  listSuites,
  resolveRunScope,
  setCaseSpecStatus,
  updateCatalogGroup,
  updateCatalogPage,
  updatePageMapAnnotation,
  updateFlow,
  updateNavEdge,
  updateProject,
  updateRepairStatus,
  updateSuite,
  upsertCases,
} from '../automation/db'
import { exportProjectCasesByPageToDirectory } from '../automation/export/catalogExcelExport'
import { parseImportFile } from '../automation/importers'
import { excelSelectionsToJson, excelSelectionsToPlainText, listExcelWorkbookSheets } from '../automation/importers/excelSheetExport'
import { broadcastAutomationRunEvent, cancelAllRuns, cancelRun, getRun, installBrowsers, isRunBusy, startRun } from '../automation/runner'
import { clearProjectSecrets, getAutomationSettings, getProjectSecrets, setAutomationSettings, setProjectSecrets } from '../automation/settingsStore'
import {
  assertResolvedPathInsideProjectWorkspace,
  bootstrapWorkspace,
  buildPlaywrightSpawnEnv,
  clearRunHistoryArtifactsFromWorkspace,
  detectInstalledBrowsers,
  getRunReportsDir,
  getSpecFile,
  getWorkspacePath,
  patchSpecPlaywrightImport,
  removeCaseSpecArtifacts,
  removePlaywrightBrowserFromCache,
  removeWorkspace,
  resolvePlaywrightCliPath,
  resolveStoredArtifactPathForOpen,
  resolveStoredTracePathForOpen,
  resolveTraceArtifactAbsolutePath,
} from '../automation/workspace'
import { getTokenFromStore, verifyToken } from '../task/auth'
import { query } from '../task/schema/db'

const PREVIEW_IMAGE_MAX_BYTES = 15 * 1024 * 1024

/** Same limit as `MAX_AI_IMAGE_BYTES` in aiTestCase.ts (AI prompt attachments). */
const AI_IMPORT_IMAGE_MAX_BYTES = 4 * 1024 * 1024

function importImageDir(): string {
  return path.join(app.getPath('temp'), 'honey-badger-case-import')
}

function extFromImageMagic(buf: Buffer): '.png' | '.jpg' | '.webp' | '.gif' | null {
  if (buf.length < 12) return null
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg'
  const gif6 = buf.slice(0, 6).toString('ascii')
  if (gif6 === 'GIF87a' || gif6 === 'GIF89a') return '.gif'
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return '.webp'
  return null
}

async function writeImportImageToTemp(buf: Buffer, ext: '.png' | '.jpg' | '.webp' | '.gif'): Promise<string> {
  const dir = importImageDir()
  await fs.mkdir(dir, { recursive: true })
  const dest = path.join(dir, `import-${randomUuidV7()}${ext}`)
  await fs.writeFile(dest, buf)
  return dest
}

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

function validateCodegenTarget(raw: string): { ok: true; target: string } | { ok: false; message: string } {
  const s = raw.trim()
  if (!s) return { ok: false, message: 'Enter a URL.' }
  if (s.length > 4096) return { ok: false, message: 'URL is too long.' }
  if (/[\n\r\0]/.test(s)) return { ok: false, message: 'Invalid URL.' }
  if (s.startsWith('/')) {
    return {
      ok: false,
      message: 'Use a full https:// URL — Playwright Codegen launched from the app does not load playwright.config (no baseURL for /paths).',
    }
  }
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return { ok: false, message: 'Invalid URL. Use a full address starting with https://' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, message: 'Only http(s) URLs are allowed.' }
  }
  return { ok: true, target: s }
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

  ipcMain.handle(IPC.AUTOMATION.PROJECT_CREATE, async (_e, input: { name: string; baseUrl: string; description?: string; browsers?: AutomationBrowser[] }) => {
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
  })

  ipcMain.handle(IPC.AUTOMATION.PROJECT_UPDATE, async (_e, args: { id: string; patch: Partial<Pick<TestProject, 'name' | 'baseUrl' | 'description' | 'browsers'>> }) => {
    try {
      const proj = await updateProject(args.id, args.patch)
      if (proj) await bootstrapWorkspace(proj)
      return ok(proj)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

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

  // -------------------- Catalog pages & flows & nav edges --------------------
  ipcMain.handle(IPC.AUTOMATION.CATALOG_PAGE_LIST, async (_e, projectId: string) => {
    try {
      await ensureDefaultCatalogForProject(projectId)
      return ok(await listCatalogPages(projectId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.CATALOG_PAGE_CASE_COUNTS, async (_e, projectId: string) => {
    try {
      await ensureDefaultCatalogForProject(projectId)
      return ok(await caseCountByCatalogPageForProject(projectId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(
    IPC.AUTOMATION.CATALOG_PAGE_CREATE,
    async (_e, input: { projectId: string; name: string; slug?: string; description?: string; sortOrder?: number; groupId?: string | null }) => {
    try {
      return ok(await createCatalogPage(input))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(
    IPC.AUTOMATION.CATALOG_PAGE_UPDATE,
    async (
      _e,
      args: {
        id: string
        patch: Partial<Pick<TestCatalogPage, 'name' | 'slug' | 'description' | 'sortOrder' | 'groupId' | 'diagramX' | 'diagramY' | 'diagramStyle'>>
      }
    ) => {
      try {
        return ok(await updateCatalogPage(args.id, args.patch))
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )

  ipcMain.handle(IPC.AUTOMATION.CATALOG_GROUP_LIST, async (_e, projectId: string) => {
    try {
      await ensureDefaultCatalogForProject(projectId)
      return ok(await listCatalogGroups(projectId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.CATALOG_GROUP_LIST_GRAPH, async (_e, projectId: string) => {
    try {
      await ensureDefaultCatalogForProject(projectId)
      return ok(await listCatalogGraph(projectId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(
    IPC.AUTOMATION.CATALOG_GROUP_CREATE,
    async (_e, input: { projectId: string; name: string; parentGroupId?: string | null; description?: string; sortOrder?: number }) => {
      try {
        return ok(await createCatalogGroup(input))
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )

  ipcMain.handle(
    IPC.AUTOMATION.CATALOG_GROUP_UPDATE,
    async (_e, args: { id: string; patch: Parameters<typeof updateCatalogGroup>[1] }) => {
      try {
        return ok(await updateCatalogGroup(args.id, args.patch))
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )

  ipcMain.handle(IPC.AUTOMATION.CATALOG_GROUP_DELETE, async (_e, id: string) => {
    try {
      await deleteCatalogGroup(id)
      return ok({ deleted: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.CATALOG_GROUP_MOVE, async (_e, args: { id: string; parentGroupId: string | null }) => {
    try {
      return ok(await updateCatalogGroup(args.id, { parentGroupId: args.parentGroupId }))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(
    IPC.AUTOMATION.MAP_ANNOTATION_CREATE,
    async (_e, input: { projectId: string; content: string; labelNumber?: number; diagramX?: number; diagramY?: number; diagramWidth?: number; diagramHeight?: number; style?: Parameters<typeof createPageMapAnnotation>[0]['style']; sortOrder?: number }) => {
      try {
        return ok(await createPageMapAnnotation(input))
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )

  ipcMain.handle(
    IPC.AUTOMATION.MAP_ANNOTATION_UPDATE,
    async (_e, args: { id: string; patch: Parameters<typeof updatePageMapAnnotation>[1] }) => {
      try {
        return ok(await updatePageMapAnnotation(args.id, args.patch))
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )

  ipcMain.handle(IPC.AUTOMATION.MAP_ANNOTATION_DELETE, async (_e, id: string) => {
    try {
      await deletePageMapAnnotation(id)
      return ok({ deleted: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.MAP_ANNOTATION_DUPLICATE, async (_e, id: string) => {
    try {
      return ok(await duplicatePageMapAnnotation(id))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.CATALOG_PAGE_DELETE, async (_e, id: string) => {
    try {
      await deleteCatalogPage(id)
      return ok({ deleted: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.CATALOG_PAGE_DUPLICATE_DEEP, async (_e, input: { sourcePageId: string; name?: string; slug?: string | null; description?: string | null }) => {
    try {
      const { newPageId, projectId, codeMap } = await duplicateCatalogPageDeep(input)
      for (const [oldCode, newCode] of Object.entries(codeMap)) {
        const content = await readSpecOrEmpty(projectId, oldCode)
        if (content.trim().length > 0) {
          await writeSpec(projectId, newCode, content)
        }
      }
      return ok({ newPageId })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.FLOW_LIST, async (_e, pageId: string) => {
    try {
      return ok(await listFlowsForPage(pageId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.FLOW_CREATE, async (_e, input: { pageId: string; name: string; sortOrder?: number }) => {
    try {
      return ok(await createFlow(input))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.FLOW_UPDATE, async (_e, args: { id: string; patch: Partial<Pick<TestFlow, 'name' | 'sortOrder'>> }) => {
    try {
      return ok(await updateFlow(args.id, args.patch))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.FLOW_DELETE, async (_e, id: string) => {
    try {
      await deleteFlow(id)
      return ok({ deleted: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.NAV_EDGE_LIST, async (_e, projectId: string) => {
    try {
      return ok(await listNavEdges(projectId))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.NAV_EDGE_CREATE, async (_e, input: { projectId: string; sourcePageId: string; targetPageId: string; label?: string }) => {
    try {
      return ok(await createNavEdge(input))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.NAV_EDGE_UPDATE, async (_e, args: { id: string; patch: { label?: string | null; styleJson?: string | null } }) => {
    try {
      return ok(await updateNavEdge(args.id, args.patch))
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.NAV_EDGE_DELETE, async (_e, id: string) => {
    try {
      await deleteNavEdge(id)
      return ok({ deleted: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.EXPORT_CASES_BY_PAGE, async (_e, projectId: string) => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Export test cases — choose folder',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return ok({ cancelled: true as const, files: [] as string[] })
      }
      const dir = result.filePaths[0]
      const { files } = await exportProjectCasesByPageToDirectory(projectId, dir)
      return ok({ cancelled: false as const, files })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  // -------------------- Case CRUD --------------------
  ipcMain.handle(IPC.AUTOMATION.CASE_LIST, async (_e, projectId: string) => {
    try {
      await ensureDefaultCatalogForProject(projectId)
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
      const existing = await getCase(id)
      await deleteCase(id)
      if (existing) {
        await removeCaseSpecArtifacts(existing.projectId, existing.code)
      }
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

  ipcMain.handle(IPC.AUTOMATION.CASE_WRITE_SPEC, async (_e, args: { projectId: string; code: string; content: string; markSaved?: boolean }) => {
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
  })

  ipcMain.handle(IPC.AUTOMATION.CASE_LAUNCH_CODEGEN, async (_e, args: { projectId: string; url: string }) => {
    try {
      const parsed = validateCodegenTarget(args.url ?? '')
      if (!parsed.ok) return fail(parsed.message)
      const proj = await getProject(args.projectId)
      if (!proj) return fail('Project not found.')
      const workspacePath = await bootstrapWorkspace(proj)
      /**
       * `playwright codegen` (1.60) does not support `--config`; options differ from `playwright test`.
       * Run with cwd = workspace so relative paths / local files resolve; user should pass a full URL
       * (or path relative to site) as needed.
       *
       * Windows: stay non-detached, drain stdio, `windowsHide: false` so the Inspector/browser can show.
       */
      const proc = spawn(process.execPath, [resolvePlaywrightCliPath(), 'codegen', parsed.target], {
        env: buildPlaywrightSpawnEnv(),
        cwd: workspacePath,
        detached: false,
        windowsHide: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stderrTail = ''
      proc.stdout?.resume()
      proc.stderr?.setEncoding('utf8')
      proc.stderr?.on('data', (chunk: string) => {
        stderrTail = (stderrTail + chunk).slice(-6000)
      })
      proc.on('exit', (code, signal) => {
        if (code === 0 || code === null) l.info('[automation] codegen process ended', { code, signal })
        else l.warn('[automation] codegen process exited with error', { code, signal, stderrTail })
      })
      try {
        await new Promise<void>((resolve, reject) => {
          proc.once('spawn', () => resolve())
          proc.once('error', reject)
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        l.warn('[automation] codegen spawn failed', msg)
        return fail(`Could not start Playwright Codegen: ${msg}`)
      }
      l.info('[automation] codegen spawned', workspacePath, parsed.target)
      return ok({ opened: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

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

  ipcMain.handle(IPC.AUTOMATION.IMPORT_PARSE, async (_e, args: { projectId: string; filePath: string; layout: ImportLayout }) => {
    try {
      const preview = await parseImportFile(args.projectId, args.filePath, { layout: args.layout })
      return ok(preview)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.IMPORT_EXCEL_LIST_SHEETS, async (_e, filePath: string) => {
    try {
      const { sheets, warnings } = await listExcelWorkbookSheets(filePath)
      return ok({ sheets, warnings })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(
    IPC.AUTOMATION.IMPORT_EXCEL_JSON,
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
        const { json, warnings } = await excelSelectionsToJson({
          filePath: args.filePath,
          sheetNames: args.sheetNames,
          headerRow: args.headerRow,
          firstDataRow: args.firstDataRow,
          lastRow: args.lastRow,
          firstCol: args.firstCol,
          lastCol: args.lastCol,
        })
        return ok({ json, warnings })
      } catch (err) {
        return fail((err as Error).message)
      }
    }
  )

  ipcMain.handle(
    IPC.AUTOMATION.IMPORT_EXCEL_PLAIN_TEXT,
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
        const { text, warnings } = await excelSelectionsToPlainText({
          filePath: args.filePath,
          sheetNames: args.sheetNames,
          headerRow: args.headerRow,
          firstDataRow: args.firstDataRow,
          lastRow: args.lastRow,
          firstCol: args.firstCol,
          lastCol: args.lastCol,
        })
        return ok({ text, warnings })
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

  ipcMain.handle(IPC.AUTOMATION.AI_SAVE_IMPORT_IMAGE, async (_e, args?: { bytes?: ArrayBuffer }) => {
    try {
      if (args?.bytes && args.bytes.byteLength > 0) {
        const buf = Buffer.from(args.bytes)
        if (buf.byteLength > AI_IMPORT_IMAGE_MAX_BYTES) return fail('IMAGE_TOO_LARGE')
        const ext = extFromImageMagic(buf)
        if (!ext) return fail('UNSUPPORTED_IMAGE')
        const filePath = await writeImportImageToTemp(buf, ext)
        return ok({ filePath })
      }
      const img = clipboard.readImage()
      if (img.isEmpty()) return fail('CLIPBOARD_EMPTY')
      const png = Buffer.from(img.toPNG())
      if (png.byteLength === 0) return fail('CLIPBOARD_EMPTY')
      if (png.byteLength > AI_IMPORT_IMAGE_MAX_BYTES) return fail('IMAGE_TOO_LARGE')
      const filePath = await writeImportImageToTemp(png, '.png')
      return ok({ filePath })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.AI_READ_IMPORT_IMAGE_PREVIEW, async (_e, filePath: string) => {
    try {
      const abs = path.resolve(filePath)
      const st = await fs.stat(abs)
      if (!st.isFile()) return fail('Not a file.')
      if (st.size > PREVIEW_IMAGE_MAX_BYTES) return fail('IMAGE_TOO_LARGE')
      const ext = path.extname(abs).toLowerCase()
      if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
        return fail('Unsupported image type for preview.')
      }
      const mime = mimeForImagePreview(abs)
      if (mime === 'application/octet-stream') return fail('Unsupported image type for preview.')
      const buf = await fs.readFile(abs)
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
      return ok({ dataUrl })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  // -------------------- AI --------------------
  ipcMain.handle(IPC.AUTOMATION.AI_GEN_CASES, async (_e, args: { projectId: string; inputText: string; imagePaths?: string[] }) => {
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
  })

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
  ipcMain.handle(IPC.AUTOMATION.RUN_RESOLVE_SCOPE, async (_e, args: { projectId: string; pageIds?: string[]; groupIds?: string[] }) => {
    try {
      const project = await getProject(args.projectId)
      if (!project) return fail('Project not found.')
      const resolution = await resolveRunScope(args.projectId, { pageIds: args.pageIds ?? [], groupIds: args.groupIds ?? [] })
      return ok(resolution)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.RUN_START, async (_event, request: RunRequest) => {
    try {
      const project = await getProject(request.projectId)
      if (!project) return fail('Project not found.')
      if (isRunBusy(project.id)) return fail('A run is already active for this project.')

      const secretEnv = getProjectSecrets(project.id)
      const userId = currentUserId() ?? undefined
      const triggeredBy = request.triggeredBy ?? userId

      const pageIds = (request.pageIds ?? []).filter(Boolean)
      const groupIds = (request.groupIds ?? []).filter(Boolean)
      const manualCaseIds = (request.caseIds ?? []).filter(Boolean)
      let mergedCaseIds = [...new Set(manualCaseIds)]
      if (pageIds.length > 0 || groupIds.length > 0) {
        const scope = await resolveRunScope(request.projectId, { pageIds, groupIds })
        mergedCaseIds = [...new Set([...mergedCaseIds, ...scope.caseIds])]
        if (mergedCaseIds.length === 0) {
          if (groupIds.length > 0 && pageIds.length === 0 && manualCaseIds.length === 0) {
            return fail('NO_CASES_FOR_SELECTED_GROUPS')
          }
          return fail('NO_CASES_FOR_SELECTED_PAGES')
        }
      }

      const effectiveRequest: RunRequest = {
        ...request,
        triggeredBy,
        caseIds: mergedCaseIds.length > 0 ? mergedCaseIds : undefined,
        pageIds: undefined,
        groupIds: undefined,
      }

      const { start, outcome } = await startRun({
        project,
        request: effectiveRequest,
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
                        summary: s.summary,
                        location: s.location,
                        assertionHints: s.assertionHints,
                        screenshotPaths: (s.screenshotPaths ?? []).map(p => resolveTraceArtifactAbsolutePath(project.id, result.runId, p) ?? p).filter(Boolean),
                        failureHighlightPaths: (s.failureHighlightPaths ?? []).map(p => resolveTraceArtifactAbsolutePath(project.id, result.runId, p) ?? p).filter(Boolean),
                        errorContext: s.errorContext,
                      }))
                    : undefined,
                  tracePath: resolveTraceArtifactAbsolutePath(project.id, result.runId, r.tracePath),
                  screenshotPaths: r.screenshotPaths,
                  videoPath: r.videoPath,
                  stdoutPath: r.stdoutPath,
                  reportSteps: r.reportSteps?.length ? r.reportSteps : undefined,
                }
              })
            )
            await insertCaseResults(result.runId, resolved)
          }
          broadcastAutomationRunEvent({
            kind: 'persisted',
            runId: result.runId,
            projectId: project.id,
          })
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

  ipcMain.handle(IPC.AUTOMATION.RUN_PAGE_MAP_STATUS, async (_e, projectId: string) => {
    try {
      return ok(await getPageMapStatusFromLatestRun(projectId))
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
      const hints = args.projectId && args.runId ? { projectId: args.projectId, runId: args.runId } : undefined
      const abs = resolveStoredTracePathForOpen(args.tracePath, hints)
      if (hints) assertResolvedPathInsideProjectWorkspace(hints.projectId, abs)
      try {
        await fs.access(abs)
      } catch {
        return fail(`Trace file not found: ${abs}`)
      }
      /** Playwright docs: `show-trace path/to/trace.zip` — native path, not file:// (Windows URL form often breaks). */
      const traceArg = path.normalize(abs)
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

  ipcMain.handle(IPC.AUTOMATION.RUN_OPEN_SCREENSHOT, async (_e, args: { screenshotPath: string; projectId: string; runId: string }) => {
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
  })

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

  ipcMain.handle(IPC.AUTOMATION.RUN_READ_SCREENSHOT_PREVIEW, async (_e, args: { screenshotPath: string; projectId: string; runId: string }) => {
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
  })

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

  ipcMain.handle(IPC.AUTOMATION.RUN_DELETE, async (_e, args: { projectId: string; runId: string }) => {
    try {
      const { projectId, runId } = args
      if (getRun(runId)) {
        return fail('DELETE_RUN_BUSY')
      }
      const summary = await getRunSummary(runId)
      if (!summary || summary.projectId !== projectId) {
        return fail('RUN_NOT_FOUND')
      }
      if (summary.reportPath) await fs.rm(summary.reportPath, { recursive: true, force: true })
      await fs.rm(getRunReportsDir(projectId, runId), { recursive: true, force: true })
      const runFolder = path.join(getWorkspacePath(projectId), 'test-results', runId)
      await fs.rm(runFolder, { recursive: true, force: true })
      await deleteRunCascade(runId)
      return ok({ deleted: true })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  // -------------------- Browsers --------------------
  ipcMain.handle(IPC.AUTOMATION.BROWSERS_INSTALL, async (event, args: { browsers?: AutomationBrowser[] }) => {
    try {
      const list = args.browsers && args.browsers.length > 0 ? args.browsers : (['chromium'] as AutomationBrowser[])
      const result = await installBrowsers(list, event.sender)
      if (result.status !== 'ok') {
        return fail(result.message ?? 'install failed')
      }
      const installed = await detectInstalledBrowsers()
      return ok({ installed })
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle(IPC.AUTOMATION.BROWSERS_UNINSTALL, async (_e, args: { browser: AutomationBrowser }) => {
    try {
      await removePlaywrightBrowserFromCache(args.browser)
      const installed = await detectInstalledBrowsers()
      return ok({ installed })
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
  }>('SELECT id, case_result_id, original_spec, proposed_spec, rationale, status, created_at FROM ai_repair_proposals WHERE id = ?', [id])
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
      if (summary?.jsonPath) {
        await fs.rm(summary.jsonPath, { force: true })
        await fs.rm(path.join(path.dirname(summary.jsonPath), 'hb-full-steps.json'), { force: true })
      }
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
