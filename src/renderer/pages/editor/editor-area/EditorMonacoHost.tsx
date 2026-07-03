'use client'

import type * as Monaco from 'monaco-editor'
import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { isLargeFileByMetrics } from 'shared/fileUri'
import { useGlobalAppMonacoThemeSync, onAppMonacoBeforeMount } from '@/hooks/useAppMonacoTheme'
import { resolveEditorMonacoFontStyle } from '@/pages/editor/lib/editorMonacoTheme'
import { useEditorMonacoSettings } from '@/pages/editor/hooks/useEditorSettings'
import { buildMonacoEditorOptions } from '@/pages/editor/lib/buildMonacoEditorOptions'
import {
  attachModelToEditor,
  bindEditorModelRegistry,
  getExistingModel,
  saveViewStateForTab,
} from '@/pages/editor/lib/editorModelRegistry'
import type { CodeEditorHandle } from '@/components/code/CodeEditor'

export type EditorMonacoHostProps = {
  repoCwd: string
  tabId: string | null
  relativePath: string | null
  contentLoaded: boolean
  loadGeneration: number
  onChange?: (alternativeVersionId: number, changes: Monaco.editor.IModelContentChange[]) => void
  onCursorChange?: (position: { line: number; column: number }) => void
  onMount?: (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => void
  className?: string
}

/** VS Code: one ICodeEditor widget; swap ITextModel by URI — no React remount per tab. */
export const EditorMonacoHost = forwardRef<CodeEditorHandle, EditorMonacoHostProps>(function EditorMonacoHost(
  { repoCwd, tabId, relativePath, contentLoaded, loadGeneration, onChange, onCursorChange, onMount, className },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const prevTabIdRef = useRef<string | null>(null)
  const onChangeRef = useRef(onChange)
  const onCursorChangeRef = useRef(onCursorChange)
  const onMountRef = useRef(onMount)
  onChangeRef.current = onChange
  onCursorChangeRef.current = onCursorChange
  onMountRef.current = onMount

  const editorSettings = useEditorMonacoSettings()
  const editorTheme = useGlobalAppMonacoThemeSync({ includeDiff: true, includeEditorRules: true })
  const fontStyle = resolveEditorMonacoFontStyle(editorSettings)
  const fontStyleKey = `${editorSettings.fontFamilyId}:${editorSettings.fontSize}:${editorSettings.fontWeight}:${editorSettings.enableLigatures}`

  const editorOptionsRef = useRef<Monaco.editor.IStandaloneEditorConstructionOptions | null>(null)
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleEditorLayout = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current)
    layoutTimerRef.current = setTimeout(() => {
      layoutTimerRef.current = null
      editor.layout()
    }, 100)
  }, [])

  useEffect(() => {
    let disposed = false
    const container = containerRef.current
    if (!container) return

    void import('monaco-editor').then(monaco => {
      if (disposed || !containerRef.current) return
      onAppMonacoBeforeMount(monaco)
      bindEditorModelRegistry(monaco)
      monacoRef.current = monaco

      const model = relativePath && contentLoaded ? getExistingModel(monaco, repoCwd, relativePath) : null
      const isHeavy =
        Boolean(model) &&
        isLargeFileByMetrics(model!.getValueLength(), model!.getLineCount())

      const options = buildMonacoEditorOptions(editorSettings, isHeavy, false)
      editorOptionsRef.current = options

      const editor = monaco.editor.create(container, {
        ...options,
        theme: editorTheme,
        model,
      })
      editorRef.current = editor

      editor.onDidChangeModelContent(e => {
        const activeModel = editor.getModel()
        if (!activeModel) return
        onChangeRef.current?.(activeModel.getAlternativeVersionId(), e.changes)
      })
      editor.onDidChangeCursorPosition(e => {
        onCursorChangeRef.current?.({ line: e.position.lineNumber, column: e.position.column })
      })

      onMountRef.current?.(editor, monaco)
    })

    return () => {
      disposed = true
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current)
      const ed = editorRef.current
      if (ed) {
        const tid = prevTabIdRef.current
        if (tid) saveViewStateForTab(tid, ed.saveViewState())
        ed.dispose()
        editorRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, [])

  useEffect(() => {
    const monaco = monacoRef.current
    const editor = editorRef.current
    if (!monaco || !editor) return
    monaco.editor.setTheme(editorTheme)
  }, [editorTheme])

  useEffect(() => {
    const monaco = monacoRef.current
    const editor = editorRef.current
    if (!monaco || !editor) return

    const model = editor.getModel()
    const isHeavy =
      Boolean(model) &&
      isLargeFileByMetrics(model!.getValueLength(), model!.getLineCount())
    const options = buildMonacoEditorOptions(editorSettings, isHeavy, false)
    editorOptionsRef.current = options
    editor.updateOptions(options)
    editor.getModel()?.updateOptions({
      tabSize: editorSettings.tabSize,
      insertSpaces: editorSettings.insertSpaces,
    })
  }, [editorSettings])

  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    void import('monaco-editor').then(m => {
      if (monacoRef.current === monaco) m.editor.remeasureFonts()
    })
  }, [fontStyleKey])

  useEffect(() => {
    const monaco = monacoRef.current
    const editor = editorRef.current
    if (!monaco || !editor || !tabId || !relativePath || !contentLoaded) return

    const prevTabId = prevTabIdRef.current
    if (prevTabId && prevTabId !== tabId) {
      saveViewStateForTab(prevTabId, editor.saveViewState())
    }
    prevTabIdRef.current = tabId

    attachModelToEditor(editor, monaco, repoCwd, relativePath, tabId)
    scheduleEditorLayout()
  }, [tabId, relativePath, contentLoaded, loadGeneration, repoCwd, scheduleEditorLayout])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => scheduleEditorLayout())
    ro.observe(container)
    return () => ro.disconnect()
  }, [scheduleEditorLayout])

  useImperativeHandle(
    ref,
    () => ({
      getEditor: () => editorRef.current,
      getValue: () => editorRef.current?.getValue() ?? '',
      focus: () => editorRef.current?.focus(),
      revealLine: (line: number, column = 1) => {
        const ed = editorRef.current
        if (!ed) return
        ed.revealLineInCenter(line)
        ed.setPosition({ lineNumber: line, column })
        ed.focus()
      },
      runAction: async (actionId: string) => {
        const ed = editorRef.current
        if (!ed) return false
        const action = ed.getAction(actionId)
        if (action) {
          await action.run()
          return true
        }
        return ed.trigger('code-editor', actionId, null) != null
      },
      getCursorPosition: () => {
        const pos = editorRef.current?.getPosition()
        return pos ? { line: pos.lineNumber, column: pos.column } : null
      },
      saveViewState: () => editorRef.current?.saveViewState() ?? null,
    }),
    []
  )

  return (
    <div
      ref={containerRef}
      className={cn('hb-monaco-editor-root h-full min-h-0 w-full', className)}
      style={fontStyle}
    />
  )
})
