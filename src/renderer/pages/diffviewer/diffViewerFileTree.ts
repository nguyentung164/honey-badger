import { diffViewerFileOptionId, normalizeGitPath } from './diffViewerGitFiles'
import type { DiffViewerFileEntry } from './diffViewerPayload'

export type DiffFileTreeSectionId = 'changes' | 'staged' | 'files'
export type DiffFileTreeViewMode = 'tree' | 'flat'
export type DiffFileTreeSortBy = 'name' | 'path' | 'status'
export type DiffFileTreeStatusFilter =
  | 'all'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflicted'

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

export type DiffFileTreeGroupNode = {
  kind: 'group'
  id: string
  pathKey: string
  label: string
  children: DiffFileTreeFileNode[]
}

export type DiffFileTreeNode = DiffFileTreeFileNode | DiffFileTreeFolderNode | DiffFileTreeGroupNode

export type DiffFileTreeSection = {
  id: DiffFileTreeSectionId
  labelKey: string
  nodes: DiffFileTreeNode[]
  flatFileIndices: number[]
}

type IndexedEntry = { index: number; entry: DiffViewerFileEntry }

const STATUS_SORT_RANK: Record<string, number> = {
  conflicted: 0,
  deleted: 1,
  d: 1,
  modified: 2,
  m: 2,
  renamed: 3,
  r: 3,
  added: 4,
  a: 4,
  untracked: 5,
  '?': 5,
  staged: 6,
}

function fileNameFromPath(filePath: string): string {
  const parts = normalizeGitPath(filePath).split('/').filter(Boolean)
  return parts[parts.length - 1] ?? filePath
}

function parentDirFromPath(filePath: string): string {
  const parts = normalizeGitPath(filePath).split('/').filter(Boolean)
  if (parts.length <= 1) return '.'
  return parts.slice(0, -1).join('/')
}

const STATUS_CATEGORY_MAP: Record<string, DiffFileTreeStatusFilter> = {
  m: 'modified',
  modified: 'modified',
  a: 'added',
  added: 'added',
  d: 'deleted',
  deleted: 'deleted',
  r: 'renamed',
  renamed: 'renamed',
  u: 'untracked',
  untracked: 'untracked',
  '?': 'untracked',
  c: 'conflicted',
  conflicted: 'conflicted',
}

export function normalizeFileStatusCategory(status?: string): DiffFileTreeStatusFilter | null {
  const key = (status ?? '').trim().toLowerCase()
  return STATUS_CATEGORY_MAP[key] ?? null
}

export function matchesStatusFilter(fileStatus: string | undefined, filter: DiffFileTreeStatusFilter): boolean {
  if (filter === 'all') return true
  return normalizeFileStatusCategory(fileStatus) === filter
}

export function filterFilesByStatus<T extends { fileStatus?: string }>(
  files: T[],
  statusFilter: DiffFileTreeStatusFilter
): T[] {
  if (statusFilter === 'all') return files
  return files.filter(file => matchesStatusFilter(file.fileStatus, statusFilter))
}

function statusSortRank(status: string): number {
  const key = (status || '').trim().toLowerCase()
  return STATUS_SORT_RANK[key] ?? 50
}

function compareIndexedEntries(a: IndexedEntry, b: IndexedEntry, sortBy: DiffFileTreeSortBy): number {
  if (sortBy === 'status') {
    const rankDiff = statusSortRank(a.entry.fileStatus) - statusSortRank(b.entry.fileStatus)
    if (rankDiff !== 0) return rankDiff
    return normalizeGitPath(a.entry.filePath).localeCompare(normalizeGitPath(b.entry.filePath))
  }
  if (sortBy === 'path') {
    return normalizeGitPath(a.entry.filePath).localeCompare(normalizeGitPath(b.entry.filePath))
  }
  return fileNameFromPath(a.entry.filePath).localeCompare(fileNameFromPath(b.entry.filePath))
}

export function sortIndexedEntries(items: IndexedEntry[], sortBy: DiffFileTreeSortBy): IndexedEntry[] {
  return [...items].sort((a, b) => compareIndexedEntries(a, b, sortBy))
}

function buildFlatFileNodes(items: IndexedEntry[]): DiffFileTreeFileNode[] {
  return items.map(item => ({
    kind: 'file' as const,
    id: diffViewerFileOptionId(item.entry, item.index),
    index: item.index,
    entry: item.entry,
    fileName: fileNameFromPath(item.entry.filePath),
  }))
}

function buildFlatGroupedFileNodes(items: IndexedEntry[]): DiffFileTreeNode[] {
  const groups = new Map<string, IndexedEntry[]>()
  for (const item of items) {
    const dir = parentDirFromPath(item.entry.filePath)
    const list = groups.get(dir) ?? []
    list.push(item)
    groups.set(dir, list)
  }

  const sortedDirs = [...groups.keys()].sort((a, b) => a.localeCompare(b))
  const nodes: DiffFileTreeNode[] = []

  for (const dir of sortedDirs) {
    const groupItems = groups.get(dir) ?? []
    const fileNodes = buildFlatFileNodes(groupItems)
    nodes.push({
      kind: 'group',
      id: `group:${dir}`,
      pathKey: dir,
      label: dir === '.' ? '(root)' : dir,
      children: fileNodes,
    })
  }

  return nodes
}

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
    } else if (node.kind === 'group') {
      indices.push(...node.children.map(child => child.index))
    } else {
      indices.push(...collectFileIndicesFromNodes(node.children))
    }
  }
  return indices
}

function buildSection(
  id: DiffFileTreeSectionId,
  labelKey: string,
  items: IndexedEntry[],
  options: { viewMode?: DiffFileTreeViewMode; groupByFolder?: boolean } = {}
): DiffFileTreeSection {
  const viewMode = options.viewMode ?? 'tree'
  const groupByFolder = options.groupByFolder ?? false

  let nodes: DiffFileTreeNode[]
  if (viewMode === 'flat' && groupByFolder) {
    nodes = buildFlatGroupedFileNodes(items)
  } else if (viewMode === 'flat') {
    nodes = buildFlatFileNodes(items)
  } else {
    nodes = buildFolderTreeFromEntries(items)
  }

  return {
    id,
    labelKey,
    nodes,
    flatFileIndices: collectFileIndicesFromNodes(nodes),
  }
}

/** Select file indices between anchor and target in visual tree order (depth-first). */
export function rangeSelectIndices(flatIndices: number[], anchorIndex: number, targetIndex: number): number[] {
  const anchorPos = flatIndices.indexOf(anchorIndex)
  const targetPos = flatIndices.indexOf(targetIndex)
  if (anchorPos < 0 || targetPos < 0) return [targetIndex]
  const [start, end] = anchorPos < targetPos ? [anchorPos, targetPos] : [targetPos, anchorPos]
  return flatIndices.slice(start, end + 1)
}

export function buildDiffFileTreeSections(
  files: DiffViewerFileEntry[],
  options?: {
    splitStaging?: boolean
    viewMode?: DiffFileTreeViewMode
    sortBy?: DiffFileTreeSortBy
    groupByFolder?: boolean
    statusFilter?: DiffFileTreeStatusFilter
  }
): DiffFileTreeSection[] {
  const viewMode = options?.viewMode ?? 'tree'
  const sortBy = options?.sortBy ?? 'path'
  const groupByFolder = options?.groupByFolder ?? false
  const statusFilter = options?.statusFilter ?? 'all'
  const indexed = sortIndexedEntries(
    files
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => matchesStatusFilter(entry.fileStatus, statusFilter)),
    sortBy
  )

  if (options?.splitStaging) {
    const changes = indexed.filter(({ entry }) => entry.stagingState !== 'staged')
    const staged = indexed.filter(({ entry }) => entry.stagingState === 'staged')
    return [
      buildSection('changes', 'git.changes', changes, { viewMode, groupByFolder }),
      buildSection('staged', 'git.stagedChanges', staged, { viewMode, groupByFolder }),
    ]
  }

  return [buildSection('files', 'dialog.diffViewer.navFiles', indexed, { viewMode, groupByFolder })]
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

    if (node.kind === 'group') {
      const filteredChildren = node.children.filter(child => {
        const haystack = `${child.fileName} ${child.entry.filePath}`.toLowerCase()
        return haystack.includes(query)
      })
      const groupMatches =
        node.label.toLowerCase().includes(query) || node.pathKey.toLowerCase().includes(query)
      if (filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren,
        })
      } else if (groupMatches) {
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

export function collectAllFolderIds(sections: DiffFileTreeSection[]): string[] {
  const ids: string[] = []
  const walk = (nodes: DiffFileTreeNode[]) => {
    for (const node of nodes) {
      if (node.kind !== 'folder') continue
      ids.push(node.id)
      walk(node.children)
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
