import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { log as gitLog } from '../git/log'
import { onDailyReport } from '../task/achievementService'
import { getTokenFromStore, verifyToken } from '../task/auth'
import { getUserEmailById } from '../task/mysqlTaskStore'
import {
  getDailyReportByUserAndDate,
  getDailyReportHistoryByUser,
  getReportStatistics,
  getReportStatisticsByDateRange,
  listDailyReportsForPl,
  listDailyReportsForPlByDateRange,
  saveDailyReport,
  type DailyReportInput,
  type SelectedCommit,
} from '../task/mysqlDailyReport'
import { log as svnLog } from '../svn/log'

function withAuthFromStore<T extends unknown[]>(
  handler: (event: Electron.IpcMainInvokeEvent, session: { userId: string; name: string; role: string }, ...args: T) => Promise<unknown>
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

function requirePlOrAdmin<T extends unknown[]>(
  handler: (event: Electron.IpcMainInvokeEvent, session: { userId: string; name: string; role: string }, ...args: T) => Promise<unknown>
) {
  return withAuthFromStore<T>(async (event, session, ...args: T) => {
    if (session.role !== 'pl' && session.role !== 'pm' && session.role !== 'admin') {
      return { status: 'error' as const, code: 'FORBIDDEN', message: 'PL, PM or Admin role required' }
    }
    return handler(event, session, ...args)
  })
}

export function registerDailyReportIpcHandlers() {
  l.info('Registering Daily Report IPC Handlers...')

  ipcMain.handle(
    IPC.DAILY_REPORT.SAVE,
    withAuthFromStore(async (_event, session, input: DailyReportInput) => {
      try {
        const hasProjects = (input.projectIds && input.projectIds.length > 0) || input.projectId
        if (!hasProjects) {
          return { status: 'error' as const, message: 'Chọn ít nhất một project' }
        }
        const now = new Date()
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const reportDate = String(input.reportDate || '').trim().slice(0, 10)
        if (reportDate < today) {
          const isPlOrAdmin = session.role === 'pl' || session.role === 'pm' || session.role === 'admin'
          if (!isPlOrAdmin) {
            return { status: 'error' as const, message: 'Chỉ PL/Admin mới được sửa báo cáo quá khứ' }
          }
        }
        await saveDailyReport(session.userId, input)
        onDailyReport(session.userId, String(input.reportDate || '').trim().slice(0, 10)).catch(() => {})
        return { status: 'success' as const }
      } catch (error: unknown) {
        l.error('daily-report:save error:', error)
        return { status: 'error' as const, message: error instanceof Error ? error.message : String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.DAILY_REPORT.GET_MINE,
    withAuthFromStore(async (_event, session, reportDate: string) => {
      try {
        const report = await getDailyReportByUserAndDate(session.userId, reportDate)
        return { status: 'success' as const, data: report }
      } catch (error: unknown) {
        l.error('daily-report:get-mine error:', error)
        return { status: 'error' as const, message: error instanceof Error ? error.message : String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.DAILY_REPORT.GET_COMMITS_TODAY,
    withAuthFromStore(async (_event, session, params: { sourceFolderPath: string; reportDate: string; vcsType: 'git' | 'svn'; author?: string }) => {
      try {
        const { sourceFolderPath, reportDate, vcsType } = params
        const [y, m, d] = reportDate.split('-').map(Number)
        const startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0)
        const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999)
        const dateFrom = startOfDay.toISOString()
        const dateTo = endOfDay.toISOString()

        const userEmail = await getUserEmailById(session.userId)
        const gitAuthorFilter = userEmail || session.name
        const svnAuthorPrefix = userEmail?.includes('@') ? userEmail.split('@')[0] : (session.name || '')

        if (vcsType === 'git') {
          const result = await gitLog('.', {
            dateFrom,
            dateTo,
            cwd: sourceFolderPath,
            author: gitAuthorFilter || undefined,
            maxCount: 100,
          })
          if (result.status !== 'success' || !result.data) {
            return { status: result.status as 'success' | 'error', data: [], message: result.message }
          }
          const entries = JSON.parse(result.data as string) as Array<{
            hash: string
            author: string
            date: string
            subject: string
            body: string
            files?: Array<{ file: string; status: string }>
          }>
          const commits: SelectedCommit[] = entries.map(e => ({
            revision: e.hash,
            message: e.body ? `${e.subject}\n\n${e.body}`.trim() : e.subject,
            author: e.author,
            date: e.date,
            files: e.files?.map(f => ({ filePath: f.file, status: f.status })),
          }))
          return { status: 'success' as const, data: commits }
        }

        const result = await svnLog('.', {
          dateFrom,
          dateTo,
          cwd: sourceFolderPath,
        })
        if (result.status !== 'success' || !result.data) {
          return { status: result.status as 'success' | 'error', data: [], message: result.message }
        }
        const rawLog = result.data as string
        const entries = rawLog
          .split('------------------------------------------------------------------------')
          .map(entry => entry.trim())
          .filter(entry => entry)
        const commits: SelectedCommit[] = []
        for (const block of entries) {
          const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
          const headerMatch = lines[0]?.match(/^r(\d+)\s+\|\s+(.+?)\s+\|\s+(.+?)\s+\|/)
          if (!headerMatch) continue
          const [, revision, author, dateStr] = headerMatch
          if (svnAuthorPrefix && author?.toLowerCase() !== svnAuthorPrefix.toLowerCase()) continue
          let i = 1
          if (lines[i] === 'Changed paths:') i++
          const files: { filePath: string; status: string }[] = []
          while (i < lines.length) {
            const m = lines[i]?.trim().match(/^([A-Z?!~])\s+(.+)$/)
            if (!m) break
            files.push({ filePath: m[2].trim(), status: m[1] })
            i++
          }
          const message = lines.slice(i).join('\n').trim()
          commits.push({ revision: `r${revision}`, message, author, date: dateStr, files })
        }
        return { status: 'success' as const, data: commits }
      } catch (error: unknown) {
        l.error('daily-report:get-commits-today error:', error)
        return { status: 'error' as const, data: [], message: error instanceof Error ? error.message : String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.DAILY_REPORT.GET_COMMITS_TODAY_MULTIPLE,
    withAuthFromStore(
      async (
        _event,
        session,
        params: {
          folders: { path: string; vcsType: 'git' | 'svn' }[]
          reportDate: string
          author?: string
        }
      ) => {
        try {
          const { folders, reportDate } = params
          const userEmail = await getUserEmailById(session.userId)
          const gitAuthorFilter = userEmail || session.name
          const svnAuthorPrefix = userEmail?.includes('@') ? userEmail.split('@')[0] : (session.name || '')
          if (!folders?.length || folders.length > 10) {
            return { status: 'error' as const, data: [], message: 'folders required, max 10' }
          }
          const parts = reportDate.split('-').map(Number)
          if (parts.length < 3 || parts.some(Number.isNaN)) {
            return { status: 'error' as const, data: [], message: 'Invalid reportDate format' }
          }
          const [y, m, d] = parts
          const startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0)
          const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999)
          const dateFrom = startOfDay.toISOString()
          const dateTo = endOfDay.toISOString()
          const results = await Promise.all(
            folders.map(async f => {
              if (f.vcsType === 'git') {
                const result = await gitLog('.', {
                  dateFrom,
                  dateTo,
                  cwd: f.path,
                  author: gitAuthorFilter || undefined,
                  maxCount: 200,
                  allBranches: true,
                })
                if (result.status !== 'success' || !result.data) return []
                const entries = JSON.parse(result.data as string) as Array<{
                  hash: string
                  author: string
                  date: string
                  subject: string
                  body: string
                  branch?: string
                  files?: Array<{ file: string; status: string }>
                }>
                return entries.map(e => ({
                  revision: e.hash,
                  message: e.body ? `${e.subject}\n\n${e.body}`.trim() : e.subject,
                  author: e.author,
                  date: e.date,
                  files: e.files?.map(fx => ({ filePath: fx.file, status: fx.status })),
                  sourceFolderPath: f.path,
                  branch: e.branch,
                })) as SelectedCommit[]
              }
              const result = await svnLog('.', { dateFrom, dateTo, cwd: f.path })
              if (result.status !== 'success' || !result.data) return []
              const rawLog = result.data as string
              const entries = rawLog
                .split('------------------------------------------------------------------------')
                .map(entry => entry.trim())
                .filter(entry => entry)
              const commits: SelectedCommit[] = []
              for (const block of entries) {
                const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
                const headerMatch = lines[0]?.match(/^r(\d+)\s+\|\s+(.+?)\s+\|\s+(.+?)\s+\|/)
                if (!headerMatch) continue
                const [, revision, auth, dateStr] = headerMatch
                if (svnAuthorPrefix && auth?.toLowerCase() !== svnAuthorPrefix.toLowerCase()) continue
                let i = 1
                if (lines[i] === 'Changed paths:') i++
                const files: { filePath: string; status: string }[] = []
                while (i < lines.length) {
                  const m = lines[i]?.trim().match(/^([A-Z?!~])\s+(.+)$/)
                  if (!m) break
                  files.push({ filePath: m[2].trim(), status: m[1] })
                  i++
                }
                const message = lines.slice(i).join('\n').trim()
                commits.push({
                  revision: `r${revision}`,
                  message,
                  author: auth,
                  date: dateStr,
                  files,
                  sourceFolderPath: f.path,
                })
              }
              return commits
            })
          )
          const seen = new Set<string>()
          const merged: SelectedCommit[] = []
          for (const arr of results) {
            for (const c of arr) {
              const key = `${c.sourceFolderPath ?? ''}:${c.revision}`
              if (!seen.has(key)) {
                seen.add(key)
                merged.push(c)
              }
            }
          }
          merged.sort((a, b) => (a.date > b.date ? -1 : 1))
          return { status: 'success' as const, data: merged }
        } catch (error: unknown) {
          l.error('daily-report:get-commits-today-multiple error:', error)
          return { status: 'error' as const, data: [], message: error instanceof Error ? error.message : String(error) }
        }
      }
    )
  )

  ipcMain.handle(
    IPC.DAILY_REPORT.LIST_FOR_PL,
    requirePlOrAdmin(async (_event, _session, reportDate: string, projectId?: string | null) => {
      try {
        const list = await listDailyReportsForPl(reportDate, projectId ?? undefined)
        return { status: 'success' as const, data: list }
      } catch (error: unknown) {
        l.error('daily-report:list-for-pl error:', error)
        return { status: 'error' as const, message: error instanceof Error ? error.message : String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.DAILY_REPORT.LIST_FOR_PL_BY_DATE_RANGE,
    requirePlOrAdmin(async (_event, _session, dateFrom: string, dateTo: string, projectId?: string | null) => {
      try {
        const list = await listDailyReportsForPlByDateRange(dateFrom, dateTo, projectId ?? undefined)
        return { status: 'success' as const, data: list }
      } catch (error: unknown) {
        l.error('daily-report:list-for-pl-by-date-range error:', error)
        return { status: 'error' as const, message: error instanceof Error ? error.message : String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.DAILY_REPORT.GET_MY_HISTORY,
    withAuthFromStore(
      async (
        _event,
        session,
        params: { dateFrom: string; dateTo: string; limit?: number; offset?: number; targetUserId?: string }
      ) => {
        try {
          const { dateFrom, dateTo, limit, offset, targetUserId } = params
          const isPlOrAdmin = session.role === 'pl' || session.role === 'pm' || session.role === 'admin'
          const userId =
            targetUserId && targetUserId !== session.userId && isPlOrAdmin
              ? targetUserId
              : session.userId
          const list = await getDailyReportHistoryByUser(userId, dateFrom, dateTo, limit, offset)
          return { status: 'success' as const, data: list }
        } catch (error: unknown) {
          l.error('daily-report:get-my-history error:', error)
          return { status: 'error' as const, message: error instanceof Error ? error.message : String(error) }
        }
      }
    )
  )

  ipcMain.handle(
    IPC.DAILY_REPORT.GET_STATISTICS,
    requirePlOrAdmin(async (_event, _session, reportDate: string, projectId: string) => {
      try {
        const stats = await getReportStatistics(reportDate, projectId)
        return { status: 'success' as const, data: stats }
      } catch (error: unknown) {
        l.error('daily-report:get-statistics error:', error)
        return { status: 'error' as const, message: error instanceof Error ? error.message : String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.DAILY_REPORT.GET_STATISTICS_BY_DATE_RANGE,
    requirePlOrAdmin(async (_event, _session, dateFrom: string, dateTo: string, projectId: string) => {
      try {
        const stats = await getReportStatisticsByDateRange(dateFrom, dateTo, projectId)
        return { status: 'success' as const, data: stats }
      } catch (error: unknown) {
        l.error('daily-report:get-statistics-by-date-range error:', error)
        return { status: 'error' as const, message: error instanceof Error ? error.message : String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.DAILY_REPORT.GET_DETAIL,
    requirePlOrAdmin(async (_event, _session, userId: string, reportDate: string) => {
      try {
        const report = await getDailyReportByUserAndDate(userId, reportDate)
        return { status: 'success' as const, data: report }
      } catch (error: unknown) {
        l.error('daily-report:get-detail error:', error)
        return { status: 'error' as const, message: error instanceof Error ? error.message : String(error) }
      }
    })
  )

  l.info('Daily Report IPC Handlers Registered')
}
