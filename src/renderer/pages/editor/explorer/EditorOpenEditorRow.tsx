'use client'

import { GitCompare, X } from 'lucide-react'
import { memo } from 'react'
import { GitFileStatusBadge, type GitFileStatusCode } from '@/components/git/GitFileStatusBadge'
import { MaterialFileIcon } from '@/components/icons/MaterialFileIcon'
import { cn } from '@/lib/utils'
import { EditorTabContextMenu, type EditorTabMenuActions } from '@/pages/editor/editor-area/EditorTabContextMenu'
import { EXPLORER_GIT_LABEL_CLASS } from '@/pages/editor/explorer/explorerGitDecorations'
import { EXPLORER_TREE_BASE_PADDING_PX, EXPLORER_TREE_ROW_HEIGHT } from '@/pages/editor/explorer/explorerTreeConstants'
import type { EditorTabSummary } from '@/pages/editor/hooks/useEditorTabSelectors'

type EditorOpenEditorRowProps = {
  tab: EditorTabSummary
  tabIndex: number
  tabCount: number
  active: boolean
  focused?: boolean
  gitStatus: GitFileStatusCode | null
  tabMenuActions: EditorTabMenuActions | null
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onPinTab?: (tabId: string) => void
  onFocusRow?: () => void
}

export const EditorOpenEditorRow = memo(function EditorOpenEditorRow({
  tab,
  tabIndex,
  tabCount,
  active,
  focused = false,
  gitStatus,
  tabMenuActions,
  onSelectTab,
  onCloseTab,
  onPinTab,
  onFocusRow,
}: EditorOpenEditorRowProps) {
  const isPreview = tab.isPreview && !tab.isPinned

  const row = (
    <div
      role="treeitem"
      aria-selected={active}
      className={cn(
        'group flex w-full min-w-0 items-center gap-1 pr-1 text-[13px]',
        active
          ? 'bg-accent/80 text-foreground'
          : focused
            ? 'bg-muted/70 text-foreground ring-1 ring-inset ring-border/60'
            : 'text-muted-foreground hover:bg-muted/50'
      )}
      style={{ height: EXPLORER_TREE_ROW_HEIGHT, paddingLeft: EXPLORER_TREE_BASE_PADDING_PX }}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5"
        onClick={() => {
          onFocusRow?.()
          onSelectTab(tab.id)
        }}
        onDoubleClick={() => onPinTab?.(tab.id)}
      >
        {tab.isCompare ? (
          <GitCompare className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
        ) : (
          <MaterialFileIcon name={tab.relativePath} size={16} className="h-4 w-4 shrink-0 opacity-90" />
        )}
        <span
          className={cn(
            'min-w-0 truncate',
            (tab.isDirty || isPreview) && 'italic',
            gitStatus ? EXPLORER_GIT_LABEL_CLASS[gitStatus] : null
          )}
        >
          {tab.tabLabel}
        </span>
        {gitStatus ? <GitFileStatusBadge status={gitStatus} variant="trailing" size="sm" /> : null}
      </button>
      <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        {tab.isDirty ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center group-hover:opacity-0" aria-hidden>
            <span className="size-2 rounded-full bg-current" />
          </span>
        ) : null}
        <button
          type="button"
          className="flex h-full w-full items-center justify-center rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
          aria-label="Close"
          onClick={e => {
            e.stopPropagation()
            onCloseTab(tab.id)
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )

  if (!tabMenuActions) return row

  return (
    <EditorTabContextMenu tab={tab} tabIndex={tabIndex} tabCount={tabCount} onSelectTab={onSelectTab} actions={tabMenuActions}>
      {row}
    </EditorTabContextMenu>
  )
})
