'use client'

import type * as Monaco from 'monaco-editor'
import { useEffect, useRef } from 'react'
import { onAppMonacoBeforeMount, useGlobalAppMonacoThemeSync } from '@/hooks/useAppMonacoTheme'
import { isLargeFileByMetrics } from 'shared/fileUri'
import { compareSideModelPath } from '@/pages/editor/lib/editorCompareModels'
import { bindEditorModelRegistry, getExistingModel } from '@/pages/editor/lib/editorModelRegistry'
import { useEditorSettings } from '@/pages/editor/hooks/useEditorSettings'
import { buildMonacoEditorOptions } from '@/pages/editor/lib/buildMonacoEditorOptions'
import type { EditorTab } from '@/pages/editor/lib/editorWorkspaceTypes'

type EditorComparePaneProps = {
  tab: EditorTab
  repoCwd: string
}

export function EditorComparePane({ tab, repoCwd }: EditorComparePaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const diffRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const editorSettings = useEditorSettings()
  const monacoTheme = useGlobalAppMonacoThemeSync({ includeDiff: true, includeEditorRules: true })

  useEffect(() => {
    let disposed = false
    const container = containerRef.current
    if (!container || !tab.contentLoaded) return

    void import('monaco-editor').then(monaco => {
      if (disposed || !containerRef.current) return
      onAppMonacoBeforeMount(monaco)
      bindEditorModelRegistry(monaco)

      const leftPath = compareSideModelPath(tab.id, 'left')
      const rightPath = compareSideModelPath(tab.id, 'right')
      const original = getExistingModel(monaco, repoCwd, leftPath)
      const modified = getExistingModel(monaco, repoCwd, rightPath)
      if (!original || !modified) return

      const isHeavy = isLargeFileByMetrics(
        original.getValueLength() + modified.getValueLength(),
        Math.max(original.getLineCount(), modified.getLineCount())
      )

      const options = {
        ...buildMonacoEditorOptions(editorSettings, isHeavy, true),
        renderSideBySide: !isHeavy,
        originalEditable: false,
        automaticLayout: false,
      }

      const diffEditor = monaco.editor.createDiffEditor(container, {
        ...options,
        theme: monacoTheme,
      })
      diffRef.current = diffEditor
      diffEditor.setModel({ original, modified })

      const ro = new ResizeObserver(() => diffEditor.layout())
      resizeObserverRef.current = ro
      ro.observe(container)
      diffEditor.layout()
    })

    return () => {
      disposed = true
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      diffRef.current?.dispose()
      diffRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount when compare models ready
  }, [tab.id, tab.contentLoaded, tab.loadGeneration, repoCwd])

  useEffect(() => {
    if (!diffRef.current) return
    void import('monaco-editor').then(monaco => monaco.editor.setTheme(monacoTheme))
  }, [monacoTheme])

  if (!tab.contentLoaded) {
    return null
  }

  return <div ref={containerRef} className="hb-monaco-editor-root h-full min-h-0 w-full" />
}
