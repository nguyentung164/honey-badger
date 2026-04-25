import { Flame } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { type HeatmapDay, useProgressStore } from '@/stores/useProgressStore'
import { SectionHeader } from './SectionHeader'

type FilterMode = 'all' | 'commits' | 'tasks' | 'reports'

function getScore(day: HeatmapDay, filter: FilterMode): number {
  if (filter === 'commits') return day.commits_count * 2
  if (filter === 'tasks') return day.tasks_done * 3
  if (filter === 'reports') return day.has_daily_report
  return day.commits_count * 2 + day.tasks_done * 3 + day.has_daily_report
}

function getIntensityClass(score: number): string {
  if (score === 0) return 'bg-muted'
  if (score <= 3) return 'bg-green-200 dark:bg-green-900'
  if (score <= 7) return 'bg-green-400 dark:bg-green-700'
  if (score <= 12) return 'bg-green-600 dark:bg-green-500'
  return 'bg-green-800 dark:bg-green-400'
}

function buildYearGrid(year: number, data: HeatmapDay[]) {
  const map = new Map<string, HeatmapDay>()
  for (const d of data) {
    const key = typeof d.snapshot_date === 'string' ? d.snapshot_date.slice(0, 10) : new Date(d.snapshot_date).toISOString().slice(0, 10)
    map.set(key, d)
  }

  const start = new Date(year, 0, 1)
  const end = new Date(year, 11, 31)
  // offset to start on Sunday (DOW 0)
  const startDow = start.getDay()
  const weeks: Array<Array<{ date: string; day: HeatmapDay | null }>> = []
  let week: Array<{ date: string; day: HeatmapDay | null }> = []

  for (let i = 0; i < startDow; i++) week.push({ date: '', day: null })

  const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const cur = new Date(start)
  while (cur <= end) {
    const key = fmtDate(cur)
    week.push({ date: key, day: map.get(key) ?? null })
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
    cur.setDate(cur.getDate() + 1)
  }
  if (week.length > 0) {
    while (week.length < 7) week.push({ date: '', day: null })
    weeks.push(week)
  }
  return weeks
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const LOCALE_MAP: Record<string, string> = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP' }
function getLocale(lang: string) {
  return LOCALE_MAP[lang] ?? 'vi-VN'
}

/** Chuỗi YYYY-MM-DD từ DB — parse theo lịch local, tránh new Date('...') = UTC làm lệch 1 ngày */
function parseCalendarDateYmd(ymd: string): Date {
  const s = ymd.slice(0, 10)
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return new Date(ymd)
  return new Date(y, m - 1, d)
}

function formatDateLabel(date: string, locale: string) {
  if (!date) return ''
  return parseCalendarDateYmd(date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatLinesDelta(inserted: number, deleted: number): string {
  const ins = Number(inserted ?? 0)
  const del = Number(deleted ?? 0)
  if (del <= 0) return `+${ins.toLocaleString()}`
  return `+${ins.toLocaleString()} / −${del.toLocaleString()}`
}

export const ActivityHeatmap = memo(function ActivityHeatmap({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation()
  const locale = getLocale(i18n.language)
  const { heatmap, heatmapYear, fetchHeatmap, setHeatmapYear } = useProgressStore()
  const [filter, setFilter] = useState<FilterMode>('all')
  const [selectedDate, setSelectedDate] = useState<{ date: string; day: HeatmapDay } | null>(null)

  useEffect(() => {
    fetchHeatmap(userId, heatmapYear)
  }, [userId, heatmapYear, fetchHeatmap])

  const weeks = useMemo(() => buildYearGrid(heatmapYear, heatmap.data ?? []), [heatmapYear, heatmap.data])

  const stats = useMemo(() => {
    const data = heatmap.data ?? []
    const totalCommits = data.reduce((s, d) => s + Number(d.commits_count ?? 0), 0)
    const totalTasks = data.reduce((s, d) => s + Number(d.tasks_done ?? 0), 0)
    const reportDays = data.filter(d => Number(d.has_daily_report) > 0).length
    const activeDays = data.filter(d => Number(d.commits_count ?? 0) > 0)
    let maxStreak = 0
    let cur = 1
    for (let i = 1; i < activeDays.length; i++) {
      const prev = new Date(activeDays[i - 1].snapshot_date)
      const next = new Date(activeDays[i].snapshot_date)
      if ((next.getTime() - prev.getTime()) / 86400000 === 1) {
        cur++
        if (cur > maxStreak) maxStreak = cur
      } else cur = 1
    }
    if (activeDays.length > 0) maxStreak = Math.max(maxStreak, 1)
    const mostActive = data.reduce<HeatmapDay | null>((best, d) => {
      if (!best || Number(d.commits_count) > Number(best.commits_count)) return d
      return best
    }, null)
    return { totalCommits, totalTasks, reportDays, maxStreak, mostActive, workingDays: data.length }
  }, [heatmap.data])

  const monthOffsets = useMemo(() => {
    const seen = new Set<string>()
    return weeks.reduce(
      (acc, week, i) => {
        const firstDate = week.find(c => c.date)?.date
        if (!firstDate) return acc
        const month = firstDate.slice(5, 7) // MM
        if (!seen.has(month)) {
          seen.add(month)
          acc.push({ month, weekIndex: i })
        }
        return acc
      },
      [] as Array<{ month: string; weekIndex: number }>
    )
  }, [weeks])

  const filterButtons: Array<{ id: FilterMode; label: string }> = [
    { id: 'all', label: t('progress.filterAll') },
    { id: 'commits', label: t('progress.filterCommits') },
    { id: 'tasks', label: t('progress.filterTasks') },
    { id: 'reports', label: t('progress.filterReports') },
  ]

  return (
    <TooltipProvider delayDuration={100}>
      <div className="p-6 space-y-5">
        <SectionHeader icon={<Flame className="h-5 w-5 text-orange-500" />} title={t('progress.activityHeatmap')} description={t('progress.activityHeatmapDesc')} />

        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1">
            <button onClick={() => setHeatmapYear(heatmapYear - 1)} className="px-2 py-1 text-xs rounded-md hover:bg-accent transition-colors text-muted-foreground">
              ← {heatmapYear - 1}
            </button>
            <span className="px-3 py-1 text-sm font-semibold bg-accent rounded-md">{heatmapYear}</span>
            {heatmapYear < new Date().getFullYear() && (
              <button onClick={() => setHeatmapYear(heatmapYear + 1)} className="px-2 py-1 text-xs rounded-md hover:bg-accent transition-colors text-muted-foreground">
                {heatmapYear + 1} →
              </button>
            )}
          </div>
          <div className="flex gap-1">
            {filterButtons.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md transition-colors',
                  filter === f.id ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400 font-medium' : 'hover:bg-accent text-muted-foreground'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-muted/40 p-4">
            {heatmap.loading ? (
              <Skeleton className="h-[160px] w-full rounded-xl" />
            ) : (
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full">
                  {/* Month labels — positioned by actual week index */}
                  <div className="relative h-[14px] mb-1 ml-8">
                    {monthOffsets.map(({ month, weekIndex }) => (
                      <span key={month} className="absolute text-[10px] text-muted-foreground" style={{ left: `${weekIndex * 14}px` }}>
                        {MONTH_LABELS[Number(month) - 1]}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-0">
                    {/* DOW labels */}
                    <div className="flex flex-col mr-1.5 mt-[2px]">
                      {DOW_LABELS.map((d, i) => (
                        <div key={i} className={cn('text-[9px] text-muted-foreground h-[14px] leading-[14px]', i % 2 !== 0 ? '' : 'invisible')}>
                          {d}
                        </div>
                      ))}
                    </div>
                    {/* Grid */}
                    <div className="flex gap-[2px]">
                      {weeks.map((week, wi) => (
                        <div key={wi} className="flex flex-col gap-[2px]">
                          {week.map((cell, di) => {
                            if (!cell.date) return <div key={di} className="h-[12px] w-[12px]" />
                            const score = cell.day ? getScore(cell.day, filter) : 0
                            return (
                              <Tooltip key={di}>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    tabIndex={cell.day ? 0 : -1}
                                    className={cn(
                                      'h-[12px] w-[12px] rounded-[2px] cursor-pointer transition-opacity hover:opacity-80 p-0 border-0 bg-transparent',
                                      getIntensityClass(score),
                                      selectedDate?.date === cell.date ? 'ring-1 ring-blue-400' : ''
                                    )}
                                    onClick={() => cell.day && setSelectedDate({ date: cell.date, day: cell.day })}
                                  />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-[200px]">
                                  <p className="font-medium">{formatDateLabel(cell.date, locale)}</p>
                                  {cell.day ? (
                                    <div className="mt-1 space-y-0.5 text-[11px]">
                                      <p>
                                        {cell.day.commits_count} commits · {formatLinesDelta(cell.day.lines_inserted, cell.day.lines_deleted)} lines
                                      </p>
                                      <p>{cell.day.tasks_done} tasks done</p>
                                      {Number(cell.day.has_daily_report) > 0 && <p className="text-green-400">✓ Daily report</p>}
                                    </div>
                                  ) : (
                                    <p className="text-muted-foreground text-[11px]">No activity</p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Intensity legend */}
                  <div className="flex items-center gap-1.5 mt-2 ml-8">
                    <span className="text-[10px] text-muted-foreground">{t('progress.less')}</span>
                    {['bg-muted', 'bg-green-200 dark:bg-green-900', 'bg-green-400 dark:bg-green-700', 'bg-green-600 dark:bg-green-500', 'bg-green-800 dark:bg-green-400'].map(
                      (cls, i) => (
                        <div key={i} className={cn('h-[10px] w-[10px] rounded-[2px]', cls)} />
                      )
                    )}
                    <span className="text-[10px] text-muted-foreground">{t('progress.more')}</span>
                  </div>
                </div>
              </div>
            )}
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('progress.totalCommits'), value: stats.totalCommits, icon: '📦' },
            { label: t('progress.totalTasksDone'), value: stats.totalTasks, icon: '✅' },
            { label: t('progress.longestStreak'), value: `${stats.maxStreak} ${t('progress.days')}`, icon: '🔥' },
            { label: t('progress.reportRate'), value: stats.workingDays > 0 ? `${Math.round((stats.reportDays / stats.workingDays) * 100)}%` : '—', icon: '📝' },
          ].map((s, i) => (
            <div key={i} className="rounded-lg bg-muted/40 p-3 space-y-1">
              <p className="text-lg">{s.icon}</p>
              <p className="text-xl font-bold tabular-nums">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Day detail panel */}
        {selectedDate && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{formatDateLabel(selectedDate.date, locale)}</p>
              <button onClick={() => setSelectedDate(null)} className="text-xs text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Commits:</span> <strong>{selectedDate.day.commits_count}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Tasks done:</span> <strong>{selectedDate.day.tasks_done}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Reviews:</span> <strong>{selectedDate.day.reviews_done}</strong>
              </div>
            </div>
            <div className="text-xs pt-1 border-t border-blue-200/60 dark:border-blue-900/40">
              <span className="text-muted-foreground">Lines (+/−):</span>{' '}
              <strong className="text-green-600 dark:text-green-400">+{Number(selectedDate.day.lines_inserted ?? 0).toLocaleString()}</strong>
              <span className="text-muted-foreground"> / </span>
              <strong className="text-red-600 dark:text-red-400">−{Number(selectedDate.day.lines_deleted ?? 0).toLocaleString()}</strong>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
})
