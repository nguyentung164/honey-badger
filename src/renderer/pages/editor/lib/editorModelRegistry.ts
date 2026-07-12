import type * as Monaco from 'monaco-editor'
import { getEditorLanguage, resolveMonacoLanguageId } from '@/lib/monacoLanguage'
import { compareSideModelPath } from '@/pages/editor/lib/editorCompareModels'
import { clearMonacoSymbolNavigationDecorations } from '@/pages/editor/lib/definitionNavigation'
import { emitTextModelReady } from '@/pages/editor/lib/editorModelLifecycle'
import { getModelDiskRevision, modelKey, setModelBaselineVersion, unregisterModel } from '@/pages/editor/lib/editorTextModels'
import { documentUriForPath, canonicalizeFileUri } from '@/pages/editor/lsp/documentUri'

/** VS Code: LRU cap on in-memory ITextModel instances. */
export const MAX_CACHED_EDITOR_MODELS = 15

type ModelMeta = {
  repoCwd: string
  relativePath: string
  lastAccess: number
  pinned: boolean
}

const metaByKey = new Map<string, ModelMeta>()
const viewStateByTabId = new Map<string, string>()
let monacoRef: typeof Monaco | null = null
const openTabKeysByRoot = new Map<string, Set<string>>()

function isOpenTabKey(key: string): boolean {
  for (const keys of openTabKeysByRoot.values()) {
    if (keys.has(key)) return true
  }
  return false
}

export function bindEditorModelRegistry(monaco: typeof Monaco): void {
  monacoRef = monaco
}

export function syncOpenTabKeys(repoCwd: string, relativePaths: readonly string[]): void {
  openTabKeysByRoot.set(repoCwd, new Set(relativePaths.map(p => modelKey(repoCwd, p))))
}

export function saveViewStateForTab(tabId: string, state: Monaco.editor.ICodeEditorViewState | null): void {
  if (!state) {
    viewStateByTabId.delete(tabId)
    return
  }
  try {
    viewStateByTabId.set(tabId, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function readViewStateForTab(tabId: string): string | undefined {
  return viewStateByTabId.get(tabId)
}

export function clearViewStateForTab(tabId: string): void {
  viewStateByTabId.delete(tabId)
}

function touchModel(key: string): void {
  const meta = metaByKey.get(key)
  if (meta) meta.lastAccess = Date.now()
}

function parseUri(monaco: typeof Monaco, repoCwd: string, relativePath: string): Monaco.Uri {
  return monaco.Uri.parse(documentUriForPath(repoCwd, relativePath))
}

function isMonacoCanceledError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as { name?: string; message?: string }
  return record.name === 'Canceled' || record.message === 'Canceled'
}

/** Restore scroll + cursor only — contribution state (word highlight) races on model swap. */
function restoreEditorViewStateSafe(
  editor: Monaco.editor.IStandaloneCodeEditor,
  state: Monaco.editor.ICodeEditorViewState
): void {
  try {
    editor.restoreViewState({
      cursorState: state.cursorState,
      viewState: state.viewState,
      contributionsState: {},
    })
  } catch (error) {
    if (!isMonacoCanceledError(error)) {
      /* ignore other restore failures */
    }
  }
}

function scheduleRestoreEditorViewState(
  editor: Monaco.editor.IStandaloneCodeEditor,
  model: Monaco.editor.ITextModel,
  state: Monaco.editor.ICodeEditorViewState
): void {
  const modelUri = model.uri.toString()
  requestAnimationFrame(() => {
    try {
      if (editor.getModel()?.uri.toString() !== modelUri) return
      restoreEditorViewStateSafe(editor, state)
    } catch {
      /* editor disposed before rAF */
    }
  })
}

export function getExistingModel(
  monaco: typeof Monaco,
  repoCwd: string,
  relativePath: string
): Monaco.editor.ITextModel | null {
  return monaco.editor.getModel(parseUri(monaco, repoCwd, relativePath))
}

export function ensureTextModel(
  monaco: typeof Monaco,
  repoCwd: string,
  relativePath: string,
  content: string,
  languageId: string,
  diskRevision: number
): Monaco.editor.ITextModel {
  const key = modelKey(repoCwd, relativePath)
  const uri = parseUri(monaco, repoCwd, relativePath)
  const resolvedLanguage = resolveMonacoLanguageId(languageId, relativePath)
  let model = monaco.editor.getModel(uri)
  let contentUpdated = false

  if (!model) {
    model = monaco.editor.createModel(content, resolvedLanguage, uri)
    metaByKey.set(key, { repoCwd, relativePath, lastAccess: Date.now(), pinned: isOpenTabKey(key) })
    setModelBaselineVersion(repoCwd, relativePath, model.getAlternativeVersionId())
    evictModelsIfNeeded(monaco)
  } else {
    const prevRevision = getModelDiskRevision(repoCwd, relativePath)
    const isStaleLoad = diskRevision < prevRevision
    if (!isStaleLoad && model.getValue() !== content) {
      model.setValue(content)
      setModelBaselineVersion(repoCwd, relativePath, model.getAlternativeVersionId())
      contentUpdated = true
    }
    if (model.getLanguageId() !== resolvedLanguage) {
      monaco.editor.setModelLanguage(model, resolvedLanguage)
    }
    touchModel(key)
  }

  if (!metaByKey.has(key)) {
    metaByKey.set(key, { repoCwd, relativePath, lastAccess: Date.now(), pinned: isOpenTabKey(key) })
  }

  if (contentUpdated) {
    emitTextModelReady({ repoCwd, relativePath, contentLength: content.length, getContent: () => content, languageId: resolvedLanguage, reason: 'disk-reload' })
  }

  return model
}

export function attachModelToEditor(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
  repoCwd: string,
  relativePath: string,
  tabId: string,
  revealAt?: { line: number; column: number }
): Monaco.editor.ITextModel | null {
  const model = getExistingModel(monaco, repoCwd, relativePath)
  if (!model) return null

  const current = editor.getModel()
  const modelChanged = current?.uri.toString() !== model.uri.toString()
  if (modelChanged) {
    editor.setModel(model)
    clearMonacoSymbolNavigationDecorations(editor)
  }

  touchModel(modelKey(repoCwd, relativePath))

  if (revealAt) {
    const position = { lineNumber: revealAt.line, column: revealAt.column }
    clearMonacoSymbolNavigationDecorations(editor)
    editor.setSelection({
      startLineNumber: revealAt.line,
      startColumn: revealAt.column,
      endLineNumber: revealAt.line,
      endColumn: revealAt.column,
    })
    editor.setPosition(position)
    editor.revealPositionInCenterIfOutsideViewport(position)
    const reassert = () => {
      clearMonacoSymbolNavigationDecorations(editor)
      editor.setSelection({
        startLineNumber: revealAt.line,
        startColumn: revealAt.column,
        endLineNumber: revealAt.line,
        endColumn: revealAt.column,
      })
      editor.setPosition(position)
    }
    requestAnimationFrame(reassert)
    window.setTimeout(reassert, 0)
    window.setTimeout(reassert, 50)
    return model
  }

  const restoredJson = readViewStateForTab(tabId)
  if (restoredJson) {
    try {
      const state = JSON.parse(restoredJson) as Monaco.editor.ICodeEditorViewState
      if (modelChanged) {
        scheduleRestoreEditorViewState(editor, model, state)
      } else {
        restoreEditorViewStateSafe(editor, state)
      }
    } catch {
      /* ignore corrupt state */
    }
  }

  emitTextModelReady({
    repoCwd,
    relativePath,
    contentLength: model.getValueLength(),
    // Lazy — tab switches on non-LSP or already-synced files never copy the buffer.
    getContent: () => model.getValue(),
    languageId: model.getLanguageId(),
    reason: 'attach',
  })

  return model
}

export function getModelText(repoCwd: string, relativePath: string): string | null {
  const monaco = monacoRef
  if (!monaco) return null
  return getExistingModel(monaco, repoCwd, relativePath)?.getValue() ?? null
}

/** True when the model URI belongs to a file open in an editor tab. */
export function isModelOpenInTabs(model: Monaco.editor.ITextModel): boolean {
  const uri = canonicalizeFileUri(model.uri.toString())
  for (const keys of openTabKeysByRoot.values()) {
    for (const key of keys) {
      const meta = metaByKey.get(key)
      if (!meta) continue
      const m = monacoRef ? getExistingModel(monacoRef, meta.repoCwd, meta.relativePath) : null
      if (m && canonicalizeFileUri(m.uri.toString()) === uri) return true
    }
  }
  return false
}

/** True when the model is tracked by the editor LRU registry. */
export function isModelInRegistry(model: Monaco.editor.ITextModel): boolean {
  const uri = canonicalizeFileUri(model.uri.toString())
  for (const meta of metaByKey.values()) {
    const m = monacoRef ? getExistingModel(monacoRef, meta.repoCwd, meta.relativePath) : null
    if (m && canonicalizeFileUri(m.uri.toString()) === uri) return true
  }
  return false
}

export function getModelAlternativeVersionId(repoCwd: string, relativePath: string): number | null {
  const monaco = monacoRef
  if (!monaco) return null
  return getExistingModel(monaco, repoCwd, relativePath)?.getAlternativeVersionId() ?? null
}

export function disposeCompareModels(repoCwd: string, tabId: string, monaco?: typeof Monaco | null): void {
  disposeTextModel(repoCwd, compareSideModelPath(tabId, 'left'), monaco)
  disposeTextModel(repoCwd, compareSideModelPath(tabId, 'right'), monaco)
}

export function disposeTextModel(repoCwd: string, relativePath: string, monaco?: typeof Monaco | null): void {
  const m = monaco ?? monacoRef
  const key = modelKey(repoCwd, relativePath)
  metaByKey.delete(key)
  unregisterModel(repoCwd, relativePath)
  if (!m) return
  const model = getExistingModel(m, repoCwd, relativePath)
  if (model && !model.isDisposed()) {
    model.dispose()
  }
}

function evictModelsIfNeeded(monaco: typeof Monaco): void {
  if (metaByKey.size <= MAX_CACHED_EDITOR_MODELS) return

  const candidates = [...metaByKey.entries()]
    .filter(([, meta]) => !meta.pinned && !isOpenTabKey(modelKey(meta.repoCwd, meta.relativePath)))
    .sort((a, b) => a[1].lastAccess - b[1].lastAccess)

  while (metaByKey.size > MAX_CACHED_EDITOR_MODELS && candidates.length > 0) {
    const [key, meta] = candidates.shift()!
    disposeTextModel(meta.repoCwd, meta.relativePath, monaco)
  }
}

export function renameModelInRegistry(repoCwd: string, fromPath: string, toPath: string, monaco?: typeof Monaco | null): void {
  const m = monaco ?? monacoRef
  const fromKey = modelKey(repoCwd, fromPath)
  const toKey = modelKey(repoCwd, toPath)
  const meta = metaByKey.get(fromKey)
  if (meta) {
    metaByKey.delete(fromKey)
    meta.relativePath = toPath.replace(/\\/g, '/')
    metaByKey.set(toKey, meta)
  }
  if (!m) return
  const model = getExistingModel(m, repoCwd, fromPath)
  if (!model || model.isDisposed()) return
  const value = model.getValue()
  const lang = resolveMonacoLanguageId(getEditorLanguage(toPath), toPath)
  model.dispose()
  m.editor.createModel(value, lang, parseUri(m, repoCwd, toPath))
  emitTextModelReady({
    repoCwd,
    relativePath: toPath.replace(/\\/g, '/'),
    contentLength: value.length,
    getContent: () => value,
    languageId: lang,
    reason: 'attach',
  })
}
