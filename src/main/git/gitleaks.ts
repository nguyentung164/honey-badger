import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import l from 'electron-log'

const execFileAsync = promisify(execFile)

const GITLEAKS_DIR_NAME = 'gitleaks'

/** Pinned CLI: gitleaks git --pre-commit --staged (v8.30.x). */
function getGitleaksBundleDir(): string {
  if (process.env.NODE_ENV === 'development') {
    return path.resolve(process.cwd(), GITLEAKS_DIR_NAME)
  }
  return path.join(process.resourcesPath, GITLEAKS_DIR_NAME)
}

export function resolveGitleaksExecutable(): string | null {
  const dir = getGitleaksBundleDir()
  const exe = process.platform === 'win32' ? path.join(dir, 'gitleaks.exe') : path.join(dir, 'gitleaks')
  return fs.existsSync(exe) ? exe : null
}

export async function resolveGitRepoRoot(cwd: string): Promise<string | null> {
  const dir = cwd?.trim()
  if (!dir) return null
  try {
    const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      windowsHide: true,
    })
    const top = stdout.trim().replace(/[/\\]+$/, '')
    return top || null
  } catch {
    return null
  }
}

export type GitleaksFinding = {
  ruleId: string
  file: string
  startLine?: number
  endLine?: number
  description?: string
}

function normalizeRawFinding(raw: Record<string, unknown>): GitleaksFinding {
  const ruleId = String(raw.RuleID ?? raw.ruleID ?? '')
  const file = String(raw.File ?? raw.file ?? '')
  const description = raw.Description != null || raw.description != null ? String(raw.Description ?? raw.description) : undefined
  const startLine = typeof raw.StartLine === 'number' ? raw.StartLine : typeof raw.startLine === 'number' ? raw.startLine : undefined
  const endLine = typeof raw.EndLine === 'number' ? raw.EndLine : typeof raw.endLine === 'number' ? raw.endLine : undefined
  return { ruleId, file, startLine, endLine, description }
}

function parseReportJson(text: string): GitleaksFinding[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  let data: unknown
  try {
    data = JSON.parse(trimmed) as unknown
  } catch {
    l.warn('Gitleaks: could not parse report JSON')
    return []
  }
  const rows = Array.isArray(data) ? data : (data as { findings?: unknown })?.findings
  if (!Array.isArray(rows)) return []
  return rows.filter(r => r && typeof r === 'object').map(r => normalizeRawFinding(r as Record<string, unknown>))
}

export type GitleaksStagedScanResult = { status: 'clean' } | { status: 'leaks'; findings: GitleaksFinding[] } | { status: 'error'; message: string }

export async function runGitleaksStagedScan(
  repoRoot: string,
  options: {
    executable: string
    configPath?: string
    timeoutMs?: number
  }
): Promise<GitleaksStagedScanResult> {
  const timeoutMs = options.timeoutMs ?? 120_000
  const tmpBase = await mkdtemp(path.join(app.getPath('temp'), 'gitleaks-report-'))
  const reportPath = path.join(tmpBase, 'report.json')
  try {
    const args = ['git', '--pre-commit', '--staged', '--no-banner', '--log-level', 'error', '--report-format', 'json', '--report-path', reportPath, '--redact=100']
    const cfg = options.configPath?.trim()
    if (cfg) {
      if (!fs.existsSync(cfg)) {
        return { status: 'error', message: `Gitleaks config not found: ${cfg}` }
      }
      args.push('-c', cfg)
    }
    args.push(repoRoot)

    try {
      await execFileAsync(options.executable, args, {
        cwd: repoRoot,
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 50 * 1024 * 1024,
      })
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException & { status?: number; stderr?: Buffer | string; killed?: boolean }
      if (e?.code === 'ETIMEDOUT' || e?.killed) {
        return { status: 'error', message: 'Gitleaks scan timed out' }
      }
      const exitCode = typeof e.code === 'number' ? e.code : typeof e.status === 'number' ? e.status : undefined
      const text = await readFile(reportPath, 'utf-8').catch(() => '')
      const findings = parseReportJson(text)
      if (exitCode === 1 && findings.length > 0) {
        return { status: 'leaks', findings }
      }
      if (exitCode === 1 && findings.length === 0) {
        const stderr = typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString('utf-8') ?? '')
        return { status: 'error', message: stderr.trim() || e.message || 'Gitleaks exited with an error' }
      }
      const stderr = typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString('utf-8') ?? '')
      return { status: 'error', message: stderr.trim() || e.message || String(err) }
    }

    const text = await readFile(reportPath, 'utf-8')
    const findings = parseReportJson(text)
    if (findings.length > 0) {
      return { status: 'leaks', findings }
    }
    return { status: 'clean' }
  } finally {
    await rm(tmpBase, { recursive: true, force: true }).catch(() => {})
  }
}

export type GitleaksScanRepoInput = { cwd: string; label?: string }

export type GitleaksMultiScanResult =
  | { status: 'clean' }
  | {
      status: 'leaks'
      findings: (GitleaksFinding & { repoLabel?: string })[]
    }
  | { status: 'error'; message: string }

export async function scanStagedForRepos(repos: GitleaksScanRepoInput[], options: { configPath?: string; timeoutMs?: number }): Promise<GitleaksMultiScanResult> {
  const executable = resolveGitleaksExecutable()
  if (!executable) {
    const dir = getGitleaksBundleDir()
    return {
      status: 'error',
      message: `Gitleaks executable not found. Expected in: ${dir}`,
    }
  }

  const allFindings: (GitleaksFinding & { repoLabel?: string })[] = []

  for (const repo of repos) {
    const root = await resolveGitRepoRoot(repo.cwd)
    if (!root) {
      return { status: 'error', message: `Not a Git repository: ${repo.cwd}` }
    }
    const scan = await runGitleaksStagedScan(root, {
      executable,
      configPath: options.configPath,
      timeoutMs: options.timeoutMs,
    })
    if (scan.status === 'error') {
      return { status: 'error', message: repo.label ? `[${repo.label}] ${scan.message}` : scan.message }
    }
    if (scan.status === 'leaks') {
      for (const f of scan.findings) {
        allFindings.push({ ...f, repoLabel: repo.label })
      }
    }
  }

  if (allFindings.length > 0) {
    return { status: 'leaks', findings: allFindings }
  }
  return { status: 'clean' }
}
