import * as monaco from 'monaco-editor'
import type { editor as MonacoEditor, IDisposable } from 'monaco-editor'
import { useEffect, useRef } from 'react'
import logger from '@/services/logger'
import { formatBlameHoverMessage, formatBlameInlineLabel } from './diffViewerBlameFormat'
import type { DiffViewerFileKind } from './diffViewerPayload'
import { DIFF_VIEWER_BLAME_LINE_DECORATIONS_WIDTH } from './diffViewerTypes'

interface BlameLine {
  line: number
  commit: string
  author: string
  date: string
}

interface UseDiffViewerBlameOptions {
  enabled: boolean
  isGit: boolean
  fileKind: DiffViewerFileKind
  filePath: string
  cwd?: string
  revision?: string
  isLoading?: boolean
  editorRef: React.RefObject<MonacoEditor.IStandaloneDiffEditor | null>
  editorMountEpoch?: number
  contentEpoch?: number
  lineDecorationsWidth?: number
}

const RETRY_MS = 120
const MAX_RETRIES = 50
const GUTTER_CLASS = 'diff-viewer-blame-gutter'
const ROW_CLASS = 'diff-viewer-blame-row'

function waitForDiffStable(diffEditor: MonacoEditor.IStandaloneDiffEditor): Promise<void> {
  if (diffEditor.getLineChanges() !== null) {
    return Promise.resolve()
  }
  return new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      sub.dispose()
      window.clearTimeout(timer)
      resolve()
    }
    const sub = diffEditor.onDidUpdateDiff(finish)
    const timer = window.setTimeout(finish, 2000)
  })
}

function waitForNextFrame(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => resolve())
  })
}

function isEditorReady(modifiedEditor: MonacoEditor.IStandaloneCodeEditor): boolean {
  const model = modifiedEditor.getModel()
  return Boolean(model && !model.isDisposed() && model.getLineCount() > 0)
}

function getOverlayHost(editor: MonacoEditor.IStandaloneCodeEditor): HTMLElement | null {
  const root = editor.getDomNode()
  if (!root) return null
  return (root.querySelector('.overflow-guard') as HTMLElement | null) ?? root
}

function lineViewportMetrics(
  editor: MonacoEditor.IStandaloneCodeEditor,
  lineNumber: number
): { top: number; height: number } | null {
  const pos = editor.getScrolledVisiblePosition({ lineNumber, column: 1 })
  if (pos) {
    return { top: pos.top, height: pos.height }
  }

  const model = editor.getModel()
  if (!model || lineNumber < 1 || lineNumber > model.getLineCount()) return null

  const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight)
  const scrollTop = editor.getScrollTop()
  const top = editor.getTopForLineNumber(lineNumber) - scrollTop
  const viewportHeight = editor.getLayoutInfo().height

  if (top + lineHeight < 0 || top > viewportHeight) return null
  return { top, height: lineHeight }
}

export function useDiffViewerBlame({
  enabled,
  isGit,
  fileKind,
  filePath,
  cwd,
  revision,
  isLoading = false,
  editorRef,
  editorMountEpoch = 0,
  contentEpoch = 0,
  lineDecorationsWidth = 10,
}: UseDiffViewerBlameOptions) {
  const blameByLineRef = useRef<Map<number, { label: string; title: string }>>(new Map())
  const gutterRootRef = useRef<HTMLDivElement | null>(null)
  const disposablesRef = useRef<IDisposable[]>([])
  const applyGenerationRef = useRef(0)

  useEffect(() => {
    const disposeListeners = () => {
      for (const d of disposablesRef.current) d.dispose()
      disposablesRef.current = []
    }

    const removeGutter = () => {
      gutterRootRef.current?.remove()
      gutterRootRef.current = null
    }

    if (!enabled || !isGit || fileKind !== 'text' || !filePath || isLoading || editorMountEpoch === 0) {
      disposeListeners()
      removeGutter()
      blameByLineRef.current = new Map()
      return
    }

    let cancelled = false
    let retryTimer: number | undefined
    let retryCount = 0
    const generation = ++applyGenerationRef.current

    const ensureGutterRoot = (modifiedEditor: MonacoEditor.IStandaloneCodeEditor): HTMLDivElement | null => {
      const host = getOverlayHost(modifiedEditor)
      if (!host) return null

      let root = gutterRootRef.current
      if (!root || !host.contains(root)) {
        root?.remove()
        root = document.createElement('div')
        root.className = GUTTER_CLASS
        root.setAttribute('aria-hidden', 'true')
        host.appendChild(root)
        gutterRootRef.current = root
      }
      return root
    }

    const paintGutter = (modifiedEditor: MonacoEditor.IStandaloneCodeEditor) => {
      const root = ensureGutterRoot(modifiedEditor)
      if (!root) return

      const layout = modifiedEditor.getLayoutInfo()
      const blameWidth = Math.max(layout.decorationsWidth, DIFF_VIEWER_BLAME_LINE_DECORATIONS_WIDTH)
      const blameByLine = blameByLineRef.current

      root.style.left = `${layout.decorationsLeft}px`
      root.style.width = `${blameWidth}px`
      root.style.height = `${layout.height}px`

      if (blameByLine.size === 0) {
        root.replaceChildren()
        return
      }

      const visibleRanges = modifiedEditor.getVisibleRanges()
      const lineNumbers = new Set<number>()
      for (const range of visibleRanges) {
        for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
          lineNumbers.add(line)
        }
      }

      const fragment = document.createDocumentFragment()
      for (const line of lineNumbers) {
        const entry = blameByLine.get(line)
        if (!entry) continue

        const metrics = lineViewportMetrics(modifiedEditor, line)
        if (!metrics) continue

        const row = document.createElement('div')
        row.className = ROW_CLASS
        row.title = entry.title
        row.style.top = `${metrics.top}px`
        row.style.height = `${metrics.height}px`
        row.style.lineHeight = `${metrics.height}px`
        row.textContent = entry.label
        fragment.appendChild(row)
      }
      root.replaceChildren(fragment)
    }

    const attachListeners = (modifiedEditor: MonacoEditor.IStandaloneCodeEditor) => {
      disposeListeners()
      const repaint = () => {
        if (!cancelled && generation === applyGenerationRef.current) {
          paintGutter(modifiedEditor)
        }
      }
      disposablesRef.current.push(
        modifiedEditor.onDidScrollChange(repaint),
        modifiedEditor.onDidLayoutChange(repaint)
      )
    }

    const applyBlame = () => {
      void (async () => {
        const diffEditor = editorRef.current
        if (!diffEditor) {
          if (!cancelled && retryCount < MAX_RETRIES) {
            retryCount++
            retryTimer = window.setTimeout(applyBlame, RETRY_MS)
          }
          return
        }
        if (cancelled || generation !== applyGenerationRef.current) return

        const modifiedEditor = diffEditor.getModifiedEditor()
        if (!isEditorReady(modifiedEditor)) {
          if (!cancelled && retryCount < MAX_RETRIES) {
            retryCount++
            retryTimer = window.setTimeout(applyBlame, RETRY_MS)
          }
          return
        }

        try {
          await waitForDiffStable(diffEditor)
        } catch (error) {
          logger.warning('[DiffViewer] waitForDiffStable failed before blame:', error)
        }

        await waitForNextFrame()
        await waitForNextFrame()

        if (cancelled || generation !== applyGenerationRef.current || !isEditorReady(modifiedEditor)) return

        const result = await window.api.git.blame(filePath, {
          ...(cwd ? { cwd } : {}),
          ...(revision ? { revision } : {}),
        })

        if (cancelled || generation !== applyGenerationRef.current || !isEditorReady(modifiedEditor)) return

        if (result?.status !== 'success' || !result.data?.lines?.length) {
          if (result?.status === 'error') {
            logger.warning('[DiffViewer] git blame failed:', result.message ?? 'unknown error', { filePath, cwd, revision })
          }
          blameByLineRef.current = new Map()
          removeGutter()
          return
        }

        const lineCount = modifiedEditor.getModel()?.getLineCount() ?? 0
        if (lineCount === 0) return

        const blameByLine = new Map<number, { label: string; title: string }>()
        for (const line of result.data.lines as BlameLine[]) {
          if (line.line < 1 || line.line > lineCount) continue
          const shortHash = line.commit === '0000000000000000000000000000000000000000' ? 'local' : line.commit.slice(0, 7)
          blameByLine.set(line.line, {
            label: formatBlameInlineLabel(line.author, line.date),
            title: formatBlameHoverMessage(shortHash, line.author, line.date),
          })
        }

        blameByLineRef.current = blameByLine
        attachListeners(modifiedEditor)
        paintGutter(modifiedEditor)
      })()
    }

    applyBlame()

    return () => {
      cancelled = true
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
      disposeListeners()
      removeGutter()
      blameByLineRef.current = new Map()
    }
  }, [
    enabled,
    isGit,
    fileKind,
    filePath,
    cwd,
    revision,
    isLoading,
    editorRef,
    editorMountEpoch,
    contentEpoch,
    lineDecorationsWidth,
  ])
}
