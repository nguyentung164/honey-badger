import type { editor as MonacoEditor } from 'monaco-editor'
import { useEffect, useRef } from 'react'
import {
  createDiffViewerPaneLabelHost,
  DIFF_VIEWER_PANE_LABEL_HOST_CLASS,
  syncDiffViewerPaneBadgeElement,
} from './diffViewerPaneLabel'

interface UseDiffViewerPaneLabelsOptions {
  enabled: boolean
  editorRef: React.RefObject<MonacoEditor.IStandaloneDiffEditor | null>
  editorMountEpoch?: number
  originalLabel: string
  modifiedLabel: string
  renderSideBySide: boolean
}

const RETRY_MS = 120
const MAX_RETRIES = 50

function getPaneWrapper(editor: MonacoEditor.IStandaloneCodeEditor): HTMLElement | null {
  const node = editor.getDomNode()
  if (!node) return null
  return (node.closest('.editor') as HTMLElement | null) ?? node.parentElement
}

function ensureLabelHost(paneWrapper: HTMLElement, side: 'original' | 'modified'): HTMLDivElement {
  const attr = `data-diff-pane-label-${side}`
  let host = paneWrapper.querySelector(`.${DIFF_VIEWER_PANE_LABEL_HOST_CLASS}[${attr}]`) as HTMLDivElement | null
  if (!host) {
    host = createDiffViewerPaneLabelHost()
    host.setAttribute(attr, 'true')
    paneWrapper.appendChild(host)
  }
  return host
}

export function useDiffViewerPaneLabels({
  enabled,
  editorRef,
  editorMountEpoch = 0,
  originalLabel,
  modifiedLabel,
  renderSideBySide,
}: UseDiffViewerPaneLabelsOptions) {
  const hostsRef = useRef<{ original: HTMLDivElement | null; modified: HTMLDivElement | null }>({
    original: null,
    modified: null,
  })

  useEffect(() => {
    let cancelled = false
    let retryTimer: number | undefined
    let retryCount = 0
    const disposables: MonacoEditor.IDisposable[] = []

    const removeHosts = () => {
      for (const host of [hostsRef.current.original, hostsRef.current.modified]) {
        host?.remove()
      }
      hostsRef.current = { original: null, modified: null }
    }

    const disposeListeners = () => {
      for (const d of disposables) d.dispose()
      disposables.length = 0
    }

    const sync = () => {
      const originalHost = hostsRef.current.original
      const modifiedHost = hostsRef.current.modified
      if (!originalHost || !modifiedHost) return

      if (!renderSideBySide) {
        originalHost.style.display = 'none'
        modifiedHost.style.display = 'none'
        return
      }

      originalHost.style.display = ''
      modifiedHost.style.display = ''

      const originalBadge = originalHost.firstElementChild as HTMLElement | null
      const modifiedBadge = modifiedHost.firstElementChild as HTMLElement | null
      if (originalBadge) syncDiffViewerPaneBadgeElement(originalBadge, originalLabel)
      if (modifiedBadge) syncDiffViewerPaneBadgeElement(modifiedBadge, modifiedLabel)
    }

    const attach = () => {
      disposeListeners()

      if (!enabled || !renderSideBySide) {
        removeHosts()
        return
      }

      const diffEditor = editorRef.current
      if (!diffEditor) {
        if (!cancelled && retryCount < MAX_RETRIES) {
          retryCount++
          retryTimer = window.setTimeout(attach, RETRY_MS)
        }
        return
      }

      const originalEditor = diffEditor.getOriginalEditor()
      const modifiedEditor = diffEditor.getModifiedEditor()
      const originalWrapper = getPaneWrapper(originalEditor)
      const modifiedWrapper = getPaneWrapper(modifiedEditor)
      if (!originalWrapper || !modifiedWrapper) {
        if (!cancelled && retryCount < MAX_RETRIES) {
          retryCount++
          retryTimer = window.setTimeout(attach, RETRY_MS)
        }
        return
      }

      const originalHost = ensureLabelHost(originalWrapper, 'original')
      const modifiedHost = ensureLabelHost(modifiedWrapper, 'modified')
      hostsRef.current = { original: originalHost, modified: modifiedHost }

      sync()

      disposables.push(
        diffEditor.onDidUpdateDiff(sync),
        originalEditor.onDidLayoutChange(sync),
        modifiedEditor.onDidLayoutChange(sync)
      )
    }

    attach()

    return () => {
      cancelled = true
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
      disposeListeners()
      removeHosts()
    }
  }, [enabled, renderSideBySide, editorRef, editorMountEpoch, originalLabel, modifiedLabel])
}
