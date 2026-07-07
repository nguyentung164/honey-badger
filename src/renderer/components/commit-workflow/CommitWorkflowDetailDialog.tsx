'use client'

import { Loader2, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CommitWorkflowHistoryRunDialog } from '@/components/commit-workflow/CommitWorkflowHistoryRunDialog'
import { CommitWorkflowRunChoicesSummary } from '@/components/commit-workflow/CommitWorkflowRunChoicesSummary'
import { CommitWorkflowStepDetailDialog } from '@/components/commit-workflow/CommitWorkflowStepDetailDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  countCompletedSteps,
  formatStepElapsed,
  formatRunStatusLabel,
  formatStepStatusLabel,
  runRecordFromStream,
  useCommitWorkflowStore,
} from '@/lib/commitWorkflow/commitWorkflowUtils'
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

const CommitWorkflowDetailDialogBody = memo(function CommitWorkflowDetailDialogBody({ repoPath }: { repoPath?: string }) {
  const { t } = useTranslation()
  const stream = useCommitWorkflowStore(s => s.stream)
  const [history, setHistory] = useState<CommitWorkflowRunRecord[]>([])
  const [currentStepKey, setCurrentStepKey] = useState<string | null>(null)
  const [currentStepDetailOpen, setCurrentStepDetailOpen] = useState(false)
  const [historyRun, setHistoryRun] = useState<CommitWorkflowRunRecord | null>(null)
  const [historyRunDialogOpen, setHistoryRunDialogOpen] = useState(false)
  const [historyStepKey, setHistoryStepKey] = useState<string | null>(null)
  const [historyStepDetailOpen, setHistoryStepDetailOpen] = useState(false)

  const loadHistory = useCallback(() => {
    void window.api.commitWorkflow.listRuns({ repoPath, limit: 10 }).then(res => {
      if (res.status === 'success' && res.data) setHistory(res.data)
    })
  }, [repoPath])

  useEffect(() => {
    loadHistory()
  }, [loadHistory, stream?.runId])

  const currentDetailRun = useMemo((): CommitWorkflowRunRecord | null => {
    if (!stream || !currentStepKey) return null
    const fromHistory = history.find(r => r.id === stream.runId)
    return runRecordFromStream(stream, fromHistory ?? null)
  }, [currentStepKey, stream, history])

  const steps = stream ? Object.entries(stream.stepStatus).sort((a, b) => a[0].localeCompare(b[0])) : []
  const summary = countCompletedSteps(stream?.stepStatus ?? {})
  const isRunning = stream?.runStatus === 'running' || stream?.runStatus === 'queued'
  const progressPct = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0
  const currentRunChoices = useMemo(() => {
    if (!stream) return null
    return stream.runChoices ?? history.find(r => r.id === stream.runId)?.contextSnapshot.runChoices ?? null
  }, [history, stream])

  const handleCancel = () => {
    if (!stream?.runId) return
    void window.api.commitWorkflow.cancel(stream.runId)
  }

  const openAutomationRun = (testRunId: string) => {
    window.api.automation.openWindow?.()
    window.location.hash = `/automation?run=${testRunId}`
  }

  const openHistoryRun = (run: CommitWorkflowRunRecord) => {
    setHistoryRun(run)
    setHistoryStepKey(run.steps[0]?.stepKey ?? null)
    setHistoryRunDialogOpen(true)
  }

  const openCurrentStep = (stepKey: string) => {
    setCurrentStepKey(stepKey)
    setCurrentStepDetailOpen(true)
  }

  return (
    <>
      <Tabs defaultValue="current" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="current">{t('commitWorkflow.tabCurrent')}</TabsTrigger>
          <TabsTrigger value="history">{t('commitWorkflow.tabHistory')}</TabsTrigger>
        </TabsList>
        <TabsContent value="current" className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
          {!stream ? (
            <p className="text-sm text-muted-foreground">{t('commitWorkflow.noActiveRun')}</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate font-mono">{stream.commitHash.slice(0, 7)}</span>
                <span>
                  {summary.pass}/{summary.total} {t('commitWorkflow.passLabel')}
                </span>
              </div>
              <CommitWorkflowRunChoicesSummary runChoices={currentRunChoices} className="rounded-md border bg-muted/20 p-2" />
              <div className="space-y-1">
                <Progress value={progressPct} className="h-2" />
                <p className="text-[10px] text-muted-foreground">{t('commitWorkflow.progressLabel', { done: summary.done, total: summary.total })}</p>
              </div>
              {isRunning ? (
                <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
                  <X className="mr-1 h-3.5 w-3.5" />
                  {t('commitWorkflow.cancelRun')}
                </Button>
              ) : null}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2">{t('commitWorkflow.colStep')}</th>
                    <th className="py-2 pr-2">{t('commitWorkflow.colStatus')}</th>
                    <th className="py-2 pr-2">{t('commitWorkflow.colElapsed')}</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map(([key, step]) => (
                    <tr
                      key={key}
                      className="cursor-pointer border-b border-border/50 hover:bg-muted/40"
                      onClick={() => openCurrentStep(key)}
                    >
                      <td className="py-2 pr-2">{step.label}</td>
                      <td className="py-2 pr-2">
                        <span className="inline-flex items-center gap-1">
                          {step.status === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          <StatusBadge status={step.status} t={t} />
                        </span>
                      </td>
                      <td className="py-2 pr-2 tabular-nums text-xs text-muted-foreground">
                        {formatStepElapsed(step.startedAt, step.finishedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </TabsContent>
        <TabsContent value="history" className="mt-3 overflow-auto">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('commitWorkflow.noHistory')}</p>
          ) : (
            <ul className="space-y-2">
              {history.map(run => (
                <li key={run.id}>
                  <button
                    type="button"
                    className="w-full rounded-md border p-2 text-left text-xs hover:bg-muted/40"
                    onClick={() => openHistoryRun(run)}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-mono">{run.commitHash.slice(0, 7)}</span>
                      <span className="text-muted-foreground">{formatRunStatusLabel(run.status, t)}</span>
                    </div>
                    <p className="mt-1 truncate text-muted-foreground">{run.contextSnapshot.commitMessage}</p>
                    <CommitWorkflowRunChoicesSummary runChoices={run.contextSnapshot.runChoices} className="mt-2" />
                    <div className="mt-1 flex flex-wrap gap-1">
                      {run.steps.map(s => (
                        <span key={s.id} className="rounded bg-muted px-1 py-0.5">
                          {s.stepKind}: {formatStepStatusLabel(s.status, t)}
                        </span>
                      ))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <CommitWorkflowStepDetailDialog
        open={currentStepDetailOpen}
        onOpenChange={setCurrentStepDetailOpen}
        run={currentDetailRun}
        stepKey={currentStepKey}
        onOpenAutomation={openAutomationRun}
      />

      <CommitWorkflowHistoryRunDialog
        open={historyRunDialogOpen}
        onOpenChange={open => {
          setHistoryRunDialogOpen(open)
          if (!open) {
            setHistoryRun(null)
            setHistoryStepKey(null)
            setHistoryStepDetailOpen(false)
          }
        }}
        run={historyRun}
        selectedStepKey={historyStepKey}
        onSelectStep={stepKey => {
          setHistoryStepKey(stepKey)
          setHistoryStepDetailOpen(true)
        }}
        onOpenAutomation={openAutomationRun}
        stepDetailOpen={historyStepDetailOpen}
        onStepDetailOpenChange={setHistoryStepDetailOpen}
      />
    </>
  )
})

export function CommitWorkflowDetailDialog({ repoPath }: { repoPath?: string }) {
  const { t } = useTranslation()
  const open = useCommitWorkflowStore(s => s.detailDialogOpen)
  const setDetailDialogOpen = useCommitWorkflowStore(s => s.setDetailDialogOpen)

  return (
    <Dialog open={open} onOpenChange={setDetailDialogOpen}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('commitWorkflow.drawerTitle')}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          {open ? <CommitWorkflowDetailDialogBody repoPath={repoPath} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
