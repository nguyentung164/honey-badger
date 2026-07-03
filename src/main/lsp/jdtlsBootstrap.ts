import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import l from 'electron-log'

const execFileAsync = promisify(execFile)

/** Stable JDT LS milestone (tar.gz). */
const JDT_LS_DOWNLOAD_URL =
  'https://download.eclipse.org/jdtls/milestones/1.42.0/jdt-language-server-1.42.0-202411121513.tar.gz'

export function getJdtRoot(): string {
  return path.join(app.getPath('userData'), 'jdtls')
}

export function findJdtLauncher(jdtRoot: string): string | null {
  const plugins = path.join(jdtRoot, 'plugins')
  if (!fs.existsSync(plugins)) return null
  const launcher = fs
    .readdirSync(plugins)
    .find(f => f.startsWith('org.eclipse.equinox.launcher_') && f.endsWith('.jar'))
  return launcher ? path.join(plugins, launcher) : null
}

export async function detectJavaExecutable(): Promise<{ java: string; version?: string } | null> {
  const javaHome = process.env.JAVA_HOME?.trim()
  const candidates = [
    javaHome ? path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : null,
    'java',
  ].filter(Boolean) as string[]

  for (const java of candidates) {
    try {
      const { stderr, stdout } = await execFileAsync(java, ['-version'], { windowsHide: true })
      const versionText = `${stdout}\n${stderr}`
      const match = versionText.match(/version "([^"]+)"/)
      if (match) {
        const major = Number.parseInt(match[1].split('.')[0] === '1' ? match[1].split('.')[1] ?? '0' : match[1], 10)
        if (major < 17) {
          l.warn(`[jdtls] JDK ${match[1]} found but 17+ required`)
          continue
        }
        return { java, version: match[1] }
      }
      return { java }
    } catch {
      /* try next */
    }
  }
  return null
}

let installPromise: Promise<{ installed: boolean; error?: string }> | null = null

export async function ensureJdtLanguageServerInstalled(): Promise<{ installed: boolean; error?: string }> {
  const jdtRoot = getJdtRoot()
  if (findJdtLauncher(jdtRoot)) return { installed: true }

  if (!installPromise) {
    installPromise = downloadAndExtractJdt(jdtRoot).finally(() => {
      installPromise = null
    })
  }
  return installPromise
}

async function downloadAndExtractJdt(jdtRoot: string): Promise<{ installed: boolean; error?: string }> {
  const marker = path.join(jdtRoot, '.install-complete')
  if (fs.existsSync(marker) && findJdtLauncher(jdtRoot)) return { installed: true }

  try {
    fs.mkdirSync(jdtRoot, { recursive: true })
    const archivePath = path.join(jdtRoot, 'jdt-language-server.tar.gz')
    l.info('[jdtls] Downloading JDT Language Server…')

    const response = await fetch(JDT_LS_DOWNLOAD_URL)
    if (!response.ok) throw new Error(`Download failed (${response.status})`)
    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(archivePath, buffer)

    l.info('[jdtls] Extracting…')
    await execFileAsync('tar', ['-xzf', archivePath, '-C', jdtRoot], { windowsHide: true })

    const entries = fs.readdirSync(jdtRoot)
    const nested = entries.find(e => e.startsWith('jdt-language-server'))
    if (nested) {
      const nestedPath = path.join(jdtRoot, nested)
      for (const item of fs.readdirSync(nestedPath)) {
        const src = path.join(nestedPath, item)
        const dest = path.join(jdtRoot, item)
        if (!fs.existsSync(dest)) fs.renameSync(src, dest)
      }
      fs.rmSync(nestedPath, { recursive: true, force: true })
    }

    fs.rmSync(archivePath, { force: true })
    fs.writeFileSync(marker, new Date().toISOString())

    if (!findJdtLauncher(jdtRoot)) throw new Error('JDT LS launcher not found after extract')
    return { installed: true }
  } catch (err) {
    l.error('[jdtls] install failed:', err)
    return { installed: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function jdtWorkspaceDataDir(rootPath: string): string {
  const hash = createHash('sha1').update(rootPath).digest('hex').slice(0, 16)
  return path.join(getJdtRoot(), 'workspaces', hash)
}
