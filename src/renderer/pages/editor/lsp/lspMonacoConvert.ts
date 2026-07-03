import type * as Monaco from 'monaco-editor'

export type LspRange = {
  start: { line: number; character: number }
  end: { line: number; character: number }
}

export type LspTextEdit = {
  range: LspRange
  newText: string
}

export type LspPosition = {
  line: number
  character: number
}

export function lspRangeToMonaco(range: LspRange): Monaco.IRange {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  }
}

export function monacoRangeToLsp(range: Monaco.IRange): LspRange {
  return {
    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
    end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
  }
}

export function lspPositionToMonaco(position: LspPosition): Monaco.IPosition {
  return { lineNumber: position.line + 1, column: position.character + 1 }
}

export function monacoPositionToLsp(position: Monaco.IPosition): LspPosition {
  return { line: position.lineNumber - 1, character: position.column - 1 }
}

export function lspTextEditToMonaco(edit: LspTextEdit): Monaco.editor.IIdentifiedSingleEditOperation {
  return {
    range: lspRangeToMonaco(edit.range),
    text: edit.newText,
  }
}

export function markerSeverityToLsp(severity: number): number {
  // Monaco MarkerSeverity: Hint=1, Info=2, Warning=4, Error=8
  if (severity === 8) return 1
  if (severity === 4) return 2
  if (severity === 2) return 3
  return 4
}

/** LSP DiagnosticSeverity → Monaco MarkerSeverity (8/4/2/1). */
export function lspSeverityToMonaco(severity: number | undefined): number {
  switch (severity) {
    case 1:
      return 8
    case 2:
      return 4
    case 3:
      return 2
    case 4:
      return 1
    default:
      return 8
  }
}
