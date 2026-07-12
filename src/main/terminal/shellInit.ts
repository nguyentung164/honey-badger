import type { ShellIntegrationInjection } from './shellIntegrationInjection'
import type { TerminalShellProfileId } from 'shared/terminal/shells'

export type ShellLaunchConfig = {
  args: string[]
  envMixin: Record<string, string>
}

/**
 * VS Code-aligned shell args + env for automatic OSC 633 injection.
 * @see https://code.visualstudio.com/docs/terminal/shell-integration
 * @see https://github.com/microsoft/vscode/blob/main/src/vs/platform/terminal/node/terminalEnvironment.ts
 */
export function resolveShellLaunch(
  profileId: TerminalShellProfileId,
  injection?: ShellIntegrationInjection
): ShellLaunchConfig {
  if (!injection?.enabled || !injection.ps1ScriptPath) {
    return { args: [], envMixin: {} }
  }

  if (profileId === 'powershell' || profileId === 'pwsh') {
    // VS Code uses double-quoted dot-source on Windows; keep path as absolute.
    const escaped = injection.ps1ScriptPath.replace(/\\/g, '\\\\').replace(/"/g, '`"')
    return {
      args: ['-NoLogo', '-NoExit', '-Command', `try { . "${escaped}" } catch {}`],
      envMixin: {
        VSCODE_INJECTION: '1',
        VSCODE_NONCE: injection.nonce ?? '',
        VSCODE_STABLE: '1',
      },
    }
  }

  return { args: [], envMixin: {} }
}

/** @deprecated Use resolveShellLaunch */
export function resolveShellArgs(profileId: TerminalShellProfileId): string[] {
  return resolveShellLaunch(profileId).args
}
