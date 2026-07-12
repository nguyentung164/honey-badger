import { useCallback, useEffect } from 'react'
import { clearPendingEditorOpen, type EditorOpenPayload, MAIN_SHELL_OPEN_EDITOR_EVENT, takePendingEditorOpen } from '@/lib/openEditor'
import type { OpenFileOptions } from '@/pages/editor/lib/editorWorkspaceTypes'

type UseEditorShellOpenRequestOptions = {
  repoCwd: string
  openFile: (relativePath: string, opts?: OpenFileOptions) => Promise<void>
}

export function useEditorShellOpenRequest({ repoCwd, openFile }: UseEditorShellOpenRequestOptions) {
  const processOpen = useCallback(
    (detail: EditorOpenPayload) => {
      const targetCwd = detail.cwd?.trim() || repoCwd
      if (!targetCwd) return
      clearPendingEditorOpen()
      void openFile(detail.filePath.replace(/\\/g, '/'), {
        pin: true,
        line: detail.line,
        column: detail.column,
        repoRoot: targetCwd,
      })
    },
    [openFile, repoCwd]
  )

  useEffect(() => {
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<EditorOpenPayload>).detail
      if (detail) processOpen(detail)
    }

    window.addEventListener(MAIN_SHELL_OPEN_EDITOR_EVENT, onEvent)

    const pending = takePendingEditorOpen()
    if (pending) processOpen(pending)

    return () => window.removeEventListener(MAIN_SHELL_OPEN_EDITOR_EVENT, onEvent)
  }, [processOpen])
}
