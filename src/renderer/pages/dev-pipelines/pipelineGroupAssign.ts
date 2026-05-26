import type { Node } from '@xyflow/react'

export function stepsNeedingGroupAssignment(stepIds: string[], nodes: Node[], targetGroupId: string): string[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  return stepIds.filter(id => {
    const n = byId.get(id)
    return n?.type === 'pipelineStep' && String(n.parentId ?? '') !== targetGroupId
  })
}

export function pipelineGroupOptionLabel(node: Node): string {
  const label = (node.data as { label?: string } | undefined)?.label?.trim()
  return label || node.id
}
