import { buildOrderedExecutionPlan, normalizeAllRunOrders, type FlowExecEdge } from 'shared/flowExecution'
import type { DevPipelineGraphJson, DevPipelinePersistedEdge, DevPipelinePersistedNode, DevPipelineRunScope } from './types'
import type { DevPipelineNodeData } from './types'

export function isDevPipelineStepNode(node: DevPipelinePersistedNode): boolean {
  return node.type === 'pipelineStep' || !node.type
}

export function listExecutableStepNodes(graph: DevPipelineGraphJson): DevPipelinePersistedNode[] {
  return graph.nodes.filter(isDevPipelineStepNode)
}

export function isStepExecutionDisabled(node: DevPipelinePersistedNode): boolean {
  if (!isDevPipelineStepNode(node)) return false
  return (node.data as DevPipelineNodeData).executionDisabled === true
}

function toFlowExecEdges(edges: DevPipelinePersistedEdge[]): FlowExecEdge[] {
  return edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    runOrder: e.data?.runOrder,
    condition: e.data?.condition,
  }))
}

export type DevPipelineScopedRunPlan = {
  executableNodeIds: string[]
  disabledNodeIds: string[]
  edges: DevPipelinePersistedEdge[]
  scopeNodeIds: Set<string>
  treatExternalAsSuccess: boolean
}

export function buildScopedRunPlan(graph: DevPipelineGraphJson, scope?: DevPipelineRunScope): DevPipelineScopedRunPlan {
  const allSteps = listExecutableStepNodes(graph)
  const disabledNodeIds = allSteps.filter(isStepExecutionDisabled).map(n => n.id)
  const enabledSteps = allSteps.filter(n => !isStepExecutionDisabled(n))
  const enabledStepIds = new Set(enabledSteps.map(n => n.id))

  if (!scope || scope.mode === 'full') {
    const stepEdges = graph.edges.filter(e => enabledStepIds.has(e.source) && enabledStepIds.has(e.target))
    return {
      executableNodeIds: [...enabledStepIds],
      disabledNodeIds,
      edges: stepEdges,
      scopeNodeIds: enabledStepIds,
      treatExternalAsSuccess: false,
    }
  }

  if (scope.mode === 'node') {
    const nodeId = scope.nodeId
    if (!enabledStepIds.has(nodeId)) {
      return { executableNodeIds: [], disabledNodeIds, edges: [], scopeNodeIds: new Set(), treatExternalAsSuccess: false }
    }
    return {
      executableNodeIds: [nodeId],
      disabledNodeIds: disabledNodeIds.filter(id => id !== nodeId),
      edges: [],
      scopeNodeIds: new Set([nodeId]),
      treatExternalAsSuccess: false,
    }
  }

  if (scope.mode === 'flow') {
    const stepEdges = graph.edges.filter(e => enabledStepIds.has(e.source) && enabledStepIds.has(e.target))
    const normalized = normalizeAllRunOrders(toFlowExecEdges(stepEdges))
    const plan = buildOrderedExecutionPlan(
      enabledSteps.map(n => ({
        id: n.id,
        label: (n.data as DevPipelineNodeData).label,
      })),
      normalized,
      scope.startNodeId ? { startNodeIds: [scope.startNodeId] } : undefined,
    )
    const execSet = new Set(plan.executableNodeIds)
    return {
      executableNodeIds: plan.executableNodeIds,
      disabledNodeIds,
      edges: stepEdges.filter(e => execSet.has(e.source) && execSet.has(e.target)),
      scopeNodeIds: execSet,
      treatExternalAsSuccess: false,
    }
  }

  const groupId = scope.groupId
  const memberIds = new Set(enabledSteps.filter(n => n.parentId === groupId).map(n => n.id))
  const stepEdges = graph.edges.filter(e => memberIds.has(e.source) && memberIds.has(e.target))
  return {
    executableNodeIds: [...memberIds],
    disabledNodeIds: disabledNodeIds.filter(id => {
      const n = allSteps.find(s => s.id === id)
      return n?.parentId === groupId
    }),
    edges: stepEdges,
    scopeNodeIds: memberIds,
    treatExternalAsSuccess: true,
  }
}
