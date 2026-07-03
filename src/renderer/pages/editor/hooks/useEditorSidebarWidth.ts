import { useCallback, useRef } from 'react'
import type { GroupImperativeHandle } from 'react-resizable-panels'

export const EDITOR_SIDEBAR_PANEL_ID = 'editor-sidebar-panel'
export const EDITOR_MAIN_PANEL_ID = 'editor-main-panel'
export const EDITOR_SIDEBAR_WIDTH_KEY = 'editor-sidebar-width'
export const EDITOR_SIDEBAR_DEFAULT_WIDTH = 22
export const EDITOR_SIDEBAR_MIN_WIDTH = 16
export const EDITOR_SIDEBAR_MAX_WIDTH = 45

function readSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(EDITOR_SIDEBAR_WIDTH_KEY)
    if (!raw) return EDITOR_SIDEBAR_DEFAULT_WIDTH
    const parsed = Number.parseFloat(raw)
    if (!Number.isFinite(parsed)) return EDITOR_SIDEBAR_DEFAULT_WIDTH
    return Math.min(EDITOR_SIDEBAR_MAX_WIDTH, Math.max(EDITOR_SIDEBAR_MIN_WIDTH, parsed))
  } catch {
    return EDITOR_SIDEBAR_DEFAULT_WIDTH
  }
}

function writeSidebarWidth(width: number) {
  try {
    localStorage.setItem(EDITOR_SIDEBAR_WIDTH_KEY, String(width))
  } catch {
    /* ignore */
  }
}

function clamp(width: number) {
  return Math.min(EDITOR_SIDEBAR_MAX_WIDTH, Math.max(EDITOR_SIDEBAR_MIN_WIDTH, width))
}

export function editorSidebarMinSize(): `${number}%` {
  return `${EDITOR_SIDEBAR_MIN_WIDTH}%`
}

export function editorSidebarMaxSize(): `${number}%` {
  return `${EDITOR_SIDEBAR_MAX_WIDTH}%`
}

export function useEditorSidebarWidth() {
  const initialRef = useRef(readSidebarWidth())
  const panelGroupRef = useRef<GroupImperativeHandle | null>(null)
  const widthRef = useRef(initialRef.current)

  const initialLayout = {
    [EDITOR_SIDEBAR_PANEL_ID]: initialRef.current,
    [EDITOR_MAIN_PANEL_ID]: 100 - initialRef.current,
  }

  const onLayoutChanged = useCallback((layout: Record<string, number>) => {
    const sidebar = layout[EDITOR_SIDEBAR_PANEL_ID]
    if (typeof sidebar !== 'number') return
    const clamped = clamp(sidebar)
    widthRef.current = clamped
    writeSidebarWidth(clamped)
  }, [])

  return { panelGroupRef, initialLayout, onLayoutChanged, sidebarWidth: widthRef }
}
