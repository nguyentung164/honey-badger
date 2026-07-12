import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'
import { getEditorTabActivationOrder } from '@/pages/editor/lib/editorTabActivation'
import { scheduleBackgroundWork } from '@/pages/editor/lib/scheduleBackgroundWork'

const PREFETCH_COUNT = 4
let prefetchCancel: (() => void) | null = null

/** VS Code-style MRU prefetch: warm ITextModel for likely next tabs during idle time. */
export function scheduleEditorTabPrefetch(_repoCwd: string, activeTabId: string | null): void {
  prefetchCancel?.()
  prefetchCancel = null
  if (!activeTabId) return

  prefetchCancel = scheduleBackgroundWork(
    () => {
      prefetchCancel = null
      void prefetchAdjacentTabs(activeTabId)
    },
    { timeout: 2000 }
  )
}

export function cancelEditorTabPrefetch(): void {
  prefetchCancel?.()
  prefetchCancel = null
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
