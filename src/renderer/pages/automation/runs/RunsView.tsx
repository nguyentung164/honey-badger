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
import { automationEmptyRuns, useAutomationStore } from '@/stores/useAutomationStore'
import { RunConsole } from './RunConsole'
import { RunDetail } from './RunDetail'
import { RunDialog } from './RunDialog'

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
  const current = useAutomationStore(s => s.current)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)

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
          <Button size="sm" onClick={() => setDialogOpen(true)} disabled={showLiveConsole}>
            <Play className="size-4" />
            {t('automation.runs.start')}
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] gap-3">
        <div className="flex min-h-0 flex-col rounded-md border">
          <div className="flex items-center justify-between gap-2 border-b p-2">
            <span className="text-xs font-medium uppercase text-muted-foreground">{t('automation.runs.history')}</span>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-1 p-1">
              {historyRuns.length === 0 ? (
                <div className="p-3 text-center text-xs text-muted-foreground">{t('automation.runs.empty')}</div>
              ) : (
                historyRuns.map(r => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`flex flex-col gap-1 rounded-md border p-2 text-left transition-colors ${
                      selectedId === r.id ? 'border-primary bg-accent' : 'border-transparent hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant={r.status === 'passed' ? 'default' : r.status === 'failed' || r.status === 'error' ? 'destructive' : 'secondary'}
                        className="inline-flex max-w-full items-center gap-1 capitalize"
                      >
                        {r.status === 'running' ? <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden /> : null}
                        <span className="truncate">{r.status}</span>
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {r.passed}/{r.total}
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {r.startedAt ? formatDistanceToNow(new Date(r.startedAt), { addSuffix: true }) : ''}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {r.browsers.join(', ')}
                    </div>
                  </button>
                ))
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
    </div>
  )
}
