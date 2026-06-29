import { getCommitDiff } from '../../git/diff'
import type { CodingRulesStepSummary, CommitWorkflowContextSnapshot, CommitWorkflowSettings } from 'shared/commitWorkflow/types'
import { countViolations, parseViolationsMarkdown, topViolationLabels } from 'shared/commitWorkflow/parseViolations'
import { sendCheckViolationsPrompt } from '../aiHelper'

export type CodingRulesStepResult = {
  status: 'pass' | 'fail' | 'skipped' | 'error'
  summary: CodingRulesStepSummary | null
  message?: string
}

export async function runCodingRulesStep(input: {
  commitHash: string
  repoPath: string
  context: CommitWorkflowContextSnapshot
  settings: CommitWorkflowSettings
  userId: string
  language?: string
  signal?: AbortSignal
}): Promise<CodingRulesStepResult> {
  if (input.signal?.aborted) return { status: 'error', summary: null, message: 'Cancelled' }

  if (!input.settings.codingRuleId?.trim() && !input.settings.codingRuleName?.trim()) {
    return { status: 'skipped', summary: null, message: 'No coding rule selected' }
  }

  const allFiles = [...input.context.addedFiles, ...input.context.modifiedFiles]
  if (allFiles.length === 0) {
    return { status: 'skipped', summary: { violationCount: 0, pass: true, topViolations: [] }, message: 'No files to check' }
  }

  const svnDiff = input.context.svnDiffContent?.trim()
  let diffContent = svnDiff ?? ''
  if (!diffContent) {
    const diffRes = await getCommitDiff(input.commitHash, undefined, input.repoPath)
    if (diffRes.status === 'success' && diffRes.data?.diffContent?.trim()) {
      diffContent = diffRes.data.diffContent
    }
  }
  if (!diffContent.trim()) {
    return { status: 'skipped', summary: { violationCount: 0, pass: true, topViolations: [] }, message: 'Empty diff' }
  }

  if (input.signal?.aborted) return { status: 'error', summary: null, message: 'Cancelled' }

  try {
    const aiText = await sendCheckViolationsPrompt(diffContent, {
      codingRuleId: input.settings.codingRuleId ?? undefined,
      codingRuleName: input.settings.codingRuleName ?? undefined,
      userId: input.userId,
      sourceFolderPath: input.repoPath,
      language: input.language,
    })
    if (aiText.startsWith('Error:')) {
      return { status: 'error', summary: null, message: aiText }
    }
    const violations = parseViolationsMarkdown(aiText)
    const violationCount = countViolations(violations)
    const summary: CodingRulesStepSummary = {
      violationCount,
      pass: violationCount === 0,
      topViolations: topViolationLabels(violations),
    }
    return { status: summary.pass ? 'pass' : 'fail', summary }
  } catch (e) {
    return { status: 'error', summary: null, message: e instanceof Error ? e.message : String(e) }
  }
}
