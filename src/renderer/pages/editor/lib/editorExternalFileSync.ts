import { getModelText } from '@/pages/editor/lib/editorModelRegistry'
import { getModelBaseline, getModelDiskMtimeMs } from '@/pages/editor/lib/editorTextModels'
import { joinRepoPath } from 'shared/fileUri'

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

const WATCH_IGNORE =
  /(?:^|\/)(?:node_modules|\.git|\.svn|\.vite|dist|build|out|\.cursor|\.gitnexus)(?:\/|$)/i

export function shouldIgnoreWorkspaceWatchEvent(relativePath: string): boolean {
  return WATCH_IGNORE.test(normalizeEditorRelativePath(relativePath))
}

/** Map absolute watcher path to repo-relative path for open tabs. */
export function editorRelativePathFromRepoCwd(repoCwd: string, filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/')
  const root = repoCwd.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!root) return null

  const rootLower = root.toLowerCase()
  const pathLower = normalized.toLowerCase()
  if (pathLower.startsWith(`${rootLower}/`)) {
    return normalizeEditorRelativePath(normalized.slice(root.length + 1))
  }

  if (!/^[a-zA-Z]:\//.test(normalized) && !normalized.startsWith('/')) {
    return normalizeEditorRelativePath(normalized)
  }

  return null
}

/** Resolve watcher absolute path to an open tab's repo-relative path. */
export function resolveExternalChangeForOpenTab(
  repoCwd: string,
  filePath: string,
  openRelativePaths: readonly string[]
): string | null {
  const direct = editorRelativePathFromRepoCwd(repoCwd, filePath)
  if (direct && openRelativePaths.some(p => editorPathsEqual(p, direct))) return direct

  const normalizedChanged = filePath.replace(/\\/g, '/').toLowerCase()
  for (const relativePath of openRelativePaths) {
    const abs = joinRepoPath(repoCwd, relativePath).replace(/\\/g, '/').toLowerCase()
    if (abs === normalizedChanged) return normalizeEditorRelativePath(relativePath)
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
export async function checkDiskContentAgainstBuffer(
  repoCwd: string,
  relativePath: string
): Promise<DiskContentCheck> {
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

/**
 * VS Code: compare in-memory model to disk bytes (mtime alone is unreliable on Windows).
 */
export async function hasDiskContentChanged(repoCwd: string, relativePath: string): Promise<boolean> {
  const { changed } = await checkDiskContentAgainstBuffer(repoCwd, relativePath)
  return changed
}
