import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { defaultShellProfileId, resolveShellForProfile } from 'main/terminal/shells'
import { resolveShellArgs } from 'main/terminal/shellInit'
import type { TerminalCreateOptions } from 'shared/terminal/types'

export type TerminalProcessCallbacks = {
  onData: (data: string) => void
  onExit: (exitCode: number, signal?: number) => void
}

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
    HB_SHELL_INTEGRATION: '1',
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

export class TerminalProcess {
  readonly id: string
  private readonly pty: IPty

  constructor(id: string, opts: TerminalCreateOptions, callbacks: TerminalProcessCallbacks) {
    const cwd = resolveCwd(opts.cwd)
    const shellProfileId = opts.shellProfileId ?? defaultShellProfileId()
    const shell = resolveShellForProfile(shellProfileId)
    const shellArgs = resolveShellArgs(shellProfileId)
    const cols = Math.max(2, opts.cols ?? 80)
    const rows = Math.max(1, opts.rows ?? 24)

    this.id = id
    const isUtilityHost = Boolean(process.parentPort)
    this.pty = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cwd,
      cols,
      rows,
      env: buildTerminalEnv(),
      // ConPTY + utility process on Windows can fail AttachConsole; winpty is stable here.
      ...(process.platform === 'win32' && isUtilityHost ? { useConpty: false } : {}),
    })

    this.pty.onData(data => callbacks.onData(data))
    this.pty.onExit(({ exitCode, signal }) => callbacks.onExit(exitCode, signal ?? undefined))
  }

  write(data: string): void {
    this.pty.write(data)
  }

  resize(cols: number, rows: number): void {
    this.pty.resize(Math.max(2, cols), Math.max(1, rows))
  }

  kill(): void {
    try {
      this.pty.kill()
    } catch {
      // best-effort
    }
  }
}
