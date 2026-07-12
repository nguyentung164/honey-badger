'use client'

import { memo, type ReactNode, useState } from 'react'
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
  onRevert: () => void
}

const NOOP = () => {}

/** Placeholder while the menu is closed — real actions are built lazily on open. */
const EMPTY_ACTIONS: EditorTabMenuActions = {
  onClose: NOOP,
  onCloseOthers: NOOP,
  onCloseToRight: NOOP,
  onCloseSaved: NOOP,
  onCloseAll: NOOP,
  onCopyPath: NOOP,
  onCopyRelativePath: NOOP,
  onRevealInFileExplorer: NOOP,
  onRevealInExplorerView: NOOP,
  onPin: NOOP,
  onRevert: NOOP,
}

type EditorTabContextMenuProps = {
  tab: EditorTabSummary
  tabIndex: number
  tabCount: number
  onSelectTab: (tabId: string) => void
  /** Called lazily when the menu opens — avoids building action closures per tab row render. */
  getActions: () => EditorTabMenuActions
  children: ReactNode
}

export const EditorTabContextMenu = memo(function EditorTabContextMenu({
  tab,
  tabIndex,
  tabCount,
  onSelectTab,
  getActions,
  children,
}: EditorTabContextMenuProps) {
  const { t } = useTranslation()
  const [actions, setActions] = useState<EditorTabMenuActions>(EMPTY_ACTIONS)
  const canCloseToRight = tabIndex < tabCount - 1
  const canCloseOthers = tabCount > 1

  return (
    <ContextMenu
      onOpenChange={open => {
        if (open) {
          setActions(getActions())
          onSelectTab(tab.id)
        }
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

        <ContextMenuItem disabled={tab.isCompare} onSelect={actions.onRevert}>
          {t('editor.revertFile')}
        </ContextMenuItem>

        <ContextMenuItem disabled={tab.isSticky} onSelect={actions.onPin}>
          {t('editor.tabMenu.pin')}
          <ContextMenuShortcut>Ctrl+M Shift+Enter</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})
