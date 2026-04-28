import type { PrRepo, TrackedBranchRow } from './hooks/usePrData'

/** Trả JSON object đầu tiên trong chuỗi (bỏ ```json fenced). */
export function extractFirstJsonObject(raw: string): string {
  let s = raw.trim()
  const fence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?```$/m
  const m = s.match(fence)
  if (m?.[1]) s = m[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('parse_json')
  return s.slice(start, end + 1)
}

export type ParsedAiIntent =
  | { intent: 'create_pr'; head: string | null; base: string | null; repo_hint: string | null }
  | {
      intent: 'create_pr_multi'
      targets: Array<{ head: string | null; base: string | null; repo_hint: string | null }>
    }
  | { intent: 'reply'; message: string }

export function parseAiIntent(raw: string): ParsedAiIntent {
  const js = extractFirstJsonObject(raw)
  const obj = JSON.parse(js) as Record<string, unknown>
  const intent = obj.intent
  if (intent === 'reply' && typeof obj.message === 'string') {
    return { intent: 'reply', message: obj.message.trim() || '…' }
  }
  if (intent === 'create_pr_multi') {
    const rawT = obj.targets
    if (!Array.isArray(rawT) || rawT.length === 0) {
      return { intent: 'reply', message: 'Không hiểu yêu cầu đa PR.' }
    }
    const targets: Array<{ head: string | null; base: string | null; repo_hint: string | null }> = []
    const cap = rawT.slice(0, 20)
    for (const item of cap) {
      if (typeof item !== 'object' || item === null) continue
      const o = item as Record<string, unknown>
      const hs = typeof o.head === 'string' ? o.head.trim() : ''
      const bs = typeof o.base === 'string' ? o.base.trim() : ''
      const rs = typeof o.repo_hint === 'string' ? o.repo_hint.trim() : ''
      targets.push({
        head: hs.length ? hs : null,
        base: bs.length ? bs : null,
        repo_hint: rs.length ? rs : null,
      })
    }
    if (!targets.length) {
      return { intent: 'reply', message: 'Không có mục hợp lệ trong create_pr_multi.' }
    }
    return { intent: 'create_pr_multi', targets }
  }
  if (intent === 'create_pr') {
    const hs = typeof obj.head === 'string' ? obj.head.trim() : ''
    const bs = typeof obj.base === 'string' ? obj.base.trim() : ''
    const rs = typeof obj.repo_hint === 'string' ? obj.repo_hint.trim() : ''
    return {
      intent: 'create_pr',
      head: hs.length ? hs : null,
      base: bs.length ? bs : null,
      repo_hint: rs.length ? rs : null,
    }
  }
  return {
    intent: 'reply',
    message: typeof obj.message === 'string' ? obj.message.trim() || 'Không hiểu yêu cầu.' : 'Không hiểu yêu cầu.',
  }
}

export function buildTrackedContextJson(rows: TrackedBranchRow[], maxItems = 600): string {
  const sliced = rows.slice(0, maxItems)
  return JSON.stringify(
    sliced.map(r => ({
      repoId: r.repoId,
      owner: r.repoOwner,
      repo: r.repoRepo,
      branchName: r.branchName,
    }))
  )
}

/** Regex nhanh: không gọi API khi nhận dạng được cấu trúc tạo PR. */
export function parseHeuristicCreatePr(text: string): { head: string; base: string; repoHint: string | null } | null {
  const raw = text.trim()
  const vn = /(?:tạo|tao)\s+pr\s+cho\s+(?:nhánh\s+|branch\s+)?(?:["']?)([^\s"']+)(?:["']?)\s+vào\s+(?:nhánh\s+|branch\s+)?(?:["']?)([^\s"']+)(?:["']?)/iu
  const vn2 = /(?:tạo|tao)\s+pr\s+(?:cho\s+(?:nhánh\s+|branch\s+)?)?(?:["']?)([^\s"']+)(?:["']?)\s+vào\s+(?:nhánh\s+|branch\s+)?(?:["']?)([^\s"']+)(?:["']?)/iu
  const en = /create\s+(?:a\s+)?pr\s+(?:for\s+(?:branch\s+)?)?(?:["']?)([^\s"']+)(?:["']?)\s+(?:into|to)\s+(?:branch\s+)?(?:["']?)([^\s"']+)(?:["']?)/iu
  for (const re of [vn, vn2, en]) {
    const m = raw.match(re)
    if (m?.[1] && m[2]) {
      return { head: m[1].trim(), base: m[2].trim(), repoHint: extractRepoHint(raw) }
    }
  }
  return null
}

function extractRepoHint(s: string): string | null {
  const m = s.match(/\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\b/)
  return m?.[1] ?? null
}

function matchesRepoHint(row: TrackedBranchRow, hint: string | null): boolean {
  if (!hint?.trim()) return true
  const h = hint.trim().toLowerCase()
  const full = `${row.repoOwner}/${row.repoRepo}`.toLowerCase()
  return full === h || full.includes(h) || h.includes(full)
}

function pickRowsByHeadToken(token: string, pool: TrackedBranchRow[]): TrackedBranchRow[] {
  const t = token.trim()
  if (!t) return []
  const tl = t.toLowerCase()
  const exact = pool.filter(r => r.branchName.toLowerCase() === tl)
  if (exact.length) return exact
  const contains = pool.filter(r => r.branchName.toLowerCase().includes(tl))
  if (contains.length) return contains
  const ticket = /[A-Za-z]+-\d+/.exec(t)
  if (ticket) {
    const key = ticket[0].toLowerCase()
    return pool.filter(r => r.branchName.toLowerCase().includes(key))
  }
  return []
}

export type ResolveBranchCandidate = { label: string; branch: string; owner: string; repo: string }

export type ResolveCreatePrOk = {
  ok: true
  repo: PrRepo
  head: string
  base: string
  /** Dòng tracked khớp (nếu có). */
  matchedRow: TrackedBranchRow | null
}

export type ResolveCreatePrErr = {
  ok: false
  code: 'ambiguous' | 'no_repo' | 'no_head' | 'no_match'
  message: string
  candidates?: ResolveBranchCandidate[]
}

export function resolveCreatePrTarget(
  headToken: string | null,
  baseToken: string | null,
  repoHint: string | null,
  tracked: TrackedBranchRow[],
  repos: PrRepo[]
): ResolveCreatePrOk | ResolveCreatePrErr {
  if (!repos.length) {
    return { ok: false, code: 'no_repo', message: 'no_repo' }
  }
  const ht = headToken?.trim() ?? ''
  const pool = tracked.filter(r => matchesRepoHint(r, repoHint))
  const searchPool = pool.length ? pool : tracked

  if (!ht) {
    return { ok: false, code: 'no_head', message: 'no_head' }
  }

  const rows = pickRowsByHeadToken(ht, searchPool)
  const uniqByBranch = new Map<string, TrackedBranchRow>()
  for (const r of rows) uniqByBranch.set(r.branchName, r)
  const uniqueRows = [...uniqByBranch.values()]

  if (uniqueRows.length > 1) {
    return {
      ok: false,
      code: 'ambiguous',
      message: 'ambiguous',
      candidates: uniqueRows.slice(0, 12).map(r => ({
        label: `${r.repoOwner}/${r.repoRepo}`,
        branch: r.branchName,
        owner: r.repoOwner,
        repo: r.repoRepo,
      })),
    }
  }

  let repo: PrRepo | undefined
  let matchedRow: TrackedBranchRow | null = null
  let headRef = ht

  if (uniqueRows.length === 1) {
    const only = uniqueRows[0]
    matchedRow = only
    headRef = only.branchName
    repo = repos.find(r => r.id === only.repoId)
  } else {
    const narrowed = repoHint?.trim() ? repos.filter(r => `${r.owner}/${r.repo}`.toLowerCase().includes(repoHint.trim().toLowerCase())) : repos
    const pick = narrowed.length === 1 ? narrowed[0] : repos.length === 1 ? repos[0] : undefined
    if (!pick) {
      return {
        ok: false,
        code: 'no_match',
        message: 'no_match_untracked',
      }
    }
    repo = pick
    headRef = ht
  }

  if (!repo) {
    return { ok: false, code: 'no_repo', message: 'no_repo' }
  }

  const bt = baseToken?.trim()
  const base = bt && bt.length > 0 ? bt : matchedRow ? repo.defaultBaseBranch?.trim() || 'main' : repo.defaultBaseBranch?.trim() || 'main'

  return {
    ok: true,
    repo,
    head: headRef,
    base,
    matchedRow,
  }
}
