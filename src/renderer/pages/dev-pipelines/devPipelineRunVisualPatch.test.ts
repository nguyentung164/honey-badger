import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import {
  patchPipelineEdgesActive,
  patchPipelineNodesRunVisual,
  PIPELINE_EDGE_ACTIVE_STYLE,
  PIPELINE_EDGE_IDLE_STYLE,
} from '@/pages/dev-pipelines/devPipelineRunVisualPatch'

describe('patchPipelineNodesRunVisual', () => {
  const nodes: Node[] = [
    { id: 'a', position: { x: 0, y: 0 }, data: { runVisual: 'idle' } },
    { id: 'b', position: { x: 0, y: 0 }, data: { runVisual: 'success' } },
  ]

  it('returns null when no node status changed', () => {
    expect(patchPipelineNodesRunVisual(nodes, { b: { status: 'success' } })).toBeNull()
  })

  it('updates only changed nodes and preserves others by reference', () => {
    const result = patchPipelineNodesRunVisual(nodes, { a: { status: 'running' }, b: { status: 'success' } })
    expect(result).not.toBeNull()
    expect(result![0].data).toMatchObject({ runVisual: 'running' })
    expect(result![1]).toBe(nodes[1])
  })
})

describe('patchPipelineEdgesActive', () => {
  const edges: Edge[] = [
    { id: 'e1', source: 'a', target: 'b', animated: false },
    { id: 'e2', source: 'b', target: 'c', animated: false },
  ]

  it('returns null when active edge unchanged and already styled', () => {
    const styled: Edge[] = [
      { ...edges[0], animated: true, style: { ...PIPELINE_EDGE_ACTIVE_STYLE } },
      { ...edges[1], animated: false, style: { ...PIPELINE_EDGE_IDLE_STYLE } },
    ]
    expect(patchPipelineEdgesActive(styled, 'e1', 'e1')).toBeNull()
  })

  it('updates only active and previous active edges when switching A to B', () => {
    const styled: Edge[] = [
      { ...edges[0], animated: true, style: { ...PIPELINE_EDGE_ACTIVE_STYLE } },
      { ...edges[1], animated: false, style: { ...PIPELINE_EDGE_IDLE_STYLE } },
    ]
    const result = patchPipelineEdgesActive(styled, 'e2', 'e1')
    expect(result).not.toBeNull()
    expect(result![0].animated).toBe(false)
    expect(result![0].style).toEqual(PIPELINE_EDGE_IDLE_STYLE)
    expect(result![1].animated).toBe(true)
    expect(result![1].style).toEqual(PIPELINE_EDGE_ACTIVE_STYLE)
  })
})
