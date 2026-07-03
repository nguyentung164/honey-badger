import { describe, expect, it } from 'vitest'
import { fuzzyScoreLabel, parseQuickOpenQuery, scoreQuickOpenPath } from './quickOpenFuzzy'

describe('parseQuickOpenQuery', () => {
  it('parses line and column suffixes', () => {
    expect(parseQuickOpenQuery('src/foo.ts:42')).toEqual({ fileQuery: 'src/foo.ts', line: 42 })
    expect(parseQuickOpenQuery('src/foo.ts:42:10')).toEqual({ fileQuery: 'src/foo.ts', line: 42, column: 10 })
  })

  it('keeps fuzzy query when no line suffix', () => {
    expect(parseQuickOpenQuery('SettingD')).toEqual({ fileQuery: 'SettingD' })
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
