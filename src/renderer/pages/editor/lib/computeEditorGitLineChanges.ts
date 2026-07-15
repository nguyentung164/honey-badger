import type * as Monaco from 'monaco-editor'
import type { GitFileStatusCode } from '@/components/git/GitFileStatusBadge'
import { waitForDiffCompute } from '@/pages/diffviewer/diffViewerUtils'
import { classifyEditorGitLineChange } from '@/pages/editor/lib/buildEditorGitScmDecorations'

/** Repo-relative path for `git show` / `git.cat` (must not be absolute). */
export function normalizeEditorGitRepoPath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
}

/** Normalize line endings so CRLF vs LF does not mark the whole file changed. */
export function normalizeEditorGitDiffText(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

function gitCatStatus(status: GitFileStatusCode | null): string {
  switch (status) {
    case 'added':
      return 'A'
    case 'untracked':
      return '?'
    case 'deleted':
      return 'D'
    case 'renamed':
      return 'R'
    case 'staged':
      return 'M'
    default:
      return 'M'
  }
}

export function editorGitHeadCacheKey(
  repoCwd: string,
  relativePath: string,
  gitStatus: GitFileStatusCode | null
): string {
  return `${repoCwd}\0${normalizeEditorGitRepoPath(relativePath)}\0${gitStatus ?? ''}`
}

const gitHeadContentCache = new Map<string, string>()

type LineChangesCacheEntry = {
  versionId: number
  originalText: string
  changes: Monaco.editor.ILineChange[]
}

const lineChangesByModelUri = new Map<string, LineChangesCacheEntry>()

export function invalidateEditorGitCaches(): void {
  gitHeadContentCache.clear()
  lineChangesByModelUri.clear()
}

export async function loadEditorGitHeadContent(
  repoCwd: string,
  relativePath: string,
  gitStatus: GitFileStatusCode | null
): Promise<string | null> {
  const cacheKey = editorGitHeadCacheKey(repoCwd, relativePath, gitStatus)
  const cached = gitHeadContentCache.get(cacheKey)
  if (cached !== undefined) return cached

  const pathForGit = normalizeEditorGitRepoPath(relativePath)
  const result = await window.api.git.cat(pathForGit, gitCatStatus(gitStatus), 'HEAD', { cwd: repoCwd })
  if (result?.status === 'success' && typeof result.data === 'string') {
    gitHeadContentCache.set(cacheKey, result.data)
    return result.data
  }
  return null
}

export function peekCachedEditorGitLineChanges(
  model: Monaco.editor.ITextModel,
  originalText: string
): Monaco.editor.ILineChange[] | null {
  const entry = lineChangesByModelUri.get(model.uri.toString())
  if (!entry) return null
  if (entry.versionId !== model.getAlternativeVersionId()) return null
  if (entry.originalText !== normalizeEditorGitDiffText(originalText)) return null
  return entry.changes
}

const SHARED_DIFF_LAYOUT = { width: 800, height: 600 } as const

type SharedGitDiffComputer = {
  container: HTMLDivElement
  editor: Monaco.editor.IStandaloneDiffEditor
  /** Persistent original-side model — setValue only when the HEAD snapshot changes. */
  originalModel: Monaco.editor.ITextModel
  /** Snapshot of the live buffer — never attach the visible editor model to the hidden diff editor. */
  modifiedSnapshot: Monaco.editor.ITextModel
  originalText: string
  modifiedText: string
}

let sharedGitDiffComputer: SharedGitDiffComputer | null = null

function getSharedGitDiffComputer(monaco: typeof Monaco): SharedGitDiffComputer {
  if (sharedGitDiffComputer) return sharedGitDiffComputer

  const container = document.createElement('div')
  container.style.cssText =
    'position:fixed;left:-10000px;top:0;width:800px;height:600px;overflow:hidden;pointer-events:none;opacity:0'
  document.body.appendChild(container)

  const editor = monaco.editor.createDiffEditor(container, {
    renderSideBySide: false,
    readOnly: true,
    automaticLayout: false,
    diffAlgorithm: 'advanced',
    ignoreTrimWhitespace: false,
    scrollbar: { vertical: 'hidden', horizontal: 'hidden', handleMouseWheel: false },
    overviewRulerLanes: 0,
    minimap: { enabled: false },
    lineNumbers: 'off',
    glyphMargin: false,
    folding: false,
  })

  // Plaintext: diff compute does not need tokenization on the hidden side.
  const originalModel = monaco.editor.createModel('', 'plaintext')
  const modifiedSnapshot = monaco.editor.createModel('', 'plaintext')

  sharedGitDiffComputer = {
    container,
    editor,
    originalModel,
    modifiedSnapshot,
    originalText: '',
    modifiedText: '',
  }
  return sharedGitDiffComputer
}

/**
 * Diff HEAD snapshot against the live editor buffer.
 * Uses a hidden diff editor with snapshot models so the visible editor keeps its ITextModel.
 */
export async function computeEditorGitLineChanges(
  monaco: typeof Monaco,
  originalText: string,
  modifiedModel: Monaco.editor.ITextModel
): Promise<Monaco.editor.ILineChange[]> {
  const original = normalizeEditorGitDiffText(originalText)
  const lf = monaco.editor.EndOfLinePreference.LF
  const modified = normalizeEditorGitDiffText(modifiedModel.getValue(lf))

  const cached = peekCachedEditorGitLineChanges(modifiedModel, original)
  if (cached) return cached

  if (original === modified) {
    lineChangesByModelUri.set(modifiedModel.uri.toString(), {
      versionId: modifiedModel.getAlternativeVersionId(),
      originalText: original,
      changes: [],
    })
    return []
  }

  const computer = getSharedGitDiffComputer(monaco)
  const { editor: diffEditor, originalModel, modifiedSnapshot } = computer
  if (computer.originalText !== original) {
    originalModel.setValue(original)
    computer.originalText = original
  }
  if (computer.modifiedText !== modified) {
    modifiedSnapshot.setValue(modified)
    computer.modifiedText = modified
  }
  const languageId = modifiedModel.getLanguageId()
  if (modifiedSnapshot.getLanguageId() !== languageId) {
    monaco.editor.setModelLanguage(modifiedSnapshot, languageId)
  }

  try {
    const diffReady = waitForDiffCompute(diffEditor)
    diffEditor.setModel({ original: originalModel, modified: modifiedSnapshot })
    diffEditor.layout(SHARED_DIFF_LAYOUT)
    await diffReady
    const changes = diffEditor.getLineChanges() ?? []
    lineChangesByModelUri.set(modifiedModel.uri.toString(), {
      versionId: modifiedModel.getAlternativeVersionId(),
      originalText: original,
      changes,
    })
    return changes
  } finally {
    diffEditor.setModel(null)
  }
}

export function resolveChangeIndexAtLine(
  changes: readonly Monaco.editor.ILineChange[],
  lineNumber: number
): number {
  if (changes.length === 0) return -1

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    if (lineIntersectsGitChange(lineNumber, change)) return i
  }

  let nearest = 0
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    const line = change.modifiedStartLineNumber || change.originalStartLineNumber
    if (line <= lineNumber) nearest = i
  }
  return nearest
}

export function extractHunkText(text: string, startLine: number, endLine: number): string {
  if (startLine <= 0 || endLine <= 0 || endLine < startLine) return ''
  const lines = text.split(/\r?\n/)
  return lines.slice(startLine - 1, endLine).join('\n')
}

/** VS Code `getChangeHeight` — line count for the changed region. */
export function getEditorGitChangeHeight(change: Monaco.editor.ILineChange): number {
  const modified = change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1
  const original = change.originalEndLineNumber - change.originalStartLineNumber + 1
  if (change.originalEndLineNumber === 0) return modified
  if (change.modifiedEndLineNumber === 0) return original
  return modified + original
}

/** VS Code `getModifiedEndLineNumber` — anchor line for the dirty-diff peek. */
export function getEditorGitModifiedEndLineNumber(change: Monaco.editor.ILineChange): number {
  if (change.modifiedEndLineNumber === 0) {
    return change.modifiedStartLineNumber === 0 ? 1 : change.modifiedStartLineNumber
  }
  return change.modifiedEndLineNumber
}

/** VS Code `QuickDiffWidget.showChange` body height in lines. */
export function computeEditorGitPeekHeightInLines(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
  change: Monaco.editor.ILineChange
): number {
  const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight)
  const editorHeightInLines = Math.max(1, Math.floor(editor.getLayoutInfo().height / lineHeight))
  return Math.min(
    getEditorGitChangeHeight(change) + 8,
    Math.max(6, Math.floor(editorHeightInLines / 3))
  )
}

export function lineIntersectsGitChange(lineNumber: number, change: Monaco.editor.ILineChange): boolean {
  if (lineNumber === 1 && change.modifiedStartLineNumber === 0 && change.modifiedEndLineNumber === 0) {
    return true
  }

  const kind = classifyEditorGitLineChange(change)
  if (kind === 'deleted') {
    const anchor = change.modifiedStartLineNumber === 0 ? 1 : change.modifiedStartLineNumber
    return lineNumber === anchor
  }

  const end = change.modifiedEndLineNumber || change.modifiedStartLineNumber
  return lineNumber >= change.modifiedStartLineNumber && lineNumber <= end
}

/** VS Code `QuickDiffWidget.revealChange` — scroll the inline diff to the hunk + context. */
export function getEditorGitRevealLineRange(change: Monaco.editor.ILineChange): {
  start: number
  end: number
} {
  if (change.modifiedEndLineNumber === 0) {
    const line = change.modifiedStartLineNumber === 0 ? 1 : change.modifiedStartLineNumber
    return { start: line, end: line + 1 }
  }
  if (change.originalEndLineNumber > 0) {
    return {
      start: Math.max(1, change.modifiedStartLineNumber - 1),
      end: change.modifiedEndLineNumber + 1,
    }
  }
  return {
    start: Math.max(1, change.modifiedStartLineNumber),
    end: Math.max(1, change.modifiedEndLineNumber),
  }
}

export function revertGitChangeInEditor(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
  change: Monaco.editor.ILineChange,
  headText: string
): boolean {
  const model = editor.getModel()
  if (!model) return false

  const kind = classifyEditorGitLineChange(change)

  if (kind === 'added') {
    const start = change.modifiedStartLineNumber
    const end = change.modifiedEndLineNumber
    if (end < start) return false
    editor.executeEdits('git-revert-change', [
      {
        range: new monaco.Range(start, 1, end, model.getLineMaxColumn(end)),
        text: '',
      },
    ])
    return true
  }

  if (kind === 'deleted') {
    const original = extractHunkText(
      headText,
      change.originalStartLineNumber,
      change.originalEndLineNumber
    )
    const line = change.modifiedStartLineNumber === 0 ? 1 : Math.max(1, change.modifiedStartLineNumber)
    const insert = original.length > 0 && !original.endsWith('\n') ? `${original}\n` : original
    editor.executeEdits('git-revert-change', [
      {
        range: new monaco.Range(line, 1, line, 1),
        text: insert,
      },
    ])
    return true
  }

  const original = extractHunkText(
    headText,
    change.originalStartLineNumber,
    change.originalEndLineNumber
  )
  const start = change.modifiedStartLineNumber
  const end = change.modifiedEndLineNumber
  editor.executeEdits('git-revert-change', [
    {
      range: new monaco.Range(start, 1, end, model.getLineMaxColumn(end)),
      text: original,
    },
  ])
  return true
}
