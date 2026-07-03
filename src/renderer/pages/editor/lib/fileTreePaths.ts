/** Normalized repo-relative path (forward slashes, no leading slash). */
export function normalizeRepoRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
}

/** Directory paths to expand so `relativePath` is visible (`''` = workspace root). */
export function directoryAncestorPaths(relativePath: string): string[] {
  const normalized = normalizeRepoRelativePath(relativePath)
  if (!normalized) return ['']

  const segments = normalized.split('/')
  const ancestors: string[] = ['']
  for (let i = 0; i < segments.length - 1; i++) {
    ancestors.push(segments.slice(0, i + 1).join('/'))
  }
  return ancestors
}

/** Parent directory for a repo-relative file path (`''` = workspace root). */
export function parentDirectoryPath(relativePath: string): string {
  const normalized = normalizeRepoRelativePath(relativePath)
  const slash = normalized.lastIndexOf('/')
  return slash < 0 ? '' : normalized.slice(0, slash)
}
