import * as monaco from 'monaco-editor'
import type { editor as MonacoEditor } from 'monaco-editor'

const MINIMAP_POSITION_INLINE = monaco.editor.MinimapPosition.Inline

const MINIMAP_INSERT_COLORS = {
  dark: '#00aa51b3',
  light: '#4ade80cc',
} as const

const MINIMAP_REMOVE_COLORS = {
  dark: '#aa0000b3',
  light: '#f87171cc',
} as const

export function getDiffViewerMinimapColors(themeMode: 'light' | 'dark') {
  const key = themeMode === 'dark' ? 'dark' : 'light'
  return {
    inserted: MINIMAP_INSERT_COLORS[key],
    removed: MINIMAP_REMOVE_COLORS[key],
  }
}

function isEmptyChangeSide(start: number, end: number): boolean {
  return start === 0 || end === 0 || end < start
}

/** Compact fingerprint — skip decoration work when diff hunks are unchanged. */
export function fingerprintLineChanges(changes: readonly MonacoEditor.ILineChange[]): string {
  if (changes.length === 0) return ''
  const parts = new Array<string>(changes.length)
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i]
    parts[i] = `${c.originalStartLineNumber}.${c.originalEndLineNumber}.${c.modifiedStartLineNumber}.${c.modifiedEndLineNumber}`
  }
  return parts.join('|')
}

/** One decoration per diff hunk (not per line) — keeps minimap updates cheap. */
export function buildMinimapDecorations(
  changes: readonly MonacoEditor.ILineChange[],
  side: 'original' | 'modified',
  color: string
): MonacoEditor.IModelDeltaDecoration[] {
  const decorations: MonacoEditor.IModelDeltaDecoration[] = []

  for (const change of changes) {
    const start = side === 'modified' ? change.modifiedStartLineNumber : change.originalStartLineNumber
    const end = side === 'modified' ? change.modifiedEndLineNumber : change.originalEndLineNumber
    if (isEmptyChangeSide(start, end)) continue

    decorations.push({
      range: {
        startLineNumber: start,
        startColumn: 1,
        endLineNumber: end,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        minimap: {
          color,
          position: MINIMAP_POSITION_INLINE,
        },
      },
    })
  }

  return decorations
}
