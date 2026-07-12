/** VS Code OSC 633 shell integration — https://code.visualstudio.com/docs/terminal/shell-integration */

import type { Terminal } from '@xterm/xterm'
import type { TerminalShellProfileId } from 'shared/terminal/shells'

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

const ENTER_SUBMIT = /^[\r\n]+$/

/** CMD default `E:\path>` prompt line (no typed command). */
const CMD_PROMPT_LINE = /^[A-Za-z]:[^>\r\n]*>\s*$/

/** PowerShell default `PS E:\path>` prompt line. */
const PS_PROMPT_LINE = /^PS (?:[A-Za-z]:[^\r\n]*|[^\r\n]+)>\s*$/

export function stripTerminalAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
}

export function isShellPromptLine(text: string, shellProfileId: TerminalShellProfileId): boolean {
  const line = stripTerminalAnsi(text).trimEnd()
  if (shellProfileId === 'cmd') {
    return CMD_PROMPT_LINE.test(line) || /^>\s*$/.test(line)
  }
  return PS_PROMPT_LINE.test(line) || CMD_PROMPT_LINE.test(line)
}

/**
 * VS Code reads the xterm buffer (not raw PTY chunks) to know the shell is back at a prompt.
 * @see CommandDetectionCapability + PromptInputModel
 */
export function isCursorOnShellPrompt(term: Terminal, shellProfileId: TerminalShellProfileId): boolean {
  const buffer = term.buffer.active
  const line = buffer.getLine(buffer.baseY + buffer.cursorY)
  if (!line) return false

  const text = line.translateToString(true).trimEnd()
  if (!isShellPromptLine(text, shellProfileId)) return false

  const plain = stripTerminalAnsi(text)
  return buffer.cursorX >= Math.max(0, plain.trimEnd().length - 1)
}

export function shellIntegrationBufferEvents(
  term: Terminal,
  shellProfileId: TerminalShellProfileId,
  commandRunning: boolean
): ShellIntegrationEvent[] {
  if (!commandRunning) return []
  if (isCursorOnShellPrompt(term, shellProfileId)) {
    return [{ type: 'commandFinished', exitCode: undefined }]
  }
  return []
}

/**
 * Ctrl+C while running, and Enter-at-prompt when OSC 633;C is not forwarded (Windows winpty).
 * VS Code uses PartialCommandDetection + WindowsPtyHeuristics for the same gap.
 */
export function shellIntegrationInputEvents(
  data: string,
  commandRunning: boolean
): ShellIntegrationEvent[] {
  if (commandRunning && data.includes(INTERRUPT_CHAR)) {
    return [{ type: 'commandFinished', exitCode: SHELL_INTEGRATION_SIGINT_EXIT_CODE }]
  }
  if (!commandRunning && ENTER_SUBMIT.test(data)) {
    return [{ type: 'commandExecuted' }]
  }
  return []
}

/**
 * Parse OSC 633/133 payload passed to xterm `registerOscHandler`.
 * Mirrors VS Code `ShellIntegrationAddon._doHandleVSCodeSequence`.
 */
export function parseOsc633HandlerData(data: string): ShellIntegrationEvent[] {
  const argsIndex = data.indexOf(';')
  const command = argsIndex === -1 ? data : data.slice(0, argsIndex)
  const args = argsIndex === -1 ? [] : data.slice(argsIndex + 1).split(';')

  switch (command) {
    case 'A':
      return [{ type: 'promptStart' }]
    case 'B':
      return [{ type: 'commandInputStart' }]
    case 'C':
      return [{ type: 'commandExecuted' }]
    case 'D': {
      const exitCode = args[0] !== undefined && args[0] !== '' ? Number.parseInt(args[0], 10) : undefined
      return [{ type: 'commandFinished', exitCode: Number.isNaN(exitCode) ? undefined : exitCode }]
    }
    case 'P': {
      const cwdMatch = data.match(/Cwd=([^;]+)/i)
      return cwdMatch?.[1] ? [{ type: 'cwd', path: cwdMatch[1] }] : []
    }
    default:
      return []
  }
}

const OSC633_PREFIX = '\x1b]633;'
const OSC633 = /\x1b\]633;([^\x07\x1b]*)(?:\x07|\x1b\\)/g

function parseOsc633Payload(payload: string): ShellIntegrationEvent | null {
  const events = parseOsc633HandlerData(payload)
  return events[0] ?? null
}

/** Parses OSC 633 across PTY chunks that may split escape sequences (legacy / tests). */
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
