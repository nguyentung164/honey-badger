'use client'
import { lazy, Suspense } from 'react'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'

const SettingsDialog = lazy(() => import('@/components/dialogs/app/SettingsDialog').then(m => ({ default: m.SettingsDialog })))

import { Separator } from '@radix-ui/react-separator'
import { format } from 'date-fns'
import {
  AlertCircle,
  AreaChart as AreaChartIcon,
  ArrowDown,
  ArrowUp,
  BarChart2,
  BarChart3,
  CalendarIcon,
  ChevronDown,
  Copy,
  ExternalLink,
  Filter,
  Folder,
  FolderOpen,
  GitBranch,
  LineChart as LineChartIcon,
  Minus,
  RefreshCw,
  Search,
  Settings,
  Square,
  Turtle,
  X,
} from 'lucide-react'
import { IPC } from 'main/constants'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Checkbox } from '@/components/ui/checkbox'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusIcon } from '@/components/ui-elements/StatusIcon'
import toast from '@/components/ui-elements/Toast'
import { formatDateDisplay, getDateFnsLocale, getDateOnlyPattern, parseLocalDate } from '@/lib/dateUtils'
import i18n from '@/lib/i18n'
import { cn, getProgressColor } from '@/lib/utils'
import logger from '@/services/logger'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { getConfigDataRelevantSnapshot, useConfigurationStore } from '@/stores/useConfigurationStore'

const DASHBOARD_DATE_RANGE_KEY = 'dashboard-date-range'

function loadDateRangeFromStorage(): DateRange | undefined {
  try {
    const raw = localStorage.getItem(DASHBOARD_DATE_RANGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { from: string; to?: string }
    if (!parsed.from) return undefined
    const from = new Date(parsed.from)
    const to = parsed.to ? new Date(parsed.to) : undefined
    return { from, to }
  } catch {
    return undefined
  }
}

function saveDateRangeToStorage(range: DateRange | undefined) {
  if (!range?.from) {
    localStorage.removeItem(DASHBOARD_DATE_RANGE_KEY)
    return
  }
  localStorage.setItem(
    DASHBOARD_DATE_RANGE_KEY,
    JSON.stringify({
      from: range.from.toISOString(),
      to: range.to?.toISOString(),
    })
  )
}

const defaultDateRange = (): DateRange => {
  const today = new Date()
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(today.getDate() - 7)
  return { from: oneWeekAgo, to: today }
}

const allTimeDateRange = (): DateRange => {
  const today = new Date()
  const longAgo = new Date(2000, 0, 1)
  return { from: longAgo, to: today }
}

interface RepoSummary {
  name: string
  path: string
  vcsType: 'git' | 'svn' | 'none'
  totalCommits: number
  recentCommitsCount: number
  commitIdsInRange?: string[]
  lastCommitDate?: string
  lastCommitAuthor?: string
  lastCommitMessage?: string
  currentBranch?: string
  currentRevision?: string
  error?: string
}

interface RepoRow extends RepoSummary {
  reviewedCount: number
  unreviewedCount: number
}

interface CommitActivityAuthor {
  author: string
  commitCount: number
  fileCount: number
  firstCommitTime: string
  lastCommitTime: string
  fileTypes: { added: number; modified: number; deleted: number }
  branch?: string
}

interface CommitActivityRepo {
  name: string
  path: string
  vcsType: 'git' | 'svn'
  authors: CommitActivityAuthor[]
  branch?: string
  currentRevision?: string
  error?: string
}

type SortColumn = 'name' | 'vcs' | 'total' | 'reviewed' | 'unreviewed' | 'recent' | 'lastCommit' | 'lastCommitAuthor' | 'branchOrRev'
type SortDir = 'asc' | 'desc'
type ActivitySortColumn = 'author' | 'commits' | 'files' | 'firstCommit' | 'lastCommit' | 'fileTypes' | 'branch'
type VcsFilter = 'all' | 'git' | 'svn'

interface StatisticsData {
  commitsByDate: { date: string; authors: { author: string; count: number }[]; totalCount: number }[]
  commitsByAuthor: { author: string; count: number }[]
  authorship: { author: string; percentage: number; count: number }[]
  summary: { author: string; count: number; percentage: number }[]
  totalCommits: number
  commitsByHour?: { hour: number; count: number }[]
}

type CommitByDateChartType = 'bar-stacked' | 'line-multiple' | 'area-multiple'
type CommitByAuthorChartType = 'bar-vertical' | 'pie'

function getErrorMessage(error: string | undefined, t: (key: string) => string): string {
  if (!error) return ''
  if (error === 'not-vcs') return t('dashboard.errorNotVcs')
  return error
}

export function Dashboard() {
  const { t } = useTranslation()
  const dashboardDateFnsLocale = getDateFnsLocale(i18n.language)
  const dashboardDatePattern = getDateOnlyPattern(i18n.language)
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [isLoading, setIsLoading] = useState(true)
  const [rows, setRows] = useState<RepoRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => loadDateRangeFromStorage() ?? defaultDateRange())
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [datePickerValue, setDatePickerValue] = useState<DateRange | undefined>(dateRange)
  const [searchQuery, setSearchQuery] = useState('')
  const [vcsFilter, setVcsFilter] = useState<VcsFilter>('all')
  const [sortColumn, setSortColumn] = useState<SortColumn>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [activitySortColumn, setActivitySortColumn] = useState<ActivitySortColumn>('commits')
  const [activitySortDir, setActivitySortDir] = useState<SortDir>('desc')
  const [showSettings, setShowSettings] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'charts'>('overview')
  const [activityRows, setActivityRows] = useState<CommitActivityRepo[]>([])
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)
  const [chartData, setChartData] = useState<StatisticsData | null>(null)
  const [isLoadingCharts, setIsLoadingCharts] = useState(false)
  const [chartsSubTab, setChartsSubTab] = useState<'by-date' | 'by-author' | 'by-hour'>('by-date')
  const [commitByDateChartType, setCommitByDateChartType] = useState<CommitByDateChartType>('bar-stacked')
  const [commitByAuthorChartType, setCommitByAuthorChartType] = useState<CommitByAuthorChartType>('bar-vertical')
  const [selectedChartAuthors, setSelectedChartAuthors] = useState<string[]>([])
  const [chartFilterPopoverOpen, setChartFilterPopoverOpen] = useState(false)
  const [hasInitializedChartAuthors, setHasInitializedChartAuthors] = useState(false)
  const [selectedChartRepo, setSelectedChartRepo] = useState<string>('')
  const dataSnapshotRef = useRef<string | null>(null)

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  const loadData = useCallback(async (range?: DateRange) => {
    setIsLoading(true)
    setError(null)
    try {
      const options = range?.from
        ? {
          dateFrom: format(range.from, 'yyyy-MM-dd'),
          dateTo: range.to ? format(range.to, 'yyyy-MM-dd') : format(range.from, 'yyyy-MM-dd'),
        }
        : undefined
      const summaries = await window.api.dashboard.getRepoSummary(options)

      const rowsWithReviews: RepoRow[] = await Promise.all(
        summaries.map(async (s: RepoSummary) => {
          let reviewedCount = 0
          if (s.vcsType !== 'none' && !s.error) {
            try {
              const res = await window.api.task.commitReview.getAllBySourceFolder(s.path)
              const reviews = res.status === 'success' && Array.isArray(res.data) ? res.data : []
              const reviewedCommitIds = new Set(reviews.map((r: { commitId: string }) => r.commitId))
              if (s.commitIdsInRange && s.commitIdsInRange.length > 0) {
                reviewedCount = s.commitIdsInRange.filter((id: string) => reviewedCommitIds.has(id)).length
              } else {
                reviewedCount = reviews.length
              }
            } catch (e) {
              logger.error(`Error loading reviews for ${s.name}:`, e)
            }
          }
          const unreviewedCount = Math.max(0, s.totalCommits - reviewedCount)
          return {
            ...s,
            reviewedCount,
            unreviewedCount,
          }
        })
      )

      setRows(rowsWithReviews)
    } catch (err) {
      logger.error('Error loading dashboard data:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadActivityData = useCallback(async (range?: DateRange) => {
    const effectiveRange = range === undefined ? allTimeDateRange() : range
    if (!effectiveRange?.from) return
    setIsLoadingActivity(true)
    try {
      const dateFrom = format(effectiveRange.from, 'yyyy-MM-dd')
      const dateTo = effectiveRange.to ? format(effectiveRange.to, 'yyyy-MM-dd') : dateFrom
      const data = await window.api.dashboard.getCommitActivity({ dateFrom, dateTo })
      setActivityRows(data)
    } catch (err) {
      logger.error('Error loading commit activity:', err)
      setActivityRows([])
    } finally {
      setIsLoadingActivity(false)
    }
  }, [])

  const loadChartData = useCallback(async (range?: DateRange, repoPath?: string) => {
    const effectiveRange = range === undefined ? allTimeDateRange() : range
    if (!effectiveRange?.from) return
    setIsLoadingCharts(true)
    try {
      const dateFrom = format(effectiveRange.from, 'yyyy-MM-dd')
      const dateTo = effectiveRange.to ? format(effectiveRange.to, 'yyyy-MM-dd') : dateFrom
      const data = await window.api.dashboard.getChartData({
        dateFrom,
        dateTo,
        path: repoPath,
      })
      setChartData(data)
      setHasInitializedChartAuthors(false)
    } catch (err) {
      logger.error('Error loading chart data:', err)
      setChartData(null)
    } finally {
      setIsLoadingCharts(false)
    }
  }, [])

  const chartRepoOptions = useMemo(() => {
    return rows.filter(r => r.vcsType === 'git' || r.vcsType === 'svn').map(r => ({ name: r.name, path: r.path, vcsType: r.vcsType }))
  }, [rows])

  const getChartRepoVCSIcon = (vcsType: string) => {
    if (vcsType === 'git') return <GitBranch className="h-3 w-3" />
    if (vcsType === 'svn') return <Turtle className="h-3 w-3" />
    return <Folder className="h-3 w-3 opacity-50" />
  }

  const getChartRepoVCSText = (vcsType: string) => {
    if (vcsType === 'git') return 'Git'
    if (vcsType === 'svn') return 'SVN'
    return ''
  }

  useEffect(() => {
    dataSnapshotRef.current = getConfigDataRelevantSnapshot(useConfigurationStore.getState())
    loadData(dateRange)
  }, [loadData, dateRange])

  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivityData(dateRange)
    }
  }, [activeTab, dateRange, loadActivityData])

  useEffect(() => {
    if (chartRepoOptions.length > 0 && !chartRepoOptions.some(r => r.path === selectedChartRepo)) {
      setSelectedChartRepo(chartRepoOptions[0].path)
    }
  }, [chartRepoOptions, selectedChartRepo])

  useEffect(() => {
    if (activeTab === 'charts' && selectedChartRepo) {
      loadChartData(dateRange, selectedChartRepo)
    }
  }, [activeTab, dateRange, selectedChartRepo, loadChartData])

  useEffect(() => {
    setDatePickerValue(dateRange)
  }, [dateRange])

  useEffect(() => {
    saveDateRangeToStorage(dateRange)
  }, [dateRange])

  useEffect(() => {
    const handler = () => {
      const newSnapshot = getConfigDataRelevantSnapshot(useConfigurationStore.getState())
      if (dataSnapshotRef.current !== null && dataSnapshotRef.current === newSnapshot) {
        return
      }
      dataSnapshotRef.current = newSnapshot
      loadData(dateRange)
    }
    window.api.on(IPC.CONFIG_UPDATED, handler)
    return () => window.api.removeAllListeners(IPC.CONFIG_UPDATED)
  }, [loadData, dateRange])

  const filteredAndSortedRows = useMemo(() => {
    let result = [...rows]
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(r => r.name.toLowerCase().includes(q))
    }
    if (vcsFilter !== 'all') {
      result = result.filter(r => r.vcsType === vcsFilter)
    }
    result.sort((a, b) => {
      let cmp = 0
      switch (sortColumn) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'vcs':
          cmp = (a.vcsType || 'none').localeCompare(b.vcsType || 'none')
          break
        case 'total':
          cmp = (a.error ? 0 : a.totalCommits) - (b.error ? 0 : b.totalCommits)
          break
        case 'reviewed':
          cmp = (a.error ? 0 : a.reviewedCount) - (b.error ? 0 : b.reviewedCount)
          break
        case 'unreviewed':
          cmp = (a.error ? 0 : a.unreviewedCount) - (b.error ? 0 : b.unreviewedCount)
          break
        case 'recent':
          cmp = (a.error ? 0 : a.recentCommitsCount) - (b.error ? 0 : b.recentCommitsCount)
          break
        case 'lastCommit':
          cmp = (a.lastCommitDate ? new Date(a.lastCommitDate).getTime() : 0) - (b.lastCommitDate ? new Date(b.lastCommitDate).getTime() : 0)
          break
        case 'lastCommitAuthor':
          cmp = (a.lastCommitAuthor ?? '').localeCompare(b.lastCommitAuthor ?? '')
          break
        case 'branchOrRev':
          cmp = (a.currentBranch ?? a.currentRevision ?? '').localeCompare(b.currentBranch ?? b.currentRevision ?? '')
          break
        default:
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [rows, searchQuery, vcsFilter, sortColumn, sortDir])

  const getSortedAuthors = useCallback(
    (authors: CommitActivityAuthor[], repo: CommitActivityRepo) => {
      return [...authors].sort((a, b) => {
        let cmp = 0
        switch (activitySortColumn) {
          case 'author':
            cmp = a.author.localeCompare(b.author)
            break
          case 'commits':
            cmp = a.commitCount - b.commitCount
            break
          case 'files':
            cmp = a.fileCount - b.fileCount
            break
          case 'firstCommit':
            cmp = new Date(a.firstCommitTime).getTime() - new Date(b.firstCommitTime).getTime()
            break
          case 'lastCommit':
            cmp = new Date(a.lastCommitTime).getTime() - new Date(b.lastCommitTime).getTime()
            break
          case 'fileTypes':
            cmp = a.fileTypes.added + a.fileTypes.modified + a.fileTypes.deleted - (b.fileTypes.added + b.fileTypes.modified + b.fileTypes.deleted)
            break
          case 'branch':
            cmp = (a.branch ?? repo.branch ?? repo.currentRevision ?? '').localeCompare(b.branch ?? repo.branch ?? repo.currentRevision ?? '')
            break
          default:
            break
        }
        return activitySortDir === 'asc' ? cmp : -cmp
      })
    },
    [activitySortColumn, activitySortDir]
  )

  const summary = useMemo(() => {
    const validRows = rows.filter(r => !r.error && r.vcsType !== 'none')
    const totalRepos = validRows.length
    const totalUnreviewed = validRows.reduce((s, r) => s + r.unreviewedCount, 0)
    const totalCommits = validRows.reduce((s, r) => s + r.totalCommits, 0)
    const totalReviewed = validRows.reduce((s, r) => s + r.reviewedCount, 0)
    const progress = totalCommits > 0 ? Math.round((totalReviewed / totalCommits) * 100) : 100
    return { totalRepos, totalUnreviewed, totalReviewed, totalCommits, progress }
  }, [rows])

  const chartAllAuthors = useMemo(() => {
    const authors = new Set<string>()
    if (chartData?.commitsByDate) {
      for (const day of chartData.commitsByDate) {
        for (const a of day.authors) authors.add(a.author)
      }
    }
    return Array.from(authors).sort()
  }, [chartData?.commitsByDate])

  useEffect(() => {
    if (chartAllAuthors.length > 0 && !hasInitializedChartAuthors) {
      setSelectedChartAuthors(chartAllAuthors)
      setHasInitializedChartAuthors(true)
    }
  }, [chartAllAuthors, hasInitializedChartAuthors])

  const chartProcessedStackedDateData = useMemo(() => {
    if (!chartData?.commitsByDate) return []
    const authorsToShow = hasInitializedChartAuthors ? selectedChartAuthors : chartAllAuthors
    return [...chartData.commitsByDate]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(day => {
        const dayData: { date: string; totalCount: number;[key: string]: number | string } = {
          date: day.date,
          totalCount: 0,
        }
        for (const author of authorsToShow) dayData[author] = 0
        let filteredTotal = 0
        for (const { author, count } of day.authors) {
          if (authorsToShow.includes(author)) {
            dayData[author] = count
            filteredTotal += count
          }
        }
        dayData.totalCount = filteredTotal
        return dayData
      })
  }, [chartData?.commitsByDate, selectedChartAuthors, chartAllAuthors, hasInitializedChartAuthors])

  const chartAuthorData = useMemo(() => {
    const authorsToShow = hasInitializedChartAuthors ? selectedChartAuthors : chartAllAuthors
    return (chartData?.commitsByAuthor ?? []).filter(item => authorsToShow.includes(item.author)).map((item, index) => ({ ...item, fill: `var(--chart-${index + 1})` }))
  }, [chartData?.commitsByAuthor, selectedChartAuthors, chartAllAuthors, hasInitializedChartAuthors])

  const chartCommitByDateConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {}
    const authorsToShow = hasInitializedChartAuthors ? selectedChartAuthors : chartAllAuthors
    authorsToShow.forEach((author, index) => {
      config[author] = { label: author, color: `var(--chart-${(index % 10) + 1})` }
    })
    return config
  }, [selectedChartAuthors, chartAllAuthors, hasInitializedChartAuthors])

  const chartBarRadiusPosMap = useMemo(() => {
    const authorKeys = Object.keys(chartCommitByDateConfig)
    const posMap: Record<string, { single?: string; top?: string; bottom?: string }> = {}
    for (const row of chartProcessedStackedDateData) {
      const authorsWithValue = authorKeys.filter(key => (row[key] as number) > 0)
      if (authorsWithValue.length === 1) {
        posMap[row.date] = { single: authorsWithValue[0] }
      } else if (authorsWithValue.length > 1) {
        posMap[row.date] = {
          top: authorsWithValue[authorsWithValue.length - 1],
          bottom: authorsWithValue[0],
        }
      }
    }
    return posMap
  }, [chartProcessedStackedDateData, chartCommitByDateConfig])

  const getChartBarRadiusForAuthor = useCallback(
    (date: string | number, author: string | undefined): [number, number, number, number] => {
      if (!chartBarRadiusPosMap[String(date)]) return [0, 0, 0, 0]
      const pos = chartBarRadiusPosMap[String(date)]
      if (pos.single === author) return [4, 4, 4, 4]
      if (pos.top === author) return [4, 4, 0, 0]
      if (pos.bottom === author) return [0, 0, 0, 0]
      return [0, 0, 0, 0]
    },
    [chartBarRadiusPosMap]
  )

  const chartRoundedRect = (
    x: number,
    y: number,
    width: number,
    height: number,
    radiusTopLeft: number,
    radiusTopRight: number,
    radiusBottomRight: number,
    radiusBottomLeft: number
  ) =>
    `M${x + radiusTopLeft},${y} H${x + width - radiusTopRight} Q${x + width},${y} ${x + width},${y + radiusTopRight} V${y + height - radiusBottomRight} Q${x + width},${y + height} ${x + width - radiusBottomRight},${y + height} H${x + radiusBottomLeft} Q${x},${y + height} ${x},${y + height - radiusBottomLeft} V${y + radiusTopLeft} Q${x},${y} ${x + radiusTopLeft},${y} Z`

  const ChartCustomBarShape = useCallback(
    (props: { x: number; y: number; width: number; height: number; payload: { date: string }; dataKey: string; fill: string }) => {
      const { x, y, width, height, payload, dataKey, fill } = props
      const radius = getChartBarRadiusForAuthor(payload.date, dataKey)
      const d = chartRoundedRect(x, y, width, height, ...radius)
      return <path d={d} fill={fill} />
    },
    [getChartBarRadiusForAuthor]
  )

  const chartCommitByHourData = useMemo(() => {
    const byHour = chartData?.commitsByHour ?? []
    return Array.from({ length: 24 }, (_, i) => {
      const entry = byHour.find(h => h.hour === i)
      return { hour: `${i.toString().padStart(2, '0')}h`, count: entry?.count ?? 0 }
    })
  }, [chartData?.commitsByHour])

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortColumn(col)
      setSortDir(col === 'name' || col === 'vcs' || col === 'lastCommitAuthor' || col === 'branchOrRev' ? 'asc' : 'desc')
    }
  }

  const handleActivitySort = (col: ActivitySortColumn) => {
    if (activitySortColumn === col) setActivitySortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setActivitySortColumn(col)
      setActivitySortDir(col === 'author' || col === 'branch' ? 'asc' : 'desc')
    }
  }

  const SortIcon = ({ col }: { col: SortColumn }) =>
    sortColumn === col ? sortDir === 'asc' ? <ArrowUp className="ml-1 h-3 w-3 inline" /> : <ArrowDown className="ml-1 h-3 w-3 inline" /> : null

  const ActivitySortIcon = ({ col }: { col: ActivitySortColumn }) =>
    activitySortColumn === col ? activitySortDir === 'asc' ? <ArrowUp className="ml-1 h-3 w-3 inline" /> : <ArrowDown className="ml-1 h-3 w-3 inline" /> : null

  const handleOpenShowLog = async (row: RepoRow) => {
    if (row.vcsType === 'none' || row.error) return
    try {
      window.api.electron.send(IPC.WINDOW.SHOW_LOG, {
        path: '.',
        sourceFolder: row.path,
        versionControlSystem: row.vcsType,
      })
    } catch (err) {
      logger.error('Error opening Show Log:', err)
    }
  }

  const handleOpenInExplorer = (path: string) => {
    window.api.system.open_folder_in_explorer(path)
  }

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      toast.success(t('dashboard.copySuccess'))
    } catch {
      toast.error('Failed to copy')
    }
  }

  const getVCSIcon = (vcsType: string) => {
    if (vcsType === 'git') return <GitBranch className="h-4 w-4" />
    if (vcsType === 'svn') return <Turtle className="h-4 w-4" />
    return <AlertCircle className="h-4 w-4 opacity-50" />
  }

  return (
    <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'overview' | 'activity' | 'charts')} className="flex flex-col h-screen w-full">
      {showSettings && (
        <Suspense fallback={<GlowLoader className="h-8 w-8" />}>
          <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
        </Suspense>
      )}

      {/* Toolbar */}
      <div
        className="flex items-center justify-between h-8 text-sm select-none shrink-0"
        style={
          {
            WebkitAppRegion: 'drag',
            backgroundColor: 'var(--main-bg)',
            color: 'var(--main-fg)',
          } as React.CSSProperties
        }
      >
        <div className="flex items-center h-full gap-2">
          <div className="w-10 h-6 flex justify-center pt-1.5 pl-1 shrink-0">
            <img src="logo.png" alt="icon" draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
          </div>
          <TabsList className="h-6! p-0.5 rounded-md shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <TabsTrigger value="overview" disabled={isLoading || isLoadingActivity || isLoadingCharts} className="h-5 px-2 text-xs data-[state=active]:shadow-none">
              {t('dashboard.tabOverview')}
            </TabsTrigger>
            <TabsTrigger value="activity" disabled={isLoading || isLoadingActivity || isLoadingCharts} className="h-5 px-2 text-xs data-[state=active]:shadow-none">
              {t('dashboard.tabActivity')}
            </TabsTrigger>
            <TabsTrigger value="charts" disabled={isLoading || isLoadingActivity || isLoadingCharts} className="h-5 px-2 text-xs data-[state=active]:shadow-none">
              {t('dashboard.tabCharts')}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center h-full gap-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div className="flex items-center gap-1 pt-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      if (activeTab === 'overview') loadData(dateRange)
                      else if (activeTab === 'activity') loadActivityData(dateRange)
                      else if (activeTab === 'charts' && selectedChartRepo) loadChartData(dateRange, selectedChartRepo)
                    }}
                    disabled={activeTab === 'overview' ? isLoading : activeTab === 'activity' ? isLoadingActivity : isLoadingCharts}
                    className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-all duration-200 rounded-sm h-[25px] w-[25px]"
                  >
                    <RefreshCw strokeWidth={1.25} absoluteStrokeWidth size={15} className={cn('h-4 w-4', (isLoading || isLoadingActivity || isLoadingCharts) && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('dashboard.tooltipRefresh')}</TooltipContent>
              </Tooltip>

              <Separator orientation="vertical" className="h-4 w-px bg-muted mx-1" />

              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant={buttonVariant}
                    size="sm"
                    disabled={isLoading || isLoadingActivity || isLoadingCharts}
                    className={cn('h-6 px-2 text-xs justify-start text-left font-normal transition-all duration-200', !dateRange && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                    {dateRange?.from
                      ? dateRange.to
                        ? `${format(dateRange.from, dashboardDatePattern, { locale: dashboardDateFnsLocale })} - ${format(dateRange.to, dashboardDatePattern, { locale: dashboardDateFnsLocale })}`
                        : format(dateRange.from, dashboardDatePattern, { locale: dashboardDateFnsLocale })
                      : t('taskManagement.chartAllTime')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    locale={dashboardDateFnsLocale}
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={datePickerValue ?? dateRange}
                    onSelect={v => setDatePickerValue(v)}
                    numberOfMonths={2}
                  />
                  <div className="flex gap-2 p-2 border-t">
                    <Button
                      variant={buttonVariant}
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setDatePickerValue(undefined)
                        setDateRange(undefined)
                        setDatePickerOpen(false)
                      }}
                    >
                      {t('taskManagement.chartAllTime')}
                    </Button>
                    <Button
                      variant={buttonVariant}
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        const value = datePickerValue ?? dateRange
                        if (value?.from) {
                          setDateRange(value)
                          setDatePickerOpen(false)
                        }
                      }}
                    >
                      {t('common.confirm')}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              {activeTab === 'charts' &&
                chartRepoOptions.length > 0 &&
                (() => {
                  const currentRepo = chartRepoOptions.find(r => r.path === selectedChartRepo)
                  return (
                    <>
                      <Separator orientation="vertical" className="h-4 w-px bg-muted mx-0.5" />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="flex items-center gap-1 px-2 py-1 h-6 text-xs">
                            {currentRepo ? getChartRepoVCSIcon(currentRepo.vcsType) : <Folder className="h-3 w-3 opacity-50" />}
                            <span className="font-medium">{currentRepo?.name ?? t('dashboard.charts.selectRepo')}</span>
                            {currentRepo && getChartRepoVCSText(currentRepo.vcsType) && (
                              <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">{getChartRepoVCSText(currentRepo.vcsType)}</span>
                            )}
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {chartRepoOptions.map(r => (
                            <DropdownMenuItem key={r.path} onClick={() => setSelectedChartRepo(r.path)} className={selectedChartRepo === r.path ? 'bg-muted' : ''}>
                              {getChartRepoVCSIcon(r.vcsType)}
                              <span className="ml-2">{r.name}</span>
                              {getChartRepoVCSText(r.vcsType) && (
                                <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1 rounded">{getChartRepoVCSText(r.vcsType)}</span>
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )
                })()}
            </div>
          </div>
        </div>

        <Button variant="ghost" className="font-medium text-xs shrink-0">
          {t('dashboard.title')}
        </Button>

        <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col p-4 gap-3">
        <TabsContent value="overview" className="flex-1 flex flex-col min-h-0 mt-0">
          {isLoading ? (
            <div className="flex items-center justify-center flex-1">
              <GlowLoader className="w-10 h-10" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center flex-1 text-destructive">{error}</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 text-muted-foreground">
              <p>{t('dashboard.noRepos')}</p>
              <Button variant={buttonVariant} size="sm" onClick={() => setShowSettings(true)}>
                <Settings className="mr-2 h-4 w-4" />
                {t('dashboard.openSettings')}
              </Button>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="flex gap-4 shrink-0">
                <div className="flex-1 rounded-lg bg-muted/40 p-3 shadow-sm">
                  <div className="text-xs text-muted-foreground">{t('dashboard.summaryRepos')}</div>
                  <div className="text-xl font-semibold">{summary.totalRepos}</div>
                </div>
                <div className="flex-1 rounded-lg bg-muted/40 p-3 shadow-sm">
                  <div className="text-xs text-muted-foreground">{t('dashboard.summaryReviewedTotal')}</div>
                  <div className="text-xl font-semibold">
                    <span className="text-green-600">{summary.totalReviewed}</span>
                    <span className="text-muted-foreground">/</span>
                    <span>{summary.totalCommits}</span>
                  </div>
                </div>
                <div className="flex-1 rounded-lg bg-muted/40 p-3 shadow-sm">
                  <div className="text-xs text-muted-foreground">{t('dashboard.summaryProgress')}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={summary.progress} className="h-2 flex-1" indicatorStyle={{ backgroundColor: getProgressColor(summary.progress / 100) }} />
                    <span className="text-sm font-medium">{summary.progress}%</span>
                  </div>
                </div>
              </div>

              {/* Search & filter */}
              <div className="flex gap-2 shrink-0 py-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder={t('dashboard.searchPlaceholder')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-8" />
                </div>
                <div className="flex gap-1">
                  {(['all', 'git', 'svn'] as const).map(f => (
                    <Button key={f} variant={vcsFilter === f ? 'secondary' : 'ghost'} size="sm" className="h-8" onClick={() => setVcsFilter(f)}>
                      {t(`dashboard.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 min-h-0 border rounded-md overflow-hidden shadow-sm flex flex-col">
                <div className="flex-1 min-h-0 overflow-auto overflow-x-auto">
                  <Table className="w-max min-w-full">
                    <TableHeader sticky>
                      <TableRow>
                        <TableHead className="!text-[var(--table-header-fg)] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('name')}>
                          {t('dashboard.repo')}
                          <SortIcon col="name" />
                        </TableHead>
                        <TableHead className="!text-[var(--table-header-fg)] text-center w-16 cursor-pointer hover:bg-muted/50" onClick={() => handleSort('vcs')}>
                          {t('dashboard.vcs')}
                          <SortIcon col="vcs" />
                        </TableHead>
                        <TableHead className="!text-[var(--table-header-fg)] text-center w-20 cursor-pointer hover:bg-muted/50" onClick={() => handleSort('total')}>
                          {t('dashboard.total')}
                          <SortIcon col="total" />
                        </TableHead>
                        <TableHead className="!text-[var(--table-header-fg)] text-center w-24 cursor-pointer hover:bg-muted/50" onClick={() => handleSort('reviewed')}>
                          {t('dashboard.reviewed')}
                          <SortIcon col="reviewed" />
                        </TableHead>
                        <TableHead className="!text-[var(--table-header-fg)] text-center w-24 cursor-pointer hover:bg-muted/50" onClick={() => handleSort('unreviewed')}>
                          {t('dashboard.unreviewed')}
                          <SortIcon col="unreviewed" />
                        </TableHead>
                        <TableHead className="!text-[var(--table-header-fg)] text-center w-20 cursor-pointer hover:bg-muted/50" onClick={() => handleSort('recent')}>
                          {t('dashboard.last7Days')}
                          <SortIcon col="recent" />
                        </TableHead>
                        <TableHead className="!text-[var(--table-header-fg)] text-center w-16 cursor-pointer hover:bg-muted/50" onClick={() => handleSort('lastCommit')}>
                          {t('dashboard.lastCommit')}
                          <SortIcon col="lastCommit" />
                        </TableHead>
                        <TableHead
                          className="!text-[var(--table-header-fg)] text-center min-w-[100px] cursor-pointer hover:bg-muted/50"
                          onClick={() => handleSort('lastCommitAuthor')}
                        >
                          {t('dashboard.lastCommitAuthor')}
                          <SortIcon col="lastCommitAuthor" />
                        </TableHead>
                        <TableHead className="!text-[var(--table-header-fg)] text-center w-24 cursor-pointer hover:bg-muted/50" onClick={() => handleSort('branchOrRev')}>
                          {t('dashboard.branchOrRev')}
                          <SortIcon col="branchOrRev" />
                        </TableHead>
                        <TableHead className="!text-[var(--table-header-fg)] text-center w-20">{t('dashboard.action')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAndSortedRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                            {t('common.noData')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredAndSortedRows.map(row => (
                          <ContextMenu key={row.path}>
                            <ContextMenuTrigger asChild>
                              <TableRow
                                data-slot="table-row"
                                className={cn(
                                  'border-b transition-colors duration-150 data-[state=selected]:bg-muted',
                                  row.vcsType !== 'none' && !row.error && 'cursor-pointer hover:bg-muted/50'
                                )}
                                onClick={() => row.vcsType !== 'none' && !row.error && handleOpenShowLog(row)}
                              >
                                <TableCell className="font-medium">
                                  {row.error ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="flex items-center gap-1">
                                          {row.name}
                                          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="right" className="max-w-xs">
                                        {getErrorMessage(row.error, t)}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    row.name
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex justify-center items-center">{getVCSIcon(row.vcsType)}</div>
                                </TableCell>
                                <TableCell className="text-center">{row.error ? '—' : row.totalCommits}</TableCell>
                                <TableCell className="text-center">
                                  {row.error ? (
                                    '—'
                                  ) : (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="text-green-600">{row.reviewedCount}</span>
                                      {row.totalCommits > 0 && (
                                        <Progress
                                          value={(row.reviewedCount / row.totalCommits) * 100}
                                          className="h-1.5 w-12"
                                          indicatorStyle={{
                                            backgroundColor: getProgressColor(row.reviewedCount / row.totalCommits),
                                          }}
                                        />
                                      )}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-center text-amber-600">{row.error ? '—' : row.unreviewedCount}</TableCell>
                                <TableCell className="text-center">{row.error ? '—' : row.recentCommitsCount}</TableCell>
                                <TableCell className="text-center text-muted-foreground text-xs">
                                  {row.lastCommitDate
                                    ? formatDateDisplay(
                                        parseLocalDate(String(row.lastCommitDate).slice(0, 10)) ?? new Date(row.lastCommitDate),
                                        i18n.language
                                      )
                                    : '—'}
                                </TableCell>
                                <TableCell
                                  className="text-center text-muted-foreground text-xs max-w-[120px] truncate"
                                  title={
                                    row.error || !row.lastCommitMessage
                                      ? undefined
                                      : t('dashboard.cellTitleCommitMessage', { message: row.lastCommitMessage })
                                  }
                                >
                                  {row.error ? '—' : (row.lastCommitAuthor ?? '—')}
                                </TableCell>
                                <TableCell className="text-center text-muted-foreground text-xs">{row.error ? '—' : (row.currentBranch ?? row.currentRevision ?? '—')}</TableCell>
                                <TableCell className="text-center">
                                  {row.vcsType !== 'none' && !row.error ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 px-2"
                                          onClick={e => {
                                            e.stopPropagation()
                                            handleOpenShowLog(row)
                                          }}
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>{t('dashboard.tooltipOpenShowLogRow')}</TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    '—'
                                  )}
                                </TableCell>
                              </TableRow>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem onClick={() => handleOpenInExplorer(row.path)}>
                                <FolderOpen className="h-4 w-4" />
                                {t('dashboard.openInExplorer')}
                                <ContextMenuShortcut>⌘O</ContextMenuShortcut>
                              </ContextMenuItem>
                              <ContextMenuItem onClick={() => handleCopyPath(row.path)}>
                                <Copy className="h-4 w-4" />
                                {t('dashboard.copyPath')}
                                <ContextMenuShortcut>⌘C</ContextMenuShortcut>
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              {row.vcsType !== 'none' && !row.error && (
                                <ContextMenuItem onClick={() => handleOpenShowLog(row)}>
                                  <ExternalLink className="h-4 w-4" />
                                  {t('dashboard.openShowLogMenu')}
                                </ContextMenuItem>
                              )}
                            </ContextMenuContent>
                          </ContextMenu>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="activity" className="flex-1 flex flex-col min-h-0 mt-0 overflow-hidden">
          {isLoadingActivity ? (
            <div className="flex items-center justify-center flex-1">
              <GlowLoader className="w-10 h-10" />
            </div>
          ) : activityRows.length === 0 ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">{t('common.noData')}</div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <div className="pb-4 pr-2">
                <Accordion type="single" collapsible className="w-full border rounded-md overflow-hidden shadow-sm">
                  {activityRows.map(repo => (
                    <AccordionItem key={repo.path} value={repo.path} className="border-b last:border-b-0">
                      <AccordionTrigger className="px-4 py-2 hover:no-underline hover:bg-muted/50 [&[data-state=open]]:bg-muted/50">
                        <div className="flex items-center justify-between w-full pr-2">
                          <div className="flex items-center gap-2 font-medium">
                            {getVCSIcon(repo.vcsType)}
                            {repo.error ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1">
                                    {repo.name}
                                    <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{getErrorMessage(repo.error, t)}</TooltipContent>
                              </Tooltip>
                            ) : (
                              <>
                                {repo.name}
                                {repo.vcsType === 'git' && repo.branch && <span className="text-xs font-normal text-muted-foreground">({repo.branch})</span>}
                                {repo.vcsType === 'svn' && repo.currentRevision && <span className="text-xs font-normal text-muted-foreground">({repo.currentRevision})</span>}
                              </>
                            )}
                          </div>
                          {!repo.error && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 shrink-0"
                                  onClick={e => {
                                    e.stopPropagation()
                                    window.api.electron.send(IPC.WINDOW.SHOW_LOG, {
                                      path: '.',
                                      sourceFolder: repo.path,
                                      versionControlSystem: repo.vcsType,
                                    })
                                  }}
                                >
                                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                  {t('dashboard.activityOpenShowLog')}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('dashboard.activityOpenShowLog')}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-0 pb-0">
                        <div className="max-h-[min(50vh,24rem)] overflow-auto overflow-x-auto">
                          <Table className="w-max min-w-full">
                            <TableHeader sticky>
                              <TableRow>
                              <TableHead className="!text-[var(--table-header-fg)] w-auto cursor-pointer hover:bg-muted/50" onClick={() => handleActivitySort('author')}>
                                {t('dashboard.activityAuthor')}
                                <ActivitySortIcon col="author" />
                              </TableHead>
                              <TableHead
                                className="!text-[var(--table-header-fg)] text-center w-20 shrink-0 cursor-pointer hover:bg-muted/50"
                                onClick={() => handleActivitySort('commits')}
                              >
                                {t('dashboard.activityCommits')}
                                <ActivitySortIcon col="commits" />
                              </TableHead>
                              <TableHead
                                className="!text-[var(--table-header-fg)] text-center w-20 shrink-0 cursor-pointer hover:bg-muted/50"
                                onClick={() => handleActivitySort('files')}
                              >
                                {t('dashboard.activityFiles')}
                                <ActivitySortIcon col="files" />
                              </TableHead>
                              <TableHead
                                className="!text-[var(--table-header-fg)] w-36 shrink-0 cursor-pointer hover:bg-muted/50"
                                onClick={() => handleActivitySort('firstCommit')}
                              >
                                {t('dashboard.activityFirstCommit')}
                                <ActivitySortIcon col="firstCommit" />
                              </TableHead>
                              <TableHead className="!text-[var(--table-header-fg)] w-36 shrink-0 cursor-pointer hover:bg-muted/50" onClick={() => handleActivitySort('lastCommit')}>
                                {t('dashboard.activityLastCommit')}
                                <ActivitySortIcon col="lastCommit" />
                              </TableHead>
                              <TableHead
                                className="!text-[var(--table-header-fg)] text-center w-28 shrink-0 cursor-pointer hover:bg-muted/50"
                                onClick={() => handleActivitySort('fileTypes')}
                              >
                                {t('dashboard.activityFileTypes')}
                                <ActivitySortIcon col="fileTypes" />
                              </TableHead>
                              <TableHead className="!text-[var(--table-header-fg)] w-24 shrink-0 cursor-pointer hover:bg-muted/50" onClick={() => handleActivitySort('branch')}>
                                {repo.vcsType === 'svn' ? t('dashboard.activityRevision') : t('dashboard.activityBranch')}
                                <ActivitySortIcon col="branch" />
                              </TableHead>
                              <TableHead className="!text-[var(--table-header-fg)] text-center w-16 shrink-0">{t('dashboard.action')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {repo.authors.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={8} className="text-muted-foreground whitespace-normal! text-center py-8">
                                  {repo.error ? getErrorMessage(repo.error, t) : t('common.noData')}
                                </TableCell>
                              </TableRow>
                            ) : (
                              getSortedAuthors(repo.authors, repo).map((author, idx) => (
                                <TableRow key={`${repo.path}-${author.author}-${idx}`} className="border-b">
                                  <TableCell
                                    className="text-muted-foreground min-w-0 truncate"
                                    title={t('dashboard.cellTitleActivityAuthor', { author: author.author })}
                                  >
                                    {author.author}
                                  </TableCell>
                                  <TableCell className="text-center w-20 shrink-0">{author.commitCount}</TableCell>
                                  <TableCell className="text-center w-20 shrink-0">{author.fileCount}</TableCell>
                                  <TableCell className="text-muted-foreground text-xs w-36 shrink-0 whitespace-nowrap">
                                    {`${format(new Date(author.firstCommitTime), 'HH:mm')} ${format(new Date(author.firstCommitTime), dashboardDatePattern, { locale: dashboardDateFnsLocale })}`}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground text-xs w-36 shrink-0 whitespace-nowrap">
                                    {`${format(new Date(author.lastCommitTime), 'HH:mm')} ${format(new Date(author.lastCommitTime), dashboardDatePattern, { locale: dashboardDateFnsLocale })}`}
                                  </TableCell>
                                  <TableCell className="text-center text-xs w-42 shrink-0">
                                    <div className="flex gap-1.5 flex-wrap justify-center items-center">
                                      {author.fileTypes.added > 0 && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="inline-flex items-center gap-0.5">
                                              <StatusIcon code="A" className="h-3.5 w-3.5" vcsType={repo.vcsType} />
                                              <span className="text-muted-foreground">({author.fileTypes.added})</span>
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {t(repo.vcsType === 'git' ? 'git.status.added' : 'svn.status.added')} × {author.fileTypes.added}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                      {author.fileTypes.modified > 0 && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="inline-flex items-center gap-0.5">
                                              <StatusIcon code="M" className="h-3.5 w-3.5" vcsType={repo.vcsType} />
                                              <span className="text-muted-foreground">({author.fileTypes.modified})</span>
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {t('svn.status.modified')} × {author.fileTypes.modified}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                      {author.fileTypes.deleted > 0 && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="inline-flex items-center gap-0.5">
                                              <StatusIcon code="D" className="h-3.5 w-3.5" vcsType={repo.vcsType} />
                                              <span className="text-muted-foreground">({author.fileTypes.deleted})</span>
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {t('svn.status.deleted')} × {author.fileTypes.deleted}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                      {author.fileTypes.added === 0 && author.fileTypes.modified === 0 && author.fileTypes.deleted === 0 && '—'}
                                    </div>
                                  </TableCell>
                                  <TableCell
                                    className="text-muted-foreground text-xs w-24 shrink-0 truncate"
                                    title={
                                      author.branch || repo.branch || repo.currentRevision
                                        ? t('dashboard.cellTitleBranchRev', {
                                          value: author.branch || repo.branch || repo.currentRevision || '',
                                        })
                                        : undefined
                                    }
                                  >
                                    {author.branch || repo.branch || repo.currentRevision || '—'}
                                  </TableCell>
                                  <TableCell className="text-center w-16 shrink-0">
                                    {!repo.error ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2"
                                            onClick={e => {
                                              e.stopPropagation()
                                              window.api.electron.send(IPC.WINDOW.SHOW_LOG, {
                                                path: '.',
                                                sourceFolder: repo.path,
                                                versionControlSystem: repo.vcsType,
                                              })
                                            }}
                                          >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{t('dashboard.activityOpenShowLog')}</TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      '—'
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                          </Table>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="charts" className="flex-1 flex flex-col min-h-0 mt-0 overflow-hidden">
          {!selectedChartRepo ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">{t('dashboard.noRepos')}</div>
          ) : isLoadingCharts ? (
            <div className="flex items-center justify-center flex-1">
              <GlowLoader className="w-10 h-10" />
            </div>
          ) : !chartData || (chartData.commitsByDate?.length === 0 && chartData.commitsByAuthor?.length === 0 && (chartData.commitsByHour?.length ?? 0) === 0) ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">{t('common.noData')}</div>
          ) : (
            <Tabs value={chartsSubTab} onValueChange={v => setChartsSubTab(v as 'by-date' | 'by-author' | 'by-hour')} className="flex-1 flex flex-col min-h-0">
              <div className="flex justify-center shrink-0 mb-2">
                <TabsList className="w-fit">
                  <TabsTrigger value="by-date">{t('dashboard.charts.byDate')}</TabsTrigger>
                  <TabsTrigger value="by-author">{t('dashboard.charts.byAuthor')}</TabsTrigger>
                  <TabsTrigger value="by-hour">{t('dashboard.charts.byHour')}</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="by-date" className="flex-1 min-h-0 mt-0">
                <div className="flex flex-col h-full gap-2">
                  <div className="flex items-center gap-2 shrink-0">
                    <Popover open={chartFilterPopoverOpen} onOpenChange={setChartFilterPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant={hasInitializedChartAuthors && selectedChartAuthors.length !== chartAllAuthors.length ? 'default' : 'outline'}>
                          <Filter className="h-4 w-4 mr-1" />
                          {t('dashboard.charts.filterAuthors')}
                          {hasInitializedChartAuthors && selectedChartAuthors.length !== chartAllAuthors.length && (
                            <Badge variant="secondary" className="ml-1 text-xs">
                              {selectedChartAuthors.length}/{chartAllAuthors.length}
                            </Badge>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[250px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder={t('dashboard.charts.searchAuthor')} />
                          <CommandList>
                            <CommandEmpty>{t('common.noData')}</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => {
                                  setSelectedChartAuthors(selectedChartAuthors.length === chartAllAuthors.length ? [] : [...chartAllAuthors])
                                }}
                                className="cursor-pointer"
                              >
                                <Checkbox checked={selectedChartAuthors.length === chartAllAuthors.length} className="mr-2" />
                                <span className="font-medium">{t('dashboard.charts.selectAll')}</span>
                              </CommandItem>
                              {chartAllAuthors.map(author => (
                                <CommandItem
                                  key={author}
                                  onSelect={() => {
                                    setSelectedChartAuthors(prev => (prev.includes(author) ? prev.filter(a => a !== author) : [...prev, author]))
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Checkbox checked={selectedChartAuthors.includes(author)} className="mr-2" />
                                  <span>{author}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant={commitByDateChartType === 'bar-stacked' ? 'default' : 'outline'}
                        onClick={() => setCommitByDateChartType('bar-stacked')}
                        title={t('dashboard.charts.barStacked')}
                      >
                        <BarChart3 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant={commitByDateChartType === 'line-multiple' ? 'default' : 'outline'}
                        onClick={() => setCommitByDateChartType('line-multiple')}
                        title={t('dashboard.charts.lineMultiple')}
                      >
                        <LineChartIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant={commitByDateChartType === 'area-multiple' ? 'default' : 'outline'}
                        onClick={() => setCommitByDateChartType('area-multiple')}
                        title={t('dashboard.charts.areaMultiple')}
                      >
                        <AreaChartIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-[300px] min-w-0 rounded-xl bg-muted/40 p-3 shadow-sm">
                    <ChartContainer config={chartCommitByDateConfig} className="w-full h-full min-h-[260px]">
                      {commitByDateChartType === 'bar-stacked' ? (
                        <BarChart accessibilityLayer data={chartProcessedStackedDateData} margin={{ top: 25, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} />
                          <YAxis />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <ChartLegend content={<ChartLegendContent payload={undefined} />} />
                          {Object.keys(chartCommitByDateConfig).map(author => (
                            <Bar
                              key={author}
                              dataKey={author}
                              stackId="a"
                              fill={chartCommitByDateConfig[author]?.color}
                              shape={(props: unknown) => (
                                <ChartCustomBarShape
                                  {...(props as { x: number; y: number; width: number; height: number; payload: { date: string }; fill: string })}
                                  dataKey={author}
                                />
                              )}
                            />
                          ))}
                        </BarChart>
                      ) : commitByDateChartType === 'line-multiple' ? (
                        <LineChart accessibilityLayer data={chartProcessedStackedDateData} margin={{ top: 25, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} />
                          <YAxis />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <ChartLegend content={<ChartLegendContent payload={undefined} />} />
                          {Object.keys(chartCommitByDateConfig).map(author => (
                            <Line key={author} type="monotone" dataKey={author} stroke={chartCommitByDateConfig[author]?.color} activeDot={{ r: 8 }} />
                          ))}
                        </LineChart>
                      ) : (
                        <AreaChart accessibilityLayer data={chartProcessedStackedDateData} margin={{ top: 25, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} />
                          <YAxis />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <ChartLegend content={<ChartLegendContent payload={undefined} />} />
                          {Object.keys(chartCommitByDateConfig).map(author => (
                            <Area
                              key={author}
                              type="monotone"
                              dataKey={author}
                              stackId="1"
                              stroke={chartCommitByDateConfig[author]?.color}
                              fill={chartCommitByDateConfig[author]?.color}
                              fillOpacity={0.4}
                            />
                          ))}
                        </AreaChart>
                      )}
                    </ChartContainer>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="by-author" className="flex-1 min-h-0 mt-0">
                <div className="flex flex-col h-full gap-2">
                  <div className="flex items-center gap-2 shrink-0">
                    <Popover open={chartFilterPopoverOpen} onOpenChange={setChartFilterPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant={hasInitializedChartAuthors && selectedChartAuthors.length !== chartAllAuthors.length ? 'default' : 'outline'}>
                          <Filter className="h-4 w-4 mr-1" />
                          {t('dashboard.charts.filterAuthors')}
                          {hasInitializedChartAuthors && selectedChartAuthors.length !== chartAllAuthors.length && (
                            <Badge variant="secondary" className="ml-1 text-xs">
                              {selectedChartAuthors.length}/{chartAllAuthors.length}
                            </Badge>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[250px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder={t('dashboard.charts.searchAuthor')} />
                          <CommandList>
                            <CommandEmpty>{t('common.noData')}</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => {
                                  setSelectedChartAuthors(selectedChartAuthors.length === chartAllAuthors.length ? [] : [...chartAllAuthors])
                                }}
                                className="cursor-pointer"
                              >
                                <Checkbox checked={selectedChartAuthors.length === chartAllAuthors.length} className="mr-2" />
                                <span className="font-medium">{t('dashboard.charts.selectAll')}</span>
                              </CommandItem>
                              {chartAllAuthors.map(author => (
                                <CommandItem
                                  key={author}
                                  onSelect={() => {
                                    setSelectedChartAuthors(prev => (prev.includes(author) ? prev.filter(a => a !== author) : [...prev, author]))
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Checkbox checked={selectedChartAuthors.includes(author)} className="mr-2" />
                                  <span>{author}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <div className="flex gap-1">
                      <Button size="sm" variant={commitByAuthorChartType === 'bar-vertical' ? 'default' : 'outline'} onClick={() => setCommitByAuthorChartType('bar-vertical')}>
                        <BarChart2 className="h-4 w-4 mr-1" />
                        {t('dashboard.charts.barVertical')}
                      </Button>
                      <Button size="sm" variant={commitByAuthorChartType === 'pie' ? 'default' : 'outline'} onClick={() => setCommitByAuthorChartType('pie')}>
                        {t('dashboard.charts.pie')}
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-[300px] min-w-0 rounded-xl bg-muted/40 p-3 shadow-sm">
                    <ChartContainer config={chartCommitByDateConfig} className={cn('w-full h-full min-h-[260px]', commitByAuthorChartType === 'pie' && 'aspect-square max-w-full')}>
                      {commitByAuthorChartType === 'bar-vertical' ? (
                        <BarChart accessibilityLayer data={chartAuthorData} margin={{ top: 25, right: 30, left: 20, bottom: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="author" tickLine={false} tickMargin={10} axisLine={false} angle={-45} textAnchor="end" height={60} />
                          <YAxis />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} name={t('dashboard.charts.commitsAxis')} />
                        </BarChart>
                      ) : (
                        <PieChart accessibilityLayer>
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <ChartLegend content={<ChartLegendContent payload={undefined} />} />
                          <Pie data={chartAuthorData} dataKey="count" nameKey="author" cx="50%" cy="50%" outerRadius="80%" label />
                        </PieChart>
                      )}
                    </ChartContainer>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="by-hour" className="flex-1 min-h-0 mt-0">
                <div className="flex flex-col h-full gap-2">
                  <div className="flex-1 min-h-[300px] min-w-0 rounded-xl bg-muted/40 p-3 shadow-sm">
                    <ChartContainer
                      config={{ hour: { label: t('dashboard.charts.hourAxis') }, count: { label: t('dashboard.charts.commitsAxis') } }}
                      className="w-full h-full min-h-[260px]"
                    >
                      <BarChart accessibilityLayer data={chartCommitByHourData} margin={{ top: 25, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" tickLine={false} tickMargin={10} axisLine={false} />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} name={t('dashboard.charts.commitsAxis')} />
                      </BarChart>
                    </ChartContainer>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>
      </div>
    </Tabs>
  )
}
