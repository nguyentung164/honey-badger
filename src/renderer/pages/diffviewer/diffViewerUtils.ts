import * as monaco from 'monaco-editor'
import type { editor as MonacoEditor, IRange } from 'monaco-editor'
import { resolveMonacoLanguageId } from '@/lib/monacoLanguage'
import type { ChangePosition, CharDiffStats, DiffStats } from './diffViewerTypes'

const DIFF_COMPUTE_TIMEOUT_MS = 10_000

function isEmptySide(start: number, end: number): boolean {
  return start === 0 || end === 0 || end < start
}

function resolveChangeIndex(changes: readonly MonacoEditor.ILineChange[], line: number, side: 'modified' | 'original'): number {
  let currentIndex = 0

  for (let i = 0; i < changes.length; i++) {
    const c = changes[i]
    const start = side === 'modified' ? c.modifiedStartLineNumber : c.originalStartLineNumber
    const end = side === 'modified' ? c.modifiedEndLineNumber : c.originalEndLineNumber
    if (isEmptySide(start, end)) continue

    const endLine = Math.max(end, start)
    if (line >= start && line <= endLine) {
      currentIndex = i
      break
    }
    if (line < start) {
      currentIndex = Math.max(0, i - 1)
      break
    }
    currentIndex = i
  }

  return currentIndex
}

export function getChangePosition(diffEditor: MonacoEditor.IStandaloneDiffEditor, changes: readonly MonacoEditor.ILineChange[]): ChangePosition {
  if (changes.length === 0) return { current: 0, total: 0 }

  const modifiedEditor = diffEditor.getModifiedEditor()
  const originalEditor = diffEditor.getOriginalEditor()
  const useOriginal = originalEditor.hasTextFocus() && !modifiedEditor.hasTextFocus()
  const line = useOriginal
    ? (originalEditor.getPosition()?.lineNumber ?? 1)
    : (modifiedEditor.getPosition()?.lineNumber ?? 1)
  const currentIndex = resolveChangeIndex(changes, line, useOriginal ? 'original' : 'modified')

  return { current: currentIndex + 1, total: changes.length }
}

export function getCurrentLineChange(diffEditor: MonacoEditor.IStandaloneDiffEditor): MonacoEditor.ILineChange | null {
  const changes = diffEditor.getLineChanges() ?? []
  if (changes.length === 0) return null
  const pos = getChangePosition(diffEditor, changes)
  if (pos.current === 0) return null
  return changes[pos.current - 1] ?? null
}

function charSpan(startColumn: number, endColumn: number): number {
  if (startColumn <= 0 || endColumn <= 0) return 0
  return Math.max(0, endColumn - startColumn)
}

export function computeDiffStats(changes: readonly MonacoEditor.ILineChange[]): DiffStats {
  let additions = 0
  let deletions = 0

  for (const c of changes) {
    if (!isEmptySide(c.modifiedStartLineNumber, c.modifiedEndLineNumber)) {
      additions += c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1
    }
    if (!isEmptySide(c.originalStartLineNumber, c.originalEndLineNumber)) {
      deletions += c.originalEndLineNumber - c.originalStartLineNumber + 1
    }
  }

  return { additions, deletions }
}

export function computeCharDiffStats(changes: readonly MonacoEditor.ILineChange[]): CharDiffStats {
  let charAdditions = 0
  let charDeletions = 0

  for (const lineChange of changes) {
    if (!lineChange.charChanges?.length) continue
    for (const cc of lineChange.charChanges) {
      charDeletions += charSpan(cc.originalStartColumn, cc.originalEndColumn)
      charAdditions += charSpan(cc.modifiedStartColumn, cc.modifiedEndColumn)
    }
  }

  return { charAdditions, charDeletions }
}

export function getCharChangeCount(changes: readonly MonacoEditor.ILineChange[]): number {
  let count = 0
  for (const lineChange of changes) {
    count += lineChange.charChanges?.length ?? 0
  }
  return count
}

/** Wait until Monaco finishes computing the diff (never replaces the editor model). */
export async function waitForDiffCompute(diffEditor: MonacoEditor.IStandaloneDiffEditor): Promise<void> {
  const model = diffEditor.getModel() as (MonacoEditor.IDiffEditorModel & { waitForDiff?: () => Promise<void> }) | null
  if (model?.waitForDiff) {
    await model.waitForDiff().catch(() => undefined)
    return
  }
  if (diffEditor.getLineChanges() !== null) {
    return
  }
  await waitForDiffComputeViaEvent(diffEditor)
}

function waitForDiffComputeViaEvent(diffEditor: MonacoEditor.IStandaloneDiffEditor): Promise<void> {
  return new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      sub.dispose()
      window.clearTimeout(timer)
      resolve()
    }

    const sub = diffEditor.onDidUpdateDiff(finish)
    const timer = window.setTimeout(finish, DIFF_COMPUTE_TIMEOUT_MS)
    if (diffEditor.getLineChanges() !== null) finish()
  })
}

export function getFocusedDiffPaneEditor(diffEditor: MonacoEditor.IStandaloneDiffEditor): MonacoEditor.ICodeEditor {
  const modifiedEditor = diffEditor.getModifiedEditor()
  const originalEditor = diffEditor.getOriginalEditor()
  return originalEditor.hasTextFocus() && !modifiedEditor.hasTextFocus() ? originalEditor : modifiedEditor
}

export function pickEditableDiffPaneEditor(
  diffEditor: MonacoEditor.IStandaloneDiffEditor,
  options?: { originalEditable?: boolean; modifiedEditable?: boolean }
): MonacoEditor.ICodeEditor | null {
  const modifiedEditor = diffEditor.getModifiedEditor()
  const originalEditor = diffEditor.getOriginalEditor()
  const modifiedEditable = options?.modifiedEditable ?? true
  const originalEditable = options?.originalEditable ?? false

  if (originalEditor.hasTextFocus() && !modifiedEditor.hasTextFocus() && originalEditable) {
    return originalEditor
  }
  if (modifiedEditable) return modifiedEditor
  if (originalEditable) return originalEditor
  return null
}

function createSingleCursorSelection(lineNumber: number, column: number): monaco.Selection {
  return new monaco.Selection(lineNumber, column, lineNumber, column)
}

/** Move cursor to a known-valid anchor before full-document edits (avoids view render errors). */
function anchorEditorCursorBeforeFullReplace(editor: MonacoEditor.ICodeEditor): void {
  const anchor = createSingleCursorSelection(1, 1)
  editor.setSelections([anchor])
  editor.setPosition({ lineNumber: 1, column: 1 })
}

function mapLineAfterRemovingEmptyLines(model: MonacoEditor.ITextModel, lineNumber: number): number {
  const lineCount = model.getLineCount()
  if (lineCount === 0) return 1
  const target = Math.max(1, Math.min(lineNumber, lineCount))
  let mapped = 0
  for (let i = 1; i <= target; i++) {
    if (model.getLineContent(i).trim() !== '') mapped++
  }
  if (model.getLineContent(target).trim() === '') return Math.max(1, mapped)
  return Math.max(1, mapped)
}

function clampPositionToModel(
  model: MonacoEditor.ITextModel,
  lineNumber: number,
  column: number
): { lineNumber: number; column: number } {
  const lineCount = Math.max(1, model.getLineCount())
  const safeLine = Math.min(Math.max(1, Number.isFinite(lineNumber) ? lineNumber : 1), lineCount)
  const safeColumn = Math.min(Math.max(1, Number.isFinite(column) ? column : 1), model.getLineMaxColumn(safeLine))
  return { lineNumber: safeLine, column: safeColumn }
}

/** Prevent Monaco view errors when undo/redo leaves the cursor on a deleted line. */
export function clampEditorPosition(editor: MonacoEditor.ICodeEditor): void {
  const model = editor.getModel()
  if (!model) return

  try {
    const current = editor.getPosition()
    const { lineNumber, column } = clampPositionToModel(model, current?.lineNumber ?? 1, current?.column ?? 1)
    if (!current || current.lineNumber !== lineNumber || current.column !== column) {
      editor.setPosition({ lineNumber, column })
    }
  } catch {
    editor.setPosition({ lineNumber: 1, column: 1 })
  }
}

/** Reset both diff panes to line 1 before swapping model content (avoids Monaco illegal lineNumber). */
export function resetDiffEditorCursors(diffEditor: MonacoEditor.IStandaloneDiffEditor | null): void {
  if (!diffEditor) return
  try {
    diffEditor.getOriginalEditor().setPosition({ lineNumber: 1, column: 1 })
    diffEditor.getModifiedEditor().setPosition({ lineNumber: 1, column: 1 })
  } catch {
    // model may be mid-update
  }
}

export function triggerFindWidget(diffEditor: MonacoEditor.IStandaloneDiffEditor): void {
  const editor = getFocusedDiffPaneEditor(diffEditor)
  editor.focus()
  void editor.getAction('actions.find')?.run()
}

export function triggerFindReplaceWidget(diffEditor: MonacoEditor.IStandaloneDiffEditor): void {
  const editor = getFocusedDiffPaneEditor(diffEditor)
  editor.focus()
  void editor.getAction('editor.action.startFindReplaceAction')?.run()
}

export type DiffEditorFormatResult = 'success' | 'unsupported' | 'readonly'

function getPathExtension(filePath?: string): string {
  if (!filePath) return ''
  const fileName = filePath.split('/').pop() || ''
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

export { resolveMonacoLanguageId }

export function syncDiffEditorModelLanguage(
  diffEditor: MonacoEditor.IStandaloneDiffEditor,
  monaco: typeof import('monaco-editor'),
  languageId: string,
  filePath?: string
): void {
  const resolved = resolveMonacoLanguageId(languageId, filePath)
  for (const pane of [diffEditor.getOriginalEditor(), diffEditor.getModifiedEditor()]) {
    const model = pane.getModel()
    if (model && model.getLanguageId() !== resolved) {
      monaco.editor.setModelLanguage(model, resolved)
    }
  }
}

async function runEditorAction(editor: MonacoEditor.ICodeEditor, actionId: string): Promise<boolean> {
  const action = editor.getAction(actionId)
  if (action?.isSupported()) {
    await action.run()
    return true
  }
  return editor.trigger('diff-viewer', actionId, null) ?? false
}

function shouldSkipMonacoFormat(languageId: string, filePath: string | undefined, modelText: string): boolean {
  const ext = getPathExtension(filePath)
  if (ext === 'jsonc' || languageId === 'jsonc') return true
  if (languageId === 'json' && (ext === 'jsonc' || /\/\*|\*\//.test(modelText) || /^\s*\/\//m.test(modelText))) {
    return true
  }
  return false
}

export async function formatDiffEditor(
  diffEditor: MonacoEditor.IStandaloneDiffEditor,
  monaco: typeof import('monaco-editor'),
  options?: { originalEditable?: boolean; modifiedEditable?: boolean; languageId?: string; filePath?: string }
): Promise<DiffEditorFormatResult> {
  const target = pickEditableDiffPaneEditor(diffEditor, options)
  if (!target) return 'readonly'

  const model = target.getModel()
  if (!model) return 'readonly'

  const languageId = options?.languageId?.trim() || model.getLanguageId()
  syncDiffEditorModelLanguage(diffEditor, monaco, languageId, options?.filePath)

  const resolvedLanguage = resolveMonacoLanguageId(languageId, options?.filePath)
  if (model.getLanguageId() !== resolvedLanguage) {
    monaco.editor.setModelLanguage(model, resolvedLanguage)
  }

  target.focus()
  model.pushStackElement()

  let didSomething = false
  let formatted = false

  if (!shouldSkipMonacoFormat(resolvedLanguage, options?.filePath, model.getValue())) {
    formatted = await runEditorAction(target, 'editor.action.formatDocument')
    if (formatted) didSomething = true
  }

  const trimmed = await runEditorAction(target, 'editor.action.trimTrailingWhitespace')
  if (trimmed) didSomething = true

  model.pushStackElement()
  clampEditorPosition(target)
  clampEditorPosition(diffEditor.getModifiedEditor())
  clampEditorPosition(diffEditor.getOriginalEditor())

  if (formatted) return 'success'
  return didSomething ? 'success' : 'unsupported'
}

export type DiffEditorRemoveEmptyLinesResult = 'success' | 'readonly' | 'unchanged' | 'failed'

function getFullModelReplaceRange(model: MonacoEditor.ITextModel): IRange {
  const lineCount = Math.max(1, model.getLineCount())
  return {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: lineCount,
    endColumn: model.getLineMaxColumn(lineCount),
  }
}

function computeTextWithoutEmptyLines(model: MonacoEditor.ITextModel): string | null {
  const eol = model.getEOL()
  const kept: string[] = []
  let hadEmptyLine = false

  for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
    const line = model.getLineContent(lineNumber)
    if (line.trim() === '') {
      hadEmptyLine = true
      continue
    }
    kept.push(line)
  }

  if (!hadEmptyLine) return null

  const nextValue = kept.join(eol)
  if (nextValue === model.getValue()) return null
  return nextValue
}

export function readDiffEditorPaneText(diffEditor: MonacoEditor.IStandaloneDiffEditor): {
  original: string
  modified: string
} {
  return {
    original: diffEditor.getOriginalEditor().getModel()?.getValue() ?? '',
    modified: diffEditor.getModifiedEditor().getModel()?.getValue() ?? '',
  }
}

export function stabilizeDiffEditorAfterEdit(diffEditor: MonacoEditor.IStandaloneDiffEditor): void {
  clampEditorPosition(diffEditor.getModifiedEditor())
  clampEditorPosition(diffEditor.getOriginalEditor())
}

function applyFullModelReplace(
  editor: MonacoEditor.ICodeEditor,
  newValue: string,
  source: string,
  resolveEndLine: (model: MonacoEditor.ITextModel, priorLine: number) => number
): boolean {
  const model = editor.getModel()
  if (!model) return false

  const priorPosition = editor.getPosition()
  const priorLine = priorPosition?.lineNumber ?? 1
  const priorColumn = priorPosition?.column ?? 1
  const endLineHint = resolveEndLine(model, priorLine)

  clampEditorPosition(editor)
  anchorEditorCursorBeforeFullReplace(editor)

  const range = getFullModelReplaceRange(model)
  model.pushStackElement()
  let applied = editor.executeEdits(source, [{ range, text: newValue }], () => {
    const nextModel = editor.getModel()
    if (!nextModel) return null
    const { lineNumber, column } = clampPositionToModel(nextModel, endLineHint, priorColumn)
    return [createSingleCursorSelection(lineNumber, column)]
  })

  if (!applied) {
    model.pushStackElement()
    anchorEditorCursorBeforeFullReplace(editor)
    model.setValue(newValue)
    if (model.getValue() !== newValue) return false
    const { lineNumber, column } = clampPositionToModel(model, endLineHint, priorColumn)
    editor.setSelections([createSingleCursorSelection(lineNumber, column)])
    applied = true
  }

  clampEditorPosition(editor)
  return applied
}

export function removeEmptyLinesFromDiffEditor(
  diffEditor: MonacoEditor.IStandaloneDiffEditor,
  options?: { originalEditable?: boolean; modifiedEditable?: boolean }
): DiffEditorRemoveEmptyLinesResult {
  const target = pickEditableDiffPaneEditor(diffEditor, options)
  if (!target) return 'readonly'

  const model = target.getModel()
  if (!model) return 'readonly'

  const newValue = computeTextWithoutEmptyLines(model)
  if (newValue === null) return 'unchanged'

  stabilizeDiffEditorAfterEdit(diffEditor)
  anchorEditorCursorBeforeFullReplace(diffEditor.getModifiedEditor())
  anchorEditorCursorBeforeFullReplace(diffEditor.getOriginalEditor())
  target.focus()

  const applied = applyFullModelReplace(target, newValue, 'remove-empty-lines', mapLineAfterRemovingEmptyLines)
  if (!applied) return 'failed'

  stabilizeDiffEditorAfterEdit(diffEditor)
  return 'success'
}

export function swapDiffEditorModels(diffEditor: MonacoEditor.IStandaloneDiffEditor): boolean {
  const model = diffEditor.getModel()
  if (!model) return false
  diffEditor.setModel({ original: model.modified, modified: model.original })
  return true
}

export function goToAdjacentChange(diffEditor: MonacoEditor.IStandaloneDiffEditor, direction: 'prev' | 'next'): void {
  diffEditor.goToDiff(direction === 'next' ? 'next' : 'previous')
}

export function goToFirstChange(diffEditor: MonacoEditor.IStandaloneDiffEditor, options?: { focus?: boolean }): void {
  const changes = diffEditor.getLineChanges() ?? []
  if (changes.length === 0) return

  const first = changes[0]
  diffEditor.revealFirstDiff()

  const preferModified = first.modifiedStartLineNumber > 0
  const line = preferModified
    ? first.modifiedStartLineNumber
    : Math.max(1, first.originalStartLineNumber)
  const editor = preferModified ? diffEditor.getModifiedEditor() : diffEditor.getOriginalEditor()
  editor.setPosition({ lineNumber: line, column: 1 })
  editor.revealLineInCenter(line)
  if (options?.focus !== false) {
    editor.focus()
  }
}

export function goToLastChange(diffEditor: MonacoEditor.IStandaloneDiffEditor): void {
  const changes = diffEditor.getLineChanges() ?? []
  if (changes.length === 0) return

  const last = changes[changes.length - 1]
  const line =
    last.modifiedStartLineNumber > 0 ? last.modifiedStartLineNumber : Math.max(1, last.originalStartLineNumber)
  const modifiedEditor = diffEditor.getModifiedEditor()
  modifiedEditor.setPosition({ lineNumber: line, column: 1 })
  modifiedEditor.revealLineInCenter(line)
  modifiedEditor.focus()
}

export function resolveDiffViewerRevealPath(filePath: string, cwd?: string): string {
  if (!cwd?.trim()) return filePath
  const base = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const rel = filePath.replace(/^[/\\]+/, '')
  return `${base}/${rel}`.replace(/\/+/g, '/')
}
