import type { CommitWorkflowGraphJson, CommitWorkflowNodeData, CommitWorkflowPersistedNode, CommitWorkflowSettings } from './types'
import { DEFAULT_COMMIT_WORKFLOW_SETTINGS } from './defaultWorkflow'

/** Merge legacy flow-level settings into node data when loading old graphs. */
export function hydrateCommitWorkflowNodeData(
  data: CommitWorkflowNodeData,
  settings?: CommitWorkflowSettings | null
): CommitWorkflowNodeData {
  if (!settings) return data
  return {
    ...data,
    codingRuleId: data.codingRuleId ?? settings.codingRuleId ?? null,
    codingRuleName: data.codingRuleName ?? settings.codingRuleName ?? null,
    automationProjectId: data.automationProjectId ?? settings.automationProjectId ?? null,
    suiteId: data.suiteId ?? settings.suiteId ?? null,
  }
}

export function commitWorkflowNodeToSettings(
  node: CommitWorkflowPersistedNode,
  base: CommitWorkflowSettings
): CommitWorkflowSettings {
  const d = node.data
  if (d.stepKind === 'coding-rules') {
    return {
      ...base,
      codingRuleId: d.codingRuleId ?? base.codingRuleId ?? null,
      codingRuleName: d.codingRuleName ?? base.codingRuleName ?? null,
    }
  }
  if (d.stepKind === 'playwright') {
    const pageId = d.catalogPageId ?? d.pageIds?.[0] ?? base.catalogPageId ?? null
    const flowId = d.catalogFlowId ?? base.catalogFlowId ?? null
    return {
      ...base,
      catalogPageId: pageId,
      catalogFlowId: flowId,
      pageIds: pageId ? [pageId] : base.pageIds ?? [],
      flowIds: flowId ? [flowId] : base.flowIds ?? [],
    }
  }
  return base
}

/** Derive legacy settings_json from per-node config (backward compat). */
export function deriveCommitWorkflowSettingsFromGraph(graph: CommitWorkflowGraphJson): CommitWorkflowSettings {
  const settings: CommitWorkflowSettings = { ...DEFAULT_COMMIT_WORKFLOW_SETTINGS }
  for (const n of graph.nodes) {
    const d = n.data
    if (d.stepKind === 'coding-rules') {
      if (d.codingRuleId) settings.codingRuleId = d.codingRuleId
      if (d.codingRuleName) settings.codingRuleName = d.codingRuleName
    }
    if (d.stepKind === 'playwright') {
      if (d.catalogPageId) {
        settings.catalogPageId = d.catalogPageId
        settings.pageIds = [d.catalogPageId]
      }
      if (d.catalogFlowId) {
        settings.catalogFlowId = d.catalogFlowId
        settings.flowIds = [d.catalogFlowId]
      }
    }
  }
  return settings
}
