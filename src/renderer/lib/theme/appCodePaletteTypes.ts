import type { THEMES } from '@/components/shared/constants'

export type AppThemeId = (typeof THEMES)[number]

export type EditorSyntaxColors = {
  keyword: string
  keywordControl: string
  string: string
  comment: string
  number: string
  function: string
  type: string
  variable: string
  constant: string
  operator: string
  tag: string
  attribute: string
  regexp: string
  delimiter: string
  brackets: readonly [string, string, string, string, string, string]
}

export type TerminalAnsiColors = {
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export type DiffEditorColors = {
  insertedTextBackground: string
  removedTextBackground: string
  insertedLineBackground: string
  removedLineBackground: string
}

/** Editor + terminal text selection (VS Code `editor.selection*` equivalents). */
export type EditorSelectionColors = {
  background: string
  inactiveBackground: string
  foreground: string
}

export type AppCodePalette = {
  editor: EditorSyntaxColors
  terminal: TerminalAnsiColors
  diff: DiffEditorColors
  selection: EditorSelectionColors
}

export type AppCodePaletteCore = Omit<AppCodePalette, 'selection'>

export type AppCodePaletteMode = Record<'light' | 'dark', AppCodePaletteCore>
