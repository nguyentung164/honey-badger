'use client'

import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GitFileStatusCode } from '@/components/git/GitFileStatusBadge'
import { Button } from '@/components/ui/button'
import { DiffViewerFileTreeVirtualList } from '@/pages/diffviewer/DiffViewerFileTreeVirtualList'
import { EditorExplorerContextMenu } from '@/pages/editor/explorer/EditorExplorerContextMenu'
import { EditorExplorerSectionHeader } from '@/pages/editor/explorer/EditorExplorerSectionHeader'
import { EditorOpenEditorRow } from '@/pages/editor/explorer/EditorOpenEditorRow'
import { ExplorerPhantomRow, ExplorerRow, type ExplorerRowHandlers } from '@/pages/editor/explorer/EditorExplorerRow'
import { ExplorerDeleteConfirmDialog } from '@/pages/editor/explorer/ExplorerDeleteConfirmDialog'
import { getExplorerClipboard, parentRelativeDir, subscribeExplorerClipboard } from '@/pages/editor/explorer/explorerClipboard'
import { buildExplorerDisplayRows, type ExplorerInlineEdit } from '@/pages/editor/explorer/explorerDisplayRows'
import { pruneDeletedSelectionPaths, rangeSelectPaths, remapSelectionPaths, resolveContextMenuPaths, toggleSelectionPath } from '@/pages/editor/explorer/explorerSelection'
import { EXPLORER_TREE_ROW_HEIGHT } from '@/pages/editor/explorer/explorerTreeConstants'
import {
  buildExplorerPanelRows,
  EXPLORER_SECTION_HEADER_HEIGHT,
  getExplorerPanelRowKey,
  type ExplorerPanelRow,
} from '@/pages/editor/explorer/explorerSectionRows'
import { useExplorerFileOperations } from '@/pages/editor/explorer/useExplorerFileOperations'
import type { EditorTabMenuActions } from '@/pages/editor/editor-area/EditorTabContextMenu'
import type { EditorTabSummary } from '@/pages/editor/hooks/useEditorTabSelectors'
import {
  readExplorerExpandedSections,
  writeExplorerExpandedSections,
  type EditorExplorerSectionId,
} from '@/pages/editor/hooks/useEditorExplorerSectionPrefs'
import { useEditorSettings } from '@/pages/editor/hooks/useEditorSettings'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'
import { useExplorerAutoReveal } from '@/pages/editor/hooks/useExplorerAutoReveal'
import { useProjectFileTree } from '@/pages/editor/hooks/useProjectFileTree'
import { normalizeRepoRelativePath } from '@/pages/editor/lib/fileTreePaths'
import type { FileTreeRow } from '@/pages/editor/lib/flattenFileTree'

type PanelFocus =
  | { kind: 'open-editor'; tabId: string }
  | { kind: 'tree'; path: string }

type NavigablePanelRow = Exclude<ExplorerPanelRow, { kind: 'section-header' }>

function panelFocusFromTreePath(path: string): PanelFocus {
  return { kind: 'tree', path }
}

function panelFocusFromOpenEditor(tabId: string): PanelFocus {
  return { kind: 'open-editor', tabId }
}

function panelFocusMatchesRow(focus: PanelFocus | null, row: NavigablePanelRow): boolean {
  if (!focus) return false
  if (focus.kind === 'open-editor' && row.kind === 'open-editor') return focus.tabId === row.tab.id
  if (focus.kind === 'tree' && row.kind === 'tree' && row.displayRow.kind === 'tree') {
    return focus.path === row.displayRow.row.node.relativePath
  }
  return false
}

type EditorExplorerPanelProps = {
  repoCwd: string
  activeTabId?: string | null
  activeRelativePath?: string
  revealRequest?: { path: string; seq: number } | null
  tabs?: readonly EditorTabSummary[]
  onSelectTab?: (tabId: string) => void
  onCloseTab?: (tabId: string) => void
  onCloseAllTabs?: () => void
  onPinTab?: (tabId: string) => void
  getTabGitStatus?: (relativePath: string) => GitFileStatusCode | null
  getTabMenuActions?: (tab: EditorTabSummary, tabIndex: number) => EditorTabMenuActions
  onOpenFile: (relativePath: string, opts?: { preview?: boolean; pin?: boolean }) => void
  onOpenCompare?: (leftPath: string, rightPath: string) => void
  getGitStatus: (relativePath: string, isDir: boolean) => GitFileStatusCode | null
  refreshGitDecorations: () => void | Promise<void>
  onOpenInTerminal?: (absoluteCwd: string) => void
}

function isExplorerFocused(container: HTMLDivElement | null): boolean {
  if (!container) return false
  const active = document.activeElement
  if (!active) return false
  if (container.contains(active)) return true
  if (active.tagName === 'INPUT' && container.contains(active)) return true
  return active === document.body
}

function pathsToDeleteTargets(rows: readonly FileTreeRow[], paths: ReadonlySet<string>) {
  return [...paths].map(relativePath => {
    const row = rows.find(r => r.node.relativePath === relativePath)
    const isDir = row?.node.kind === 'directory'
    const name = relativePath.split('/').pop() ?? relativePath
    return { relativePath, isDir: Boolean(isDir), name }
  })
}

export function EditorExplorerPanel({
  repoCwd,
  activeTabId,
  activeRelativePath,
  revealRequest,
  tabs = [],
  onSelectTab,
  onCloseTab,
  onCloseAllTabs,
  onPinTab,
  getTabGitStatus,
  getTabMenuActions,
  onOpenFile,
  onOpenCompare,
  getGitStatus,
  refreshGitDecorations,
  onOpenInTerminal,
}: EditorExplorerPanelProps) {
  const { t } = useTranslation()
  const explorerAutoReveal = useEditorSettings(s => s.explorerAutoReveal)
  const containerRef = useRef<HTMLDivElement>(null)
  const { rows, expandedPaths, loadingPaths, toggleExpand, refresh, ensurePathRevealed } = useProjectFileTree(repoCwd)

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set())
  const [anchorPath, setAnchorPath] = useState<string | null>(null)
  const [focusPath, setFocusPath] = useState<string | null>(null)
  const anchorPathRef = useRef<string | null>(null)
  const focusPathRef = useRef<string | null>(null)
  anchorPathRef.current = anchorPath
  focusPathRef.current = focusPath
  const [inlineEdit, setInlineEdit] = useState<ExplorerInlineEdit | null>(null)
  const [deleteTargets, setDeleteTargets] = useState<Array<{ relativePath: string; isDir: boolean; name: string }> | null>(null)
  const [clipboardVersion, setClipboardVersion] = useState(0)
  const [expandedSections, setExpandedSections] = useState<Set<EditorExplorerSectionId>>(() => readExplorerExpandedSections())
  const [panelFocus, setPanelFocus] = useState<PanelFocus | null>(null)

  const toggleSection = useCallback((sectionId: EditorExplorerSectionId) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      writeExplorerExpandedSections(next)
      return next
    })
  }, [])

  const renameExplorerPath = useEditorWorkspace(s => s.renameExplorerPath)
  const closeTabsForExplorerDelete = useEditorWorkspace(s => s.closeTabsForExplorerDelete)

  useEffect(() => {
    if (!explorerAutoReveal || !activeRelativePath) return
    const normalized = normalizeRepoRelativePath(activeRelativePath)
    setSelectedPaths(new Set([normalized]))
    setAnchorPath(normalized)
    setFocusPath(normalized)
    setPanelFocus(panelFocusFromTreePath(normalized))
  }, [activeRelativePath, activeTabId, explorerAutoReveal])

  useEffect(() => {
    if (!revealRequest) return
    setExpandedSections(prev => {
      if (prev.has('workspace')) return prev
      const next = new Set(prev)
      next.add('workspace')
      writeExplorerExpandedSections(next)
      return next
    })
    const normalized = normalizeRepoRelativePath(revealRequest.path)
    if (!normalized) {
      setSelectedPaths(new Set())
      setAnchorPath(null)
      setFocusPath(null)
      return
    }
    setSelectedPaths(new Set([normalized]))
    setAnchorPath(normalized)
    setFocusPath(normalized)
    setPanelFocus(panelFocusFromTreePath(normalized))
  }, [revealRequest])

  const handleRefresh = useCallback(() => {
    refresh()
    void refreshGitDecorations()
  }, [refresh, refreshGitDecorations])

  const handlePathRenamed = useCallback(
    (from: string, to: string) => {
      renameExplorerPath(from, to)
      setSelectedPaths(prev => remapSelectionPaths(prev, from, to))
      setAnchorPath(prev =>
        prev
          ? (remapSelectionPaths(new Set([prev]), from, to)
            .values()
            .next().value ?? null)
          : null
      )
      setFocusPath(prev =>
        prev
          ? (remapSelectionPaths(new Set([prev]), from, to)
            .values()
            .next().value ?? null)
          : null
      )
    },
    [renameExplorerPath]
  )

  const handlePathDeleted = useCallback(
    (relativePath: string, isDir: boolean) => {
      closeTabsForExplorerDelete(relativePath, isDir)
      setSelectedPaths(prev => pruneDeletedSelectionPaths(prev, relativePath, isDir))
      setAnchorPath(prev => {
        if (!prev) return prev
        const next = pruneDeletedSelectionPaths(new Set([prev]), relativePath, isDir)
        return next.size > 0 ? [...next][0] : null
      })
      setFocusPath(prev => {
        if (!prev) return prev
        const next = pruneDeletedSelectionPaths(new Set([prev]), relativePath, isDir)
        return next.size > 0 ? [...next][0] : null
      })
    },
    [closeTabsForExplorerDelete]
  )

  const { revealScroll, cancelRevealSession } = useExplorerAutoReveal({
    enabled: explorerAutoReveal,
    activeTabId,
    activeRelativePath,
    requestedReveal: revealRequest,
    rows,
    ensurePathRevealed,
  })

  const toggleExpandUser = useCallback(
    (path: string) => {
      cancelRevealSession()
      toggleExpand(path)
    },
    [cancelRevealSession, toggleExpand]
  )

  const ensureParentExpanded = useCallback(
    async (parentDir: string) => {
      if (parentDir !== '' && !expandedPaths.has(parentDir)) {
        toggleExpandUser(parentDir)
      }
      if (parentDir !== '') {
        await ensurePathRevealed(parentDir)
      }
    },
    [ensurePathRevealed, expandedPaths, toggleExpandUser]
  )

  const fileOps = useExplorerFileOperations({
    repoCwd,
    onOpenFile,
    onOpenCompare,
    onRefresh: handleRefresh,
    onPathRenamed: handlePathRenamed,
    onPathDeleted: handlePathDeleted,
    onOpenInTerminal,
    ensureParentExpanded,
    setInlineEdit,
    setDeleteTarget: setDeleteTargets,
  })

  const fileOpsRef = useRef(fileOps)
  fileOpsRef.current = fileOps

  useEffect(() => subscribeExplorerClipboard(() => setClipboardVersion(v => v + 1)), [])

  const cutPaths = useMemo(() => {
    const clip = getExplorerClipboard()
    if (!clip?.cut || clip.repoCwd !== repoCwd) return new Set<string>()
    return new Set(clip.paths)
  }, [clipboardVersion, repoCwd])

  const displayRows = useMemo(() => buildExplorerDisplayRows(rows, inlineEdit), [inlineEdit, rows])

  const panelRows = useMemo(
    () => buildExplorerPanelRows(tabs, displayRows, expandedSections),
    [tabs, displayRows, expandedSections]
  )

  const navigablePanelRows = useMemo(
    () => panelRows.filter((row): row is NavigablePanelRow => row.kind !== 'section-header'),
    [panelRows]
  )

  const mappedRevealScroll = useMemo(() => {
    if (!revealScroll) return null
    const panelIndex = panelRows.findIndex(
      row => row.kind === 'tree' && row.displayRow.kind === 'tree' && row.displayRow.row.node.relativePath === revealScroll.path
    )
    if (panelIndex < 0) return null
    return { index: panelIndex, sequence: revealScroll.sequence }
  }, [panelRows, revealScroll])

  const handleExplorerSelect = useCallback(
    (path: string, event: React.MouseEvent) => {
      const ctrl = event.ctrlKey || event.metaKey
      const shift = event.shiftKey

      setSelectedPaths(prev => {
        if (shift) {
          const anchor = anchorPathRef.current ?? focusPathRef.current ?? path
          return rangeSelectPaths(rows, anchor, path)
        }
        if (ctrl) return toggleSelectionPath(prev, path)
        return new Set([path])
      })

      if (!shift) setAnchorPath(path)
      setFocusPath(path)
      setPanelFocus(panelFocusFromTreePath(path))
      containerRef.current?.focus({ preventScroll: true })
    },
    [rows]
  )

  const handlersRef = useRef<ExplorerRowHandlers>({
    onSelect: handleExplorerSelect,
    onToggleExpand: toggleExpandUser,
    onOpenFile,
  })

  handlersRef.current = {
    onSelect: handleExplorerSelect,
    onToggleExpand: toggleExpandUser,
    onOpenFile,
  }

  const commitInlineEdit = useCallback(async () => {
    if (!inlineEdit) return
    if (inlineEdit.mode === 'rename') {
      const currentName = inlineEdit.targetPath.split('/').pop() ?? inlineEdit.targetPath
      if (!inlineEdit.value.trim() || inlineEdit.value.trim() === currentName) {
        setInlineEdit(null)
        return
      }
      const ok = await fileOpsRef.current.commitRename(inlineEdit.targetPath, inlineEdit.value)
      if (ok) setInlineEdit(null)
    } else {
      if (!inlineEdit.value.trim()) {
        setInlineEdit(null)
        return
      }
      const ok = await fileOpsRef.current.commitCreate(inlineEdit.parentDir, inlineEdit.value, inlineEdit.createKind)
      setInlineEdit(null)
      if (!ok) {
        setInlineEdit(inlineEdit)
      }
    }
  }, [inlineEdit])

  const cancelInlineEdit = useCallback(() => {
    setInlineEdit(null)
  }, [])

  const renderPanelRow = useCallback(
    (panelRow: ExplorerPanelRow) => {
      if (panelRow.kind === 'section-header') {
        return (
          <EditorExplorerSectionHeader
            sectionId={panelRow.id}
            expanded={expandedSections.has(panelRow.id)}
            count={panelRow.id === 'open-editors' ? tabs.length : undefined}
            onToggle={toggleSection}
            onCloseAll={panelRow.id === 'open-editors' ? onCloseAllTabs : undefined}
          />
        )
      }

      if (panelRow.kind === 'open-editor') {
        const { tab, tabIndex } = panelRow
        return (
          <EditorOpenEditorRow
            tab={tab}
            tabIndex={tabIndex}
            tabCount={tabs.length}
            active={tab.id === activeTabId}
            focused={panelFocus?.kind === 'open-editor' && panelFocus.tabId === tab.id}
            gitStatus={tab.isCompare ? null : (getTabGitStatus?.(tab.relativePath) ?? null)}
            tabMenuActions={getTabMenuActions?.(tab, tabIndex) ?? null}
            onSelectTab={id => onSelectTab?.(id)}
            onCloseTab={id => onCloseTab?.(id)}
            onPinTab={onPinTab}
            onFocusRow={() => setPanelFocus(panelFocusFromOpenEditor(tab.id))}
          />
        )
      }

      const displayRow = panelRow.displayRow
      if (displayRow.kind === 'phantom') {
        if (!inlineEdit || inlineEdit.mode !== 'create' || inlineEdit.sessionId !== displayRow.sessionId) return null
        return (
          <ExplorerPhantomRow
            depth={displayRow.depth}
            createKind={displayRow.createKind}
            value={inlineEdit.value}
            onChange={value => setInlineEdit({ ...inlineEdit, value })}
            onCommit={() => void commitInlineEdit()}
            onCancel={cancelInlineEdit}
          />
        )
      }

      const { row } = displayRow
      const { relativePath } = row.node
      const isDir = row.node.kind === 'directory'
      const isRenaming = inlineEdit?.mode === 'rename' && inlineEdit.targetPath === relativePath
      const menuPaths = resolveContextMenuPaths(selectedPaths, relativePath)

      return (
        <EditorExplorerContextMenu menuPaths={menuPaths} targetPath={relativePath} isDir={isDir} rows={rows} actions={fileOps}>
          <div className="w-full min-w-0">
            <ExplorerRow
              row={row}
              isSelected={selectedPaths.has(row.node.relativePath)}
              isExpanded={expandedPaths.has(row.node.relativePath)}
              isLoading={loadingPaths.has(row.node.relativePath)}
              gitStatus={getGitStatus(row.node.relativePath, isDir)}
              isCut={cutPaths.has(relativePath)}
              isEditing={isRenaming}
              editValue={isRenaming ? inlineEdit.value : undefined}
              editSelectAll={isRenaming}
              onEditValueChange={value => {
                if (inlineEdit?.mode === 'rename') setInlineEdit({ ...inlineEdit, value })
              }}
              onEditCommit={() => void commitInlineEdit()}
              onEditCancel={cancelInlineEdit}
              handlersRef={handlersRef}
            />
          </div>
        </EditorExplorerContextMenu>
      )
    },
    [
      activeTabId,
      cancelInlineEdit,
      commitInlineEdit,
      cutPaths,
      expandedPaths,
      expandedSections,
      fileOps,
      getGitStatus,
      getTabGitStatus,
      getTabMenuActions,
      inlineEdit,
      loadingPaths,
      onCloseAllTabs,
      onCloseTab,
      onPinTab,
      onSelectTab,
      panelFocus,
      rows,
      selectedPaths,
      tabs.length,
      toggleSection,
    ]
  )

  const rootName = repoCwd
    ? (repoCwd
      .replace(/[/\\]+$/, '')
      .split(/[/\\]/)
      .pop() ?? repoCwd)
    : t('editor.noWorkspace')

  const movePanelFocus = useCallback(
    (delta: number, extend: boolean) => {
      if (inlineEdit) return
      if (navigablePanelRows.length === 0) return

      const currentIndex = panelFocus
        ? navigablePanelRows.findIndex(row => panelFocusMatchesRow(panelFocus, row))
        : -1
      const nextIndex = Math.max(0, Math.min(navigablePanelRows.length - 1, (currentIndex < 0 ? 0 : currentIndex) + delta))
      const nextRow = navigablePanelRows[nextIndex]

      if (nextRow.kind === 'open-editor') {
        setPanelFocus(panelFocusFromOpenEditor(nextRow.tab.id))
        if (!extend) {
          setSelectedPaths(new Set())
          setAnchorPath(null)
          setFocusPath(null)
        }
        return
      }

      if (nextRow.kind !== 'tree' || nextRow.displayRow.kind !== 'tree') return
      const nextPath = nextRow.displayRow.row.node.relativePath
      if (extend) {
        const anchor = anchorPath ?? focusPath ?? nextPath
        setSelectedPaths(rangeSelectPaths(rows, anchor, nextPath))
        if (!anchorPath) setAnchorPath(anchor)
      } else {
        setSelectedPaths(new Set([nextPath]))
        setAnchorPath(nextPath)
      }
      setFocusPath(nextPath)
      setPanelFocus(panelFocusFromTreePath(nextPath))
    },
    [anchorPath, focusPath, inlineEdit, navigablePanelRows, panelFocus, rows]
  )

  const resolveFocusedTreeRow = useCallback((): FileTreeRow | null => {
    if (panelFocus?.kind === 'tree') {
      return rows.find(r => r.node.relativePath === panelFocus.path) ?? null
    }
    if (focusPath) return rows.find(r => r.node.relativePath === focusPath) ?? null
    return null
  }, [focusPath, panelFocus, rows])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (inlineEdit) return
      if (!isExplorerFocused(containerRef.current)) return

      const focusRow = resolveFocusedTreeRow()
      const isMod = e.ctrlKey || e.metaKey
      const selectionCount = selectedPaths.size
      const openEditorFocused = panelFocus?.kind === 'open-editor'

      if (isMod && e.key.toLowerCase() === 'a' && !openEditorFocused) {
        e.preventDefault()
        setSelectedPaths(new Set(rows.map(r => r.node.relativePath)))
        if (rows.length > 0) {
          setAnchorPath(rows[0].node.relativePath)
          setFocusPath(rows[rows.length - 1].node.relativePath)
          setPanelFocus(panelFocusFromTreePath(rows[rows.length - 1].node.relativePath))
        }
        return
      }

      if (isMod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        void fileOpsRef.current.undo()
        return
      }
      if (isMod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        void fileOpsRef.current.redo()
        return
      }

      if (!openEditorFocused && selectionCount > 0 && isMod && e.key.toLowerCase() === 'x') {
        e.preventDefault()
        fileOpsRef.current.cut([...selectedPaths])
        return
      }
      if (!openEditorFocused && selectionCount > 0 && isMod && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        fileOpsRef.current.copy([...selectedPaths])
        return
      }
      if (!openEditorFocused && focusRow && isMod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        const pasteDir = focusRow.node.kind === 'directory' ? focusRow.node.relativePath : parentRelativeDir(focusRow.node.relativePath)
        void fileOpsRef.current.pasteInto(pasteDir)
        return
      }

      if (!panelFocus && e.key !== 'ArrowDown') return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          movePanelFocus(1, e.shiftKey)
          break
        case 'ArrowUp':
          e.preventDefault()
          movePanelFocus(-1, e.shiftKey)
          break
        case 'ArrowRight':
          if (openEditorFocused) break
          if (focusRow?.node.kind === 'directory' && !expandedPaths.has(focusRow.node.relativePath)) {
            e.preventDefault()
            toggleExpandUser(focusRow.node.relativePath)
          }
          break
        case 'ArrowLeft':
          if (openEditorFocused) break
          if (focusRow?.node.kind === 'directory' && expandedPaths.has(focusRow.node.relativePath)) {
            e.preventDefault()
            toggleExpandUser(focusRow.node.relativePath)
          }
          break
        case 'Enter':
          e.preventDefault()
          if (openEditorFocused && panelFocus?.kind === 'open-editor') {
            onSelectTab?.(panelFocus.tabId)
            break
          }
          if (!focusRow) break
          if (focusRow.node.kind === 'directory') toggleExpandUser(focusRow.node.relativePath)
          else onOpenFile(focusRow.node.relativePath, { preview: true })
          break
        case 'F2':
          if (openEditorFocused || selectionCount !== 1 || !focusRow) return
          e.preventDefault()
          fileOpsRef.current.startRename(focusRow.node.relativePath)
          break
        case 'Delete':
          if (openEditorFocused) {
            if (panelFocus?.kind === 'open-editor') {
              e.preventDefault()
              onCloseTab?.(panelFocus.tabId)
            }
            return
          }
          if (selectionCount === 0) return
          e.preventDefault()
          fileOpsRef.current.requestDelete(pathsToDeleteTargets(rows, selectedPaths))
          break
        default:
          break
      }
    },
    [
      expandedPaths,
      inlineEdit,
      movePanelFocus,
      onCloseTab,
      onOpenFile,
      onSelectTab,
      panelFocus,
      resolveFocusedTreeRow,
      rows,
      selectedPaths,
      toggleExpandUser,
    ]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col" tabIndex={0} role="tree" aria-label={t('editor.explorer')}>
      <div className="flex h-6 shrink-0 items-center justify-between gap-1 border-b px-2">
        <span className="truncate text-[11px] font-bold uppercase" title={repoCwd}>
          {rootName}
        </span>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={handleRefresh} aria-label={t('editor.refresh')}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <DiffViewerFileTreeVirtualList<ExplorerPanelRow>
        rows={panelRows}
        getRowKey={getExplorerPanelRowKey}
        estimateRowHeight={row =>
          row.kind === 'section-header' ? EXPLORER_SECTION_HEADER_HEIGHT : EXPLORER_TREE_ROW_HEIGHT
        }
        revealScroll={mappedRevealScroll}
        overscan={10}
        className="px-0 py-1"
        emptyState={<p className="px-2 py-4 text-[12px] text-muted-foreground">{t('editor.explorerEmpty')}</p>}
        renderRow={renderPanelRow}
      />
      <ExplorerDeleteConfirmDialog
        targets={deleteTargets}
        onOpenChange={open => {
          if (!open) setDeleteTargets(null)
        }}
        onConfirm={() => {
          if (!deleteTargets?.length) return
          void fileOpsRef.current.executeDeleteMany(deleteTargets)
          setDeleteTargets(null)
        }}
      />
    </div>
  )
}
