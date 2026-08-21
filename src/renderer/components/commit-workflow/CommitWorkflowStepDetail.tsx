'use client'

import { useTranslation } from 'react-i18next'
import { CommitWorkflowRunChoicesSummary } from '@/components/commit-workflow/CommitWorkflowRunChoicesSummary'
import { formatStepElapsed, formatStepStatusLabel } from '@/lib/commitWorkflow/commitWorkflowUtils'
import type { CommitWorkflowRunRecord } from 'shared/commitWorkflow/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function CommitWorkflowStepDetail({
  run,
  stepKey,
  onOpenAutomation,
  onClose,
  embedded = false,
  showRunChoices = true,
}: {
  run: CommitWorkflowRunRecord
  stepKey: string
  onOpenAutomation: (testRunId: string) => void
  onClose?: () => void
  embedded?: boolean
  showRunChoices?: boolean
}) {
  const { t } = useTranslation()
  const step = run.steps.find(s => s.stepKey === stepKey)
  if (!step) return null
  const summary = step.summary as Record<string, unknown> | null

  return (
    <div className={cn('text-sm', !embedded && 'rounded-lg border bg-muted/30 p-3')}>
      {!embedded ? (
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium">{t(`commitWorkflow.stepKind.${step.stepKind}`, { defaultValue: step.stepKind })}</span>
          {onClose ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t('common.close')}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{formatStepStatusLabel(step.status, t)}</span>
        {step.startedAt ? (
          <span>
            {t('commitWorkflow.colElapsed')}: {formatStepElapsed(step.startedAt, step.finishedAt)}
          </span>
        ) : null}
      </div>
      {showRunChoices ? (
        <CommitWorkflowRunChoicesSummary runChoices={run.contextSnapshot.runChoices} className="mt-2 rounded-md border bg-background/50 p-2" />
      ) : null}
      {step.stepKind === 'coding-rules' && summary ? (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-medium">
            {t('commitWorkflow.violations')}: {String(summary.violationCount ?? 0)}
          </p>
          {Array.isArray(summary.topViolations) && (summary.topViolations as string[]).length > 0 ? (
            <ul className="max-h-40 list-disc overflow-auto pl-4 text-xs text-muted-foreground">
              {(summary.topViolations as string[]).map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          ) : Number(summary.violationCount ?? 0) === 0 ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{t('commitWorkflow.stepPreview.noIssues')}</p>
          ) : null}
        </div>
      ) : null}
      {step.stepKind === 'spotbugs' && summary ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">{t('commitWorkflow.stepPreview.bugTotal', { total: String(summary.totalBugs ?? 0) })}</span>
          <span className="rounded bg-red-500/10 px-1.5 py-0.5">H:{String(summary.high ?? 0)}</span>
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5">M:{String(summary.medium ?? 0)}</span>
          <span className="rounded bg-blue-500/10 px-1.5 py-0.5">L:{String(summary.low ?? 0)}</span>
        </div>
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
        <div className="mt-2 space-y-2">
          {summary ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5">
                {t('commitWorkflow.stepPreview.passedCount', { count: String(summary.passed ?? 0) })}
              </span>
              <span className="rounded bg-red-500/10 px-1.5 py-0.5">
                {t('commitWorkflow.stepPreview.failedCount', { count: String(summary.failed ?? 0) })}
              </span>
              {Number(summary.skipped ?? 0) > 0 ? (
                <span className="rounded bg-muted/50 px-1.5 py-0.5">
                  {t('commitWorkflow.stepPreview.skippedCount', { count: String(summary.skipped ?? 0) })}
                </span>
              ) : null}
              {Number(summary.flaky ?? 0) > 0 ? (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5">
                  {t('commitWorkflow.stepPreview.flakyCount', { count: String(summary.flaky ?? 0) })}
                </span>
              ) : null}
            </div>
          ) : null}
          <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => onOpenAutomation(step.externalRef!)}>
            {t('commitWorkflow.openAutomationRun')}
          </Button>
        </div>
      ) : null}
      {step.stepKind === 'playwright' && summary && !step.externalRef ? (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5">
            {t('commitWorkflow.stepPreview.passedCount', { count: String(summary.passed ?? 0) })}
          </span>
          <span className="rounded bg-red-500/10 px-1.5 py-0.5">
            {t('commitWorkflow.stepPreview.failedCount', { count: String(summary.failed ?? 0) })}
          </span>
        </div>
      ) : null}
    </div>
  )
}
