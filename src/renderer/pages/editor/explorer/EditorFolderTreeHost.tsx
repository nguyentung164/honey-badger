'use client'

import { useEffect, useRef } from 'react'
import { useProjectFileTree } from '@/pages/editor/hooks/useProjectFileTree'
import type { FileTreeRow } from '@/pages/editor/lib/flattenFileTree'

export type FolderTreeSnapshot = {
  repoCwd: string
  rows: FileTreeRow[]
  expandedPaths: ReadonlySet<string>
  loadingPaths: ReadonlySet<string>
  toggleExpand: (path: string) => void
  refresh: () => void
  ensurePathRevealed: (path: string) => Promise<void>
}

type EditorFolderTreeHostProps = {
  folderIndex: number
  repoCwd: string
  enabled: boolean
  onSnapshot: (folderIndex: number, snapshot: FolderTreeSnapshot | null) => void
}

export function EditorFolderTreeHost({ folderIndex, repoCwd, enabled, onSnapshot }: EditorFolderTreeHostProps) {
  const { rows, expandedPaths, loadingPaths, toggleExpand, refresh, ensurePathRevealed } = useProjectFileTree(enabled ? repoCwd : '')
  const onSnapshotRef = useRef(onSnapshot)
  onSnapshotRef.current = onSnapshot

  useEffect(() => {
    if (!enabled || !repoCwd) {
      onSnapshotRef.current(folderIndex, null)
      return
    }
    onSnapshotRef.current(folderIndex, {
      repoCwd,
      rows,
      expandedPaths,
      loadingPaths,
      toggleExpand,
      refresh,
      ensurePathRevealed,
    })
  }, [enabled, folderIndex, repoCwd, rows, expandedPaths, loadingPaths, toggleExpand, refresh, ensurePathRevealed])

  return null
}
