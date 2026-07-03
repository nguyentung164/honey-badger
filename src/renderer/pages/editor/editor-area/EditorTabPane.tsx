'use client'

import type * as Monaco from 'monaco-editor'
import { lazy, Suspense, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import type { CodeEditorHandle } from '@/components/code/CodeEditor'
import { documentUriForPath } from '@/pages/editor/lsp/documentUri'
import { EditorComparePane } from '@/pages/editor/editor-area/EditorComparePane'
import { EditorEmptyState } from '@/pages/editor/editor-area/EditorEmptyState'
import { editorCommandBridge, type EditorCursorPosition } from '@/pages/editor/lib/editorCommandBridge'
import { useActiveEditorTab } from '@/pages/editor/hooks/useEditorTabSelectors'
import { useLazyEditorLsp } from '@/pages/editor/hooks/useLazyEditorLsp'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'

/** VS Code: one editor widget, swap ITextModel by URI — no remount per tab. */
const LazyCodeEditor = lazy(() => import('@/components/code/CodeEditor').then(m => ({ default: m.CodeEditor })))

type EditorTabPaneProps = {
  activeTabId: string | null
  repoCwd: string
  onSyncDirty: (tabId: string, content: string) => void
  onCursorChange?: (position: EditorCursorPosition | null) => void
}

export function EditorTabPane({ activeTabId, repoCwd, onSyncDirty, onCursorChange }: EditorTabPaneProps) {
  const { t } = useTranslation()
  const tab = useActiveEditorTab(activeTabId)
  const editorRef = useRef<CodeEditorHandle>(null)
  const saveTabViewState = useEditorWorkspace(s => s.saveTabViewState)
  const onSyncDirtyRef = useRef(onSyncDirty)
  onSyncDirtyRef.current = onSyncDirty
  const dirtyFlushRaf = useRef<number | null>(null)
  const pendingDirtyRef = useRef<{ tabId: string; value: string } | null>(null)

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

  useEffect(() => {
    if (!tab) return
    const tabId = tab.id
    return () => {
      const state = editorRef.current?.saveViewState()
      if (!state) return
      try {
        saveTabViewState(tabId, JSON.stringify(state))
      } catch {
        /* ignore */
      }
    }
  }, [tab?.id, saveTabViewState])

  const tabMetaRef = useRef({ id: '' })
  if (tab) tabMetaRef.current = { id: tab.id }

  const lspTab =
    tab && tab.kind === 'text' ? { relativePath: tab.relativePath, languageId: tab.languageId } : null
  const { onEditorMount, onLspContentChange } = useLazyEditorLsp(repoCwd, lspTab)

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
    onSyncDirtyRef.current(pending.tabId, pending.value)
  }, [])

  const handleChange = useCallback(
    (value: string) => {
      const tabId = tabMetaRef.current.id
      if (!tabId) return
      pendingDirtyRef.current = { tabId, value }
      if (dirtyFlushRaf.current == null) {
        dirtyFlushRaf.current = requestAnimationFrame(flushDirty)
      }
      onLspContentChange(value)
    },
    [flushDirty, onLspContentChange]
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
    return <EditorComparePane tab={tab} />
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
      <LazyCodeEditor
        ref={editorRef}
        filePath={tab.relativePath}
        modelUri={documentUriForPath(repoCwd, tab.relativePath)}
        defaultValue={tab.content}
        diskRevision={tab.loadGeneration}
        language={tab.languageId}
        restoredViewStateJson={tab.viewStateJson}
        onChange={handleChange}
        onCursorChange={onCursorChange}
        onMount={handleEditorMount}
        className="h-full min-h-0"
      />
    </Suspense>
  )
}
