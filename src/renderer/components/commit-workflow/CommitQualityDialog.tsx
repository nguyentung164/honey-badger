'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  CommitWorkflowRunRecord,
  CommitWorkflowRunStatus,
  CommitWorkflowStepKind,
  CommitWorkflowStepRecord,
  CommitWorkflowStepStatus,
} from 'shared/commitWorkflow/types'
import { CommitWorkflowProjectSelect } from '@/components/commit-workflow/CommitWorkflowProjectSelect'
import { CommitWorkflowRunChoicesSummary } from '@/components/commit-workflow/CommitWorkflowRunChoicesSummary'
import { CommitWorkflowStepDetail } from '@/components/commit-workflow/CommitWorkflowStepDetail'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useCommitWorkflowStore } from '@/lib/commitWorkflow/commitWorkflowUtils'

const RUN_STATUSES: CommitWorkflowRunStatus[] = ['queued', 'running', 'completed', 'failed', 'cancelled', 'superseded']

const STEP_KIND_SHORT: Record<CommitWorkflowStepKind, string> = {
  'coding-rules': 'CR',
  spotbugs: 'SB',
  playwright: 'PW',
}

const STEP_KIND_CHIP: Record<CommitWorkflowStepKind, string> = {
  'coding-rules': 'border-cyan-500/35 bg-cyan-500/10 text-cyan-900 dark:text-cyan-200',
  spotbugs: 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  playwright: 'border-violet-500/35 bg-violet-500/10 text-violet-900 dark:text-violet-200',
}

const STEP_STATUS_CHIP: Record<CommitWorkflowStepStatus, string> = {
  pass: 'border-emerald-500/50 bg-emerald-500/15',
  fail: 'border-red-500/50 bg-red-500/15',
  error: 'border-red-500/50 bg-red-500/15',
  skipped: 'border-border bg-muted/50 opacity-70',
  running: 'border-blue-500/50 bg-blue-500/15 animate-pulse',
  pending: 'border-border/80 bg-background/80',
  not_run: 'border-border/60 bg-muted/30 opacity-60',
}

const STEP_STATUS_MARK: Record<CommitWorkflowStepStatus, string> = {
  pass: '✓',
  fail: '✗',
  error: '!',
  skipped: '−',
  running: '…',
  pending: '○',
  not_run: '—',
}

function isUserSkippedRun(run: CommitWorkflowRunRecord): boolean {
  const rc = run.contextSnapshot.runChoices
  if (!rc) return false
  const allOff = !rc.codingRules.enabled && !rc.spotbugs.enabled && !rc.playwright.enabled
  return allOff && run.steps.length > 0 && run.steps.every(s => s.status === 'skipped')
}

function CommitWorkflowStepChips({ steps }: { steps: CommitWorkflowStepRecord[] }) {
  const { t } = useTranslation()

  if (!steps.length) return <span className="text-xs text-muted-foreground">—</span>

  return (
    <div className="flex flex-wrap gap-1">
      {steps.map(step => {
        const kindLabel = t(`commitWorkflow.stepKind.${step.stepKind}`, { defaultValue: step.stepKind })
        const statusLabel = t(`commitWorkflow.stepStatus.${step.status}`, { defaultValue: step.status })
        return (
          <span
            key={step.id}
            title={`${kindLabel}: ${statusLabel}`}
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
              STEP_KIND_CHIP[step.stepKind],
              STEP_STATUS_CHIP[step.status]
            )}
          >
            <span className="font-semibold">{STEP_KIND_SHORT[step.stepKind]}</span>
            <span aria-hidden className="opacity-80">
              {STEP_STATUS_MARK[step.status]}
            </span>
          </span>
        )
      })}
    </div>
  )
}

export function CommitQualityContent() {
  const { t } = useTranslation()
  const [runs, setRuns] = useState<CommitWorkflowRunRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedStep, setSelectedStep] = useState<string | null>(null)
  const [userNames, setUserNames] = useState<Map<string, string>>(() => new Map())

  const load = useCallback(() => {
    setLoading(true)
    void window.api.commitWorkflow
      .listRuns({
        projectId: projectId.trim() || undefined,
        from: dateFrom.trim() || undefined,
        to: dateTo.trim() ? `${dateTo.trim()}T23:59:59` : undefined,
        status: statusFilter !== 'all' ? (statusFilter as CommitWorkflowRunStatus) : undefined,
        limit: 100,
      })
      .then(res => {
        if (res.status === 'success' && res.data) setRuns(res.data)
      })
      .finally(() => setLoading(false))
  }, [projectId, dateFrom, dateTo, statusFilter])

  useEffect(() => {
    void window.api.user.getUsers().then(res => {
      if (res.status !== 'success' || !Array.isArray(res.data)) return
      const map = new Map<string, string>()
      for (const user of res.data as { id: string; name?: string; userCode?: string }[]) {
        map.set(user.id, user.name?.trim() || user.userCode?.trim() || user.id)
      }
      setUserNames(map)
    })
  }, [])

  useEffect(() => {
    load()
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = window.api.commitWorkflow.onRunStream(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void load()
        timer = null
      }, 800)
    })
    return () => {
      off()
      if (timer) clearTimeout(timer)
    }
  }, [load])

  const selectedRun = useMemo(() => runs.find(r => r.id === selectedRunId) ?? null, [runs, selectedRunId])

  const authorLabel = useCallback(
    (userId: string) => {
      const name = userNames.get(userId)
      if (name) return name
      return userId.length > 10 ? `${userId.slice(0, 8)}…` : userId
    },
    [userNames]
  )

  const openAutomationRun = (testRunId: string) => {
    window.api.automation.openWindow?.()
    window.location.hash = `/automation?run=${testRunId}`
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <CommitWorkflowProjectSelect value={projectId} onChange={setProjectId} variant="leaderboard" id="cq-project" labelId="cq-project-label" />
        <div>
          <Label htmlFor="cq-date-from" className="text-xs text-muted-foreground">
            {t('commitWorkflow.filterDateFrom')}
          </Label>
          <Input id="cq-date-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1 w-40" />
        </div>
        <div>
          <Label htmlFor="cq-date-to" className="text-xs text-muted-foreground">
            {t('commitWorkflow.filterDateTo')}
          </Label>
          <Input id="cq-date-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1 w-40" />
        </div>
        <div>
          <Label htmlFor="cq-status" className="text-xs text-muted-foreground">
            {t('commitWorkflow.filterStatus')}
          </Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="cq-status" className="mt-1 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('commitWorkflow.filterStatusAll')}</SelectItem>
              {RUN_STATUSES.filter(s => s !== 'superseded').map(s => (
                <SelectItem key={s} value={s}>
                  {t(`commitWorkflow.runStatus.${s}`, { defaultValue: s })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={load} disabled={loading}>
          {t('common.refresh')}
        </Button>
      </div>
      <div className="grid min-h-[min(60vh,520px)] flex-1 gap-4 lg:grid-cols-2">
        <div className="min-h-0 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80">
              <tr className="border-b text-left text-xs">
                <th className="p-2">{t('commitWorkflow.colCommit')}</th>
                <th className="p-2">{t('commitWorkflow.colBranch')}</th>
                <th className="p-2">{t('commitWorkflow.colAuthor')}</th>
                <th className="p-2">{t('commitWorkflow.colStatus')}</th>
                <th className="p-2">{t('commitWorkflow.colSteps')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr
                  key={run.id}
                  className={cn('cursor-pointer border-b hover:bg-muted/40', selectedRunId === run.id && 'bg-muted/60')}
                  onClick={() => {
                    setSelectedRunId(run.id)
                    setSelectedStep(null)
                  }}
                >
                  <td className="p-2 font-mono text-xs">{run.commitHash.slice(0, 7)}</td>
                  <td className="p-2 text-xs">{run.contextSnapshot.branch ?? '—'}</td>
                  <td className="max-w-[8rem] truncate p-2 text-xs" title={authorLabel(run.userId)}>
                    {authorLabel(run.userId)}
                  </td>
                  <td className="p-2 text-xs">
                    {t(`commitWorkflow.runStatus.${run.status}`, { defaultValue: run.status })}
                    {isUserSkippedRun(run) ? (
                      <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                        {t('commitWorkflow.runChoices.allSkippedByUser')}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-2">
                    <CommitWorkflowStepChips steps={run.steps} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="min-h-0 overflow-auto rounded-lg border p-4">
          {!selectedRun ? (
            <p className="text-sm text-muted-foreground">{t('commitWorkflow.selectRunDetail')}</p>
          ) : (
            <>
              <h2 className="text-sm font-semibold">{selectedRun.commitHash.slice(0, 7)}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{selectedRun.contextSnapshot.commitMessage}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('commitWorkflow.colAuthor')}: {authorLabel(selectedRun.userId)}
              </p>
              <CommitWorkflowRunChoicesSummary runChoices={selectedRun.contextSnapshot.runChoices} className="mt-3 rounded-md border bg-muted/20 p-2" />
              <ul className="mt-3 space-y-2">
                {selectedRun.steps.map(s => (
                  <li key={s.id}>
                    <button type="button" className="w-full rounded border px-2 py-1.5 text-left text-xs hover:bg-muted/50" onClick={() => setSelectedStep(s.stepKey)}>
                      {t(`commitWorkflow.stepKind.${s.stepKind}`, { defaultValue: s.stepKind })} — {t(`commitWorkflow.stepStatus.${s.status}`, { defaultValue: s.status })}
                    </button>
                  </li>
                ))}
              </ul>
              {selectedStep ? (
                <CommitWorkflowStepDetail run={selectedRun} stepKey={selectedStep} onOpenAutomation={openAutomationRun} onClose={() => setSelectedStep(null)} />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function CommitQualityDialog() {
  const { t } = useTranslation()
  const open = useCommitWorkflowStore(s => s.qualityDialogOpen)
  const setQualityDialogOpen = useCommitWorkflowStore(s => s.setQualityDialogOpen)

  return (
    <Dialog open={open} onOpenChange={setQualityDialogOpen}>
      <DialogContent className="flex max-h-[min(92vh,900px)] w-[min(96vw,1400px)] max-w-none flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{t('commitWorkflow.openQualityDashboard')}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto p-6">{open ? <CommitQualityContent /> : null}</div>
      </DialogContent>
    </Dialog>
  )
}
