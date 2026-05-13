import { mkdtempSync } from 'node:fs'
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
      { reporterOutputs: { jsonFile: json, junitFile: junit } }
    )
    expect(cfg).toContain(`['json', { outputFile: ${JSON.stringify(json)} }]`)
    expect(cfg).toContain(`['junit', { outputFile: ${JSON.stringify(junit)} }]`)
    expect(cfg).not.toContain("'html'")
  })

  it('patchSpecPlaywrightImport rewrites bare @playwright/test import', () => {
    const patched = workspace.patchSpecPlaywrightImport(
      `import { test } from '@playwright/test'\nimport { x } from "lodash"\n`
    )
    expect(patched).toMatch(/from\s+["']file:/)
    expect(patched).not.toMatch(/from\s+['"]@playwright\/test['"]/)
  })

  it('builds spawn env with Electron-as-Node and browsers cache path', () => {
    const env = workspace.buildPlaywrightSpawnEnv({ EXTRA_VAR: '1' })
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBeDefined()
    expect(env.EXTRA_VAR).toBe('1')
  })
})
