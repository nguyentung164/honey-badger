'use client'

import type { LucideIcon } from 'lucide-react'
import { AlertCircle, Ban, CheckCircle2, Loader2, Workflow, X } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { nodeById } from 'shared/commitWorkflow/defaultWorkflow'
import type { CommitWorkflowRunStatus, CommitWorkflowRunStreamPayload } from 'shared/commitWorkflow/types'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import { countCompletedSteps, triggerCommitWorkflowAfterCommit, useCommitWorkflowStore } from '@/lib/commitWorkflow/commitWorkflowUtils'
import { cn } from '@/lib/utils'

function activeStepLabel(stream: CommitWorkflowRunStreamPayload | null): string | null {
  if (!stream?.activeStepKey) return null
  const step = stream.stepStatus[stream.activeStepKey]
  return step?.label ?? stream.activeStepKey
}

function runToStreamPayload(run: NonNullable<Awaited<ReturnType<typeof window.api.commitWorkflow.getRun>>['data']>): CommitWorkflowRunStreamPayload {
  const stepStatus: CommitWorkflowRunStreamPayload['stepStatus'] = {}
  const graph = run.graphSnapshot
  for (const s of run.steps) {
    const node = nodeById(graph, s.stepKey)
    stepStatus[s.stepKey] = {
      status: s.status,
      stepKind: s.stepKind,
      label: node?.data.label ?? s.stepKey,
      startedAt: s.startedAt ?? undefined,
      finishedAt: s.finishedAt ?? undefined,
      summary: s.summary,
      externalRef: s.externalRef ?? undefined,
    }
  }
  return {
    runId: run.id,
    repoPath: run.repoPath,
    commitHash: run.commitHash,
    runStatus: run.status,
    activeStepKey: run.steps.find(s => s.status === 'running')?.stepKey ?? null,
    stepStatus,
  }
}

function workflowStatusIcon(runStatus: CommitWorkflowRunStatus, isRunning: boolean): LucideIcon {
  if (isRunning) return Loader2
  switch (runStatus) {
    case 'failed':
      return AlertCircle
    case 'cancelled':
    case 'superseded':
      return Ban
    case 'completed':
      return CheckCircle2
    default:
      return Workflow
  }
}

export const CommitWorkflowStatusBar = memo(function CommitWorkflowStatusBar({
  repoPath,
  className,
  compact = false,
}: {
  repoPath?: string
  className?: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  const stream = useCommitWorkflowStore(s => s.stream)
  const dismissedRunId = useCommitWorkflowStore(s => s.dismissedRunId)
  const setStream = useCommitWorkflowStore(s => s.setStream)
  const setDetailDialogOpen = useCommitWorkflowStore(s => s.setDetailDialogOpen)
  const dismissStream = useCommitWorkflowStore(s => s.dismissStream)
  const prevStatusRef = useRef<string | null>(null)
  const [syncPending, setSyncPending] = useState(0)

  useEffect(() => {
    const off = window.api.commitWorkflow.onRunStream(payload => {
      if (repoPath && payload.repoPath !== repoPath) return
      setStream(payload)
    })
    void window.api.commitWorkflow.getActive(repoPath).then(res => {
      if (res.status === 'success' && res.data?.runId) {
        void window.api.commitWorkflow.getRun(res.data.runId).then(r => {
          if (r.status === 'success' && r.data) {
            setStream(runToStreamPayload(r.data))
          }
        })
      }
    })
    const pollSync = () => {
      void window.api.commitWorkflow.getSyncStatus().then(res => {
        if (res.status === 'success' && res.data) setSyncPending(res.data.pending)
      })
    }
    pollSync()
    const syncTimer = setInterval(pollSync, 30_000)
    return () => {
      off()
      clearInterval(syncTimer)
    }
  }, [repoPath, setStream])

  const summary = useMemo(() => countCompletedSteps(stream?.stepStatus ?? {}), [stream])
  const isRunning = stream?.runStatus === 'running' || stream?.runStatus === 'queued'
  const activeLabel = activeStepLabel(stream)
  const elapsedSec = stream?.elapsedMs != null ? Math.floor(stream.elapsedMs / 1000) : null
  const visible = stream && stream.runId !== dismissedRunId

  const statusText =
    isRunning && activeLabel
      ? t('commitWorkflow.statusRunning', { step: activeLabel, done: summary.done, total: summary.total })
      : t('commitWorkflow.statusSummary', { pass: summary.pass, total: summary.total })
  const statusTextWithElapsed = elapsedSec != null && isRunning ? `${statusText} · ${elapsedSec}s` : statusText

  useEffect(() => {
    if (!stream) {
      prevStatusRef.current = null
      return
    }
    const prev = prevStatusRef.current
    const wasActive = prev === 'running' || prev === 'queued'
    if (wasActive && stream.runStatus === 'completed') {
      toast.success(t('commitWorkflow.runCompletedToast', { pass: summary.pass, total: summary.total }))
    } else if (wasActive && stream.runStatus === 'failed') {
      toast.error(t('commitWorkflow.runFailedToast', { pass: summary.pass, total: summary.total }))
    }
    prevStatusRef.current = stream.runStatus
  }, [stream?.runStatus, stream, summary.pass, summary.total, t])

  if (!visible || !stream) return null

  const Icon = workflowStatusIcon(stream.runStatus, isRunning)
  const compactBtnClass = 'h-7 w-7 shrink-0'

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!stream.runId) return
    void window.api.commitWorkflow.cancel(stream.runId)
  }

  const openDetail = () => setDetailDialogOpen(true)

  const dismissButton = isRunning ? (
    <Button type="button" variant="ghost" size="icon" className={cn(compactBtnClass, !compact && 'h-8 w-8')} onClick={handleCancel} aria-label={t('commitWorkflow.cancelRun')}>
      <X className="h-3.5 w-3.5" />
    </Button>
  ) : (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(compactBtnClass, !compact && 'h-8 w-8')}
      onClick={() => dismissStream()}
      aria-label={t('commitWorkflow.dismissStatus')}
    >
      <X className="h-3.5 w-3.5 opacity-60" />
    </Button>
  )

  if (compact) {
    return (
      <div className={cn('flex items-center gap-0.5 text-xs text-muted-foreground', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className={compactBtnClass} onClick={openDetail} aria-label={statusTextWithElapsed}>
              <Icon className={cn('h-3.5 w-3.5', isRunning && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p>{statusTextWithElapsed}</p>
            <p className="mt-1 text-muted-foreground">{t('commitWorkflow.statusBarHint')}</p>
          </TooltipContent>
        </Tooltip>
        {dismissButton}
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-1 text-xs text-muted-foreground', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={openDetail} aria-label={t('commitWorkflow.openDetail')}>
            <Icon className={cn('h-4 w-4', isRunning && 'animate-spin')} />
            <Workflow className="h-3.5 w-3.5 opacity-70" />
            <span className="max-w-[200px] truncate">{statusTextWithElapsed}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p>{t('commitWorkflow.statusBarHint')}</p>
        </TooltipContent>
      </Tooltip>
      {syncPending > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
              onClick={() => void window.api.commitWorkflow.syncFlush()}
            >
              {t('commitWorkflow.syncBacklog', { count: syncPending })}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{t('commitWorkflow.syncBacklogHint', { count: syncPending })}</TooltipContent>
        </Tooltip>
      ) : null}
      {dismissButton}
    </div>
  )
})

export { triggerCommitWorkflowAfterCommit }
