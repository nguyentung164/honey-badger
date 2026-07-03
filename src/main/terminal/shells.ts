import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_TERMINAL_SHELL_PROFILE,
  TERMINAL_SHELL_PROFILE_ORDER,
  type TerminalShellProfileId,
  type TerminalShellProfileInfo,
} from 'shared/terminal/shells'

function windowsSystemRoot(): string {
  return process.env.SystemRoot || 'C:\\Windows'
}

function resolveShellProfilePath(profileId: TerminalShellProfileId): string | null {
  if (process.platform !== 'win32') {
    if (profileId === 'cmd') return process.env.ComSpec || '/bin/sh'
    return process.env.SHELL || '/bin/bash'
  }

  const systemRoot = windowsSystemRoot()
  switch (profileId) {
    case 'powershell': {
      const p = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      return fs.existsSync(p) ? p : null
    }
    case 'cmd': {
      const p = process.env.ComSpec || path.join(systemRoot, 'System32', 'cmd.exe')
      return fs.existsSync(p) ? p : null
    }
    case 'pwsh': {
      const candidates = [
        process.env.PWSH_PATH,
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'PowerShell', '7', 'pwsh.exe'),
      ].filter((v): v is string => Boolean(v?.trim()))
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate
      }
      return null
    }
    default:
      return null
  }
}

export function getAvailableShellProfiles(): TerminalShellProfileInfo[] {
  const profiles: TerminalShellProfileInfo[] = []
  for (const id of TERMINAL_SHELL_PROFILE_ORDER) {
    const shellPath = resolveShellProfilePath(id)
    if (shellPath) profiles.push({ id, path: shellPath })
  }
  return profiles
}

export function resolveShellForProfile(profileId?: TerminalShellProfileId): string {
  if (profileId) {
    const resolved = resolveShellProfilePath(profileId)
    if (resolved) return resolved
  }

  for (const id of TERMINAL_SHELL_PROFILE_ORDER) {
    const resolved = resolveShellProfilePath(id)
    if (resolved) return resolved
  }

  if (process.platform === 'win32') {
    return process.env.ComSpec || 'cmd.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

export function defaultShellProfileId(): TerminalShellProfileId {
  const available = getAvailableShellProfiles()
  if (available.some(p => p.id === DEFAULT_TERMINAL_SHELL_PROFILE)) {
    return DEFAULT_TERMINAL_SHELL_PROFILE
  }
  return available[0]?.id ?? DEFAULT_TERMINAL_SHELL_PROFILE
}
