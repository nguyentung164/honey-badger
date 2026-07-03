import type { TerminalShellProfileId } from 'shared/terminal/shells'

const STORAGE_KEY = 'main-terminal-session-v1'

export type PersistedTerminalTab = {
  id: string
  shellProfileId: TerminalShellProfileId
  cwd?: string
}

export type PersistedTerminalSession = {
  tabs: PersistedTerminalTab[]
  activeTabId: string
}

export function readPersistedTerminalSession(): PersistedTerminalSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedTerminalSession
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null
    if (typeof parsed.activeTabId !== 'string') return null
    return {
      tabs: parsed.tabs,
      activeTabId: parsed.activeTabId,
    }
  } catch {
    return null
  }
}

export function writePersistedTerminalSession(session: PersistedTerminalSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // ignore quota errors
  }
}

export function clearPersistedTerminalSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
