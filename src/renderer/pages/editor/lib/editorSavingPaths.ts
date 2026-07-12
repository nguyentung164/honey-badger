import { normalizeEditorRepoKey } from '@/pages/editor/lib/editorSessionPersist'

/** In-flight save paths — suppress false-positive external-change dialogs during self-write. */
const savingPaths = new Set<string>()

type UnmarkListener = (repoRoot: string, relativePath: string) => void
const unmarkListeners = new Set<UnmarkListener>()

function normalizeSavingPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  return normalized.toLowerCase()
}

export function savingPathKey(repoRoot: string, relativePath: string): string {
  return `${normalizeEditorRepoKey(repoRoot)}::${normalizeSavingPath(relativePath)}`
}

export { normalizeSavingPath }

export function subscribeSavingPathUnmark(listener: UnmarkListener): () => void {
  unmarkListeners.add(listener)
  return () => {
    unmarkListeners.delete(listener)
  }
}

export function markPathSaving(repoRoot: string, relativePath: string): void {
  savingPaths.add(savingPathKey(repoRoot, relativePath))
}

export function unmarkPathSaving(repoRoot: string, relativePath: string): void {
  const key = savingPathKey(repoRoot, relativePath)
  if (!savingPaths.delete(key)) return
  const normalized = relativePath.replace(/\\/g, '/')
  for (const listener of unmarkListeners) {
    listener(repoRoot, normalized)
  }
}

export function isPathSaving(repoRoot: string, relativePath: string): boolean {
  return savingPaths.has(savingPathKey(repoRoot, relativePath))
}
