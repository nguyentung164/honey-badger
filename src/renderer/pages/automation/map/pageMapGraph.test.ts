import type { TestCatalogGroup, TestCatalogPage } from 'shared/automation/types'
import { describe, expect, it } from 'vitest'
import { filterPagesByCatalogGroupSubtree, normalizePageDiagramPositionInGroup, pageIdsWithCasesInScope, sortNodesParentBeforeChildren } from '@/pages/automation/map/pageMapGraph'

describe('pageMapGraph', () => {
  it('sortNodesParentBeforeChildren orders parents before nested nodes', () => {
    const nodes = [
      { id: 'p1', parentId: 'g1', position: { x: 0, y: 0 } },
      { id: 'g1', position: { x: 0, y: 0 } },
      { id: 'p2', position: { x: 0, y: 0 } },
    ] as any[]
    const sorted = sortNodesParentBeforeChildren(nodes)
    expect(sorted.map(n => n.id)).toEqual(['g1', 'p1', 'p2'])
  })

  it('normalizePageDiagramPositionInGroup resets implausible legacy global coords to centered default', () => {
    const r = normalizePageDiagramPositionInGroup(900, 400, 420, 280)
    expect(r.x).toBeCloseTo(110, 0)
    expect(r.y).toBeCloseTo(98, 0)
  })

  it('normalizePageDiagramPositionInGroup clamps reasonable coords inside the group frame', () => {
    expect(normalizePageDiagramPositionInGroup(10, 10, 420, 280)).toEqual({ x: 24, y: 44 })
    expect(normalizePageDiagramPositionInGroup(400, 260, 420, 280)).toEqual({ x: 196, y: 184 })
  })

  it('filterPagesByCatalogGroupSubtree keeps pages in subtree', () => {
    const groups: TestCatalogGroup[] = [
      { id: 'a', projectId: 'proj', name: 'A', sortOrder: 0 },
      { id: 'b', projectId: 'proj', name: 'B', sortOrder: 0, parentGroupId: 'a' },
    ]
    const pages: TestCatalogPage[] = [
      { id: 'p1', projectId: 'proj', name: 'x', sortOrder: 0, groupId: 'a' },
      { id: 'p2', projectId: 'proj', name: 'y', sortOrder: 0, groupId: 'b' },
      { id: 'p3', projectId: 'proj', name: 'z', sortOrder: 0, groupId: null },
    ]
    expect(filterPagesByCatalogGroupSubtree(pages, groups, null).map(p => p.id)).toEqual(['p1', 'p2', 'p3'])
    expect(filterPagesByCatalogGroupSubtree(pages, groups, 'a').map(p => p.id)).toEqual(['p1', 'p2'])
    expect(filterPagesByCatalogGroupSubtree(pages, groups, 'b').map(p => p.id)).toEqual(['p2'])
  })

  it('pageIdsWithCasesInScope excludes pages without test cases', () => {
    const scope = {
      pageIdsExpanded: ['p1', 'p2', 'p3'],
      caseIdsByPageId: { p1: ['c1'], p3: ['c2', 'c3'] },
      caseCountByPageId: { p1: 1, p2: 0, p3: 2 },
    }
    expect(pageIdsWithCasesInScope(scope)).toEqual(['p1', 'p3'])
  })
})
