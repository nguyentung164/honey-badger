import { useMemo } from 'react'
import type { EditorTab } from '@/pages/editor/lib/editorWorkspaceTypes'
import { compareTabLabel } from '@/pages/editor/lib/editorWorkspaceTypes'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'

/** Tab bar metadata — excludes file content to avoid re-renders while typing. */
export type EditorTabSummary = {
  id: string
  relativePath: string
  repoRoot: string
  compareWithPath?: string
  tabLabel: string
  isCompare: boolean
  isDirty: boolean
  isPreview: boolean
  isPinned: boolean
}

function buildSummaries(tabs: EditorTab[]): EditorTabSummary[] {
  const basenameCounts = new Map<string, number>()
  for (const tab of tabs) {
    if (tab.kind === 'compare') continue
    const base = tab.relativePath.split('/').pop() ?? tab.relativePath
    basenameCounts.set(base, (basenameCounts.get(base) ?? 0) + 1)
  }

  return tabs.map(tab => {
    const baseName = tab.relativePath.split('/').pop() ?? tab.relativePath
    const folderName = tab.repoRoot.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? tab.repoRoot
    const needsFolderLabel = tab.kind !== 'compare' && (basenameCounts.get(baseName) ?? 0) > 1

    return {
      id: tab.id,
      relativePath: tab.relativePath,
      repoRoot: tab.repoRoot,
      compareWithPath: tab.compareWithPath,
      isCompare: tab.kind === 'compare',
      tabLabel:
        tab.kind === 'compare' && tab.compareWithPath
          ? compareTabLabel(tab.repoRoot, tab.relativePath, tab.compareWithPath)
          : needsFolderLabel
            ? `${baseName} (${folderName})`
            : baseName,
      isDirty: tab.isDirty,
      isPreview: tab.isPreview,
      isPinned: tab.isPinned,
    }
  })
}

/** VS Code: subscribe to metadata revision, not every Monaco keystroke. */
export function useEditorTabSummaries(): EditorTabSummary[] {
  const revision = useEditorWorkspace(s => s.tabsMetaRevision)
  return useMemo(() => buildSummaries(useEditorWorkspace.getState().tabs), [revision])
}

export function useActiveEditorTab(activeTabId: string | null): EditorTab | null {
  const revision = useEditorWorkspace(s => s.tabsMetaRevision)
  return useMemo(() => {
    if (!activeTabId) return null
    return useEditorWorkspace.getState().tabs.find(t => t.id === activeTabId) ?? null
  }, [activeTabId, revision])
}

export function useActiveTabStatus(activeTabId: string | null) {
  const revision = useEditorWorkspace(s => s.tabsMetaRevision)
  return useMemo(() => {
    const tab = activeTabId ? useEditorWorkspace.getState().tabs.find(t => t.id === activeTabId) : undefined
    return {
      relativePath: tab?.relativePath,
      languageId: tab?.languageId,
      repoRoot: tab?.repoRoot,
    }
  }, [activeTabId, revision])
}
