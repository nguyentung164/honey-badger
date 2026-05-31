import { describe, expect, it } from 'vitest'
import {
  expandFlowRunPageScope,
  FLOW_START_PAGE_OUTSIDE_BOUNDARY,
  shouldRestrictFlowBoundary,
} from './flowRunScope'
import type { TestPageNavEdge } from './types'

describe('expandFlowRunPageScope', () => {
  const nav: TestPageNavEdge[] = [
    { id: 'e1', projectId: 'p', sourcePageId: 'a', targetPageId: 'b', createdAt: '' },
    { id: 'e2', projectId: 'p', sourcePageId: 'b', targetPageId: 'c', createdAt: '' },
  ]

  it('expands A→B→C from start without boundary (toolbar run)', () => {
    const { pageIds, warnings } = expandFlowRunPageScope({
      mergedPageIds: ['a'],
      startPageId: 'a',
      navEdges: nav,
      explicitPageIds: [],
      hasGroups: false,
    })
    expect(warnings).toEqual([])
    expect(new Set(pageIds)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('respects group boundary {a,b} when edge continues to c', () => {
    const { pageIds, warnings } = expandFlowRunPageScope({
      mergedPageIds: ['a', 'b'],
      startPageId: 'a',
      navEdges: nav,
      explicitPageIds: [],
      hasGroups: true,
    })
    expect(warnings).toEqual([])
    expect(new Set(pageIds)).toEqual(new Set(['a', 'b']))
  })

  it('restricts explicit multi-page selection without groups', () => {
    expect(
      shouldRestrictFlowBoundary(['a', 'b'], 'a', ['a', 'b'], false),
    ).toBe(true)
    const { pageIds } = expandFlowRunPageScope({
      mergedPageIds: ['a', 'b'],
      startPageId: 'a',
      navEdges: nav,
      explicitPageIds: ['a', 'b'],
      hasGroups: false,
    })
    expect(new Set(pageIds)).toEqual(new Set(['a', 'b']))
  })

  it('warns when start page is outside group boundary', () => {
    const { pageIds, warnings } = expandFlowRunPageScope({
      mergedPageIds: ['b', 'c'],
      startPageId: 'a',
      navEdges: nav,
      explicitPageIds: [],
      hasGroups: true,
    })
    expect(pageIds).toEqual([])
    expect(warnings).toContain(FLOW_START_PAGE_OUTSIDE_BOUNDARY)
  })
})
