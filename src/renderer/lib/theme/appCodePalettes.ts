import { THEMES } from '@/components/shared/constants'
import { APP_CODE_PALETTE_REGISTRY, APP_SELECTION_REGISTRY } from '@/lib/theme/appCodePaletteData'
import type { AppCodePalette, AppThemeId } from '@/lib/theme/appCodePaletteTypes'
import type * as Monaco from 'monaco-editor'

export type { AppCodePalette, AppThemeId, EditorSyntaxColors, TerminalAnsiColors } from '@/lib/theme/appCodePaletteTypes'

export function resolveCurrentAppThemeId(): AppThemeId {
  if (typeof document === 'undefined') return 'theme-default'
  const html = document.documentElement
  for (const themeId of THEMES) {
    if (html.classList.contains(themeId)) return themeId
  }
  return 'theme-default'
}

export function resolveAppCodePalette(themeId: AppThemeId, appIsDark: boolean): AppCodePalette {
  const mode = appIsDark ? 'dark' : 'light'
  const base = APP_CODE_PALETTE_REGISTRY[themeId]?.[mode] ?? APP_CODE_PALETTE_REGISTRY['theme-default'][mode]
  const selection = APP_SELECTION_REGISTRY[themeId]?.[mode] ?? APP_SELECTION_REGISTRY['theme-default'][mode]
  return { ...base, selection }
}

function stripHash(color: string): string {
  return color.replace(/^#/, '')
}

/** Build Monaco token rules from a syntax palette (works with inherit: true on vs / vs-dark). */
export function buildMonacoTokenRules(palette: AppCodePalette['editor']): Monaco.editor.ITokenThemeRule[] {
  const fg = (color: string) => stripHash(color)
  const rules: Monaco.editor.ITokenThemeRule[] = [
    { token: 'comment', foreground: fg(palette.comment), fontStyle: 'italic' },
    { token: 'comment.doc', foreground: fg(palette.comment), fontStyle: 'italic' },
    { token: 'comment.block', foreground: fg(palette.comment), fontStyle: 'italic' },
    { token: 'comment.line', foreground: fg(palette.comment), fontStyle: 'italic' },
    { token: 'string', foreground: fg(palette.string) },
    { token: 'string.sql', foreground: fg(palette.string) },
    { token: 'string.key', foreground: fg(palette.attribute) },
    { token: 'string.value', foreground: fg(palette.string) },
    { token: 'string.escape', foreground: fg(palette.constant) },
    { token: 'keyword', foreground: fg(palette.keyword) },
    { token: 'keyword.control', foreground: fg(palette.keywordControl) },
    { token: 'keyword.flow', foreground: fg(palette.keywordControl) },
    { token: 'keyword.json', foreground: fg(palette.keyword) },
    { token: 'keyword.sql', foreground: fg(palette.keyword) },
    { token: 'keyword.module', foreground: fg(palette.keyword) },
    { token: 'predefined', foreground: fg(palette.keyword) },
    { token: 'predefined.sql', foreground: fg(palette.keyword) },
    { token: 'number', foreground: fg(palette.number) },
    { token: 'number.hex', foreground: fg(palette.number) },
    { token: 'number.float', foreground: fg(palette.number) },
    { token: 'number.binary', foreground: fg(palette.number) },
    { token: 'number.octal', foreground: fg(palette.number) },
    { token: 'regexp', foreground: fg(palette.regexp) },
    { token: 'operator', foreground: fg(palette.operator) },
    { token: 'operator.sql', foreground: fg(palette.operator) },
    { token: 'delimiter', foreground: fg(palette.delimiter) },
    { token: 'delimiter.bracket', foreground: fg(palette.delimiter) },
    { token: 'delimiter.parenthesis', foreground: fg(palette.delimiter) },
    { token: 'delimiter.square', foreground: fg(palette.delimiter) },
    { token: 'delimiter.angle', foreground: fg(palette.delimiter) },
    { token: 'delimiter.curly', foreground: fg(palette.delimiter) },
    { token: 'type', foreground: fg(palette.type) },
    { token: 'type.identifier', foreground: fg(palette.type) },
    { token: 'class', foreground: fg(palette.type) },
    { token: 'interface', foreground: fg(palette.type) },
    { token: 'struct', foreground: fg(palette.type) },
    { token: 'enum', foreground: fg(palette.type) },
    { token: 'enumMember', foreground: fg(palette.constant) },
    { token: 'namespace', foreground: fg(palette.type) },
    { token: 'function', foreground: fg(palette.function) },
    { token: 'method', foreground: fg(palette.function) },
    { token: 'member', foreground: fg(palette.function) },
    { token: 'macro', foreground: fg(palette.function) },
    { token: 'variable', foreground: fg(palette.variable) },
    { token: 'variable.parameter', foreground: fg(palette.variable), fontStyle: 'italic' },
    { token: 'variable.predefined', foreground: fg(palette.constant) },
    { token: 'variable.language', foreground: fg(palette.keyword) },
    { token: 'parameter', foreground: fg(palette.variable), fontStyle: 'italic' },
    { token: 'property', foreground: fg(palette.attribute) },
    { token: 'constant', foreground: fg(palette.constant) },
    { token: 'tag', foreground: fg(palette.tag) },
    { token: 'metatag', foreground: fg(palette.tag) },
    { token: 'metatag.content', foreground: fg(palette.string) },
    { token: 'attribute.name', foreground: fg(palette.attribute) },
    { token: 'attribute.value', foreground: fg(palette.string) },
    { token: 'attribute.value.number', foreground: fg(palette.number) },
    { token: 'attribute.value.unit', foreground: fg(palette.number) },
    { token: 'key', foreground: fg(palette.attribute) },
    { token: 'identifier', foreground: fg(palette.variable) },
    { token: 'identifier.quote', foreground: fg(palette.variable) },
  ]
  return rules
}

export function buildMonacoBracketColors(palette: AppCodePalette['editor']): Record<string, string> {
  const out: Record<string, string> = {}
  palette.brackets.forEach((color, index) => {
    const n = index + 1
    out[`editorBracketHighlight.foreground${n}`] = color
    out[`editorBracketPairGuide.activeBackground${n}`] = `${color}40`
    out[`editorBracketPairGuide.background${n}`] = `${color}22`
  })
  return out
}

/** VS Code `diffEditor.*` tokens for inline diff + hide-unchanged widgets. */
export function buildMonacoDiffColors(
  diff: AppCodePalette['diff'],
  chrome: { foreground: string; sideBarBackground: string },
  appIsDark: boolean
): Record<string, string> {
  return {
    'diffEditor.insertedTextBackground': diff.insertedTextBackground,
    'diffEditor.removedTextBackground': diff.removedTextBackground,
    'diffEditor.insertedLineBackground': diff.insertedLineBackground,
    'diffEditor.removedLineBackground': diff.removedLineBackground,
    'diffEditor.unchangedCodeBackground': appIsDark ? '#74747429' : '#b8b8b829',
    'diffEditor.unchangedRegionBackground': chrome.sideBarBackground,
    'diffEditor.unchangedRegionForeground': chrome.foreground,
    'diffEditor.unchangedRegionShadow': appIsDark ? '#00000066' : '#73737366',
  }
}

export type EditorSyntaxPreviewColors = {
  background: string
  foreground: string
  keyword: string
  keywordControl: string
  string: string
  comment: string
  number: string
  function: string
  type: string
  variable: string
}

export function toEditorSyntaxPreviewColors(
  base: { background: string; foreground: string },
  editor: AppCodePalette['editor']
): EditorSyntaxPreviewColors {
  return {
    background: base.background,
    foreground: base.foreground,
    keyword: editor.keyword,
    keywordControl: editor.keywordControl,
    string: editor.string,
    comment: editor.comment,
    number: editor.number,
    function: editor.function,
    type: editor.type,
    variable: editor.variable,
  }
}
