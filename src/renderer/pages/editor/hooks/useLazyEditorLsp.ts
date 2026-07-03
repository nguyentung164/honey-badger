import type * as Monaco from 'monaco-editor'
import { useCallback, useEffect, useRef } from 'react'
import { getLspLanguageId, languageIdForLsp } from '@/lib/monacoLanguage'
import { disableMonacoTypeScriptValidation } from '@/pages/editor/lib/configureMonacoTypeScriptService'
import { registerEditorNavigation, setEditorNavigationRepo } from '@/pages/editor/lib/registerEditorNavigation'
import { editorCommandBridge } from '@/pages/editor/lib/editorCommandBridge'
import { editorLanguageService } from '@/pages/editor/lsp/EditorLanguageService'

const LSP_IDLE_MS = 1500

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
  const openDocRef = useRef<TabLspMeta | null>(null)
  const lastContentRef = useRef('')
  const tabRef = useRef(tab)
  tabRef.current = tab

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current != null) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  const readEditorText = useCallback(() => {
    return lastContentRef.current || editorCommandBridge.get()?.getValue() || ''
  }, [])

  const openCurrentDocument = useCallback(() => {
    const current = tabRef.current
    const monaco = monacoRef.current
    if (!current || !repoCwd || !monaco) return
    if (!languageIdForLsp(current.languageId)) return

    editorLanguageService.bind(repoCwd, monaco)
    editorLanguageService.openDocument(
      current.relativePath,
      getLspLanguageId(current.relativePath),
      readEditorText()
    )
    docVersionRef.current = 1
    openDocRef.current = current
    activatedRef.current = true
  }, [repoCwd, readEditorText])

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

  const onLspContentChange = useCallback(
    (value: string) => {
      const current = tabRef.current
      if (!current || !languageIdForLsp(current.languageId)) return

      lastContentRef.current = value

      if (!activatedRef.current) {
        scheduleLazyActivation()
        return
      }

      if (openDocRef.current?.relativePath !== current.relativePath) {
        openCurrentDocument()
        return
      }

      docVersionRef.current += 1
      editorLanguageService.changeDocument(
        current.relativePath,
        getLspLanguageId(current.relativePath),
        value,
        docVersionRef.current
      )
    },
    [openCurrentDocument, scheduleLazyActivation]
  )

  useEffect(() => {
    const previous = openDocRef.current
    if (previous && tab && previous.relativePath !== tab.relativePath) {
      editorLanguageService.closeDocument(previous.relativePath)
      openDocRef.current = null
      docVersionRef.current = 1
    }
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
      if (openDocRef.current) {
        editorLanguageService.closeDocument(openDocRef.current.relativePath)
        openDocRef.current = null
      }
    }
  }, [clearIdleTimer])

  return { onEditorMount, onLspContentChange }
}
