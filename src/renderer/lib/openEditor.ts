import i18n from 'i18next'
import toast from '@/components/ui-elements/Toast'
import { isLoggedInMainShellUser } from '@/lib/mainShellTabAccess'

export type EditorOpenPayload = {
  filePath: string
  cwd?: string
  line?: number
  column?: number
}

export const MAIN_SHELL_OPEN_EDITOR_EVENT = 'main-shell:open-editor'

let pendingEditorOpen: EditorOpenPayload | null = null

export function canOpenEditorEmbedded(): boolean {
  return isLoggedInMainShellUser()
}

export function takePendingEditorOpen(): EditorOpenPayload | null {
  const pending = pendingEditorOpen
  pendingEditorOpen = null
  return pending
}

export function clearPendingEditorOpen(): void {
  pendingEditorOpen = null
}

/** Switch to the embedded Editor tab and open a repo-relative file path. */
export function requestOpenEditor(data: EditorOpenPayload): void {
  if (!data.filePath?.trim()) return
  if (!canOpenEditorEmbedded()) {
    toast.warning(i18n.t('editor.loginRequired', 'Sign in to use the built-in editor.'))
    return
  }
  pendingEditorOpen = data
  window.dispatchEvent(new CustomEvent(MAIN_SHELL_OPEN_EDITOR_EVENT, { detail: data }))
}
