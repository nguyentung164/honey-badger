import type { PrCheckpointTemplate, TrackedBranchRow } from './hooks/usePrData'

export type PrFileOverlapCandidate = {
  owner: string
  repo: string
  number: number
  title: string | null
  /** Từ GitHub sync (checkpoint). */
  author: string | null
  branchName: string
  prUrl: string | null
}

/**
 * Các PR open (kể cả draft) từ board — dedupe theo `owner/repo#number`.
 * Chỉ lấy khi `ghPrState === 'open'` (đã sync); bỏ merged/closed.
 */
export function collectOpenPrsForFileOverlap(tracked: TrackedBranchRow[], activeTemplates: PrCheckpointTemplate[]): PrFileOverlapCandidate[] {
  const byKey = new Map<string, PrFileOverlapCandidate>()
  const prTpls = activeTemplates.filter(t => t.code.toLowerCase().startsWith('pr_'))
  for (const row of tracked) {
    for (const tpl of prTpls) {
      const prCp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
      if (!prCp?.prNumber) continue
      const mergeTpl = activeTemplates.find(t => t.code.toLowerCase().startsWith('merge_') && t.targetBranch === tpl.targetBranch)
      const mergeCp = mergeTpl ? (row.checkpoints.find(c => c.templateId === mergeTpl.id) ?? null) : null
      if (mergeCp?.mergedAt || prCp.ghPrMerged === true) continue
      if (prCp.ghPrState === 'closed') continue
      if (prCp.ghPrState !== 'open') continue
      const k = `${row.repoOwner.toLowerCase()}/${row.repoRepo.toLowerCase()}#${prCp.prNumber}`
      if (byKey.has(k)) continue
      byKey.set(k, {
        owner: row.repoOwner,
        repo: row.repoRepo,
        number: prCp.prNumber,
        title: prCp.ghPrTitle,
        author: prCp.ghPrAuthor,
        branchName: row.branchName,
        prUrl: prCp.prUrl,
      })
    }
  }
  return [...byKey.values()].sort((a, b) => a.owner.localeCompare(b.owner) || a.repo.localeCompare(b.repo) || a.number - b.number)
}

export function buildGithubPrUrl(owner: string, repo: string, number: number): string {
  return `https://github.com/${owner}/${repo}/pull/${number}`
}
