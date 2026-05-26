import { ChevronDown, Image as ImageIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { derivePlaywrightFailureDisplay, failureMessageNeedsRawPanel, stripAnsiForFailureDisplay } from 'shared/automation/playwrightFailureSummary'
import type { TestCaseFailureAssertionHints, TestCaseResult } from 'shared/automation/types'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { pathsToOpenForFailureStep, scanFailureHighlightPathsByIndex } from './runScreenshotGallery'
import { RunCaseReportStepsPanel } from './RunCaseReportSteps'

interface Props {
  caseResult: TestCaseResult
  /** Mở dialog xem ảnh (đúng failure-highlight-{N} theo từng dòng lỗi). */
  onOpenScreenshots: (paths: string[]) => void
}

function fileBasename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(i + 1) : p
}

function failureLabelDisplay(label: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const m = /^Failure (\d+)$/.exec(label.trim())
  if (m) return t('automation.runs.failureStepNumbered', { n: Number(m[1]) })
  return label
}

function HintBlock({ hints, t }: { hints: TestCaseFailureAssertionHints; t: (k: string, o?: Record<string, unknown>) => string }) {
  const rows: { key: 'locator' | 'expected' | 'received'; label: string; value: string }[] = []
  if (hints.locator?.trim()) rows.push({ key: 'locator', label: t('automation.runs.failureHintLocator'), value: hints.locator.trim() })
  if (hints.expected?.trim()) rows.push({ key: 'expected', label: t('automation.runs.failureHintExpected'), value: hints.expected.trim() })
  if (hints.received?.trim()) rows.push({ key: 'received', label: t('automation.runs.failureHintReceived'), value: hints.received.trim() })
  if (!rows.length) return null
  return (
    <dl className="mt-1 space-y-1 rounded border border-border/45 bg-muted/20 px-2 py-1.5">
      {rows.map(r => (
        <div key={r.key} className="grid grid-cols-[minmax(0,4.5rem)_1fr] gap-x-2 gap-y-0.5 text-[10px] leading-snug">
          <dt className="shrink-0 font-medium text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 break-words font-mono text-foreground/90" title={r.value}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function RunCaseFailureSteps({ caseResult, onOpenScreenshots }: Props) {
  const { t } = useTranslation()
  const hasReportSteps = Boolean(caseResult.reportSteps?.length)
  const [panelOpen, setPanelOpen] = useState(true)
  const highlightByIndex = useMemo(() => scanFailureHighlightPathsByIndex(caseResult), [caseResult])
  const steps = caseResult.failureSteps ?? []

  if (!steps.length) return null

  return (
    <Collapsible open={panelOpen} onOpenChange={setPanelOpen} className="mt-2">
      <div className="overflow-hidden rounded-md bg-destructive/[0.03] dark:bg-destructive/[0.06]">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-1 bg-destructive/[0.06] px-2 py-1 text-left',
              'dark:bg-destructive/10',
              'hover:bg-destructive/[0.1] dark:hover:bg-destructive/15',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            )}
            aria-expanded={panelOpen}
            aria-label={panelOpen ? t('automation.runs.failureDetailsCollapse') : t('automation.runs.failureDetailsExpand')}
          >
            <ChevronDown
              className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', !panelOpen && '-rotate-90')}
              aria-hidden
            />
            <span className="min-w-0 flex-1 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
              {t('automation.runs.failureStepsHeading', { count: steps.length })}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {hasReportSteps ? (
            <div className="border-b border-border/50 px-2 pb-2 pt-1.5">
              <RunCaseReportStepsPanel caseResult={caseResult} compact />
            </div>
          ) : null}
          <ul className="divide-y divide-border/60">
            {steps.map((step, i) => {
              const openPaths = pathsToOpenForFailureStep(step, caseResult, i, highlightByIndex)
              const clean = stripAnsiForFailureDisplay(step.message)
              const derived = derivePlaywrightFailureDisplay(step.message, undefined)
              const summary = (step.summary?.trim() || derived.summary || (clean.length > 200 ? `${clean.slice(0, 200)}…` : clean) || '').trim()
              const hints = step.assertionHints ?? derived.assertionHints
              const showRaw = failureMessageNeedsRawPanel(step.message, summary)
              const loc = step.location
              const ctx = step.errorContext?.trim()

              return (
                <li key={`${step.label}-${i}`} className="px-2 py-2">
                  <div className="flex gap-2">
                    <span className="w-5 shrink-0 pt-0.5 text-right text-[10px] tabular-nums text-muted-foreground" aria-hidden>
                      {i + 1}.
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[11px] font-semibold leading-tight text-foreground">{failureLabelDisplay(step.label, t)}</span>
                        {loc?.file ? (
                          <code className="max-w-full truncate rounded bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground" title={loc.file}>
                            {fileBasename(loc.file)}
                            {loc.line != null ? `:${loc.line}` : ''}
                          </code>
                        ) : null}
                      </div>
                      {summary ? (
                        <p className="whitespace-pre-wrap break-words text-[11px] font-medium leading-snug text-destructive">{summary}</p>
                      ) : (
                        <p className="text-[10px] italic text-muted-foreground">{t('automation.runs.failureStepNoMessage')}</p>
                      )}
                      {hints ? <HintBlock hints={hints} t={t} /> : null}
                      {ctx ? <p className="line-clamp-2 font-mono text-[10px] leading-snug text-muted-foreground">{stripAnsiForFailureDisplay(ctx)}</p> : null}
                      {showRaw ? (
                        <details className="pt-0.5">
                          <summary className={cn('cursor-pointer select-none text-[10px] font-medium text-muted-foreground', 'hover:text-foreground/90')}>
                            {t('automation.runs.failureStepFullLog')}
                          </summary>
                          <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded border border-border/50 bg-muted/25 p-2 text-[10px] leading-relaxed text-destructive">
                            {clean}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="size-8 shrink-0 self-start"
                      disabled={openPaths.length === 0}
                      title={t('automation.runs.failureStepScreenshot')}
                      aria-label={t('automation.runs.failureStepScreenshot')}
                      onClick={() => {
                        if (openPaths.length) onOpenScreenshots([...openPaths])
                      }}
                    >
                      <ImageIcon className="size-3.5" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

/** Wrapper: chỉ render khi có failureSteps từ API. */
export function RunCaseFailureStepsIfPresent(props: { result: TestCaseResult; onOpenScreenshots: (paths: string[]) => void }) {
  const steps = props.result.failureSteps
  if (!steps?.length) return null
  return <RunCaseFailureSteps caseResult={props.result} onOpenScreenshots={props.onOpenScreenshots} />
}
