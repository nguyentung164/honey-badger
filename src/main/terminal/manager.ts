import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, type WebContents } from 'electron'
import l from 'electron-log'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { IPC } from 'main/constants'
import type { TerminalCreateOptions, TerminalCreateResult } from 'shared/terminal/types'
import { defaultShellProfileId, resolveShellForProfile } from './shells'
import { resolveShellArgs } from './shellInit'

type TerminalSession = {
  pty: IPty
  owner: WebContents
}

const sessions = new Map<string, TerminalSession>()

function buildTerminalEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>
  delete env.NO_COLOR
  delete env.CI
  if (env.TERM === 'dumb') delete env.TERM

  return {
    ...env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    FORCE_COLOR: '1',
    CLICOLOR: '1',
    CLICOLOR_FORCE: '1',
    HOME: process.env.HOME || os.homedir(),
  }
}

function resolveCwd(cwd?: string): string {
  const trimmed = cwd?.trim()
  if (trimmed) {
    const resolved = path.resolve(trimmed)
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return resolved
    }
    throw new Error(`Working directory not found: ${resolved}`)
  }
  return process.cwd()
}

function killSession(id: string): void {
  const session = sessions.get(id)
  if (!session) return
  try {
    session.pty.kill()
  } catch (err) {
    l.warn(`[terminal] Failed to kill session ${id}:`, err)
  }
  sessions.delete(id)
}

function killSessionsForOwner(owner: WebContents): void {
  for (const [id, session] of sessions) {
    if (session.owner === owner) {
      killSession(id)
    }
  }
}

function killAllSessions(): void {
  for (const id of [...sessions.keys()]) {
    killSession(id)
  }
}

export function initTerminalManager(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('destroyed', () => {
      killSessionsForOwner(contents)
    })
  })

  app.on('before-quit', () => {
    killAllSessions()
  })
}

export function createTerminal(owner: WebContents, opts: TerminalCreateOptions = {}): TerminalCreateResult {
  try {
    const cwd = resolveCwd(opts.cwd)
    const shellProfileId = opts.shellProfileId ?? defaultShellProfileId()
    const shell = resolveShellForProfile(shellProfileId)
    const shellArgs = resolveShellArgs(shellProfileId)
    const cols = Math.max(2, opts.cols ?? 80)
    const rows = Math.max(1, opts.rows ?? 24)
    const id = randomUUID()

    const terminal = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cwd,
      cols,
      rows,
      env: buildTerminalEnv(),
    })

    terminal.onData(data => {
      if (owner.isDestroyed()) return
      try {
        owner.send(IPC.TERMINAL.STREAM_DATA, { id, data })
      } catch (err) {
        l.warn(`[terminal] Failed to stream data for ${id}:`, err)
      }
    })

    terminal.onExit(({ exitCode, signal }) => {
      sessions.delete(id)
      if (owner.isDestroyed()) return
      try {
        owner.send(IPC.TERMINAL.STREAM_EXIT, { id, exitCode, signal: signal ?? undefined })
      } catch (err) {
        l.warn(`[terminal] Failed to stream exit for ${id}:`, err)
      }
    })

    sessions.set(id, { pty: terminal, owner })
    l.info(`[terminal] Created session ${id} (${shell}) in ${cwd}`)
    return { success: true, id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    l.error('[terminal] Create failed:', err)
    return { success: false, error: message }
  }
}

export function writeTerminal(owner: WebContents, id: string, data: string): boolean {
  const session = sessions.get(id)
  if (!session || session.owner !== owner) return false
  session.pty.write(data)
  return true
}

export function resizeTerminal(owner: WebContents, id: string, cols: number, rows: number): boolean {
  const session = sessions.get(id)
  if (!session || session.owner !== owner) return false
  session.pty.resize(Math.max(2, cols), Math.max(1, rows))
  return true
}

export function destroyTerminal(owner: WebContents, id: string): boolean {
  const session = sessions.get(id)
  if (!session || session.owner !== owner) return false
  killSession(id)
  return true
}
