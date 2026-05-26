import type { DevPipelineGraphJson, DevPipelinePersistedEdge, DevPipelinePersistedNode, DevPipelineRunScope } from './types'

export function isDevPipelineStepNode(node: DevPipelinePersistedNode): boolean {
  return node.type === 'pipelineStep' || !node.type
}

export function listExecutableStepNodes(graph: DevPipelineGraphJson): DevPipelinePersistedNode[] {
  return graph.nodes.filter(isDevPipelineStepNode)
}

export type DevPipelineScopedRunPlan = {
  executableNodeIds: string[]
  edges: DevPipelinePersistedEdge[]
  scopeNodeIds: Set<string>
  treatExternalAsSuccess: boolean
}

export function buildScopedRunPlan(graph: DevPipelineGraphJson, scope?: DevPipelineRunScope): DevPipelineScopedRunPlan {
  const allSteps = listExecutableStepNodes(graph)
  const allStepIds = new Set(allSteps.map(n => n.id))

  if (!scope || scope.mode === 'full') {
    const stepEdges = graph.edges.filter(e => allStepIds.has(e.source) && allStepIds.has(e.target))
    return {
      executableNodeIds: [...allStepIds],
      edges: stepEdges,
      scopeNodeIds: allStepIds,
      treatExternalAsSuccess: false,
    }
  }

  if (scope.mode === 'node') {
    const nodeId = scope.nodeId
    if (!allStepIds.has(nodeId)) {
      return { executableNodeIds: [], edges: [], scopeNodeIds: new Set(), treatExternalAsSuccess: false }
    }
    return {
      executableNodeIds: [nodeId],
      edges: [],
      scopeNodeIds: new Set([nodeId]),
      treatExternalAsSuccess: false,
    }
  }

  const groupId = scope.groupId
  const memberIds = new Set(allSteps.filter(n => n.parentId === groupId).map(n => n.id))
  const stepEdges = graph.edges.filter(e => memberIds.has(e.source) && memberIds.has(e.target))
  return {
    executableNodeIds: [...memberIds],
    edges: stepEdges,
    scopeNodeIds: memberIds,
    treatExternalAsSuccess: true,
  }
}
