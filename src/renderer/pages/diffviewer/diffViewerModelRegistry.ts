import type * as Monaco from 'monaco-editor'
import { resolveMonacoLanguageId } from '@/lib/monacoLanguage'
import { GIT_INDEX_REF } from 'shared/git/revisionSpecs'
import { normalizeGitPath } from './diffViewerGitFiles'

/** VS Code-style LRU cap — each file pair uses two side models. */
export const MAX_CACHED_DIFF_VIEWER_MODELS = 30

export type DiffViewerSideRef = {
  filePath: string
  /** Stable revision label (commit hash, HEAD, index, working, svn rev, …). */
  ref: string
}

export type DiffViewerSideRefPair = {
  original: DiffViewerSideRef
  modified: DiffViewerSideRef
}

type CacheEntry = {
  key: string
  lastAccess: number
}

let monacoRef: typeof Monaco | null = null
const metaByKey = new Map<string, CacheEntry>()
let pinnedKeys = new Set<string>()

export function bindDiffViewerModelRegistry(monaco: typeof Monaco): void {
  monacoRef = monaco
}

export function diffViewerSideCacheKey(
  cwd: string,
  sideRef: DiffViewerSideRef,
  side: 'original' | 'modified'
): string {
  return `${normalizeGitPath(cwd || '_')}\0${normalizeGitPath(sideRef.filePath)}\0${side}\0${sideRef.ref}`
}

/** Stable URI for @monaco-editor/react `originalModelPath` / `modifiedModelPath` (must be unique per side+revision). */
export function diffViewerSideModelUriString(
  cwd: string,
  sideRef: DiffViewerSideRef,
  side: 'original' | 'modified'
): string {
  const cacheKey = diffViewerSideCacheKey(cwd, sideRef, side)
  return `hb-diff://${encodeURIComponent(cacheKey)}`
}

function sideModelUri(monaco: typeof Monaco, cacheKey: string): Monaco.Uri {
  return monaco.Uri.parse(`hb-diff://${encodeURIComponent(cacheKey)}`)
}

function touch(cacheKey: string): void {
  const entry = metaByKey.get(cacheKey)
  if (entry) entry.lastAccess = Date.now()
}

function disposeSideModel(monaco: typeof Monaco, cacheKey: string): void {
  metaByKey.delete(cacheKey)
  const model = monaco.editor.getModel(sideModelUri(monaco, cacheKey))
  if (model && !model.isDisposed()) {
    model.dispose()
  }
}

function evictIfNeeded(monaco: typeof Monaco): void {
  if (metaByKey.size <= MAX_CACHED_DIFF_VIEWER_MODELS) return

  const candidates = [...metaByKey.entries()]
    .filter(([key]) => !pinnedKeys.has(key))
    .sort((a, b) => a[1].lastAccess - b[1].lastAccess)

  while (metaByKey.size > MAX_CACHED_DIFF_VIEWER_MODELS && candidates.length > 0) {
    const [key] = candidates.shift()!
    disposeSideModel(monaco, key)
  }
}

/** Get or create a cached side model keyed by file path + revision (VS Code virtual document pattern). */
export function ensureDiffViewerSideModel(
  monaco: typeof Monaco,
  cwd: string,
  sideRef: DiffViewerSideRef,
  side: 'original' | 'modified',
  content: string,
  languageId: string
): Monaco.editor.ITextModel {
  const cacheKey = diffViewerSideCacheKey(cwd, sideRef, side)
  const uri = sideModelUri(monaco, cacheKey)
  const resolvedLanguage = resolveMonacoLanguageId(languageId, sideRef.filePath)
  let model = monaco.editor.getModel(uri)

  if (!model) {
    model = monaco.editor.createModel(content, resolvedLanguage, uri)
    metaByKey.set(cacheKey, { key: cacheKey, lastAccess: Date.now() })
    evictIfNeeded(monaco)
  } else {
    if (model.getValue() !== content) {
      model.setValue(content)
    }
    if (model.getLanguageId() !== resolvedLanguage) {
      monaco.editor.setModelLanguage(model, resolvedLanguage)
    }
    touch(cacheKey)
  }

  return model
}

export function buildDiffViewerSideCacheKeys(
  cwd: string,
  pair: DiffViewerSideRefPair
): { originalKey: string; modifiedKey: string } {
  return {
    originalKey: diffViewerSideCacheKey(cwd, pair.original, 'original'),
    modifiedKey: diffViewerSideCacheKey(cwd, pair.modified, 'modified'),
  }
}

export function pinDiffViewerModelKeys(pinKeys: { originalKey: string; modifiedKey: string }): void {
  pinnedKeys = new Set([pinKeys.originalKey, pinKeys.modifiedKey])
  touch(pinKeys.originalKey)
  touch(pinKeys.modifiedKey)
}

export function ensureDiffViewerModelPair(
  monaco: typeof Monaco,
  cwd: string,
  sideRefs: DiffViewerSideRefPair,
  originalContent: string,
  modifiedContent: string,
  languageId: string
): { originalModel: Monaco.editor.ITextModel; modifiedModel: Monaco.editor.ITextModel } {
  pinDiffViewerModelKeys(buildDiffViewerSideCacheKeys(cwd, sideRefs))
  return {
    originalModel: ensureDiffViewerSideModel(
      monaco,
      cwd,
      sideRefs.original,
      'original',
      originalContent,
      languageId
    ),
    modifiedModel: ensureDiffViewerSideModel(
      monaco,
      cwd,
      sideRefs.modified,
      'modified',
      modifiedContent,
      languageId
    ),
  }
}

export function attachDiffViewerModelsFromRegistry(
  monaco: typeof Monaco,
  diffEditor: Monaco.editor.IStandaloneDiffEditor,
  cwd: string,
  sideRefs: DiffViewerSideRefPair,
  originalContent: string,
  modifiedContent: string,
  languageId: string
): { originalModel: Monaco.editor.ITextModel; modifiedModel: Monaco.editor.ITextModel } {
  const { originalModel, modifiedModel } = ensureDiffViewerModelPair(
    monaco,
    cwd,
    sideRefs,
    originalContent,
    modifiedContent,
    languageId
  )

  const current = diffEditor.getModel()
  if (current?.original !== originalModel || current?.modified !== modifiedModel) {
    diffEditor.setModel({ original: originalModel, modified: modifiedModel })
  }

  return { originalModel, modifiedModel }
}

export function diffViewerSideModelPaths(
  cwd: string,
  sideRefs: DiffViewerSideRefPair
): { original: string; modified: string } {
  return {
    original: diffViewerSideModelUriString(cwd, sideRefs.original, 'original'),
    modified: diffViewerSideModelUriString(cwd, sideRefs.modified, 'modified'),
  }
}

/** @deprecated Prefer `attachDiffViewerModelsFromRegistry` + modelPath props. */
export function attachDiffViewerModelPair(
  diffEditor: Monaco.editor.IStandaloneDiffEditor,
  originalModel: Monaco.editor.ITextModel,
  modifiedModel: Monaco.editor.ITextModel,
  pinKeys: { originalKey: string; modifiedKey: string }
): boolean {
  const current = diffEditor.getModel()
  if (current?.original === originalModel && current?.modified === modifiedModel) {
    pinDiffViewerModelKeys(pinKeys)
    return false
  }

  diffEditor.setModel({ original: originalModel, modified: modifiedModel })
  pinDiffViewerModelKeys(pinKeys)
  return true
}

export function clearDiffViewerModelRegistry(monaco?: typeof Monaco | null): void {
  const m = monaco ?? monacoRef
  pinnedKeys = new Set()
  if (!m) {
    metaByKey.clear()
    return
  }
  for (const key of [...metaByKey.keys()]) {
    disposeSideModel(m, key)
  }
}

export function gitHistoryDiffSideRefs(filePath: string, curHash: string, hash?: string): DiffViewerSideRefPair {
  return {
    original: { filePath, ref: `git:${curHash}` },
    modified: { filePath, ref: `git:${hash ?? ''}` },
  }
}

export function gitRootCommitSideRefs(filePath: string, hash: string): DiffViewerSideRefPair {
  return {
    original: { filePath, ref: 'empty' },
    modified: { filePath, ref: `git:${hash}` },
  }
}

export function gitCommitVsWorkingSideRefs(filePath: string, hash: string): DiffViewerSideRefPair {
  return {
    original: { filePath, ref: `git:${hash}` },
    modified: { filePath, ref: 'working' },
  }
}

export function gitHeadVsWorkingSideRefs(filePath: string): DiffViewerSideRefPair {
  return {
    original: { filePath, ref: 'git:HEAD' },
    modified: { filePath, ref: 'working' },
  }
}

export function gitStagingSideRefs(filePath: string, stagingState: 'staged' | 'unstaged'): DiffViewerSideRefPair {
  if (stagingState === 'staged') {
    return {
      original: { filePath, ref: 'git:HEAD' },
      modified: { filePath, ref: `git:${GIT_INDEX_REF}` },
    }
  }
  return {
    original: { filePath, ref: `git:${GIT_INDEX_REF}` },
    modified: { filePath, ref: 'working' },
  }
}

export function svnRevisionVsWorkingSideRefs(filePath: string, rev?: string): DiffViewerSideRefPair {
  return {
    original: { filePath, ref: `svn:${rev ?? 'base'}` },
    modified: { filePath, ref: 'working' },
  }
}

export function svnRevisionPairSideRefs(
  filePath: string,
  rev: string,
  curRev: string,
  swap: boolean
): DiffViewerSideRefPair {
  const prevRev = Number(rev) > 1 ? String(Number(rev) - 1) : 'empty'
  if (swap) {
    return {
      original: { filePath, ref: `svn:${rev}` },
      modified: { filePath, ref: `svn:${prevRev}` },
    }
  }
  return {
    original: { filePath, ref: `svn:${prevRev}` },
    modified: { filePath, ref: `svn:${rev}` },
  }
}

export function workspaceCompareSideRefs(leftPath: string, rightPath: string): DiffViewerSideRefPair {
  return {
    original: { filePath: leftPath, ref: 'disk' },
    modified: { filePath: rightPath, ref: 'disk' },
  }
}
