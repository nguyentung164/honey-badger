/** VS Code-style OSC 633 shell integration (subset). */

export type ShellIntegrationEvent =
  | { type: 'cwd'; path: string }
  | { type: 'commandStart' }
  | { type: 'commandEnd'; exitCode?: number }

export type TerminalShellIntegrationState = {
  cwd?: string
  commandRunning: boolean
  lastExitCode?: number
}

export const INITIAL_SHELL_INTEGRATION_STATE: TerminalShellIntegrationState = {
  commandRunning: false,
}

const OSC633 = /\x1b\]633;([^\x07\x1b]*)(?:\x07|\x1b\\)/g

function parseOsc633Payload(payload: string): ShellIntegrationEvent | null {
  const trimmed = payload.trim()
  if (trimmed === 'A') return { type: 'commandStart' }
  if (trimmed === 'B') return { type: 'commandEnd' }
  if (trimmed.startsWith('C')) {
    const match = trimmed.match(/(?:;ExitCode=(\d+))?/)
    const exitCode = match?.[1] ? Number(match[1]) : undefined
    return { type: 'commandEnd', exitCode }
  }
  if (trimmed.startsWith('D')) {
    const match = trimmed.match(/D;(\d+)/)
    return { type: 'commandEnd', exitCode: match?.[1] ? Number(match[1]) : undefined }
  }
  if (trimmed.startsWith('P;')) {
    const cwdMatch = trimmed.match(/Cwd=([^;]+)/i)
    if (cwdMatch?.[1]) return { type: 'cwd', path: cwdMatch[1] }
  }
  return null
}

export function stripShellIntegrationSequences(data: string): {
  output: string
  events: ShellIntegrationEvent[]
} {
  const events: ShellIntegrationEvent[] = []
  const output = data.replace(OSC633, (_match, payload: string) => {
    const event = parseOsc633Payload(payload)
    if (event) events.push(event)
    return ''
  })
  return { output, events }
}

export function reduceShellIntegrationState(
  state: TerminalShellIntegrationState,
  event: ShellIntegrationEvent
): TerminalShellIntegrationState {
  switch (event.type) {
    case 'cwd':
      return { ...state, cwd: event.path }
    case 'commandStart':
      return { ...state, commandRunning: true }
    case 'commandEnd':
      return {
        ...state,
        commandRunning: false,
        lastExitCode: event.exitCode ?? state.lastExitCode,
      }
    default:
      return state
  }
}
