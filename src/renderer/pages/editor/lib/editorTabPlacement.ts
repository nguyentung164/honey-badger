import type { EditorTab } from '@/pages/editor/lib/editorWorkspaceTypes'

function arrayMove<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items]
  next.splice(toIndex, 0, ...next.splice(fromIndex, 1))
  return next
}

/** VS Code: editor group sticky tab count at the front of the tab strip. */
export function countStickyTabs(tabs: readonly Pick<EditorTab, 'isSticky'>[]): number {
  let count = 0
  for (const tab of tabs) {
    if (!tab.isSticky) break
    count += 1
  }
  return count
}

/** VS Code: IEditorGroup.isSticky(index) — index lies in the sticky range. */
export function isTabIndexSticky(tabs: readonly EditorTab[], index: number): boolean {
  if (index < 0 || index >= tabs.length) return false
  return tabs[index]?.isSticky === true
}

/**
 * VS Code HistoryService.doReopenLastClosedEditor — drop index when sticky zone mismatches.
 * Returns `undefined` to append in the correct zone (sticky front / non-sticky end).
 */
export function resolveReopenInsertIndex(tabs: readonly EditorTab[], closedIndex: number, sticky: boolean): number | undefined {
  if (tabs.length === 0) return 0

  if (sticky && !isTabIndexSticky(tabs, closedIndex)) {
    return undefined
  }
  if (!sticky && isTabIndexSticky(tabs, closedIndex)) {
    return undefined
  }

  return Math.min(Math.max(0, closedIndex), tabs.length)
}

export function insertTabAtIndex(tabs: readonly EditorTab[], tab: EditorTab, insertIndex: number | undefined): EditorTab[] {
  if (insertIndex === undefined) {
    if (tab.isSticky) {
      const next = [...tabs]
      next.splice(countStickyTabs(tabs), 0, tab)
      return next
    }
    return [...tabs, tab]
  }

  const next = [...tabs]
  next.splice(insertIndex, 0, tab)
  return next
}

/** VS Code: pin editor → sticky, placed at end of sticky section. */
export function moveTabToStickyEnd(tabs: readonly EditorTab[], tabId: string): EditorTab[] {
  const index = tabs.findIndex(t => t.id === tabId)
  if (index < 0) return [...tabs]

  const tab = tabs[index]
  const without = tabs.filter(t => t.id !== tabId)
  const stickyCount = countStickyTabs(without)
  const next = [...without]
  next.splice(stickyCount, 0, tab)
  return next
}

/** VS Code: reorder tabs within sticky / non-sticky zones — pinned tabs cannot cross the separator. */
export function reorderEditorTabs(tabs: readonly EditorTab[], activeTabId: string, overTabId: string): EditorTab[] | null {
  const fromIndex = tabs.findIndex(t => t.id === activeTabId)
  const toIndex = tabs.findIndex(t => t.id === overTabId)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null

  const tab = tabs[fromIndex]
  const stickyCount = countStickyTabs(tabs)
  const maxIndex = tabs.length - 1

  let targetIndex = toIndex
  if (tab.isSticky) {
    if (stickyCount === 0) return null
    targetIndex = Math.min(targetIndex, stickyCount - 1)
  } else {
    targetIndex = Math.max(targetIndex, stickyCount)
  }
  targetIndex = Math.min(maxIndex, Math.max(0, targetIndex))
  if (fromIndex === targetIndex) return null

  return arrayMove([...tabs], fromIndex, targetIndex)
}
