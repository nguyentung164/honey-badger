import type { EditorTabSummary } from '@/pages/editor/hooks/useEditorTabSelectors'
import type { EditorExplorerSectionId } from '@/pages/editor/hooks/useEditorExplorerSectionPrefs'
import { type ExplorerDisplayRow, getExplorerDisplayRowKey } from '@/pages/editor/explorer/explorerDisplayRows'

export type ExplorerPanelRow =
  | { kind: 'section-header'; id: EditorExplorerSectionId }
  | { kind: 'open-editor'; tab: EditorTabSummary; tabIndex: number }
  | { kind: 'tree'; displayRow: ExplorerDisplayRow }

export function buildExplorerPanelRows(
  tabs: readonly EditorTabSummary[],
  treeDisplayRows: readonly ExplorerDisplayRow[],
  expandedSections: ReadonlySet<EditorExplorerSectionId>
): ExplorerPanelRow[] {
  const rows: ExplorerPanelRow[] = []

  rows.push({ kind: 'section-header', id: 'open-editors' })
  if (expandedSections.has('open-editors')) {
    for (let i = 0; i < tabs.length; i++) {
      rows.push({ kind: 'open-editor', tab: tabs[i], tabIndex: i })
    }
  }

  rows.push({ kind: 'section-header', id: 'workspace' })
  if (expandedSections.has('workspace')) {
    for (const displayRow of treeDisplayRows) {
      rows.push({ kind: 'tree', displayRow })
    }
  }

  return rows
}

export function getExplorerPanelRowKey(row: ExplorerPanelRow): string {
  if (row.kind === 'section-header') return `section:${row.id}`
  if (row.kind === 'open-editor') return `open-editor:${row.tab.id}`
  return `tree:${getExplorerDisplayRowKey(row.displayRow)}`
}

export const EXPLORER_SECTION_HEADER_HEIGHT = 28
