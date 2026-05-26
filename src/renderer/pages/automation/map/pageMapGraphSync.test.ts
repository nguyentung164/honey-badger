import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { mergePageMapEdges, mergePageMapNodes } from '@/pages/automation/map/pageMapGraphSync'

describe('mergePageMapNodes', () => {
  it('preserves position and node references when only one page status changes', () => {
    const prev: Node[] = [
      {
        id: 'p1',
        type: 'catalogPage',
        position: { x: 10, y: 20 },
        selected: false,
        data: { label: 'A', status: 'idle', statusLabel: 'Idle', panelTestCount: 1, inGroup: false },
      },
      {
        id: 'p2',
        type: 'catalogPage',
        position: { x: 100, y: 200 },
        selected: true,
        data: { label: 'B', status: 'idle', statusLabel: 'Idle', panelTestCount: 2, inGroup: false },
      },
    ]
    const built: Node[] = [
      { ...prev[0], data: { ...(prev[0].data as object), status: 'running', statusLabel: 'Running' } },
      prev[1],
    ]
    const result = mergePageMapNodes(prev, built)
    expect(result[0].data).toMatchObject({ status: 'running' })
    expect(result[0].position).toEqual({ x: 10, y: 20 })
    expect(result[1]).toBe(prev[1])
  })

  it('uses built position when parentId changes', () => {
    const prev: Node[] = [
      {
        id: 'p1',
        type: 'catalogPage',
        position: { x: 500, y: 500 },
        parentId: undefined,
        data: { label: 'A', inGroup: false },
      },
    ]
    const built: Node[] = [
      {
        id: 'p1',
        type: 'catalogPage',
        position: { x: 24, y: 48 },
        parentId: 'g1',
        data: { label: 'A', inGroup: true },
      },
    ]
    const result = mergePageMapNodes(prev, built)
    expect(result[0].position).toEqual({ x: 24, y: 48 })
    expect(result[0].parentId).toBe('g1')
  })

  it('returns prev array reference when nothing changed', () => {
    const prev: Node[] = [{ id: 'p1', type: 'catalogPage', position: { x: 0, y: 0 }, data: { label: 'A' } }]
    const built: Node[] = [{ id: 'p1', type: 'catalogPage', position: { x: 0, y: 0 }, data: { label: 'A' } }]
    expect(mergePageMapNodes(prev, built)).toBe(prev)
  })
})

describe('mergePageMapEdges', () => {
  it('returns prev when edge list unchanged', () => {
    const prev: Edge[] = [
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        type: 'labeled',
        animated: false,
        style: { stroke: '#000', strokeWidth: 2 },
        data: { label: 'link' },
      },
    ]
    const next: Edge[] = [{ ...prev[0] }]
    expect(mergePageMapEdges(prev, next)).toBe(prev)
  })

  it('updates only changed edge references when path highlight toggles', () => {
    const prev: Edge[] = [
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        type: 'labeled',
        animated: false,
        style: { stroke: '#000', strokeWidth: 2 },
      },
      {
        id: 'e2',
        source: 'b',
        target: 'c',
        type: 'labeled',
        animated: false,
        style: { stroke: '#000', strokeWidth: 2 },
      },
    ]
    const next: Edge[] = [
      { ...prev[0], style: { stroke: '#ff6a00', strokeWidth: 2.5 } },
      prev[1],
    ]
    const result = mergePageMapEdges(prev, next)
    expect(result).not.toBe(prev)
    expect(result[0].style?.stroke).toBe('#ff6a00')
    expect(result[1]).toBe(prev[1])
  })
})
