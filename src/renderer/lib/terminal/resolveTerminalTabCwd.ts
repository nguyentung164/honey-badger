import type { TerminalPrefs } from '@/lib/terminal/terminalPrefs'

export async function resolveTerminalTabCwd(
  prefs: Pick<TerminalPrefs, 'cwdMode' | 'cwdCustom'>,
  repoCwd?: string
): Promise<string | undefined> {
  if (prefs.cwdMode === 'home') {
    try {
      return await window.api.terminal.getUserHome()
    } catch {
      return undefined
    }
  }
  if (prefs.cwdMode === 'custom') {
    const trimmed = prefs.cwdCustom.trim()
    return trimmed || repoCwd
  }
  return repoCwd
}
