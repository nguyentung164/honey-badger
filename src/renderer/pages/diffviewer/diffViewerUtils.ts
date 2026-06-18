import type { editor as MonacoEditor } from 'monaco-editor'
import type { ChangePosition, DiffStats } from './diffViewerTypes'

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
