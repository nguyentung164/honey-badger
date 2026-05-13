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

/** Thư mục artifact trace/screenshot/video (CLI `--output`). JSON/junit nằm riêng dưới `hb-reports/<runId>/` để không bị Playwright dọn `outputDir`/`--output` làm mất hoặc race. */
export function getRunArtifactsDir(projectId: string, runId: string): string {
  return getWorkspaceSubPath(projectId, 'test-results', runId, 'artifacts')
}

/** Chuẩn hoá đường dẫn artifact từ JSON report (attachments) — có thể nằm dưới `test-results/<runId>/artifacts` hoặc `playwright-report/<runId>/data` (ảnh embed HTML, tên file hash). */
export function resolveTraceArtifactAbsolutePath(projectId: string, runId: string, raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined
  const rel = raw.trim()
  if (path.isAbsolute(rel)) return path.normalize(rel)
  return resolveStoredArtifactPathForOpen(rel, { projectId, runId })
}

/**
 * Screenshot, video, trace: đường dẫn từ Playwright JSON có thể tuyệt đối, relative tới `test-results/<runId>/artifacts`,
 * hoặc relative tới `playwright-report/<runId>` (vd `data/<sha>.png`).
 */
export function resolveStoredArtifactPathForOpen(
  artifactPath: string,
  hints?: { projectId: string; runId: string }
): string {
  const t = artifactPath.trim()
  if (!t) throw new Error('Missing artifact path')
  if (path.isAbsolute(t)) return path.normalize(t)
  if (!hints?.projectId || !hints?.runId) {
    throw new Error('Artifact path is relative; supply projectId and runId (refresh run list and try again).')
  }
  const { projectId, runId } = hints
  const norm = t.replace(/\\/g, '/').replace(/^\.\//, '')

  if (norm.includes('playwright-report/')) {
    return path.normalize(path.resolve(getWorkspacePath(projectId), norm))
  }
  if (norm.startsWith('data/')) {
    return path.normalize(path.join(getReportDir(projectId, runId), norm))
  }
  if (/^[a-f0-9]{40}\.png$/i.test(norm)) {
    return path.normalize(path.join(getReportDir(projectId, runId), 'data', norm))
  }

  return path.normalize(path.resolve(getRunArtifactsDir(projectId, runId), t))
}

/** Path trace khi Open từ UI: tuyệt đối hoặc relative so với `test-results/<runId>/artifacts`. */
export function resolveStoredTracePathForOpen(tracePath: string, hints?: { projectId: string; runId: string }): string {
  const t = tracePath.trim()
  if (!t) throw new Error('Missing trace path')
  return resolveStoredArtifactPathForOpen(tracePath, hints)
}

/** Chặn path thoát khỏi workspace project (sau khi đã resolve tuyệt đối). */
export function assertResolvedPathInsideProjectWorkspace(projectId: string, resolvedAbs: string): void {
  const root = path.normalize(getWorkspacePath(projectId))
  const resolved = path.normalize(resolvedAbs)
  const relative = path.relative(root, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Access denied')
  }
}

export function getReportDir(projectId: string, runId?: string): string {
  return runId
    ? getWorkspaceSubPath(projectId, 'playwright-report', runId)
    : getWorkspaceSubPath(projectId, 'playwright-report')
}

export function getRunLogFile(projectId: string, runId: string): string {
  return getWorkspaceSubPath(projectId, 'test-results', runId, 'run.log')
}

/** Báo cáo JSON/junit theo run — ngoài `test-results` để tránh thư mục output của Playwright xoá/ghi đè cùng cây. */
export function getRunReportsDir(projectId: string, runId: string): string {
  return getWorkspaceSubPath(projectId, 'hb-reports', runId)
}

export function getRunJsonFile(projectId: string, runId: string): string {
  return path.join(getRunReportsDir(projectId, runId), 'report.json')
}

export function getRunJunitFile(projectId: string, runId: string): string {
  return path.join(getRunReportsDir(projectId, runId), 'junit.xml')
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

/**
 * Nội dung `tests/hb-fixtures.ts`: bọc `test` + sau khi fail gắn thêm attachment ảnh có viền đỏ (best-effort từ text lỗi Playwright).
 * Luôn ghi đè khi bootstrap để nhận bản sửa Honey Badger.
 */
export function renderHbFailureFixtures(): string {
  const pw = JSON.stringify(resolvePlaywrightTestImportSpecifier())
  const lines: string[] = [
    '// Auto-generated by Honey Badger Automation. Do not edit by hand.',
    '//',
    '// Run scope: playwright.config has maxFailures: 0 → all test() / files in the run execute; the runner does not stop the whole suite after the first failed test.',
    '// Inside ONE test(): hard expect() throws on first failure → later lines in that test do not run. Use await expectSoft(...).matcher() to continue, or split into multiple test() blocks.',
    '// Specs should use: import { test, expect, expectSoft } from "./hb-fixtures.ts"',
    `import { test as base, expect } from ${pw}`,
    `import type { Locator, Page, TestInfo } from ${pw}`,
    "import fs from 'node:fs/promises'",
    "import path from 'node:path'",
    '',
    '/** Gỡ ANSI (Playwright hay nhúng \\u001b[…m) để regex bắt được dòng Locator / Call log */',
    'function stripAnsi(s: string): string {',
    '  return s.replace(/\\u001b\\[[0-9;]*m/g, "")',
    '}',
    '',
    '/**',
    ' * text= trong testcase lệch với trang (vd text=1開発 nhưng UI chỉ có ỦE) → thử nới chuỗi,',
    ' * bôi phần tử text thật trên DOM (không thể bôi "cái đang sai trong test" vì nó không tồn tại).',
    ' */',
    'function relaxTextEngineInner(raw: string): string[] {',
    '  const out: string[] = []',
    '  const stripLead = raw.replace(/^[0-9]+/u, "")',
    '  if (stripLead && stripLead !== raw) out.push(stripLead)',
    '  const stripAllNum = raw.replace(/[0-9]+/g, "")',
    '  if (stripAllNum && stripAllNum !== raw && stripAllNum.length > 0) out.push(stripAllNum)',
    '  if (raw.length > 1) {',
    '    const rest = raw.slice(1)',
    '    if (rest) out.push(rest)',
    '  }',
    '  return [...new Set(out)]',
    '}',
    '',
    '/**',
    ' * Khoanh đúng phần tử đang fail (text/button/…) từ message Playwright.',
    ' * Thứ tự: Call log "waiting for …" (gần thất bại nhất) → dòng Locator: → getByText.',
    ' */',
    'async function tryHighlightFailingElement(page: Page, msg: string): Promise<boolean> {',
    '  const outline =',
    '    ";outline:3px solid #f87171 !important"',
    '  const paint = async (loc: Locator) => {',
    '    await loc.waitFor({ state: "attached", timeout: 2200 })',
    '    await loc.scrollIntoViewIfNeeded().catch(() => {})',
    '    await loc.evaluate(',
    '      (el, outlineCss) => {',
    '        if (!(el instanceof HTMLElement)) return',
    '        const prev = el.getAttribute("style") || ""',
    '        if (!el.hasAttribute("data-hb-fail-prev")) el.setAttribute("data-hb-fail-prev", prev)',
    '        el.setAttribute("style", prev + outlineCss)',
    '        el.setAttribute("data-hb-outlined", "1")',
    '      },',
    '      outline,',
    '    )',
    '  }',
    '  const tryOne = async (loc: Locator) => {',
    '    try {',
    '      await paint(loc.first())',
    '      return true',
    '    } catch {',
    '      return false',
    '    }',
    '  }',
    '  const seen = new Set<string>()',
    '  const dedupe = (s: string) => {',
    '    const k = s.trim()',
    '    if (!k || seen.has(k)) return false',
    '    seen.add(k)',
    '    return true',
    '  }',
    '',
    '  // 1) Call log: waiting for locator(…)',
    '  const waitLoc: string[] = []',
    '  const reWait = /waiting for locator\\(([\\`\'"])([\\s\\S]*?)\\1\\)/gi',
    '  let m: RegExpExecArray | null',
    '  while ((m = reWait.exec(msg)) !== null) {',
    '    if (m[2] && dedupe(m[2])) waitLoc.push(m[2])',
    '  }',
    '  for (let i = waitLoc.length - 1; i >= 0; i--) {',
    '    if (await tryOne(page.locator(waitLoc[i]))) return true',
    '  }',
    '',
    '  // 2) getByText trong Call log / Locator',
    '  const reGbt = /(?:waiting for |Locator:\\s*)getByText\\(([\\`\'"])([\\s\\S]*?)\\1\\)/gi',
    '  const gtx: string[] = []',
    '  while ((m = reGbt.exec(msg)) !== null) {',
    '    if (m[2] && dedupe("gbt:" + m[2])) gtx.push(m[2])',
    '  }',
    '  for (let i = gtx.length - 1; i >= 0; i--) {',
    '    const t = gtx[i]',
    '    if (await tryOne(page.getByText(t, { exact: true }))) return true',
    '    if (t !== t.trim() && (await tryOne(page.getByText(t.trim(), { exact: true })))) return true',
    '    if (await tryOne(page.getByText(t))) return true',
    '  }',
    '',
    '  // 3) Locator: locator(\'…\')',
    '  const reLocLine = /Locator:\\s*locator\\(([\\`\'"])([\\s\\S]*?)\\1\\)/gi',
    '  const locs: string[] = []',
    '  while ((m = reLocLine.exec(msg)) !== null) {',
    '    if (m[2] && dedupe(m[2])) locs.push(m[2])',
    '  }',
    '  for (let i = locs.length - 1; i >= 0; i--) {',
    '    if (await tryOne(page.locator(locs[i]))) return true',
    '  }',
    '',
    '  // 4) getByRole(\'button\', { name: \'…\' })',
    '  const reRole = /getByRole\\(\\s*[\'"]([a-zA-Z]+)[\'"]\\s*,\\s*\\{\\s*name:\\s*([\'"])([\\s\\S]*?)\\2\\s*\\}/gi',
    '  while ((m = reRole.exec(msg)) !== null) {',
    '    const role = m[1]',
    '    const name = m[3]',
    '    if (name && dedupe("role:" + role + ":" + name)) {',
    '      try {',
    '        await paint(page.getByRole(role as any, { name, exact: true }).first())',
    '        return true',
    '      } catch {',
    '        /* fall through */',
    '      }',
    '    }',
    '  }',
    '',
    '  // 5) text=… không khớp DOM (thừa ký tự / số trong case): thử nới → khoanh text thật trên trang',
    '  const fromLocators = [...waitLoc, ...locs]',
    '  const triedRelax = new Set<string>()',
    '  for (const sel of fromLocators) {',
    '    const t = sel.trim()',
    '    if (!t.startsWith("text=")) continue',
    '    if (t.startsWith("text=/")) continue',
    '    const inner = /^text=(.+)$/.exec(t)?.[1]',
    '    if (!inner) continue',
    '    for (const cand of relaxTextEngineInner(inner)) {',
    '      const tag = cand + "@" + t',
    '      if (triedRelax.has(tag)) continue',
    '      triedRelax.add(tag)',
    '      if (await tryOne(page.locator("text=" + cand))) return true',
    '      if (await tryOne(page.getByText(cand, { exact: true }))) return true',
    '      if (await tryOne(page.getByText(cand))) return true',
    '    }',
    '  }',
    '',
    '  return false',
    '}',
    '',
    'async function clearHbFailureMarks(page: Page) {',
    '  await page.evaluate(() => {',
    '    document.getElementById("__hb_failure_frame")?.remove()',
    '    for (const el of Array.from(document.querySelectorAll("[data-hb-outlined]"))) {',
    '      if (!(el instanceof HTMLElement)) continue',
    '      const prev = el.getAttribute("data-hb-fail-prev") ?? ""',
    '      el.setAttribute("style", prev)',
    '      el.removeAttribute("data-hb-outlined")',
    '      el.removeAttribute("data-hb-fail-prev")',
    '    }',
    '  })',
    '}',
    '',
    '/** Mỗi phần tử errors[] (soft fail) hoặc error đơn: một ảnh failure-highlight-N.png. */',
    'async function attachAllFailureHighlights(page: Page, testInfo: TestInfo) {',
    '  const list = [...(testInfo.errors ?? [])]',
    '  if (list.length === 0 && testInfo.error?.message) list.push({ message: testInfo.error.message })',
    '  if (list.length === 0) return',
    '  for (let i = 0; i < list.length; i++) {',
    '    await clearHbFailureMarks(page)',
    '    const msg = stripAnsi(String(list[i].message ?? ""))',
    '    let focused = await tryHighlightFailingElement(page, msg)',
    '    if (!focused) {',
    '      await page.evaluate(() => {',
    '        let div = document.getElementById("__hb_failure_frame")',
    '        if (!div) {',
    '          div = document.createElement("div")',
    '          div.id = "__hb_failure_frame"',
    '          document.documentElement.appendChild(div)',
    '        }',
    '        div.setAttribute("aria-hidden", "true")',
    '        div.style.cssText =',
    '          "position:fixed;inset:0;z-index:2147483646;pointer-events:none;box-sizing:border-box;border:2px solid rgba(248,113,113,0.9);"',
    '      })',
    '    }',
    '    const png = await page.screenshot({ fullPage: true, type: "png" })',
    '    const fileName = `failure-highlight-${i + 1}.png`',
    '    const outPath = path.join(testInfo.outputDir, fileName)',
    '    await fs.writeFile(outPath, png)',
    '    await testInfo.attach(fileName, { path: outPath, contentType: "image/png" })',
    '  }',
    '}',
    '',
    'export const test = base.extend({',
    '  page: async ({ page }, use, testInfo) => {',
    '    await use(page)',
    '    const st = testInfo.status',
    '    if (st === "passed" || st === "skipped") return',
    '    const hasErr = (testInfo.errors?.length ?? 0) > 0',
    '    if (!(st === "failed" || st === "timedOut" || st === "interrupted" || hasErr)) return',
    '    try {',
    '      await attachAllFailureHighlights(page, testInfo)',
    '    } catch {',
    '      /* page closed / transient */',
    '    }',
    '  },',
    '})',
    '',
    '/** expect.soft — nhiều assert trong một test() không dừng giữa chừng. */',
    'export const expectSoft = expect.soft',
    '',
    'export { expect }',
  ]
  return lines.join('\n')
}

/**
 * Spec import từ `./hb-fixtures.ts` (fixture failure highlight). Migrate cả bare `@playwright/test` lẫn import file:// cũ.
 */
export function patchSpecPlaywrightImport(content: string): string {
  const pwQuoted = JSON.stringify(resolvePlaywrightTestImportSpecifier())
  const fixturesQuoted = JSON.stringify('./hb-fixtures.ts')
  let out = content.replace(/from\s+['"]@playwright\/test['"]/g, `from ${fixturesQuoted}`)
  out = out.split(`from ${pwQuoted}`).join(`from ${fixturesQuoted}`)
  return out
}

export type PlaywrightReporterOutputs = {
  jsonFile: string
  junitFile: string
  /** Thư mục HTML report (`playwright-report/<runId>`); Playwright ghi `index.html` vào đây. */
  htmlOutputFolder: string
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
    ? (() => {
        const lines = [
          `    ['list']`,
          `    ['json', { outputFile: ${JSON.stringify(ro.jsonFile)} }]`,
          `    ['junit', { outputFile: ${JSON.stringify(ro.junitFile)} }]`,
        ]
        if (ro.htmlOutputFolder) {
          lines.push(`    ['html', { outputFolder: ${JSON.stringify(ro.htmlOutputFolder)}, open: 'never' }]`)
        }
        return `[\n${lines.join(',\n')},\n  ]`
      })()
    : `[['list']]`

  const atImport = JSON.stringify(resolvePlaywrightTestImportSpecifier())

  return `// Auto-generated by Honey Badger Automation. Do not edit by hand.
// maxFailures: 0 — chạy hết test trong lượt, không dừng cả runner khi 1 case fail.
import { defineConfig, devices } from ${atImport}

export default defineConfig({
  testDir: ${JSON.stringify(testsDir)},
  outputDir: ${JSON.stringify(outputDir)},
  fullyParallel: false,
  forbidOnly: false,
  maxFailures: 0,
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

  await fs.writeFile(path.join(getTestsDir(project.id), 'hb-fixtures.ts'), renderHbFailureFixtures(), 'utf8')

  // Luôn ghi đè config để phản ánh project settings mới nhất.
  await fs.writeFile(
    path.join(workspacePath, 'playwright.config.ts'),
    renderPlaywrightConfig(project, reporterOutputs ? { reporterOutputs } : undefined),
    'utf8'
  )

  // .gitignore (cho user có lỡ commit từ workspace).
  await writeFileIfMissing(
    path.join(workspacePath, '.gitignore'),
    'node_modules\ntest-results\nplaywright-report\nhb-reports\nauth/storageState.json\n'
  )

  await migrateSpecPlaywrightImports(project.id)

  return workspacePath
}

/** Ghi lại spec: bare `@playwright/test`, import file:// cũ → `./hb-fixtures.ts`. */
async function migrateSpecPlaywrightImports(projectId: string): Promise<void> {
  const testsDir = getTestsDir(projectId)
  const pwQuoted = JSON.stringify(resolvePlaywrightTestImportSpecifier())
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
    const needsPatch = /from\s+['"]@playwright\/test['"]/.test(body) || body.includes(`from ${pwQuoted}`)
    if (!needsPatch) continue
    try {
      const patched = patchSpecPlaywrightImport(body)
      if (patched === body) continue
      await fs.writeFile(p, patched, 'utf8')
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

/** Xoá artifact run trên đĩa (test-results, playwright-report, hb-reports); giữ tests, auth, config workspace. */
export async function clearRunHistoryArtifactsFromWorkspace(projectId: string): Promise<void> {
  const testResults = getWorkspaceSubPath(projectId, 'test-results')
  const reportDir = getWorkspaceSubPath(projectId, 'playwright-report')
  const hbReports = getWorkspaceSubPath(projectId, 'hb-reports')
  await Promise.all([
    fs.rm(testResults, { recursive: true, force: true }),
    fs.rm(reportDir, { recursive: true, force: true }),
    fs.rm(hbReports, { recursive: true, force: true }),
  ])
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
