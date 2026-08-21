'use client'

import { format } from 'date-fns'
import { Bug, ChevronDown, FileCode2, GitBranch, PlayCircle, User } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'
import type {
  CommitWorkflowRunRecord,
  CommitWorkflowRunStatus,
  CommitWorkflowStepKind,
  CommitWorkflowStepRecord,
  CommitWorkflowStepStatus,
} from 'shared/commitWorkflow/types'
import { CommitHashLink } from '@/components/commit-workflow/CommitHashLink'
import { CommitWorkflowProjectSelect } from '@/components/commit-workflow/CommitWorkflowProjectSelect'
import { CommitWorkflowRunChoicesSummary } from '@/components/commit-workflow/CommitWorkflowRunChoicesSummary'
import { CommitWorkflowStepDetail } from '@/components/commit-workflow/CommitWorkflowStepDetail'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DateRangePickerPopover } from '@/components/ui-elements/DateRangePickerPopover'
import { buildGitCommitWebUrl, resolveOriginRemoteUrl } from '@/lib/gitCommitWebUrl'
import { cn } from '@/lib/utils'
import { formatRunStatusLabel, formatStepSummaryPreview, useCommitWorkflowStore } from '@/lib/commitWorkflow/commitWorkflowUtils'

const RUN_STATUSES: CommitWorkflowRunStatus[] = ['queued', 'running', 'completed', 'failed', 'cancelled', 'superseded']

const STEP_KIND_SHORT: Record<CommitWorkflowStepKind, string> = {
  'coding-rules': 'CR',
  spotbugs: 'SB',
  playwright: 'PW',
}

const STEP_KIND_CHIP: Record<CommitWorkflowStepKind, string> = {
  'coding-rules': 'bg-cyan-500/10 text-cyan-900 dark:text-cyan-200',
  spotbugs: 'bg-amber-500/10 text-amber-900 dark:text-amber-200',
  playwright: 'bg-violet-500/10 text-violet-900 dark:text-violet-200',
}

const STEP_KIND_ICON: Record<CommitWorkflowStepKind, typeof FileCode2> = {
  'coding-rules': FileCode2,
  spotbugs: Bug,
  playwright: PlayCircle,
}

const STEP_STATUS_CHIP: Record<CommitWorkflowStepStatus, string> = {
  pass: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  fail: 'bg-red-500/15 text-red-800 dark:text-red-200',
  error: 'bg-red-500/15 text-red-800 dark:text-red-200',
  skipped: 'bg-muted/50 text-muted-foreground',
  running: 'bg-blue-500/15 text-blue-800 dark:text-blue-200 animate-pulse',
  pending: 'bg-background/80 text-muted-foreground',
  not_run: 'bg-muted/30 text-muted-foreground',
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

const RUN_STATUS_CHIP: Record<CommitWorkflowRunStatus, string> = {
  queued: 'bg-muted/50 text-muted-foreground',
  running: 'bg-blue-500/10 text-blue-800 dark:text-blue-200',
  completed: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  failed: 'bg-red-500/10 text-red-800 dark:text-red-200',
  cancelled: 'bg-muted/40 text-muted-foreground',
  superseded: 'bg-muted/30 text-muted-foreground',
}

function parseCommitMessage(message: string): { subject: string; body: string | null } {
  const normalized = message.replace(/\r\n/g, '\n').trim()
  if (!normalized) return { subject: '—', body: null }
  const newlineIndex = normalized.indexOf('\n')
  if (newlineIndex === -1) return { subject: normalized, body: null }
  const subject = normalized.slice(0, newlineIndex).trim() || '—'
  const body = normalized.slice(newlineIndex + 1).trim()
  return { subject, body: body || null }
}

function CommitMessageDisplay({ message }: { message: string }) {
  const { subject, body } = useMemo(() => parseCommitMessage(message), [message])

  return (
    <div className="rounded-md bg-muted/35 px-3 py-2.5 dark:bg-muted/20">
      <p className="text-sm font-medium leading-snug text-foreground">{subject}</p>
      {body ? <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{body}</p> : null}
    </div>
  )
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
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
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

function useRepoRemoteUrlCache(runs: CommitWorkflowRunRecord[]) {
  const [cache, setCache] = useState<Map<string, string | null>>(() => new Map())
  const pendingRef = useRef<Set<string>>(new Set())

  const fetchRemoteUrl = useCallback(async (repoPath: string): Promise<string | null> => {
    const cached = cache.get(repoPath)
    if (cached !== undefined) return cached

    const res = await window.api.git.get_remotes(repoPath)
    const remoteUrl = res.status === 'success' ? resolveOriginRemoteUrl(res.data) : null
    setCache(prev => {
      const next = new Map(prev)
      next.set(repoPath, remoteUrl)
      return next
    })
    return remoteUrl
  }, [cache])

  useEffect(() => {
    const repoPaths = [...new Set(runs.map(r => r.repoPath).filter(Boolean))]
    for (const repoPath of repoPaths) {
      if (pendingRef.current.has(repoPath) || cache.has(repoPath)) continue
      pendingRef.current.add(repoPath)
      void fetchRemoteUrl(repoPath)
    }
  }, [runs, cache, fetchRemoteUrl])

  const getCommitWebUrl = useCallback(
    (run: Pick<CommitWorkflowRunRecord, 'repoPath' | 'commitHash'>) => {
      const remoteUrl = cache.get(run.repoPath)
      if (remoteUrl === undefined) return null
      return buildGitCommitWebUrl(remoteUrl, run.commitHash)
    },
    [cache]
  )

  const openCommitInBrowser = useCallback(
    async (run: Pick<CommitWorkflowRunRecord, 'repoPath' | 'commitHash'>) => {
      if (!run.repoPath?.trim() || !run.commitHash?.trim()) return
      let webUrl = getCommitWebUrl(run)
      if (!webUrl) {
        const remoteUrl = await fetchRemoteUrl(run.repoPath)
        webUrl = buildGitCommitWebUrl(remoteUrl, run.commitHash)
      }
      if (webUrl) void window.api.system.open_external_url(webUrl)
    },
    [fetchRemoteUrl, getCommitWebUrl]
  )

  return { getCommitWebUrl, openCommitInBrowser }
}

export function CommitQualityContent() {
  const { t } = useTranslation()
  const [runs, setRuns] = useState<CommitWorkflowRunRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedStep, setSelectedStep] = useState<string | null>(null)
  const [userNames, setUserNames] = useState<Map<string, string>>(() => new Map())

  const dateFrom = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : ''
  const dateTo = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : ''

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
    setSelectedRunId(null)
    setSelectedStep(null)
  }, [projectId])

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
  const { getCommitWebUrl, openCommitInBrowser } = useRepoRemoteUrlCache(runs)

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
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-end gap-3">
        <CommitWorkflowProjectSelect
          value={projectId}
          onChange={setProjectId}
          variant="leaderboard"
          allowAll
          id="cq-project"
          labelId="cq-project-label"
        />
        <div>
          <Label className="text-xs text-muted-foreground">{t('commitWorkflow.filterDateRange')}</Label>
          <div className="mt-1">
            <DateRangePickerPopover
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              allTimeLabel={t('commitWorkflow.filterDateRangeAll')}
              confirmLabel={t('common.confirm')}
              triggerClassName="h-9 w-56 justify-start"
            />
          </div>
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
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border">
          <div className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
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
                    <td className="p-2 text-xs">
                      <CommitHashLink hash={run.commitHash} webUrl={getCommitWebUrl(run)} onOpen={() => openCommitInBrowser(run)} />
                    </td>
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
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border">
          {!selectedRun ? (
            <div className="flex h-full items-center justify-center p-6">
              <p className="text-sm text-muted-foreground">{t('commitWorkflow.selectRunDetail')}</p>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b bg-muted/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <CommitHashLink
                      hash={selectedRun.commitHash}
                      webUrl={getCommitWebUrl(selectedRun)}
                      onOpen={() => openCommitInBrowser(selectedRun)}
                      className="text-base font-semibold"
                    />
                    <CommitMessageDisplay message={selectedRun.contextSnapshot.commitMessage} />
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium',
                      RUN_STATUS_CHIP[selectedRun.status]
                    )}
                  >
                    {formatRunStatusLabel(selectedRun.status, t)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <User className="size-3.5 shrink-0" aria-hidden />
                    <span>{authorLabel(selectedRun.userId)}</span>
                  </span>
                  {selectedRun.contextSnapshot.branch ? (
                    <span className="inline-flex items-center gap-1.5">
                      <GitBranch className="size-3.5 shrink-0" aria-hidden />
                      <span>{selectedRun.contextSnapshot.branch}</span>
                    </span>
                  ) : null}
                </div>
                <CommitWorkflowRunChoicesSummary
                  runChoices={selectedRun.contextSnapshot.runChoices}
                  variant="cards"
                  className="mt-4 rounded-lg border border-border/60 bg-background/50 p-3"
                />
              </div>
              <div className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('commitWorkflow.stepsSection')}</p>
                <ul className="space-y-2">
                  {selectedRun.steps.map(s => {
                    const StepIcon = STEP_KIND_ICON[s.stepKind]
                    const open = selectedStep === s.stepKey
                    return (
                      <li key={s.id}>
                        <Collapsible open={open} onOpenChange={next => setSelectedStep(next ? s.stepKey : null)}>
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'w-full rounded-lg border px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/40',
                                open ? 'border-primary/40 bg-muted/30 shadow-sm' : 'border-border/70 bg-background/40'
                              )}
                            >
                              <div className="flex items-start gap-2.5">
                                <span className={cn('mt-0.5 inline-flex rounded-md p-1.5', STEP_KIND_CHIP[s.stepKind])}>
                                  <StepIcon className="size-3.5" aria-hidden />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <span className="font-medium text-foreground">{t(`commitWorkflow.stepKind.${s.stepKind}`, { defaultValue: s.stepKind })}</span>
                                      <span
                                        className={cn(
                                          'ml-2 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                          STEP_STATUS_CHIP[s.status]
                                        )}
                                      >
                                        {t(`commitWorkflow.stepStatus.${s.status}`, { defaultValue: s.status })}
                                      </span>
                                    </div>
                                    <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
                                  </div>
                                  <p className="mt-1 text-[11px] text-muted-foreground">{formatStepSummaryPreview(s, t)}</p>
                                </div>
                              </div>
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-1 overflow-hidden rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 data-[state=closed]:animate-none data-[state=open]:animate-none">
                            <CommitWorkflowStepDetail
                              run={selectedRun}
                              stepKey={s.stepKey}
                              onOpenAutomation={openAutomationRun}
                              embedded
                              showRunChoices={false}
                            />
                          </CollapsibleContent>
                        </Collapsible>
                      </li>
                    )
                  })}
                </ul>
              </div>
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
      <DialogContent className="flex h-[80vh] max-h-[80vh]! min-w-[90vw]! flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{t('commitWorkflow.openQualityDashboard')}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">{open ? <CommitQualityContent /> : null}</div>
      </DialogContent>
    </Dialog>
  )
}
