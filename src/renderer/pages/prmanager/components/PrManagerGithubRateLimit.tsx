'use client'

import { formatDistanceToNow } from 'date-fns'
import { Gauge } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getDateFnsLocale } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'

type RateData = {
  core: { limit: number; remaining: number; reset: number; used: number }
  search: { limit: number; remaining: number; reset: number; used: number } | null
  graphql: { limit: number; remaining: number; reset: number; used: number } | null
}

type TokenSt = { ok: boolean; login?: string; message?: string } | null

function rateColorClass(remaining: number, limit: number): string {
  if (limit <= 0) return 'text-muted-foreground'
  const r = remaining / limit
  if (r < 0.04) return 'text-rose-600 dark:text-rose-400'
  if (r < 0.2) return 'text-amber-600 dark:text-amber-400'
  return 'text-emerald-600 dark:text-emerald-400'
}

const badgeClass =
  'flex max-w-[180px] cursor-default items-center gap-1.5 rounded border border-border/60 bg-muted/50 px-2 py-1 text-xs tabular-nums leading-tight shadow-sm'

type Props = { tokenStatus: TokenSt }

export function PrManagerGithubRateLimit({ tokenStatus }: Props) {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState<RateData | null>(null)
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const tokenOk = tokenStatus?.ok === true
  const dateLoc = getDateFnsLocale(i18n.language)

  const formatReset = (sec: number): string =>
    new Date(sec * 1000).toLocaleString(i18n.language || 'en', { dateStyle: 'short', timeStyle: 'medium' })

  const textUntilReset = (resetSec: number, n: number): string => {
    const target = resetSec * 1000
    if (target <= n) return t('prManager.rateLimit.resetting')
    return formatDistanceToNow(target, { locale: dateLoc, addSuffix: true })
  }

  const load = useCallback(async () => {
    if (!tokenOk) {
      setData(null)
      return
    }
    setLoading(true)
    try {
      const res = await window.api.pr.rateLimitGet()
      if (res.status === 'success' && res.data) setData(res.data)
      else setData(null)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [tokenOk])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!tokenOk) return
    const tmr = setInterval(() => void load(), 45_000)
    return () => clearInterval(tmr)
  }, [tokenOk, load])

  useEffect(() => {
    if (!tokenOk) return
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [tokenOk, load])

  useEffect(() => {
    if (!data) return
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [data])

  if (tokenStatus === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(badgeClass, 'text-muted-foreground')}>
            <Gauge className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span>…</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {t('prManager.rateLimit.checkingToken')}
        </TooltipContent>
      </Tooltip>
    )
  }

  if (!tokenStatus.ok) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(badgeClass, 'text-muted-foreground')}>
            <Gauge className="h-3.5 w-3.5 shrink-0 opacity-50" />
            <span>API: —</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {t('prManager.rateLimit.needToken')}
          {tokenStatus.message ? <span className="mt-1 block text-muted-foreground">({tokenStatus.message})</span> : null}
        </TooltipContent>
      </Tooltip>
    )
  }

  const core = data?.core
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(badgeClass, 'shrink-0', core && rateColorClass(core.remaining, core.limit))}>
          <Gauge className="h-3.5 w-3.5 shrink-0 opacity-80" />
          {loading && !data ? (
            <span className="text-muted-foreground">…</span>
          ) : core ? (
            <span className="min-w-0 truncate">
              {core.remaining.toLocaleString(i18n.language)}/{core.limit.toLocaleString(i18n.language)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        {data ? (
          <div className="space-y-1.5">
            <p className="text-[11px] leading-snug text-foreground/95">
              {t('prManager.rateLimit.paragraph1a')}
              <b>{textUntilReset(data.core.reset, now)}</b>
              {t('prManager.rateLimit.paragraph1b')}
              <b>{formatReset(data.core.reset)}</b>
              {t('prManager.rateLimit.paragraph1c')}
              {t('prManager.rateLimit.afterWindow')}
            </p>
            <div>
              <span className="font-medium">{t('prManager.rateLimit.restCore')}</span>{' '}
              {data.core.remaining.toLocaleString(i18n.language)}/{data.core.limit.toLocaleString(i18n.language)} (
              {t('prManager.rateLimit.used')} {data.core.used.toLocaleString(i18n.language)}). {t('prManager.rateLimit.nextReset')}{' '}
              {formatReset(data.core.reset)} ({textUntilReset(data.core.reset, now)}).
            </div>
            {data.search ? (
              <div>
                <span className="font-medium">{t('prManager.rateLimit.search')}</span> {data.search.remaining}/{data.search.limit}.{' '}
                {t('prManager.rateLimit.reset')} {formatReset(data.search.reset)} ({textUntilReset(data.search.reset, now)}).
              </div>
            ) : null}
            {data.graphql ? (
              <div>
                <span className="font-medium">{t('prManager.rateLimit.graphql')}</span> {data.graphql.remaining}/{data.graphql.limit}.{' '}
                {t('prManager.rateLimit.reset')} {formatReset(data.graphql.reset)} ({textUntilReset(data.graphql.reset, now)}).
              </div>
            ) : null}
            <p className="text-[10px] text-muted-foreground">
              {t('prManager.rateLimit.fetchedEvery')}{' '}
              {new Date(now).toLocaleTimeString(i18n.language, { timeStyle: 'medium' })}).
            </p>
          </div>
        ) : (
          t('prManager.rateLimit.loadError')
        )}
      </TooltipContent>
    </Tooltip>
  )
}
