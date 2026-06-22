import type { editor as MonacoEditor } from 'monaco-editor'
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

export function swapDiffEditorModels(diffEditor: MonacoEditor.IStandaloneDiffEditor): boolean {
  const model = diffEditor.getModel()
  if (!model) return false
  diffEditor.setModel({ original: model.modified, modified: model.original })
  return true
}

export function goToAdjacentChange(diffEditor: MonacoEditor.IStandaloneDiffEditor, direction: 'prev' | 'next'): void {
  diffEditor.goToDiff(direction === 'next' ? 'next' : 'previous')
}

export function goToFirstChange(diffEditor: MonacoEditor.IStandaloneDiffEditor): void {
  diffEditor.revealFirstDiff()
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
