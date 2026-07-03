'use client'

import type * as Monaco from 'monaco-editor'
import { lazy, Suspense, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import type { CodeEditorHandle } from '@/components/code/CodeEditor'
import { EditorComparePane } from '@/pages/editor/editor-area/EditorComparePane'
import { EditorEmptyState } from '@/pages/editor/editor-area/EditorEmptyState'
import { EditorMonacoHost } from '@/pages/editor/editor-area/EditorMonacoHost'
import { editorCommandBridge, type EditorCursorPosition } from '@/pages/editor/lib/editorCommandBridge'
import { syncOpenTabKeys } from '@/pages/editor/lib/editorModelRegistry'
import { useActiveEditorTab } from '@/pages/editor/hooks/useEditorTabSelectors'
import { useLazyEditorLsp } from '@/pages/editor/hooks/useLazyEditorLsp'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'

const LazyEditorMonacoHost = lazy(() =>
  Promise.resolve({ default: EditorMonacoHost })
)

type EditorTabPaneProps = {
  activeTabId: string | null
  repoCwd: string
  onSyncDirty: (tabId: string, alternativeVersionId: number) => void
  onCursorChange?: (position: EditorCursorPosition | null) => void
}

export function EditorTabPane({ activeTabId, repoCwd, onSyncDirty, onCursorChange }: EditorTabPaneProps) {
  const { t } = useTranslation()
  const tab = useActiveEditorTab(activeTabId)
  const editorRef = useRef<CodeEditorHandle>(null)
  const tabs = useEditorWorkspace(s => s.tabs)
  const onSyncDirtyRef = useRef(onSyncDirty)
  onSyncDirtyRef.current = onSyncDirty
  const dirtyFlushRaf = useRef<number | null>(null)
  const pendingDirtyRef = useRef<{ tabId: string; alternativeVersionId: number } | null>(null)

  useEffect(() => {
    if (!repoCwd) return
    syncOpenTabKeys(
      repoCwd,
      tabs.filter(t => t.kind === 'text').map(t => t.relativePath)
    )
  }, [repoCwd, tabs])

  useEffect(() => {
    if (!tab?.reveal || !editorRef.current) return
    editorRef.current.revealLine(tab.reveal.line, tab.reveal.column)
  }, [tab?.reveal, tab?.id])

  const registerBridge = useCallback(() => {
    const handle = editorRef.current
    if (!handle) return
    const bridge = {
      focus: () => handle.focus(),
      getValue: () => handle.getValue(),
      getCursorPosition: () => handle.getCursorPosition(),
      runAction: (actionId: string) => handle.runAction(actionId),
      revealLine: (line: number, column?: number) => handle.revealLine(line, column),
    }
    editorCommandBridge.register(bridge)
    return () => editorCommandBridge.unregister(bridge)
  }, [])

  useEffect(() => {
    if (!tab || tab.kind !== 'text' || !tab.contentLoaded) return
    return registerBridge()
  }, [tab?.id, tab?.kind, tab?.contentLoaded, registerBridge])

  const tabMetaRef = useRef({ id: '' })
  if (tab) tabMetaRef.current = { id: tab.id }

  const lspTab =
    tab && tab.kind === 'text' ? { relativePath: tab.relativePath, languageId: tab.languageId } : null
  const { onEditorMount, onLspContentChange, onLspModelChange } = useLazyEditorLsp(repoCwd, lspTab)

  const handleEditorMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      onEditorMount(editor, monaco)
      registerBridge()
    },
    [onEditorMount, registerBridge]
  )

  const flushDirty = useCallback(() => {
    dirtyFlushRaf.current = null
    const pending = pendingDirtyRef.current
    if (!pending) return
    pendingDirtyRef.current = null
    onSyncDirtyRef.current(pending.tabId, pending.alternativeVersionId)
  }, [])

  const handleChange = useCallback(
    (alternativeVersionId: number, changes: Monaco.editor.IModelContentChange[]) => {
      const tabId = tabMetaRef.current.id
      if (!tabId) return
      pendingDirtyRef.current = { tabId, alternativeVersionId }
      if (dirtyFlushRaf.current == null) {
        dirtyFlushRaf.current = requestAnimationFrame(flushDirty)
      }
      onLspModelChange(changes)
    },
    [flushDirty, onLspModelChange]
  )

  useEffect(() => {
    return () => {
      if (dirtyFlushRaf.current != null) cancelAnimationFrame(dirtyFlushRaf.current)
    }
  }, [])

  if (!tab) return <EditorEmptyState />

  if (tab.isLoading || !tab.contentLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <GlowLoader className="h-10 w-10" />
      </div>
    )
  }

  if (tab.kind === 'compare') {
    return <EditorComparePane tab={tab} repoCwd={repoCwd} />
  }

  if (tab.kind !== 'text') {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {t('editor.binaryNotEditable', { path: tab.relativePath })}
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <GlowLoader className="h-10 w-10" />
        </div>
      }
    >
      <LazyEditorMonacoHost
        ref={editorRef}
        repoCwd={repoCwd}
        tabId={tab.id}
        relativePath={tab.relativePath}
        contentLoaded={tab.contentLoaded}
        loadGeneration={tab.loadGeneration}
        onChange={handleChange}
        onCursorChange={onCursorChange}
        onMount={handleEditorMount}
        className="h-full min-h-0"
      />
    </Suspense>
  )
}
