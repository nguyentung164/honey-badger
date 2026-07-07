import { describe, expect, it } from 'vitest'
import {
  editorPathsEqual,
  normalizeEditorRelativePath,
  resolveExternalChangeForOpenTab,
  shouldIgnoreWorkspaceWatchEvent,
} from '@/pages/editor/lib/editorExternalFileSync'

describe('editorExternalFileSync helpers', () => {
  it('normalizes relative paths', () => {
    expect(normalizeEditorRelativePath('\\src\\a.ts')).toBe('src/a.ts')
    expect(normalizeEditorRelativePath('/src/a.ts')).toBe('src/a.ts')
  })

  it('compares paths case-insensitively on Windows-style paths', () => {
    expect(editorPathsEqual('Src/A.ts', 'src/a.ts')).toBe(true)
  })

  it('ignores common vendor and build folders', () => {
    expect(shouldIgnoreWorkspaceWatchEvent('node_modules/pkg/index.js')).toBe(true)
    expect(shouldIgnoreWorkspaceWatchEvent('src/app.ts')).toBe(false)
  })

  it('resolves absolute watcher paths to open tab paths', () => {
    const repo = 'E:/project'
    const open = ['src/foo.ts', 'lib/bar.ts'] as const
    expect(resolveExternalChangeForOpenTab(repo, 'E:/project/src/foo.ts', open)).toBe('src/foo.ts')
    expect(resolveExternalChangeForOpenTab(repo, 'E:/other/file.ts', open)).toBeNull()
  })
})
