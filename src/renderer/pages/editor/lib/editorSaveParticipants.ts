import type * as Monaco from 'monaco-editor'
import { languageIdForLsp } from '@/lib/monacoLanguage'
import { runEditorAction } from '@/pages/editor/lib/editorCommandBridge'
import { isCompareModelPath } from '@/pages/editor/lib/editorCompareModels'
import { getExistingModel } from '@/pages/editor/lib/editorModelRegistry'
import { editorLanguageService } from '@/pages/editor/lsp/EditorLanguageService'

/** VS Code `files.trimTrailingWhitespace` — space, tab, NBSP, vertical tab, form feed. */
const TRAILING_WS_RE = /[\t \f\v\u00a0]+$/u

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg', 'zip', 'gz', '7z', 'rar',
  'exe', 'dll', 'so', 'dylib', 'woff', 'woff2', 'ttf', 'eot', 'mp3', 'mp4', 'pdf',
])

export type EditorSaveParticipantsOptions = {
  repoCwd: string
  tabId: string
  relativePath: string
  languageId: string
  activeTabId: string | null
  formatOnSave: boolean
  trimTrailingWhitespaceOnSave: boolean
  insertFinalNewlineOnSave: boolean
  tabSize: number
  insertSpaces: boolean
}

function shouldSkipEditorSaveParticipants(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/')
  if (isCompareModelPath(normalized)) return true
  if (normalized.includes('(disk)') || normalized.includes('(editor)')) return true
  const ext = normalized.split('.').pop()?.toLowerCase() ?? ''
  return BINARY_EXTENSIONS.has(ext)
}

function trimLineEnd(line: string): string {
  return line.replace(TRAILING_WS_RE, '')
}

/**
 * VS Code save participant order: format → trim trailing WS → insert final newline.
 * Mutates Monaco ITextModel only — no React/Zustand.
 */
export async function applyEditorSaveParticipantsBeforeWrite(opts: EditorSaveParticipantsOptions): Promise<void> {
  const {
    repoCwd,
    tabId,
    relativePath,
    languageId,
    activeTabId,
    formatOnSave,
    trimTrailingWhitespaceOnSave,
    insertFinalNewlineOnSave,
    tabSize,
    insertSpaces,
  } = opts

  if (shouldSkipEditorSaveParticipants(relativePath)) return

  const isActiveTab = activeTabId === tabId

  if (formatOnSave && isActiveTab && languageIdForLsp(languageId)) {
    await editorLanguageService.formatDocument(relativePath, languageId, { tabSize, insertSpaces })
  }

  if (trimTrailingWhitespaceOnSave) {
    await applyTrimTrailingWhitespace(repoCwd, relativePath, isActiveTab)
  }

  if (insertFinalNewlineOnSave) {
    const loaded = await getModel(repoCwd, relativePath)
    if (loaded) insertFinalNewlineInTextModel(loaded.model, loaded.monaco.Range)
  }
}

let monacoModule: typeof Monaco | null = null

async function loadMonaco(): Promise<typeof Monaco> {
  if (!monacoModule) {
    monacoModule = await import('monaco-editor')
  }
  return monacoModule
}

async function getModel(
  repoCwd: string,
  relativePath: string
): Promise<{ model: Monaco.editor.ITextModel; monaco: typeof Monaco } | null> {
  const monaco = await loadMonaco()
  const model = getExistingModel(monaco, repoCwd, relativePath)
  if (!model) return null
  return { model, monaco }
}

async function applyTrimTrailingWhitespace(repoCwd: string, relativePath: string, isActiveTab: boolean): Promise<void> {
  if (isActiveTab) {
    const applied = await runEditorAction('editor.action.trimTrailingWhitespace')
    if (applied) return
  }
  const loaded = await getModel(repoCwd, relativePath)
  if (loaded) trimTrailingWhitespaceInTextModel(loaded.model)
}

/**
 * One `pushEditOperations` batch — O(n) scan, single edit (fast on large files).
 */
function trimTrailingWhitespaceInTextModel(model: Monaco.editor.ITextModel): boolean {
  const lineCount = model.getLineCount()
  const eol = model.getEOL()
  let changed = false
  let lines: string[] | null = null

  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    const line = model.getLineContent(lineNumber)
    const trimmed = trimLineEnd(line)
    if (trimmed === line) {
      if (lines) lines.push(line)
      continue
    }
    changed = true
    if (!lines) {
      lines = []
      for (let j = 1; j < lineNumber; j += 1) {
        lines.push(model.getLineContent(j))
      }
    }
    lines.push(trimmed)
  }

  if (!changed || !lines) return false

  const next = lines.join(eol)
  if (next === model.getValue()) return false

  model.pushEditOperations([], [{ range: model.getFullModelRange(), text: next }], () => null)
  return true
}

/** VS Code `files.insertFinalNewline` — ensure document ends with model EOL. */
function insertFinalNewlineInTextModel(model: Monaco.editor.ITextModel, Range: typeof Monaco.Range): boolean {
  const value = model.getValue()
  if (value.length === 0) return false

  const eol = model.getEOL()
  if (value.endsWith(eol)) return false

  const lineCount = model.getLineCount()
  const column = model.getLineMaxColumn(lineCount)
  model.pushEditOperations(
    [],
    [{ range: new Range(lineCount, column, lineCount, column), text: eol }],
    () => null
  )
  return true
}
