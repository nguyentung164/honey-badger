import type * as Monaco from 'monaco-editor'
import { canonicalizeFileUri } from '@/pages/editor/lsp/documentUri'
import { type LspRange, lspRangeToMonaco, monacoRangeToLsp } from '@/pages/editor/lsp/lspMonacoConvert'

export const LSP_SOURCE_DEFINITION_METHOD = 'custom/textDocument/sourceDefinition' as const
export const GO_TO_SOURCE_DEFINITION_ACTION_ID = 'editor.action.goToSourceDefinition' as const

export type LspDefinitionLocation = {
  uri?: string
  targetUri?: string
  range?: LspRange
  targetRange?: LspRange
  targetSelectionRange?: LspRange
  originSelectionRange?: LspRange
}

export function flattenDefinitionResponse(result: unknown): LspDefinitionLocation[] {
  if (!result) return []
  if (Array.isArray(result)) return result as LspDefinitionLocation[]
  return [result as LspDefinitionLocation]
}

/**
 * VS Code `definitionAndBoundSpan.textSpan` / tsgo `createLspRangeFromNode`.
 * Underlines the symbol at the cursor (string literal, identifier, etc.) for Ctrl+hover.
 */
export function computeBoundSpanAtPosition(model: Monaco.editor.ITextModel, position: Monaco.IPosition): Monaco.IRange {
  const line = model.getLineContent(position.lineNumber)
  const column = position.column - 1
  if (column < 0 || column >= line.length) {
    return fallbackWordRange(model, position)
  }

  const stringRange = rangeOfEnclosingStringLiteral(line, column)
  if (stringRange) {
    return {
      startLineNumber: position.lineNumber,
      startColumn: stringRange.start + 1,
      endLineNumber: position.lineNumber,
      endColumn: stringRange.end + 1,
    }
  }

  return fallbackWordRange(model, position)
}

function fallbackWordRange(model: Monaco.editor.ITextModel, position: Monaco.IPosition): Monaco.IRange {
  const word = model.getWordAtPosition(position)
  if (word) {
    return {
      startLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endLineNumber: position.lineNumber,
      endColumn: word.endColumn,
    }
  }
  return {
    startLineNumber: position.lineNumber,
    startColumn: position.column,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  }
}

function rangeOfEnclosingStringLiteral(line: string, column: number): { start: number; end: number } | null {
  let quote: "'" | '"' | '`' | null = null
  let start = -1
  let escaped = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === quote) {
        if (column >= start && column <= i) {
          return { start, end: i + 1 }
        }
        quote = null
        start = -1
      }
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      start = i
    }
  }

  return null
}

function collapseMonacoRangeToStart(range: Monaco.IRange): Monaco.IRange {
  return {
    startLineNumber: range.startLineNumber,
    startColumn: range.startColumn,
    endLineNumber: range.startLineNumber,
    endColumn: range.startColumn,
  }
}

/** Monaco `symbolHighlight` from goto-definition survives model swaps and looks like select-all. */
export function clearMonacoSymbolNavigationDecorations(editor: Monaco.editor.ICodeEditor): void {
  const model = editor.getModel()
  if (!model) return
  const ids: string[] = []
  for (let line = 1; line <= model.getLineCount(); line++) {
    for (const dec of editor.getLineDecorations(line) ?? []) {
      if (dec.options.className?.includes('symbolHighlight')) {
        ids.push(dec.id)
      }
    }
  }
  if (ids.length > 0) editor.removeDecorations(ids)
}

export function mapLspDefinitionToMonacoLink(
  monaco: typeof Monaco,
  loc: LspDefinitionLocation,
  originFallback?: Monaco.IRange
): Monaco.languages.LocationLink | null {
  const uri = loc.targetUri ?? loc.uri
  if (!uri) return null

  const selectionLsp = loc.targetSelectionRange ?? loc.range
  const contextLsp = loc.targetRange ?? loc.range ?? selectionLsp
  const anchorLsp = contextLsp ?? selectionLsp
  if (!anchorLsp) return null

  const contextRange = lspRangeToMonaco(anchorLsp)
  const selectionAnchor = selectionLsp ? lspRangeToMonaco(selectionLsp) : collapseMonacoRangeToStart(contextRange)
  // Navigation + Monaco highlight must never use a multi-line/module-wide span.
  const targetSelectionRange = collapseMonacoRangeToStart(selectionAnchor)

  const link: Monaco.languages.LocationLink = {
    uri: monaco.Uri.parse(canonicalizeFileUri(uri)),
    range: contextRange,
    // Monaco uses `targetSelectionRange` for navigation + highlight; never fall back to full `range`.
    targetSelectionRange,
  }

  if (loc.originSelectionRange) {
    link.originSelectionRange = lspRangeToMonaco(loc.originSelectionRange)
  } else if (originFallback) {
    link.originSelectionRange = originFallback
  }

  return link
}

export function definitionLinksToMonacoLocations(links: Monaco.languages.LocationLink[]): Monaco.languages.Location[] {
  return links.map(link => ({
    uri: link.uri,
    range: link.targetSelectionRange ?? link.range,
  }))
}

export function monacoPositionToLspDefinitionRequest(position: Monaco.IPosition): { line: number; character: number } {
  return { line: position.lineNumber - 1, character: position.column - 1 }
}

export function monacoRangeToLspDefinitionRange(range: Monaco.IRange): LspRange {
  return monacoRangeToLsp(range)
}
