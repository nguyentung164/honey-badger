export type DirtyWriteChoice = 'overwrite' | 'revert' | 'compare' | 'cancel'

export type DirtyWritePromptPayload = {
  relativePath: string
  fileName: string
  diskContent: string
  editorContent: string
}

export const EDITOR_DIRTY_WRITE_EVENT = 'hb:editor-dirty-write'

type Resolver = (choice: DirtyWriteChoice) => void

let pendingResolver: Resolver | null = null

export function requestDirtyWriteChoice(payload: DirtyWritePromptPayload): Promise<DirtyWriteChoice> {
  return new Promise(resolve => {
    if (pendingResolver) pendingResolver('cancel')
    pendingResolver = resolve
    window.dispatchEvent(new CustomEvent(EDITOR_DIRTY_WRITE_EVENT, { detail: payload }))
  })
}

export function resolveDirtyWriteChoice(choice: DirtyWriteChoice): void {
  pendingResolver?.(choice)
  pendingResolver = null
}
