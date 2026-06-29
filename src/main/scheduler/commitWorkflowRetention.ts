import l from 'electron-log'
import { deleteCommitWorkflowRunsOlderThan } from '../commitWorkflow/db'
import { pruneLocalCommitWorkflowRuns } from '../commitWorkflow/runner'
import { hasDbConfig } from '../task/schema/db'

const RUN_EVERY_MS = 24 * 60 * 60 * 1000
const RETENTION_DAYS = 90

async function runOnce(): Promise<void> {
  try {
    const localPruned = pruneLocalCommitWorkflowRuns(RETENTION_DAYS)
    if (localPruned > 0) {
      l.info(`[commit-workflow] retention pruned ${localPruned} local runs`)
    }
    if (!hasDbConfig()) return
    const deleted = await deleteCommitWorkflowRunsOlderThan(RETENTION_DAYS)
    if (deleted > 0) {
      l.info(`[commit-workflow] retention pruned ${deleted} DB runs older than ${RETENTION_DAYS} days`)
    }
  } catch (err) {
    l.warn('[commit-workflow] retention prune failed', err)
  }
}

export function startCommitWorkflowRetentionScheduler(): void {
  setTimeout(() => {
    void runOnce()
  }, 120_000)
  setInterval(() => {
    void runOnce()
  }, RUN_EVERY_MS)
}
