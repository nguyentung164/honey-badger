'use client'

import { useTranslation } from 'react-i18next'
import { CommitWorkflowRunChoicesSummary } from '@/components/commit-workflow/CommitWorkflowRunChoicesSummary'
import { formatStepStatusLabel } from '@/lib/commitWorkflow/commitWorkflowUtils'
import type { CommitWorkflowRunRecord } from 'shared/commitWorkflow/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function CommitWorkflowStepDetail({
  run,
  stepKey,
  onOpenAutomation,
  onClose,
  embedded = false,
}: {
  run: CommitWorkflowRunRecord
  stepKey: string
  onOpenAutomation: (testRunId: string) => void
  onClose?: () => void
  embedded?: boolean
}) {
  const { t } = useTranslation()
  const step = run.steps.find(s => s.stepKey === stepKey)
  if (!step) return null
  const summary = step.summary as Record<string, unknown> | null

  return (
    <div className={cn('text-sm', !embedded && 'rounded-lg border bg-muted/30 p-3')}>
      {!embedded ? (
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium">{step.stepKind}</span>
          {onClose ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t('common.close')}
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{formatStepStatusLabel(step.status, t)}</p>
      <CommitWorkflowRunChoicesSummary runChoices={run.contextSnapshot.runChoices} className="mt-2 rounded-md border bg-background/50 p-2" />
      {step.stepKind === 'coding-rules' && summary ? (
        <ul className="mt-2 list-disc pl-4 text-xs">
          <li>
            {t('commitWorkflow.violations')}: {String(summary.violationCount ?? 0)}
          </li>
          {Array.isArray(summary.topViolations) &&
            (summary.topViolations as string[]).map((v, i) => (
              <li key={i}>{v}</li>
            ))}
        </ul>
      ) : null}
      {step.stepKind === 'spotbugs' && summary ? (
        <p className="mt-2 text-xs">
          Bugs: {String(summary.totalBugs ?? 0)} (H:{String(summary.high ?? 0)} M:{String(summary.medium ?? 0)} L:
          {String(summary.low ?? 0)})
        </p>
      ) : null}
      {step.stepKind === 'playwright' && summary?.needsBrowserInstall ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => void window.api.automation.browsers.install({ browsers: ['chromium'] })}
        >
          {t('commitWorkflow.installPlaywrightBrowsers')}
        </Button>
      ) : null}
      {step.stepKind === 'playwright' && step.externalRef ? (
        <Button type="button" variant="link" className="mt-2 h-auto p-0 text-xs" onClick={() => onOpenAutomation(step.externalRef!)}>
          {t('commitWorkflow.openAutomationRun')}
        </Button>
      ) : null}
      {step.stepKind === 'playwright' && summary && !step.externalRef ? (
        <p className="mt-2 text-xs">
          passed {String(summary.passed ?? 0)} / failed {String(summary.failed ?? 0)}
        </p>
      ) : null}
    </div>
  )
}
