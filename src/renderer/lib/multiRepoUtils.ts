/**
 * Pure helpers for Multi-repo Git logic. Used by tests and can be used by MainPage.
 * Encodes: isMultiRepo, repo limit (5), tab index validation.
 */

export const MULTI_REPO_LIMIT = 5

export function computeIsMultiRepo(
  versionControlSystem: 'svn' | 'git',
  multiRepoEnabled: boolean,
  effectivePathsLength: number
): boolean {
  return versionControlSystem === 'git' && !!multiRepoEnabled && effectivePathsLength >= 1
}

export function applyRepoLimit(
  paths: string[],
  labels: string[],
  limit: number = MULTI_REPO_LIMIT
): { paths: string[]; labels: string[]; truncated: boolean } {
  const truncated = paths.length > limit
  return {
    paths: truncated ? paths.slice(0, limit) : paths,
    labels: truncated ? labels.slice(0, limit) : labels,
    truncated,
  }
}

export function getValidTabIndex(currentTab: string, repoCount: number): string {
  if (repoCount === 0) return '0'
  const idx = Number(currentTab)
  if (Number.isNaN(idx) || idx < 0 || idx >= repoCount) return '0'
  return currentTab
}

export function buildMultiRepoPayload(
  effectivePaths: string[],
  effectiveLabels: string[],
  getStagedPerRepo: (index: number) => { filePath: string; status?: string }[]
): { repos: { path: string; files: { filePath: string; status?: string }[] }[]; labels: string[] } | null {
  if (effectivePaths.length === 0) return null
  const stagedPerRepo = effectivePaths.map((_, i) => getStagedPerRepo(i) ?? [])
  const repos = effectivePaths.map((path, i) => ({ path, files: stagedPerRepo[i] ?? [] }))
  return { repos, labels: effectiveLabels }
}

export function hasStagedInAnyRepo(
  effectivePaths: string[],
  getStagedPerRepo: (index: number) => { filePath: string }[]
): boolean {
  return effectivePaths.some((_, i) => (getStagedPerRepo(i) ?? []).length > 0)
}

/** Derive label from folder (name or last path segment). Used by MainPage and Git dialogs. */
export function deriveRepoLabel(folder: { name?: string | null; path: string }): string {
  const p = (folder.path ?? '').trim()
  if (folder.name?.trim()) return folder.name.trim()
  return p.split(/[/\\]/).filter(Boolean).pop() ?? p
}

/**
 * Build repo options from source folders and their detect results (mirrors useGitReposFromSourceFolders / MainPage).
 * Only includes folders where isGitValid(path) is true. Max limit entries.
 */
export function buildRepoOptionsFromSourceFolders(
  sourceFolders: { name?: string | null; path?: string }[],
  isGitValid: (path: string) => boolean,
  limit: number = MULTI_REPO_LIMIT
): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = []
  for (const folder of sourceFolders) {
    const p = (folder.path ?? '').trim()
    if (!p || !isGitValid(p)) continue
    list.push({
      value: p,
      label: deriveRepoLabel({ name: folder.name, path: p }),
    })
    if (list.length >= limit) break
  }
  return list
}
