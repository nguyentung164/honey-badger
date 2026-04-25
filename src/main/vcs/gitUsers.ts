import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import l from 'electron-log'
import type { GitConfigUser, GitStoredCredential } from './types'

const execFileAsync = promisify(execFile)

function getCredentialsFilePath(): string {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  return path.join(home, '.git-credentials')
}

function expandTilde(filePath: string): string {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  if (filePath === '~') return home
  if (filePath.startsWith('~/')) return path.join(home, filePath.slice(2))
  if (filePath.startsWith(`~${path.sep}`)) return path.join(home, filePath.slice(2))
  return filePath
}

/**
 * Parse credential.helper to get custom store file path if specified.
 * Checks all credential helpers (--get-all) since Git can have multiple.
 * e.g. "store --file C:\path\to\file" -> C:\path\to\file
 */
async function getStoreCredentialsPath(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--global', '--get-all', 'credential.helper'], {
      windowsHide: true,
    }).catch(() => ({ stdout: '' }))
    const helpers = (stdout || '')
      .split(/\r?\n/)
      .map(h => h.trim())
      .filter(Boolean)
    for (const helper of helpers) {
      const storeMatch = helper.match(/store\s+(?:--file\s+)?([^\s]+)/i) || helper.match(/store\s+(.+)/i)
      if (storeMatch) {
        const p = storeMatch[1].trim()
        const resolved = p ? expandTilde(path.resolve(p)) : getCredentialsFilePath()
        return resolved
      }
      if (helper.toLowerCase().includes('store')) {
        return getCredentialsFilePath()
      }
    }
    return null
  } catch {
    return null
  }
}

export async function getGitConfig(cwd?: string): Promise<{ global: GitConfigUser; local?: GitConfigUser }> {
  const result: { global: GitConfigUser; local?: GitConfigUser } = {
    global: { userName: '', userEmail: '', scope: 'global' },
  }

  try {
    const [nameOut, emailOut] = await Promise.all([
      execFileAsync('git', ['config', '--global', 'user.name'], { windowsHide: true }).catch(() => ({ stdout: '' })),
      execFileAsync('git', ['config', '--global', 'user.email'], { windowsHide: true }).catch(() => ({ stdout: '' })),
    ])
    result.global.userName = ((nameOut as { stdout?: string }).stdout || '').trim()
    result.global.userEmail = ((emailOut as { stdout?: string }).stdout || '').trim()
  } catch (err) {
    l.warn('Error getting git global config:', err)
  }

  if (cwd && fs.existsSync(path.join(cwd, '.git'))) {
    try {
      const [nameOut, emailOut] = await Promise.all([
        execFileAsync('git', ['config', '--local', 'user.name'], { cwd, windowsHide: true }).catch(() => ({ stdout: '' })),
        execFileAsync('git', ['config', '--local', 'user.email'], { cwd, windowsHide: true }).catch(() => ({ stdout: '' })),
      ])
      const userName = ((nameOut as { stdout?: string }).stdout || '').trim()
      const userEmail = ((emailOut as { stdout?: string }).stdout || '').trim()
      if (userName || userEmail) {
        result.local = { userName, userEmail, scope: 'local' }
      }
    } catch (err) {
      l.warn('Error getting git local config:', err)
    }
  }

  return result
}

export async function setGitConfig(userName: string, userEmail: string, scope: 'global' | 'local', cwd?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const scopeArg = scope === 'global' ? '--global' : '--local'
    if (scope === 'local' && !cwd) {
      return { success: false, error: 'cwd required for local config' }
    }
    const opts = scope === 'global' ? { windowsHide: true } : { cwd, windowsHide: true }

    if (userName) {
      await execFileAsync('git', ['config', scopeArg, 'user.name', userName], opts)
    } else {
      await execFileAsync('git', ['config', scopeArg, '--unset', 'user.name'], opts).catch(() => {})
    }
    if (userEmail) {
      await execFileAsync('git', ['config', scopeArg, 'user.email', userEmail], opts)
    } else {
      await execFileAsync('git', ['config', scopeArg, '--unset', 'user.email'], opts).catch(() => {})
    }
    return { success: true }
  } catch (error) {
    l.error('Error setting git config:', error)
    return { success: false, error: String(error) }
  }
}

export async function listGitCredentials(): Promise<GitStoredCredential[]> {
  const credentials: GitStoredCredential[] = []

  try {
    const storePath = (await getStoreCredentialsPath()) || getCredentialsFilePath()
    if (storePath && fs.existsSync(storePath)) {
      const content = fs.readFileSync(storePath, 'utf-8')
      const lines = content.split(/\r?\n/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const matchWithPass = trimmed.match(/^(?:https?|git):\/\/([^:]+):([^@]+)@(.+)$/)
        const matchNoPass = trimmed.match(/^(?:https?|git):\/\/([^@]+)@(.+)$/)
        if (matchWithPass) {
          const [, username, , host] = matchWithPass
          credentials.push({ host, username: username || '', source: 'store' })
        } else if (matchNoPass) {
          const [, username, host] = matchNoPass
          credentials.push({ host, username: username || '', source: 'store' })
        }
      }
    }

    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('cmdkey', ['/list'], { windowsHide: true }).catch(() => ({ stdout: '' }))
      const lines = (stdout || '').split(/\r?\n/)
      for (const line of lines) {
        const targetMatch = line.match(/Target:\s*(.+)/)
        if (targetMatch) {
          const rawTarget = targetMatch[1].trim()
          // Windows Credential Manager: "LegacyGeneric:target=git:https://github.com" hoặc "gh:github.com:user"
          const targetKey = rawTarget.includes('target=') ? rawTarget.replace(/^[^=]*=/, '') : rawTarget
          const isGitHttps = targetKey.includes('git:https://') || targetKey.includes('git:http://')
          const isGhCli = /^gh:[^:]+:/.test(targetKey) || /^gh:[^:]+$/.test(targetKey)
          if (isGitHttps) {
            const hostMatch = targetKey.match(/git:(?:https?):\/\/([^/]+)/)
            if (hostMatch) {
              const host = hostMatch[1]
              if (!credentials.some(c => c.source === 'wincred' && c.targetName === rawTarget)) {
                credentials.push({
                  host,
                  username: '',
                  source: 'wincred',
                  targetName: rawTarget,
                })
              }
            }
          } else if (isGhCli) {
            const parts = targetKey.split(':')
            if (parts.length >= 2) {
              const host = parts[1]
              const username = parts[2] || ''
              if (!credentials.some(c => c.source === 'wincred' && c.targetName === rawTarget)) {
                credentials.push({
                  host,
                  username,
                  source: 'wincred',
                  targetName: rawTarget,
                })
              }
            }
          }
        }
      }
    }
  } catch (error) {
    l.error('Error listing git credentials:', error)
  }

  return credentials
}

export async function removeGitCredential(params: { host: string; username?: string; source: string; targetName?: string }): Promise<{ success: boolean; error?: string }> {
  const { source, targetName } = params

  try {
    if (source === 'wincred' && targetName && process.platform === 'win32') {
      await execFileAsync('cmdkey', ['/delete', targetName], { windowsHide: true })
      return { success: true }
    }

    if (source === 'store') {
      const storePath = (await getStoreCredentialsPath()) || getCredentialsFilePath()
      if (!fs.existsSync(storePath)) return { success: true }

      const content = fs.readFileSync(storePath, 'utf-8')
      const lines = content.split(/\r?\n/)
      const host = params.host
      const username = params.username
      const filtered = lines.filter(line => {
        const trimmed = line.trim()
        if (!trimmed) return true
        const match = trimmed.match(/^(?:https?|git):\/\/([^:]+):[^@]+@(.+)$/) || trimmed.match(/^(?:https?|git):\/\/([^@]+)@(.+)$/)
        if (!match) return true
        const lineUser = match[1]
        const lineHost = match[2]
        const hostMatches = lineHost.includes(host) || host.includes(lineHost)
        const userMatches = !username || lineUser === username
        if (hostMatches && userMatches) return false
        return true
      })
      fs.writeFileSync(storePath, filtered.join('\n') + (filtered.length > 0 ? '\n' : ''))
      return { success: true }
    }

    return { success: true }
  } catch (error) {
    l.error('Error removing git credential:', error)
    return { success: false, error: String(error) }
  }
}
