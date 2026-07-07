import { describe, expect, it } from 'vitest'
import { isPathSaving, markPathSaving, normalizeSavingPath, unmarkPathSaving } from '@/pages/editor/lib/editorSavingPaths'

describe('editorSavingPaths', () => {
  it('tracks in-flight saves by normalized path', () => {
    markPathSaving('src\\Foo.ts')
    expect(isPathSaving('src/Foo.ts')).toBe(true)
    unmarkPathSaving('src/Foo.ts')
    expect(isPathSaving('src/foo.ts')).toBe(false)
  })

  it('normalizes paths consistently', () => {
    expect(normalizeSavingPath('\\src\\a.ts')).toBe('src/a.ts')
  })
})
