'use client'

import { format } from 'date-fns'
import { startTransition, useCallback, useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import i18n from '@/lib/i18n'
import { getDateFnsLocale, getMonthDayOnlyPattern } from '@/lib/dateUtils'
import { type ChartTask, computeBurndownData, computeBurnupData, computeCFDData, computeCompletionTrendData } from './chartDataUtils'

const STATUS_LABEL_KEYS: Record<string, string> = {
  new: 'statusNew',
  in_progress: 'statusInProgress',
  in_review: 'statusInReview',
  fixed: 'statusFixed',
  feedback: 'statusFeedback',
  done: 'statusDone',
  cancelled: 'statusCancelled',
}

const DEFAULT_STATUS_COLORS: Record<string, string> = {
  new: 'var(--chart-1)',
  in_progress: 'var(--chart-2)',
  in_review: 'var(--chart-2)',
  fixed: 'var(--chart-3)',
  feedback: 'var(--chart-4)',
  done: 'var(--chart-5)',
  cancelled: 'var(--chart-6)',
}

const DEFAULT_PRIORITY_COLORS: Record<string, string> = {
  critical: 'var(--chart-1)',
  high: 'var(--chart-2)',
  medium: 'var(--chart-3)',
  low: 'var(--chart-4)',
}

function computeStatusData(tasks: ChartTask[], statusColorMap?: Record<string, string>): { name: string; value: number; fill: string }[] {
  const count: Record<string, number> = {}
  for (const t of tasks) {
    count[t.status] = (count[t.status] ?? 0) + 1
  }
  return Object.entries(count).map(([name, value]) => ({
    name,
    value,
    fill: statusColorMap?.[name] ?? DEFAULT_STATUS_COLORS[name] ?? 'var(--chart-1)',
  }))
}

function computePriorityData(tasks: ChartTask[], priorityColorMap?: Record<string, string>): { name: string; value: number; fill: string }[] {
  const count: Record<string, number> = {}
  for (const t of tasks) {
    const p = t.priority ?? 'medium'
    count[p] = (count[p] ?? 0) + 1
  }
  return Object.entries(count).map(([name, value]) => ({
    name,
    value,
    fill: priorityColorMap?.[name] ?? DEFAULT_PRIORITY_COLORS[name] ?? 'var(--chart-1)',
  }))
}

function computeAssigneeData(tasks: ChartTask[], getAssigneeDisplay: (userId: string | null) => string): { name: string; value: number }[] {
  const count: Record<string, number> = {}
  for (const t of tasks) {
    const display = t.assigneeUserId ? getAssigneeDisplay(t.assigneeUserId) : '(Unassigned)'
    count[display] = (count[display] ?? 0) + 1
  }
  return Object.entries(count).map(([name, value]) => ({ name, value }))
}

function useBurndownConfig(t: (key: string) => string) {
  return useMemo(
    () => ({
      remaining: { label: t('taskManagement.chartRemaining'), color: 'var(--chart-1)' },
      ideal: { label: t('taskManagement.chartIdeal'), color: 'var(--muted-foreground)' },
      forecast: { label: t('taskManagement.chartForecast'), color: 'var(--chart-3)' },
    }),
    [t]
  )
}

function useBurnupConfig(t: (key: string) => string) {
  return useMemo(
    () => ({
      total: { label: t('taskManagement.chartTotalScope'), color: 'var(--chart-1)' },
      completed: { label: t('taskManagement.chartCompleted'), color: 'var(--chart-2)' },
      inProgress: { label: t('taskManagement.chartInProgress'), color: 'var(--chart-3)' },
      forecast: { label: t('taskManagement.chartForecast'), color: 'var(--chart-4)' },
    }),
    [t]
  )
}

function useCFDConfig(t: (key: string) => string) {
  return useMemo(
    () => ({
      done: { label: t('taskManagement.statusDone'), color: 'var(--chart-4)' },
      fixed: { label: t('taskManagement.statusFixed'), color: 'var(--chart-3)' },
      feedback: { label: t('taskManagement.chartFeedback'), color: 'var(--chart-5)' },
      inProgress: { label: t('taskManagement.chartInProgress'), color: 'var(--chart-2)' },
      new: { label: t('taskManagement.statusNew'), color: 'var(--chart-1)' },
    }),
    [t]
  )
}

function useCompletionTrendConfig(t: (key: string) => string) {
  return useMemo(
    () => ({
      completed: { label: t('taskManagement.chartCompleted'), color: 'var(--chart-1)' },
      movingAvg: { label: t('taskManagement.chartMovingAvg'), color: 'var(--chart-2)' },
      cumulative: { label: t('taskManagement.chartCumulative'), color: 'var(--chart-3)' },
    }),
    [t]
  )
}

interface MasterItem {
  code: string
  name: string
  color?: string
}

interface TaskChartsProps {
  tasks: ChartTask[]
  users: { id: string; userCode: string; name: string }[]
  statuses?: MasterItem[]
  priorities?: MasterItem[]
  types?: MasterItem[]
  dateRange?: DateRange | undefined
}

export function TaskCharts({ tasks, users, statuses = [], priorities = [], dateRange }: TaskChartsProps) {
  const statusColorMap = useMemo(
    () => Object.fromEntries(statuses.filter((s): s is MasterItem & { color: string } => Boolean(s.color)).map(s => [s.code, s.color])),
    [statuses]
  )
  const priorityColorMap = useMemo(
    () => Object.fromEntries(priorities.filter((p): p is MasterItem & { color: string } => Boolean(p.color)).map(p => [p.code, p.color])),
    [priorities]
  )
  const { t } = useTranslation()
  const locale = getDateFnsLocale(i18n.language)
  const monthDayPattern = getMonthDayOnlyPattern(i18n.language)
  const [chartType, setChartType] = useState<'burndown' | 'burnup' | 'cfd' | 'completionTrend' | 'status' | 'priority' | 'assignee'>('burndown')

  const setChartTypeDeferred = useCallback((next: typeof chartType) => {
    startTransition(() => setChartType(next))
  }, [])

  const burndownConfig = useBurndownConfig(t)
  const burnupConfig = useBurnupConfig(t)
  const cfdConfig = useCFDConfig(t)
  const completionTrendConfig = useCompletionTrendConfig(t)

  const getAssigneeDisplay = useCallback(
    (userId: string | null) => {
      if (!userId) return '-'
      const u = users.find(us => us.id === userId)
      return u ? u.name : '-'
    },
    [users]
  )

  // Burndown / Burnup / CFD / Completion: O(ngày × task) — chỉ tính khi đúng tab để tránh đứng UI khi mở Chart.
  const burndownData = useMemo(
    () => (chartType === 'burndown' ? computeBurndownData(tasks, dateRange) : []),
    [chartType, tasks, dateRange]
  )
  const burnupData = useMemo(
    () => (chartType === 'burnup' ? computeBurnupData(tasks, dateRange) : []),
    [chartType, tasks, dateRange]
  )
  const cfdData = useMemo(() => (chartType === 'cfd' ? computeCFDData(tasks, dateRange) : []), [chartType, tasks, dateRange])
  const completionTrendData = useMemo(
    () => (chartType === 'completionTrend' ? computeCompletionTrendData(tasks, dateRange) : []),
    [chartType, tasks, dateRange]
  )
  const statusData = useMemo(() => computeStatusData(tasks, statusColorMap), [tasks, statusColorMap])
  const priorityData = useMemo(() => computePriorityData(tasks, priorityColorMap), [tasks, priorityColorMap])
  const assigneeData = useMemo(() => computeAssigneeData(tasks, getAssigneeDisplay), [tasks, getAssigneeDisplay])

  const formatDate = (key: string) => format(new Date(key), monthDayPattern, { locale })

  const burndownNoData = burndownData.length === 0 || burndownData.every(d => d.remaining === 0 && d.ideal === 0)
  const burnupNoData = burnupData.length === 0 || burnupData.every(d => d.completed === 0 && d.total === 0)
  const completionTrendNoData = completionTrendData.length === 0
  const hasForecast = burndownData.some(d => d.forecast !== null)

  if (tasks.length === 0) {
    return <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">{t('taskManagement.chartNoData')}</div>
  }

  return (
    <Tabs value={chartType} onValueChange={v => setChartTypeDeferred(v as typeof chartType)} className="flex-1 flex flex-col min-h-0">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 shrink-0 mb-2">
        <TabsList className="w-fit flex-wrap h-auto gap-1">
          <TabsTrigger value="burndown" className="text-xs">
            {t('taskManagement.chartBurndown')}
          </TabsTrigger>
          <TabsTrigger value="burnup" className="text-xs">
            {t('taskManagement.chartBurnup')}
          </TabsTrigger>
          <TabsTrigger value="cfd" className="text-xs">
            {t('taskManagement.chartCFD')}
          </TabsTrigger>
          <TabsTrigger value="completionTrend" className="text-xs">
            {t('taskManagement.chartCompletionTrend')}
          </TabsTrigger>
          <TabsTrigger value="status" className="text-xs">
            {t('taskManagement.chartStatus')}
          </TabsTrigger>
          <TabsTrigger value="priority" className="text-xs">
            {t('taskManagement.chartPriority')}
          </TabsTrigger>
          <TabsTrigger value="assignee" className="text-xs">
            {t('taskManagement.chartAssignee')}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="burndown" className="flex-1 min-h-0 mt-0">
        <div className="flex flex-col h-full min-h-[300px]">
          {burndownNoData ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">{t('taskManagement.chartNoData')}</div>
          ) : (
            <ChartContainer config={burndownConfig} className="w-full flex-1 min-h-[300px]">
              <LineChart data={burndownData} margin={{ top: 25, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDate} tickLine={false} tickMargin={10} axisLine={false} />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} labelFormatter={formatDate} />
                <ChartLegend content={<ChartLegendContent payload={undefined} />} />
                <Line type="monotone" dataKey="remaining" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="ideal" stroke="var(--muted-foreground)" strokeDasharray="5 5" dot={false} />
                {hasForecast && <Line type="monotone" dataKey="forecast" stroke="var(--chart-3)" strokeDasharray="3 3" strokeWidth={2} dot={false} connectNulls />}
              </LineChart>
            </ChartContainer>
          )}
        </div>
      </TabsContent>

      <TabsContent value="burnup" className="flex-1 min-h-0 mt-0">
        <div className="flex flex-col h-full min-h-[300px]">
          {burnupNoData ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">{t('taskManagement.chartNoData')}</div>
          ) : (
            <ChartContainer config={burnupConfig} className="w-full flex-1 min-h-[300px]">
              <ComposedChart data={burnupData} margin={{ top: 25, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDate} tickLine={false} tickMargin={10} axisLine={false} />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} labelFormatter={formatDate} />
                <ChartLegend content={<ChartLegendContent payload={undefined} />} />
                <Area type="monotone" dataKey="total" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.1} strokeDasharray="5 5" />
                <Area type="monotone" dataKey="completed" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.5} strokeWidth={2} />
                <Line type="monotone" dataKey="inProgress" stroke="var(--chart-3)" strokeWidth={1.5} dot={false} />
                {burnupData.some(d => d.forecast !== null) && (
                  <Line type="monotone" dataKey="forecast" stroke="var(--chart-4)" strokeDasharray="3 3" strokeWidth={2} dot={false} connectNulls />
                )}
              </ComposedChart>
            </ChartContainer>
          )}
        </div>
      </TabsContent>

      <TabsContent value="cfd" className="flex-1 min-h-0 mt-0">
        <div className="flex flex-col h-full min-h-[300px]">
          <ChartContainer config={cfdConfig} className="w-full flex-1 min-h-[300px]">
            <AreaChart data={cfdData} margin={{ top: 25, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={formatDate} tickLine={false} tickMargin={10} axisLine={false} />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} labelFormatter={formatDate} />
              <ChartLegend content={<ChartLegendContent payload={undefined} />} />
              <Area type="monotone" dataKey="done" stackId="1" stroke="var(--chart-4)" fill="var(--chart-4)" fillOpacity={0.6} />
              <Area type="monotone" dataKey="fixed" stackId="1" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.6} />
              <Area type="monotone" dataKey="feedback" stackId="1" stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.6} />
              <Area type="monotone" dataKey="inProgress" stackId="1" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.6} />
              <Area type="monotone" dataKey="new" stackId="1" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.6} />
            </AreaChart>
          </ChartContainer>
        </div>
      </TabsContent>

      <TabsContent value="completionTrend" className="flex-1 min-h-0 mt-0">
        <div className="flex flex-col h-full min-h-[300px]">
          {completionTrendNoData ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">{t('taskManagement.chartNoData')}</div>
          ) : (
            <ChartContainer config={completionTrendConfig} className="w-full flex-1 min-h-[300px]">
              <ComposedChart data={completionTrendData} margin={{ top: 25, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDate} tickLine={false} tickMargin={10} axisLine={false} />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <ChartTooltip content={<ChartTooltipContent />} labelFormatter={formatDate} />
                <ChartLegend content={<ChartLegendContent payload={undefined} />} />
                <Bar yAxisId="left" dataKey="completed" fill="var(--chart-1)" radius={4} />
                <Line yAxisId="left" type="monotone" dataKey="movingAvg" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              </ComposedChart>
            </ChartContainer>
          )}
        </div>
      </TabsContent>

      <TabsContent value="status" className="flex-1 min-h-0 mt-0">
        <div className="flex flex-col h-full min-h-[300px]">
          {statusData.length === 0 ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">{t('taskManagement.chartNoData')}</div>
          ) : (
            <ChartContainer
              config={Object.fromEntries(statusData.map(s => [s.name, { label: t(`taskManagement.${STATUS_LABEL_KEYS[s.name] ?? s.name}`) || s.name, color: s.fill }]))}
              className="w-full flex-1 min-h-[300px]"
            >
              <PieChart accessibilityLayer>
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent payload={undefined} />} />
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="80%"
                  label={({ name, value }) => `${t(`taskManagement.${STATUS_LABEL_KEYS[name] ?? name}`)}: ${value}`}
                >
                  {statusData.map((entry, _i) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          )}
        </div>
      </TabsContent>

      <TabsContent value="priority" className="flex-1 min-h-0 mt-0">
        <div className="flex flex-col h-full min-h-[300px]">
          {priorityData.length === 0 ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">{t('taskManagement.chartNoData')}</div>
          ) : (
            <ChartContainer
              config={Object.fromEntries(
                priorityData.map(s => [s.name, { label: t(`taskManagement.priority${s.name.charAt(0).toUpperCase() + s.name.slice(1)}`) || s.name, color: s.fill }])
              )}
              className="w-full flex-1 min-h-[300px]"
            >
              <BarChart data={priorityData} layout="vertical" margin={{ top: 25, right: 30, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={70} tickFormatter={n => t(`taskManagement.priority${n.charAt(0).toUpperCase() + n.slice(1)}`) || n} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--chart-1)" radius={4}>
                  {priorityData.map(entry => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </TabsContent>

      <TabsContent value="assignee" className="flex-1 min-h-0 mt-0">
        <div className="flex flex-col h-full min-h-[300px]">
          {assigneeData.length === 0 ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">{t('taskManagement.chartNoData')}</div>
          ) : (
            <ChartContainer config={{ value: { label: 'Tasks', color: 'var(--chart-1)' } }} className="w-full flex-1 min-h-[300px]">
              <BarChart data={assigneeData} margin={{ top: 25, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--chart-1)" radius={4} />
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}
