import { ChevronDown, ChevronRight, Image as ImageIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TestCaseResult } from 'shared/automation/types'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { pathsToOpenForFailureStep, scanFailureHighlightPathsByIndex } from './runScreenshotGallery'

interface Props {
  caseResult: TestCaseResult
  /** Mở dialog xem ảnh (đúng failure-highlight-{N} theo từng dòng lỗi). */
  onOpenScreenshots: (paths: string[]) => void
}

function stripAnsiForDisplay(s: string): string {
  let t = s.replace(/\u001B\[[0-9;]*[A-Za-z]/g, '').replace(/\u001B\][\s\S]*?(?:\u001B\\|\u0007)/g, '')
  t = t.replace(/Error:\s*\[(?:\d+;)*\d+m/g, 'Error: ')
  return t
}

function failureLabelDisplay(label: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const m = /^Failure (\d+)$/.exec(label.trim())
  if (m) return t('automation.runs.failureStepNumbered', { n: Number(m[1]) })
  return label
}

export function RunCaseFailureSteps({ caseResult, onOpenScreenshots }: Props) {
  const { t } = useTranslation()
  const [detailsOpen, setDetailsOpen] = useState(true)
  const highlightByIndex = useMemo(() => scanFailureHighlightPathsByIndex(caseResult), [caseResult])
  const steps = caseResult.failureSteps ?? []

  if (!steps.length) return null

  return (
    <div className="mt-2 space-y-1.5 rounded-md border border-destructive/15 bg-destructive/[0.04] p-2 dark:bg-destructive/5">
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <div className="flex items-center gap-1 px-0.5">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
              aria-expanded={detailsOpen}
              aria-label={detailsOpen ? t('automation.runs.failureDetailsCollapse') : t('automation.runs.failureDetailsExpand')}
            >
              {detailsOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
            </Button>
          </CollapsibleTrigger>
          <span className="min-w-0 flex-1 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
            {t('automation.runs.failureStepsHeading', { count: steps.length })}
          </span>
        </div>
        <CollapsibleContent className="space-y-1.5 pt-1.5">
          {steps.map((step, i) => {
            const openPaths = pathsToOpenForFailureStep(step, caseResult, i, highlightByIndex)
            return (
              <Collapsible key={`${step.label}-${i}`} defaultOpen={i === 0}>
                <CollapsibleTrigger
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md border border-border/50 bg-background/80 px-2 py-1.5 text-left text-[11px] font-medium text-foreground shadow-sm hover:bg-muted/60'
                  )}
                >
                  <span className="min-w-0 truncate">{failureLabelDisplay(step.label, t)}</span>
                  <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 border-t border-border/60 bg-background/60 px-2 py-2">
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded border border-border/40 bg-muted/20 p-2 font-mono text-[10px] leading-relaxed text-destructive">
                    {stripAnsiForDisplay(step.message)}
                  </pre>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-[10px]"
                      disabled={openPaths.length === 0}
                      onClick={() => {
                        if (openPaths.length) onOpenScreenshots([...openPaths])
                      }}
                    >
                      <ImageIcon className="size-3" />
                      {t('automation.runs.failureStepScreenshot')}
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )
          })}
          <p className="px-0.5 text-[9px] leading-snug text-muted-foreground">{t('automation.runs.failureStepsMediaHint')}</p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

/** Wrapper: chỉ render khi có failureSteps từ API. */
export function RunCaseFailureStepsIfPresent(props: {
  result: TestCaseResult
  onOpenScreenshots: (paths: string[]) => void
}) {
  const steps = props.result.failureSteps
  if (!steps?.length) return null
  return <RunCaseFailureSteps caseResult={props.result} onOpenScreenshots={props.onOpenScreenshots} />
}
