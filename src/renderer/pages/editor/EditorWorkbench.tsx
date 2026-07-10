'use client'

import { lazy, Suspense, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import { EditorCloseConfirm } from '@/pages/editor/EditorCloseConfirm'
import { EditorFileChangeDialog } from '@/pages/editor/EditorFileChangeDialog'
import { EditorDirtyWriteDialog } from '@/pages/editor/EditorDirtyWriteDialog'
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
import { useEditorLspPrepare } from '@/pages/editor/hooks/useEditorLspPrepare'
import { useEditorLspStatusBar } from '@/pages/editor/hooks/useEditorLspStatusBar'
import { useEditorSettings } from '@/pages/editor/hooks/useEditorSettings'
import { type EditorSidebarView, readEditorSidebarView, writeEditorSidebarView } from '@/pages/editor/hooks/useEditorSidebarView'
import { EDITOR_MAIN_PANEL_ID, EDITOR_SIDEBAR_PANEL_ID, editorSidebarMaxSize, editorSidebarMinSize, useEditorSidebarWidth } from '@/pages/editor/hooks/useEditorSidebarWidth'
import { useActiveTabStatus, useEditorTabSummaries } from '@/pages/editor/hooks/useEditorTabSelectors'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'
import { type EditorCursorPosition, editorCommandBridge, runEditorAction } from '@/pages/editor/lib/editorCommandBridge'
import { getEditorTabActivationOrder } from '@/pages/editor/lib/editorTabActivation'
import { useEditorExternalFileSync } from '@/pages/editor/hooks/useEditorExternalFileSync'
import {
  EDITOR_DIRTY_WRITE_EVENT,
  resolveDirtyWriteChoice,
  type DirtyWritePromptPayload,
} from '@/pages/editor/lib/editorDirtyWritePrompt'
import { prewarmQuickOpenFileIndex } from '@/pages/editor/lib/quickOpenFileIndex'
import { scheduleBackgroundWork } from '@/pages/editor/lib/scheduleBackgroundWork'
import { cancelEditorTabPrefetch, scheduleEditorTabPrefetch } from '@/pages/editor/hooks/useEditorTabPrefetch'
import { useEditorShellOpenRequest } from '@/pages/editor/hooks/useEditorShellOpenRequest'
import { useEditorTabCloseQueue } from '@/pages/editor/lib/useEditorTabCloseQueue'
import { joinRepoPath } from '@/pages/editor/lsp/documentUri'
import type { FormatDocumentResult, OrganizeImportsResult } from '@/pages/editor/lsp/EditorLanguageService'
import type { EditorWorkspaceFolder } from '@/lib/multiRepoUtils'
import { normalizeEditorRepoKey } from '@/pages/editor/lib/editorSessionPersist'

const LazyExplorerPanel = lazy(() => import('@/pages/editor/explorer/EditorExplorerPanel').then(m => ({ default: m.EditorExplorerPanel })))
const LazyMultiRootExplorerPanel = lazy(() =>
  import('@/pages/editor/explorer/EditorMultiRootExplorerPanel').then(m => ({ default: m.EditorMultiRootExplorerPanel }))
)
const LazySearchPanel = lazy(() => import('@/pages/editor/search/EditorSearchPanel').then(m => ({ default: m.EditorSearchPanel })))

type EditorWorkbenchProps = {
  repoCwd?: string
  workspaceFolders?: EditorWorkspaceFolder[]
  workspaceSessionKey?: string
  activeFolderIndex?: string
  onFocusedFolderChange?: (index: string) => void
  workspaceEmptyMessage?: string
  onRegisterLayoutLeave?: (handler: (action: () => void) => void) => void
  onOpenInTerminal?: (absoluteCwd: string) => void
}

export function EditorWorkbench({
  repoCwd = '',
  workspaceFolders,
  workspaceSessionKey,
  activeFolderIndex = '0',
  onFocusedFolderChange,
  workspaceEmptyMessage,
  onRegisterLayoutLeave,
  onOpenInTerminal,
}: EditorWorkbenchProps) {
  const { t } = useTranslation()
  const [sidebarView, setSidebarView] = useState<EditorSidebarView>(() => readEditorSidebarView())
  const [closeConfirm, setCloseConfirm] = useState<{
    tabId: string
    fileName: string
    onProceed?: () => void
    queueMode?: boolean
  } | null>(null)
  const [fileChangeConfirm, setFileChangeConfirm] = useState<{ tabId: string; relativePath: string; repoRoot: string; fileName: string } | null>(null)
  const [dirtyWritePrompt, setDirtyWritePrompt] = useState<DirtyWritePromptPayload | null>(null)
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
  const useMultiRootExplorer = Boolean(workspaceFolders && workspaceFolders.length > 1)
  const focusedRepoCwd = useEditorWorkspace(s => s.repoCwd)
  const effectiveRepoCwd = focusedRepoCwd || repoCwd

  const workspaceLabel = useMemo(
    () =>
      effectiveRepoCwd
        ? (effectiveRepoCwd
          .replace(/[/\\]+$/, '')
          .split(/[/\\]/)
          .pop() ?? effectiveRepoCwd)
        : '',
    [effectiveRepoCwd]
  )

  const tabSummaries = useEditorTabSummaries()
  const openTabPaths = useMemo(
    () => tabSummaries.filter(t => !t.isCompare).map(t => t.relativePath),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable by path set, not tab metadata revision
    [tabSummaries.map(t => (t.isCompare ? '' : t.relativePath)).join('\0')]
  )
  /** Resource identity (repoRoot + path) for every open text tab — VS Code matches watcher/search by URI, not name. */
  const openTabResources = useMemo(
    () =>
      tabSummaries
        .filter(t => !t.isCompare)
        .map(t => ({ tabId: t.id, repoRoot: t.repoRoot, relativePath: t.relativePath })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable by (repoRoot, path) set, not tab metadata revision
    [tabSummaries.map(t => (t.isCompare ? '' : `${t.id}\0${t.repoRoot}\0${t.relativePath}`)).join('\n')]
  )
  const { getGitStatus, refreshGitDecorations } = useEditorGitDecorations(effectiveRepoCwd, {
    openTabPaths,
    explorerActive: sidebarView === 'explorer',
  })
  const recentQuickOpenEntries = useMemo(() => {
    const tabs = useEditorWorkspace.getState().tabs.filter(t => t.kind !== 'compare')
    const order = getEditorTabActivationOrder()
    const tabById = new Map(tabs.map(t => [t.id, t]))
    const seen = new Set<string>()
    const entries: { relativePath: string; repoRoot: string }[] = []

    for (const id of order) {
      const tab = tabById.get(id)
      if (tab && !seen.has(tab.id)) {
        seen.add(tab.id)
        entries.push({ relativePath: tab.relativePath, repoRoot: tab.repoRoot })
      }
    }

    for (const tab of tabs) {
      if (!seen.has(tab.id)) {
        seen.add(tab.id)
        entries.push({ relativePath: tab.relativePath, repoRoot: tab.repoRoot })
      }
    }

    return entries
  }, [tabSummaries])

  const dirtyTabPaths = useMemo(() => {
    const paths = new Set<string>()
    for (const tab of tabSummaries) {
      if (!tab.isCompare && tab.isDirty) {
        paths.add(tab.relativePath.replace(/\\/g, '/'))
      }
    }
    return paths
  }, [tabSummaries])

  const getTabGitStatus = useCallback(
    (relativePath: string) => {
      const normalized = relativePath.replace(/\\/g, '/')
      const status = getGitStatus(normalized, false)
      if (status) return status
      if (dirtyTabPaths.has(normalized)) return 'modified'
      return null
    },
    [dirtyTabPaths, getGitStatus]
  )

  const getExplorerGitStatus = useCallback(
    (relativePath: string, isDir: boolean) => {
      if (!isDir) return getTabGitStatus(relativePath)
      return getGitStatus(relativePath, isDir)
    },
    [getTabGitStatus, getGitStatus]
  )

  const openEditorsTabs = useMemo(() => {
    const order = getEditorTabActivationOrder()
    const tabById = new Map(tabSummaries.map(t => [t.id, t]))
    const sorted: typeof tabSummaries = []
    const seen = new Set<string>()
    for (const id of order) {
      const tab = tabById.get(id)
      if (tab) {
        sorted.push(tab)
        seen.add(tab.id)
      }
    }
    for (const tab of tabSummaries) {
      if (!seen.has(tab.id)) sorted.push(tab)
    }
    return sorted
  }, [tabSummaries])

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
  const lspStatus = useEditorLspStatusBar(effectiveRepoCwd, activeTabStatus.languageId)
  useEditorLspPrepare(effectiveRepoCwd)
  const initMultiRootWorkspace = useEditorWorkspace(s => s.initMultiRootWorkspace)
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
  const revertActiveTabFromDisk = useEditorWorkspace(s => s.revertActiveTabFromDisk)
  const markTabOutOfSyncWithDisk = useEditorWorkspace(s => s.markTabOutOfSyncWithDisk)
  const revertDirtyTabs = useEditorWorkspace(s => s.revertDirtyTabs)
  const pinTab = useEditorWorkspace(s => s.pinTab)

  useEffect(() => {
    if (useMultiRootExplorer && workspaceSessionKey && workspaceFolders?.length) {
      initMultiRootWorkspace(
        workspaceSessionKey,
        workspaceFolders.map(folder => folder.path)
      )
      return
    }
    if (!repoCwd) return
    startTransition(() => setRepoCwd(repoCwd))
  }, [useMultiRootExplorer, workspaceSessionKey, workspaceFolders, repoCwd, initMultiRootWorkspace, setRepoCwd])

  useEffect(() => {
    if (!useMultiRootExplorer || !onFocusedFolderChange || !workspaceFolders?.length) return
    const tab = useEditorWorkspace.getState().tabs.find(t => t.id === activeTabId)
    if (!tab?.repoRoot) return
    const tabRoot = normalizeEditorRepoKey(tab.repoRoot)
    const idx = workspaceFolders.findIndex(folder => normalizeEditorRepoKey(folder.path) === tabRoot)
    if (idx >= 0) onFocusedFolderChange(String(idx))
  }, [activeTabId, onFocusedFolderChange, tabSummaries, useMultiRootExplorer, workspaceFolders])

  useEditorShellOpenRequest({ repoCwd: effectiveRepoCwd, openFile })

  useEffect(() => {
    const onDirtyWriteRequest = (event: Event) => {
      const detail = (event as CustomEvent<DirtyWritePromptPayload>).detail
      if (!detail?.relativePath) return
      setDirtyWritePrompt(detail)
    }
    window.addEventListener(EDITOR_DIRTY_WRITE_EVENT, onDirtyWriteRequest)
    return () => window.removeEventListener(EDITOR_DIRTY_WRITE_EVENT, onDirtyWriteRequest)
  }, [])

  useEffect(() => {
    if (!effectiveRepoCwd) return
    const onBranchChanged = () => {
      const { tabs, repoCwd: storeCwd } = useEditorWorkspace.getState()
      for (const tab of tabs) {
        if (tab.kind === 'text' && !tab.isDirty && tab.contentLoaded) {
          if (!useMultiRootExplorer || normalizeEditorRepoKey(tab.repoRoot) === normalizeEditorRepoKey(storeCwd)) {
            void reloadTabFromDiskIfChanged(tab.relativePath)
          }
        }
      }
      void refreshGitDecorations()
    }
    window.addEventListener('git-branch-changed', onBranchChanged)
    return () => window.removeEventListener('git-branch-changed', onBranchChanged)
  }, [effectiveRepoCwd, refreshGitDecorations, reloadTabFromDiskIfChanged, useMultiRootExplorer])

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

  useEditorExternalFileSync({
    openTabs: openTabResources,
    activeTabId,
    onRequestReloadConfirm: payload => setFileChangeConfirm(payload),
    onCloseTab: tabId => closeTab(tabId),
  })

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
    if (!effectiveRepoCwd || !activeTabId) return
    scheduleEditorTabPrefetch(effectiveRepoCwd, activeTabId)
    return () => cancelEditorTabPrefetch()
  }, [effectiveRepoCwd, activeTabId])

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
        onCopyPath: () => void copyTabPathToClipboard(joinRepoPath(row.repoRoot || effectiveRepoCwd, row.relativePath)),
        onCopyRelativePath: () => void copyTabPathToClipboard(row.relativePath),
        onRevealInFileExplorer: () => {
          void window.api.system.reveal_in_file_explorer(joinRepoPath(row.repoRoot || effectiveRepoCwd, row.relativePath))
        },
        onRevealInExplorerView: () => {
          setActiveTab(row.id)
          revealPathInExplorer(row.relativePath)
        },
        onPin: () => pinTab(row.id),
        onRevert: () => {
          setActiveTab(row.id)
          void revertActiveTabFromDisk()
        },
      }
    },
    [copyTabPathToClipboard, effectiveRepoCwd, pinTab, requestCloseTab, requestCloseTabs, revealPathInExplorer, revertActiveTabFromDisk, setActiveTab]
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

  const handleFormatDocumentResult = useCallback(
    (result: FormatDocumentResult) => {
      switch (result) {
        case 'success':
          toast.success(t('editor.lsp.formatDocumentSuccess'))
          break
        case 'not_ready':
          toast.warning(t('editor.lsp.formatDocumentNotReady'))
          break
        case 'no_action':
          toast.info(t('editor.lsp.formatDocumentNoAction'))
          break
        case 'not_supported':
          toast.info(t('editor.lsp.formatDocumentNotSupported'))
          break
        case 'failed':
          toast.error(t('editor.lsp.formatDocumentFailed'))
          break
      }
    },
    [t]
  )

  useEffect(() => {
    if (useMultiRootExplorer && workspaceFolders?.length) {
      for (const folder of workspaceFolders) prewarmQuickOpenFileIndex(folder.path)
      return
    }
    if (!effectiveRepoCwd) return
    prewarmQuickOpenFileIndex(effectiveRepoCwd)
  }, [effectiveRepoCwd, useMultiRootExplorer, workspaceFolders])

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
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [quickOpen, requestCloseTab, saveActiveTab])

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

  if (!effectiveRepoCwd && !(useMultiRootExplorer && workspaceFolders && workspaceFolders.length > 0)) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
        {workspaceEmptyMessage ?? t('editor.noWorkspace')}
      </div>
    )
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
                  useMultiRootExplorer && workspaceFolders ? (
                    <LazyMultiRootExplorerPanel
                      workspaceFolders={workspaceFolders}
                      activeFolderIndex={activeFolderIndex}
                      repoCwd={effectiveRepoCwd}
                      activeTabId={activeTabId}
                      tabs={openEditorsTabs}
                      onSelectTab={setActiveTab}
                      onCloseTab={requestCloseTab}
                      onCloseAllTabs={() => requestCloseTabs(useEditorWorkspace.getState().tabs.map(t => t.id))}
                      onPinTab={pinTab}
                      getTabGitStatus={getTabGitStatus}
                      getTabMenuActions={getTabMenuActions}
                      onOpenFile={(path, opts) => void openFile(path, opts)}
                      getGitStatus={getExplorerGitStatus}
                      refreshGitDecorations={refreshGitDecorations}
                    />
                  ) : (
                    <LazyExplorerPanel
                      repoCwd={effectiveRepoCwd}
                      activeTabId={activeTabId}
                      activeRelativePath={activeTabStatus.relativePath}
                      revealRequest={explorerRevealRequest}
                      tabs={openEditorsTabs}
                      onSelectTab={setActiveTab}
                      onCloseTab={requestCloseTab}
                      onCloseAllTabs={() => requestCloseTabs(useEditorWorkspace.getState().tabs.map(t => t.id))}
                      onPinTab={pinTab}
                      getTabGitStatus={getTabGitStatus}
                      getTabMenuActions={getTabMenuActions}
                      onOpenFile={(path, opts) => void openFile(path, opts)}
                      onOpenCompare={(left, right) => void openCompare(left, right)}
                      getGitStatus={getExplorerGitStatus}
                      refreshGitDecorations={refreshGitDecorations}
                      onOpenInTerminal={onOpenInTerminal}
                    />
                  )
                ) : (
                  <LazySearchPanel
                    repoCwd={effectiveRepoCwd}
                    workspaceFolders={useMultiRootExplorer ? workspaceFolders : undefined}
                    openTabs={openTabResources}
                    onOpenMatch={match =>
                      void openFile(match.relativePath, { line: match.line, column: match.column, pin: true, repoRoot: match.repoRoot })
                    }
                    onFilesReplaced={entries => {
                      for (const entry of entries) void reloadTabFromDisk(entry.relativePath, undefined, entry.repoRoot)
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
                <EditorTabPane
                  activeTabId={activeTabId}
                  repoCwd={effectiveRepoCwd}
                  getGitStatus={getTabGitStatus}
                  onSyncDirty={syncTabDirty}
                  onCursorChange={handleCursorChange}
                  onOrganizeImportsResult={handleOrganizeImportsResult}
                  onFormatDocumentResult={handleFormatDocumentResult}
                />
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
          void reloadTabFromDisk(fileChangeConfirm.relativePath, undefined, fileChangeConfirm.repoRoot).then(() =>
            setFileChangeConfirm(null)
          )
        }}
        onKeepLocal={() => {
          if (!fileChangeConfirm) return
          markTabOutOfSyncWithDisk(fileChangeConfirm.relativePath, fileChangeConfirm.repoRoot)
          setFileChangeConfirm(null)
        }}
      />

      <EditorDirtyWriteDialog
        open={Boolean(dirtyWritePrompt)}
        onOpenChange={open => {
          if (!open) {
            resolveDirtyWriteChoice('cancel')
            setDirtyWritePrompt(null)
          }
        }}
        fileName={dirtyWritePrompt?.fileName ?? ''}
        onOverwrite={() => {
          resolveDirtyWriteChoice('overwrite')
          setDirtyWritePrompt(null)
        }}
        onRevert={() => {
          resolveDirtyWriteChoice('revert')
          setDirtyWritePrompt(null)
        }}
        onCompare={() => {
          resolveDirtyWriteChoice('compare')
          setDirtyWritePrompt(null)
        }}
      />

      <EditorQuickOpen
        open={quickOpen}
        onOpenChange={setQuickOpen}
        repoCwd={effectiveRepoCwd}
        workspaceFolders={useMultiRootExplorer ? workspaceFolders : undefined}
        recentEntries={recentQuickOpenEntries}
        onOpenFile={(path, opts) => void openFile(path, opts)}
        onRunCommand={commandId => {
          if (commandId === 'revert') void revertActiveTabFromDisk()
        }}
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
