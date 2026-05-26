import { AlertCircle, Check, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TestCaseFailureLocation, TestCaseReportStep, TestCaseResult } from 'shared/automation/types'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

function formatStepDuration(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`
}

function fileBasename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(i + 1) : p
}

/** Giống cột phải HTML report: `— Test.spec.ts:4` */
function formatStepSourceRef(loc: TestCaseFailureLocation | undefined): string {
  if (!loc?.file) return ''
  const leaf = fileBasename(loc.file)
  return loc.line != null ? `— ${leaf}:${loc.line}` : `— ${leaf}`
}

function stepMatchesFilter(step: TestCaseReportStep, q: string): boolean {
  if (step.title.toLowerCase().includes(q)) return true
  if (step.category?.toLowerCase().includes(q)) return true
  if (step.errorSnippet?.toLowerCase().includes(q)) return true
  if (step.location?.file) {
    const base = fileBasename(step.location.file).toLowerCase()
    if (base.includes(q) || step.location.file.toLowerCase().includes(q)) return true
    if (step.location.line != null && String(step.location.line).includes(q)) return true
  }
  return false
}

/** Bỏ các dòng con khi parent (index trong mảng gốc) đang thu gọn. */
function rowsAfterNestedCollapse(
  steps: TestCaseReportStep[],
  collapsedParentIndices: ReadonlySet<number>,
): { step: TestCaseReportStep; sourceIndex: number }[] {
  const out: { step: TestCaseReportStep; sourceIndex: number }[] = []
  let i = 0
  while (i < steps.length) {
    const s = steps[i]
    out.push({ step: s, sourceIndex: i })
    if (s.hasNestedSteps && collapsedParentIndices.has(i)) {
      const closeDepth = s.depth
      i += 1
      while (i < steps.length && steps[i].depth > closeDepth) i += 1
    } else {
      i += 1
    }
  }
  return out
}

export interface RunCaseReportStepsPanelProps {
  caseResult: TestCaseResult
  /**
   * Khi true: không bọc card (border/bg), không lặp tiêu đề — dùng trong accordion Test steps / Failures.
   */
  compact?: boolean
}

/**
 * Filter + list bước Playwright — nhúng trong accordion; `compact` bỏ card lồng.
 */
export function RunCaseReportStepsPanel({ caseResult: r, compact }: RunCaseReportStepsPanelProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('')
  /** Index dòng gốc (`reportSteps`) đang thu gọn — ẩn mọi bước con depth lớn hơn cho tới khi gặp depth ≤ parent. */
  const [collapsedParents, setCollapsedParents] = useState<Set<number>>(() => new Set())
  const steps = r.reportSteps ?? []
  const q = filter.trim().toLowerCase()

  const toggleNested = useCallback((sourceIndex: number) => {
    setCollapsedParents(prev => {
      const next = new Set(prev)
      if (next.has(sourceIndex)) next.delete(sourceIndex)
      else next.add(sourceIndex)
      return next
    })
  }, [])

  const afterCollapse = useMemo(() => rowsAfterNestedCollapse(steps, collapsedParents), [steps, collapsedParents])

  const visibleRows = useMemo(() => {
    if (!q) return afterCollapse
    return afterCollapse.filter(({ step }) => stepMatchesFilter(step, q))
  }, [afterCollapse, q])

  if (!steps.length) return null

  return (
    <div className={cn(compact ? 'space-y-1.5' : 'rounded-md border border-border/50 bg-muted/10 px-2 py-1.5 dark:bg-muted/15')}>
      {!compact ? (
        <p className="mb-1.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
          {t('automation.runs.reportStepsHeading', { count: steps.length })}
        </p>
      ) : null}
      <div className={cn('relative', !compact && 'mb-1.5')}>
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder={t('automation.runs.reportStepsFilterPlaceholder')}
          className="h-7 border-border/60 bg-background/80 pl-7 text-[11px] placeholder:text-muted-foreground/70"
          aria-label={t('automation.runs.reportStepsFilterPlaceholder')}
        />
      </div>
      {visibleRows.length === 0 ? (
        <p className="py-2 text-center text-[10px] text-muted-foreground">{t('automation.runs.reportStepsNoMatches')}</p>
      ) : (
        <ul className="max-h-[min(22rem,55vh)] divide-y divide-border/40 overflow-y-auto [scrollbar-width:thin]">
          {visibleRows.map(({ step, sourceIndex }) => (
            <ReportStepRow
              key={`${sourceIndex}-${step.title}-${step.depth}`}
              step={step}
              nestedCollapsed={collapsedParents.has(sourceIndex)}
              onToggleNested={() => toggleNested(sourceIndex)}
              t={t}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function ReportStepRow({
  step,
  nestedCollapsed,
  onToggleNested,
  t,
}: {
  step: TestCaseReportStep
  nestedCollapsed: boolean
  onToggleNested: () => void
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  const pad = Math.min(step.depth, 12) * 10
  const failed = Boolean(step.failed)
  const refText = formatStepSourceRef(step.location)
  const refTitle = step.location?.file ?? undefined
  const hasNested = Boolean(step.hasNestedSteps)

  return (
    <li
      className={cn(
        'flex flex-wrap items-start gap-x-2 gap-y-1 py-1.5 pr-0.5 text-[11px] leading-snug',
        'sm:flex-nowrap sm:items-baseline',
      )}
      style={{ paddingLeft: `${4 + pad}px` }}
    >
      <div className="mt-0.5 flex w-4 shrink-0 justify-center sm:mt-0.5">
        {hasNested ? (
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground/70 outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-expanded={!nestedCollapsed}
            aria-label={nestedCollapsed ? t('automation.runs.reportStepsNestedExpand') : t('automation.runs.reportStepsNestedCollapse')}
            onClick={e => {
              e.stopPropagation()
              onToggleNested()
            }}
          >
            {nestedCollapsed ? (
              <ChevronRight className="size-3.5" aria-hidden />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden />
            )}
          </button>
        ) : null}
      </div>
      <div className="mt-0.5 shrink-0" aria-hidden>
        {failed ? (
          <AlertCircle className="size-3.5 text-destructive opacity-90" />
        ) : (
          <Check className="size-3.5 text-emerald-600 opacity-90 dark:text-emerald-400/95" />
        )}
      </div>
      <div className="min-w-0 flex-1 basis-[min(100%,100%)] sm:basis-0">
        <p className={cn('whitespace-pre-wrap break-words', failed ? 'font-medium text-destructive' : 'text-foreground/90')}>{step.title}</p>
        {step.errorSnippet ? (
          <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap break-words font-mono text-[10px] leading-snug text-destructive/95">{step.errorSnippet}</p>
        ) : null}
      </div>
      <div className="flex w-full shrink-0 flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5 pl-8 sm:ml-auto sm:w-auto sm:max-w-[min(14rem,42%)] sm:pl-0">
        {refText ? (
          <span
            className="truncate text-right font-mono text-[10px] text-muted-foreground/90 tabular-nums"
            title={refTitle}
          >
            {refText}
          </span>
        ) : null}
        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">{formatStepDuration(step.durationMs)}</span>
      </div>
    </li>
  )
}
