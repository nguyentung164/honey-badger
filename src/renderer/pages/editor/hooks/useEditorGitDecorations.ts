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

function openTabPathsChanged(
  prev: Map<string, GitFileStatusCode>,
  next: Map<string, GitFileStatusCode>,
  openTabPaths: readonly string[]
): boolean {
  for (const path of openTabPaths) {
    if (prev.get(path) !== next.get(path)) return true
  }
  return false
}

type UseEditorGitDecorationsOptions = {
  openTabPaths: readonly string[]
  explorerActive: boolean
}

/** Shared git status for editor explorer + tab bar — event-driven (VS Code SCM provider). */
export function useEditorGitDecorations(repoCwd: string, options: UseEditorGitDecorationsOptions) {
  const { openTabPaths, explorerActive } = options
  const [fileStatuses, setFileStatuses] = useState<Map<string, GitFileStatusCode>>(() => new Map())
  const fileStatusesRef = useRef(fileStatuses)
  fileStatusesRef.current = fileStatuses
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openTabPathsRef = useRef(openTabPaths)
  const explorerActiveRef = useRef(explorerActive)
  openTabPathsRef.current = openTabPaths
  explorerActiveRef.current = explorerActive

  const applyFileStatuses = useCallback((next: Map<string, GitFileStatusCode>) => {
    const prev = fileStatusesRef.current
    if (gitStatusMapsEqual(prev, next)) return
    fileStatusesRef.current = next
    const shouldRender =
      explorerActiveRef.current || openTabPathsChanged(prev, next, openTabPathsRef.current)
    if (shouldRender) setFileStatuses(next)
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

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      void refreshGitDecorations()
    }, 600)
  }, [refreshGitDecorations])

  useEffect(() => {
    void refreshGitDecorations()

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
  }, [repoCwd, refreshGitDecorations, scheduleRefresh])

  useEffect(() => {
    setFileStatuses(fileStatusesRef.current)
  }, [explorerActive, openTabPaths.join('\0')])

  const getGitStatus = useCallback(
    (relativePath: string, isDir: boolean) => resolveExplorerGitStatus(relativePath, isDir, fileStatusesRef.current),
    [fileStatuses]
  )

  return { fileStatuses, getGitStatus, refreshGitDecorations }
}
