import { diffViewerFileOptionId, normalizeGitPath } from './diffViewerGitFiles'
import type { DiffViewerFileEntry } from './diffViewerPayload'

export type DiffFileTreeSectionId = 'changes' | 'staged' | 'files'

export type DiffFileTreeFileNode = {
  kind: 'file'
  id: string
  index: number
  entry: DiffViewerFileEntry
  fileName: string
}

export type DiffFileTreeFolderNode = {
  kind: 'folder'
  id: string
  name: string
  pathKey: string
  children: DiffFileTreeNode[]
}

export type DiffFileTreeNode = DiffFileTreeFileNode | DiffFileTreeFolderNode

export type DiffFileTreeSection = {
  id: DiffFileTreeSectionId
  labelKey: string
  nodes: DiffFileTreeNode[]
  flatFileIndices: number[]
}

type IndexedEntry = { index: number; entry: DiffViewerFileEntry }

type MutableFolder = {
  name: string
  pathKey: string
  folders: Map<string, MutableFolder>
  files: DiffFileTreeFileNode[]
}

function createMutableFolder(name: string, pathKey: string): MutableFolder {
  return { name, pathKey, folders: new Map(), files: [] }
}

function insertFileIntoMutableTree(root: MutableFolder, item: IndexedEntry) {
  const parts = normalizeGitPath(item.entry.filePath).split('/').filter(Boolean)
  if (parts.length === 0) return

  const fileName = parts.pop()
  if (!fileName) return
  let current = root
  let pathKey = ''

  for (const segment of parts) {
    pathKey = pathKey ? `${pathKey}/${segment}` : segment
    if (!current.folders.has(segment)) {
      current.folders.set(segment, createMutableFolder(segment, pathKey))
    }
    const next = current.folders.get(segment)
    if (!next) return
    current = next
  }

  current.files.push({
    kind: 'file',
    id: diffViewerFileOptionId(item.entry, item.index),
    index: item.index,
    entry: item.entry,
    fileName,
  })
}

function mutableFolderToNodes(folder: MutableFolder): DiffFileTreeNode[] {
  const nodes: DiffFileTreeNode[] = []

  const folderNames = [...folder.folders.keys()].sort((a, b) => a.localeCompare(b))
  for (const name of folderNames) {
    const child = folder.folders.get(name)!
    nodes.push({
      kind: 'folder',
      id: `folder:${child.pathKey}`,
      name: child.name,
      pathKey: child.pathKey,
      children: mutableFolderToNodes(child),
    })
  }

  const sortedFiles = [...folder.files].sort((a, b) => a.fileName.localeCompare(b.fileName))
  nodes.push(...sortedFiles)

  return nodes
}

function buildFolderTreeFromEntries(items: IndexedEntry[]): DiffFileTreeNode[] {
  if (items.length === 0) return []
  const root = createMutableFolder('', '')
  for (const item of items) {
    insertFileIntoMutableTree(root, item)
  }
  return mutableFolderToNodes(root)
}

function collectFileIndicesFromNodes(nodes: DiffFileTreeNode[]): number[] {
  const indices: number[] = []
  for (const node of nodes) {
    if (node.kind === 'file') {
      indices.push(node.index)
    } else {
      indices.push(...collectFileIndicesFromNodes(node.children))
    }
  }
  return indices
}

function buildSection(
  id: DiffFileTreeSectionId,
  labelKey: string,
  items: IndexedEntry[]
): DiffFileTreeSection {
  const nodes = buildFolderTreeFromEntries(items)
  return {
    id,
    labelKey,
    nodes,
    flatFileIndices: items.map(item => item.index),
  }
}

export function buildDiffFileTreeSections(
  files: DiffViewerFileEntry[],
  options?: { splitStaging?: boolean }
): DiffFileTreeSection[] {
  const indexed = files.map((entry, index) => ({ entry, index }))

  if (options?.splitStaging) {
    const changes = indexed.filter(({ entry }) => entry.stagingState !== 'staged')
    const staged = indexed.filter(({ entry }) => entry.stagingState === 'staged')
    return [
      buildSection('changes', 'git.changes', changes),
      buildSection('staged', 'git.stagedChanges', staged),
    ]
  }

  return [buildSection('files', 'dialog.diffViewer.navFiles', indexed)]
}

function filterNodes(nodes: DiffFileTreeNode[], query: string): DiffFileTreeNode[] {
  const result: DiffFileTreeNode[] = []

  for (const node of nodes) {
    if (node.kind === 'file') {
      const haystack = `${node.fileName} ${node.entry.filePath}`.toLowerCase()
      if (haystack.includes(query)) {
        result.push(node)
      }
      continue
    }

    const filteredChildren = filterNodes(node.children, query)
    const folderMatches = node.name.toLowerCase().includes(query) || node.pathKey.toLowerCase().includes(query)
    if (filteredChildren.length > 0) {
      result.push({
        ...node,
        children: filteredChildren,
      })
    } else if (folderMatches) {
      result.push(node)
    }
  }

  return result
}

export function filterDiffFileTreeSections(sections: DiffFileTreeSection[], query: string): DiffFileTreeSection[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return sections

  return sections.map(section => {
    const nodes = filterNodes(section.nodes, normalizedQuery)
    return {
      ...section,
      nodes,
      flatFileIndices: collectFileIndicesFromNodes(nodes),
    }
  })
}

export function folderContainsFileIndex(node: DiffFileTreeFolderNode, targetIndex: number): boolean {
  for (const child of node.children) {
    if (child.kind === 'file') {
      if (child.index === targetIndex) return true
    } else if (folderContainsFileIndex(child, targetIndex)) {
      return true
    }
  }
  return false
}

export function collectExpandedFolderIdsForFile(sections: DiffFileTreeSection[], targetIndex: number): string[] {
  const ids: string[] = []

  const walk = (nodes: DiffFileTreeNode[]) => {
    for (const node of nodes) {
      if (node.kind !== 'folder') continue
      if (folderContainsFileIndex(node, targetIndex)) {
        ids.push(node.id)
        walk(node.children)
      }
    }
  }

  for (const section of sections) {
    walk(section.nodes)
  }

  return ids
}

export function collectVisibleFileIndices(sections: DiffFileTreeSection[]): number[] {
  return sections.flatMap(section => section.flatFileIndices)
}

export function resolveContextMenuIndices(selectedIndices: Set<number>, targetIndex: number): number[] {
  if (selectedIndices.size > 0 && selectedIndices.has(targetIndex)) {
    return [...selectedIndices].sort((a, b) => a - b)
  }
  return [targetIndex]
}
