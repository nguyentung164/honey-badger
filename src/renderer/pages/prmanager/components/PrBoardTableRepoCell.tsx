'use client'

import { Loader2 } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { TableCell } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getDateFnsLocale } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import type { PrCheckpointTemplate } from '../hooks/usePrData'
import type { RepoBaseInsightsMap } from '../repoBaseBranchInsights'
import { PrBoardRepoColumnPrGroups } from './PrBoardRepoColumnPrGroups'
import { PrBoardScopedSyncIcon, PrSyncStatusChangeDot } from './PrBoardScopedSyncIcon'
import type { PrBoardRepoGroupViewModel } from './prBoardTableModel'
import { COL_DIVIDER_B, COL_DIVIDER_R } from './prBoardTableConstants'
import { formatScopedSyncTooltip } from './prBoardSyncStorage'

type PrBoardTableRepoCellProps = {
  group: PrBoardRepoGroupViewModel
  showTableBorders: boolean
  isRepoSyncing: boolean
  syncDisabled: boolean
  orderedPrCheckpointTemplates: PrCheckpointTemplate[]
  repoBaseInsights: RepoBaseInsightsMap
  repoBaseInsightsLoading: boolean
  projectBaseBranches: string[]
  onSyncRepo: (repoId: string) => void
}

export const PrBoardTableRepoCell = memo(function PrBoardTableRepoCell({
  group,
  showTableBorders,
  isRepoSyncing,
  syncDisabled,
  orderedPrCheckpointTemplates,
  repoBaseInsights,
  repoBaseInsightsLoading,
  projectBaseBranches,
  onSyncRepo,
}: PrBoardTableRepoCellProps) {
  const { t, i18n } = useTranslation()

  return (
    <TableCell
      rowSpan={group.rowSpan}
      data-repo-cell
      className={cn(
        'w-0 min-w-[220px] max-w-[min(900px,96vw)] whitespace-normal align-top font-medium p-2 pr-3',
        showTableBorders && COL_DIVIDER_R,
        showTableBorders && COL_DIVIDER_B,
        group.vis.row,
        group.vis.accent
      )}
    >
      <div className="sticky top-10 py-0.5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 justify-start p-0 hover:bg-accent/60"
                    disabled={syncDisabled}
                    aria-label={
                      group.repoHasStatusChange
                        ? t('prManager.board.syncRepoStatusChangedAria', { count: group.repoStatusChangeCount })
                        : t('prManager.board.syncRepoFromGithubTitle')
                    }
                    onClick={e => {
                      e.stopPropagation()
                      onSyncRepo(group.repoId)
                    }}
                  >
                    <PrBoardScopedSyncIcon syncMs={group.repoSyncMs} isSyncing={isRepoSyncing} />
                  </Button>
                  {group.repoHasStatusChange ? (
                    <PrSyncStatusChangeDot title={t('prManager.board.syncRepoStatusChangedHint', { count: group.repoStatusChangeCount })} />
                  ) : null}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs space-y-1 text-xs">
                <p>{t('prManager.board.syncRepoFromGithubTitle')}</p>
                {group.repoHasStatusChange ? (
                  <p className="text-emerald-800 dark:text-emerald-200">
                    {t('prManager.board.syncRepoStatusChangedHint', { count: group.repoStatusChangeCount })}
                  </p>
                ) : null}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="min-w-0 flex-1 cursor-default truncate leading-tight text-foreground/90">{group.repoName}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {formatScopedSyncTooltip(group.repoSyncMs, i18n.language, t)}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="mt-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] font-normal tabular-nums leading-none text-muted-foreground">
              <span>{t('prManager.board.branchCount', { count: group.repoTotalBranches })}</span>
              {group.repoTotalPrs > 0 ? <span> · {t('prManager.board.prCount', { count: group.repoTotalPrs })}</span> : null}
              {repoBaseInsightsLoading && projectBaseBranches.length > 0 ? (
                <Loader2 className="ml-0.5 inline h-3 w-3 shrink-0 animate-spin opacity-70" aria-hidden />
              ) : null}
            </div>
            <PrBoardRepoColumnPrGroups
              templates={orderedPrCheckpointTemplates}
              insights={repoBaseInsights[group.repoId]}
              prByTpl={group.prByTpl}
              owner={group.repoOwner}
              repo={group.repoRepo}
              loading={repoBaseInsightsLoading}
              dateLoc={getDateFnsLocale(i18n.language)}
              t={t}
            />
          </div>
        </div>
      </div>
    </TableCell>
  )
})
