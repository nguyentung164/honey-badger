'use client'

import { useTranslation } from 'react-i18next'
import type { CommitWorkflowRunChoices } from 'shared/commitWorkflow/runChoices'

type Props = {
  runChoices?: CommitWorkflowRunChoices | null
  className?: string
}

export function CommitWorkflowRunChoicesSummary({ runChoices, className }: Props) {
  const { t } = useTranslation()
  if (!runChoices) return null

  const rows = [
    {
      step: t('commitWorkflow.stepKind.coding-rules'),
      enabled: runChoices.codingRules.enabled,
      detail: runChoices.codingRules.enabled
        ? runChoices.codingRules.codingRuleName || runChoices.codingRules.codingRuleId || '—'
        : t('commitWorkflow.runChoices.skipped'),
    },
    {
      step: t('commitWorkflow.stepKind.spotbugs'),
      enabled: runChoices.spotbugs.enabled,
      detail: runChoices.spotbugs.enabled ? t('commitWorkflow.runChoices.enabled') : t('commitWorkflow.runChoices.skipped'),
    },
    {
      step: t('commitWorkflow.stepKind.playwright'),
      enabled: runChoices.playwright.enabled,
      detail: runChoices.playwright.enabled
        ? [runChoices.playwright.pageName || runChoices.playwright.catalogPageId, runChoices.playwright.flowName || runChoices.playwright.catalogFlowId]
            .filter(Boolean)
            .join(' → ') || '—'
        : t('commitWorkflow.runChoices.skipped'),
    },
  ]

  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground">{t('commitWorkflow.runChoices.title')}</p>
      <ul className="mt-1.5 space-y-1 text-xs">
        {rows.map(row => (
          <li key={row.step} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={row.enabled ? 'text-foreground' : 'text-muted-foreground line-through'}>{row.step}</span>
            <span className="text-muted-foreground">—</span>
            <span className={row.enabled ? 'text-foreground' : 'text-muted-foreground'}>{row.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
