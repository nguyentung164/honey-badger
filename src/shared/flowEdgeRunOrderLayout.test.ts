import { describe, expect, it } from 'vitest'
import { runOrderFanPlacementForEdge } from './flowEdgeRunOrderLayout'

describe('runOrderFanPlacementForEdge', () => {
  const edges = [
    { id: 'e1', source: 'login', target: 'a' },
    { id: 'e2', source: 'login', target: 'b' },
    { id: 'e3', source: 'login', target: 'c' },
  ]
  const order = new Map([
    ['e1', 1],
    ['e2', 2],
    ['e3', 3],
  ])

  it('does not fan across different targets', () => {
    for (const e of edges) {
      const fan = runOrderFanPlacementForEdge(e, edges, order)
      expect(fan.fanMax).toBe(1)
      expect(fan.fanIndex).toBe(1)
    }
  })

  it('fans only among edges to the same target', () => {
    const parallel = [
      { id: 'a1', source: 'x', target: 't' },
      { id: 'a2', source: 'x', target: 't' },
    ]
    const o = new Map([
      ['a1', 1],
      ['a2', 2],
    ])
    expect(runOrderFanPlacementForEdge(parallel[0], parallel, o)).toEqual({ fanMax: 2, fanIndex: 1 })
    expect(runOrderFanPlacementForEdge(parallel[1], parallel, o)).toEqual({ fanMax: 2, fanIndex: 2 })
  })
})
