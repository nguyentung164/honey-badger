'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { memo, type MouseEvent, type RefObject } from 'react'
import { GitFileStatusBadge, type GitFileStatusCode } from '@/components/git/GitFileStatusBadge'
import { MaterialFileIcon } from '@/components/icons/MaterialFileIcon'
import { cn } from '@/lib/utils'
import { ExplorerRowInlineEdit } from '@/pages/editor/explorer/ExplorerRowInlineEdit'
import { EXPLORER_GIT_DOT_CLASS, EXPLORER_GIT_LABEL_CLASS } from '@/pages/editor/explorer/explorerGitDecorations'
import { EXPLORER_TREE_BASE_PADDING_PX, EXPLORER_TREE_INDENT_PX, EXPLORER_TREE_ROW_HEIGHT } from '@/pages/editor/explorer/explorerTreeConstants'
import type { FileTreeRow } from '@/pages/editor/lib/flattenFileTree'

export type ExplorerRowHandlers = {
  onSelect: (path: string, event: MouseEvent) => void
  onToggleExpand: (path: string) => void
  onOpenFile: (path: string, opts?: { preview?: boolean; pin?: boolean }) => void
}

type ExplorerRowProps = {
  row: FileTreeRow
  isSelected: boolean
  isExpanded: boolean
  isLoading: boolean
  gitStatus: GitFileStatusCode | null
  isCut?: boolean
  isEditing?: boolean
  editValue?: string
  onEditValueChange?: (value: string) => void
  onEditCommit?: () => void
  onEditCancel?: () => void
  editSelectAll?: boolean
  handlersRef: RefObject<ExplorerRowHandlers>
}

export const ExplorerRow = memo(
  function ExplorerRow({
    row,
    isSelected,
    isExpanded,
    isLoading,
    gitStatus,
    isCut = false,
    isEditing = false,
    editValue = '',
    onEditValueChange,
    onEditCommit,
    onEditCancel,
    editSelectAll = false,
    handlersRef,
  }: ExplorerRowProps) {
    const { node, depth } = row
    const isDir = node.kind === 'directory'
    const paddingLeft = EXPLORER_TREE_BASE_PADDING_PX + depth * EXPLORER_TREE_INDENT_PX
    const showFolderDot = isDir && gitStatus != null

    return (
      <div
        role="treeitem"
        tabIndex={-1}
        aria-selected={isSelected}
        className={cn(
          'flex w-full min-w-0 cursor-pointer items-center gap-1 px-2 text-left outline-none',
          isCut && 'opacity-40',
          isSelected ? cn('bg-primary/15 hover:bg-primary/20', !gitStatus && 'text-primary') : 'text-foreground hover:bg-black/[0.07] dark:hover:bg-[#2a2d2e]'
        )}
        style={{ height: EXPLORER_TREE_ROW_HEIGHT, paddingLeft, contain: 'layout style paint' }}
        onMouseDown={e => {
          if (isEditing) return
          if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault()
        }}
        onClick={e => {
          if (isEditing) return
          const h = handlersRef.current
          if (!h) return
          const modifier = e.ctrlKey || e.metaKey || e.shiftKey
          h.onSelect(node.relativePath, e)
          if (modifier) return
          if (isDir) h.onToggleExpand(node.relativePath)
          else h.onOpenFile(node.relativePath, { preview: true })
        }}
        onKeyDown={e => {
          if (isEditing) return
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          const h = handlersRef.current
          if (!h) return
          h.onSelect(node.relativePath, e as unknown as MouseEvent)
          if (isDir) h.onToggleExpand(node.relativePath)
          else h.onOpenFile(node.relativePath, { preview: true })
        }}
        onDoubleClick={e => {
          if (isEditing) return
          e.stopPropagation()
          const h = handlersRef.current
          if (!h) return
          if (isDir) h.onToggleExpand(node.relativePath)
          else h.onOpenFile(node.relativePath, { pin: true })
        }}
      >
        {isDir ? (
          <button
            type="button"
            tabIndex={-1}
            className="flex h-4 w-4 shrink-0 items-center justify-center"
            onClick={e => {
              e.stopPropagation()
              handlersRef.current?.onToggleExpand(node.relativePath)
            }}
          >
            {isLoading ? (
              <span className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
            ) : isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <MaterialFileIcon name={node.name} kind={isDir ? 'folder' : 'file'} expanded={isExpanded} size={16} className="h-4 w-4 shrink-0" />
        {isEditing && onEditValueChange && onEditCommit && onEditCancel ? (
          <ExplorerRowInlineEdit
            value={editValue}
            selectAll={editSelectAll}
            onChange={onEditValueChange}
            onCommit={onEditCommit}
            onCancel={onEditCancel}
          />
        ) : (
          <span className={cn('min-w-0 flex-1 truncate text-[13px]', gitStatus ? EXPLORER_GIT_LABEL_CLASS[gitStatus] : isSelected && 'text-primary')}>
            {node.name}
          </span>
        )}
        {!isEditing && showFolderDot ? (
          <span className={cn('mr-0.5 h-1.5 w-1.5 shrink-0 rounded-full', EXPLORER_GIT_DOT_CLASS[gitStatus])} aria-hidden />
        ) : null}
        {!isEditing && !isDir && gitStatus ? <GitFileStatusBadge status={gitStatus} variant="trailing" /> : null}
      </div>
    )
  },
  (prev, next) =>
    prev.row.node.relativePath === next.row.node.relativePath &&
    prev.row.depth === next.row.depth &&
    prev.isSelected === next.isSelected &&
    prev.isExpanded === next.isExpanded &&
    prev.isLoading === next.isLoading &&
    prev.gitStatus === next.gitStatus &&
    prev.isCut === next.isCut &&
    prev.isEditing === next.isEditing &&
    prev.editValue === next.editValue
)

type ExplorerPhantomRowProps = {
  depth: number
  createKind: 'file' | 'directory'
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}

export const ExplorerPhantomRow = memo(function ExplorerPhantomRow({
  depth,
  createKind,
  value,
  onChange,
  onCommit,
  onCancel,
}: ExplorerPhantomRowProps) {
  const paddingLeft = EXPLORER_TREE_BASE_PADDING_PX + depth * EXPLORER_TREE_INDENT_PX

  return (
    <div
      className="flex w-full min-w-0 items-center gap-1 bg-primary/10 px-2 text-left"
      style={{ height: EXPLORER_TREE_ROW_HEIGHT, paddingLeft }}
    >
      <span className="w-4 shrink-0" />
      <MaterialFileIcon name="" kind={createKind === 'directory' ? 'folder' : 'file'} size={16} className="h-4 w-4 shrink-0 opacity-80" />
      <ExplorerRowInlineEdit value={value} onChange={onChange} onCommit={onCommit} onCancel={onCancel} />
    </div>
  )
})
