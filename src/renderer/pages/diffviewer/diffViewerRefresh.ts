import {
  type DiffViewerFilesRefreshResult,
  fetchDiffViewerFilesFromGit,
  findDiffViewerFileIndex,
  mergeGitFilesRefreshIntoContext,
  normalizeGitPath,
  resolveDiffViewerFilesRefresh,
} from './diffViewerGitFiles'

import type { DiffViewerFileEntry, DiffViewerLoadPayload } from './diffViewerPayload'
import { deriveDiffViewerMode, enrichDiffViewerPayload } from './diffViewerPayload'

type CommitFileRow = { file: string; status: string }

export function buildDiffViewerFilesFromCommitFiles(files: CommitFileRow[]): DiffViewerFileEntry[] {
  return files.map(f => ({
    filePath: normalizeGitPath(f.file),
    fileStatus: (f.status?.[0] ?? 'M').toUpperCase(),
  }))
}

export function buildDiffViewerFilesFromLogFiles(files: { filePath: string; action?: string; fileStatus?: string }[]): DiffViewerFileEntry[] {
  return files.map(f => ({
    filePath: normalizeGitPath(f.filePath),
    fileStatus: f.fileStatus ?? f.action ?? 'M',
  }))
}

type SvnChangedRow = { filePath: string; status?: string; isFile?: boolean }

export function buildDiffViewerFilesFromSvnChanged(files: SvnChangedRow[]): DiffViewerFileEntry[] {
  return files
    .filter(f => f.isFile !== false && !f.filePath.endsWith('/'))
    .map(f => ({
      filePath: normalizeGitPath(f.filePath),
      fileStatus: f.status ?? 'M',
    }))
}

export async function fetchDiffViewerFilesFromCommit(commitHash: string, cwd?: string): Promise<{ files: DiffViewerFileEntry[]; parentHash: string | null } | null> {
  try {
    const opts = cwd ? { cwd } : undefined
    const [filesResult, parentHash] = await Promise.all([window.api.git.getCommitFiles(commitHash, opts), window.api.git.getParentCommit(commitHash, opts)])
    if (filesResult?.status !== 'success' || !filesResult.data?.files) return null
    return {
      files: buildDiffViewerFilesFromCommitFiles(filesResult.data.files),
      parentHash: parentHash ?? null,
    }
  } catch {
    return null
  }
}

export async function fetchDiffViewerFilesFromSvn(targetPath: string): Promise<DiffViewerFileEntry[] | null> {
  try {
    const result = await window.api.svn.changed_files(targetPath)
    if (result?.status !== 'success' || !Array.isArray(result.data)) return null
    return buildDiffViewerFilesFromSvnChanged(result.data)
  } catch {
    return null
  }
}

export type DiffViewerRefreshOutcome = {
  refreshed: DiffViewerFilesRefreshResult
  nextCtx: DiffViewerLoadPayload
}

export async function refreshDiffViewerFileList(
  ctx: DiffViewerLoadPayload,
  previousIndex: number,
  currentStagingState?: 'staged' | 'unstaged'
): Promise<DiffViewerRefreshOutcome | null> {
  const enriched = enrichDiffViewerPayload(ctx)
  const mode = deriveDiffViewerMode(enriched)
  const currentPath = normalizeGitPath(enriched.filePath)
  const repoCwd = enriched.cwd

  let nextFiles: DiffViewerFileEntry[] | null = null
  let nextCtx: DiffViewerLoadPayload = enriched

  switch (mode) {
    case 'git-staging': {
      if (!repoCwd) return null
      nextFiles = await fetchDiffViewerFilesFromGit(repoCwd)
      break
    }
    case 'git-history': {
      if (!enriched.commitHash) {
        nextFiles = enriched.files?.length ? enriched.files : null
        break
      }
      const commitData = await fetchDiffViewerFilesFromCommit(enriched.commitHash, repoCwd)
      if (!commitData) return null
      nextFiles = commitData.files
      nextCtx = {
        ...enriched,
        currentCommitHash: commitData.parentHash ?? undefined,
        isRootCommit: !commitData.parentHash,
      }
      break
    }
    case 'svn-working': {
      const svnPath = enriched.svnTargetPath ?? repoCwd ?? ''
      if (!svnPath) return null
      nextFiles = await fetchDiffViewerFilesFromSvn(svnPath)
      break
    }
    case 'git-working':
    case 'svn-revision': {
      if (enriched.files?.length) {
        nextFiles = enriched.files.map(f => ({ ...f, filePath: normalizeGitPath(f.filePath) }))
      }
      break
    }
    default:
      return null
  }

  if (nextFiles === null) return null

  const resolved = resolveDiffViewerFilesRefresh(nextFiles, currentPath, previousIndex, currentStagingState)
  nextCtx = mergeGitFilesRefreshIntoContext(nextCtx, resolved)
  nextCtx.files = resolved.files
  nextCtx.currentFileIndex = resolved.currentInList ? resolved.activeIndex : nextCtx.currentFileIndex

  return { refreshed: resolved, nextCtx: enrichDiffViewerPayload(nextCtx) }
}

export function resolveOpenFileIndex(files: DiffViewerFileEntry[], filePath: string, currentFileIndex?: number, stagingState?: 'staged' | 'unstaged'): number {
  if (typeof currentFileIndex === 'number' && currentFileIndex >= 0 && currentFileIndex < files.length) {
    return currentFileIndex
  }
  return Math.max(0, findDiffViewerFileIndex(files, filePath, stagingState))
}
