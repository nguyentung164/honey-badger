import type { EditorTab } from '@/pages/editor/lib/editorWorkspaceTypes'
import { createBackgroundFlusher, scheduleBackgroundWork } from '@/pages/editor/lib/scheduleBackgroundWork'

export const EDITOR_OPEN_TABS_KEY_PREFIX = 'editor-open-tabs:'
export const EDITOR_SESSION_KEY_PREFIX = 'editor-session:'

type PersistedSession = { paths: string[]; activePath: string | null }

/** Normalize repo path for stable localStorage keys across slash styles. */
export function normalizeEditorRepoKey(cwd: string): string {
  return cwd.replace(/[/\\]+$/, '').replace(/\\/g, '/')
}

function sessionKeyForRepo(cwd: string): string {
  return `${EDITOR_SESSION_KEY_PREFIX}${normalizeEditorRepoKey(cwd)}`
}

function legacyOpenTabsKey(cwd: string): string {
  return `${EDITOR_OPEN_TABS_KEY_PREFIX}${cwd}`
}

function readSessionRaw(key: string): PersistedSession | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedSession>
    if (!Array.isArray(parsed.paths)) return null
    return {
      paths: parsed.paths.filter((p): p is string => typeof p === 'string'),
      activePath: typeof parsed.activePath === 'string' ? parsed.activePath : parsed.paths[0] ?? null,
    }
  } catch {
    return null
  }
}

export function readPersistedSession(cwd: string, restoreTabs = true): PersistedSession {
  if (!restoreTabs || !cwd.trim()) {
    return { paths: [], activePath: null }
  }

  const normalized = readSessionRaw(sessionKeyForRepo(cwd))
  if (normalized) return normalized

  const legacySession = readSessionRaw(`${EDITOR_SESSION_KEY_PREFIX}${cwd}`)
  if (legacySession) return legacySession

  const paths = readLegacyTabPaths(cwd)
  return { paths, activePath: paths[0] ?? null }
}

function readLegacyTabPaths(cwd: string): string[] {
  for (const key of [legacyOpenTabsKey(normalizeEditorRepoKey(cwd)), legacyOpenTabsKey(cwd)]) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((p): p is string => typeof p === 'string')
      }
    } catch {
      /* ignore */
    }
  }
  return []
}

/** VS Code–style: persist every open text editor tab (including preview). */
function pathsToPersist(tabs: EditorTab[]): string[] {
  return tabs.filter(t => t.kind === 'text').map(t => t.relativePath)
}

function writePersistedSessionSync(cwd: string, tabs: EditorTab[], activePath: string | null) {
  if (!cwd.trim()) return
  const paths = pathsToPersist(tabs)
  const key = sessionKeyForRepo(cwd)
  try {
    localStorage.setItem(key, JSON.stringify({ paths, activePath }))
    localStorage.setItem(legacyOpenTabsKey(normalizeEditorRepoKey(cwd)), JSON.stringify(paths))
  } catch {
    /* ignore */
  }
}

const sessionFlusher = createBackgroundFlusher<{ cwd: string; tabs: EditorTab[]; activePath: string | null }>(
  payload => {
    scheduleBackgroundWork(() => writePersistedSessionSync(payload.cwd, payload.tabs, payload.activePath), {
      timeout: 3000,
    })
  },
  300
)

/** Non-blocking session persist — batches writes while typing/switching tabs. */
export function schedulePersistedSession(cwd: string, tabs: EditorTab[], activePath: string | null) {
  if (!cwd.trim()) return
  sessionFlusher.push({ cwd, tabs, activePath })
}

/** Flush immediately on app close / critical paths. */
export function flushPersistedSession(cwd: string, tabs: EditorTab[], activePath: string | null) {
  sessionFlusher.cancel()
  writePersistedSessionSync(cwd, tabs, activePath)
}
