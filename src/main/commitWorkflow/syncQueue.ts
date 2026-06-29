import Store from 'electron-store'
import l from 'electron-log'
import type { CommitWorkflowRunRecord } from 'shared/commitWorkflow/types'
import { hasDbConfig } from '../task/schema/db'
import { upsertCommitWorkflowRunFromSync } from './db'

type SyncEntry = {
  run: CommitWorkflowRunRecord
  enqueuedAt: string
  retryCount: number
  lastAttemptAt: string | null
}

const syncStore = new Store<{ queue: SyncEntry[] }>({
  name: 'commit-workflow-sync',
  defaults: { queue: [] },
})

const MAX_RETRIES = 8
const RETRY_BASE_MS = 30_000

export function enqueueSyncRun(run: CommitWorkflowRunRecord): void {
  const queue = syncStore.get('queue')
  const existing = queue.find(e => e.run.id === run.id)
  const filtered = queue.filter(e => e.run.id !== run.id)
  filtered.push({
    run,
    enqueuedAt: existing?.enqueuedAt ?? new Date().toISOString(),
    retryCount: existing?.retryCount ?? 0,
    lastAttemptAt: existing?.lastAttemptAt ?? null,
  })
  syncStore.set('queue', filtered)
}

function shouldAttemptSync(entry: SyncEntry): boolean {
  if (entry.retryCount >= MAX_RETRIES) return false
  if (!entry.lastAttemptAt) return true
  const backoff = RETRY_BASE_MS * 2 ** Math.min(entry.retryCount, 5)
  return Date.now() - new Date(entry.lastAttemptAt).getTime() >= backoff
}

export async function flushSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (!hasDbConfig()) return { synced: 0, failed: 0 }
  const queue = [...syncStore.get('queue')]
  let synced = 0
  let failed = 0
  const remaining: SyncEntry[] = []
  for (const entry of queue) {
    if (!shouldAttemptSync(entry)) {
      remaining.push(entry)
      continue
    }
    try {
      await upsertCommitWorkflowRunFromSync(entry.run)
      synced++
    } catch (e) {
      l.warn('[commit-workflow] sync flush failed for', entry.run.id, e)
      failed++
      remaining.push({
        ...entry,
        retryCount: entry.retryCount + 1,
        lastAttemptAt: new Date().toISOString(),
      })
    }
  }
  syncStore.set('queue', remaining)
  return { synced, failed }
}

export function getSyncQueueStatus(): { pending: number; retrying: number } {
  const queue = syncStore.get('queue')
  return {
    pending: queue.length,
    retrying: queue.filter(e => e.retryCount > 0).length,
  }
}

let scheduledFlushTimer: ReturnType<typeof setTimeout> | null = null
let flushInFlight: Promise<{ synced: number; failed: number }> | null = null

/** Debounced background flush — coalesces multiple enqueue calls per run window. */
export function scheduleSyncFlush(delayMs = 2500): void {
  if (scheduledFlushTimer) clearTimeout(scheduledFlushTimer)
  scheduledFlushTimer = setTimeout(() => {
    scheduledFlushTimer = null
    if (flushInFlight) return
    flushInFlight = flushSyncQueue()
      .catch(err => {
        l.warn('[commit-workflow] scheduled sync flush failed', err)
        return { synced: 0, failed: 0 }
      })
      .finally(() => {
        flushInFlight = null
      })
  }, delayMs)
}
