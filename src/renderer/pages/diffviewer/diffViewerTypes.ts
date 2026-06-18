export type DiffViewerWordWrap = 'on' | 'off'

export const DIFF_VIEWER_FONT_SIZE_MIN = 10
export const DIFF_VIEWER_FONT_SIZE_MAX = 24
export const DIFF_VIEWER_FONT_SIZE_DEFAULT = 12

export type DiffViewerViewOptions = {
  wordWrap: DiffViewerWordWrap
  minimap: boolean
  renderSideBySide: boolean
  ignoreTrimWhitespace: boolean
  collapseUnchangedRegions: boolean
  diffOnly: boolean
  fontSize: number
}

export type DiffViewerViewOptionKey = keyof DiffViewerViewOptions

export type DiffStats = {
  additions: number
  deletions: number
}

export type ChangePosition = {
  current: number
  total: number
}
