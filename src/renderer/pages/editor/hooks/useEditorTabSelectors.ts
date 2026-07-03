import { useMemo } from 'react'
import type { EditorTab } from '@/pages/editor/lib/editorWorkspaceTypes'
import { compareTabLabel } from '@/pages/editor/lib/editorWorkspaceTypes'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'

/** Tab bar metadata — excludes file content to avoid re-renders while typing. */
export type EditorTabSummary = {
  id: string
  relativePath: string
  compareWithPath?: string
  tabLabel: string
  isCompare: boolean
  isDirty: boolean
  isPreview: boolean
  isPinned: boolean
}

function buildSummaries(tabs: EditorTab[]): EditorTabSummary[] {
  return tabs.map(t => ({
    id: t.id,
    relativePath: t.relativePath,
    compareWithPath: t.compareWithPath,
    isCompare: t.kind === 'compare',
    tabLabel:
      t.kind === 'compare' && t.compareWithPath
        ? compareTabLabel(t.relativePath, t.compareWithPath)
        : (t.relativePath.split('/').pop() ?? t.relativePath),
    isDirty: t.isDirty,
    isPreview: t.isPreview,
    isPinned: t.isPinned,
  }))
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
    }
  }, [activeTabId, revision])
}
