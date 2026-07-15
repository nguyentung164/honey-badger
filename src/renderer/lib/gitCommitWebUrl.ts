function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/i, '')
}

function parseGithubRemote(url: string): { host: string; owner: string; repo: string } | null {
  const raw = url.trim()
  const sshMatch = raw.match(/^(?:[^@\s]+@)([^:]+):([^/]+)\/(.+?)(?:\.git)?$/i)
  if (sshMatch) {
    const host = sshMatch[1].toLowerCase()
    if (!host.includes('github')) return null
    return { host: sshMatch[1], owner: sshMatch[2], repo: stripGitSuffix(sshMatch[3]) }
  }
  try {
    const normalized = raw.replace(/^git\+/i, '')
    const u = new URL(normalized)
    if (!u.hostname.toLowerCase().includes('github')) return null
    const parts = u.pathname.replace(/^\//, '').split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { host: u.host, owner: parts[0], repo: stripGitSuffix(parts[1]) }
  } catch {
    return null
  }
}

function parseGitLabRemote(url: string): { webBase: string } | null {
  const raw = url.trim()
  const sshMatch = raw.match(/^(?:git@|ssh:\/\/git@)([^:]+):(.+?)(?:\.git)?$/i)
  if (sshMatch) {
    const host = sshMatch[1]
    const path = stripGitSuffix(sshMatch[2])
    return { webBase: `https://${host}/${path}` }
  }
  try {
    const normalized = raw.replace(/^git\+/i, '')
    const u = new URL(normalized)
    const path = stripGitSuffix(u.pathname.replace(/^\//, ''))
    if (!path) return null
    return { webBase: `${u.protocol}//${u.host}/${path}` }
  } catch {
    return null
  }
}

/** Build commit page URL from `git remote` URL (GitHub / GitLab / GHE-like). */
export function buildGitCommitWebUrl(remoteUrl: string | null | undefined, commitHash: string): string | null {
  const hash = (commitHash ?? '').trim()
  if (!remoteUrl?.trim() || !hash) return null

  const github = parseGithubRemote(remoteUrl)
  if (github) {
    return `https://${github.host}/${github.owner}/${github.repo}/commit/${hash}`
  }

  const web = parseGitLabRemote(remoteUrl)
  if (!web) return null

  const host = (() => {
    try {
      return new URL(web.webBase).hostname.toLowerCase()
    } catch {
      return ''
    }
  })()

  // GitLab cloud / self-hosted
  if (host.includes('gitlab') || remoteUrl.toLowerCase().includes('gitlab')) {
    return `${web.webBase}/-/commit/${hash}`
  }

  // Bitbucket / Azure DevOps — skip (URL shape differs)
  if (host.includes('bitbucket') || host.includes('dev.azure') || host.includes('visualstudio.com')) {
    return null
  }

  // Other git hosts (e.g. GHE without "github" in hostname): GitHub-style path
  return `${web.webBase}/commit/${hash}`
}

export function resolveOriginRemoteUrl(remotes: Array<{ name?: string; refs?: { fetch?: string; push?: string } }> | undefined): string | null {
  if (!remotes?.length) return null
  const origin = remotes.find(r => r.name === 'origin') ?? remotes[0]
  return origin?.refs?.fetch ?? origin?.refs?.push ?? null
}
