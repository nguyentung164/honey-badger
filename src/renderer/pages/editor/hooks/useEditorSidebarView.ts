const EDITOR_SIDEBAR_VIEW_KEY = 'editor-sidebar-view'

export type EditorSidebarView = 'explorer' | 'search'

export function readEditorSidebarView(): EditorSidebarView {
  try {
    const v = localStorage.getItem(EDITOR_SIDEBAR_VIEW_KEY)
    if (v === 'search') return 'search'
  } catch {
    /* ignore */
  }
  return 'explorer'
}

export function writeEditorSidebarView(view: EditorSidebarView) {
  try {
    localStorage.setItem(EDITOR_SIDEBAR_VIEW_KEY, view)
  } catch {
    /* ignore */
  }
}
