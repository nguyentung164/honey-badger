'use client'

import type * as Monaco from 'monaco-editor'
import { lazy, Suspense, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import type { GitFileStatusCode } from '@/components/git/GitFileStatusBadge'
import type { CodeEditorHandle } from '@/components/code/CodeEditor'
import { EditorComparePane } from '@/pages/editor/editor-area/EditorComparePane'
import { EditorEmptyState } from '@/pages/editor/editor-area/EditorEmptyState'
import { EditorMonacoHost } from '@/pages/editor/editor-area/EditorMonacoHost'
import { languageIdForLsp } from '@/lib/monacoLanguage'
import { editorCommandBridge, type EditorCursorPosition } from '@/pages/editor/lib/editorCommandBridge'
import { registerEditorGitScm } from '@/pages/editor/lib/registerEditorGitScm'
import { registerEditorKeybindings } from '@/pages/editor/lib/registerEditorKeybindings'
import { useEditorMonacoSettings } from '@/pages/editor/hooks/useEditorSettings'
import { syncOpenTabKeys } from '@/pages/editor/lib/editorModelRegistry'
import { useActiveEditorTab } from '@/pages/editor/hooks/useEditorTabSelectors'
import { useLazyEditorLsp } from '@/pages/editor/hooks/useLazyEditorLsp'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'
import type { EditorTabKind } from '@/pages/editor/lib/editorWorkspaceTypes'
import { editorLanguageService, type FormatDocumentResult, type OrganizeImportsResult } from '@/pages/editor/lsp/EditorLanguageService'

const LazyEditorMonacoHost = lazy(() =>
  Promise.resolve({ default: EditorMonacoHost })
)

type EditorTabPaneProps = {
  activeTabId: string | null
  repoCwd: string
  getGitStatus?: (relativePath: string) => GitFileStatusCode | null
  onSyncDirty: (tabId: string, alternativeVersionId: number) => void
  onCursorChange?: (position: EditorCursorPosition | null) => void
  onOrganizeImportsResult?: (result: OrganizeImportsResult) => void
  onFormatDocumentResult?: (result: FormatDocumentResult) => void
}

export function EditorTabPane({ activeTabId, repoCwd, getGitStatus, onSyncDirty, onCursorChange, onOrganizeImportsResult, onFormatDocumentResult }: EditorTabPaneProps) {
  const { t } = useTranslation()
  const tab = useActiveEditorTab(activeTabId)
  const editorRef = useRef<CodeEditorHandle>(null)
  const gitScmDisposableRef = useRef<Monaco.IDisposable | null>(null)
  const keybindingsDisposableRef = useRef<Monaco.IDisposable | null>(null)
  const onOrganizeImportsResultRef = useRef(onOrganizeImportsResult)
  onOrganizeImportsResultRef.current = onOrganizeImportsResult
  const onFormatDocumentResultRef = useRef(onFormatDocumentResult)
  onFormatDocumentResultRef.current = onFormatDocumentResult
  const editorSettings = useEditorMonacoSettings()
  const editorSettingsRef = useRef(editorSettings)
  editorSettingsRef.current = editorSettings
  const tabStructureKey = useEditorWorkspace(s =>
    s.tabs
      .filter(t => t.kind === 'text')
      .map(t => t.relativePath)
      .join('\0')
  )
  const consumeTabReveal = useEditorWorkspace(s => s.consumeTabReveal)
  const onSyncDirtyRef = useRef(onSyncDirty)
  onSyncDirtyRef.current = onSyncDirty
  const dirtyFlushRaf = useRef<number | null>(null)
  const pendingDirtyRef = useRef<{ tabId: string; alternativeVersionId: number } | null>(null)

  useEffect(() => {
    if (!repoCwd) return
    const { tabs } = useEditorWorkspace.getState()
    const openTextPaths = tabs.filter(t => t.kind === 'text').map(t => t.relativePath)
    syncOpenTabKeys(repoCwd, openTextPaths)
    editorLanguageService.syncOpenTabs(repoCwd, openTextPaths)
  }, [repoCwd, tabStructureKey])

  useEffect(() => {
    const reveal = tab?.reveal
    const tabId = tab?.id
    if (!reveal || !tabId || !tab.contentLoaded) return

    let cancelled = false
    let attempts = 0
    const maxAttempts = 60

    const attemptReveal = () => {
      if (cancelled || attempts >= maxAttempts) return
      attempts += 1

      const handle = editorRef.current
      if (!handle?.getEditor()) {
        requestAnimationFrame(attemptReveal)
        return
      }

      handle.revealLine(reveal.line, reveal.column)
      consumeTabReveal(tabId)
    }

    attemptReveal()
    return () => {
      cancelled = true
    }
  }, [tab?.reveal, tab?.id, tab?.contentLoaded, consumeTabReveal])

  const registerBridge = useCallback(() => {
    const handle = editorRef.current
    if (!handle) return
    const bridge = {
      focus: () => handle.focus(),
      getValue: () => handle.getValue(),
      getCursorPosition: () => handle.getCursorPosition(),
      runAction: (actionId: string) => handle.runAction(actionId),
      revealLine: (line: number, column?: number) => handle.revealLine(line, column),
      getMonacoEditor: () => handle.getEditor() ?? null,
    }
    editorCommandBridge.register(bridge)
    return () => editorCommandBridge.unregister(bridge)
  }, [])

  useEffect(() => {
    if (!tab || tab.kind !== 'text' || !tab.contentLoaded) return
    return registerBridge()
  }, [tab?.id, tab?.kind, tab?.contentLoaded, registerBridge])

  const tabMetaRef = useRef<{ id: string; relativePath: string; languageId: string; kind: EditorTabKind }>({
    id: '',
    relativePath: '',
    languageId: 'plaintext',
    kind: 'text',
  })
  if (tab) tabMetaRef.current = { id: tab.id, relativePath: tab.relativePath, languageId: tab.languageId, kind: tab.kind }
  const getGitStatusRef = useRef(getGitStatus)
  getGitStatusRef.current = getGitStatus

  const lspTab =
    tab && tab.kind === 'text'
      ? { relativePath: tab.relativePath, languageId: tab.languageId, contentLoaded: tab.contentLoaded }
      : null
  const { onEditorMount, onLspContentChange, onLspModelChange } = useLazyEditorLsp(repoCwd, lspTab)

  const handleEditorMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      registerBridge()
      onEditorMount(editor, monaco)
      gitScmDisposableRef.current?.dispose()
      gitScmDisposableRef.current = registerEditorGitScm(editor, monaco, () => {
        const meta = tabMetaRef.current
        return {
          repoCwd,
          relativePath: meta.relativePath,
          gitStatus: getGitStatusRef.current?.(meta.relativePath) ?? null,
          languageId: meta.languageId,
        }
      })
      keybindingsDisposableRef.current?.dispose()
      keybindingsDisposableRef.current = registerEditorKeybindings(editor, monaco, {
        onFormatDocument: () => {
          const meta = tabMetaRef.current
          if (!languageIdForLsp(meta.languageId)) return
          const { tabSize, insertSpaces } = editorSettingsRef.current
          void editorLanguageService
            .formatDocument(meta.relativePath, meta.languageId, { tabSize, insertSpaces })
            .then(result => {
              onFormatDocumentResultRef.current?.(result)
            })
        },
        onOrganizeImports: () => {
          const meta = tabMetaRef.current
          if (!languageIdForLsp(meta.languageId)) return
          void editorLanguageService.organizeImports(meta.relativePath, meta.languageId).then(result => {
            onOrganizeImportsResultRef.current?.(result)
          })
        },
      })
    },
    [onEditorMount, registerBridge, repoCwd]
  )

  useEffect(() => {
    return () => {
      gitScmDisposableRef.current?.dispose()
      gitScmDisposableRef.current = null
      keybindingsDisposableRef.current?.dispose()
      keybindingsDisposableRef.current = null
    }
  }, [])

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

  const showLoader = tab.isLoading || !tab.contentLoaded

  return (
    <div className="relative h-full min-h-0">
      {showLoader ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
          <GlowLoader className="h-10 w-10" />
        </div>
      ) : null}
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
          revealAt={tab.reveal}
          onChange={handleChange}
          onCursorChange={onCursorChange}
          onMount={handleEditorMount}
          className="h-full min-h-0"
        />
      </Suspense>
    </div>
  )
}
