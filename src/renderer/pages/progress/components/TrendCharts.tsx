import { memo, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp } from 'lucide-react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartContainer, ChartLegendContent, ChartTooltipContent } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useProgressStore, type TrendGranularity, type TrendMetric, type TrendPeriod, type TrendPoint } from '@/stores/useProgressStore'
import { SectionHeader } from './SectionHeader'

function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function periodToDateRange(period: TrendPeriod): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  const map: Record<TrendPeriod, number> = { '7d': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365 }
  from.setDate(from.getDate() - map[period])
  return { from: fmtLocalDate(from), to: fmtLocalDate(to) }
}

const METRICS: Array<{ id: TrendMetric; label: string; color: string }> = [
  { id: 'commits', label: 'Commits', color: 'var(--chart-1)' },
  { id: 'tasks', label: 'Tasks', color: 'var(--chart-2)' },
  { id: 'reviews', label: 'Reviews', color: 'var(--chart-3)' },
  { id: 'lines_added', label: 'Lines', color: 'var(--chart-4)' },
  { id: 'reports', label: 'Reports', color: 'var(--chart-5)' },
]

const PERIODS: TrendPeriod[] = ['7d', '1m', '3m', '6m', '1y']
const GRANULARITIES: TrendGranularity[] = ['day', 'week', 'month']

export const TrendCharts = memo(function TrendCharts({
  userId,
  isolated = false,
  dateFrom,
  dateTo,
  defaultGranularity = 'week',
  hideTitle = false,
  noRootPadding = false,
}: {
  userId: string
  isolated?: boolean
  dateFrom?: string
  dateTo?: string
  defaultGranularity?: TrendGranularity
  /** Ẩn tiêu đề mô tả (dùng khi đã có label ở tab ngoài) */
  hideTitle?: boolean
  /** Bỏ p-6 root — dùng trong tab Team metrics (Progress page giữ mặc định) */
  noRootPadding?: boolean
}) {
  const { t } = useTranslation()
  const {
    trend, trendPeriod, trendGranularity, trendMetrics, comparePrevious,
    fetchTrend, setTrendPeriod, setTrendGranularity, toggleTrendMetric, setComparePrevious,
  } = useProgressStore()

  const isIso = Boolean(isolated && dateFrom && dateTo)
  const [isoData, setIsoData] = useState<TrendPoint[] | null>(null)
  const [isoLoading, setIsoLoading] = useState(false)
  const [isoGranularity, setIsoGranularity] = useState<TrendGranularity>(defaultGranularity)
  const [isoMetrics, setIsoMetrics] = useState<TrendMetric[]>(['commits', 'tasks'])

  useEffect(() => {
    if (isIso) return
    const { from, to } = periodToDateRange(trendPeriod)
    fetchTrend(userId, from, to, trendGranularity)
  }, [userId, trendPeriod, trendGranularity, fetchTrend, isIso])

  useEffect(() => {
    if (!isIso || !dateFrom || !dateTo) return
    let cancelled = false
    setIsoLoading(true)
    void window.api.progress.getTrend(userId, dateFrom, dateTo, isoGranularity).then(res => {
      if (cancelled) return
      if (res?.status === 'success' && Array.isArray(res.data)) setIsoData(res.data as TrendPoint[])
      else setIsoData([])
      setIsoLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [userId, dateFrom, dateTo, isoGranularity, isIso])

  const effData = isIso ? isoData : trend.data
  const effLoading = isIso ? isoLoading : trend.loading
  const effGranularity = isIso ? isoGranularity : trendGranularity
  const setEffGranularity = isIso ? setIsoGranularity : setTrendGranularity
  const effMetrics = isIso ? isoMetrics : trendMetrics
  const toggleEffMetric = (m: TrendMetric) => {
    if (isIso) {
      setIsoMetrics(prev => (prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]))
    } else {
      toggleTrendMetric(m)
    }
  }

  const chartData = useMemo(() => {
    return (effData ?? []).map(d => ({
      ...d,
      commits: Number(d.commits ?? 0),
      tasks: Number(d.tasks ?? 0),
      reviews: Number(d.reviews ?? 0),
      reports: Number(d.reports ?? 0),
      lines_added: Math.round(Number(d.lines_added ?? 0) / 100),
    }))
  }, [effData])

  const delta = useMemo(() => {
    const data = effData ?? []
    if (data.length < 2) return null
    const half = Math.floor(data.length / 2)
    const prev = data.slice(0, half)
    const curr = data.slice(half)
    const sum = (arr: typeof data, key: keyof typeof data[0]) =>
      arr.reduce((s, d) => s + Number(d[key] ?? 0), 0)
    const metrics: TrendMetric[] = ['commits', 'tasks', 'reviews']
    return metrics.map(m => ({
      key: m,
      prev: sum(prev, m as any),
      curr: sum(curr, m as any),
    }))
  }, [effData])

  const chartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {}
    for (const m of METRICS) cfg[m.id] = { label: m.label, color: m.color }
    return cfg
  }, [])

  return (
    <div className={cn('space-y-5', noRootPadding ? 'p-0' : 'p-6')}>
      {!hideTitle ? (
        <SectionHeader
          icon={<TrendingUp className="h-5 w-5 text-blue-500" />}
          title={t('progress.trendCharts')}
          description={t('progress.trendChartsDesc')}
        />
      ) : null}

      {/* Metric chips */}
      <div className="flex flex-wrap gap-1.5">
        {METRICS.map(m => (
          <button
            key={m.id}
            onClick={() => toggleEffMetric(m.id)}
            className={cn(
              'px-3 py-1 text-base rounded-md transition-colors',
              effMetrics.includes(m.id)
                ? 'text-white font-medium'
                : 'hover:bg-accent text-muted-foreground',
            )}
            style={effMetrics.includes(m.id) ? { background: m.color } : undefined}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Period / granularity controls */}
      <div className="flex flex-wrap items-center gap-4">
        {!isIso && (
          <div className="flex gap-1">
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setTrendPeriod(p)}
                className={cn(
                  'px-2.5 py-1 text-base rounded-md transition-colors',
                  trendPeriod === p ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400 font-medium' : 'hover:bg-accent text-muted-foreground',
                )}
              >
                {p === '7d' ? t('progress.period7d') : p === '1m' ? t('progress.period1m') : p === '3m' ? t('progress.period3m') : p === '6m' ? t('progress.period6m') : t('progress.period1y')}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          {GRANULARITIES.map(g => (
            <button
              key={g}
              onClick={() => setEffGranularity(g)}
              className={cn(
                'px-2.5 py-1 text-base rounded-md transition-colors',
                effGranularity === g ? 'bg-slate-500/20 text-slate-700 dark:text-slate-300 font-medium' : 'hover:bg-accent text-muted-foreground',
              )}
            >
              {g === 'day' ? t('progress.granDay') : g === 'week' ? t('progress.granWeek') : t('progress.granMonth')}
            </button>
          ))}
        </div>
        {!isIso && (
          <label className="flex items-center gap-1.5 text-base cursor-pointer select-none">
            <input
              type="checkbox"
              checked={comparePrevious}
              onChange={e => setComparePrevious(e.target.checked)}
              className="rounded accent-blue-500"
            />
            {t('progress.comparePrevious')}
          </label>
        )}
      </div>

      <div className="rounded-xl bg-muted/40 p-4">
          {effLoading ? (
            <Skeleton className="h-[280px] w-full rounded-xl" />
          ) : chartData.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-base text-muted-foreground">
              {t('progress.noData')}
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              {(() => {
                const hasLeftMetrics = effMetrics.includes('commits') || effMetrics.includes('lines_added')
                const lineAxisId = hasLeftMetrics ? 'right' : 'left'
                return (
                  <ComposedChart data={chartData} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} domain={[0, (max: number) => Math.ceil(max * 1.15) || 10]} />
                    {hasLeftMetrics && (
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} domain={[0, (max: number) => Math.ceil(max * 1.15) || 10]} />
                    )}
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-2 text-base" />} />
                    {effMetrics.includes('commits') && (
                      <Bar yAxisId="left" dataKey="commits" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    )}
                    {effMetrics.includes('lines_added') && (
                      <Area
                        yAxisId="left"
                        dataKey="lines_added"
                        fill="var(--chart-4)"
                        fillOpacity={0.18}
                        stroke="var(--chart-4)"
                        strokeWidth={1.5}
                        dot={false}
                        name="Lines (×100)"
                      />
                    )}
                    {effMetrics.includes('tasks') && (
                      <Line yAxisId={lineAxisId} dataKey="tasks" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                    )}
                    {effMetrics.includes('reviews') && (
                      <Line yAxisId={lineAxisId} dataKey="reviews" stroke="var(--chart-3)" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                    )}
                    {effMetrics.includes('reports') && (
                      <Line yAxisId={lineAxisId} dataKey="reports" stroke="var(--chart-5)" strokeWidth={1.5} dot={false} />
                    )}
                  </ComposedChart>
                )
              })()}
            </ChartContainer>
          )}
      </div>

      {/* Delta summary — visible only when Compare toggle is on */}
      {!isIso && comparePrevious && delta && (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <span className="text-base font-medium text-muted-foreground">{t('progress.vsFirstHalf')}:</span>
          {delta.map(d => {
            const pct = d.prev > 0 ? Math.round(((d.curr - d.prev) / d.prev) * 100) : null
            const up = pct !== null && pct >= 0
            const metricColor = METRICS.find(m => m.id === d.key)?.color
            return (
              <div key={d.key} className="flex items-center gap-1.5 text-base">
                <span className="capitalize font-medium" style={{ color: metricColor ?? 'var(--muted-foreground)' }}>
                  {d.key}:
                </span>
                <span className={cn('font-semibold', up ? 'text-green-600' : 'text-red-500')}>
                  {pct !== null ? (up ? `↑ +${pct}%` : `↓ ${pct}%`) : '—'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})
