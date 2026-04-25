import { memo, useEffect, useMemo, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useProgressStore } from '@/stores/useProgressStore'
import { SectionHeader } from './SectionHeader'

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const WEEKS_OPTIONS = [4, 8, 12, 24]

function getCellStyle(cnt: number, max: number): CSSProperties {
  if (cnt === 0 || max === 0) return { backgroundColor: 'var(--muted)' }
  const ratio = cnt / max
  if (ratio < 0.25) return { backgroundColor: 'color-mix(in oklch, var(--chart-3) 28%, var(--muted))' }
  if (ratio < 0.5) return { backgroundColor: 'color-mix(in oklch, var(--chart-3) 48%, var(--muted))' }
  if (ratio < 0.75) return { backgroundColor: 'color-mix(in oklch, var(--chart-3) 72%, transparent)' }
  return { backgroundColor: 'var(--chart-3)' }
}

export const ProductiveHoursChart = memo(function ProductiveHoursChart({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const { productiveHours, productiveWeeksBack, fetchProductiveHours, setProductiveWeeksBack } = useProgressStore()

  useEffect(() => {
    if (userId) fetchProductiveHours(userId, productiveWeeksBack)
  }, [userId, productiveWeeksBack, fetchProductiveHours])

  const { grid, maxCnt, peakHours, lateNightCount } = useMemo(() => {
    const data = productiveHours.data ?? []
    const grid: Record<string, number> = {}
    let maxCnt = 0
    for (const cell of data) {
      const key = `${cell.dow}-${cell.hour}`
      grid[key] = Number(cell.cnt)
      if (Number(cell.cnt) > maxCnt) maxCnt = Number(cell.cnt)
    }

    // Find peak hours (top 2 hours with most commits across all days)
    const hourTotals: Record<number, number> = {}
    for (const cell of data) {
      hourTotals[cell.hour] = (hourTotals[cell.hour] ?? 0) + Number(cell.cnt)
    }
    const sorted = Object.entries(hourTotals).sort((a, b) => Number(b[1]) - Number(a[1]))
    const peakHours = sorted.slice(0, 2).map(([h]) => Number(h))

    const lateNightCount = data
      .filter(c => (Number(c.hour) >= 23 || Number(c.hour) <= 3) && Number(c.cnt) > 0)
      .reduce((s, c) => s + Number(c.cnt), 0)

    return { grid, maxCnt, peakHours, lateNightCount }
  }, [productiveHours.data])

  const isEmpty = !productiveHours.data || productiveHours.data.length === 0

  return (
    <TooltipProvider delayDuration={100}>
      <div className="p-6 space-y-5">
        <SectionHeader
          icon={<Clock className="h-5 w-5 text-indigo-500" />}
          title={t('progress.productiveHours')}
          description={t('progress.productiveHoursDesc')}
          actions={
            <div className="flex gap-1">
              {WEEKS_OPTIONS.map(w => (
                <button
                  key={w}
                  onClick={() => setProductiveWeeksBack(w)}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-md transition-colors',
                    productiveWeeksBack === w ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 font-medium' : 'hover:bg-accent text-muted-foreground',
                  )}
                >
                  {w}w
                </button>
              ))}
            </div>
          }
        />

        <div className="rounded-xl bg-muted/40 p-4">
            {productiveHours.loading ? (
              <Skeleton className="h-[320px] w-full rounded-xl" />
            ) : isEmpty ? (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">{t('progress.noData')}</div>
            ) : (
              <div className="overflow-x-auto">
                <div className="inline-block min-w-[480px]">
                  {/* DOW header */}
                  <div className="flex mb-1">
                    <div className="w-8 shrink-0" />
                    {DOW_LABELS.map((d, i) => (
                      <div key={i} className="flex-1 text-center text-[10px] text-muted-foreground">{d}</div>
                    ))}
                  </div>

                  {/* Grid rows by hour */}
                  <div className="space-y-[2px]">
                    {HOURS.map(hour => {
                      const rowTotal = DOW_LABELS.reduce((s, _, dow) => s + (grid[`${dow + 1}-${hour}`] ?? 0), 0)
                      if (rowTotal === 0 && hour !== 9 && hour !== 10 && hour !== 11) {
                        const nearPeak = peakHours.some(p => Math.abs(p - hour) <= 1)
                        if (!nearPeak && hour < 7) return null
                      }
                      return (
                        <div key={hour} className="flex items-center gap-0">
                          <div className="w-8 shrink-0 text-[10px] text-muted-foreground text-right pr-1.5">
                            {String(hour).padStart(2, '0')}h
                          </div>
                          {DOW_LABELS.map((_, dow) => {
                            const cnt = grid[`${dow + 1}-${hour}`] ?? 0
                            return (
                              <Tooltip key={dow}>
                                <TooltipTrigger asChild>
                                  <div
                                    className={cn(
                                      'flex-1 h-[14px] mx-[1px] rounded-[2px] transition-opacity hover:opacity-80',
                                      peakHours.includes(hour) && cnt > 0 ? 'ring-1 ring-inset ring-[var(--chart-2)]' : '',
                                    )}
                                    style={getCellStyle(cnt, maxCnt)}
                                  />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  <p>{DOW_LABELS[dow]} {String(hour).padStart(2, '0')}:00</p>
                                  <p className="font-semibold">{cnt} commits</p>
                                </TooltipContent>
                              </Tooltip>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-1.5 mt-2 ml-8">
                    <span className="text-[10px] text-muted-foreground">{t('progress.less')}</span>
                    {[0, 0.15, 0.35, 0.6, 1].map((ratio, i) => {
                      const m = Math.max(maxCnt, 1)
                      const fake = Math.round(ratio * m)
                      return <div key={i} className="h-[10px] w-[10px] shrink-0 rounded-[2px]" style={getCellStyle(fake, m)} />
                    })}
                    <span className="text-[10px] text-muted-foreground">{t('progress.more')}</span>
                  </div>
                </div>
              </div>
            )}
        </div>

        {!productiveHours.loading && !isEmpty && (
          <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
            {peakHours.length > 0 && (
              <p className="text-xs text-indigo-600 dark:text-indigo-400">
                💡 {t('progress.peakHours')}: <strong>{peakHours.map(h => `${String(h).padStart(2, '0')}:00`).join(', ')}</strong>
              </p>
            )}
            {lateNightCount > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠ {t('progress.lateNightWarning', { count: lateNightCount, weeks: productiveWeeksBack })}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">{t('progress.productiveHoursNote')}</p>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
})
