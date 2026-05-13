import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app } from 'electron'
import l from 'electron-log'
import type { AutomationBrowser, TestProject } from 'shared/automation/types'

/**
 * Đường dẫn gốc cho mọi workspace test project. Mỗi project chiếm 1 thư mục con
 * dạng userData/automation/<projectId>/.
 */
export function getAutomationRoot(): string {
  return path.join(app.getPath('userData'), 'automation')
}

/** Cache browsers Playwright dùng chung cho mọi project. */
export function getBrowsersCachePath(): string {
  return path.join(app.getPath('userData'), 'playwright-browsers')
}

export function getWorkspacePath(projectId: string): string {
  return path.join(getAutomationRoot(), projectId)
}

export function getWorkspaceSubPath(projectId: string, ...segments: string[]): string {
  const root = getWorkspacePath(projectId)
  const resolved = path.resolve(root, ...segments)
  if (!resolved.startsWith(root)) {
    throw new Error(`Path traversal detected outside workspace: ${resolved}`)
  }
  return resolved
}

export function getTestsDir(projectId: string): string {
  return getWorkspaceSubPath(projectId, 'tests')
}

export function getResultsDir(projectId: string, runId?: string): string {
  return runId ? getWorkspaceSubPath(projectId, 'test-results', runId) : getWorkspaceSubPath(projectId, 'test-results')
}

/** Thư mục artifact trace/screenshot/video (CLI `--output`); tách khỏi `report.json`/`junit.xml` trong cùng `test-results/<runId>`. */
export function getRunArtifactsDir(projectId: string, runId: string): string {
  return getWorkspaceSubPath(projectId, 'test-results', runId, 'artifacts')
}

export function getReportDir(projectId: string, runId?: string): string {
  return runId
    ? getWorkspaceSubPath(projectId, 'playwright-report', runId)
    : getWorkspaceSubPath(projectId, 'playwright-report')
}

export function getRunLogFile(projectId: string, runId: string): string {
  return getWorkspaceSubPath(projectId, 'test-results', runId, 'run.log')
}

export function getRunJsonFile(projectId: string, runId: string): string {
  return getWorkspaceSubPath(projectId, 'test-results', runId, 'report.json')
}

export function getRunJunitFile(projectId: string, runId: string): string {
  return getWorkspaceSubPath(projectId, 'test-results', runId, 'junit.xml')
}

export function getStorageStateFile(projectId: string): string {
  return getWorkspaceSubPath(projectId, 'auth', 'storageState.json')
}

export function getSpecFile(projectId: string, code: string): string {
  const safe = code.replace(/[^A-Za-z0-9._-]/g, '_')
  return getWorkspaceSubPath(projectId, 'tests', `${safe}.spec.ts`)
}

const SUPPORTED_BROWSERS: ReadonlySet<AutomationBrowser> = new Set(['chromium', 'firefox', 'webkit'])

function browsersOrDefault(input?: AutomationBrowser[]): AutomationBrowser[] {
  if (!input || input.length === 0) return ['chromium']
  const filtered = Array.from(new Set(input.filter(b => SUPPORTED_BROWSERS.has(b))))
  return filtered.length > 0 ? filtered : ['chromium']
}

/** Gốc app có `node_modules` (asar unpacked khi đóng gói). */
export function getAppNodeModulesRoot(): string {
  const appRoot = app.getAppPath()
  return appRoot.replace(/app\.asar([\\/]|$)/, 'app.asar.unpacked$1')
}

/**
 * Workspace ở AppData là ESM và không có `node_modules`; NODE_PATH không áp dụng cho bare import ESM.
 * Trả về `file://.../index.mjs` để `playwright.config.ts` import thẳng gói trong app.
 */
export function resolvePlaywrightTestImportSpecifier(): string {
  const root = getAppNodeModulesRoot()
  const entry = path.join(root, 'node_modules', '@playwright', 'test', 'index.mjs')
  return pathToFileURL(entry).href
}

/** Thay bare `import … from '@playwright/test'` (ESM trong AppData không resolve được). */
export function patchSpecPlaywrightImport(content: string): string {
  const q = JSON.stringify(resolvePlaywrightTestImportSpecifier())
  return content.replace(/from\s+['"]@playwright\/test['"]/g, `from ${q}`)
}

export type PlaywrightReporterOutputs = {
  jsonFile: string
  junitFile: string
}

/** Render `playwright.config.ts` từ project settings; dùng path tuyệt đối cho testDir + outputDir. */
export function renderPlaywrightConfig(
  project: TestProject,
  opts?: { workers?: number; retries?: number; headed?: boolean; reporterOutputs?: PlaywrightReporterOutputs }
): string {
  const testsDir = getTestsDir(project.id).replace(/\\/g, '/')
  const outputDir = getResultsDir(project.id).replace(/\\/g, '/')
  const browsers = browsersOrDefault(project.browsers)
  const workers = Math.max(1, Math.min(opts?.workers ?? 1, 16))
  const retries = Math.max(0, Math.min(opts?.retries ?? 0, 5))
  const baseUrl = (project.baseUrl ?? '').trim()

  const projectsBlock = browsers
    .map(b => `    { name: '${b}', use: { ...devices['Desktop ${b[0].toUpperCase() + b.slice(1)}'] } }`)
    .join(',\n')

  const ro = opts?.reporterOutputs
  const reporterLiteral = ro
    ? `[
    ['list'],
    ['json', { outputFile: ${JSON.stringify(ro.jsonFile)} }],
    ['junit', { outputFile: ${JSON.stringify(ro.junitFile)} }],
  ]`
    : `[['list']]`

  const atImport = JSON.stringify(resolvePlaywrightTestImportSpecifier())

  return `// Auto-generated by Honey Badger Automation. Do not edit by hand.
import { defineConfig, devices } from ${atImport}

export default defineConfig({
  testDir: ${JSON.stringify(testsDir)},
  outputDir: ${JSON.stringify(outputDir)},
  fullyParallel: false,
  forbidOnly: false,
  retries: ${retries},
  workers: ${workers},
  reporter: ${reporterLiteral},
  use: {
    baseURL: ${JSON.stringify(baseUrl)},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: ${opts?.headed ? 'false' : 'true'},
  },
  projects: [
${projectsBlock}
  ],
})
`
}

/** Render package.json mini để Node nhận diện workspace là ESM. */
function renderWorkspacePackageJson(projectId: string): string {
  return JSON.stringify(
    {
      name: `hb-test-${projectId}`,
      type: 'module',
      private: true,
    },
    null,
    2
  )
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true })
}

async function writeFileIfMissing(file: string, content: string): Promise<void> {
  try {
    await fs.access(file)
  } catch {
    await fs.writeFile(file, content, 'utf8')
  }
}

/**
 * Bootstrap (idempotent) toàn bộ thư mục workspace cho 1 project.
 * Luôn ghi đè `playwright.config.ts` để bám đúng settings mới.
 * Khi chạy từ app, truyền `reporterOutputs` để nhúng đường dẫn báo cáo (Playwright load config không luôn thấy env HB_*).
 */
export async function bootstrapWorkspace(project: TestProject, reporterOutputs?: PlaywrightReporterOutputs): Promise<string> {
  const workspacePath = getWorkspacePath(project.id)
  await ensureDir(workspacePath)
  await ensureDir(getTestsDir(project.id))
  await ensureDir(getResultsDir(project.id))
  await ensureDir(getReportDir(project.id))
  await ensureDir(path.dirname(getStorageStateFile(project.id)))

  await writeFileIfMissing(path.join(workspacePath, 'package.json'), renderWorkspacePackageJson(project.id))

  // Luôn ghi đè config để phản ánh project settings mới nhất.
  await fs.writeFile(
    path.join(workspacePath, 'playwright.config.ts'),
    renderPlaywrightConfig(project, reporterOutputs ? { reporterOutputs } : undefined),
    'utf8'
  )

  // .gitignore (cho user có lỡ commit từ workspace).
  await writeFileIfMissing(
    path.join(workspacePath, '.gitignore'),
    'node_modules\ntest-results\nplaywright-report\nauth/storageState.json\n'
  )

  await migrateSpecPlaywrightImports(project.id)

  return workspacePath
}

/** Ghi lại các `.spec.ts` dùng bare `@playwright/test` → import `file://…/index.mjs` từ app. */
async function migrateSpecPlaywrightImports(projectId: string): Promise<void> {
  const testsDir = getTestsDir(projectId)
  let names: string[]
  try {
    names = await fs.readdir(testsDir)
  } catch {
    return
  }
  for (const name of names) {
    if (!name.endsWith('.spec.ts')) continue
    const p = path.join(testsDir, name)
    let body: string
    try {
      body = await fs.readFile(p, 'utf8')
    } catch {
      continue
    }
    if (!/from\s+['"]@playwright\/test['"]/.test(body)) continue
    try {
      await fs.writeFile(p, patchSpecPlaywrightImport(body), 'utf8')
    } catch (err) {
      l.warn('[automation] migrateSpecPlaywrightImports failed', p, err)
    }
  }
}

/** Xoá toàn bộ workspace (best-effort) khi xoá project. Không động vào browsers cache. */
export async function removeWorkspace(projectId: string): Promise<void> {
  const target = getWorkspacePath(projectId)
  try {
    await fs.rm(target, { recursive: true, force: true })
  } catch (err) {
    l.warn('[automation] removeWorkspace failed', target, err)
  }
}

/** Resolve đường dẫn CLI Playwright trong cả dev và packaged (app.asar → app.asar.unpacked). */
export function resolvePlaywrightCliPath(): string {
  return path.join(getAppNodeModulesRoot(), 'node_modules', '@playwright', 'test', 'cli.js')
}

/** Env chuẩn cho mọi spawn Playwright: Electron-as-Node + NODE_PATH + cache browsers riêng. */
export function buildPlaywrightSpawnEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const unpackedRoot = getAppNodeModulesRoot()
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_PATH: path.join(unpackedRoot, 'node_modules'),
    PLAYWRIGHT_BROWSERS_PATH: getBrowsersCachePath(),
    ...extra,
  }
}

/** Kiểm tra nhanh xem ít nhất 1 browser đã tải về trong cache. */
export async function detectInstalledBrowsers(): Promise<AutomationBrowser[]> {
  const cache = getBrowsersCachePath()
  try {
    const entries = await fs.readdir(cache)
    const installed: AutomationBrowser[] = []
    for (const e of entries) {
      if (e.startsWith('chromium')) installed.push('chromium')
      else if (e.startsWith('firefox')) installed.push('firefox')
      else if (e.startsWith('webkit')) installed.push('webkit')
    }
    return Array.from(new Set(installed))
  } catch {
    return []
  }
}
