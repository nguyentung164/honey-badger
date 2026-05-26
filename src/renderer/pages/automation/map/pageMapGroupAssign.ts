import type { TestCatalogPage } from 'shared/automation/types'

export function pageRelativePositionInGroup(
  absX: number,
  absY: number,
  groupAbsX: number,
  groupAbsY: number
): { x: number; y: number } {
  return { x: absX - groupAbsX, y: absY - groupAbsY }
}

export function pagesNeedingGroupAssignment(pageIds: string[], pages: TestCatalogPage[], targetGroupId: string): string[] {
  const byId = new Map(pages.map(p => [p.id, p]))
  return pageIds.filter(id => {
    const p = byId.get(id)
    return p != null && p.groupId !== targetGroupId
  })
}

type NodePosLookup = (id: string) => { position: { x: number; y: number }; parentId?: string } | undefined

/** Walk parent chain when RF internals are unavailable. */
export function nodeCanvasAbsolutePosition(getNode: NodePosLookup, nodeId: string): { x: number; y: number } | null {
  let n = getNode(nodeId)
  if (!n) return null
  let x = n.position.x
  let y = n.position.y
  let guard = 0
  while (n.parentId && guard++ < 32) {
    const parent = getNode(n.parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    n = parent
  }
  return { x, y }
}

/**
 * Target group for toolbar assign:
 * 1) exactly one selected group, or
 * 2) all selected pages overlap the same group frame (drag-style).
 */
export function resolveAssignTargetGroupId(selectedPageIds: string[], selectedGroupIds: string[], overlapGroupIds: string[]): string | null {
  if (selectedGroupIds.length === 1) return selectedGroupIds[0] ?? null
  if (selectedPageIds.length === 0) return null
  const unique = [...new Set(overlapGroupIds.filter(Boolean))]
  if (unique.length === 1) return unique[0] ?? null
  return null
}
