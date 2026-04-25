'use client'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { acMatrixRowLabel, aggregateAcWorkingHoursByLineAndDate, isEvmCalendarWorkdayYmd } from '@/lib/evmCalculations'
import type { ACRow, EVMProject } from 'shared/types/evm'
import { cn } from '@/lib/utils'
import { useEVMStore } from '@/stores/useEVMStore'

const MAX_DATE_COLS = 120

type Props = {
  project: EVMProject
  ac: ACRow[]
  className?: string
}

export function AcHoursMatrixPanel({ project, ac, className }: Props) {
  const { t } = useTranslation()
  const nonWorkingDays = useEVMStore(s => s.master.nonWorkingDays)
  const nonWorkingList = useMemo(() => nonWorkingDays.map(n => n.date), [nonWorkingDays])

  const { rowKeys, dates, cellHours, rowTotals } = useMemo(() => {
    const byLine = aggregateAcWorkingHoursByLineAndDate(ac)
    const dateSet = new Set<string>()
    for (const r of ac) {
      const d = r.date?.trim()
      if (d) dateSet.add(d.slice(0, 10))
    }
    let dates = Array.from(dateSet).sort()
    const pStart = project.startDate?.slice(0, 10)
    const pEnd = project.endDate?.slice(0, 10)
    if (pStart && pEnd) {
      dates = dates.filter(d => d >= pStart && d <= pEnd)
    }
    if (dates.length > MAX_DATE_COLS) {
      dates = dates.slice(-MAX_DATE_COLS)
    }
    const dateIdx = new Map(dates.map((d, i) => [d, i]))
    const rowKeys = Array.from(byLine.keys()).filter(k => {
      const inner = byLine.get(k)
      if (!inner) return false
      for (const d of dates) {
        if ((inner.get(d) ?? 0) > 0) return true
      }
      return false
    })
    rowKeys.sort((a, b) => acMatrixRowLabel(a).localeCompare(acMatrixRowLabel(b)))

    const cellHours = new Map<string, number[]>()
    const rowTotals = new Map<string, number>()
    for (const key of rowKeys) {
      const inner = byLine.get(key)
      if (!inner) continue
      const arr = new Array(dates.length).fill(0)
      let tot = 0
      for (const d of dates) {
        const h = inner.get(d) ?? 0
        const i = dateIdx.get(d)
        if (i != null) {
          arr[i] = h
          tot += h
        }
      }
      cellHours.set(key, arr)
      rowTotals.set(key, tot)
    }

    return { rowKeys, dates, cellHours, rowTotals }
  }, [ac, project.startDate, project.endDate])

  const dateIsWorkday = (ymd: string) => isEvmCalendarWorkdayYmd(ymd, nonWorkingList)

  if (!project.id) {
    return <p className="text-muted-foreground text-sm">{t('evm.ganttNoProject')}</p>
  }

  if (rowKeys.length === 0 || dates.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('evm.acMatrixEmpty')}</p>
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-hidden', className)}>
      <p className="text-muted-foreground text-xs">{t('evm.acMatrixHint')}</p>
      <ScrollArea className="min-h-0 flex-1 rounded-md border border-border/60">
        <Table className="w-max min-w-full text-xs">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 z-20 min-w-[180px] bg-background shadow-[1px_0_0_hsl(var(--border))]">
                {t('evm.acMatrixTaskCol')}
              </TableHead>
              <TableHead className="whitespace-nowrap text-right tabular-nums">{t('evm.acMatrixTotalH')}</TableHead>
              {dates.map(d => (
                <TableHead
                  key={d}
                  className={cn(
                    'whitespace-nowrap px-1.5 text-center font-mono tabular-nums text-[10px]',
                    !dateIsWorkday(d) && 'bg-muted/50 text-muted-foreground',
                  )}
                >
                  {d.slice(5)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowKeys.map(key => {
              const cells = cellHours.get(key) ?? []
              const total = rowTotals.get(key) ?? 0
              return (
                <TableRow key={key}>
                  <TableCell className="sticky left-0 z-10 max-w-[240px] truncate bg-background font-medium shadow-[1px_0_0_hsl(var(--border))]" title={acMatrixRowLabel(key)}>
                    {acMatrixRowLabel(key)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{total.toFixed(1)}</TableCell>
                  {cells.map((h, i) => {
                    const d = dates[i] ?? ''
                    const work = dateIsWorkday(d)
                    return (
                      <TableCell
                        key={d}
                        className={cn(
                          'px-1.5 text-center font-mono tabular-nums text-[10px]',
                          !work && 'bg-muted/40 text-muted-foreground',
                        )}
                      >
                        {work && h > 0 ? h.toFixed(1) : ''}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
