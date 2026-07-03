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

function statusSortRank(status?: string): number {
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

export function folderContainsFileIndex(node: DiffFileTreeFolderNode, targetIndex: number): boolean {
  for (const child of node.children) {
    if (child.kind === 'file') {
      if (child.index === targetIndex) return true
    } else if (child.kind === 'folder' && folderContainsFileIndex(child, targetIndex)) {
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

export const DIFF_TREE_ROW_HEIGHT = 23
export const DIFF_TREE_SECTION_HEADER_HEIGHT = 26

export type DiffFileTreeVisibleRow =
  | { kind: 'file'; id: string; depth: number; node: DiffFileTreeFileNode }
  | { kind: 'folder'; id: string; depth: number; node: DiffFileTreeFolderNode; expanded: boolean }
  | { kind: 'group'; id: string; depth: number; node: DiffFileTreeGroupNode }

export type DiffFileTreePanelVirtualRow =
  | { kind: 'section-header'; id: string; section: DiffFileTreeSection }
  | (DiffFileTreeVisibleRow & { section: DiffFileTreeSection })

/** Depth-first visible rows for flat/tree modes (respects folder expand state). */
export function flattenDiffFileTreeRows(
  nodes: DiffFileTreeNode[],
  options: {
    depth?: number
    expandedFolderIds: ReadonlySet<string>
    forceExpandFolders?: boolean
  }
): DiffFileTreeVisibleRow[] {
  const depth = options.depth ?? 0
  const forceExpand = options.forceExpandFolders ?? false
  const out: DiffFileTreeVisibleRow[] = []

  for (const node of nodes) {
    if (node.kind === 'file') {
      out.push({ kind: 'file', id: node.id, depth, node })
      continue
    }

    if (node.kind === 'group') {
      out.push({ kind: 'group', id: node.id, depth, node })
      for (const child of node.children) {
        out.push({ kind: 'file', id: child.id, depth: depth + 1, node: child })
      }
      continue
    }

    const expanded = forceExpand || options.expandedFolderIds.has(node.id)
    out.push({ kind: 'folder', id: node.id, depth, node, expanded })
    if (expanded) {
      out.push(
        ...flattenDiffFileTreeRows(node.children, {
          depth: depth + 1,
          expandedFolderIds: options.expandedFolderIds,
          forceExpandFolders: forceExpand,
        })
      )
    }
  }

  return out
}

/** Collapsible multi-section panel: section headers interleaved with tree rows. */
export function buildCollapsiblePanelVirtualRows(
  sections: DiffFileTreeSection[],
  options: {
    expandedSectionIds: ReadonlySet<string>
    expandedFolderIds: ReadonlySet<string>
    forceExpandAll?: boolean
  }
): DiffFileTreePanelVirtualRow[] {
  const force = options.forceExpandAll ?? false
  const out: DiffFileTreePanelVirtualRow[] = []

  for (const section of sections) {
    out.push({ kind: 'section-header', id: `section-header:${section.id}`, section })
    const sectionOpen = force || options.expandedSectionIds.has(section.id)
    if (!sectionOpen) continue

    const treeRows = flattenDiffFileTreeRows(section.nodes, {
      expandedFolderIds: options.expandedFolderIds,
      forceExpandFolders: force,
    })

    for (const row of treeRows) {
      out.push({ ...row, section })
    }
  }

  return out
}

export function estimateDiffFileTreePanelRowHeight(row: DiffFileTreePanelVirtualRow): number {
  return row.kind === 'section-header' ? DIFF_TREE_SECTION_HEADER_HEIGHT : DIFF_TREE_ROW_HEIGHT
}

export function getDiffFileTreePanelVirtualRowKey(row: DiffFileTreePanelVirtualRow): string {
  return row.id
}

export function getDiffFileTreeVisibleRowKey(row: DiffFileTreeVisibleRow): string {
  return row.id
}
