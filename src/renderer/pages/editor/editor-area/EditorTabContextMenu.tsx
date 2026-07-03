'use client'

import { memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from '@/components/ui/context-menu'
import { editorContextMenuContentClass } from '@/pages/editor/lib/editorContextMenuStyles'
import type { EditorTabSummary } from '@/pages/editor/hooks/useEditorTabSelectors'

export type EditorTabMenuActions = {
  onClose: () => void
  onCloseOthers: () => void
  onCloseToRight: () => void
  onCloseSaved: () => void
  onCloseAll: () => void
  onCopyPath: () => void
  onCopyRelativePath: () => void
  onRevealInFileExplorer: () => void
  onRevealInExplorerView: () => void
  onPin: () => void
}

type EditorTabContextMenuProps = {
  tab: EditorTabSummary
  tabIndex: number
  tabCount: number
  onSelectTab: (tabId: string) => void
  actions: EditorTabMenuActions
  children: ReactNode
}

export const EditorTabContextMenu = memo(function EditorTabContextMenu({
  tab,
  tabIndex,
  tabCount,
  onSelectTab,
  actions,
  children,
}: EditorTabContextMenuProps) {
  const { t } = useTranslation()
  const canCloseToRight = tabIndex < tabCount - 1
  const canCloseOthers = tabCount > 1

  return (
    <ContextMenu
      onOpenChange={open => {
        if (open) onSelectTab(tab.id)
      }}
    >
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className={editorContextMenuContentClass}>
        <ContextMenuItem onSelect={actions.onClose}>
          {t('editor.tabMenu.close')}
          <ContextMenuShortcut>Ctrl+F4</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!canCloseOthers} onSelect={actions.onCloseOthers}>
          {t('editor.tabMenu.closeOthers')}
        </ContextMenuItem>
        <ContextMenuItem disabled={!canCloseToRight} onSelect={actions.onCloseToRight}>
          {t('editor.tabMenu.closeToRight')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={actions.onCloseSaved}>
          {t('editor.tabMenu.closeSaved')}
          <ContextMenuShortcut>Ctrl+M U</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={actions.onCloseAll}>
          {t('editor.tabMenu.closeAll')}
          <ContextMenuShortcut>Ctrl+M W</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onSelect={actions.onCopyPath}>
          {t('editor.explorerMenu.copyPath')}
          <ContextMenuShortcut>Shift+Alt+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={actions.onCopyRelativePath}>
          {t('editor.explorerMenu.copyRelativePath')}
          <ContextMenuShortcut>Ctrl+M Ctrl+Shift+C</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onSelect={actions.onRevealInFileExplorer}>
          {t('editor.explorerMenu.revealInExplorer')}
          <ContextMenuShortcut>Shift+Alt+R</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={actions.onRevealInExplorerView}>
          {t('editor.tabMenu.revealInExplorerView')}
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem disabled={tab.isPinned} onSelect={actions.onPin}>
          {t('editor.tabMenu.pin')}
          <ContextMenuShortcut>Ctrl+M Shift+Enter</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})
