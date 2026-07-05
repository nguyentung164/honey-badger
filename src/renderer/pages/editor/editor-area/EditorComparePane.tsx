'use client'

import type * as Monaco from 'monaco-editor'
import { useEffect, useMemo, useRef } from 'react'
import { onAppMonacoBeforeMount, useGlobalAppMonacoThemeSync } from '@/hooks/useAppMonacoTheme'
import { isLargeFileByMetrics } from 'shared/fileUri'
import { compareSideModelPath } from '@/pages/editor/lib/editorCompareModels'
import { bindEditorModelRegistry, getExistingModel } from '@/pages/editor/lib/editorModelRegistry'
import { useEditorMonacoSettings } from '@/pages/editor/hooks/useEditorSettings'
import { buildMonacoEditorOptions } from '@/pages/editor/lib/buildMonacoEditorOptions'
import {
  applyEditorMonacoSettings,
  editorSettingsFingerprint,
  refreshEditorMonacoAfterSettings,
} from '@/pages/editor/lib/applyEditorMonacoSettings'
import { resolveEditorMonacoFontStyle } from '@/pages/editor/lib/editorMonacoTheme'
import type { EditorTab } from '@/pages/editor/lib/editorWorkspaceTypes'

type EditorComparePaneProps = {
  tab: EditorTab
  repoCwd: string
}

export function EditorComparePane({ tab, repoCwd }: EditorComparePaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const diffRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const editorSettings = useEditorMonacoSettings()
  const settingsKey = useMemo(() => editorSettingsFingerprint(editorSettings), [editorSettings])
  const fontStyle = useMemo(() => resolveEditorMonacoFontStyle(editorSettings), [editorSettings])
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

      applyEditorMonacoSettings(diffEditor.getOriginalEditor(), editorSettings, true, isHeavy)
      applyEditorMonacoSettings(diffEditor.getModifiedEditor(), editorSettings, true, isHeavy)

      const ro = new ResizeObserver(() => diffEditor.layout())
      resizeObserverRef.current = ro
      ro.observe(container)
      diffEditor.layout()
      refreshEditorMonacoAfterSettings(diffEditor.getOriginalEditor())
      refreshEditorMonacoAfterSettings(diffEditor.getModifiedEditor())
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

  useEffect(() => {
    const diffEditor = diffRef.current
    if (!diffEditor) return

    const original = diffEditor.getOriginalEditor()
    const modified = diffEditor.getModifiedEditor()
    const originalModel = original.getModel()
    const modifiedModel = modified.getModel()
    const isHeavy =
      Boolean(originalModel && modifiedModel) &&
      isLargeFileByMetrics(
        originalModel!.getValueLength() + modifiedModel!.getValueLength(),
        Math.max(originalModel!.getLineCount(), modifiedModel!.getLineCount())
      )

    diffEditor.updateOptions({
      ...buildMonacoEditorOptions(editorSettings, isHeavy, true),
      renderSideBySide: !isHeavy,
      originalEditable: false,
      automaticLayout: false,
    })
    applyEditorMonacoSettings(original, editorSettings, true, isHeavy)
    applyEditorMonacoSettings(modified, editorSettings, true, isHeavy)
    diffEditor.layout()
    refreshEditorMonacoAfterSettings(original)
    refreshEditorMonacoAfterSettings(modified)
  }, [editorSettings, settingsKey])

  if (!tab.contentLoaded) {
    return null
  }

  return <div ref={containerRef} className="hb-monaco-editor-root h-full min-h-0 w-full" style={fontStyle} />
}
