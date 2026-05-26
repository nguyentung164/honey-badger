import { describe, expect, it } from 'vitest'
import type { TestCatalogGroup, TestCatalogPage } from 'shared/automation/types'
import { filterPagesByCatalogGroupSubtree } from '@/pages/automation/map/pageMapGraph'

describe('catalog group scope (shared with renderer graph helpers)', () => {
  it('merges subtree membership for run-style page expansion', () => {
    const groups: TestCatalogGroup[] = [
      { id: 'g1', projectId: 'p', name: 'G1', sortOrder: 0 },
      { id: 'g2', projectId: 'p', name: 'G2', sortOrder: 0, parentGroupId: 'g1' },
    ]
    const pages: TestCatalogPage[] = [
      { id: 'a', projectId: 'p', name: 'A', sortOrder: 0, groupId: 'g2' },
      { id: 'b', projectId: 'p', name: 'B', sortOrder: 0, groupId: null },
    ]
    const scoped = filterPagesByCatalogGroupSubtree(pages, groups, 'g1')
    expect(scoped.map(x => x.id)).toEqual(['a'])
  })
})
