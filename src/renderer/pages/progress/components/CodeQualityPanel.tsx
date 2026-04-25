import { Code2 } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useProgressStore, type QualityData } from '@/stores/useProgressStore'
import { SectionHeader } from './SectionHeader'

const WEEKS_OPTIONS = [4, 8, 12, 24]

const RULE_STACK_CHART_CONFIG = {
  checked: { label: 'Coding rule checked', color: 'var(--chart-2)' },
  unchecked: { label: 'Not checked', color: 'var(--muted)' },
}

const SPOTBUGS_STACK_CHART_CONFIG = {
  checked: { label: 'SpotBugs checked', color: 'var(--chart-1)' },
  unchecked: { label: 'Not checked', color: 'var(--muted)' },
}

/** Khoảng cách đồng bộ giữa các card (ngang + dọc) */
const CARD_GAP = 'gap-4'
const qualityCardClass = 'rounded-xl bg-muted/40 p-4 min-w-0'

export const CodeQualityPanel = memo(function CodeQualityPanel({
  userId,
  isolated = false,
  dateFrom,
  dateTo,
  teamUserIds,
  hideTitle = false,
  noRootPadding = false,
}: {
  userId: string
  isolated?: boolean
  dateFrom?: string
  dateTo?: string
  teamUserIds?: string[]
  hideTitle?: boolean
  noRootPadding?: boolean
}) {
  const { t } = useTranslation()
  const { quality, qualityWeeksBack, fetchQuality, setQualityWeeksBack } = useProgressStore()
  const isIso = Boolean(isolated && dateFrom && dateTo)
  const [isoQuality, setIsoQuality] = useState<QualityData | null>(null)
  const [isoLoading, setIsoLoading] = useState(false)

  useEffect(() => {
    if (!isIso || !dateFrom || !dateTo) {
      setIsoQuality(null)
      return
    }
    let cancelled = false
    setIsoLoading(true)
    void window.api.progress.getQualityTrend(userId, 12, teamUserIds ?? undefined, dateFrom, dateTo).then(res => {
      if (cancelled) return
      if (res?.status === 'success' && res.data) setIsoQuality(res.data as QualityData)
      else setIsoQuality(null)
      setIsoLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [userId, dateFrom, dateTo, teamUserIds, isIso])

  useEffect(() => {
    if (isIso) return
    void fetchQuality(userId, qualityWeeksBack)
  }, [userId, qualityWeeksBack, fetchQuality, isIso])

  const effData = isIso ? isoQuality : quality.data
  const effLoading = isIso ? isoLoading : quality.loading

  const ruleStackedData = useMemo(() => {
    return (effData?.trend ?? []).map(w => ({
      week: w.week,
      checked: w.rule_checked,
      unchecked: Math.max(0, w.total - w.rule_checked),
      total: w.total,
      rate: w.total > 0 ? Math.round((w.rule_checked / w.total) * 100) : 0,
    }))
  }, [effData])

  const spotbugsStackedData = useMemo(() => {
    return (effData?.trend ?? []).map(w => ({
      week: w.week,
      checked: w.spotbugs_checked,
      unchecked: Math.max(0, w.total - w.spotbugs_checked),
      total: w.total,
      rate: w.total > 0 ? Math.round((w.spotbugs_checked / w.total) * 100) : 0,
    }))
  }, [effData])

  const comparisonRows = useMemo(() => {
    if (!effData) return []
    return [
      {
        title: t('progress.codingRuleCheck'),
        user: effData.userRuleRate,
        team: effData.teamAvg.rule_check_rate,
        accent: 'var(--chart-2)',
      },
      {
        title: t('progress.spotbugsCheck'),
        user: effData.userSpotbugsRate,
        team: effData.teamAvg.spotbugs_rate,
        accent: 'var(--chart-1)',
      },
    ]
  }, [effData, t])

  const rangeActions =
    isIso && dateFrom && dateTo ? (
      <div className="flex flex-wrap items-center justify-end gap-1">
        <span
          className="px-2.5 py-1 text-base rounded-md bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 font-medium tabular-nums max-w-[min(100%,280px)] truncate"
          title={`${dateFrom} – ${dateTo}`}
        >
          {dateFrom} – {dateTo}
        </span>
      </div>
    ) : undefined

  const headerActions = !isIso ? (
    <div className="flex flex-wrap gap-1">
      {WEEKS_OPTIONS.map(w => (
        <button
          key={w}
          type="button"
          onClick={() => setQualityWeeksBack(w)}
          className={cn(
            'px-2.5 py-1 text-base rounded-md transition-colors',
            qualityWeeksBack === w ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 font-medium' : 'hover:bg-accent text-muted-foreground'
          )}
        >
          {w}w
        </button>
      ))}
    </div>
  ) : (
    rangeActions
  )

  return (
    <div className={cn('space-y-5', noRootPadding ? 'p-0' : 'p-6')}>
      {!hideTitle ? (
        <SectionHeader
          icon={<Code2 className="h-5 w-5 text-cyan-500" />}
          title={t('progress.codeQuality')}
          description={t('progress.codeQualityDesc')}
          actions={headerActions}
        />
      ) : hideTitle && !isIso && headerActions ? (
        <div className="flex flex-wrap items-center justify-end gap-1">{headerActions}</div>
      ) : null}

      {effLoading ? (
        <div className="space-y-5">
          <div className={cn('grid grid-cols-2', CARD_GAP)}>
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <div className={cn('grid grid-cols-1 lg:grid-cols-2', CARD_GAP)}>
            <Skeleton className="h-[200px] w-full rounded-xl" />
            <Skeleton className="h-[200px] w-full rounded-xl" />
          </div>
          <div className={cn('grid grid-cols-1 lg:grid-cols-2', CARD_GAP)}>
            <Skeleton className="h-[120px] w-full rounded-xl" />
            <Skeleton className="h-[120px] w-full rounded-xl" />
          </div>
        </div>
      ) : !effData ? (
        <div className="flex h-[200px] items-center justify-center text-base text-muted-foreground">{t('progress.noData')}</div>
      ) : (
        <>
          {/* Rate cards */}
          <div className={cn('grid grid-cols-2', CARD_GAP)}>
            <div className={cn(qualityCardClass, 'space-y-2')}>
              <p className="text-base text-muted-foreground">{t('progress.codingRuleCheck')}</p>
              <p
                className={cn(
                  'text-3xl font-bold tabular-nums',
                  effData.userRuleRate >= 80 ? 'text-green-600' : effData.userRuleRate >= 60 ? 'text-amber-500' : 'text-red-500'
                )}
              >
                {effData.userRuleRate}%
              </p>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full', effData.userRuleRate >= 80 ? 'bg-green-500' : effData.userRuleRate >= 60 ? 'bg-amber-500' : 'bg-red-500')}
                  style={{ width: `${effData.userRuleRate}%` }}
                />
              </div>
            </div>
            <div className={cn(qualityCardClass, 'space-y-2')}>
              <p className="text-base text-muted-foreground">{t('progress.spotbugsCheck')}</p>
              <p
                className={cn(
                  'text-3xl font-bold tabular-nums',
                  effData.userSpotbugsRate >= 80 ? 'text-green-600' : effData.userSpotbugsRate >= 60 ? 'text-amber-500' : 'text-red-500'
                )}
              >
                {effData.userSpotbugsRate}%
              </p>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full', effData.userSpotbugsRate >= 80 ? 'bg-green-500' : effData.userSpotbugsRate >= 60 ? 'bg-amber-500' : 'bg-red-500')}
                  style={{ width: `${effData.userSpotbugsRate}%` }}
                />
              </div>
            </div>
          </div>

          {/* Weekly stacked bars: luôn hiển thị khung (isolated/range có thể trend rỗng nhưng vẫn có %) */}
          <div className={cn('grid grid-cols-1 lg:grid-cols-2', CARD_GAP)}>
            <div className={qualityCardClass}>
              <p className="text-base font-medium mb-3">
                {t('progress.weeklyTrend')} ({t('progress.codingRuleCheck')})
              </p>
              {ruleStackedData.length > 0 ? (
                <ChartContainer config={RULE_STACK_CHART_CONFIG} className="h-[160px] w-full">
                  <BarChart data={ruleStackedData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="checked" stackId="rule" fill="var(--chart-2)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="unchecked" stackId="rule" fill="var(--muted)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[160px] items-center justify-center px-2 text-center text-base text-muted-foreground">
                  {t('progress.noData')}
                </div>
              )}
            </div>
            <div className={qualityCardClass}>
              <p className="text-base font-medium mb-3">
                {t('progress.weeklyTrend')} ({t('progress.spotbugsCheck')})
              </p>
              {spotbugsStackedData.length > 0 ? (
                <ChartContainer config={SPOTBUGS_STACK_CHART_CONFIG} className="h-[160px] w-full">
                  <BarChart data={spotbugsStackedData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="checked" stackId="sb" fill="var(--chart-1)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="unchecked" stackId="sb" fill="var(--muted)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[160px] items-center justify-center px-2 text-center text-base text-muted-foreground">
                  {t('progress.noData')}
                </div>
              )}
            </div>
          </div>

          {/* vs Team: coding rule (left) + SpotBugs (right) */}
          <div className={cn('grid grid-cols-1 lg:grid-cols-2', CARD_GAP)}>
            {comparisonRows.map((row, i) => (
              <div key={i} className={qualityCardClass}>
                <p className="text-base font-medium mb-3">
                  {t('progress.vsTeam')} ({row.title})
                </p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base w-12 shrink-0 text-right text-muted-foreground">{t('progress.you')}</span>
                    <div className="flex-1 h-4 min-w-0 bg-muted rounded-full overflow-hidden relative">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${row.user}%`,
                          background: row.user >= row.team ? row.accent : 'var(--chart-4)',
                        }}
                      />
                    </div>
                    <span className="text-base font-bold w-10 shrink-0 tabular-nums">{row.user}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base w-12 shrink-0 text-right text-muted-foreground">{t('progress.team')}</span>
                    <div className="flex-1 h-4 min-w-0 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${row.team}%` }} />
                    </div>
                    <span className="text-base font-semibold w-10 shrink-0 tabular-nums text-muted-foreground">{row.team}%</span>
                  </div>
                </div>
                {row.user < row.team && <p className="text-base text-amber-600 mt-2">⚠ {t('progress.belowTeamAvg')}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
})
