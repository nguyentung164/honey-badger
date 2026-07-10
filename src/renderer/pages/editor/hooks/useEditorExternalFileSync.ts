'use client'

import { useEffect, useRef } from 'react'
import { IPC } from 'main/constants'
import type { FilesChangedPayload } from 'shared/filesChanged'
import { joinRepoPath } from 'shared/fileUri'
import { isCompareModelPath } from '@/pages/editor/lib/editorCompareModels'
import { patchQuickOpenFileIndex } from '@/pages/editor/lib/quickOpenFileIndex'
import {
  type OpenTabResource,
  resolveOpenTabForAbsolutePath,
  shouldIgnoreWorkspaceWatchEvent,
} from '@/pages/editor/lib/editorExternalFileSync'
import { isPathSaving } from '@/pages/editor/lib/editorSavingPaths'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'

type FileChangeConfirm = { tabId: string; relativePath: string; repoRoot: string; fileName: string }

type UseEditorExternalFileSyncOptions = {
  /** Open text tabs across every workspace folder — resource identity for watcher matching. */
  openTabs: readonly OpenTabResource[]
  activeTabId: string | null
  onRequestReloadConfirm: (payload: FileChangeConfirm) => void
  onCloseTab: (tabId: string) => void
}

const SYNC_DEBOUNCE_MS = 150
const ACTIVE_TAB_RECHECK_DEBOUNCE_MS = 100

function tabKey(tab: OpenTabResource): string {
  return `${tab.repoRoot}\0${tab.relativePath}`
}

/**
 * VS Code: file watcher → update ITextModel in place (quiet disk sync).
 * Multi-root: events are matched to a tab by resource identity (repoRoot + path), so a change
 * in one workspace folder never reloads/prompts for a same-named file open from another folder.
 * Git staging refresh uses FILES_CHANGED separately (silent, no overlay).
 */
export function useEditorExternalFileSync({
  openTabs,
  activeTabId,
  onRequestReloadConfirm,
  onCloseTab,
}: UseEditorExternalFileSyncOptions) {
  const syncTabFromDiskQuiet = useEditorWorkspace(s => s.syncTabFromDiskQuiet)
  const reloadTabFromDiskIfChanged = useEditorWorkspace(s => s.reloadTabFromDiskIfChanged)
  const reconcileDirtyTabIfDiskMatchesBuffer = useEditorWorkspace(s => s.reconcileDirtyTabIfDiskMatchesBuffer)

  const confirmRef = useRef(onRequestReloadConfirm)
  const closeTabRef = useRef(onCloseTab)
  const openTabsRef = useRef(openTabs)
  const syncTimersRef = useRef<Map<string, number>>(new Map())
  const inflightRef = useRef<Set<string>>(new Set())
  confirmRef.current = onRequestReloadConfirm
  closeTabRef.current = onCloseTab
  openTabsRef.current = openTabs

  useEffect(() => {
    return () => {
      for (const timer of syncTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      syncTimersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const runQuietSync = (tab: OpenTabResource) => {
      const key = tabKey(tab)
      if (inflightRef.current.has(key)) return
      inflightRef.current.add(key)
      void syncTabFromDiskQuiet(tab.relativePath, undefined, tab.repoRoot).finally(() => {
        inflightRef.current.delete(key)
      })
    }

    const scheduleQuietSync = (tab: OpenTabResource) => {
      const timers = syncTimersRef.current
      const key = tabKey(tab)
      const prev = timers.get(key)
      if (prev) window.clearTimeout(prev)
      timers.set(
        key,
        window.setTimeout(() => {
          timers.delete(key)
          runQuietSync(tab)
        }, SYNC_DEBOUNCE_MS)
      )
    }

    const handleExternalChange = (absolutePath: string, event: 'add' | 'change' | 'unlink') => {
      if (shouldIgnoreWorkspaceWatchEvent(absolutePath)) return

      const tab = resolveOpenTabForAbsolutePath(absolutePath, openTabsRef.current)
      if (!tab) return

      const fileName = tab.relativePath.split('/').pop() ?? tab.relativePath
      const key = tabKey(tab)

      const clearSyncTimer = () => {
        const pending = syncTimersRef.current.get(key)
        if (pending) {
          window.clearTimeout(pending)
          syncTimersRef.current.delete(key)
        }
      }

      patchQuickOpenFileIndex(tab.repoRoot, tab.relativePath, event)

      const current = () => useEditorWorkspace.getState().tabs.find(t => t.id === tab.tabId)

      if (event === 'unlink') {
        clearSyncTimer()
        if (current()?.isDirty) {
          confirmRef.current({ tabId: tab.tabId, relativePath: tab.relativePath, repoRoot: tab.repoRoot, fileName })
        } else {
          closeTabRef.current(tab.tabId)
        }
        return
      }

      if (current()?.isDirty) {
        clearSyncTimer()
        if (isPathSaving(tab.relativePath)) return
        void reconcileDirtyTabIfDiskMatchesBuffer(tab.tabId, tab.relativePath).then(reconciled => {
          if (reconciled) return
          if (!current()?.isDirty) return
          confirmRef.current({ tabId: tab.tabId, relativePath: tab.relativePath, repoRoot: tab.repoRoot, fileName })
        })
        return
      }

      scheduleQuietSync(tab)
    }

    const onFastOpenFileChanged = (event: { absolutePath: string }) => {
      handleExternalChange(event.absolutePath, 'change')
    }

    const unsubFast =
      typeof window.api.system.on_editor_open_file_changed === 'function'
        ? window.api.system.on_editor_open_file_changed(onFastOpenFileChanged)
        : () => {}

    const hasFastLane = typeof window.api.system.on_editor_open_file_changed === 'function'
    if (!hasFastLane) {
      const onGlobalFilesChanged = (_event: unknown, detail?: FilesChangedPayload) => {
        if (detail?.source !== 'watcher' || !detail.changedPath) return
        handleExternalChange(detail.changedPath, 'change')
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
  }, [syncTabFromDiskQuiet, reconcileDirtyTabIfDiskMatchesBuffer])

  useEffect(() => {
    const absolutePaths = openTabs
      .filter(t => t.repoRoot && !isCompareModelPath(t.relativePath) && !t.relativePath.includes('(disk)') && !t.relativePath.includes('(editor)'))
      .map(t => joinRepoPath(t.repoRoot, t.relativePath))
    const syncTimer = window.setTimeout(() => {
      void window.api.system.set_editor_open_files({ paths: absolutePaths })
    }, 0)

    return () => {
      window.clearTimeout(syncTimer)
      void window.api.system.set_editor_open_files({ paths: [] })
    }
  }, [openTabs])

  useEffect(() => {
    if (!activeTabId) return

    let recheckTimer: number | null = null

    const scheduleRecheckActiveTab = () => {
      if (recheckTimer) window.clearTimeout(recheckTimer)
      recheckTimer = window.setTimeout(() => {
        recheckTimer = null
        const tab = useEditorWorkspace.getState().tabs.find(t => t.id === activeTabId)
        if (tab?.kind === 'text' && tab.contentLoaded && !tab.isDirty) {
          void reloadTabFromDiskIfChanged(tab.relativePath, tab.repoRoot)
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
  }, [activeTabId, reloadTabFromDiskIfChanged])
}
