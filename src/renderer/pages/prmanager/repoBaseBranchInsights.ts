import type { PrCheckpointTemplate } from './hooks/usePrData'

export type BaseBranchInsightDto = {
  branch: string
  tipCommitAt: string | null
  tipCommitSha: string | null
  tipShortSha: string | null
  tipSubject: string | null
  lastMergedPr: {
    number: number
    title: string
    mergedAt: string
    mergedBy: string | null
    htmlUrl: string
  } | null
}

export type RepoBaseInsightsMap = Record<string, Record<string, BaseBranchInsightDto>>

export function baseBranchInsightKey(branch: string): string {
  let b = (branch ?? '').trim()
  if (!b) return ''
  if (b.startsWith('refs/heads/')) b = b.slice('refs/heads/'.length).trim()
  if (b.toLowerCase().startsWith('origin/')) b = b.slice('origin/'.length)
  return b.trim().toLowerCase()
}

/** Nhánh base duy nhất từ các template pr_* (targetBranch). */
export function collectProjectBaseBranches(templates: PrCheckpointTemplate[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tpl of templates) {
    if (!tpl.code.toLowerCase().startsWith('pr_')) continue
    const b = (tpl.targetBranch ?? '').trim()
    if (!b) continue
    const key = baseBranchInsightKey(b)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(b)
  }
  return out
}

export function githubCommitUrl(owner: string, repo: string, sha: string): string {
  const o = (owner ?? '').trim()
  const r = (repo ?? '').trim()
  const s = (sha ?? '').trim()
  if (!o || !r || !s) return ''
  return `https://github.com/${o}/${r}/commit/${s}`
}
