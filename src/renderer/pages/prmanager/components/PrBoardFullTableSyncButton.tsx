'use client'

import { CloudAlert, CloudCheck } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { cn } from '@/lib/utils'
import { formatScopedSyncTooltip, githubScopedSyncIdleVisual } from './prBoardSyncStorage'

export type PrBoardSyncProgressEvent = {
  percent: number
  done: number
  total: number
}

type PrBoardFullTableSyncButtonProps = {
  projectId: string
  showFullTableGithubSyncOverlay: boolean
  lastGithubSyncAt: number | null
  lastGithubSyncWasAuto: boolean
  i18nLanguage: string
  disabled: boolean
  onSync: () => void
  onSyncProgress?: (event: PrBoardSyncProgressEvent) => void
  onRegisterReset: (reset: () => void) => () => void
}

/** Full-table sync button — giữ `syncProgress` cục bộ để không re-render `PrBoardTable`. */
export const PrBoardFullTableSyncButton = memo(function PrBoardFullTableSyncButton({
  projectId,
  showFullTableGithubSyncOverlay,
  lastGithubSyncAt,
  lastGithubSyncWasAuto,
  i18nLanguage,
  disabled,
  onSync,
  onSyncProgress,
  onRegisterReset,
}: PrBoardFullTableSyncButtonProps) {
  const { t } = useTranslation()
  const [syncProgress, setSyncProgress] = useState(0)
  const [fullTableSyncStaleClock, setFullTableSyncStaleClock] = useState(0)

  useEffect(() => onRegisterReset(() => setSyncProgress(0)), [onRegisterReset])

  useEffect(() => {
    const id = window.setInterval(() => setFullTableSyncStaleClock(c => c + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const off = window.api.pr.onTrackedSyncProgress(payload => {
      if (payload.projectId !== projectId) return
      const pct = Math.max(0, Math.min(100, payload.percent))
      setSyncProgress(pct)
      onSyncProgress?.({ percent: pct, done: payload.done, total: payload.total })
    })
    return off
  }, [projectId, onSyncProgress])

  const fullTableGithubSyncIdleVisual = useMemo(() => {
    void fullTableSyncStaleClock
    return githubScopedSyncIdleVisual(lastGithubSyncAt, Date.now())
  }, [lastGithubSyncAt, fullTableSyncStaleClock])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0 rounded-md">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onSync}
            disabled={disabled}
            aria-label={t('prManager.board.syncFromGithub')}
            className={cn(
              'h-8 gap-1 border transition-colors duration-500 ease-in-out [&_svg]:transition-colors [&_svg]:duration-500 [&_svg]:ease-in-out',
              showFullTableGithubSyncOverlay
                ? 'border-green-600 bg-green-600 text-white shadow-none hover:border-green-700 hover:bg-green-700 hover:text-white dark:border-green-500 dark:bg-green-500 dark:hover:border-green-400 dark:hover:bg-green-400'
                : fullTableGithubSyncIdleVisual === 'stale'
                  ? 'border-amber-500/80 bg-amber-50 text-amber-900 shadow-none hover:border-amber-600 hover:bg-amber-100 hover:text-amber-950 dark:border-amber-500/60 dark:bg-amber-950/35 dark:text-amber-100 dark:hover:border-amber-400 dark:hover:bg-amber-950/55 dark:hover:text-amber-50'
                  : fullTableGithubSyncIdleVisual === 'fresh'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-none hover:border-emerald-700 hover:bg-emerald-100 hover:text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:border-emerald-400 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-50'
                    : 'border-border/70 bg-muted/20 text-muted-foreground shadow-none hover:bg-muted/35 hover:text-foreground'
            )}
          >
            {showFullTableGithubSyncOverlay ? (
              <>
                <GlowLoader className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs font-medium tabular-nums">{syncProgress}%</span>
              </>
            ) : (
              <>
                {fullTableGithubSyncIdleVisual === 'stale' ? (
                  <CloudAlert className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <CloudCheck className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="text-xs font-medium">{t('prManager.board.syncFromGithub')}</span>
              </>
            )}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs space-y-2 text-xs">
        <p>{t('prManager.board.syncFromGithubHelp')}</p>
        {lastGithubSyncAt != null ? (
          <p className="border-t border-border/60 pt-2 text-muted-foreground">
            {formatScopedSyncTooltip(lastGithubSyncAt, i18nLanguage, t)}
            {lastGithubSyncWasAuto ? t('prManager.board.lastGithubSyncAutoSuffix') : ''}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
})
