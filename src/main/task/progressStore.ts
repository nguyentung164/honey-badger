import { randomUuidV7 } from 'shared/randomUuidV7'
import { hasDbConfig, query } from './db'

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
  current: RadarMonthData & { year_month: string }
  previous: RadarMonthData & { year_month: string }
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

export interface QualityTeamAvg {
  rule_check_rate: number
  spotbugs_rate: number
}

export interface QualityData {
  trend: QualityWeekPoint[]
  userRuleRate: number
  userSpotbugsRate: number
  teamAvg: QualityTeamAvg
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

export interface UserBasicInfo {
  id: string
  name: string
  email: string | null
  user_code: string
}

export interface TeamProgressSummaryRow {
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
  /** null = user không có dự án (không có role dev/pl/pm trên project thật) — không so sánh với team. */
  team_rule_rate_pct: number | null
  team_spotbugs_rate_pct: number | null
  peak_dow: number | null
  peak_hour: number | null
  peak_cnt: number
}

// ─── helpers ────────────────────────────────────────────────────────────────

function startOfMonth(yearMonth: string): string {
  return `${yearMonth}-01`
}

function endOfMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${yearMonth}-${String(last).padStart(2, '0')}`
}

function prevMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── queries ─────────────────────────────────────────────────────────────────

export async function getHeatmapData(userId: string, year: number): Promise<HeatmapDay[]> {
  if (!hasDbConfig()) return []
  const rows = await query<HeatmapDay[]>(
    `SELECT snapshot_date, commits_count, tasks_done, has_daily_report, lines_inserted, lines_deleted, reviews_done
     FROM user_daily_snapshots
     WHERE user_id = ? AND YEAR(snapshot_date) = ?
     ORDER BY snapshot_date`,
    [userId, year],
  )
  return Array.isArray(rows) ? rows : []
}

export async function getTrendData(
  userId: string,
  from: string,
  to: string,
  granularity: 'day' | 'week' | 'month',
): Promise<TrendPoint[]> {
  if (!hasDbConfig()) return []
  const fmt = granularity === 'day' ? '%Y-%m-%d' : granularity === 'week' ? '%Y-%u' : '%Y-%m'
  const rows = await query<TrendPoint[]>(
    `SELECT
       DATE_FORMAT(snapshot_date, ?) AS period,
       SUM(commits_count)   AS commits,
       SUM(lines_inserted)  AS lines_added,
       SUM(lines_deleted)   AS lines_deleted,
       SUM(tasks_done)      AS tasks,
       SUM(reviews_done)    AS reviews,
       SUM(has_daily_report) AS reports
     FROM user_daily_snapshots
     WHERE user_id = ? AND snapshot_date BETWEEN ? AND ?
     GROUP BY period
     ORDER BY period`,
    [fmt, userId, from, to],
  )
  return Array.isArray(rows) ? rows : []
}

async function aggregateSnapshotForRange(userId: string, from: string, to: string): Promise<RadarMonthData> {
  if (!hasDbConfig()) {
    return {
      commits_count: 0, coding_days: 0, lines_inserted: 0, tasks_done: 0, tasks_done_on_time: 0,
      tasks_overdue_opened: 0, reviews_done: 0, has_daily_report_days: 0,
      commits_with_rule_check: 0, commits_with_spotbugs: 0, commits_total_in_queue: 0, working_days: 0,
    }
  }
  const rows = await query<Array<Record<string, number>>>(
    `SELECT
       SUM(commits_count)                                    AS commits_count,
       COUNT(CASE WHEN commits_count > 0 THEN 1 END)        AS coding_days,
       SUM(lines_inserted)                                   AS lines_inserted,
       SUM(tasks_done)                                       AS tasks_done,
       SUM(tasks_done_on_time)                               AS tasks_done_on_time,
       SUM(tasks_overdue_opened)                             AS tasks_overdue_opened,
       SUM(reviews_done)                                     AS reviews_done,
       SUM(has_daily_report)                                 AS has_daily_report_days,
       SUM(commits_with_rule_check)                          AS commits_with_rule_check,
       SUM(commits_with_spotbugs)                            AS commits_with_spotbugs,
       SUM(commits_total_in_queue)                           AS commits_total_in_queue,
       COUNT(*)                                              AS working_days
     FROM user_daily_snapshots
     WHERE user_id = ? AND snapshot_date BETWEEN ? AND ?`,
    [userId, from, to],
  )
  const r = Array.isArray(rows) && rows.length > 0 ? rows[0] : {}
  return {
    commits_count: Number(r.commits_count ?? 0),
    coding_days: Number(r.coding_days ?? 0),
    lines_inserted: Number(r.lines_inserted ?? 0),
    tasks_done: Number(r.tasks_done ?? 0),
    tasks_done_on_time: Number(r.tasks_done_on_time ?? 0),
    tasks_overdue_opened: Number(r.tasks_overdue_opened ?? 0),
    reviews_done: Number(r.reviews_done ?? 0),
    has_daily_report_days: Number(r.has_daily_report_days ?? 0),
    commits_with_rule_check: Number(r.commits_with_rule_check ?? 0),
    commits_with_spotbugs: Number(r.commits_with_spotbugs ?? 0),
    commits_total_in_queue: Number(r.commits_total_in_queue ?? 0),
    working_days: Number(r.working_days ?? 0),
  }
}

async function getMonthData(userId: string, yearMonth: string): Promise<RadarMonthData> {
  const s = startOfMonth(yearMonth)
  const e = endOfMonth(yearMonth)
  return aggregateSnapshotForRange(userId, s, e)
}

export async function getRadarData(userId: string, yearMonth: string): Promise<RadarData> {
  const prev = prevMonth(yearMonth)
  const [current, previous] = await Promise.all([getMonthData(userId, yearMonth), getMonthData(userId, prev)])
  return { current: { ...current, year_month: yearMonth }, previous: { ...previous, year_month: prev } }
}

function daysInclusiveUtc(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime()
  const b = new Date(`${to}T12:00:00Z`).getTime()
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

function fmtYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Radar so sánh kỳ hiện tại [from,to] với kỳ cùng độ dài ngay trước from. */
export async function getRadarDataForDateRange(userId: string, from: string, to: string): Promise<RadarData> {
  const current = await aggregateSnapshotForRange(userId, from, to)
  const n = daysInclusiveUtc(from, to)
  const toD = new Date(`${to}T12:00:00Z`)
  const prevEnd = new Date(toD)
  prevEnd.setUTCDate(prevEnd.getUTCDate() - n)
  const prevStart = new Date(prevEnd)
  prevStart.setUTCDate(prevStart.getUTCDate() - n + 1)
  const pf = fmtYmd(prevStart)
  const pt = fmtYmd(prevEnd)
  const previous = await aggregateSnapshotForRange(userId, pf, pt)
  const label = `${from}_${to}`
  return {
    current: { ...current, year_month: label },
    previous: { ...previous, year_month: `${pf}_${pt}` },
  }
}

export async function getTaskPerformance(
  userId: string,
  from: string,
  to: string,
  projectId?: string | null,
): Promise<TaskPerformanceData> {
  if (!hasDbConfig()) return { byType: [], onTimeTrend: [], totals: { total_done: 0, on_time: 0, avg_delay_days: null, avg_cycle_days: null } }

  const projClause = projectId ? ' AND project_id = ?' : ''
  const baseParams: unknown[] = [userId, from, to]
  const byParams = projectId ? [userId, from, to, projectId] : baseParams

  const byTypeRows = await query<TaskPerformanceRow[]>(
    `SELECT
       type,
       COUNT(*) AS total_done,
       SUM(CASE WHEN plan_end_date IS NOT NULL AND actual_end_date <= plan_end_date THEN 1 ELSE 0 END) AS on_time,
       AVG(CASE WHEN plan_end_date IS NOT NULL THEN DATEDIFF(actual_end_date, plan_end_date) ELSE NULL END) AS avg_delay_days,
       AVG(DATEDIFF(actual_end_date, COALESCE(actual_start_date, DATE(created_at)))) AS avg_cycle_days
     FROM tasks
     WHERE assignee_user_id = ? AND status = 'done'
       AND actual_end_date IS NOT NULL
       AND actual_end_date BETWEEN ? AND ?${projClause}
     GROUP BY type`,
    byParams,
  )

  const onTimeTrendParams = projectId ? [userId, from, to, projectId] : [userId, from, to]
  const onTimeTrendRows = await query<Array<{ month: string; total: number; on_time: number }>>(
    `SELECT
       DATE_FORMAT(actual_end_date, '%Y-%m') AS month,
       COUNT(*) AS total,
       SUM(CASE WHEN plan_end_date IS NOT NULL AND actual_end_date <= plan_end_date THEN 1 ELSE 0 END) AS on_time
     FROM tasks
     WHERE assignee_user_id = ? AND status = 'done'
       AND actual_end_date IS NOT NULL
       AND actual_end_date BETWEEN ? AND ?${projClause}
     GROUP BY month
     ORDER BY month`,
    onTimeTrendParams,
  )

  const totalsRow = await query<Array<Record<string, number | null>>>(
    `SELECT
       COUNT(*) AS total_done,
       SUM(CASE WHEN plan_end_date IS NOT NULL AND actual_end_date <= plan_end_date THEN 1 ELSE 0 END) AS on_time,
       AVG(CASE WHEN plan_end_date IS NOT NULL THEN DATEDIFF(actual_end_date, plan_end_date) ELSE NULL END) AS avg_delay_days,
       AVG(DATEDIFF(actual_end_date, COALESCE(actual_start_date, DATE(created_at)))) AS avg_cycle_days
     FROM tasks
     WHERE assignee_user_id = ? AND status = 'done'
       AND actual_end_date IS NOT NULL
       AND actual_end_date BETWEEN ? AND ?${projClause}`,
    byParams,
  )

  const tr = Array.isArray(totalsRow) && totalsRow.length > 0 ? totalsRow[0] : {}
  const onTimeTrend: OnTimeTrendPoint[] = Array.isArray(onTimeTrendRows)
    ? onTimeTrendRows.map((r) => ({
        month: String(r.month),
        total: Number(r.total),
        on_time: Number(r.on_time),
        rate: Number(r.total) > 0 ? Math.round((Number(r.on_time) / Number(r.total)) * 100) : 0,
      }))
    : []

  return {
    byType: Array.isArray(byTypeRows)
      ? (byTypeRows as any[]).map(r => ({
          type: String(r.type ?? ''),
          total_done: Number(r.total_done ?? 0),
          on_time: Number(r.on_time ?? 0),
          avg_delay_days: r.avg_delay_days != null ? Number(r.avg_delay_days) : null,
          avg_cycle_days: r.avg_cycle_days != null ? Number(r.avg_cycle_days) : null,
        }))
      : [],
    onTimeTrend,
    totals: {
      total_done: Number(tr.total_done ?? 0),
      on_time: Number(tr.on_time ?? 0),
      avg_delay_days: tr.avg_delay_days != null ? Number(tr.avg_delay_days) : null,
      avg_cycle_days: tr.avg_cycle_days != null ? Number(tr.avg_cycle_days) : null,
    },
  }
}

export async function getQualityTrend(
  userId: string,
  weeksBack: number,
  teamUserIds?: string[],
  from?: string,
  to?: string,
): Promise<QualityData> {
  if (!hasDbConfig()) {
    return { trend: [], userRuleRate: 0, userSpotbugsRate: 0, teamAvg: { rule_check_rate: 0, spotbugs_rate: 0 } }
  }

  const useRange = Boolean(from && to)
  const safeRate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0)

  let trendRows: QualityWeekPoint[]
  let userTotals: Array<{ rule_checked: number; spotbugs_checked: number; total: number }>
  let teamTotals: Array<{ rule_checked: number; spotbugs_checked: number; total: number }>

  if (useRange) {
    const f = from!
    const t = to!
    const tr1 = await query<QualityWeekPoint[]>(
      `SELECT
         DATE_FORMAT(snapshot_date, '%x-%v') AS week,
         SUM(commits_with_rule_check)  AS rule_checked,
         SUM(commits_with_spotbugs)    AS spotbugs_checked,
         SUM(commits_total_in_queue)   AS total
       FROM user_daily_snapshots
       WHERE user_id = ? AND snapshot_date BETWEEN ? AND ?
       GROUP BY week
       ORDER BY week`,
      [userId, f, t],
    )
    trendRows = Array.isArray(tr1) ? tr1 : []

    const ut1 = await query<Array<{ rule_checked: number; spotbugs_checked: number; total: number }>>(
      `SELECT
         SUM(commits_with_rule_check) AS rule_checked,
         SUM(commits_with_spotbugs)   AS spotbugs_checked,
         SUM(commits_total_in_queue)  AS total
       FROM user_daily_snapshots
       WHERE user_id = ? AND snapshot_date BETWEEN ? AND ?`,
      [userId, f, t],
    )
    userTotals = Array.isArray(ut1) ? ut1 : []

    if (teamUserIds && teamUserIds.length > 0) {
      const ph = teamUserIds.map(() => '?').join(',')
      const tt1 = await query<Array<{ rule_checked: number; spotbugs_checked: number; total: number }>>(
        `SELECT
           SUM(commits_with_rule_check) AS rule_checked,
           SUM(commits_with_spotbugs)   AS spotbugs_checked,
           SUM(commits_total_in_queue)  AS total
         FROM user_daily_snapshots
         WHERE user_id IN (${ph}) AND snapshot_date BETWEEN ? AND ?`,
        [...teamUserIds, f, t],
      )
      teamTotals = Array.isArray(tt1) ? tt1 : []
    } else {
      const tt1 = await query<Array<{ rule_checked: number; spotbugs_checked: number; total: number }>>(
        `SELECT
           SUM(commits_with_rule_check) AS rule_checked,
           SUM(commits_with_spotbugs)   AS spotbugs_checked,
           SUM(commits_total_in_queue)  AS total
         FROM user_daily_snapshots
         WHERE snapshot_date BETWEEN ? AND ?`,
        [f, t],
      )
      teamTotals = Array.isArray(tt1) ? tt1 : []
    }
  } else {
    const tr2 = await query<QualityWeekPoint[]>(
      `SELECT
         DATE_FORMAT(snapshot_date, '%x-%v') AS week,
         SUM(commits_with_rule_check)  AS rule_checked,
         SUM(commits_with_spotbugs)    AS spotbugs_checked,
         SUM(commits_total_in_queue)   AS total
       FROM user_daily_snapshots
       WHERE user_id = ? AND snapshot_date >= DATE_SUB(
         DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY),
         INTERVAL (? - 1) WEEK
       )
       GROUP BY week
       ORDER BY week`,
      [userId, weeksBack],
    )
    trendRows = Array.isArray(tr2) ? tr2 : []

    const ut2 = await query<Array<{ rule_checked: number; spotbugs_checked: number; total: number }>>(
      `SELECT
         SUM(commits_with_rule_check) AS rule_checked,
         SUM(commits_with_spotbugs)   AS spotbugs_checked,
         SUM(commits_total_in_queue)  AS total
       FROM user_daily_snapshots
       WHERE user_id = ? AND snapshot_date >= DATE_SUB(
         DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY),
         INTERVAL (? - 1) WEEK
       )`,
      [userId, weeksBack],
    )
    userTotals = Array.isArray(ut2) ? ut2 : []

    if (teamUserIds && teamUserIds.length > 0) {
      const ph = teamUserIds.map(() => '?').join(',')
      const tt2 = await query<Array<{ rule_checked: number; spotbugs_checked: number; total: number }>>(
        `SELECT
           SUM(commits_with_rule_check) AS rule_checked,
           SUM(commits_with_spotbugs)   AS spotbugs_checked,
           SUM(commits_total_in_queue)  AS total
         FROM user_daily_snapshots
         WHERE user_id IN (${ph}) AND snapshot_date >= DATE_SUB(
           DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY),
           INTERVAL (? - 1) WEEK
         )`,
        [...teamUserIds, weeksBack],
      )
      teamTotals = Array.isArray(tt2) ? tt2 : []
    } else {
      const tt2 = await query<Array<{ rule_checked: number; spotbugs_checked: number; total: number }>>(
        `SELECT
           SUM(commits_with_rule_check) AS rule_checked,
           SUM(commits_with_spotbugs)   AS spotbugs_checked,
           SUM(commits_total_in_queue)  AS total
         FROM user_daily_snapshots
         WHERE snapshot_date >= DATE_SUB(
           DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY),
           INTERVAL (? - 1) WEEK
         )`,
        [weeksBack],
      )
      teamTotals = Array.isArray(tt2) ? tt2 : []
    }
  }

  const ut = Array.isArray(userTotals) && userTotals.length > 0 ? userTotals[0] : { rule_checked: 0, spotbugs_checked: 0, total: 0 }
  const tt = Array.isArray(teamTotals) && teamTotals.length > 0 ? teamTotals[0] : { rule_checked: 0, spotbugs_checked: 0, total: 0 }

  return {
    trend: Array.isArray(trendRows) ? trendRows : [],
    userRuleRate: safeRate(Number(ut.rule_checked), Number(ut.total)),
    userSpotbugsRate: safeRate(Number(ut.spotbugs_checked), Number(ut.total)),
    teamAvg: {
      rule_check_rate: safeRate(Number(tt.rule_checked), Number(tt.total)),
      spotbugs_rate: safeRate(Number(tt.spotbugs_checked), Number(tt.total)),
    },
  }
}

const COMMIT_TS_SQL = `COALESCE(
  STR_TO_DATE(LEFT(TRIM(REPLACE(commit_time, '-', '/')), 19), '%Y/%m/%d %H:%i:%s'),
  STR_TO_DATE(LEFT(TRIM(REPLACE(commit_time, '-', '/')), 10), '%Y/%m/%d'),
  created_at
)`

/** Cùng logic thời gian commit nhưng gắn alias `q` — tránh ambiguous `created_at` khi JOIN users / upsf. */
const COMMIT_TS_SQL_Q = `COALESCE(
  STR_TO_DATE(LEFT(TRIM(REPLACE(q.commit_time, '-', '/')), 19), '%Y/%m/%d %H:%i:%s'),
  STR_TO_DATE(LEFT(TRIM(REPLACE(q.commit_time, '-', '/')), 10), '%Y/%m/%d'),
  q.created_at
)`

export async function getProductiveHours(
  userId: string,
  weeksBack: number,
  from?: string,
  to?: string,
): Promise<ProductiveHourCell[]> {
  if (!hasDbConfig()) return []
  const u = await getUserBasicInfo(userId)
  if (!u) return []
  const em = u.email?.trim() || null
  const nm = u.name?.trim() || null
  const cd = u.user_code?.trim() || null
  if (!em && !nm && !cd) return []

  const useRange = Boolean(from && to)
  const timeFilter = useRange
    ? `AND DATE(${COMMIT_TS_SQL}) >= ? AND DATE(${COMMIT_TS_SQL}) <= ?`
    : `AND ${COMMIT_TS_SQL} >= DATE_SUB(NOW(), INTERVAL ? WEEK)`
  const timeParams: unknown[] = useRange ? [from!, to!] : [weeksBack]

  const rows = await query<ProductiveHourCell[]>(
    `SELECT
       DAYOFWEEK(ts) AS dow,
       HOUR(ts) AS hour,
       COUNT(*) AS cnt
     FROM (
       SELECT ${COMMIT_TS_SQL} AS ts
       FROM git_commit_queue
       WHERE (
         (? IS NOT NULL AND ? <> '' AND commit_user = ?) OR
         (? IS NOT NULL AND ? <> '' AND commit_user = ?) OR
         (? IS NOT NULL AND ? <> '' AND commit_user = ?)
       )
       ${timeFilter}
     ) q
     WHERE ts IS NOT NULL
     GROUP BY dow, hour
     ORDER BY dow, hour`,
    [em, em, em, nm, nm, nm, cd, cd, cd, ...timeParams],
  )
  return Array.isArray(rows) ? rows : []
}

export async function getMonthlyHighlights(userId: string, yearMonth: string): Promise<MonthlyHighlightsData> {
  if (!hasDbConfig()) {
    return {
      yearMonth, commits_count: 0, lines_inserted: 0, lines_deleted: 0,
      tasks_done: 0, reviews_done: 0, report_days: 0, working_days: 0,
      longest_streak: 0, prev_commits: 0, prev_tasks: 0, prev_reviews: 0, prev_report_days: 0,
      personal_best_commits_day: 0, personal_best_commits_day_date: null,
      personal_best_streak: 0, personal_best_tasks_month: 0,
      personal_best_lines_day: 0, personal_best_lines_day_date: null,
      six_months_trend: [],
    }
  }

  const s = startOfMonth(yearMonth)
  const e = endOfMonth(yearMonth)
  const prev = prevMonth(yearMonth)
  const ps = startOfMonth(prev)
  const pe = endOfMonth(prev)

  const [currRows, prevRows, bestDayRows, bestMonthRows, bestLineDayRows, trendRows, streakRows] = await Promise.all([
    query<Array<Record<string, number>>>(
      `SELECT SUM(commits_count) AS c, SUM(lines_inserted) AS li, SUM(lines_deleted) AS ld,
              SUM(tasks_done) AS t, SUM(reviews_done) AS r, SUM(has_daily_report) AS d, COUNT(*) AS wd
       FROM user_daily_snapshots WHERE user_id = ? AND snapshot_date BETWEEN ? AND ?`,
      [userId, s, e],
    ),
    query<Array<Record<string, number>>>(
      `SELECT SUM(commits_count) AS c, SUM(tasks_done) AS t, SUM(reviews_done) AS r, SUM(has_daily_report) AS d
       FROM user_daily_snapshots WHERE user_id = ? AND snapshot_date BETWEEN ? AND ?`,
      [userId, ps, pe],
    ),
    query<Array<{ commits_count: number; snapshot_date: string }>>(
      `SELECT commits_count, snapshot_date FROM user_daily_snapshots WHERE user_id = ? ORDER BY commits_count DESC LIMIT 1`,
      [userId],
    ),
    query<Array<{ total: number; month: string }>>(
      `SELECT SUM(tasks_done) AS total, DATE_FORMAT(snapshot_date, '%Y-%m') AS month
       FROM user_daily_snapshots WHERE user_id = ?
       GROUP BY month ORDER BY total DESC LIMIT 1`,
      [userId],
    ),
    query<Array<{ lines_inserted: number; snapshot_date: string }>>(
      `SELECT lines_inserted, snapshot_date FROM user_daily_snapshots WHERE user_id = ? ORDER BY lines_inserted DESC LIMIT 1`,
      [userId],
    ),
    query<Array<{ month: string; commits: number; tasks: number }>>(
      `SELECT DATE_FORMAT(snapshot_date, '%Y-%m') AS month,
              SUM(commits_count) AS commits, SUM(tasks_done) AS tasks
       FROM user_daily_snapshots
       WHERE user_id = ? AND snapshot_date >= DATE_SUB(?, INTERVAL 5 MONTH)
       GROUP BY month ORDER BY month`,
      [userId, s],
    ),
    query<Array<{ snapshot_date: string; commits_count: number }>>(
      `SELECT snapshot_date, commits_count FROM user_daily_snapshots
       WHERE user_id = ? ORDER BY snapshot_date ASC`,
      [userId],
    ),
  ])

  const curr = Array.isArray(currRows) && currRows.length > 0 ? currRows[0] : {}
  const prevR = Array.isArray(prevRows) && prevRows.length > 0 ? prevRows[0] : {}
  const bestDay = Array.isArray(bestDayRows) && bestDayRows.length > 0 ? bestDayRows[0] : null
  const bestMonth = Array.isArray(bestMonthRows) && bestMonthRows.length > 0 ? bestMonthRows[0] : null
  const bestLineDay = Array.isArray(bestLineDayRows) && bestLineDayRows.length > 0 ? bestLineDayRows[0] : null

  const longestStreak = computeLongestStreakInMonth(
    Array.isArray(streakRows) ? streakRows : [],
    yearMonth,
  )
  const allTimeLongestStreak = computeAllTimeLongestStreak(Array.isArray(streakRows) ? streakRows : [])

  return {
    yearMonth,
    commits_count: Number(curr.c ?? 0),
    lines_inserted: Number(curr.li ?? 0),
    lines_deleted: Number(curr.ld ?? 0),
    tasks_done: Number(curr.t ?? 0),
    reviews_done: Number(curr.r ?? 0),
    report_days: Number(curr.d ?? 0),
    working_days: Number(curr.wd ?? 0),
    longest_streak: longestStreak,
    prev_commits: Number(prevR.c ?? 0),
    prev_tasks: Number(prevR.t ?? 0),
    prev_reviews: Number(prevR.r ?? 0),
    prev_report_days: Number(prevR.d ?? 0),
    personal_best_commits_day: bestDay ? Number(bestDay.commits_count) : 0,
    personal_best_commits_day_date: bestDay ? String(bestDay.snapshot_date) : null,
    personal_best_streak: allTimeLongestStreak,
    personal_best_tasks_month: bestMonth ? Number(bestMonth.total) : 0,
    personal_best_lines_day: bestLineDay ? Number(bestLineDay.lines_inserted) : 0,
    personal_best_lines_day_date: bestLineDay ? String(bestLineDay.snapshot_date) : null,
    six_months_trend: Array.isArray(trendRows) ? trendRows.map((r) => ({ month: String(r.month), commits: Number(r.commits), tasks: Number(r.tasks) })) : [],
  }
}

function computeLongestStreakInMonth(rows: Array<{ snapshot_date: string; commits_count: number }>, yearMonth: string): number {
  const inMonth = rows.filter((r) => String(r.snapshot_date).startsWith(yearMonth) && Number(r.commits_count) > 0)
  if (inMonth.length === 0) return 0
  let max = 1; let cur = 1
  for (let i = 1; i < inMonth.length; i++) {
    const prev = new Date(inMonth[i - 1].snapshot_date)
    const curr = new Date(inMonth[i].snapshot_date)
    const diff = (curr.getTime() - prev.getTime()) / 86400000
    if (diff === 1) { cur++; if (cur > max) max = cur } else { cur = 1 }
  }
  return max
}

function computeAllTimeLongestStreak(rows: Array<{ snapshot_date: string; commits_count: number }>): number {
  const active = rows.filter((r) => Number(r.commits_count) > 0)
  if (active.length === 0) return 0
  let max = 1; let cur = 1
  for (let i = 1; i < active.length; i++) {
    const prev = new Date(active[i - 1].snapshot_date)
    const curr = new Date(active[i].snapshot_date)
    const diff = (curr.getTime() - prev.getTime()) / 86400000
    if (diff === 1) { cur++; if (cur > max) max = cur } else { cur = 1 }
  }
  return max
}

// ─── snapshot upsert ──────────────────────────────────────────────────────────

export interface SnapshotInput {
  userId: string
  date: string
  commits_count: number
  lines_inserted: number
  lines_deleted: number
  files_changed: number
  commits_with_rule_check: number
  commits_with_spotbugs: number
  commits_total_in_queue: number
  tasks_done: number
  tasks_done_on_time: number
  tasks_overdue_opened: number
  reviews_done: number
  has_daily_report: number
  evm_hours_logged: number
}

export async function upsertDailySnapshot(input: SnapshotInput): Promise<void> {
  if (!hasDbConfig()) return
  await query(
    `INSERT INTO user_daily_snapshots
       (id, user_id, snapshot_date, commits_count, lines_inserted, lines_deleted,
        files_changed, commits_with_rule_check, commits_with_spotbugs, commits_total_in_queue,
        tasks_done, tasks_done_on_time, tasks_overdue_opened, reviews_done, has_daily_report, evm_hours_logged)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       commits_count = VALUES(commits_count),
       lines_inserted = VALUES(lines_inserted),
       lines_deleted = VALUES(lines_deleted),
       files_changed = VALUES(files_changed),
       commits_with_rule_check = VALUES(commits_with_rule_check),
       commits_with_spotbugs = VALUES(commits_with_spotbugs),
       commits_total_in_queue = VALUES(commits_total_in_queue),
       tasks_done = VALUES(tasks_done),
       tasks_done_on_time = VALUES(tasks_done_on_time),
       tasks_overdue_opened = VALUES(tasks_overdue_opened),
       reviews_done = VALUES(reviews_done),
       has_daily_report = VALUES(has_daily_report),
       evm_hours_logged = VALUES(evm_hours_logged),
       updated_at = CURRENT_TIMESTAMP`,
    [
      randomUuidV7(), input.userId, input.date,
      input.commits_count, input.lines_inserted, input.lines_deleted,
      input.files_changed, input.commits_with_rule_check, input.commits_with_spotbugs,
      input.commits_total_in_queue, input.tasks_done, input.tasks_done_on_time,
      input.tasks_overdue_opened, input.reviews_done, input.has_daily_report,
      input.evm_hours_logged,
    ],
  )
}

export async function getSnapshotDatesForUser(userId: string): Promise<string[]> {
  if (!hasDbConfig()) return []
  const rows = await query<Array<{ snapshot_date: string }>>(
    `SELECT snapshot_date FROM user_daily_snapshots WHERE user_id = ? ORDER BY snapshot_date DESC`,
    [userId],
  )
  return Array.isArray(rows) ? rows.map((r) => String(r.snapshot_date)) : []
}

/** Đồng bộ TEAM_SUMMARY_USER_CAP trong TeamProgressOverviewPage.tsx */
const MAX_TEAM_SUMMARY_USERS = 80

/** User có role dev/pl/pm trên project (không gồm global NULL project). */
export async function getProjectMemberUserIds(projectId: string): Promise<string[]> {
  if (!hasDbConfig() || !projectId) return []
  const rows = await query<Array<{ user_id: string }>>(
    `SELECT DISTINCT user_id FROM user_project_roles
     WHERE project_id = ? AND role IN ('dev', 'pl', 'pm')`,
    [projectId],
  )
  return Array.isArray(rows) ? rows.map(r => String(r.user_id)) : []
}

/** Tên dự án (dev/pl/pm, project thật) theo user — dùng cột Project trên Team overview. */
export async function getTeamOverviewUserProjectLabels(userIds: string[]): Promise<Record<string, string>> {
  if (!hasDbConfig() || userIds.length === 0) return {}
  const ids = [...new Set(userIds)].filter(Boolean).slice(0, MAX_TEAM_SUMMARY_USERS)
  if (ids.length === 0) return {}
  const ph = ids.map(() => '?').join(',')
  const rows = await query<Array<{ user_id: string; project_names: string | null }>>(
    `SELECT upr.user_id,
       GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') AS project_names
     FROM user_project_roles upr
     INNER JOIN projects p ON p.id = upr.project_id
     WHERE upr.user_id IN (${ph})
       AND upr.project_id IS NOT NULL
       AND upr.role IN ('dev', 'pl', 'pm')
     GROUP BY upr.user_id`,
    [...ids],
  )
  const out: Record<string, string> = {}
  if (Array.isArray(rows)) {
    for (const r of rows) {
      const names = r.project_names != null ? String(r.project_names).trim() : ''
      if (names) out[String(r.user_id)] = names
    }
  }
  return out
}

export async function getTeamProgressSummaries(
  userIds: string[],
  from: string,
  to: string,
  projectId: string | null,
): Promise<TeamProgressSummaryRow[]> {
  if (!hasDbConfig() || userIds.length === 0) return []
  const ids = [...new Set(userIds)].filter(Boolean).slice(0, MAX_TEAM_SUMMARY_USERS)
  if (ids.length === 0) return []

  const safeRate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
  const ph = ids.map(() => '?').join(',')

  type RuleSpotCommitAgg = { rule_checked: number; spotbugs_checked: number; total: number }
  const qualityByUser = new Map<string, RuleSpotCommitAgg>()
  let teamRule = 0
  let teamSpot = 0
  /** Chế độ «tất cả dự án»: tách commit theo project qua source folder; TB dòng = blend theo hỗn hợp project của user. */
  let allProjectsQuality: {
    mappedByUser: Map<string, Map<string, RuleSpotCommitAgg>>
    unmappedByUser: Map<string, RuleSpotCommitAgg>
    teamByProject: Map<string, RuleSpotCommitAgg>
    globalPool: RuleSpotCommitAgg
  } | null = null

  const personalAllProjectsAgg = (
    mapped: Map<string, RuleSpotCommitAgg> | undefined,
    unmapped: RuleSpotCommitAgg | undefined,
  ): RuleSpotCommitAgg => {
    let r = 0
    let sp = 0
    let t = 0
    if (mapped) {
      for (const a of mapped.values()) {
        r += Number(a.rule_checked ?? 0)
        sp += Number(a.spotbugs_checked ?? 0)
        t += Number(a.total ?? 0)
      }
    }
    if (unmapped) {
      r += Number(unmapped.rule_checked ?? 0)
      sp += Number(unmapped.spotbugs_checked ?? 0)
      t += Number(unmapped.total ?? 0)
    }
    return { rule_checked: r, spotbugs_checked: sp, total: t }
  }

  const blendAllProjectsTeam = (
    mapped: Map<string, RuleSpotCommitAgg>,
    unmapped: RuleSpotCommitAgg | undefined,
    teamByProject: Map<string, RuleSpotCommitAgg>,
    globalPool: RuleSpotCommitAgg,
  ): { rulePct: number; spotPct: number } => {
    const gTot = Number(globalPool.total ?? 0)
    const gRuleRt = gTot > 0 ? Number(globalPool.rule_checked ?? 0) / gTot : 0
    const gSpotRt = gTot > 0 ? Number(globalPool.spotbugs_checked ?? 0) / gTot : 0
    let sumW = 0
    let sumRule = 0
    let sumSpot = 0
    for (const [pid, userAgg] of mapped) {
      const w = Number(userAgg.total ?? 0)
      if (w <= 0) continue
      const team = teamByProject.get(pid)
      const tt = team ? Number(team.total ?? 0) : 0
      const rr = tt > 0 && team ? Number(team.rule_checked ?? 0) / tt : gRuleRt
      const sr = tt > 0 && team ? Number(team.spotbugs_checked ?? 0) / tt : gSpotRt
      sumW += w
      sumRule += rr * w
      sumSpot += sr * w
    }
    if (unmapped) {
      const uw = Number(unmapped.total ?? 0)
      if (uw > 0) {
        sumW += uw
        sumRule += gRuleRt * uw
        sumSpot += gSpotRt * uw
      }
    }
    if (sumW > 0) {
      return {
        rulePct: Math.round((sumRule / sumW) * 100),
        spotPct: Math.round((sumSpot / sumW) * 100),
      }
    }
    return {
      rulePct: safeRate(Number(globalPool.rule_checked ?? 0), gTot),
      spotPct: safeRate(Number(globalPool.spotbugs_checked ?? 0), gTot),
    }
  }

  const commitJoinUsers = `FROM git_commit_queue q
     INNER JOIN users u ON (
       (u.email IS NOT NULL AND u.email <> '' AND q.commit_user = u.email) OR
       (u.name IS NOT NULL AND u.name <> '' AND q.commit_user = u.name) OR
       (u.user_code IS NOT NULL AND u.user_code <> '' AND q.commit_user = u.user_code)
     )`

  const loadCommitQuality = async (): Promise<void> => {
    if (projectId) {
      /**
       * Ghép commit_user → users, chỉ user có role dev/pl/pm trên projectId.
       * Lưu ý: user tham gia nhiều dự án — cùng commit có thể được tính khi xem từng dự án.
       */
      const commitAggFrom = `${commitJoinUsers}
       WHERE u.id IN (${ph})
         AND EXISTS (
           SELECT 1 FROM user_project_roles upr
           WHERE upr.user_id = u.id AND upr.project_id = ? AND upr.role IN ('dev', 'pl', 'pm')
         )
         AND DATE(${COMMIT_TS_SQL_Q}) >= ? AND DATE(${COMMIT_TS_SQL_Q}) <= ?`

      const commitAggParams: unknown[] = [...ids, projectId, from, to]

      const teamCommitAgg = await query<Array<RuleSpotCommitAgg>>(
        `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN q.has_check_coding_rule THEN 1 ELSE 0 END) AS rule_checked,
         SUM(CASE WHEN q.has_check_spotbugs THEN 1 ELSE 0 END) AS spotbugs_checked
       ${commitAggFrom}`,
        commitAggParams,
      )
      const ta = Array.isArray(teamCommitAgg) && teamCommitAgg.length > 0 ? teamCommitAgg[0] : { rule_checked: 0, spotbugs_checked: 0, total: 0 }
      teamRule = safeRate(Number(ta.rule_checked ?? 0), Number(ta.total ?? 0))
      teamSpot = safeRate(Number(ta.spotbugs_checked ?? 0), Number(ta.total ?? 0))

      const perUserCommit = await query<Array<{ user_id: string } & RuleSpotCommitAgg>>(
        `SELECT
         u.id AS user_id,
         COUNT(*) AS total,
         SUM(CASE WHEN q.has_check_coding_rule THEN 1 ELSE 0 END) AS rule_checked,
         SUM(CASE WHEN q.has_check_spotbugs THEN 1 ELSE 0 END) AS spotbugs_checked
       ${commitAggFrom}
       GROUP BY u.id`,
        commitAggParams,
      )
      if (Array.isArray(perUserCommit)) {
        for (const r of perUserCommit) {
          qualityByUser.set(String(r.user_id), {
            rule_checked: Number(r.rule_checked ?? 0),
            spotbugs_checked: Number(r.spotbugs_checked ?? 0),
            total: Number(r.total ?? 0),
          })
        }
      }
      return
    }

    const commitAggParamsAll: unknown[] = [...ids, from, to]

    const mappedSql = `SELECT u.id AS user_id, upsf.project_id AS project_id,
         COUNT(*) AS total,
         SUM(CASE WHEN q.has_check_coding_rule THEN 1 ELSE 0 END) AS rule_checked,
         SUM(CASE WHEN q.has_check_spotbugs THEN 1 ELSE 0 END) AS spotbugs_checked
       ${commitJoinUsers}
       INNER JOIN user_project_source_folder upsf
         ON upsf.user_id = u.id AND upsf.source_folder_path = q.source_folder_path
       INNER JOIN user_project_roles upr
         ON upr.user_id = u.id AND upr.project_id = upsf.project_id AND upr.role IN ('dev', 'pl', 'pm')
       WHERE u.id IN (${ph})
         AND q.source_folder_path IS NOT NULL AND TRIM(q.source_folder_path) <> ''
         AND DATE(${COMMIT_TS_SQL_Q}) >= ? AND DATE(${COMMIT_TS_SQL_Q}) <= ?
       GROUP BY u.id, upsf.project_id`

    const unmappedSql = `SELECT u.id AS user_id,
         COUNT(*) AS total,
         SUM(CASE WHEN q.has_check_coding_rule THEN 1 ELSE 0 END) AS rule_checked,
         SUM(CASE WHEN q.has_check_spotbugs THEN 1 ELSE 0 END) AS spotbugs_checked
       ${commitJoinUsers}
       WHERE u.id IN (${ph})
         AND DATE(${COMMIT_TS_SQL_Q}) >= ? AND DATE(${COMMIT_TS_SQL_Q}) <= ?
         AND (
           q.source_folder_path IS NULL OR TRIM(q.source_folder_path) = ''
           OR NOT EXISTS (
             SELECT 1 FROM user_project_source_folder upsf
             WHERE upsf.user_id = u.id AND upsf.source_folder_path = q.source_folder_path
           )
         )
       GROUP BY u.id`

    /**
     * TB % team theo từng project: phải gồm mọi commit của thành viên dự án (dev/pl/pm) trong khoảng ngày,
     * không lọc theo batch `ids` (tối đa MAX_TEAM_SUMMARY_USERS). Nếu lọc theo ids thì chế độ «tất cả dự án»
     * chỉ trộn số liệu của vài user đầu → sai so với chọn một project (ids = member project).
     */
    const teamPerProjectSqlFullTeam = `SELECT upsf.project_id AS project_id,
         COUNT(*) AS total,
         SUM(CASE WHEN q.has_check_coding_rule THEN 1 ELSE 0 END) AS rule_checked,
         SUM(CASE WHEN q.has_check_spotbugs THEN 1 ELSE 0 END) AS spotbugs_checked
       ${commitJoinUsers}
       INNER JOIN user_project_source_folder upsf
         ON upsf.user_id = u.id AND upsf.source_folder_path = q.source_folder_path
       INNER JOIN user_project_roles upr
         ON upr.user_id = u.id AND upr.project_id = upsf.project_id AND upr.role IN ('dev', 'pl', 'pm')
       WHERE q.source_folder_path IS NOT NULL AND TRIM(q.source_folder_path) <> ''
         AND DATE(${COMMIT_TS_SQL_Q}) >= ? AND DATE(${COMMIT_TS_SQL_Q}) <= ?
       GROUP BY upsf.project_id`

    const commitAggFromAllDatesOnly = `${commitJoinUsers}
       WHERE DATE(${COMMIT_TS_SQL_Q}) >= ? AND DATE(${COMMIT_TS_SQL_Q}) <= ?`
    const commitAggDateOnlyParams: unknown[] = [from, to]

    const [teamCommitAggAll, mappedRows, unmappedRows, teamPerProjRows] = await Promise.all([
      query<Array<RuleSpotCommitAgg>>(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN q.has_check_coding_rule THEN 1 ELSE 0 END) AS rule_checked,
           SUM(CASE WHEN q.has_check_spotbugs THEN 1 ELSE 0 END) AS spotbugs_checked
         ${commitAggFromAllDatesOnly}`,
        commitAggDateOnlyParams,
      ),
      query<Array<{ user_id: string; project_id: string } & RuleSpotCommitAgg>>(mappedSql, commitAggParamsAll),
      query<Array<{ user_id: string } & RuleSpotCommitAgg>>(unmappedSql, commitAggParamsAll),
      query<Array<{ project_id: string } & RuleSpotCommitAgg>>(teamPerProjectSqlFullTeam, commitAggDateOnlyParams),
    ])

    const tAll = Array.isArray(teamCommitAggAll) && teamCommitAggAll.length > 0 ? teamCommitAggAll[0] : { rule_checked: 0, spotbugs_checked: 0, total: 0 }
    const globalPool: RuleSpotCommitAgg = {
      rule_checked: Number(tAll.rule_checked ?? 0),
      spotbugs_checked: Number(tAll.spotbugs_checked ?? 0),
      total: Number(tAll.total ?? 0),
    }

    const mappedByUser = new Map<string, Map<string, RuleSpotCommitAgg>>()
    if (Array.isArray(mappedRows)) {
      for (const r of mappedRows) {
        const uid = String(r.user_id)
        const pid = String(r.project_id)
        if (!mappedByUser.has(uid)) mappedByUser.set(uid, new Map())
        mappedByUser.get(uid)!.set(pid, {
          rule_checked: Number(r.rule_checked ?? 0),
          spotbugs_checked: Number(r.spotbugs_checked ?? 0),
          total: Number(r.total ?? 0),
        })
      }
    }

    const unmappedByUser = new Map<string, RuleSpotCommitAgg>()
    if (Array.isArray(unmappedRows)) {
      for (const r of unmappedRows) {
        unmappedByUser.set(String(r.user_id), {
          rule_checked: Number(r.rule_checked ?? 0),
          spotbugs_checked: Number(r.spotbugs_checked ?? 0),
          total: Number(r.total ?? 0),
        })
      }
    }

    const teamByProject = new Map<string, RuleSpotCommitAgg>()
    if (Array.isArray(teamPerProjRows)) {
      for (const r of teamPerProjRows) {
        teamByProject.set(String(r.project_id), {
          rule_checked: Number(r.rule_checked ?? 0),
          spotbugs_checked: Number(r.spotbugs_checked ?? 0),
          total: Number(r.total ?? 0),
        })
      }
    }

    allProjectsQuality = { mappedByUser, unmappedByUser, teamByProject, globalPool }
  }

  const projClause = projectId ? ' AND project_id = ?' : ''
  const taskParams: unknown[] = projectId ? [...ids, from, to, projectId] : [...ids, from, to]

  const peakPromise =
    ids.length <= MAX_TEAM_SUMMARY_USERS
      ? query<Array<{ user_id: string; dow: number; hour: number; cnt: number }>>(
          `SELECT u.id AS user_id, DAYOFWEEK(q.ts) AS dow, HOUR(q.ts) AS hour, COUNT(*) AS cnt
       FROM (
         SELECT commit_user, ${COMMIT_TS_SQL} AS ts
         FROM git_commit_queue
         WHERE DATE(${COMMIT_TS_SQL}) >= ? AND DATE(${COMMIT_TS_SQL}) <= ?
       ) q
       INNER JOIN users u ON (
         (u.email IS NOT NULL AND u.email <> '' AND q.commit_user = u.email) OR
         (u.name IS NOT NULL AND u.name <> '' AND q.commit_user = u.name) OR
         (u.user_code IS NOT NULL AND u.user_code <> '' AND q.commit_user = u.user_code)
       )
       WHERE u.id IN (${ph}) AND q.ts IS NOT NULL
       GROUP BY u.id, dow, hour`,
          [from, to, ...ids],
        )
      : Promise.resolve([] as Array<{ user_id: string; dow: number; hour: number; cnt: number }>)

  const userIdsWithProjectRolePromise = query<Array<{ user_id: string }>>(
    `SELECT DISTINCT user_id FROM user_project_roles
     WHERE user_id IN (${ph}) AND project_id IS NOT NULL AND role IN ('dev', 'pl', 'pm')`,
    [...ids],
  )

  const [, snapRows, taskRows, peakRows, roleMembershipRows] = await Promise.all([
    loadCommitQuality(),
    query<
      Array<{
        user_id: string
        report_days: number
        working_days: number
        rule_checked: number
        spotbugs_checked: number
        total: number
      }>
    >(
      `SELECT user_id,
       SUM(has_daily_report) AS report_days,
       COUNT(*) AS working_days,
       SUM(commits_with_rule_check) AS rule_checked,
       SUM(commits_with_spotbugs) AS spotbugs_checked,
       SUM(commits_total_in_queue) AS total
     FROM user_daily_snapshots
     WHERE user_id IN (${ph}) AND snapshot_date BETWEEN ? AND ?
     GROUP BY user_id`,
      [...ids, from, to],
    ),
    query<
      Array<{
        assignee_user_id: string
        total_done: number
        on_time: number
        avg_delay_days: number | null
        avg_cycle_days: number | null
      }>
    >(
      `SELECT assignee_user_id,
       COUNT(*) AS total_done,
       SUM(CASE WHEN plan_end_date IS NOT NULL AND actual_end_date <= plan_end_date THEN 1 ELSE 0 END) AS on_time,
       AVG(CASE WHEN plan_end_date IS NOT NULL THEN DATEDIFF(actual_end_date, plan_end_date) ELSE NULL END) AS avg_delay_days,
       AVG(DATEDIFF(actual_end_date, COALESCE(actual_start_date, DATE(created_at)))) AS avg_cycle_days
     FROM tasks
     WHERE assignee_user_id IN (${ph}) AND status = 'done' AND actual_end_date IS NOT NULL
       AND actual_end_date BETWEEN ? AND ?${projClause}
     GROUP BY assignee_user_id`,
      taskParams,
    ),
    peakPromise,
    userIdsWithProjectRolePromise,
  ])

  const userIdsWithProjectRole = new Set<string>()
  if (Array.isArray(roleMembershipRows)) {
    for (const r of roleMembershipRows) userIdsWithProjectRole.add(String(r.user_id))
  }

  const snapByUser = new Map<string, (typeof snapRows)[0]>()
  if (Array.isArray(snapRows)) {
    for (const r of snapRows) snapByUser.set(String(r.user_id), r)
  }

  const taskByUser = new Map<string, (typeof taskRows)[0]>()
  if (Array.isArray(taskRows)) {
    for (const r of taskRows) taskByUser.set(String(r.assignee_user_id), r)
  }

  const peakMap = new Map<string, { dow: number; hour: number; cnt: number }>()
  if (Array.isArray(peakRows)) {
    for (const pr of peakRows) {
      const uid = String(pr.user_id)
      const prev = peakMap.get(uid)
      const c = Number(pr.cnt ?? 0)
      if (!prev || c > prev.cnt) {
        peakMap.set(uid, { dow: Number(pr.dow), hour: Number(pr.hour), cnt: c })
      }
    }
  }

  return ids.map((uid) => {
    const s = snapByUser.get(uid)
    const tk = taskByUser.get(uid)
    const pk = peakMap.get(uid)
    const wd = s ? Number(s.working_days ?? 0) : 0
    const rd = s ? Number(s.report_days ?? 0) : 0
    const td = tk ? Number(tk.total_done ?? 0) : 0
    const ot = tk ? Number(tk.on_time ?? 0) : 0
    let rulePct: number
    let spotPct: number
    let rowTeamRule: number | null
    let rowTeamSpot: number | null
    const hasProjectForTeamBench = userIdsWithProjectRole.has(uid)
    if (allProjectsQuality) {
      const mapped = allProjectsQuality.mappedByUser.get(uid)
      const unmapped = allProjectsQuality.unmappedByUser.get(uid)
      const pa = personalAllProjectsAgg(mapped, unmapped)
      rulePct = safeRate(pa.rule_checked, pa.total)
      spotPct = safeRate(pa.spotbugs_checked, pa.total)
      if (hasProjectForTeamBench) {
        const blend = blendAllProjectsTeam(mapped ?? new Map(), unmapped, allProjectsQuality.teamByProject, allProjectsQuality.globalPool)
        rowTeamRule = blend.rulePct
        rowTeamSpot = blend.spotPct
      } else {
        rowTeamRule = null
        rowTeamSpot = null
      }
    } else {
      const qz = qualityByUser.get(uid)
      rulePct = safeRate(Number(qz?.rule_checked ?? 0), Number(qz?.total ?? 0))
      spotPct = safeRate(Number(qz?.spotbugs_checked ?? 0), Number(qz?.total ?? 0))
      if (hasProjectForTeamBench) {
        rowTeamRule = teamRule
        rowTeamSpot = teamSpot
      } else {
        rowTeamRule = null
        rowTeamSpot = null
      }
    }
    return {
      user_id: uid,
      report_days: rd,
      working_days: wd,
      report_rate_pct: safeRate(rd, wd),
      tasks_total_done: td,
      tasks_on_time: ot,
      on_time_rate_pct: safeRate(ot, td),
      avg_delay_days: tk?.avg_delay_days != null ? Number(tk.avg_delay_days) : null,
      avg_cycle_days: tk?.avg_cycle_days != null ? Number(tk.avg_cycle_days) : null,
      rule_rate_pct: rulePct,
      spotbugs_rate_pct: spotPct,
      team_rule_rate_pct: rowTeamRule,
      team_spotbugs_rate_pct: rowTeamSpot,
      peak_dow: pk ? pk.dow : null,
      peak_hour: pk ? pk.hour : null,
      peak_cnt: pk ? pk.cnt : 0,
    }
  })
}

export async function getAllUsersWithEmail(): Promise<UserBasicInfo[]> {
  if (!hasDbConfig()) return []
  const rows = await query<UserBasicInfo[]>(`SELECT id, name, email, user_code FROM users WHERE email IS NOT NULL AND email != ''`)
  return Array.isArray(rows) ? rows : []
}

export async function getAllUsers(): Promise<UserBasicInfo[]> {
  if (!hasDbConfig()) return []
  const rows = await query<UserBasicInfo[]>(`SELECT id, name, email, user_code FROM users ORDER BY name`)
  return Array.isArray(rows) ? rows : []
}

/** Users thuộc các project mà userId có role pm hoặc pl (per-project); luôn gồm chính userId. */
export async function getUsersInManagedProjects(userId: string): Promise<UserBasicInfo[]> {
  if (!hasDbConfig()) return []
  const rows = await query<UserBasicInfo[]>(
    `(
      SELECT DISTINCT u.id, u.name, u.email, u.user_code
      FROM users u
      JOIN user_project_roles upr_member ON upr_member.user_id = u.id
      WHERE upr_member.project_id IN (
        SELECT project_id FROM user_project_roles
        WHERE user_id = ? AND role IN ('pm', 'pl') AND project_id IS NOT NULL
      )
    )
    UNION
    (SELECT id, name, email, user_code FROM users WHERE id = ?)
    ORDER BY name`,
    [userId, userId],
  )
  return Array.isArray(rows) ? rows : []
}

export async function getUserBasicInfo(userId: string): Promise<UserBasicInfo | null> {
  if (!hasDbConfig()) return null
  const rows = await query<UserBasicInfo[]>(`SELECT id, name, email, user_code FROM users WHERE id = ?`, [userId])
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
}

export async function getGitCommitQueueForUserAndDate(
  userEmail: string | null,
  userName: string | null,
  userCode: string | null,
  date: string,
): Promise<Array<{ insertions: number; deletions: number; changes: number; has_check_coding_rule: boolean; has_check_spotbugs: boolean; added_files: any; modified_files: any; deleted_files: any }>> {
  if (!hasDbConfig()) return []
  const em = userEmail?.trim() || null
  const nm = userName?.trim() || null
  const cd = userCode?.trim() || null
  if (!em && !nm && !cd) return []
  const rows = await query(
    `SELECT insertions, deletions, changes, has_check_coding_rule, has_check_spotbugs,
            added_files, modified_files, deleted_files
     FROM git_commit_queue
     WHERE (
       (? IS NOT NULL AND ? <> '' AND commit_user = ?) OR
       (? IS NOT NULL AND ? <> '' AND commit_user = ?) OR
       (? IS NOT NULL AND ? <> '' AND commit_user = ?)
     )
     AND DATE(${COMMIT_TS_SQL}) = ?`,
    [em, em, em, nm, nm, nm, cd, cd, cd, date],
  )
  return Array.isArray(rows) ? rows : []
}

export async function getTasksDoneForUserAndDate(
  userId: string,
  date: string,
): Promise<Array<{ plan_end_date: string | null; actual_end_date: string }>> {
  if (!hasDbConfig()) return []
  const rows = await query(
    `SELECT plan_end_date, actual_end_date FROM tasks
     WHERE assignee_user_id = ? AND status = 'done'
       AND (
         (actual_end_date IS NOT NULL AND DATE(actual_end_date) = ?)
         OR (actual_end_date IS NULL AND DATE(updated_at) = ?)
       )`,
    [userId, date, date],
  )
  return Array.isArray(rows) ? rows : []
}

export async function getTasksOverdueForDate(
  userId: string,
  date: string,
): Promise<number> {
  if (!hasDbConfig()) return 0
  const rows = await query<Array<{ cnt: number }>>(
    `SELECT COUNT(*) AS cnt FROM tasks
     WHERE assignee_user_id = ? AND status != 'done'
       AND plan_end_date IS NOT NULL AND DATE(plan_end_date) < ?`,
    [userId, date],
  )
  return Array.isArray(rows) && rows.length > 0 ? Number(rows[0].cnt) : 0
}

export async function getReviewsDoneForUserAndDate(
  userId: string,
  date: string,
): Promise<number> {
  if (!hasDbConfig()) return 0
  const rows = await query<Array<{ cnt: number }>>(
    `SELECT COUNT(*) AS cnt FROM commit_reviews
     WHERE reviewer_user_id = ? AND DATE(reviewed_at) = ?`,
    [userId, date],
  )
  return Array.isArray(rows) && rows.length > 0 ? Number(rows[0].cnt) : 0
}

export async function hasDailyReportForDate(userId: string, date: string): Promise<boolean> {
  if (!hasDbConfig()) return false
  const rows = await query<Array<{ cnt: number }>>(
    `SELECT COUNT(*) AS cnt FROM daily_reports WHERE user_id = ? AND report_date = ?`,
    [userId, date],
  )
  return Array.isArray(rows) && rows.length > 0 ? Number(rows[0].cnt) > 0 : false
}

export async function getEvmHoursForUserAndDate(userId: string, date: string): Promise<number> {
  if (!hasDbConfig()) return 0
  // evm_ac.assignee: thường là users.id (WBS / đồng bộ tab AC); fallback user_code nếu nhập tay
  const rows = await query<Array<{ total: number }>>(
    `SELECT SUM(a.working_hours) AS total
     FROM evm_ac a
     WHERE (a.assignee = ?
        OR a.assignee = (SELECT user_code FROM users WHERE id = ? LIMIT 1))
       AND a.date = ?`,
    [userId, userId, date],
  )
  return Array.isArray(rows) && rows.length > 0 ? Number(rows[0].total ?? 0) : 0
}
