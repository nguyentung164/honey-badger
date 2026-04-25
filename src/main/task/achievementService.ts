import l from 'electron-log'
import { sendTaskNotification } from '../notification/taskNotification'
import {
  type AchievementDefRow,
  awardAchievement,
  ensureUserStats,
  getAllAchievementDefs,
  getUserAchievements,
  getUserStats,
  incrementUserStat,
  type UserAchievementRow,
  type UserStats,
  updateUserStats,
} from './achievementStore'
import { getRebaseStatus } from '../git/rebase'
import { hasDbConfig } from './db'
import { insertTaskNotification, markAsRead } from './taskNotificationStore'

export const RANKS = [
  { code: 'newbie', minXp: 0, name: 'Newbie' },
  { code: 'contributor', minXp: 200, name: 'Contributor' },
  { code: 'developer', minXp: 800, name: 'Developer' },
  { code: 'regular', minXp: 2000, name: 'Regular' },
  { code: 'pro', minXp: 5000, name: 'Pro' },
  { code: 'expert', minXp: 12000, name: 'Expert' },
  { code: 'master', minXp: 30000, name: 'Master' },
  { code: 'legend', minXp: 70000, name: 'Legend' },
]

export function calculateRank(xp: number): string {
  let rank = RANKS[0].code
  for (const r of RANKS) {
    if (xp >= r.minXp) rank = r.code
  }
  return rank
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diffDays(a: string, b: string): number {
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  return Math.round(Math.abs(da - db) / 86400000)
}

async function addXp(userId: string, stats: UserStats, amount: number): Promise<string | null> {
  if (amount <= 0) return null
  const newXp = stats.xp + amount
  const newRank = calculateRank(newXp)
  const oldRank = stats.current_rank
  await updateUserStats(userId, { xp: newXp, current_rank: newRank })
  if (newRank !== oldRank) return newRank
  return null
}

async function notifyAchievement(userId: string, code: string, name: string, tier: string, xpReward: number, earnedCount: number): Promise<void> {
  try {
    const tierLabel = tier === 'negative' ? 'Struggle' : tier.charAt(0).toUpperCase() + tier.slice(1)
    const countSuffix = earnedCount > 1 ? ` (x${earnedCount})` : ''
    const title = `Achievement Unlocked: ${name}${countSuffix}`
    const body = JSON.stringify({ code, tier: tierLabel, xpReward, earnedCount })
    const id = await insertTaskNotification(userId, 'achievement_unlocked', title, body, null)
    // Gửi IPC ngay lập tức thay vì đợi poller 30 giây
    sendTaskNotification(userId, title, body, 'achievement_unlocked')
    // Đánh dấu đã đọc để poller không gửi lại
    markAsRead(id).catch(() => { })
  } catch (err) {
    l.warn('achievementService: notifyAchievement failed', err)
  }
}

async function notifyRankUp(userId: string, newRank: string): Promise<void> {
  try {
    const rankDef = RANKS.find(r => r.code === newRank)
    const title = `Rank Up! Bạn đã đạt rank ${rankDef?.name ?? newRank}`
    const body = JSON.stringify({ newRank })
    const id = await insertTaskNotification(userId, 'rank_up', title, body, null)
    // Gửi IPC ngay lập tức thay vì đợi poller 30 giây
    sendTaskNotification(userId, title, body, 'rank_up')
    // Đánh dấu đã đọc để poller không gửi lại
    markAsRead(id).catch(() => { })
  } catch (err) {
    l.warn('achievementService: notifyRankUp failed', err)
  }
}

async function checkAndAward(userId: string, stats: UserStats, defs: AchievementDefRow[], prefetchedEarnedMap?: Map<string, UserAchievementRow>): Promise<void> {
  const earnedMap = prefetchedEarnedMap ?? new Map((await getUserAchievements(userId)).map(e => [e.achievement_code, e]))

  for (const def of defs) {
    if (def.is_negative) continue

    const existing = earnedMap.get(def.code)
    let shouldAward = false

    switch (def.condition_type) {
      case 'total_tasks_done':
        shouldAward = stats.total_tasks_done >= (def.condition_threshold ?? 0)
        break
      case 'total_tasks_created':
        shouldAward = stats.total_tasks_created >= (def.condition_threshold ?? 0)
        break
      case 'total_tasks_on_time':
        shouldAward = def.is_repeatable ? stats.total_tasks_on_time > (existing?.earned_count ?? 0) : stats.total_tasks_on_time >= (def.condition_threshold ?? 0)
        break
      case 'total_tasks_early':
        shouldAward = def.is_repeatable ? stats.total_tasks_early > (existing?.earned_count ?? 0) : stats.total_tasks_early >= (def.condition_threshold ?? 0)
        break
      case 'total_tasks_bug_done':
        shouldAward = stats.total_tasks_bug_done >= (def.condition_threshold ?? 0)
        break
      case 'total_tasks_feature_done':
        shouldAward = stats.total_tasks_feature_done >= (def.condition_threshold ?? 0)
        break
      case 'total_tasks_critical_done':
        shouldAward = stats.total_tasks_critical_done >= (def.condition_threshold ?? 0)
        break
      case 'total_commits':
        shouldAward = stats.total_commits >= (def.condition_threshold ?? 0)
        break
      case 'total_pushes':
        shouldAward = stats.total_pushes >= (def.condition_threshold ?? 0)
        break
      case 'total_merges':
        shouldAward = stats.total_merges >= (def.condition_threshold ?? 0)
        break
      case 'total_branches_created':
        shouldAward = stats.total_branches_created >= (def.condition_threshold ?? 0)
        break
      case 'total_stashes':
        shouldAward = stats.total_stashes >= (def.condition_threshold ?? 0)
        break
      case 'total_rebases':
        shouldAward = stats.total_rebases >= (def.condition_threshold ?? 0)
        break
      case 'total_reviews':
        shouldAward = stats.total_reviews >= (def.condition_threshold ?? 0)
        break
      case 'total_reports':
        shouldAward = stats.total_reports >= (def.condition_threshold ?? 0)
        break
      case 'total_spotbugs_clean':
        shouldAward = stats.total_spotbugs_clean >= (def.condition_threshold ?? 0)
        break
      case 'total_insertions':
        shouldAward = stats.total_insertions >= (def.condition_threshold ?? 0)
        break
      case 'total_coding_rules_created':
        shouldAward = stats.total_coding_rules_created >= (def.condition_threshold ?? 0)
        break
      case 'commit_streak_7':
        shouldAward = stats.current_streak_days >= 7
        break
      case 'commit_streak_14':
        shouldAward = stats.current_streak_days >= 14
        break
      case 'commit_streak_30':
        shouldAward = stats.current_streak_days >= 30
        break
      case 'commit_streak_60':
        shouldAward = stats.current_streak_days >= 60
        break
      case 'report_streak_7':
        shouldAward = stats.current_report_streak_days >= 7
        break
      case 'report_streak_14':
        shouldAward = stats.current_report_streak_days >= 14
        break
      case 'report_streak_30':
        shouldAward = stats.current_report_streak_days >= 30
        break
      default:
        break
    }

    if (!shouldAward) continue
    if (!def.is_repeatable && existing) continue

    const awarded = await awardAchievement(userId, def.code, def.is_repeatable, existing)
    if (awarded) {
      const newCount = (existing?.earned_count ?? 0) + 1
      const rankUp = await addXp(userId, stats, def.xp_reward)
      await notifyAchievement(userId, def.code, def.name, def.tier, def.xp_reward, newCount)
      if (rankUp) await notifyRankUp(userId, rankUp)
      stats.xp += def.xp_reward
      stats.current_rank = calculateRank(stats.xp)
    }
  }
}

const NEGATIVE_AWARD_MAX_PER_DEF_PER_RUN = 50

function setEarnedCountInMap(
  earnedMap: Map<string, UserAchievementRow>,
  userId: string,
  code: string,
  existing: UserAchievementRow | undefined,
  newCount: number
): void {
  earnedMap.set(code, {
    id: existing?.id ?? '',
    user_id: userId,
    achievement_code: code,
    earned_count: newCount,
    first_earned_at: existing?.first_earned_at ?? '',
    last_earned_at: existing?.last_earned_at ?? '',
    is_redeemed: existing?.is_redeemed ?? false,
  })
}

async function checkNegativeAchievement(userId: string, stats: UserStats, defs: AchievementDefRow[], prefetchedEarnedMap?: Map<string, UserAchievementRow>): Promise<void> {
  const negativeDefs = defs.filter(d => d.is_negative)
  const earnedMap = prefetchedEarnedMap ?? new Map((await getUserAchievements(userId)).map(e => [e.achievement_code, e]))

  for (const def of negativeDefs) {
    let iterations = 0
    while (iterations < NEGATIVE_AWARD_MAX_PER_DEF_PER_RUN) {
      iterations += 1
      let shouldAward = false

      switch (def.condition_type) {
        case 'consecutive_no_review_days': {
          const existingNeg = earnedMap.get(def.code)
          const threshold = def.condition_threshold ?? 7
          const nextMilestone = threshold * ((existingNeg?.earned_count ?? 0) + 1)
          shouldAward = stats.consecutive_no_review_days >= nextMilestone
          break
        }
        case 'consecutive_no_report_days': {
          const existingNeg = earnedMap.get(def.code)
          const threshold = def.condition_threshold ?? 5
          const nextMilestone = threshold * ((existingNeg?.earned_count ?? 0) + 1)
          shouldAward = stats.consecutive_no_report_days >= nextMilestone
          break
        }
        case 'consecutive_spotbugs_fails': {
          const existingNeg = earnedMap.get(def.code)
          const threshold = def.condition_threshold ?? 10
          const nextMilestone = threshold * ((existingNeg?.earned_count ?? 0) + 1)
          shouldAward = stats.consecutive_spotbugs_fails >= nextMilestone
          break
        }
        case 'tasks_overdue_3': {
          const existing3 = earnedMap.get(def.code)
          const lateTasks = stats.total_tasks_late ?? 0
          const nextThreshold = 3 * ((existing3?.earned_count ?? 0) + 1)
          shouldAward = lateTasks >= nextThreshold
          break
        }
        default:
          shouldAward = false
          break
      }

      if (!shouldAward) break

      const existing = earnedMap.get(def.code)
      const awarded = await awardAchievement(userId, def.code, true, existing)
      if (!awarded) break

      const newCount = (existing?.earned_count ?? 0) + 1
      await notifyAchievement(userId, def.code, def.name, def.tier, 0, newCount)
      setEarnedCountInMap(earnedMap, userId, def.code, existing, newCount)
    }
  }
}

/** Cập nhật streak commit và last_commit_date */
async function updateCommitStreak(userId: string, stats: UserStats): Promise<void> {
  const today = todayStr()
  const last = stats.last_commit_date
  let newStreak = stats.current_streak_days

  if (!last) {
    newStreak = 1
  } else if (last === today) {
    // đã commit hôm nay rồi, không tăng streak
  } else if (diffDays(last, today) === 1) {
    newStreak += 1
  } else {
    newStreak = 1
  }

  await updateUserStats(userId, {
    last_commit_date: today,
    current_streak_days: newStreak,
    last_activity_date: today,
  })
  stats.last_commit_date = today
  stats.current_streak_days = newStreak
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function onFirstLogin(userId: string): Promise<void> {
  if (!userId || !hasDbConfig()) return
  try {
    await ensureUserStats(userId)
    const stats = await getUserStats(userId)
    if (!stats) return
    const awarded = await awardAchievement(userId, 'first_login', false)
    if (awarded) {
      const rankUp = await addXp(userId, stats, 10)
      stats.xp += 10
      await notifyAchievement(userId, 'first_login', 'Welcome!', 'bronze', 10, 1)
      if (rankUp) await notifyRankUp(userId, rankUp)
    }
  } catch (err) {
    l.error('achievementService.onFirstLogin error:', err)
  }
}

export interface CommitEventData {
  changes: number
  insertions: number
  deletions: number
  filesChanged?: number
  isAfterMidnight?: boolean
  /** true = git commit --amend — không tăng total_commits / streak / badge commit. */
  isAmend?: boolean
}

export async function onCommit(userId: string, data: CommitEventData): Promise<void> {
  if (!userId || !hasDbConfig()) return
  if (data.isAmend) return
  try {
    await ensureUserStats(userId)
    const stats = await getUserStats(userId)
    if (!stats) return
    const defs = await getAllAchievementDefs()

    const filesCommitted = data.filesChanged ?? data.changes ?? 0
    const insertions = data.insertions ?? 0

    const updates: Partial<UserStats> = {
      total_commits: stats.total_commits + 1,
      total_files_committed: stats.total_files_committed + filesCommitted,
      total_insertions: stats.total_insertions + insertions,
    }

    await updateUserStats(userId, updates)
    Object.assign(stats, updates)

    // XP per commit
    const baseXp = 3
    const filesBonus = filesCommitted > 50 ? 3 : 0
    await addXp(userId, stats, baseXp + filesBonus)
    stats.xp += baseXp + filesBonus

    // Update streak
    await updateCommitStreak(userId, stats)

    // Fetch earned achievements once; reuse across file badges, night owl, and checkAndAward
    const earnedAll = await getUserAchievements(userId)
    const earnedMap = new Map(earnedAll.map(e => [e.achievement_code, e]))

    // Repeatable badges per commit files count — may award multiple at once (e.g. positive + negative)
    const matchingFileBadges = defs.filter(d => {
      if (!d.is_repeatable) return false
      if (d.condition_type === 'commit_files_le3' && filesCommitted <= 3 && filesCommitted > 0) return true
      if (d.condition_type === 'commit_files_16_30' && filesCommitted >= 16 && filesCommitted <= 30) return true
      if (d.condition_type === 'commit_files_gt50' && filesCommitted > 50 && filesCommitted <= 100) return true
      if (d.condition_type === 'commit_files_ge100' && filesCommitted >= 100) return true
      if (d.condition_type === 'commit_files_gt100_neg' && filesCommitted > 100) return true
      if (d.condition_type === 'commit_files_gt200_neg' && filesCommitted > 200) return true
      return false
    })

    for (const filesBadge of matchingFileBadges) {
      const existingFileBadge = earnedMap.get(filesBadge.code)
      const awarded = await awardAchievement(userId, filesBadge.code, true, existingFileBadge)
      if (awarded) {
        const newCount = (existingFileBadge?.earned_count ?? 0) + 1
        if (!filesBadge.is_negative && filesBadge.xp_reward > 0) {
          const rankUp = await addXp(userId, stats, filesBadge.xp_reward)
          stats.xp += filesBadge.xp_reward
          stats.current_rank = calculateRank(stats.xp)
          if (rankUp) await notifyRankUp(userId, rankUp)
        }
        await notifyAchievement(userId, filesBadge.code, filesBadge.name, filesBadge.tier, filesBadge.xp_reward, newCount)
        setEarnedCountInMap(earnedMap, userId, filesBadge.code, existingFileBadge, newCount)
      }
    }

    // Night owl check: accumulate silently, notify when threshold hit
    if (data.isAfterMidnight) {
      const nightOwlDef = defs.find(d => d.condition_type === 'commits_after_1am')
      if (nightOwlDef) {
        const existingNightOwl = earnedMap.get(nightOwlDef.code)
        const prevCount = existingNightOwl?.earned_count ?? 0
        const threshold = nightOwlDef.condition_threshold ?? 7
        await awardAchievement(userId, nightOwlDef.code, true, existingNightOwl)
        const newCount = prevCount + 1
        setEarnedCountInMap(earnedMap, userId, nightOwlDef.code, existingNightOwl, newCount)
        if (newCount >= threshold && newCount % threshold === 0) {
          await notifyAchievement(userId, nightOwlDef.code, nightOwlDef.name, nightOwlDef.tier, 0, newCount)
        }
      }
    }

    const earnedFresh = await getUserAchievements(userId)
    const earnedMapForCheck = new Map(earnedFresh.map(e => [e.achievement_code, e]))
    await checkAndAward(userId, stats, defs, earnedMapForCheck)
  } catch (err) {
    l.error('achievementService.onCommit error:', err)
  }
}

export async function onPush(userId: string): Promise<void> {
  if (!userId || !hasDbConfig()) return
  try {
    await ensureUserStats(userId)
    const stats = await getUserStats(userId)
    if (!stats) return
    await incrementUserStat(userId, 'total_pushes')
    stats.total_pushes += 1
    await addXp(userId, stats, 2)
    stats.xp += 2
    const defs = await getAllAchievementDefs()
    await checkAndAward(userId, stats, defs)
  } catch (err) {
    l.error('achievementService.onPush error:', err)
  }
}

export async function onMerge(userId: string): Promise<void> {
  if (!userId || !hasDbConfig()) return
  try {
    await ensureUserStats(userId)
    const stats = await getUserStats(userId)
    if (!stats) return
    await incrementUserStat(userId, 'total_merges')
    stats.total_merges += 1
    await addXp(userId, stats, 10)
    stats.xp += 10
    const defs = await getAllAchievementDefs()
    await checkAndAward(userId, stats, defs)
  } catch (err) {
    l.error('achievementService.onMerge error:', err)
  }
}

export async function onBranchCreated(userId: string): Promise<void> {
  if (!userId || !hasDbConfig()) return
  try {
    await ensureUserStats(userId)
    const stats = await getUserStats(userId)
    if (!stats) return
    await incrementUserStat(userId, 'total_branches_created')
    stats.total_branches_created += 1
    const defs = await getAllAchievementDefs()
    await checkAndAward(userId, stats, defs)
  } catch (err) {
    l.error('achievementService.onBranchCreated error:', err)
  }
}

export async function onStash(userId: string): Promise<void> {
  if (!userId || !hasDbConfig()) return
  try {
    await ensureUserStats(userId)
    const stats = await getUserStats(userId)
    if (!stats) return
    await incrementUserStat(userId, 'total_stashes')
    stats.total_stashes += 1
    const defs = await getAllAchievementDefs()
    await checkAndAward(userId, stats, defs)
  } catch (err) {
    l.error('achievementService.onStash error:', err)
  }
}

/** +1 total_rebases khi một phiên rebase đã kết thúc (repo không còn .git/rebase-*). */
export async function recordRebaseCompletedIfIdle(userId: string, cwd?: string): Promise<void> {
  if (!userId || !hasDbConfig()) return
  try {
    const st = await getRebaseStatus(cwd)
    if (st.status !== 'success' || !st.data || st.data.isInRebase) return
    await onRebase(userId)
  } catch (err) {
    l.warn('achievementService.recordRebaseCompletedIfIdle failed', err)
  }
}

export async function onRebase(userId: string): Promise<void> {
  if (!userId || !hasDbConfig()) return
  try {
    await ensureUserStats(userId)
    const stats = await getUserStats(userId)
    if (!stats) return
    await incrementUserStat(userId, 'total_rebases')
    stats.total_rebases += 1
    const rankUp = await addXp(userId, stats, 10)
    stats.xp += 10
    if (rankUp) await notifyRankUp(userId, rankUp)
    const defs = await getAllAchievementDefs()
    await checkAndAward(userId, stats, defs)
  } catch (err) {
    l.error('achievementService.onRebase error:', err)
  }
}

export interface TaskDoneEventData {
  taskId: string
  type?: string
  priority?: string
  planEndDate?: string | null
  actualEndDate?: string | null
}

export async function onTaskDone(userId: string, taskData: TaskDoneEventData): Promise<void> {
  if (!userId || !hasDbConfig()) return
  try {
    await ensureUserStats(userId)
    const stats = await getUserStats(userId)
    if (!stats) return
    const defs = await getAllAchievementDefs()
    const today = todayStr()

    const updates: Partial<UserStats> = {
      total_tasks_done: stats.total_tasks_done + 1,
      last_activity_date: today,
    }

    if (taskData.type === 'bug') updates.total_tasks_bug_done = stats.total_tasks_bug_done + 1
    if (taskData.type === 'feature') updates.total_tasks_feature_done = stats.total_tasks_feature_done + 1
    if (taskData.priority === 'critical') updates.total_tasks_critical_done = stats.total_tasks_critical_done + 1

    // Check on time
    const isOnTime = taskData.planEndDate && taskData.actualEndDate ? taskData.actualEndDate.slice(0, 10) <= taskData.planEndDate.slice(0, 10) : false
    const daysEarly = taskData.planEndDate && taskData.actualEndDate ? diffDays(taskData.actualEndDate.slice(0, 10), taskData.planEndDate.slice(0, 10)) : 0

    if (isOnTime) updates.total_tasks_on_time = stats.total_tasks_on_time + 1
    if (isOnTime && daysEarly >= 3) updates.total_tasks_early = stats.total_tasks_early + 1
    if (!isOnTime && taskData.planEndDate && taskData.actualEndDate) {
      updates.total_tasks_late = (stats.total_tasks_late ?? 0) + 1
    }

    await updateUserStats(userId, updates)
    Object.assign(stats, updates)
    if (!isOnTime && updates.total_tasks_late) {
      await checkNegativeAchievement(userId, stats, defs)
    }

    // XP based on priority
    const xpMap: Record<string, number> = { critical: 40, high: 25, medium: 15, low: 10 }
    let xpGain = xpMap[taskData.priority ?? 'medium'] ?? 15
    if (isOnTime) xpGain += 10
    if (isOnTime && daysEarly >= 3) xpGain += 10
    const rankUp = await addXp(userId, stats, xpGain)
    stats.xp += xpGain
    if (rankUp) await notifyRankUp(userId, rankUp)

    await checkAndAward(userId, stats, defs)
  } catch (err) {
    l.error('achievementService.onTaskDone error:', err)
  }
}

export async function onTaskCreated(userId: string): Promise<void> {
  if (!userId || !hasDbConfig()) return
  try {
    await ensureUserStats(userId)
    const stats = await getUserStats(userId)
    if (!stats) return
    await incrementUserStat(userId, 'total_tasks_created')
    stats.total_tasks_created += 1
    await addXp(userId, stats, 5)
    stats.xp += 5
    const defs = await getAllAchievementDefs()
    await checkAndAward(userId, stats, defs)
  } catch (err) {
    l.error('achievementService.onTaskCreated error:', err)
  }
}

export async function onCommitReview(userId: string): Promise<void> {
  if (!userId || !hasDbConfig()) return
  try {
    await ensureUserStats(userId)
    const stats = await getUserStats(userId)
    if (!stats) return
    const today = todayStr()
    await updateUserStats(userId, {
      total_reviews: stats.total_reviews + 1,
      last_review_date: today,
      consecutive_no_review_days: 0,
      last_activity_date: today,
    })
    stats.total_reviews += 1
    stats.last_review_date = today
    stats.consecutive_no_review_days = 0
    await addXp(userId, stats, 12)
    stats.xp += 12
    const defs = await getAllAchievementDefs()
    await checkAndAward(userId, stats, defs)
  } catch (err) {
    l.error('achievementService.onCommitReview error:', err)
  }
}

export async function onDailyReport(userId: string, reportDate: string): Promise<void> {
  if (!userId || !hasDbConfig()) return
  try {
    await ensureUserStats(userId)
    const stats = await getUserStats(userId)
    if (!stats) return
    const last = stats.last_report_date

    if (last === reportDate) return

    let newReportStreak = stats.current_report_streak_days
    if (!last) {
      newReportStreak = 1
    } else if (diffDays(last, reportDate) === 1) {
      newReportStreak += 1
    } else {
      newReportStreak = 1
    }

    await updateUserStats(userId, {
      total_reports: stats.total_reports + 1,
      last_report_date: reportDate,
      current_report_streak_days: newReportStreak,
      consecutive_no_report_days: 0,
      last_activity_date: reportDate,
    })
    stats.total_reports += 1
    stats.current_report_streak_days = newReportStreak
    stats.consecutive_no_report_days = 0

    const streakBonus = newReportStreak > 1 ? 3 : 0
    await addXp(userId, stats, 8 + streakBonus)
    stats.xp += 8 + streakBonus

    const defs = await getAllAchievementDefs()
    await checkAndAward(userId, stats, defs)
  } catch (err) {
    l.error('achievementService.onDailyReport error:', err)
  }
}

export async function onSpotBugs(userId: string, bugCount: number): Promise<void> {
  if (!userId || !hasDbConfig()) return
  try {
    await ensureUserStats(userId)
    const stats = await getUserStats(userId)
    if (!stats) return
    const defs = await getAllAchievementDefs()

    if (bugCount === 0) {
      await updateUserStats(userId, {
        total_spotbugs_clean: stats.total_spotbugs_clean + 1,
        consecutive_spotbugs_fails: 0,
      })
      stats.total_spotbugs_clean += 1
      stats.consecutive_spotbugs_fails = 0
      await addXp(userId, stats, 10)
      stats.xp += 10
    } else {
      await updateUserStats(userId, {
        total_spotbugs_fails: stats.total_spotbugs_fails + 1,
        consecutive_spotbugs_fails: stats.consecutive_spotbugs_fails + 1,
      })
      stats.total_spotbugs_fails += 1
      stats.consecutive_spotbugs_fails += 1
      await checkNegativeAchievement(userId, stats, defs)
    }

    await checkAndAward(userId, stats, defs)
  } catch (err) {
    l.error('achievementService.onSpotBugs error:', err)
  }
}

export async function onCodingRuleCreated(userId: string): Promise<void> {
  if (!userId || !hasDbConfig()) return
  try {
    await ensureUserStats(userId)
    const stats = await getUserStats(userId)
    if (!stats) return
    await incrementUserStat(userId, 'total_coding_rules_created')
    stats.total_coding_rules_created += 1
    await addXp(userId, stats, 20)
    stats.xp += 20
    const defs = await getAllAchievementDefs()
    await checkAndAward(userId, stats, defs)
  } catch (err) {
    l.error('achievementService.onCodingRuleCreated error:', err)
  }
}

/** Chuẩn hóa YYYY-MM-DD từ created_at (MySQL DATETIME / string / Date). */
function datePartFromDb(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
    return m ? m[1]! : null
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    const mo = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${mo}-${d}`
  }
  return null
}

/** Chạy mỗi ngày để kiểm tra negative badges (no review, no report) */
export async function checkDailyNegativeBadges(userIds: string[]): Promise<void> {
  if (!hasDbConfig()) return
  if (userIds.length === 0) return
  const defs = await getAllAchievementDefs()
  const today = todayStr()
  for (const userId of userIds) {
    try {
      const stats = await getUserStats(userId)
      if (!stats) continue

      const reviewBaseline = stats.last_review_date
        ? stats.last_review_date
        : datePartFromDb(stats.created_at) ?? null
      const reviewDays = reviewBaseline ? diffDays(reviewBaseline, today) : 0

      const reportBaseline = stats.last_report_date
        ? stats.last_report_date
        : datePartFromDb(stats.created_at) ?? null
      const reportDays = reportBaseline ? diffDays(reportBaseline, today) : 0

      await updateUserStats(userId, {
        consecutive_no_review_days: reviewDays,
        consecutive_no_report_days: reportDays,
      })
      stats.consecutive_no_review_days = reviewDays
      stats.consecutive_no_report_days = reportDays

      await checkNegativeAchievement(userId, stats, defs)

      await updateUserStats(userId, { last_negative_check_date: today })
    } catch (err) {
      l.warn('achievementService.checkDailyNegativeBadges user failed', userId, err)
    }
  }
}
