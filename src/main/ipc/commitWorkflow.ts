/**
 * Commit Workflow IPC handlers.
 */
import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import type { CommitWorkflowListFilters, CommitWorkflowStartPayload } from 'shared/commitWorkflow/types'
import { getTokenFromStore, verifyToken } from '../task/auth'
import { hasDbConfig } from '../task/schema/db'
import { canSessionViewTargetUser, filterUserIdsVisibleToSession } from '../task/progressAccess'
import { listCommitWorkflowRuns, compareCommitWorkflowRunsByStartedAtDesc } from '../commitWorkflow/db'
import {
  cancelCommitWorkflowRun,
  getActiveCommitWorkflowRun,
  getLocalCommitWorkflowRuns,
  loadCommitWorkflowRun,
  resolveActiveCommitWorkflowRunForProject,
  startCommitWorkflow,
} from '../commitWorkflow/runner'
import { flushSyncQueue, getSyncQueueStatus } from '../commitWorkflow/syncQueue'

type Envelope<T = unknown> = { status: 'success' | 'error'; data?: T; message?: string }

function ok<T>(data?: T): Envelope<T> {
  return { status: 'success', data }
}

function fail(message: string): Envelope<never> {
  l.warn('[commit-workflow] handler error:', message)
  return { status: 'error', message }
}

function currentSession() {
  const token = getTokenFromStore()
  if (!token) return null
  return verifyToken(token)
}

export function registerCommitWorkflowIpcHandlers(): void {
  ipcMain.handle(IPC.COMMIT_WORKFLOW.START, async (_e, payload: CommitWorkflowStartPayload) => {
    const session = currentSession()
    if (!session) return fail('Not signed in.')
    try {
      const runId = await startCommitWorkflow(session.userId, payload)
      if (!runId) return fail('Could not start commit workflow.')
      return ok({ runId })
    } catch (e) {
      return fail((e as Error).message)
    }
  })

  ipcMain.handle(IPC.COMMIT_WORKFLOW.CANCEL, async (_e, runId: string) => {
    const cancelled = cancelCommitWorkflowRun(runId)
    return ok({ cancelled })
  })

  ipcMain.handle(IPC.COMMIT_WORKFLOW.GET_ACTIVE, async (_e, repoPath?: string) => {
    return ok(getActiveCommitWorkflowRun(repoPath))
  })

  ipcMain.handle(IPC.COMMIT_WORKFLOW.GET_ACTIVE_FOR_PROJECT, async (_e, projectId: string) => {
    try {
      const active = await resolveActiveCommitWorkflowRunForProject(projectId)
      return ok(active)
    } catch (e) {
      return fail((e as Error).message)
    }
  })

  ipcMain.handle(IPC.COMMIT_WORKFLOW.GET_RUN, async (_e, runId: string) => {
    const session = currentSession()
    if (!session) return fail('Not signed in.')
    const run = await loadCommitWorkflowRun(runId)
    if (!run) return fail('Run not found.')
    const allowed = await canSessionViewTargetUser(session, run.userId)
    if (!allowed) return fail('Not authorized.')
    return ok(run)
  })

  ipcMain.handle(IPC.COMMIT_WORKFLOW.LIST_RUNS, async (_e, filters: CommitWorkflowListFilters) => {
    const session = currentSession()
    if (!session) return fail('Not signed in.')
    try {
      let userIds: string[] | undefined
      if (filters.userId) {
        const allowed = await canSessionViewTargetUser(session, filters.userId)
        if (!allowed) return fail('Not authorized.')
        userIds = [filters.userId]
      } else {
        const r = (session.role || '').toLowerCase()
        if (r === 'dev') {
          userIds = [session.userId]
        }
      }
      if (hasDbConfig()) {
        const rows = await listCommitWorkflowRuns({ ...filters, userIds, userId: undefined })
        const local = getLocalCommitWorkflowRuns(filters.repoPath, filters.limit ?? 20)
        const dbIds = new Set(rows.map(r => r.id))
        const merged = [...rows, ...local.filter(lr => !dbIds.has(lr.id))]
        merged.sort(compareCommitWorkflowRunsByStartedAtDesc)
        const limited = merged.slice(0, filters.limit ?? 20)
        if (userIds) return ok(limited)
        const visibleIds = await filterUserIdsVisibleToSession(
          session,
          limited.map(r => r.userId)
        )
        const set = new Set(visibleIds)
        return ok(limited.filter(r => set.has(r.userId)))
      }
      const local = getLocalCommitWorkflowRuns(filters.repoPath, filters.limit ?? 10)
      return ok(local)
    } catch (e) {
      return fail((e as Error).message)
    }
  })

  ipcMain.handle(IPC.COMMIT_WORKFLOW.SYNC_FLUSH, async () => {
    try {
      const result = await flushSyncQueue()
      return ok(result)
    } catch (e) {
      return fail((e as Error).message)
    }
  })

  ipcMain.handle(IPC.COMMIT_WORKFLOW.GET_SYNC_STATUS, async () => {
    return ok(getSyncQueueStatus())
  })
}
