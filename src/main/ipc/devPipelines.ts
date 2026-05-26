/**
 * Dev Pipelines IPC — build/release flow orchestration (tách khỏi Automation Test / Playwright).
 */
import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { getTokenFromStore, verifyToken } from '../task/auth'
import { hasDbConfig } from '../task/schema/db'
import {
  deleteDevPipelineFlow,
  getDevPipelineFlow,
  getDevPipelineRun,
  insertDevPipelineFlow,
  listDevPipelineFlows,
  upsertDevPipelineFlow,
} from '../devPipelines/db'
import { DevPipelineGraphValidationError, parseAndValidateGraph, validateGraphForRun } from '../devPipelines/graph'
import { cancelDevPipelineRun, respondApproval, startDevPipelineRun } from '../devPipelines/runner'
import type { DevPipelineRunScope } from 'shared/devPipelines/types'
import { buildScopedRunPlan } from 'shared/devPipelines/runScope'

type Envelope<T = unknown> = { status: 'success' | 'error'; data?: T; message?: string }

function ok<T>(data?: T): Envelope<T> {
  return { status: 'success', data }
}

function fail(message: string): Envelope<never> {
  l.warn('[dev-pipeline] handler error:', message)
  return { status: 'error', message }
}

function currentUserId(): string | null {
  const token = getTokenFromStore()
  if (!token) return null
  const session = verifyToken(token)
  return session?.userId ?? null
}

function requireDb(): Envelope<never> | null {
  if (!hasDbConfig()) return fail('Database is not configured.')
  return null
}

export function registerDevPipelinesIpcHandlers(): void {
  ipcMain.handle(IPC.DEV_PIPELINE.FLOW_LIST, async () => {
    const err = requireDb()
    if (err) return err
    const userId = currentUserId()
    if (!userId) return fail('Not signed in.')
    try {
      const rows = await listDevPipelineFlows(userId)
      return ok(rows)
    } catch (e) {
      return fail((e as Error).message)
    }
  })

  ipcMain.handle(IPC.DEV_PIPELINE.FLOW_GET, async (_e, id: string) => {
    const err = requireDb()
    if (err) return err
    const userId = currentUserId()
    if (!userId) return fail('Not signed in.')
    try {
      const flow = await getDevPipelineFlow(userId, id)
      return ok(flow)
    } catch (e) {
      return fail((e as Error).message)
    }
  })

  ipcMain.handle(IPC.DEV_PIPELINE.FLOW_CREATE, async (_e, input: { name: string; description?: string | null }) => {
    const err = requireDb()
    if (err) return err
    const userId = currentUserId()
    if (!userId) return fail('Not signed in.')
    const name = typeof input?.name === 'string' ? input.name.trim() : ''
    if (!name) return fail('Name is required.')
    try {
      const flow = await insertDevPipelineFlow(userId, name, input?.description ?? null)
      return ok(flow)
    } catch (e) {
      return fail((e as Error).message)
    }
  })

  ipcMain.handle(
    IPC.DEV_PIPELINE.FLOW_UPSERT,
    async (
      _e,
      input: { id?: string | null; name: string; description?: string | null; graph: unknown; schemaVersion?: number }
    ) => {
      const err = requireDb()
      if (err) return err
      const userId = currentUserId()
      if (!userId) return fail('Not signed in.')
      const name = typeof input?.name === 'string' ? input.name.trim() : ''
      if (!name) return fail('Name is required.')
      try {
        const graph = parseAndValidateGraph(input.graph)
        const flow = await upsertDevPipelineFlow(userId, {
          id: input.id ?? undefined,
          name,
          description: input.description,
          graph,
          schemaVersion: input.schemaVersion,
        })
        return ok(flow)
      } catch (e) {
        if (e instanceof DevPipelineGraphValidationError) return fail(e.message)
        return fail((e as Error).message)
      }
    }
  )

  ipcMain.handle(IPC.DEV_PIPELINE.FLOW_DELETE, async (_e, id: string) => {
    const err = requireDb()
    if (err) return err
    const userId = currentUserId()
    if (!userId) return fail('Not signed in.')
    try {
      await deleteDevPipelineFlow(userId, id)
      return ok({ deleted: true })
    } catch (e) {
      return fail((e as Error).message)
    }
  })

  ipcMain.handle(IPC.DEV_PIPELINE.RUN_START, async (_e, input: string | { flowId: string; scope?: DevPipelineRunScope }) => {
    const err = requireDb()
    if (err) return err
    const userId = currentUserId()
    if (!userId) return fail('Not signed in.')
    const flowId = typeof input === 'string' ? input : input?.flowId
    const scope = typeof input === 'string' ? undefined : input?.scope
    if (typeof flowId !== 'string' || !flowId) return fail('flowId is required.')
    try {
      const flow = await getDevPipelineFlow(userId, flowId)
      if (!flow) return fail('Flow not found.')
      const graph = parseAndValidateGraph(flow.graph)
      const plan = buildScopedRunPlan(graph, scope)
      validateGraphForRun(graph, new Set(plan.executableNodeIds))
      if (plan.executableNodeIds.length === 0) return fail('No executable steps in run scope.')
      const runId = await startDevPipelineRun(userId, flowId, scope)
      if (!runId) return fail('Could not start run.')
      return ok({ started: true, flowId, runId })
    } catch (e) {
      if (e instanceof DevPipelineGraphValidationError) return fail(e.message)
      return fail((e as Error).message)
    }
  })

  ipcMain.handle(IPC.DEV_PIPELINE.RUN_CANCEL, async (_e, runId: string) => {
    const userId = currentUserId()
    if (!userId) return fail('Not signed in.')
    if (typeof runId !== 'string' || !runId) return fail('runId is required.')
    const cancelled = cancelDevPipelineRun(runId)
    return ok({ cancelled })
  })

  ipcMain.handle(
    IPC.DEV_PIPELINE.APPROVAL_RESPOND,
    async (_e, input: { runId: string; nodeId: string; approved: boolean }) => {
      const userId = currentUserId()
      if (!userId) return fail('Not signed in.')
      const runId = input?.runId
      const nodeId = input?.nodeId
      const approved = input?.approved === true
      if (typeof runId !== 'string' || !runId || typeof nodeId !== 'string' || !nodeId) {
        return fail('runId and nodeId are required.')
      }
      const handled = respondApproval(runId, nodeId, approved)
      return ok({ handled })
    }
  )

  ipcMain.handle(IPC.DEV_PIPELINE.RUN_GET, async (_e, runId: string) => {
    const err = requireDb()
    if (err) return err
    const userId = currentUserId()
    if (!userId) return fail('Not signed in.')
    try {
      const run = await getDevPipelineRun(userId, runId)
      return ok(run)
    } catch (e) {
      return fail((e as Error).message)
    }
  })
}
