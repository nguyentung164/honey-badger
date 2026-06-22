export type DiffViewerWordWrap = 'on' | 'off'

export type DiffWordWrap = 'off' | 'on' | 'inherit'

export type FindSeedSelection = 'never' | 'always' | 'selection'

export type AutoFindInSelection = 'never' | 'always' | 'multiline'

export const DIFF_VIEWER_FONT_SIZE_MIN = 10
export const DIFF_VIEWER_FONT_SIZE_MAX = 24
export const DIFF_VIEWER_FONT_SIZE_DEFAULT = 12

export const DIFF_VIEWER_LINE_DECORATIONS_WIDTH_MIN = 5
export const DIFF_VIEWER_LINE_DECORATIONS_WIDTH_MAX = 220
export const DIFF_VIEWER_LINE_DECORATIONS_WIDTH_DEFAULT = 10
/** Width for date + author blame column (immediately after line numbers). */
export const DIFF_VIEWER_BLAME_LINE_DECORATIONS_WIDTH = 176

export type DiffViewerViewOptions = {
  wordWrap: DiffViewerWordWrap
  minimap: boolean
  renderSideBySide: boolean
  ignoreTrimWhitespace: boolean
  collapseUnchangedRegions: boolean
  diffOnly: boolean
  fontSize: number
  compactMode: boolean
  renderOverviewRuler: boolean
  diffWordWrap: DiffWordWrap
  originalEditable: boolean
  diffCodeLens: boolean
  showMoves: boolean
  showEmptyDecorations: boolean
  fontLigatures: boolean
  fontVariations: boolean
  glyphMargin: boolean
  lineDecorationsWidth: number
  findSeedFromSelection: FindSeedSelection
  findLoop: boolean
  findOnType: boolean
  autoFindInSelection: AutoFindInSelection
  findAddExtraSpaceOnTop: boolean
  diffAlgorithm: 'advanced' | 'legacy'
  showBlame: boolean
}

export type DiffViewerViewOptionKey = keyof DiffViewerViewOptions

export type DiffStats = {
  additions: number
  deletions: number
}

export type CharDiffStats = {
  charAdditions: number
  charDeletions: number
}

export type ChangePosition = {
  current: number
  total: number
}
