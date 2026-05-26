import { describe, expect, it } from 'vitest'
import type { TestCase, TestCatalogPage, TestPageNavEdge } from 'shared/automation/types'
import {
  computeFirstCyclePageIds,
  computeOrphanPageIds,
  computeZeroCasePageIdsFromCases,
  cycleNavEdgeIds,
} from '@/pages/automation/map/pageMapInsights'

const pages: TestCatalogPage[] = [
  { id: 'p1', projectId: 'proj', name: 'A', sortOrder: 0, groupId: null },
  { id: 'p2', projectId: 'proj', name: 'B', sortOrder: 1, groupId: null },
  { id: 'p3', projectId: 'proj', name: 'C', sortOrder: 2, groupId: null },
]

describe('pageMapInsights', () => {
  it('finds orphan pages with no links', () => {
    const edges: TestPageNavEdge[] = [{ id: 'e1', projectId: 'proj', sourcePageId: 'p1', targetPageId: 'p2' }]
    expect(computeOrphanPageIds(pages, edges)).toEqual(['p3'])
  })

  it('finds zero-case pages from cases list', () => {
    const cases: TestCase[] = [
      {
        id: 'c1',
        projectId: 'proj',
        flowId: 'f1',
        code: 'T1',
        title: 't',
        tags: [],
        priority: 'medium',
        steps: [],
        expected: '',
        source: 'manual',
        specStatus: 'draft',
      },
    ]
    expect(computeZeroCasePageIdsFromCases(pages, cases, { f1: 'p1' }).sort()).toEqual(['p2', 'p3'])
  })

  it('detects directed cycle', () => {
    const edges: TestPageNavEdge[] = [
      { id: 'e1', projectId: 'proj', sourcePageId: 'p1', targetPageId: 'p2' },
      { id: 'e2', projectId: 'proj', sourcePageId: 'p2', targetPageId: 'p3' },
      { id: 'e3', projectId: 'proj', sourcePageId: 'p3', targetPageId: 'p1' },
    ]
    const cycle = computeFirstCyclePageIds(pages, edges)
    expect(cycle).not.toBeNull()
    expect(cycle!.length).toBeGreaterThanOrEqual(3)
  })

  it('maps cycle page pairs to nav edge ids', () => {
    const edges: TestPageNavEdge[] = [
      { id: 'e1', projectId: 'proj', sourcePageId: 'p1', targetPageId: 'p2' },
      { id: 'e2', projectId: 'proj', sourcePageId: 'p2', targetPageId: 'p1' },
    ]
    expect(cycleNavEdgeIds(['p1', 'p2', 'p1'], edges)).toEqual(['e1', 'e2'])
  })
})
