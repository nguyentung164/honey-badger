import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { resolveFlowCanvasNodeLayoutSize } from 'shared/flowNodeContentLayout'
import {
  catalogGroupsPostOrderIds,
  computeCatalogPageMapLayout,
  computeSnugGroupFrameSize,
  GROUP_FOOTER_RESERVE,
  GROUP_TITLE_RESERVE,
  planCatalogGroupChildLayout,
} from '@/pages/automation/map/pageMapLayout'
import {
  PAGE_MAP_GROUP_INNER_PAD,
  PAGE_MAP_GROUP_TITLE_RESERVE,
} from '@/pages/automation/map/pageMapGraph'

function pageNode(id: string, parentId?: string): Node {
  return {
    id,
    type: 'catalogPage',
    parentId,
    position: { x: 0, y: 0 },
    data: {},
  } as Node
}

function groupNode(id: string, parentId?: string, w = 420, h = 280): Node {
  return {
    id,
    type: 'catalogGroup',
    parentId,
    position: { x: 0, y: 0 },
    style: { width: w, height: h },
    data: {},
  } as Node
}

describe('computeCatalogPageMapLayout', () => {
  it('lays out only children of selected group scope', () => {
    const nodes: Node[] = [groupNode('g1'), pageNode('p1', 'g1'), pageNode('p2', 'g1')]
    const edges: Edge[] = []
    const laid = computeCatalogPageMapLayout(nodes, edges, 'dagre-tb', { kind: 'group', groupId: 'g1' })
    expect(laid.p1).toBeDefined()
    expect(laid.p2).toBeDefined()
    expect(laid.g1).toBeUndefined()
  })

  it('post-orders nested groups depth-first', () => {
    const nodes: Node[] = [groupNode('root'), groupNode('child', 'root')]
    expect(catalogGroupsPostOrderIds(nodes)).toEqual(['child', 'root'])
  })

  it('centers page cluster horizontally and vertically in group frame', () => {
    const nodes: Node[] = [groupNode('g1', undefined, 600, 400), pageNode('p1', 'g1'), pageNode('p2', 'g1')]
    const edges: Edge[] = []
    const laid = computeCatalogPageMapLayout(nodes, edges, 'dagre-tb', { kind: 'group', groupId: 'g1' })
    const childIds = ['p1', 'p2']
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const id of childIds) {
      const p = laid[id]!
      const n = nodes.find(x => x.id === id)!
      const { width, height } = resolveFlowCanvasNodeLayoutSize(n)
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x + width)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y + height)
    }
    const contentW = maxX - minX
    const contentH = maxY - minY
    const expectedLeft = PAGE_MAP_GROUP_INNER_PAD + (600 - PAGE_MAP_GROUP_INNER_PAD * 2 - contentW) / 2
    const expectedTop =
      PAGE_MAP_GROUP_TITLE_RESERVE +
      (400 - PAGE_MAP_GROUP_TITLE_RESERVE - GROUP_FOOTER_RESERVE - PAGE_MAP_GROUP_INNER_PAD - contentH) / 2
    expect(minX).toBeCloseTo(expectedLeft, 0)
    expect(minY).toBeCloseTo(expectedTop, 0)
  })

  it('planCatalogGroupChildLayout centers children and grows frame when needed', () => {
    const nodes: Node[] = [groupNode('g1'), pageNode('p1', 'g1')]
    const plan = planCatalogGroupChildLayout(nodes, [], 'g1')
    expect(plan.positions.p1).toBeDefined()
    const { width, height } = resolveFlowCanvasNodeLayoutSize(pageNode('p1', 'g1'))
    const expectedX = PAGE_MAP_GROUP_INNER_PAD + (420 - PAGE_MAP_GROUP_INNER_PAD * 2 - width) / 2
    expect(plan.positions.p1!.x).toBeCloseTo(expectedX, 0)
    expect(plan.positions.p1!.y).toBeGreaterThanOrEqual(PAGE_MAP_GROUP_TITLE_RESERVE)
  })

  it('computeSnugGroupFrameSize expands to fit laid-out children', () => {
    const nodes: Node[] = [groupNode('g1'), pageNode('p1', 'g1')]
    const positions = { p1: { x: 24, y: GROUP_TITLE_RESERVE + PAGE_MAP_GROUP_INNER_PAD } }
    const snug = computeSnugGroupFrameSize(positions, ['p1'], nodes)
    expect(snug.width).toBeGreaterThanOrEqual(24 + 200 + 24)
    expect(snug.height).toBeGreaterThanOrEqual(GROUP_TITLE_RESERVE + 72 + 24)
  })

  it('uses larger dagre size for metadata content layout', () => {
    const nodes: Node[] = [
      pageNode('p1'),
      {
        ...pageNode('p2'),
        data: { diagramVisual: { contentLayout: 'metadata', metadataMode: 'always' } },
      } as Node,
    ]
    const edges: Edge[] = [{ id: 'e1', source: 'p1', target: 'p2' } as Edge]
    const laid = computeCatalogPageMapLayout(nodes, edges, 'dagre-tb', { kind: 'all' })
    const dy = Math.abs((laid.p2?.y ?? 0) - (laid.p1?.y ?? 0))
    expect(dy).toBeGreaterThan(80)
  })
})
