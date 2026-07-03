export type EditorTabKind = 'text' | 'binary' | 'image' | 'compare'

export type EditorTab = {
  id: string
  relativePath: string
  languageId: string
  isDirty: boolean
  isLoading: boolean
  /** False for restored tabs until content is read from disk. */
  contentLoaded: boolean
  /** VS Code preview tab — replaced on next single-click open until pinned. */
  isPreview: boolean
  isPinned: boolean
  kind: EditorTabKind
  version: number
  /** Bumped when content is loaded/reloaded from disk — triggers model sync. */
  loadGeneration: number
  reveal?: { line: number; column: number }
  /** Serialized Monaco ICodeEditorViewState for tab switch restore. */
  viewStateJson?: string
  /** Right-hand file path when `kind === 'compare'`. */
  compareWithPath?: string
}

export type OpenFileOptions = {
  line?: number
  column?: number
  /** Single-click explorer open — reuses preview slot. */
  preview?: boolean
  /** Double-click or explicit pin — keeps tab open. */
  pin?: boolean
  /** Skip the large-file confirmation gate. */
  forceLarge?: boolean
}

export function tabIdForCompare(leftPath: string, rightPath: string): string {
  const left = leftPath.replace(/\\/g, '/')
  const right = rightPath.replace(/\\/g, '/')
  return `compare:${left}\0${right}`
}

export function isCompareTabId(tabId: string): boolean {
  return tabId.startsWith('compare:')
}

export function compareTabLabel(leftPath: string, rightPath: string): string {
  const leftName = leftPath.split('/').pop() ?? leftPath
  const rightName = rightPath.split('/').pop() ?? rightPath
  return `${leftName} ↔ ${rightName}`
}

export const MAX_EDITOR_TABS = 20

export const EDITOR_OPEN_TABS_KEY_PREFIX = 'editor-open-tabs:'
export const EDITOR_SESSION_KEY_PREFIX = 'editor-session:'
