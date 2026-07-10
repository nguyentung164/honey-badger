export type EditorTabKind = 'text' | 'binary' | 'image' | 'compare'

export type EditorTab = {
  id: string
  relativePath: string
  /** Workspace folder root (absolute path). VS Code: workspace folder URI. */
  repoRoot: string
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
  /** Workspace folder root when opening from multi-root explorer. */
  repoRoot?: string
}

export function tabIdForResource(repoRoot: string, relativePath: string): string {
  const root = repoRoot.replace(/[/\\]+$/, '').replace(/\\/g, '/')
  const path = relativePath.replace(/\\/g, '/')
  return `${root}::${path}`
}

export function tabRepoRoot(tab: EditorTab, fallbackCwd = ''): string {
  return tab.repoRoot?.trim() || fallbackCwd
}

export function tabIdForCompare(repoRoot: string, leftPath: string, rightPath: string): string {
  const root = repoRoot.replace(/[/\\]+$/, '').replace(/\\/g, '/')
  const left = leftPath.replace(/\\/g, '/')
  const right = rightPath.replace(/\\/g, '/')
  return `compare:${root}::${left}\0${right}`
}

export function isCompareTabId(tabId: string): boolean {
  return tabId.startsWith('compare:')
}

export function compareTabLabel(repoRoot: string, leftPath: string, rightPath: string): string {
  const leftName = leftPath.split('/').pop() ?? leftPath
  const rightName = rightPath.split('/').pop() ?? rightPath
  const folderName = repoRoot.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? repoRoot
  if (leftName === rightName) return `${leftName} (${folderName}) ↔ ${rightName}`
  return `${leftName} ↔ ${rightName}`
}

export const MAX_EDITOR_TABS = 20

export const EDITOR_OPEN_TABS_KEY_PREFIX = 'editor-open-tabs:'
export const EDITOR_SESSION_KEY_PREFIX = 'editor-session:'
