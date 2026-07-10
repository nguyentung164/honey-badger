import type { EditorTabSummary } from '@/pages/editor/hooks/useEditorTabSelectors'
import {
  folderSectionId,
  type EditorExplorerSectionId,
} from '@/pages/editor/hooks/useEditorExplorerSectionPrefs'
import { type ExplorerDisplayRow, getExplorerDisplayRowKey } from '@/pages/editor/explorer/explorerDisplayRows'

export type ExplorerPanelRow =
  | {
      kind: 'section-header'
      id: EditorExplorerSectionId
      folderLabel?: string
      folderIndex?: number
      isActiveFolder?: boolean
    }
  | { kind: 'open-editor'; tab: EditorTabSummary; tabIndex: number }
  | { kind: 'tree'; displayRow: ExplorerDisplayRow; folderIndex?: number }

type MultiFolderInput = {
  index: number
  label: string
  treeDisplayRows: readonly ExplorerDisplayRow[]
}

export function buildExplorerPanelRows(
  tabs: readonly EditorTabSummary[],
  expandedSections: ReadonlySet<EditorExplorerSectionId>,
  workspace:
    | { mode: 'single'; treeDisplayRows: readonly ExplorerDisplayRow[] }
    | { mode: 'multi'; folders: MultiFolderInput[]; activeFolderIndex: number }
): ExplorerPanelRow[] {
  const rows: ExplorerPanelRow[] = []

  rows.push({ kind: 'section-header', id: 'open-editors' })
  if (expandedSections.has('open-editors')) {
    for (let i = 0; i < tabs.length; i++) {
      rows.push({ kind: 'open-editor', tab: tabs[i], tabIndex: i })
    }
  }

  if (workspace.mode === 'single') {
    rows.push({ kind: 'section-header', id: 'workspace' })
    if (expandedSections.has('workspace')) {
      for (const displayRow of workspace.treeDisplayRows) {
        rows.push({ kind: 'tree', displayRow })
      }
    }
    return rows
  }

  for (const folder of workspace.folders) {
    const sectionId = folderSectionId(folder.index)
    rows.push({
      kind: 'section-header',
      id: sectionId,
      folderLabel: folder.label,
      folderIndex: folder.index,
      isActiveFolder: folder.index === workspace.activeFolderIndex,
    })
    if (expandedSections.has(sectionId)) {
      for (const displayRow of folder.treeDisplayRows) {
        rows.push({ kind: 'tree', displayRow, folderIndex: folder.index })
      }
    }
  }

  return rows
}

export function getExplorerPanelRowKey(row: ExplorerPanelRow): string {
  if (row.kind === 'section-header') return `section:${row.id}`
  if (row.kind === 'open-editor') return `open-editor:${row.tab.id}`
  const folderKey = row.folderIndex != null ? `:f${row.folderIndex}` : ''
  return `tree${folderKey}:${getExplorerDisplayRowKey(row.displayRow)}`
}

export const EXPLORER_SECTION_HEADER_HEIGHT = 28
