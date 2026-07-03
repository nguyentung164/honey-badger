import { useCallback, useRef } from 'react'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'

export type EditorCloseConfirmState = {
  tabId: string
  fileName: string
  /** Save/discard all dirty tabs then run (e.g. layout leave). */
  onProceed?: () => void
  /** Close one dirty tab from the queue, then continue closing. */
  queueMode?: boolean
}

type UseEditorTabCloseQueueOptions = {
  closeTab: (tabId: string) => void
  setCloseConfirm: (state: EditorCloseConfirmState | null) => void
}

export function useEditorTabCloseQueue({ closeTab, setCloseConfirm }: UseEditorTabCloseQueueOptions) {
  const pendingCloseIdsRef = useRef<string[]>([])

  const drainCloseQueue = useCallback(() => {
    const queue = pendingCloseIdsRef.current
    while (queue.length > 0) {
      const tabId = queue[0]
      const tab = useEditorWorkspace.getState().tabs.find(t => t.id === tabId)
      if (!tab) {
        queue.shift()
        continue
      }
      if (tab.isDirty) {
        setCloseConfirm({
          tabId,
          fileName: tab.relativePath.split('/').pop() ?? tab.relativePath,
          queueMode: true,
        })
        return
      }
      closeTab(tabId)
      queue.shift()
    }
  }, [closeTab, setCloseConfirm])

  const requestCloseTabs = useCallback(
    (tabIds: readonly string[]) => {
      const unique = [...new Set(tabIds)].filter(id => useEditorWorkspace.getState().tabs.some(t => t.id === id))
      if (unique.length === 0) return
      pendingCloseIdsRef.current = unique
      drainCloseQueue()
    },
    [drainCloseQueue]
  )

  const requestCloseTab = useCallback((tabId: string) => requestCloseTabs([tabId]), [requestCloseTabs])

  const advanceCloseQueue = useCallback(() => {
    pendingCloseIdsRef.current.shift()
    drainCloseQueue()
  }, [drainCloseQueue])

  const clearCloseQueue = useCallback(() => {
    pendingCloseIdsRef.current = []
  }, [])

  return {
    requestCloseTab,
    requestCloseTabs,
    advanceCloseQueue,
    clearCloseQueue,
  }
}
