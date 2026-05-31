/**
 * Shared flow execution ordering — used by Dev Pipelines and Page Map.
 */

export type FlowEdgeCondition = 'always' | 'on-success' | 'on-failure'

export type FlowExecEdge = {
  id: string
  source: string
  target: string
  runOrder?: number
  condition?: FlowEdgeCondition
}

export type FlowExecNode = {
  id: string
  disabled?: boolean
  /** Tie-break for entry nodes (e.g. catalog sortOrder). Lower runs first. */
  sortKey?: number
  /** Tie-break label (lexicographic after sortKey). */
  label?: string
}

export type NodeOutcome = 'success' | 'error' | 'skipped'

export class FlowExecutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FlowExecutionError'
  }
}

export const FLOW_CYCLE_ERROR = 'Graph contains a cycle'

export type OrderedExecutionPlan = {
  executableNodeIds: string[]
  disabledNodeIds: string[]
  entryNodeIds: string[]
  edges: FlowExecEdge[]
}

export type BuildOrderedExecutionPlanOpts = {
  /** Restrict to nodes reachable from these ids (BFS forward). Empty = all nodes in graph. */
  startNodeIds?: string[]
  /** Only include nodes in this set (e.g. group members). */
  scopeNodeIds?: Set<string>
}

function siblingEdges(sourceId: string, edges: FlowExecEdge[]): FlowExecEdge[] {
  return edges.filter(e => e.source === sourceId)
}

/** Next runOrder when connecting from sourceId. */
export function assignRunOrderForNewEdge(sourceId: string, edges: FlowExecEdge[]): number {
  const siblings = siblingEdges(sourceId, edges)
  if (!siblings.length) return 1
  const max = Math.max(...siblings.map(e => e.runOrder ?? 0))
  return max + 1
}

/** Compact runOrder to 1..n per source, preserving relative order. */
export function normalizeRunOrdersForSource(sourceId: string, edges: FlowExecEdge[]): FlowExecEdge[] {
  const siblings = siblingEdges(sourceId, edges)
  if (!siblings.length) return edges

  const sorted = [...siblings].sort((a, b) => {
    const ao = a.runOrder ?? Number.MAX_SAFE_INTEGER
    const bo = b.runOrder ?? Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return a.id.localeCompare(b.id)
  })

  const orderMap = new Map<string, number>()
  sorted.forEach((e, i) => orderMap.set(e.id, i + 1))

  return edges.map(e => {
    if (e.source !== sourceId) return e
    const next = orderMap.get(e.id)
    return next != null ? { ...e, runOrder: next } : e
  })
}

/** Normalize all sources in the edge list. */
export function normalizeAllRunOrders(edges: FlowExecEdge[]): FlowExecEdge[] {
  const sources = [...new Set(edges.map(e => e.source))]
  let out = edges
  for (const s of sources) out = normalizeRunOrdersForSource(s, out)
  return out
}

/** Resolved 1..n runOrder per edge id (for UI when DB values are missing or duplicated). */
export function resolvedRunOrderByEdgeId(edges: FlowExecEdge[]): Map<string, number> {
  const normalized = normalizeAllRunOrders(edges)
  return new Map(normalized.map(e => [e.id, e.runOrder ?? 1]))
}

export type RunOrderValidationIssue = { sourceId: string; message: string }

export function validateRunOrders(edges: FlowExecEdge[]): RunOrderValidationIssue[] {
  const issues: RunOrderValidationIssue[] = []
  const bySource = new Map<string, FlowExecEdge[]>()
  for (const e of edges) {
    if (!bySource.has(e.source)) bySource.set(e.source, [])
    bySource.get(e.source)!.push(e)
  }
  for (const [sourceId, siblings] of bySource) {
    const orders = siblings.map(e => e.runOrder)
    const defined = orders.filter((o): o is number => o != null && Number.isFinite(o))
    if (defined.length !== siblings.length) {
      issues.push({ sourceId, message: 'Some outgoing edges missing runOrder' })
      continue
    }
    for (const o of defined) {
      if (o < 1 || !Number.isInteger(o)) {
        issues.push({ sourceId, message: 'runOrder must be a positive integer' })
        break
      }
    }
    const unique = new Set(defined)
    if (unique.size !== defined.length) {
      issues.push({ sourceId, message: 'Duplicate runOrder on outgoing edges' })
    }
  }
  return issues
}

function detectCycle(nodeIds: Set<string>, edges: FlowExecEdge[]): void {
  const adj = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  for (const id of nodeIds) {
    adj.set(id, [])
    indeg.set(id, 0)
  }
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue
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
  if (seen !== nodeIds.size) throw new FlowExecutionError(FLOW_CYCLE_ERROR)
}

/** Forward-reachable node ids from startIds within optional boundary (all edge endpoints if omitted). */
export function reachableNodeIdsFrom(startIds: string[], edges: FlowExecEdge[], boundary?: Set<string>): string[] {
  const universe =
    boundary ??
    new Set<string>([...startIds, ...edges.flatMap(e => [e.source, e.target])])
  return [...reachableFrom(startIds, edges, universe)]
}

function reachableFrom(startIds: string[], edges: FlowExecEdge[], nodeIds: Set<string>): Set<string> {
  const adj = new Map<string, string[]>()
  for (const id of nodeIds) adj.set(id, [])
  for (const e of edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      adj.get(e.source)?.push(e.target)
    }
  }
  const out = new Set<string>()
  const q = [...startIds].filter(id => nodeIds.has(id))
  while (q.length) {
    const u = q.pop()!
    if (out.has(u)) continue
    out.add(u)
    for (const v of adj.get(u) ?? []) {
      if (!out.has(v)) q.push(v)
    }
  }
  return out
}

function entryNodeIds(nodeIds: Set<string>, edges: FlowExecEdge[]): string[] {
  const hasIncoming = new Set<string>()
  for (const e of edges) {
    if (nodeIds.has(e.target) && nodeIds.has(e.source)) hasIncoming.add(e.target)
  }
  return [...nodeIds].filter(id => !hasIncoming.has(id))
}

function nodeSortKey(node: FlowExecNode): [number, string, string] {
  return [node.sortKey ?? Number.MAX_SAFE_INTEGER, node.label ?? '', node.id]
}

export function buildOrderedExecutionPlan(
  nodes: FlowExecNode[],
  edges: FlowExecEdge[],
  opts?: BuildOrderedExecutionPlanOpts,
): OrderedExecutionPlan {
  const nodeById = new Map(nodes.map(n => [n.id, n]))
  let scopeIds = new Set(nodes.map(n => n.id))

  if (opts?.scopeNodeIds) {
    scopeIds = new Set([...scopeIds].filter(id => opts.scopeNodeIds!.has(id)))
  }

  const scopedEdges = edges.filter(e => scopeIds.has(e.source) && scopeIds.has(e.target))
  const normalizedEdges = normalizeAllRunOrders(scopedEdges)

  if (opts?.startNodeIds?.length) {
    scopeIds = reachableFrom(opts.startNodeIds, normalizedEdges, scopeIds)
  }

  const disabledNodeIds = [...scopeIds].filter(id => nodeById.get(id)?.disabled)
  const executableNodeIds = [...scopeIds].filter(id => !nodeById.get(id)?.disabled)

  if (executableNodeIds.length) {
    detectCycle(new Set(executableNodeIds), normalizedEdges)
  }

  const entries = entryNodeIds(new Set(executableNodeIds), normalizedEdges)
  entries.sort((a, b) => {
    const na = nodeById.get(a)
    const nb = nodeById.get(b)
    const ka = nodeSortKey(na ?? { id: a })
    const kb = nodeSortKey(nb ?? { id: b })
    return ka[0] - kb[0] || ka[1].localeCompare(kb[1]) || ka[2].localeCompare(kb[2])
  })

  return {
    executableNodeIds,
    disabledNodeIds,
    entryNodeIds: entries,
    edges: normalizedEdges.filter(e => scopeIds.has(e.source) && scopeIds.has(e.target)),
  }
}

function edgeConditionMet(outcome: NodeOutcome, condition: FlowEdgeCondition): boolean {
  if (outcome === 'skipped') return true
  if (condition === 'always') return true
  if (condition === 'on-success') return outcome === 'success'
  if (condition === 'on-failure') return outcome === 'error'
  return true
}

export function canRunNode(
  nodeId: string,
  incoming: Map<string, FlowExecEdge[]>,
  resolved: Map<string, NodeOutcome>,
  scopeNodeIds: Set<string>,
  treatExternalAsSuccess: boolean,
): boolean {
  const edges = incoming.get(nodeId) ?? []
  if (edges.length === 0) return true

  const inScopeEdges = treatExternalAsSuccess ? edges.filter(e => scopeNodeIds.has(e.source)) : edges
  if (inScopeEdges.length === 0) return true

  const sources = [...new Set(inScopeEdges.map(e => e.source))]
  if (!sources.every(s => resolved.has(s))) return false

  return sources.every(source => {
    const fromSource = inScopeEdges.filter(e => e.source === source)
    const outcome = resolved.get(source)!
    return fromSource.some(e => edgeConditionMet(outcome, e.condition ?? 'always'))
  })
}

function readyScore(nodeId: string, incoming: Map<string, FlowExecEdge[]>, resolved: Map<string, NodeOutcome>): number {
  const edges = incoming.get(nodeId) ?? []
  if (!edges.length) return -1
  const resolvedIncoming = edges.filter(e => resolved.has(e.source))
  if (!resolvedIncoming.length) return -1
  const fromExecutable = resolvedIncoming.filter(e => resolved.get(e.source) !== 'skipped')
  if (!fromExecutable.length) return 0
  return Math.min(...fromExecutable.map(e => e.runOrder ?? Number.MAX_SAFE_INTEGER))
}

/** Pick exactly one ready node — sequential scheduler. */
export function pickNextReadyNode(
  ready: string[],
  lastCompletedId: string | null,
  edges: FlowExecEdge[],
  nodeById?: Map<string, FlowExecNode>,
): string {
  if (ready.length === 0) throw new FlowExecutionError('No ready nodes')
  if (ready.length === 1) return ready[0]

  if (lastCompletedId) {
    const successors = edges
      .filter(e => e.source === lastCompletedId)
      .sort((a, b) => (a.runOrder ?? 0) - (b.runOrder ?? 0) || a.id.localeCompare(b.id))
    for (const e of successors) {
      if (ready.includes(e.target)) return e.target
    }
  }

  const incoming = new Map<string, FlowExecEdge[]>()
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, [])
    incoming.get(e.target)!.push(e)
  }
  const resolved = new Map<string, NodeOutcome>()
  for (const e of edges) {
    if (!resolved.has(e.source)) resolved.set(e.source, 'success')
  }

  return [...ready].sort((a, b) => {
    const sa = readyScore(a, incoming, resolved)
    const sb = readyScore(b, incoming, resolved)
    if (sa !== sb) return sa - sb
    const na = nodeById?.get(a)
    const nb = nodeById?.get(b)
    const ka = nodeSortKey(na ?? { id: a })
    const kb = nodeSortKey(nb ?? { id: b })
    return ka[0] - kb[0] || ka[1].localeCompare(kb[1]) || ka[2].localeCompare(kb[2])
  })[0]
}

/** Swap runOrder between edge and sibling with target order; then normalize source. */
export function swapRunOrderForEdge(edgeId: string, newOrder: number, edges: FlowExecEdge[]): FlowExecEdge[] {
  const edge = edges.find(e => e.id === edgeId)
  if (!edge) return edges
  const max = siblingEdges(edge.source, edges).length
  const clamped = Math.max(1, Math.min(max, Math.round(newOrder)))
  const siblings = siblingEdges(edge.source, edges)
  const conflict = siblings.find(e => e.id !== edgeId && e.runOrder === clamped)
  let out = edges.map(e => {
    if (e.id === edgeId) return { ...e, runOrder: clamped }
    if (conflict && e.id === conflict.id) return { ...e, runOrder: edge.runOrder ?? clamped }
    return e
  })
  out = normalizeRunOrdersForSource(edge.source, out)
  return out
}

export type OrderedTraversalOpts = {
  scopeNodeIds: Set<string>
  treatExternalAsSuccess?: boolean
  nodeById?: Map<string, FlowExecNode>
}

/** Simulate sequential execution order (for tests / preview). */
export function orderedTraversal(
  plan: OrderedExecutionPlan,
  opts: OrderedTraversalOpts,
): string[] {
  const { edges, executableNodeIds } = plan
  const scopeNodeIds = opts.scopeNodeIds
  const treatExternal = opts.treatExternalAsSuccess ?? false
  const nodeById = opts.nodeById ?? new Map<string, FlowExecNode>()

  const incoming = new Map<string, FlowExecEdge[]>()
  for (const id of executableNodeIds) incoming.set(id, [])
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, [])
    incoming.get(e.target)!.push(e)
  }

  const resolved = new Map<string, NodeOutcome>()
  for (const id of plan.disabledNodeIds) resolved.set(id, 'skipped')

  const out: string[] = []
  let lastCompleted: string | null = null

  while (out.length < executableNodeIds.length) {
    const ready = executableNodeIds.filter(
      id => !resolved.has(id) && canRunNode(id, incoming, resolved, scopeNodeIds, treatExternal),
    )
    if (!ready.length) break
    const next = pickNextReadyNode(ready, lastCompleted, edges, nodeById)
    resolved.set(next, 'success')
    out.push(next)
    lastCompleted = next
  }

  return out
}
