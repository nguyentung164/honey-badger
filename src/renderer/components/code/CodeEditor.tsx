'use client'

import { Editor, type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { resolveMonacoLanguageId } from '@/lib/monacoLanguage'
import { useGlobalAppMonacoThemeSync, onAppMonacoBeforeMount } from '@/hooks/useAppMonacoTheme'
import { resolveEditorMonacoFontStyle } from '@/pages/editor/lib/editorMonacoTheme'
import { useEditorMonacoSettings } from '@/pages/editor/hooks/useEditorSettings'
import { buildMonacoEditorOptions } from '@/pages/editor/lib/buildMonacoEditorOptions'

export type CodeEditorHandle = {
  getEditor: () => Monaco.editor.IStandaloneCodeEditor | null
  getValue: () => string
  focus: () => void
  revealLine: (line: number, column?: number) => void
  runAction: (actionId: string) => Promise<boolean>
  getCursorPosition: () => { line: number; column: number } | null
  saveViewState: () => Monaco.editor.ICodeEditorViewState | null
}

export type CodeEditorProps = {
  filePath: string
  modelUri?: string
  /** Controlled mode — prefer defaultValue + editorInstanceKey for tabbed editors. */
  value?: string
  /** Initial document text for uncontrolled mode. */
  defaultValue?: string
  /** Change to force a fresh Monaco instance (e.g. tab loadGeneration). */
  editorInstanceKey?: string
  /** Bumped when disk content reloads — applies setValue without remounting. */
  diskRevision?: number
  language: string
  onChange?: (value: string) => void
  readOnly?: boolean
  onMount?: (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => void
  onCursorChange?: (position: { line: number; column: number }) => void
  restoredViewStateJson?: string
  editorOptions?: Monaco.editor.IStandaloneEditorConstructionOptions
  className?: string
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  {
    filePath,
    modelUri,
    value,
    defaultValue = '',
    diskRevision = 0,
    language,
    onChange,
    readOnly = false,
    onMount,
    onCursorChange,
    restoredViewStateJson,
    editorOptions: editorOptionsOverride,
    className,
  },
  ref
) {
  const editorSettings = useEditorMonacoSettings()
  const editorTheme = useGlobalAppMonacoThemeSync({ includeDiff: true, includeEditorRules: true })

  const fontStyle = useMemo(() => resolveEditorMonacoFontStyle(editorSettings), [editorSettings])

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const viewStateRestoredRef = useRef(false)
  const onMountRef = useRef(onMount)
  const onCursorChangeRef = useRef(onCursorChange)
  onMountRef.current = onMount
  onCursorChangeRef.current = onCursorChange

  const resolvedLanguage = useMemo(() => resolveMonacoLanguageId(language, filePath), [language, filePath])

  const isControlled = value !== undefined
  const initialText = isControlled ? value : defaultValue

  const isHeavyFile = useMemo(
    () => initialText.length > 350_000 || (initialText.length > 0 && initialText.split('\n').length > 6000),
    [initialText.length]
  )

  const editorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = useMemo(
    () => ({
      ...buildMonacoEditorOptions(editorSettings, isHeavyFile, readOnly),
      ...editorOptionsOverride,
    }),
    [editorOptionsOverride, editorSettings, isHeavyFile, readOnly]
  )

  const applyViewState = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor) => {
      if (!restoredViewStateJson || viewStateRestoredRef.current) return
      try {
        const state = JSON.parse(restoredViewStateJson) as Monaco.editor.ICodeEditorViewState
        editor.restoreViewState(state)
        viewStateRestoredRef.current = true
      } catch {
        /* ignore corrupt state */
      }
    },
    [restoredViewStateJson]
  )

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      viewStateRestoredRef.current = false
      applyViewState(editor)
      editor.onDidChangeCursorPosition(e => {
        const pos = { line: e.position.lineNumber, column: e.position.column }
        onCursorChangeRef.current?.(pos)
      })
      onMountRef.current?.(editor, monaco)
    },
    [applyViewState]
  )

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !restoredViewStateJson) return
    viewStateRestoredRef.current = false
    applyViewState(editor)
  }, [modelUri, filePath, restoredViewStateJson, applyViewState])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.updateOptions(editorOptions)
    editor.getModel()?.updateOptions({
      tabSize: editorSettings.tabSize,
      insertSpaces: editorSettings.insertSpaces,
    })
  }, [editorOptions, editorSettings.insertSpaces, editorSettings.tabSize])

  const fontStyleKey = `${editorSettings.fontFamilyId}:${editorSettings.fontSize}:${editorSettings.fontWeight}:${editorSettings.enableLigatures}`

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    void import('monaco-editor').then(monaco => monaco.editor.remeasureFonts())
  }, [fontStyleKey])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || diskRevision <= 0) return
    const model = editor.getModel()
    if (!model) return
    const next = isControlled ? (value ?? '') : defaultValue
    if (model.getValue() !== next) {
      editor.pushUndoStop()
      model.setValue(next)
    }
  }, [defaultValue, diskRevision, isControlled, value])

  useImperativeHandle(
    ref,
    () => ({
      getEditor: () => editorRef.current,
      getValue: () => editorRef.current?.getValue() ?? (isControlled ? (value ?? '') : defaultValue),
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
    [defaultValue, isControlled, value]
  )

  return (
    <div className={cn('hb-monaco-editor-root h-full min-h-0 w-full', className)} style={fontStyle}>
      <Editor
        path={modelUri ?? filePath}
        {...(isControlled ? { value } : { defaultValue })}
        language={resolvedLanguage}
        theme={editorTheme}
        options={editorOptions}
        onChange={v => onChange?.(v ?? '')}
        beforeMount={onAppMonacoBeforeMount}
        onMount={handleMount}
        loading={null}
        keepCurrentModel
      />
    </div>
  )
})
