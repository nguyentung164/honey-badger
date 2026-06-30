export type FilesChangedSource = 'staging' | 'watcher'

/** Optional payload for IPC.FILES_CHANGED — scopes refresh to one repo in multi-repo mode. */
export interface FilesChangedPayload {
  /** Repo root after a stage/unstage action. */
  cwd?: string
  /** File path that changed (file watcher). */
  changedPath?: string
  source?: FilesChangedSource
}

export function normalizeRepoRoot(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** Longest matching repo root for a file path or repo cwd. */
export function resolveRepoRootForPath(repoRoots: string[], fileOrRepoPath: string): string | undefined {
  const normalized = normalizeRepoRoot(fileOrRepoPath)
  let best: string | undefined
  let bestLen = -1
  for (const root of repoRoots) {
    const nr = normalizeRepoRoot(root)
    if (normalized === nr || normalized.startsWith(`${nr}/`)) {
      if (nr.length > bestLen) {
        best = root
        bestLen = nr.length
      }
    }
  }
  return best
}

export function filesChangedTargetsRepo(
  payload: FilesChangedPayload | undefined,
  repoCwd: string
): boolean {
  if (!payload) return true
  const root = normalizeRepoRoot(repoCwd)
  if (payload.cwd) {
    return normalizeRepoRoot(payload.cwd) === root
  }
  if (payload.changedPath) {
    const cp = normalizeRepoRoot(payload.changedPath)
    return cp === root || cp.startsWith(`${root}/`)
  }
  return true
}
