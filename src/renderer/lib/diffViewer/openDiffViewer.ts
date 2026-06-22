import {
  buildDiffViewerFilesFromLogFiles,
  resolveOpenFileIndex,
} from '@/pages/diffviewer/diffViewerRefresh'
import { normalizeGitPath } from '@/pages/diffviewer/diffViewerGitFiles'
import type { DiffViewerFileEntry, DiffViewerLoadPayload } from '@/pages/diffviewer/diffViewerPayload'

type GitOpenOptions = {
  fileStatus: string
  mode?: DiffViewerLoadPayload['mode']
  commitHash?: string
  currentCommitHash?: string
  isRootCommit?: boolean
  cwd?: string
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

/** Git staging table — working tree vs index with stage/unstage. */
export function openGitStagingDiff(opts: {
  filePath: string
  fileStatus: string
  cwd?: string
  files: DiffViewerFileEntry[]
  currentFileIndex?: number
}) {
  sendGitDiff(opts.filePath, {
    fileStatus: opts.fileStatus,
    mode: 'git-staging',
    cwd: opts.cwd,
    files: opts.files,
    currentFileIndex: opts.currentFileIndex,
    enableStageActions: true,
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
