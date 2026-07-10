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

export type FolderGitStatusGetter = (relativePath: string, isDir: boolean) => GitFileStatusCode | null

/**
 * Per-workspace-folder git decorations for the multi-root explorer.
 * VS Code registers one SCM provider per folder but only renders decorations for visible
 * (expanded) sections — `enabled` mirrors that: no `git status` call while a section is collapsed.
 */
export function useEditorFolderGitDecorations(repoCwd: string, enabled: boolean) {
  const [fileStatuses, setFileStatuses] = useState<Map<string, GitFileStatusCode>>(() => new Map())
  const fileStatusesRef = useRef(fileStatuses)
  fileStatusesRef.current = fileStatuses
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    if (!repoCwd || !enabled) return
    try {
      const result = await window.api.git.status({ cwd: repoCwd })
      if (result?.status !== 'success' || !result.data) {
        if (fileStatusesRef.current.size > 0) setFileStatuses(new Map())
        return
      }
      const next = buildExplorerFileStatusMap(result.data as GitStatusPayload)
      if (!gitStatusMapsEqual(fileStatusesRef.current, next)) setFileStatuses(next)
    } catch {
      if (fileStatusesRef.current.size > 0) setFileStatuses(new Map())
    }
  }, [repoCwd, enabled])

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      void refresh()
    }, 600)
  }, [refresh])

  useEffect(() => {
    if (!enabled || !repoCwd) return
    void refresh()

    const onGitStatusUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ cwd?: string }>).detail
      if (detail?.cwd && detail.cwd !== repoCwd) return
      scheduleRefresh()
    }
    const onBranchChanged = () => scheduleRefresh()

    window.addEventListener('git-status-updated', onGitStatusUpdated as EventListener)
    window.addEventListener('git-branch-changed', onBranchChanged)
    return () => {
      window.removeEventListener('git-status-updated', onGitStatusUpdated as EventListener)
      window.removeEventListener('git-branch-changed', onBranchChanged)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [enabled, repoCwd, refresh, scheduleRefresh])

  const getGitStatus = useCallback<FolderGitStatusGetter>(
    (relativePath, isDir) => resolveExplorerGitStatus(relativePath, isDir, fileStatusesRef.current),
    [fileStatuses]
  )

  return { getGitStatus, refresh }
}
