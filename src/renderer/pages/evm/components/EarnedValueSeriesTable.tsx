'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TablePaginationBar } from '@/components/ui/table-pagination-bar'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatEvmTimeSeriesPeriodCell } from '@/lib/dateUtils'
import {
  aggregateEvmTimeSeriesByPeriod,
  type EVMTimeSeriesPoint,
  type EvmReportGranularity,
} from '@/lib/evmCalculations'
import { evmIndexHealthCn } from '@/lib/evmUi'
import i18n from '@/lib/i18n'
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

function fmtFixed(n: number, d: number) {
  return Number.isFinite(n) ? n.toFixed(d) : '—'
}

export function EarnedValueSeriesTable({
  dailySeries,
  defaultGranularity = 'day',
  showGranularityToggle = true,
  title,
  className,
}: {
  dailySeries: EVMTimeSeriesPoint[]
  defaultGranularity?: EvmReportGranularity
  showGranularityToggle?: boolean
  title?: string
  className?: string
}) {
  const { t } = useTranslation()
  const [granularity, setGranularity] = useState<EvmReportGranularity>(defaultGranularity)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(50)

  useEffect(() => {
    setGranularity(defaultGranularity)
  }, [defaultGranularity])

  useEffect(() => {
    setPage(1)
  }, [granularity, dailySeries.length])

  const rows = useMemo(
    () => aggregateEvmTimeSeriesByPeriod(dailySeries, granularity),
    [dailySeries, granularity]
  )

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize
    return rows.slice(start, start + pageSize)
  }, [rows, page, pageSize])

  const periodColumnLabel = useMemo(() => {
    if (granularity === 'day') return t('evm.tableDate')
    if (granularity === 'month') return t('evm.reportGranularityMonth')
    return t('evm.reportGranularityQuarter')
  }, [granularity, t])

  useEffect(() => {
    setPage(p => Math.min(p, totalPages))
  }, [totalPages])

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-hidden', className)}>
      {(title || showGranularityToggle) && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          {showGranularityToggle && (
            <ToggleGroup
              type="single"
              value={granularity}
              onValueChange={v => {
                if (v === 'day' || v === 'month' || v === 'quarter') setGranularity(v)
              }}
              variant="outline"
              size="sm"
              className="shrink-0"
            >
              <ToggleGroupItem value="day" aria-label={t('evm.reportGranularityDay')}>
                {t('evm.reportGranularityDay')}
              </ToggleGroupItem>
              <ToggleGroupItem value="month" aria-label={t('evm.reportGranularityMonth')}>
                {t('evm.reportGranularityMonth')}
              </ToggleGroupItem>
              <ToggleGroupItem value="quarter" aria-label={t('evm.reportGranularityQuarter')}>
                {t('evm.reportGranularityQuarter')}
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto overflow-x-auto rounded-md border border-border/40">
        <Table className="w-max min-w-full text-sm">
          <TableHeader sticky>
            <TableRow>
              <TableHead className="w-12 text-center">{t('evm.tableNo')}</TableHead>
              <TableHead className="min-w-28 whitespace-nowrap">{periodColumnLabel}</TableHead>
              <TableHead className="text-right">{t('evm.kpiPV')}</TableHead>
              <TableHead className="text-right">{t('evm.kpiEV')}</TableHead>
              <TableHead className="text-right">{t('evm.kpiAC')}</TableHead>
              <TableHead className="text-right">{t('evm.kpiSV')}</TableHead>
              <TableHead className="text-right">{t('evm.kpiCV')}</TableHead>
              <TableHead className="text-right">{t('evm.kpiSPI')}</TableHead>
              <TableHead className="text-right">{t('evm.kpiCPI')}</TableHead>
              <TableHead className="text-right" title={t('evm.seriesTableEacHint')}>
                {t('evm.kpiEAC')}
              </TableHead>
              <TableHead className="text-right">{t('evm.kpiProgress')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((r, i) => {
              const globalNo = (page - 1) * pageSize + i + 1
              return (
                <TableRow key={`${granularity}-${r.date}`}>
                  <TableCell className="text-center font-mono tabular-nums text-muted-foreground">{globalNo}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatEvmTimeSeriesPeriodCell(r.date, granularity, i18n.language)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmtFixed(r.pv, 2)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmtFixed(r.ev, 2)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmtFixed(r.ac, 2)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmtFixed(r.sv, 2)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmtFixed(r.cv, 2)}</TableCell>
                  <TableCell className={cn('text-right font-mono tabular-nums', evmIndexHealthCn(r.spi, true))}>
                    {fmtFixed(r.spi, 3)}
                  </TableCell>
                  <TableCell className={cn('text-right font-mono tabular-nums', evmIndexHealthCn(r.cpi, true))}>
                    {fmtFixed(r.cpi, 3)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmtFixed(r.eac, 2)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{(r.progress * 100).toFixed(2)}%</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {rows.length > 0 && (
        <TablePaginationBar
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
          totalItems={rows.length}
        />
      )}
    </div>
  )
}
