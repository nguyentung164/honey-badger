'use client'

import { useEffect } from 'react'
import { getLspLanguageId, languageIdForLsp } from '@/lib/monacoLanguage'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'
import { editorLanguageService } from '@/pages/editor/lsp/EditorLanguageService'

/**
 * VS Code `lazilyActivateClient`: start tsserver when a TS/JS tab is opened,
 * not when the workspace/repo is opened with no TS file in memory.
 */
export function useEditorLspPrepare(repoCwd: string, shellTabActive = true) {
  const activeTabId = useEditorWorkspace(s => s.activeTabId)
  const activeRelativePath = useEditorWorkspace(
    s => s.tabs.find(t => t.id === s.activeTabId && t.kind === 'text')?.relativePath ?? null
  )

  useEffect(() => {
    if (!shellTabActive || !repoCwd || !activeRelativePath) return
    const lspLanguageId = getLspLanguageId(activeRelativePath)
    if (!languageIdForLsp(lspLanguageId)) return
    editorLanguageService.prepareServer(repoCwd, activeRelativePath)
  }, [shellTabActive, repoCwd, activeTabId, activeRelativePath])
}
