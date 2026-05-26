import type { Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { nodeHasLayoutDimensions, nodesForAutoLayout } from './flowCanvasAutoLayout'

describe('flowCanvasAutoLayout', () => {
  it('merges live measured sizes from getNode', () => {
    const base = [{ id: 'a', type: 'pipelineStep', position: { x: 0, y: 0 }, data: {} }] as Node[]
    const live = {
      id: 'a',
      type: 'pipelineStep',
      position: { x: 0, y: 0 },
      data: {},
      measured: { width: 210, height: 68 },
    } as Node
    const merged = nodesForAutoLayout(base, id => (id === 'a' ? live : undefined))
    expect(merged[0]?.measured).toEqual({ width: 210, height: 68 })
    expect(nodeHasLayoutDimensions(merged[0]!)).toBe(true)
  })
})
