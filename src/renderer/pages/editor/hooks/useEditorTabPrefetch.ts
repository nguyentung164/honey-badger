import { getEditorTabActivationOrder } from '@/pages/editor/lib/editorTabActivation'
import { scheduleBackgroundWork } from '@/pages/editor/lib/scheduleBackgroundWork'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'

const PREFETCH_COUNT = 4

/** VS Code-style MRU prefetch: warm ITextModel for likely next tabs during idle time. */
export function scheduleEditorTabPrefetch(_repoCwd: string, activeTabId: string | null): void {
  if (!activeTabId) return

  scheduleBackgroundWork(() => {
    void prefetchAdjacentTabs(activeTabId)
  }, { timeout: 2000 })
}

async function prefetchAdjacentTabs(activeTabId: string): Promise<void> {
  const { tabs, prefetchTabContent } = useEditorWorkspace.getState()
  const textTabs = tabs.filter(t => t.kind === 'text')
  const order = getEditorTabActivationOrder()
  const tabById = new Map(textTabs.map(t => [t.id, t]))
  const candidates: string[] = []

  for (const id of order) {
    if (id === activeTabId) continue
    if (tabById.has(id)) candidates.push(id)
  }
  for (const tab of textTabs) {
    if (tab.id !== activeTabId && !candidates.includes(tab.id)) candidates.push(tab.id)
  }

  for (const tabId of candidates.slice(0, PREFETCH_COUNT)) {
    const tab = tabById.get(tabId)
    if (!tab || tab.contentLoaded) continue
    await prefetchTabContent(tabId)
  }
}
