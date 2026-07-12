import { randomUUID } from 'node:crypto'
import l from 'electron-log'
import type { TerminalShellProfileId } from 'shared/terminal/shells'
import { resolveShellIntegrationPs1Path } from './resolveShellIntegrationScript'

export type ShellIntegrationInjection = {
  enabled: boolean
  ps1ScriptPath?: string
  nonce?: string
}

/**
 * VS Code automatic shell integration injection.
 * @see https://github.com/microsoft/vscode/blob/main/src/vs/platform/terminal/node/terminalEnvironment.ts
 */
export function buildShellIntegrationConfig(options: {
  enabled: boolean
  shellProfileId?: TerminalShellProfileId
}): ShellIntegrationInjection {
  if (!options.enabled) {
    return { enabled: false }
  }

  const profileId = options.shellProfileId ?? 'powershell'
  if (profileId !== 'powershell' && profileId !== 'pwsh') {
    return { enabled: false }
  }

  try {
    const ps1ScriptPath = resolveShellIntegrationPs1Path()
    l.info(`[terminal] Shell integration script: ${ps1ScriptPath}`)
    return {
      enabled: true,
      ps1ScriptPath,
      nonce: randomUUID(),
    }
  } catch (err) {
    l.warn('[terminal] Shell integration disabled — script not found:', err)
    return { enabled: false }
  }
}
