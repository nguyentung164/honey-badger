import type { FileTreeRow } from '@/pages/editor/lib/flattenFileTree'

export type ExplorerInlineEdit =
  | { mode: 'rename'; targetPath: string; value: string }
  | { mode: 'create'; parentDir: string; createKind: 'file' | 'directory'; sessionId: string; value: string }

export type ExplorerDisplayRow =
  | { kind: 'tree'; row: FileTreeRow }
  | { kind: 'phantom'; parentDir: string; createKind: 'file' | 'directory'; depth: number; sessionId: string }

export function buildExplorerDisplayRows(rows: readonly FileTreeRow[], inlineEdit: ExplorerInlineEdit | null): ExplorerDisplayRow[] {
  if (!inlineEdit || inlineEdit.mode !== 'create') {
    return rows.map(row => ({ kind: 'tree', row }))
  }

  const parentIndex = inlineEdit.parentDir === '' ? -1 : rows.findIndex(r => r.node.relativePath === inlineEdit.parentDir)
  const parentDepth = parentIndex >= 0 ? rows[parentIndex].depth : -1
  const insertAt = parentIndex < 0 ? 0 : parentIndex + 1
  const phantom: ExplorerDisplayRow = {
    kind: 'phantom',
    parentDir: inlineEdit.parentDir,
    createKind: inlineEdit.createKind,
    depth: parentDepth + 1,
    sessionId: inlineEdit.sessionId,
  }

  const treeRows = rows.map(row => ({ kind: 'tree' as const, row }))
  return [...treeRows.slice(0, insertAt), phantom, ...treeRows.slice(insertAt)]
}

export function getExplorerDisplayRowKey(displayRow: ExplorerDisplayRow): string {
  if (displayRow.kind === 'phantom') return `phantom:${displayRow.sessionId}`
  return displayRow.row.node.relativePath || displayRow.row.node.name
}
