/** VS Code OSC 633 shell integration — https://code.visualstudio.com/docs/terminal/shell-integration */

export type ShellIntegrationEvent =
  | { type: 'cwd'; path: string }
  | { type: 'promptStart' }
  | { type: 'commandInputStart' }
  | { type: 'commandExecuted' }
  | { type: 'commandFinished'; exitCode?: number }

export type TerminalShellIntegrationState = {
  cwd?: string
  commandRunning: boolean
  lastExitCode?: number
}

export const INITIAL_SHELL_INTEGRATION_STATE: TerminalShellIntegrationState = {
  commandRunning: false,
}

/** Exit code convention for SIGINT (Ctrl+C). */
export const SHELL_INTEGRATION_SIGINT_EXIT_CODE = 130

const INTERRUPT_CHAR = '\x03'

/**
 * Fallback when the shell does not emit OSC 633;D after Ctrl+C.
 * Do not infer command start from Enter — only the shell's 633;C means execution.
 */
export function shellIntegrationInputEvents(
  data: string,
  commandRunning: boolean
): ShellIntegrationEvent[] {
  if (commandRunning && data.includes(INTERRUPT_CHAR)) {
    return [{ type: 'commandFinished', exitCode: SHELL_INTEGRATION_SIGINT_EXIT_CODE }]
  }
  return []
}

const OSC633_PREFIX = '\x1b]633;'
const OSC633 = /\x1b\]633;([^\x07\x1b]*)(?:\x07|\x1b\\)/g

function parseOsc633Payload(payload: string): ShellIntegrationEvent | null {
  const trimmed = payload.trim()
  // A: prompt start (idle)
  if (trimmed === 'A') return { type: 'promptStart' }
  // B: command input area
  if (trimmed === 'B') return { type: 'commandInputStart' }
  // C: pre-execution — command is running
  if (trimmed === 'C') return { type: 'commandExecuted' }
  // D[;exitCode]: command finished
  if (trimmed.startsWith('D')) {
    const match = trimmed.match(/^D(?:;(\d+))?/)
    return { type: 'commandFinished', exitCode: match?.[1] ? Number(match[1]) : undefined }
  }
  if (trimmed.startsWith('P;')) {
    const cwdMatch = trimmed.match(/Cwd=([^;]+)/i)
    if (cwdMatch?.[1]) return { type: 'cwd', path: cwdMatch[1] }
  }
  return null
}

/** Parses OSC 633 across PTY chunks that may split escape sequences. */
export class ShellIntegrationStreamParser {
  private carry = ''

  feed(data: string): { output: string; events: ShellIntegrationEvent[] } {
    const input = this.carry + data
    this.carry = ''

    const events: ShellIntegrationEvent[] = []
    let output = ''
    let i = 0

    while (i < input.length) {
      const start = input.indexOf(OSC633_PREFIX, i)
      if (start === -1) {
        output += input.slice(i)
        break
      }

      output += input.slice(i, start)

      const payloadStart = start + OSC633_PREFIX.length
      const bellEnd = input.indexOf('\x07', payloadStart)
      const stEnd = input.indexOf('\x1b\\', payloadStart)

      let end = -1
      let terminatorLen = 0
      if (bellEnd !== -1 && (stEnd === -1 || bellEnd < stEnd)) {
        end = bellEnd
        terminatorLen = 1
      } else if (stEnd !== -1) {
        end = stEnd
        terminatorLen = 2
      }

      if (end === -1) {
        this.carry = input.slice(start)
        break
      }

      const payload = input.slice(payloadStart, end)
      const event = parseOsc633Payload(payload)
      if (event) events.push(event)
      i = end + terminatorLen
    }

    return { output, events }
  }

  reset(): void {
    this.carry = ''
  }
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
    case 'promptStart':
    case 'commandInputStart':
    case 'commandFinished':
      return {
        ...state,
        commandRunning: false,
        lastExitCode:
          event.type === 'commandFinished' ? (event.exitCode ?? state.lastExitCode) : state.lastExitCode,
      }
    case 'commandExecuted':
      return { ...state, commandRunning: true }
    default:
      return state
  }
}
