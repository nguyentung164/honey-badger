'use client'

import { ChevronDown, ChevronRight, ExternalLink, RotateCcw, SquareMinus, SquarePlus } from 'lucide-react'
import type React from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { GitFileStatusBadge, type GitFileStatusCode, normalizeGitFileStatus } from '@/components/git/GitFileStatusBadge'
import { MaterialFileIcon } from '@/components/icons/MaterialFileIcon'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from '@/components/ui/context-menu'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { DiffViewerFileTreeToolbar } from './DiffViewerFileTreeToolbar'
import { DiffViewerFileTreeVirtualList } from './DiffViewerFileTreeVirtualList'
import {
  buildCollapsiblePanelVirtualRows,
  buildDiffFileTreeSections,
  collectAllFolderIds,
  collectExpandedFolderIdsForFile,
  collectVisibleFileIndices,
  type DiffFileTreeFileNode,
  type DiffFileTreeFolderNode,
  type DiffFileTreeGroupNode,
  type DiffFileTreePanelVirtualRow,
  type DiffFileTreeSection,
  type DiffFileTreeSectionId,
  type DiffFileTreeVisibleRow,
  estimateDiffFileTreePanelRowHeight,
  getDiffFileTreePanelVirtualRowKey,
  rangeSelectIndices,
  resolveContextMenuIndices,
} from './diffViewerFileTree'
import { isGitEntryStaged, isGitEntryUnstaged, normalizeGitPath } from './diffViewerGitFiles'
import type { DiffViewerFileEntry } from './diffViewerPayload'
import { persistStagingChangesPanelSize, STAGING_COMMIT_PANEL_MIN_SIZE, useDiffViewerTreePanelPrefs } from './useDiffViewerTreePanelPrefs'

export type DiffViewerFileTreeBulkAction = 'stage' | 'unstage' | 'revert' | 'reveal' | 'openInEditor'

interface DiffViewerFileTreePanelProps {
  files: DiffViewerFileEntry[]
  activeIndex: number
  splitStaging?: boolean
  showStageActions?: boolean
  disabled?: boolean
  isRefreshing?: boolean
  stagingFooter?: React.ReactNode
  onSelectFile: (index: number) => void
  onBulkAction: (action: DiffViewerFileTreeBulkAction, indices: number[]) => void
  onRefresh?: () => void | Promise<void>
}


const STAGING_TREE_PANEL_ID = 'diff-tree-changes-section'
const STAGING_COMMIT_PANEL_ID = 'diff-tree-commit-section'

const TREE_INDENT_PX = 12
const TREE_GUIDE_ALIGN_PX = 14

const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

function treeRowPaddingLeft(depth: number): number {
  return depth * TREE_INDENT_PX
}

function treeGuideLeft(level: number): number {
  return treeRowPaddingLeft(level) + TREE_GUIDE_ALIGN_PX
}

const TreeIndentGuides = memo(function TreeIndentGuides({ depth }: { depth: number }) {
  if (depth <= 0) return null
  return (
    <div className="pointer-events-none absolute inset-y-0 left-0" aria-hidden>
      {Array.from({ length: depth }, (_, level) => (
        <span key={level} className="absolute top-0 bottom-0 w-px bg-border/55 dark:bg-border/40" style={{ left: treeGuideLeft(level) }} />
      ))}
    </div>
  )
})

function TreeDepthShell({ depth, showGuides, className, children }: { depth: number; showGuides: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('relative min-w-0 p-0!', className)} style={noDragStyle}>
      {showGuides ? <TreeIndentGuides depth={depth} /> : null}
      <div className="relative min-w-0" style={{ paddingLeft: treeRowPaddingLeft(depth) }}>
        {children}
      </div>
    </div>
  )
}

function formatFlatDirPath(filePath: string): string | null {
  const parts = normalizeGitPath(filePath).split('/').filter(Boolean)
  if (parts.length <= 1) return null
  const dir = parts.slice(0, -1).join('/')
  if (typeof process !== 'undefined' && process.platform === 'win32') {
    return dir.replace(/\//g, '\\')
  }
  return dir
}

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
  const flatDirPath = flatView ? formatFlatDirPath(node.entry.filePath) : null

  return (
    <button
      type="button"
      onMouseDown={event => {
        if (interactionDisabled) return
        event.preventDefault()
      }}
      onClick={event => {
        if (interactionDisabled) return
        onSelect(node.index, event)
      }}
      className={cn(
        'flex h-6 w-full min-w-0 cursor-default items-center gap-1.5 px-2 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring',
        flatView
          ? cn(
            isActive && 'bg-black/[0.05] dark:bg-[#37373d]',
            !isActive && isSelected && 'bg-primary/15 hover:bg-primary/20',
            !isActive && !isSelected && 'hover:bg-black/[0.07] dark:hover:bg-[#2a2d2e]'
          )
          : cn(
            isActive && 'bg-black/[0.05] text-[#7a6332] dark:bg-white/10 dark:text-[#fadc34]',
            !isActive && isSelected && 'bg-primary/15 text-primary hover:bg-primary/20',
            !isActive && !isSelected && 'text-foreground hover:bg-black/[0.07] dark:hover:bg-[#2a2d2e]'
          ),
        interactionDisabled && 'opacity-60'
      )}
      title={node.entry.filePath}
      style={noDragStyle}
    >
      <MaterialFileIcon name={node.entry.filePath} kind="file" className="h-4.5 w-4.5" />
      {flatView ? (
        <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[12px] h-[19.5px] font-normal">
          <span
            className={cn(
              'shrink-0',
              isActive && 'text-foreground dark:text-[#e1e1e1]',
              !isActive && isSelected && 'text-primary',
              !isActive && !isSelected && 'text-foreground'
            )}
          >
            {node.fileName}
          </span>
          {flatDirPath ? (
            <span className={cn('min-w-0 truncate', isActive ? 'text-[#858585]' : 'text-muted-foreground')}>{flatDirPath}</span>
          ) : null}
        </span>
      ) : (
        <span className={cn('min-w-0 flex-1 truncate text-[12px] h-[19.5px] font-normal', isActive && 'text-[#7a6332] dark:text-[#fadc34]', !isActive && isSelected && 'text-primary')}>
          {node.fileName}
        </span>
      )}
      <GitFileStatusBadge status={node.entry.fileStatus} variant="trailing" />
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
  sectionId: DiffFileTreeSectionId
  files: DiffViewerFileEntry[]
  getContextMenuIndices: (nodeIndex: number) => number[]
  onSelect: (index: number, event: React.MouseEvent, sectionFlatIndices: number[], sectionId: DiffFileTreeSectionId) => void
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
  sectionId,
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
      onSelect(index, event, sectionFlatIndices, sectionId)
    },
    [onSelect, sectionFlatIndices, sectionId]
  )

  return (
    <ContextMenu onOpenChange={onContextMenuOpenChange(node.index)}>
      <ContextMenuTrigger asChild disabled={interactionDisabled}>
        <div className="w-full min-w-0" style={noDragStyle}>
          <TreeFileRow node={node} isActive={isActive} isSelected={isSelected} flatView={flatView} interactionDisabled={interactionDisabled} onSelect={handleSelect} />
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

function TreeGroupRow({ node, depth, showGuides }: { node: DiffFileTreeGroupNode; depth: number; showGuides: boolean }) {
  return (
    <TreeDepthShell depth={depth} showGuides={showGuides}>
      <div className="flex h-7 w-full min-w-0 items-center gap-1.5 px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase" style={noDragStyle}>
        <MaterialFileIcon name={node.label} kind="folder" className="h-4.5 w-4.5 opacity-90" />
        <span className="min-w-0 truncate normal-case text-[12px] font-normal">{node.label}</span>
      </div>
    </TreeDepthShell>
  )
}

const SECTION_STATUS_COUNT_ORDER: GitFileStatusCode[] = ['modified', 'added', 'deleted', 'renamed', 'untracked', 'conflicted', 'staged']

function countSectionFileStatuses(files: DiffViewerFileEntry[], indices: readonly number[]): Map<GitFileStatusCode, number> {
  const counts = new Map<GitFileStatusCode, number>()
  for (const index of indices) {
    const status = normalizeGitFileStatus(files[index]?.fileStatus)
    if (!status) continue
    counts.set(status, (counts.get(status) ?? 0) + 1)
  }
  return counts
}

const SectionStatusCounts = memo(function SectionStatusCounts({ files, indices }: { files: DiffViewerFileEntry[]; indices: readonly number[] }) {
  const counts = useMemo(() => countSectionFileStatuses(files, indices), [files, indices])
  const entries = SECTION_STATUS_COUNT_ORDER.filter(status => (counts.get(status) ?? 0) > 0)
  if (entries.length === 0) {
    return <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">0</span>
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {entries.map(status => (
        <span key={status} className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-muted-foreground">
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
  return <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{section.flatFileIndices.length}</span>
}

function countSelectedInSection(sectionIndices: readonly number[], selectedIndices: Set<number>): number {
  let count = 0
  for (const index of sectionIndices) {
    if (selectedIndices.has(index)) count++
  }
  return count
}

const SectionHeaderTitle = memo(function SectionHeaderTitle({ section, selectedIndices }: { section: DiffFileTreeSection; selectedIndices: Set<number> }) {
  const { t } = useTranslation()
  const total = section.flatFileIndices.length
  const selected = countSelectedInSection(section.flatFileIndices, selectedIndices)
  const showSelection = (section.id === 'changes' || section.id === 'staged') && selected > 0

  return (
    <span className="min-w-0 flex-1 truncate text-[13px] font-normal h-[19.5px]">
      {t(section.labelKey)}
      {showSelection ? <span className="font-normal text-muted-foreground text-[11px]"> {t('dialog.diffViewer.treeSectionSelected', { selected, total })}</span> : null}
    </span>
  )
})

function TreeFolderHeader({
  node,
  depth,
  expanded,
  showGuides,
  onToggle,
}: {
  node: DiffFileTreeFolderNode
  depth: number
  expanded: boolean
  showGuides: boolean
  onToggle: (folderId: string) => void
}) {
  return (
    <TreeDepthShell depth={depth} showGuides={showGuides}>
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        className="flex h-7 w-full min-w-0 items-center gap-1 px-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/60"
        style={noDragStyle}
      >
        {expanded ? <ChevronDown className="h-4.5 w-4.5 shrink-0" /> : <ChevronRight className="h-4.5 w-4.5 shrink-0" />}
        <MaterialFileIcon name={node.name} kind="folder" expanded={expanded} className="h-4.5 w-4.5" />
        <span className="min-w-0 truncate text-[12px] font-normal">{node.name}</span>
      </button>
    </TreeDepthShell>
  )
}

function VirtualSectionHeaderRow({
  section,
  expanded,
  files,
  selectedIndices,
  onToggle,
}: {
  section: DiffFileTreeSection
  expanded: boolean
  files: DiffViewerFileEntry[]
  selectedIndices: Set<number>
  onToggle: (sectionId: DiffFileTreeSection['id']) => void
}) {
  return (
    <button
      type="button"
      onMouseDown={event => event.preventDefault()}
      onClick={() => onToggle(section.id)}
      className={cn(
        'sticky top-0 z-[1] flex h-7 w-full items-center gap-1.5 px-2 text-left text-xs font-semibold text-foreground transition-colors',
        section.id === 'changes' || section.id === 'staged'
          ? 'bg-muted/75 shadow-sm hover:bg-muted/85 dark:bg-muted/55 dark:hover:bg-muted/65'
          : 'bg-muted/40 hover:bg-muted/50'
      )}
      style={noDragStyle}
      aria-expanded={expanded}
    >
      {expanded ? (
        <ChevronDown className="h-4.5 w-4.5 shrink-0 text-muted-foreground transition-transform duration-200" />
      ) : (
        <ChevronRight className="h-4.5 w-4.5 shrink-0 text-muted-foreground transition-transform duration-200" />
      )}
      <SectionHeaderTitle section={section} selectedIndices={selectedIndices} />
      {renderSectionHeaderCounts(section, files)}
    </button>
  )
}

function isTreeKeyboardTargetIgnored(target: EventTarget | null, allowContentEditable = false): boolean {
  if (!(target instanceof HTMLElement)) return true
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true
  if (!allowContentEditable && target.isContentEditable) return true
  return false
}

function resolveSectionIdForActiveIndex(sections: DiffFileTreeSection[], activeIndex: number): DiffFileTreeSectionId | null {
  if (activeIndex < 0) return null
  for (const section of sections) {
    if (section.flatFileIndices.includes(activeIndex)) return section.id
  }
  return null
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
  const { viewMode, sortBy, groupByFolder, statusFilter, stagingChangesPanelSize, toggleViewMode, setSortBy, toggleGroupByFolder, setStatusFilter } =
    useDiffViewerTreePanelPrefs()
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
  const collapsibleScrollRef = useRef<HTMLDivElement>(null)
  const lastInteractedSectionIdRef = useRef<DiffFileTreeSectionId | null>(null)
  const lastPointerInTreeRef = useRef(false)
  const sectionsRef = useRef<DiffFileTreeSection[]>([])
  const initialTreePanelSizeRef = useRef(stagingChangesPanelSize)
  const treePanelSizeRef = useRef(stagingChangesPanelSize)
  const treePanelPersistRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (treePanelPersistRef.current) clearTimeout(treePanelPersistRef.current)
      persistStagingChangesPanelSize(treePanelSizeRef.current)
    }
  }, [])

  const flushTreePanelPersist = useCallback(() => {
    if (treePanelPersistRef.current) {
      clearTimeout(treePanelPersistRef.current)
      treePanelPersistRef.current = null
    }
    persistStagingChangesPanelSize(treePanelSizeRef.current)
  }, [])

  const handleTreeCommitLayoutChanged = useCallback((layout: Record<string, number | undefined>) => {
    const tree = layout[STAGING_TREE_PANEL_ID]
    if (typeof tree !== 'number') return
    treePanelSizeRef.current = tree
    if (treePanelPersistRef.current) clearTimeout(treePanelPersistRef.current)
    treePanelPersistRef.current = setTimeout(() => {
      persistStagingChangesPanelSize(treePanelSizeRef.current)
      treePanelPersistRef.current = null
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

  const sections = baseSections
  sectionsRef.current = sections

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
    const indices = selected.size > 0 ? flat.filter(index => selected.has(index)) : activeIndexRef.current >= 0 ? [activeIndexRef.current] : []
    const paths = [...new Set(indices.map(index => filesRef.current[index]?.filePath).filter(Boolean) as string[])]
    if (paths.length === 0) return

    try {
      await navigator.clipboard.writeText(paths.join('\n'))
      toast.success(t('toast.copied'))
    } catch {
      toast.error(t('toast.copyFailed'))
    }
  }, [t])

  const selectAllInSection = useCallback((sectionId: DiffFileTreeSectionId) => {
    const section = sectionsRef.current.find(item => item.id === sectionId)
    if (!section || section.flatFileIndices.length === 0) return
    setSelectedIndices(new Set(section.flatFileIndices))
    setAnchorIndex(section.flatFileIndices[0] ?? null)
  }, [])

  const resolveKeyboardSectionId = useCallback((): DiffFileTreeSectionId | null => {
    if (lastInteractedSectionIdRef.current) return lastInteractedSectionIdRef.current

    const activeElement = document.activeElement
    if (collapsibleScrollRef.current?.contains(activeElement)) {
      return resolveSectionIdForActiveIndex(sectionsRef.current, activeIndexRef.current)
    }

    return resolveSectionIdForActiveIndex(sectionsRef.current, activeIndexRef.current)
  }, [])

  useEffect(() => {
    const root = treeRootRef.current
    if (!root || disabled) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return

      if (!root.contains(target)) {
        lastPointerInTreeRef.current = false
        return
      }

      lastPointerInTreeRef.current = true
      if (isTreeKeyboardTargetIgnored(target)) return

      if (collapsibleScrollRef.current?.contains(target)) {
        const sectionId = resolveSectionIdForActiveIndex(sectionsRef.current, activeIndexRef.current)
        if (sectionId) lastInteractedSectionIdRef.current = sectionId
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [disabled])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return

      const key = event.key.toLowerCase()
      if (key !== 'c' && key !== 'a') return

      const target = event.target
      const root = treeRootRef.current
      const selected = selectedIndicesRef.current
      const focusInTree = root != null && target instanceof Node && root.contains(target)
      const treeKeyboardContext = focusInTree || lastPointerInTreeRef.current

      if (key === 'a') {
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
        if (!treeKeyboardContext) return
        const sectionId = resolveKeyboardSectionId()
        if (!sectionId) return
        event.preventDefault()
        event.stopPropagation()
        selectAllInSection(sectionId)
        return
      }

      if (event.shiftKey) return

      if (selected.size > 0) {
        if (isTreeKeyboardTargetIgnored(target, true)) return
        event.preventDefault()
        event.stopPropagation()
        void copySelectedPaths()
        return
      }

      if (isTreeKeyboardTargetIgnored(target)) return
      if (!focusInTree) return
      if (activeIndexRef.current < 0) return

      event.preventDefault()
      event.stopPropagation()
      void copySelectedPaths()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [copySelectedPaths, resolveKeyboardSectionId, selectAllInSection])

  const handleSelectFile = useCallback(
    (index: number, event: React.MouseEvent, sectionFlatIndices: number[], sectionId: DiffFileTreeSectionId) => {
      if (disabled) return

      lastInteractedSectionIdRef.current = sectionId

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
  const showTreeGuides = viewMode === 'tree'

  const panelRows = useMemo(() => {
    const sourceSections = splitSections ? [splitSections.changes, splitSections.staged] : sections
    return buildCollapsiblePanelVirtualRows(sourceSections, {
      expandedSectionIds,
      expandedFolderIds,
    })
  }, [splitSections, sections, expandedSectionIds, expandedFolderIds])

  const handleToggleSection = useCallback((sectionId: DiffFileTreeSection['id']) => {
    lastInteractedSectionIdRef.current = sectionId
    setExpandedSectionIds(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }, [])

  const renderTreeFileRow = useCallback(
    (node: DiffFileTreeFileNode, sectionFlatIndices: number[], sectionId: DiffFileTreeSectionId) => (
      <TreeFileRowItem
        node={node}
        isActive={node.index === activeIndex}
        isSelected={selectedIndices.has(node.index)}
        flatView={flatView}
        interactionDisabled={disabled}
        showStageActions={showStageActions}
        sectionFlatIndices={sectionFlatIndices}
        sectionId={sectionId}
        files={files}
        getContextMenuIndices={getContextMenuIndices}
        onSelect={handleSelectFile}
        onContextMenuOpenChange={createContextMenuOpenChange}
        onContextMenuAction={runContextMenuBulkAction}
      />
    ),
    [activeIndex, createContextMenuOpenChange, disabled, files, flatView, getContextMenuIndices, handleSelectFile, runContextMenuBulkAction, selectedIndices, showStageActions]
  )

  const renderVisibleTreeRow = useCallback(
    (row: DiffFileTreeVisibleRow, sectionFlatIndices: number[], sectionId: DiffFileTreeSectionId) => {
      if (row.kind === 'file') {
        return (
          <TreeDepthShell depth={row.depth} showGuides={showTreeGuides} className="h-6">
            {renderTreeFileRow(row.node, sectionFlatIndices, sectionId)}
          </TreeDepthShell>
        )
      }

      if (row.kind === 'group') {
        return (
          <div className="h-7 min-w-0">
            <TreeGroupRow node={row.node} depth={row.depth} showGuides={showTreeGuides} />
          </div>
        )
      }

      return (
        <div className="h-7 min-w-0">
          <TreeFolderHeader node={row.node} depth={row.depth} expanded={row.expanded} showGuides={showTreeGuides} onToggle={handleToggleFolder} />
        </div>
      )
    },
    [handleToggleFolder, renderTreeFileRow, showTreeGuides]
  )

  const renderPanelVirtualRow = useCallback(
    (row: DiffFileTreePanelVirtualRow) => {
      if (row.kind === 'section-header') {
        const expanded = expandedSectionIds.has(row.section.id)
        return <VirtualSectionHeaderRow section={row.section} expanded={expanded} files={files} selectedIndices={selectedIndices} onToggle={handleToggleSection} />
      }

      return renderVisibleTreeRow(row, row.section.flatFileIndices, row.section.id)
    },
    [expandedSectionIds, files, handleToggleSection, renderVisibleTreeRow, selectedIndices]
  )

  const renderAccordionVirtualList = useCallback(
    (rows: DiffFileTreePanelVirtualRow[], scrollRef: React.RefObject<HTMLDivElement | null>, scrollClassName?: string) => (
      <DiffViewerFileTreeVirtualList
        rows={rows}
        scrollRef={scrollRef}
        getRowKey={getDiffFileTreePanelVirtualRowKey}
        estimateRowHeight={estimateDiffFileTreePanelRowHeight}
        scrollClassName={cn('', scrollClassName)}
        emptyState={<p className="px-3 py-2 text-[11px] text-muted-foreground">{t('message.noFilesChanged')}</p>}
        renderRow={renderPanelVirtualRow}
      />
    ),
    [renderPanelVirtualRow, t]
  )

  const stagingTreeScrollClass = splitSections ? 'bg-background/70 dark:bg-background/20' : ''

  const renderTreeSections = () => {
    const accordionList = renderAccordionVirtualList(panelRows, collapsibleScrollRef, stagingTreeScrollClass)

    if (!splitSections || !stagingFooter) {
      return accordionList
    }

    const initialTreeSize = initialTreePanelSizeRef.current
    const initialCommitSize = Math.max(STAGING_COMMIT_PANEL_MIN_SIZE, 100 - initialTreeSize)

    return (
      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1" onLayoutChanged={handleTreeCommitLayoutChanged}>
        <ResizablePanel id={STAGING_TREE_PANEL_ID} defaultSize={`${initialTreeSize}%`} minSize="15%" className="flex min-h-0 flex-col overflow-hidden bg-background/50 dark:bg-background/15">
          {accordionList}
        </ResizablePanel>

        <ResizableHandle className="bg-transparent" withHandle={false} onPointerUp={flushTreePanelPersist} />

        <ResizablePanel
          id={STAGING_COMMIT_PANEL_ID}
          defaultSize={`${initialCommitSize}%`}
          minSize={`${STAGING_COMMIT_PANEL_MIN_SIZE}%`}
          className="flex min-h-0 flex-col overflow-hidden border-t border-border/40 bg-background/80"
        >
          {stagingFooter}
        </ResizablePanel>
      </ResizablePanelGroup>
    )
  }

  return (
    <div ref={treeRootRef} className="flex h-full min-h-0 flex-col bg-muted/20 outline-none" style={noDragStyle}>
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{renderTreeSections()}</div>
    </div>
  )
}
