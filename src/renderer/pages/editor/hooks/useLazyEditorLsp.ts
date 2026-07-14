'use client'

import type * as Monaco from 'monaco-editor'
import { useCallback, useEffect, useRef } from 'react'
import { getLspLanguageId, languageIdForLsp } from '@/lib/monacoLanguage'
import { registerEditorNavigation, setEditorNavigationRepo } from '@/pages/editor/lib/registerEditorNavigation'
import { editorLanguageService } from '@/pages/editor/lsp/EditorLanguageService'

type TabLspMeta = {
  relativePath: string
  languageId: string
  contentLoaded: boolean
}

/**
 * VS Code pattern: LSP buffer sync happens in `attachModelToEditor` → `onTextModelReady`
 * → `openTextDocument`. This hook wires Monaco providers and LSP document sync.
 */
export function useLazyEditorLsp(repoCwd: string, tab: TabLspMeta | null, shellTabActive = true) {
  const tabRef = useRef(tab)
  tabRef.current = tab
  const shellTabActiveRef = useRef(shellTabActive)
  shellTabActiveRef.current = shellTabActive

  const onEditorMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      editorLanguageService.bind(repoCwd, monaco)
      editorLanguageService.registerLspEditorActions(editor)
      registerEditorNavigation(monaco, repoCwd)
    },
    [repoCwd]
  )

  useEffect(() => {
    setEditorNavigationRepo(repoCwd)
  }, [repoCwd])

  const onLspModelChange = useCallback((changes: Monaco.editor.IModelContentChange[]) => {
    if (!shellTabActiveRef.current) return
    const current = tabRef.current
    if (!current?.contentLoaded || changes.length === 0) return
    const lspLanguageId = getLspLanguageId(current.relativePath)
    if (!languageIdForLsp(lspLanguageId)) return

    editorLanguageService.changeDocumentIncremental(current.relativePath, lspLanguageId, changes)
  }, [])

  return { onEditorMount, onLspModelChange }
}
