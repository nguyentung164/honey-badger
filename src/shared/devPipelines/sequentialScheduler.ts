import { canRunNode, pickNextReadyNode, type FlowExecEdge, type FlowExecNode, type NodeOutcome } from 'shared/flowExecution'

export type RunSequentialReadyNodesOpts = {
  nodeIds: string[]
  edges: FlowExecEdge[]
  scopeNodeIds: Set<string>
  treatExternalAsSuccess?: boolean
  nodeById?: Map<string, FlowExecNode>
  /** Shared resolved outcomes; runOne should set success/error/skipped. */
  resolved: Map<string, NodeOutcome>
  runOne: (id: string) => Promise<void>
  shouldStop?: () => boolean
}

/** Run ready nodes one at a time in runOrder; returns ids executed in order. */
export async function runSequentialReadyNodes(opts: RunSequentialReadyNodesOpts): Promise<string[]> {
  const {
    nodeIds,
    edges,
    scopeNodeIds,
    treatExternalAsSuccess = false,
    nodeById,
    resolved,
    runOne,
    shouldStop,
  } = opts

  const incoming = new Map<string, FlowExecEdge[]>()
  for (const id of nodeIds) incoming.set(id, [])
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, [])
    incoming.get(e.target)!.push(e)
  }

  const executed: string[] = []
  let lastCompletedId: string | null = null

  while (executed.length < nodeIds.length) {
    if (shouldStop?.()) break

    const ready = nodeIds.filter(
      id => !resolved.has(id) && canRunNode(id, incoming, resolved, scopeNodeIds, treatExternalAsSuccess),
    )
    if (!ready.length) break

    const nextId = pickNextReadyNode(ready, lastCompletedId, edges, nodeById)
    await runOne(nextId)
    if (!resolved.has(nextId)) resolved.set(nextId, 'success')
    executed.push(nextId)
    lastCompletedId = nextId
  }

  return executed
}
