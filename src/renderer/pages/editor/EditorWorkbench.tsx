'use client'

import { lazy, Suspense, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import { languageIdForLsp } from '@/lib/monacoLanguage'
import { EditorCloseConfirm } from '@/pages/editor/EditorCloseConfirm'
import { EditorFileChangeDialog } from '@/pages/editor/EditorFileChangeDialog'
import { EditorGoToLineDialog } from '@/pages/editor/EditorGoToLineDialog'
import { EditorLargeFileDialog } from '@/pages/editor/EditorLargeFileDialog'
import type { OpenFileOptions } from '@/pages/editor/lib/editorWorkspaceTypes'
import { EditorQuickOpen } from '@/pages/editor/EditorQuickOpen'
import { EditorSidebar } from '@/pages/editor/EditorSidebar'
import { EditorFileBreadcrumbs } from '@/pages/editor/editor-area/EditorFileBreadcrumbs'
import { EditorStatusBar } from '@/pages/editor/editor-area/EditorStatusBar'
import { EditorTabBar } from '@/pages/editor/editor-area/EditorTabBar'
import type { EditorTabMenuActions } from '@/pages/editor/editor-area/EditorTabContextMenu'
import { EditorTabPane } from '@/pages/editor/editor-area/EditorTabPane'
import { useEditorGitDecorations } from '@/pages/editor/hooks/useEditorGitDecorations'
import { useEditorLspStatusBar } from '@/pages/editor/hooks/useEditorLspStatusBar'
import { useEditorSettings } from '@/pages/editor/hooks/useEditorSettings'
import { type EditorSidebarView, readEditorSidebarView, writeEditorSidebarView } from '@/pages/editor/hooks/useEditorSidebarView'
import { EDITOR_MAIN_PANEL_ID, EDITOR_SIDEBAR_PANEL_ID, editorSidebarMaxSize, editorSidebarMinSize, useEditorSidebarWidth } from '@/pages/editor/hooks/useEditorSidebarWidth'
import { useActiveTabStatus, useEditorTabSummaries } from '@/pages/editor/hooks/useEditorTabSelectors'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'
import { type EditorCursorPosition, editorCommandBridge, runEditorAction } from '@/pages/editor/lib/editorCommandBridge'
import { getEditorTabActivationOrder } from '@/pages/editor/lib/editorTabActivation'
import { patchQuickOpenFileIndex, prewarmQuickOpenFileIndex } from '@/pages/editor/lib/quickOpenFileIndex'
import { scheduleBackgroundWork } from '@/pages/editor/lib/scheduleBackgroundWork'
import { scheduleEditorTabPrefetch } from '@/pages/editor/hooks/useEditorTabPrefetch'
import { useEditorTabCloseQueue } from '@/pages/editor/lib/useEditorTabCloseQueue'
import { joinRepoPath } from '@/pages/editor/lsp/documentUri'
import { editorLanguageService, type OrganizeImportsResult } from '@/pages/editor/lsp/EditorLanguageService'

const LazyExplorerPanel = lazy(() => import('@/pages/editor/explorer/EditorExplorerPanel').then(m => ({ default: m.EditorExplorerPanel })))
const LazySearchPanel = lazy(() => import('@/pages/editor/search/EditorSearchPanel').then(m => ({ default: m.EditorSearchPanel })))

type EditorWorkbenchProps = {
  repoCwd?: string
  onRegisterLayoutLeave?: (handler: (action: () => void) => void) => void
  onTerminalToggle?: () => void
  onOpenInTerminal?: (absoluteCwd: string) => void
}

export function EditorWorkbench({ repoCwd = '', onRegisterLayoutLeave, onTerminalToggle, onOpenInTerminal }: EditorWorkbenchProps) {
  const { t } = useTranslation()
  const [sidebarView, setSidebarView] = useState<EditorSidebarView>(() => readEditorSidebarView())
  const [closeConfirm, setCloseConfirm] = useState<{
    tabId: string
    fileName: string
    onProceed?: () => void
    queueMode?: boolean
  } | null>(null)
  const [fileChangeConfirm, setFileChangeConfirm] = useState<{ relativePath: string; fileName: string } | null>(null)
  const [largeFileConfirm, setLargeFileConfirm] = useState<{
    relativePath: string
    fileName: string
    size: number
    opts?: OpenFileOptions
  } | null>(null)
  const [quickOpen, setQuickOpen] = useState(false)
  const [goToLineOpen, setGoToLineOpen] = useState(false)
  const [cursor, setCursor] = useState<EditorCursorPosition | null>(null)
  const explorerRevealSeqRef = useRef(0)
  const [explorerRevealRequest, setExplorerRevealRequest] = useState<{ path: string; seq: number } | null>(null)

  const autoSave = useEditorSettings(s => s.autoSave)
  const autoSaveDelayMs = useEditorSettings(s => s.autoSaveDelayMs)
  const insertSpaces = useEditorSettings(s => s.insertSpaces)
  const tabSize = useEditorSettings(s => s.tabSize)
  const breadcrumbs = useEditorSettings(s => s.breadcrumbs)

  const workspaceLabel = useMemo(
    () =>
      repoCwd
        ? (repoCwd
          .replace(/[/\\]+$/, '')
          .split(/[/\\]/)
          .pop() ?? repoCwd)
        : '',
    [repoCwd]
  )

  const tabSummaries = useEditorTabSummaries()
  const openTabPaths = useMemo(() => tabSummaries.map(t => t.relativePath), [tabSummaries])
  const { getGitStatus, refreshGitDecorations } = useEditorGitDecorations(repoCwd, {
    openTabPaths,
    explorerActive: sidebarView === 'explorer',
  })
  const recentQuickOpenPaths = useMemo(() => {
    const tabs = useEditorWorkspace.getState().tabs.filter(t => t.kind !== 'compare')
    const order = getEditorTabActivationOrder()
    const pathById = new Map(tabs.map(t => [t.id, t.relativePath]))
    const seen = new Set<string>()
    const paths: string[] = []

    for (const id of order) {
      const path = pathById.get(id)
      if (path && !seen.has(path)) {
        seen.add(path)
        paths.push(path)
      }
    }

    for (const tab of tabs) {
      if (!seen.has(tab.relativePath)) {
        seen.add(tab.relativePath)
        paths.push(tab.relativePath)
      }
    }

    return paths
  }, [tabSummaries])

  const getTabGitStatus = useCallback((relativePath: string) => getGitStatus(relativePath, false), [getGitStatus])

  useEffect(() => {
    scheduleBackgroundWork(
      () => {
        void import('@/components/code/CodeEditor')
      },
      { timeout: 4000 }
    )
  }, [])

  const { panelGroupRef, initialLayout, onLayoutChanged } = useEditorSidebarWidth()
  const activeTabId = useEditorWorkspace(s => s.activeTabId)
  const activeTabStatus = useActiveTabStatus(activeTabId)
  const lspStatus = useEditorLspStatusBar(repoCwd, activeTabStatus.languageId)
  const tabCount = useEditorWorkspace(s => s.tabs.length)
  const setRepoCwd = useEditorWorkspace(s => s.setRepoCwd)
  const openFile = useEditorWorkspace(s => s.openFile)
  const openCompare = useEditorWorkspace(s => s.openCompare)
  const closeTab = useEditorWorkspace(s => s.closeTab)
  const setActiveTab = useEditorWorkspace(s => s.setActiveTab)
  const syncTabDirty = useEditorWorkspace(s => s.syncTabDirty)
  const saveTab = useEditorWorkspace(s => s.saveTab)
  const saveActiveTab = useEditorWorkspace(s => s.saveActiveTab)
  const reloadTabFromDisk = useEditorWorkspace(s => s.reloadTabFromDisk)
  const reloadTabFromDiskIfChanged = useEditorWorkspace(s => s.reloadTabFromDiskIfChanged)
  const revertDirtyTabs = useEditorWorkspace(s => s.revertDirtyTabs)
  const pinTab = useEditorWorkspace(s => s.pinTab)

  useEffect(() => {
    if (!repoCwd) return
    startTransition(() => setRepoCwd(repoCwd))
  }, [repoCwd, setRepoCwd])

  useEffect(() => {
    if (!repoCwd) return
    const onBranchChanged = () => {
      const { tabs } = useEditorWorkspace.getState()
      for (const tab of tabs) {
        if (tab.kind === 'text' && !tab.isDirty && tab.contentLoaded) {
          void reloadTabFromDiskIfChanged(tab.relativePath)
        }
      }
      void refreshGitDecorations()
    }
    window.addEventListener('git-branch-changed', onBranchChanged)
    return () => window.removeEventListener('git-branch-changed', onBranchChanged)
  }, [repoCwd, refreshGitDecorations, reloadTabFromDiskIfChanged])

  useEffect(() => {
    const onLargeFileBlocked = (event: Event) => {
      const detail = (event as CustomEvent<{ relativePath: string; size: number; opts?: OpenFileOptions }>).detail
      if (!detail?.relativePath) return
      setLargeFileConfirm({
        relativePath: detail.relativePath,
        fileName: detail.relativePath.split('/').pop() ?? detail.relativePath,
        size: detail.size,
        opts: detail.opts,
      })
    }
    window.addEventListener('editor-large-file-blocked', onLargeFileBlocked as EventListener)
    return () => window.removeEventListener('editor-large-file-blocked', onLargeFileBlocked as EventListener)
  }, [])

  // Disable during `pnpm dev` — Vite HMR floods the watcher and freezes the UI.
  const fileWatcherEnabled = !import.meta.env.DEV

  useEffect(() => {
    if (!repoCwd || !fileWatcherEnabled) return

    const pendingEvents = new Map<string, 'add' | 'change' | 'unlink'>()
    let flushTimer: number | null = null

    const flushEvents = () => {
      flushTimer = null
      const batch = [...pendingEvents.entries()]
      pendingEvents.clear()
      for (const [relativePath, event] of batch) {
        const tab = useEditorWorkspace.getState().tabs.find(t => t.relativePath === relativePath)
        if (!tab) continue
        if (event === 'unlink') {
          if (tab.isDirty) {
            setFileChangeConfirm({
              relativePath,
              fileName: relativePath.split('/').pop() ?? relativePath,
            })
          } else {
            useEditorWorkspace.getState().closeTab(tab.id)
          }
          continue
        }
        if (tab.isDirty) {
          setFileChangeConfirm({
            relativePath,
            fileName: relativePath.split('/').pop() ?? relativePath,
          })
          continue
        }
        void reloadTabFromDisk(relativePath)
      }
    }

    const queueEvent = (relativePath: string, event: 'add' | 'change' | 'unlink') => {
      patchQuickOpenFileIndex(repoCwd, relativePath, event)
      pendingEvents.set(relativePath, event)
      if (flushTimer) return
      flushTimer = window.setTimeout(flushEvents, 400)
    }

    const unsub = window.api.system.on_workspace_file_changed(event => {
      queueEvent(event.relativePath, event.event)
    })
    return () => {
      if (flushTimer) window.clearTimeout(flushTimer)
      unsub()
      void window.api.system.unwatch_workspace()
    }
  }, [repoCwd, fileWatcherEnabled, reloadTabFromDisk])

  useEffect(() => {
    if (!repoCwd || tabCount === 0 || !fileWatcherEnabled) return
    const watchTimer = window.setTimeout(() => {
      void window.api.system.watch_workspace({ cwd: repoCwd })
    }, 600)
    return () => window.clearTimeout(watchTimer)
  }, [repoCwd, tabCount, fileWatcherEnabled])

  const { requestCloseTab, requestCloseTabs, advanceCloseQueue, clearCloseQueue } = useEditorTabCloseQueue({
    closeTab,
    setCloseConfirm,
  })

  const copyTabPathToClipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        toast.success(t('editor.explorerMenu.copySuccess'))
      } catch {
        toast.error(t('toast.copyFailed'))
      }
    },
    [t]
  )

  const revealPathInExplorer = useCallback((relativePath: string) => {
    setSidebarView('explorer')
    writeEditorSidebarView('explorer')
    explorerRevealSeqRef.current += 1
    setExplorerRevealRequest({ path: relativePath, seq: explorerRevealSeqRef.current })
  }, [])

  useEffect(() => {
    if (!repoCwd || !activeTabId) return
    scheduleEditorTabPrefetch(repoCwd, activeTabId)
  }, [repoCwd, activeTabId, tabSummaries])

  const getTabMenuActions = useCallback(
    (row: (typeof tabSummaries)[number], tabIndex: number): EditorTabMenuActions => {
      const snapshot = useEditorWorkspace.getState().tabs
      const tabIds = snapshot.map(t => t.id)
      return {
        onClose: () => requestCloseTab(row.id),
        onCloseOthers: () => requestCloseTabs(tabIds.filter(id => id !== row.id)),
        onCloseToRight: () => requestCloseTabs(tabIds.slice(tabIndex + 1)),
        onCloseSaved: () => requestCloseTabs(snapshot.filter(tab => !tab.isDirty).map(tab => tab.id)),
        onCloseAll: () => requestCloseTabs(tabIds),
        onCopyPath: () => void copyTabPathToClipboard(joinRepoPath(repoCwd, row.relativePath)),
        onCopyRelativePath: () => void copyTabPathToClipboard(row.relativePath),
        onRevealInFileExplorer: () => {
          void window.api.system.reveal_in_file_explorer(joinRepoPath(repoCwd, row.relativePath))
        },
        onRevealInExplorerView: () => {
          setActiveTab(row.id)
          revealPathInExplorer(row.relativePath)
        },
        onPin: () => pinTab(row.id),
      }
    },
    [copyTabPathToClipboard, pinTab, repoCwd, requestCloseTab, requestCloseTabs, revealPathInExplorer, setActiveTab]
  )

  useEffect(() => {
    if (autoSave !== 'afterDelay' || !activeTabId) return
    const tab = useEditorWorkspace.getState().tabs.find(t => t.id === activeTabId)
    if (!tab?.isDirty) return
    const timer = window.setTimeout(() => {
      void saveActiveTab()
    }, autoSaveDelayMs)
    return () => window.clearTimeout(timer)
  }, [activeTabId, autoSave, autoSaveDelayMs, saveActiveTab, tabSummaries])

  const handleOrganizeImportsResult = useCallback(
    (result: OrganizeImportsResult) => {
      switch (result) {
        case 'success':
          toast.success(t('editor.lsp.organizeImportsSuccess'))
          break
        case 'not_ready':
          toast.warning(t('editor.lsp.organizeImportsNotReady'))
          break
        case 'no_action':
          toast.info(t('editor.lsp.organizeImportsNoAction'))
          break
        case 'not_supported':
        case 'failed':
          toast.error(t('editor.lsp.organizeImportsFailed'))
          break
      }
    },
    [t]
  )

  useEffect(() => {
    if (!repoCwd) return
    prewarmQuickOpenFileIndex(repoCwd)
  }, [repoCwd])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const target = e.target as HTMLElement | null
      const inMonaco = Boolean(target?.closest('.monaco-editor'))
      const inQuickOpen = Boolean(target?.closest('[data-slot="dialog-content"]'))
      if (mod && e.key === 's') {
        e.preventDefault()
        void saveActiveTab()
        return
      }
      if (mod && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) requestCloseTab(activeTabId)
        return
      }
      if (mod && e.key === '`') {
        e.preventDefault()
        onTerminalToggle?.()
        return
      }
      if (mod && e.shiftKey && e.key === 'F' && !inMonaco) {
        e.preventDefault()
        setSidebarView('search')
        writeEditorSidebarView('search')
        return
      }
      if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        e.stopPropagation()
        if (inQuickOpen || quickOpen) {
          setQuickOpen(false)
        } else {
          setQuickOpen(true)
        }
        return
      }
      if (mod && e.key === 'g') {
        e.preventDefault()
        setGoToLineOpen(true)
        return
      }
      if (mod && e.key === 'f' && !e.shiftKey && inMonaco) {
        e.preventDefault()
        void runEditorAction('actions.find')
        return
      }
      if (mod && e.key === 'h' && inMonaco) {
        e.preventDefault()
        void runEditorAction('editor.action.startFindReplaceAction')
        return
      }
      if (e.altKey && e.shiftKey && e.key === 'F' && inMonaco) {
        e.preventDefault()
        void runEditorAction('editor.action.formatDocument')
        return
      }
      if (e.altKey && e.shiftKey && e.key === 'O' && inMonaco) {
        e.preventDefault()
        const tab = activeTabId ? useEditorWorkspace.getState().tabs.find(t => t.id === activeTabId) : undefined
        if (tab?.kind === 'text' && languageIdForLsp(tab.languageId)) {
          void editorLanguageService.organizeImports(tab.relativePath, tab.languageId).then(handleOrganizeImportsResult)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTabId, handleOrganizeImportsResult, onTerminalToggle, quickOpen, requestCloseTab, saveActiveTab])

  useEffect(() => {
    const register = onRegisterLayoutLeave
    if (!register) return
    register(action => {
      if (!useEditorWorkspace.getState().hasDirtyTabs()) {
        action()
        return
      }
      const dirty = useEditorWorkspace.getState().tabs.find(t => t.isDirty)
      if (dirty) {
        setCloseConfirm({
          tabId: dirty.id,
          fileName: dirty.relativePath.split('/').pop() ?? dirty.relativePath,
          onProceed: action,
        })
        return
      }
      action()
    })
  }, [onRegisterLayoutLeave])

  const handleViewChange = useCallback((view: EditorSidebarView) => {
    setSidebarView(view)
    writeEditorSidebarView(view)
  }, [])

  const handleCursorChange = useCallback((position: EditorCursorPosition | null) => {
    setCursor(prev => {
      if (position === null) return prev === null ? prev : null
      return prev?.line === position.line && prev?.column === position.column ? prev : position
    })
  }, [])

  if (!repoCwd) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('editor.noWorkspace')}</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col pt-1">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ResizablePanelGroup
          groupRef={panelGroupRef}
          direction="horizontal"
          className="min-h-0 min-w-0 flex-1"
          defaultLayout={initialLayout}
          onLayoutChanged={onLayoutChanged}
          resizeTargetMinimumSize={{ coarse: 37, fine: 27 }}
        >
          <ResizablePanel id={EDITOR_SIDEBAR_PANEL_ID} minSize={editorSidebarMinSize()} maxSize={editorSidebarMaxSize()} className="min-h-0 min-w-0">
            <EditorSidebar activeView={sidebarView} onViewChange={handleViewChange}>
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center">
                    <GlowLoader className="h-8 w-8" />
                  </div>
                }
              >
                {sidebarView === 'explorer' ? (
                  <LazyExplorerPanel
                    repoCwd={repoCwd}
                    activeTabId={activeTabId}
                    activeRelativePath={activeTabStatus.relativePath}
                    revealRequest={explorerRevealRequest}
                    onOpenFile={(path, opts) => void openFile(path, opts)}
                    onOpenCompare={(left, right) => void openCompare(left, right)}
                    getGitStatus={getGitStatus}
                    refreshGitDecorations={refreshGitDecorations}
                    onOpenInTerminal={onOpenInTerminal}
                  />
                ) : (
                  <LazySearchPanel
                    repoCwd={repoCwd}
                    onOpenMatch={match => void openFile(match.relativePath, { line: match.line, column: match.column, pin: true })}
                    onFilesReplaced={paths => {
                      for (const relativePath of paths) void reloadTabFromDisk(relativePath)
                    }}
                  />
                )}
              </Suspense>
            </EditorSidebar>
          </ResizablePanel>
          <ResizableHandle className="bg-transparent" />
          <ResizablePanel id={EDITOR_MAIN_PANEL_ID} minSize="40%" className="min-h-0 min-w-0">
            <div className="flex h-full min-h-0 flex-col" data-editor-main>
              <EditorTabBar
                tabs={tabSummaries}
                activeTabId={activeTabId}
                onSelectTab={setActiveTab}
                onCloseTab={requestCloseTab}
                onPinTab={pinTab}
                getGitStatus={getTabGitStatus}
                getTabMenuActions={getTabMenuActions}
              />
              {breadcrumbs && activeTabStatus.relativePath ? (
                <EditorFileBreadcrumbs
                  relativePath={activeTabStatus.relativePath}
                  workspaceLabel={workspaceLabel}
                  onRevealPath={revealPathInExplorer}
                />
              ) : null}
              <div className="min-h-0 flex-1">
                <EditorTabPane activeTabId={activeTabId} repoCwd={repoCwd} onSyncDirty={syncTabDirty} onCursorChange={handleCursorChange} />
              </div>
              <EditorStatusBar
                relativePath={activeTabStatus.relativePath}
                languageId={activeTabStatus.languageId}
                cursor={cursor}
                insertSpaces={insertSpaces}
                tabSize={tabSize}
                lspStatus={lspStatus}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <EditorCloseConfirm
        open={Boolean(closeConfirm)}
        onOpenChange={open => {
          if (!open) {
            setCloseConfirm(prev => {
              if (prev?.queueMode) clearCloseQueue()
              return null
            })
          }
        }}
        fileName={closeConfirm?.fileName ?? ''}
        onSave={async () => {
          if (!closeConfirm) return
          const { tabId, onProceed, queueMode } = closeConfirm
          if (onProceed) {
            const dirtyTabs = useEditorWorkspace.getState().tabs.filter(t => t.isDirty)
            for (const tab of dirtyTabs) {
              const ok = await saveTab(tab.id)
              if (!ok) return
            }
            onProceed()
            setCloseConfirm(null)
            return
          }
          const ok = await saveTab(tabId)
          if (!ok) return
          closeTab(tabId)
          setCloseConfirm(null)
          if (queueMode) advanceCloseQueue()
        }}
        onDiscard={() => {
          if (!closeConfirm) return
          const { tabId, onProceed, queueMode } = closeConfirm
          if (onProceed) {
            revertDirtyTabs()
            onProceed()
            setCloseConfirm(null)
            return
          }
          closeTab(tabId)
          setCloseConfirm(null)
          if (queueMode) advanceCloseQueue()
        }}
      />

      <EditorFileChangeDialog
        open={Boolean(fileChangeConfirm)}
        onOpenChange={open => {
          if (!open) setFileChangeConfirm(null)
        }}
        fileName={fileChangeConfirm?.fileName ?? ''}
        onReload={() => {
          if (!fileChangeConfirm) return
          void reloadTabFromDisk(fileChangeConfirm.relativePath).then(() => setFileChangeConfirm(null))
        }}
        onKeepLocal={() => setFileChangeConfirm(null)}
      />

      <EditorQuickOpen
        open={quickOpen}
        onOpenChange={setQuickOpen}
        repoCwd={repoCwd}
        recentPaths={recentQuickOpenPaths}
        onOpenFile={(path, opts) => void openFile(path, opts)}
      />

      <EditorGoToLineDialog
        open={goToLineOpen}
        onOpenChange={setGoToLineOpen}
        onGoTo={(line, column) => {
          editorCommandBridge.get()?.revealLine(line, column)
          setGoToLineOpen(false)
        }}
      />

      <EditorLargeFileDialog
        open={Boolean(largeFileConfirm)}
        onOpenChange={open => {
          if (!open) setLargeFileConfirm(null)
        }}
        fileName={largeFileConfirm?.fileName ?? ''}
        sizeBytes={largeFileConfirm?.size ?? 0}
        onOpenAnyway={() => {
          if (!largeFileConfirm) return
          const { relativePath, opts } = largeFileConfirm
          setLargeFileConfirm(null)
          void openFile(relativePath, { ...opts, forceLarge: true })
        }}
      />
    </div>
  )
}
