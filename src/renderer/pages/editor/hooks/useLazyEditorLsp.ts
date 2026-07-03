'use client'

import type * as Monaco from 'monaco-editor'
import { useCallback, useEffect, useRef } from 'react'
import { enableMonacoTypeScriptWorker } from '@/lib/monaco/configureMonacoWorkers'
import { getLspLanguageId, languageIdForLsp } from '@/lib/monacoLanguage'
import { disableMonacoTypeScriptValidation } from '@/pages/editor/lib/configureMonacoTypeScriptService'
import { registerEditorNavigation, setEditorNavigationRepo } from '@/pages/editor/lib/registerEditorNavigation'
import { editorCommandBridge } from '@/pages/editor/lib/editorCommandBridge'
import { editorLanguageService } from '@/pages/editor/lsp/EditorLanguageService'

const LSP_IDLE_MS = 1500
const MAX_LSP_OPEN_DOCUMENTS = 5

type TabLspMeta = {
  relativePath: string
  languageId: string
}

/**
 * VS Code-style lazy LSP: bind providers and start language servers only after
 * the user has been idle in an LSP-supported file for a few seconds.
 */
export function useLazyEditorLsp(repoCwd: string, tab: TabLspMeta | null) {
  const monacoRef = useRef<typeof Monaco | null>(null)
  const navigationDisposableRef = useRef<Monaco.IDisposable | null>(null)
  const activatedRef = useRef(false)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docVersionRef = useRef(1)
  const openDocPathsRef = useRef<string[]>([])
  const tabRef = useRef(tab)
  tabRef.current = tab

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current != null) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  const readEditorText = useCallback(() => {
    return editorCommandBridge.get()?.getValue() || ''
  }, [])

  const evictOverflowLspDocs = useCallback((keepPath: string | null) => {
    const order = openDocPathsRef.current
    while (order.length > MAX_LSP_OPEN_DOCUMENTS) {
      const evict = order.pop()
      if (!evict || evict === keepPath) continue
      editorLanguageService.closeDocument(evict)
    }
  }, [])

  const trackOpenLspDoc = useCallback(
    (relativePath: string) => {
      const order = openDocPathsRef.current.filter(p => p !== relativePath)
      order.unshift(relativePath)
      openDocPathsRef.current = order
      evictOverflowLspDocs(relativePath)
    },
    [evictOverflowLspDocs]
  )

  const openDocumentForPath = useCallback(
    (relativePath: string, languageId: string) => {
      if (!repoCwd || !languageIdForLsp(languageId)) return
      const monaco = monacoRef.current
      if (monaco) editorLanguageService.bind(repoCwd, monaco)
      editorLanguageService.openDocument(relativePath, getLspLanguageId(relativePath), readEditorText())
      trackOpenLspDoc(relativePath)
      docVersionRef.current = 1
      activatedRef.current = true
      enableMonacoTypeScriptWorker()
    },
    [repoCwd, readEditorText, trackOpenLspDoc]
  )

  const openCurrentDocument = useCallback(() => {
    const current = tabRef.current
    if (!current || !repoCwd) return
    openDocumentForPath(current.relativePath, current.languageId)
  }, [openDocumentForPath, repoCwd])

  const scheduleLazyActivation = useCallback(() => {
    const current = tabRef.current
    if (!current || !languageIdForLsp(current.languageId)) return
    clearIdleTimer()
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null
      openCurrentDocument()
    }, LSP_IDLE_MS)
  }, [clearIdleTimer, openCurrentDocument])

  const onEditorMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      monacoRef.current = monaco
      disableMonacoTypeScriptValidation(monaco)
      editorLanguageService.registerLspEditorActions(editor)
      navigationDisposableRef.current?.dispose()
      navigationDisposableRef.current = registerEditorNavigation(monaco, repoCwd, editor)
    },
    [repoCwd]
  )

  useEffect(() => {
    setEditorNavigationRepo(repoCwd)
  }, [repoCwd])

  const onLspModelChange = useCallback(
    (changes: Monaco.editor.IModelContentChange[]) => {
      const current = tabRef.current
      if (!current || !languageIdForLsp(current.languageId) || changes.length === 0) return

      if (!activatedRef.current) {
        scheduleLazyActivation()
        return
      }

      if (!openDocPathsRef.current.includes(current.relativePath)) {
        openDocumentForPath(current.relativePath, current.languageId)
      }

      docVersionRef.current += 1
      editorLanguageService.changeDocumentIncremental(
        current.relativePath,
        getLspLanguageId(current.relativePath),
        changes,
        docVersionRef.current
      )
    },
    [openDocumentForPath, scheduleLazyActivation]
  )

  useEffect(() => {
    clearIdleTimer()

    if (tab && languageIdForLsp(tab.languageId)) {
      scheduleLazyActivation()
    }

    if (tab && activatedRef.current && languageIdForLsp(tab.languageId)) {
      openCurrentDocument()
    }

    return () => {
      clearIdleTimer()
    }
  }, [tab?.relativePath, tab?.languageId, clearIdleTimer, openCurrentDocument, scheduleLazyActivation])

  useEffect(() => {
    return () => {
      clearIdleTimer()
      navigationDisposableRef.current?.dispose()
      navigationDisposableRef.current = null
      for (const path of openDocPathsRef.current) {
        editorLanguageService.closeDocument(path)
      }
      openDocPathsRef.current = []
    }
  }, [clearIdleTimer])

  return { onEditorMount, onLspContentChange: onLspModelChange, onLspModelChange }
}
