import type { editor as MonacoEditor } from 'monaco-editor'

export type DiffViewerPaneLabelVariant = 'head' | 'working' | 'revision'

export const DIFF_VIEWER_PANE_LABEL_HOST_CLASS = 'diff-viewer-pane-label-host'
export const DIFF_VIEWER_PANE_BADGE_CLASS = 'diff-viewer-pane-badge'

export function resolveDiffViewerPaneLabelVariant(label: string): DiffViewerPaneLabelVariant {
  const trimmed = label.trim()
  if (trimmed === 'Working Copy' || trimmed === 'Working Base') return 'working'
  if (trimmed === 'HEAD') return 'head'
  return 'revision'
}

export function diffViewerPaneBadgeClassName(label: string): string {
  return `${DIFF_VIEWER_PANE_BADGE_CLASS} ${DIFF_VIEWER_PANE_BADGE_CLASS}--${resolveDiffViewerPaneLabelVariant(label)}`
}

export function syncDiffViewerPaneBadgeElement(el: HTMLElement, label: string): void {
  el.className = diffViewerPaneBadgeClassName(label)
  el.textContent = label
  el.title = label
}

export function createDiffViewerPaneLabelHost(): HTMLDivElement {
  const host = document.createElement('div')
  host.className = DIFF_VIEWER_PANE_LABEL_HOST_CLASS
  host.setAttribute('aria-hidden', 'true')

  const badge = document.createElement('span')
  host.appendChild(badge)
  return host
}

/** Minimum width (px) before Monaco treats the original pane as a visible side-by-side column. */
export const DIFF_EDITOR_SIDE_BY_SIDE_PANE_MIN_WIDTH = 8

export function getDiffEditorRootElement(diffEditor: MonacoEditor.IStandaloneDiffEditor): HTMLElement | null {
  const container = diffEditor.getContainerDomNode()
  return container.querySelector('.monaco-diff-editor') ?? container
}

export function getDiffEditorPaneElement(
  diffEditor: MonacoEditor.IStandaloneDiffEditor,
  side: 'original' | 'modified'
): HTMLElement | null {
  const root = getDiffEditorRootElement(diffEditor)
  if (!root) return null
  return root.querySelector(`.editor.${side}`) as HTMLElement | null
}

/**
 * Whether the diff editor currently shows separate original/modified panes.
 * Follows Monaco's own layout: the root toggles `side-by-side` when the sash layout is active
 * (including auto-inline when the viewport is too narrow).
 */
export function isDiffEditorShowingSideBySidePanes(diffEditor: MonacoEditor.IStandaloneDiffEditor): boolean {
  const root = getDiffEditorRootElement(diffEditor)
  if (!root?.classList.contains('side-by-side')) {
    return false
  }

  const originalPane = getDiffEditorPaneElement(diffEditor, 'original')
  if (!originalPane) return false

  return originalPane.getBoundingClientRect().width >= DIFF_EDITOR_SIDE_BY_SIDE_PANE_MIN_WIDTH
}
