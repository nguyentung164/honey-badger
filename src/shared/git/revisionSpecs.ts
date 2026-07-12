/**
 * Git revision specs for `git show` / blob reads.
 * @see https://git-scm.com/docs/gitrevisions — `: [<n>:]<path>` and `<tree-ish>:<path>`
 */

/** Logical index ref used by renderer IPC (`git.cat` third argument). */
export const GIT_INDEX_REF = ':index' as const

export type GitIndexStage = 0 | 1 | 2 | 3

/** Repo-relative path for git revision syntax (forward slashes, no leading slash). */
export function normalizeGitRepoRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^[/\\]+/, '')
}

export function isGitIndexRef(ref?: string): boolean {
  const r = (ref ?? '').trim()
  return r === GIT_INDEX_REF || r.toLowerCase() === 'index'
}

/**
 * Index blob at stage `n` — `:<n>:<path>`.
 * Always use an explicit stage number; `:path` shorthand is ambiguous for dotfiles (e.g. `.npmrc`).
 */
export function gitIndexStageShowSpec(stage: GitIndexStage, relativePath: string): string {
  const p = normalizeGitRepoRelativePath(relativePath)
  return `:${stage}:${p}`
}

/** Stage-0 index entry (`:0:<path>`). */
export function gitIndexShowSpec(relativePath: string): string {
  return gitIndexStageShowSpec(0, relativePath)
}

/** Tree-ish blob — `<tree-ish>:<path>` (e.g. `HEAD:README`). */
export function gitTreeishBlobShowSpec(treeish: string, relativePath: string): string {
  const ref = treeish.trim()
  const p = normalizeGitRepoRelativePath(relativePath)
  return `${ref}:${p}`
}

/** Single `git show` object spec for an app ref + repo-relative path. */
export function resolveGitBlobShowSpec(ref: string, relativePath: string): string {
  const p = normalizeGitRepoRelativePath(relativePath)
  if (isGitIndexRef(ref)) {
    return gitIndexShowSpec(p)
  }
  return gitTreeishBlobShowSpec(ref, p)
}
