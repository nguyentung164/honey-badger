import { describe, expect, it } from 'vitest'
import {
  buildDiffFileTreeSections,
  collectExpandedFolderIdsForFile,
  filterDiffFileTreeSections,
  folderContainsFileIndex,
} from './diffViewerFileTree'
import type { DiffViewerFileEntry } from './diffViewerPayload'

function entry(filePath: string, stagingState?: 'staged' | 'unstaged'): DiffViewerFileEntry {
  return { filePath, fileStatus: 'modified', stagingState }
}

describe('buildDiffFileTreeSections', () => {
  it('splits changes and staged sections', () => {
    const files = [entry('src/a.ts', 'unstaged'), entry('src/b.ts', 'staged')]
    const sections = buildDiffFileTreeSections(files, { splitStaging: true })
    expect(sections).toHaveLength(2)
    expect(sections[0]?.id).toBe('changes')
    expect(sections[0]?.flatFileIndices).toEqual([0])
    expect(sections[1]?.id).toBe('staged')
    expect(sections[1]?.flatFileIndices).toEqual([1])
  })

  it('groups files into nested folders', () => {
    const files = [entry('src/app/page.tsx'), entry('src/lib/util.ts')]
    const sections = buildDiffFileTreeSections(files)
    const root = sections[0]?.nodes[0]
    expect(root?.kind).toBe('folder')
    if (root?.kind === 'folder') {
      expect(root.name).toBe('src')
      expect(root.children.some(child => child.kind === 'folder' && child.name === 'app')).toBe(true)
      expect(root.children.some(child => child.kind === 'folder' && child.name === 'lib')).toBe(true)
    }
  })
})

describe('filterDiffFileTreeSections', () => {
  it('filters by file path and keeps parent folders', () => {
    const files = [entry('src/app/page.tsx'), entry('src/lib/util.ts')]
    const sections = buildDiffFileTreeSections(files)
    const filtered = filterDiffFileTreeSections(sections, 'page')
    expect(filtered[0]?.flatFileIndices).toEqual([0])
    const root = filtered[0]?.nodes[0]
    expect(root?.kind).toBe('folder')
  })
})

describe('collectExpandedFolderIdsForFile', () => {
  it('returns folder ids containing the active file', () => {
    const files = [entry('src/app/page.tsx'), entry('src/lib/util.ts')]
    const sections = buildDiffFileTreeSections(files)
    const ids = collectExpandedFolderIdsForFile(sections, 0)
    expect(ids).toContain('folder:src')
    expect(ids).toContain('folder:src/app')
  })
})

describe('folderContainsFileIndex', () => {
  it('detects nested file membership', () => {
    const sections = buildDiffFileTreeSections([entry('src/app/page.tsx')])
    const root = sections[0]?.nodes[0]
    expect(root?.kind).toBe('folder')
    if (root?.kind === 'folder') {
      expect(folderContainsFileIndex(root, 0)).toBe(true)
      expect(folderContainsFileIndex(root, 99)).toBe(false)
    }
  })
})
