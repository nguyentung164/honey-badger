import { normalizeGitPath } from './diffViewerGitFiles'
import type { DiffViewerFileEntry, DiffViewerLoadPayload, GitConflictType } from './diffViewerPayload'

export type GitConflictSession = {
  hasConflict: boolean
  conflictType?: GitConflictType
  files: DiffViewerFileEntry[]
  conflictedPaths: string[]
}

export function isGitConflictedFileStatus(fileStatus?: string): boolean {
  const s = (fileStatus || '').trim()
  if (!s) return false
  if (s.toLowerCase() === 'conflicted') return true
  return /^(UU|DD|AA|AU|UA|UD|DU|DA|AD)$/i.test(s)
}

export function buildGitConflictFileEntries(conflictedFiles: string[]): DiffViewerFileEntry[] {
  return conflictedFiles.map(filePath => ({
    filePath: normalizeGitPath(filePath),
    fileStatus: 'conflicted',
    stagingState: 'unstaged' as const,
  }))
}

export async function fetchGitConflictSession(cwd?: string): Promise<GitConflictSession> {
  const empty: GitConflictSession = { hasConflict: false, files: [], conflictedPaths: [] }
  try {
    const result = await window.api.git.get_conflict_status(cwd?.trim() || undefined)
    if (result.status !== 'success' || !result.data) return empty
    const conflictedPaths = (result.data.conflictedFiles ?? []).map(normalizeGitPath)
    return {
      hasConflict: result.data.hasConflict === true && conflictedPaths.length > 0,
      conflictType: result.data.conflictType,
      files: buildGitConflictFileEntries(conflictedPaths),
      conflictedPaths,
    }
  } catch {
    return empty
  }
}

export function buildGitConflictDiffPayload(opts: {
  filePath: string
  cwd?: string
  conflictType?: GitConflictType
  files: DiffViewerFileEntry[]
  currentFileIndex?: number
}): DiffViewerLoadPayload {
  const normalizedPath = normalizeGitPath(opts.filePath)
  const files = opts.files.map(f => ({ ...f, filePath: normalizeGitPath(f.filePath) }))
  const matchIndex = files.findIndex(f => f.filePath === normalizedPath)
  const currentFileIndex = matchIndex >= 0 ? matchIndex : Math.max(0, opts.currentFileIndex ?? 0)
  const active = files[currentFileIndex]

  return {
    mode: 'git-conflict',
    isGit: true,
    enableStageActions: false,
    filePath: active?.filePath ?? normalizedPath,
    fileStatus: 'conflicted',
    stagingState: 'unstaged',
    cwd: opts.cwd,
    conflictType: opts.conflictType,
    files,
    currentFileIndex: files.length > 0 ? currentFileIndex : 0,
  }
}

export function buildEmbeddedGitConflictPayloadSyncKey(payload: DiffViewerLoadPayload | null | undefined): string {
  if (!payload) return ''
  const files = payload.files?.map(f => `${f.filePath}:${f.fileStatus ?? ''}`).join('|') ?? ''
  return `conflict\0${payload.filePath}\0${payload.cwd ?? ''}\0${payload.conflictType ?? ''}\0${files}`
}
