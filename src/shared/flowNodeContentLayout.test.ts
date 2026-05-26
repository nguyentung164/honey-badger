import { describe, expect, it } from 'vitest'
import {
  contentLayoutSupportsMetadata,
  getFlowNodeContentLayoutSize,
  getFlowNodeContentLayoutSizeFromStyle,
  normalizeContentDensity,
  normalizeContentLayout,
  normalizeMetadataMode,
  readFlowNodeLayoutDimension,
  resolveFlowCanvasNodeLayoutSize,
  resolveFlowNodeContentLayout,
} from './flowNodeContentLayout'

describe('flowNodeContentLayout normalize', () => {
  it('accepts valid layout kinds', () => {
    expect(normalizeContentLayout('inline')).toBe('inline')
    expect(normalizeContentLayout('metadata')).toBe('metadata')
    expect(normalizeContentLayout('invalid')).toBeUndefined()
  })

  it('accepts valid density and metadata mode', () => {
    expect(normalizeContentDensity('compact')).toBe('compact')
    expect(normalizeMetadataMode('toggle')).toBe('toggle')
    expect(normalizeContentDensity('x')).toBeUndefined()
  })
})

describe('resolveFlowNodeContentLayout', () => {
  it('defaults catalogPage to inline + toggle', () => {
    expect(resolveFlowNodeContentLayout(undefined, 'catalogPage')).toEqual({
      contentLayout: 'inline',
      contentDensity: 'comfortable',
      metadataMode: 'toggle',
    })
  })

  it('defaults pipelineStep to stacked + hidden', () => {
    expect(resolveFlowNodeContentLayout({}, 'pipelineStep')).toEqual({
      contentLayout: 'stacked',
      contentDensity: 'comfortable',
      metadataMode: 'hidden',
    })
  })

  it('forces hidden metadata on compact layout', () => {
    expect(
      resolveFlowNodeContentLayout({ contentLayout: 'compact', metadataMode: 'always' }, 'catalogPage'),
    ).toMatchObject({ contentLayout: 'compact', metadataMode: 'hidden' })
  })

  it('forces always metadata on metadata layout when hidden', () => {
    expect(
      resolveFlowNodeContentLayout({ contentLayout: 'metadata', metadataMode: 'hidden' }, 'catalogPage'),
    ).toMatchObject({ contentLayout: 'metadata', metadataMode: 'always' })
  })
})

describe('getFlowNodeContentLayoutSize', () => {
  it('returns larger metadata layout than compact', () => {
    const meta = getFlowNodeContentLayoutSize('metadata', 'comfortable', 'always', 'catalogPage')
    const compact = getFlowNodeContentLayoutSize('compact', 'comfortable', 'hidden', 'catalogPage')
    expect(meta.height).toBeGreaterThan(compact.height)
    expect(meta.width).toBeGreaterThan(compact.width)
  })

  it('scales with density', () => {
    const c = getFlowNodeContentLayoutSize('inline', 'compact', 'hidden', 'catalogPage')
    const s = getFlowNodeContentLayoutSize('inline', 'spacious', 'hidden', 'catalogPage')
    expect(s.width).toBeGreaterThan(c.width)
  })

  it('reads from style via helper', () => {
    const size = getFlowNodeContentLayoutSizeFromStyle({ contentLayout: 'iconBlock' }, 'catalogPage')
    expect(size.width).toBeGreaterThan(0)
    expect(size.height).toBeGreaterThan(0)
  })
})

describe('contentLayoutSupportsMetadata', () => {
  it('returns false for compact or hidden', () => {
    expect(contentLayoutSupportsMetadata('inline', 'hidden')).toBe(false)
    expect(contentLayoutSupportsMetadata('compact', 'toggle')).toBe(false)
  })

  it('returns true for toggle on inline', () => {
    expect(contentLayoutSupportsMetadata('inline', 'toggle')).toBe(true)
  })
})

describe('resolveFlowCanvasNodeLayoutSize', () => {
  it('prefers measured DOM dimensions over estimates', () => {
    expect(
      resolveFlowCanvasNodeLayoutSize({
        type: 'pipelineStep',
        data: { diagramVisual: { contentLayout: 'compact' } },
        measured: { width: 248, height: 52 },
      }),
    ).toEqual({ width: 248, height: 52 })
  })

  it('uses style dimensions for groups', () => {
    expect(
      resolveFlowCanvasNodeLayoutSize({
        type: 'catalogGroup',
        style: { width: 520, height: 360 },
      }),
    ).toEqual({ width: 520, height: 360 })
  })

  it('falls back to content-layout estimate for steps', () => {
    expect(
      resolveFlowCanvasNodeLayoutSize({
        type: 'pipelineStep',
        data: { diagramVisual: { contentLayout: 'iconBlock' } },
      }).width,
    ).toBe(120)
  })

  it('reads numeric strings from style', () => {
    expect(readFlowNodeLayoutDimension('280')).toBe(280)
    expect(readFlowNodeLayoutDimension('bad')).toBeUndefined()
  })
})
