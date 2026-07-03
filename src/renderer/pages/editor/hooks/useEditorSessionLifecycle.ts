import { useEffect } from 'react'
import { flushPersistedSession } from '@/pages/editor/lib/editorSessionPersist'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'

function snapshotEditorSession() {
  const { repoCwd, tabs, activeTabId } = useEditorWorkspace.getState()
  if (!repoCwd.trim()) return
  const active = tabs.find(t => t.id === activeTabId)
  flushPersistedSession(repoCwd, tabs, active?.relativePath ?? null)
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
