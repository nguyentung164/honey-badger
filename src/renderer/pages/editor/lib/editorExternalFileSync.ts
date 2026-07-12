import { joinRepoPath } from 'shared/fileUri'
import { getModelText } from '@/pages/editor/lib/editorModelRegistry'
import { getModelBaseline, getModelDiskMtimeMs } from '@/pages/editor/lib/editorTextModels'

export function normalizeEditorRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
}

/** Case-insensitive path match (Windows). */
export function editorPathsEqual(a: string, b: string): boolean {
  const na = normalizeEditorRelativePath(a)
  const nb = normalizeEditorRelativePath(b)
  if (na === nb) return true
  return na.toLowerCase() === nb.toLowerCase()
}

const WATCH_IGNORE = /(?:^|\/)(?:node_modules|\.git|\.svn|\.vite|dist|build|out|\.cursor|\.gitnexus)(?:\/|$)/i

export function shouldIgnoreWorkspaceWatchEvent(relativePath: string): boolean {
  return WATCH_IGNORE.test(normalizeEditorRelativePath(relativePath))
}

/** Open tab resource identity — VS Code matches watcher events by URI (folder + path), not by name. */
export type OpenTabResource = { tabId: string; repoRoot: string; relativePath: string }

/**
 * Multi-root correct resolution: match a watcher's absolute path against each open tab's own
 * `repoRoot`, instead of joining every tab's relative path against a single focused repo cwd.
 */
export function resolveOpenTabForAbsolutePath(absolutePath: string, openTabs: readonly OpenTabResource[]): OpenTabResource | null {
  const normalizedChanged = absolutePath.replace(/\\/g, '/').toLowerCase()
  for (const tab of openTabs) {
    if (!tab.repoRoot) continue
    const abs = joinRepoPath(tab.repoRoot, tab.relativePath).replace(/\\/g, '/').toLowerCase()
    if (abs === normalizedChanged) return tab
  }
  return null
}

export async function readNormalizedDiskText(relativePath: string, repoCwd: string): Promise<string | null> {
  try {
    const content = await window.api.system.read_file(relativePath, { cwd: repoCwd })
    return content.replace(/\r\n/g, '\n')
  } catch {
    return null
  }
}

export function editorBufferMatchesDisk(repoCwd: string, relativePath: string, diskText: string): boolean {
  const live = getModelText(repoCwd, relativePath) ?? getModelBaseline(repoCwd, relativePath)
  return live.replace(/\r\n/g, '\n') === diskText
}

export type DiskContentCheck = {
  changed: boolean
  diskText: string | null
}

/**
 * VS Code: compare in-memory model to disk bytes (mtime alone is unreliable on Windows).
 * Returns disk text when read so callers can sync without a second read_file.
 */
export async function checkDiskContentAgainstBuffer(repoCwd: string, relativePath: string): Promise<DiskContentCheck> {
  const normalized = normalizeEditorRelativePath(relativePath)
  const storedMtime = getModelDiskMtimeMs(repoCwd, normalized)
  if (storedMtime != null) {
    try {
      const meta = await window.api.system.detect_file_kind(normalized, { cwd: repoCwd })
      if (meta.mtimeMs != null && meta.mtimeMs <= storedMtime) {
        return { changed: false, diskText: null }
      }
    } catch {
      /* fall through to content compare */
    }
  }

  const diskText = await readNormalizedDiskText(normalized, repoCwd)
  if (diskText == null) return { changed: false, diskText: null }
  return {
    changed: !editorBufferMatchesDisk(repoCwd, normalized, diskText),
    diskText,
  }
}
