'use client'

import { ChevronDown, ChevronRight, ExternalLink, Folder, FolderOpen, RotateCcw, SquareMinus, SquarePlus } from 'lucide-react'
import type React from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import toast from '@/components/ui-elements/Toast'
import { GitFileStatusBadge, normalizeGitFileStatus, type GitFileStatusCode } from '@/components/git/GitFileStatusBadge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { cn } from '@/lib/utils'
import { DiffViewerFileTreeToolbar } from './DiffViewerFileTreeToolbar'
import {
  buildDiffFileTreeSections,
  collectAllFolderIds,
  collectExpandedFolderIdsForFile,
  collectVisibleFileIndices,
  type DiffFileTreeFileNode,
  type DiffFileTreeFolderNode,
  type DiffFileTreeGroupNode,
  type DiffFileTreeNode,
  type DiffFileTreeSection,
  filterDiffFileTreeSections,
  rangeSelectIndices,
  resolveContextMenuIndices,
} from './diffViewerFileTree'
import { isGitEntryStaged, isGitEntryUnstaged } from './diffViewerGitFiles'
import type { DiffViewerFileEntry } from './diffViewerPayload'
import { useDiffViewerTreePanelPrefs, persistStagingChangesPanelSize, persistStagingStagedPanelSize } from './useDiffViewerTreePanelPrefs'

export type DiffViewerFileTreeBulkAction = 'stage' | 'unstage' | 'revert' | 'reveal' | 'openInEditor'

interface DiffViewerFileTreePanelProps {
  files: DiffViewerFileEntry[]
  activeIndex: number
  splitStaging?: boolean
  showStageActions?: boolean
  disabled?: boolean
  isRefreshing?: boolean
  /** Rendered below Staged when split staging (e.g. embedded commit message on MainPage). */
  stagingFooter?: React.ReactNode
  onSelectFile: (index: number) => void
  onBulkAction: (action: DiffViewerFileTreeBulkAction, indices: number[]) => void
  onRefresh?: () => void | Promise<void>
}

const STAGING_CHANGES_PANEL_ID = 'diff-tree-changes-section'
const STAGING_STAGED_PANEL_ID = 'diff-tree-staged-section'
const STAGING_COMMIT_PANEL_ID = 'diff-tree-commit-section'

const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

const TreeFileRow = memo(function TreeFileRow({
  node,
  isActive,
  isSelected,
  flatView,
  interactionDisabled,
  onSelect,
}: {
  node: DiffFileTreeFileNode
  isActive: boolean
  isSelected: boolean
  flatView?: boolean
  interactionDisabled?: boolean
  onSelect: (index: number, event: React.MouseEvent) => void
}) {
  const displayName = flatView ? node.entry.filePath : node.fileName
  return (
    <button
      type="button"
      onClick={event => {
        if (interactionDisabled) return
        onSelect(node.index, event)
      }}
      className={cn(
        'flex w-full min-w-0 cursor-default items-center gap-1.5 px-2 py-1 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isActive && 'bg-primary text-primary-foreground',
        !isActive && isSelected && 'bg-primary/15 text-primary',
        !isActive && !isSelected && 'text-foreground hover:bg-muted/60',
        interactionDisabled && 'opacity-60'
      )}
      title={node.entry.filePath}
      style={noDragStyle}
    >
      <GitFileStatusBadge status={node.entry.fileStatus} />
      <span className={cn('min-w-0 flex-1 truncate', isActive && 'text-primary-foreground', !isActive && isSelected && 'text-primary')}>{displayName}</span>
    </button>
  )
})

type TreeFileRowItemProps = {
  node: DiffFileTreeFileNode
  isActive: boolean
  isSelected: boolean
  flatView: boolean
  interactionDisabled: boolean
  showStageActions: boolean
  sectionFlatIndices: number[]
  files: DiffViewerFileEntry[]
  getContextMenuIndices: (nodeIndex: number) => number[]
  onSelect: (index: number, event: React.MouseEvent, sectionFlatIndices: number[]) => void
  onContextMenuOpenChange: (index: number) => (open: boolean) => void
  onContextMenuAction: (action: DiffViewerFileTreeBulkAction, nodeIndex: number, scope: 'unstaged' | 'staged' | 'all') => void
}

const TreeFileRowItem = memo(function TreeFileRowItem({
  node,
  isActive,
  isSelected,
  flatView,
  interactionDisabled,
  showStageActions,
  sectionFlatIndices,
  files,
  getContextMenuIndices,
  onSelect,
  onContextMenuOpenChange,
  onContextMenuAction,
}: TreeFileRowItemProps) {
  const { t } = useTranslation()
  const menuIndices = getContextMenuIndices(node.index)
  const unstagedIndices = menuIndices.filter(index => isGitEntryUnstaged(files[index]))
  const stagedIndices = menuIndices.filter(index => isGitEntryStaged(files[index]))
  const canStage = showStageActions && unstagedIndices.length > 0
  const canUnstage = showStageActions && stagedIndices.length > 0
  const canRevert = showStageActions && unstagedIndices.length > 0

  const handleSelect = useCallback(
    (index: number, event: React.MouseEvent) => {
      onSelect(index, event, sectionFlatIndices)
    },
    [onSelect, sectionFlatIndices]
  )

  return (
    <ContextMenu onOpenChange={onContextMenuOpenChange(node.index)}>
      <ContextMenuTrigger asChild disabled={interactionDisabled}>
        <div className="w-full min-w-0" style={noDragStyle}>
          <TreeFileRow
            node={node}
            isActive={isActive}
            isSelected={isSelected}
            flatView={flatView}
            interactionDisabled={interactionDisabled}
            onSelect={handleSelect}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="z-[200] min-w-48" style={noDragStyle}>
        {canStage ? (
          <ContextMenuItem onSelect={() => onContextMenuAction('stage', node.index, 'unstaged')}>
            {unstagedIndices.length > 1 ? t('dialog.diffViewer.treeStageSelected', { count: unstagedIndices.length }) : t('git.stageFile')}
            <ContextMenuShortcut>
              <SquarePlus className="ml-3 h-4 w-4" />
            </ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
        {canUnstage ? (
          <ContextMenuItem onSelect={() => onContextMenuAction('unstage', node.index, 'staged')}>
            {stagedIndices.length > 1 ? t('dialog.diffViewer.treeUnstageSelected', { count: stagedIndices.length }) : t('git.unstageFile')}
            <ContextMenuShortcut>
              <SquareMinus className="ml-3 h-4 w-4" />
            </ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
        {canRevert ? (
          <ContextMenuItem variant="destructive" onSelect={() => onContextMenuAction('revert', node.index, 'unstaged')}>
            {unstagedIndices.length > 1 ? t('dialog.diffViewer.treeRevertSelected', { count: unstagedIndices.length }) : t('contextMenu.discardChanges')}
            <ContextMenuShortcut>
              <RotateCcw className="ml-3 h-4 w-4" />
            </ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
        {showStageActions && (canStage || canUnstage || canRevert) ? <ContextMenuSeparator /> : null}
        <ContextMenuItem onSelect={() => onContextMenuAction('openInEditor', node.index, 'all')}>
          {t('dialog.diffViewer.openInEditor')}
          <ContextMenuShortcut>
            <ExternalLink className="ml-3 h-4 w-4" />
          </ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onContextMenuAction('reveal', node.index, 'all')}>{t('dialog.diffViewer.revealInExplorer')}</ContextMenuItem>
        {menuIndices.length > 1 ? (
          <ContextMenuItem disabled className="text-muted-foreground">
            {t('dialog.diffViewer.treeSelectedCount', { count: menuIndices.length })}
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
})

function TreeGroupRow({ node, depth }: { node: DiffFileTreeGroupNode; depth: number }) {
  return (
    <div
      className="flex w-full min-w-0 items-center gap-1.5 px-2 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
      style={{ paddingLeft: `${depth * 12 + 8}px`, ...noDragStyle }}
    >
      <Folder className="h-3.5 w-3.5 shrink-0 opacity-70" />
      <span className="min-w-0 truncate normal-case">{node.label}</span>
    </div>
  )
}

function sectionHeaderClass(sectionId: DiffFileTreeSection['id']): string {
  if (sectionId === 'changes') {
    return 'bg-amber-500/10 hover:bg-amber-500/15'
  }
  if (sectionId === 'staged') {
    return 'bg-emerald-500/10 hover:bg-emerald-500/15'
  }
  return 'bg-muted/40 hover:bg-muted/55'
}

function sectionContentClass(sectionId: DiffFileTreeSection['id']): string {
  if (sectionId === 'changes') {
    return 'bg-amber-500/[0.07] dark:bg-amber-500/2'
  }
  if (sectionId === 'staged') {
    return 'bg-emerald-500/[0.07] dark:bg-emerald-500/2'
  }
  return 'bg-muted/35'
}

const SECTION_STATUS_COUNT_ORDER: GitFileStatusCode[] = [
  'modified',
  'added',
  'deleted',
  'renamed',
  'untracked',
  'conflicted',
  'staged',
]

function countSectionFileStatuses(files: DiffViewerFileEntry[], indices: readonly number[]): Map<GitFileStatusCode, number> {
  const counts = new Map<GitFileStatusCode, number>()
  for (const index of indices) {
    const status = normalizeGitFileStatus(files[index]?.fileStatus)
    if (!status) continue
    counts.set(status, (counts.get(status) ?? 0) + 1)
  }
  return counts
}

const SectionStatusCounts = memo(function SectionStatusCounts({
  files,
  indices,
}: {
  files: DiffViewerFileEntry[]
  indices: readonly number[]
}) {
  const counts = useMemo(() => countSectionFileStatuses(files, indices), [files, indices])
  const entries = SECTION_STATUS_COUNT_ORDER.filter(status => (counts.get(status) ?? 0) > 0)
  if (entries.length === 0) {
    return (
      <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
        0
      </span>
    )
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {entries.map(status => (
        <span key={status} className="inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
          <GitFileStatusBadge status={status} />
          <span>{counts.get(status)}</span>
        </span>
      ))}
    </div>
  )
})

function renderSectionHeaderCounts(section: DiffFileTreeSection, files: DiffViewerFileEntry[]) {
  if (section.id === 'changes' || section.id === 'staged') {
    return <SectionStatusCounts files={files} indices={section.flatFileIndices} />
  }
  return (
    <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
      {section.flatFileIndices.length}
    </span>
  )
}

function countSelectedInSection(sectionIndices: readonly number[], selectedIndices: Set<number>): number {
  let count = 0
  for (const index of sectionIndices) {
    if (selectedIndices.has(index)) count++
  }
  return count
}

const SectionHeaderTitle = memo(function SectionHeaderTitle({
  section,
  selectedIndices,
}: {
  section: DiffFileTreeSection
  selectedIndices: Set<number>
}) {
  const { t } = useTranslation()
  const total = section.flatFileIndices.length
  const selected = countSelectedInSection(section.flatFileIndices, selectedIndices)
  const showSelection = (section.id === 'changes' || section.id === 'staged') && selected > 0

  return (
    <span className="min-w-0 flex-1 truncate">
      {t(section.labelKey)}
      {showSelection ? (
        <span className="font-normal text-muted-foreground">
          {' '}
          {t('dialog.diffViewer.treeSectionSelected', { selected, total })}
        </span>
      ) : null}
    </span>
  )
})

function TreeFolderRow({
  node,
  depth,
  expanded,
  onToggle,
  children,
}: {
  node: DiffFileTreeFolderNode
  depth: number
  expanded: boolean
  onToggle: (folderId: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        className="flex w-full min-w-0 items-center gap-1 px-2 py-1 text-left text-xs font-medium text-muted-foreground hover:bg-muted/60"
        style={{ paddingLeft: `${depth * 12 + 8}px`, ...noDragStyle }}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        {expanded ? <FolderOpen className="h-3.5 w-3.5 shrink-0" /> : <Folder className="h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0 truncate">{node.name}</span>
      </button>
      {expanded ? <div className="min-w-0">{children}</div> : null}
    </div>
  )
}

function resolveShiftAnchor(flat: number[], anchorIndex: number | null, activeIndex: number, targetIndex: number): number {
  if (anchorIndex != null && flat.includes(anchorIndex)) return anchorIndex
  if (flat.includes(activeIndex)) return activeIndex
  return targetIndex
}

export function DiffViewerFileTreePanel({
  files,
  activeIndex,
  splitStaging = false,
  showStageActions = false,
  disabled = false,
  isRefreshing = false,
  stagingFooter,
  onSelectFile,
  onBulkAction,
  onRefresh,
}: DiffViewerFileTreePanelProps) {
  const { t } = useTranslation()
  const {
    viewMode,
    sortBy,
    groupByFolder,
    statusFilter,
    stagingChangesPanelSize,
    toggleViewMode,
    setSortBy,
    toggleGroupByFolder,
    setStatusFilter,
    stagingStagedPanelSize,
  } = useDiffViewerTreePanelPrefs()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => new Set())
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null)
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set())
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(() => new Set(['changes', 'staged', 'files']))
  const activeIndexRef = useRef(activeIndex)
  activeIndexRef.current = activeIndex
  const selectedIndicesRef = useRef(selectedIndices)
  selectedIndicesRef.current = selectedIndices
  const filesRef = useRef(files)
  filesRef.current = files
  const treeRootRef = useRef<HTMLDivElement>(null)
  const initialChangesPanelSizeRef = useRef(stagingChangesPanelSize)
  const initialStagedPanelSizeRef = useRef(stagingStagedPanelSize)
  const changesSizeRef = useRef(stagingChangesPanelSize)
  const stagedSizeRef = useRef(stagingStagedPanelSize)
  const stagingChangesPersistRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stagingStagedPersistRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (stagingChangesPersistRef.current) clearTimeout(stagingChangesPersistRef.current)
      if (stagingStagedPersistRef.current) clearTimeout(stagingStagedPersistRef.current)
      persistStagingChangesPanelSize(changesSizeRef.current)
      persistStagingStagedPanelSize(stagedSizeRef.current)
    }
  }, [])

  const flushStagingChangesPersist = useCallback(() => {
    if (stagingChangesPersistRef.current) {
      clearTimeout(stagingChangesPersistRef.current)
      stagingChangesPersistRef.current = null
    }
    persistStagingChangesPanelSize(changesSizeRef.current)
  }, [])

  const flushStagingStagedPersist = useCallback(() => {
    if (stagingStagedPersistRef.current) {
      clearTimeout(stagingStagedPersistRef.current)
      stagingStagedPersistRef.current = null
    }
    persistStagingStagedPanelSize(stagedSizeRef.current)
  }, [])

  const handleChangesLayoutChanged = useCallback((layout: Record<string, number | undefined>) => {
    const changes = layout[STAGING_CHANGES_PANEL_ID]
    if (typeof changes !== 'number') return
    changesSizeRef.current = changes
    if (stagingChangesPersistRef.current) clearTimeout(stagingChangesPersistRef.current)
    stagingChangesPersistRef.current = setTimeout(() => {
      persistStagingChangesPanelSize(changesSizeRef.current)
      stagingChangesPersistRef.current = null
    }, 300)
  }, [])

  const handleInnerStagingLayoutChanged = useCallback((layout: Record<string, number | undefined>) => {
    const staged = layout[STAGING_STAGED_PANEL_ID]
    if (typeof staged !== 'number') return
    stagedSizeRef.current = staged
    if (stagingStagedPersistRef.current) clearTimeout(stagingStagedPersistRef.current)
    stagingStagedPersistRef.current = setTimeout(() => {
      persistStagingStagedPanelSize(stagedSizeRef.current)
      stagingStagedPersistRef.current = null
    }, 300)
  }, [])

  const baseSections = useMemo(
    () =>
      buildDiffFileTreeSections(files, {
        splitStaging,
        viewMode,
        sortBy,
        groupByFolder,
        statusFilter,
      }),
    [files, splitStaging, viewMode, sortBy, groupByFolder, statusFilter]
  )

  const allFolderIds = useMemo(() => collectAllFolderIds(baseSections), [baseSections])

  const sections = useMemo(() => filterDiffFileTreeSections(baseSections, searchQuery), [baseSections, searchQuery])

  const splitSections = useMemo(() => {
    if (!splitStaging) return null
    const changes = sections.find(section => section.id === 'changes')
    const staged = sections.find(section => section.id === 'staged')
    if (!changes || !staged) return null
    return { changes, staged }
  }, [sections, splitStaging])

  const visibleIndices = useMemo(() => collectVisibleFileIndices(sections), [sections])
  const visibleIndicesRef = useRef(visibleIndices)
  visibleIndicesRef.current = visibleIndices

  useEffect(() => {
    setSelectedIndices(prev => {
      const next = new Set([...prev].filter(index => index >= 0 && index < files.length))
      return next.size === prev.size ? prev : next
    })
  }, [files.length])

  useEffect(() => {
    const folderIds = collectExpandedFolderIdsForFile(baseSections, activeIndex)
    if (folderIds.length === 0) return
    setExpandedFolderIds(prev => {
      let changed = false
      const next = new Set(prev)
      for (const id of folderIds) {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [activeIndex, baseSections])

  const handleToggleFolder = useCallback((folderId: string) => {
    setExpandedFolderIds(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }, [])

  const handleCollapseAll = useCallback(() => {
    setExpandedFolderIds(new Set())
  }, [])

  const handleExpandAll = useCallback(() => {
    setExpandedFolderIds(new Set(allFolderIds))
  }, [allFolderIds])

  const unstagedIndices = useMemo(() => files.map((file, index) => (isGitEntryUnstaged(file) ? index : -1)).filter(index => index >= 0), [files])

  const stagedIndices = useMemo(() => files.map((file, index) => (isGitEntryStaged(file) ? index : -1)).filter(index => index >= 0), [files])

  const clearSelection = useCallback(() => {
    setSelectedIndices(new Set())
    setAnchorIndex(null)
    selectedIndicesRef.current = new Set()
  }, [])

  const wasDisabledRef = useRef(disabled)
  useEffect(() => {
    if (wasDisabledRef.current && !disabled) {
      clearSelection()
    }
    wasDisabledRef.current = disabled
  }, [disabled, clearSelection])

  const handleStageAll = useCallback(() => {
    onBulkAction('stage', unstagedIndices)
    clearSelection()
  }, [onBulkAction, unstagedIndices, clearSelection])

  const handleUnstageAll = useCallback(() => {
    onBulkAction('unstage', stagedIndices)
    clearSelection()
  }, [onBulkAction, stagedIndices, clearSelection])

  const handleDiscardAll = useCallback(() => {
    onBulkAction('revert', unstagedIndices)
  }, [onBulkAction, unstagedIndices])

  const selectedUnstagedIndices = useMemo(() => [...selectedIndices].filter(index => isGitEntryUnstaged(files[index])), [files, selectedIndices])

  const canStageSelected = showStageActions && selectedUnstagedIndices.length > 0

  const handleStageSelected = useCallback(() => {
    onBulkAction('stage', selectedUnstagedIndices)
    clearSelection()
  }, [onBulkAction, selectedUnstagedIndices, clearSelection])

  const handleRefresh = useCallback(() => {
    void onRefresh?.()
  }, [onRefresh])

  const copySelectedPaths = useCallback(async () => {
    const selected = selectedIndicesRef.current
    const flat = visibleIndicesRef.current
    const indices =
      selected.size > 0
        ? flat.filter(index => selected.has(index))
        : activeIndexRef.current >= 0
          ? [activeIndexRef.current]
          : []
    const paths = [...new Set(indices.map(index => filesRef.current[index]?.filePath).filter(Boolean) as string[])]
    if (paths.length === 0) return

    try {
      await navigator.clipboard.writeText(paths.join('\n'))
      toast.success(t('toast.copied'))
    } catch {
      toast.error(t('toast.copyFailed'))
    }
  }, [t])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c') return
      if (event.shiftKey || event.altKey) return

      const root = treeRootRef.current
      const target = event.target
      if (!root || !(target instanceof Node) || !root.contains(target)) return
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (target instanceof HTMLElement && target.isContentEditable) return

      event.preventDefault()
      void copySelectedPaths()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [copySelectedPaths])

  const handleSelectFile = useCallback(
    (index: number, event: React.MouseEvent, sectionFlatIndices: number[]) => {
      if (disabled) return

      const isMeta = event.metaKey || event.ctrlKey
      const isShift = event.shiftKey
      const flat = sectionFlatIndices.length > 0 ? sectionFlatIndices : visibleIndices

      if (isShift) {
        const anchor = resolveShiftAnchor(flat, anchorIndex, activeIndexRef.current, index)
        setSelectedIndices(new Set(rangeSelectIndices(flat, anchor, index)))
        if (anchorIndex == null) setAnchorIndex(anchor)
        if (index !== activeIndexRef.current) {
          onSelectFile(index)
        }
        return
      }

      if (isMeta) {
        setSelectedIndices(prev => {
          const next = new Set(prev)
          if (next.has(index)) next.delete(index)
          else next.add(index)
          return next
        })
        setAnchorIndex(index)
        return
      }

      setSelectedIndices(new Set([index]))
      setAnchorIndex(index)
      if (index !== activeIndexRef.current) {
        onSelectFile(index)
      }
    },
    [anchorIndex, disabled, onSelectFile, visibleIndices]
  )

  const ensureContextMenuSelection = useCallback(
    (index: number) => {
      if (disabled) return
      if (selectedIndicesRef.current.has(index)) return
      const next = new Set([index])
      selectedIndicesRef.current = next
      flushSync(() => {
        setSelectedIndices(next)
        setAnchorIndex(index)
      })
    },
    [disabled]
  )

  const createContextMenuOpenChange = useCallback(
    (index: number) => (open: boolean) => {
      if (open) ensureContextMenuSelection(index)
    },
    [ensureContextMenuSelection]
  )

  const runContextMenuBulkAction = useCallback(
    (action: DiffViewerFileTreeBulkAction, nodeIndex: number, scope: 'unstaged' | 'staged' | 'all') => {
      const currentFiles = filesRef.current
      const indices = resolveContextMenuIndices(selectedIndicesRef.current, nodeIndex)
      let targetIndices = indices
      if (scope === 'unstaged') {
        targetIndices = indices.filter(index => isGitEntryUnstaged(currentFiles[index]))
      } else if (scope === 'staged') {
        targetIndices = indices.filter(index => isGitEntryStaged(currentFiles[index]))
      }
      if (targetIndices.length === 0) return
      onBulkAction(action, targetIndices)
      if (action === 'stage' || action === 'unstage') {
        clearSelection()
      }
    },
    [onBulkAction, clearSelection]
  )

  const getContextMenuIndices = useCallback((nodeIndex: number) => {
    return resolveContextMenuIndices(selectedIndicesRef.current, nodeIndex)
  }, [])

  const flatView = viewMode === 'flat' && !groupByFolder

  const renderSectionHeader = useCallback(
    (section: DiffFileTreeSection) => (
      <div
        className={cn(
          'flex w-full shrink-0 items-center gap-1.5 border-b border-border/40 px-2.5 py-2 text-left text-xs font-medium text-foreground',
          sectionHeaderClass(section.id)
        )}
        style={noDragStyle}
      >
        <SectionHeaderTitle section={section} selectedIndices={selectedIndices} />
        {renderSectionHeaderCounts(section, files)}
      </div>
    ),
    [files, selectedIndices, t]
  )

  const renderTreeFileRow = useCallback(
    (node: DiffFileTreeFileNode, sectionFlatIndices: number[]) => (
      <TreeFileRowItem
        node={node}
        isActive={node.index === activeIndex}
        isSelected={selectedIndices.has(node.index)}
        flatView={flatView}
        interactionDisabled={disabled}
        showStageActions={showStageActions}
        sectionFlatIndices={sectionFlatIndices}
        files={files}
        getContextMenuIndices={getContextMenuIndices}
        onSelect={handleSelectFile}
        onContextMenuOpenChange={createContextMenuOpenChange}
        onContextMenuAction={runContextMenuBulkAction}
      />
    ),
    [
      activeIndex,
      createContextMenuOpenChange,
      disabled,
      files,
      flatView,
      getContextMenuIndices,
      handleSelectFile,
      runContextMenuBulkAction,
      selectedIndices,
      showStageActions,
    ]
  )

  const renderTreeNodes = useCallback(
    (nodes: DiffFileTreeNode[], depth: number, sectionFlatIndices: number[]) => (
      <>
        {nodes.map(node => {
          if (node.kind === 'file') {
            return (
              <div key={node.id} style={{ paddingLeft: `${depth * 12 + 8}px`, ...noDragStyle }}>
                {renderTreeFileRow(node, sectionFlatIndices)}
              </div>
            )
          }

          if (node.kind === 'group') {
            return (
              <div key={node.id} className="min-w-0">
                <TreeGroupRow node={node} depth={depth} />
                {node.children.map(child => (
                  <div key={child.id} style={{ paddingLeft: `${(depth + 1) * 12 + 8}px`, ...noDragStyle }}>
                    {renderTreeFileRow(child, sectionFlatIndices)}
                  </div>
                ))}
              </div>
            )
          }

          const expanded = expandedFolderIds.has(node.id) || searchQuery.trim().length > 0
          return (
            <TreeFolderRow key={node.id} node={node} depth={depth} expanded={expanded} onToggle={handleToggleFolder}>
              {renderTreeNodes(node.children, depth + 1, sectionFlatIndices)}
            </TreeFolderRow>
          )
        })}
      </>
    ),
    [expandedFolderIds, handleToggleFolder, renderTreeFileRow, searchQuery]
  )

  const renderSectionBody = useCallback(
    (section: DiffFileTreeSection) => (
      <div className="px-0.5 py-1">
        {section.nodes.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            {section.id === 'staged' ? t('git.noStagedFiles') : t('message.noFilesChanged')}
          </p>
        ) : (
          renderTreeNodes(section.nodes, 0, section.flatFileIndices)
        )}
      </div>
    ),
    [renderTreeNodes, t]
  )

  const renderSplitStagingSections = () => {
    if (!splitSections) return null
    const { changes, staged } = splitSections
    const initialChangesSize = initialChangesPanelSizeRef.current
    const initialLowerSize = Math.max(15, 100 - initialChangesSize)
    const initialStagedSize = initialStagedPanelSizeRef.current
    const initialCommitSize = Math.max(15, 100 - initialStagedSize)

    if (!stagingFooter) {
      return (
        <ResizablePanelGroup
          orientation="vertical"
          className="min-h-0 flex-1"
          onLayoutChanged={handleChangesLayoutChanged}
        >
          <ResizablePanel
            id={STAGING_CHANGES_PANEL_ID}
            defaultSize={`${initialChangesSize}%`}
            minSize="15%"
            className="flex min-h-0 flex-col overflow-hidden"
          >
            {renderSectionHeader(changes)}
            <div className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 py-1', sectionContentClass('changes'))}>
              {renderSectionBody(changes)}
            </div>
          </ResizablePanel>

          <ResizableHandle className="bg-border/50 shrink-0" onPointerUp={flushStagingChangesPersist} />

          <ResizablePanel defaultSize={`${initialLowerSize}%`} minSize="15%" className="flex min-h-0 flex-col overflow-hidden">
            {renderSectionHeader(staged)}
            <div className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 py-1', sectionContentClass('staged'))}>
              {renderSectionBody(staged)}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )
    }

    return (
      <ResizablePanelGroup
        orientation="vertical"
        className="min-h-0 flex-1"
        onLayoutChanged={handleChangesLayoutChanged}
      >
        <ResizablePanel
          id={STAGING_CHANGES_PANEL_ID}
          defaultSize={`${initialChangesSize}%`}
          minSize="15%"
          className="flex min-h-0 flex-col overflow-hidden"
        >
          {renderSectionHeader(changes)}
          <div className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 py-1', sectionContentClass('changes'))}>
            {renderSectionBody(changes)}
          </div>
        </ResizablePanel>

        <ResizableHandle className="bg-border/50 shrink-0" onPointerUp={flushStagingChangesPersist} />

        <ResizablePanel defaultSize={`${initialLowerSize}%`} minSize="20%" className="flex min-h-0 flex-col overflow-hidden">
          <ResizablePanelGroup
            orientation="vertical"
            className="min-h-0 flex-1"
            onLayoutChanged={handleInnerStagingLayoutChanged}
          >
            <ResizablePanel
              id={STAGING_STAGED_PANEL_ID}
              defaultSize={`${initialStagedSize}%`}
              minSize="15%"
              className="flex min-h-0 flex-col overflow-hidden"
            >
              {renderSectionHeader(staged)}
              <div className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 py-1', sectionContentClass('staged'))}>
                {renderSectionBody(staged)}
              </div>
            </ResizablePanel>

            <ResizableHandle className="bg-border/50 shrink-0" onPointerUp={flushStagingStagedPersist} />

            <ResizablePanel
              id={STAGING_COMMIT_PANEL_ID}
              defaultSize={`${initialCommitSize}%`}
              minSize="15%"
              className="flex min-h-0 flex-col overflow-hidden border-t border-border/40 bg-background/80"
            >
              {stagingFooter}
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    )
  }

  const renderCollapsibleSections = () => (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 py-1.5">
      <div className="min-w-0 space-y-1">
        {sections.map(section => {
          const forceExpanded = searchQuery.trim().length > 0
          const sectionExpanded = expandedSectionIds.has(section.id) || forceExpanded
          return (
            <Collapsible
              key={section.id}
              open={sectionExpanded}
              onOpenChange={open => {
                if (forceExpanded) return
                setExpandedSectionIds(prev => {
                  const next = new Set(prev)
                  if (open) next.add(section.id)
                  else next.delete(section.id)
                  return next
                })
              }}
              className="min-w-0 overflow-hidden"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors',
                    sectionHeaderClass(section.id)
                  )}
                  style={noDragStyle}
                >
                  {sectionExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200" />
                  )}
                  <SectionHeaderTitle section={section} selectedIndices={selectedIndices} />
                  {renderSectionHeaderCounts(section, files)}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent
                className={cn(
                  'overflow-hidden',
                  sectionContentClass(section.id),
                  'data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:animate-none'
                )}
              >
                {renderSectionBody(section)}
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    </div>
  )

  return (
    <div ref={treeRootRef} className="flex h-full min-h-0 flex-col bg-muted/20" style={noDragStyle}>
      <div className="shrink-0 bg-muted/30 px-2 py-1.5">
        <Input
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder={t('dialog.diffViewer.searchTree')}
          className="h-7 border-0 bg-background/70 text-xs shadow-none focus-visible:ring-1"
          disabled={disabled}
        />
      </div>
      <DiffViewerFileTreeToolbar
        disabled={disabled}
        showStageActions={showStageActions}
        viewMode={viewMode}
        sortBy={sortBy}
        groupByFolder={groupByFolder}
        statusFilter={statusFilter}
        canCollapseFolders={allFolderIds.length > 0}
        canStageSelected={canStageSelected}
        canStageAll={unstagedIndices.length > 0}
        canUnstageAll={stagedIndices.length > 0}
        isRefreshing={isRefreshing}
        onToggleViewMode={toggleViewMode}
        onSortByChange={setSortBy}
        onToggleGroupByFolder={toggleGroupByFolder}
        onStatusFilterChange={setStatusFilter}
        onCollapseAll={handleCollapseAll}
        onExpandAll={handleExpandAll}
        onRefresh={handleRefresh}
        onStageSelected={handleStageSelected}
        onStageAll={handleStageAll}
        onUnstageAll={handleUnstageAll}
        onDiscardAll={handleDiscardAll}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {splitSections ? renderSplitStagingSections() : renderCollapsibleSections()}
      </div>
    </div>
  )
}
