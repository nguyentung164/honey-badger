export type DiffViewerFileEntry = {
  filePath: string
  fileStatus?: string
  stagingState?: 'staged' | 'unstaged'
}

/** How the diff viewer was opened — drives refresh strategy and toolbar capabilities. */
export type DiffViewerMode =
  | 'git-staging'
  | 'git-history'
  | 'git-working'
  | 'svn-revision'
  | 'svn-working'

export type DiffViewerLoadPayload = {
  mode?: DiffViewerMode
  filePath: string
  fileStatus?: string
  revision?: string
  currentRevision?: string
  isGit?: boolean
  commitHash?: string
  currentCommitHash?: string
  isRootCommit?: boolean
  cwd?: string
  /** SVN `changed_files` target path (repo root or subfolder). */
  svnTargetPath?: string
  files?: DiffViewerFileEntry[]
  currentFileIndex?: number
  /** @deprecated Prefer `mode === 'git-staging'` */
  enableStageActions?: boolean
}

export function deriveDiffViewerMode(payload: Partial<DiffViewerLoadPayload>): DiffViewerMode {
  if (payload.mode) return payload.mode
  if (payload.enableStageActions) return 'git-staging'

  if (payload.isGit) {
    if (payload.commitHash && (payload.currentCommitHash !== undefined || payload.isRootCommit)) {
      return 'git-history'
    }
    return 'git-working'
  }

  if (payload.revision) return 'svn-revision'
  return 'svn-working'
}

export function enrichDiffViewerPayload(payload: DiffViewerLoadPayload): DiffViewerLoadPayload {
  const mode = deriveDiffViewerMode(payload)
  return {
    ...payload,
    mode,
    isGit: payload.isGit ?? mode.startsWith('git-'),
    enableStageActions: mode === 'git-staging',
  }
}

export function diffViewerSupportsStageActions(mode: DiffViewerMode): boolean {
  return mode === 'git-staging'
}

export function diffViewerSupportsFileListRefresh(mode: DiffViewerMode): boolean {
  return mode === 'git-staging' || mode === 'git-history' || mode === 'svn-working' || mode === 'svn-revision'
}

export type DiffViewerFileKind = 'text' | 'image' | 'binary'

/** Snapshot of VCS context for image loading — passed explicitly to avoid stale React state. */
export type ImageLoadContext = {
  isGit: boolean
  isRootCommit?: boolean
  commitHash?: string
  currentCommitHash?: string
  revision?: string
  currentRevision?: string
}

export function imageLoadContextFromPayload(payload: DiffViewerLoadPayload): ImageLoadContext {
  return {
    isGit: payload.isGit === true,
    isRootCommit: payload.isRootCommit,
    commitHash: payload.commitHash,
    currentCommitHash: payload.currentCommitHash,
    revision: payload.revision,
    currentRevision: payload.currentRevision,
  }
}
