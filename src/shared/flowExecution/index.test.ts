import { describe, expect, it } from 'vitest'
import {
  assignRunOrderForNewEdge,
  buildOrderedExecutionPlan,
  normalizeRunOrdersForSource,
  orderedTraversal,
  pickNextReadyNode,
  reachableNodeIdsFrom,
  resolvedRunOrderByEdgeId,
  swapRunOrderForEdge,
  validateRunOrders,
} from './index'
import type { FlowExecEdge, FlowExecNode } from './index'

describe('assignRunOrderForNewEdge', () => {
  it('returns 1 for first edge from source', () => {
    expect(assignRunOrderForNewEdge('a', [])).toBe(1)
  })

  it('returns max+1 for siblings', () => {
    const edges: FlowExecEdge[] = [
      { id: 'e1', source: 'a', target: 'b', runOrder: 1 },
      { id: 'e2', source: 'a', target: 'c', runOrder: 2 },
    ]
    expect(assignRunOrderForNewEdge('a', edges)).toBe(3)
  })
})

describe('normalizeRunOrdersForSource', () => {
  it('compacts to 1..n preserving relative order', () => {
    const edges: FlowExecEdge[] = [
      { id: 'e1', source: 'a', target: 'b', runOrder: 5 },
      { id: 'e2', source: 'a', target: 'c', runOrder: 10 },
      { id: 'e3', source: 'x', target: 'y', runOrder: 99 },
    ]
    const out = normalizeRunOrdersForSource('a', edges)
    expect(out.find(e => e.id === 'e1')?.runOrder).toBe(1)
    expect(out.find(e => e.id === 'e2')?.runOrder).toBe(2)
    expect(out.find(e => e.id === 'e3')?.runOrder).toBe(99)
  })
})

describe('validateRunOrders', () => {
  it('flags duplicate orders', () => {
    const edges: FlowExecEdge[] = [
      { id: 'e1', source: 'a', target: 'b', runOrder: 1 },
      { id: 'e2', source: 'a', target: 'c', runOrder: 1 },
    ]
    expect(validateRunOrders(edges).length).toBeGreaterThan(0)
  })
})

describe('pickNextReadyNode', () => {
  const edges: FlowExecEdge[] = [
    { id: 'e1', source: 'a', target: 'b', runOrder: 1 },
    { id: 'e2', source: 'a', target: 'c', runOrder: 2 },
  ]

  it('prefers successor of last completed by runOrder', () => {
    expect(pickNextReadyNode(['b', 'c'], 'a', edges)).toBe('b')
  })

  it('picks second successor after first completes', () => {
    expect(pickNextReadyNode(['c'], 'b', edges)).toBe('c')
  })
})

describe('orderedTraversal', () => {
  const nodes: FlowExecNode[] = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ]
  const edges: FlowExecEdge[] = [
    { id: 'e1', source: 'a', target: 'b', runOrder: 1 },
    { id: 'e2', source: 'a', target: 'c', runOrder: 2 },
    { id: 'e3', source: 'b', target: 'c', runOrder: 1 },
  ]

  it('runs A then B then C when A branches B(1) and C(2)', () => {
    const plan = buildOrderedExecutionPlan(nodes, edges)
    const order = orderedTraversal(plan, { scopeNodeIds: new Set(['a', 'b', 'c']) })
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('skips disabled node and continues', () => {
    const nodesWithDisabled: FlowExecNode[] = [
      { id: 'a' },
      { id: 'b', disabled: true },
      { id: 'c' },
    ]
    const linear: FlowExecEdge[] = [
      { id: 'e1', source: 'a', target: 'b', runOrder: 1 },
      { id: 'e2', source: 'b', target: 'c', runOrder: 1 },
    ]
    const plan = buildOrderedExecutionPlan(nodesWithDisabled, linear)
    expect(plan.disabledNodeIds).toEqual(['b'])
    const order = orderedTraversal(plan, { scopeNodeIds: new Set(['a', 'c']) })
    expect(order).toEqual(['a', 'c'])
  })
})

describe('reachableNodeIdsFrom', () => {
  const edges: FlowExecEdge[] = [
    { id: 'e1', source: 'a', target: 'b', runOrder: 1 },
    { id: 'e2', source: 'b', target: 'c', runOrder: 1 },
  ]

  it('returns forward reachable from start without boundary', () => {
    const ids = reachableNodeIdsFrom(['a'], edges)
    expect(new Set(ids)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('respects boundary set', () => {
    const ids = reachableNodeIdsFrom(['a'], edges, new Set(['a', 'b']))
    expect(new Set(ids)).toEqual(new Set(['a', 'b']))
  })
})

describe('resolvedRunOrderByEdgeId', () => {
  it('assigns 1..n when runOrder is missing', () => {
    const edges: FlowExecEdge[] = [
      { id: 'e3', source: 'a', target: 'c' },
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'd' },
    ]
    const map = resolvedRunOrderByEdgeId(edges)
    expect(map.get('e1')).toBe(1)
    expect(map.get('e2')).toBe(2)
    expect(map.get('e3')).toBe(3)
  })
})

describe('swapRunOrderForEdge', () => {
  it('swaps conflicting order and normalizes', () => {
    const edges: FlowExecEdge[] = [
      { id: 'e1', source: 'a', target: 'b', runOrder: 1 },
      { id: 'e2', source: 'a', target: 'c', runOrder: 2 },
    ]
    const out = swapRunOrderForEdge('e2', 1, edges)
    expect(out.find(e => e.id === 'e1')?.runOrder).toBe(2)
    expect(out.find(e => e.id === 'e2')?.runOrder).toBe(1)
  })
})
