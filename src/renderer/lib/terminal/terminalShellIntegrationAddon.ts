import type { ITerminalAddon, Terminal } from '@xterm/xterm'
import {
  parseOsc633HandlerData,
  reduceShellIntegrationState,
  type ShellIntegrationEvent,
  type TerminalShellIntegrationState,
  INITIAL_SHELL_INTEGRATION_STATE,
} from '@/lib/terminal/terminalShellIntegration'

/**
 * VS Code-aligned OSC 633/133 handling via xterm parser hooks.
 * @see https://github.com/microsoft/vscode/blob/main/src/vs/platform/terminal/common/xterm/shellIntegrationAddon.ts
 * @see https://xtermjs.org/docs/guides/hooks/
 */
export class TerminalShellIntegrationAddon implements ITerminalAddon {
  private disposables: Array<{ dispose: () => void }> = []
  private state: TerminalShellIntegrationState = INITIAL_SHELL_INTEGRATION_STATE

  constructor(private readonly onStateChange: (state: TerminalShellIntegrationState) => void) {}

  getState(): TerminalShellIntegrationState {
    return this.state
  }

  activate(terminal: Terminal): void {
    const handler = (data: string) => {
      for (const event of parseOsc633HandlerData(data)) {
        this.applyEvent(event)
      }
      return true
    }
    this.disposables.push(terminal.parser.registerOscHandler(633, handler))
    this.disposables.push(terminal.parser.registerOscHandler(133, handler))
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose()
    }
    this.disposables = []
    this.state = INITIAL_SHELL_INTEGRATION_STATE
  }

  reset(): void {
    this.state = INITIAL_SHELL_INTEGRATION_STATE
    this.onStateChange(this.state)
  }

  applyInputEvent(event: ShellIntegrationEvent): void {
    this.applyEvent(event)
  }

  private applyEvent(event: ShellIntegrationEvent): void {
    this.state = reduceShellIntegrationState(this.state, event)
    this.onStateChange(this.state)
  }
}
