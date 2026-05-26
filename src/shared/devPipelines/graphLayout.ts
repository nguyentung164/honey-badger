import type { Node, ReactFlowInstance } from '@xyflow/react'

/** React Flow: parent nodes before children. */
export function sortNodesParentBeforeChildren(nodes: Node[]): Node[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const visited = new Set<string>()
  const out: Node[] = []

  function walk(id: string) {
    if (visited.has(id)) return
    const n = byId.get(id)
    if (!n) return
    const pid = n.parentId ? String(n.parentId) : null
    if (pid) walk(pid)
    if (!visited.has(id)) {
      visited.add(id)
      out.push(n)
    }
  }

  for (const n of nodes) walk(n.id)
  return out
}

function groupNodeRectSize(node: Node): { w: number; h: number } {
  const w = typeof node.style?.width === 'number' ? node.style.width : typeof node.width === 'number' ? node.width : 320
  const h = typeof node.style?.height === 'number' ? node.style.height : typeof node.height === 'number' ? node.height : 240
  return { w: Math.max(1, w), h: Math.max(1, h) }
}

/** When dropping a step: pick the smallest intersecting pipeline group. */
export function resolveSmallestIntersectingPipelineGroupId(
  inst: Pick<ReactFlowInstance, 'getNode' | 'getIntersectingNodes'>,
  stepId: string,
): string | null {
  const stepN = inst.getNode(stepId)
  if (!stepN || stepN.type !== 'pipelineStep') return null
  const overlaps = inst.getIntersectingNodes(stepN, true).filter(n => n.type === 'pipelineGroup')
  if (!overlaps.length) return null
  let best = overlaps[0]!
  let bestArea = Infinity
  for (const g of overlaps) {
    const { w, h } = groupNodeRectSize(g)
    const area = w * h
    if (area < bestArea) {
      bestArea = area
      best = g
    }
  }
  return best.id
}

export const PIPELINE_GROUP_DEFAULT_W = 360
export const PIPELINE_GROUP_DEFAULT_H = 260

export const PIPELINE_NOTE_DEFAULT_W = 200
export const PIPELINE_NOTE_DEFAULT_H = 72
