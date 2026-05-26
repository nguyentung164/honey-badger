import { AlertCircle, Clock, ExternalLink, FileText, Image as ImageIcon, Sparkles, Video, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TestCaseResult, TestRunSummary } from 'shared/automation/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { automationEmptyResults, useAutomationStore } from '@/stores/useAutomationStore'
import { AiRepairDialog } from './AiRepairDialog'
import { RunCaseFailureStepsIfPresent } from './RunCaseFailureSteps'
import { RunCaseOutcomeDetailsIfPresent } from './RunCaseOutcomeDetails'
import { RunFailureScreenshotDialog } from './RunFailureScreenshotDialog'
import { allResultScreenshotGalleryPaths } from './runScreenshotGallery'
import { caseResultStatusBadgeAttrs, runSummaryStatusBadgeAttrs } from './runSummaryStatusBadge'

interface Props {
  run: TestRunSummary
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
  const esc = '\x1b'
  let t = s
    .replace(new RegExp(`${esc}\\[[0-9;]*[A-Za-z]`, 'g'), '')
    .replace(new RegExp(`${esc}\\][\\s\\S]*?(?:${esc}\\\\|\x07)`, 'g'), '')
  // ESC byte sometimes stripped before storage — clean "Error: [2m..." style fragments
  t = t.replace(/Error:\s*\[(?:\d+;)*\d+m/g, 'Error: ')
  return t
}

function formatRunDuration(ms: number): string {
  if (ms <= 0) return ''
  const sec = ms / 1000
  if (sec < 60) return sec < 10 ? `${sec.toFixed(1)}s` : `${Math.round(sec)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m ${s}s`
}

function SummaryCount({
  value,
  label,
  valueClassName,
}: {
  value: number
  label: string
  valueClassName?: string
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-0.5 px-1.5 py-1 text-center sm:px-2">
      <span className={cn('text-sm font-semibold tabular-nums leading-none tracking-tight', valueClassName)}>{value}</span>
      <span className="line-clamp-2 w-full max-w-[5.5rem] text-center text-[10px] font-medium leading-tight text-muted-foreground sm:max-w-[6rem]">
        {label}
      </span>
    </div>
  )
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
    if (!r.tracePath) return
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
    if (!r.videoPath) return
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

  const durationLabel =
    run.status === 'running' || run.status === 'queued'
      ? t('automation.runs.historyCardInProgress')
      : run.durationMs > 0
        ? formatRunDuration(run.durationMs)
        : t('automation.runs.summaryDurationEmpty')

  const runBadge = runSummaryStatusBadgeAttrs(run.status)

  const openReportCtaClassName = cn(
    'gap-2 font-semibold shadow-md transition-[box-shadow,transform]',
    'bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white active:scale-[0.98]',
    'focus-visible:ring-2 focus-visible:ring-emerald-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:hover:text-white',
  )

  const summarySectionLabel =
    'block w-full text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'
  const summaryValueRow = 'flex min-h-12 w-full items-center justify-center'

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex w-full min-w-0 items-stretch overflow-hidden rounded-lg bg-card text-sm shadow-sm">
        <div className="flex min-w-0 flex-1 items-stretch divide-x divide-border/60 overflow-x-auto [scrollbar-width:thin]">
          <div className="flex w-[10rem] shrink-0 flex-col items-center gap-1.5 px-3 py-2.5">
            <span className={summarySectionLabel}>{t('automation.runs.fields.status')}</span>
            <div className={summaryValueRow}>
              <Badge variant={runBadge.variant} className={cn('h-6 w-fit shrink-0 px-2.5 text-xs capitalize', runBadge.className)}>
                {run.status}
              </Badge>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 px-2 py-2.5 sm:px-3">
            <span className={summarySectionLabel}>{t('automation.runs.fields.totals')}</span>
            <div
              className={cn(
                'flex min-h-12 w-full min-w-0 items-stretch divide-x divide-border/50 rounded-md bg-muted/20',
              )}
            >
              <SummaryCount
                value={run.passed}
                label={t('automation.runs.summaryPassed')}
                valueClassName="text-emerald-600 dark:text-emerald-400"
              />
              <SummaryCount value={run.failed} label={t('automation.runs.summaryFailed')} valueClassName="text-destructive" />
              <SummaryCount value={run.skipped} label={t('automation.runs.summarySkipped')} valueClassName="text-muted-foreground" />
              <SummaryCount
                value={run.flaky}
                label={t('automation.runs.summaryFlaky')}
                valueClassName="text-amber-600 dark:text-amber-400"
              />
              <SummaryCount value={run.total} label={t('automation.runs.summaryTotal')} valueClassName="text-foreground" />
            </div>
          </div>

          <div className="flex w-[10rem] shrink-0 flex-col items-center gap-1.5 px-3 py-2.5">
            <span className={summarySectionLabel}>{t('automation.runs.fields.duration')}</span>
            <div className={cn(summaryValueRow, 'gap-2')}>
              <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate text-sm font-semibold tabular-nums leading-none">{durationLabel}</span>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 px-3 py-2.5">
            <span className={summarySectionLabel}>{t('automation.runs.fields.browsers')}</span>
            <div className={cn(summaryValueRow, 'min-w-0 flex-wrap gap-1.5')}>
              {run.browsers?.length ? (
                run.browsers.map(b => (
                  <Badge
                    key={b}
                    variant="outline"
                    className="h-6 max-w-[7.5rem] shrink-0 truncate border-border/70 bg-muted/30 px-2 text-xs font-medium capitalize"
                    title={b}
                  >
                    {b}
                  </Badge>
                ))
              ) : (
                <span className="text-sm font-semibold tabular-nums text-muted-foreground">{t('automation.runs.summaryDurationEmpty')}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center border-l border-border/60 bg-gradient-to-l from-emerald-500/[0.07] to-card px-2 py-2 sm:px-3 dark:from-emerald-500/10">
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="default"
                variant="default"
                className={cn('h-9 shrink-0 px-3.5 text-sm sm:px-4', openReportCtaClassName)}
                title={t('automation.runs.openReport')}
                onClick={handleOpenReport}
                disabled={!run.reportPath}
              >
                <FileText className="size-4 shrink-0" aria-hidden />
                <ExternalLink className="size-3.5 shrink-0 opacity-90" aria-hidden />
                <span className="hidden sm:inline">{t('automation.runs.openReport')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {t('automation.runs.openReport')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
        <Table
          wrapperClassName="relative min-h-0 flex-1 overflow-auto"
          className={cn(
            'table-auto border-collapse',
            '[&_th:not(:first-child)]:border-l [&_th:not(:first-child)]:border-border',
            '[&_td:not(:first-child)]:border-l [&_td:not(:first-child)]:border-border'
          )}
        >
          <TableHeader sticky>
            <TableRow>
              <TableHead className="h-9 w-24 shrink-0">{t('automation.runs.columns.browser')}</TableHead>
              <TableHead className="h-9 min-w-0 whitespace-normal">{t('automation.runs.columns.case')}</TableHead>
              <TableHead className="h-9 w-28 shrink-0 text-center">{t('automation.runs.columns.status')}</TableHead>
              <TableHead className="h-9 w-28 shrink-0 whitespace-normal text-center leading-tight">{t('automation.runs.columns.attempts')}</TableHead>
              <TableHead className="h-9 w-24 shrink-0 text-center">{t('automation.runs.columns.duration')}</TableHead>
              <TableHead className="h-9 w-36 shrink-0 px-1 text-center">
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
                      <Button
                        size="default"
                        variant="default"
                        className={cn('mx-auto h-9 px-4 text-sm', openReportCtaClassName)}
                        onClick={handleOpenReport}
                        disabled={!run.reportPath}
                      >
                        <FileText className="size-4 shrink-0" aria-hidden />
                        <ExternalLink className="size-3.5 shrink-0 opacity-90" aria-hidden />
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
                const caseBadge = caseResultStatusBadgeAttrs(r.status)
                return (
                  <TableRow key={r.id}>
                    <TableCell className="align-top text-xs uppercase">{r.browser}</TableCell>
                    <TableCell className="min-w-0 whitespace-normal align-top">
                      <div className="space-y-1">
                        <div
                          className="flex min-w-0 flex-nowrap items-baseline gap-1.5 text-xs leading-snug"
                          title={
                            r.specFile
                              ? `${caseResultDisplayLabel(r, t('automation.runs.unnamedCase'))} · ${r.specFile}`
                              : caseResultDisplayLabel(r, t('automation.runs.unnamedCase'))
                          }
                        >
                          <span className="min-w-0 flex-1 truncate break-words font-medium">
                            {caseResultDisplayLabel(r, t('automation.runs.unnamedCase'))}
                          </span>
                          {r.specFile ? (
                            <>
                              <span className="shrink-0 text-[10px] text-muted-foreground/60" aria-hidden>
                                ·
                              </span>
                              <span
                                className="max-w-[min(12rem,42%)] shrink-0 truncate text-[11px] text-muted-foreground"
                                title={r.specFile}
                              >
                                {r.specFile}
                              </span>
                            </>
                          ) : null}
                        </div>
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
                                <span className="line-clamp-2 min-w-0 flex-1 break-words text-left text-[11px] leading-snug text-destructive">
                                  {stripAnsiForDisplay(r.errorMessage)}
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="bottom"
                              align="start"
                              className="max-h-[min(24rem,70vh)] max-w-lg overflow-y-auto border border-border px-3 py-2 text-left text-[10px] leading-relaxed shadow-lg"
                              sideOffset={6}
                            >
                              <pre className="m-0 max-w-full whitespace-pre-wrap break-words text-[10px] text-popover-foreground">
                                {stripAnsiForDisplay(r.errorMessage)}
                              </pre>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <RunCaseOutcomeDetailsIfPresent result={r} />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center align-top">
                      <div className="flex justify-center">
                        <Badge variant={caseBadge.variant} className={caseBadge.className}>
                          {r.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="w-28 align-top text-center text-xs">{r.attempts}</TableCell>
                    <TableCell className="align-top text-center text-xs">{(r.durationMs / 1000).toFixed(2)}s</TableCell>
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
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <span className="inline-flex shrink-0 rounded-md">
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
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-left text-xs leading-snug">
                            {r.videoPath ? t('automation.runs.openVideo') : t('automation.runs.noVideoHint')}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <span className="inline-flex shrink-0 rounded-md">
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
                          <TooltipContent side="top" className="max-w-xs text-left text-xs leading-snug">
                            {r.tracePath ? t('automation.runs.openTrace') : t('automation.runs.noTraceHint')}
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
