import type { ITheme } from '@xterm/xterm'
import type { TerminalCursorStyle } from '@/lib/terminal/terminalPrefs'
import { readCssVarAsXtermColor } from '@/lib/terminal/cssColorResolver'
import { resolveAppCodePalette, resolveCurrentAppThemeId } from '@/lib/theme/appCodePalettes'
import { readCssVarForAppearance, resolveAppIsDarkFromDocument } from '@/lib/theme/appThemeMode'

export type TerminalThemeColors = {
  background: string
  foreground: string
  cursor: string
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

function toThemeColors(theme: ITheme): TerminalThemeColors {
  return {
    background: theme.background ?? '#1e1e1e',
    foreground: theme.foreground ?? '#d4d4d4',
    cursor: theme.cursor ?? theme.foreground ?? '#d4d4d4',
    black: theme.black ?? '#000000',
    red: theme.red ?? '#cd3131',
    green: theme.green ?? '#0dbc79',
    yellow: theme.yellow ?? '#e5e510',
    blue: theme.blue ?? '#2472c8',
    magenta: theme.magenta ?? '#bc3fbc',
    cyan: theme.cyan ?? '#11a8cd',
    white: theme.white ?? theme.foreground ?? '#e5e5e5',
    brightBlack: theme.brightBlack ?? '#666666',
    brightRed: theme.brightRed ?? theme.red ?? '#f14c4c',
    brightGreen: theme.brightGreen ?? theme.green ?? '#23d18b',
    brightYellow: theme.brightYellow ?? theme.yellow ?? '#f5f543',
    brightBlue: theme.brightBlue ?? theme.blue ?? '#3b8eea',
    brightMagenta: theme.brightMagenta ?? theme.magenta ?? '#d670d6',
    brightCyan: theme.brightCyan ?? theme.cyan ?? '#29b8db',
    brightWhite: theme.brightWhite ?? theme.foreground ?? '#ffffff',
  }
}

function isAppDarkMode(): boolean {
  return resolveAppIsDarkFromDocument()
}

function buildAppThemeFromPalette(appIsDark: boolean): ITheme {
  const themeId = resolveCurrentAppThemeId()
  const { terminal } = resolveAppCodePalette(themeId, appIsDark)
  const readVar = (varName: string, fallback: string) =>
    readCssVarForAppearance(varName, themeId, appIsDark, fallback, (el, name, fb) => readCssVarAsXtermColor(name, fb, el))

  const fallbackBg = appIsDark ? '#1e1e1e' : '#ffffff'
  const fallbackFg = appIsDark ? '#d4d4d4' : '#383a42'

  return {
    background: readVar('--background', fallbackBg),
    foreground: readVar('--foreground', fallbackFg),
    cursor: readVar('--primary', fallbackFg),
    cursorAccent: readVar('--primary-foreground', fallbackBg),
    selectionBackground: readVar('--accent', appIsDark ? '#264f78' : '#add6ff'),
    selectionForeground: readVar('--accent-foreground', appIsDark ? '#ffffff' : fallbackFg),
    black: terminal.black,
    red: terminal.red,
    green: terminal.green,
    yellow: terminal.yellow,
    blue: terminal.blue,
    magenta: terminal.magenta,
    cyan: terminal.cyan,
    white: terminal.white,
    brightBlack: terminal.brightBlack,
    brightRed: terminal.brightRed,
    brightGreen: terminal.brightGreen,
    brightYellow: terminal.brightYellow,
    brightBlue: terminal.brightBlue,
    brightMagenta: terminal.brightMagenta,
    brightCyan: terminal.brightCyan,
    brightWhite: readVar('--foreground', terminal.brightWhite),
  }
}

/** Terminal colors follow the app appearance theme (Settings → Appearance). */
export function buildXtermTheme(): ITheme {
  return buildAppThemeFromPalette(isAppDarkMode())
}

export function getTerminalThemeColors(): TerminalThemeColors {
  return toThemeColors(buildXtermTheme())
}

export function applyTerminalCursorColor(
  theme: ITheme,
  cursorColorMode: 'theme' | 'custom',
  cursorColor: string
): ITheme {
  if (cursorColorMode !== 'custom') return theme
  const color = cursorColor.trim()
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return theme
  return { ...theme, cursor: color }
}

export function applyTerminalCursorStyleTheme(theme: ITheme, cursorStyle: TerminalCursorStyle): ITheme {
  if (cursorStyle !== 'block-outline') return theme

  const background = theme.background ?? '#1e1e1e'
  const accent = theme.cursor ?? theme.foreground ?? '#d4d4d4'

  return {
    ...theme,
    cursor: background,
    cursorAccent: accent,
  }
}

export function buildXtermThemeForPrefs(
  cursorColorMode: 'theme' | 'custom',
  cursorColor: string,
  cursorStyle: TerminalCursorStyle = 'block'
): ITheme {
  const themed = applyTerminalCursorColor(buildXtermTheme(), cursorColorMode, cursorColor)
  return applyTerminalCursorStyleTheme(themed, cursorStyle)
}
