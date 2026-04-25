'use client'

import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  aggregateEvmTimeSeriesByPeriod,
  buildEVMTimeSeries,
  computeEVByAssignee,
  computeEVByPhase,
  computeEVMMetrics,
  DEFAULT_EVM_HOURS_PER_DAY,
  type EvmReportGranularity,
  evmAssigneeDisplayName,
} from '@/lib/evmCalculations'
import { evmIndexHealthCn } from '@/lib/evmUi'
import { cn } from '@/lib/utils'
import { useEVMStore } from '@/stores/useEVMStore'
import { EVMChartsEarnedValue } from './components/EVMCharts'

const chartConfig = {
  pv: { label: 'PV', color: 'var(--chart-1)' },
  ev: { label: 'EV', color: 'var(--chart-2)' },
  ac: { label: 'AC', color: 'var(--chart-3)' },
  phase: { label: 'EV by Phase', color: 'var(--chart-1)' },
  assignee: { label: 'EV by Assignee', color: 'var(--chart-2)' },
}

/** Giống Progress: khối nền muted, không viền (sidebar / nav). */
const KPI_CARD_FRAME =
  'flex flex-col gap-0 rounded-md border-0 py-0 shadow-none'

/** Cùng khung card + vùng chart co giãn theo chiều cao vùng làm việc. */
const DASHBOARD_PAIR_CHART_CARD =
  'flex min-h-0 w-full flex-1 flex-col rounded-md border-0 bg-card/40 p-4 shadow-none'
const DASHBOARD_PAIR_CHART_TITLE = 'mb-3 shrink-0 text-sm font-medium'
/** Vùng chart pie: flex-1 khi card kéo cao (cùng hàng bar). */
const DASHBOARD_PAIR_CHART_AREA = 'flex min-h-0 w-full min-w-0 flex-1 flex-col'
/** Bar chart: cùng chiều cao với pie khi xếp ngang. */
const DASHBOARD_BAR_CHART_SHELL = 'flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden pb-0'
const DASHBOARD_PAIR_CHART_H = 'h-full min-h-[200px] w-full'

/** i18n keys: dashboard KPI label → tooltip body (reuse evm.guide* where possible). */
const EVM_KPI_TOOLTIP_KEY: Record<string, string> = {
  'evm.kpiSPI': 'evm.guideSpi',
  'evm.kpiCPI': 'evm.guideCpi',
  'evm.kpiProgress': 'evm.dashboardTooltipProgress',
  'evm.kpiPV': 'evm.guidePv',
  'evm.kpiEV': 'evm.guideEv',
  'evm.kpiAC': 'evm.guideAc',
  'evm.kpiSV': 'evm.guideSv',
  'evm.kpiCV': 'evm.guideCv',
  'evm.kpiBAC': 'evm.dashboardTooltipBac',
  'evm.kpiETC': 'evm.dashboardTooltipEtc',
  'evm.kpiEAC': 'evm.guideEac',
  'evm.kpiVAC': 'evm.guideVac',
  'evm.kpiTCPI': 'evm.guideTcpi',
  'evm.kpiTSPI': 'evm.guideTspi',
}

function DashboardHoverCard({
  description,
  className,
  children,
}: {
  description: string
  className?: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'min-h-0 w-full cursor-help rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            className
          )}
        >
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm text-left text-xs leading-relaxed">
        {description}
      </TooltipContent>
    </Tooltip>
  )
}

export function EVMDashboardTab() {
  const { t } = useTranslation()
  const [sCurveGranularity, setSCurveGranularity] = useState<EvmReportGranularity>('day')
  const project = useEVMStore(s => s.project)
  const wbs = useEVMStore(s => s.wbs)
  const ac = useEVMStore(s => s.ac)
  const master = useEVMStore(s => s.master)
  const wbsDayUnits = useEVMStore(s => s.wbsDayUnits ?? [])

  const nonWorkingDays = useMemo(
    () => master.nonWorkingDays.map(n => n.date),
    [master.nonWorkingDays]
  )

  const hpd = master.hoursPerDay ?? DEFAULT_EVM_HOURS_PER_DAY
  const metrics = useMemo(
    () => computeEVMMetrics({ project, wbs, ac, hoursPerDay: hpd, nonWorkingDays, wbsDayUnits }),
    [project, wbs, ac, hpd, nonWorkingDays, wbsDayUnits]
  )

  const timeSeriesData = useMemo(
    () => buildEVMTimeSeries(project, wbs, ac, hpd, nonWorkingDays, wbsDayUnits),
    [project, wbs, ac, hpd, nonWorkingDays, wbsDayUnits]
  )

  const chartSeriesData = useMemo(
    () => aggregateEvmTimeSeriesByPeriod(timeSeriesData, sCurveGranularity),
    [timeSeriesData, sCurveGranularity]
  )

  const phases = useMemo(() => {
    const set = new Set<string>()
    for (const p of master.phases) set.add(p.code)
    wbs.forEach(r => {
      if (r.phase) set.add(r.phase)
    })
    return Array.from(set)
  }, [master.phases, wbs])

  const assignees = useMemo(() => {
    const set = new Set<string>()
    for (const a of master.assignees) set.add(a.code)
    wbs.forEach(r => {
      if (r.assignee) set.add(r.assignee)
    })
    ac.forEach(r => {
      if (r.assignee) set.add(r.assignee)
    })
    return Array.from(set)
  }, [master.assignees, wbs, ac])

  const evByPhase = useMemo(
    () => computeEVByPhase(project, wbs, ac, phases, hpd, nonWorkingDays, undefined, wbsDayUnits),
    [project, wbs, ac, phases, hpd, nonWorkingDays, wbsDayUnits]
  )

  const evByAssignee = useMemo(
    () => computeEVByAssignee(project, wbs, ac, assignees, hpd, nonWorkingDays, undefined, wbsDayUnits),
    [project, wbs, ac, assignees, hpd, nonWorkingDays, wbsDayUnits]
  )

  const assigneeNameFromWbs = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of wbs) {
      if (r.assignee && r.assigneeName) m.set(r.assignee, r.assigneeName)
    }
    return m
  }, [wbs])

  const pieData = useMemo(
    () =>
      evByPhase
        .filter(r => r.ev > 0)
        .map((r, i) => ({ name: r.phase, value: r.ev, fill: `var(--chart-${(i % 5) + 1})` })),
    [evByPhase]
  )

  const barData = useMemo(
    () =>
      evByAssignee.map(r => ({
        name: evmAssigneeDisplayName(master, r.assignee, assigneeNameFromWbs.get(r.assignee) ?? null),
        ev: r.ev,
      })),
    [evByAssignee, master, assigneeNameFromWbs]
  )

  const hasPieChart = pieData.length > 0
  const hasBarChart = barData.length > 0
  const pieBarSideBySide = hasPieChart && hasBarChart

  const reportKpisGroup1 = useMemo(
    () => [
      { labelKey: 'evm.kpiPV' as const, value: metrics.pv.toFixed(2), index: null as number | null, warn: false },
      { labelKey: 'evm.kpiEV' as const, value: metrics.ev.toFixed(2), index: null, warn: false },
      { labelKey: 'evm.kpiAC' as const, value: metrics.ac.toFixed(2), index: null, warn: false },
      { labelKey: 'evm.kpiSPI' as const, value: metrics.spi.toFixed(3), index: metrics.spi, warn: false },
      { labelKey: 'evm.kpiCPI' as const, value: metrics.cpi.toFixed(3), index: metrics.cpi, warn: false },
      { labelKey: 'evm.kpiSV' as const, value: metrics.sv.toFixed(2), index: null, warn: false },
      { labelKey: 'evm.kpiCV' as const, value: metrics.cv.toFixed(2), index: null, warn: false },
      {
        labelKey: 'evm.kpiProgress' as const,
        value: `${(metrics.progress * 100).toFixed(1)}%`,
        index: null,
        warn: false,
      },
      {
        labelKey: 'evm.kpiTCPI' as const,
        value: metrics.tcpi != null && Number.isFinite(metrics.tcpi) ? metrics.tcpi.toFixed(3) : '—',
        index: null,
        warn: false,
      },
      {
        labelKey: 'evm.kpiTSPI' as const,
        value: metrics.tspi != null && Number.isFinite(metrics.tspi) ? metrics.tspi.toFixed(3) : '—',
        index: null,
        warn: false,
      },
    ],
    [metrics]
  )

  const reportKpisGroup2 = useMemo(
    () => [
      { labelKey: 'evm.kpiBAC' as const, value: metrics.bac.toFixed(2), warn: false },
      { labelKey: 'evm.kpiEAC' as const, value: metrics.eac.toFixed(2), warn: false },
      { labelKey: 'evm.kpiETC' as const, value: metrics.etc.toFixed(2), warn: false },
      { labelKey: 'evm.kpiVAC' as const, value: metrics.vac.toFixed(2), warn: false },
    ],
    [metrics]
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-2 sm:p-3">
      <div className="shrink-0">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('evm.dashboardProjectReport')}</h3>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
          {reportKpisGroup1.map(k => (
            <DashboardHoverCard key={k.labelKey} className="h-full" description={t(EVM_KPI_TOOLTIP_KEY[k.labelKey] ?? k.labelKey)}>
              <Card
                className={cn(
                  KPI_CARD_FRAME,
                  'h-full bg-card/40',
                  k.index != null &&
                  Number.isFinite(k.index) &&
                  k.index > 0 &&
                  k.index < 1 &&
                  'bg-destructive/10',
                  k.index != null && Number.isFinite(k.index) && k.index >= 1 && 'bg-emerald-500/10 dark:bg-emerald-500/15'
                )}
              >
                <CardHeader className="gap-0 px-2 py-1 pb-0">
                  <CardTitle className="text-[9px] font-medium leading-tight text-muted-foreground">{t(k.labelKey)}</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-1 pt-0">
                  <span
                    className={cn(
                      'font-mono text-[11px] font-semibold leading-tight tabular-nums',
                      k.index != null ? evmIndexHealthCn(k.index) : 'text-foreground'
                    )}
                  >
                    {k.value}
                  </span>
                </CardContent>
              </Card>
            </DashboardHoverCard>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {reportKpisGroup2.map(k => (
            <DashboardHoverCard key={k.labelKey} className="h-full" description={t(EVM_KPI_TOOLTIP_KEY[k.labelKey] ?? k.labelKey)}>
              <Card className={cn(KPI_CARD_FRAME, 'h-full bg-card/40', k.warn && 'bg-destructive/10')}>
                <CardHeader className="gap-0 px-2 py-1 pb-0">
                  <CardTitle className="text-[9px] font-medium leading-tight text-muted-foreground">{t(k.labelKey)}</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-1 pt-0">
                  <span className={cn('font-mono text-[11px] font-semibold leading-tight tabular-nums', k.warn && 'text-destructive')}>
                    {k.value}
                  </span>
                </CardContent>
              </Card>
            </DashboardHoverCard>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <DashboardHoverCard description={t('evm.dashboardTooltipSCurve')} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col rounded-md border-0 bg-card/40 p-4 shadow-none">
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{t('evm.sectionSCurve')}</h3>
              <ToggleGroup
                type="single"
                value={sCurveGranularity}
                onValueChange={v => {
                  if (v === 'day' || v === 'month' || v === 'quarter') setSCurveGranularity(v)
                }}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="day">{t('evm.reportGranularityDay')}</ToggleGroupItem>
                <ToggleGroupItem value="month">{t('evm.reportGranularityMonth')}</ToggleGroupItem>
                <ToggleGroupItem value="quarter">{t('evm.reportGranularityQuarter')}</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="min-h-0 w-full flex-1">
              <EVMChartsEarnedValue data={chartSeriesData} className="h-full min-h-[220px]" />
            </div>
          </div>
        </DashboardHoverCard>

        {(hasPieChart || hasBarChart) && (
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col gap-4',
              pieBarSideBySide && 'lg:flex-row lg:items-stretch'
            )}
          >
            {hasPieChart && (
              <DashboardHoverCard
                description={t('evm.dashboardTooltipEvByPhase')}
                className={cn(pieBarSideBySide && 'lg:flex lg:w-[30%] lg:max-w-[30%] lg:shrink-0')}
              >
                <div className={DASHBOARD_PAIR_CHART_CARD}>
                  <h3 className={DASHBOARD_PAIR_CHART_TITLE}>{t('evm.sectionEvByPhase')}</h3>
                  <div className={DASHBOARD_PAIR_CHART_AREA}>
                    <ChartContainer
                      config={chartConfig}
                      className={cn(DASHBOARD_PAIR_CHART_H, 'aspect-auto max-w-full min-h-0 w-full min-w-0 flex-1 justify-start p-0')}
                    >
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="72%" label />
                      </PieChart>
                    </ChartContainer>
                  </div>
                </div>
              </DashboardHoverCard>
            )}
            {hasBarChart && (
              <DashboardHoverCard
                description={t('evm.dashboardTooltipEvByAssignee')}
                className={cn(pieBarSideBySide && 'lg:flex lg:min-w-0 lg:flex-1')}
              >
                <div className={DASHBOARD_PAIR_CHART_CARD}>
                  <h3 className={DASHBOARD_PAIR_CHART_TITLE}>{t('evm.sectionEvByAssignee')}</h3>
                  <div className={DASHBOARD_BAR_CHART_SHELL}>
                    {/* Một chuỗi EV: không có Legend; tránh margin.bottom lớn + XAxis height chồng (trông như vạch legend trống). Giống StatisticDialog bar: tick ngang, margin gọn. */}
                    <ChartContainer
                      config={chartConfig}
                      className={cn('mx-auto aspect-auto w-full min-w-0 flex-1 justify-start p-0', DASHBOARD_PAIR_CHART_H)}
                    >
                      <BarChart
                        accessibilityLayer
                        data={barData}
                        margin={{ top: 12, right: 8, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tickLine={false}
                          tickMargin={10}
                          axisLine={false}
                          minTickGap={14}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis width={40} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar
                          dataKey="ev"
                          fill="var(--chart-2)"
                          radius={4}
                          name="EV"
                          legendType="none"
                        />
                      </BarChart>
                    </ChartContainer>
                  </div>
                </div>
              </DashboardHoverCard>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
