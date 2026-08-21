'use client'

import { Bug, FileCode2, PlayCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CommitWorkflowRunChoices } from 'shared/commitWorkflow/runChoices'
import { cn } from '@/lib/utils'

type Props = {
  runChoices?: CommitWorkflowRunChoices | null
  className?: string
  variant?: 'list' | 'cards'
}

const STEP_META = {
  'coding-rules': { icon: FileCode2, tone: 'bg-cyan-500/10 text-cyan-900 dark:text-cyan-200' },
  spotbugs: { icon: Bug, tone: 'bg-amber-500/10 text-amber-900 dark:text-amber-200' },
  playwright: { icon: PlayCircle, tone: 'bg-violet-500/10 text-violet-900 dark:text-violet-200' },
} as const

export function CommitWorkflowRunChoicesSummary({ runChoices, className, variant = 'list' }: Props) {
  const { t } = useTranslation()
  if (!runChoices) return null

  const rows = [
    {
      key: 'coding-rules' as const,
      step: t('commitWorkflow.stepKind.coding-rules'),
      enabled: runChoices.codingRules.enabled,
      detail: runChoices.codingRules.enabled
        ? runChoices.codingRules.codingRuleName || runChoices.codingRules.codingRuleId || '—'
        : t('commitWorkflow.runChoices.skipped'),
    },
    {
      key: 'spotbugs' as const,
      step: t('commitWorkflow.stepKind.spotbugs'),
      enabled: runChoices.spotbugs.enabled,
      detail: runChoices.spotbugs.enabled ? t('commitWorkflow.runChoices.enabled') : t('commitWorkflow.runChoices.skipped'),
    },
    {
      key: 'playwright' as const,
      step: t('commitWorkflow.stepKind.playwright'),
      enabled: runChoices.playwright.enabled,
      detail: runChoices.playwright.enabled
        ? [runChoices.playwright.pageName || runChoices.playwright.catalogPageId, runChoices.playwright.flowName || runChoices.playwright.catalogFlowId]
            .filter(Boolean)
            .join(' → ') || '—'
        : t('commitWorkflow.runChoices.skipped'),
    },
  ]

  if (variant === 'cards') {
    return (
      <div className={className}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('commitWorkflow.runChoices.title')}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {rows.map(row => {
            const meta = STEP_META[row.key]
            const Icon = meta.icon
            return (
              <div
                key={row.key}
                className={cn(
                  'rounded-lg border px-2.5 py-2 transition-colors',
                  row.enabled ? 'border-border/70 bg-background/70 shadow-sm' : 'border-dashed border-border/50 bg-muted/15 opacity-80'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn('inline-flex rounded-md p-1', meta.tone)}>
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <span className={cn('text-xs font-medium', row.enabled ? 'text-foreground' : 'text-muted-foreground line-through')}>{row.step}</span>
                </div>
                <p className={cn('mt-1.5 text-[11px] leading-snug', row.enabled ? 'text-foreground/85' : 'text-muted-foreground')}>{row.detail}</p>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground">{t('commitWorkflow.runChoices.title')}</p>
      <ul className="mt-1.5 space-y-1 text-xs">
        {rows.map(row => (
          <li key={row.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={row.enabled ? 'text-foreground' : 'text-muted-foreground line-through'}>{row.step}</span>
            <span className="text-muted-foreground">—</span>
            <span className={row.enabled ? 'text-foreground' : 'text-muted-foreground'}>{row.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
