import { describe, expect, it } from 'vitest'
import {
  resolveAutoAdvanceTargetIndex,
  wrapFileNavIndex,
} from './diffViewerGitFiles'
import type { DiffViewerFileEntry } from './diffViewerPayload'

function entry(filePath: string, stagingState?: 'staged' | 'unstaged'): DiffViewerFileEntry {
  return { filePath, fileStatus: 'modified', stagingState }
}

describe('resolveAutoAdvanceTargetIndex', () => {
  it('keeps the same slot after the acted file is removed', () => {
    const files = [entry('b.ts'), entry('c.ts')]
    expect(resolveAutoAdvanceTargetIndex(0, files)).toBe(0)
    expect(files[0]?.filePath).toBe('b.ts')
  })

  it('skips a remaining staged copy of the same path after revert', () => {
    const files = [entry('a.ts', 'staged'), entry('b.ts')]
    expect(resolveAutoAdvanceTargetIndex(0, files, 'a.ts')).toBe(1)
  })

  it('returns null when only the acted file remains', () => {
    const files = [entry('a.ts', 'staged')]
    expect(resolveAutoAdvanceTargetIndex(0, files, 'a.ts')).toBeNull()
  })
})

describe('wrapFileNavIndex', () => {
  it('wraps forward from last file to first', () => {
    expect(wrapFileNavIndex(2, 1, 3)).toBe(0)
  })

  it('wraps backward from first file to last', () => {
    expect(wrapFileNavIndex(0, -1, 3)).toBe(2)
  })
})
