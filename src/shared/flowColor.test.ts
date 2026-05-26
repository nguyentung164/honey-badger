import { describe, expect, it } from 'vitest'
import { flowColorHasAlpha, formatFlowColor, normalizeFlowPickerColor, parseFlowColor } from 'shared/flowColor'

describe('flowColor', () => {
  it('parses hex6 and rgba', () => {
    expect(parseFlowColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(parseFlowColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 })
  })

  it('parses hex8 alpha', () => {
    expect(parseFlowColor('#ff000080').a).toBeCloseTo(0.502, 2)
  })

  it('formats opaque as hex and translucent as rgba', () => {
    expect(formatFlowColor({ r: 255, g: 0, b: 0, a: 1 })).toBe('#ff0000')
    expect(formatFlowColor({ r: 10, g: 20, b: 30, a: 0.5 })).toBe('rgba(10, 20, 30, 0.5)')
  })

  it('normalizes without dropping alpha', () => {
    expect(normalizeFlowPickerColor('rgba(100, 120, 140, 0.35)')).toBe('rgba(100, 120, 140, 0.35)')
    expect(normalizeFlowPickerColor('#336699')).toBe('#336699')
  })

  it('detects alpha channel', () => {
    expect(flowColorHasAlpha('#ffffff')).toBe(false)
    expect(flowColorHasAlpha('rgba(255,255,255,0.4)')).toBe(true)
  })
})
