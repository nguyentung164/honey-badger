import type { GitFileStatusCode } from '@/components/git/GitFileStatusBadge'
import { normalizeGitPath } from '@/pages/diffviewer/diffViewerGitFiles'

type GitStatusFile = {
  path: string
  index: string
  working_dir: string
}

export type GitStatusPayload = {
  files?: GitStatusFile[]
  conflicted?: string[]
}

/** VS Code gitDecoration.*ResourceForeground — theme via --hb-git-* in globals.css */
export const EXPLORER_GIT_LABEL_CLASS: Record<GitFileStatusCode, string> = {
  modified: 'text-[var(--hb-git-modified)]',
  added: 'text-[var(--hb-git-added)]',
  untracked: 'text-[var(--hb-git-untracked)]',
  staged: 'text-[var(--hb-git-staged)]',
  deleted: 'text-[var(--hb-git-deleted)] line-through',
  renamed: 'text-[var(--hb-git-renamed)]',
  conflicted: 'text-[var(--hb-git-conflicted)]',
}

/** VS Code folder trailing dot — same palette as status. */
export const EXPLORER_GIT_DOT_CLASS: Record<GitFileStatusCode, string> = {
  modified: 'bg-[var(--hb-git-modified)]',
  added: 'bg-[var(--hb-git-added)]',
  untracked: 'bg-[var(--hb-git-untracked)]',
  staged: 'bg-[var(--hb-git-staged)]',
  deleted: 'bg-[var(--hb-git-deleted)]',
  renamed: 'bg-[var(--hb-git-renamed)]',
  conflicted: 'bg-[var(--hb-git-conflicted)]',
}

const STATUS_RANK: Record<GitFileStatusCode, number> = {
  conflicted: 70,
  deleted: 60,
  modified: 50,
  untracked: 40,
  added: 35,
  renamed: 30,
  staged: 20,
}

function isUnmergedPorcelain(index: string, workingDir: string): boolean {
  const ix = (index || ' ').trim()
  const wd = (workingDir || ' ').trim()
  return ix === 'U' || wd === 'U' || (ix === 'A' && wd === 'A') || (ix === 'D' && wd === 'D')
}

function mapIndexStatus(index: string): GitFileStatusCode {
  if (index === 'M') return 'modified'
  if (index === 'A') return 'added'
  if (index === 'D') return 'deleted'
  if (index === 'R') return 'renamed'
  return 'staged'
}

function mapWorkingDirStatus(workingDir: string): GitFileStatusCode {
  if (workingDir === 'M') return 'modified'
  if (workingDir === 'A') return 'added'
  if (workingDir === 'D') return 'deleted'
  if (workingDir === '?') return 'untracked'
  return 'modified'
}

function pickHigherStatus(current: GitFileStatusCode | null, next: GitFileStatusCode): GitFileStatusCode {
  if (!current) return next
  return STATUS_RANK[next] > STATUS_RANK[current] ? next : current
}

/** One status per path — working tree wins over index-only staged. */
export function buildExplorerFileStatusMap(data: GitStatusPayload): Map<string, GitFileStatusCode> {
  const map = new Map<string, GitFileStatusCode>()

  for (const file of data.files ?? []) {
    const path = normalizeGitPath(file.path)
    if (isUnmergedPorcelain(file.index, file.working_dir)) {
      map.set(path, 'conflicted')
      continue
    }

    let status: GitFileStatusCode | null = null
    if (file.working_dir && file.working_dir !== ' ') {
      status = mapWorkingDirStatus(file.working_dir)
    } else if (file.index && file.index !== ' ' && file.index !== '?') {
      status = mapIndexStatus(file.index)
    }
    if (status) map.set(path, status)
  }

  for (const filePath of data.conflicted ?? []) {
    map.set(normalizeGitPath(filePath), 'conflicted')
  }

  return map
}

function isUnderFolder(filePath: string, folderPath: string): boolean {
  if (folderPath === '') return true
  return filePath === folderPath || filePath.startsWith(`${folderPath}/`)
}

/** Folder labels — no strikethrough (VS Code only strikes deleted files, not parents). */
export const EXPLORER_GIT_FOLDER_LABEL_CLASS: Record<GitFileStatusCode, string> = {
  modified: 'text-[var(--hb-git-modified)]',
  added: 'text-[var(--hb-git-added)]',
  untracked: 'text-[var(--hb-git-untracked)]',
  staged: 'text-[var(--hb-git-staged)]',
  deleted: 'text-[var(--hb-git-deleted)]',
  renamed: 'text-[var(--hb-git-renamed)]',
  conflicted: 'text-[var(--hb-git-conflicted)]',
}

export function resolveFolderGitStatus(
  folderPath: string,
  fileStatuses: Map<string, GitFileStatusCode>
): GitFileStatusCode | null {
  let best: GitFileStatusCode | null = null
  for (const [filePath, status] of fileStatuses) {
    if (!isUnderFolder(filePath, folderPath)) continue
    // VS Code: Resource.resourceDecoration sets propagate=false for DELETED/INDEX_DELETED.
    if (filePath !== folderPath && status === 'deleted') continue
    best = pickHigherStatus(best, status)
  }
  return best
}

export function resolveExplorerGitStatus(
  relativePath: string,
  isDir: boolean,
  fileStatuses: Map<string, GitFileStatusCode>
): GitFileStatusCode | null {
  if (!isDir) return fileStatuses.get(relativePath) ?? null
  return resolveFolderGitStatus(relativePath, fileStatuses)
}
