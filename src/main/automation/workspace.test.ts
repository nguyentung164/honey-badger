import { mkdtempSync } from 'node:fs'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => {
  const TMP = mkdtempSync(path.join(tmpdir(), 'hb-automation-ws-'))
  return {
    app: {
      getPath: (key: string) => {
        if (key === 'userData') return TMP
        return TMP
      },
      getAppPath: () => path.resolve(process.cwd()),
    },
  }
})

vi.mock('electron-log', () => ({
  default: { warn: () => {}, info: () => {}, error: () => {} },
}))

let workspace: typeof import('./workspace')

beforeAll(async () => {
  workspace = await import('./workspace')
})

describe('automation workspace paths', () => {
  it('keeps every helper path inside the project workspace root', () => {
    const id = 'proj-123'
    const root = workspace.getWorkspacePath(id)
    expect(workspace.getTestsDir(id).startsWith(root)).toBe(true)
    expect(workspace.getResultsDir(id).startsWith(root)).toBe(true)
    expect(workspace.getRunArtifactsDir(id, 'run-1').startsWith(root)).toBe(true)
    expect(workspace.getRunArtifactsDir(id, 'run-1')).toContain(`${path.sep}test-results${path.sep}run-1${path.sep}artifacts`)
    expect(workspace.getRunReportsDir(id, 'run-1').startsWith(root)).toBe(true)
    expect(workspace.getRunReportsDir(id, 'run-1')).toContain(`${path.sep}hb-reports${path.sep}run-1`)
    expect(workspace.getReportDir(id).startsWith(root)).toBe(true)
    expect(workspace.getStorageStateFile(id).startsWith(root)).toBe(true)
  })

  it('rejects path traversal attempts in spec file resolution', () => {
    expect(() => workspace.getWorkspaceSubPath('proj-1', '..', 'evil.txt')).toThrow(/Path traversal/)
  })

  it('sanitises spec filenames from arbitrary codes', () => {
    const file = workspace.getSpecFile('proj-1', 'TC-001/../weird name')
    const base = path.basename(file)
    expect(base.endsWith('.spec.ts')).toBe(true)
    expect(base).not.toContain('/')
    expect(base).not.toContain('\\')
    expect(base).not.toContain(' ')
    expect(file.startsWith(workspace.getTestsDir('proj-1'))).toBe(true)
  })

  it('removeCaseSpecArtifacts removes the spec file and Playwright snapshot dir', async () => {
    const id = 'proj-ws-del-spec'
    const testsDir = workspace.getTestsDir(id)
    await fsp.mkdir(testsDir, { recursive: true })
    const code = 'TC-99'
    const stem = workspace.getSpecStemForCaseCode(code)
    const specPath = workspace.getSpecFile(id, code)
    const snapDir = path.join(testsDir, `${stem}.spec.ts-snapshots`)
    await fsp.mkdir(snapDir, { recursive: true })
    await fsp.writeFile(path.join(snapDir, 'x.png'), 'x')
    await fsp.writeFile(specPath, '// spec')
    await workspace.removeCaseSpecArtifacts(id, code)
    await expect(fsp.access(specPath)).rejects.toThrow()
    await expect(fsp.access(snapDir)).rejects.toThrow()
  })

  it('renders playwright config with normalised paths and chosen browsers', () => {
    const cfg = workspace.renderPlaywrightConfig({
      id: 'proj-x',
      name: 'demo',
      baseUrl: 'https://example.com',
      browsers: ['chromium', 'firefox'],
      workspacePath: workspace.getWorkspacePath('proj-x'),
    } as never)
    expect(cfg).toContain("baseURL: \"https://example.com\"")
    expect(cfg).toContain("name: 'chromium'")
    expect(cfg).toContain("name: 'firefox'")
    expect(cfg).not.toContain('\\\\')
    expect(cfg).toMatch(/from\s+["']file:/)
    expect(cfg).toContain('maxFailures: 0')
  })

  it('embeds json/junit reporter paths when reporterOutputs is set', () => {
    const json = '/tmp/hb/report.json'
    const junit = '/tmp/hb/junit.xml'
    const cfg = workspace.renderPlaywrightConfig(
      {
        id: 'proj-x',
        name: 'demo',
        baseUrl: '',
        browsers: ['chromium'],
        workspacePath: workspace.getWorkspacePath('proj-x'),
      } as never,
      { reporterOutputs: { jsonFile: json, junitFile: junit, htmlOutputFolder: '/tmp/hb/playwright-report' } }
    )
    expect(cfg).toContain(`['json', { outputFile: ${JSON.stringify(json)} }]`)
    expect(cfg).toContain(`['junit', { outputFile: ${JSON.stringify(junit)} }]`)
    expect(cfg).toContain(`'./hb-full-steps-reporter.ts'`)
    expect(cfg).toContain('hb-full-steps.json')
    expect(cfg).not.toContain("'html'")
  })

  it('patchSpecPlaywrightImport rewrites bare @playwright/test import', () => {
    const patched = workspace.patchSpecPlaywrightImport(
      `import { test } from '@playwright/test'\nimport { x } from "lodash"\n`
    )
    expect(patched).toContain('./hb-fixtures.ts')
    expect(patched).not.toMatch(/from\s+['"]@playwright\/test['"]/)
  })

  it('patchSpecPlaywrightImport rewrites legacy file URL import to hb-fixtures', () => {
    const href = workspace.resolvePlaywrightTestImportSpecifier()
    const raw = `import { test } from ${JSON.stringify(href)}\n`
    const patched = workspace.patchSpecPlaywrightImport(raw)
    expect(patched).toContain('./hb-fixtures.ts')
    expect(patched).not.toContain(href)
  })

  it('hb-fixtures writes named highlight PNGs under outputDir and attaches by path', () => {
    const src = workspace.renderHbFailureFixtures()
    expect(src).toContain('expectSoftVisible')
    expect(src).toContain('expectVisibleWithOutline')
    expect(src).toContain('hbDebugHighlight')
    expect(src).toContain('attachAllFailureHighlights')
    expect(src).toContain('failure-highlight-" + (i + 1) + ".png"')
    expect(src).toContain('hbPaintLocatorDomOutline')
    expect(src).toContain('clearHbFailureFrame')
    expect(src).toContain('restoreHbDomOutlines')
    expect(src).toContain('testInfo.outputDir')
    expect(src).toContain('fs.writeFile')
    expect(src).toContain('path: outPath')
  })

  it('resolves attachment under playwright-report/... against workspace root', () => {
    const id = 'proj-x'
    const root = workspace.getWorkspacePath(id)
    const abs = workspace.resolveStoredArtifactPathForOpen('playwright-report/run-1/data/abc.png', {
      projectId: id,
      runId: 'run-1',
    })
    expect(abs).toBe(path.normalize(path.join(root, 'playwright-report/run-1/data/abc.png')))
  })

  it('resolves data/<file> under playwright-report/<runId> for HTML reporter embeds', () => {
    const id = 'proj-x'
    const abs = workspace.resolveStoredArtifactPathForOpen('data/d792a33e45f588c61f3841a1ca5f64007dfe8e5a.png', {
      projectId: id,
      runId: 'run-1',
    })
    expect(abs).toBe(
      path.normalize(
        path.join(workspace.getReportDir(id, 'run-1'), 'data', 'd792a33e45f588c61f3841a1ca5f64007dfe8e5a.png')
      )
    )
  })

  it('resolves bare 40-hex png as playwright-report/<runId>/data file', () => {
    const id = 'proj-x'
    const hash = 'd792a33e45f588c61f3841a1ca5f64007dfe8e5a.png'
    const abs = workspace.resolveStoredArtifactPathForOpen(hash, { projectId: id, runId: 'run-1' })
    expect(abs).toBe(path.normalize(path.join(workspace.getReportDir(id, 'run-1'), 'data', hash)))
  })

  it('builds spawn env with Electron-as-Node and browsers cache path', () => {
    const env = workspace.buildPlaywrightSpawnEnv({ EXTRA_VAR: '1' })
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBeDefined()
    expect(env.EXTRA_VAR).toBe('1')
  })
})
