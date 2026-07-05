import {
  DEFAULT_TERMINAL_SHELL_PROFILE,
  type TerminalShellProfileId,
} from 'shared/terminal/shells'

export type TerminalFontFamilyId = 'system' | 'jetbrains-mono' | 'cascadia' | 'consolas' | 'fira-code' | 'sarasa-mono'

export type TerminalFontWeightId = 'lighter' | 'light' | 'normal' | 'medium' | 'semibold' | 'bold'

export type TerminalCwdMode = 'repo' | 'home' | 'custom'

export type TerminalFastScrollModifier = 'alt' | 'ctrl' | 'shift' | 'none'

export type TerminalShortcutModifier = 'ctrlShift' | 'ctrl' | 'alt'

export type TerminalCursorStyle =
  | 'line'
  | 'block'
  | 'underline'
  | 'line-thin'
  | 'block-outline'
  | 'underline-thin'

export type XtermCursorStyle = 'block' | 'bar' | 'underline'

export type ResolvedTerminalCursor = {
  xtermCursorStyle: XtermCursorStyle
  cursorWidth: number
}

export type TerminalCursorColorMode = 'theme' | 'custom'

export type TerminalRightClickBehavior = 'default' | 'copyPaste' | 'paste' | 'selectWord' | 'nothing'

export type TerminalTabTitleMode = 'shell' | 'cwd' | 'both' | 'custom'

export type TerminalPrefs = {
  fontSize: number
  fontFamilyId: TerminalFontFamilyId
  fontWeight: TerminalFontWeightId
  enableLigatures: boolean
  lineHeight: number
  scrollback: number
  cursorBlink: boolean
  cursorStyle: TerminalCursorStyle
  cursorColorMode: TerminalCursorColorMode
  cursorColor: string
  smoothScrolling: boolean
  copyOnSelect: boolean
  rightClickBehavior: TerminalRightClickBehavior
  altClickMovesCursor: boolean
  enableMultiLinePasteWarning: boolean
  scrollOnUserInput: boolean
  defaultShellProfileId: TerminalShellProfileId
  keepSessionsWhenPanelClosed: boolean
  confirmOnKill: boolean
  tabTitleMode: TerminalTabTitleMode
  tabTitleCustom: string
  cwdMode: TerminalCwdMode
  cwdCustom: string
  bellEnabled: boolean
  copyShortcut: TerminalShortcutModifier
  pasteShortcut: TerminalShortcutModifier
  fastScrollModifier: TerminalFastScrollModifier
  fastScrollSensitivity: number
  enableShellIntegration: boolean
  enableWebGlRenderer: boolean
  reviveTabsOnLaunch: boolean
}

export const TERMINAL_FONT_FAMILY_ORDER: TerminalFontFamilyId[] = [
  'system',
  'jetbrains-mono',
  'sarasa-mono',
  'cascadia',
  'consolas',
  'fira-code',
]

export const TERMINAL_FONT_WEIGHT_ORDER: TerminalFontWeightId[] = [
  'lighter',
  'light',
  'normal',
  'medium',
  'semibold',
  'bold',
]

export const TERMINAL_FONT_WEIGHT_CSS: Record<TerminalFontWeightId, string> = {
  lighter: '200',
  light: '300',
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
}

export const TERMINAL_FONT_FAMILY_LABEL_KEYS: Record<TerminalFontFamilyId, string> = {
  system: 'terminal.settings.fontFamily.system',
  'jetbrains-mono': 'terminal.settings.fontFamily.jetbrainsMono',
  cascadia: 'terminal.settings.fontFamily.cascadia',
  consolas: 'terminal.settings.fontFamily.consolas',
  'fira-code': 'terminal.settings.fontFamily.firaCode',
  'sarasa-mono': 'terminal.settings.fontFamily.sarasaMono',
}

/**
 * Web-only Regular subset (woff2). Must NOT share a PostScript/family name with OS Sarasa
 * or Chromium will match weight 400 from @font-face and never use installed Bold/Light faces.
 */
export const SARASA_MONO_BUNDLED_FONT_FAMILY = 'HB Sarasa Mono SC Subset'

/** OS-installed Sarasa regional variants (VS Code: user picks one; we try all). */
const SARASA_MONO_SYSTEM_FONT_STACK = ['Sarasa Mono J', 'Sarasa Mono SC', 'Sarasa Mono K', 'Sarasa Mono TC', 'Sarasa Mono HC', 'Sarasa Mono']
  .map(name => `"${name}"`)
  .join(', ')

export const TERMINAL_FONT_FAMILY_CSS: Record<TerminalFontFamilyId, string> = {
  system: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  'jetbrains-mono': '"JetBrains Mono", ui-monospace, monospace',
  cascadia: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
  consolas: 'Consolas, "Courier New", monospace',
  'fira-code': '"Fira Code", Consolas, monospace',
  'sarasa-mono': `${SARASA_MONO_SYSTEM_FONT_STACK}, "${SARASA_MONO_BUNDLED_FONT_FAMILY}", ui-monospace, monospace`,
}

export const TERMINAL_CWD_MODE_ORDER: TerminalCwdMode[] = ['repo', 'home', 'custom']

export const TERMINAL_FAST_SCROLL_MODIFIER_ORDER: TerminalFastScrollModifier[] = ['alt', 'ctrl', 'shift', 'none']

export const TERMINAL_SHORTCUT_MODIFIER_ORDER: TerminalShortcutModifier[] = ['ctrlShift', 'ctrl', 'alt']

export const TERMINAL_CURSOR_STYLE_ORDER: TerminalCursorStyle[] = [
  'line',
  'block',
  'underline',
  'line-thin',
  'block-outline',
  'underline-thin',
]

export function resolveTerminalCursorOptions(style: TerminalCursorStyle): ResolvedTerminalCursor {
  switch (style) {
    case 'line':
      return { xtermCursorStyle: 'bar', cursorWidth: 2 }
    case 'line-thin':
      return { xtermCursorStyle: 'bar', cursorWidth: 1 }
    case 'block':
    case 'block-outline':
      return { xtermCursorStyle: 'block', cursorWidth: 1 }
    case 'underline':
    case 'underline-thin':
      return { xtermCursorStyle: 'underline', cursorWidth: 1 }
  }
}

export const TERMINAL_RIGHT_CLICK_BEHAVIOR_ORDER: TerminalRightClickBehavior[] = [
  'default',
  'copyPaste',
  'paste',
  'selectWord',
  'nothing',
]

export const TERMINAL_TAB_TITLE_MODE_ORDER: TerminalTabTitleMode[] = ['shell', 'cwd', 'both', 'custom']

export const DEFAULT_TERMINAL_PREFS: TerminalPrefs = {
  fontSize: 13,
  fontFamilyId: 'system',
  fontWeight: 'normal',
  enableLigatures: false,
  lineHeight: 1.2,
  scrollback: 5000,
  cursorBlink: true,
  cursorStyle: 'block',
  cursorColorMode: 'theme',
  cursorColor: '#528bff',
  smoothScrolling: true,
  copyOnSelect: true,
  rightClickBehavior: 'copyPaste',
  altClickMovesCursor: true,
  enableMultiLinePasteWarning: true,
  scrollOnUserInput: true,
  defaultShellProfileId: DEFAULT_TERMINAL_SHELL_PROFILE,
  keepSessionsWhenPanelClosed: true,
  confirmOnKill: false,
  tabTitleMode: 'shell',
  tabTitleCustom: '',
  cwdMode: 'repo',
  cwdCustom: '',
  bellEnabled: true,
  copyShortcut: 'ctrlShift',
  pasteShortcut: 'ctrlShift',
  fastScrollModifier: 'alt',
  fastScrollSensitivity: 5,
  enableShellIntegration: true,
  enableWebGlRenderer: true,
  reviveTabsOnLaunch: true,
}

export const TERMINAL_FONT_SIZE_MIN = 10
export const TERMINAL_FONT_SIZE_MAX = 24
export const TERMINAL_LINE_HEIGHT_MIN = 1
export const TERMINAL_LINE_HEIGHT_MAX = 2
export const TERMINAL_SCROLLBACK_MIN = 1000
export const TERMINAL_SCROLLBACK_MAX = 50000

export const TERMINAL_FAST_SCROLL_SENSITIVITY_MIN = 1
export const TERMINAL_FAST_SCROLL_SENSITIVITY_MAX = 10

const STORAGE_KEY = 'main-terminal-prefs'
const LEGACY_APPEARANCE_KEY = 'main-terminal-appearance-prefs'
const LEGACY_SHELL_KEY = 'main-terminal-default-shell'

export function resolveTerminalFontFamily(id: TerminalFontFamilyId): string {
  return TERMINAL_FONT_FAMILY_CSS[id] ?? TERMINAL_FONT_FAMILY_CSS.system
}

export function resolveTerminalFontWeight(id: TerminalFontWeightId): string {
  return TERMINAL_FONT_WEIGHT_CSS[id] ?? '400'
}

/** Bundled variable fonts where `font-variation-settings: 'wght'` is used (VS Code `editor.fontVariations: true`). */
const VARIABLE_FONT_WEIGHT_AXIS_IDS = new Set<TerminalFontFamilyId>(['jetbrains-mono'])

export function fontFamilyUsesVariableWeightAxis(id: TerminalFontFamilyId): boolean {
  return VARIABLE_FONT_WEIGHT_AXIS_IDS.has(id)
}

/**
 * Static families (Sarasa Mono SC, Cascadia, Consolas, …): weight comes from OS-installed faces.
 * Matches VS Code with `editor.fontVariations: false` — only CSS `font-weight`, no `wght` axis.
 */
export function resolveFontWeightPreviewStyle(
  fontFamilyId: TerminalFontFamilyId,
  weightId: TerminalFontWeightId
): { fontFamily: string; fontWeight: number; fontVariationSettings: string; fontSynthesis: 'none' } {
  const w = Number(TERMINAL_FONT_WEIGHT_CSS[weightId] ?? '400')
  const fontFamily = resolveTerminalFontFamily(fontFamilyId)
  if (fontFamilyUsesVariableWeightAxis(fontFamilyId)) {
    return {
      fontFamily,
      fontWeight: w,
      fontVariationSettings: `'wght' ${w}`,
      fontSynthesis: 'none',
    }
  }
  return {
    fontFamily,
    fontWeight: w,
    fontVariationSettings: 'normal',
    fontSynthesis: 'none',
  }
}

const LIGATURE_CAPABLE_FONT_IDS = new Set<TerminalFontFamilyId>([
  'jetbrains-mono',
  'sarasa-mono',
  'cascadia',
  'fira-code',
])

/** Font stack for ligature preview — falls back to JetBrains Mono (web-loaded) when needed. */
export function resolveTerminalLigaturePreviewFontFamily(fontFamilyId: TerminalFontFamilyId): string {
  if (LIGATURE_CAPABLE_FONT_IDS.has(fontFamilyId)) {
    return resolveTerminalFontFamily(fontFamilyId)
  }
  return TERMINAL_FONT_FAMILY_CSS['jetbrains-mono']
}

export function terminalLigatureCss(enabled: boolean): {
  fontFeatureSettings: string
  fontVariantLigatures: 'contextual' | 'none'
} {
  return enabled
    ? { fontFeatureSettings: '"liga" 1, "calt" 1', fontVariantLigatures: 'contextual' }
    : { fontFeatureSettings: '"liga" 0, "calt" 0', fontVariantLigatures: 'none' }
}

function basenamePath(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '')
  const parts = trimmed.split(/[/\\]/)
  return parts[parts.length - 1] || trimmed
}

export function resolveTerminalTabTitle(options: {
  mode: TerminalTabTitleMode
  customTitle: string
  shellLabel: string
  cwd?: string
}): string {
  const folder = options.cwd ? basenamePath(options.cwd) : ''
  switch (options.mode) {
    case 'cwd':
      return folder || options.shellLabel
    case 'both':
      return folder ? `${options.shellLabel} · ${folder}` : options.shellLabel
    case 'custom': {
      const custom = options.customTitle.trim()
      return custom || options.shellLabel
    }
    default:
      return options.shellLabel
  }
}

function isShellProfileId(value: unknown): value is TerminalShellProfileId {
  return value === 'powershell' || value === 'cmd' || value === 'pwsh'
}

function isFontFamilyId(value: unknown): value is TerminalFontFamilyId {
  return typeof value === 'string' && value in TERMINAL_FONT_FAMILY_CSS
}

function isFontWeightId(value: unknown): value is TerminalFontWeightId {
  return typeof value === 'string' && value in TERMINAL_FONT_WEIGHT_CSS
}

function isCwdMode(value: unknown): value is TerminalCwdMode {
  return value === 'repo' || value === 'home' || value === 'custom'
}

function isFastScrollModifier(value: unknown): value is TerminalFastScrollModifier {
  return value === 'alt' || value === 'ctrl' || value === 'shift' || value === 'none'
}

function isShortcutModifier(value: unknown): value is TerminalShortcutModifier {
  return value === 'ctrlShift' || value === 'ctrl' || value === 'alt'
}

function isCursorStyle(value: unknown): value is TerminalCursorStyle {
  return (
    value === 'line' ||
    value === 'block' ||
    value === 'underline' ||
    value === 'line-thin' ||
    value === 'block-outline' ||
    value === 'underline-thin'
  )
}

function normalizeCursorStyle(value: unknown, fallback: TerminalCursorStyle): TerminalCursorStyle {
  if (value === 'bar') return 'line'
  if (isCursorStyle(value)) return value
  return fallback
}

function isCursorColorMode(value: unknown): value is TerminalCursorColorMode {
  return value === 'theme' || value === 'custom'
}

function isRightClickBehavior(value: unknown): value is TerminalRightClickBehavior {
  return (
    value === 'default' ||
    value === 'copyPaste' ||
    value === 'paste' ||
    value === 'selectWord' ||
    value === 'nothing'
  )
}

function isTabTitleMode(value: unknown): value is TerminalTabTitleMode {
  return value === 'shell' || value === 'cwd' || value === 'both' || value === 'custom'
}

function normalizeCursorColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback
}

function migrateRightClickBehavior(merged: Partial<TerminalPrefs> & { rightClickPaste?: boolean }): TerminalRightClickBehavior {
  if (isRightClickBehavior(merged.rightClickBehavior)) return merged.rightClickBehavior
  if (merged.rightClickPaste === true) return 'paste'
  if (merged.rightClickPaste === false) return 'default'
  return DEFAULT_TERMINAL_PREFS.rightClickBehavior
}

function migrateLegacyPrefs(): Partial<TerminalPrefs> {
  const migrated: Partial<TerminalPrefs> = {}
  try {
    const legacyAppearance = localStorage.getItem(LEGACY_APPEARANCE_KEY)
    if (legacyAppearance) {
      const parsed = JSON.parse(legacyAppearance) as { fontSize?: number; fontFamilyId?: string }
      if (typeof parsed.fontSize === 'number') migrated.fontSize = parsed.fontSize
      if (isFontFamilyId(parsed.fontFamilyId)) migrated.fontFamilyId = parsed.fontFamilyId
    }
    const legacyShell = localStorage.getItem(LEGACY_SHELL_KEY)
    if (isShellProfileId(legacyShell)) migrated.defaultShellProfileId = legacyShell
  } catch {
    // ignore
  }
  return migrated
}

export function readTerminalPrefs(): TerminalPrefs {
  const defaults = { ...DEFAULT_TERMINAL_PREFS }
  const legacy = migrateLegacyPrefs()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<TerminalPrefs>) : {}
    const merged = { ...defaults, ...legacy, ...parsed }
    return {
      fontSize: Math.max(TERMINAL_FONT_SIZE_MIN, Math.min(TERMINAL_FONT_SIZE_MAX, Math.round(merged.fontSize))),
      fontFamilyId: isFontFamilyId(merged.fontFamilyId) ? merged.fontFamilyId : defaults.fontFamilyId,
      fontWeight: isFontWeightId(merged.fontWeight) ? merged.fontWeight : defaults.fontWeight,
      enableLigatures: Boolean(merged.enableLigatures),
      lineHeight: Math.max(TERMINAL_LINE_HEIGHT_MIN, Math.min(TERMINAL_LINE_HEIGHT_MAX, merged.lineHeight)),
      scrollback: Math.max(
        TERMINAL_SCROLLBACK_MIN,
        Math.min(TERMINAL_SCROLLBACK_MAX, Math.round(merged.scrollback))
      ),
      cursorBlink: Boolean(merged.cursorBlink),
      cursorStyle: normalizeCursorStyle(merged.cursorStyle, defaults.cursorStyle),
      cursorColorMode: isCursorColorMode(merged.cursorColorMode) ? merged.cursorColorMode : defaults.cursorColorMode,
      cursorColor: normalizeCursorColor(merged.cursorColor, defaults.cursorColor),
      smoothScrolling: merged.smoothScrolling !== false,
      copyOnSelect: merged.copyOnSelect !== false,
      rightClickBehavior: migrateRightClickBehavior(merged),
      altClickMovesCursor: merged.altClickMovesCursor !== false,
      enableMultiLinePasteWarning: merged.enableMultiLinePasteWarning !== false,
      scrollOnUserInput: merged.scrollOnUserInput !== false,
      defaultShellProfileId: isShellProfileId(merged.defaultShellProfileId)
        ? merged.defaultShellProfileId
        : defaults.defaultShellProfileId,
      keepSessionsWhenPanelClosed: merged.keepSessionsWhenPanelClosed !== false,
      confirmOnKill: Boolean(merged.confirmOnKill),
      tabTitleMode: isTabTitleMode(merged.tabTitleMode) ? merged.tabTitleMode : defaults.tabTitleMode,
      tabTitleCustom: typeof merged.tabTitleCustom === 'string' ? merged.tabTitleCustom : defaults.tabTitleCustom,
      cwdMode: isCwdMode(merged.cwdMode) ? merged.cwdMode : defaults.cwdMode,
      cwdCustom: typeof merged.cwdCustom === 'string' ? merged.cwdCustom : defaults.cwdCustom,
      bellEnabled: merged.bellEnabled !== false,
      copyShortcut: isShortcutModifier(merged.copyShortcut) ? merged.copyShortcut : defaults.copyShortcut,
      pasteShortcut: isShortcutModifier(merged.pasteShortcut) ? merged.pasteShortcut : defaults.pasteShortcut,
      fastScrollModifier: isFastScrollModifier(merged.fastScrollModifier)
        ? merged.fastScrollModifier
        : defaults.fastScrollModifier,
      fastScrollSensitivity: Math.max(
        TERMINAL_FAST_SCROLL_SENSITIVITY_MIN,
        Math.min(
          TERMINAL_FAST_SCROLL_SENSITIVITY_MAX,
          Math.round(merged.fastScrollSensitivity ?? defaults.fastScrollSensitivity)
        )
      ),
      enableShellIntegration: merged.enableShellIntegration !== false,
      enableWebGlRenderer: merged.enableWebGlRenderer !== false,
      reviveTabsOnLaunch: merged.reviveTabsOnLaunch !== false,
    }
  } catch {
    return { ...defaults, ...legacy }
  }
}

export function writeTerminalPrefs(prefs: TerminalPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore quota errors
  }
}

export function resetTerminalPrefs(): TerminalPrefs {
  const defaults = { ...DEFAULT_TERMINAL_PREFS }
  writeTerminalPrefs(defaults)
  return defaults
}

/** @deprecated Use readTerminalPrefs */
export const readTerminalAppearancePrefs = readTerminalPrefs
/** @deprecated Use writeTerminalPrefs */
export const writeTerminalAppearancePrefs = writeTerminalPrefs
export type TerminalAppearancePrefs = TerminalPrefs
