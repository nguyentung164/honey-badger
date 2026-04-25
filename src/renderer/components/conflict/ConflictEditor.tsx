'use client'

import { Editor } from '@monaco-editor/react'
import { ChevronDown, ChevronUp, Info, Loader2, Save, X } from 'lucide-react'
import type * as Monaco from 'monaco-editor'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import toast from '@/components/ui-elements/Toast'
import {
  extractGitConflictHunks,
  hasConflictMarkers,
  lineNumberAtOffset,
  parseConflictMarkers,
  resolveSingleConflictHunk,
} from '@/lib/conflictMarkers'
import { useAppearanceStore } from '@/stores/useAppearanceStore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const CONFLICT_APPLY_CMD = 'honey-badger.conflict.applyHunk'

/** Monaco đã virtualize viewport; chủ yếu giảm full-file parse + setState mỗi phím. */
const CONFLICT_VISUAL_DEBOUNCE_MS = 120

export type ConflictEditorPrimaryAction = 'save' | 'markResolved'

interface ConflictEditorProps {
  filePath: string
  initialContent: string
  language?: string
  onSave: (content: string) => Promise<void>
  onCancel: () => void
  primaryAction?: ConflictEditorPrimaryAction
  disablePrimaryWhenConflicted?: boolean
  enableConflictCodeLens?: boolean
}

function conflictStartLines(content: string): number[] {
  const n = content.replace(/\r\n/g, '\n')
  return extractGitConflictHunks(n).map(h => lineNumberAtOffset(n, h.start))
}

export function ConflictEditor({
  filePath,
  initialContent,
  language = 'plaintext',
  onSave,
  onCancel,
  primaryAction = 'save',
  disablePrimaryWhenConflicted = false,
  enableConflictCodeLens = true,
}: ConflictEditorProps) {
  const { t } = useTranslation()
  const { themeMode } = useAppearanceStore()
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const decorationsRef = useRef<string[]>([])
  const mountDisposablesRef = useRef<Monaco.IDisposable[]>([])
  const conflictVisualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showUnresolvedConfirm, setShowUnresolvedConfirm] = useState(false)
  const [conflictCount, setConflictCount] = useState(() => extractGitConflictHunks(initialContent.replace(/\r\n/g, '\n')).length)
  const [hasMarkers, setHasMarkers] = useState(() => hasConflictMarkers(initialContent))

  useEffect(() => {
    return () => {
      if (conflictVisualTimerRef.current) {
        clearTimeout(conflictVisualTimerRef.current)
        conflictVisualTimerRef.current = null
      }
      mountDisposablesRef.current.forEach(d => d.dispose())
      mountDisposablesRef.current = []
    }
  }, [])

  const clearConflictVisualDebounce = useCallback(() => {
    if (conflictVisualTimerRef.current) {
      clearTimeout(conflictVisualTimerRef.current)
      conflictVisualTimerRef.current = null
    }
  }, [])

  /** Một lần quét file: decorate + đếm conflict (tránh gọi parse riêng lẻ mỗi lần). */
  const flushConflictVisuals = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
    const model = editor.getModel()
    if (!model) return

    const value = model.getValue()
    const norm = value.replace(/\r\n/g, '\n')
    const markers = hasConflictMarkers(value)

    if (!norm.includes('<<<<<<<')) {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [])
      setConflictCount(0)
      setHasMarkers(markers)
      return
    }

    const blocks = parseConflictMarkers(value)
    const newDecorations: Monaco.editor.IModelDeltaDecoration[] = blocks.map(block => {
      const className =
        block.type === 'separator' ? 'conflict-marker-separator' : block.type === 'ours' ? 'conflict-marker-ours' : 'conflict-marker-theirs'
      return {
        range: new monaco.Range(block.startLine, 1, block.endLine, 1),
        options: {
          isWholeLine: true,
          className,
          marginClassName: className,
        },
      }
    })
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations)

    setConflictCount(extractGitConflictHunks(norm).length)
    setHasMarkers(markers)
  }, [])

  const scheduleConflictVisuals = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      if (conflictVisualTimerRef.current) clearTimeout(conflictVisualTimerRef.current)
      conflictVisualTimerRef.current = setTimeout(() => {
        conflictVisualTimerRef.current = null
        flushConflictVisuals(editor, monaco)
      }, CONFLICT_VISUAL_DEBOUNCE_MS)
    },
    [flushConflictVisuals],
  )

  const goNeighborConflict = useCallback((direction: -1 | 1) => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return
    const model = editor.getModel()
    if (!model) return
    const lines = conflictStartLines(model.getValue())
    if (lines.length === 0) return
    const sorted = [...lines].sort((a, b) => a - b)
    const cur = editor.getPosition()?.lineNumber ?? 1
    if (direction === 1) {
      const next = sorted.find(l => l > cur) ?? sorted[0]
      editor.revealLineInCenter(next)
      editor.setPosition({ lineNumber: next, column: 1 })
    } else {
      const next = [...sorted].reverse().find(l => l < cur) ?? sorted[sorted.length - 1]
      editor.revealLineInCenter(next)
      editor.setPosition({ lineNumber: next, column: 1 })
    }
  }, [])

  const handleEditorMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      const model = editor.getModel()

      mountDisposablesRef.current.forEach(d => d.dispose())
      mountDisposablesRef.current = []
      clearConflictVisualDebounce()

      flushConflictVisuals(editor, monaco)

      mountDisposablesRef.current.push(
        editor.onDidChangeModelContent(() => {
          scheduleConflictVisuals(editor, monaco)
        }),
      )

      if (enableConflictCodeLens && model) {
        const uriExpect = model.uri.toString()

        mountDisposablesRef.current.push(
          monaco.editor.registerCommand(CONFLICT_APPLY_CMD, (_accessor, uriStr: unknown, hunkIndex: unknown, choice: unknown) => {
            const ed = editorRef.current
            const m = ed?.getModel()
            if (!ed || !m || typeof uriStr !== 'string' || m.uri.toString() !== uriStr) return
            if (typeof hunkIndex !== 'number' || (choice !== 'ours' && choice !== 'theirs' && choice !== 'both')) return
            const next = resolveSingleConflictHunk(m.getValue(), hunkIndex, choice)
            ed.pushUndoStop()
            ed.executeEdits('conflict-apply', [{ range: m.getFullModelRange(), text: next }])
            ed.pushUndoStop()
            clearConflictVisualDebounce()
            flushConflictVisuals(ed, monaco)
          }),
        )

        mountDisposablesRef.current.push(
          monaco.languages.registerCodeLensProvider(
            { language },
            {
              provideCodeLenses: (m, _token) => {
                if (m.uri.toString() !== uriExpect) {
                  return { lenses: [], dispose: () => {} }
                }
                const text = m.getValue()
                const norm = text.replace(/\r\n/g, '\n')
                if (!norm.includes('<<<<<<<')) {
                  return { lenses: [], dispose: () => {} }
                }
                const hunks = extractGitConflictHunks(norm)
                const lenses: Monaco.languages.CodeLens[] = []
                const uriStr = m.uri.toString()
                for (let i = 0; i < hunks.length; i++) {
                  const line = lineNumberAtOffset(norm, hunks[i].start)
                  const range = new monaco.Range(line, 1, line, 1)
                  lenses.push({
                    range,
                    command: {
                      id: CONFLICT_APPLY_CMD,
                      title: t('conflictEditor.acceptCurrent'),
                      arguments: [uriStr, i, 'ours'],
                    },
                  })
                  lenses.push({
                    range,
                    command: {
                      id: CONFLICT_APPLY_CMD,
                      title: t('conflictEditor.acceptIncoming'),
                      arguments: [uriStr, i, 'theirs'],
                    },
                  })
                  lenses.push({
                    range,
                    command: {
                      id: CONFLICT_APPLY_CMD,
                      title: t('conflictEditor.acceptBoth'),
                      arguments: [uriStr, i, 'both'],
                    },
                  })
                }
                return { lenses, dispose: () => {} }
              },
              resolveCodeLens: (_model, lens) => lens,
            },
          ),
        )
      }
    },
    [
      clearConflictVisualDebounce,
      enableConflictCodeLens,
      flushConflictVisuals,
      language,
      scheduleConflictVisuals,
      t,
    ],
  )

  const doSave = useCallback(
    async (value: string) => {
      setIsSaving(true)
      try {
        await onSave(value)
      } catch (_error) {
        toast.error(t('git.conflict.resolveError'))
      } finally {
        setIsSaving(false)
      }
    },
    [onSave, t],
  )

  const handleSaveClick = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const value = editor.getValue()
    if (hasConflictMarkers(value)) {
      setShowUnresolvedConfirm(true)
      return
    }
    void doSave(value)
  }, [doSave])

  const handleSaveConfirm = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    setShowUnresolvedConfirm(false)
    void doSave(editor.getValue())
  }, [doSave])

  const primaryDisabled =
    isSaving || (disablePrimaryWhenConflicted && hasMarkers)

  const editorTheme = themeMode === 'dark' ? 'vs-dark' : 'vs'
  const editorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = useMemo(() => {
    const lineCount = initialContent.split('\n').length
    const heavy = initialContent.length > 350_000 || lineCount > 6000
    return {
      readOnly: false,
      renderWhitespace: heavy ? 'none' : 'all',
      fontSize: 12,
      fontFamily: 'Jetbrains Mono NL, monospace',
      automaticLayout: true,
      padding: { top: 12, bottom: 12 },
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      minimap: { enabled: !heavy },
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      codeLens: enableConflictCodeLens,
      largeFileOptimizations: true,
    }
  }, [enableConflictCodeLens, initialContent])

  const primaryLabel = primaryAction === 'markResolved' ? t('conflictEditor.markAsResolved') : t('common.save')

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full min-h-[400px] rounded-lg border bg-destructive/5 border-destructive/30 overflow-hidden">
        <div className="flex flex-col gap-2 p-2 border-b shrink-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-sm font-medium truncate flex-1 min-w-0 font-mono" title={filePath}>
              {filePath}
            </span>
            <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
              {conflictCount > 0 && (
                <>
                  <span className="text-xs font-medium text-destructive tabular-nums whitespace-nowrap mr-1">
                    {t('conflictEditor.conflictsCount', { count: conflictCount })}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={t('conflictEditor.codeLensHint')}>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      {t('conflictEditor.codeLensHint')}
                    </TooltipContent>
                  </Tooltip>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-0 px-2"
                    onClick={() => goNeighborConflict(-1)}
                    disabled={conflictCount === 0}
                  >
                    <ChevronUp className="h-3 w-3 mr-0.5" />
                    {t('conflictEditor.prevConflict')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-0 px-2"
                    onClick={() => goNeighborConflict(1)}
                    disabled={conflictCount === 0}
                  >
                    {t('conflictEditor.nextConflict')}
                    <ChevronDown className="h-3 w-3 ml-0.5" />
                  </Button>
                </>
              )}
              <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
                <X className="h-3 w-3 mr-1" />
                {t('common.cancel')}
              </Button>
              <Button type="button" size="sm" onClick={handleSaveClick} disabled={primaryDisabled}>
                {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                {primaryLabel}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <Editor
            path={filePath}
            height="100%"
            language={language}
            theme={editorTheme}
            defaultValue={initialContent}
            options={editorOptions}
            onMount={handleEditorMount}
          />
        </div>

        <AlertDialog open={showUnresolvedConfirm} onOpenChange={setShowUnresolvedConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
              <AlertDialogDescription>{t('conflictEditor.unresolvedMarkersWarning')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleSaveConfirm}>{primaryLabel}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}
