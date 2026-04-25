import { GitCommit } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipContent, TooltipProvider, Tooltip as UITooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useProgressStore, type TaskPerformanceData } from '@/stores/useProgressStore'
import { SectionHeader } from './SectionHeader'

const TYPE_COLORS: Record<string, string> = {
  bug: 'var(--chart-1)',
  feature: 'var(--chart-2)',
  refactor: 'var(--chart-3)',
  task: 'var(--chart-4)',
  support: 'var(--chart-6)',
  other: 'var(--chart-5)',
}

function StatCard({ label, value, sub, highlight, tooltip }: { label: string; value: string; sub?: string; highlight?: 'green' | 'red' | 'neutral'; tooltip?: string }) {
  const card = (
    <div className="rounded-xl bg-muted/40 p-4 space-y-1 cursor-default">
      <p className="text-base text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums', highlight === 'green' ? 'text-green-600' : highlight === 'red' ? 'text-red-500' : '')}>{value}</p>
      {sub && <p className="text-base text-muted-foreground">{sub}</p>}
    </div>
  )
  if (!tooltip) return card
  return (
    <TooltipProvider>
      <UITooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-center leading-snug">
          {tooltip}
        </TooltipContent>
      </UITooltip>
    </TooltipProvider>
  )
}

const CHART_CONFIG = {
  tasks: { label: 'Tasks', color: 'var(--chart-1)' },
  on_time: { label: 'On Time', color: 'var(--chart-2)' },
  rate: { label: 'Rate %', color: 'var(--chart-2)' },
}

export const TaskPerformancePanel = memo(function TaskPerformancePanel({
  userId,
  isolated = false,
  dateFrom,
  dateTo,
  projectId,
  variant = 'full',
  hideTitle = false,
  noRootPadding = false,
}: {
  userId: string
  isolated?: boolean
  dateFrom?: string
  dateTo?: string
  projectId?: string | null
  variant?: 'full' | 'onTimeOnly'
  hideTitle?: boolean
  noRootPadding?: boolean
}) {
  const { t } = useTranslation()
  const { taskPerf, fetchTaskPerf } = useProgressStore()
  const isIso = Boolean(isolated && dateFrom && dateTo)
  const [isoPerf, setIsoPerf] = useState<TaskPerformanceData | null>(null)
  const [isoLoading, setIsoLoading] = useState(false)

  useEffect(() => {
    if (!isIso || !dateFrom || !dateTo) {
      setIsoPerf(null)
      return
    }
    let cancelled = false
    setIsoLoading(true)
    void window.api.progress.getTaskPerformance(userId, dateFrom, dateTo, projectId ?? undefined).then(res => {
      if (cancelled) return
      if (res?.status === 'success' && res.data) setIsoPerf(res.data as TaskPerformanceData)
      else setIsoPerf(null)
      setIsoLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [userId, dateFrom, dateTo, projectId, isIso])

  useEffect(() => {
    if (isIso) return
    const now = new Date()
    const fmtLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const to = fmtLocal(now)
    const past = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 180)
    const from = fmtLocal(past)
    void fetchTaskPerf(userId, from, to, false, projectId ?? undefined)
  }, [userId, fetchTaskPerf, isIso, projectId])

  const effData = isIso ? isoPerf : taskPerf.data
  const effLoading = isIso ? isoLoading : taskPerf.loading
  const rootPad = noRootPadding ? 'p-0' : 'p-6'

  const { totals, onTimeRate, donutData, cycleBarData } = useMemo(() => {
    if (!effData) return { totals: null, onTimeRate: 0, donutData: [], cycleBarData: [] }
    const t = effData.totals
    const onTimeRate = t.total_done > 0 ? Math.round((t.on_time / t.total_done) * 100) : 0
    const donutData = effData.byType.map(r => ({
      name: r.type,
      value: Number(r.total_done),
      color: TYPE_COLORS[r.type] ?? 'var(--chart-5)',
    }))
    const cycleBarData = effData.byType.filter(r => r.avg_cycle_days != null).map(r => ({ type: r.type, days: +Number(r.avg_cycle_days).toFixed(1) }))
    return { totals: t, onTimeRate, donutData, cycleBarData }
  }, [effData])

  if (variant === 'onTimeOnly') {
    return (
      <div className={cn('space-y-5', rootPad)}>
        {!hideTitle ? (
          <SectionHeader icon={<GitCommit className="h-5 w-5 text-emerald-500" />} title={t('progress.onTimeTrend')} description={t('progress.taskPerformanceDesc')} />
        ) : null}
        {effLoading ? (
          <Skeleton className="h-[220px] w-full rounded-xl" />
        ) : effData?.onTimeTrend && effData.onTimeTrend.length > 0 ? (
          <div className="rounded-xl bg-muted/40 p-4">
            <ChartContainer config={CHART_CONFIG} className="h-[200px] w-full">
              <LineChart data={effData.onTimeTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} unit="%" />
                <ReferenceLine y={80} stroke="var(--chart-1)" strokeOpacity={0.45} strokeDasharray="4 2" label={{ value: '80%', fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <Tooltip content={<ChartTooltipContent />} formatter={v => [`${v}%`]} />
                <Line dataKey="rate" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3, fill: 'var(--chart-2)' }} name="On-time %" />
              </LineChart>
            </ChartContainer>
          </div>
        ) : (
          <div className="flex h-[200px] items-center justify-center text-base text-muted-foreground">{t('progress.noData')}</div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('space-y-5', rootPad)}>
      {!hideTitle ? (
        <SectionHeader icon={<GitCommit className="h-5 w-5 text-emerald-500" />} title={t('progress.taskPerformance')} description={t('progress.taskPerformanceDesc')} />
      ) : null}

      {effLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[240px] w-full rounded-xl" />
        </div>
      ) : !totals ? (
        <div className="flex h-[240px] items-center justify-center text-base text-muted-foreground">{t('progress.noData')}</div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label={t('progress.onTimeRate')} value={`${onTimeRate}%`} highlight={onTimeRate >= 80 ? 'green' : onTimeRate >= 60 ? 'neutral' : 'red'} tooltip={t('progress.onTimeRateTooltip')} />
            <StatCard
              label={t('progress.avgDelay')}
              value={totals.avg_delay_days != null ? `${Number(totals.avg_delay_days) > 0 ? '+' : ''}${Number(totals.avg_delay_days).toFixed(1)} ${t('progress.days')}` : '—'}
              highlight={totals.avg_delay_days != null && totals.avg_delay_days <= 0 ? 'green' : 'red'}
              tooltip={t('progress.avgDelayTooltip')}
            />
            <StatCard label={t('progress.avgCycle')} value={totals.avg_cycle_days != null ? `${Number(totals.avg_cycle_days).toFixed(1)} ${t('progress.days')}` : '—'} tooltip={t('progress.avgCycleTooltip')} />
            <StatCard label={t('progress.totalDone')} value={String(totals.total_done)} sub={t('progress.last6Months')} tooltip={t('progress.totalDoneTooltip')} />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* On-time trend */}
            <div className="rounded-xl bg-muted/40 p-4">
              <p className="text-base font-medium mb-3">{t('progress.onTimeTrend')}</p>
              {effData?.onTimeTrend && effData.onTimeTrend.length > 0 ? (
                <ChartContainer config={CHART_CONFIG} className="h-[180px] w-full">
                  <LineChart data={effData.onTimeTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} unit="%" />
                    <ReferenceLine y={80} stroke="var(--chart-1)" strokeOpacity={0.45} strokeDasharray="4 2" label={{ value: '80%', fontSize: 10, fill: 'var(--muted-foreground)' }} />
                    <Tooltip content={<ChartTooltipContent />} formatter={v => [`${v}%`]} />
                    <Line dataKey="rate" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3, fill: 'var(--chart-2)' }} name="On-time %" />
                  </LineChart>
                </ChartContainer>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-base text-muted-foreground">{t('progress.noData')}</div>
              )}
            </div>

            {/* Task type donut */}
            <div className="rounded-xl bg-muted/40 p-4">
              <p className="text-base font-medium mb-3">{t('progress.taskTypeBreakdown')}</p>
              {donutData.length > 0 ? (
                <div className="flex items-center gap-4">
                  <PieChart width={160} height={160}>
                    <Pie data={donutData} cx={75} cy={75} innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={2} stroke="none">
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const entry = payload[0]
                        const color = (entry.payload as { color: string }).color
                        return (
                          <div style={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--popover-foreground)', padding: '6px 10px' }}>
                            <div className="flex items-center gap-1.5">
                              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                              <span className="capitalize font-medium">{entry.name}</span>
                              <span className="ml-2 font-bold">{entry.value}</span>
                            </div>
                          </div>
                        )
                      }}
                    />
                  </PieChart>
                  <div className="space-y-1.5">
                    {donutData.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-base">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="capitalize">{d.name}</span>
                        <span className="font-semibold ml-auto">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[160px] flex items-center justify-center text-base text-muted-foreground">{t('progress.noData')}</div>
              )}
            </div>
          </div>

          {/* Cycle time bar */}
          {cycleBarData.length > 0 && (
            <div className="rounded-xl bg-muted/40 p-4">
              <p className="text-base font-medium mb-3">{t('progress.avgCycleByType')}</p>
              <ChartContainer config={{ days: { label: 'Days', color: 'var(--chart-3)' } }} className="h-[120px] w-full">
                <BarChart data={cycleBarData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} unit=" days" />
                  <YAxis dataKey="type" type="category" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={60} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const entry = payload[0]
                      const color = TYPE_COLORS[entry.payload?.type] ?? 'var(--chart-5)'
                      return (
                        <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-md" style={{ fontSize: 11 }}>
                          <div className="flex items-center gap-1.5 text-popover-foreground">
                            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                            <span className="capitalize font-medium">{entry.payload?.type}</span>
                            <span className="ml-2 font-bold">{entry.value} days</span>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="days" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {cycleBarData.map((entry, i) => (
                      <Cell key={`cycle-${entry.type}-${i}`} fill={TYPE_COLORS[entry.type] ?? 'var(--chart-5)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
})
