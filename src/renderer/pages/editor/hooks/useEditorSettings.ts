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
export type EditorPreviewSampleLanguage = 'typescript' | 'markdown' | 'html'

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
  trimTrailingWhitespaceOnSave: boolean
  insertFinalNewlineOnSave: boolean
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
  /** Settings dialog preview sample language. */
  previewSampleLanguage: EditorPreviewSampleLanguage
  linkedEditing: boolean
  dragAndDrop: boolean
  showUnused: boolean
  renderControlCharacters: boolean
  detectIndentation: boolean
  /** Vertical ruler columns (VS Code editor.rulers). */
  rulers: number[]
  links: boolean
  /** VS Code `typescript.preferGoToSourceDefinition` — Ctrl+click goes to implementation, not .d.ts. */
  preferGoToSourceDefinition: boolean
}

const STORAGE_KEY = 'editor-settings-v1'

/** Stable empty array — avoids useShallow re-render loops when rulers are unset. */
const EMPTY_RULERS: number[] = []

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
  trimTrailingWhitespaceOnSave: true,
  insertFinalNewlineOnSave: false,
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
  previewSampleLanguage: 'typescript',
  linkedEditing: false,
  dragAndDrop: true,
  showUnused: true,
  renderControlCharacters: false,
  detectIndentation: true,
  rulers: EMPTY_RULERS,
  links: true,
  preferGoToSourceDefinition: false,
}

export const EDITOR_TAB_SIZE_OPTIONS = [2, 4, 8] as const

/** Display rulers setting as comma-separated columns (empty when unset). */
export function formatRulersInput(rulers: number[] | undefined): string {
  if (!rulers?.length) return ''
  return rulers.join(', ')
}

/** Parse user input into sorted unique positive column numbers. */
export function parseRulersInput(input: string): number[] {
  if (!input.trim()) return EMPTY_RULERS
  const values = input.split(/[,;\s]+/).map(part => Number.parseInt(part.trim(), 10))
  return normalizeRulers(values)
}

function normalizeRulers(rulers: number[] | undefined): number[] {
  if (!Array.isArray(rulers) || rulers.length === 0) return EMPTY_RULERS
  const unique = new Set<number>()
  for (const value of rulers) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const rounded = Math.round(value)
    if (rounded > 0) unique.add(rounded)
  }
  if (unique.size === 0) return EMPTY_RULERS
  return [...unique].sort((a, b) => a - b)
}

const PREVIEW_SAMPLE_LANGUAGES = new Set<EditorPreviewSampleLanguage>(['typescript', 'markdown', 'html'])

function normalizePreviewSampleLanguage(value: unknown): EditorPreviewSampleLanguage {
  return typeof value === 'string' && PREVIEW_SAMPLE_LANGUAGES.has(value as EditorPreviewSampleLanguage)
    ? (value as EditorPreviewSampleLanguage)
    : EDITOR_SETTINGS_DEFAULTS.previewSampleLanguage
}

function clampSettings(settings: EditorSettings): EditorSettings {
  return {
    ...settings,
    fontSize: Math.min(EDITOR_FONT_SIZE_MAX, Math.max(EDITOR_FONT_SIZE_MIN, settings.fontSize)),
    autoSaveDelayMs: Math.min(
      EDITOR_AUTO_SAVE_DELAY_MAX,
      Math.max(EDITOR_AUTO_SAVE_DELAY_MIN, settings.autoSaveDelayMs)
    ),
    previewSampleLanguage: normalizePreviewSampleLanguage(settings.previewSampleLanguage),
    rulers: normalizeRulers(settings.rulers),
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
  // Project store fields only — clamping runs on read/patch/write, not on every selector call.
  // Re-normalizing rulers here created a new [] each render and looped useShallow subscribers.
  return {
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
    trimTrailingWhitespaceOnSave: state.trimTrailingWhitespaceOnSave,
    insertFinalNewlineOnSave: state.insertFinalNewlineOnSave,
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
    previewSampleLanguage: state.previewSampleLanguage,
    linkedEditing: state.linkedEditing,
    dragAndDrop: state.dragAndDrop,
    showUnused: state.showUnused,
    renderControlCharacters: state.renderControlCharacters,
    detectIndentation: state.detectIndentation,
    rulers: state.rulers,
    links: state.links,
  }
}

export const useEditorSettings = create<EditorSettingsState>((set, get) => ({
  ...readSettings(),
  patchSettings: patch => {
    const next = clampSettings({ ...pickEditorSettings(get()), ...patch })
    writeSettings(next)
    set(next)
  },
  resetSettings: () => {
    const next = clampSettings(EDITOR_SETTINGS_DEFAULTS)
    writeSettings(next)
    set(next)
  },
}))

export function useEditorMonacoSettings(): EditorSettings {
  return useEditorSettings(useShallow(state => pickEditorSettings(state)))
}
