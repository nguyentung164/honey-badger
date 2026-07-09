'use client'

import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import toast from '@/components/ui-elements/Toast'
import {
  clearExplorerClipboard,
  getExplorerClipboard,
  isInvalidCutPasteTarget,
  isSameExplorerPath,
  joinRelativePath,
  parentRelativeDir,
  pasteDestinationPath,
  setExplorerClipboard,
} from '@/pages/editor/explorer/explorerClipboard'
import type { ExplorerInlineEdit } from '@/pages/editor/explorer/explorerDisplayRows'
import { type ExplorerOpCallbacks, ExplorerUndoStack } from '@/pages/editor/explorer/explorerUndoStack'
import { joinRepoPath } from '@/pages/editor/lsp/documentUri'

type UseExplorerFileOperationsOptions = {
  repoCwd: string
  onOpenFile: (relativePath: string, opts?: { preview?: boolean; pin?: boolean }) => void
  onOpenCompare?: (leftPath: string, rightPath: string) => void
  onRefresh: () => void
  onPathRenamed?: (from: string, to: string) => void
  onPathDeleted?: (relativePath: string, isDir: boolean) => void
  onOpenInTerminal?: (absoluteCwd: string) => void
  ensureParentExpanded: (parentDir: string) => Promise<void>
  setInlineEdit: (edit: ExplorerInlineEdit | null) => void
  setDeleteTarget: (targets: Array<{ relativePath: string; isDir: boolean; name: string }> | null) => void
}

export function useExplorerFileOperations({
  repoCwd,
  onOpenFile,
  onOpenCompare,
  onRefresh,
  onPathRenamed,
  onPathDeleted,
  onOpenInTerminal,
  ensureParentExpanded,
  setInlineEdit,
  setDeleteTarget,
}: UseExplorerFileOperationsOptions) {
  const { t } = useTranslation()
  const undoStackRef = useRef(new ExplorerUndoStack())
  const suppressMenuFocusRestoreRef = useRef(false)
  const suppressMenuFocusRestoreTimerRef = useRef<number | undefined>(undefined)

  const armInlineEditFocus = useCallback(() => {
    suppressMenuFocusRestoreRef.current = true
    if (suppressMenuFocusRestoreTimerRef.current !== undefined) {
      window.clearTimeout(suppressMenuFocusRestoreTimerRef.current)
    }
    suppressMenuFocusRestoreTimerRef.current = window.setTimeout(() => {
      suppressMenuFocusRestoreRef.current = false
      suppressMenuFocusRestoreTimerRef.current = undefined
    }, 500)
  }, [])

  const consumeSuppressMenuFocusRestore = useCallback(() => {
    if (!suppressMenuFocusRestoreRef.current) return false
    suppressMenuFocusRestoreRef.current = false
    if (suppressMenuFocusRestoreTimerRef.current !== undefined) {
      window.clearTimeout(suppressMenuFocusRestoreTimerRef.current)
      suppressMenuFocusRestoreTimerRef.current = undefined
    }
    return true
  }, [])

  const opCallbacksRef = useRef<ExplorerOpCallbacks>({
    repoCwd,
    onPathRenamed,
    onPathDeleted,
    onRefresh,
  })
  opCallbacksRef.current = { repoCwd, onPathRenamed, onPathDeleted, onRefresh }

  const commitRename = useCallback(
    async (relativePath: string, nextName: string) => {
      const trimmed = nextName.trim()
      const currentName = relativePath.split('/').pop() ?? relativePath
      if (!trimmed || trimmed === currentName) return false

      const parent = parentRelativeDir(relativePath)
      const to = joinRelativePath(parent, trimmed)
      if (isSameExplorerPath(relativePath, to)) return false

      const destKind = await window.api.system.get_path_entry_kind({ relativePath: to, cwd: repoCwd })
      if (destKind !== 'missing') {
        toast.error(t('editor.explorerMenu.pasteTargetExists'))
        return false
      }

      const result = await window.api.system.rename_path({ from: relativePath, to, cwd: repoCwd })
      if (!result.success) {
        toast.error(result.error ?? t('editor.explorerMenu.renameFailed'))
        return false
      }

      undoStackRef.current.push({ kind: 'rename', from: relativePath, to })
      onPathRenamed?.(relativePath, to)
      onRefresh()
      return true
    },
    [onPathRenamed, onRefresh, repoCwd, t]
  )

  const commitCreate = useCallback(
    async (parentDir: string, name: string, createKind: 'file' | 'directory') => {
      const trimmed = name.trim()
      if (!trimmed) return false

      const relativePath = joinRelativePath(parentDir, trimmed)
      const exists = await window.api.system.get_path_entry_kind({ relativePath, cwd: repoCwd })
      if (exists !== 'missing') {
        toast.error(t('editor.explorerMenu.pasteTargetExists'))
        return false
      }

      const result =
        createKind === 'directory' ? await window.api.system.create_dir(relativePath, { cwd: repoCwd }) : await window.api.system.write_file(relativePath, '', { cwd: repoCwd })

      if (!result.success) {
        toast.error(result.error ?? t('editor.explorerMenu.createFailed'))
        return false
      }

      undoStackRef.current.push({ kind: 'create', path: relativePath, isDir: createKind === 'directory' })
      onRefresh()
      if (createKind === 'file') onOpenFile(relativePath, { pin: true })
      return true
    },
    [onOpenFile, onRefresh, repoCwd, t]
  )

  const executeDelete = useCallback(
    async (relativePath: string, isDir: boolean) => {
      if (isDir) {
        const staged = await window.api.system.stage_path_for_undo(relativePath, { cwd: repoCwd })
        if (!staged.success || !staged.stagingId) {
          toast.error(staged.error ?? t('editor.explorerMenu.deleteFailed'))
          return
        }
        const result = await window.api.system.delete_path(relativePath, { cwd: repoCwd })
        if (!result.success) {
          toast.error(result.error ?? t('editor.explorerMenu.deleteFailed'))
          return
        }
        undoStackRef.current.push({ kind: 'delete-dir', path: relativePath, stagingId: staged.stagingId })
      } else {
        let content = ''
        try {
          content = await window.api.system.read_file(relativePath, { cwd: repoCwd })
        } catch {
          content = ''
        }
        const result = await window.api.system.delete_path(relativePath, { cwd: repoCwd })
        if (!result.success) {
          toast.error(result.error ?? t('editor.explorerMenu.deleteFailed'))
          return
        }
        undoStackRef.current.push({ kind: 'delete-file', path: relativePath, content })
      }

      onPathDeleted?.(relativePath, isDir)
      onRefresh()
    },
    [onPathDeleted, onRefresh, repoCwd, t]
  )

  const startRename = useCallback(
    (relativePath: string) => {
      armInlineEditFocus()
      const currentName = relativePath.split('/').pop() ?? relativePath
      setInlineEdit({ mode: 'rename', targetPath: relativePath, value: currentName })
    },
    [armInlineEditFocus, setInlineEdit]
  )

  const startCreateFile = useCallback(
    async (parentDir: string) => {
      armInlineEditFocus()
      await ensureParentExpanded(parentDir)
      setInlineEdit({
        mode: 'create',
        parentDir,
        createKind: 'file',
        sessionId: crypto.randomUUID(),
        value: '',
      })
    },
    [armInlineEditFocus, ensureParentExpanded, setInlineEdit]
  )

  const startCreateFolder = useCallback(
    async (parentDir: string) => {
      armInlineEditFocus()
      await ensureParentExpanded(parentDir)
      setInlineEdit({
        mode: 'create',
        parentDir,
        createKind: 'directory',
        sessionId: crypto.randomUUID(),
        value: '',
      })
    },
    [armInlineEditFocus, ensureParentExpanded, setInlineEdit]
  )

  const executeDeleteMany = useCallback(
    async (targets: Array<{ relativePath: string; isDir: boolean }>) => {
      for (const target of targets) {
        await executeDelete(target.relativePath, target.isDir)
      }
    },
    // executeDelete is stable enough within hook; eslint may warn
    [executeDelete]
  )

  const requestDelete = useCallback(
    (targets: Array<{ relativePath: string; isDir: boolean; name: string }>) => {
      if (targets.length === 0) return
      setDeleteTarget(targets)
    },
    [setDeleteTarget]
  )

  const requestDeleteOne = useCallback(
    (relativePath: string, isDir: boolean) => {
      const name = relativePath.split('/').pop() ?? relativePath
      requestDelete([{ relativePath, isDir, name }])
    },
    [requestDelete]
  )

  const revealInOsExplorer = useCallback(
    (relativePath: string) => {
      void window.api.system.reveal_in_file_explorer(joinRepoPath(repoCwd, relativePath))
    },
    [repoCwd]
  )

  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        toast.success(t('appLogs.copySuccess'))
      } catch {
        toast.error(t('appLogs.copyError'))
      }
    },
    [t]
  )

  const copyPath = useCallback((relativePath: string) => void copyToClipboard(joinRepoPath(repoCwd, relativePath)), [copyToClipboard, repoCwd])

  const copyRelativePath = useCallback((relativePath: string) => void copyToClipboard(relativePath), [copyToClipboard])

  const cut = useCallback(
    (paths: string | string[]) => {
      const list = Array.isArray(paths) ? paths : [paths]
      setExplorerClipboard({ paths: list, cut: true, repoCwd })
    },
    [repoCwd]
  )

  const copy = useCallback(
    (paths: string | string[]) => {
      const list = Array.isArray(paths) ? paths : [paths]
      setExplorerClipboard({ paths: list, cut: false, repoCwd })
    },
    [repoCwd]
  )

  const canPasteInto = useCallback(
    (_targetDir: string) => {
      const clip = getExplorerClipboard()
      return Boolean(clip && clip.repoCwd === repoCwd && clip.paths.length > 0)
    },
    [repoCwd]
  )

  const pasteInto = useCallback(
    async (targetDir: string) => {
      const clip = getExplorerClipboard()
      if (!clip || clip.repoCwd !== repoCwd || clip.paths.length === 0) {
        toast.error(t('editor.explorerMenu.pasteEmpty'))
        return
      }

      const moves: Array<{ from: string; to: string }> = []
      const copies: Array<{ from: string; to: string }> = []

      for (const src of clip.paths) {
        const dest = pasteDestinationPath(targetDir, src)

        if (clip.cut) {
          if (isSameExplorerPath(src, dest)) continue
          if (isInvalidCutPasteTarget(src, targetDir)) {
            toast.error(t('editor.explorerMenu.pasteIntoSelf'))
            return
          }
        }

        const destKind = await window.api.system.get_path_entry_kind({ relativePath: dest, cwd: repoCwd })
        if (destKind !== 'missing') {
          if (clip.cut && isSameExplorerPath(src, dest)) continue
          toast.error(t('editor.explorerMenu.pasteTargetExists'))
          return
        }

        if (clip.cut) {
          const result = await window.api.system.rename_path({ from: src, to: dest, cwd: repoCwd })
          if (!result.success) {
            toast.error(result.error ?? t('editor.explorerMenu.pasteFailed'))
            return
          }
          moves.push({ from: src, to: dest })
        } else {
          const result = await window.api.system.copy_path({ from: src, to: dest, cwd: repoCwd })
          if (!result.success) {
            toast.error(result.error ?? t('editor.explorerMenu.pasteFailed'))
            return
          }
          copies.push({ from: src, to: dest })
        }
      }

      if (clip.cut) {
        for (const move of moves) onPathRenamed?.(move.from, move.to)
        undoStackRef.current.push({ kind: 'move', from: moves[0].from, to: moves[0].to })
        clearExplorerClipboard()
      } else if (copies.length > 0) {
        undoStackRef.current.push({ kind: 'copy', items: copies })
      }

      onRefresh()
    },
    [onPathRenamed, onRefresh, repoCwd, t]
  )

  const openInTerminal = useCallback(
    (relativePath: string, isDir: boolean) => {
      const relativeDir = isDir ? relativePath : parentRelativeDir(relativePath)
      const absolute = relativeDir ? joinRepoPath(repoCwd, relativeDir) : repoCwd
      onOpenInTerminal?.(absolute)
    },
    [onOpenInTerminal, repoCwd]
  )

  const compareSelected = useCallback(
    (leftPath: string, rightPath: string) => {
      onOpenCompare?.(leftPath, rightPath)
    },
    [onOpenCompare]
  )

  const undo = useCallback(async () => {
    await undoStackRef.current.undo(opCallbacksRef.current)
  }, [])

  const redo = useCallback(async () => {
    await undoStackRef.current.redo(opCallbacksRef.current)
  }, [])

  const canUndo = useCallback(() => undoStackRef.current.canUndo(), [])
  const canRedo = useCallback(() => undoStackRef.current.canRedo(), [])

  return {
    commitRename,
    commitCreate,
    executeDelete,
    executeDeleteMany,
    startRename,
    startCreateFile,
    startCreateFolder,
    requestDelete,
    requestDeleteOne,
    revealInOsExplorer,
    copyPath,
    copyRelativePath,
    cut,
    copy,
    canPasteInto,
    pasteInto,
    openInTerminal,
    compareSelected,
    undo,
    redo,
    canUndo,
    canRedo,
    consumeSuppressMenuFocusRestore,
  }
}

export type ExplorerFileOperations = ReturnType<typeof useExplorerFileOperations>
