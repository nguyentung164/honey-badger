import type * as Monaco from 'monaco-editor'
import { getEditorLanguage, resolveMonacoLanguageId } from '@/lib/monacoLanguage'
import { compareSideModelPath } from '@/pages/editor/lib/editorCompareModels'
import { getModelDiskRevision, modelKey, setModelBaselineVersion, unregisterModel } from '@/pages/editor/lib/editorTextModels'
import { documentUriForPath } from '@/pages/editor/lsp/documentUri'

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
let openTabKeys = new Set<string>()

export function bindEditorModelRegistry(monaco: typeof Monaco): void {
  monacoRef = monaco
}

export function syncOpenTabKeys(repoCwd: string, relativePaths: readonly string[]): void {
  openTabKeys = new Set(relativePaths.map(p => modelKey(repoCwd, p)))
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

export function getExistingModel(
  monaco: typeof Monaco,
  repoCwd: string,
  relativePath: string
): Monaco.editor.ITextModel | null {
  return monaco.editor.getModel(parseUri(monaco, repoCwd, relativePath))
}

export function getModelLineCount(repoCwd: string, relativePath: string): number | null {
  const monaco = monacoRef
  if (!monaco) return null
  return getExistingModel(monaco, repoCwd, relativePath)?.getLineCount() ?? null
}

export function getModelMetrics(
  repoCwd: string,
  relativePath: string
): { byteLength: number; lineCount: number } | null {
  const monaco = monacoRef
  if (!monaco) return null
  const model = getExistingModel(monaco, repoCwd, relativePath)
  if (!model) return null
  return { byteLength: model.getValueLength(), lineCount: model.getLineCount() }
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

  if (!model) {
    model = monaco.editor.createModel(content, resolvedLanguage, uri)
    metaByKey.set(key, { repoCwd, relativePath, lastAccess: Date.now(), pinned: openTabKeys.has(key) })
    setModelBaselineVersion(repoCwd, relativePath, model.getAlternativeVersionId())
    evictModelsIfNeeded(monaco)
  } else {
    const prevRevision = getModelDiskRevision(repoCwd, relativePath)
    if (diskRevision > prevRevision && model.getValue() !== content) {
      model.setValue(content)
      setModelBaselineVersion(repoCwd, relativePath, model.getAlternativeVersionId())
    }
    if (model.getLanguageId() !== resolvedLanguage) {
      monaco.editor.setModelLanguage(model, resolvedLanguage)
    }
    touchModel(key)
  }

  if (!metaByKey.has(key)) {
    metaByKey.set(key, { repoCwd, relativePath, lastAccess: Date.now(), pinned: openTabKeys.has(key) })
  }

  return model
}

export function attachModelToEditor(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
  repoCwd: string,
  relativePath: string,
  tabId: string
): Monaco.editor.ITextModel | null {
  const model = getExistingModel(monaco, repoCwd, relativePath)
  if (!model) return null

  const current = editor.getModel()
  if (current?.uri.toString() !== model.uri.toString()) {
    editor.setModel(model)
  }

  touchModel(modelKey(repoCwd, relativePath))

  const restoredJson = readViewStateForTab(tabId)
  if (restoredJson) {
    try {
      const state = JSON.parse(restoredJson) as Monaco.editor.ICodeEditorViewState
      editor.restoreViewState(state)
    } catch {
      /* ignore corrupt state */
    }
  }

  return model
}

export function getModelText(repoCwd: string, relativePath: string): string | null {
  const monaco = monacoRef
  if (!monaco) return null
  return getExistingModel(monaco, repoCwd, relativePath)?.getValue() ?? null
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
    .filter(([, meta]) => !meta.pinned && !openTabKeys.has(modelKey(meta.repoCwd, meta.relativePath)))
    .sort((a, b) => a[1].lastAccess - b[1].lastAccess)

  while (metaByKey.size > MAX_CACHED_EDITOR_MODELS && candidates.length > 0) {
    const [key, meta] = candidates.shift()!
    disposeTextModel(meta.repoCwd, meta.relativePath, monaco)
  }
}

export function markModelPinned(repoCwd: string, relativePath: string, pinned: boolean): void {
  const meta = metaByKey.get(modelKey(repoCwd, relativePath))
  if (meta) meta.pinned = pinned
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
}
