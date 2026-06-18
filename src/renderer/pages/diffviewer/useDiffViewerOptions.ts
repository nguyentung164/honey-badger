import { useCallback, useState } from 'react'
import {
  DIFF_VIEWER_FONT_SIZE_DEFAULT,
  DIFF_VIEWER_FONT_SIZE_MAX,
  DIFF_VIEWER_FONT_SIZE_MIN,
  type DiffViewerViewOptionKey,
  type DiffViewerViewOptions,
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
}

function clampFontSize(size: number): number {
  return Math.min(DIFF_VIEWER_FONT_SIZE_MAX, Math.max(DIFF_VIEWER_FONT_SIZE_MIN, size))
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

export function buildDiffEditorDisplayOptions(viewOptions: DiffViewerViewOptions) {
  if (viewOptions.diffOnly) {
    return {
      renderSideBySide: false as const,
      hideUnchangedRegions: {
        enabled: true,
        contextLineCount: 0,
        minimumLineCount: 0,
        revealLineCount: 1,
      },
      experimental: {
        useTrueInlineView: true,
      },
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
    experimental: {
      useTrueInlineView: false,
    },
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
      return persist(next)
    })
  }, [persist])

  const adjustFontSize = useCallback((delta: number) => {
    setViewOptions(prev => persist({ ...prev, fontSize: clampFontSize(prev.fontSize + delta) }))
  }, [persist])

  return { viewOptions, setViewOption, adjustFontSize }
}
