import l from 'electron-log'
import { githubClient } from '../git-hosting/github'
import { hasGithubToken } from '../git-hosting/tokenStore'
import { onPrMerged } from '../pr-automation/engine'
import { hasDbConfig } from '../task/db'
import { listPendingCheckpoints } from '../task/mysqlPrTrackingStore'

const POLL_INTERVAL_MS = 5 * 60 * 1000

let started = false
let timer: NodeJS.Timeout | null = null
let running = false

async function tick(): Promise<void> {
  if (running) return
  running = true
  try {
    if (!hasGithubToken() || !hasDbConfig()) return
    const pending = await listPendingCheckpoints()
    if (pending.length === 0) return
    l.info(`[prStatusSync] checking ${pending.length} pending checkpoints`)
    const seen = new Set<string>()
    for (const cp of pending) {
      const key = `${cp.owner}/${cp.repo}#${cp.prNumber}`
      if (seen.has(key) || !cp.prNumber) continue
      seen.add(key)
      try {
        const pr = await githubClient.getPR(cp.owner, cp.repo, cp.prNumber)
        if (pr.merged && pr.mergedAt) {
          await onPrMerged({
            projectId: cp.projectId,
            repoId: cp.repoId,
            prNumber: cp.prNumber,
            sourceBranch: pr.head,
            targetBranch: pr.base,
            prTitle: pr.title,
            prUrl: pr.htmlUrl,
            github: { draft: pr.draft, state: pr.state, merged: pr.merged },
            prAuthor: pr.author ?? null,
            mergedAt: pr.mergedAt,
            mergedBy: pr.mergedBy ?? null,
          })
        }
      } catch (err: any) {
        l.warn(`[prStatusSync] failed to check ${key}:`, err?.message)
      }
    }
  } catch (err) {
    l.error('[prStatusSync] tick error:', err)
  } finally {
    running = false
  }
}

export function startPrStatusSync(): void {
  if (started) return
  started = true
  l.info('[prStatusSync] scheduler started (interval 5m)')
  setTimeout(() => {
    void tick()
  }, 30_000)
  timer = setInterval(() => {
    void tick()
  }, POLL_INTERVAL_MS)
}

export function stopPrStatusSync(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}
