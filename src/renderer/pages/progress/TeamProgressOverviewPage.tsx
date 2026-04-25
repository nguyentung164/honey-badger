'use client'

import { subDays } from 'date-fns'
import {
  ArrowDown,
  ArrowUp,
  BarChart2,
  ChevronDown,
  ChevronRight,
  Code2,
  GitCommit,
  Minus,
  Square,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { type CSSProperties, type ReactNode, Fragment, lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DateRangePickerPopover } from '@/components/ui-elements/DateRangePickerPopover'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { Combobox } from '@/components/ui/combobox'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'
import type { UserInfo } from '@/stores/useProgressStore'
import type { DateRange } from 'react-day-picker'

const TrendCharts = lazy(() => import('./components/TrendCharts').then(m => ({ default: m.TrendCharts })))
const DeveloperRadar = lazy(() => import('./components/DeveloperRadar').then(m => ({ default: m.DeveloperRadar })))
const TaskPerformancePanel = lazy(() => import('./components/TaskPerformancePanel').then(m => ({ default: m.TaskPerformancePanel })))
const CodeQualityPanel = lazy(() => import('./components/CodeQualityPanel').then(m => ({ default: m.CodeQualityPanel })))

/** Khớp MAX_TEAM_SUMMARY_USERS trong main/task/progressStore.ts */
const TEAM_SUMMARY_USER_CAP = 80

const TABLE_COL_COUNT = 12

type ProjectOpt = { id: string; name: string }
type DetailTab = 'trends' | 'radar' | 'ontime' | 'quality'
type SummaryRow = {
  user_id: string
  report_days: number
  working_days: number
  report_rate_pct: number
  tasks_total_done: number
  tasks_on_time: number
  on_time_rate_pct: number
  avg_delay_days: number | null
  avg_cycle_days: number | null
  rule_rate_pct: number
  spotbugs_rate_pct: number
  team_rule_rate_pct: number | null
  team_spotbugs_rate_pct: number | null
  peak_dow: number | null
  peak_hour: number | null
  peak_cnt: number
}

type SortKey =
  | 'name'
  | 'report_rate_pct'
  | 'report_days'
  | 'tasks_total_done'
  | 'on_time_rate_pct'
  | 'avg_delay_days'
  | 'avg_cycle_days'
  | 'rule_rate_pct'
  | 'spotbugs_rate_pct'
  | 'peak_cnt'

function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function PanelSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-[260px] w-full rounded-xl" />
    </div>
  )
}

function peakLabel(dow: number | null, hour: number | null, t: (k: string) => string): string {
  if (dow == null || hour == null || dow < 1 || dow > 7 || hour < 0 || hour > 23) return '—'
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const idx = dow - 1
  return `${t(`teamProgress.dow.${days[idx]}`)} ${String(hour).padStart(2, '0')}:00`
}

type RateTone = 'good' | 'mid' | 'bad'

function toneHigherIsBetter(pct: number): RateTone {
  if (pct >= 80) return 'good'
  if (pct >= 55) return 'mid'
  return 'bad'
}

function toneDelayDays(days: number): RateTone {
  if (days <= 0) return 'good'
  if (days <= 1.5) return 'mid'
  return 'bad'
}

function toneCycleDays(days: number): RateTone {
  if (days <= 7) return 'good'
  if (days <= 21) return 'mid'
  return 'bad'
}

/** Pill metric: không viền, gọn, một dòng */
const METRIC_PILL = 'inline-flex items-center rounded-md border-0 px-1.5 py-0.5 text-xs font-semibold tabular-nums leading-none shrink-0'

function rateBadgeClass(tone: RateTone): string {
  switch (tone) {
    case 'good':
      return 'bg-emerald-500/18 text-emerald-900 dark:text-emerald-400'
    case 'mid':
      return 'bg-amber-500/16 text-amber-950 dark:text-amber-400'
    case 'bad':
      return 'bg-red-500/15 text-red-900 dark:text-red-400'
  }
}

/** Chuỗi chênh lệch so với team (dùng khi cần một dòng ellipsis). */
function benchDeltaPlain(userPct: number, teamPct: number): string {
  const d = Math.round(userPct - teamPct)
  if (d === 0) return '0'
  if (d > 0) return `+${d}%`
  return `${d}%`
}

function NeutralCountBadge({ children }: { children: ReactNode }) {
  return <span className={cn(METRIC_PILL, 'bg-muted/55 text-foreground')}>{children}</span>
}

function numForSort(s: SummaryRow | undefined, key: Exclude<SortKey, 'name'>): number | null {
  if (!s) return null
  switch (key) {
    case 'avg_delay_days':
    case 'avg_cycle_days':
      return s[key] ?? null
    case 'peak_cnt':
      return s.peak_cnt ?? null
    default:
      return s[key] as number
  }
}

function compareRows(a: UserInfo, b: UserInfo, sa: SummaryRow | undefined, sb: SummaryRow | undefined, sortKey: SortKey, dir: 'asc' | 'desc'): number {
  const d = dir === 'asc' ? 1 : -1
  if (sortKey === 'name') {
    const c = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    return c * d
  }
  const va = numForSort(sa, sortKey)
  const vb = numForSort(sb, sortKey)
  if (va == null && vb == null) return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  if (va == null) return 1
  if (vb == null) return -1
  if (va < vb) return -1 * d
  if (va > vb) return 1 * d
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

function sortUsersList(users: UserInfo[], summaryByUser: Map<string, SummaryRow>, sortKey: SortKey, sortDir: 'asc' | 'desc'): UserInfo[] {
  const out = [...users]
  out.sort((a, b) => compareRows(a, b, summaryByUser.get(a.id), summaryByUser.get(b.id), sortKey, sortDir))
  return out
}

const TeamMemberDetailPanel = memo(function TeamMemberDetailPanel({
  user: u,
  fromStr,
  toStr,
  taskProjectId,
  teamUserIds,
  embedInCard = false,
}: {
  user: UserInfo
  fromStr: string
  toStr: string
  taskProjectId: string | null
  teamUserIds: string[]
  /** true: bỏ viền trên — dùng trong khung panel nhạt dưới hàng bảng */
  embedInCard?: boolean
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<DetailTab>('trends')

  return (
    <div
      className={cn('min-w-0', embedInCard ? 'pt-0' : 'border-t border-border/40 pt-2')}
      onClick={e => e.stopPropagation()}
    >
      {fromStr && toStr ? (
        <Tabs value={tab} onValueChange={v => setTab(v as DetailTab)} className="w-full">
          <TabsList className="h-9 min-h-9 flex-wrap gap-0.5">
            <TabsTrigger value="trends" className="text-base px-2.5 gap-1.5">
              <TrendingUp className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
              <span>{t('teamProgress.tabTrends')}</span>
            </TabsTrigger>
            <TabsTrigger value="radar" className="text-base px-2.5 gap-1.5">
              <Zap className="h-4 w-4 shrink-0 text-violet-500" aria-hidden />
              <span>{t('teamProgress.tabRadar')}</span>
            </TabsTrigger>
            <TabsTrigger value="ontime" className="text-base px-2.5 gap-1.5">
              <GitCommit className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
              <span>{t('teamProgress.tabOnTime')}</span>
            </TabsTrigger>
            <TabsTrigger value="quality" className="text-base px-2.5 gap-1.5">
              <Code2 className="h-4 w-4 shrink-0 text-cyan-500" aria-hidden />
              <span>{t('teamProgress.tabQuality')}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="trends" className="mt-2 min-w-0 outline-none">
            {tab === 'trends' ? (
              <Suspense fallback={<PanelSkeleton />}>
                <TrendCharts userId={u.id} isolated hideTitle noRootPadding dateFrom={fromStr} dateTo={toStr} defaultGranularity="week" />
              </Suspense>
            ) : null}
          </TabsContent>
          <TabsContent value="radar" className="mt-2 min-w-0 outline-none">
            {tab === 'radar' ? (
              <Suspense fallback={<PanelSkeleton />}>
                <DeveloperRadar userId={u.id} isolated hideTitle noRootPadding dateFrom={fromStr} dateTo={toStr} />
              </Suspense>
            ) : null}
          </TabsContent>
          <TabsContent value="ontime" className="mt-2 min-w-0 outline-none">
            {tab === 'ontime' ? (
              <Suspense fallback={<PanelSkeleton />}>
                <TaskPerformancePanel
                  userId={u.id}
                  isolated
                  hideTitle
                  noRootPadding
                  dateFrom={fromStr}
                  dateTo={toStr}
                  projectId={taskProjectId}
                  variant="onTimeOnly"
                />
              </Suspense>
            ) : null}
          </TabsContent>
          <TabsContent value="quality" className="mt-2 min-w-0 outline-none">
            {tab === 'quality' ? (
              <Suspense fallback={<PanelSkeleton />}>
                <CodeQualityPanel userId={u.id} isolated hideTitle noRootPadding dateFrom={fromStr} dateTo={toStr} teamUserIds={teamUserIds} />
              </Suspense>
            ) : null}
          </TabsContent>
        </Tabs>
      ) : (
        <p className="text-base text-muted-foreground py-4">{t('teamProgress.selectRange')}</p>
      )}
    </div>
  )
})

/** Ô chữ: ellipsis + tooltip khi hover (cần TooltipProvider tổ tiên). */
function CellOverflowTip({ text, className, children }: { text: string; className?: string; children: React.ReactNode }) {
  const tip = text.trim() || '—'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('block min-w-0 truncate', className)}>{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs break-words">
        {tip}
      </TooltipContent>
    </Tooltip>
  )
}

function SortTh({
  columnKey,
  currentKey,
  dir,
  onSort,
  children,
  className,
}: {
  columnKey: SortKey
  currentKey: SortKey | null
  dir: 'asc' | 'desc' | null
  onSort: (k: SortKey) => void
  children: React.ReactNode
  className?: string
}) {
  const active = currentKey === columnKey && dir != null
  const tipText = typeof children === 'string' || typeof children === 'number' ? String(children) : ''
  return (
    <TableHead className={cn('h-auto border-0 p-0 text-center', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex min-h-9 w-full max-w-full items-center justify-center gap-1 px-1 py-1.5 text-center text-[11px] font-medium leading-tight hover:bg-muted/45',
            )}
            onClick={e => {
              e.stopPropagation()
              onSort(columnKey)
            }}
          >
            <span className="truncate min-w-0 flex-1 text-center">{children}</span>
            {active ? (
              dir === 'asc' ? (
                <ArrowUp className="size-3.5 shrink-0 opacity-80" aria-hidden />
              ) : (
                <ArrowDown className="size-3.5 shrink-0 opacity-80" aria-hidden />
              )
            ) : null}
          </button>
        </TooltipTrigger>
        {tipText ? (
          <TooltipContent side="bottom" className="max-w-xs break-words">
            {tipText}
          </TooltipContent>
        ) : null}
      </Tooltip>
    </TableHead>
  )
}

export function TeamProgressOverviewPage() {
  const { t } = useTranslation()
  const verifySession = useTaskAuthStore(s => s.verifySession)
  const currentUser = useTaskAuthStore(s => s.user)

  const [projects, setProjects] = useState<ProjectOpt[]>([])
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [projectId, setProjectId] = useState<string | '__all__'>('__all__')
  /** null = chưa tải xong danh sách member cho project đang chọn (không dùng như «tất cả»). */
  const [memberIds, setMemberIds] = useState<Set<string> | null>(null)
  const [memberIdsLoading, setMemberIdsLoading] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const to = new Date()
    const from = subDays(to, 89)
    return { from, to }
  })
  const [rangeOpen, setRangeOpen] = useState(false)
  const [summaries, setSummaries] = useState<SummaryRow[]>([])
  /** user_id → danh sách tên dự án (dev/pl/pm), từ API */
  const [projectLabelByUserId, setProjectLabelByUserId] = useState<Record<string, string>>({})
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  /** Tristate: cùng cột bấm lần lượt asc → desc → tắt (thứ tự danh sách gốc) */
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)

  const onSort = useCallback((key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
      return
    }
    if (sortDir === 'asc') {
      setSortDir('desc')
    } else if (sortDir === 'desc') {
      setSortKey(null)
      setSortDir(null)
    } else {
      setSortDir('asc')
    }
  }, [sortKey, sortDir])

  const toggleExpanded = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    void verifySession()
  }, [verifySession])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [pu, uu] = await Promise.all([
        window.api.progress.getOverviewProjects(),
        window.api.progress.getAllUsers(),
      ])
      if (cancelled) return
      if (pu?.status === 'success' && Array.isArray(pu.data)) {
        setProjects(pu.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
      } else setProjects([])
      if (uu?.status === 'success' && Array.isArray(uu.data)) {
        setAllUsers(uu.data as UserInfo[])
      } else setAllUsers([])
    })()
    return () => {
      cancelled = true
    }
  }, [currentUser?.id])

  useEffect(() => {
    setExpanded(new Set())
    if (projectId === '__all__') {
      setMemberIds(null)
      setMemberIdsLoading(false)
      return
    }
    let cancelled = false
    setMemberIds(null)
    setMemberIdsLoading(true)
    void window.api.progress.getProjectMemberUserIds(projectId).then(res => {
      if (cancelled) return
      setMemberIdsLoading(false)
      if (res?.status === 'success' && Array.isArray(res.data)) {
        setMemberIds(new Set(res.data.map(String)))
      } else setMemberIds(new Set())
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const filteredUsers = useMemo(() => {
    if (projectId === '__all__') return allUsers
    if (memberIdsLoading || memberIds === null) return []
    return allUsers.filter(u => memberIds.has(u.id))
  }, [allUsers, memberIds, memberIdsLoading, projectId])

  const fromStr = dateRange?.from ? fmtLocalDate(dateRange.from) : ''
  const toStr = dateRange?.to ? fmtLocalDate(dateRange.to) : dateRange?.from ? fmtLocalDate(dateRange.from) : ''

  /** Trùng tập user với batch summary (tối đa TEAM_SUMMARY_USER_CAP) để % team khớp hàng tổng hợp. */
  const teamUserIdsForCharts = useMemo(() => {
    const ids = filteredUsers.map(u => u.id)
    return ids.length <= TEAM_SUMMARY_USER_CAP ? ids : ids.slice(0, TEAM_SUMMARY_USER_CAP)
  }, [filteredUsers])

  const loadSummaries = useCallback(async () => {
    if (!fromStr || !toStr || filteredUsers.length === 0) {
      setSummaries([])
      setProjectLabelByUserId({})
      setSummaryLoading(false)
      return
    }
    setSummaryLoading(true)
    setLoadErr(null)
    const userIds = filteredUsers.map(u => u.id)
    const [res, projRes] = await Promise.all([
      window.api.progress.getTeamSummary({
        userIds,
        from: fromStr,
        to: toStr,
        projectId: projectId === '__all__' ? null : projectId,
      }),
      window.api.progress.getTeamOverviewUserProjects(userIds),
    ])
    setSummaryLoading(false)
    if (projRes?.status === 'success' && projRes.data != null && typeof projRes.data === 'object' && !Array.isArray(projRes.data)) {
      setProjectLabelByUserId(projRes.data as Record<string, string>)
    } else {
      setProjectLabelByUserId({})
    }
    if (res?.status === 'success' && Array.isArray(res.data)) {
      setSummaries(res.data as SummaryRow[])
      setLoadErr(null)
    } else {
      setSummaries([])
      setLoadErr(res?.message ?? t('teamProgress.summaryError'))
    }
  }, [filteredUsers, fromStr, toStr, projectId, t])

  useEffect(() => {
    void loadSummaries()
  }, [loadSummaries])

  const summaryByUser = useMemo(() => {
    const m = new Map<string, SummaryRow>()
    for (const r of summaries) m.set(r.user_id, r)
    return m
  }, [summaries])

  const sortedUsers = useMemo(() => {
    if (sortKey == null || sortDir == null) return filteredUsers
    return sortUsersList(filteredUsers, summaryByUser, sortKey, sortDir)
  }, [filteredUsers, summaryByUser, sortKey, sortDir])

  const projectOptions = useMemo(() => {
    const opts = [
      { value: '__all__', label: t('teamProgress.allProjects'), render: <span>{t('teamProgress.allProjects')}</span> },
      ...projects.map(p => ({
        value: p.id,
        label: p.name,
        render: <span className="truncate">{p.name}</span>,
      })),
    ]
    return opts
  }, [projects, t])

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  /**
   * Zebra + hover: trộn muted với background để tương phản rõ; hover đậm hơn một bậc.
   * Panel con (embed) dùng nền nhạt hơn hàng — xem wrapper dưới TableCell.
   */
  const teamRowClass = (idx: number) =>
    cn(
      'border-0 transition-[background-color] duration-150',
      idx % 2 === 0
        ? '![background-color:color-mix(in_oklch,var(--muted)_24%,var(--background))] hover:![background-color:color-mix(in_oklch,var(--muted)_42%,var(--background))]'
        : '![background-color:color-mix(in_oklch,var(--muted)_46%,var(--background))] hover:![background-color:color-mix(in_oklch,var(--muted)_62%,var(--background))]',
    )

  /** Chờ xong member project + xong batch summary rồi mới render bảng — tránh hàng lệch tốc độ / danh sách cũ. */
  const tableBlockingLoad =
    (projectId !== '__all__' && (memberIdsLoading || memberIds === null)) ||
    (filteredUsers.length > 0 && summaryLoading)

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden select-none">
      <div
        className="flex items-center justify-between h-9 text-base select-none shrink-0"
        style={{ WebkitAppRegion: 'drag', backgroundColor: 'var(--main-bg)', color: 'var(--main-fg)' } as CSSProperties}
      >
        <div className="flex items-center h-full min-w-0 gap-2">
          <div className="w-15 h-6 flex justify-center pt-1.5 pl-1 shrink-0">
            <img src="logo.png" alt="" draggable={false} className="w-10 h-3.5 dark:brightness-130" />
          </div>
          <div className="flex items-center gap-2 min-w-0 flex-wrap" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            <BarChart2 size={13} className="text-blue-500 shrink-0" />
            <span className="font-medium shrink-0 text-base">{t('teamProgress.pageTitle')}</span>
            <div className="w-[min(200px,28vw)] min-w-[140px] h-8">
              <Combobox
                value={projectId}
                onValueChange={v => setProjectId((v as string) || '__all__')}
                options={projectOptions}
                placeholder={t('teamProgress.projectFilter')}
                searchPlaceholder={t('common.search')}
                emptyText={t('progress.noUsersMatch')}
                variant="ghost"
                size="sm"
                className="w-full"
                triggerClassName="h-8 py-0 text-base font-medium rounded-md border-0 bg-transparent text-blue-600 dark:text-blue-400"
              />
            </div>
            <DateRangePickerPopover
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              open={rangeOpen}
              onOpenChange={setRangeOpen}
              allTimeLabel={t('teamProgress.selectRange')}
              confirmLabel={t('common.confirm')}
            />
          </div>
        </div>
        <div className="flex gap-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <button type="button" onClick={() => handleWindow('minimize')} className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]">
            <Minus size={15.5} strokeWidth={1} absoluteStrokeWidth />
          </button>
          <button type="button" onClick={() => handleWindow('maximize')} className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]">
            <Square size={14.5} strokeWidth={1} absoluteStrokeWidth />
          </button>
          <button type="button" onClick={() => handleWindow('close')} className="w-10 h-8 flex items-center justify-center hover:bg-red-600 hover:text-white">
            <X size={20} strokeWidth={1} absoluteStrokeWidth />
          </button>
        </div>
      </div>

      {/* Giống bảng WBS (AC): scroll dọc/ngang trong khối bảng; header sticky theo khối đó */}
      <div className="flex flex-1 min-h-0 flex-col gap-0 overflow-hidden p-4 pt-1">
        <div className="shrink-0 space-y-2">
          {filteredUsers.length > TEAM_SUMMARY_USER_CAP && (
            <p className="text-base text-amber-700 dark:text-amber-400/90 rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1.5">
              {t('teamProgress.summaryCapped', { max: TEAM_SUMMARY_USER_CAP })}
            </p>
          )}
          {loadErr && <p className="text-base text-destructive">{loadErr}</p>}
        </div>

        {tableBlockingLoad ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border/40 shadow-sm">
            <div
              className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-muted-foreground"
              role="status"
              aria-busy="true"
              aria-label={t('common.loading')}
            >
              <GlowLoader className="h-10 w-10" />
              <span className="text-base">{t('common.loading')}</span>
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16 text-muted-foreground gap-2 min-h-0">
            <Users className="h-10 w-10 opacity-40" />
            <p className="text-base">{t('teamProgress.noUsers')}</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border/40 shadow-sm min-w-0">
            <TooltipProvider delayDuration={350}>
            <div className="min-h-0 min-w-0 flex-1 overflow-auto">
              <Table className="w-max min-w-full border-0 text-sm [&_td]:border-0 [&_th]:border-0">
                <TableHeader
                  sticky
                  className="[&_tr]:border-0 [&_tr:hover]:bg-transparent [&>tr]:bg-[var(--table-header-bg)]"
                >
                  <TableRow className="border-0 hover:bg-transparent">
                <TableHead className="w-8 shrink-0 rounded-tl-md p-0 border-0" aria-hidden />
                <SortTh
                  columnKey="name"
                  currentKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                  className="min-w-[72px] max-w-[min(132px,18vw)]"
                >
                  {t('common.name')}
                </SortTh>
                <TableHead className="h-auto min-w-[56px] max-w-[min(120px,16vw)] border-0 p-0 align-middle">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex min-h-9 cursor-default items-center justify-center px-1 py-1.5">
                        <span className="truncate text-center text-[11px] font-medium leading-tight">
                          {t('teamProgress.columnProject')}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs break-words">
                      {t('teamProgress.columnProject')}
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <SortTh columnKey="report_rate_pct" currentKey={sortKey} dir={sortDir} onSort={onSort} className="w-[64px] max-w-[68px]">
                  {t('teamProgress.reportRate')}
                </SortTh>
                <SortTh columnKey="report_days" currentKey={sortKey} dir={sortDir} onSort={onSort} className="w-[56px] max-w-[60px]">
                  {t('teamProgress.reportDays')}
                </SortTh>
                <SortTh columnKey="tasks_total_done" currentKey={sortKey} dir={sortDir} onSort={onSort} className="w-[56px] max-w-[60px]">
                  {t('teamProgress.tasksDone')}
                </SortTh>
                <SortTh columnKey="on_time_rate_pct" currentKey={sortKey} dir={sortDir} onSort={onSort} className="w-[64px] max-w-[68px]">
                  {t('teamProgress.onTimeRate')}
                </SortTh>
                <SortTh columnKey="avg_delay_days" currentKey={sortKey} dir={sortDir} onSort={onSort} className="w-[60px] max-w-[64px]">
                  {t('teamProgress.avgDelay')}
                </SortTh>
                <SortTh columnKey="avg_cycle_days" currentKey={sortKey} dir={sortDir} onSort={onSort} className="w-[60px] max-w-[64px]">
                  {t('teamProgress.avgCycle')}
                </SortTh>
                <SortTh columnKey="rule_rate_pct" currentKey={sortKey} dir={sortDir} onSort={onSort} className="min-w-[72px] max-w-[96px]">
                  {t('teamProgress.ruleCheck')}
                </SortTh>
                <SortTh columnKey="spotbugs_rate_pct" currentKey={sortKey} dir={sortDir} onSort={onSort} className="min-w-[72px] max-w-[96px]">
                  {t('teamProgress.spotbugs')}
                </SortTh>
                <SortTh columnKey="peak_cnt" currentKey={sortKey} dir={sortDir} onSort={onSort} className="min-w-[68px] max-w-[min(100px,14vw)] rounded-tr-md">
                  {t('teamProgress.peakHours')}
                </SortTh>
                  </TableRow>
                </TableHeader>
                {/* Không dùng TableBody: tránh zebra/hover mặc định ghi đè nền hàng */}
                <tbody data-slot="table-body" className="[&>tr]:border-0">
                  {sortedUsers.map((u, idx) => {
                    const s = summaryByUser.get(u.id)
                    const open = expanded.has(u.id)
                    const projectLabelTrimmed = (projectLabelByUserId[u.id] ?? '').trim()
                    const projectCellText = projectLabelTrimmed || '—'
                    return (
                      <Fragment key={u.id}>
                        <TableRow
                          role="button"
                          tabIndex={0}
                          aria-expanded={open}
                          aria-label={open ? t('teamProgress.collapseDetails') : t('teamProgress.expandDetails')}
                          className={cn('cursor-pointer', teamRowClass(idx))}
                          onClick={() => toggleExpanded(u.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggleExpanded(u.id)
                            }
                          }}
                        >
                      <TableCell className="w-8 shrink-0 px-0.5 py-2 border-0 align-middle">
                        {open ? <ChevronDown className="size-4 text-muted-foreground mx-auto" aria-hidden /> : <ChevronRight className="size-4 text-muted-foreground mx-auto" aria-hidden />}
                      </TableCell>
                      <TableCell className="max-w-[min(132px,18vw)] min-w-[72px] py-1.5 px-1 border-0 align-middle">
                        <CellOverflowTip text={u.name} className="font-medium">
                          {u.name}
                        </CellOverflowTip>
                      </TableCell>
                      <TableCell className="max-w-[min(120px,16vw)] min-w-[56px] py-1.5 px-1 border-0 align-middle">
                        <CellOverflowTip text={projectCellText} className="text-muted-foreground text-xs">
                          {projectCellText}
                        </CellOverflowTip>
                      </TableCell>
                      <TableCell className="w-[64px] max-w-[68px] text-right py-1 px-1 border-0 align-middle">
                        {s ? (
                          <div className="flex justify-end">
                            <span className={cn(METRIC_PILL, rateBadgeClass(toneHigherIsBetter(s.report_rate_pct)))}>{s.report_rate_pct}%</span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="w-[56px] max-w-[60px] text-right py-1 px-1 border-0 align-middle">
                        {s ? (
                          <div className="flex justify-end">
                            <NeutralCountBadge>{s.report_days}</NeutralCountBadge>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="w-[56px] max-w-[60px] text-right py-1 px-1 border-0 align-middle">
                        {s ? (
                          <div className="flex justify-end">
                            <NeutralCountBadge>{s.tasks_total_done}</NeutralCountBadge>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="w-[64px] max-w-[68px] text-right py-1 px-1 border-0 align-middle">
                        {s ? (
                          <div className="flex justify-end">
                            <span className={cn(METRIC_PILL, rateBadgeClass(toneHigherIsBetter(s.on_time_rate_pct)))}>{s.on_time_rate_pct}%</span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="w-[60px] max-w-[64px] text-right py-1 px-1 border-0 align-middle">
                        {s?.avg_delay_days != null ? (
                          <div className="flex justify-end">
                            <span className={cn(METRIC_PILL, 'gap-0.5', rateBadgeClass(toneDelayDays(Number(s.avg_delay_days))))}>
                              {Number(s.avg_delay_days) > 0 ? (
                                <ArrowUp className="size-3 shrink-0 opacity-80" aria-hidden />
                              ) : Number(s.avg_delay_days) < 0 ? (
                                <ArrowDown className="size-3 shrink-0 opacity-80" aria-hidden />
                              ) : null}
                              {s.avg_delay_days > 0 ? '+' : ''}
                              {Number(s.avg_delay_days).toFixed(1)}
                            </span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="w-[60px] max-w-[64px] text-right py-1 px-1 border-0 align-middle">
                        {s?.avg_cycle_days != null ? (
                          <div className="flex justify-end">
                            <span className={cn(METRIC_PILL, rateBadgeClass(toneCycleDays(Number(s.avg_cycle_days))))}>
                              {Number(s.avg_cycle_days).toFixed(1)}
                            </span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="min-w-[72px] max-w-[96px] py-1 px-1 border-0 align-middle">
                        {s ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="min-w-0 max-w-full cursor-default text-right text-xs tabular-nums leading-tight overflow-hidden text-ellipsis whitespace-nowrap">
                                <span className={cn(METRIC_PILL, 'align-middle', rateBadgeClass(toneHigherIsBetter(s.rule_rate_pct)))}>
                                  {s.rule_rate_pct}%
                                </span>
                                {s.team_rule_rate_pct != null ? (
                                  <span className="text-muted-foreground">
                                    {' '}
                                    · {s.team_rule_rate_pct}% {benchDeltaPlain(s.rule_rate_pct, s.team_rule_rate_pct)}
                                  </span>
                                ) : null}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs space-y-1 break-words">
                              <p className="font-medium tabular-nums">
                                {s.rule_rate_pct}%
                                {s.team_rule_rate_pct != null ? ` · ${s.team_rule_rate_pct}% (${benchDeltaPlain(s.rule_rate_pct, s.team_rule_rate_pct)})` : ''}
                              </p>
                              <p className="text-muted-foreground text-[11px] leading-snug">
                                {s.team_rule_rate_pct != null
                                  ? t('teamProgress.teamAvgTooltip')
                                  : t('teamProgress.noProjectTeamBench')}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="min-w-[72px] max-w-[96px] py-1 px-1 border-0 align-middle">
                        {s ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="min-w-0 max-w-full cursor-default text-right text-xs tabular-nums leading-tight overflow-hidden text-ellipsis whitespace-nowrap">
                                <span className={cn(METRIC_PILL, 'align-middle', rateBadgeClass(toneHigherIsBetter(s.spotbugs_rate_pct)))}>
                                  {s.spotbugs_rate_pct}%
                                </span>
                                {s.team_spotbugs_rate_pct != null ? (
                                  <span className="text-muted-foreground">
                                    {' '}
                                    · {s.team_spotbugs_rate_pct}% {benchDeltaPlain(s.spotbugs_rate_pct, s.team_spotbugs_rate_pct)}
                                  </span>
                                ) : null}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs space-y-1 break-words">
                              <p className="font-medium tabular-nums">
                                {s.spotbugs_rate_pct}%
                                {s.team_spotbugs_rate_pct != null
                                  ? ` · ${s.team_spotbugs_rate_pct}% (${benchDeltaPlain(s.spotbugs_rate_pct, s.team_spotbugs_rate_pct)})`
                                  : ''}
                              </p>
                              <p className="text-muted-foreground text-[11px] leading-snug">
                                {s.team_spotbugs_rate_pct != null
                                  ? t('teamProgress.teamAvgTooltip')
                                  : t('teamProgress.noProjectTeamBench')}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="min-w-[68px] max-w-[min(100px,14vw)] py-1 px-1 border-0 align-middle">
                        {s ? (
                          <div className="flex justify-end min-w-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={cn(
                                    METRIC_PILL,
                                    'max-w-full cursor-default truncate font-medium bg-violet-500/16 text-violet-950 dark:text-violet-300',
                                  )}
                                >
                                  {peakLabel(s.peak_dow, s.peak_hour, t)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs break-words">
                                {peakLabel(s.peak_dow, s.peak_hour, t)}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                        </TableRow>
                        {open ? (
                          <TableRow className={teamRowClass(idx)}>
                            <TableCell colSpan={TABLE_COL_COUNT} className="p-0 px-2 pb-3 pt-1 border-0 align-top">
                              <div
                                className={cn(
                                  'rounded-lg border border-border/50 shadow-sm',
                                  'bg-[color-mix(in_oklch,var(--background)_94%,var(--muted)_6%)]',
                                  'dark:bg-[color-mix(in_oklch,var(--background)_88%,var(--muted)_12%)]',
                                  'px-2 py-2 min-w-0',
                                )}
                              >
                                <TeamMemberDetailPanel
                                  user={u}
                                  fromStr={fromStr}
                                  toStr={toStr}
                                  taskProjectId={projectId === '__all__' ? null : projectId}
                                  teamUserIds={teamUserIdsForCharts}
                                  embedInCard
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </Table>
            </div>
            </TooltipProvider>
          </div>
        )}
      </div>
    </div>
  )
}
