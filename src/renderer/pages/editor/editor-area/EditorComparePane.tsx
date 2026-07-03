'use client'

import { DiffEditor } from '@monaco-editor/react'
import { useMemo } from 'react'
import { onAppMonacoBeforeMount, useGlobalAppMonacoThemeSync } from '@/hooks/useAppMonacoTheme'
import { useEditorSettings } from '@/pages/editor/hooks/useEditorSettings'
import type { EditorTab } from '@/pages/editor/lib/editorWorkspaceTypes'

type EditorComparePaneProps = {
  tab: EditorTab
}

export function EditorComparePane({ tab }: EditorComparePaneProps) {
  const fontSize = useEditorSettings(s => s.fontSize)
  const tabSize = useEditorSettings(s => s.tabSize)
  const insertSpaces = useEditorSettings(s => s.insertSpaces)
  const monacoTheme = useGlobalAppMonacoThemeSync({ includeDiff: true, includeEditorRules: true })

  const options = useMemo(
    () => ({
      readOnly: true,
      renderSideBySide: true,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      fontSize,
      tabSize,
      insertSpaces,
      originalEditable: false,
    }),
    [fontSize, insertSpaces, tabSize]
  )

  return (
    <DiffEditor
      height="100%"
      language={tab.languageId}
      original={tab.content}
      modified={tab.compareContent ?? ''}
      theme={monacoTheme}
      beforeMount={onAppMonacoBeforeMount}
      options={options}
    />
  )
}
