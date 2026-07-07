'use client'

import { Loader2 } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { CommitWorkflowRunChoicesSummary } from '@/components/commit-workflow/CommitWorkflowRunChoicesSummary'
import { CommitWorkflowStepDetailDialog } from '@/components/commit-workflow/CommitWorkflowStepDetailDialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatRunStatusLabel, formatStepElapsed, formatStepStatusLabel } from '@/lib/commitWorkflow/commitWorkflowUtils'
import type { CommitWorkflowRunRecord, CommitWorkflowStepStatusEntry } from 'shared/commitWorkflow/types'

function StatusBadge({ status, t }: { status: CommitWorkflowStepStatusEntry['status']; t: ReturnType<typeof useTranslation>['t'] }) {
  const color =
    status === 'pass' || status === 'skipped'
      ? 'text-emerald-600 dark:text-emerald-400'
      : status === 'running'
        ? 'text-blue-600 dark:text-blue-400'
        : status === 'fail' || status === 'error'
          ? 'text-red-600 dark:text-red-400'
          : 'text-muted-foreground'
  return <span className={cn('text-xs font-medium', color)}>{formatStepStatusLabel(status, t)}</span>
}

type CommitWorkflowHistoryRunDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  run: CommitWorkflowRunRecord | null
  selectedStepKey: string | null
  onSelectStep: (stepKey: string) => void
  onOpenAutomation: (testRunId: string) => void
  stepDetailOpen: boolean
  onStepDetailOpenChange: (open: boolean) => void
}

export const CommitWorkflowHistoryRunDialog = memo(function CommitWorkflowHistoryRunDialog({
  open,
  onOpenChange,
  run,
  selectedStepKey,
  onSelectStep,
  onOpenAutomation,
  stepDetailOpen,
  onStepDetailOpenChange,
}: CommitWorkflowHistoryRunDialogProps) {
  const { t } = useTranslation()

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[min(85vh,640px)] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex flex-col gap-1 text-left">
              <span className="font-mono text-sm">{run?.commitHash.slice(0, 7)}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">{run?.contextSnapshot.commitMessage}</span>
            </DialogTitle>
          </DialogHeader>
          {run ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{formatRunStatusLabel(run.status, t)}</span>
              </div>
              <CommitWorkflowRunChoicesSummary runChoices={run.contextSnapshot.runChoices} className="mb-3 rounded-md border bg-muted/20 p-2" />
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2">{t('commitWorkflow.colStep')}</th>
                    <th className="py-2 pr-2">{t('commitWorkflow.colStatus')}</th>
                    <th className="py-2 pr-2">{t('commitWorkflow.colElapsed')}</th>
                  </tr>
                </thead>
                <tbody>
                  {run.steps.map(step => (
                    <tr
                      key={step.id}
                      className={cn(
                        'cursor-pointer border-b border-border/50 hover:bg-muted/40',
                        selectedStepKey === step.stepKey && 'bg-muted/30'
                      )}
                      onClick={() => onSelectStep(step.stepKey)}
                    >
                      <td className="py-2 pr-2">{step.stepKind}</td>
                      <td className="py-2 pr-2">
                        <span className="inline-flex items-center gap-1">
                          {step.status === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          <StatusBadge status={step.status} t={t} />
                        </span>
                      </td>
                      <td className="py-2 pr-2 tabular-nums text-xs text-muted-foreground">
                        {formatStepElapsed(step.startedAt ?? undefined, step.finishedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <CommitWorkflowStepDetailDialog
        open={stepDetailOpen}
        onOpenChange={onStepDetailOpenChange}
        run={run}
        stepKey={selectedStepKey}
        onOpenAutomation={onOpenAutomation}
      />
    </>
  )
})
