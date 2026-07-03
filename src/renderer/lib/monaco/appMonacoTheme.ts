import type * as Monaco from 'monaco-editor'
import { configureMonacoWorkers } from '@/lib/monaco/configureMonacoWorkers'
import { readCssVarAsHexColor, resolveCssColorToHexWithAlpha } from '@/lib/terminal/cssColorResolver'
import {
  buildMonacoBracketColors,
  buildMonacoDiffColors,
  buildMonacoTokenRules,
  type EditorSyntaxPreviewColors,
  resolveAppCodePalette,
  resolveCurrentAppThemeId,
  toEditorSyntaxPreviewColors,
} from '@/lib/theme/appCodePalettes'
import type { AppThemeId } from '@/lib/theme/appCodePaletteTypes'
import { readCssVarForAppearance, resolveAppIsDarkFromDocument } from '@/lib/theme/appThemeMode'

export const EDITOR_BRACKET_COLORS = ['#ffd700', '#da70d6', '#179fff', '#00fca0', '#f78383', '#b589f8'] as const

export const APP_MONACO_THEME_IDS = {
  dark: 'hb-app-dark',
  light: 'hb-app-light',
} as const

/** Legacy theme ids still referenced by diff / stash / conflict viewers. */
export const APP_MONACO_THEME_ALIASES = {
  dark: ['hb-editor-dark', 'custom-dark', 'svn-conflict-dark', 'stash-viewer-dark'] as const,
  light: ['hb-editor-light', 'custom-light', 'svn-conflict-light', 'stash-viewer-light'] as const,
}

export type AppMonacoThemeRegisterOptions = {
  includeDiff?: boolean
  includeEditorRules?: boolean
}

function readAppMonacoBaseColors(themeId: AppThemeId, appIsDark: boolean): Record<string, string> {
  const palette = resolveAppCodePalette(themeId, appIsDark)
  const readVar = (varName: string, fallback: string) => readCssVarForAppearance(varName, themeId, appIsDark, fallback, (el, name, fb) => readCssVarAsHexColor(name, fb, el))

  const fallbackBg = appIsDark ? '#1e1e1e' : '#ffffff'
  const fallbackFg = appIsDark ? '#d4d4d4' : '#000000'

  const bg = readVar('--background', fallbackBg)
  const fg = readVar('--foreground', fallbackFg)
  const muted = readVar('--muted-foreground', appIsDark ? '#6c7086' : '#6e7781')
  const primary = readVar('--primary', palette.editor.keyword)
  const accent = readVar('--accent', appIsDark ? '#264f78' : '#add6ff')
  const border = readVar('--border', appIsDark ? '#3f3f46' : '#e4e4e7')
  const card = readVar('--card', bg)
  const popover = readVar('--popover', card)

  return {
    'editor.background': bg,
    'editor.foreground': fg,
    'editorLineNumber.foreground': muted,
    'editorLineNumber.activeForeground': fg,
    'editorCursor.foreground': primary,
    'editor.selectionBackground': resolveCssColorToHexWithAlpha(accent, appIsDark ? '#264f78' : '#add6ff', 0x99),
    'editor.inactiveSelectionBackground': resolveCssColorToHexWithAlpha(accent, appIsDark ? '#264f78' : '#add6ff', 0x44),
    'editorWidget.background': popover,
    'editorWidget.border': border,
    'editorGutter.background': bg,
    'minimap.background': bg,
    'scrollbarSlider.background': resolveCssColorToHexWithAlpha(muted, appIsDark ? '#6c7086' : '#9aa2b1', 0x55),
    'scrollbarSlider.hoverBackground': resolveCssColorToHexWithAlpha(muted, appIsDark ? '#6c7086' : '#9aa2b1', 0x88),
  }
}

function buildThemeDefinition(appIsDark: boolean, options: AppMonacoThemeRegisterOptions): Monaco.editor.IStandaloneThemeData {
  const themeId = resolveCurrentAppThemeId()
  const palette = resolveAppCodePalette(themeId, appIsDark)

  const colors: Record<string, string> = {
    ...readAppMonacoBaseColors(themeId, appIsDark),
    ...(options.includeDiff ? buildMonacoDiffColors(palette.diff) : {}),
    ...(options.includeEditorRules ? buildMonacoBracketColors(palette.editor) : {}),
  }

  return {
    base: appIsDark ? 'vs-dark' : 'vs',
    inherit: appIsDark,
    rules: options.includeEditorRules ? buildMonacoTokenRules(palette.editor) : [],
    colors,
  }
}

/** Register app-matched Monaco themes (re-reads CSS vars + palette each call). */
export function registerAppMonacoThemes(monaco: typeof Monaco, options: AppMonacoThemeRegisterOptions = { includeDiff: true, includeEditorRules: true }): void {
  const dark = buildThemeDefinition(true, options)
  const light = buildThemeDefinition(false, options)

  monaco.editor.defineTheme(APP_MONACO_THEME_IDS.dark, dark)
  monaco.editor.defineTheme(APP_MONACO_THEME_IDS.light, light)

  for (const id of APP_MONACO_THEME_ALIASES.dark) {
    monaco.editor.defineTheme(id, dark)
  }
  for (const id of APP_MONACO_THEME_ALIASES.light) {
    monaco.editor.defineTheme(id, light)
  }
}

export function resolveAppIsDark(themeMode: 'light' | 'dark', _resolvedTheme?: string | null): boolean {
  if (typeof document !== 'undefined') {
    return resolveAppIsDarkFromDocument()
  }
  return themeMode === 'dark'
}

export function resolveAppMonacoThemeId(appIsDark: boolean): string {
  return appIsDark ? APP_MONACO_THEME_IDS.dark : APP_MONACO_THEME_IDS.light
}

export function applyAppMonacoTheme(monaco: typeof Monaco, appIsDark: boolean, themeId?: string): void {
  registerAppMonacoThemes(monaco)
  monaco.editor.setTheme(themeId ?? resolveAppMonacoThemeId(appIsDark))
}

export function onAppMonacoBeforeMount(monaco: typeof Monaco): void {
  configureMonacoWorkers()
  registerAppMonacoThemes(monaco, { includeDiff: true, includeEditorRules: true })
}

export function readAppMonacoPreviewColors(appIsDark: boolean): EditorSyntaxPreviewColors {
  const themeId = resolveCurrentAppThemeId()
  const palette = resolveAppCodePalette(themeId, appIsDark)
  const base = readAppMonacoBaseColors(themeId, appIsDark)
  return toEditorSyntaxPreviewColors(
    {
      background: base['editor.background'] ?? (appIsDark ? '#1e1e1e' : '#ffffff'),
      foreground: base['editor.foreground'] ?? (appIsDark ? '#d4d4d4' : '#000000'),
    },
    palette.editor
  )
}

export type { EditorSyntaxPreviewColors as EditorThemePreviewColors }
