import { useEffect } from 'react'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'
import { flushPersistedMultiRootSession, flushPersistedSession } from '@/pages/editor/lib/editorSessionPersist'

function snapshotEditorSession() {
  const state = useEditorWorkspace.getState()
  if (state.multiRootWorkspace && state.workspaceSessionKey) {
    flushPersistedMultiRootSession(state.workspaceSessionKey, state.tabs, state.activeTabId)
    return
  }
  if (!state.repoCwd.trim()) return
  const active = state.tabs.find(t => t.id === state.activeTabId)
  flushPersistedSession(state.repoCwd, state.tabs, active?.relativePath ?? null)
}

/** Flush editor tab session before the window closes (VS Code workspace backup). */
export function useEditorSessionLifecycle() {
  useEffect(() => {
    const flush = () => snapshotEditorSession()

    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)

    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [])
}
