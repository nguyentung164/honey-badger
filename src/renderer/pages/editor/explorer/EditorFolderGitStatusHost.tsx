'use client'

import { useEffect, useRef } from 'react'
import {
  useEditorFolderGitDecorations,
  type FolderGitStatusGetter,
} from '@/pages/editor/hooks/useEditorFolderGitDecorations'

export type FolderGitStatusSnapshot = {
  getGitStatus: FolderGitStatusGetter
  refresh: () => void | Promise<void>
}

type EditorFolderGitStatusHostProps = {
  folderIndex: number
  repoCwd: string
  enabled: boolean
  onSnapshot: (folderIndex: number, snapshot: FolderGitStatusSnapshot | null) => void
}

/** Mounted once per workspace folder — lazily fetches git status only while the section is expanded. */
export function EditorFolderGitStatusHost({ folderIndex, repoCwd, enabled, onSnapshot }: EditorFolderGitStatusHostProps) {
  const { getGitStatus, refresh } = useEditorFolderGitDecorations(repoCwd, enabled)
  const onSnapshotRef = useRef(onSnapshot)
  onSnapshotRef.current = onSnapshot

  useEffect(() => {
    if (!enabled) {
      onSnapshotRef.current(folderIndex, null)
      return
    }
    onSnapshotRef.current(folderIndex, { getGitStatus, refresh })
  }, [enabled, folderIndex, getGitStatus, refresh])

  return null
}
