import type { DiffViewerFileEntry, DiffViewerLoadPayload } from './diffViewerPayload'

export function normalizeGitPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function pathsEqual(a: string, b: string): boolean {
  return normalizeGitPath(a) === normalizeGitPath(b)
}

/** Stable combobox value — file path alone is not unique (staged + unstaged share path). */
export function diffViewerFileOptionId(entry: DiffViewerFileEntry, index: number): string {
  return `${index}:${normalizeGitPath(entry.filePath)}:${entry.stagingState ?? '-'}`
}

export function parseDiffViewerFileOptionIndex(optionId: string): number | null {
  const sep = optionId.indexOf(':')
  if (sep <= 0) return null
  const index = Number.parseInt(optionId.slice(0, sep), 10)
  return Number.isFinite(index) ? index : null
}

type GitStatusFile = {
  path: string
  index: string
  working_dir: string
}

export type GitStatusPayload = {
  files?: GitStatusFile[]
  conflicted?: string[]
}

function isUnmergedPorcelain(index: string, workingDir: string): boolean {
  const ix = (index || ' ').trim()
  const wd = (workingDir || ' ').trim()
  return ix === 'U' || wd === 'U' || (ix === 'A' && wd === 'A') || (ix === 'D' && wd === 'D')
}

function mapIndexStatus(index: string): string {
  if (index === 'M') return 'modified'
  if (index === 'A') return 'added'
  if (index === 'D') return 'deleted'
  if (index === 'R') return 'renamed'
  return 'staged'
}

function mapWorkingDirStatus(workingDir: string): string {
  if (workingDir === 'M') return 'modified'
  if (workingDir === 'A') return 'added'
  if (workingDir === 'D') return 'deleted'
  if (workingDir === '?') return 'untracked'
  return 'modified'
}

/** Build diff viewer file list from git status — mirrors Git Staging table ordering (changes, then staged). */
export function buildDiffViewerFilesFromGitStatus(data: GitStatusPayload): DiffViewerFileEntry[] {
  const changes: DiffViewerFileEntry[] = []
  const staged: DiffViewerFileEntry[] = []
  const seenConflictPaths = new Set<string>()

  if (data.files?.length) {
    for (const file of data.files) {
      if (isUnmergedPorcelain(file.index, file.working_dir)) {
        seenConflictPaths.add(normalizeGitPath(file.path))
        changes.push({
          filePath: normalizeGitPath(file.path),
          fileStatus: 'conflicted',
          stagingState: 'unstaged',
        })
        continue
      }

      if (file.index && file.index !== ' ' && file.index !== '?') {
        staged.push({
          filePath: normalizeGitPath(file.path),
          fileStatus: mapIndexStatus(file.index),
          stagingState: 'staged',
        })
      }

      if (file.working_dir && file.working_dir !== ' ') {
        changes.push({
          filePath: normalizeGitPath(file.path),
          fileStatus: mapWorkingDirStatus(file.working_dir),
          stagingState: 'unstaged',
        })
      }
    }
  }

  if (data.conflicted?.length) {
    for (const filePath of data.conflicted) {
      const normalized = normalizeGitPath(filePath)
      if (seenConflictPaths.has(normalized)) continue
      changes.push({
        filePath: normalizeGitPath(filePath),
        fileStatus: 'conflicted',
        stagingState: 'unstaged',
      })
    }
  }

  return [...changes, ...staged]
}

export async function fetchDiffViewerFilesFromGit(cwd: string): Promise<DiffViewerFileEntry[] | null> {
  try {
    const result = await window.api.git.status({ cwd })
    if (result?.status !== 'success' || !result.data) return null
    return buildDiffViewerFilesFromGitStatus(result.data)
  } catch {
    return null
  }
}

export type DiffViewerFilesRefreshResult = {
  files: DiffViewerFileEntry[]
  activeIndex: number
  activeFile?: DiffViewerFileEntry
  currentInList: boolean
}

export function findDiffViewerFileIndex(
  files: DiffViewerFileEntry[],
  filePath: string,
  stagingState?: 'staged' | 'unstaged'
): number {
  if (stagingState) {
    const stagedMatch = files.findIndex(f => pathsEqual(f.filePath, filePath) && f.stagingState === stagingState)
    if (stagedMatch >= 0) return stagedMatch
  }
  return files.findIndex(f => pathsEqual(f.filePath, filePath))
}

/** After stage/revert, keep the same list slot so the next file slides into view. */
export function resolveAutoAdvanceTargetIndex(fromIndex: number, fileCount: number): number | null {
  if (fileCount <= 0) return null
  return Math.min(Math.max(0, fromIndex), fileCount - 1)
}

export function resolveDiffViewerFilesRefresh(
  nextFiles: DiffViewerFileEntry[],
  currentFilePath: string,
  previousIndex: number,
  currentStagingState?: 'staged' | 'unstaged'
): DiffViewerFilesRefreshResult {
  const nextIndex = findDiffViewerFileIndex(nextFiles, currentFilePath, currentStagingState)
  if (nextIndex >= 0) {
    return {
      files: nextFiles,
      activeIndex: nextIndex,
      activeFile: nextFiles[nextIndex],
      currentInList: true,
    }
  }

  return {
    files: nextFiles,
    activeIndex: nextFiles.length > 0 ? Math.min(previousIndex, nextFiles.length - 1) : 0,
    activeFile: undefined,
    currentInList: false,
  }
}

export function mergeGitFilesRefreshIntoContext(
  ctx: DiffViewerLoadPayload,
  refreshed: DiffViewerFilesRefreshResult
): DiffViewerLoadPayload {
  const next: DiffViewerLoadPayload = {
    ...ctx,
    files: refreshed.files,
    currentFileIndex: refreshed.currentInList ? refreshed.activeIndex : ctx.currentFileIndex,
  }

  if (refreshed.currentInList && refreshed.activeFile) {
    next.filePath = refreshed.activeFile.filePath
    next.fileStatus = refreshed.activeFile.fileStatus ?? ctx.fileStatus
  }

  return next
}

export function resolveDisplayedFileEntry(
  files: DiffViewerFileEntry[],
  filePath: string,
  ctx?: { fileStatus?: string; stagingState?: 'staged' | 'unstaged' }
): DiffViewerFileEntry | undefined {
  if (!filePath) return undefined

  if (ctx?.stagingState) {
    const exact = files.find(f => pathsEqual(f.filePath, filePath) && f.stagingState === ctx.stagingState)
    if (exact) return exact
  }

  const byPath = files.find(f => pathsEqual(f.filePath, filePath))
  if (byPath) return byPath

  return {
    filePath: normalizeGitPath(filePath),
    fileStatus: ctx?.fileStatus,
    stagingState: ctx?.stagingState,
  }
}
