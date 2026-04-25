import { create } from 'zustand'

export type TrendPeriod = '7d' | '1m' | '3m' | '6m' | '1y'
export type TrendGranularity = 'day' | 'week' | 'month'
export type TrendMetric = 'commits' | 'tasks' | 'reviews' | 'lines_added' | 'reports'

export interface UserInfo {
  id: string
  name: string
  email: string | null
  user_code: string
}

export interface HeatmapDay {
  snapshot_date: string
  commits_count: number
  tasks_done: number
  has_daily_report: number
  lines_inserted: number
  lines_deleted: number
  reviews_done: number
}

export interface TrendPoint {
  period: string
  commits: number
  lines_added: number
  lines_deleted: number
  tasks: number
  reviews: number
  reports: number
}

export interface RadarMonthData {
  year_month: string
  commits_count: number
  coding_days: number
  lines_inserted: number
  tasks_done: number
  tasks_done_on_time: number
  tasks_overdue_opened: number
  reviews_done: number
  has_daily_report_days: number
  commits_with_rule_check: number
  commits_with_spotbugs: number
  commits_total_in_queue: number
  working_days: number
}

export interface RadarData {
  current: RadarMonthData
  previous: RadarMonthData
}

export interface TaskPerformanceRow {
  type: string
  total_done: number
  on_time: number
  avg_delay_days: number | null
  avg_cycle_days: number | null
}

export interface OnTimeTrendPoint {
  month: string
  total: number
  on_time: number
  rate: number
}

export interface TaskPerformanceData {
  byType: TaskPerformanceRow[]
  onTimeTrend: OnTimeTrendPoint[]
  totals: {
    total_done: number
    on_time: number
    avg_delay_days: number | null
    avg_cycle_days: number | null
  }
}

export interface QualityWeekPoint {
  week: string
  rule_checked: number
  spotbugs_checked: number
  total: number
}

export interface QualityData {
  trend: QualityWeekPoint[]
  userRuleRate: number
  userSpotbugsRate: number
  teamAvg: { rule_check_rate: number; spotbugs_rate: number }
}

export interface ProductiveHourCell {
  dow: number
  hour: number
  cnt: number
}

export interface MonthlyHighlightsData {
  yearMonth: string
  commits_count: number
  lines_inserted: number
  lines_deleted: number
  tasks_done: number
  reviews_done: number
  report_days: number
  working_days: number
  longest_streak: number
  prev_commits: number
  prev_tasks: number
  prev_reviews: number
  prev_report_days: number
  personal_best_commits_day: number
  personal_best_commits_day_date: string | null
  personal_best_streak: number
  personal_best_tasks_month: number
  personal_best_lines_day: number
  personal_best_lines_day_date: string | null
  six_months_trend: Array<{ month: string; commits: number; tasks: number }>
}

type SectionState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  cacheKey: string | null
}

function initSection<T>(): SectionState<T> {
  return { data: null, loading: false, error: null, cacheKey: null }
}

type ProgressStore = {
  // Global params
  selectedUserId: string | null
  selectedUserEmail: string | null
  selectedUserName: string | null
  allUsers: UserInfo[]
  allUsersLoaded: boolean
  /** Key `` `${userId}|${role}` `` của session đã fetch allUsers thành công */
  allUsersViewerKey: string | null

  // Per-section state
  heatmap: SectionState<HeatmapDay[]>
  trend: SectionState<TrendPoint[]>
  radar: SectionState<RadarData>
  taskPerf: SectionState<TaskPerformanceData>
  quality: SectionState<QualityData>
  productiveHours: SectionState<ProductiveHourCell[]>
  highlights: SectionState<MonthlyHighlightsData>

  // Trend UI params
  trendPeriod: TrendPeriod
  trendGranularity: TrendGranularity
  trendMetrics: TrendMetric[]
  comparePrevious: boolean

  // Quality UI params
  qualityWeeksBack: number

  // Productive hours UI params
  productiveWeeksBack: number

  // Highlights UI params
  highlightsYearMonth: string

  // Radar UI params
  radarYearMonth: string

  // Heatmap UI params
  heatmapYear: number

  // Actions
  setSelectedUser: (userId: string, userEmail: string | null, userName: string) => void
  loadAllUsers: (viewerKey: string) => Promise<void>
  fetchHeatmap: (userId: string, year: number, force?: boolean) => Promise<void>
  fetchTrend: (userId: string, from: string, to: string, granularity: TrendGranularity, force?: boolean) => Promise<void>
  fetchRadar: (userId: string, yearMonth: string, force?: boolean) => Promise<void>
  fetchTaskPerf: (userId: string, from: string, to: string, force?: boolean, projectId?: string | null) => Promise<void>
  fetchQuality: (
    userId: string,
    weeksBack: number,
    force?: boolean,
    teamUserIds?: string[] | null,
    from?: string | null,
    to?: string | null,
  ) => Promise<void>
  fetchProductiveHours: (userId: string, weeksBack: number, force?: boolean, from?: string | null, to?: string | null) => Promise<void>
  fetchHighlights: (userId: string, yearMonth: string, force?: boolean) => Promise<void>

  setTrendPeriod: (p: TrendPeriod) => void
  setTrendGranularity: (g: TrendGranularity) => void
  toggleTrendMetric: (m: TrendMetric) => void
  setComparePrevious: (v: boolean) => void
  setQualityWeeksBack: (w: number) => void
  setProductiveWeeksBack: (w: number) => void
  setHighlightsYearMonth: (ym: string) => void
  setRadarYearMonth: (ym: string) => void
  setHeatmapYear: (y: number) => void
}

function nowYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const useProgressStore = create<ProgressStore>((set, get) => ({
  selectedUserId: null,
  selectedUserEmail: null,
  selectedUserName: null,
  allUsers: [],
  allUsersLoaded: false,
  allUsersViewerKey: null,

  heatmap: initSection(),
  trend: initSection(),
  radar: initSection(),
  taskPerf: initSection(),
  quality: initSection(),
  productiveHours: initSection(),
  highlights: initSection(),

  trendPeriod: '6m',
  trendGranularity: 'week',
  trendMetrics: ['commits', 'tasks'],
  comparePrevious: false,
  qualityWeeksBack: 12,
  productiveWeeksBack: 8,
  highlightsYearMonth: nowYearMonth(),
  radarYearMonth: nowYearMonth(),
  heatmapYear: new Date().getFullYear(),

  setSelectedUser: (userId, userEmail, userName) => {
    set({
      selectedUserId: userId,
      selectedUserEmail: userEmail,
      selectedUserName: userName,
      heatmap: initSection(),
      trend: initSection(),
      radar: initSection(),
      taskPerf: initSection(),
      quality: initSection(),
      productiveHours: initSection(),
      highlights: initSection(),
    })
  },

  loadAllUsers: async (viewerKey: string) => {
    if (!viewerKey) {
      set({
        allUsers: [],
        allUsersLoaded: false,
        allUsersViewerKey: null,
        selectedUserId: null,
        selectedUserEmail: null,
        selectedUserName: null,
        heatmap: initSection(),
        trend: initSection(),
        radar: initSection(),
        taskPerf: initSection(),
        quality: initSection(),
        productiveHours: initSection(),
        highlights: initSection(),
      })
      return
    }
    if (get().allUsersLoaded && get().allUsersViewerKey === viewerKey) return
    try {
      const res = await window.api.progress.getAllUsers()
      if (res?.status === 'success') {
        set({ allUsers: res.data ?? [], allUsersLoaded: true, allUsersViewerKey: viewerKey })
      } else {
        set({ allUsers: [], allUsersLoaded: true, allUsersViewerKey: viewerKey })
      }
    } catch {
      set({ allUsers: [], allUsersLoaded: true, allUsersViewerKey: viewerKey })
    }
  },

  fetchHeatmap: async (userId, year, force = false) => {
    const key = `${userId}|${year}`
    const s = get().heatmap
    if (!force && s.cacheKey === key && s.data) return
    set((st) => ({ heatmap: { ...st.heatmap, loading: true, error: null } }))
    try {
      const res = await window.api.progress.getHeatmap(userId, year)
      if (res?.status === 'success') {
        set({ heatmap: { data: res.data ?? null, loading: false, error: null, cacheKey: key } })
      } else {
        set((st) => ({ heatmap: { ...st.heatmap, loading: false, error: res?.message ?? 'Error' } }))
      }
    } catch (e: any) {
      set((st) => ({ heatmap: { ...st.heatmap, loading: false, error: e?.message ?? 'Error' } }))
    }
  },

  fetchTrend: async (userId, from, to, granularity, force = false) => {
    const key = `${userId}|${from}|${to}|${granularity}`
    const s = get().trend
    if (!force && s.cacheKey === key && s.data) return
    set((st) => ({ trend: { ...st.trend, loading: true, error: null } }))
    try {
      const res = await window.api.progress.getTrend(userId, from, to, granularity)
      if (res?.status === 'success') {
        set({ trend: { data: res.data ?? null, loading: false, error: null, cacheKey: key } })
      } else {
        set((st) => ({ trend: { ...st.trend, loading: false, error: res?.message ?? 'Error' } }))
      }
    } catch (e: any) {
      set((st) => ({ trend: { ...st.trend, loading: false, error: e?.message ?? 'Error' } }))
    }
  },

  fetchRadar: async (userId, yearMonth, force = false) => {
    const key = `${userId}|${yearMonth}`
    const s = get().radar
    if (!force && s.cacheKey === key && s.data) return
    set((st) => ({ radar: { ...st.radar, loading: true, error: null } }))
    try {
      const res = await window.api.progress.getRadar(userId, yearMonth)
      if (res?.status === 'success') {
        set({ radar: { data: res.data, loading: false, error: null, cacheKey: key } })
      } else {
        set((st) => ({ radar: { ...st.radar, loading: false, error: res?.message ?? 'Error' } }))
      }
    } catch (e: any) {
      set((st) => ({ radar: { ...st.radar, loading: false, error: e?.message ?? 'Error' } }))
    }
  },

  fetchTaskPerf: async (userId, from, to, force = false, projectId?: string | null) => {
    const key = `${userId}|${from}|${to}|${projectId ?? ''}`
    const s = get().taskPerf
    if (!force && s.cacheKey === key && s.data) return
    set((st) => ({ taskPerf: { ...st.taskPerf, loading: true, error: null } }))
    try {
      const res = await window.api.progress.getTaskPerformance(userId, from, to, projectId ?? undefined)
      if (res?.status === 'success') {
        set({ taskPerf: { data: res.data, loading: false, error: null, cacheKey: key } })
      } else {
        set((st) => ({ taskPerf: { ...st.taskPerf, loading: false, error: res?.message ?? 'Error' } }))
      }
    } catch (e: any) {
      set((st) => ({ taskPerf: { ...st.taskPerf, loading: false, error: e?.message ?? 'Error' } }))
    }
  },

  fetchQuality: async (userId, weeksBack, force = false, teamUserIds?: string[] | null, from?: string | null, to?: string | null) => {
    const teamKey = (teamUserIds ?? []).join(',')
    const key = `${userId}|${weeksBack}|${teamKey}|${from ?? ''}|${to ?? ''}`
    const s = get().quality
    if (!force && s.cacheKey === key && s.data) return
    set((st) => ({ quality: { ...st.quality, loading: true, error: null } }))
    try {
      const res = await window.api.progress.getQualityTrend(userId, weeksBack, teamUserIds ?? undefined, from ?? undefined, to ?? undefined)
      if (res?.status === 'success') {
        set({ quality: { data: res.data, loading: false, error: null, cacheKey: key } })
      } else {
        set((st) => ({ quality: { ...st.quality, loading: false, error: res?.message ?? 'Error' } }))
      }
    } catch (e: any) {
      set((st) => ({ quality: { ...st.quality, loading: false, error: e?.message ?? 'Error' } }))
    }
  },

  fetchProductiveHours: async (userId, weeksBack, force = false, from?: string | null, to?: string | null) => {
    const key = `${userId}|${weeksBack}|${from ?? ''}|${to ?? ''}`
    const s = get().productiveHours
    if (!force && s.cacheKey === key && s.data) return
    set((st) => ({ productiveHours: { ...st.productiveHours, loading: true, error: null } }))
    try {
      const res = await window.api.progress.getProductiveHours(userId, weeksBack, from ?? undefined, to ?? undefined)
      if (res?.status === 'success') {
        set({ productiveHours: { data: res.data ?? null, loading: false, error: null, cacheKey: key } })
      } else {
        set((st) => ({ productiveHours: { ...st.productiveHours, loading: false, error: res?.message ?? 'Error' } }))
      }
    } catch (e: any) {
      set((st) => ({ productiveHours: { ...st.productiveHours, loading: false, error: e?.message ?? 'Error' } }))
    }
  },

  fetchHighlights: async (userId, yearMonth, force = false) => {
    const key = `${userId}|${yearMonth}`
    const s = get().highlights
    if (!force && s.cacheKey === key && s.data) return
    set((st) => ({ highlights: { ...st.highlights, loading: true, error: null } }))
    try {
      const res = await window.api.progress.getMonthlyHighlights(userId, yearMonth)
      if (res?.status === 'success') {
        set({ highlights: { data: res.data, loading: false, error: null, cacheKey: key } })
      } else {
        set((st) => ({ highlights: { ...st.highlights, loading: false, error: res?.message ?? 'Error' } }))
      }
    } catch (e: any) {
      set((st) => ({ highlights: { ...st.highlights, loading: false, error: e?.message ?? 'Error' } }))
    }
  },

  setTrendPeriod: (p) => set({ trendPeriod: p }),
  setTrendGranularity: (g) => set({ trendGranularity: g }),
  toggleTrendMetric: (m) =>
    set((st) => ({
      trendMetrics: st.trendMetrics.includes(m) ? st.trendMetrics.filter((x) => x !== m) : [...st.trendMetrics, m],
    })),
  setComparePrevious: (v) => set({ comparePrevious: v }),
  setQualityWeeksBack: (w) => set({ qualityWeeksBack: w }),
  setProductiveWeeksBack: (w) => set({ productiveWeeksBack: w }),
  setHighlightsYearMonth: (ym) => set({ highlightsYearMonth: ym }),
  setRadarYearMonth: (ym) => set({ radarYearMonth: ym }),
  setHeatmapYear: (y) => set({ heatmapYear: y }),
}))
