'use client'

import { formatDistanceToNow } from 'date-fns'
import type { TFunction } from 'i18next'
import { ChevronDown } from 'lucide-react'
import { memo, useState } from 'react'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { getDateFnsLocale } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import type { PrCheckpointTemplate } from '../hooks/usePrData'
import type { PrGhStatusKind } from '../prGhStatus'
import { PR_GH_STATUS_IDS, PR_GH_STATUS_TEXT_CLASS } from '../prGhStatus'
import { baseBranchInsightKey, githubCommitUrl, type BaseBranchInsightDto } from '../repoBaseBranchInsights'
import { openUrlInDefaultBrowser } from './prBoardTableConstants'

const PR_GH_FILTER_STYLE: Record<PrGhStatusKind, { label: string }> = {
  open: { label: PR_GH_STATUS_TEXT_CLASS.open },
  draft: { label: PR_GH_STATUS_TEXT_CLASS.draft },
  merged: { label: PR_GH_STATUS_TEXT_CLASS.merged },
  closed: { label: PR_GH_STATUS_TEXT_CLASS.closed },
}

type PrBoardRepoColumnPrGroupsProps = {
  templates: PrCheckpointTemplate[]
  insights: Record<string, BaseBranchInsightDto> | undefined
  prByTpl: Record<string, Record<PrGhStatusKind, number>> | undefined
  owner: string
  repo: string
  loading: boolean
  dateLoc: ReturnType<typeof getDateFnsLocale>
  t: TFunction
}

export const PrBoardRepoColumnPrGroups = memo(function PrBoardRepoColumnPrGroups({
  templates,
  insights,
  prByTpl,
  owner,
  repo,
  loading,
  dateLoc,
  t,
}: PrBoardRepoColumnPrGroupsProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const prTemplates = templates.filter(tpl => tpl.code.toLowerCase().startsWith('pr_'))
  const groups = prTemplates
    .map(tpl => {
      const col = prByTpl?.[tpl.id]
      const trackedTotal = col ? PR_GH_STATUS_IDS.reduce((s, id) => s + col[id], 0) : 0
      const base = (tpl.targetBranch ?? '').trim()
      const insight = base ? insights?.[baseBranchInsightKey(base)] : undefined
      if (!base && trackedTotal === 0) return null
      return { tpl, col, trackedTotal, base, insight }
    })
    .filter(Boolean) as Array<{
    tpl: PrCheckpointTemplate
    col: Record<PrGhStatusKind, number> | undefined
    trackedTotal: number
    base: string
    insight: BaseBranchInsightDto | undefined
  }>

  if (!groups.length) return null

  const collapsedHint = groups.map(g => g.tpl.label || g.base).join(', ')

  return (
    <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="border-t border-border/40 pt-1">
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-1 rounded-sm py-0.5 text-left text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-expanded={detailsOpen}
        onClick={e => {
          e.stopPropagation()
          setDetailsOpen(v => !v)
        }}
      >
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-out', detailsOpen && '-rotate-180')}
          aria-hidden
        />
        <span className="shrink-0">{detailsOpen ? t('prManager.board.repoPrDetailsCollapse') : t('prManager.board.repoPrDetailsExpand')}</span>
        {!detailsOpen && collapsedHint ? (
          <span className="min-w-0 truncate font-normal opacity-80" title={collapsedHint}>
            ({collapsedHint})
          </span>
        ) : null}
      </button>
      <CollapsibleContent
        className={cn(
          'overflow-hidden text-[10px] leading-snug',
          'data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:animate-none'
        )}
      >
        <div className="flex flex-col gap-1 pt-1">
          {groups.map(({ tpl, col, trackedTotal, base, insight }) => {
            const label = tpl.label || base || tpl.code
            const commitRel =
              insight?.tipCommitAt != null
                ? formatDistanceToNow(new Date(insight.tipCommitAt), { addSuffix: true, locale: dateLoc })
                : loading && base
                  ? '…'
                  : base
                    ? '—'
                    : null
            const commitUrl = insight?.tipCommitSha && owner && repo ? githubCommitUrl(owner, repo, insight.tipCommitSha) : ''
            const mergeRel = insight?.lastMergedPr
              ? formatDistanceToNow(new Date(insight.lastMergedPr.mergedAt), { addSuffix: true, locale: dateLoc })
              : loading && base
                ? '…'
                : base
                  ? '—'
                  : null
            const mergeTitle = insight?.lastMergedPr?.title?.trim() || undefined
            const mergePrUrl = insight?.lastMergedPr?.htmlUrl ?? ''
            const dot = <span className="px-0.5 opacity-45">·</span>

            return (
              <div key={tpl.id} className="min-w-0 space-y-0.5 rounded-md border border-border/35 bg-muted/25 px-1.5 py-1 dark:bg-muted/15">
                <div className="truncate font-semibold text-foreground/80" title={label}>
                  {label}
                  {base ? <span className="ml-1 font-normal text-muted-foreground">→ {base}</span> : null}
                </div>
                {base ? (
                  <div className="space-y-0.5 text-muted-foreground">
                    <div className="flex min-w-0 flex-wrap items-baseline" title={insight?.tipSubject ?? undefined}>
                      <span className="shrink-0 text-foreground/70">{t('prManager.board.repoBaseLastCommitLabel')}</span>
                      {dot}
                      {insight?.tipShortSha && commitUrl ? (
                        <button
                          type="button"
                          className="shrink-0 font-mono text-inherit text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                          title={insight.tipSubject ?? commitUrl}
                          onClick={e => {
                            e.stopPropagation()
                            openUrlInDefaultBrowser(commitUrl)
                          }}
                        >
                          {insight.tipShortSha}
                        </button>
                      ) : (
                        <span className="font-mono text-inherit opacity-80">{insight?.tipShortSha ?? '—'}</span>
                      )}
                      {commitRel != null ? (
                        <>
                          {dot}
                          <span className="tabular-nums">{commitRel}</span>
                        </>
                      ) : null}
                    </div>
                    <div
                      className="flex min-w-0 flex-wrap items-baseline"
                      title={mergeTitle ? `${t('prManager.board.repoBaseLastMergedLabel')} — ${mergeTitle}` : undefined}
                    >
                      <span className="shrink-0 text-foreground/70">{t('prManager.board.repoBaseLastMergedLabel')}</span>
                      {dot}
                      {insight?.lastMergedPr ? (
                        mergePrUrl ? (
                          <button
                            type="button"
                            className="shrink-0 font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                            onClick={e => {
                              e.stopPropagation()
                              openUrlInDefaultBrowser(mergePrUrl)
                            }}
                          >
                            #{insight.lastMergedPr.number}
                          </button>
                        ) : (
                          <span>#{insight.lastMergedPr.number}</span>
                        )
                      ) : (
                        <span>—</span>
                      )}
                      {mergeRel != null ? (
                        <>
                          {dot}
                          <span className="tabular-nums">{mergeRel}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {trackedTotal > 0 && col ? (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5 font-medium tabular-nums">
                    {PR_GH_STATUS_IDS.map(id => {
                      const n = col[id]
                      if (n === 0) return null
                      return (
                        <span key={id} className={cn('whitespace-nowrap', PR_GH_FILTER_STYLE[id].label)}>
                          {t(`prManager.ghStatus.${id}`)} {n}
                        </span>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
})
