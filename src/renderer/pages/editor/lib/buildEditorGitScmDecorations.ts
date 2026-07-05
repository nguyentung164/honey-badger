import type * as Monaco from 'monaco-editor'
import { EDITOR_GIT_SCM_COLORS, type EditorGitChangeKind } from '@/pages/editor/lib/editorGitScmColors'

function isEmptySide(start: number, end: number): boolean {
  return start === 0 || end === 0 || end < start
}

export function classifyEditorGitLineChange(change: Monaco.editor.ILineChange): EditorGitChangeKind {
  const hasOriginal = !isEmptySide(change.originalStartLineNumber, change.originalEndLineNumber)
  const hasModified = !isEmptySide(change.modifiedStartLineNumber, change.modifiedEndLineNumber)
  if (!hasOriginal && hasModified) return 'added'
  if (hasOriginal && !hasModified) return 'deleted'
  return 'modified'
}

const DIRTY_DIFF_TOOLTIP: Record<EditorGitChangeKind, string> = {
  added: 'Added lines',
  modified: 'Changed lines',
  deleted: 'Removed lines',
}

/** VS Code `QuickDiffDecorator.createDecoration` class names. */
export function editorGitDirtyDiffClassName(kind: EditorGitChangeKind): string {
  return `dirty-diff-glyph editor-git-dirty-diff-${kind} primary`
}

function deletedDecorationLine(change: Monaco.editor.ILineChange): number {
  if (change.modifiedStartLineNumber === 0 && change.modifiedEndLineNumber === 0) return 1
  return Math.max(1, change.modifiedStartLineNumber)
}

function modifiedLineRange(change: Monaco.editor.ILineChange): { start: number; end: number } {
  const start = Math.max(1, change.modifiedStartLineNumber)
  const end = Math.max(start, change.modifiedEndLineNumber || start)
  return { start, end }
}

/**
 * Build gutter + overview-ruler + minimap markers from Monaco diff hunks.
 * VS Code uses one model decoration per hunk; Monaco standalone only paints
 * `linesDecorationsClassName` on the first line of a multi-line range — so we
 * emit one gutter decoration per changed line, plus one overview marker per hunk.
 */
export function buildEditorGitScmDecorations(
  changes: readonly Monaco.editor.ILineChange[],
  monaco: typeof Monaco
): Monaco.editor.IModelDeltaDecoration[] {
  const decorations: Monaco.editor.IModelDeltaDecoration[] = []

  for (const change of changes) {
    const kind = classifyEditorGitLineChange(change)
    const colors = EDITOR_GIT_SCM_COLORS[kind]
    const className = editorGitDirtyDiffClassName(kind)
    const tooltip = DIRTY_DIFF_TOOLTIP[kind]

    const overviewRuler = {
      color: colors.ruler,
      position: monaco.editor.OverviewRulerLane.Left,
    }
    const minimap = {
      color: colors.minimap,
      position: monaco.editor.MinimapPosition.Gutter,
    }

    if (kind === 'deleted') {
      const line = deletedDecorationLine(change)
      decorations.push({
        range: {
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          overviewRuler,
          minimap,
        },
      })
      decorations.push({
        range: {
          startLineNumber: line,
          startColumn: Number.MAX_VALUE,
          endLineNumber: line,
          endColumn: Number.MAX_VALUE,
        },
        options: {
          isWholeLine: false,
          linesDecorationsClassName: className,
          linesDecorationsTooltip: tooltip,
        },
      })
      continue
    }

    const { start, end } = modifiedLineRange(change)
    decorations.push({
      range: {
        startLineNumber: start,
        startColumn: 1,
        endLineNumber: end,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        overviewRuler,
        minimap,
      },
    })

    for (let line = start; line <= end; line++) {
      decorations.push({
        range: {
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          linesDecorationsClassName: className,
          linesDecorationsTooltip: tooltip,
        },
      })
    }
  }

  return decorations
}

export function fingerprintEditorGitChanges(changes: readonly Monaco.editor.ILineChange[]): string {
  if (changes.length === 0) return ''
  return changes
    .map(
      c =>
        `${c.originalStartLineNumber}.${c.originalEndLineNumber}.${c.modifiedStartLineNumber}.${c.modifiedEndLineNumber}`
    )
    .join('|')
}
