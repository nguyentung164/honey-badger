'use client'

import type * as Monaco from 'monaco-editor'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { isLargeFileByMetrics } from 'shared/fileUri'
import { useGlobalAppMonacoThemeSync, onAppMonacoBeforeMount } from '@/hooks/useAppMonacoTheme'
import { resolveEditorMonacoFontStyle } from '@/pages/editor/lib/editorMonacoTheme'
import { useEditorMonacoSettings } from '@/pages/editor/hooks/useEditorSettings'
import { buildMonacoEditorOptions } from '@/pages/editor/lib/buildMonacoEditorOptions'
import {
  applyEditorMonacoSettings,
  editorSettingsFingerprint,
  refreshEditorMonacoAfterSettings,
} from '@/pages/editor/lib/applyEditorMonacoSettings'
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
  revealAt?: { line: number; column: number }
  onChange?: (alternativeVersionId: number, changes: Monaco.editor.IModelContentChange[]) => void
  onCursorChange?: (position: { line: number; column: number }) => void
  onMount?: (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => void
  className?: string
}

/** VS Code: one ICodeEditor widget; swap ITextModel by URI — no React remount per tab. */
export const EditorMonacoHost = forwardRef<CodeEditorHandle, EditorMonacoHostProps>(function EditorMonacoHost(
  { repoCwd, tabId, relativePath, contentLoaded, loadGeneration, revealAt, onChange, onCursorChange, onMount, className },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const prevTabIdRef = useRef<string | null>(null)
  const onChangeRef = useRef(onChange)
  const onCursorChangeRef = useRef(onCursorChange)
  const onMountRef = useRef(onMount)
  const revealAtRef = useRef(revealAt)
  onChangeRef.current = onChange
  onCursorChangeRef.current = onCursorChange
  onMountRef.current = onMount
  revealAtRef.current = revealAt

  const editorSettings = useEditorMonacoSettings()
  const settingsKey = useMemo(() => editorSettingsFingerprint(editorSettings), [editorSettings])
  const editorTheme = useGlobalAppMonacoThemeSync({ includeDiff: true, includeEditorRules: true })
  const fontStyle = useMemo(() => resolveEditorMonacoFontStyle(editorSettings), [editorSettings])

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

      let editor: Monaco.editor.IStandaloneCodeEditor
      try {
        editor = monaco.editor.create(container, {
          ...buildMonacoEditorOptions(editorSettings, isHeavy, false),
          theme: editorTheme,
          model,
        })
      } catch {
        return
      }

      if (disposed || !containerRef.current) {
        editor.dispose()
        return
      }

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

      if (disposed || !containerRef.current) return

      if (tabId && relativePath && contentLoaded) {
        prevTabIdRef.current = tabId
        attachModelToEditor(editor, monaco, repoCwd, relativePath, tabId, revealAtRef.current)
      }

      refreshEditorMonacoAfterSettings(editor)
    })

    return () => {
      disposed = true
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current)
      monacoRef.current = null
      const ed = editorRef.current
      if (ed) {
        const tid = prevTabIdRef.current
        if (tid) {
          try {
            saveViewStateForTab(tid, ed.saveViewState())
          } catch {
            /* editor disposing */
          }
        }
        try {
          ed.dispose()
        } catch {
          /* already disposed */
        }
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
    const editor = editorRef.current
    if (!editor) return
    applyEditorMonacoSettings(editor, editorSettings, false)
    refreshEditorMonacoAfterSettings(editor)
  }, [editorSettings, settingsKey])

  useEffect(() => {
    const monaco = monacoRef.current
    const editor = editorRef.current
    if (!monaco || !editor || !tabId || !relativePath || !contentLoaded) return

    const prevTabId = prevTabIdRef.current
    const tabChanged = prevTabId !== tabId
    if (prevTabId && tabChanged) {
      saveViewStateForTab(prevTabId, editor.saveViewState())
    }
    prevTabIdRef.current = tabId

    if (revealAt || tabChanged) {
      applyEditorMonacoSettings(editor, editorSettings, false)
      attachModelToEditor(editor, monaco, repoCwd, relativePath, tabId, revealAt)
      scheduleEditorLayout()
      refreshEditorMonacoAfterSettings(editor)
    }
  }, [tabId, relativePath, contentLoaded, revealAt, repoCwd, editorSettings, settingsKey, scheduleEditorLayout])

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
