import { describe, expect, it } from 'vitest'
import {
  fuzzyScoreLabel,
  parseQuickOpenQuery,
  scoreQuickOpenPath,
  tryResolveQuickOpenFilePath,
} from './quickOpenFuzzy'

describe('parseQuickOpenQuery', () => {
  it('parses line and column suffixes', () => {
    expect(parseQuickOpenQuery('src/foo.ts:42')).toEqual({ fileQuery: 'src/foo.ts', line: 42 })
    expect(parseQuickOpenQuery('src/foo.ts:42:10')).toEqual({ fileQuery: 'src/foo.ts', line: 42, column: 10 })
    expect(parseQuickOpenQuery('DiffToolbar.tsx:100')).toEqual({ fileQuery: 'DiffToolbar.tsx', line: 100 })
  })

  it('parses line suffix from the end (Windows drive letters)', () => {
    expect(parseQuickOpenQuery('E:/PERSONAL/honey-badger/src/foo.ts:100')).toEqual({
      fileQuery: 'E:/PERSONAL/honey-badger/src/foo.ts',
      line: 100,
    })
    expect(parseQuickOpenQuery('C:\\repo\\src\\foo.ts:42:5')).toEqual({
      fileQuery: 'C:/repo/src/foo.ts',
      line: 42,
      column: 5,
    })
  })

  it('keeps fuzzy query when no line suffix', () => {
    expect(parseQuickOpenQuery('SettingD')).toEqual({ fileQuery: 'SettingD' })
  })
})

describe('tryResolveQuickOpenFilePath', () => {
  const files = ['src/renderer/pages/diffviewer/DiffToolbar.tsx', 'src/other.ts']

  it('resolves repo-relative and absolute paths', () => {
    expect(tryResolveQuickOpenFilePath('src/renderer/pages/diffviewer/DiffToolbar.tsx', '/repo', files)).toBe(
      'src/renderer/pages/diffviewer/DiffToolbar.tsx',
    )
    expect(tryResolveQuickOpenFilePath('/repo/src/renderer/pages/diffviewer/DiffToolbar.tsx', '/repo', files)).toBe(
      'src/renderer/pages/diffviewer/DiffToolbar.tsx',
    )
    expect(
      tryResolveQuickOpenFilePath('E:/PERSONAL/honey-badger/src/renderer/pages/diffviewer/DiffToolbar.tsx', 'E:/PERSONAL/honey-badger', files),
    ).toBe('src/renderer/pages/diffviewer/DiffToolbar.tsx')
  })
})

describe('fuzzyScoreLabel', () => {
  it('matches VS Code-style subsequence queries', () => {
    const result = fuzzyScoreLabel('SettingD', 'SettingsDialog.tsx')
    expect(result).not.toBeNull()
    expect(result?.matchIndices).toContain(0)
    expect(result?.matchIndices.some(i => 'SettingsDialog.tsx'[i] === 'D')).toBe(true)
  })

  it('returns null when characters are out of order', () => {
    expect(fuzzyScoreLabel('DSetting', 'SettingsDialog.tsx')).toBeNull()
  })
})

describe('scoreQuickOpenPath', () => {
  it('matches filename for fuzzy queries', () => {
    const result = scoreQuickOpenPath('SettingD', 'src/renderer/components/dialogs/app/SettingsDialog.tsx')
    expect(result).not.toBeNull()
    expect(result?.fileName).toBe('SettingsDialog.tsx')
    expect(result?.matchIndices.length).toBeGreaterThan(0)
  })
})
