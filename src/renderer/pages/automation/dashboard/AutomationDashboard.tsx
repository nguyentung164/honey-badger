import { format } from 'date-fns'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts'
import type { TestCaseResult, TestRunSummary } from 'shared/automation/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface Props {
  projectId: string
}

interface DashboardData {
  runs: TestRunSummary[]
  last?: TestRunSummary
  lastResults: TestCaseResult[]
  flaky: Array<{ caseId: string; passes: number; fails: number }>
}

const donutConfig: ChartConfig = {
  passed: { label: 'Passed', theme: { light: 'hsl(142 71% 45%)', dark: 'hsl(142 71% 50%)' } },
  failed: { label: 'Failed', theme: { light: 'hsl(0 84% 60%)', dark: 'hsl(0 84% 60%)' } },
  skipped: { label: 'Skipped', theme: { light: 'hsl(220 9% 56%)', dark: 'hsl(220 9% 70%)' } },
  flaky: { label: 'Flaky', theme: { light: 'hsl(38 92% 50%)', dark: 'hsl(38 92% 60%)' } },
}

const trendConfig: ChartConfig = {
  passRate: { label: 'Pass rate', theme: { light: 'hsl(220 90% 56%)', dark: 'hsl(220 90% 66%)' } },
}

const durationConfig: ChartConfig = {
  duration: { label: 'Duration (s)', theme: { light: 'hsl(280 65% 60%)', dark: 'hsl(280 65% 70%)' } },
}

export function AutomationDashboard({ projectId }: Props) {
  const { t } = useTranslation()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void window.api.automation.dashboard
      .summary(projectId)
      .then(res => {
        if (cancelled) return
        if (res.status === 'success' && res.data) setData(res.data as DashboardData)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (loading && !data) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{t('automation.common.loading')}</div>
  }
  if (!data) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{t('automation.dashboard.empty')}</div>
  }

  const last = data.last
  const donutData = last
    ? [
        { name: 'passed', value: last.passed, fill: 'var(--color-passed)' },
        { name: 'failed', value: last.failed, fill: 'var(--color-failed)' },
        { name: 'skipped', value: last.skipped, fill: 'var(--color-skipped)' },
        { name: 'flaky', value: last.flaky, fill: 'var(--color-flaky)' },
      ].filter(d => d.value > 0)
    : []

  const trendData = data.runs
    .slice()
    .reverse()
    .slice(-20)
    .map(r => ({
      label: r.startedAt ? format(new Date(r.startedAt), 'MM-dd HH:mm') : r.id.slice(0, 8),
      passRate: r.total > 0 ? Math.round((r.passed / r.total) * 100) : 0,
    }))

  const durationByBrowser = (() => {
    const map = new Map<string, { duration: number; count: number }>()
    for (const result of data.lastResults) {
      const cur = map.get(result.browser) ?? { duration: 0, count: 0 }
      cur.duration += result.durationMs
      cur.count += 1
      map.set(result.browser, cur)
    }
    return Array.from(map.entries()).map(([browser, value]) => ({
      browser: browser.toUpperCase(),
      duration: Math.round(value.duration / 1000),
    }))
  })()

  const flaky = data.flaky.slice(0, 10)

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="grid shrink-0 grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('automation.dashboard.lastRun')}</CardTitle>
          </CardHeader>
          <CardContent>
            {last ? (
              <>
                <div className="text-2xl font-bold capitalize">{last.status}</div>
                <div className="text-xs text-muted-foreground">
                  {last.passed}/{last.total} pass · {(last.durationMs / 1000).toFixed(1)}s
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('automation.dashboard.runs')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.runs.length}</div>
            <div className="text-xs text-muted-foreground">{t('automation.dashboard.recentRuns')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('automation.dashboard.flakyCount')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.flaky.length}</div>
            <div className="text-xs text-muted-foreground">{t('automation.dashboard.flakyHint')}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-4 auto-rows-[minmax(0,1fr)] lg:grid-cols-2 lg:grid-rows-2 [&>*]:min-h-0 [&>*]:min-w-0">
        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle className="text-sm">{t('automation.dashboard.distribution')}</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            {donutData.length > 0 ? (
              <ChartContainer config={donutConfig} className="aspect-auto h-full min-h-0 w-full min-w-0 flex-1">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {donutData.map(d => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
                {t('automation.dashboard.empty')}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle className="text-sm">{t('automation.dashboard.passRateTrend')}</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            {trendData.length > 0 ? (
              <ChartContainer config={trendConfig} className="aspect-auto h-full min-h-0 w-full min-w-0 flex-1">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="passRate" stroke="var(--color-passRate)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
                {t('automation.dashboard.empty')}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle className="text-sm">{t('automation.dashboard.durationByBrowser')}</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            {durationByBrowser.length > 0 ? (
              <ChartContainer config={durationConfig} className="aspect-auto h-full min-h-0 w-full min-w-0 flex-1">
                <BarChart data={durationByBrowser}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="browser" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="duration" fill="var(--color-duration)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
                {t('automation.dashboard.empty')}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle className="text-sm">{t('automation.dashboard.topFlaky')}</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-auto">
            {flaky.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{t('automation.dashboard.empty')}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('automation.runs.columns.case')}</TableHead>
                    <TableHead className="w-16 text-right">P</TableHead>
                    <TableHead className="w-16 text-right">F</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flaky.map(f => (
                    <TableRow key={f.caseId}>
                      <TableCell className="font-mono text-xs">{f.caseId}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{f.passes}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-destructive">{f.fails}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
