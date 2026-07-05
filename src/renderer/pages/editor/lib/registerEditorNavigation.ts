import type * as Monaco from 'monaco-editor'
import { documentUriForPath } from '@/pages/editor/lsp/documentUri'
import { editorLanguageService } from '@/pages/editor/lsp/EditorLanguageService'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'
import {
  relativePathFromDocumentUri,
  resolveTypeScriptModulePath,
} from '@/pages/editor/lib/resolveTypeScriptModule'
import { getModelText } from '@/pages/editor/lib/editorModelRegistry'

const IMPORT_LINK_LANGS = new Set(['typescript', 'typescriptreact', 'javascript', 'javascriptreact'])
const IMPORT_LINK_DECORATION = 'hb-import-link-hover'

type ImportTarget =
  | { kind: 'module'; range: Monaco.IRange; specifier: string }
  | { kind: 'binding'; range: Monaco.IRange; symbol: string; exportedSymbol: string }

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

/** Monaco ICodeEditor has no public isDisposed(); guard after async navigation. */
function isCodeEditorUsable(editor: Monaco.editor.IStandaloneCodeEditor, expectedModelUri?: string): boolean {
  try {
    const current = editor.getModel()
    if (!current) return false
    if (expectedModelUri && current.uri.toString() !== expectedModelUri) return false
    return true
  } catch {
    return false
  }
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
    const quoteColumn = match.index + match[0].indexOf(token) + 1
    const start = quoteColumn + 1
    ranges.push({ start, end: start + specifier.length - 1, specifier })
  }
  return ranges
}

function namedImportBindingRanges(line: string): Array<{ start: number; end: number; symbol: string; exportedSymbol: string }> {
  const ranges: Array<{ start: number; end: number; symbol: string; exportedSymbol: string }> = []
  const braceStart = line.indexOf('{')
  const fromIndex = line.indexOf(' from ')
  if (braceStart < 0 || fromIndex < 0 || braceStart > fromIndex) return ranges

  const clause = line.slice(braceStart + 1, line.indexOf('}', braceStart))
  const bindingRe = /\b(type\s+)?([A-Za-z_$][\w$]*)\b(?:\s+as\s+\b([A-Za-z_$][\w$]*)\b)?/g
  for (let match = bindingRe.exec(clause); match; match = bindingRe.exec(clause)) {
    const exportedSymbol = match[2]
    const local = match[3] ?? match[2]
    const localIndexInClause = match[3] ? match.index + match[0].lastIndexOf(local) : match.index + (match[1] ? match[1].length : 0)
    const start = braceStart + 1 + localIndexInClause
    ranges.push({ start: start + 1, end: start + local.length, symbol: local, exportedSymbol })
  }
  return ranges
}

function defaultImportBindingRange(line: string): { start: number; end: number; symbol: string; exportedSymbol: string } | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('import ') || trimmed.includes('{')) return null
  const match = trimmed.match(/^import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s+from\s+/)
  if (!match) return null
  const symbol = match[1]
  const start = line.indexOf(symbol)
  if (start < 0) return null
  return { start: start + 1, end: start + symbol.length, symbol, exportedSymbol: symbol }
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
          exportedSymbol: range.exportedSymbol,
        }
      }
    }

    const defaultBinding = defaultImportBindingRange(line)
    if (defaultBinding && column >= defaultBinding.start && column <= defaultBinding.end) {
      return {
        kind: 'binding',
        range: toRange(monaco, lineNumber, defaultBinding.start, defaultBinding.end),
        symbol: defaultBinding.symbol,
        exportedSymbol: defaultBinding.exportedSymbol,
      }
    }
  }

  return null
}

function isFallbackResolvableSpecifier(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('~/')
}

function rowDeclaresSymbol(row: string, symbol: string): boolean {
  const trimmed = row.trim()
  return (
    trimmed.startsWith(`function ${symbol}`) ||
    trimmed.startsWith(`async function ${symbol}`) ||
    trimmed.startsWith(`const ${symbol}`) ||
    trimmed.startsWith(`class ${symbol}`) ||
    trimmed.startsWith(`enum ${symbol}`) ||
    trimmed.startsWith(`type ${symbol}`) ||
    trimmed.startsWith(`interface ${symbol}`) ||
    trimmed.includes(`export function ${symbol}`) ||
    trimmed.includes(`export async function ${symbol}`) ||
    trimmed.includes(`export const ${symbol}`) ||
    trimmed.includes(`export class ${symbol}`) ||
    trimmed.includes(`export enum ${symbol}`) ||
    trimmed.includes(`export type ${symbol}`) ||
    trimmed.includes(`export interface ${symbol}`) ||
    (trimmed.includes('export {') && trimmed.includes(symbol))
  )
}

async function fallbackModuleLocation(
  model: Monaco.editor.ITextModel,
  repoCwd: string,
  specifier: string
): Promise<{ uri: string; line: number; column: number } | null> {
  const fromRelativePath = relativePathFromDocumentUri(model.uri.toString(), repoCwd)
  if (!fromRelativePath) return null

  const resolved = await resolveTypeScriptModulePath(specifier, fromRelativePath, repoCwd)
  if (!resolved) return null

  return { uri: documentUriForPath(repoCwd, resolved), line: 1, column: 1 }
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
    const content =
      getModelText(repoCwd, resolved) ?? (await window.api.system.read_file(resolved, { cwd: repoCwd }))
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const row = lines[i]
      if (!rowDeclaresSymbol(row, symbol)) continue
      const fnIndex = row.indexOf(`function ${symbol}`)
      const colIndex = fnIndex >= 0 ? fnIndex + 'function '.length : row.indexOf(symbol)
      const col = Math.max(1, colIndex + 1)
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

function moduleSpecifierFromLine(model: Monaco.editor.ITextModel, lineNumber: number): string | null {
  const line = model.getLineContent(lineNumber)
  const specMatch = line.match(/\bfrom\s+(['"])([^'"]+)\1/) ?? line.match(/\bimport\s+(['"])([^'"]+)\1/)
  return specMatch?.[2] ?? null
}

async function tryNodeModuleNavigation(
  model: Monaco.editor.ITextModel,
  repoCwd: string,
  specifier: string
): Promise<boolean> {
  if (isFallbackResolvableSpecifier(specifier)) return false

  const fromRelativePath = relativePathFromDocumentUri(model.uri.toString(), repoCwd)
  if (!fromRelativePath) return false

  const resolved = await window.api.system.resolve_node_module({
    specifier,
    cwd: repoCwd,
    fromRelativePath,
  })
  if (!resolved) return false

  return openWorkspaceLocation(documentUriForPath(repoCwd, resolved), 1, 1)
}

async function tryWorkspaceImportNavigation(
  importTarget: ImportTarget,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  repoCwd: string
): Promise<boolean> {
  if (importTarget.kind === 'module') {
    const loc = await fallbackModuleLocation(model, repoCwd, importTarget.specifier)
    return loc ? openWorkspaceLocation(loc.uri, loc.line, loc.column) : false
  }
  const loc = await fallbackImportSymbolLocation(model, position, repoCwd, importTarget.exportedSymbol)
  return loc ? openWorkspaceLocation(loc.uri, loc.line, loc.column) : false
}

async function openDefinitionAt(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
  position: Monaco.Position
) {
  const model = editor.getModel()
  if (!model) return
  const modelUri = model.uri.toString()

  const repoCwd = navigationRepoCwd || useEditorWorkspace.getState().repoCwd
  const importTarget = findImportTargetAt(monaco, model, position)
  const moduleSpecifier = importTarget
    ? importTarget.kind === 'module'
      ? importTarget.specifier
      : moduleSpecifierFromLine(model, position.lineNumber)
    : moduleSpecifierFromLine(model, position.lineNumber)

  // Instant path: workspace imports (./ @/ ~/) — no tsserver wait.
  if (importTarget && repoCwd) {
    if (moduleSpecifier && isFallbackResolvableSpecifier(moduleSpecifier)) {
      if (await tryWorkspaceImportNavigation(importTarget, model, position, repoCwd)) {
        return
      }
    }
    // node_modules package string (e.g. 'clsx', 'tailwind-merge') — Node resolve, no LSP wait.
    if (importTarget.kind === 'module' && moduleSpecifier) {
      if (await tryNodeModuleNavigation(model, repoCwd, moduleSpecifier)) {
        return
      }
    }
  }

  if (!isCodeEditorUsable(editor, modelUri)) return

  // VS Code path: tsserver for symbols in external packages and re-exports.
  const locations = await editorLanguageService.lookupDefinition(model, position)

  if (!isCodeEditorUsable(editor, modelUri)) return

  const target = locations?.[0]
  if (target && openWorkspaceLocation(target.uri.toString(), target.range.startLineNumber, target.range.startColumn)) {
    return
  }

  // LSP missed — open package entry (binding click on clsx, twMerge, etc.)
  if (moduleSpecifier && !isFallbackResolvableSpecifier(moduleSpecifier)) {
    if (await tryNodeModuleNavigation(model, repoCwd, moduleSpecifier)) {
      return
    }
  }

  if (!isCodeEditorUsable(editor, modelUri)) return
  try {
    await editor.getAction('editor.action.revealDefinition')?.run()
  } catch {
    /* tab switched / editor disposed during async LSP */
  }
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
