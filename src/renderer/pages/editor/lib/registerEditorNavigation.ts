import type * as Monaco from 'monaco-editor'
import { documentUriForPath } from '@/pages/editor/lsp/documentUri'
import { editorLanguageService } from '@/pages/editor/lsp/EditorLanguageService'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'
import {
  relativePathFromDocumentUri,
  resolveTypeScriptModulePath,
} from '@/pages/editor/lib/resolveTypeScriptModule'

const IMPORT_LINK_LANGS = new Set(['typescript', 'typescriptreact', 'javascript', 'javascriptreact'])
const IMPORT_LINK_DECORATION = 'hb-import-link-hover'

type ImportTarget =
  | { kind: 'module'; range: Monaco.IRange; specifier: string }
  | { kind: 'binding'; range: Monaco.IRange; symbol: string }

let navigationRepoCwd = ''
let openerRegistered = false
let decorationStyleInjected = false

export function setEditorNavigationRepo(repoCwd: string) {
  navigationRepoCwd = repoCwd
}

function ensureDecorationStyle() {
  if (decorationStyleInjected || typeof document === 'undefined') return
  decorationStyleInjected = true
  const style = document.createElement('style')
  style.textContent = `
    .monaco-editor .${IMPORT_LINK_DECORATION} {
      text-decoration: underline !important;
      text-decoration-thickness: 1px;
      text-underline-offset: 2px;
      cursor: pointer;
    }
  `
  document.head.appendChild(style)
}

function isModifierHeld(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.ctrlKey || event.metaKey
}

function openWorkspaceLocation(uri: string, line?: number, column?: number): boolean {
  const repoCwd = navigationRepoCwd || useEditorWorkspace.getState().repoCwd
  if (!repoCwd) return false

  const relativePath = relativePathFromDocumentUri(uri, repoCwd)
  if (!relativePath) return false

  void useEditorWorkspace.getState().openFile(
    relativePath,
    line != null ? { line, column: column ?? 1, pin: true } : { pin: true }
  )
  return true
}

/** Monaco ranges use an exclusive end column. */
function toRange(monaco: typeof Monaco, lineNumber: number, startColumn: number, endColumnInclusive: number): Monaco.IRange {
  return new monaco.Range(lineNumber, startColumn, lineNumber, endColumnInclusive + 1)
}

function moduleSpecifierRanges(line: string): Array<{ start: number; end: number; specifier: string }> {
  const ranges: Array<{ start: number; end: number; specifier: string }> = []
  const re = /(?:\bfrom|\bimport)\s+(['"])([^'"]+)\1/g
  for (let match = re.exec(line); match; match = re.exec(line)) {
    const quote = match[1]
    const specifier = match[2]
    const token = `${quote}${specifier}${quote}`
    const tokenStart = match.index + match[0].indexOf(token) + 1
    ranges.push({ start: tokenStart, end: tokenStart + specifier.length - 1, specifier })
  }
  return ranges
}

function namedImportBindingRanges(line: string): Array<{ start: number; end: number; symbol: string }> {
  const ranges: Array<{ start: number; end: number; symbol: string }> = []
  const braceStart = line.indexOf('{')
  const fromIndex = line.indexOf(' from ')
  if (braceStart < 0 || fromIndex < 0 || braceStart > fromIndex) return ranges

  const clause = line.slice(braceStart + 1, line.indexOf('}', braceStart))
  const bindingRe = /\b([A-Za-z_$][\w$]*)\b(?:\s+as\s+\b([A-Za-z_$][\w$]*)\b)?/g
  for (let match = bindingRe.exec(clause); match; match = bindingRe.exec(clause)) {
    const local = match[2] ?? match[1]
    const localIndexInClause = match[2] ? match.index + match[0].lastIndexOf(local) : match.index
    const start = braceStart + 1 + localIndexInClause
    ranges.push({ start: start + 1, end: start + local.length, symbol: local })
  }
  return ranges
}

function defaultImportBindingRange(line: string): { start: number; end: number; symbol: string } | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('import ') || trimmed.includes('{')) return null
  const match = trimmed.match(/^import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s+from\s+/)
  if (!match) return null
  const symbol = match[1]
  const start = line.indexOf(symbol)
  if (start < 0) return null
  return { start: start + 1, end: start + symbol.length, symbol }
}

function findImportTargetAt(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position
): ImportTarget | null {
  if (!IMPORT_LINK_LANGS.has(model.getLanguageId())) return null

  const lineNumber = position.lineNumber
  const line = model.getLineContent(lineNumber)
  const trimmed = line.trim()
  if (!trimmed.startsWith('import ')) return null

  const column = position.column

  for (const range of moduleSpecifierRanges(line)) {
    if (column >= range.start && column <= range.end) {
      return {
        kind: 'module',
        range: toRange(monaco, lineNumber, range.start, range.end),
        specifier: range.specifier,
      }
    }
  }

  const fromIndex = line.indexOf(' from ')
  if (fromIndex >= 0 && column - 1 <= fromIndex) {
    for (const range of namedImportBindingRanges(line)) {
      if (column >= range.start && column <= range.end) {
        return {
          kind: 'binding',
          range: toRange(monaco, lineNumber, range.start, range.end),
          symbol: range.symbol,
        }
      }
    }

    const defaultBinding = defaultImportBindingRange(line)
    if (defaultBinding && column >= defaultBinding.start && column <= defaultBinding.end) {
      return {
        kind: 'binding',
        range: toRange(monaco, lineNumber, defaultBinding.start, defaultBinding.end),
        symbol: defaultBinding.symbol,
      }
    }
  }

  return null
}

async function fallbackImportSymbolLocation(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  repoCwd: string,
  symbol: string
): Promise<{ uri: string; line: number; column: number } | null> {
  const fromRelativePath = relativePathFromDocumentUri(model.uri.toString(), repoCwd)
  if (!fromRelativePath) return null

  const line = model.getLineContent(position.lineNumber)
  const specMatch = line.match(/\bfrom\s+(['"])([^'"]+)\1/) ?? line.match(/\bimport\s+(['"])([^'"]+)\1/)
  if (!specMatch) return null

  const resolved = await resolveTypeScriptModulePath(specMatch[2], fromRelativePath, repoCwd)
  if (!resolved) return null

  try {
    const content = await window.api.system.read_file(resolved, { cwd: repoCwd })
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const row = lines[i]
      const matchesSymbol =
        row.includes(`export function ${symbol}`) ||
        row.includes(`export async function ${symbol}`) ||
        row.includes(`export const ${symbol}`) ||
        row.includes(`export class ${symbol}`) ||
        row.includes(`export enum ${symbol}`) ||
        row.includes(`export type ${symbol}`) ||
        (row.includes('export {') && row.includes(symbol)) ||
        row.includes('export default function') ||
        row.includes(`export default class ${symbol}`)
      if (!matchesSymbol) continue
      const col = Math.max(1, row.indexOf(symbol) + 1)
      return {
        uri: documentUriForPath(repoCwd, resolved),
        line: i + 1,
        column: col > 0 ? col : 1,
      }
    }
  } catch {
    /* ignore */
  }

  return { uri: documentUriForPath(repoCwd, resolved), line: 1, column: 1 }
}

async function openDefinitionAt(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
  position: Monaco.Position
) {
  const model = editor.getModel()
  if (!model) return

  const repoCwd = navigationRepoCwd || useEditorWorkspace.getState().repoCwd
  const locations = await editorLanguageService.lookupDefinition(model, position)

  const target = locations?.[0]
  if (target && openWorkspaceLocation(target.uri.toString(), target.range.startLineNumber, target.range.startColumn)) {
    return
  }

  const importTarget = findImportTargetAt(monaco, model, position)
  const symbol = importTarget?.kind === 'binding' ? importTarget.symbol : null

  if (symbol && repoCwd) {
    const fallback = await fallbackImportSymbolLocation(model, position, repoCwd, symbol)
    if (fallback && openWorkspaceLocation(fallback.uri, fallback.line, fallback.column)) {
      return
    }
  }

  await editor.getAction('editor.action.revealDefinition')?.run()
}

function registerEditorOpener(monaco: typeof Monaco) {
  if (openerRegistered) return
  openerRegistered = true

  monaco.editor.registerEditorOpener({
    openCodeEditor: (_source, resource, selectionOrPosition) => {
      let line: number | undefined
      let column: number | undefined
      if (selectionOrPosition) {
        if ('startLineNumber' in selectionOrPosition) {
          line = selectionOrPosition.startLineNumber
          column = selectionOrPosition.startColumn
        } else {
          line = selectionOrPosition.lineNumber
          column = selectionOrPosition.column
        }
      }
      return openWorkspaceLocation(resource.toString(), line, column)
    },
  })
}

function registerImportNavigationHandlers(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco
): Monaco.IDisposable {
  ensureDecorationStyle()
  let decorationIds: string[] = []

  const clearDecoration = () => {
    if (decorationIds.length === 0) return
    decorationIds = editor.deltaDecorations(decorationIds, [])
  }

  const showDecoration = (range: Monaco.IRange) => {
    decorationIds = editor.deltaDecorations(decorationIds, [
      {
        range,
        options: { inlineClassName: IMPORT_LINK_DECORATION },
      },
    ])
  }

  const mouseMoveDisposable = editor.onMouseMove(e => {
    if (!isModifierHeld(e.event)) {
      clearDecoration()
      return
    }
    if (e.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT || !e.target.position) {
      clearDecoration()
      return
    }
    const model = editor.getModel()
    if (!model) {
      clearDecoration()
      return
    }
    const target = findImportTargetAt(monaco, model, e.target.position)
    if (!target) {
      clearDecoration()
      return
    }
    showDecoration(target.range)
  })

  const mouseDownDisposable = editor.onMouseDown(e => {
    if (!isModifierHeld(e.event)) return
    if (e.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT) return
    if (e.event.rightButton || e.event.shiftKey || e.event.altKey) return

    const position = e.target.position
    if (!position) return

    const model = editor.getModel()
    if (!model) return

    const repoCwd = navigationRepoCwd || useEditorWorkspace.getState().repoCwd
    if (!repoCwd) return

    const fromRelativePath = relativePathFromDocumentUri(model.uri.toString(), repoCwd)
    if (!fromRelativePath) return

    const target = findImportTargetAt(monaco, model, position)
    if (!target) return

    e.event.preventDefault()
    e.event.stopPropagation()
    clearDecoration()

    if (target.kind === 'module') {
      void resolveTypeScriptModulePath(target.specifier, fromRelativePath, repoCwd).then(resolved => {
        if (!resolved) return
        openWorkspaceLocation(documentUriForPath(repoCwd, resolved))
      })
      return
    }

    void openDefinitionAt(editor, monaco, position)
  })

  const keyUpDisposable = editor.onKeyUp(() => clearDecoration())
  const blurDisposable = editor.onDidBlurEditorWidget(() => clearDecoration())

  return {
    dispose: () => {
      clearDecoration()
      mouseMoveDisposable.dispose()
      mouseDownDisposable.dispose()
      keyUpDisposable.dispose()
      blurDisposable.dispose()
    },
  }
}

/** Wire import path / symbol navigation (Ctrl/Cmd + click, Ctrl/Cmd + hover underline). */
export function registerEditorNavigation(
  monaco: typeof Monaco,
  repoCwd: string,
  editor: Monaco.editor.IStandaloneCodeEditor
): Monaco.IDisposable {
  setEditorNavigationRepo(repoCwd)
  registerEditorOpener(monaco)
  return registerImportNavigationHandlers(editor, monaco)
}
