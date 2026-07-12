'use client'

import type { EditorWorkspaceFolder } from '@/lib/multiRepoUtils'
import type { ShellTabActiveProps } from 'shared/shellTabTypes'
import { EditorWorkbench } from '@/pages/editor/EditorWorkbench'

export type EditorPageProps = ShellTabActiveProps & {
  repoCwd?: string
  workspaceFolders?: EditorWorkspaceFolder[]
  workspaceSessionKey?: string
  activeFolderIndex?: string
  onFocusedFolderChange?: (index: string) => void
  workspaceEmptyMessage?: string
  onRegisterLayoutLeave?: (handler: (action: () => void) => void) => void
  onOpenInTerminal?: (absoluteCwd: string) => void
}

export function EditorPage({
  repoCwd,
  workspaceFolders,
  workspaceSessionKey,
  activeFolderIndex,
  onFocusedFolderChange,
  workspaceEmptyMessage,
  onRegisterLayoutLeave,
  onOpenInTerminal,
  shellTabActive = true,
}: EditorPageProps) {
  return (
    <EditorWorkbench
      repoCwd={repoCwd}
      workspaceFolders={workspaceFolders}
      workspaceSessionKey={workspaceSessionKey}
      activeFolderIndex={activeFolderIndex}
      onFocusedFolderChange={onFocusedFolderChange}
      workspaceEmptyMessage={workspaceEmptyMessage}
      onRegisterLayoutLeave={onRegisterLayoutLeave}
      onOpenInTerminal={onOpenInTerminal}
      shellTabActive={shellTabActive}
    />
  )
}
