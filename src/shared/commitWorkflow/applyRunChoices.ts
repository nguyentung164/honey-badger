import { DEFAULT_COMMIT_WORKFLOW_GRAPH } from './defaultWorkflow'
import type { CommitWorkflowGraphJson, CommitWorkflowNodeData } from './types'
import type { CommitWorkflowRunChoices } from './runChoices'

const STEP_IDS = {
  codingRules: 'step-coding-rules',
  spotbugs: 'step-spotbugs',
  playwright: 'step-playwright',
} as const

function patchNode(
  graph: CommitWorkflowGraphJson,
  stepId: string,
  patch: Partial<CommitWorkflowNodeData>
): CommitWorkflowGraphJson {
  return {
    ...graph,
    nodes: graph.nodes.map(n => (n.id === stepId ? { ...n, data: { ...n.data, ...patch } } : n)),
  }
}

/** Apply per-commit dialog choices onto the fixed 3-step template graph. */
export function applyRunChoicesToGraph(
  choices: CommitWorkflowRunChoices,
  base: CommitWorkflowGraphJson = DEFAULT_COMMIT_WORKFLOW_GRAPH
): CommitWorkflowGraphJson {
  let graph: CommitWorkflowGraphJson = structuredClone(base)

  graph = patchNode(graph, STEP_IDS.codingRules, {
    enabled: choices.codingRules.enabled,
    codingRuleId: choices.codingRules.codingRuleId ?? null,
    codingRuleName: choices.codingRules.codingRuleName ?? null,
  })

  graph = patchNode(graph, STEP_IDS.spotbugs, {
    enabled: choices.spotbugs.enabled,
  })

  const pageId = choices.playwright.catalogPageId?.trim() || null
  graph = patchNode(graph, STEP_IDS.playwright, {
    enabled: choices.playwright.enabled,
    catalogPageId: pageId,
    catalogFlowId: choices.playwright.catalogFlowId?.trim() || null,
    catalogPageName: choices.playwright.pageName ?? null,
    catalogFlowName: choices.playwright.flowName ?? null,
    pageIds: pageId ? [pageId] : [],
  })

  return graph
}
