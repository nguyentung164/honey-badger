import type { FlowConnectionStyle, FlowNodeVisualStyle } from 'shared/flowDiagramStyle'
import { mergeConnectionStyle, mergeNodeVisualStyle } from 'shared/flowDiagramStyle'
import type { DevPipelineEdgeCondition, DevPipelineGraphJson, DevPipelineNodeData, DevPipelinePersistedEdge, DevPipelinePersistedNode } from 'shared/devPipelines/types'
import { isDevPipelineStepNode, listExecutableStepNodes } from 'shared/devPipelines/runScope'

export class DevPipelineGraphValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DevPipelineGraphValidationError'
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function parseNodeDiagramVisual(data: Record<string, unknown>, nodeId: string): FlowNodeVisualStyle | undefined {
  const raw = data.diagramVisual
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw)) throw new DevPipelineGraphValidationError(`Node ${nodeId}: diagramVisual must be an object`)
  return mergeNodeVisualStyle(raw as Partial<FlowNodeVisualStyle>)
}

function parseEdgeCondition(value: unknown): DevPipelineEdgeCondition {
  if (value === 'on-success' || value === 'on-failure' || value === 'always') return value
  return 'always'
}

function parseNodeParams(data: Record<string, unknown>, nodeId: string, stepKind: string) {
  const params = data.params
  if (params === undefined || params === null) return undefined
  if (!isRecord(params)) throw new DevPipelineGraphValidationError(`Node ${nodeId}: params must be object`)

  if (stepKind === 'delay') {
    if (params.ms !== undefined && typeof params.ms !== 'number') {
      throw new DevPipelineGraphValidationError(`Node ${nodeId}: params.ms must be number`)
    }
    return { ms: typeof params.ms === 'number' ? params.ms : undefined }
  }

  if (stepKind === 'http-check') {
    const url = typeof params.url === 'string' ? params.url.trim() : ''
    const readNum = (key: string): number | undefined => {
      const v = params[key]
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined
    }
    return {
      url,
      expectedStatus: readNum('expectedStatus'),
      timeoutMs: readNum('timeoutMs'),
      retryDelayMs: readNum('retryDelayMs'),
      maxRetries: readNum('maxRetries'),
    }
  }

  return undefined
}

function parseEdgeData(edgeData: unknown, edgeId: string): DevPipelinePersistedEdge['data'] | undefined {
  if (edgeData === undefined || edgeData === null) return undefined
  if (!isRecord(edgeData)) throw new DevPipelineGraphValidationError(`Edge ${edgeId}: data must be an object`)
  const label = typeof edgeData.label === 'string' ? edgeData.label : undefined
  let connectionStyle: FlowConnectionStyle | undefined
  if (edgeData.connectionStyle !== undefined && edgeData.connectionStyle !== null) {
    if (!isRecord(edgeData.connectionStyle)) {
      throw new DevPipelineGraphValidationError(`Edge ${edgeId}: connectionStyle must be an object`)
    }
    connectionStyle = mergeConnectionStyle(edgeData.connectionStyle as Partial<FlowConnectionStyle>)
  }
  const condition = edgeData.condition !== undefined ? parseEdgeCondition(edgeData.condition) : undefined
  if (label === undefined && connectionStyle === undefined && condition === undefined) return undefined
  return {
    ...(label !== undefined ? { label } : {}),
    ...(connectionStyle !== undefined ? { connectionStyle } : {}),
    ...(condition !== undefined ? { condition } : {}),
  }
}

export function parseAndValidateGraph(raw: unknown): DevPipelineGraphJson {
  if (!isRecord(raw)) throw new DevPipelineGraphValidationError('Graph must be an object')
  const version = raw.version
  if (typeof version !== 'number' || version < 1) throw new DevPipelineGraphValidationError('Invalid graph.version')
  const nodesRaw = raw.nodes
  const edgesRaw = raw.edges
  if (!Array.isArray(nodesRaw)) throw new DevPipelineGraphValidationError('Graph.nodes must be an array')
  if (!Array.isArray(edgesRaw)) throw new DevPipelineGraphValidationError('Graph.edges must be an array')

  const nodes: DevPipelinePersistedNode[] = []
  const ids = new Set<string>()
  for (const n of nodesRaw) {
    if (!isRecord(n)) throw new DevPipelineGraphValidationError('Invalid node')
    const id = n.id
    const type = n.type
    const pos = n.position
    const data = n.data
    if (typeof id !== 'string' || !id) throw new DevPipelineGraphValidationError('Each node needs a non-empty id')
    if (ids.has(id)) throw new DevPipelineGraphValidationError(`Duplicate node id: ${id}`)
    ids.add(id)
    if (typeof type !== 'string' || !type) throw new DevPipelineGraphValidationError(`Node ${id} needs type`)
    if (!isRecord(pos) || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
      throw new DevPipelineGraphValidationError(`Node ${id} needs position { x, y }`)
    }
    if (!isRecord(data)) throw new DevPipelineGraphValidationError(`Node ${id} needs data`)
    const diagramVisual = parseNodeDiagramVisual(data, id)
    const visualFields = diagramVisual ? { diagramVisual } : {}

    const parentId = typeof n.parentId === 'string' && n.parentId.trim() ? n.parentId.trim() : undefined
    const width = typeof n.width === 'number' && Number.isFinite(n.width) ? n.width : undefined
    const height = typeof n.height === 'number' && Number.isFinite(n.height) ? n.height : undefined
    const layoutFields = {
      ...(parentId ? { parentId } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    }

    if (type === 'pipelineGroup') {
      const label = data.label
      if (typeof label !== 'string' || !label.trim()) throw new DevPipelineGraphValidationError(`Node ${id} needs data.label`)
      const hint = typeof data.hint === 'string' ? data.hint.trim() : ''
      nodes.push({
        id,
        type,
        position: { x: pos.x, y: pos.y },
        ...layoutFields,
        data: {
          label: label.trim(),
          ...(hint ? { hint } : {}),
          ...visualFields,
        },
      })
      continue
    }

    if (type === 'pipelineNote') {
      const content = typeof data.content === 'string' ? data.content : ''
      nodes.push({
        id,
        type,
        position: { x: pos.x, y: pos.y },
        ...layoutFields,
        data: {
          content,
          ...(isRecord(data.style) ? { style: data.style } : {}),
          ...visualFields,
        },
      })
      continue
    }

    const label = data.label
    const stepKind = data.stepKind
    if (typeof label !== 'string' || !label.trim()) throw new DevPipelineGraphValidationError(`Node ${id} needs data.label`)
    if (stepKind === 'noop') {
      nodes.push({
        id,
        type,
        position: { x: pos.x, y: pos.y },
        ...layoutFields,
        data: { label: label.trim(), stepKind: 'noop', ...visualFields },
      })
      continue
    }
    if (stepKind === 'delay') {
      const paramsOut = parseNodeParams(data, id, 'delay')
      nodes.push({
        id,
        type,
        position: { x: pos.x, y: pos.y },
        ...layoutFields,
        data: { label: label.trim(), stepKind: 'delay', params: paramsOut, ...visualFields },
      })
      continue
    }
    if (stepKind === 'approval') {
      const approvalMessage = typeof data.approvalMessage === 'string' ? data.approvalMessage.trim() : ''
      nodes.push({
        id,
        type,
        position: { x: pos.x, y: pos.y },
        ...layoutFields,
        data: {
          label: label.trim(),
          stepKind: 'approval',
          ...(approvalMessage ? { approvalMessage } : {}),
          ...visualFields,
        },
      })
      continue
    }
    if (stepKind === 'http-check') {
      const paramsOut = parseNodeParams(data, id, 'http-check')
      nodes.push({
        id,
        type,
        position: { x: pos.x, y: pos.y },
        ...layoutFields,
        data: { label: label.trim(), stepKind: 'http-check', params: paramsOut, ...visualFields },
      })
      continue
    }
    if (stepKind === 'shell') {
      const scriptPath = typeof data.scriptPath === 'string' ? data.scriptPath : ''
      const command = typeof data.command === 'string' ? data.command : ''
      const cwd = typeof data.cwd === 'string' ? data.cwd.trim() : ''
      const waitForExit = data.waitForExit !== false
      nodes.push({
        id,
        type,
        position: { x: pos.x, y: pos.y },
        ...layoutFields,
        data: {
          label: label.trim(),
          stepKind: 'shell',
          scriptPath,
          command,
          ...(cwd ? { cwd } : {}),
          waitForExit,
          ...visualFields,
        },
      })
      continue
    }
    throw new DevPipelineGraphValidationError(`Node ${id}: unsupported stepKind`)
  }

  const edges: DevPipelinePersistedEdge[] = []
  const edgeIds = new Set<string>()
  for (const e of edgesRaw) {
    if (!isRecord(e)) throw new DevPipelineGraphValidationError('Invalid edge')
    const id = e.id
    const source = e.source
    const target = e.target
    if (typeof id !== 'string' || !id) throw new DevPipelineGraphValidationError('Each edge needs id')
    if (edgeIds.has(id)) throw new DevPipelineGraphValidationError(`Duplicate edge id: ${id}`)
    edgeIds.add(id)
    if (typeof source !== 'string' || typeof target !== 'string' || !ids.has(source) || !ids.has(target)) {
      throw new DevPipelineGraphValidationError(`Edge ${id}: invalid source/target`)
    }
    const type = e.type
    const sourceHandle = e.sourceHandle
    const targetHandle = e.targetHandle
    const parsedEdgeData = parseEdgeData(e.data, id)
    edges.push({
      id,
      source,
      target,
      ...(typeof type === 'string' && type ? { type } : {}),
      ...(typeof sourceHandle === 'string' && sourceHandle ? { sourceHandle } : {}),
      ...(typeof targetHandle === 'string' && targetHandle ? { targetHandle } : {}),
      ...(parsedEdgeData ? { data: parsedEdgeData } : {}),
    })
  }

  const stepIds = new Set(nodes.filter(isDevPipelineStepNode).map(n => n.id))
  const stepEdges = edges.filter(e => stepIds.has(e.source) && stepIds.has(e.target))
  detectCycle(stepIds, stepEdges)

  let defaultCwd: string | undefined
  if (raw.defaultCwd !== undefined && raw.defaultCwd !== null) {
    if (typeof raw.defaultCwd !== 'string') throw new DevPipelineGraphValidationError('defaultCwd must be a string')
    const t = raw.defaultCwd.trim()
    if (t) defaultCwd = t
  }

  let viewport: DevPipelineGraphJson['viewport']
  if (raw.viewport !== undefined && raw.viewport !== null) {
    if (!isRecord(raw.viewport)) throw new DevPipelineGraphValidationError('viewport must be object')
    const vx = raw.viewport.x
    const vy = raw.viewport.y
    const vz = raw.viewport.zoom
    if (typeof vx === 'number' && typeof vy === 'number' && typeof vz === 'number') {
      viewport = { x: vx, y: vy, zoom: vz }
    }
  }

  return { version, defaultCwd, nodes, edges, viewport }
}

/** Stricter checks before starting a run (draft saves may omit optional fields). */
export function validateGraphForRun(graph: DevPipelineGraphJson, scopeNodeIds?: Set<string>): void {
  for (const node of listExecutableStepNodes(graph)) {
    if (scopeNodeIds && !scopeNodeIds.has(node.id)) continue
    const data = node.data as DevPipelineNodeData
    if (data.stepKind !== 'http-check') continue
    const url = data.params?.url?.trim()
    if (!url) {
      throw new DevPipelineGraphValidationError(`Node ${node.id}: params.url is required for http-check`)
    }
  }
}

function detectCycle(nodeIds: Set<string>, edges: DevPipelinePersistedEdge[]): void {
  const adj = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  for (const id of nodeIds) {
    adj.set(id, [])
    indeg.set(id, 0)
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target)
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
  }
  const q: string[] = []
  for (const [id, d] of indeg) {
    if (d === 0) q.push(id)
  }
  let seen = 0
  while (q.length) {
    const u = q.pop()!
    seen++
    for (const v of adj.get(u) ?? []) {
      const nv = (indeg.get(v) ?? 0) - 1
      indeg.set(v, nv)
      if (nv === 0) q.push(v)
    }
  }
  if (seen !== nodeIds.size) throw new DevPipelineGraphValidationError('Graph contains a cycle')
}

/** Topological order (Kahn); throws if not DAG */
export function topologicalOrder(nodes: DevPipelinePersistedNode[], edges: DevPipelinePersistedEdge[]): string[] {
  const ids = new Set(nodes.map(n => n.id))
  detectCycle(ids, edges)
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const id of ids) {
    indeg.set(id, 0)
    adj.set(id, [])
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target)
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
  }
  const q: string[] = []
  for (const [id, d] of indeg) {
    if (d === 0) q.push(id)
  }
  q.sort()
  const out: string[] = []
  while (q.length) {
    const u = q.shift()!
    out.push(u)
    const outs = [...(adj.get(u) ?? [])].sort()
    for (const v of outs) {
      const nv = (indeg.get(v) ?? 0) - 1
      indeg.set(v, nv)
      if (nv === 0) {
        q.push(v)
        q.sort()
      }
    }
  }
  return out
}
