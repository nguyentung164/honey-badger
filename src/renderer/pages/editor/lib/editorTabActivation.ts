/** VS Code–style tab activation stack (most recent first). */
let activationStack: string[] = []

function pruneToOpenTabs(openTabIds: readonly string[]): void {
  const open = new Set(openTabIds)
  activationStack = activationStack.filter(id => open.has(id))
}

/** Record tab focus — call when a tab becomes active. */
export function recordEditorTabActivation(tabId: string, openTabIds: readonly string[]): void {
  pruneToOpenTabs(openTabIds)
  activationStack = [tabId, ...activationStack.filter(id => id !== tabId)]
}

/** Replace stack when restoring a workspace session. */
export function seedEditorTabActivation(openTabIds: readonly string[], activeTabId: string | null): void {
  if (openTabIds.length === 0) {
    activationStack = []
    return
  }
  if (!activeTabId || !openTabIds.includes(activeTabId)) {
    activationStack = [...openTabIds]
    return
  }
  activationStack = [activeTabId, ...openTabIds.filter(id => id !== activeTabId)]
}

export function removeEditorTabFromActivation(tabId: string): void {
  activationStack = activationStack.filter(id => id !== tabId)
}

/** Most-recent tab ids first (VS Code activation order). */
export function getEditorTabActivationOrder(): readonly string[] {
  return activationStack
}

/**
 * Pick the next active tab after closing the currently active tab.
 * Prefers MRU; falls back to the tab immediately left in the tab bar.
 */
export function resolveNextActiveTabAfterClose(
  closedTabId: string,
  tabsBeforeClose: readonly { id: string }[],
  tabsAfterClose: readonly { id: string }[]
): string | null {
  removeEditorTabFromActivation(closedTabId)
  pruneToOpenTabs(tabsAfterClose.map(t => t.id))

  if (tabsAfterClose.length === 0) return null

  for (const id of activationStack) {
    if (tabsAfterClose.some(t => t.id === id)) return id
  }

  const removedIndex = tabsBeforeClose.findIndex(t => t.id === closedTabId)
  const fallbackIndex = Math.max(0, removedIndex - 1)
  return tabsAfterClose[fallbackIndex]?.id ?? tabsAfterClose[0]?.id ?? null
}
