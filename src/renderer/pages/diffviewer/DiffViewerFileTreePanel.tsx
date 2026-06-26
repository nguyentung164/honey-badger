'use client'

import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Folder,
  FolderOpen,
  RotateCcw,
  SquareMinus,
  SquarePlus,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DiffViewerStagingBadge } from '@/components/git/DiffViewerStagingBadge'
import { GitFileStatusBadge } from '@/components/git/GitFileStatusBadge'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  buildDiffFileTreeSections,
  collectExpandedFolderIdsForFile,
  collectVisibleFileIndices,
  filterDiffFileTreeSections,
  resolveContextMenuIndices,
  type DiffFileTreeFileNode,
  type DiffFileTreeFolderNode,
  type DiffFileTreeNode,
  type DiffFileTreeSection,
} from './diffViewerFileTree'
import type { DiffViewerFileEntry } from './diffViewerPayload'

export type DiffViewerFileTreeBulkAction = 'stage' | 'unstage' | 'revert' | 'reveal' | 'openInEditor'

interface DiffViewerFileTreePanelProps {
  files: DiffViewerFileEntry[]
  activeIndex: number
  splitStaging?: boolean
  showStageActions?: boolean
  disabled?: boolean
  onSelectFile: (index: number) => void
  onBulkAction: (action: DiffViewerFileTreeBulkAction, indices: number[]) => void
}

function rangeSelectIndices(flatIndices: number[], anchorIndex: number, targetIndex: number): number[] {
  const anchorPos = flatIndices.indexOf(anchorIndex)
  const targetPos = flatIndices.indexOf(targetIndex)
  if (anchorPos < 0 || targetPos < 0) return [targetIndex]
  const [start, end] = anchorPos < targetPos ? [anchorPos, targetPos] : [targetPos, anchorPos]
  return flatIndices.slice(start, end + 1)
}

function TreeFileRow({
  node,
  isActive,
  isSelected,
  showStageIndicators,
  onSelect,
}: {
  node: DiffFileTreeFileNode
  isActive: boolean
  isSelected: boolean
  showStageIndicators: boolean
  onSelect: (index: number, event: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      onClick={event => onSelect(node.index, event)}
      className={cn(
        'flex w-full min-w-0 items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs transition-colors',
        isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/70',
        isSelected && !isActive && 'bg-primary/10'
      )}
      title={node.entry.filePath}
    >
      <GitFileStatusBadge status={node.entry.fileStatus} />
      <span className="min-w-0 flex-1 truncate">{node.fileName}</span>
      {showStageIndicators && node.entry.stagingState ? (
        <DiffViewerStagingBadge state={node.entry.stagingState} compact />
      ) : null}
    </button>
  )
}

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
        className="flex w-full min-w-0 items-center gap-1 rounded-sm px-2 py-1 text-left text-xs font-medium text-muted-foreground hover:bg-muted/60"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        {expanded ? <FolderOpen className="h-3.5 w-3.5 shrink-0" /> : <Folder className="h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0 truncate">{node.name}</span>
      </button>
      {expanded ? <div className="min-w-0">{children}</div> : null}
    </div>
  )
}

export function DiffViewerFileTreePanel({
  files,
  activeIndex,
  splitStaging = false,
  showStageActions = false,
  disabled = false,
  onSelectFile,
  onBulkAction,
}: DiffViewerFileTreePanelProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => new Set())
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null)
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set())
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(() => new Set(['changes', 'staged', 'files']))
  const activeIndexRef = useRef(activeIndex)
  activeIndexRef.current = activeIndex

  const baseSections = useMemo(
    () => buildDiffFileTreeSections(files, { splitStaging }),
    [files, splitStaging]
  )

  const sections = useMemo(
    () => filterDiffFileTreeSections(baseSections, searchQuery),
    [baseSections, searchQuery]
  )

  const visibleIndices = useMemo(() => collectVisibleFileIndices(sections), [sections])

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
      const next = new Set(prev)
      for (const id of folderIds) next.add(id)
      return next
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

  const handleToggleSection = useCallback((sectionId: DiffFileTreeSection['id']) => {
    setExpandedSectionIds(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }, [])

  const handleSelectFile = useCallback(
    (index: number, event: React.MouseEvent, sectionFlatIndices: number[]) => {
      if (disabled) return

      const isMeta = event.metaKey || event.ctrlKey
      const isShift = event.shiftKey
      const flat = sectionFlatIndices.length > 0 ? sectionFlatIndices : visibleIndices

      if (isShift && anchorIndex != null) {
        setSelectedIndices(new Set(rangeSelectIndices(flat, anchorIndex, index)))
      } else if (isMeta) {
        setSelectedIndices(prev => {
          const next = new Set(prev)
          if (next.has(index)) next.delete(index)
          else next.add(index)
          return next
        })
        setAnchorIndex(index)
      } else {
        setSelectedIndices(new Set([index]))
        setAnchorIndex(index)
        if (index !== activeIndexRef.current) {
          onSelectFile(index)
        }
      }
    },
    [anchorIndex, disabled, onSelectFile, visibleIndices]
  )

  const renderContextMenu = useCallback(
    (targetIndex: number, children: React.ReactNode) => {
      const indices = resolveContextMenuIndices(selectedIndices, targetIndex)
      const unstagedIndices = indices.filter(index => files[index]?.stagingState !== 'staged')
      const stagedIndices = indices.filter(index => files[index]?.stagingState === 'staged')
      const canStage = showStageActions && unstagedIndices.length > 0
      const canUnstage = showStageActions && stagedIndices.length > 0
      const canRevert = showStageActions && unstagedIndices.length > 0

      return (
        <ContextMenu>
          <ContextMenuTrigger asChild disabled={disabled}>
            {children}
          </ContextMenuTrigger>
          <ContextMenuContent className="min-w-48">
            {canStage ? (
              <ContextMenuItem onClick={() => onBulkAction('stage', unstagedIndices)}>
                {unstagedIndices.length > 1
                  ? t('dialog.diffViewer.treeStageSelected', { count: unstagedIndices.length })
                  : t('git.stageFile')}
                <ContextMenuShortcut>
                  <SquarePlus className="ml-3 h-4 w-4" />
                </ContextMenuShortcut>
              </ContextMenuItem>
            ) : null}
            {canUnstage ? (
              <ContextMenuItem onClick={() => onBulkAction('unstage', stagedIndices)}>
                {stagedIndices.length > 1
                  ? t('dialog.diffViewer.treeUnstageSelected', { count: stagedIndices.length })
                  : t('git.unstageFile')}
                <ContextMenuShortcut>
                  <SquareMinus className="ml-3 h-4 w-4" />
                </ContextMenuShortcut>
              </ContextMenuItem>
            ) : null}
            {canRevert ? (
              <ContextMenuItem variant="destructive" onClick={() => onBulkAction('revert', unstagedIndices)}>
                {unstagedIndices.length > 1
                  ? t('dialog.diffViewer.treeRevertSelected', { count: unstagedIndices.length })
                  : t('contextMenu.discardChanges')}
                <ContextMenuShortcut>
                  <RotateCcw className="ml-3 h-4 w-4" />
                </ContextMenuShortcut>
              </ContextMenuItem>
            ) : null}
            {showStageActions && (canStage || canUnstage || canRevert) ? <ContextMenuSeparator /> : null}
            <ContextMenuItem onClick={() => onBulkAction('openInEditor', indices)}>
              {t('dialog.diffViewer.openInEditor')}
              <ContextMenuShortcut>
                <ExternalLink className="ml-3 h-4 w-4" />
              </ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onBulkAction('reveal', indices)}>
              {t('dialog.diffViewer.revealInExplorer')}
            </ContextMenuItem>
            {indices.length > 1 ? (
              <ContextMenuItem disabled className="text-muted-foreground">
                {t('dialog.diffViewer.treeSelectedCount', { count: indices.length })}
              </ContextMenuItem>
            ) : null}
          </ContextMenuContent>
        </ContextMenu>
      )
    },
    [disabled, files, onBulkAction, selectedIndices, showStageActions, t]
  )

  const renderTreeNodes = useCallback(
    (nodes: DiffFileTreeNode[], depth: number, sectionFlatIndices: number[]) => (
      <>
        {nodes.map(node => {
          if (node.kind === 'file') {
            return (
              <div key={node.id} style={{ paddingLeft: `${depth * 12 + 8}px` }}>
                {renderContextMenu(
                  node.index,
                  <TreeFileRow
                    node={node}
                    isActive={node.index === activeIndex}
                    isSelected={selectedIndices.has(node.index)}
                    showStageIndicators={splitStaging}
                    onSelect={(index, event) => handleSelectFile(index, event, sectionFlatIndices)}
                  />
                )}
              </div>
            )
          }

          const expanded = expandedFolderIds.has(node.id) || searchQuery.trim().length > 0
          return (
            <TreeFolderRow
              key={node.id}
              node={node}
              depth={depth}
              expanded={expanded}
              onToggle={handleToggleFolder}
            >
              {renderTreeNodes(node.children, depth + 1, sectionFlatIndices)}
            </TreeFolderRow>
          )
        })}
      </>
    ),
    [
      activeIndex,
      expandedFolderIds,
      handleSelectFile,
      handleToggleFolder,
      renderContextMenu,
      searchQuery,
      selectedIndices,
      splitStaging,
    ]
  )

  return (
    <div className="flex h-full min-h-0 flex-col border-r bg-muted/15">
      <div className="shrink-0 border-b px-2 py-1.5">
        <Input
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder={t('dialog.diffViewer.searchTree')}
          className="h-7 text-xs"
          disabled={disabled}
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="min-w-0 py-1">
          {sections.map(section => {
            const sectionExpanded = expandedSectionIds.has(section.id) || searchQuery.trim().length > 0
            return (
              <div key={section.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => handleToggleSection(section.id)}
                  className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/50"
                >
                  {sectionExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <span className="min-w-0 flex-1 truncate">{t(section.labelKey)}</span>
                  <span className="tabular-nums text-[10px]">{section.flatFileIndices.length}</span>
                </button>
                {sectionExpanded ? (
                  <div className="pb-1">
                    {section.nodes.length === 0 ? (
                      <p className="px-3 py-2 text-[11px] text-muted-foreground">
                        {section.id === 'staged' ? t('git.noStagedFiles') : t('message.noFilesChanged')}
                      </p>
                    ) : (
                      renderTreeNodes(section.nodes, 0, section.flatFileIndices)
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
