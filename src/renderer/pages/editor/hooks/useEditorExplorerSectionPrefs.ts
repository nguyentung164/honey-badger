const EDITOR_EXPLORER_SECTIONS_KEY = 'editor-explorer-sections'

export type EditorExplorerSectionId = 'open-editors' | 'workspace'

const DEFAULT_EXPANDED: EditorExplorerSectionId[] = ['open-editors', 'workspace']

export function readExplorerExpandedSections(): Set<EditorExplorerSectionId> {
  try {
    const raw = localStorage.getItem(EDITOR_EXPLORER_SECTIONS_KEY)
    if (!raw) return new Set(DEFAULT_EXPANDED)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set(DEFAULT_EXPANDED)
    const valid = parsed.filter((id): id is EditorExplorerSectionId => id === 'open-editors' || id === 'workspace')
    return new Set(valid.length > 0 ? valid : DEFAULT_EXPANDED)
  } catch {
    return new Set(DEFAULT_EXPANDED)
  }
}

export function writeExplorerExpandedSections(expanded: Set<EditorExplorerSectionId>) {
  try {
    localStorage.setItem(EDITOR_EXPLORER_SECTIONS_KEY, JSON.stringify([...expanded]))
  } catch {
    /* ignore */
  }
}
