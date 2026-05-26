import type { Node, ReactFlowInstance } from '@xyflow/react'
import { resolveFlowCanvasNodeLayoutSize } from './flowNodeContentLayout'

/** Wait N animation frames so React Flow can measure node DOM sizes. */
export function waitAnimationFrames(count: number): Promise<void> {
  if (count <= 0) return Promise.resolve()
  return new Promise(resolve => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(() => step(remaining - 1))
    }
    step(count)
  })
}

/** Merge live measured dimensions from the React Flow store (RF v12 best practice). */
export function nodesForAutoLayout(nodes: Node[], getNode: (id: string) => Node | undefined): Node[] {
  return nodes.map(n => {
    const live = getNode(n.id)
    if (!live) return n
    return {
      ...n,
      measured: live.measured ?? n.measured,
      width: live.width ?? n.width,
      height: live.height ?? n.height,
    }
  })
}

export function nodeHasLayoutDimensions(node: Node): boolean {
  const { width, height } = resolveFlowCanvasNodeLayoutSize(node)
  return width > 0 && height > 0
}

/**
 * After render, React Flow populates `measured` / width / height on nodes.
 * Wait briefly, then return nodes with the freshest dimensions for Dagre.
 */
export async function getNodesSizedForAutoLayout(
  rf: Pick<ReactFlowInstance, 'getNodes' | 'getNode'>,
  filter?: (node: Node) => boolean,
  maxWaitFrames = 12,
): Promise<Node[]> {
  const pick = filter ?? (() => true)
  const ids = rf.getNodes().filter(pick).map(n => n.id)

  for (let i = 0; i < maxWaitFrames; i++) {
    const sized = nodesForAutoLayout(
      rf.getNodes().filter(pick),
      id => rf.getNode(id),
    )
    if (ids.length === 0 || sized.every(nodeHasLayoutDimensions)) {
      return sized
    }
    await waitAnimationFrames(1)
  }

  return nodesForAutoLayout(
    rf.getNodes().filter(pick),
    id => rf.getNode(id),
  )
}
