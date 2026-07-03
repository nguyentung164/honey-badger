import type { editor as MonacoEditor, IDisposable } from 'monaco-editor'
import { useEffect, useRef } from 'react'
import type { DiffViewerFileKind } from './diffViewerPayload'
import { buildMinimapDecorations, fingerprintLineChanges, getDiffViewerMinimapColors } from './diffViewerMinimap'

const APPLY_DEBOUNCE_MS = 64
const EDITOR_RETRY_MS = 120
const MAX_EDITOR_RETRIES = 25

interface UseDiffViewerMinimapHighlightsOptions {
  enabled: boolean
  fileKind: DiffViewerFileKind
  themeMode: 'light' | 'dark'
  editorRef: React.RefObject<MonacoEditor.IStandaloneDiffEditor | null>
  editorMountEpoch?: number
  contentEpoch?: number
}

function clearPaneDecorations(editor: MonacoEditor.IStandaloneCodeEditor | null, idsRef: React.MutableRefObject<string[]>) {
  if (!editor || idsRef.current.length === 0) return
  try {
    idsRef.current = editor.deltaDecorations(idsRef.current, [])
  } catch {
    idsRef.current = []
  }
}

export function useDiffViewerMinimapHighlights({
  enabled,
  fileKind,
  themeMode,
  editorRef,
  editorMountEpoch = 0,
  contentEpoch = 0,
}: UseDiffViewerMinimapHighlightsOptions) {
  const originalIdsRef = useRef<string[]>([])
  const modifiedIdsRef = useRef<string[]>([])
  const lastFingerprintRef = useRef('')

  useEffect(() => {
    lastFingerprintRef.current = ''

    const clearAll = () => {
      const diffEditor = editorRef.current
      if (!diffEditor) return
      clearPaneDecorations(diffEditor.getOriginalEditor(), originalIdsRef)
      clearPaneDecorations(diffEditor.getModifiedEditor(), modifiedIdsRef)
    }

    if (!enabled || fileKind !== 'text') {
      clearAll()
      return
    }

    let cancelled = false
    let retryTimer: number | undefined
    let retryCount = 0
    let debounceTimer: number | undefined
    let rafId: number | undefined
    let diffDisposable: IDisposable | null = null

    const applyHighlights = () => {
      const diffEditor = editorRef.current
      if (!diffEditor || cancelled) return

      const changes = diffEditor.getLineChanges()
      if (changes === null) return

      const fingerprint = fingerprintLineChanges(changes)
      if (fingerprint === lastFingerprintRef.current) return
      lastFingerprintRef.current = fingerprint

      const colors = getDiffViewerMinimapColors(themeMode)
      const originalEditor = diffEditor.getOriginalEditor()
      const modifiedEditor = diffEditor.getModifiedEditor()

      try {
        originalIdsRef.current = originalEditor.deltaDecorations(
          originalIdsRef.current,
          buildMinimapDecorations(changes, 'original', colors.removed)
        )
        modifiedIdsRef.current = modifiedEditor.deltaDecorations(
          modifiedIdsRef.current,
          buildMinimapDecorations(changes, 'modified', colors.inserted)
        )
      } catch {
        originalIdsRef.current = []
        modifiedIdsRef.current = []
      }
    }

    const scheduleApply = () => {
      if (cancelled) return
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = undefined
        if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
        debounceTimer = window.setTimeout(applyHighlights, APPLY_DEBOUNCE_MS)
      })
    }

    const attach = () => {
      const diffEditor = editorRef.current
      if (!diffEditor) {
        if (!cancelled && retryCount < MAX_EDITOR_RETRIES) {
          retryCount++
          retryTimer = window.setTimeout(attach, EDITOR_RETRY_MS)
        }
        return
      }

      diffDisposable = diffEditor.onDidUpdateDiff(scheduleApply)
      scheduleApply()
    }

    const bootTimer = window.setTimeout(attach, 0)

    return () => {
      cancelled = true
      window.clearTimeout(bootTimer)
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      diffDisposable?.dispose()
      clearAll()
    }
  }, [enabled, fileKind, themeMode, editorRef, editorMountEpoch, contentEpoch])
}
