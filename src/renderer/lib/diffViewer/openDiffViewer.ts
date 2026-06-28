import toast from '@/components/ui-elements/Toast'
import i18n from '@/lib/i18n'
import {
  buildDiffViewerFilesFromLogFiles,
  resolveOpenFileIndex,
} from '@/pages/diffviewer/diffViewerRefresh'
import {
  buildGitConflictDiffPayload,
  buildGitConflictFileEntries,
  buildEmbeddedGitConflictPayloadSyncKey as buildEmbeddedGitConflictPayloadSyncKeyFromModule,
  fetchGitConflictSession,
  isGitConflictedFileStatus,
} from '@/pages/diffviewer/diffViewerConflictPayload'
import { normalizeGitPath } from '@/pages/diffviewer/diffViewerGitFiles'
import type { DiffViewerFileEntry, DiffViewerLoadPayload, DiffViewerMode } from '@/pages/diffviewer/diffViewerPayload'

export type GitStagingTableFile = {
  filePath: string
  status: string
}

export function buildGitStagingFileEntries(
  changesFiles: GitStagingTableFile[],
  stagedFiles: GitStagingTableFile[]
): DiffViewerFileEntry[] {
  return [
    ...changesFiles.map(f => ({
      filePath: f.filePath,
      fileStatus: f.status,
      stagingState: 'unstaged' as const,
    })),
    ...stagedFiles.map(f => ({
      filePath: f.filePath,
      fileStatus: f.status,
      stagingState: 'staged' as const,
    })),
  ].map(f => ({ ...f, filePath: normalizeGitPath(f.filePath) }))
}

export function buildGitStagingDiffPayload(opts: {
  filePath: string
  fileStatus: string
  cwd?: string
  changesFiles: GitStagingTableFile[]
  stagedFiles: GitStagingTableFile[]
  stagingState?: 'staged' | 'unstaged'
}): DiffViewerLoadPayload {
  const files = buildGitStagingFileEntries(opts.changesFiles, opts.stagedFiles)
  const normalizedPath = normalizeGitPath(opts.filePath)
  const preferredStagingState = opts.stagingState
  const matchIndex = files.findIndex(
    f => f.filePath === normalizedPath && (!preferredStagingState || f.stagingState === preferredStagingState)
  )
  const fallbackIndex = files.findIndex(f => f.filePath === normalizedPath)
  const currentFileIndex = matchIndex >= 0 ? matchIndex : fallbackIndex >= 0 ? fallbackIndex : 0
  const active = files[currentFileIndex]

  return {
    mode: 'git-staging',
    isGit: true,
    enableStageActions: true,
    filePath: active?.filePath ?? normalizedPath,
    fileStatus: active?.fileStatus ?? opts.fileStatus,
    stagingState: active?.stagingState ?? preferredStagingState ?? 'unstaged',
    cwd: opts.cwd,
    files,
    currentFileIndex: files.length > 0 ? currentFileIndex : 0,
  }
}

export function gitStagingLayoutStorageKey(repoRootKey: string): string {
  return `git-dual-table-layout:${repoRootKey}`
}

export function readGitStagingLayoutDirection(repoRootKey: string): 'horizontal' | 'vertical' {
  try {
    const legacy = localStorage.getItem('git-dual-table-layout')
    const saved = localStorage.getItem(gitStagingLayoutStorageKey(repoRootKey)) ?? legacy
    return saved === 'vertical' ? 'vertical' : 'horizontal'
  } catch {
    return 'horizontal'
  }
}
export function buildEmbeddedGitStagingPayloadSyncKey(payload: DiffViewerLoadPayload | null | undefined): string {
  if (!payload) return ''
  const files =
    payload.files?.map(f => `${f.stagingState ?? ''}:${f.filePath}:${f.fileStatus ?? ''}`).join('|') ?? ''
  return `${payload.filePath}\0${payload.stagingState ?? ''}\0${payload.cwd ?? ''}\0${files}`
}

type GitOpenOptions = {
  fileStatus: string
  mode?: DiffViewerLoadPayload['mode']
  commitHash?: string
  currentCommitHash?: string
  isRootCommit?: boolean
  cwd?: string
  conflictType?: DiffViewerLoadPayload['conflictType']
  files?: DiffViewerFileEntry[]
  currentFileIndex?: number
  enableStageActions?: boolean
}

type SvnOpenOptions = {
  fileStatus: string
  mode?: DiffViewerLoadPayload['mode']
  revision?: string
  currentRevision?: string
  cwd?: string
  svnTargetPath?: string
  files?: DiffViewerFileEntry[]
  currentFileIndex?: number
}

function normalizeEntryList(files?: DiffViewerFileEntry[]): DiffViewerFileEntry[] {
  return (files ?? []).map(f => ({
    ...f,
    filePath: normalizeGitPath(f.filePath),
  }))
}

function sendGitDiff(filePath: string, options: GitOpenOptions) {
  const files = normalizeEntryList(options.files)
  const normalizedPath = normalizeGitPath(filePath)
  window.api.git.open_diff(normalizedPath, {
    fileStatus: options.fileStatus,
    mode: options.mode,
    commitHash: options.commitHash,
    currentCommitHash: options.currentCommitHash,
    isRootCommit: options.isRootCommit,
    cwd: options.cwd,
    conflictType: options.conflictType,
    files: files.length > 0 ? files : undefined,
    currentFileIndex:
      files.length > 0 ? resolveOpenFileIndex(files, normalizedPath, options.currentFileIndex) : options.currentFileIndex,
    enableStageActions: options.enableStageActions ?? options.mode === 'git-staging',
  })
}

function sendSvnDiff(filePath: string, options: SvnOpenOptions) {
  const files = normalizeEntryList(options.files)
  const normalizedPath = normalizeGitPath(filePath)
  window.api.svn.open_diff(normalizedPath, {
    fileStatus: options.fileStatus,
    mode: options.mode,
    revision: options.revision,
    currentRevision: options.currentRevision,
    cwd: options.cwd,
    svnTargetPath: options.svnTargetPath,
    files: files.length > 0 ? files : undefined,
    currentFileIndex:
      files.length > 0 ? resolveOpenFileIndex(files, normalizedPath, options.currentFileIndex) : options.currentFileIndex,
  })
}

/** Resolve open mode from file status — conflicted files use git-conflict, others stay git-staging. */
export function resolveGitDiffOpenMode(fileStatus: string): DiffViewerMode {
  return isGitConflictedFileStatus(fileStatus) ? 'git-conflict' : 'git-staging'
}

export function buildEmbeddedGitConflictPayloadSyncKey(payload: DiffViewerLoadPayload | null | undefined): string {
  return buildEmbeddedGitConflictPayloadSyncKeyFromModule(payload)
}

/** Git merge/rebase/cherry-pick conflict resolution in diff viewer. */
export async function openGitConflictDiffFromStatus(cwd?: string) {
  const session = await fetchGitConflictSession(cwd)
  if (!session.hasConflict || session.files.length === 0) {
    toast.info(i18n.t('conflictResolver.noConflicts'))
    return
  }
  openGitConflictDiff({
    filePath: session.files[0].filePath,
    cwd,
    conflictType: session.conflictType,
    files: session.files,
    currentFileIndex: 0,
  })
}

export function openGitConflictDiff(opts: {
  filePath: string
  cwd?: string
  conflictType?: DiffViewerLoadPayload['conflictType']
  files?: DiffViewerFileEntry[]
  currentFileIndex?: number
}) {
  const files = opts.files ?? buildGitConflictFileEntries([opts.filePath])
  const payload = buildGitConflictDiffPayload({
    filePath: opts.filePath,
    cwd: opts.cwd,
    conflictType: opts.conflictType,
    files,
    currentFileIndex: opts.currentFileIndex,
  })
  sendGitDiff(payload.filePath, {
    fileStatus: 'conflicted',
    mode: 'git-conflict',
    cwd: opts.cwd,
    conflictType: opts.conflictType,
    files: payload.files,
    currentFileIndex: payload.currentFileIndex,
    enableStageActions: false,
  })
}

/** Build payload for embedded git conflict viewer (MainPage vertical layout). */
export function createEmbeddedGitConflictPayload(opts: {
  filePath?: string
  cwd?: string
  conflictType?: DiffViewerLoadPayload['conflictType']
  conflictedFiles: string[]
}): DiffViewerLoadPayload | null {
  const files = buildGitConflictFileEntries(opts.conflictedFiles)
  if (files.length === 0) return null
  const preferredPath = opts.filePath ? normalizeGitPath(opts.filePath) : files[0].filePath
  return buildGitConflictDiffPayload({
    filePath: preferredPath,
    cwd: opts.cwd,
    conflictType: opts.conflictType,
    files,
    currentFileIndex: files.findIndex(f => f.filePath === preferredPath),
  })
}

/** Git staging table — working tree vs index with stage/unstage. */
export function openGitStagingDiff(opts: {
  filePath: string
  fileStatus: string
  cwd?: string
  files: DiffViewerFileEntry[]
  currentFileIndex?: number
}) {
  if (resolveGitDiffOpenMode(opts.fileStatus) === 'git-conflict') {
    const conflictFiles = opts.files.filter(f => isGitConflictedFileStatus(f.fileStatus))
    openGitConflictDiff({
      filePath: opts.filePath,
      cwd: opts.cwd,
      files: conflictFiles.length > 0 ? conflictFiles : buildGitConflictFileEntries([opts.filePath]),
      currentFileIndex: opts.currentFileIndex,
    })
    return
  }
  sendGitDiff(opts.filePath, {
    fileStatus: opts.fileStatus,
    mode: 'git-staging',
    cwd: opts.cwd,
    files: opts.files,
    currentFileIndex: opts.currentFileIndex,
    enableStageActions: true,
  })
}

/** Build payload for embedded git staging diff viewer (MainPage vertical layout). */
export function createEmbeddedGitStagingDiffPayload(opts: {
  filePath?: string
  fileStatus?: string
  stagingState?: 'staged' | 'unstaged'
  cwd?: string
  changesFiles: GitStagingTableFile[]
  stagedFiles: GitStagingTableFile[]
}): DiffViewerLoadPayload | null {
  const files = buildGitStagingFileEntries(opts.changesFiles, opts.stagedFiles)
  if (files.length === 0) return null

  const preferredPath = opts.filePath ? normalizeGitPath(opts.filePath) : files[0].filePath
  const preferredStatus = opts.fileStatus ?? files[0].fileStatus ?? ''
  return buildGitStagingDiffPayload({
    filePath: preferredPath,
    fileStatus: preferredStatus,
    cwd: opts.cwd,
    changesFiles: opts.changesFiles,
    stagedFiles: opts.stagedFiles,
    stagingState: opts.stagingState,
  })
}

/** Show Log — commit vs parent (read-only). */
export function openGitHistoryDiff(opts: {
  filePath: string
  fileStatus: string
  commitHash: string
  currentCommitHash?: string
  isRootCommit?: boolean
  cwd?: string
  files: { filePath: string; action?: string; fileStatus?: string }[]
  currentFileIndex?: number
}) {
  const files = buildDiffViewerFilesFromLogFiles(opts.files)
  sendGitDiff(opts.filePath, {
    fileStatus: opts.fileStatus,
    mode: 'git-history',
    commitHash: opts.commitHash,
    currentCommitHash: opts.currentCommitHash,
    isRootCommit: opts.isRootCommit,
    cwd: opts.cwd,
    files,
    currentFileIndex: opts.currentFileIndex,
  })
}

/** VCS operation log — HEAD vs parent (read-only). */
export function openGitHeadDiff(opts: {
  filePath: string
  fileStatus: string
  parentHash?: string | null
  cwd?: string
}) {
  sendGitDiff(opts.filePath, {
    fileStatus: opts.fileStatus,
    mode: 'git-history',
    commitHash: 'HEAD',
    currentCommitHash: opts.parentHash ?? undefined,
    isRootCommit: !opts.parentHash,
    cwd: opts.cwd,
  })
}

/** SVN revision compare (Show Log, New Revision, VCS op log). */
export function openSvnRevisionDiff(opts: {
  filePath: string
  fileStatus: string
  revision: string
  currentRevision?: string
  cwd?: string
  files?: { filePath: string; action?: string; fileStatus?: string }[]
  currentFileIndex?: number
}) {
  const files = opts.files ? buildDiffViewerFilesFromLogFiles(opts.files) : undefined
  sendSvnDiff(opts.filePath, {
    fileStatus: opts.fileStatus,
    mode: 'svn-revision',
    revision: opts.revision,
    currentRevision: opts.currentRevision,
    cwd: opts.cwd,
    files,
    currentFileIndex: opts.currentFileIndex,
  })
}

/** SVN working copy changes table — WC vs base. */
export function openSvnWorkingDiff(opts: {
  filePath: string
  fileStatus: string
  cwd?: string
  svnTargetPath?: string
  files?: DiffViewerFileEntry[]
  currentFileIndex?: number
}) {
  sendSvnDiff(opts.filePath, {
    fileStatus: opts.fileStatus,
    mode: 'svn-working',
    cwd: opts.cwd,
    svnTargetPath: opts.svnTargetPath ?? opts.cwd,
    files: opts.files,
    currentFileIndex: opts.currentFileIndex,
  })
}
