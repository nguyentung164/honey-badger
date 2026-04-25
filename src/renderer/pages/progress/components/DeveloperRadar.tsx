import { Info, TrendingDown, TrendingUp, Zap } from 'lucide-react'
import { memo, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  Tooltip,
} from 'recharts'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipContent, TooltipTrigger, Tooltip as UITooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { type RadarData, type RadarMonthData, useProgressStore } from '@/stores/useProgressStore'
import { computeDevScoreOrdered, getDevScoreGrade, radarMetricLabel } from './radarDevScoreUtils'
import { getRadarProfileSummary, RADAR_METRIC_ORDER, type RadarProfileMetricKey, type RadarProfileSummary } from './radarProfileInsights'
import { SectionHeader } from './SectionHeader'

// ─── types ────────────────────────────────────────────────────────────────────

export interface RadarScore {
  velocity: number
  quality: number
  reliability: number
  delivery: number
  collaboration: number
  impact: number
}

// ─── computation ──────────────────────────────────────────────────────────────

export function computeRadarScores(d: RadarMonthData): RadarScore {
  const safePct = (num: number, den: number) => den > 0 ? Math.min(100, Math.round((num / den) * 100)) : 0
  const wd = Math.max(d.working_days, 1)

  // Velocity: consistency of coding activity (Swarmia/LinearB standard)
  const velocity = Math.min(100, Math.round((d.coding_days / wd) * 100))

  // Quality: avg pass rate for coding-rule + spotbugs checks
  const quality = safePct(
    d.commits_with_rule_check + d.commits_with_spotbugs,
    d.commits_total_in_queue * 2 || 1,
  )

  // Reliability: on-time delivery (70%) + low overdue burden (30%)
  // overdue_burden = tasks that were still open past deadline per working day
  const overdueBurden = Math.min(d.tasks_overdue_opened / wd, 1)
  const onTimeRate = d.tasks_done > 0 ? d.tasks_done_on_time / d.tasks_done : 0
  const reliability =
    d.tasks_done <= 0
      ? 0
      : Math.round((onTimeRate * 0.7 + (1 - overdueBurden) * 0.3) * 100)

  // Delivery: pure on-time ratio
  const delivery = safePct(d.tasks_done_on_time, d.tasks_done || 1)

  // Collaboration (merged Reviewing + Collab): peer reviews (70%) + daily reports (30%)
  const reviewTarget = Math.max(wd * 0.5, 1)
  const collaboration =
    Math.min(70, Math.round((d.reviews_done / reviewTarget) * 70)) +
    Math.min(30, Math.round((d.has_daily_report_days / wd) * 30))

  // Impact: output volume — tasks done (70%) + commit frequency (30%)
  const taskTarget = Math.max(wd * 0.5, 1)
  const impact =
    Math.min(70, Math.round((d.tasks_done / taskTarget) * 70)) +
    Math.min(30, Math.round((d.commits_count / wd) * 30))

  return { velocity, quality, reliability, delivery, collaboration, impact }
}

export function computeDevScore(scores: RadarScore): number {
  return computeDevScoreOrdered(scores)
}

// ─── constants ────────────────────────────────────────────────────────────────

const AXIS_DESC_KEY: Record<RadarProfileMetricKey, string> = {
  velocity: 'progress.radarVelocityDesc',
  quality: 'progress.radarQualityDesc',
  reliability: 'progress.radarReliabilityDesc',
  delivery: 'progress.radarDeliveryDesc',
  collaboration: 'progress.radarCollaborationDesc',
  impact: 'progress.radarImpactDesc',
}

const AXIS_COLOR_BY_KEY: Record<RadarProfileMetricKey, string> = {
  velocity: 'var(--chart-1)',
  quality: 'var(--chart-2)',
  reliability: 'var(--chart-3)',
  delivery: 'var(--chart-4)',
  collaboration: 'var(--chart-5)',
  impact: 'var(--chart-6)',
}

const SERIES_COLOR: Record<'current' | 'previous', string> = {
  current: 'var(--chart-1)',
  previous: 'var(--chart-3)',
}

// ─── Dev Score summary (compact; radar is primary) ────────────────────────────

function DevScoreSummaryCard({
  score,
  prevScore,
  summary,
}: {
  score: number
  prevScore: number
  summary: RadarProfileSummary
}) {
  const { t } = useTranslation()
  const grade = getDevScoreGrade(score)
  const delta = score - prevScore

  const R = 38
  const cx = 48
  const cy = 48
  const stroke = 7
  const circumference = Math.PI * R
  const filled = circumference * Math.min(score / 100, 1)
  const gap = circumference - filled

  return (
    <div
      className="rounded-xl px-3 py-2.5 space-y-2"
      style={{ background: grade.bg }}
    >
      <div className="flex items-start gap-3">
        <div className="relative w-[96px] h-[54px] shrink-0 overflow-hidden">
          <svg viewBox="0 0 96 54" className="w-full h-full text-muted-foreground" aria-hidden>
            <path
              d={`M ${cx - R},${cy} A ${R},${R} 0 0 1 ${cx + R},${cy}`}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.15}
              strokeWidth={stroke}
              strokeLinecap="round"
            />
            <path
              d={`M ${cx - R},${cy} A ${R},${R} 0 0 1 ${cx + R},${cy}`}
              fill="none"
              stroke={grade.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${gap + 1}`}
              style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-end justify-center pb-0.5">
            <span className="text-xl font-black tabular-nums leading-none" style={{ color: grade.color }}>
              {score}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <UITooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-base font-semibold uppercase tracking-wide text-muted-foreground cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 text-left"
              >
                {t('progress.devScore')}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px] text-base leading-relaxed">
              {t('progress.devScoreInfoTooltip')}
            </TooltipContent>
          </UITooltip>
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            <span className="text-base font-semibold" style={{ color: grade.color }}>
              {t(grade.gradeKey)}
            </span>
            {Math.abs(delta) >= 1 && (
              <span className={cn('text-base font-bold tabular-nums flex items-center gap-0.5', delta > 0 ? 'text-green-600' : 'text-red-500')}>
                {delta > 0 ? <TrendingUp className="h-3 w-3 shrink-0" /> : <TrendingDown className="h-3 w-3 shrink-0" />}
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>
          <p className="text-base text-muted-foreground leading-snug mt-1">
            {t('progress.devScoreSubtitle')}
          </p>
          <p className="text-base text-muted-foreground/90 leading-snug mt-1 border-t border-border/40 pt-1.5">
            {t('progress.devScoreDisclaimer')}
          </p>
        </div>
      </div>

      <p className="text-base font-medium text-foreground/90 leading-snug">
        {t(summary.shapeI18nKey)}
      </p>
      <div className="space-y-1 text-base leading-snug">
        <p>
          <span className="text-muted-foreground">{t('progress.devScoreStrength')}</span>{' '}
          <span className="font-semibold" style={{ color: AXIS_COLOR_BY_KEY[summary.strengthKey] }}>
            {radarMetricLabel(t, summary.strengthKey)}
          </span>
        </p>
        <p>
          <span className="text-muted-foreground">{t('progress.devScoreFocusArea')}</span>{' '}
          <span className="font-semibold" style={{ color: AXIS_COLOR_BY_KEY[summary.weakKey] }}>
            {radarMetricLabel(t, summary.weakKey)}
          </span>
        </p>
      </div>
    </div>
  )
}
// ─── Score Progress Bar ───────────────────────────────────────────────────────

function ScoreProgressBar({ value }: { value: number }) {
  const w = Math.max(0, Math.min(100, value))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500 transition-[width] duration-700 ease-out dark:from-red-400 dark:via-amber-300 dark:to-emerald-400"
        style={{ width: `${w}%` }}
      />
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  if (Math.abs(delta) < 1) return <span className="text-base text-muted-foreground">=</span>
  return (
    <span className={cn('text-base font-medium', delta > 0 ? 'text-green-600' : 'text-red-500')}>
      {delta > 0 ? `↑ +${delta}` : `↓ ${delta}`}
    </span>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export const DeveloperRadar = memo(function DeveloperRadar({
  userId,
  isolated = false,
  dateFrom,
  dateTo,
  hideTitle = false,
  noRootPadding = false,
}: {
  userId: string
  isolated?: boolean
  dateFrom?: string
  dateTo?: string
  hideTitle?: boolean
  noRootPadding?: boolean
}) {
  const { t, i18n } = useTranslation()
  const { radar, radarYearMonth, fetchRadar, setRadarYearMonth } = useProgressStore()
  const isIso = Boolean(isolated && dateFrom && dateTo)
  const [isoRadar, setIsoRadar] = useState<RadarData | null>(null)
  const [isoLoading, setIsoLoading] = useState(false)

  useEffect(() => {
    if (isIso) return
    fetchRadar(userId, radarYearMonth)
  }, [userId, radarYearMonth, fetchRadar, isIso])

  useEffect(() => {
    if (!isIso || !dateFrom || !dateTo) return
    let cancelled = false
    setIsoLoading(true)
    void window.api.progress.getRadarRange(userId, dateFrom, dateTo).then(res => {
      if (cancelled) return
      if (res?.status === 'success' && res.data) setIsoRadar(res.data as RadarData)
      else setIsoRadar(null)
      setIsoLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [userId, dateFrom, dateTo, isIso])

  const effRadarData = isIso ? isoRadar : radar.data
  const effLoading = isIso ? isoLoading : radar.loading

  const { chartData, bestKey, worstKey, devScore, prevDevScore, profileSummary } = useMemo(() => {
    if (!effRadarData) {
      return {
        chartData: [],
        bestKey: null,
        worstKey: null,
        devScore: 0,
        prevDevScore: 0,
        profileSummary: null as RadarProfileSummary | null,
      }
    }
    const cs = computeRadarScores(effRadarData.current)
    const ps = computeRadarScores(effRadarData.previous)
    const data = RADAR_METRIC_ORDER.map(key => ({
      subject: radarMetricLabel(t, key),
      key,
      current: cs[key],
      previous: ps[key],
      delta: cs[key] - ps[key],
    }))
    const best = data.reduce((b, d) => (d.delta > b.delta ? d : b), data[0])
    const worst = data.reduce((w, d) => (d.delta < w.delta ? d : w), data[0])
    return {
      chartData: data,
      bestKey: best.key,
      worstKey: worst.key,
      devScore: computeDevScore(cs),
      prevDevScore: computeDevScore(ps),
      profileSummary: getRadarProfileSummary(cs),
    }
  }, [effRadarData, t, i18n.language])

  const LOCALE_MAP: Record<string, string> = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP' }
  const locale = LOCALE_MAP[i18n.language] ?? 'vi-VN'

  const months = useMemo(() => {
    const result = []
    const base = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      result.push({ value: ym, label: d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }) })
    }
    return result
  }, [locale])

  const radarChartConfig = useMemo(
    () =>
      isIso
        ? {
            current: { label: t('teamProgress.radarSeriesCurrent'), color: 'var(--chart-1)' },
            previous: { label: t('teamProgress.radarSeriesCompare'), color: 'var(--chart-3)' },
          }
        : {
            current: { label: t('progress.thisMonth'), color: 'var(--chart-1)' },
            previous: { label: t('progress.prevMonth'), color: 'var(--chart-3)' },
          },
    [t, isIso],
  )

  const seriesCurrentLabel = isIso ? t('teamProgress.radarSeriesCurrent') : t('progress.thisMonth')
  const seriesPrevLabel = isIso ? t('teamProgress.radarSeriesCompare') : t('progress.prevMonth')

  return (
    <div className={cn('space-y-5', noRootPadding ? 'p-0' : 'p-6')}>
      {!hideTitle ? (
        <SectionHeader
          icon={<Zap className="h-5 w-5 text-violet-500" />}
          title={t('progress.developerProfile')}
          description={t('progress.developerProfileDesc')}
          actions={
            !isIso ? (
              <Select value={radarYearMonth} onValueChange={setRadarYearMonth}>
                <SelectTrigger size="sm" className="h-9 min-w-[10rem] max-w-[14rem] text-base">
                  <SelectValue placeholder={t('progress.selectMonth')} />
                </SelectTrigger>
                <SelectContent align="end" position="popper">
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value} className="text-base">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : undefined
          }
        />
      ) : !isIso ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select value={radarYearMonth} onValueChange={setRadarYearMonth}>
            <SelectTrigger size="sm" className="h-9 min-w-[10rem] max-w-[14rem] text-base">
              <SelectValue placeholder={t('progress.selectMonth')} />
            </SelectTrigger>
            <SelectContent align="end" position="popper">
              {months.map(m => (
                <SelectItem key={m.value} value={m.value} className="text-base">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="rounded-xl bg-muted/40 p-4">
          {effLoading ? (
            <Skeleton className="h-[400] w-full rounded-xl" />
          ) : !chartData.length ? (
            <div className="flex h-[400] items-center justify-center text-base text-muted-foreground">{t('progress.noData')}</div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Radar chart — primary (2/3 on large screens) */}
            <div className="h-[400px] lg:col-span-1">
              <ChartContainer config={radarChartConfig} className="h-[400px] w-full">
                <RadarChart data={chartData}>
                  <PolarGrid className="stroke-border" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={(props: { payload: { value: string }; x: number; y: number; textAnchor: string }) => {
                      const { payload, x, y, textAnchor } = props
                      const row = chartData.find(d => d.subject === payload.value)
                      const fill = row ? AXIS_COLOR_BY_KEY[row.key] : 'var(--muted-foreground)'
                      return (
                        <text
                          x={x}
                          y={y}
                          textAnchor={textAnchor as 'start' | 'middle' | 'end'}
                          fill={fill}
                          fontSize={11}
                          className="recharts-text"
                          dominantBaseline="central"
                        >
                          {payload.value}
                        </text>
                      )
                    }}
                  />
                  <Radar
                    name={t('progress.thisMonth')}
                    dataKey="current"
                    stroke={SERIES_COLOR.current}
                    fill={SERIES_COLOR.current}
                    fillOpacity={0.35}
                    strokeWidth={2}
                  />
                  <Radar
                    name={seriesPrevLabel}
                    dataKey="previous"
                    stroke={SERIES_COLOR.previous}
                    fill={SERIES_COLOR.previous}
                    fillOpacity={0.12}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                  />
                  <Tooltip
                    content={
                      <ChartTooltipContent
                        className="text-base"
                        labelFormatter={(value, payload) => {
                          const p = payload?.[0]?.payload as { subject?: string } | undefined
                          const subject = typeof value === 'string' ? value : p?.subject
                          if (!subject || typeof subject !== 'string') return value as ReactNode
                          const row = chartData.find(d => d.subject === subject)
                          const c = row ? AXIS_COLOR_BY_KEY[row.key] : undefined
                          return (
                            <span className="font-semibold" style={c ? { color: c } : undefined}>
                              {subject}
                            </span>
                          )
                        }}
                        formatter={(value, name, item) => {
                          const dk = item && typeof item === 'object' && 'dataKey' in item ? String((item as { dataKey?: string }).dataKey) : ''
                          const seriesColor =
                            dk === 'current' ? SERIES_COLOR.current : dk === 'previous' ? SERIES_COLOR.previous : undefined
                          return (
                            <div className="flex w-full min-w-[10rem] flex-wrap items-center justify-between gap-2 leading-none">
                              <span className="font-medium" style={seriesColor ? { color: seriesColor } : { color: 'var(--muted-foreground)' }}>
                                {name}
                              </span>
                              <span className="text-foreground font-mono font-medium tabular-nums">
                                {typeof value === 'number' ? value.toLocaleString() : String(value)}/100
                              </span>
                            </div>
                          )
                        }}
                      />
                    }
                  />
                </RadarChart>
              </ChartContainer>
              <div className="flex justify-center gap-4 text-base mt-1">
                <span className="flex items-center gap-1 font-medium" style={{ color: SERIES_COLOR.current }}>
                  <span className="inline-block h-0.5 w-3 shrink-0 rounded-full bg-[var(--chart-1)]" />
                  {seriesCurrentLabel}
                </span>
                <span className="flex items-center gap-1 font-medium" style={{ color: SERIES_COLOR.previous }}>
                  <span
                    className="inline-block h-0 w-3 shrink-0 border-t-2 border-dashed opacity-90"
                    style={{ borderColor: 'var(--chart-3)' }}
                  />
                  {seriesPrevLabel}
                </span>
              </div>
            </div>

            {/* Summary + per-metric breakdown (1/3) */}
            <div className="space-y-3 lg:col-span-1 min-w-0">
              {profileSummary && (
                <DevScoreSummaryCard score={devScore} prevScore={prevDevScore} summary={profileSummary} />
              )}

              {/* Per-metric bars */}
              {chartData.map(d => (
                <div key={d.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1" style={{ color: AXIS_COLOR_BY_KEY[d.key] }}>
                      <span className="font-medium">{d.subject}</span>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 opacity-40 hover:opacity-100 cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[220px] text-base">
                          {t(AXIS_DESC_KEY[d.key])}
                        </TooltipContent>
                      </UITooltip>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold tabular-nums text-foreground">{d.current}</span>
                      {d.key === bestKey && d.delta > 2 && (
                        <TrendingUp className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      )}
                      {d.key === worstKey && d.delta < -5 && (
                        <TrendingDown className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      )}
                      <DeltaBadge delta={d.delta} />
                    </div>
                  </div>
                  <ScoreProgressBar value={d.current} />
                </div>
              ))}

              {/* Insights */}
              <div className="mt-2 space-y-1.5 pt-2">
                {(() => {
                  const best = bestKey ? chartData.find(d => d.key === bestKey) : null
                  const worst = worstKey ? chartData.find(d => d.key === worstKey) : null
                  const lowScores = chartData.filter(d => d.current < 40)
                  return (
                    <>
                      {best && best.delta > 2 && (
                        <p className="text-base text-green-600">
                          📈 {t('progress.mostImproved')}: <strong>{best.subject}</strong> +{best.delta}
                        </p>
                      )}
                      {worst && worst.delta < -5 && (
                        <p className="text-base text-amber-600">
                          ⚠ {t('progress.needsAttention')}: <strong>{worst.subject}</strong> {worst.delta}
                        </p>
                      )}
                      {lowScores.length > 0 && (
                        <p className="text-base text-muted-foreground">
                          {lowScores.map(d => d.subject).join(', ')} {t('progress.scoreLow')}
                        </p>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
            </div>
          )}
      </div>
    </div>
  )
})
