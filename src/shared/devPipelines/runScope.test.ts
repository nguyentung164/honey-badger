import { describe, expect, it } from 'vitest'
import { buildScopedRunPlan } from './runScope'
import type { DevPipelineGraphJson } from './types'

const sampleGraph: DevPipelineGraphJson = {
  version: 1,
  nodes: [
    { id: 'g1', type: 'pipelineGroup', position: { x: 0, y: 0 }, data: { label: 'G' } },
    { id: 's1', type: 'pipelineStep', position: { x: 10, y: 10 }, parentId: 'g1', data: { label: 'A', stepKind: 'noop' } },
    { id: 's2', type: 'pipelineStep', position: { x: 10, y: 80 }, parentId: 'g1', data: { label: 'B', stepKind: 'noop' } },
    { id: 's3', type: 'pipelineStep', position: { x: 200, y: 10 }, data: { label: 'C', stepKind: 'noop' } },
    { id: 'n1', type: 'pipelineNote', position: { x: 0, y: 200 }, data: { content: 'note' } },
  ],
  edges: [
    { id: 'e1', source: 's1', target: 's2' },
    { id: 'e2', source: 's2', target: 's3' },
  ],
}

describe('buildScopedRunPlan', () => {
  it('full run includes all steps and step edges only', () => {
    const plan = buildScopedRunPlan(sampleGraph, { mode: 'full' })
    expect(plan.executableNodeIds.sort()).toEqual(['s1', 's2', 's3'])
    expect(plan.edges.map(e => e.id)).toEqual(['e1', 'e2'])
  })

  it('node run includes single step', () => {
    const plan = buildScopedRunPlan(sampleGraph, { mode: 'node', nodeId: 's2' })
    expect(plan.executableNodeIds).toEqual(['s2'])
    expect(plan.edges).toEqual([])
  })

  it('group run includes member steps and internal edges', () => {
    const plan = buildScopedRunPlan(sampleGraph, { mode: 'group', groupId: 'g1' })
    expect(plan.executableNodeIds.sort()).toEqual(['s1', 's2'])
    expect(plan.edges.map(e => e.id)).toEqual(['e1'])
    expect(plan.treatExternalAsSuccess).toBe(true)
  })
})
