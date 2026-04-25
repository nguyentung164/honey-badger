'use client'

import { format, parseISO } from 'date-fns'
import { BarChart3, CheckCircle2, ChevronDown, Loader2, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import toast from '@/components/ui-elements/Toast'
import { getDateOnlyPattern, getMonthDayOnlyPattern, parseLocalDate } from '@/lib/dateUtils'
import i18n from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface DevUser {
  userId: string
  userName: string
  userCode: string
}

interface ReportStatistics {
  reportDate: string
  projectId: string | null
  projectName: string | null
  totalDevs: number
  reportedCount: number
  reportedDevs: DevUser[]
  notReportedDevs: DevUser[]
  reportRatePercent: number
  missedDaysStats: (DevUser & { missedDates: string[] })[]
  reportedByDate?: { date: string; users: DevUser[] }[]
  notReportedByDate?: { date: string; users: DevUser[] }[]
  dateFrom?: string
  dateTo?: string
}

interface PLReportStatisticsProps {
  dateRange: DateRange | undefined
  projectId: string | null
  projects: { id: string; name: string }[]
}

function getRateColor(percent: number): string {
  const hue = Math.round(percent * 1.2)
  const lightness = percent < 50 ? 45 : 40
  return `hsl(${hue}, 80%, ${lightness}%)`
}

function getRateStatusKey(percent: number): 'dailyReport.statsRateStatusGood' | 'dailyReport.statsRateStatusModerate' | 'dailyReport.statsRateStatusPoor' {
  if (percent >= 90) return 'dailyReport.statsRateStatusGood'
  if (percent >= 70) return 'dailyReport.statsRateStatusModerate'
  return 'dailyReport.statsRateStatusPoor'
}

function formatStatsDateInput(s: string | undefined, language: string): string {
  if (!s) return ''
  const d = parseLocalDate(s.slice(0, 10)) ?? new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return format(d, getDateOnlyPattern(language))
}

function matchesDevSearch(u: DevUser, q: string): boolean {
  const n = q.trim().toLowerCase()
  if (!n) return true
  return u.userName.toLowerCase().includes(n) || u.userCode.toLowerCase().includes(n)
}

function matchesMissedSearch(m: DevUser & { missedDates: string[] }, q: string): boolean {
  const n = q.trim().toLowerCase()
  if (!n) return true
  if (matchesDevSearch(m, q)) return true
  return m.missedDates.some(d => String(d).toLowerCase().includes(n))
}

function devChipClass(variant: 'reported' | 'notReported'): string {
  if (variant === 'reported') {
    return cn(
      'inline-flex max-w-full min-w-0 items-baseline gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[11px] leading-tight text-emerald-900 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200 sm:px-2 sm:py-1 sm:text-xs sm:leading-snug'
    )
  }
  return cn(
    'inline-flex max-w-full min-w-0 items-baseline gap-1 rounded-md border border-amber-500/25 bg-amber-500/[0.08] px-1.5 py-0.5 text-[11px] leading-tight text-amber-800 shadow-sm dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200 sm:px-2 sm:py-1 sm:text-xs sm:leading-snug'
  )
}

function DevChip({ u, variant }: { u: DevUser; variant: 'reported' | 'notReported' }) {
  return (
    <span className={devChipClass(variant)} title={`${u.userName} (${u.userCode})`}>
      <span className="truncate font-medium">{u.userName}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground opacity-90">({u.userCode})</span>
    </span>
  )
}

/** Chip ngày (missed list) — cùng palette amber với DevChip notReported */
function MissedDateChip({ label, title }: { label: string; title?: string }) {
  return (
    <span className={devChipClass('notReported')} title={title}>
      <span className="tabular-nums font-medium">{label}</span>
    </span>
  )
}

function formatMissedDayLabel(raw: string, monthDayPat: string): string {
  const ymd = String(raw).slice(0, 10)
  let dt: Date | undefined = /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? parseLocalDate(ymd) : undefined
  if (!dt) dt = new Date(raw)
  return Number.isNaN(dt.getTime()) ? String(raw) : format(dt, monthDayPat)
}

function formatMissedDayTitle(raw: string, language: string): string {
  const ymd = String(raw).slice(0, 10)
  const dt = parseLocalDate(ymd) ?? new Date(raw)
  if (Number.isNaN(dt.getTime())) return String(raw)
  return format(dt, getDateOnlyPattern(language))
}

/** Cùng pattern EVM: Card border-0 bg-muted/40, KPI dùng header/content p-3 */
const statsPanelCardClass = 'flex min-h-0 flex-col gap-0 overflow-hidden py-0 shadow-sm'
const statsPanelHeaderClass = 'shrink-0 space-y-0 p-3 pb-2'
const statsPanelTitleClass = 'text-sm font-semibold leading-none'

export function PLReportStatistics({ dateRange, projectId, projects }: PLReportStatisticsProps) {
  const { t } = useTranslation()
  const datePat = getDateOnlyPattern(i18n.language)
  const monthDayPat = getMonthDayOnlyPattern(i18n.language)
  const [stats, setStats] = useState<ReportStatistics | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [statsSearchQuery, setStatsSearchQuery] = useState('')

  const dateFrom = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  const dateTo = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')

  const effectiveProjectId = projectId ?? projects[0]?.id ?? null

  const loadStats = useCallback(async () => {
    const pid = projectId ?? projects[0]?.id
    if (!pid) return
    setIsLoading(true)
    setStats(null)
    try {
      const res = await window.api.dailyReport.getStatisticsByDateRange(dateFrom, dateTo, pid)
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[PLReportStatistics] getStatisticsByDateRange', {
          status: res.status,
          totalDevs: res.data?.totalDevs,
          reportedByDateLength: res.data?.reportedByDate?.length,
        })
      }
      if (res.status === 'success' && res.data) {
        setStats(res.data)
      } else {
        toast.error(res.message || t('dailyReport.loadStatsFailed'))
      }
    } catch {
      toast.error(t('dailyReport.loadStatsError'))
    } finally {
      setIsLoading(false)
    }
  }, [dateFrom, dateTo, projectId, projects, t])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const summary = useMemo(() => {
    if (!stats) return null
    const byDate = stats.notReportedByDate
    const daysWithGaps = byDate ? byDate.filter(d => d.users.length > 0).length : null
    const totalMisses = byDate
      ? byDate.reduce((acc, d) => acc + d.users.length, 0)
      : stats.notReportedDevs.length
    const missedWithData = stats.missedDaysStats.filter(m => m.missedDates.length > 0)
    const worst =
      missedWithData.length === 0
        ? null
        : [...missedWithData].sort((a, b) => b.missedDates.length - a.missedDates.length)[0]

    let peakNotReportedDay: { date: string; count: number } | null = null
    if (byDate) {
      const withGaps = byDate.filter(d => d.users.length > 0)
      if (withGaps.length > 0) {
        const peakRow = withGaps.reduce((a, d) => {
          if (d.users.length > a.users.length) return d
          if (d.users.length === a.users.length && d.date < a.date) return d
          return a
        })
        peakNotReportedDay = { date: peakRow.date, count: peakRow.users.length }
      }
    }

    return { daysWithGaps, totalMisses, worst, peakNotReportedDay }
  }, [stats])

  const filteredByDateDays = useMemo(() => {
    if (!stats?.notReportedByDate) return []
    return stats.notReportedByDate
      .map(day => ({
        ...day,
        users: day.users.filter(u => matchesDevSearch(u, statsSearchQuery)),
      }))
      .filter(day => day.users.length > 0)
  }, [stats?.notReportedByDate, statsSearchQuery])

  const filteredReportedDevs = useMemo(() => {
    if (!stats) return []
    return stats.reportedDevs.filter(u => matchesDevSearch(u, statsSearchQuery))
  }, [stats, statsSearchQuery])

  const filteredNotReportedDevsLegacy = useMemo(() => {
    if (!stats) return []
    return stats.notReportedDevs.filter(u => matchesDevSearch(u, statsSearchQuery))
  }, [stats, statsSearchQuery])

  const filteredMissedStats = useMemo(() => {
    if (!stats) return []
    return stats.missedDaysStats
      .filter(m => m.missedDates.length > 0)
      .filter(m => matchesMissedSearch(m, statsSearchQuery))
      .sort((a, b) => b.missedDates.length - a.missedDates.length)
  }, [stats, statsSearchQuery])

  const showStatsSearch = Boolean(
    stats &&
    (stats.notReportedByDate?.some(d => d.users.length > 0) ||
      (stats.notReportedByDate === undefined &&
        (stats.reportedDevs.length > 0 || stats.notReportedDevs.length > 0)) ||
      stats.missedDaysStats.some(m => m.missedDates.length > 0))
  )

  if (projects.length === 0) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
        {t('dailyReport.noProjects')}
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-hidden">
      <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
        {isLoading && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl border-0 bg-background/90 backdrop-blur-sm"
            aria-busy
            aria-live="polite"
          >
            <Loader2 className="h-9 w-9 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
          </div>
        )}
        {!effectiveProjectId ? (
          <div className="flex min-h-[12rem] items-center justify-center py-8 text-center text-sm text-muted-foreground">
            {t('dailyReport.selectProjectToView')}
          </div>
        ) : stats ? (
          <>
            <div className="shrink-0 space-y-4 pb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-medium">
                  {stats.dateFrom && stats.dateTo
                    ? t('dailyReport.statsTitleRange', {
                      dateFrom: formatStatsDateInput(stats.dateFrom, i18n.language),
                      dateTo: formatStatsDateInput(stats.dateTo, i18n.language),
                      project: stats.projectName ?? '',
                    })
                    : t('dailyReport.statsTitle', {
                      date: formatStatsDateInput(stats.reportDate, i18n.language),
                      project: stats.projectName ?? '',
                    })}
                </h3>
              </div>

              {summary && (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Card className="gap-0 py-0 shadow-sm">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-xs font-medium leading-snug text-muted-foreground">
                        {t('dailyReport.statsSummaryDaysWithGaps')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1">
                      <p className="text-xl font-semibold tabular-nums tracking-tight">
                        {summary.daysWithGaps === null ? t('dailyReport.statsSummaryNoDayBreakdown') : summary.daysWithGaps}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="gap-0 py-0 shadow-sm">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-xs font-medium leading-snug text-muted-foreground">
                        {t('dailyReport.statsSummaryTotalMisses')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1">
                      <p className="text-xl font-semibold tabular-nums tracking-tight">{summary.totalMisses}</p>
                    </CardContent>
                  </Card>
                  <Card className="gap-0 py-0 shadow-sm">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-xs font-medium leading-snug text-muted-foreground">
                        {t('dailyReport.statsSummaryPeakNotReportedDay')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1">
                      {summary.peakNotReportedDay ? (
                        <>
                          <p className="text-base font-semibold tabular-nums leading-tight">
                            {format(
                              parseLocalDate(summary.peakNotReportedDay.date.slice(0, 10)) ??
                                parseISO(summary.peakNotReportedDay.date),
                              datePat
                            )}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('dailyReport.statsExpandPeople', { count: summary.peakNotReportedDay.count })}
                          </p>
                        </>
                      ) : (
                        <p className="text-xl font-semibold tabular-nums tracking-tight">
                          {summary.daysWithGaps === null
                            ? t('dailyReport.statsSummaryNoDayBreakdown')
                            : '—'}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="gap-0 py-0 shadow-sm">
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-xs font-medium leading-snug text-muted-foreground">
                        {t('dailyReport.statsSummaryWorstDev')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1">
                      <p className="text-sm font-semibold leading-snug">
                        {summary.worst ? (
                          <>
                            {summary.worst.userName}{' '}
                            <span className="font-normal text-muted-foreground">
                              ({summary.worst.missedDates.length})
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{t('dailyReport.reportRate')}</span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {stats.totalDevs === 0 ? (
                      <>
                        <span className="rounded-full border border-muted-foreground/35 bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                          {t('dailyReport.statsRateNoDevs')}
                        </span>
                        <span className="font-medium tabular-nums text-muted-foreground">—</span>
                      </>
                    ) : (
                      <>
                        <span
                          className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
                          style={{
                            borderColor: getRateColor(stats.reportRatePercent),
                            color: getRateColor(stats.reportRatePercent),
                            backgroundColor: `${getRateColor(stats.reportRatePercent)}14`,
                          }}
                        >
                          {t(getRateStatusKey(stats.reportRatePercent))}
                        </span>
                        <span className="font-medium tabular-nums" style={{ color: getRateColor(stats.reportRatePercent) }}>
                          {stats.reportRatePercent.toFixed(1)}%
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Progress
                  value={stats.totalDevs === 0 ? 0 : stats.reportRatePercent}
                  className={cn('h-2', stats.totalDevs === 0 && 'opacity-60')}
                  indicatorStyle={{
                    backgroundColor:
                      stats.totalDevs === 0 ? 'hsl(var(--muted-foreground) / 0.35)' : getRateColor(stats.reportRatePercent),
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {t('dailyReport.devsReported', { reported: stats.reportedCount, total: stats.totalDevs })}
                </p>
              </div>
            </div>

            <div className="flex flex-col flex-1 min-h-0 gap-6 pb-4">
              {showStatsSearch && (
                <div className="relative shrink-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    value={statsSearchQuery}
                    onChange={e => setStatsSearchQuery(e.target.value)}
                    placeholder={t('dailyReport.statsSearchPlaceholder')}
                    className="pl-9"
                    aria-label={t('dailyReport.statsSearchPlaceholder')}
                  />
                </div>
              )}

              <div className="flex min-h-0 flex-1 flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-stretch lg:gap-4">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  {stats.reportedByDate && stats.notReportedByDate ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                      {stats.notReportedByDate.every(day => day.users.length === 0) ? (
                        <Card className="gap-0 py-0 shadow-sm">
                          <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
                            <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" aria-hidden />
                            <p className="text-base font-semibold text-emerald-700 dark:text-emerald-400">
                              {t('dailyReport.statsAllReportedTitle')}
                            </p>
                            <p className="max-w-md text-sm text-muted-foreground">{t('dailyReport.statsAllReportedHint')}</p>
                          </CardContent>
                        </Card>
                      ) : (
                        <Card className={cn(statsPanelCardClass, 'flex-1 shadow-sm')}>
                          <CardHeader className={statsPanelHeaderClass}>
                            <CardTitle className={statsPanelTitleClass}>
                              {t('dailyReport.reportedAndNotReportedByDate')}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="min-h-0 flex-1 overflow-auto p-0">
                            {filteredByDateDays.length === 0 ? (
                              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                                {t('dailyReport.statsNoSearchResults')}
                              </p>
                            ) : (
                              <div className="divide-y divide-border">
                                {filteredByDateDays.map(day => {
                                  const d = parseLocalDate(day.date) ?? parseISO(day.date)
                                  const displayDate = format(d, datePat)
                                  return (
                                    <Collapsible key={day.date} className="group">
                                      <CollapsibleTrigger className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/40">
                                        <span className="min-w-0 truncate font-medium whitespace-nowrap text-muted-foreground">
                                          {displayDate}
                                        </span>
                                        <span className="shrink-0 tabular-nums text-right font-medium whitespace-nowrap text-amber-700 dark:text-amber-300">
                                          {t('dailyReport.statsExpandPeople', { count: day.users.length })}
                                        </span>
                                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <div className="bg-muted/30 px-3 py-2.5">
                                          <div className="flex flex-wrap gap-1 sm:gap-1.5 content-start">
                                            {day.users.map(u => (
                                              <DevChip key={u.userId} u={u} variant="notReported" />
                                            ))}
                                          </div>
                                        </div>
                                      </CollapsibleContent>
                                    </Collapsible>
                                  )
                                })}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  ) : (
                    <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
                      <Card className={cn(statsPanelCardClass, 'min-h-0 flex-1 shadow-sm')}>
                        <CardHeader className={statsPanelHeaderClass}>
                          <CardTitle className={cn(statsPanelTitleClass, 'text-emerald-700 dark:text-emerald-400')}>
                            {t('dailyReport.reported')}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="min-h-0 flex-1 overflow-auto p-3 pt-0">
                          {stats.reportedDevs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('dailyReport.none')}</p>
                          ) : filteredReportedDevs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('dailyReport.statsNoSearchResults')}</p>
                          ) : (
                            <div className="flex flex-wrap content-start gap-1 sm:gap-1.5">
                              {filteredReportedDevs.map(u => (
                                <DevChip key={u.userId} u={u} variant="reported" />
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      <Card className={cn(statsPanelCardClass, 'min-h-0 flex-1 shadow-sm')}>
                        <CardHeader className={statsPanelHeaderClass}>
                          <CardTitle className={cn(statsPanelTitleClass, 'text-amber-600 dark:text-amber-400')}>
                            {t('dailyReport.notReported')}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="min-h-0 flex-1 overflow-auto p-3 pt-0">
                          {stats.notReportedDevs.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-2 text-center">
                              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" aria-hidden />
                              <p className="text-base font-semibold text-emerald-700 dark:text-emerald-400">
                                {t('dailyReport.allReported')}
                              </p>
                              <p className="text-xs text-muted-foreground">{t('dailyReport.statsAllReportedHint')}</p>
                            </div>
                          ) : filteredNotReportedDevsLegacy.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('dailyReport.statsNoSearchResults')}</p>
                          ) : (
                            <div className="flex flex-wrap content-start gap-1 sm:gap-1.5">
                              {filteredNotReportedDevsLegacy.map(u => (
                                <DevChip key={u.userId} u={u} variant="notReported" />
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:min-h-[12rem]">
                  {stats.missedDaysStats.every(m => m.missedDates.length === 0) ? (
                    <Card className="gap-0 py-0 shadow-sm">
                      <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
                        <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" aria-hidden />
                        <p className="text-base font-semibold text-emerald-700 dark:text-emerald-400">
                          {t('dailyReport.noMissedReports')}
                        </p>
                        <p className="max-w-md text-sm text-muted-foreground">{t('dailyReport.noMissedReportsHint')}</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className={cn(statsPanelCardClass, 'flex-1 shadow-sm')}>
                      <CardHeader className={statsPanelHeaderClass}>
                        <CardTitle className={statsPanelTitleClass}>{t('dailyReport.missedDaysTitle')}</CardTitle>
                      </CardHeader>
                      <CardContent className="min-h-0 flex-1 overflow-auto p-0">
                        {filteredMissedStats.length === 0 ? (
                          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                            {t('dailyReport.statsNoSearchResults')}
                          </p>
                        ) : (
                          <div className="divide-y divide-border">
                            {filteredMissedStats.map(m => (
                              <Collapsible key={m.userId} className="group">
                                <CollapsibleTrigger className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/40">
                                  <span
                                    className="min-w-0 truncate font-medium whitespace-nowrap text-muted-foreground"
                                    title={`${m.userName} (${m.userCode})`}
                                  >
                                    {m.userName} ({m.userCode})
                                  </span>
                                  <span className="shrink-0 tabular-nums text-right font-medium whitespace-nowrap text-amber-700 dark:text-amber-300">
                                    {t('dailyReport.statsExpandMissedDays', { count: m.missedDates.length })}
                                  </span>
                                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="bg-muted/30 px-3 py-2.5">
                                    <div className="flex flex-wrap gap-1 sm:gap-1.5 content-start">
                                      {m.missedDates.map(raw => (
                                        <MissedDateChip
                                          key={`${m.userId}-${raw}`}
                                          label={formatMissedDayLabel(raw, monthDayPat)}
                                          title={formatMissedDayTitle(raw, i18n.language)}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
