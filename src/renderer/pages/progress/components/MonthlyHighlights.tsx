import { ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { memo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useProgressStore } from '@/stores/useProgressStore'
import { SectionHeader } from './SectionHeader'

function DeltaBadge({ curr, prev }: { curr: number; prev: number }) {
  if (prev === 0 && curr === 0) return null
  const delta = curr - prev
  if (Math.abs(delta) < 1) return <span className="text-xs text-muted-foreground">=</span>
  const pct = prev > 0 ? Math.round(Math.abs(delta / prev) * 100) : null
  return (
    <span className={cn('text-xs font-medium', delta > 0 ? 'text-green-600' : 'text-red-500')}>
      {delta > 0 ? '↑' : '↓'} {pct !== null ? `${pct}%` : Math.abs(delta)}
    </span>
  )
}

function BigStatCard({ label, value, delta, prev, isNew }: { label: string; value: string | number; delta?: { curr: number; prev: number }; prev?: string; isNew?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/40 p-4 relative overflow-hidden">
      {isNew && <span className="absolute top-2 right-2 text-[10px] font-bold bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-full">NEW RECORD 🎉</span>}
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
      {delta && (
        <div className="flex items-center gap-1.5 mt-1">
          <DeltaBadge curr={delta.curr} prev={delta.prev} />
          {prev && <span className="text-[10px] text-muted-foreground">vs {prev}</span>}
        </div>
      )}
    </div>
  )
}

const SPARK_TOOLTIP_STYLE = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 10,
  padding: '4px 8px',
  color: 'var(--popover-foreground)',
} as const

function Sparkline({ data, dataKey, stroke = 'var(--chart-1)' }: { data: any[]; dataKey: string; stroke?: string }) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data}>
        <Line type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={1.75} dot={false} />
        <Tooltip
          formatter={v => [v, dataKey]}
          contentStyle={SPARK_TOOLTIP_STYLE}
          itemStyle={{ color: 'var(--popover-foreground)', fontSize: 10 }}
          labelStyle={{ color: 'var(--muted-foreground)', fontSize: 9 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

const LOCALE_MAP: Record<string, string> = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP' }
function getLocale(lang: string) {
  return LOCALE_MAP[lang] ?? 'vi-VN'
}

function formatYearMonth(ym: string, locale: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

function prevYearMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nextYearMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function isCurrentOrPast(ym: string): boolean {
  const now = new Date()
  const nowYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return ym <= nowYm
}

export const MonthlyHighlights = memo(function MonthlyHighlights({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation()
  const locale = getLocale(i18n.language)
  const { highlights, highlightsYearMonth, fetchHighlights, setHighlightsYearMonth } = useProgressStore()

  useEffect(() => {
    fetchHighlights(userId, highlightsYearMonth)
  }, [userId, highlightsYearMonth, fetchHighlights])

  const d = highlights.data

  const isNewTaskRecord = d ? d.tasks_done > 0 && d.tasks_done >= d.personal_best_tasks_month : false
  const isNewLineRecord = d ? d.lines_inserted > 0 && d.lines_inserted >= d.personal_best_lines_day * 20 : false

  return (
    <div className="p-6 space-y-5">
      <SectionHeader
        icon={<Star className="h-5 w-5 text-amber-500" />}
        title={t('progress.monthlyHighlights')}
        description={t('progress.monthlyHighlightsDesc')}
        actions={
          <div className="flex items-center gap-1">
            <button onClick={() => setHighlightsYearMonth(prevYearMonth(highlightsYearMonth))} className="p-1 rounded hover:bg-accent transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium min-w-[140px] text-center">{formatYearMonth(highlightsYearMonth, locale)}</span>
            {!isCurrentOrPast(nextYearMonth(highlightsYearMonth)) ? null : (
              <button
                onClick={() => {
                  const next = nextYearMonth(highlightsYearMonth)
                  if (isCurrentOrPast(next)) setHighlightsYearMonth(next)
                }}
                className="p-1 rounded hover:bg-accent transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        }
      />

      {highlights.loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[120px] w-full rounded-xl" />
        </div>
      ) : !d ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">{t('progress.noData')}</div>
      ) : (
        <>
          {/* This month summary */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('progress.thisPeriod')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <BigStatCard label={t('progress.commits')} value={d.commits_count} delta={{ curr: d.commits_count, prev: d.prev_commits }} prev={t('progress.prevMonth')} />
              <BigStatCard
                label={t('progress.tasksDone')}
                value={d.tasks_done}
                delta={{ curr: d.tasks_done, prev: d.prev_tasks }}
                prev={t('progress.prevMonth')}
                isNew={isNewTaskRecord && d.tasks_done > 0}
              />
              <BigStatCard label={t('progress.reviews')} value={d.reviews_done} delta={{ curr: d.reviews_done, prev: d.prev_reviews }} prev={t('progress.prevMonth')} />
              <BigStatCard label={t('progress.longestStreak')} value={`${d.longest_streak} ${t('progress.days')}`} />
              <BigStatCard label={t('progress.reportDays')} value={`${d.report_days}/${d.working_days}`} delta={{ curr: d.report_days, prev: d.prev_report_days }} />
              <BigStatCard label={t('progress.linesAdded')} value={`+${d.lines_inserted.toLocaleString()}`} isNew={isNewLineRecord && d.lines_inserted > 0} />
            </div>
          </div>

          {/* Personal bests */}
          <div className="rounded-xl bg-amber-50/50 dark:bg-amber-950/10 p-4 space-y-2.5">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">🏆 {t('progress.personalBests')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { label: t('progress.bestCommitsDay'), value: d.personal_best_commits_day, date: d.personal_best_commits_day_date },
                { label: t('progress.bestStreak'), value: `${d.personal_best_streak} ${t('progress.days')}` },
                { label: t('progress.bestTasksMonth'), value: d.personal_best_tasks_month },
                { label: t('progress.bestLinesDay'), value: `+${d.personal_best_lines_day.toLocaleString()}`, date: d.personal_best_lines_day_date },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1">
                  <span className="text-muted-foreground text-xs">{item.label}</span>
                  <div className="text-right">
                    <span className="font-bold">{item.value}</span>
                    {item.date && (
                      <p className="text-[10px] text-muted-foreground">{new Date(item.date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 6-month sparklines */}
          {d.six_months_trend.length > 0 && (
            <div className="rounded-xl bg-muted/40 p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('progress.sixMonthTrend')}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span className="font-medium text-[var(--chart-1)]">{t('progress.commits')}</span>
                    <div className="flex gap-2">
                      {d.six_months_trend.map(m => (
                        <span key={m.month} className={cn('font-medium', m.month === highlightsYearMonth ? 'text-foreground' : '')}>
                          {m.commits}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Sparkline data={d.six_months_trend} dataKey="commits" stroke="var(--chart-1)" />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span className="font-medium text-[var(--chart-2)]">{t('progress.tasks')}</span>
                    <div className="flex gap-2">
                      {d.six_months_trend.map(m => (
                        <span key={m.month} className={cn('font-medium', m.month === highlightsYearMonth ? 'text-foreground' : '')}>
                          {m.tasks}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Sparkline data={d.six_months_trend} dataKey="tasks" stroke="var(--chart-2)" />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
})
