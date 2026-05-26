import type { Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { mixHexColors, pageMapMiniMapNodeColor, pageMapMiniMapNodeStrokeColor } from '@/pages/automation/map/pageMapMinimap'

describe('pageMapMinimap', () => {
  it('mixHexColors blends foreground and background', () => {
    expect(mixHexColors('#ff0000', '#000000', 0.5)).toBe('#800000')
  })

  it('uses accent fill and status stroke for catalog pages', () => {
    const node = {
      id: 'p1',
      type: 'catalogPage',
      position: { x: 0, y: 0 },
      data: { status: 'done', diagramVisual: { accentColor: '#38bdf8' } },
    } as Node
    expect(pageMapMiniMapNodeColor(node, false)).toMatch(/^#[0-9a-f]{6}$/i)
    expect(pageMapMiniMapNodeStrokeColor(node, false)).toBe('#10b981')
  })

  it('uses muted stroke for idle pages without accent', () => {
    const node = {
      id: 'p2',
      type: 'catalogPage',
      position: { x: 0, y: 0 },
      data: { status: 'idle' },
    } as Node
    expect(pageMapMiniMapNodeStrokeColor(node, false)).toBe('#94a3b8')
  })
})
