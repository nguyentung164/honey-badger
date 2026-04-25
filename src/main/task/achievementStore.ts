import { randomUuidV7 } from 'shared/randomUuidV7'
import { hasDbConfig, query, withTransaction } from './db'

export interface UserStats {
  user_id: string
  xp: number
  current_rank: string
  current_streak_days: number
  current_report_streak_days: number
  last_activity_date: string | null
  total_tasks_done: number
  total_tasks_created: number
  total_commits: number
  total_pushes: number
  total_merges: number
  total_branches_created: number
  total_stashes: number
  total_rebases: number
  total_reviews: number
  total_reports: number
  total_spotbugs_clean: number
  total_spotbugs_fails: number
  total_files_committed: number
  total_insertions: number
  total_coding_rules_created: number
  total_tasks_on_time: number
  total_tasks_early: number
  total_tasks_late: number
  total_tasks_bug_done: number
  total_tasks_feature_done: number
  total_tasks_critical_done: number
  consecutive_no_review_days: number
  consecutive_no_report_days: number
  consecutive_spotbugs_fails: number
  last_commit_date: string | null
  last_review_date: string | null
  last_report_date: string | null
  /** Ngày (local/DB) đã chạy daily negative check — chỉ đọc/ghi qua updateUserStats. */
  last_negative_check_date: string | null
  /** Từ SELECT * user_stats — baseline Ghost/Silent khi chưa có last_review/report. */
  created_at?: string | Date | null
}

export interface UserAchievementRow {
  id: string
  user_id: string
  achievement_code: string
  earned_count: number
  first_earned_at: string
  last_earned_at: string
  is_redeemed: boolean
}

export interface UserBadgeDisplayRow {
  user_id: string
  achievement_code: string
  display_order: number
}

export async function getUserStats(userId: string): Promise<UserStats | null> {
  if (!hasDbConfig()) return null
  const rows = await query<UserStats[]>('SELECT * FROM user_stats WHERE user_id = ?', [userId])
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
}

export async function ensureUserStats(userId: string): Promise<UserStats> {
  const existing = await getUserStats(userId)
  if (existing) return existing
  await query(
    'INSERT IGNORE INTO user_stats (user_id) VALUES (?)',
    [userId]
  )
  const stats = await getUserStats(userId)
  if (!stats) throw new Error(`Failed to ensure user_stats for ${userId}`)
  return stats
}

export async function incrementUserStat(userId: string, field: keyof UserStats, amount = 1): Promise<void> {
  if (!hasDbConfig()) return
  if (!ALLOWED_STAT_FIELDS.has(field)) return
  await ensureUserStats(userId)
  await query(
    `UPDATE user_stats SET ${field} = ${field} + ?, updated_at = NOW() WHERE user_id = ?`,
    [amount, userId]
  )
}

const ALLOWED_STAT_FIELDS = new Set<string>([
  'xp', 'current_rank', 'current_streak_days', 'current_report_streak_days',
  'last_activity_date', 'total_tasks_done', 'total_tasks_created', 'total_commits',
  'total_pushes', 'total_merges', 'total_branches_created', 'total_stashes',
  'total_rebases', 'total_reviews', 'total_reports', 'total_spotbugs_clean',
  'total_spotbugs_fails', 'total_files_committed', 'total_insertions',
  'total_coding_rules_created', 'total_tasks_on_time', 'total_tasks_early', 'total_tasks_late',
  'total_tasks_bug_done', 'total_tasks_feature_done', 'total_tasks_critical_done',
  'consecutive_no_review_days', 'consecutive_no_report_days', 'consecutive_spotbugs_fails',
  'last_commit_date', 'last_review_date', 'last_report_date', 'last_negative_check_date',
])

export async function updateUserStats(userId: string, updates: Partial<UserStats>): Promise<void> {
  if (!hasDbConfig()) return
  const fields = Object.keys(updates).filter(f => ALLOWED_STAT_FIELDS.has(f))
  if (fields.length === 0) return
  const setClause = fields.map(f => `${f} = ?`).join(', ')
  const values = fields.map(f => (updates as Record<string, unknown>)[f])
  await query(
    `UPDATE user_stats SET ${setClause}, updated_at = NOW() WHERE user_id = ?`,
    [...values, userId]
  )
}

export async function getUserAchievements(userId: string): Promise<UserAchievementRow[]> {
  if (!hasDbConfig()) return []
  const rows = await query<UserAchievementRow[]>(
    'SELECT * FROM user_achievements WHERE user_id = ? ORDER BY first_earned_at ASC',
    [userId]
  )
  return Array.isArray(rows) ? rows : []
}

export async function getUserAchievement(userId: string, code: string): Promise<UserAchievementRow | null> {
  if (!hasDbConfig()) return null
  const rows = await query<UserAchievementRow[]>(
    'SELECT * FROM user_achievements WHERE user_id = ? AND achievement_code = ?',
    [userId, code]
  )
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
}

/**
 * Award achievement tới user.
 * - Nếu chưa có: insert mới (earned_count = 1) → trả về true (newly earned)
 * - Nếu đã có và is_repeatable = true: increment earned_count → trả về true
 * - Nếu đã có và is_repeatable = false: trả về false (không award lại)
 *
 * @param prefetchedExisting Row đã biết từ DB, hoặc bỏ qua (undefined) để tự SELECT.
 *   Chỉ truyền `null` khi đã gọi getUserAchievement và chắc chắn không có row — không dùng `null` cho Map.get thiếu key (phải là undefined).
 */
export async function awardAchievement(
  userId: string,
  achievementCode: string,
  isRepeatable: boolean,
  prefetchedExisting?: UserAchievementRow | null
): Promise<boolean> {
  if (!hasDbConfig()) return false
  const existing = prefetchedExisting !== undefined
    ? prefetchedExisting
    : await getUserAchievement(userId, achievementCode)
  if (!existing) {
    const id = randomUuidV7()
    await query(
      `INSERT INTO user_achievements (id, user_id, achievement_code, earned_count, first_earned_at, last_earned_at)
       VALUES (?, ?, ?, 1, NOW(), NOW())`,
      [id, userId, achievementCode]
    )
    return true
  }
  if (isRepeatable) {
    await query(
      `UPDATE user_achievements SET earned_count = earned_count + 1, last_earned_at = NOW() WHERE user_id = ? AND achievement_code = ?`,
      [userId, achievementCode]
    )
    return true
  }
  return false
}

export async function markAchievementRedeemed(userId: string, achievementCode: string): Promise<void> {
  if (!hasDbConfig()) return
  await query(
    'UPDATE user_achievements SET is_redeemed = TRUE WHERE user_id = ? AND achievement_code = ?',
    [userId, achievementCode]
  )
}

export async function getUserBadgeDisplay(userId: string): Promise<UserBadgeDisplayRow[]> {
  if (!hasDbConfig()) return []
  const rows = await query<UserBadgeDisplayRow[]>(
    'SELECT * FROM user_badge_display WHERE user_id = ? ORDER BY display_order ASC',
    [userId]
  )
  return Array.isArray(rows) ? rows : []
}

export async function setUserBadgeDisplay(userId: string, codes: string[]): Promise<void> {
  if (!hasDbConfig()) return
  const limited = codes.slice(0, 3)
  await withTransaction(async (txQuery) => {
    await txQuery('DELETE FROM user_badge_display WHERE user_id = ?', [userId])
    for (let i = 0; i < limited.length; i++) {
      await txQuery(
        'INSERT INTO user_badge_display (user_id, achievement_code, display_order) VALUES (?, ?, ?)',
        [userId, limited[i], i]
      )
    }
  })
}

export interface LeaderboardEntry {
  user_id: string
  name: string
  user_code: string
  xp: number
  current_rank: string
  total_achievements: number
  /** Các role chip, ví dụ "PM,PL,DEV" — thứ tự PM → PL → DEV (user có thể vừa PL vừa DEV). */
  positions?: string | null
}

export async function getLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  if (!hasDbConfig()) return []
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100)
  const rows = await query<LeaderboardEntry[]>(
    `SELECT u.id AS user_id, u.name, u.user_code,
            COALESCE(us.xp, 0) AS xp,
            COALESCE(us.current_rank, 'newbie') AS current_rank,
            COALESCE((
              SELECT COUNT(*) FROM user_achievements ua
              WHERE ua.user_id = u.id
              AND ua.achievement_code IN (SELECT code FROM achievements WHERE is_negative = FALSE)
            ), 0) AS total_achievements,
            pos.positions
     FROM users u
     LEFT JOIN user_stats us ON us.user_id = u.id
     LEFT JOIN (
       SELECT user_id,
         NULLIF(CONCAT_WS(',',
           IF(SUM(role = 'pm') > 0, 'PM', NULL),
           IF(SUM(role = 'pl') > 0, 'PL', NULL),
           IF(SUM(role = 'dev') > 0, 'DEV', NULL)
         ), '') AS positions
       FROM user_project_roles
       GROUP BY user_id
     ) pos ON pos.user_id = u.id
     WHERE u.id NOT IN (SELECT user_id FROM app_admins)
     ORDER BY xp DESC, u.name ASC
     LIMIT ${safeLimit}`
  )
  return Array.isArray(rows) ? rows : []
}

export async function getLeaderboardByProject(projectId: string | null, limit = 20): Promise<LeaderboardEntry[]> {
  if (!hasDbConfig()) return []
  if (!projectId) return getLeaderboard(limit)
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100)
  const rows = await query<LeaderboardEntry[]>(
    `SELECT DISTINCT u.id AS user_id, u.name, u.user_code,
            COALESCE(us.xp, 0) AS xp,
            COALESCE(us.current_rank, 'newbie') AS current_rank,
            COALESCE((
              SELECT COUNT(*) FROM user_achievements ua
              WHERE ua.user_id = u.id
              AND ua.achievement_code IN (SELECT code FROM achievements WHERE is_negative = FALSE)
            ), 0) AS total_achievements,
            proj_pos.positions
     FROM users u
     INNER JOIN user_project_roles upr ON upr.user_id = u.id AND upr.project_id = ?
     LEFT JOIN user_stats us ON us.user_id = u.id
     LEFT JOIN (
       SELECT user_id,
         NULLIF(CONCAT_WS(',',
           IF(SUM(role = 'pm') > 0, 'PM', NULL),
           IF(SUM(role = 'pl') > 0, 'PL', NULL),
           IF(SUM(role = 'dev') > 0, 'DEV', NULL)
         ), '') AS positions
       FROM user_project_roles
       WHERE project_id = ?
       GROUP BY user_id
     ) proj_pos ON proj_pos.user_id = u.id
     WHERE u.id NOT IN (SELECT user_id FROM app_admins)
     ORDER BY xp DESC, u.name ASC
     LIMIT ${safeLimit}`,
    [projectId, projectId]
  )
  return Array.isArray(rows) ? rows : []
}

export interface AchievementRarityData {
  totalUsers: number
  rarities: Record<string, number>
}

export async function getAchievementRarities(): Promise<AchievementRarityData> {
  if (!hasDbConfig()) return { totalUsers: 0, rarities: {} }
  const [totalRes, rarityRows] = await Promise.all([
    query<{ total: number }[]>('SELECT COUNT(*) as total FROM users'),
    query<{ code: string; earned_count: number }[]>(
      `SELECT achievement_code as code, COUNT(DISTINCT user_id) as earned_count
       FROM user_achievements
       GROUP BY achievement_code`
    ),
  ])
  const totalUsers = Array.isArray(totalRes) && totalRes.length > 0 ? Number(totalRes[0].total) : 0
  const rarities: Record<string, number> = {}
  if (Array.isArray(rarityRows) && totalUsers > 0) {
    for (const row of rarityRows) {
      rarities[row.code] = Math.round((Number(row.earned_count) / totalUsers) * 100)
    }
  }
  return { totalUsers, rarities }
}

export async function getAllStatUserIds(): Promise<string[]> {
  if (!hasDbConfig()) return []
  const rows = await query<{ user_id: string }[]>('SELECT user_id FROM user_stats')
  return Array.isArray(rows) ? rows.map(r => r.user_id) : []
}

/** User chưa chạy daily negative trong `today` (YYYY-MM-DD). Một query, tối ưu mở app. */
export async function getUserIdsNeedingNegativeCheck(today: string): Promise<string[]> {
  if (!hasDbConfig()) return []
  const rows = await query<{ user_id: string }[]>(
    'SELECT user_id FROM user_stats WHERE last_negative_check_date IS NULL OR last_negative_check_date < ?',
    [today]
  )
  return Array.isArray(rows) ? rows.map(r => r.user_id) : []
}

export interface AchievementDefRow {
  code: string
  category: string
  tier: string
  name: string
  description: string
  icon: string
  xp_reward: number
  is_repeatable: boolean
  condition_type: string
  condition_threshold: number | null
  is_negative: boolean
  sort_order: number
}

let _defsCache: AchievementDefRow[] | null = null

export function invalidateAchievementDefsCache(): void {
  _defsCache = null
}

export async function getAllAchievementDefs(): Promise<AchievementDefRow[]> {
  if (!hasDbConfig()) return []
  if (_defsCache) return _defsCache
  const rows = await query<AchievementDefRow[]>(
    'SELECT * FROM achievements ORDER BY sort_order ASC'
  )
  _defsCache = Array.isArray(rows) ? rows : []
  return _defsCache
}
