import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { TerminalFontFamilyId, TerminalFontWeightId } from '@/lib/terminal/terminalPrefs'
import {
  EDITOR_AUTO_SAVE_DELAY_MAX,
  EDITOR_AUTO_SAVE_DELAY_MIN,
  EDITOR_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_MIN,
} from '@/pages/editor/lib/editorMonacoTheme'

export type EditorWordWrap = 'off' | 'on'
export type EditorLineNumbers = 'on' | 'off' | 'relative'
export type EditorAutoSave = 'off' | 'afterDelay'
export type EditorRenderWhitespace = 'none' | 'selection' | 'all'
export type EditorCursorStyle = 'line' | 'block' | 'underline'

export type EditorSettings = {
  fontSize: number
  fontFamilyId: TerminalFontFamilyId
  fontWeight: TerminalFontWeightId
  enableLigatures: boolean
  tabSize: number
  insertSpaces: boolean
  wordWrap: EditorWordWrap
  minimap: boolean
  lineNumbers: EditorLineNumbers
  formatOnSave: boolean
  formatOnPaste: boolean
  autoSave: EditorAutoSave
  autoSaveDelayMs: number
  bracketPairColorization: boolean
  renderWhitespace: EditorRenderWhitespace
  smoothScrolling: boolean
  stickyScroll: boolean
  cursorBlink: boolean
  cursorStyle: EditorCursorStyle
  scrollBeyondLastLine: boolean
  breadcrumbs: boolean
  explorerAutoReveal: boolean
  codeLens: boolean
  inlayHints: boolean
  /** Reopen editor tabs from the last session when opening a repo (VS Code window.restoreWindows). */
  restoreEditorTabs: boolean
}

const STORAGE_KEY = 'editor-settings-v1'

export const EDITOR_SETTINGS_DEFAULTS: EditorSettings = {
  fontSize: 14,
  fontFamilyId: 'jetbrains-mono',
  fontWeight: 'normal',
  enableLigatures: true,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: 'off',
  minimap: true,
  lineNumbers: 'on',
  formatOnSave: false,
  formatOnPaste: true,
  autoSave: 'off',
  autoSaveDelayMs: 1000,
  bracketPairColorization: true,
  renderWhitespace: 'selection',
  smoothScrolling: true,
  stickyScroll: true,
  cursorBlink: true,
  cursorStyle: 'line',
  scrollBeyondLastLine: false,
  breadcrumbs: true,
  explorerAutoReveal: true,
  codeLens: true,
  inlayHints: true,
  restoreEditorTabs: true,
}

export const EDITOR_TAB_SIZE_OPTIONS = [2, 4, 8] as const

function clampSettings(settings: EditorSettings): EditorSettings {
  return {
    ...settings,
    fontSize: Math.min(EDITOR_FONT_SIZE_MAX, Math.max(EDITOR_FONT_SIZE_MIN, settings.fontSize)),
    autoSaveDelayMs: Math.min(
      EDITOR_AUTO_SAVE_DELAY_MAX,
      Math.max(EDITOR_AUTO_SAVE_DELAY_MIN, settings.autoSaveDelayMs)
    ),
  }
}

function readSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EDITOR_SETTINGS_DEFAULTS
    const parsed = JSON.parse(raw) as Partial<EditorSettings>
    return clampSettings({ ...EDITOR_SETTINGS_DEFAULTS, ...parsed })
  } catch {
    return EDITOR_SETTINGS_DEFAULTS
  }
}

function writeSettings(settings: EditorSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clampSettings(settings)))
  } catch {
    /* ignore */
  }
}

type EditorSettingsState = EditorSettings & {
  patchSettings: (patch: Partial<EditorSettings>) => void
  resetSettings: () => void
}

export function pickEditorSettings(state: EditorSettingsState): EditorSettings {
  return clampSettings({
    fontSize: state.fontSize,
    fontFamilyId: state.fontFamilyId,
    fontWeight: state.fontWeight,
    enableLigatures: state.enableLigatures,
    tabSize: state.tabSize,
    insertSpaces: state.insertSpaces,
    wordWrap: state.wordWrap,
    minimap: state.minimap,
    lineNumbers: state.lineNumbers,
    formatOnSave: state.formatOnSave,
    formatOnPaste: state.formatOnPaste,
    autoSave: state.autoSave,
    autoSaveDelayMs: state.autoSaveDelayMs,
    bracketPairColorization: state.bracketPairColorization,
    renderWhitespace: state.renderWhitespace,
    smoothScrolling: state.smoothScrolling,
    stickyScroll: state.stickyScroll,
    cursorBlink: state.cursorBlink,
    cursorStyle: state.cursorStyle,
    scrollBeyondLastLine: state.scrollBeyondLastLine,
    breadcrumbs: state.breadcrumbs,
    explorerAutoReveal: state.explorerAutoReveal,
    codeLens: state.codeLens,
    inlayHints: state.inlayHints,
    restoreEditorTabs: state.restoreEditorTabs,
  })
}

export const useEditorSettings = create<EditorSettingsState>((set, get) => ({
  ...readSettings(),
  patchSettings: patch => {
    const next = clampSettings({ ...pickEditorSettings(get()), ...patch })
    writeSettings(next)
    set(next)
  },
  resetSettings: () => {
    writeSettings(EDITOR_SETTINGS_DEFAULTS)
    set(EDITOR_SETTINGS_DEFAULTS)
  },
}))

export function useEditorSettingsValues(): EditorSettings {
  return useEditorSettings(useShallow(pickEditorSettings))
}

export function useEditorMonacoSettings(): EditorSettings {
  return useEditorSettingsValues()
}
