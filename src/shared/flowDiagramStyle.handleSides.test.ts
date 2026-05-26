import { describe, expect, it } from 'vitest'
import { resolveHandleSidesMode, resolvedHandleSidesFromMerged } from './flowDiagramStyle'

describe('handle sides mode', () => {
  it('defaults to top/bottom for handleSideCount 2', () => {
    expect(resolveHandleSidesMode({ handleSideCount: 2 })).toBe('two-vertical')
    expect(resolvedHandleSidesFromMerged({ handleSideCount: 2 })).toEqual(['top', 'bottom'])
  })

  it('supports left/right mode', () => {
    expect(resolveHandleSidesMode({ handleSidesMode: 'two-horizontal', handleSideCount: 2 })).toBe('two-horizontal')
    expect(resolvedHandleSidesFromMerged({ handleSidesMode: 'two-horizontal' })).toEqual(['left', 'right'])
  })

  it('supports four sides', () => {
    expect(resolveHandleSidesMode({ handleSideCount: 4 })).toBe('four')
    expect(resolvedHandleSidesFromMerged({ handleSideCount: 4 })).toEqual(['top', 'right', 'bottom', 'left'])
  })

  it('supports single-side modes', () => {
    expect(resolvedHandleSidesFromMerged({ handleSidesMode: 'one-top' })).toEqual(['top'])
    expect(resolvedHandleSidesFromMerged({ handleSidesMode: 'one-bottom' })).toEqual(['bottom'])
    expect(resolvedHandleSidesFromMerged({ handleSidesMode: 'one-left' })).toEqual(['left'])
    expect(resolvedHandleSidesFromMerged({ handleSidesMode: 'one-right' })).toEqual(['right'])
  })
})
