'use client'

import { EditorWorkbench } from '@/pages/editor/EditorWorkbench'

export type EditorPageProps = {
  repoCwd?: string
  onRegisterLayoutLeave?: (handler: (action: () => void) => void) => void
  onOpenInTerminal?: (absoluteCwd: string) => void
  terminalOpen?: boolean
}

export function EditorPage({ repoCwd, onRegisterLayoutLeave, onOpenInTerminal }: EditorPageProps) {
  return (
    <EditorWorkbench
      repoCwd={repoCwd}
      onRegisterLayoutLeave={onRegisterLayoutLeave}
      onOpenInTerminal={onOpenInTerminal}
    />
  )
}
