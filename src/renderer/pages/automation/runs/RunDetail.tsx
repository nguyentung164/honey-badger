import { AlertCircle, ExternalLink, FileText, Image as ImageIcon, Sparkles, Video, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CaseResultStatus, TestCaseResult, TestRunSummary } from 'shared/automation/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { automationEmptyResults, useAutomationStore } from '@/stores/useAutomationStore'
import { AiRepairDialog } from './AiRepairDialog'
import { RunCaseFailureStepsIfPresent } from './RunCaseFailureSteps'
import { RunFailureScreenshotDialog } from './RunFailureScreenshotDialog'
import { allResultScreenshotGalleryPaths } from './runScreenshotGallery'

interface Props {
  run: TestRunSummary
}

function statusVariant(status: CaseResultStatus): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (status === 'passed') return 'default'
  if (status === 'failed' || status === 'timedOut' || status === 'interrupted') return 'destructive'
  if (status === 'flaky') return 'secondary'
  return 'outline'
}

function caseResultDisplayLabel(r: TestCaseResult, unknownLabel: string): string {
  const specLeaf = r.specFile?.split(/[/\\]/).filter(Boolean).pop()
  return (
    r.testTitle?.trim() ||
    r.caseCode?.trim() ||
    r.caseId?.trim() ||
    specLeaf?.trim() ||
    unknownLabel
  )
}

/** Strip ANSI / terminal escape sequences (e.g. Playwright colored stderr) for table display. */
function stripAnsiForDisplay(s: string): string {
  let t = s.replace(/\u001B\[[0-9;]*[A-Za-z]/g, '').replace(/\u001B\][\s\S]*?(?:\u001B\\|\u0007)/g, '')
  // ESC byte sometimes stripped before storage — clean "Error: [2m..." style fragments
  t = t.replace(/Error:\s*\[(?:\d+;)*\d+m/g, 'Error: ')
  return t
}

export function RunDetail({ run }: Props) {
  const { t } = useTranslation()
  const results = useAutomationStore(s => s.results[run.id] ?? automationEmptyResults)
  const setResults = useAutomationStore(s => s.setResults)
  const [loading, setLoading] = useState(false)
  const [repairTarget, setRepairTarget] = useState<string | null>(null)
  const [repairOpen, setRepairOpen] = useState(false)
  const [screenshotPreview, setScreenshotPreview] = useState<string[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void window.api.automation.run
      .results(run.id)
      .then(res => {
        if (cancelled) return
        if (res.status === 'success' && res.data) setResults(run.id, res.data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [run.id, setResults])

  const handleOpenTrace = async (r: TestCaseResult) => {
    if (!r.tracePath) {
      toast.info(t('automation.runs.noTrace'))
      return
    }
    const res = await window.api.automation.run.openTrace({
      tracePath: r.tracePath,
      projectId: run.projectId,
      runId: run.id,
    })
    if (res.status !== 'success') toast.error(res.message ?? 'Open trace failed')
    else toast.info(t('automation.runs.traceOpening'))
  }

  const handleOpenReport = async () => {
    const res = await window.api.automation.run.openReport(run.id)
    if (res.status !== 'success') toast.error(res.message ?? 'Open report failed')
  }

  const handleOpenVideo = async (r: TestCaseResult) => {
    if (!r.videoPath) {
      toast.info(t('automation.runs.noVideo'))
      return
    }
    const res = await window.api.automation.run.openVideo({
      videoPath: r.videoPath,
      projectId: run.projectId,
      runId: run.id,
    })
    if (res.status !== 'success') toast.error(res.message ?? 'Open video failed')
  }

  const handleRepair = (r: TestCaseResult) => {
    if (r.status === 'passed') {
      toast.info(t('automation.repair.notNeeded'))
      return
    }
    setRepairTarget(r.id)
    setRepairOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{t('automation.runs.fields.status')}</div>
            <Badge variant={run.status === 'passed' ? 'default' : run.status === 'failed' || run.status === 'error' ? 'destructive' : 'secondary'} className="capitalize">
              {run.status}
            </Badge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('automation.runs.fields.totals')}</div>
            <div className="font-mono text-sm">
              {run.passed}P / {run.failed}F / {run.skipped}S / {run.flaky}? / {run.total}T
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('automation.runs.fields.duration')}</div>
            <div className="font-mono text-sm">{(run.durationMs / 1000).toFixed(1)}s</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('automation.runs.fields.browsers')}</div>
            <div className="text-sm uppercase">{run.browsers.join(', ')}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleOpenReport} disabled={!run.reportPath}>
            <FileText className="size-4" />
            {t('automation.runs.openReport')}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-card">
        <Table
          className={cn(
            'w-full table-fixed border-collapse',
            '[&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border',
            '[&_th]:bg-muted/40'
          )}
        >
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">{t('automation.runs.columns.browser')}</TableHead>
              <TableHead className="min-w-0 whitespace-normal">{t('automation.runs.columns.case')}</TableHead>
              <TableHead className="w-28 text-center">{t('automation.runs.columns.status')}</TableHead>
              <TableHead className="w-28 whitespace-normal text-center leading-tight">{t('automation.runs.columns.attempts')}</TableHead>
              <TableHead className="w-24 text-center">{t('automation.runs.columns.duration')}</TableHead>
              <TableHead className="w-36 px-1 text-center">
                <span className="sr-only">{t('automation.runs.columns.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  {t('automation.common.loading')}
                </TableCell>
              </TableRow>
            ) : results.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="space-y-2 py-8 text-center text-sm text-muted-foreground">
                  {run.total > 0 ? (
                    <>
                      <div>{t('automation.runs.tallyOnlyHint')}</div>
                      <Button size="sm" variant="outline" onClick={handleOpenReport} disabled={!run.reportPath}>
                        {t('automation.runs.openReport')}
                      </Button>
                    </>
                  ) : (
                    t('automation.runs.noResults')
                  )}
                </TableCell>
              </TableRow>
            ) : (
              results.map(r => {
                const galleryPaths = allResultScreenshotGalleryPaths(r)
                return (
                <TableRow key={r.id}>
                  <TableCell className="align-top font-mono text-xs uppercase">{r.browser}</TableCell>
                  <TableCell className="min-w-0 whitespace-normal align-top">
                    <div className="space-y-1">
                      <div
                        className="line-clamp-2 break-words text-xs leading-snug"
                        title={caseResultDisplayLabel(r, t('automation.runs.unnamedCase'))}
                      >
                        {caseResultDisplayLabel(r, t('automation.runs.unnamedCase'))}
                      </div>
                      {r.specFile ? (
                        <div
                          className="truncate font-mono text-[10px] text-muted-foreground"
                          title={r.specFile}
                        >
                          {r.specFile}
                        </div>
                      ) : null}
                      {r.failureSteps?.length ? (
                        <RunCaseFailureStepsIfPresent
                          result={r}
                          onOpenScreenshots={paths => setScreenshotPreview([...paths])}
                        />
                      ) : r.errorMessage ? (
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'mt-0.5 flex w-full gap-2 rounded-md border border-destructive/20 bg-destructive/[0.06] px-2 py-1.5 text-left font-normal outline-none ring-destructive/15 transition-colors hover:bg-destructive/[0.09] focus-visible:ring-2 dark:bg-destructive/10 dark:hover:bg-destructive/15'
                              )}
                              aria-label={t('automation.runs.errorMessageFullHint')}
                            >
                              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive opacity-90" aria-hidden />
                              <span className="line-clamp-2 min-w-0 flex-1 break-words text-left font-mono text-[11px] leading-snug text-destructive">
                                {stripAnsiForDisplay(r.errorMessage)}
                              </span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="bottom"
                            align="start"
                            className="max-h-[min(24rem,70vh)] max-w-lg overflow-y-auto border border-border px-3 py-2 text-left font-mono text-[10px] leading-relaxed shadow-lg"
                            sideOffset={6}
                          >
                            <pre className="m-0 max-w-full whitespace-pre-wrap break-words text-[10px] text-popover-foreground">
                              {stripAnsiForDisplay(r.errorMessage)}
                            </pre>
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-center align-top">
                    <div className="flex justify-center">
                      <Badge variant={statusVariant(r.status)} className="capitalize">
                        {r.status}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="w-28 align-top text-center font-mono text-xs">{r.attempts}</TableCell>
                  <TableCell className="align-top text-center font-mono text-xs">{(r.durationMs / 1000).toFixed(2)}s</TableCell>
                  <TableCell className="w-36 px-1 align-top text-center">
                    <div className="flex justify-center gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        onClick={() => {
                          if (galleryPaths.length) setScreenshotPreview([...galleryPaths])
                        }}
                        disabled={!galleryPaths.length}
                        aria-label={t('automation.runs.previewScreenshot')}
                      >
                        <ImageIcon className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        onClick={() => void handleOpenVideo(r)}
                        disabled={!r.videoPath}
                        aria-label={t('automation.runs.openVideo')}
                      >
                        <Video className="size-4" />
                      </Button>
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <span
                            className="inline-flex shrink-0 rounded-md"
                            onClick={e => {
                              if (!r.tracePath) {
                                e.stopPropagation()
                                toast.info(t('automation.runs.noTrace'))
                              }
                            }}
                          >
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              onClick={() => void handleOpenTrace(r)}
                              disabled={!r.tracePath}
                              aria-label={t('automation.runs.openTrace')}
                            >
                              <ExternalLink className="size-4" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {r.tracePath ? t('automation.runs.openTrace') : t('automation.runs.noTrace')}
                        </TooltipContent>
                      </Tooltip>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        onClick={() => handleRepair(r)}
                        aria-label={t('automation.repair.title')}
                      >
                        {r.status === 'failed' || r.status === 'timedOut' ? (
                          <Wrench className="size-4 text-amber-600" />
                        ) : (
                          <Sparkles className="size-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AiRepairDialog caseResultId={repairTarget} open={repairOpen} onOpenChange={setRepairOpen} />
      <RunFailureScreenshotDialog
        open={!!screenshotPreview && screenshotPreview.length > 0}
        onOpenChange={v => {
          if (!v) setScreenshotPreview(null)
        }}
        projectId={run.projectId}
        runId={run.id}
        paths={screenshotPreview ?? []}
      />
    </div>
  )
}
