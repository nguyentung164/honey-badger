import { useCallback, useState } from 'react'
import {
  fetchDiffViewerFilesFromGit,
  normalizeGitPath,
  pathsEqual,
  resolveDiffViewerFilesRefresh,
  type DiffViewerFilesRefreshResult,
} from './diffViewerGitFiles'
import type { DiffViewerFileEntry, DiffViewerLoadPayload } from './diffViewerPayload'
import { refreshDiffViewerFileList, type DiffViewerRefreshOutcome } from './diffViewerRefresh'

export function useDiffViewerFileNav(initialFiles?: DiffViewerFileEntry[], initialIndex = 0) {
  const [files, setFiles] = useState<DiffViewerFileEntry[]>(initialFiles ?? [])
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, initialIndex))

  const activeFile = files[activeIndex]

  const applyFilesRefresh = useCallback((resolved: DiffViewerFilesRefreshResult) => {
    setFiles(resolved.files)
    if (resolved.currentInList) {
      setActiveIndex(resolved.activeIndex)
    } else if (resolved.files.length === 0) {
      setActiveIndex(0)
    } else {
      setActiveIndex(prev => Math.min(prev, resolved.files.length - 1))
    }
    return resolved
  }, [])

  const initFiles = useCallback((nextFiles: DiffViewerFileEntry[] | undefined, nextIndex?: number) => {
    if (!nextFiles?.length) {
      setFiles([])
      setActiveIndex(0)
      return
    }
    const idx = Math.min(Math.max(0, nextIndex ?? 0), nextFiles.length - 1)
    setFiles(nextFiles)
    setActiveIndex(idx)
  }, [])

  const goToFile = useCallback(
    (index: number, fileCount?: number) => {
      const len = fileCount ?? files.length
      if (index < 0 || index >= len) return false
      setActiveIndex(index)
      return true
    },
    [files.length]
  )

  const goPrev = useCallback(() => goToFile(activeIndex - 1), [activeIndex, goToFile])
  const goNext = useCallback(() => goToFile(activeIndex + 1), [activeIndex, goToFile])

  const updateStagingState = useCallback((filePath: string, stagingState: 'staged' | 'unstaged') => {
    setFiles(prev => prev.map(f => (pathsEqual(f.filePath, filePath) ? { ...f, stagingState } : f)))
  }, [])

  const setActiveEntryStagingState = useCallback(
    (index: number, filePath: string, stagingState: 'staged' | 'unstaged') => {
      setFiles(prev => {
        if (index < 0 || index >= prev.length) return prev
        return prev.map((f, i) =>
          i === index && pathsEqual(f.filePath, filePath) ? { ...f, stagingState } : f
        )
      })
    },
    []
  )

  const refreshFilesFromGit = useCallback(
    async (
      cwd: string,
      currentFilePath: string,
      currentStagingState?: 'staged' | 'unstaged'
    ): Promise<DiffViewerFilesRefreshResult | null> => {
      const nextFiles = await fetchDiffViewerFilesFromGit(cwd)
      if (nextFiles === null) return null

      const resolved = resolveDiffViewerFilesRefresh(
        nextFiles,
        normalizeGitPath(currentFilePath),
        activeIndex,
        currentStagingState
      )
      return applyFilesRefresh(resolved)
    },
    [activeIndex, applyFilesRefresh]
  )

  const refreshFromContext = useCallback(
    async (
      ctx: DiffViewerLoadPayload,
      currentStagingState?: 'staged' | 'unstaged'
    ): Promise<DiffViewerRefreshOutcome | null> => {
      const outcome = await refreshDiffViewerFileList(ctx, activeIndex, currentStagingState)
      if (!outcome) return null
      applyFilesRefresh(outcome.refreshed)
      return outcome
    },
    [activeIndex, applyFilesRefresh]
  )

  return {
    files,
    setFiles,
    activeIndex,
    activeFile,
    initFiles,
    goToFile,
    goPrev,
    goNext,
    updateStagingState,
    setActiveEntryStagingState,
    refreshFilesFromGit,
    refreshFromContext,
    hasMultipleFiles: files.length > 1,
  }
}
