import { describe, expect, it } from 'vitest'
import {
  FLOW_NODE_SHELL_RADIUS_PX,
  flowNodePanelRadiusPx,
  resolveFlowNodeShellVisual,
} from '@/components/flow-inspector/flowNodeShellVisual'
import { nodeRimGeometry, svgRimCenterlinePath, svgRimRingPath } from '@/components/flow-inspector/nodeRimGeometry'

describe('nodeRimGeometry', () => {
  it('ring outer edge matches border box', () => {
    const box = { w: 200, h: 80 }
    const path = svgRimRingPath(box, 1.5, FLOW_NODE_SHELL_RADIUS_PX)
    expect(path).toContain('M ')
    const geo = nodeRimGeometry(1.5, box)
    expect(geo.inset).toBe(1.5)
    expect(geo.innerRx).toBe(FLOW_NODE_SHELL_RADIUS_PX - 1.5)
  })

  it('centerline sits inside even-odd rim band', () => {
    const box = { w: 200, h: 80 }
    const stroke = 2
    expect(svgRimCenterlinePath(box, stroke)).toContain('M ')
    const geo = nodeRimGeometry(stroke, box)
    expect(geo.inset).toBe(stroke)
  })
})

describe('flowNodePanelRadiusPx', () => {
  it('matches outer radius minus rim stroke', () => {
    expect(flowNodePanelRadiusPx(1)).toBe(FLOW_NODE_SHELL_RADIUS_PX - 1)
  })
})

describe('resolveFlowNodeShellVisual — inline rim overlay', () => {
  it('solid: inline rim stroke tracks preset, no frame padding', () => {
    const thin = resolveFlowNodeShellVisual({ accentColor: '#38bdf8', borderWidth: 0.5 })
    const thick = resolveFlowNodeShellVisual({ accentColor: '#38bdf8', borderWidth: 1.5 })

    expect(thin.inlineRim).toEqual({ strokePx: 0.5, solidColor: '#38bdf8' })
    expect(thick.inlineRim).toEqual({ strokePx: 1.5, solidColor: '#38bdf8' })
    expect(thin.frameStyle.padding).toBeUndefined()
  })

  it('group: rim overlay + accent panel fill when accent is set', () => {
    const shell = resolveFlowNodeShellVisual(
      { accentColor: '#38bdf8', borderWidth: 1 },
      { accentBackground: true, interiorBackground: 'group-card' },
    )

    expect(shell.inlineRim?.strokePx).toBe(1)
    expect(shell.panelStyle.backgroundColor).toContain('#38bdf8')
  })

  it('group: rim overlay + semi card panel when accent is cleared', () => {
    const shell = resolveFlowNodeShellVisual(
      { borderWidth: 1 },
      { accentBackground: false, interiorBackground: 'group-card' },
    )

    expect(shell.inlineRim?.strokePx).toBe(1)
    expect(shell.panelStyle.backgroundColor).toContain('var(--card)')
  })

  it('note: transparent interior when accent is cleared', () => {
    const shell = resolveFlowNodeShellVisual(
      { borderWidth: 0 },
      { accentBackground: false, interiorBackground: 'transparent' },
    )

    expect(shell.borderMode).toBe('none')
    expect(shell.panelStyle.backgroundColor).toBeUndefined()
    expect(shell.panelStyle.backgroundImage).toBeUndefined()
  })

  it('note: accent tint matches node when border is none', () => {
    const shell = resolveFlowNodeShellVisual(
      { accentColor: '#38bdf8', borderWidth: 0 },
      { accentBackground: true, interiorBackground: 'transparent' },
    )

    expect(shell.borderMode).toBe('none')
    expect(shell.panelStyle.backgroundColor).toContain('#38bdf8')
  })

  it('note: accent panel fill inside rim when border is set', () => {
    const shell = resolveFlowNodeShellVisual(
      { accentColor: '#38bdf8', borderWidth: 1 },
      { accentBackground: true, interiorBackground: 'transparent' },
    )

    expect(shell.inlineRim?.strokePx).toBe(1)
    expect(shell.panelStyle.backgroundColor).toContain('#38bdf8')
  })

  it('gradient: inline SVG rim with stops', () => {
    const stops = [
      { color: '#38bdf8', position: 0 },
      { color: '#a78bfa', position: 100 },
    ]
    const shell = resolveFlowNodeShellVisual({ accentGradient: stops, borderWidth: 1.25 })

    expect(shell.inlineRim?.strokePx).toBe(1.25)
    expect(shell.inlineRim?.gradientStops).toEqual(stops)
  })

  it('orbit: no inline rim', () => {
    const shell = resolveFlowNodeShellVisual({
      accentColor: '#38bdf8',
      borderWidth: 1.5,
      nodeAnimation: 'beam',
    })

    expect(shell.inlineRim).toBeNull()
    expect(shell.borderMode).toBe('orbit')
  })

  it('orbit: keeps accent panel fill', () => {
    const shell = resolveFlowNodeShellVisual({
      accentColor: '#38bdf8',
      borderWidth: 1.5,
      nodeAnimation: 'beam',
    })

    expect(shell.borderMode).toBe('orbit')
    expect(shell.panelStyle.backgroundColor).toContain('#38bdf8')
  })

  it('none border: accent panel fill for frame (no inline rim)', () => {
    const shell = resolveFlowNodeShellVisual({ accentColor: '#38bdf8', borderWidth: 0 })

    expect(shell.inlineRim).toBeNull()
    expect(shell.borderMode).toBe('none')
    expect(shell.panelStyle.backgroundColor).toContain('#38bdf8')
  })
})
