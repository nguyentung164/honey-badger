'use client'

import type * as Monaco from 'monaco-editor'
import { useCallback, useEffect, useRef } from 'react'
import { getLspLanguageId, languageIdForLsp } from '@/lib/monacoLanguage'
import { disableMonacoTypeScriptValidation } from '@/pages/editor/lib/configureMonacoTypeScriptService'
import { registerEditorNavigation, setEditorNavigationRepo } from '@/pages/editor/lib/registerEditorNavigation'
import { editorLanguageService } from '@/pages/editor/lsp/EditorLanguageService'

type TabLspMeta = {
  relativePath: string
  languageId: string
  contentLoaded: boolean
}

/**
 * VS Code pattern: LSP buffer sync happens in `attachModelToEditor` → `onTextModelReady`
 * → `openTextDocument`. This hook only wires Monaco providers, navigation, and edits.
 */
export function useLazyEditorLsp(repoCwd: string, tab: TabLspMeta | null) {
  const navigationDisposableRef = useRef<Monaco.IDisposable | null>(null)
  const tabRef = useRef(tab)
  tabRef.current = tab

  const onEditorMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      disableMonacoTypeScriptValidation(monaco)
      editorLanguageService.bind(repoCwd, monaco)
      editorLanguageService.registerLspEditorActions(editor)
      navigationDisposableRef.current?.dispose()
      navigationDisposableRef.current = registerEditorNavigation(monaco, repoCwd, editor)
    },
    [repoCwd]
  )

  useEffect(() => {
    setEditorNavigationRepo(repoCwd)
  }, [repoCwd])

  const onLspModelChange = useCallback((changes: Monaco.editor.IModelContentChange[]) => {
    const current = tabRef.current
    if (!current?.contentLoaded || changes.length === 0) return
    const lspLanguageId = getLspLanguageId(current.relativePath)
    if (!languageIdForLsp(lspLanguageId)) return

    editorLanguageService.changeDocumentIncremental(current.relativePath, lspLanguageId, changes)
  }, [])

  useEffect(() => {
    return () => {
      navigationDisposableRef.current?.dispose()
      navigationDisposableRef.current = null
    }
  }, [])

  return { onEditorMount, onLspContentChange: onLspModelChange, onLspModelChange }
}
