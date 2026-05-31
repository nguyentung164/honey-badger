import { describe, expect, it } from 'vitest'
import { computeFlowPageSequence, FLOW_UNREACHABLE_IN_SCOPE_PREFIX, isFlowUnreachableWarning } from './flowPageSequence'
import { reachableNodeIdsFrom } from 'shared/flowExecution'
import type { TestPageNavEdge } from './types'

describe('computeFlowPageSequence', () => {
  const pages = [
    { id: 'a', sortOrder: 1 },
    { id: 'b', sortOrder: 2, executionDisabled: true },
    { id: 'c', sortOrder: 3 },
  ]

  const navEdges: TestPageNavEdge[] = [
    { id: 'e1', projectId: 'p', sourcePageId: 'a', targetPageId: 'b', createdAt: '' },
    { id: 'e2', projectId: 'p', sourcePageId: 'a', targetPageId: 'c', runOrder: 2, createdAt: '' },
    { id: 'e3', projectId: 'p', sourcePageId: 'b', targetPageId: 'c', runOrder: 1, createdAt: '' },
  ]

  it('orders runnable pages and skips disabled without blocking downstream', () => {
    const result = computeFlowPageSequence({
      pageIdsInScope: ['a', 'b', 'c'],
      pages,
      navEdges,
      caseCountByPageId: { a: 1, b: 1, c: 1 },
    })
    expect(result.runnableSequence).toEqual(['a', 'c'])
    expect(result.fullSequence).toEqual(['a', 'c'])
  })

  it('respects runOrder among siblings from same source', () => {
    const result = computeFlowPageSequence({
      pageIdsInScope: ['a', 'b', 'c'],
      pages: pages.map(p => ({ ...p, executionDisabled: false })),
      navEdges: [
        { id: 'e1', projectId: 'p', sourcePageId: 'a', targetPageId: 'b', runOrder: 2, createdAt: '' },
        { id: 'e2', projectId: 'p', sourcePageId: 'a', targetPageId: 'c', runOrder: 1, createdAt: '' },
      ],
      caseCountByPageId: { a: 1, b: 1, c: 1 },
      startPageId: 'a',
    })
    expect(result.runnableSequence).toEqual(['a', 'c', 'b'])
  })

  it('filters pages without cases from runnable sequence', () => {
    const result = computeFlowPageSequence({
      pageIdsInScope: ['a', 'b', 'c'],
      pages,
      navEdges: [{ id: 'e1', projectId: 'p', sourcePageId: 'a', targetPageId: 'c', createdAt: '' }],
      caseCountByPageId: { a: 1, c: 2 },
    })
    expect(result.runnableSequence).toEqual(['a', 'c'])
  })

  it('expands scope via reachableNodeIdsFrom for run-flow subgraph', () => {
    const nav: TestPageNavEdge[] = [
      { id: 'e1', projectId: 'p', sourcePageId: 'a', targetPageId: 'b', createdAt: '' },
      { id: 'e2', projectId: 'p', sourcePageId: 'b', targetPageId: 'c', createdAt: '' },
    ]
    const flowEdges = nav.map(e => ({ id: e.id, source: e.sourcePageId, target: e.targetPageId, runOrder: e.runOrder }))
    const inScope = reachableNodeIdsFrom(['a'], flowEdges)
    const result = computeFlowPageSequence({
      pageIdsInScope: inScope,
      pages: [
        { id: 'a', sortOrder: 1 },
        { id: 'b', sortOrder: 2 },
        { id: 'c', sortOrder: 3 },
      ],
      navEdges: nav,
      startPageId: 'a',
      caseCountByPageId: { a: 1, b: 1, c: 1 },
    })
    expect(result.runnableSequence).toEqual(['a', 'b', 'c'])
  })

  it('warns when pages in scope are unreachable in flow', () => {
    const result = computeFlowPageSequence({
      pageIdsInScope: ['a', 'b', 'orphan'],
      pages: [
        { id: 'a', sortOrder: 1 },
        { id: 'b', sortOrder: 2 },
        { id: 'orphan', sortOrder: 3 },
      ],
      navEdges: [{ id: 'e1', projectId: 'p', sourcePageId: 'a', targetPageId: 'b', createdAt: '' }],
      caseCountByPageId: { a: 1, b: 1 },
      startPageId: 'a',
    })
    expect(result.warnings.some(isFlowUnreachableWarning)).toBe(true)
    expect(result.warnings[0]).toContain(FLOW_UNREACHABLE_IN_SCOPE_PREFIX)
  })
})
