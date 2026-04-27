import l from 'electron-log'
import { BrowserWindow, net } from 'electron'
import { Octokit } from '@octokit/rest'
import { IPC } from '../constants'
import type {
  BranchCommit,
  CreatePRInput,
  IHostingClient,
  ListPRsOptions,
  MergePRInput,
  ParsedRemote,
  PrAssignee,
  PrChangedFile,
  PrConversationEntry,
  PrIssueComment,
  PullRequestCommit,
  PrRequestedTeam,
  PrReviewResult,
  PrReviewSubmission,
  PullRequestSummary,
} from './types'
import { getGithubToken } from './tokenStore'

/** Phi\u00ean b\u1ea3n REST API GitHub (b\u1eaft bu\u1ed9c header X-GitHub-Api-Version v\u1edbi nhi\u1ec1u client). */
const GITHUB_REST_API_VERSION = '2022-11-28'

function broadcastTokenInvalid(message: string): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.PR.EVENT_TOKEN_INVALID, { message })
    }
  } catch {
    // ignore
  }
}

function getResponseContentType(err: any): string {
  const h = err?.response?.headers
  if (!h) return ''
  if (typeof h.get === 'function') return String(h.get('content-type') || '')
  return String(h['content-type'] || h['Content-Type'] || '')
}

function extractHtmlTitle(html: string): string {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return t?.[1]?.trim() ?? ''
}

function extractHtmlParagraphs(html: string): string {
  const ps = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return ps.join(' | ')
}

/**
 * Tr\u1ea3 v\u1ec1 message l\u1ed7i NG\u1eeeN \u0111\u00fang theo ph\u1ea3n h\u1ed3i GitHub (JSON ho\u1eb7c HTML), kh\u00f4ng t\u1ef1 th\u00eam suy lu\u1eadn/gi\u1ea3 thuy\u1ebft.
 */
export function normalizeGithubApiErrorMessage(err: any): string {
  const status = err?.status ?? err?.response?.status
  const rawData = err?.response?.data
  const dataStr = typeof rawData === 'string' ? rawData : ''
  const msgLine = String(err?.message || '').trim()
  const jsonMsg =
    rawData && typeof rawData === 'object' && typeof rawData.message === 'string'
      ? rawData.message.trim()
      : ''
  const docUrl =
    rawData && typeof rawData === 'object' && typeof rawData.documentation_url === 'string'
      ? rawData.documentation_url
      : ''

  if (jsonMsg) {
    return status ? `${status} ${jsonMsg}${docUrl ? ` (${docUrl})` : ''}` : jsonMsg
  }

  const contentType = getResponseContentType(err)
  const isHtml =
    /text\/html/i.test(contentType) ||
    /<\s*html[\s>]/i.test(dataStr) ||
    /<\s*p[\s>]/i.test(dataStr)

  if (isHtml && dataStr) {
    const title = extractHtmlTitle(dataStr)
    const paragraphs = extractHtmlParagraphs(dataStr)
    const body = [title, paragraphs].filter(Boolean).join(' - ') || 'HTML response'
    return status ? `${status} ${truncate(body, 400)}` : truncate(body, 400)
  }

  if (msgLine) return status ? `${status} ${truncate(msgLine, 400)}` : truncate(msgLine, 400)
  return status ? `HTTP ${status}` : 'Unknown error'
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (!t) return ''
  return t.length <= max ? t : `${t.slice(0, max)}\u2026`
}

/** Map l\u1ed7i Octokit \u2192 Error v\u1edbi message l\u1ea5y tr\u1ef1c ti\u1ebfp t\u1eeb GitHub (kh\u00f4ng t\u1ef1 th\u00eam suy lu\u1eadn). */
function wrapError(err: any, fallbackMsg: string): Error {
  const status = err?.status ?? err?.response?.status
  const msg = normalizeGithubApiErrorMessage(err) || fallbackMsg
  if (status === 401) {
    broadcastTokenInvalid(msg)
  }
  return new Error(msg)
}

function getOctokitHeader(headers: any, name: string): string | undefined {
  if (!headers) return undefined
  const lower = name.toLowerCase()
  if (typeof headers.get === 'function') {
    return headers.get(name) ?? headers.get(lower) ?? undefined
  }
  const o = headers as Record<string, unknown>
  return (o[name] ?? o[lower] ?? o['X-RateLimit-Reset']) as string | undefined
}

/** Milliseconds to wait from X-RateLimit-Reset / Retry-After (GitHub REST). */
function githubRateLimitBackoffMs(err: any, attempt: number): number {
  const headers = err?.response?.headers
  const retryAfter = getOctokitHeader(headers, 'retry-after')
  if (retryAfter) {
    const sec = Number(retryAfter)
    if (Number.isFinite(sec) && sec > 0) return Math.min(sec * 1000 + 500, 120_000)
  }
  const reset = getOctokitHeader(headers, 'x-ratelimit-reset')
  if (reset) {
    const sec = Number(reset)
    if (Number.isFinite(sec)) {
      const until = sec * 1000 - Date.now() + 800
      if (until > 0) return Math.min(until, 120_000)
    }
  }
  return Math.min(2000 * 2 ** Math.max(0, attempt - 1), 45_000)
}

function isGithubRateLimitError(err: any): boolean {
  const s = err?.status ?? err?.response?.status
  if (s === 429) return true
  if (s !== 403) return false
  const msg = `${err?.message ?? ''} ${normalizeGithubApiErrorMessage(err) ?? ''}`
  return /rate limit|too many requests|abuse detection|secondary rate|scraping github/i.test(msg)
}

/**
 * Th\u1eed l\u1ea1i khi GitHub tr\u1ea3 403/429 rate limit (d\u00f9ng X-RateLimit-Reset / Retry-After).
 * M\u1ed7i l\u1ea7n ch\u1edd t\u1ed1i \u0111a ~2 ph\u00fat; t\u1ed5ng t\u1ed1i \u0111a v\u00e0i l\u1ea7n th\u1eed.
 */
export async function withGithubRateLimitRetry<T>(
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; label?: string }
): Promise<T> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 5)
  const label = options?.label ?? 'GitHub'
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      if (!isGithubRateLimitError(err) || attempt >= maxAttempts) {
        throw err
      }
      const wait = githubRateLimitBackoffMs(err, attempt)
      l.warn(`${label}: rate limit, ch\u1edd ${Math.ceil(wait / 1000)}s r\u1ed3i th\u1eed l\u1ea1i (${attempt}/${maxAttempts})`)
      await new Promise<void>(r => setTimeout(r, wait))
    }
  }
  throw lastErr
}

let cachedClient: Octokit | null = null
let cachedToken: string | null = null

/**
 * Fetch qua {@link net.fetch} c\u1ee7a Electron (Chromium stack) \u2014 tr\u00e1nh tr\u01b0\u1eddng h\u1ee3p Node's undici fetch
 * b\u1ecb m\u00f4i tr\u01b0\u1eddng (DNS/TLS/proxy) tr\u1ea3 v\u1ec1 trang HTML c\u1ee7a github.com thay v\u00ec JSON API.
 */
const electronNetFetch: typeof fetch = (input, init) => {
  return net.fetch(input as any, init as any) as unknown as Promise<Response>
}

function getClient(): Octokit {
  const token = getGithubToken()
  if (!token) {
    throw new Error('GitHub token ch\u01b0a \u0111\u01b0\u1ee3c c\u1ea5u h\u00ecnh. H\u00e3y m\u1edf PR Manager \u2192 Settings \u0111\u1ec3 nh\u1eadp Personal Access Token.')
  }
  if (!cachedClient || cachedToken !== token) {
    // L\u01b0u \u00fd: KH\u00d4NG override userAgent. GitHub edge (WAF) t\u1eeb ch\u1ed1i m\u1ed9t s\u1ed1 UA (v\u00ed d\u1ee5 chu\u1ed7i ch\u1ee9a
    // "electron" ho\u1eb7c d\u1ea1ng app/1.0) \u2192 tr\u1ea3 v\u1ec1 trang 403 "Unicorn" HTML thay v\u00ec JSON.
    // UA m\u1eb7c \u0111\u1ecbnh c\u1ee7a Octokit ("octokit-core.js/x.y.z Node.js/...") \u0111\u01b0\u1ee3c GitHub ch\u1ea5p nh\u1eadn.
    const client = new Octokit({
      auth: token,
      request: {
        timeout: 20000,
        fetch: electronNetFetch,
      },
    })
    client.hook.before('request', options => {
      options.headers = {
        ...options.headers,
        accept: 'application/vnd.github+json',
        'x-github-api-version': GITHUB_REST_API_VERSION,
      }
    })
    cachedClient = client
    cachedToken = token
  }
  return cachedClient
}

export function resetGithubClient(): void {
  cachedClient = null
  cachedToken = null
}

export type GithubRestResourceLimit = {
  limit: number
  remaining: number
  /** Unix seconds — th\u1eddi \u0111i\u1ec3m reset h\u1ea1n m\u1ee9c. */
  reset: number
  used: number
}

/** T\u1eeb GET /rate_limit (REST \u2014 nh\u00f3m `core` l\u00e0 API th\u00f4ng th\u01b0\u1eddng). */
export type GithubRestRateLimitOverview = {
  core: GithubRestResourceLimit
  search: GithubRestResourceLimit | null
  graphql: GithubRestResourceLimit | null
}

function pickResource(
  r: { limit: number; remaining: number; reset: number; used: number } | null | undefined
): GithubRestResourceLimit | null {
  if (!r || typeof r.limit !== 'number') return null
  return {
    limit: r.limit,
    remaining: r.remaining,
    reset: r.reset,
    used: r.used,
  }
}

/**
 * L\u1ea5y h\u1ea1n m\u1ee9c GitHub REST (m\u1ed7i l\u1ea7n g\u1ecdc ~1 v\u1ec1 rate_limit, kh\u00f4ng t\u00ednh v\u00e0o core nhi\u1ec1u).
 */
export async function fetchGithubRestRateLimit(): Promise<GithubRestRateLimitOverview> {
  const octokit = getClient()
  const { data } = await octokit.request('GET /rate_limit')
  const resources = (data as { resources?: Record<string, { limit: number; remaining: number; reset: number; used: number }> })
    .resources
  if (!resources?.core) {
    throw new Error('Thi\u1ebfu d\u1eef li\u1ec7u rate limit (core) t\u1eeb GitHub.')
  }
  return {
    core: pickResource(resources.core)!,
    search: pickResource(resources.search),
    graphql: pickResource(resources.graphql),
  }
}

function stripGitSuffix(s: string): string {
  return s.replace(/\.git$/i, '')
}

export function parseRemoteUrl(url: string): ParsedRemote | null {
  if (!url) return null
  const raw = url.trim()
  try {
    const sshMatch = raw.match(/^(?:[^@\s]+@)([^:]+):([^/]+)\/(.+?)(?:\.git)?$/i)
    if (sshMatch) {
      const host = sshMatch[1].toLowerCase()
      if (!host.includes('github')) return null
      return {
        host,
        owner: sshMatch[2],
        repo: stripGitSuffix(sshMatch[3]),
        hosting: 'github',
      }
    }
    const normalized = raw.replace(/^git\+/i, '')
    const u = new URL(normalized)
    const host = u.hostname.toLowerCase()
    if (!host.includes('github')) return null
    const parts = u.pathname.replace(/^\//, '').split('/').filter(Boolean)
    if (parts.length < 2) return null
    return {
      host,
      owner: parts[0],
      repo: stripGitSuffix(parts[1]),
      hosting: 'github',
    }
  } catch {
    return null
  }
}

function mapUserListSimple(arr: unknown): { login: string; id: number; avatarUrl: string | null }[] | null {
  if (!Array.isArray(arr)) return null
  return arr
    .filter((u: any) => u && typeof u.login === 'string')
    .map((u: any) => ({
      login: u.login as string,
      id: Number(u.id) || 0,
      avatarUrl: typeof u.avatar_url === 'string' ? u.avatar_url : null,
    }))
}

function mapRequestedTeamsRaw(pr: any): PrRequestedTeam[] | null {
  if (!Array.isArray(pr?.requested_teams)) return null
  return pr.requested_teams
    .filter((t: any) => t && (typeof t.slug === 'string' || typeof t.name === 'string'))
    .map((t: any) => ({
      name: (typeof t.name === 'string' ? t.name : t.slug) as string,
      slug: (typeof t.slug === 'string' ? t.slug : t.name) as string,
    }))
}

/**
 * Mỗi user một bản mới nhất theo thứ tự `id` (bỏ PENDING = chưa gửi).
 */
function mergeLatestReviews(raw: any[]): PrReviewSubmission[] {
  if (!raw?.length) return []
  const sorted = [...raw].sort((a, b) => (a?.id ?? 0) - (b?.id ?? 0))
  const byLogin = new Map<string, any>()
  for (const r of sorted) {
    const login = r?.user?.login
    if (typeof login !== 'string' || !login) continue
    byLogin.set(login, r)
  }
  const out: PrReviewSubmission[] = []
  for (const r of byLogin.values()) {
    if (r.state === 'PENDING') continue
    out.push({
      login: r.user.login,
      avatarUrl: typeof r.user?.avatar_url === 'string' ? r.user.avatar_url : null,
      state: String(r.state ?? 'UNKNOWN'),
      submittedAt: typeof r.submitted_at === 'string' ? r.submitted_at : null,
    })
  }
  out.sort((a, b) => a.login.localeCompare(b.login, undefined, { sensitivity: 'base' }))
  return out
}

function mapPrFields(pr: any, opts?: { reviewSubmissions?: PrReviewSubmission[] | null }): PullRequestSummary {
  const merged = !!pr.merged || !!pr.merged_at
  const assignees = mapUserListSimple(pr?.assignees)
  const labels = Array.isArray(pr.labels)
    ? pr.labels
        .filter((l: any) => l && typeof l.name === 'string')
        .map((l: any) => ({
          name: l.name as string,
          color: typeof l.color === 'string' ? l.color : '',
        }))
    : null
  const requestedReviewers = mapUserListSimple(pr?.requested_reviewers)
  const requestedTeams = mapRequestedTeamsRaw(pr)
  return {
    number: pr.number,
    title: pr.title,
    body: pr.body ?? null,
    state: (pr.state as 'open' | 'closed') ?? 'open',
    draft: !!pr.draft,
    merged,
    mergedAt: pr.merged_at ?? null,
    mergedBy: pr.merged_by?.login ?? null,
    htmlUrl: pr.html_url,
    head: pr.head?.ref ?? '',
    base: pr.base?.ref ?? '',
    headSha: typeof pr.head?.sha === 'string' ? pr.head.sha : null,
    author: pr.user?.login ?? null,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    additions: typeof pr.additions === 'number' ? pr.additions : null,
    deletions: typeof pr.deletions === 'number' ? pr.deletions : null,
    changedFiles: typeof pr.changed_files === 'number' ? pr.changed_files : null,
    mergeableState: typeof pr.mergeable_state === 'string' ? pr.mergeable_state : null,
    assignees,
    labels,
    requestedReviewers: requestedReviewers && requestedReviewers.length > 0 ? requestedReviewers : null,
    requestedTeams: requestedTeams && requestedTeams.length > 0 ? requestedTeams : null,
    reviewSubmissions: opts?.reviewSubmissions !== undefined ? opts.reviewSubmissions : null,
  }
}

/**
 * L\u1ea5y to\u00e0n b\u1ed9 n\u1ed9i dung message c\u1ee7a c\u00e1c commit tr\u00ean ref (nh\u00e1nh) \u2014 d\u00f9ng sinh ti\u00eau \u0111\u1ec1 PR theo m\u1eabu.
 */
export async function githubListRefCommitMessages(
  owner: string,
  repo: string,
  ref: string,
  maxCommits = 500
): Promise<string[]> {
  const b = ref?.trim()
  if (!b) return []
  const octokit = getClient()
  const out: string[] = []
  try {
    for await (const { data } of octokit.paginate.iterator(octokit.repos.listCommits, {
      owner,
      repo,
      sha: b,
      per_page: 100,
    })) {
      for (const c of data) {
        out.push(c.commit.message)
        if (out.length >= maxCommits) return out
      }
    }
  } catch (err: any) {
    throw wrapError(err, 'Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c l\u1ecbch s\u1eed commit tr\u00ean nh\u00e1nh')
  }
  return out
}

export const githubClient: IHostingClient = {
  getType() {
    return 'github'
  },

  async createPR(input: CreatePRInput): Promise<PullRequestSummary> {
    const octokit = getClient()
    try {
      const { data } = await octokit.pulls.create({
        owner: input.owner,
        repo: input.repo,
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
        draft: input.draft,
      })
      return mapPrFields(data)
    } catch (err: any) {
      l.error('GitHub createPR failed:', err?.message)
      throw wrapError(err, 'Failed to create PR')
    }
  },

  async mergePR(input: MergePRInput) {
    const octokit = getClient()
    try {
      const { data } = await octokit.pulls.merge({
        owner: input.owner,
        repo: input.repo,
        pull_number: input.number,
        merge_method: input.method,
        commit_title: input.commitTitle,
        commit_message: input.commitMessage,
      })
      return { merged: !!data.merged, message: data.message }
    } catch (err: any) {
      l.error('GitHub mergePR failed:', err?.message)
      throw wrapError(err, 'Failed to merge PR')
    }
  },

  async getPR(
    owner: string,
    repo: string,
    number: number,
    options?: { includeReviewSubmissions?: boolean }
  ): Promise<PullRequestSummary> {
    const wantReviews = options?.includeReviewSubmissions !== false
    try {
      return await withGithubRateLimitRetry(
        async () => {
          const octokit = getClient()
          const { data: prData } = await octokit.pulls.get({ owner, repo, pull_number: number })
          if (!wantReviews) {
            return mapPrFields(prData, { reviewSubmissions: null })
          }
          const raw = (await octokit.paginate(octokit.pulls.listReviews, {
            owner,
            repo,
            pull_number: number,
            per_page: 100,
          })) as any[]
          return mapPrFields(prData, { reviewSubmissions: mergeLatestReviews(raw) })
        },
        { label: `getPR ${owner}/${repo}#${number}` }
      )
    } catch (err: any) {
      throw wrapError(err, 'Failed to get PR')
    }
  },

  async listPRs(options: ListPRsOptions): Promise<PullRequestSummary[]> {
    try {
      return await withGithubRateLimitRetry(
        async () => {
          const octokit = getClient()
          const { data } = await octokit.pulls.list({
            owner: options.owner,
            repo: options.repo,
            state: options.state ?? 'open',
            head: options.head,
            base: options.base,
            per_page: options.perPage ?? 50,
            page: options.page ?? 1,
            sort: 'updated',
            direction: 'desc',
          })
          return data.map(pr => mapPrFields(pr))
        },
        { label: `listPRs ${options.owner}/${options.repo}` }
      )
    } catch (err: any) {
      throw wrapError(err, 'Failed to list PRs')
    }
  },

  async getPRCommits(owner: string, repo: string, number: number): Promise<PullRequestCommit[]> {
    const octokit = getClient()
    const out: PullRequestCommit[] = []
    try {
      for await (const { data } of octokit.paginate.iterator(octokit.pulls.listCommits, {
        owner,
        repo,
        pull_number: number,
        per_page: 100,
      })) {
        for (const c of data) {
          out.push({
            sha: c.sha,
            message: c.commit.message,
            author: c.commit.author?.name ?? c.author?.login ?? null,
            /** Committer time first — matches order along branch; author date can be older after rebase/cherry-pick. */
            date: c.commit.committer?.date ?? c.commit.author?.date ?? null,
          })
        }
      }
      // pulls.listCommits: base → head (cũ → mới). UI cần head (mới nhất) trên cùng.
      out.reverse()
      return out
    } catch (err: any) {
      throw wrapError(err, 'Failed to list PR commits')
    }
  },

  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const octokit = getClient()
    try {
      const { data } = await octokit.repos.get({ owner, repo })
      return data.default_branch
    } catch (err: any) {
      throw wrapError(err, 'Failed to get default branch')
    }
  },

  async listBranches(owner: string, repo: string): Promise<string[]> {
    try {
      return await withGithubRateLimitRetry(
        async () => {
          const octokit = getClient()
          const out: string[] = []
          for await (const { data } of octokit.paginate.iterator(octokit.repos.listBranches, {
            owner,
            repo,
            per_page: 100,
          })) {
            for (const b of data) out.push(b.name)
          }
          return out
        },
        { label: `listBranches ${owner}/${repo}` }
      )
    } catch (err: any) {
      throw wrapError(err, 'Failed to list branches')
    }
  },

  async listBranchCommits(
    owner: string,
    repo: string,
    branch: string,
    perPage: number = 50
  ): Promise<BranchCommit[]> {
    const b = branch?.trim()
    if (!b) return []
    const octokit = getClient()
    try {
      const { data } = await octokit.repos.listCommits({
        owner,
        repo,
        sha: b,
        per_page: Math.max(1, Math.min(100, perPage)),
      })
      return (data ?? []).map((c: any) => ({
        sha: String(c.sha ?? ''),
        shortSha: String(c.sha ?? '').slice(0, 7),
        message: String(c.commit?.message ?? ''),
        author: c.commit?.author?.name ?? c.author?.login ?? null,
        date: c.commit?.author?.date ?? c.commit?.committer?.date ?? null,
        htmlUrl: c.html_url ?? null,
      }))
    } catch (err: any) {
      throw wrapError(err, 'Không lấy được danh sách commit của nhánh')
    }
  },

  async getLatestCommitMessage(owner: string, repo: string, branch: string): Promise<string | null> {
    const octokit = getClient()
    try {
      const { data } = await octokit.repos.listCommits({
        owner,
        repo,
        sha: branch,
        per_page: 1,
      })
      if (!data || data.length === 0) return null
      return data[0].commit.message
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status
      if (status === 401) {
        broadcastTokenInvalid('GitHub token kh\u00f4ng h\u1ee3p l\u1ec7 ho\u1eb7c \u0111\u00e3 h\u1ebft h\u1ea1n.')
      }
      l.warn('getLatestCommitMessage failed:', err?.message)
      return null
    }
  },
}

/**
 * REST PATCH pulls kh\u00f4ng \u00e1p draft th\u1eadt tr\u00ean GitHub (th\u01b0\u1eddng tr\u1ea3 200 nh\u01b0ng b\u1ecf qua field) \u2014 c\u1ea7n node_id + GraphQL.
 */
async function fetchPullRequestNodeId(owner: string, repo: string, number: number): Promise<string> {
  const octokit = getClient()
  const { data } = await octokit.pulls.get({ owner, repo, pull_number: number })
  const nodeId = (data as { node_id?: unknown }).node_id
  if (typeof nodeId !== 'string' || !nodeId.trim()) {
    throw new Error(
      'GitHub API kh\u00f4ng tr\u1ea3 node_id cho PR; kh\u00f4ng th\u1ec3 \u0111\u1ed5i tr\u1ea1ng th\u00e1i draft qua GraphQL.'
    )
  }
  return nodeId.trim()
}

/**
 * B\u1ecf Draft tr\u00ean PR (Ready for review) \u2014 t\u01b0\u01a1ng \u0111\u01b0\u01a1ng n\u00fat \u00abReady for review\u00bb tr\u00ean GitHub.
 * D\u00f9ng GraphQL markPullRequestReadyForReview v\u00ec REST draft:false th\u01b0\u1eddng b\u1ecb GitHub b\u1ecf qua.
 */
export async function markPullRequestReadyForReview(
  owner: string,
  repo: string,
  number: number
): Promise<PullRequestSummary> {
  return withGithubRateLimitRetry(
    async () => {
      const octokit = getClient()
      const pullRequestId = await fetchPullRequestNodeId(owner, repo, number)
      type GqlReady = {
        markPullRequestReadyForReview: { pullRequest: { isDraft: boolean } | null } | null
      }
      const gql = await octokit.graphql<GqlReady>(
        `mutation MarkPullRequestReadyForReview($pullRequestId: ID!) {
          markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
            pullRequest { isDraft }
          }
        }`,
        { pullRequestId }
      )
      const readyIsDraft = gql?.markPullRequestReadyForReview?.pullRequest?.isDraft
      if (readyIsDraft !== false) {
        throw new Error(
          'GitHub GraphQL kh\u00f4ng x\u00e1c nh\u1eadn PR \u0111\u00e3 s\u1eb5n s\u00e0ng review (markPullRequestReadyForReview).'
        )
      }
      return githubClient.getPR(owner, repo, number)
    },
    { label: `markReady ${owner}/${repo}#${number}` }
  )
}

/**
 * Chuy\u1ec3n PR \u0111ang m\u1edf th\u00e0nh Draft (t\u01b0\u01a1ng t\u1ef1 \u00abConvert to draft\u00bb tr\u00ean GitHub).
 * D\u00f9ng GraphQL convertPullRequestToDraft v\u00ec REST draft:true th\u01b0\u1eddng b\u1ecb GitHub b\u1ecf qua (200 OK nh\u01b0ng kh\u00f4ng \u0111\u1ed5i UI).
 */
export async function markPullRequestAsDraft(
  owner: string,
  repo: string,
  number: number
): Promise<PullRequestSummary> {
  return withGithubRateLimitRetry(
    async () => {
      const octokit = getClient()
      const pullRequestId = await fetchPullRequestNodeId(owner, repo, number)
      type GqlDraft = {
        convertPullRequestToDraft: { pullRequest: { isDraft: boolean } | null } | null
      }
      const gql = await octokit.graphql<GqlDraft>(
        `mutation ConvertPullRequestToDraft($pullRequestId: ID!) {
          convertPullRequestToDraft(input: { pullRequestId: $pullRequestId }) {
            pullRequest { isDraft }
          }
        }`,
        { pullRequestId }
      )
      const isDraft = gql?.convertPullRequestToDraft?.pullRequest?.isDraft
      if (isDraft !== true) {
        throw new Error(
          'GitHub GraphQL kh\u00f4ng x\u00e1c nh\u1eadn PR \u0111\u00e3 chuy\u1ec3n sang draft (convertPullRequestToDraft).'
        )
      }
      return githubClient.getPR(owner, repo, number)
    },
    { label: `markDraft ${owner}/${repo}#${number}` }
  )
}

/** \u0110\u00f3ng PR tr\u00ean GitHub (state = closed). */
export async function closePullRequest(owner: string, repo: string, number: number): Promise<PullRequestSummary> {
  return withGithubRateLimitRetry(
    async () => {
      const octokit = getClient()
      await octokit.pulls.update({
        owner,
        repo,
        pull_number: number,
        state: 'closed',
      })
      return githubClient.getPR(owner, repo, number)
    },
    { label: `closePR ${owner}/${repo}#${number}` }
  )
}

/** M\u1edf l\u1ea1i PR \u0111\u00e3 \u0111\u00f3ng (ch\u01b0a merge) \u2014 `state = open`. */
export async function reopenPullRequest(owner: string, repo: string, number: number): Promise<PullRequestSummary> {
  return withGithubRateLimitRetry(
    async () => {
      const octokit = getClient()
      await octokit.pulls.update({
        owner,
        repo,
        pull_number: number,
        state: 'open',
      })
      return githubClient.getPR(owner, repo, number)
    },
    { label: `reopenPR ${owner}/${repo}#${number}` }
  )
}

function normalizeReviewerLogins(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of raw) {
    const t = s.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

/** Y\u00eau c\u1ea7u reviewer (user login) tr\u00ean PR; b\u1ecf tr\u1ed1ng `team_reviewers` (c\u00f3 th\u1ec3 b\u1ed5 sung sau). */
export async function requestPullRequestReviewers(
  owner: string,
  repo: string,
  number: number,
  reviewers: string[]
): Promise<PullRequestSummary> {
  const list = normalizeReviewerLogins(reviewers)
  if (list.length === 0) {
    throw new Error('Thi\u1ebfu danh s\u00e1ch reviewer (login).')
  }
  return withGithubRateLimitRetry(
    async () => {
      const octokit = getClient()
      await octokit.pulls.requestReviewers({
        owner,
        repo,
        pull_number: number,
        reviewers: list,
      })
      return githubClient.getPR(owner, repo, number)
    },
    { label: `requestReviewers ${owner}/${repo}#${number}` }
  )
}

/** User c\u00f3 th\u1ec3 assign tr\u00ean repo (GET /repos/.../assignees) \u2014 d\u00f9ng g\u1ee3i \u00fd picker reviewer. */
export async function listRepositoryAssignees(owner: string, repo: string): Promise<PrAssignee[]> {
  return withGithubRateLimitRetry(
    async () => {
      const octokit = getClient()
      const raw = (await octokit.paginate('GET /repos/{owner}/{repo}/assignees', {
        owner,
        repo,
        per_page: 100,
      })) as { login?: string; id?: number; avatar_url?: string }[]
      return (raw ?? [])
        .map(
          (u): PrAssignee => ({
            login: String(u.login ?? ''),
            id: typeof u.id === 'number' ? u.id : Number(u.id) || 0,
            avatarUrl: typeof u.avatar_url === 'string' ? u.avatar_url : null,
          })
        )
        .filter(a => a.login.length > 0)
    },
    { label: `listAssignees ${owner}/${repo}` }
  )
}

/**
 * GitHub \u00abUpdate branch\u00bb: merge n\u1ed9i dung base v\u00e0o nh\u00e1nh head (pulls.updateBranch, th\u01b0\u1eddng 202).
 */
export async function updatePullRequestBranch(
  owner: string,
  repo: string,
  number: number,
  expectedHeadSha: string | null | undefined
): Promise<PullRequestSummary> {
  return withGithubRateLimitRetry(
    async () => {
      const octokit = getClient()
      await octokit.pulls.updateBranch({
        owner,
        repo,
        pull_number: number,
        ...(expectedHeadSha ? { expected_head_sha: expectedHeadSha } : {}),
      })
      return githubClient.getPR(owner, repo, number)
    },
    { label: `updatePRBranch ${owner}/${repo}#${number}` }
  )
}

const MAX_PR_PATCH_DISPLAY_CHARS = 200_000

/**
 * T\u1ea3i danh s\u00e1ch file v\u00e0 patch (c\u1ea3i thi\u1ec7n) c\u1ee7a PR; c\u1eaft patch qu\u00e1 d\u00e0i \u0111\u1ec3 tr\u00e1nh qu\u00e1 t\u1ea3i b\u1ed9 nh\u1edb.
 */
export async function listPullRequestFiles(
  owner: string,
  repo: string,
  number: number
): Promise<PrChangedFile[]> {
  return withGithubRateLimitRetry(
    async () => {
      const octokit = getClient()
      const raw = (await octokit.paginate(octokit.pulls.listFiles, {
        owner,
        repo,
        pull_number: number,
        per_page: 100,
      })) as any[]
      return (raw ?? []).map((f: any) => {
        const patch: string | null = typeof f.patch === 'string' ? f.patch : null
        const wasTruncated = Boolean(patch && patch.length > MAX_PR_PATCH_DISPLAY_CHARS)
        const truncated =
          wasTruncated && patch
            ? `${patch.slice(0, MAX_PR_PATCH_DISPLAY_CHARS)}\n\n[... b\u1ecb c\u1eaft: patch qu\u00e1 d\u00e0i, xem th\u00eam tr\u00ean GitHub ...]`
            : patch
        return {
          filename: String(f.filename ?? ''),
          status: String(f.status ?? 'modified'),
          patch: truncated,
          patchTruncated: wasTruncated,
          additions: typeof f.additions === 'number' ? f.additions : 0,
          deletions: typeof f.deletions === 'number' ? f.deletions : 0,
          blobUrl: typeof f.blob_url === 'string' ? f.blob_url : null,
        } satisfies PrChangedFile
      })
    },
    { label: `listPullRequestFiles ${owner}/${repo}#${number}` }
  )
}

/**
 * Tương tự `pulls.listFiles` nhưng chỉ trả tên file — không tạo chuỗi `patch` (tiết kiệm bộ nhớ khi phân tích hàng loạt).
 */
export async function listPullRequestFileNames(owner: string, repo: string, number: number): Promise<string[]> {
  return withGithubRateLimitRetry(
    async () => {
      const octokit = getClient()
      const raw = (await octokit.paginate(octokit.pulls.listFiles, {
        owner,
        repo,
        pull_number: number,
        per_page: 100,
      })) as any[]
      return (raw ?? [])
        .map((f: any) => String(f?.filename ?? '').trim())
        .filter(fn => fn.length > 0)
    },
    { label: `listPullRequestFileNames ${owner}/${repo}#${number}` }
  )
}

export async function listPullRequestIssueComments(
  owner: string,
  repo: string,
  number: number
): Promise<PrIssueComment[]> {
  return withGithubRateLimitRetry(
    async () => {
      const octokit = getClient()
      const raw = (await octokit.paginate(octokit.issues.listComments, {
        owner,
        repo,
        issue_number: number,
        per_page: 100,
      })) as any[]
      return (raw ?? []).map((c: any) => ({
        id: Number(c.id) || 0,
        body: typeof c.body === 'string' ? c.body : '',
        userLogin: c.user && typeof c.user.login === 'string' ? c.user.login : null,
        userAvatarUrl: c.user && typeof c.user.avatar_url === 'string' ? c.user.avatar_url : null,
        createdAt: String(c.created_at ?? ''),
        updatedAt: String(c.updated_at ?? ''),
        htmlUrl: typeof c.html_url === 'string' ? c.html_url : null,
      }))
    },
    { label: `listPullRequestIssueComments ${owner}/${repo}#${number}` }
  )
}

/**
 * G\u1ed9p timeline g\u1ea7n v\u1edbi tab Conversation tr\u00ean GitHub: issue comments + pull request reviews
 * (duy\u1ec7t / b\u00ecnh lu\u1eadn review) + review comments tr\u00ean t\u1eebng d\u00f2ng (diff). Ch\u1ec9 d\u00f9ng issues.listComments th\u00ec c\u1ea1n
 * c\u1ea3 PR ch\u1ec9 c\u00f3 ho\u1ea1t \u0111\u1ed9ng review, kh\u00f4ng c\u00f3 b\u00ecnh lu\u1eadn issue s\u1eb5n.
 */
export async function listPullRequestConversation(
  owner: string,
  repo: string,
  number: number
): Promise<PrConversationEntry[]> {
  return withGithubRateLimitRetry(
    async () => {
      const octokit = getClient()
      const [issueRows, reviewRows, inlineRows] = await Promise.all([
        octokit.paginate(octokit.issues.listComments, {
          owner,
          repo,
          issue_number: number,
          per_page: 100,
        }),
        octokit.paginate(octokit.pulls.listReviews, {
          owner,
          repo,
          pull_number: number,
          per_page: 100,
        }),
        octokit.paginate(octokit.pulls.listReviewComments, {
          owner,
          repo,
          pull_number: number,
          per_page: 100,
        }),
      ])
      const out: PrConversationEntry[] = []
      for (const c of issueRows ?? []) {
        out.push({
          kind: 'issue',
          id: Number(c.id) || 0,
          body: typeof c.body === 'string' ? c.body : '',
          userLogin: c.user && typeof c.user.login === 'string' ? c.user.login : null,
          userAvatarUrl: c.user && typeof c.user.avatar_url === 'string' ? c.user.avatar_url : null,
          createdAt: String(c.created_at ?? ''),
          updatedAt: String(c.updated_at ?? ''),
          htmlUrl: typeof c.html_url === 'string' ? c.html_url : null,
          reviewState: null,
        })
      }
      type ReviewRow = {
        id: number
        state?: string | null
        submitted_at?: string | null
        created_at?: string | null
        updated_at?: string | null
        body?: string | null
        html_url?: string | null
        user?: { login?: string | null; avatar_url?: string | null } | null
      }
      for (const r of (reviewRows ?? []) as ReviewRow[]) {
        if (r.state === 'PENDING') continue
        const sub = typeof r.submitted_at === 'string' && r.submitted_at ? r.submitted_at : null
        const t = sub || String(r.created_at ?? r.updated_at ?? new Date(0).toISOString())
        out.push({
          kind: 'review',
          id: Number(r.id) || 0,
          body: typeof r.body === 'string' ? r.body : '',
          userLogin: r.user && typeof r.user.login === 'string' ? r.user.login : null,
          userAvatarUrl: r.user && typeof r.user.avatar_url === 'string' ? r.user.avatar_url : null,
          createdAt: t,
          updatedAt: t,
          htmlUrl: typeof r.html_url === 'string' ? r.html_url : null,
          reviewState: r.state != null ? String(r.state) : null,
        })
      }
      for (const c of inlineRows ?? []) {
        out.push({
          kind: 'inline',
          id: Number(c.id) || 0,
          body: typeof c.body === 'string' ? c.body : '',
          userLogin: c.user && typeof c.user.login === 'string' ? c.user.login : null,
          userAvatarUrl: c.user && typeof c.user.avatar_url === 'string' ? c.user.avatar_url : null,
          createdAt: String(c.created_at ?? ''),
          updatedAt: String(c.updated_at ?? ''),
          htmlUrl: typeof c.html_url === 'string' ? c.html_url : null,
          reviewState: null,
          filePath: typeof c.path === 'string' ? c.path : null,
        })
      }
      out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      return out
    },
    { label: `listPullRequestConversation ${owner}/${repo}#${number}` }
  )
}

export async function createPullRequestIssueComment(
  owner: string,
  repo: string,
  number: number,
  body: string
): Promise<PrIssueComment> {
  const octokit = getClient()
  const { data: c } = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: number,
    body,
  })
  return {
    id: Number(c.id) || 0,
    body: typeof c.body === 'string' ? c.body : '',
    userLogin: c.user && typeof c.user.login === 'string' ? c.user.login : null,
    userAvatarUrl: c.user && typeof c.user.avatar_url === 'string' ? c.user.avatar_url : null,
    createdAt: String(c.created_at ?? ''),
    updatedAt: String(c.updated_at ?? ''),
    htmlUrl: typeof c.html_url === 'string' ? c.html_url : null,
  }
}

/**
 * T\u1ea1o review APPROVE tr\u00ean commit head hi\u1ec7n t\u1ea1i c\u1ee7a PR.
 */
export async function createPullRequestReviewApproval(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
  body?: string
): Promise<PrReviewResult> {
  const sha = (headSha ?? '').trim()
  if (!sha) {
    throw new Error('Thi\u1ebfu head SHA c\u1ee7a PR (commit_id) \u0111\u1ec3 duy\u1ec7t.')
  }
  const octokit = getClient()
  try {
    const { data } = await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: number,
      commit_id: sha,
      event: 'APPROVE',
      body: body && body.trim() ? body.trim() : undefined,
    })
    return {
      id: Number(data.id) || 0,
      state: String(data.state ?? 'APPROVED'),
      htmlUrl: typeof data.html_url === 'string' ? data.html_url : null,
    }
  } catch (err: any) {
    l.error('createPullRequestReviewApproval failed:', err?.message)
    throw wrapError(err, 'Duy\u1ec7t PR th\u1ea5t b\u1ea1i')
  }
}

/** Chu\u1ea9n ho\u00e1 t\u00ean nh\u00e1nh so kh\u1edbp v\u1edbi `repos.listBranches` / `getBranch` (t\u00ean ng\u1eafn, kh\u00f4ng prefix). */
function normalizeGithubBranchRefName(raw: string): string {
  let b = (raw ?? '').trim()
  if (!b) return ''
  if (b.startsWith('refs/heads/')) b = b.slice('refs/heads/'.length).trim()
  const low = b.toLowerCase()
  if (low.startsWith('origin/')) b = b.slice('origin/'.length)
  return b.trim()
}

/** C\u00f2n ref `refs/heads/<branch>` tr\u00ean GitHub (404 = \u0111\u00e3 x\u00f3a ho\u1eb7c ch\u01b0a t\u1ed3n t\u1ea1i). */
export async function githubRemoteBranchExists(owner: string, repo: string, branch: string): Promise<boolean> {
  const b = normalizeGithubBranchRefName(branch)
  if (!b) return false
  const octokit = getClient()
  try {
    await octokit.repos.getBranch({ owner, repo, branch: b })
    return true
  } catch (err: any) {
    const status = err?.status ?? err?.response?.status
    if (status === 404) return false
    throw wrapError(err, 'Kh\u00f4ng ki\u1ec3m tra \u0111\u01b0\u1ee3c nh\u00e1nh tr\u00ean GitHub')
  }
}

/**
 * Ki\u1ec3m tra nhi\u1ec1u nh\u00e1nh c\u00f2n tr\u00ean remote: gom theo (owner, repo), m\u1ed7i repo g\u1ecdi
 * `listBranches` (paginate) m\u1ed9t l\u1ea7n r\u1ed3i so t\u1eadn t\u1ea1i t\u00ean nh\u00e1nh.
 * C\u00e1ch n\u00e0y thay cho N l\u1ea7n `getBranch` (tr\u00e1nh rate limit, log/403 spam).
 */
export async function githubRemoteBranchesExistenceMap(
  items: { id: string; owner: string; repo: string; branch: string }[]
): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {}
  if (!items.length) return out

  const byRepo = new Map<string, { owner: string; repo: string; rows: { id: string; branch: string }[] }>()

  for (const it of items) {
    const o = (it.owner ?? '').trim()
    const r = (it.repo ?? '').trim()
    if (!o || !r) {
      out[it.id] = false
      continue
    }
    const key = `${o}/${r}`
    const g = byRepo.get(key) ?? { owner: o, repo: r, rows: [] }
    g.rows.push({ id: it.id, branch: normalizeGithubBranchRefName(it.branch ?? '') })
    byRepo.set(key, g)
  }

  for (const { owner, repo, rows } of byRepo.values()) {
    let names: Set<string>
    try {
      const list = await githubClient.listBranches(owner, repo)
      names = new Set(list)
    } catch (err) {
      l.warn(`listBranches for ${owner}/${repo} (existence check):`, (err as Error)?.message)
      for (const { id } of rows) {
        out[id] = false
      }
      continue
    }
    for (const { id, branch } of rows) {
      out[id] = Boolean(branch) && names.has(branch)
    }
  }

  return out
}

/**
 * Xo\u00e1 `refs/heads/<branch>` tr\u00ean GitHub (sau khi \u0111\u00e3 merge).
 * Kh\u00f4ng d\u00f9ng cho nh\u00e1nh m\u1eb7c \u0111\u1ecbnh (main/master/...) ho\u1eb7c c\u00f9ng t\u00ean default branch c\u1ee7a repo.
 */
export async function githubDeleteRemoteBranch(
  owner: string,
  repo: string,
  branch: string,
  options?: { defaultBaseBranch?: string | null }
): Promise<void> {
  const b = branch?.trim()
  if (!b) {
    throw new Error('Thi\u1ebfu t\u00ean nh\u00e1nh.')
  }
  const prot = new Set(['main', 'master', 'develop', 'gh-pages'])
  if (prot.has(b.toLowerCase())) {
    throw new Error('Kh\u00f4ng xo\u00e1 nh\u00e1nh b\u1ea3o v\u1ec7 (main, master, ...).')
  }
  const def = options?.defaultBaseBranch?.trim().toLowerCase()
  if (def && b.toLowerCase() === def) {
    throw new Error('Kh\u00f4ng xo\u00e1 nh\u00e1nh m\u1eb7c \u0111\u1ecbnh c\u1ee7a repo (default branch).')
  }
  const octokit = getClient()
  const ref = `heads/${b}`
  try {
    await octokit.git.deleteRef({ owner, repo, ref })
  } catch (err: any) {
    throw wrapError(err, 'Xo\u00e1 nh\u00e1nh tr\u00ean GitHub th\u1ea5t b\u1ea1i')
  }
}

/** Test nhanh token + k\u1ebft n\u1ed1i: g\u1ecdi GET /user. */
export async function testGithubToken(): Promise<{ ok: boolean; login?: string; error?: string }> {
  const token = getGithubToken()
  if (!token) {
    return { ok: false, error: 'GitHub token ch\u01b0a \u0111\u01b0\u1ee3c c\u1ea5u h\u00ecnh.' }
  }

  try {
    resetGithubClient()
    const octokit = getClient()
    const { data } = await octokit.users.getAuthenticated()
    return { ok: true, login: data.login }
  } catch (err: any) {
    l.warn(
      'testGithubToken failed:',
      err?.status,
      'content-type=',
      getResponseContentType(err) || '?',
      normalizeGithubApiErrorMessage(err)
    )
    return { ok: false, error: normalizeGithubApiErrorMessage(err) }
  }
}
