import { useCallback, useEffect, useRef, useState } from 'react'

export const DIFF_VIEWER_TREE_PANEL_WIDTH_KEY = 'diff-viewer-tree-panel-width'
export const DIFF_VIEWER_TREE_PANEL_DEFAULT_WIDTH = 22
export const DIFF_VIEWER_TREE_PANEL_MIN_WIDTH = 14
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
    // ignore quota / private mode errors
  }
}

export function useDiffViewerTreePanelWidth() {
  const [treePanelWidth, setTreePanelWidth] = useState(() => readTreePanelWidth())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestWidthRef = useRef(treePanelWidth)
  latestWidthRef.current = treePanelWidth

  const handleTreePanelResize = useCallback((size: number) => {
    const next = Math.min(DIFF_VIEWER_TREE_PANEL_MAX_WIDTH, Math.max(DIFF_VIEWER_TREE_PANEL_MIN_WIDTH, size))
    latestWidthRef.current = next
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setTreePanelWidth(next)
      writeTreePanelWidth(next)
      debounceRef.current = null
    }, 120)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      writeTreePanelWidth(latestWidthRef.current)
    }
  }, [])

  return { treePanelWidth, handleTreePanelResize }
}
