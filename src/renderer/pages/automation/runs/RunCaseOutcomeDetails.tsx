import { ChevronDown } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CaseResultStatus, TestCaseResult } from 'shared/automation/types'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { RunCaseReportStepsPanel } from './RunCaseReportSteps'

const OUTCOME_STATUSES: CaseResultStatus[] = ['passed', 'flaky', 'skipped']

function shouldShowOutcomeDetails(r: TestCaseResult): boolean {
  if (r.failureSteps?.length) return false
  return OUTCOME_STATUSES.includes(r.status)
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,5.5rem)_1fr] gap-x-2 gap-y-0.5 text-[10px] leading-snug sm:grid-cols-[minmax(0,6.5rem)_1fr]">
      <dt className="shrink-0 font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground/90">{children}</dd>
    </div>
  )
}

interface Props {
  caseResult: TestCaseResult
}

/** Collapsible giống failures: mở ra xem rõ test nào đã pass / skip / flaky. */
export function RunCaseOutcomeDetails({ caseResult: r }: Props) {
  const { t } = useTranslation()
  const hasReportSteps = Boolean(r.reportSteps?.length)
  const [open, setOpen] = useState(false)

  if (!shouldShowOutcomeDetails(r)) return null

  const nShots = r.screenshotPaths?.length ?? 0

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <div className="overflow-hidden rounded-md bg-muted/15 dark:bg-muted/25">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-1 px-2 py-1 text-left',
              'bg-muted/30 hover:bg-muted/45 dark:bg-muted/35 dark:hover:bg-muted/50',
            )}
            aria-expanded={open}
            aria-label={open ? t('automation.runs.caseDetailsCollapse') : t('automation.runs.caseDetailsExpand')}
          >
            <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', !open && '-rotate-90')} aria-hidden />
            <span className="min-w-0 flex-1 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
              {t('automation.runs.caseDetailsHeading')}
              {hasReportSteps && r.reportSteps ? (
                <span className="font-semibold tabular-nums text-muted-foreground/80"> · {r.reportSteps.length}</span>
              ) : null}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 border-t border-border/50 px-2 py-2">
            {r.status === 'flaky' ? <p className="text-[10px] leading-snug text-amber-700 dark:text-amber-400/95">{t('automation.runs.caseDetailFlakyNote')}</p> : null}
            {r.status === 'skipped' ? <p className="text-[10px] leading-snug text-muted-foreground">{t('automation.runs.caseDetailSkippedNote')}</p> : null}
            {hasReportSteps ? <RunCaseReportStepsPanel caseResult={r} compact /> : null}
            {r.caseCode?.trim() || nShots > 0 ? (
              <dl className="space-y-1.5">
                {r.caseCode?.trim() ? (
                  <DetailRow label={t('automation.runs.caseDetailLabelCaseCode')}>
                    <span className="font-mono">{r.caseCode.trim()}</span>
                  </DetailRow>
                ) : null}
                {nShots > 0 ? (
                  <DetailRow label={t('automation.runs.caseDetailLabelScreenshots')}>{t('automation.runs.caseDetailScreenshotsHint', { count: nShots })}</DetailRow>
                ) : null}
              </dl>
            ) : null}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export function RunCaseOutcomeDetailsIfPresent({ result }: { result: TestCaseResult }) {
  if (!shouldShowOutcomeDetails(result)) return null
  return <RunCaseOutcomeDetails caseResult={result} />
}
