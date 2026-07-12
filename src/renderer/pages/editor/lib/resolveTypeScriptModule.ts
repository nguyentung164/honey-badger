import { fileUriToPath, normalizeAbsolutePath } from 'shared/fileUri'

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
}

export function relativePathFromDocumentUri(uri: string, repoCwd: string): string | null {
  if (!uri.startsWith('file:') || !repoCwd) return null
  try {
    const abs = normalizeAbsolutePath(fileUriToPath(uri))
    const root = normalizeAbsolutePath(repoCwd)
    const absLower = abs.toLowerCase()
    const rootLower = root.toLowerCase()
    if (!absLower.startsWith(rootLower)) return null
    const rel = abs.slice(root.length).replace(/^[/\\]+/, '')
    return normalizeRelativePath(rel)
  } catch {
    return null
  }
}

/** Map a file URI to repoRoot + relativePath for opening (in-repo or external). */
export function resolveFileUriForOpen(
  uri: string,
  preferredRepoCwd: string
): { repoRoot: string; relativePath: string } | null {
  if (!uri.startsWith('file:')) return null
  const inRepo = relativePathFromDocumentUri(uri, preferredRepoCwd)
  if (inRepo) return { repoRoot: preferredRepoCwd, relativePath: inRepo }

  const abs = normalizeAbsolutePath(fileUriToPath(uri))
  const slash = abs.lastIndexOf('/')
  if (slash <= 0) return null
  return {
    repoRoot: abs.slice(0, slash),
    relativePath: abs.slice(slash + 1),
  }
}
