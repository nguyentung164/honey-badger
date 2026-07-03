import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitFileStatusCode } from '@/components/git/GitFileStatusBadge'
import {
  buildExplorerFileStatusMap,
  resolveExplorerGitStatus,
  type GitStatusPayload,
} from '@/pages/editor/explorer/explorerGitDecorations'

function gitStatusMapsEqual(
  left: Map<string, GitFileStatusCode>,
  right: Map<string, GitFileStatusCode>
): boolean {
  if (left.size !== right.size) return false
  for (const [path, status] of left) {
    if (right.get(path) !== status) return false
  }
  return true
}

/** Shared git status for editor explorer + tab bar (single poll per workbench). */
export function useEditorGitDecorations(repoCwd: string) {
  const [fileStatuses, setFileStatuses] = useState<Map<string, GitFileStatusCode>>(() => new Map())
  const fileStatusesRef = useRef(fileStatuses)
  fileStatusesRef.current = fileStatuses

  const applyFileStatuses = useCallback((next: Map<string, GitFileStatusCode>) => {
    if (gitStatusMapsEqual(fileStatusesRef.current, next)) return
    setFileStatuses(next)
  }, [])

  const refreshGitDecorations = useCallback(async () => {
    if (!repoCwd) {
      applyFileStatuses(new Map())
      return
    }
    try {
      const result = await window.api.git.status({ cwd: repoCwd })
      if (result?.status !== 'success' || !result.data) {
        applyFileStatuses(new Map())
        return
      }
      applyFileStatuses(buildExplorerFileStatusMap(result.data as GitStatusPayload))
    } catch {
      applyFileStatuses(new Map())
    }
  }, [applyFileStatuses, repoCwd])

  useEffect(() => {
    void refreshGitDecorations()

    const onGitStatusUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ cwd?: string }>).detail
      if (detail?.cwd && detail.cwd !== repoCwd) return
      void refreshGitDecorations()
    }

    window.addEventListener('git-status-updated', onGitStatusUpdated as EventListener)
    const intervalId = window.setInterval(() => void refreshGitDecorations(), 8_000)

    return () => {
      window.removeEventListener('git-status-updated', onGitStatusUpdated as EventListener)
      window.clearInterval(intervalId)
    }
  }, [repoCwd, refreshGitDecorations])

  const getGitStatus = useCallback(
    (relativePath: string, isDir: boolean) => resolveExplorerGitStatus(relativePath, isDir, fileStatuses),
    [fileStatuses]
  )

  return { fileStatuses, getGitStatus, refreshGitDecorations }
}
