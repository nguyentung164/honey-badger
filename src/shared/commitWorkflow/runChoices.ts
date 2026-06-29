export type CommitWorkflowStepChoice = {
  enabled: boolean
}

export type CommitWorkflowCodingRulesChoice = CommitWorkflowStepChoice & {
  codingRuleId?: string | null
  codingRuleName?: string | null
}

export type CommitWorkflowPlaywrightChoice = CommitWorkflowStepChoice & {
  catalogPageId?: string | null
  catalogFlowId?: string | null
  pageName?: string | null
  flowName?: string | null
}

export type CommitWorkflowRunChoices = {
  codingRules: CommitWorkflowCodingRulesChoice
  spotbugs: CommitWorkflowStepChoice
  playwright: CommitWorkflowPlaywrightChoice
}

export const EMPTY_COMMIT_WORKFLOW_RUN_CHOICES: CommitWorkflowRunChoices = {
  codingRules: { enabled: false, codingRuleId: null, codingRuleName: null },
  spotbugs: { enabled: false },
  playwright: { enabled: false, catalogPageId: null, catalogFlowId: null, pageName: null, flowName: null },
}
