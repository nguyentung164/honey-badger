'use client'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { BarChart3, Table2 } from 'lucide-react'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  computeEVByAssignee,
  computeEVByPhase,
  DEFAULT_EVM_HOURS_PER_DAY,
  evmAssigneeDisplayName,
} from '@/lib/evmCalculations'
import { cn } from '@/lib/utils'
import { useEVMStore } from '@/stores/useEVMStore'

function fmt(n: number, d: number) {
  return Number.isFinite(n) ? n.toFixed(d) : '—'
}

/** Cùng độ rộng cột cho bảng Phase và Assignee (`table-fixed` + colgroup). */
const EVM_REPORT_COL_WIDTHS = [
  '13rem',
  '5.25rem',
  '5.25rem',
  '5.25rem',
  '5.25rem',
  '5.25rem',
  '5.25rem',
  '4.5rem',
  '4.5rem',
  '4.75rem',
] as const

function EvmReportColGroup() {
  return (
    <colgroup>
      {EVM_REPORT_COL_WIDTHS.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  )
}

const reportTableClass = 'table-fixed min-w-[640px]'
const reportLabelCellClass = 'max-w-0 truncate'
const reportNumHeadClass = 'text-right'
const reportNumCellClass = 'text-right font-mono tabular-nums'

const reportBarChartConfig = {
  pv: { label: 'PV', color: 'var(--chart-1)' },
  ev: { label: 'EV', color: 'var(--chart-2)' },
  ac: { label: 'AC', color: 'var(--chart-3)' },
}

function truncateTickLabel(s: string, max = 14) {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function EvmReportPvEvAcBarChart({
  data,
  title,
  emptyLabel,
  className,
}: {
  data: { name: string; pv: number; ev: number; ac: number }[]
  title: string
  emptyLabel: string
  className?: string
}) {
  if (data.length === 0) {
    return (
      <div
        className={cn(
          'flex min-h-[200px] flex-1 items-center justify-center rounded-md border border-border/40 bg-card/40 p-6',
          className
        )}
      >
        <p className="text-center text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    )
  }

  const chartH = Math.max(280, Math.min(720, data.length * 44 + 120))

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border/40 bg-card/40 p-4',
        className
      )}
    >
      <h3 className="mb-3 shrink-0 text-sm font-medium text-foreground">{title}</h3>
      <div className="min-h-0 w-full min-w-0 flex-1">
        <ChartContainer
          config={reportBarChartConfig}
          className="aspect-auto h-full min-h-[240px] w-full min-w-0"
          rechartsHeight={chartH}
        >
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
            accessibilityLayer
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={truncateTickLabel}
            />
            <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: 'var(--muted)', opacity: 0.35 }} />
            <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" payload={undefined} />} />
            <Bar dataKey="pv" fill="var(--color-pv)" radius={[0, 2, 2, 0]} maxBarSize={28} />
            <Bar dataKey="ev" fill="var(--color-ev)" radius={[0, 2, 2, 0]} maxBarSize={28} />
            <Bar dataKey="ac" fill="var(--color-ac)" radius={[0, 2, 2, 0]} maxBarSize={28} />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  )
}

export function EvmReportTab() {
  const { t } = useTranslation()
  const project = useEVMStore(s => s.project)
  const wbs = useEVMStore(s => s.wbs)
  const ac = useEVMStore(s => s.ac)
  const master = useEVMStore(s => s.master)
  const wbsDayUnits = useEVMStore(s => s.wbsDayUnits ?? [])
  const nonWorkingDays = useMemo(() => master.nonWorkingDays.map(n => n.date), [master.nonWorkingDays])
  const hpd = master.hoursPerDay ?? DEFAULT_EVM_HOURS_PER_DAY

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

  const phaseNotes = master.phaseReportNotes ?? {}
  const assigneeNotes = master.assigneeReportNotes ?? {}

  const byPhase = useMemo(
    () => computeEVByPhase(project, wbs, ac, phases, hpd, nonWorkingDays, phaseNotes, wbsDayUnits),
    [project, wbs, ac, phases, hpd, nonWorkingDays, phaseNotes, wbsDayUnits]
  )

  const assigneeNameFromWbs = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of wbs) {
      if (r.assignee && r.assigneeName) m.set(r.assignee, r.assigneeName)
    }
    return m
  }, [wbs])

  const byAssignee = useMemo(
    () => computeEVByAssignee(project, wbs, ac, assignees, hpd, nonWorkingDays, assigneeNotes, wbsDayUnits),
    [project, wbs, ac, assignees, hpd, nonWorkingDays, assigneeNotes, wbsDayUnits]
  )

  const phaseChartData = useMemo(
    () =>
      byPhase.map(r => ({
        name: r.phase || '—',
        pv: r.pv,
        ev: r.ev,
        ac: r.ac,
      })),
    [byPhase]
  )

  const assigneeChartData = useMemo(
    () =>
      byAssignee.map(r => ({
        name: evmAssigneeDisplayName(master, r.assignee, assigneeNameFromWbs.get(r.assignee) ?? null),
        pv: r.pv,
        ev: r.ev,
        ac: r.ac,
      })),
    [byAssignee, master, assigneeNameFromWbs]
  )

  const [sub, setSub] = useState<'phase' | 'assignee'>('phase')
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table')

  if (!project.id) {
    return <p className="p-4 text-muted-foreground text-sm">{t('evm.ganttNoProject')}</p>
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4">
      <Tabs
        value={sub}
        onValueChange={v => {
          if (v === 'phase' || v === 'assignee') setSub(v)
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex shrink-0 items-center justify-between gap-3">
          <TabsList className="w-fit">
            <TabsTrigger value="phase">{t('evm.reportPhaseTab')}</TabsTrigger>
            <TabsTrigger value="assignee">{t('evm.reportAssigneeTab')}</TabsTrigger>
          </TabsList>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={v => {
              if (v === 'table' || v === 'chart') setViewMode(v)
            }}
            variant="outline"
            size="sm"
            className="shrink-0"
          >
            <ToggleGroupItem
              value="table"
              aria-label={t('evm.reportViewTableAria')}
              title={t('evm.reportViewTable')}
              className="px-2.5 border-none"
            >
              <Table2 className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="chart"
              aria-label={t('evm.reportViewChartAria')}
              title={t('evm.reportViewChart')}
              className="px-2.5 border-none"
            >
              <BarChart3 className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <TabsContent value="phase" className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden">
          {viewMode === 'table' ? (
            <div className="min-h-0 flex-1 overflow-auto overflow-x-auto rounded-md border border-border/40">
              <Table className={reportTableClass}>
                <EvmReportColGroup />
                <TableHeader sticky>
                  <TableRow>
                    <TableHead>{t('evm.tablePhase')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiBAC')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiPV')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiEV')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiAC')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiSV')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiCV')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiSPI')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiCPI')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiProgress')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byPhase.map(r => (
                    <TableRow key={r.phase}>
                      <TableCell className={reportLabelCellClass} title={r.phase}>
                        {r.phase}
                      </TableCell>
                      <TableCell className={reportNumCellClass}>{fmt(r.bac, 2)}</TableCell>
                      <TableCell className={reportNumCellClass}>{fmt(r.pv, 2)}</TableCell>
                      <TableCell className={reportNumCellClass}>{fmt(r.ev, 2)}</TableCell>
                      <TableCell className={reportNumCellClass}>{fmt(r.ac, 2)}</TableCell>
                      <TableCell className={reportNumCellClass}>{fmt(r.sv, 2)}</TableCell>
                      <TableCell className={reportNumCellClass}>{fmt(r.cv, 2)}</TableCell>
                      <TableCell className={reportNumCellClass}>{fmt(r.spi, 3)}</TableCell>
                      <TableCell className={reportNumCellClass}>{fmt(r.cpi, 3)}</TableCell>
                      <TableCell className={reportNumCellClass}>{(r.progress * 100).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
              <EvmReportPvEvAcBarChart
                data={phaseChartData}
                title={t('evm.reportChartPvEvAcTitle', { dimension: t('evm.tablePhase') })}
                emptyLabel={t('evm.reportChartEmpty')}
                className="min-h-0 flex-1"
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="assignee" className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden">
          {viewMode === 'table' ? (
            <div className="min-h-0 flex-1 overflow-auto overflow-x-auto rounded-md border border-border/40">
              <Table className={reportTableClass}>
                <EvmReportColGroup />
                <TableHeader sticky>
                  <TableRow>
                    <TableHead>{t('evm.tableAssignee')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiBAC')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiPV')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiEV')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiAC')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiSV')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiCV')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiSPI')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiCPI')}</TableHead>
                    <TableHead className={reportNumHeadClass}>{t('evm.kpiProgress')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byAssignee.map(r => {
                    const label = evmAssigneeDisplayName(master, r.assignee, assigneeNameFromWbs.get(r.assignee) ?? null)
                    return (
                      <TableRow key={r.assignee}>
                        <TableCell className={reportLabelCellClass} title={label}>
                          {label}
                        </TableCell>
                        <TableCell className={reportNumCellClass}>{fmt(r.bac, 2)}</TableCell>
                        <TableCell className={reportNumCellClass}>{fmt(r.pv, 2)}</TableCell>
                        <TableCell className={reportNumCellClass}>{fmt(r.ev, 2)}</TableCell>
                        <TableCell className={reportNumCellClass}>{fmt(r.ac, 2)}</TableCell>
                        <TableCell className={reportNumCellClass}>{fmt(r.sv, 2)}</TableCell>
                        <TableCell className={reportNumCellClass}>{fmt(r.cv, 2)}</TableCell>
                        <TableCell className={reportNumCellClass}>{fmt(r.spi, 3)}</TableCell>
                        <TableCell className={reportNumCellClass}>{fmt(r.cpi, 3)}</TableCell>
                        <TableCell className={reportNumCellClass}>{(r.progress * 100).toFixed(1)}%</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
              <EvmReportPvEvAcBarChart
                data={assigneeChartData}
                title={t('evm.reportChartPvEvAcTitle', { dimension: t('evm.tableAssignee') })}
                emptyLabel={t('evm.reportChartEmpty')}
                className="min-h-0 flex-1"
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
