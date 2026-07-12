'use client'

import { RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GitFileStatusCode } from '@/components/git/GitFileStatusBadge'
import { Button } from '@/components/ui/button'
import type { EditorWorkspaceFolder } from '@/lib/multiRepoUtils'
import { DiffViewerFileTreeVirtualList } from '@/pages/diffviewer/DiffViewerFileTreeVirtualList'
import type { EditorTabMenuActions } from '@/pages/editor/editor-area/EditorTabContextMenu'
import { ExplorerRow, type ExplorerRowHandlers } from '@/pages/editor/explorer/EditorExplorerRow'
import { EditorExplorerSectionHeader } from '@/pages/editor/explorer/EditorExplorerSectionHeader'
import { EditorFolderGitStatusHost, type FolderGitStatusSnapshot } from '@/pages/editor/explorer/EditorFolderGitStatusHost'
import { EditorFolderTreeHost, type FolderTreeSnapshot } from '@/pages/editor/explorer/EditorFolderTreeHost'
import { EditorOpenEditorRow } from '@/pages/editor/explorer/EditorOpenEditorRow'
import { buildExplorerDisplayRows } from '@/pages/editor/explorer/explorerDisplayRows'
import { buildExplorerPanelRows, EXPLORER_SECTION_HEADER_HEIGHT, type ExplorerPanelRow, getExplorerPanelRowKey } from '@/pages/editor/explorer/explorerSectionRows'
import { toggleSelectionPath } from '@/pages/editor/explorer/explorerSelection'
import { EXPLORER_TREE_ROW_HEIGHT } from '@/pages/editor/explorer/explorerTreeConstants'
import { type EditorExplorerSectionId, folderSectionId, readExplorerExpandedSections, writeExplorerExpandedSections } from '@/pages/editor/hooks/useEditorExplorerSectionPrefs'
import type { EditorTabSummary } from '@/pages/editor/hooks/useEditorTabSelectors'
import { normalizeEditorRepoKey } from '@/pages/editor/lib/editorSessionPersist'
import type { OpenFileOptions } from '@/pages/editor/lib/editorWorkspaceTypes'

type PanelFocus = { kind: 'open-editor'; tabId: string } | { kind: 'tree'; path: string; folderIndex: number }

function panelFocusFromTreePath(path: string, folderIndex: number): PanelFocus {
  return { kind: 'tree', path, folderIndex }
}

function panelFocusFromOpenEditor(tabId: string): PanelFocus {
  return { kind: 'open-editor', tabId }
}

export type EditorMultiRootExplorerPanelProps = {
  workspaceFolders: EditorWorkspaceFolder[]
  activeFolderIndex: string
  repoCwd: string
  activeTabId?: string | null
  tabs?: readonly EditorTabSummary[]
  onSelectTab?: (tabId: string) => void
  onCloseTab?: (tabId: string) => void
  onCloseAllTabs?: () => void
  onPinTab?: (tabId: string) => void
  getTabGitStatus?: (relativePath: string) => GitFileStatusCode | null
  getTabMenuActions?: (tab: EditorTabSummary, tabIndex: number) => EditorTabMenuActions
  onOpenFile: (relativePath: string, opts?: OpenFileOptions) => void
  getGitStatus: (relativePath: string, isDir: boolean) => GitFileStatusCode | null
  refreshGitDecorations: () => void | Promise<void>
}

export function EditorMultiRootExplorerPanel({
  workspaceFolders,
  activeFolderIndex,
  repoCwd,
  activeTabId,
  tabs = [],
  onSelectTab,
  onCloseTab,
  onCloseAllTabs,
  onPinTab,
  getTabGitStatus,
  getTabMenuActions,
  onOpenFile,
  getGitStatus,
  refreshGitDecorations,
}: EditorMultiRootExplorerPanelProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const parsedActiveIndex = Number(activeFolderIndex)
  const activeIndex = Number.isNaN(parsedActiveIndex) ? 0 : parsedActiveIndex
  const [treeSnapshots, setTreeSnapshots] = useState<Record<number, FolderTreeSnapshot>>({})
  const [gitStatusByFolder, setGitStatusByFolder] = useState<Record<number, FolderGitStatusSnapshot>>({})
  const [expandedSections, setExpandedSections] = useState<Set<EditorExplorerSectionId>>(() => readExplorerExpandedSections(workspaceFolders.length))
  const [panelFocus, setPanelFocus] = useState<PanelFocus | null>(null)
  const [selectedByFolder, setSelectedByFolder] = useState<Record<number, Set<string>>>({})
  const currentRowFolderRef = useRef<number>(activeIndex)

  const handleFolderSnapshot = useCallback((folderIndex: number, snapshot: FolderTreeSnapshot | null) => {
    setTreeSnapshots(prev => {
      if (!snapshot) {
        if (!(folderIndex in prev)) return prev
        const next = { ...prev }
        delete next[folderIndex]
        return next
      }
      const existing = prev[folderIndex]
      if (existing?.rows === snapshot.rows && existing.expandedPaths === snapshot.expandedPaths && existing.loadingPaths === snapshot.loadingPaths) {
        return prev
      }
      return { ...prev, [folderIndex]: snapshot }
    })
  }, [])

  const handleFolderGitSnapshot = useCallback((folderIndex: number, snapshot: FolderGitStatusSnapshot | null) => {
    setGitStatusByFolder(prev => {
      if (!snapshot) {
        if (!(folderIndex in prev)) return prev
        const next = { ...prev }
        delete next[folderIndex]
        return next
      }
      return { ...prev, [folderIndex]: snapshot }
    })
  }, [])

  const toggleSection = useCallback((sectionId: EditorExplorerSectionId) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      writeExplorerExpandedSections(next)
      return next
    })
  }, [])

  const openFileInFolder = useCallback(
    (folderIndex: number, path: string, opts?: OpenFileOptions) => {
      const repoRoot = workspaceFolders[folderIndex]?.path
      if (!repoRoot) return
      onOpenFile(path, { ...opts, repoRoot })
    },
    [onOpenFile, workspaceFolders]
  )

  const activeTree = treeSnapshots[activeIndex]

  const handleRefresh = useCallback(() => {
    activeTree?.refresh()
    void refreshGitDecorations()
    for (const snapshot of Object.values(gitStatusByFolder)) {
      void snapshot.refresh()
    }
  }, [activeTree, gitStatusByFolder, refreshGitDecorations])

  const panelRows = useMemo(() => {
    const folders = workspaceFolders.map((folder, index) => {
      const snapshot = treeSnapshots[index]
      return {
        index,
        label: folder.label,
        treeDisplayRows: buildExplorerDisplayRows(snapshot?.rows ?? [], null),
      }
    })
    return buildExplorerPanelRows(tabs, expandedSections, {
      mode: 'multi',
      folders,
      activeFolderIndex: activeIndex,
    })
  }, [activeIndex, expandedSections, tabs, treeSnapshots, workspaceFolders])

  const handleExplorerSelect = useCallback((folderIndex: number, path: string, event: React.MouseEvent) => {
    const ctrl = event.ctrlKey || event.metaKey
    const shift = event.shiftKey

    setSelectedByFolder(prev => {
      const current = prev[folderIndex] ?? new Set<string>()
      let next: Set<string>
      if (shift) next = new Set([path])
      else if (ctrl) next = toggleSelectionPath(current, path)
      else next = new Set([path])
      return { ...prev, [folderIndex]: next }
    })
    setPanelFocus(panelFocusFromTreePath(path, folderIndex))
    containerRef.current?.focus({ preventScroll: true })
  }, [])

  const handlersRef = useRef<ExplorerRowHandlers>({
    onSelect: () => { },
    onToggleExpand: () => { },
    onOpenFile: () => { },
  })

  handlersRef.current = {
    onSelect: (path, event) => handleExplorerSelect(currentRowFolderRef.current, path, event),
    onToggleExpand: path => {
      const folderIndex = currentRowFolderRef.current
      treeSnapshots[folderIndex]?.toggleExpand(path)
    },
    onOpenFile: (path, opts) => openFileInFolder(currentRowFolderRef.current, path, opts),
  }

  const renderPanelRow = useCallback(
    (panelRow: ExplorerPanelRow) => {
      if (panelRow.kind === 'section-header') {
        return (
          <EditorExplorerSectionHeader
            sectionId={panelRow.id}
            expanded={expandedSections.has(panelRow.id)}
            count={panelRow.id === 'open-editors' ? tabs.length : undefined}
            label={panelRow.folderLabel}
            isActiveFolder={panelRow.isActiveFolder}
            onToggle={toggleSection}
            onCloseAll={panelRow.id === 'open-editors' ? onCloseAllTabs : undefined}
          />
        )
      }

      if (panelRow.kind === 'open-editor') {
        const { tab, tabIndex } = panelRow
        const tabFolderIndex = workspaceFolders.findIndex(f => normalizeEditorRepoKey(f.path) === normalizeEditorRepoKey(tab.repoRoot))
        const tabFolderGit = tabFolderIndex >= 0 ? gitStatusByFolder[tabFolderIndex] : undefined
        const tabGitStatus = tab.isCompare ? null : tabFolderGit ? tabFolderGit.getGitStatus(tab.relativePath, false) : (getTabGitStatus?.(tab.relativePath) ?? null)
        return (
          <EditorOpenEditorRow
            tab={tab}
            tabIndex={tabIndex}
            tabCount={tabs.length}
            active={tab.id === activeTabId}
            focused={panelFocus?.kind === 'open-editor' && panelFocus.tabId === tab.id}
            gitStatus={tabGitStatus}
            getTabMenuActions={getTabMenuActions}
            onSelectTab={id => onSelectTab?.(id)}
            onCloseTab={id => onCloseTab?.(id)}
            onPinTab={onPinTab}
            onFocusRow={() => setPanelFocus(panelFocusFromOpenEditor(tab.id))}
          />
        )
      }

      const folderIndex = panelRow.folderIndex ?? activeIndex
      const snapshot = treeSnapshots[folderIndex]
      const displayRow = panelRow.displayRow
      if (displayRow.kind !== 'tree') return null

      currentRowFolderRef.current = folderIndex
      const { row } = displayRow
      const { relativePath } = row.node
      const isDir = row.node.kind === 'directory'
      const folderRoot = workspaceFolders[folderIndex]?.path ?? ''
      const folderGit = gitStatusByFolder[folderIndex]
      const isFocusedFolder = Boolean(folderRoot && repoCwd && normalizeEditorRepoKey(folderRoot) === normalizeEditorRepoKey(repoCwd))
      const gitStatus = folderGit ? folderGit.getGitStatus(relativePath, isDir) : isFocusedFolder ? getGitStatus(relativePath, isDir) : null
      const folderSelection = selectedByFolder[folderIndex] ?? new Set<string>()

      return (
        <div className="w-full min-w-0">
          <ExplorerRow
            row={row}
            isSelected={folderSelection.has(relativePath)}
            isExpanded={snapshot?.expandedPaths.has(relativePath) ?? false}
            isLoading={snapshot?.loadingPaths.has(relativePath) ?? false}
            gitStatus={gitStatus}
            handlersRef={handlersRef}
          />
        </div>
      )
    },
    [
      activeIndex,
      activeTabId,
      expandedSections,
      getGitStatus,
      getTabGitStatus,
      getTabMenuActions,
      gitStatusByFolder,
      onCloseAllTabs,
      onCloseTab,
      onPinTab,
      onSelectTab,
      panelFocus,
      repoCwd,
      selectedByFolder,
      tabs.length,
      toggleSection,
      treeSnapshots,
      workspaceFolders,
    ]
  )

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col" tabIndex={0} role="tree" aria-label={t('editor.explorer')}>
      {workspaceFolders.map((folder, index) => (
        <EditorFolderTreeHost
          key={folder.path}
          folderIndex={index}
          repoCwd={folder.path}
          enabled={expandedSections.has(folderSectionId(index))}
          onSnapshot={handleFolderSnapshot}
        />
      ))}
      {workspaceFolders.map((folder, index) => (
        <EditorFolderGitStatusHost
          key={folder.path}
          folderIndex={index}
          repoCwd={folder.path}
          enabled={expandedSections.has(folderSectionId(index))}
          onSnapshot={handleFolderGitSnapshot}
        />
      ))}
      <div className="flex h-6 shrink-0 items-center justify-between gap-1 border-b px-2">
        <span className="truncate text-[11px] font-bold uppercase text-muted-foreground" title={repoCwd}>
          {t('editor.workspaceFolders', { count: workspaceFolders.length })}
        </span>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={handleRefresh} aria-label={t('editor.refresh')}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <DiffViewerFileTreeVirtualList<ExplorerPanelRow>
        rows={panelRows}
        getRowKey={getExplorerPanelRowKey}
        estimateRowHeight={row => (row.kind === 'section-header' ? EXPLORER_SECTION_HEADER_HEIGHT : EXPLORER_TREE_ROW_HEIGHT)}
        overscan={10}
        className="px-0 py-1"
        emptyState={<p className="px-2 py-4 text-[12px] text-muted-foreground">{t('editor.explorerEmpty')}</p>}
        renderRow={renderPanelRow}
      />
    </div>
  )
}
