/**
 * Normalizes GitHub remote URL to "owner/repo" (repo may still have .git suffix).
 * Supports: HTTPS, git@host:, ssh:// (including host aliases from ~/.ssh/config).
 */
export function extractOwnerAndRepoFromGitRemoteURL(url: string) {
  if (!url || typeof url !== 'string') return ''
  let s = url.trim()
  // 1) SSH: git@<host>:owner/repo[.git]
  s = s.replace(/^git@[^:]+:/, '')
  // 2) ssh://git@<host>/owner/repo[.git]
  s = s.replace(/^ssh:\/\/[^/]+\//, '')
  // 3) https(s)://<host>/owner/repo[.git]
  s = s.replace(/^https?:\/\/[^/]+\//, '')
  // 4) Trailing .git
  s = s.replace(/\.git$/, '')
  return s.trim()
}
