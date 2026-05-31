import { describe, expect, it } from 'vitest'
import { applyNavEdgeRunOrderPatches, navEdgeRunOrderBackfillPatches } from './db'

describe('navEdgeRunOrderBackfillPatches', () => {
  it('assigns 1..n when run_order is missing on siblings', () => {
    const patches = navEdgeRunOrderBackfillPatches([
      { id: 'e1', sourcePageId: 'a', targetPageId: 'b' },
      { id: 'e2', sourcePageId: 'a', targetPageId: 'c' },
    ])
    expect(patches).toEqual([
      { id: 'e1', runOrder: 1 },
      { id: 'e2', runOrder: 2 },
    ])
  })

  it('returns empty when already normalized', () => {
    const patches = navEdgeRunOrderBackfillPatches([
      { id: 'e1', sourcePageId: 'a', targetPageId: 'b', runOrder: 1 },
      { id: 'e2', sourcePageId: 'a', targetPageId: 'c', runOrder: 2 },
    ])
    expect(patches).toEqual([])
  })
})

describe('applyNavEdgeRunOrderPatches', () => {
  it('persists normalized run_order values via update callback', async () => {
    const persisted = new Map<string, number>()
    const edges = [
      { id: 'e1', sourcePageId: 'a', targetPageId: 'b' },
      { id: 'e2', sourcePageId: 'a', targetPageId: 'c' },
    ]
    const count = await applyNavEdgeRunOrderPatches(edges, async (id, runOrder) => {
      persisted.set(id, runOrder)
    })
    expect(count).toBe(2)
    expect(persisted.get('e1')).toBe(1)
    expect(persisted.get('e2')).toBe(2)
  })
})
