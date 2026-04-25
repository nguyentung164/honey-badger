import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { sendTaskNotification } from '../notification/taskNotification'
import { getTokenFromStore, verifyToken } from '../task/auth'
import { hasDbConfig } from '../task/db'
import {
  getAllAchievementDefs,
  getAchievementRarities,
  getLeaderboard,
  getLeaderboardByProject,
  getUserAchievements,
  getUserBadgeDisplay,
  getUserStats,
  setUserBadgeDisplay,
} from '../task/achievementStore'
import { RANKS } from '../task/achievementService'
import { ACHIEVEMENT_DEFINITIONS } from '../task/achievementSeed'

function withAuth<T extends unknown[]>(
  handler: (event: Electron.IpcMainInvokeEvent, session: { userId: string; name: string; role: string }, ...args: T) => Promise<unknown>
) {
  return async (event: Electron.IpcMainInvokeEvent, ...args: T) => {
    const token = getTokenFromStore()
    const session = token ? verifyToken(token) : null
    if (!session) return { status: 'error' as const, code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    return handler(event, session, ...args)
  }
}

export function registerAchievementIpcHandlers() {
  l.info('Registering Achievement IPC Handlers...')

  ipcMain.handle(
    IPC.ACHIEVEMENT.GET_STATS,
    withAuth(async (_event, session) => {
      try {
        const data = await getUserStats(session.userId)
        return { status: 'success' as const, data }
      } catch (err: any) {
        l.error('achievement:get-stats error:', err)
        return { status: 'error' as const, message: err?.message ?? String(err) }
      }
    })
  )

  ipcMain.handle(
    IPC.ACHIEVEMENT.GET_BADGES,
    withAuth(async (_event, session) => {
      try {
        const [badges, pinned] = await Promise.all([
          getUserAchievements(session.userId),
          getUserBadgeDisplay(session.userId),
        ])
        return { status: 'success' as const, data: { badges, pinned } }
      } catch (err: any) {
        l.error('achievement:get-badges error:', err)
        return { status: 'error' as const, message: err?.message ?? String(err) }
      }
    })
  )

  ipcMain.handle(IPC.ACHIEVEMENT.GET_ALL_DEFINITIONS, async () => {
    try {
      const data = await getAllAchievementDefs()
      // Fallback to static definitions khi DB chưa config hoặc chưa seed
      const list = Array.isArray(data) && data.length > 0 ? data : ACHIEVEMENT_DEFINITIONS
      return { status: 'success' as const, data: list }
    } catch (err: any) {
      l.error('achievement:get-all-definitions error:', err)
      return { status: 'success' as const, data: ACHIEVEMENT_DEFINITIONS }
    }
  })

  ipcMain.handle(
    IPC.ACHIEVEMENT.PIN_BADGE,
    withAuth(async (_event, session, codes: string[]) => {
      try {
        const raw = Array.isArray(codes) ? codes : []
        const [earnedRows, defsFromDb] = await Promise.all([
          getUserAchievements(session.userId),
          getAllAchievementDefs(),
        ])
        const defs = Array.isArray(defsFromDb) && defsFromDb.length > 0 ? defsFromDb : ACHIEVEMENT_DEFINITIONS
        const earnedSet = new Set(earnedRows.map(r => r.achievement_code))
        const defSet = new Set(defs.map(d => d.code))
        const valid = raw.filter(c => typeof c === 'string' && c && earnedSet.has(c) && defSet.has(c)).slice(0, 3)
        await setUserBadgeDisplay(session.userId, valid)
        return { status: 'success' as const }
      } catch (err: any) {
        l.error('achievement:pin-badge error:', err)
        return { status: 'error' as const, message: err?.message ?? String(err) }
      }
    })
  )

  ipcMain.handle(IPC.ACHIEVEMENT.GET_LEADERBOARD, async () => {
    try {
      if (!hasDbConfig()) {
        l.warn('achievement:get-leaderboard skipped - DB not configured')
        return { status: 'success' as const, data: [] }
      }
      const data = await getLeaderboard(20)
      l.info('achievement:get-leaderboard result count=', data?.length ?? 0)
      return { status: 'success' as const, data }
    } catch (err: any) {
      l.error('achievement:get-leaderboard error:', err)
      return { status: 'error' as const, message: err?.message ?? String(err) }
    }
  })

  ipcMain.handle(IPC.ACHIEVEMENT.GET_LEADERBOARD_BY_PROJECT, async (_event, projectId: string | null) => {
    try {
      if (!hasDbConfig()) {
        l.warn('achievement:get-leaderboard-by-project skipped - DB not configured')
        return { status: 'success' as const, data: [] }
      }
      const data = await getLeaderboardByProject(projectId ?? null, 50)
      return { status: 'success' as const, data }
    } catch (err: any) {
      l.error('achievement:get-leaderboard-by-project error:', err)
      return { status: 'error' as const, message: err?.message ?? String(err) }
    }
  })

  ipcMain.handle(IPC.ACHIEVEMENT.GET_ACHIEVEMENT_RARITIES, async () => {
    try {
      if (!hasDbConfig()) return { status: 'success' as const, data: { totalUsers: 0, rarities: {} } }
      const data = await getAchievementRarities()
      return { status: 'success' as const, data }
    } catch (err: any) {
      l.error('achievement:get-achievement-rarities error:', err)
      return { status: 'error' as const, message: err?.message ?? String(err) }
    }
  })

  ipcMain.handle(
    IPC.ACHIEVEMENT.PREVIEW_TOAST,
    withAuth(async (_event, session, achievementCode?: string) => {
      try {
        const fromDb = await getAllAchievementDefs()
        const defs = Array.isArray(fromDb) && fromDb.length > 0 ? fromDb : ACHIEVEMENT_DEFINITIONS
        const code = achievementCode ?? 'first_login'
        const def = defs.find(d => d.code === code) ?? defs.find(d => d.code === 'first_login') ?? defs[0]
        if (!def) {
          return { status: 'error' as const, message: 'No achievement definitions' }
        }
        const tierLabel = def.tier === 'negative' ? 'Struggle' : def.tier.charAt(0).toUpperCase() + def.tier.slice(1)
        const title = `Achievement Unlocked: ${def.name}`
        const body = JSON.stringify({ code: def.code, tier: tierLabel, xpReward: def.xp_reward, earnedCount: 1 })
        sendTaskNotification(session.userId, title, body, 'achievement_unlocked', { force: true })
        return { status: 'success' as const }
      } catch (err: any) {
        l.error('achievement:preview-toast error:', err)
        return { status: 'error' as const, message: err?.message ?? String(err) }
      }
    })
  )

  ipcMain.handle(
    IPC.ACHIEVEMENT.PREVIEW_RANK_UP,
    withAuth(async (_event, session, rankCode?: string) => {
      try {
        const rank = RANKS.find(r => r.code === rankCode) ?? RANKS[RANKS.length - 1]
        const title = `Rank Up! Bạn đã đạt rank ${rank.name}`
        const body = JSON.stringify({ newRank: rank.code })
        sendTaskNotification(session.userId, title, body, 'rank_up', { force: true })
        return { status: 'success' as const }
      } catch (err: any) {
        l.error('achievement:preview-rank-up error:', err)
        return { status: 'error' as const, message: err?.message ?? String(err) }
      }
    })
  )

  ipcMain.handle(
    IPC.ACHIEVEMENT.GET_STATS_FOR_USER,
    withAuth(async (_event, session, userId: string) => {
      if (session.role !== 'admin') {
        return { status: 'error' as const, code: 'FORBIDDEN', message: 'Chỉ admin mới được xem profile user khác' }
      }
      try {
        const data = await getUserStats(userId)
        return { status: 'success' as const, data }
      } catch (err: any) {
        l.error('achievement:get-stats-for-user error:', err)
        return { status: 'error' as const, message: err?.message ?? String(err) }
      }
    })
  )

  ipcMain.handle(
    IPC.ACHIEVEMENT.GET_BADGES_FOR_USER,
    withAuth(async (_event, session, userId: string) => {
      if (session.role !== 'admin') {
        return { status: 'error' as const, code: 'FORBIDDEN', message: 'Chỉ admin mới được xem profile user khác' }
      }
      try {
        const [badges, pinned] = await Promise.all([
          getUserAchievements(userId),
          getUserBadgeDisplay(userId),
        ])
        return { status: 'success' as const, data: { badges, pinned } }
      } catch (err: any) {
        l.error('achievement:get-badges-for-user error:', err)
        return { status: 'error' as const, message: err?.message ?? String(err) }
      }
    })
  )

  l.info('Achievement IPC Handlers Registered')
}
