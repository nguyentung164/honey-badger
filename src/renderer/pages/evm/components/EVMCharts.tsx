'use client'

import { useTranslation } from 'react-i18next'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatDateDisplay } from '@/lib/dateUtils'
import type { EVMTimeSeriesPoint } from '@/lib/evmCalculations'
import { cn } from '@/lib/utils'

function tooltipFormatter(
  value: unknown,
  name: string | number,
  item: { color?: string },
) {
  const formatted = value != null && typeof value === 'number' ? value.toFixed(2) : String(value ?? '')
  return (
    <>
      <div
        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
        style={{ backgroundColor: item?.color ?? 'var(--chart-1)' }}
      />
      <div className="flex flex-1 items-center justify-between leading-none">
        <span className="text-muted-foreground">{String(name)}</span>
        <span className="font-mono font-medium text-foreground tabular-nums">{formatted}</span>
      </div>
    </>
  )
}

const chartConfig = {
  pv: { label: 'PV (Planned Value)', color: 'var(--chart-1)' },
  ev: { label: 'EV (Earned Value)', color: 'var(--chart-2)' },
  ac: { label: 'AC (Actual Cost)', color: 'var(--chart-3)' },
  cv: { label: 'CV (Cost Variance)', color: 'var(--chart-4)' },
  sv: { label: 'SV (Schedule Variance)', color: 'var(--chart-5)' },
  spi: { label: 'SPI', color: 'var(--chart-1)' },
  cpi: { label: 'CPI', color: 'var(--chart-2)' },
}

function ChartEmpty() {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 px-4 py-6 text-sm">
      <p className="font-medium text-foreground">{t('evm.chartEmptyTitle')}</p>
      <p className="mt-1 text-muted-foreground">{t('evm.chartEmptyHint')}</p>
    </div>
  )
}

function useEvmChartDateAxis() {
  const { i18n } = useTranslation()
  const tickFormatter = (v: string | number) => formatDateDisplay(String(v), i18n.language)
  const labelFormatter = (label: unknown) => formatDateDisplay(label != null ? String(label) : '', i18n.language)
  return { tickFormatter, labelFormatter }
}

export function EVMChartsEarnedValue({ data, className }: { data: EVMTimeSeriesPoint[]; className?: string }) {
  const { tickFormatter, labelFormatter } = useEvmChartDateAxis()
  if (!data.length) return <ChartEmpty />
  return (
    <ChartContainer config={chartConfig} className={cn('aspect-auto min-h-[200px] w-full min-w-0', className)}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={tickFormatter}
        />
        <YAxis tickLine={false} tickMargin={8} width={40} />
        <ChartTooltip
          content={<ChartTooltipContent formatter={tooltipFormatter} labelFormatter={labelFormatter} />}
        />
        <Area type="monotone" dataKey="pv" stroke={chartConfig.pv.color} fill={chartConfig.pv.color} fillOpacity={0.3} name={chartConfig.pv.label} />
        <Area type="monotone" dataKey="ev" stroke={chartConfig.ev.color} fill={chartConfig.ev.color} fillOpacity={0.3} name={chartConfig.ev.label} />
        <Area type="monotone" dataKey="ac" stroke={chartConfig.ac.color} fill={chartConfig.ac.color} fillOpacity={0.3} name={chartConfig.ac.label} />
      </AreaChart>
    </ChartContainer>
  )
}

export function EVMChartsVariance({ data, className }: { data: EVMTimeSeriesPoint[]; className?: string }) {
  const { tickFormatter, labelFormatter } = useEvmChartDateAxis()
  if (!data.length) return <ChartEmpty />
  return (
    <ChartContainer config={chartConfig} className={cn('aspect-auto min-h-[200px] w-full min-w-0', className)}>
      <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={tickFormatter}
        />
        <YAxis tickLine={false} tickMargin={8} width={40} />
        <ChartTooltip
          content={<ChartTooltipContent formatter={tooltipFormatter} labelFormatter={labelFormatter} />}
        />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
        <Line type="monotone" dataKey="cv" stroke={chartConfig.cv.color} dot={false} name={chartConfig.cv.label} />
        <Line type="monotone" dataKey="sv" stroke={chartConfig.sv.color} dot={false} name={chartConfig.sv.label} />
      </LineChart>
    </ChartContainer>
  )
}

export function EVMChartsIndices({ data, className }: { data: EVMTimeSeriesPoint[]; className?: string }) {
  const { tickFormatter, labelFormatter } = useEvmChartDateAxis()
  if (!data.length) return <ChartEmpty />
  return (
    <ChartContainer config={chartConfig} className={cn('aspect-auto min-h-[200px] w-full min-w-0', className)}>
      <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={tickFormatter}
        />
        <YAxis tickLine={false} tickMargin={8} width={40} domain={[0, 'auto']} />
        <ChartTooltip
          content={<ChartTooltipContent formatter={tooltipFormatter} labelFormatter={labelFormatter} />}
        />
        <ReferenceLine y={1} stroke="var(--muted-foreground)" strokeDasharray="3 3" label={{ value: '1', position: 'right' }} />
        <Line type="monotone" dataKey="spi" stroke={chartConfig.spi.color} dot={false} name={chartConfig.spi.label} />
        <Line type="monotone" dataKey="cpi" stroke={chartConfig.cpi.color} dot={false} name={chartConfig.cpi.label} />
      </LineChart>
    </ChartContainer>
  )
}
