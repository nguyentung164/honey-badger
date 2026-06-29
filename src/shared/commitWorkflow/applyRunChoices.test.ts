import { describe, expect, it } from 'vitest'
import { applyRunChoicesToGraph } from './applyRunChoices'
import { EMPTY_COMMIT_WORKFLOW_RUN_CHOICES } from './runChoices'

describe('applyRunChoicesToGraph', () => {
  it('disables steps when switches off', () => {
    const graph = applyRunChoicesToGraph(EMPTY_COMMIT_WORKFLOW_RUN_CHOICES)
    const coding = graph.nodes.find(n => n.id === 'step-coding-rules')
    const spot = graph.nodes.find(n => n.id === 'step-spotbugs')
    const pw = graph.nodes.find(n => n.id === 'step-playwright')
    expect(coding?.data.enabled).toBe(false)
    expect(spot?.data.enabled).toBe(false)
    expect(pw?.data.enabled).toBe(false)
  })

  it('applies coding rule and playwright page on nodes', () => {
    const graph = applyRunChoicesToGraph({
      codingRules: { enabled: true, codingRuleId: 'r1', codingRuleName: 'FE Rules' },
      spotbugs: { enabled: true },
      playwright: {
        enabled: true,
        catalogPageId: 'page-1',
        catalogFlowId: 'flow-1',
        pageName: 'Login',
        flowName: 'Happy path',
      },
    })
    const coding = graph.nodes.find(n => n.id === 'step-coding-rules')!
    const pw = graph.nodes.find(n => n.id === 'step-playwright')!
    expect(coding.data.codingRuleId).toBe('r1')
    expect(pw.data.catalogPageId).toBe('page-1')
    expect(pw.data.catalogFlowId).toBe('flow-1')
    expect(pw.data.pageIds).toEqual(['page-1'])
  })
})
