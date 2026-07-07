'use client'

import { useTranslation } from 'react-i18next'
import { CommitWorkflowStepDetail } from '@/components/commit-workflow/CommitWorkflowStepDetail'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CommitWorkflowRunRecord } from 'shared/commitWorkflow/types'

type CommitWorkflowStepDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  run: CommitWorkflowRunRecord | null
  stepKey: string | null
  onOpenAutomation: (testRunId: string) => void
}

export function CommitWorkflowStepDetailDialog({
  open,
  onOpenChange,
  run,
  stepKey,
  onOpenAutomation,
}: CommitWorkflowStepDetailDialogProps) {
  const { t } = useTranslation()
  const step = run && stepKey ? run.steps.find(s => s.stepKey === stepKey) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(85vh,640px)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{step?.stepKind ?? t('commitWorkflow.colStep')}</DialogTitle>
        </DialogHeader>
        {run && stepKey ? (
          <CommitWorkflowStepDetail
            run={run}
            stepKey={stepKey}
            onOpenAutomation={onOpenAutomation}
            embedded
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
