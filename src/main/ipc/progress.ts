import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { getTokenFromStore, verifyToken, type SessionData } from '../task/auth'
import { canSessionViewTargetUser, filterUserIdsVisibleToSession } from '../task/progressAccess'
import { getProjectsForTaskManagement, getTaskListVisibleProjectIds } from '../task/mysqlTaskStore'
import {
  getAllUsers,
  getHeatmapData,
  getMonthlyHighlights,
  getProductiveHours,
  getQualityTrend,
  getRadarData,
  getRadarDataForDateRange,
  getProjectMemberUserIds,
  getTeamOverviewUserProjectLabels,
  getTaskPerformance,
  getTeamProgressSummaries,
  getTrendData,
  getUserBasicInfo,
  getUsersInManagedProjects,
} from '../task/progressStore'

function progressForbidden() {
  return { status: 'error' as const, code: 'FORBIDDEN' as const, message: 'Forbidden' }
}

async function assertCanViewProgressUser(session: SessionData, targetUserId: string) {
  const ok = await canSessionViewTargetUser(session, targetUserId)
  if (!ok) return progressForbidden()
  return null
}

const MAX_PROGRESS_RANGE_DAYS = 366
const HEATMAP_YEAR_MIN = 2000

function validateHeatmapYear(year: unknown): { ok: true; year: number } | { ok: false; message: string } {
  const n = Number(year)
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, message: 'Invalid year' }
  }
  const y = n
  const current = new Date().getUTCFullYear()
  if (y < HEATMAP_YEAR_MIN || y > current + 1) {
    return { ok: false, message: 'Invalid year' }
  }
  return { ok: true, year: y }
}

function validateProgressDateRange(from: string, to: string): { ok: true } | { ok: false; message: string } {
  if (!from || !to || typeof from !== 'string' || typeof to !== 'string' || from > to) {
    return { ok: false, message: 'Invalid date range' }
  }
  const a = new Date(`${from}T12:00:00Z`).getTime()
  const b = new Date(`${to}T12:00:00Z`).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return { ok: false, message: 'Invalid date range' }
  const days = Math.ceil((b - a) / 86400000) + 1
  if (days > MAX_PROGRESS_RANGE_DAYS) return { ok: false, message: `Date range must be at most ${MAX_PROGRESS_RANGE_DAYS} days` }
  return { ok: true }
}

async function assertCanViewProject(session: SessionData, projectId: string) {
  if (!projectId || typeof projectId !== 'string') return progressForbidden()
  const visible = await getTaskListVisibleProjectIds(session.userId, session.role)
  if (visible !== null && !visible.includes(projectId)) return progressForbidden()
  return null
}

function withAuthFromStore<T extends unknown[]>(
  handler: (event: Electron.IpcMainInvokeEvent, session: SessionData, ...args: T) => Promise<unknown>
) {
  return async (event: Electron.IpcMainInvokeEvent, ...args: T) => {
    const token = getTokenFromStore()
    const session = token ? verifyToken(token) : null
    if (!session) {
      return { status: 'error' as const, code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    }
    return handler(event, session, ...args)
  }
}

export function registerProgressIpcHandlers(): void {
  ipcMain.handle(
    IPC.PROGRESS.GET_ALL_USERS,
    withAuthFromStore(async (_event, session) => {
      try {
        if (session.role === 'admin') {
          const data = await getAllUsers()
          return { status: 'success' as const, data }
        }
        if (session.role === 'pm' || session.role === 'pl') {
          const data = await getUsersInManagedProjects(session.userId)
          return { status: 'success' as const, data }
        }
        const currentUser = await getUserBasicInfo(session.userId)
        const data = currentUser ? [currentUser] : []
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('progress:get-all-users error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.PROGRESS.GET_HEATMAP,
    withAuthFromStore(async (_event, session, userId: string, year: number) => {
      const denied = await assertCanViewProgressUser(session, userId)
      if (denied) return denied
      const vy = validateHeatmapYear(year)
      if (!vy.ok) return { status: 'error' as const, message: vy.message }
      try {
        const data = await getHeatmapData(userId, vy.year)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('progress:get-heatmap error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    }),
  )

  ipcMain.handle(
    IPC.PROGRESS.GET_TREND,
    withAuthFromStore(
      async (_event, session, userId: string, from: string, to: string, granularity: 'day' | 'week' | 'month') => {
        const denied = await assertCanViewProgressUser(session, userId)
        if (denied) return denied
        const vr = validateProgressDateRange(from, to)
        if (!vr.ok) return { status: 'error' as const, message: vr.message }
        try {
          const data = await getTrendData(userId, from, to, granularity)
          return { status: 'success' as const, data }
        } catch (error: any) {
          l.error('progress:get-trend error:', error)
          return { status: 'error' as const, message: error?.message ?? String(error) }
        }
      },
    ),
  )

  ipcMain.handle(
    IPC.PROGRESS.GET_RADAR,
    withAuthFromStore(async (_event, session, userId: string, yearMonth: string) => {
      const denied = await assertCanViewProgressUser(session, userId)
      if (denied) return denied
      try {
        const data = await getRadarData(userId, yearMonth)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('progress:get-radar error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    }),
  )

  ipcMain.handle(
    IPC.PROGRESS.GET_TASK_PERFORMANCE,
    withAuthFromStore(async (_event, session, userId: string, from: string, to: string, projectId?: string | null) => {
      const denied = await assertCanViewProgressUser(session, userId)
      if (denied) return denied
      const vr = validateProgressDateRange(from, to)
      if (!vr.ok) return { status: 'error' as const, message: vr.message }
      try {
        const data = await getTaskPerformance(userId, from, to, projectId ?? undefined)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('progress:get-task-performance error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    }),
  )

  ipcMain.handle(
    IPC.PROGRESS.GET_QUALITY_TREND,
    withAuthFromStore(
      async (
        _event,
        session,
        userId: string,
        weeksBack: number,
        teamUserIds?: string[] | null,
        from?: string | null,
        to?: string | null,
      ) => {
        const denied = await assertCanViewProgressUser(session, userId)
        if (denied) return denied
        if (from && to) {
          const vr = validateProgressDateRange(from, to)
          if (!vr.ok) return { status: 'error' as const, message: vr.message }
        }
        let safeTeamIds: string[] | undefined
        if (teamUserIds != null && teamUserIds.length > 0) {
          const filtered = await filterUserIdsVisibleToSession(session, teamUserIds)
          safeTeamIds = filtered.length > 0 ? filtered : [userId]
        }
        try {
          const data = await getQualityTrend(userId, weeksBack, safeTeamIds, from ?? undefined, to ?? undefined)
          return { status: 'success' as const, data }
        } catch (error: any) {
          l.error('progress:get-quality-trend error:', error)
          return { status: 'error' as const, message: error?.message ?? String(error) }
        }
      },
    ),
  )

  ipcMain.handle(
    IPC.PROGRESS.GET_PRODUCTIVE_HOURS,
    withAuthFromStore(async (_event, session, userId: string, weeksBack: number, from?: string | null, to?: string | null) => {
      const denied = await assertCanViewProgressUser(session, userId)
      if (denied) return denied
      if (from && to) {
        const vr = validateProgressDateRange(from, to)
        if (!vr.ok) return { status: 'error' as const, message: vr.message }
      }
      try {
        const data = await getProductiveHours(userId, weeksBack, from ?? undefined, to ?? undefined)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('progress:get-productive-hours error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    }),
  )

  ipcMain.handle(
    IPC.PROGRESS.GET_MONTHLY_HIGHLIGHTS,
    withAuthFromStore(async (_event, session, userId: string, yearMonth: string) => {
      const denied = await assertCanViewProgressUser(session, userId)
      if (denied) return denied
      try {
        const data = await getMonthlyHighlights(userId, yearMonth)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('progress:get-monthly-highlights error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    }),
  )

  ipcMain.handle(
    IPC.PROGRESS.GET_RADAR_RANGE,
    withAuthFromStore(async (_event, session, userId: string, from: string, to: string) => {
      const denied = await assertCanViewProgressUser(session, userId)
      if (denied) return denied
      const vr = validateProgressDateRange(from, to)
      if (!vr.ok) return { status: 'error' as const, message: vr.message }
      try {
        const data = await getRadarDataForDateRange(userId, from, to)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('progress:get-radar-range error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    }),
  )

  ipcMain.handle(
    IPC.PROGRESS.GET_OVERVIEW_PROJECTS,
    withAuthFromStore(async (_event, session) => {
      try {
        const data = await getProjectsForTaskManagement(session.userId, session.role)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('progress:get-overview-projects error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    }),
  )

  ipcMain.handle(
    IPC.PROGRESS.GET_PROJECT_MEMBER_IDS,
    withAuthFromStore(async (_event, session, projectId: string) => {
      const denied = await assertCanViewProject(session, projectId)
      if (denied) return denied
      try {
        const data = await getProjectMemberUserIds(projectId)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('progress:get-project-member-ids error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    }),
  )

  ipcMain.handle(
    IPC.PROGRESS.GET_TEAM_OVERVIEW_USER_PROJECTS,
    withAuthFromStore(async (_event, session, userIds: unknown) => {
      try {
        if (!Array.isArray(userIds)) {
          return { status: 'error' as const, message: 'Invalid userIds' }
        }
        const raw = userIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
        if (raw.length === 0) {
          return { status: 'success' as const, data: {} as Record<string, string> }
        }
        const cleanIds = await filterUserIdsVisibleToSession(session, raw)
        if (cleanIds.length === 0) {
          return { status: 'success' as const, data: {} as Record<string, string> }
        }
        const data = await getTeamOverviewUserProjectLabels(cleanIds)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('progress:get-team-overview-user-projects error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    }),
  )

  ipcMain.handle(
    IPC.PROGRESS.GET_TEAM_SUMMARY,
    withAuthFromStore(
      async (
        _event,
        session,
        payload: { userIds: string[]; from: string; to: string; projectId?: string | null },
      ) => {
        try {
          const { userIds, from, to, projectId } = payload ?? ({} as typeof payload)
          if (!Array.isArray(userIds) || userIds.length === 0) {
            return { status: 'success' as const, data: [] as Awaited<ReturnType<typeof getTeamProgressSummaries>> }
          }
          const cleanIds = await filterUserIdsVisibleToSession(session, userIds)
          if (cleanIds.length === 0) {
            return { status: 'success' as const, data: [] as Awaited<ReturnType<typeof getTeamProgressSummaries>> }
          }
          const vr = validateProgressDateRange(from, to)
          if (!vr.ok) return { status: 'error' as const, message: vr.message }
          if (projectId) {
            const deniedProj = await assertCanViewProject(session, projectId)
            if (deniedProj) return deniedProj
          }
          const data = await getTeamProgressSummaries(cleanIds, from, to, projectId ?? null)
          return { status: 'success' as const, data }
        } catch (error: any) {
          l.error('progress:get-team-summary error:', error)
          return { status: 'error' as const, message: error?.message ?? String(error) }
        }
      },
    ),
  )

  l.info('Progress IPC Handlers Registered')
}
