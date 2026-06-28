import type { editor as MonacoEditor } from 'monaco-editor'
import { useEffect, useRef } from 'react'
import {
  createDiffViewerPaneLabelHost,
  DIFF_VIEWER_PANE_LABEL_HOST_CLASS,
  getDiffEditorPaneElement,
  getDiffEditorRootElement,
  isDiffEditorShowingSideBySidePanes,
  syncDiffViewerPaneBadgeElement,
} from './diffViewerPaneLabel'

interface UseDiffViewerPaneLabelsOptions {
  enabled: boolean
  editorRef: React.RefObject<MonacoEditor.IStandaloneDiffEditor | null>
  editorMountEpoch?: number
  originalLabel: string
  modifiedLabel: string
}

const RETRY_MS = 120
const MAX_RETRIES = 50

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
      const diffEditor = editorRef.current
      const originalHost = hostsRef.current.original
      const modifiedHost = hostsRef.current.modified
      if (!diffEditor || !originalHost || !modifiedHost) return

      const showLabels = isDiffEditorShowingSideBySidePanes(diffEditor)
      if (!showLabels) {
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

      if (!enabled) {
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
      const originalWrapper = getDiffEditorPaneElement(diffEditor, 'original')
      const modifiedWrapper = getDiffEditorPaneElement(diffEditor, 'modified')
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

      const diffRoot = getDiffEditorRootElement(diffEditor)
      if (diffRoot) {
        const classObserver = new MutationObserver(() => {
          sync()
        })
        classObserver.observe(diffRoot, { attributes: true, attributeFilter: ['class'] })
        disposables.push({ dispose: () => classObserver.disconnect() })
      }

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
  }, [enabled, editorRef, editorMountEpoch, originalLabel, modifiedLabel])
}
