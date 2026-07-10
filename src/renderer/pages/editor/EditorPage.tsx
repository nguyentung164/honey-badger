'use client'

import { EditorWorkbench } from '@/pages/editor/EditorWorkbench'
import type { EditorWorkspaceFolder } from '@/lib/multiRepoUtils'
import { normalizeEditorRepoKey } from '@/pages/editor/lib/editorSessionPersist'

export type EditorPageProps = {
  repoCwd?: string
  workspaceFolders?: EditorWorkspaceFolder[]
  workspaceSessionKey?: string
  activeFolderIndex?: string
  onFocusedFolderChange?: (index: string) => void
  workspaceEmptyMessage?: string
  onRegisterLayoutLeave?: (handler: (action: () => void) => void) => void
  onOpenInTerminal?: (absoluteCwd: string) => void
  terminalOpen?: boolean
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
    />
  )
}
