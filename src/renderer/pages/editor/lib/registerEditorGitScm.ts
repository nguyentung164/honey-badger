import type * as Monaco from 'monaco-editor'
import { IPC } from 'main/constants'
import { isLargeFileByMetrics } from 'shared/fileUri'
import type { GitFileStatusCode } from '@/components/git/GitFileStatusBadge'
import {
  computeEditorGitLineChanges,
  computeEditorGitPeekHeightInLines,
  editorGitHeadCacheKey,
  getEditorGitModifiedEndLineNumber,
  invalidateEditorGitCaches,
  lineIntersectsGitChange,
  loadEditorGitHeadContent,
  peekCachedEditorGitLineChanges,
  resolveChangeIndexAtLine,
  revertGitChangeInEditor,
} from '@/pages/editor/lib/computeEditorGitLineChanges'
import {
  buildEditorGitScmDecorations,
  fingerprintEditorGitChanges,
} from '@/pages/editor/lib/buildEditorGitScmDecorations'
import { EDITOR_GIT_SCM_COLORS } from '@/pages/editor/lib/editorGitScmColors'
import { EditorGitPeekWidget } from '@/pages/editor/lib/editorGitPeekWidget'

const REFRESH_DEBOUNCE_MS = 150
const WORKING_TREE_LABEL = 'Git local changes (working tree)'

export type EditorGitScmContext = {
  repoCwd: string
  relativePath: string
  gitStatus: GitFileStatusCode | null
  languageId: string
}

function shouldTrackGitChanges(status: GitFileStatusCode | null): boolean {
  return status !== 'conflicted'
}

function fileLabel(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || relativePath
}

function frameColorForChange(change: Monaco.editor.ILineChange): string {
  if (change.originalEndLineNumber === 0) return EDITOR_GIT_SCM_COLORS.added.gutter
  if (change.modifiedEndLineNumber === 0) return EDITOR_GIT_SCM_COLORS.deleted.gutter
  return EDITOR_GIT_SCM_COLORS.modified.gutter
}

function peekDetailLabel(index: number, total: number): string {
  if (total === 1) return `${WORKING_TREE_LABEL} — 1 of 1 change`
  return `${WORKING_TREE_LABEL} — ${index + 1} of ${total} changes`
}

function findChangeIndexAtLine(changes: readonly Monaco.editor.ILineChange[], lineNumber: number): number {
  const direct = changes.findIndex(change => lineIntersectsGitChange(lineNumber, change))
  if (direct >= 0) return direct
  return resolveChangeIndexAtLine(changes, lineNumber)
}

export function registerEditorGitScm(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
  readContext: () => EditorGitScmContext
): Monaco.IDisposable {
  let decorationIds: string[] = []
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let refreshGeneration = 0
  let lineChanges: Monaco.editor.ILineChange[] = []
  let lineChangesFingerprint = ''
  let headSnapshot = ''
  let headCacheKey = ''
  let lastDecoratedVersionId = -1
  let activeChangeIndex = -1
  let mouseDownLine: number | null = null
  let windowEscapeHandler: ((e: KeyboardEvent) => void) | null = null

  const peek = new EditorGitPeekWidget(editor, monaco)
  const dirtyDiffVisible = editor.createContextKey<boolean>('dirtyDiffVisible', false)

  const bindWindowEscape = () => {
    if (windowEscapeHandler) return
    windowEscapeHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !peek.isOpen) return
      e.preventDefault()
      e.stopImmediatePropagation()
      closePeek()
    }
    window.addEventListener('keydown', windowEscapeHandler, true)
  }

  const unbindWindowEscape = () => {
    if (!windowEscapeHandler) return
    window.removeEventListener('keydown', windowEscapeHandler, true)
    windowEscapeHandler = null
  }

  const closePeek = () => {
    activeChangeIndex = -1
    dirtyDiffVisible.set(false)
    unbindWindowEscape()
    peek.hide()
  }

  const renderPeek = (changeIndex: number) => {
    const ctx = readContext()
    if (!lineChanges.length) {
      closePeek()
      return
    }

    const safeIndex = Math.max(0, Math.min(changeIndex, lineChanges.length - 1))
    const change = lineChanges[safeIndex]
    if (!change) return

    activeChangeIndex = safeIndex
    const anchorLine = getEditorGitModifiedEndLineNumber(change)
    const heightInLines = computeEditorGitPeekHeightInLines(editor, monaco, change)

    const stageFile = async () => {
      const path = ctx.relativePath.replace(/\\/g, '/')
      await window.api.git.add([path], { cwd: ctx.repoCwd })
      window.api.electron.send(IPC.WINDOW.NOTIFY_STAGING_CHANGED, { cwd: ctx.repoCwd })
      closePeek()
    }

    const revertChange = () => {
      if (!revertGitChangeInEditor(editor, monaco, change, headSnapshot)) return
      closePeek()
      void refresh()
    }

    peek.show(
      anchorLine,
      heightInLines,
      {
        fileName: fileLabel(ctx.relativePath),
        detail: peekDetailLabel(safeIndex, lineChanges.length),
        frameColor: frameColorForChange(change),
        canNext: safeIndex < lineChanges.length - 1,
        canPrevious: safeIndex > 0,
        onStage: () => void stageFile(),
        onRevert: revertChange,
        onNext: () => renderPeek(safeIndex + 1),
        onPrevious: () => renderPeek(safeIndex - 1),
        onClose: closePeek,
      },
      headSnapshot,
      ctx.languageId,
      change,
      closePeek
    )
    dirtyDiffVisible.set(true)
    bindWindowEscape()
  }

  const showNextChange = (lineNumber?: number) => {
    if (!lineChanges.length) return
    if (peek.isOpen) {
      renderPeek(Math.min(activeChangeIndex + 1, lineChanges.length - 1))
      return
    }
    const line = lineNumber ?? editor.getPosition()?.lineNumber ?? 1
    const index = findChangeIndexAtLine(lineChanges, line)
    const next = index < lineChanges.length - 1 ? index + 1 : 0
    renderPeek(next)
  }

  const showPreviousChange = (lineNumber?: number) => {
    if (!lineChanges.length) return
    if (peek.isOpen) {
      renderPeek(Math.max(activeChangeIndex - 1, 0))
      return
    }
    const line = lineNumber ?? editor.getPosition()?.lineNumber ?? 1
    const index = findChangeIndexAtLine(lineChanges, line)
    const prev = index > 0 ? index - 1 : lineChanges.length - 1
    renderPeek(prev)
  }

  const invalidateHeadCache = () => {
    headCacheKey = ''
    lastDecoratedVersionId = -1
  }

  const tryApplyCachedDecorations = (): boolean => {
    const model = editor.getModel()
    if (!model || !headCacheKey) return false
    const cached = peekCachedEditorGitLineChanges(model, headSnapshot)
    if (!cached) return false
    lastDecoratedVersionId = model.getAlternativeVersionId()
    applyDecorations(cached)
    if (peek.isOpen) peek.updateOriginalHead(headSnapshot)
    return true
  }

  const applyDecorations = (changes: Monaco.editor.ILineChange[]) => {
    const fingerprint = fingerprintEditorGitChanges(changes)
    if (fingerprint === lineChangesFingerprint && decorationIds.length > 0) return
    lineChanges = changes
    lineChangesFingerprint = fingerprint
    decorationIds = editor.deltaDecorations(decorationIds, buildEditorGitScmDecorations(changes, monaco))
    if (peek.isOpen && lineChanges.length === 0) closePeek()
  }

  const refresh = async () => {
    const generation = ++refreshGeneration
    const ctx = readContext()
    const model = editor.getModel()
    if (
      !model ||
      !ctx.repoCwd ||
      !ctx.relativePath ||
      !shouldTrackGitChanges(ctx.gitStatus) ||
      // VS Code-style guard: skip dirty-diff for large files — the advanced diff is too costly.
      isLargeFileByMetrics(model.getValueLength(), model.getLineCount())
    ) {
      lineChanges = []
      lineChangesFingerprint = ''
      decorationIds = editor.deltaDecorations(decorationIds, [])
      invalidateHeadCache()
      closePeek()
      return
    }

    const nextHeadCacheKey = editorGitHeadCacheKey(ctx.repoCwd, ctx.relativePath, ctx.gitStatus)
    if (nextHeadCacheKey !== headCacheKey) {
      try {
        const loaded = await loadEditorGitHeadContent(ctx.repoCwd, ctx.relativePath, ctx.gitStatus)
        if (generation !== refreshGeneration) return
        if (loaded === null) {
          if (ctx.gitStatus === 'untracked' || ctx.gitStatus === 'added') {
            headSnapshot = ''
          } else {
            applyDecorations([])
            return
          }
        } else {
          headSnapshot = loaded
        }
      } catch {
        if (generation !== refreshGeneration) return
        applyDecorations([])
        return
      }
      headCacheKey = nextHeadCacheKey
      lastDecoratedVersionId = -1
    }

    const versionId = model.getAlternativeVersionId()
    if (versionId === lastDecoratedVersionId && decorationIds.length > 0) {
      if (peek.isOpen) peek.updateOriginalHead(headSnapshot)
      return
    }

    if (tryApplyCachedDecorations()) return

    try {
      const changes = await computeEditorGitLineChanges(monaco, headSnapshot, model)
      if (generation !== refreshGeneration) return
      lastDecoratedVersionId = versionId
      applyDecorations(changes)
      if (peek.isOpen) peek.updateOriginalHead(headSnapshot)
    } catch {
      if (generation !== refreshGeneration) return
      applyDecorations([])
    }
  }

  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      void refresh()
    }, REFRESH_DEBOUNCE_MS)
  }

  const handleEditorEscape = (e: Monaco.IKeyboardEvent) => {
    if (e.keyCode !== monaco.KeyCode.Escape || !peek.isOpen) return
    e.preventDefault()
    e.stopPropagation()
    closePeek()
  }

  const contentDisposable = editor.onDidChangeModelContent(scheduleRefresh)
  const modelDisposable = editor.onDidChangeModel(() => {
    closePeek()
    void refresh()
  })
  const keydownDisposable = editor.onKeyDown(handleEditorEscape)

  const closeQuickDiffAction = editor.addAction({
    id: 'closeQuickDiff',
    label: 'Close Quick Diff',
    keybindings: [monaco.KeyCode.Escape, monaco.KeyMod.Shift | monaco.KeyCode.Escape],
    precondition: 'dirtyDiffVisible',
    run: () => closePeek(),
  })

  const nextAction = editor.addAction({
    id: 'editor.action.dirtydiff.next',
    label: 'Show Next Change',
    keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.F3],
    run: () => showNextChange(),
  })

  const previousAction = editor.addAction({
    id: 'editor.action.dirtydiff.previous',
    label: 'Show Previous Change',
    keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.F3],
    run: () => showPreviousChange(),
  })

  const mouseDownDisposable = editor.onMouseDown(event => {
    const target = event.target
    if (target.type !== monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS) return
    const line = target.position?.lineNumber
    if (!line || lineChanges.length === 0) return
    if (!event.event.leftButton) return
    mouseDownLine = line
  })

  const mouseUpDisposable = editor.onMouseUp(event => {
    if (mouseDownLine == null) return
    const line = mouseDownLine
    mouseDownLine = null

    const target = event.target
    if (target.type !== monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS) return
    if (target.position?.lineNumber !== line) return
    if (!lineChanges.length) return

    event.event.preventDefault()
    event.event.stopPropagation()

    const index = findChangeIndexAtLine(lineChanges, line)
    if (index < 0) return

    if (peek.isOpen && activeChangeIndex === index) {
      closePeek()
      return
    }
    renderPeek(index)
  })

  const onGitStatusUpdated = (event: Event) => {
    const detail = (event as CustomEvent<{ fromTable?: boolean }>).detail
    if (detail?.fromTable) return
    invalidateEditorGitCaches()
    invalidateHeadCache()
    scheduleRefresh()
  }
  window.addEventListener('git-status-updated', onGitStatusUpdated)
  window.addEventListener('git-branch-changed', onGitStatusUpdated)

  void refresh()

  return {
    dispose() {
      refreshGeneration++
      if (refreshTimer) clearTimeout(refreshTimer)
      contentDisposable.dispose()
      modelDisposable.dispose()
      keydownDisposable.dispose()
      mouseDownDisposable.dispose()
      mouseUpDisposable.dispose()
      nextAction?.dispose()
      previousAction?.dispose()
      closeQuickDiffAction?.dispose()
      unbindWindowEscape()
      dirtyDiffVisible.set(false)
      window.removeEventListener('git-status-updated', onGitStatusUpdated)
      window.removeEventListener('git-branch-changed', onGitStatusUpdated)
      decorationIds = editor.deltaDecorations(decorationIds, [])
      peek.dispose()
    },
  }
}
