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
