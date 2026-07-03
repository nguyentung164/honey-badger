import type { TerminalShellProfileId } from 'shared/terminal/shells'

/** Clear command sent to the PTY so shell cursor stays in sync with xterm. */
export function buildTerminalClearCommand(shellProfileId: TerminalShellProfileId): string {
  if (shellProfileId === 'cmd') return 'cls\r'
  return 'Clear-Host\r'
}
