import { create } from 'zustand'
import type { EditorCursorPosition } from '@/pages/editor/lib/editorCommandBridge'

type EditorCursorState = {
  cursor: EditorCursorPosition | null
  setCursor: (position: EditorCursorPosition | null) => void
}

/**
 * Cursor position lives in its own store so per-keystroke cursor moves only
 * re-render the status bar, never the whole workbench (VS Code pattern).
 */
export const useEditorCursor = create<EditorCursorState>(set => ({
  cursor: null,
  setCursor: position =>
    set(state => {
      if (position === null) return state.cursor === null ? state : { cursor: null }
      return state.cursor?.line === position.line && state.cursor?.column === position.column ? state : { cursor: position }
    }),
}))

export function setEditorCursorPosition(position: EditorCursorPosition | null): void {
  useEditorCursor.getState().setCursor(position)
}
