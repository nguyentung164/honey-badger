'use client'

import { memo, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from '@/components/ui/context-menu'
import { parentRelativeDir } from '@/pages/editor/explorer/explorerClipboard'
import { selectedFilePaths } from '@/pages/editor/explorer/explorerSelection'
import type { ExplorerFileOperations } from '@/pages/editor/explorer/useExplorerFileOperations'
import { editorContextMenuContentClass } from '@/pages/editor/lib/editorContextMenuStyles'
import type { FileTreeRow } from '@/pages/editor/lib/flattenFileTree'

type EditorExplorerContextMenuProps = {
  menuPaths: string[]
  targetPath: string
  isDir: boolean
  rows: readonly FileTreeRow[]
  actions: ExplorerFileOperations
  children: ReactNode
}

function rowKind(rows: readonly FileTreeRow[], path: string): 'file' | 'directory' | null {
  const row = rows.find(r => r.node.relativePath === path)
  if (!row) return null
  return row.node.kind === 'directory' ? 'directory' : 'file'
}

export const EditorExplorerContextMenu = memo(function EditorExplorerContextMenu({ menuPaths, targetPath, isDir, rows, actions, children }: EditorExplorerContextMenuProps) {
  const { t } = useTranslation()
  const isMulti = menuPaths.length > 1
  const parentDir = isDir ? targetPath : parentRelativeDir(targetPath)
  const compareFiles = selectedFilePaths(rows, new Set(menuPaths))
  const canCompare = compareFiles.length === 2
  const [pasteEnabled, setPasteEnabled] = useState(false)

  const deleteTargets = menuPaths.map(relativePath => {
    const kind = rowKind(rows, relativePath)
    const name = relativePath.split('/').pop() ?? relativePath
    return { relativePath, isDir: kind === 'directory', name }
  })

  const cutCopyPaths = menuPaths

  return (
    <ContextMenu
      onOpenChange={open => {
        if (open && isDir && !isMulti) setPasteEnabled(actions.canPasteInto(parentDir))
      }}
    >
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className={editorContextMenuContentClass}
        onCloseAutoFocus={e => {
          if (actions.consumeSuppressMenuFocusRestore()) {
            e.preventDefault()
          }
        }}
      >
        {!isMulti && isDir ? (
          <>
            <ContextMenuItem onSelect={() => void actions.startCreateFile(parentDir)}>{t('editor.explorerMenu.newFile')}</ContextMenuItem>
            <ContextMenuItem onSelect={() => void actions.startCreateFolder(parentDir)}>{t('editor.explorerMenu.newFolder')}</ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onSelect={() => actions.revealInOsExplorer(targetPath)}>
              {t('editor.explorerMenu.revealInExplorer')}
              <ContextMenuShortcut>Shift+Alt+R</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => actions.openInTerminal(targetPath, true)}>{t('editor.explorerMenu.openInTerminal')}</ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onSelect={() => actions.cut(cutCopyPaths)}>
              {t('editor.explorerMenu.cut')}
              <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => actions.copy(cutCopyPaths)}>
              {t('editor.explorerMenu.copy')}
              <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem disabled={!pasteEnabled} onSelect={() => void actions.pasteInto(parentDir)}>
              {t('editor.explorerMenu.paste')}
              <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onSelect={() => void actions.copyPath(targetPath)}>
              {t('editor.explorerMenu.copyPath')}
              <ContextMenuShortcut>Shift+Alt+C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void actions.copyRelativePath(targetPath)}>
              {t('editor.explorerMenu.copyRelativePath')}
              <ContextMenuShortcut>Ctrl+M Ctrl+Shift+C</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onSelect={() => actions.startRename(targetPath)}>
              {t('editor.explorerMenu.rename')}
              <ContextMenuShortcut>F2</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onSelect={() => actions.requestDelete(deleteTargets)}>
              {t('editor.explorerMenu.delete')}
              <ContextMenuShortcut>Delete</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        ) : !isMulti && !isDir ? (
          <>
            <ContextMenuItem onSelect={() => actions.revealInOsExplorer(targetPath)}>
              {t('editor.explorerMenu.revealInExplorer')}
              <ContextMenuShortcut>Shift+Alt+R</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => actions.openInTerminal(targetPath, false)}>{t('editor.explorerMenu.openInTerminal')}</ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem disabled={!canCompare} onSelect={() => actions.compareSelected(compareFiles[0], compareFiles[1])}>
              {t('editor.explorerMenu.compareSelected')}
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onSelect={() => actions.cut(cutCopyPaths)}>
              {t('editor.explorerMenu.cut')}
              <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => actions.copy(cutCopyPaths)}>
              {t('editor.explorerMenu.copy')}
              <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onSelect={() => void actions.copyPath(targetPath)}>
              {t('editor.explorerMenu.copyPath')}
              <ContextMenuShortcut>Shift+Alt+C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void actions.copyRelativePath(targetPath)}>
              {t('editor.explorerMenu.copyRelativePath')}
              <ContextMenuShortcut>Ctrl+M Ctrl+Shift+C</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onSelect={() => actions.startRename(targetPath)}>
              {t('editor.explorerMenu.rename')}
              <ContextMenuShortcut>F2</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onSelect={() => actions.requestDelete(deleteTargets)}>
              {t('editor.explorerMenu.delete')}
              <ContextMenuShortcut>Delete</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem disabled={!canCompare} onSelect={() => actions.compareSelected(compareFiles[0], compareFiles[1])}>
              {t('editor.explorerMenu.compareSelected')}
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onSelect={() => actions.cut(cutCopyPaths)}>
              {t('editor.explorerMenu.cut')}
              <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => actions.copy(cutCopyPaths)}>
              {t('editor.explorerMenu.copy')}
              <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem variant="destructive" onSelect={() => actions.requestDelete(deleteTargets)}>
              {t('editor.explorerMenu.delete')}
              <ContextMenuShortcut>Delete</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})
