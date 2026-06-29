import type { CommitWorkflowRunChoices } from './runChoices'
import { EMPTY_COMMIT_WORKFLOW_RUN_CHOICES } from './runChoices'

export type CodingRuleOption = {
  id: string
  name: string
  projectId?: string | null
  scope?: 'global' | 'project'
}

const FE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.html', '.htm', '.css', '.scss', '.sass', '.less', '.json'])
const FE_NAME = /fe|frontend|angular|react|vue|typescript|html|css|ui/i
const BE_NAME = /be|backend|java|spring|kotlin|spotbugs/i

function ext(path: string): string {
  const i = path.lastIndexOf('.')
  return i >= 0 ? path.slice(i).toLowerCase() : ''
}

export function hasJavaStaged(files: string[]): boolean {
  return files.some(f => ext(f) === '.java')
}

export function isFeOnlyStaged(files: string[]): boolean {
  const meaningful = files.filter(f => ext(f))
  if (meaningful.length === 0) return false
  return meaningful.every(f => FE_EXT.has(ext(f)))
}

export function suggestCodingRuleId(rules: CodingRuleOption[], files: string[]): string | null {
  if (rules.length === 0) return null
  const fe = isFeOnlyStaged(files) && !hasJavaStaged(files)
  const be = hasJavaStaged(files) && !isFeOnlyStaged(files)
  const pool = fe ? rules.filter(r => FE_NAME.test(r.name)) : be ? rules.filter(r => BE_NAME.test(r.name)) : rules
  const pick = pool[0] ?? rules[0]
  return pick?.id ?? null
}

export function suggestRunChoices(input: {
  stagedFiles: string[]
  saved?: CommitWorkflowRunChoices | null
  codingRules: CodingRuleOption[]
  hasSavedPrefs: boolean
}): CommitWorkflowRunChoices {
  const files = input.stagedFiles.map(f => f.replace(/\\/g, '/'))
  const saved = input.saved
  const base: CommitWorkflowRunChoices = saved
    ? structuredClone(saved)
    : structuredClone(EMPTY_COMMIT_WORKFLOW_RUN_CHOICES)

  const java = hasJavaStaged(files)
  const feOnly = isFeOnlyStaged(files) && !java

  if (!input.hasSavedPrefs) {
    base.codingRules.enabled = files.length > 0
    base.spotbugs.enabled = feOnly ? false : java
    const ruleId = suggestCodingRuleId(input.codingRules, files)
    if (ruleId) {
      const rule = input.codingRules.find(r => r.id === ruleId)
      base.codingRules.codingRuleId = ruleId
      base.codingRules.codingRuleName = rule?.name ?? null
    }
  } else {
    if (feOnly) base.spotbugs.enabled = false
    else if (java) base.spotbugs.enabled = true
  }

  if (!base.playwright.catalogPageId?.trim()) {
    base.playwright.enabled = false
  }

  return base
}
