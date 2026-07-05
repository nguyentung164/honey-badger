import { useCallback, useEffect } from 'react'
import {
  clearPendingEditorOpen,
  MAIN_SHELL_OPEN_EDITOR_EVENT,
  type EditorOpenPayload,
  takePendingEditorOpen,
} from '@/lib/openEditor'
import type { OpenFileOptions } from '@/pages/editor/lib/editorWorkspaceTypes'
import { normalizeEditorRepoKey } from '@/pages/editor/lib/editorSessionPersist'

type UseEditorShellOpenRequestOptions = {
  repoCwd: string
  openFile: (relativePath: string, opts?: OpenFileOptions) => Promise<void>
}

export function useEditorShellOpenRequest({ repoCwd, openFile }: UseEditorShellOpenRequestOptions) {
  const processOpen = useCallback(
    (detail: EditorOpenPayload) => {
      if (!repoCwd) return
      const targetCwd = detail.cwd?.trim() || repoCwd
      if (normalizeEditorRepoKey(targetCwd) !== normalizeEditorRepoKey(repoCwd)) return
      clearPendingEditorOpen()
      void openFile(detail.filePath.replace(/\\/g, '/'), {
        pin: true,
        line: detail.line,
        column: detail.column,
      })
    },
    [openFile, repoCwd]
  )

  useEffect(() => {
    if (!repoCwd) return

    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<EditorOpenPayload>).detail
      if (detail) processOpen(detail)
    }

    window.addEventListener(MAIN_SHELL_OPEN_EDITOR_EVENT, onEvent)

    const pending = takePendingEditorOpen()
    if (pending) processOpen(pending)

    return () => window.removeEventListener(MAIN_SHELL_OPEN_EDITOR_EVENT, onEvent)
  }, [processOpen, repoCwd])
}
