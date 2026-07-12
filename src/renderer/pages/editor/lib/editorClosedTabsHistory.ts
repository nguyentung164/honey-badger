import type { EditorTabKind } from '@/pages/editor/lib/editorWorkspaceTypes'

/** VS Code: HistoryService.MAX_RECENTLY_CLOSED_EDITORS */
export const MAX_RECENTLY_CLOSED_EDITOR_TABS = 20

export type ClosedEditorTabEntry = {
  relativePath: string
  repoRoot: string
  kind: EditorTabKind
  compareWithPath?: string
  reveal?: { line: number; column: number }
  /** Tab index at close time (VS Code restores position when possible). */
  index: number
  /** VS Code sticky editor — pinned to the front of the tab strip. */
  sticky: boolean
  /** Editors closed in the same synchronous turn share a batch id. */
  batchId: number
}

let recentlyClosedEditors: ClosedEditorTabEntry[] = []
let ignoreCloseRecording = false
let recentlyClosedEditorsBatchId = 0
let recentlyClosedEditorsBatchScheduled = false
let explicitCloseBatchId: number | null = null
let explicitCloseBatchDepth = 0

function currentClosedEditorsBatchId(): number {
  if (explicitCloseBatchId !== null) return explicitCloseBatchId

  if (!recentlyClosedEditorsBatchScheduled) {
    recentlyClosedEditorsBatchScheduled = true
    recentlyClosedEditorsBatchId++
    queueMicrotask(() => {
      recentlyClosedEditorsBatchScheduled = false
    })
  }
  return recentlyClosedEditorsBatchId
}

function entryKey(entry: Pick<ClosedEditorTabEntry, 'relativePath' | 'repoRoot' | 'kind' | 'compareWithPath'>): string {
  const root = entry.repoRoot.replace(/[/\\]+$/, '').replace(/\\/g, '/')
  const path = entry.relativePath.replace(/\\/g, '/')
  if (entry.kind === 'compare' && entry.compareWithPath) {
    const right = entry.compareWithPath.replace(/\\/g, '/')
    return `compare:${root}::${path}\0${right}`
  }
  return `${root}::${path}`
}

/** VS Code: editor.canReopen() — only resource-backed editors enter the stack. */
export function canReopenEditorTab(tab: {
  kind: EditorTabKind
  relativePath: string
  repoRoot: string
  compareWithPath?: string
}): boolean {
  const path = tab.relativePath.trim()
  const repoRoot = tab.repoRoot.trim()
  if (!path || !repoRoot) return false

  if (tab.kind === 'compare') {
    const right = tab.compareWithPath?.trim()
    if (!right) return false
    if (path.includes(' (') || right.includes(' (')) return false
    return true
  }

  return tab.kind === 'text' || tab.kind === 'binary' || tab.kind === 'image'
}

export function hasClosedEditorTabs(): boolean {
  return recentlyClosedEditors.length > 0
}

export function clearClosedEditorTabsHistory(): void {
  recentlyClosedEditors = []
}

/** VS Code: Close All / Close Others share one batch even across dirty confirm dialogs. */
export function beginCloseEditorsBatch(): void {
  if (explicitCloseBatchDepth === 0) {
    recentlyClosedEditorsBatchId += 1
    explicitCloseBatchId = recentlyClosedEditorsBatchId
  }
  explicitCloseBatchDepth += 1
}

export function endCloseEditorsBatch(): void {
  explicitCloseBatchDepth = Math.max(0, explicitCloseBatchDepth - 1)
  if (explicitCloseBatchDepth === 0) {
    explicitCloseBatchId = null
  }
}

export async function runIgnoringClosedEditorRecording(fn: () => void | Promise<void>): Promise<void> {
  ignoreCloseRecording = true
  try {
    await fn()
  } finally {
    ignoreCloseRecording = false
  }
}

export function recordClosedEditorTab(
  tab: {
    kind: EditorTabKind
    relativePath: string
    repoRoot: string
    compareWithPath?: string
    reveal?: { line: number; column: number }
    isSticky: boolean
  },
  index: number
): void {
  if (ignoreCloseRecording) return
  if (!canReopenEditorTab(tab)) return

  const entry: ClosedEditorTabEntry = {
    relativePath: tab.relativePath.replace(/\\/g, '/'),
    repoRoot: tab.repoRoot,
    kind: tab.kind,
    compareWithPath: tab.compareWithPath?.replace(/\\/g, '/'),
    reveal: tab.reveal,
    index,
    sticky: tab.isSticky,
    batchId: currentClosedEditorsBatchId(),
  }

  const key = entryKey(entry)
  recentlyClosedEditors = recentlyClosedEditors.filter(existing => entryKey(existing) !== key)
  recentlyClosedEditors.push(entry)

  if (recentlyClosedEditors.length > MAX_RECENTLY_CLOSED_EDITOR_TABS) {
    recentlyClosedEditors.shift()
  }
}

export function removeClosedEditorTabsForPath(relativePath: string, repoRoot: string, isDir: boolean): void {
  const target = relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const rootKey = repoRoot.replace(/[/\\]+$/, '').replace(/\\/g, '/')
  recentlyClosedEditors = recentlyClosedEditors.filter(entry => {
    const entryRoot = entry.repoRoot.replace(/[/\\]+$/, '').replace(/\\/g, '/')
    if (entryRoot !== rootKey) return true

    const paths = [entry.relativePath.replace(/\\/g, '/')]
    if (entry.compareWithPath) paths.push(entry.compareWithPath.replace(/\\/g, '/'))

    return !paths.some(path => {
      if (isDir) return path === target || path.startsWith(`${target}/`)
      return path === target
    })
  })
}

export function takeLastClosedEditorsBatch(): ClosedEditorTabEntry[] {
  const lastClosedEditor = recentlyClosedEditors.at(-1)
  if (!lastClosedEditor) return []

  const batch: ClosedEditorTabEntry[] = []
  while (
    recentlyClosedEditors.length &&
    recentlyClosedEditors[recentlyClosedEditors.length - 1].batchId === lastClosedEditor.batchId
  ) {
    const popped = recentlyClosedEditors.pop()
    if (popped) batch.unshift(popped)
  }
  return batch
}
