import { describe, expect, it } from 'vitest'
import { buildScopedRunPlan } from './runScope'
import type { DevPipelineGraphJson } from './types'

const sampleGraph: DevPipelineGraphJson = {
  version: 1,
  nodes: [
    { id: 'g1', type: 'pipelineGroup', position: { x: 0, y: 0 }, data: { label: 'G' } },
    { id: 's1', type: 'pipelineStep', position: { x: 10, y: 10 }, parentId: 'g1', data: { label: 'A', stepKind: 'noop' } },
    { id: 's2', type: 'pipelineStep', position: { x: 10, y: 80 }, parentId: 'g1', data: { label: 'B', stepKind: 'noop', executionDisabled: true } },
    { id: 's3', type: 'pipelineStep', position: { x: 200, y: 10 }, data: { label: 'C', stepKind: 'noop' } },
    { id: 'n1', type: 'pipelineNote', position: { x: 0, y: 200 }, data: { content: 'note' } },
  ],
  edges: [
    { id: 'e1', source: 's1', target: 's2', data: { runOrder: 1 } },
    { id: 'e2', source: 's2', target: 's3', data: { runOrder: 1 } },
    { id: 'e3', source: 's1', target: 's3', data: { runOrder: 2 } },
  ],
}

describe('buildScopedRunPlan', () => {
  it('full run excludes disabled steps', () => {
    const plan = buildScopedRunPlan(sampleGraph, { mode: 'full' })
    expect(plan.executableNodeIds.sort()).toEqual(['s1', 's3'])
    expect(plan.disabledNodeIds).toEqual(['s2'])
  })

  it('node run includes single step', () => {
    const plan = buildScopedRunPlan(sampleGraph, { mode: 'node', nodeId: 's2' })
    expect(plan.executableNodeIds).toEqual([])
  })

  it('group run excludes disabled member', () => {
    const plan = buildScopedRunPlan(sampleGraph, { mode: 'group', groupId: 'g1' })
    expect(plan.executableNodeIds).toEqual(['s1'])
    expect(plan.edges.map(e => e.id)).toEqual([])
    expect(plan.treatExternalAsSuccess).toBe(true)
  })

  it('flow run from start node excludes disabled downstream only when unreachable', () => {
    const plan = buildScopedRunPlan(sampleGraph, { mode: 'flow', startNodeId: 's1' })
    expect(plan.executableNodeIds).toContain('s1')
    expect(plan.executableNodeIds).not.toContain('s2')
  })
})
