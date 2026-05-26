import { describe, expect, it } from 'vitest'
import {
  FLOW_OPACITY_DEFAULT,
  edgeLabelBorderWidthPreset,
  edgeLabelStaticBorderWidthPx,
  mergeConnectionStyle,
  nodeStaticBorderWidthPx,
  normalizeFlowOpacity,
  resolvedEdgeLabelChrome,
} from 'shared/flowDiagramStyle'

describe('normalizeFlowOpacity', () => {
  it('defaults to 1', () => {
    expect(normalizeFlowOpacity(undefined)).toBe(1)
    expect(normalizeFlowOpacity(null)).toBe(1)
    expect(normalizeFlowOpacity('bad')).toBe(1)
  })

  it('clamps and steps to 0.1', () => {
    expect(normalizeFlowOpacity(0.05)).toBe(0.1)
    expect(normalizeFlowOpacity(1.2)).toBe(1)
    expect(normalizeFlowOpacity(0.44)).toBe(0.4)
    expect(normalizeFlowOpacity(0.46)).toBe(0.5)
  })
})

describe('nodeStaticBorderWidthPx', () => {
  it('maps presets directly and auto defaults', () => {
    expect(nodeStaticBorderWidthPx(undefined, false)).toBe(1)
    expect(nodeStaticBorderWidthPx(undefined, true)).toBe(0.5)
    expect(nodeStaticBorderWidthPx(0, true)).toBe(0)
    expect(nodeStaticBorderWidthPx(1, true)).toBe(1)
    expect(nodeStaticBorderWidthPx(1.5, false)).toBe(1.5)
  })
})

describe('mergeConnectionStyle legacy edge animations', () => {
  it('maps retired train and comet to none', () => {
    expect(mergeConnectionStyle({ animation: 'train' as never }).animation).toBe('none')
    expect(mergeConnectionStyle({ animation: 'comet' as never }).animation).toBe('none')
  })

  it('keeps supported animations', () => {
    expect(mergeConnectionStyle({ animation: 'flow' }).animation).toBe('flow')
    expect(mergeConnectionStyle({ animation: 'arcSparks' }).animation).toBe('arcSparks')
    expect(mergeConnectionStyle({ animation: 'shimmer' }).animation).toBe('shimmer')
    expect(mergeConnectionStyle({ animation: 'shuttle' }).animation).toBe('shuttle')
    expect(mergeConnectionStyle({ animation: 'serpent' }).animation).toBe('serpent')
    expect(mergeConnectionStyle({ animation: 'firefly' }).animation).toBe('firefly')
  })

  it('merges opacity default', () => {
    expect(mergeConnectionStyle().opacity).toBe(FLOW_OPACITY_DEFAULT)
    expect(mergeConnectionStyle({ opacity: 0.3 }).opacity).toBe(0.3)
  })

  it('merges labelStyle defaults', () => {
    const merged = mergeConnectionStyle({ labelStyle: { fontSize: 12, color: '#ff0000' } })
    expect(merged.labelStyle?.fontSize).toBe(12)
    expect(merged.labelStyle?.color).toBe('#ff0000')
    expect(merged.labelStyle?.fontFamily).toBe('system')
    expect(mergeConnectionStyle({ labelStyle: {} }).labelStyle?.color).toBe('#ffffff')
    expect(mergeConnectionStyle({ labelStyle: {} }).labelStyle?.borderWidth).toBe(0)
  })

  it('applies edge label border width without requiring border color', () => {
    const chrome = resolvedEdgeLabelChrome(mergeConnectionStyle({ labelStyle: { borderWidth: 1.25 } }))
    expect(chrome.style.boxShadow).toBe('0 0 0 1.25px #94a3b8')
    expect(chrome.staticBorderPx).toBe(1.25)
  })

  it('hides edge label border when width preset is none', () => {
    const chrome = resolvedEdgeLabelChrome(mergeConnectionStyle({ labelStyle: { borderWidth: 0, borderColor: '#000000' } }))
    expect(chrome.staticBorderPx).toBe(0)
    expect(chrome.style.boxShadow).toBeUndefined()
  })

  it('maps edge label border width preset to static thickness', () => {
    expect(edgeLabelBorderWidthPreset({ borderColor: '#000000' })).toBe(0)
    expect(edgeLabelBorderWidthPreset({ borderWidth: 1 })).toBe(1)
    expect(edgeLabelStaticBorderWidthPx(0)).toBe(0)
    expect(edgeLabelStaticBorderWidthPx(0.5)).toBe(0.5)
    expect(edgeLabelStaticBorderWidthPx(1.5)).toBe(1.5)
  })

  it('applies label accent gradient to resolved chrome', () => {
    const chrome = resolvedEdgeLabelChrome(
      mergeConnectionStyle({
        labelStyle: {
          labelAccentGradient: [
            { color: '#ff0000', position: 0 },
            { color: '#0000ff', position: 100 },
          ],
          borderWidth: 1,
        },
      }),
    )
    expect(chrome.useAccentGradient).toBe(true)
    expect(chrome.style.backgroundImage).toContain('linear-gradient')
    expect(chrome.style.boxShadow).toBeUndefined()
    expect(chrome.staticBorderPx).toBe(1)
  })
})
