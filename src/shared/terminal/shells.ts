export type TerminalShellProfileId = 'powershell' | 'cmd' | 'pwsh'

export const TERMINAL_SHELL_PROFILE_ORDER: TerminalShellProfileId[] = ['powershell', 'cmd', 'pwsh']

export const TERMINAL_SHELL_PROFILE_LABEL_KEYS: Record<TerminalShellProfileId, string> = {
  powershell: 'terminal.shell.powershell',
  cmd: 'terminal.shell.cmd',
  pwsh: 'terminal.shell.pwsh',
}

export const DEFAULT_TERMINAL_SHELL_PROFILE: TerminalShellProfileId = 'powershell'

export type TerminalShellProfileInfo = {
  id: TerminalShellProfileId
  path: string
}
