import type { Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { devPipelineMiniMapNodeColor, devPipelineMiniMapNodeStrokeColor, devPipelineMiniMapNodeStrokeWidth } from '@/pages/dev-pipelines/devPipelineMinimap'

describe('devPipelineMinimap', () => {
  it('uses accent fill and success stroke for completed steps', () => {
    const node = {
      id: 's1',
      type: 'pipelineStep',
      position: { x: 0, y: 0 },
      data: { runVisual: 'success', diagramVisual: { accentColor: '#38bdf8' } },
    } as Node
    expect(devPipelineMiniMapNodeColor(node, false)).toMatch(/^#[0-9a-f]{6}$/i)
    expect(devPipelineMiniMapNodeStrokeColor(node, false)).toBe('#10b981')
    expect(devPipelineMiniMapNodeStrokeWidth(node)).toBe(2.5)
  })

  it('uses default accent stroke for idle steps without custom visual', () => {
    const node = {
      id: 's2',
      type: 'pipelineStep',
      position: { x: 0, y: 0 },
      data: { runVisual: 'idle' },
    } as Node
    expect(devPipelineMiniMapNodeStrokeColor(node, false)).toBe('#94a3b8')
    expect(devPipelineMiniMapNodeStrokeWidth(node)).toBe(1.5)
  })

  it('uses running stroke color', () => {
    const node = {
      id: 's3',
      type: 'pipelineStep',
      position: { x: 0, y: 0 },
      data: { runVisual: 'running' },
    } as Node
    expect(devPipelineMiniMapNodeStrokeColor(node, true)).toBe('#0ea5e9')
  })
})
