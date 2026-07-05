'use client'

import { GitCompare, X } from 'lucide-react'
import { memo } from 'react'
import { GitFileStatusBadge, type GitFileStatusCode } from '@/components/git/GitFileStatusBadge'
import { MaterialFileIcon } from '@/components/icons/MaterialFileIcon'
import { cn } from '@/lib/utils'
import { EditorTabContextMenu, type EditorTabMenuActions } from '@/pages/editor/editor-area/EditorTabContextMenu'
import { EXPLORER_GIT_LABEL_CLASS } from '@/pages/editor/explorer/explorerGitDecorations'
import type { EditorTabSummary } from '@/pages/editor/hooks/useEditorTabSelectors'

export type EditorTabItemProps = {
  tab: EditorTabSummary
  tabIndex: number
  tabCount: number
  active: boolean
  gitStatus: GitFileStatusCode | null
  tabMenuActions: EditorTabMenuActions | null
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onPinTab?: (tabId: string) => void
  setTabRef: (tabId: string, el: HTMLDivElement | null) => void
}

export const EditorTabItem = memo(function EditorTabItem({
  tab,
  tabIndex,
  tabCount,
  active,
  gitStatus,
  tabMenuActions,
  onSelectTab,
  onCloseTab,
  onPinTab,
  setTabRef,
}: EditorTabItemProps) {
  const isPreview = tab.isPreview && !tab.isPinned

  const tabRow = (
    <div
      ref={el => setTabRef(tab.id, el)}
      className={cn(
        'group flex h-full max-w-[280px] shrink-0 items-center gap-1 border-r border-t-2 px-2 text-xs',
        active ? 'border-t-[#0078d4] bg-background text-foreground' : 'border-t-transparent bg-muted/10 text-muted-foreground hover:bg-muted/40',
        isPreview && !active && 'opacity-80'
      )}
    >
      <button
        type="button"
        className="flex h-full min-w-0 flex-1 items-center gap-1.5"
        onClick={() => onSelectTab(tab.id)}
        onMouseDown={e => {
          if (e.button === 1) {
            e.preventDefault()
            onCloseTab(tab.id)
          }
        }}
        onDoubleClick={() => onPinTab?.(tab.id)}
      >
        {tab.isCompare ? (
          <GitCompare className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
        ) : (
          <MaterialFileIcon name={tab.relativePath} size={14} className="h-4.5 w-4.5 shrink-0 opacity-90 relative top-[-0.5px]" />
        )}
        <span className={cn('min-w-0 truncate text-[13px] h-[20px]', (tab.isDirty || isPreview) && 'italic', gitStatus ? EXPLORER_GIT_LABEL_CLASS[gitStatus] : null)}>
          {tab.tabLabel}
        </span>
        {gitStatus ? <GitFileStatusBadge status={gitStatus} variant="trailing" size="sm" /> : null}
      </button>
      <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        {tab.isDirty ? (
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center group-hover:opacity-0"
            aria-hidden
          >
            <span className="size-2.5 rounded-full bg-current" />
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
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

  if (!tabMenuActions) {
    return tabRow
  }

  return (
    <EditorTabContextMenu tab={tab} tabIndex={tabIndex} tabCount={tabCount} onSelectTab={onSelectTab} actions={tabMenuActions}>
      {tabRow}
    </EditorTabContextMenu>
  )
})
