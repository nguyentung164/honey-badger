const EDITOR_EXPLORER_SECTIONS_KEY = 'editor-explorer-sections'

export type EditorExplorerSectionId = 'open-editors' | 'workspace' | `folder:${number}`

const DEFAULT_EXPANDED: EditorExplorerSectionId[] = ['open-editors', 'workspace']

export function folderSectionId(index: number): EditorExplorerSectionId {
  return `folder:${index}`
}

export function parseFolderSectionIndex(sectionId: EditorExplorerSectionId): number | null {
  if (!sectionId.startsWith('folder:')) return null
  const index = Number(sectionId.slice('folder:'.length))
  return Number.isNaN(index) ? null : index
}

function isValidSectionId(id: unknown): id is EditorExplorerSectionId {
  return id === 'open-editors' || id === 'workspace' || (typeof id === 'string' && id.startsWith('folder:'))
}

export function defaultExpandedSections(folderCount = 0): Set<EditorExplorerSectionId> {
  const sections: EditorExplorerSectionId[] = ['open-editors']
  if (folderCount > 1) {
    for (let i = 0; i < folderCount; i++) sections.push(folderSectionId(i))
  } else {
    sections.push('workspace')
  }
  return new Set(sections)
}

export function readExplorerExpandedSections(folderCount = 0): Set<EditorExplorerSectionId> {
  const fallback = defaultExpandedSections(folderCount)
  try {
    const raw = localStorage.getItem(EDITOR_EXPLORER_SECTIONS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return fallback
    const valid = parsed.filter(isValidSectionId)
    if (valid.length === 0) return fallback
    const expanded = new Set(valid)
    if (folderCount > 1) {
      for (let i = 0; i < folderCount; i++) {
        const id = folderSectionId(i)
        if (!expanded.has(id) && !valid.some(v => v.startsWith('folder:'))) {
          expanded.add(id)
        }
      }
    }
    return expanded
  } catch {
    return fallback
  }
}

export function writeExplorerExpandedSections(expanded: Set<EditorExplorerSectionId>) {
  try {
    localStorage.setItem(EDITOR_EXPLORER_SECTIONS_KEY, JSON.stringify([...expanded]))
  } catch {
    /* ignore */
  }
}
