/** Cross-platform file URI helpers (renderer + main). Mirrors Node `pathToFileURL` shape. */

export function normalizeAbsolutePath(absPath: string): string {
  return absPath.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function pathToFileUri(absPath: string): string {
  const normalized = normalizeAbsolutePath(absPath)
  if (/^[A-Za-z]:\//.test(normalized)) return `file:///${normalized}`
  if (normalized.startsWith('/')) return `file://${normalized}`
  return `file:///${normalized}`
}

export function fileUriToPath(rootUri: string): string {
  try {
    const url = new URL(rootUri)
    let p = decodeURIComponent(url.pathname)
    if (/^\/[A-Za-z]:/.test(p)) {
      p = p.slice(1)
      return p.replace(/\//g, '\\')
    }
    return p
  } catch {
    return rootUri
  }
}

export function workspaceRootUri(absPath: string): string {
  return pathToFileUri(absPath)
}

export function uriRootsMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  try {
    return normalizeAbsolutePath(fileUriToPath(a)).toLowerCase() === normalizeAbsolutePath(fileUriToPath(b)).toLowerCase()
  } catch {
    return a === b
  }
}

export function joinRepoPath(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[/\\]+$/, '')}${sep}${rel.replace(/^[/\\]+/, '').replace(/\//g, sep)}`
}

export function documentUriForPath(repoCwd: string, relativePath: string): string {
  return pathToFileUri(joinRepoPath(repoCwd, relativePath))
}

export const LSP_LARGE_FILE_BYTES = 350_000
export const LSP_LARGE_FILE_LINES = 6000
/** Prompt before loading files larger than this into the editor buffer. */
export const EDITOR_OPEN_FILE_MAX_BYTES = 2_000_000

export function countNewlines(text: string): number {
  let count = 1
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++
  }
  return count
}

export function isLargeFileByMetrics(byteLength: number, lineCount: number): boolean {
  return byteLength > LSP_LARGE_FILE_BYTES || lineCount > LSP_LARGE_FILE_LINES
}

export function isLargeFileForLsp(content: string): boolean {
  return isLargeFileByMetrics(content.length, countNewlines(content))
}
