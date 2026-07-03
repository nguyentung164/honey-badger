import type { EditorTab } from '@/pages/editor/lib/editorWorkspaceTypes'
import { createBackgroundFlusher, scheduleBackgroundWork } from '@/pages/editor/lib/scheduleBackgroundWork'

export const EDITOR_OPEN_TABS_KEY_PREFIX = 'editor-open-tabs:'
export const EDITOR_SESSION_KEY_PREFIX = 'editor-session:'

type PersistedSession = { paths: string[]; activePath: string | null }

export function readPersistedSession(cwd: string): PersistedSession {
  try {
    const raw = localStorage.getItem(`${EDITOR_SESSION_KEY_PREFIX}${cwd}`)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedSession>
      if (Array.isArray(parsed.paths)) {
        return {
          paths: parsed.paths.filter((p): p is string => typeof p === 'string'),
          activePath: typeof parsed.activePath === 'string' ? parsed.activePath : parsed.paths[0] ?? null,
        }
      }
    }
  } catch {
    /* ignore */
  }
  const paths = readLegacyTabPaths(cwd)
  return { paths, activePath: paths[0] ?? null }
}

function readLegacyTabPaths(cwd: string): string[] {
  try {
    const raw = localStorage.getItem(`${EDITOR_OPEN_TABS_KEY_PREFIX}${cwd}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

function pathsToPersist(tabs: EditorTab[]): string[] {
  return tabs
    .filter(t => t.kind !== 'compare' && (t.isPinned || t.isDirty || !t.isPreview))
    .map(t => t.relativePath)
}

function writePersistedSessionSync(cwd: string, tabs: EditorTab[], activePath: string | null) {
  const paths = pathsToPersist(tabs)
  try {
    localStorage.setItem(`${EDITOR_SESSION_KEY_PREFIX}${cwd}`, JSON.stringify({ paths, activePath }))
    localStorage.setItem(`${EDITOR_OPEN_TABS_KEY_PREFIX}${cwd}`, JSON.stringify(paths))
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
  sessionFlusher.push({ cwd, tabs, activePath })
}

/** Flush immediately on app close / critical paths (optional). */
export function flushPersistedSession(cwd: string, tabs: EditorTab[], activePath: string | null) {
  writePersistedSessionSync(cwd, tabs, activePath)
}
