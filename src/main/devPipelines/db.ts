import type {
  DevPipelineFlow,
  DevPipelineFlowSummary,
  DevPipelineGraphJson,
  DevPipelineRunStatus,
  DevPipelineRunSummary,
  DevPipelineStepStatusEntry,
} from 'shared/devPipelines/types'
import { createDefaultDevPipelineGraph } from 'shared/devPipelines/defaultGraph'
import { randomUuidV7 } from 'shared/randomUuidV7'
import { exec, query } from '../task/schema/db'

interface FlowRow {
  id: string
  user_id: string
  name: string
  description: string | null
  schema_version: number
  graph_json: unknown
  created_at: string
  updated_at: string
}

function rowToSummary(r: FlowRow): DevPipelineFlowSummary {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    schemaVersion: r.schema_version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function rowToFlow(r: FlowRow, graph: DevPipelineGraphJson): DevPipelineFlow {
  return { ...rowToSummary(r), graph }
}

export async function listDevPipelineFlows(userId: string): Promise<DevPipelineFlowSummary[]> {
  const rows = await query<FlowRow>(
    'SELECT id, user_id, name, description, schema_version, graph_json, created_at, updated_at FROM dev_pipeline_flows WHERE user_id = ? ORDER BY updated_at DESC',
    [userId]
  )
  return rows.map(rowToSummary)
}

export async function getDevPipelineFlow(userId: string, id: string): Promise<DevPipelineFlow | null> {
  const rows = await query<FlowRow>(
    'SELECT id, user_id, name, description, schema_version, graph_json, created_at, updated_at FROM dev_pipeline_flows WHERE id = ? AND user_id = ?',
    [id, userId]
  )
  if (!rows.length) return null
  const r = rows[0]
  const graph = r.graph_json as DevPipelineGraphJson
  return rowToFlow(r, graph)
}

export async function insertDevPipelineFlow(userId: string, name: string, description?: string | null): Promise<DevPipelineFlow> {
  const id = randomUuidV7()
  const graph = createDefaultDevPipelineGraph()
  await exec(
    'INSERT INTO dev_pipeline_flows (id, user_id, name, description, schema_version, graph_json) VALUES (?, ?, ?, ?, ?, ?::jsonb)',
    [id, userId, name, description ?? null, 1, JSON.stringify(graph)]
  )
  const flow = await getDevPipelineFlow(userId, id)
  if (!flow) throw new Error('Failed to create dev pipeline flow')
  return flow
}

export async function updateDevPipelineFlow(
  userId: string,
  id: string,
  patch: { name?: string; description?: string | null; graph?: DevPipelineGraphJson; schemaVersion?: number }
): Promise<DevPipelineFlow | null> {
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.name !== undefined) {
    fields.push('name = ?')
    values.push(patch.name)
  }
  if (patch.description !== undefined) {
    fields.push('description = ?')
    values.push(patch.description)
  }
  if (patch.graph !== undefined) {
    fields.push('graph_json = ?::jsonb')
    values.push(JSON.stringify(patch.graph))
  }
  if (patch.schemaVersion !== undefined) {
    fields.push('schema_version = ?')
    values.push(patch.schemaVersion)
  }
  if (fields.length === 0) return getDevPipelineFlow(userId, id)
  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id, userId)
  await exec(`UPDATE dev_pipeline_flows SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values)
  return getDevPipelineFlow(userId, id)
}

export async function upsertDevPipelineFlow(
  userId: string,
  input: { id?: string | null; name: string; description?: string | null; graph: DevPipelineGraphJson; schemaVersion?: number }
): Promise<DevPipelineFlow> {
  if (input.id) {
    const existing = await getDevPipelineFlow(userId, input.id)
    if (!existing) throw new Error('Flow not found')
    const updated = await updateDevPipelineFlow(userId, input.id, {
      name: input.name,
      description: input.description,
      graph: input.graph,
      schemaVersion: input.schemaVersion ?? existing.schemaVersion,
    })
    if (!updated) throw new Error('Failed to update flow')
    return updated
  }
  const id = randomUuidV7()
  await exec(
    'INSERT INTO dev_pipeline_flows (id, user_id, name, description, schema_version, graph_json) VALUES (?, ?, ?, ?, ?, ?::jsonb)',
    [id, userId, input.name, input.description ?? null, input.schemaVersion ?? 1, JSON.stringify(input.graph)]
  )
  const flow = await getDevPipelineFlow(userId, id)
  if (!flow) throw new Error('Failed to create flow')
  return flow
}

export async function deleteDevPipelineFlow(userId: string, id: string): Promise<boolean> {
  await exec('DELETE FROM dev_pipeline_flows WHERE id = ? AND user_id = ?', [id, userId])
  return true
}

interface RunRow {
  id: string
  flow_id: string
  user_id: string
  status: string
  context_json: unknown | null
  step_status_json: unknown
  started_at: string | null
  finished_at: string | null
}

export async function insertDevPipelineRun(
  userId: string,
  flowId: string,
  context?: Record<string, unknown> | null
): Promise<DevPipelineRunSummary> {
  const id = randomUuidV7()
  await exec(
    `INSERT INTO dev_pipeline_runs (id, flow_id, user_id, status, context_json, step_status_json, started_at)
     VALUES (?, ?, ?, 'running', ?::jsonb, '{}'::jsonb, CURRENT_TIMESTAMP)`,
    [id, flowId, userId, context != null ? JSON.stringify(context) : null]
  )
  return {
    id,
    flowId,
    status: 'running',
    stepStatus: {},
    startedAt: new Date().toISOString(),
    finishedAt: null,
  }
}

export async function updateDevPipelineRunStepJson(
  userId: string,
  runId: string,
  stepStatus: Record<string, DevPipelineStepStatusEntry>,
  status?: DevPipelineRunStatus
): Promise<void> {
  const sets: string[] = ['step_status_json = ?::jsonb']
  const vals: unknown[] = [JSON.stringify(stepStatus)]
  if (status) {
    sets.push('status = ?')
    vals.push(status)
  }
  vals.push(runId, userId)
  await exec(`UPDATE dev_pipeline_runs SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, vals)
}

export async function finalizeDevPipelineRun(userId: string, runId: string, status: DevPipelineRunStatus): Promise<void> {
  await exec(`UPDATE dev_pipeline_runs SET status = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, [status, runId, userId])
}

export async function getDevPipelineRun(userId: string, runId: string): Promise<DevPipelineRunSummary | null> {
  const rows = await query<RunRow>(
    'SELECT id, flow_id, user_id, status, context_json, step_status_json, started_at, finished_at FROM dev_pipeline_runs WHERE id = ? AND user_id = ?',
    [runId, userId]
  )
  if (!rows.length) return null
  const r = rows[0]
  return {
    id: r.id,
    flowId: r.flow_id,
    status: r.status as DevPipelineRunStatus,
    stepStatus: (r.step_status_json ?? {}) as Record<string, DevPipelineStepStatusEntry>,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  }
}
