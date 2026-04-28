import type { PrRepo } from '../task/mysqlPrTrackingStore'

export type TrackedRowLite = { id: string; repoId: string; branchName: string }

export type PruneRemotePreviewRow = { id: string; branchName: string; repoKey: string }

/** Đồng bộ quy ước với sync GitHub trong pr.ts (existingBranchNames). */
export function normalizeBranchNameForCompare(name: string): string {
  return name.trim().toLowerCase()
}

export async function computeTrackedIdsNotOnRemote(args: {
  repos: PrRepo[]
  trackedRows: TrackedRowLite[]
  listRemoteBranchNames: (owner: string, repo: string) => Promise<string[]>
}): Promise<{ ids: string[]; errors: string[]; preview: PruneRemotePreviewRow[] }> {
  const { repos, trackedRows, listRemoteBranchNames } = args
  const ids: string[] = []
  const errors: string[] = []
  const preview: PruneRemotePreviewRow[] = []

  for (const repo of repos) {
    let remoteNames: string[]
    try {
      remoteNames = await listRemoteBranchNames(repo.owner, repo.repo)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${repo.owner}/${repo.repo}: ${msg}`)
      continue
    }
    const remoteSet = new Set(remoteNames.map(n => normalizeBranchNameForCompare(n)))
    for (const row of trackedRows) {
      if (row.repoId !== repo.id) continue
      const key = normalizeBranchNameForCompare(row.branchName)
      if (!remoteSet.has(key)) {
        ids.push(row.id)
        preview.push({
          id: row.id,
          branchName: row.branchName,
          repoKey: `${repo.owner}/${repo.repo}`,
        })
      }
    }
  }

  return { ids, errors, preview }
}
