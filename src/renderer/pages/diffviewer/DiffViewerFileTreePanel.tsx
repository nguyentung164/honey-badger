'use client'

import { ChevronDown, ChevronRight, Copy, FileSymlink, Folder, FolderOpen, History, ListFilter, Minus, Pencil, Plus, RotateCcw } from 'lucide-react'
import type React from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { GitFileStatusBadge, type GitFileStatusCode, normalizeGitFileStatus } from '@/components/git/GitFileStatusBadge'
import { MaterialFileIcon } from '@/components/icons/MaterialFileIcon'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
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
  collectFileIndicesFromNodes,
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

export type DiffViewerFileTreeBulkAction = 'stage' | 'unstage' | 'revert' | 'reveal' | 'openInEditor' | 'showLog' | 'gitBlame' | 'copyPath' | 'copyFileName' | 'copyFullPath'

type PathEntryKind = 'file' | 'directory' | 'missing'

interface DiffViewerFileTreePanelProps {
  files: DiffViewerFileEntry[]
  activeIndex: number
  splitStaging?: boolean
  showStageActions?: boolean
  disabled?: boolean
  stagingFooter?: React.ReactNode
  onSelectFile: (index: number) => void
  onBulkAction: (action: DiffViewerFileTreeBulkAction, indices: number[]) => void
  showLocalIgnorePatterns?: boolean
  onOpenLocalIgnorePatterns?: () => void
  repoCwd?: string
  repoRootKey?: string
  onAddToLocalIgnore?: (filePaths: string[]) => void
  onAddFolderToLocalIgnore?: (filePaths: string[], entryKinds: PathEntryKind[]) => void
}

const STAGING_TREE_PANEL_ID = 'diff-tree-changes-section'
const STAGING_COMMIT_PANEL_ID = 'diff-tree-commit-section'

const TREE_INDENT_PX = 12
const TREE_BASE_PADDING_PX = 8
const TREE_GUIDE_ALIGN_PX = 7

const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

function treeRowPaddingLeft(depth: number): number {
  return TREE_BASE_PADDING_PX + depth * TREE_INDENT_PX
}

function treeRowIndentStyle(depth: number): React.CSSProperties {
  return { ...noDragStyle, paddingLeft: treeRowPaddingLeft(depth) }
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
      {children}
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

/** Inline hover action (VS Code SCM style) — stops propagation so the row does not get selected. */
function TreeRowActionButton({
  label,
  destructive,
  disabled,
  onClick,
  children,
}: {
  label: string
  destructive?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-current opacity-80 hover:bg-foreground/10 hover:opacity-100',
        destructive && 'hover:text-destructive',
        disabled && 'pointer-events-none opacity-40'
      )}
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onClick={event => {
        event.stopPropagation()
        onClick()
      }}
      style={noDragStyle}
    >
      {children}
    </button>
  )
}

const TreeFileRow = memo(function TreeFileRow({
  node,
  depth,
  isActive,
  isSelected,
  flatView,
  interactionDisabled,
  actions,
  onSelect,
}: {
  node: DiffFileTreeFileNode
  depth: number
  isActive: boolean
  isSelected: boolean
  flatView?: boolean
  interactionDisabled?: boolean
  actions?: React.ReactNode
  onSelect: (index: number, event: React.MouseEvent) => void
}) {
  const flatDirPath = flatView ? formatFlatDirPath(node.entry.filePath) : null

  return (
    <div
      role="treeitem"
      aria-selected={isActive || isSelected}
      tabIndex={interactionDisabled ? -1 : 0}
      onMouseDown={event => {
        if (interactionDisabled) return
        event.preventDefault()
      }}
      onClick={event => {
        if (interactionDisabled) return
        onSelect(node.index, event)
      }}
      onKeyDown={event => {
        if (interactionDisabled) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(node.index, event as unknown as React.MouseEvent)
        }
      }}
      className={cn(
        'group flex h-6 w-full min-w-0 cursor-default items-center gap-1.5 px-2 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring',
        flatView
          ? cn(
            isActive && 'bg-[var(--hb-explorer-row-active)]',
            !isActive && isSelected && 'bg-primary/15 hover:bg-primary/20',
            !isActive && !isSelected && 'hover:bg-[var(--hb-explorer-row-hover)]'
          )
          : cn(
            isActive && 'bg-[var(--hb-tree-active-bg)] text-[var(--hb-tree-active-fg)]',
            !isActive && isSelected && 'bg-primary/15 text-primary hover:bg-primary/20',
            !isActive && !isSelected && 'text-foreground hover:bg-[var(--hb-explorer-row-hover)]'
          ),
        interactionDisabled && 'opacity-60'
      )}
      title={node.entry.filePath}
      style={treeRowIndentStyle(depth)}
    >
      <MaterialFileIcon name={node.entry.filePath} kind="file" size={16} className="h-4 w-4 shrink-0" />
      {flatView ? (
        <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[13px] h-[20px] font-normal">
          <span className={cn('shrink-0', isActive && 'text-foreground', !isActive && isSelected && 'text-primary', !isActive && !isSelected && 'text-foreground')}>
            {node.fileName}
          </span>
          {flatDirPath ? <span className={cn('min-w-0 truncate', isActive ? 'text-[var(--hb-tree-flat-dir)]' : 'text-muted-foreground')}>{flatDirPath}</span> : null}
        </span>
      ) : (
        <span
          className={cn('min-w-0 flex-1 truncate text-[13px] h-[20px] font-normal', isActive && 'text-[var(--hb-tree-active-fg)]', !isActive && isSelected && 'text-primary')}
        >
          {node.fileName}
        </span>
      )}
      {actions && !interactionDisabled ? <span className="hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex">{actions}</span> : null}
      <GitFileStatusBadge status={node.entry.fileStatus} variant="trailing" />
    </div>
  )
})

function pathEntryKindCacheKey(repoKey: string, relativePath: string): string {
  return `${repoKey}\0${relativePath}`
}

function localIgnoreMenuI18nKey(base: 'addToLocalIgnore' | 'addFolderToLocalIgnore', paths: string[], pathEntryKinds: Record<string, PathEntryKind>, repoRootKey: string): string {
  const kinds = paths.map(p => pathEntryKinds[pathEntryKindCacheKey(repoRootKey, p)])
  if (kinds.some(k => k === undefined)) return `contextMenu.${base}_unknown`
  const uniq = new Set(kinds)
  if (uniq.size > 1) return `contextMenu.${base}_mixed`
  const k = kinds[0]
  if (k === 'directory') return `contextMenu.${base}_folder`
  if (k === 'file') return `contextMenu.${base}_file`
  return `contextMenu.${base}_unknown`
}

type TreeFileRowItemProps = {
  node: DiffFileTreeFileNode
  depth: number
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
  onRowAction: (action: DiffViewerFileTreeBulkAction, indices: number[]) => void
  repoRootKey?: string
  pathEntryKinds: Record<string, PathEntryKind>
  onAddToLocalIgnore?: (filePaths: string[]) => void
  onAddFolderToLocalIgnore?: (filePaths: string[], entryKinds: PathEntryKind[]) => void
}

const TreeFileRowItem = memo(function TreeFileRowItem({
  node,
  depth,
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
  onRowAction,
  repoRootKey,
  pathEntryKinds,
  onAddToLocalIgnore,
  onAddFolderToLocalIgnore,
}: TreeFileRowItemProps) {
  const { t } = useTranslation()
  const menuIndices = getContextMenuIndices(node.index)
  const menuPaths = menuIndices.map(index => files[index]?.filePath).filter(Boolean) as string[]
  const unstagedIndices = menuIndices.filter(index => isGitEntryUnstaged(files[index]))
  const stagedIndices = menuIndices.filter(index => isGitEntryStaged(files[index]))
  const isChangesContext = sectionId === 'changes' || (sectionId === 'files' && isGitEntryUnstaged(files[node.index]))
  const isStagedContext = sectionId === 'staged' || (sectionId === 'files' && isGitEntryStaged(files[node.index]))
  const canStage = showStageActions && isChangesContext && unstagedIndices.length > 0
  const canUnstage = showStageActions && isStagedContext && stagedIndices.length > 0
  const canRevert = showStageActions && isChangesContext && unstagedIndices.length > 0
  const showHideFromChanges = isChangesContext && Boolean(onAddToLocalIgnore && onAddFolderToLocalIgnore && repoRootKey)
  const isDeleted = files[node.index]?.fileStatus === 'deleted'

  const handleSelect = useCallback(
    (index: number, event: React.MouseEvent) => {
      onSelect(index, event, sectionFlatIndices, sectionId)
    },
    [onSelect, sectionFlatIndices, sectionId]
  )

  const entryUnstaged = isGitEntryUnstaged(files[node.index])
  const entryStaged = isGitEntryStaged(files[node.index])
  const showOpenAction = !isDeleted
  const showUnstagedActions = showStageActions && isChangesContext && entryUnstaged
  const showStagedActions = showStageActions && isStagedContext && entryStaged
  const hoverActions = (
    <>
      {showOpenAction ? (
        <TreeRowActionButton label={t('contextMenu.openInEditor')} onClick={() => onRowAction('openInEditor', [node.index])}>
          <FileSymlink strokeWidth={1.5} className="h-3.5 w-3.5" />
        </TreeRowActionButton>
      ) : null}
      {showUnstagedActions ? (
        <>
          <TreeRowActionButton destructive label={t('contextMenu.discardChanges')} onClick={() => onRowAction('revert', [node.index])}>
            <RotateCcw strokeWidth={1.5} className="h-3.5 w-3.5" />
          </TreeRowActionButton>
          <TreeRowActionButton label={t('git.stageFile')} onClick={() => onRowAction('stage', [node.index])}>
            <Plus strokeWidth={1.5} className="h-3.5 w-3.5" />
          </TreeRowActionButton>
        </>
      ) : null}
      {showStagedActions ? (
        <TreeRowActionButton label={t('git.unstageFile')} onClick={() => onRowAction('unstage', [node.index])}>
          <Minus strokeWidth={1.5} className="h-3.5 w-3.5" />
        </TreeRowActionButton>
      ) : null}
    </>
  )
  const hasHoverActions = showOpenAction || showUnstagedActions || showStagedActions

  return (
    <ContextMenu onOpenChange={onContextMenuOpenChange(node.index)}>
      <ContextMenuTrigger asChild disabled={interactionDisabled}>
        <TreeFileRow
          node={node}
          depth={depth}
          isActive={isActive}
          isSelected={isSelected}
          flatView={flatView}
          interactionDisabled={interactionDisabled}
          actions={hasHoverActions ? hoverActions : undefined}
          onSelect={handleSelect}
        />
      </ContextMenuTrigger>
      <ContextMenuContent className="z-[200] min-w-48" style={noDragStyle}>
        <ContextMenuItem onSelect={() => onContextMenuAction('reveal', node.index, 'all')}>
          {t('contextMenu.revealInExplorer')}
          <ContextMenuShortcut>
            <FolderOpen strokeWidth={1.25} className="ml-3 h-4 w-4" />
          </ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={isDeleted} onSelect={() => onContextMenuAction('openInEditor', node.index, 'all')}>
          {t('contextMenu.openInEditor')}
          <ContextMenuShortcut>
            <Pencil strokeWidth={1.25} className="ml-3 h-4 w-4" />
          </ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t('contextMenu.copy')}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onSelect={() => onContextMenuAction('copyPath', node.index, 'all')}>
              {t('contextMenu.copyPath')}
              <ContextMenuShortcut>
                <Copy strokeWidth={1.25} className="ml-3 h-4 w-4" />
              </ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onContextMenuAction('copyFileName', node.index, 'all')}>
              {t('contextMenu.copyFileName')}
              <ContextMenuShortcut>
                <Copy strokeWidth={1.25} className="ml-3 h-4 w-4" />
              </ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onContextMenuAction('copyFullPath', node.index, 'all')}>
              {t('contextMenu.copyFullPath')}
              <ContextMenuShortcut>
                <Copy strokeWidth={1.25} className="ml-3 h-4 w-4" />
              </ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        {(canStage || canUnstage || showHideFromChanges) && <ContextMenuSeparator />}
        {canStage ? (
          <ContextMenuItem onSelect={() => onContextMenuAction('stage', node.index, 'unstaged')}>
            {unstagedIndices.length > 1 ? t('dialog.diffViewer.treeStageSelected', { count: unstagedIndices.length }) : t('git.stageFile')}
            <ContextMenuShortcut>
              <Plus strokeWidth={1.25} className="ml-3 h-4 w-4" />
            </ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
        {showHideFromChanges && repoRootKey ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger>{t('contextMenu.hideFromChangesLocal')}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onSelect={() => onAddToLocalIgnore?.(menuPaths)}>
                {t(localIgnoreMenuI18nKey('addToLocalIgnore', menuPaths, pathEntryKinds, repoRootKey))}
                <ContextMenuShortcut>
                  <ListFilter strokeWidth={1.25} className="ml-3 h-4 w-4" />
                </ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() =>
                  onAddFolderToLocalIgnore?.(
                    menuPaths,
                    menuPaths.map(fp => pathEntryKinds[pathEntryKindCacheKey(repoRootKey, fp)] ?? 'file')
                  )
                }
              >
                {t(localIgnoreMenuI18nKey('addFolderToLocalIgnore', menuPaths, pathEntryKinds, repoRootKey))}
                <ContextMenuShortcut>
                  <Folder strokeWidth={1.25} className="ml-3 h-4 w-4" />
                </ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : null}
        {canUnstage ? (
          <ContextMenuItem onSelect={() => onContextMenuAction('unstage', node.index, 'staged')}>
            {stagedIndices.length > 1 ? t('dialog.diffViewer.treeUnstageSelected', { count: stagedIndices.length }) : t('git.unstageFile')}
            <ContextMenuShortcut>
              <RotateCcw strokeWidth={1.25} className="ml-3 h-4 w-4" />
            </ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onContextMenuAction('showLog', node.index, 'all')}>
          {t('contextMenu.showLog')}
          <ContextMenuShortcut>
            <History strokeWidth={1.25} className="ml-3 h-4 w-4" />
          </ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onContextMenuAction('gitBlame', node.index, 'all')}>
          Git Blame
          <ContextMenuShortcut>
            <History strokeWidth={1.25} className="ml-3 h-4 w-4" />
          </ContextMenuShortcut>
        </ContextMenuItem>
        {canRevert ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => onContextMenuAction('revert', node.index, 'unstaged')}>
              {unstagedIndices.length > 1 ? t('dialog.diffViewer.treeRevertSelected', { count: unstagedIndices.length }) : t('contextMenu.discardChanges')}
              <ContextMenuShortcut>
                <RotateCcw strokeWidth={1.25} className="ml-3 h-4 w-4" />
              </ContextMenuShortcut>
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
})

function TreeGroupRow({
  node,
  depth,
  expanded,
  showGuides,
  sectionId,
  showStageActions,
  interactionDisabled,
  onToggle,
  onGroupAction,
}: {
  node: DiffFileTreeGroupNode
  depth: number
  expanded: boolean
  showGuides: boolean
  sectionId: DiffFileTreeSectionId
  showStageActions?: boolean
  interactionDisabled?: boolean
  onToggle: (groupId: string) => void
  onGroupAction: (action: DiffViewerFileTreeBulkAction, indices: number[]) => void
}) {
  const showGroupActions = Boolean(showStageActions) && !interactionDisabled && (sectionId === 'changes' || sectionId === 'staged')
  const indices = useMemo(() => node.children.map(child => child.index), [node.children])

  return (
    <TreeDepthShell depth={depth} showGuides={showGuides}>
      <div
        role="treeitem"
        aria-expanded={expanded}
        aria-selected={false}
        tabIndex={0}
        onClick={() => onToggle(node.id)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle(node.id)
          }
        }}
        className="group flex h-7 w-full min-w-0 cursor-default items-center gap-1 px-2 text-left text-foreground outline-none hover:bg-[var(--hb-explorer-row-hover)] focus-visible:ring-1 focus-visible:ring-ring"
        style={treeRowIndentStyle(depth)}
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <MaterialFileIcon name={node.label} kind="folder" expanded={expanded} size={16} className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[13px]">{node.label}</span>
        {showGroupActions ? (
          <span className="hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex">
            <TreeContainerHoverActions indices={indices} sectionId={sectionId} onContainerAction={onGroupAction} />
          </span>
        ) : null}
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
        <span key={status} className="inline-flex items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground">
          <GitFileStatusBadge status={status} size='md' />
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

function TreeContainerHoverActions({
  indices,
  sectionId,
  onContainerAction,
}: {
  indices: number[]
  sectionId: DiffFileTreeSectionId
  onContainerAction: (action: DiffViewerFileTreeBulkAction, indices: number[]) => void
}) {
  const { t } = useTranslation()
  const count = indices.length
  if (count === 0) return null

  if (sectionId === 'staged') {
    return (
      <TreeRowActionButton label={t('dialog.diffViewer.treeUnstageSelected', { count })} onClick={() => onContainerAction('unstage', indices)}>
        <Minus strokeWidth={1.5} className="h-3.5 w-3.5" />
      </TreeRowActionButton>
    )
  }

  return (
    <>
      <TreeRowActionButton
        destructive
        label={t('dialog.diffViewer.treeRevertSelected', { count })}
        onClick={() => onContainerAction('revert', indices)}
      >
        <RotateCcw strokeWidth={1.5} className="h-3.5 w-3.5" />
      </TreeRowActionButton>
      <TreeRowActionButton label={t('dialog.diffViewer.treeStageSelected', { count })} onClick={() => onContainerAction('stage', indices)}>
        <Plus strokeWidth={1.5} className="h-3.5 w-3.5" />
      </TreeRowActionButton>
    </>
  )
}

function TreeFolderHoverActions({
  node,
  sectionId,
  onFolderAction,
}: {
  node: DiffFileTreeFolderNode
  sectionId: DiffFileTreeSectionId
  onFolderAction: (action: DiffViewerFileTreeBulkAction, indices: number[]) => void
}) {
  const indices = collectFileIndicesFromNodes(node.children)
  return <TreeContainerHoverActions indices={indices} sectionId={sectionId} onContainerAction={onFolderAction} />
}

function TreeFolderHeader({
  node,
  depth,
  expanded,
  showGuides,
  sectionId,
  showStageActions,
  interactionDisabled,
  onToggle,
  onFolderAction,
}: {
  node: DiffFileTreeFolderNode
  depth: number
  expanded: boolean
  showGuides: boolean
  sectionId: DiffFileTreeSectionId
  showStageActions?: boolean
  interactionDisabled?: boolean
  onToggle: (folderId: string) => void
  onFolderAction: (action: DiffViewerFileTreeBulkAction, indices: number[]) => void
}) {
  const showFolderActions = Boolean(showStageActions) && !interactionDisabled && (sectionId === 'changes' || sectionId === 'staged')

  return (
    <TreeDepthShell depth={depth} showGuides={showGuides}>
      <div
        role="treeitem"
        aria-expanded={expanded}
        aria-selected={false}
        tabIndex={0}
        onClick={() => onToggle(node.id)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle(node.id)
          }
        }}
        className="group flex h-7 w-full min-w-0 cursor-default items-center gap-1 px-2 text-left text-foreground outline-none hover:bg-[var(--hb-explorer-row-hover)] focus-visible:ring-1 focus-visible:ring-ring"
        style={treeRowIndentStyle(depth)}
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <MaterialFileIcon name={node.name} kind="folder" expanded={expanded} size={16} className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[13px]">{node.name}</span>
        {showFolderActions ? (
          <span className="hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex">
            <TreeFolderHoverActions node={node} sectionId={sectionId} onFolderAction={onFolderAction} />
          </span>
        ) : null}
      </div>
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
        section.id === 'changes' || section.id === 'staged' ? 'bg-muted/75 shadow-sm hover:bg-muted/85 dark:bg-muted/55 dark:hover:bg-muted/65' : 'bg-muted/40 hover:bg-muted/50'
      )}
      style={noDragStyle}
      aria-expanded={expanded}
    >
      {expanded ? (
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
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
  stagingFooter,
  onSelectFile,
  onBulkAction,
  showLocalIgnorePatterns = false,
  onOpenLocalIgnorePatterns,
  repoCwd,
  repoRootKey,
  onAddToLocalIgnore,
  onAddFolderToLocalIgnore,
}: DiffViewerFileTreePanelProps) {
  const { t } = useTranslation()
  const [pathEntryKinds, setPathEntryKinds] = useState<Record<string, PathEntryKind>>({})
  useEffect(() => {
    setPathEntryKinds({})
  }, [repoRootKey])
  const { viewMode, sortBy, groupByFolder, statusFilter, stagingChangesPanelSize, toggleViewMode, setSortBy, toggleGroupByFolder, setStatusFilter } = useDiffViewerTreePanelPrefs()
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
      if (open) {
        ensureContextMenuSelection(index)
        if (repoCwd && repoRootKey && onAddToLocalIgnore) {
          const menuPaths = resolveContextMenuIndices(selectedIndicesRef.current, index)
            .map(i => filesRef.current[i]?.filePath)
            .filter(Boolean) as string[]
          for (const fp of [...new Set(menuPaths)]) {
            void window.api.system.get_path_entry_kind({ relativePath: fp, cwd: repoCwd }).then(kind => {
              setPathEntryKinds(prev => ({ ...prev, [pathEntryKindCacheKey(repoRootKey, fp)]: kind }))
            })
          }
        }
      }
    },
    [ensureContextMenuSelection, repoCwd, repoRootKey, onAddToLocalIgnore]
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

  /** Hover action on a single row/folder — acts on the given indices only, not the multi-selection. */
  const handleRowAction = useCallback(
    (action: DiffViewerFileTreeBulkAction, indices: number[]) => {
      if (indices.length === 0) return
      onBulkAction(action, indices)
      if (action === 'stage' || action === 'unstage') {
        clearSelection()
      }
    },
    [onBulkAction, clearSelection]
  )

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
    (node: DiffFileTreeFileNode, depth: number, sectionFlatIndices: number[], sectionId: DiffFileTreeSectionId) => (
      <TreeFileRowItem
        node={node}
        depth={depth}
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
        onRowAction={handleRowAction}
        repoRootKey={repoRootKey}
        pathEntryKinds={pathEntryKinds}
        onAddToLocalIgnore={onAddToLocalIgnore}
        onAddFolderToLocalIgnore={onAddFolderToLocalIgnore}
      />
    ),
    [
      activeIndex,
      createContextMenuOpenChange,
      disabled,
      files,
      flatView,
      getContextMenuIndices,
      handleRowAction,
      handleSelectFile,
      onAddFolderToLocalIgnore,
      onAddToLocalIgnore,
      pathEntryKinds,
      repoRootKey,
      runContextMenuBulkAction,
      selectedIndices,
      showStageActions,
    ]
  )

  const renderVisibleTreeRow = useCallback(
    (row: DiffFileTreeVisibleRow, sectionFlatIndices: number[], sectionId: DiffFileTreeSectionId) => {
      if (row.kind === 'file') {
        return (
          <TreeDepthShell depth={row.depth} showGuides={showTreeGuides} className="h-6">
            {renderTreeFileRow(row.node, row.depth, sectionFlatIndices, sectionId)}
          </TreeDepthShell>
        )
      }

      if (row.kind === 'group') {
        return (
          <div className="h-7 min-w-0">
            <TreeGroupRow
              node={row.node}
              depth={row.depth}
              expanded={row.expanded}
              showGuides={showTreeGuides}
              sectionId={sectionId}
              showStageActions={showStageActions}
              interactionDisabled={disabled}
              onToggle={handleToggleFolder}
              onGroupAction={handleRowAction}
            />
          </div>
        )
      }

      return (
        <div className="h-7 min-w-0">
          <TreeFolderHeader
            node={row.node}
            depth={row.depth}
            expanded={row.expanded}
            showGuides={showTreeGuides}
            sectionId={sectionId}
            showStageActions={showStageActions}
            interactionDisabled={disabled}
            onToggle={handleToggleFolder}
            onFolderAction={handleRowAction}
          />
        </div>
      )
    },
    [disabled, handleRowAction, handleToggleFolder, renderTreeFileRow, showStageActions, showTreeGuides]
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
        <ResizablePanel
          id={STAGING_TREE_PANEL_ID}
          defaultSize={`${initialTreeSize}%`}
          minSize="15%"
          className="flex min-h-0 flex-col overflow-hidden bg-background/50 dark:bg-background/15"
        >
          {accordionList}
        </ResizablePanel>

        <ResizableHandle showGrip={false} className="bg-transparent" onPointerUp={flushTreePanelPersist} />

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
        onToggleViewMode={toggleViewMode}
        onSortByChange={setSortBy}
        onToggleGroupByFolder={toggleGroupByFolder}
        onStatusFilterChange={setStatusFilter}
        onCollapseAll={handleCollapseAll}
        onExpandAll={handleExpandAll}
        onStageSelected={handleStageSelected}
        onStageAll={handleStageAll}
        onUnstageAll={handleUnstageAll}
        onDiscardAll={handleDiscardAll}
        showLocalIgnorePatterns={showLocalIgnorePatterns}
        onOpenLocalIgnorePatterns={onOpenLocalIgnorePatterns}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{renderTreeSections()}</div>
    </div>
  )
}
