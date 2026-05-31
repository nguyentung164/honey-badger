import { describe, expect, it } from 'vitest'
import { runSequentialReadyNodes } from './sequentialScheduler'
import type { FlowExecEdge } from 'shared/flowExecution'

describe('runSequentialReadyNodes', () => {
  it('runs A then B(1) then C(2) for parallel branches', async () => {
    const edges: FlowExecEdge[] = [
      { id: 'e1', source: 'a', target: 'b', runOrder: 1 },
      { id: 'e2', source: 'a', target: 'c', runOrder: 2 },
    ]
    const order: string[] = []
    let concurrent = 0
    let maxConcurrent = 0
    const resolved = new Map<string, import('shared/flowExecution').NodeOutcome>()
    const executed = await runSequentialReadyNodes({
      nodeIds: ['a', 'b', 'c'],
      edges,
      scopeNodeIds: new Set(['a', 'b', 'c']),
      resolved,
      runOne: async id => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        order.push(id)
        await new Promise(r => setTimeout(r, 5))
        resolved.set(id, 'success')
        concurrent--
      },
    })

    expect(executed).toEqual(['a', 'b', 'c'])
    expect(order).toEqual(['a', 'b', 'c'])
    expect(maxConcurrent).toBe(1)
  })
})
