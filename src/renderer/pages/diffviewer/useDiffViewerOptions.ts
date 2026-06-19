import { useCallback, useState } from 'react'
import {
  DIFF_VIEWER_FONT_SIZE_DEFAULT,
  DIFF_VIEWER_FONT_SIZE_MAX,
  DIFF_VIEWER_FONT_SIZE_MIN,
  DIFF_VIEWER_LINE_DECORATIONS_WIDTH_DEFAULT,
  DIFF_VIEWER_LINE_DECORATIONS_WIDTH_MAX,
  DIFF_VIEWER_LINE_DECORATIONS_WIDTH_MIN,
  type AutoFindInSelection,
  type DiffViewerViewOptionKey,
  type DiffViewerViewOptions,
  type DiffWordWrap,
  type FindSeedSelection,
} from './diffViewerTypes'

/** Persisted in localStorage — restored when Diff Viewer window opens. */
export const DIFF_VIEWER_OPTIONS_STORAGE_KEY = 'diff-viewer-options'

const DEFAULT_OPTIONS: DiffViewerViewOptions = {
  wordWrap: 'off',
  minimap: false,
  renderSideBySide: true,
  ignoreTrimWhitespace: false,
  collapseUnchangedRegions: false,
  diffOnly: false,
  fontSize: DIFF_VIEWER_FONT_SIZE_DEFAULT,
  compactMode: false,
  renderOverviewRuler: true,
  diffWordWrap: 'inherit',
  originalEditable: false,
  diffCodeLens: false,
  showMoves: false,
  showEmptyDecorations: false,
  fontLigatures: false,
  fontVariations: false,
  glyphMargin: true,
  lineDecorationsWidth: DIFF_VIEWER_LINE_DECORATIONS_WIDTH_DEFAULT,
  findSeedFromSelection: 'selection',
  findLoop: true,
  findOnType: true,
  autoFindInSelection: 'never',
  findAddExtraSpaceOnTop: true,
}

function clampFontSize(size: number): number {
  return Math.min(DIFF_VIEWER_FONT_SIZE_MAX, Math.max(DIFF_VIEWER_FONT_SIZE_MIN, size))
}

function clampLineDecorationsWidth(width: number): number {
  return Math.min(DIFF_VIEWER_LINE_DECORATIONS_WIDTH_MAX, Math.max(DIFF_VIEWER_LINE_DECORATIONS_WIDTH_MIN, width))
}

function parseDiffWordWrap(value: unknown): DiffWordWrap {
  if (value === 'on' || value === 'off' || value === 'inherit') return value
  return DEFAULT_OPTIONS.diffWordWrap
}

function parseFindSeed(value: unknown): FindSeedSelection {
  if (value === 'never' || value === 'always' || value === 'selection') return value
  return DEFAULT_OPTIONS.findSeedFromSelection
}

function parseAutoFindInSelection(value: unknown): AutoFindInSelection {
  if (value === 'never' || value === 'always' || value === 'multiline') return value
  return DEFAULT_OPTIONS.autoFindInSelection
}

function normalizeOptions(parsed: Partial<DiffViewerViewOptions> | null | undefined): DiffViewerViewOptions {
  if (!parsed) return { ...DEFAULT_OPTIONS }
  return {
    wordWrap: parsed.wordWrap === 'on' ? 'on' : 'off',
    minimap: typeof parsed.minimap === 'boolean' ? parsed.minimap : DEFAULT_OPTIONS.minimap,
    renderSideBySide: typeof parsed.renderSideBySide === 'boolean' ? parsed.renderSideBySide : DEFAULT_OPTIONS.renderSideBySide,
    ignoreTrimWhitespace: typeof parsed.ignoreTrimWhitespace === 'boolean' ? parsed.ignoreTrimWhitespace : DEFAULT_OPTIONS.ignoreTrimWhitespace,
    collapseUnchangedRegions:
      typeof parsed.collapseUnchangedRegions === 'boolean' ? parsed.collapseUnchangedRegions : DEFAULT_OPTIONS.collapseUnchangedRegions,
    diffOnly: typeof parsed.diffOnly === 'boolean' ? parsed.diffOnly : DEFAULT_OPTIONS.diffOnly,
    fontSize: typeof parsed.fontSize === 'number' ? clampFontSize(parsed.fontSize) : DEFAULT_OPTIONS.fontSize,
    compactMode: typeof parsed.compactMode === 'boolean' ? parsed.compactMode : DEFAULT_OPTIONS.compactMode,
    renderOverviewRuler: typeof parsed.renderOverviewRuler === 'boolean' ? parsed.renderOverviewRuler : DEFAULT_OPTIONS.renderOverviewRuler,
    diffWordWrap: parseDiffWordWrap(parsed.diffWordWrap),
    originalEditable: typeof parsed.originalEditable === 'boolean' ? parsed.originalEditable : DEFAULT_OPTIONS.originalEditable,
    diffCodeLens: typeof parsed.diffCodeLens === 'boolean' ? parsed.diffCodeLens : DEFAULT_OPTIONS.diffCodeLens,
    showMoves: typeof parsed.showMoves === 'boolean' ? parsed.showMoves : DEFAULT_OPTIONS.showMoves,
    showEmptyDecorations: typeof parsed.showEmptyDecorations === 'boolean' ? parsed.showEmptyDecorations : DEFAULT_OPTIONS.showEmptyDecorations,
    fontLigatures: typeof parsed.fontLigatures === 'boolean' ? parsed.fontLigatures : DEFAULT_OPTIONS.fontLigatures,
    fontVariations: typeof parsed.fontVariations === 'boolean' ? parsed.fontVariations : DEFAULT_OPTIONS.fontVariations,
    glyphMargin: typeof parsed.glyphMargin === 'boolean' ? parsed.glyphMargin : DEFAULT_OPTIONS.glyphMargin,
    lineDecorationsWidth:
      typeof parsed.lineDecorationsWidth === 'number'
        ? clampLineDecorationsWidth(parsed.lineDecorationsWidth)
        : DEFAULT_OPTIONS.lineDecorationsWidth,
    findSeedFromSelection: parseFindSeed(parsed.findSeedFromSelection),
    findLoop: typeof parsed.findLoop === 'boolean' ? parsed.findLoop : DEFAULT_OPTIONS.findLoop,
    findOnType: typeof parsed.findOnType === 'boolean' ? parsed.findOnType : DEFAULT_OPTIONS.findOnType,
    autoFindInSelection: parseAutoFindInSelection(parsed.autoFindInSelection),
    findAddExtraSpaceOnTop:
      typeof parsed.findAddExtraSpaceOnTop === 'boolean' ? parsed.findAddExtraSpaceOnTop : DEFAULT_OPTIONS.findAddExtraSpaceOnTop,
  }
}

function readFromStorage(): DiffViewerViewOptions {
  try {
    const raw = localStorage.getItem(DIFF_VIEWER_OPTIONS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_OPTIONS }
    return normalizeOptions(JSON.parse(raw) as Partial<DiffViewerViewOptions>)
  } catch {
    return { ...DEFAULT_OPTIONS }
  }
}

function writeToStorage(options: DiffViewerViewOptions) {
  try {
    localStorage.setItem(DIFF_VIEWER_OPTIONS_STORAGE_KEY, JSON.stringify(options))
  } catch {
    // ignore quota / private mode errors
  }
}

function buildExperimentalOptions(viewOptions: DiffViewerViewOptions) {
  const base = viewOptions.diffOnly ? { useTrueInlineView: true as const } : { useTrueInlineView: false as const }
  return {
    ...base,
    showMoves: viewOptions.showMoves,
    showEmptyDecorations: viewOptions.showEmptyDecorations,
  }
}

export function buildDiffEditorDisplayOptions(viewOptions: DiffViewerViewOptions) {
  const experimental = buildExperimentalOptions(viewOptions)

  if (viewOptions.diffOnly) {
    return {
      renderSideBySide: false as const,
      hideUnchangedRegions: {
        enabled: true,
        contextLineCount: 0,
        minimumLineCount: 0,
        revealLineCount: 1,
      },
      experimental,
      compactMode: viewOptions.compactMode,
      renderOverviewRuler: viewOptions.renderOverviewRuler,
      diffWordWrap: viewOptions.diffWordWrap,
      originalEditable: viewOptions.originalEditable,
      diffCodeLens: viewOptions.diffCodeLens,
    }
  }

  return {
    renderSideBySide: viewOptions.renderSideBySide,
    hideUnchangedRegions: viewOptions.collapseUnchangedRegions
      ? {
          enabled: true,
          contextLineCount: 3,
          minimumLineCount: 3,
          revealLineCount: 20,
        }
      : { enabled: false },
    experimental,
    compactMode: viewOptions.compactMode,
    renderOverviewRuler: viewOptions.renderOverviewRuler,
    diffWordWrap: viewOptions.diffWordWrap,
    originalEditable: viewOptions.originalEditable,
    diffCodeLens: viewOptions.diffCodeLens,
  }
}

export function buildDiffEditorOptions(viewOptions: DiffViewerViewOptions) {
  const displayOptions = buildDiffEditorDisplayOptions(viewOptions)

  return {
    renderWhitespace: 'all' as const,
    readOnly: false,
    fontSize: viewOptions.fontSize,
    fontFamily: 'Jetbrains Mono NL, monospace',
    fontLigatures: viewOptions.fontLigatures,
    fontVariations: viewOptions.fontVariations,
    glyphMargin: viewOptions.glyphMargin,
    lineDecorationsWidth: viewOptions.lineDecorationsWidth,
    automaticLayout: true,
    padding: { top: 12, bottom: 12 },
    lineNumbers: 'on' as const,
    scrollBeyondLastLine: false,
    contextmenu: true,
    renderIndicators: true,
    showFoldingControls: 'always' as const,
    smoothScrolling: true,
    wordWrap: viewOptions.wordWrap,
    ignoreTrimWhitespace: viewOptions.ignoreTrimWhitespace,
    codeLens: viewOptions.diffCodeLens,
    ...displayOptions,
    minimap: { enabled: viewOptions.minimap, showSlider: 'always' as const },
    scrollbar: {
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
    find: {
      seedSearchStringFromSelection: viewOptions.findSeedFromSelection,
      loop: viewOptions.findLoop,
      findOnType: viewOptions.findOnType,
      autoFindInSelection: viewOptions.autoFindInSelection,
      addExtraSpaceOnTop: viewOptions.findAddExtraSpaceOnTop,
      cursorMoveOnType: true,
    },
    diffAlgorithm: 'advanced' as const,
    renderValidationDecorations: 'off' as const,
  }
}

export function useDiffViewerOptions() {
  const [viewOptions, setViewOptions] = useState<DiffViewerViewOptions>(() => readFromStorage())

  const persist = useCallback((next: DiffViewerViewOptions) => {
    writeToStorage(next)
    return next
  }, [])

  const setViewOption = useCallback(<K extends DiffViewerViewOptionKey>(key: K, value: DiffViewerViewOptions[K]) => {
    setViewOptions(prev => {
      let next: DiffViewerViewOptions = { ...prev, [key]: value }
      if (key === 'diffOnly' && value === true) {
        next = { ...next, collapseUnchangedRegions: false }
      }
      if (key === 'collapseUnchangedRegions' && value === true) {
        next = { ...next, diffOnly: false }
      }
      if (key === 'lineDecorationsWidth' && typeof value === 'number') {
        next = { ...next, lineDecorationsWidth: clampLineDecorationsWidth(value) }
      }
      return persist(next)
    })
  }, [persist])

  const adjustFontSize = useCallback((delta: number) => {
    setViewOptions(prev => persist({ ...prev, fontSize: clampFontSize(prev.fontSize + delta) }))
  }, [persist])

  return { viewOptions, setViewOption, adjustFontSize }
}
