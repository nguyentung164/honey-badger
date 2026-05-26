import { describe, expect, it } from 'vitest'
import type { TestCatalogPage } from 'shared/automation/types'
import {
  nodeCanvasAbsolutePosition,
  pageRelativePositionInGroup,
  pagesNeedingGroupAssignment,
  resolveAssignTargetGroupId,
} from '@/pages/automation/map/pageMapGroupAssign'

describe('pageMapGroupAssign', () => {
  it('computes relative position inside group', () => {
    expect(pageRelativePositionInGroup(120, 80, 100, 50)).toEqual({ x: 20, y: 30 })
  })

  it('skips pages already in target group', () => {
    const pages: TestCatalogPage[] = [
      { id: 'p1', projectId: 'proj', name: 'a', sortOrder: 0, groupId: 'g1' },
      { id: 'p2', projectId: 'proj', name: 'b', sortOrder: 1, groupId: null },
    ]
    expect(pagesNeedingGroupAssignment(['p1', 'p2'], pages, 'g1')).toEqual(['p2'])
  })

  it('sums parent offsets for canvas absolute position', () => {
    const nodes = new Map([
      ['g1', { position: { x: 100, y: 50 } }],
      ['p1', { position: { x: 20, y: 30 }, parentId: 'g1' }],
    ])
    const getNode = (id: string) => nodes.get(id)
    expect(nodeCanvasAbsolutePosition(getNode, 'p1')).toEqual({ x: 120, y: 80 })
  })

  it('resolves assign target from overlap when group not selected', () => {
    expect(resolveAssignTargetGroupId(['p1', 'p2'], [], ['g1', 'g1'])).toBe('g1')
    expect(resolveAssignTargetGroupId(['p1'], [], ['g1', 'g2'])).toBeNull()
    expect(resolveAssignTargetGroupId(['p1'], ['g9'], [])).toBe('g9')
  })
})
