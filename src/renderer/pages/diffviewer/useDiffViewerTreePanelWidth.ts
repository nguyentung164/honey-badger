import { useCallback, useEffect, useRef } from 'react'
import type { GroupImperativeHandle } from 'react-resizable-panels'

export const DIFF_VIEWER_TREE_PANEL_ID = 'diff-viewer-tree-panel'
export const DIFF_VIEWER_EDITOR_PANEL_ID = 'diff-viewer-editor-panel'
export const DIFF_VIEWER_TREE_PANEL_WIDTH_KEY = 'diff-viewer-tree-panel-width'
export const DIFF_VIEWER_TREE_PANEL_DEFAULT_WIDTH = 22
export const DIFF_VIEWER_TREE_PANEL_MIN_WIDTH = 18
export const DIFF_VIEWER_TREE_PANEL_MAX_WIDTH = 42

function readTreePanelWidth(): number {
  try {
    const raw = localStorage.getItem(DIFF_VIEWER_TREE_PANEL_WIDTH_KEY)
    if (!raw) return DIFF_VIEWER_TREE_PANEL_DEFAULT_WIDTH
    const parsed = Number.parseFloat(raw)
    if (!Number.isFinite(parsed)) return DIFF_VIEWER_TREE_PANEL_DEFAULT_WIDTH
    return Math.min(DIFF_VIEWER_TREE_PANEL_MAX_WIDTH, Math.max(DIFF_VIEWER_TREE_PANEL_MIN_WIDTH, parsed))
  } catch {
    return DIFF_VIEWER_TREE_PANEL_DEFAULT_WIDTH
  }
}

function writeTreePanelWidth(width: number) {
  try {
    localStorage.setItem(DIFF_VIEWER_TREE_PANEL_WIDTH_KEY, String(width))
  } catch {
    // ignore
  }
}

function clampTreePanelWidth(width: number): number {
  return Math.min(DIFF_VIEWER_TREE_PANEL_MAX_WIDTH, Math.max(DIFF_VIEWER_TREE_PANEL_MIN_WIDTH, width))
}

function buildInitialLayout(treeWidth: number): Record<string, number> {
  const tree = clampTreePanelWidth(treeWidth)
  return {
    [DIFF_VIEWER_TREE_PANEL_ID]: tree,
    [DIFF_VIEWER_EDITOR_PANEL_ID]: 100 - tree,
  }
}

export function toTreePanelPercent(width: number): `${number}%` {
  return `${clampTreePanelWidth(width)}%`
}

export function useDiffViewerTreePanelWidth() {
  const initialTreeWidthRef = useRef(readTreePanelWidth())
  const panelGroupRef = useRef<GroupImperativeHandle | null>(null)
  const treePanelWidthRef = useRef(initialTreeWidthRef.current)
  const persistDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialLayoutRef = useRef(buildInitialLayout(initialTreeWidthRef.current))

  useEffect(() => {
    return () => {
      if (persistDebounceRef.current) clearTimeout(persistDebounceRef.current)
      writeTreePanelWidth(treePanelWidthRef.current)
    }
  }, [])

  const handleLayoutChanged = useCallback((layout: Record<string, number | undefined>) => {
    const tree = layout[DIFF_VIEWER_TREE_PANEL_ID]
    if (typeof tree !== 'number') return
    const next = clampTreePanelWidth(tree)
    if (treePanelWidthRef.current === next) return
    treePanelWidthRef.current = next
    if (persistDebounceRef.current) clearTimeout(persistDebounceRef.current)
    persistDebounceRef.current = setTimeout(() => {
      writeTreePanelWidth(next)
      persistDebounceRef.current = null
    }, 150)
  }, [])

  return {
    panelGroupRef,
    initialLayout: initialLayoutRef.current,
    handleLayoutChanged,
  }
}
