import { formatDistanceToNow } from 'date-fns'
import { FolderOpen, Loader2, Play, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TestProject, TestRunSummary } from 'shared/automation/types'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { automationEmptyRuns, useAutomationStore } from '@/stores/useAutomationStore'
import { RunConsole } from './RunConsole'
import { RunDetail } from './RunDetail'
import { RunDialog } from './RunDialog'
import { runSummaryStatusBadgeAttrs } from './runSummaryStatusBadge'

function formatRunDuration(ms: number): string {
  if (ms <= 0) return ''
  const sec = ms / 1000
  if (sec < 60) return sec < 10 ? `${sec.toFixed(1)}s` : `${Math.round(sec)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m ${s}s`
}

interface Props {
  project: TestProject
}

function liveRunSummaryFromStream(project: TestProject, current: ReturnType<typeof useAutomationStore.getState>['current']): TestRunSummary | null {
  if (current.status !== 'running' || current.projectId !== project.id || !current.runId) return null
  const tally = current.tally
  return {
    id: current.runId,
    projectId: project.id,
    status: 'running',
    browsers: project.browsers,
    workers: 0,
    retries: 0,
    total: tally.total,
    passed: tally.passed,
    failed: tally.failed,
    skipped: tally.skipped,
    flaky: 0,
    durationMs: 0,
    startedAt: current.startedAt ?? undefined,
  }
}

export function RunsView({ project }: Props) {
  const { t } = useTranslation()
  const runs = useAutomationStore(s => s.runs[project.id] ?? automationEmptyRuns)
  const setRuns = useAutomationStore(s => s.setRuns)
  const clearRunHistoryForProject = useAutomationStore(s => s.clearRunHistoryForProject)
  const removeRunFromProjectHistory = useAutomationStore(s => s.removeRunFromProjectHistory)
  const current = useAutomationStore(s => s.current)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [deleteRunId, setDeleteRunId] = useState<string | null>(null)
  const [deleteRunOpen, setDeleteRunOpen] = useState(false)
  const [deletingRun, setDeletingRun] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const res = await window.api.automation.run.list({ projectId: project.id, limit: 50 })
      if (res.status === 'success' && res.data) {
        setRuns(project.id, res.data)
        if (!selectedId && res.data.length > 0) setSelectedId(res.data[0].id)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSelectedId(null)
    void refresh()
  }, [project.id])

  useEffect(() => {
    if (current.status === 'passed' || current.status === 'failed' || current.status === 'cancelled' || current.status === 'error') {
      void refresh()
    }
  }, [current.status])

  useEffect(() => {
    if (current.status === 'running' && current.projectId === project.id && current.runId) {
      setSelectedId(current.runId)
    }
  }, [current.status, current.projectId, current.runId, project.id])

  const historyRuns = useMemo(() => {
    const live = liveRunSummaryFromStream(project, current)
    if (!live) return runs
    return [live, ...runs.filter(r => r.id !== live.id)]
  }, [project, current, runs])

  const selectedRun = useMemo<TestRunSummary | null>(() => {
    if (!selectedId) return null
    return historyRuns.find(r => r.id === selectedId) ?? null
  }, [historyRuns, selectedId])

  const showLiveConsole = current.status === 'running' && current.projectId === project.id

  const confirmClearHistory = async () => {
    setClearingHistory(true)
    try {
      const res = await window.api.automation.run.clearHistory(project.id)
      if (res.status !== 'success') {
        toast.error(res.message === 'CLEAR_HISTORY_BUSY' ? t('automation.runs.clearHistoryBlocked') : (res.message ?? 'Clear history failed'))
        return
      }
      clearRunHistoryForProject(project.id)
      setSelectedId(null)
      setClearHistoryOpen(false)
      toast.success(t('automation.runs.clearHistorySuccess'))
    } finally {
      setClearingHistory(false)
    }
  }

  const confirmDeleteOneRun = async () => {
    if (!deleteRunId) return
    const runId = deleteRunId
    setDeletingRun(true)
    try {
      const res = await window.api.automation.run.deleteRun({ projectId: project.id, runId })
      if (res.status !== 'success') {
        toast.error(
          res.message === 'DELETE_RUN_BUSY'
            ? t('automation.runs.deleteRunBlocked')
            : res.message === 'RUN_NOT_FOUND'
              ? t('automation.runs.deleteRunNotFound')
              : (res.message ?? t('automation.runs.deleteRunFailed')),
        )
        return
      }
      removeRunFromProjectHistory(project.id, runId)
      setSelectedId(cur => {
        if (cur !== runId) return cur
        const nextRuns = useAutomationStore.getState().runs[project.id] ?? []
        const live = liveRunSummaryFromStream(project, useAutomationStore.getState().current)
        const list = !live ? nextRuns : [live, ...nextRuns.filter(r => r.id !== live.id)]
        return list[0]?.id ?? null
      })
      setDeleteRunOpen(false)
      setDeleteRunId(null)
      toast.success(t('automation.runs.deleteRunSuccess'))
    } finally {
      setDeletingRun(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('automation.runs.title')}</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            {t('automation.common.refresh')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void window.api.automation.run.openWorkspace(project.id)}>
            <FolderOpen className="size-4" />
            {t('automation.runs.openWorkspace')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)} disabled={showLiveConsole} className={cn(
            'border-emerald-600/55 text-emerald-700 hover:border-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-900',
            'dark:border-emerald-500/50 dark:text-emerald-400 dark:hover:border-emerald-400 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-200',
          )}>
            <Play className="size-4 shrink-0" />
            {t('automation.runs.start')}
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,280px)_1fr] gap-3">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-md bg-muted/10 shadow-sm dark:bg-muted/5">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-muted/85 px-2.5 py-2 dark:bg-muted/55">
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground/90">{t('automation.runs.history')}</span>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-destructive hover:bg-destructive/15 hover:text-destructive"
                  disabled={showLiveConsole || runs.length === 0 || clearingHistory}
                  onClick={() => setClearHistoryOpen(true)}
                  aria-label={t('automation.runs.clearHistory')}
                >
                  <Trash2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('automation.runs.clearHistory')}</TooltipContent>
            </Tooltip>
          </div>
          <ScrollArea className="min-h-0 flex-1 bg-muted/25 dark:bg-muted/15">
            <div className="flex flex-col gap-2 p-2">
              {historyRuns.length === 0 ? (
                <div className="rounded-md px-2 py-4 text-center text-xs text-muted-foreground">{t('automation.runs.empty')}</div>
              ) : (
                historyRuns.map(r => {
                  const badge = runSummaryStatusBadgeAttrs(r.status)
                  const shortId = r.id.slice(0, 8)
                  const active = selectedId === r.id
                  const startedWhen =
                    r.startedAt != null
                      ? formatDistanceToNow(new Date(r.startedAt), { addSuffix: true })
                      : null
                  const dur =
                    r.status === 'running' || r.status === 'queued'
                      ? t('automation.runs.historyCardInProgress')
                      : r.durationMs > 0
                        ? formatRunDuration(r.durationMs)
                        : null
                  const metaParts = [`${r.passed}/${r.total}`]
                  if (startedWhen) metaParts.push(startedWhen)
                  if (dur) metaParts.push(dur)
                  const rowIsActiveLive =
                    current.status === 'running' && current.projectId === project.id && current.runId === r.id
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        'group relative w-full rounded-lg text-xs transition-all',
                        active
                          ? 'bg-primary/14 shadow-md dark:bg-primary/22'
                          : 'bg-card/95 text-foreground/95 shadow-sm hover:bg-muted/70 dark:bg-muted/35 dark:hover:bg-muted/50',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        className={cn(
                          'flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left',
                          !rowIsActiveLive && 'pr-9',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              'min-w-0 truncate text-[10px] font-medium',
                              active ? 'text-white' : 'text-muted-foreground',
                            )}
                          >
                            {t('automation.runs.historyCardRun', { id: shortId })}
                          </span>
                          <Badge variant={badge.variant} className={cn('shrink-0 gap-1 text-[10px]', badge.className)}>
                            {r.status === 'running' ? <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden /> : null}
                            <span className="max-w-[5.5rem] truncate">{r.status}</span>
                          </Badge>
                        </div>
                        <p
                          className={cn(
                            'line-clamp-2 text-[10px] leading-snug',
                            active ? 'text-white/85' : 'text-muted-foreground',
                          )}
                        >
                          {metaParts.join(' · ')}
                        </p>
                      </button>
                      {!rowIsActiveLive ? (
                        <div className="pointer-events-none absolute right-0.5 top-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="pointer-events-auto size-7 shrink-0 text-destructive hover:bg-destructive/15 hover:text-destructive"
                                disabled={deletingRun}
                                onClick={() => {
                                  setDeleteRunId(r.id)
                                  setDeleteRunOpen(true)
                                }}
                                aria-label={t('automation.runs.deleteRun')}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left">{t('automation.runs.deleteRun')}</TooltipContent>
                          </Tooltip>
                        </div>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="min-h-0">
          {showLiveConsole ? (
            <RunConsole projectId={project.id} />
          ) : selectedRun ? (
            <RunDetail run={selectedRun} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-md border text-sm text-muted-foreground">
              {t('automation.runs.selectHint')}
            </div>
          )}
        </div>
      </div>

      <RunDialog
        project={project}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onStarted={() => {
          /* stream listener will populate */
        }}
      />

      <AlertDialog open={clearHistoryOpen} onOpenChange={setClearHistoryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('automation.runs.clearHistoryConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('automation.runs.clearHistoryConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingHistory}>{t('automation.common.cancel')}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={clearingHistory}
              onClick={() => void confirmClearHistory()}
            >
              {t('automation.runs.clearHistoryConfirmAction')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteRunOpen}
        onOpenChange={open => {
          setDeleteRunOpen(open)
          if (!open) setDeleteRunId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('automation.runs.deleteRunConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('automation.runs.deleteRunConfirmDescription', { id: deleteRunId ? deleteRunId.slice(0, 8) : '—' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingRun}>{t('automation.common.cancel')}</AlertDialogCancel>
            <Button variant="destructive" disabled={deletingRun} onClick={() => void confirmDeleteOneRun()}>
              {t('automation.runs.deleteRunConfirmAction')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
