'use client'

import { useEffect, useRef } from 'react'
import { IPC } from 'main/constants'
import type { FilesChangedPayload } from 'shared/filesChanged'
import { joinRepoPath } from 'shared/fileUri'
import { isCompareModelPath } from '@/pages/editor/lib/editorCompareModels'
import { patchQuickOpenFileIndex } from '@/pages/editor/lib/quickOpenFileIndex'
import {
  editorPathsEqual,
  normalizeEditorRelativePath,
  resolveExternalChangeForOpenTab,
  shouldIgnoreWorkspaceWatchEvent,
} from '@/pages/editor/lib/editorExternalFileSync'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'

type FileChangeConfirm = { relativePath: string; fileName: string }

type UseEditorExternalFileSyncOptions = {
  repoCwd: string
  activeTabId: string | null
  openTabPaths: readonly string[]
  onRequestReloadConfirm: (payload: FileChangeConfirm) => void
  onCloseTab: (tabId: string) => void
}

const SYNC_DEBOUNCE_MS = 150
const ACTIVE_TAB_RECHECK_DEBOUNCE_MS = 100

/**
 * VS Code: file watcher → update ITextModel in place (quiet disk sync).
 * Git staging refresh uses FILES_CHANGED separately (silent, no overlay).
 */
export function useEditorExternalFileSync({
  repoCwd,
  activeTabId,
  openTabPaths,
  onRequestReloadConfirm,
  onCloseTab,
}: UseEditorExternalFileSyncOptions) {
  const syncTabFromDiskQuiet = useEditorWorkspace(s => s.syncTabFromDiskQuiet)
  const reloadTabFromDiskIfChanged = useEditorWorkspace(s => s.reloadTabFromDiskIfChanged)

  const confirmRef = useRef(onRequestReloadConfirm)
  const closeTabRef = useRef(onCloseTab)
  const repoCwdRef = useRef(repoCwd)
  const openTabPathsRef = useRef(openTabPaths)
  const syncTimersRef = useRef<Map<string, number>>(new Map())
  const inflightRef = useRef<Set<string>>(new Set())
  confirmRef.current = onRequestReloadConfirm
  closeTabRef.current = onCloseTab
  repoCwdRef.current = repoCwd
  openTabPathsRef.current = openTabPaths

  useEffect(() => {
    return () => {
      for (const timer of syncTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      syncTimersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!repoCwd) return

    const runQuietSync = (normalized: string) => {
      if (inflightRef.current.has(normalized)) return
      inflightRef.current.add(normalized)
      void syncTabFromDiskQuiet(normalized).finally(() => {
        inflightRef.current.delete(normalized)
      })
    }

    const scheduleQuietSync = (normalized: string) => {
      const timers = syncTimersRef.current
      const prev = timers.get(normalized)
      if (prev) window.clearTimeout(prev)
      timers.set(
        normalized,
        window.setTimeout(() => {
          timers.delete(normalized)
          runQuietSync(normalized)
        }, SYNC_DEBOUNCE_MS)
      )
    }

    const findTab = (relativePath: string) => {
      const { tabs } = useEditorWorkspace.getState()
      return tabs.find(t => t.kind === 'text' && editorPathsEqual(t.relativePath, relativePath))
    }

    const handleExternalChange = (relativePath: string, event: 'add' | 'change' | 'unlink') => {
      if (shouldIgnoreWorkspaceWatchEvent(relativePath)) return

      const normalized = normalizeEditorRelativePath(relativePath)
      patchQuickOpenFileIndex(repoCwdRef.current, normalized, event)

      const tab = findTab(normalized)
      if (!tab) return
      const fileName = normalized.split('/').pop() ?? normalized

      const clearSyncTimer = () => {
        const pending = syncTimersRef.current.get(normalized)
        if (pending) {
          window.clearTimeout(pending)
          syncTimersRef.current.delete(normalized)
        }
      }

      if (event === 'unlink') {
        clearSyncTimer()
        if (tab.isDirty) {
          confirmRef.current({ relativePath: normalized, fileName })
        } else {
          closeTabRef.current(tab.id)
        }
        return
      }

      if (tab.isDirty) {
        clearSyncTimer()
        confirmRef.current({ relativePath: normalized, fileName })
        return
      }

      scheduleQuietSync(normalized)
    }

    const onFastOpenFileChanged = (event: { absolutePath: string }) => {
      const relative = resolveExternalChangeForOpenTab(
        repoCwdRef.current,
        event.absolutePath,
        openTabPathsRef.current
      )
      if (!relative) return
      handleExternalChange(relative, 'change')
    }

    const unsubFast =
      typeof window.api.system.on_editor_open_file_changed === 'function'
        ? window.api.system.on_editor_open_file_changed(onFastOpenFileChanged)
        : () => {}

    const hasFastLane = typeof window.api.system.on_editor_open_file_changed === 'function'
    if (!hasFastLane) {
      const onGlobalFilesChanged = (_event: unknown, detail?: FilesChangedPayload) => {
        if (detail?.source !== 'watcher' || !detail.changedPath) return
        const relative = resolveExternalChangeForOpenTab(
          repoCwdRef.current,
          detail.changedPath,
          openTabPathsRef.current
        )
        if (!relative) return
        handleExternalChange(relative, 'change')
      }
      window.api.on(IPC.FILES_CHANGED, onGlobalFilesChanged)
      return () => {
        unsubFast()
        window.api.removeListener(IPC.FILES_CHANGED, onGlobalFilesChanged)
      }
    }

    return () => {
      unsubFast()
    }
  }, [repoCwd, syncTabFromDiskQuiet])

  useEffect(() => {
    if (!repoCwd) return

    const absolutePaths = openTabPaths
      .filter(p => !isCompareModelPath(p) && !p.includes('(disk)') && !p.includes('(editor)'))
      .map(p => joinRepoPath(repoCwd, p))
    const syncTimer = window.setTimeout(() => {
      void window.api.system.set_editor_open_files({ paths: absolutePaths })
    }, 0)

    return () => {
      window.clearTimeout(syncTimer)
      void window.api.system.set_editor_open_files({ paths: [] })
    }
  }, [repoCwd, openTabPaths])

  useEffect(() => {
    if (!repoCwd || !activeTabId) return

    let recheckTimer: number | null = null

    const scheduleRecheckActiveTab = () => {
      if (recheckTimer) window.clearTimeout(recheckTimer)
      recheckTimer = window.setTimeout(() => {
        recheckTimer = null
        const tab = useEditorWorkspace.getState().tabs.find(t => t.id === activeTabId)
        if (tab?.kind === 'text' && tab.contentLoaded && !tab.isDirty) {
          void reloadTabFromDiskIfChanged(tab.relativePath)
        }
      }, ACTIVE_TAB_RECHECK_DEBOUNCE_MS)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRecheckActiveTab()
    }

    const unsubAppFocus =
      typeof window.api.system.on_app_window_focus === 'function'
        ? window.api.system.on_app_window_focus(scheduleRecheckActiveTab)
        : () => {}

    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      unsubAppFocus()
      document.removeEventListener('visibilitychange', onVisibility)
      if (recheckTimer) window.clearTimeout(recheckTimer)
    }
  }, [repoCwd, activeTabId, reloadTabFromDiskIfChanged])
}
