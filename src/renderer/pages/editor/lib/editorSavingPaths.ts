/** In-flight save paths — suppress false-positive external-change dialogs during self-write. */
const savingPaths = new Set<string>()

export function normalizeSavingPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  return normalized.toLowerCase()
}

export function markPathSaving(relativePath: string): void {
  savingPaths.add(normalizeSavingPath(relativePath))
}

export function unmarkPathSaving(relativePath: string): void {
  savingPaths.delete(normalizeSavingPath(relativePath))
}

export function isPathSaving(relativePath: string): boolean {
  return savingPaths.has(normalizeSavingPath(relativePath))
}
