import { Notification } from 'electron'
import l from 'electron-log'
import configurationStore from '../store/ConfigurationStore'
import { getTokenFromStore, verifyToken } from '../task/auth'
import { getDailyReportByUserAndDate } from '../task/mysqlDailyReport'
import { getProjectMembers, getProjectsWithReminderAtTime } from '../task/mysqlTaskStore'

/** Một user chỉ một toast mỗi lần khớp giờ nhắc (tránh N dự án cùng giờ → N thông báo giống nhau). */
const lastSentKey = (userId: string, date: string, timeSlotHhMm: string) =>
  `${userId}_${date}_${timeSlotHhMm}`

const SENT_CACHE_TTL_MS = 2 * 60 * 1000

const sentCache = new Map<string, number>()

let schedulerStarted = false
let tickRunning = false

function wasRecentlySent(userId: string, date: string, timeSlotHhMm: string): boolean {
  const key = lastSentKey(userId, date, timeSlotHhMm)
  const ts = sentCache.get(key)
  if (!ts) return false
  if (Date.now() - ts > SENT_CACHE_TTL_MS) {
    sentCache.delete(key)
    return false
  }
  return true
}

function markSent(userId: string, date: string, timeSlotHhMm: string): void {
  sentCache.set(lastSentKey(userId, date, timeSlotHhMm), Date.now())
  if (sentCache.size > 500) {
    const now = Date.now()
    for (const [k, v] of sentCache.entries()) {
      if (now - v > SENT_CACHE_TTL_MS) sentCache.delete(k)
    }
  }
}

function uniqueProjectMembers<T extends { userId: string }>(members: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const m of members) {
    if (seen.has(m.userId)) continue
    seen.add(m.userId)
    out.push(m)
  }
  return out
}

function buildReminderBody(projectNames: string[]): string {
  const unique = [...new Set(projectNames.map(n => String(n || '').trim()).filter(Boolean))]
  const suffix = ' Vui lòng báo cáo trước khi kết thúc ngày.'
  if (unique.length === 0) return `Bạn chưa báo cáo hôm nay.${suffix}`
  if (unique.length === 1) return `Bạn chưa báo cáo hôm nay cho dự án "${unique[0]}".${suffix}`
  return `Bạn chưa báo cáo hôm nay cho các dự án: ${unique.map(n => `"${n}"`).join(', ')}.${suffix}`
}

export function startDailyReportReminderScheduler(): void {
  if (schedulerStarted) return
  schedulerStarted = true

  setInterval(() => {
    void (async () => {
      if (tickRunning) return
      tickRunning = true
      try {
        if (!configurationStore?.store) return
        const { showNotifications, dbHost, dbName } = configurationStore.store
        if (!showNotifications) return
        if (!dbHost?.trim() || !dbName?.trim()) return
        if (!Notification.isSupported()) return

        const token = getTokenFromStore()
        const session = token ? verifyToken(token) : null
        const selfUserId = session?.userId
        if (!selfUserId) return

        const now = new Date()
        const hh = String(now.getHours()).padStart(2, '0')
        const mm = String(now.getMinutes()).padStart(2, '0')
        const currentTimeHhMm = `${hh}:${mm}`
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

        const rawProjects = await getProjectsWithReminderAtTime(currentTimeHhMm)
        const seenProjectIds = new Set<string>()
        const projects = rawProjects.filter(p => {
          if (!p.id || seenProjectIds.has(p.id)) return false
          seenProjectIds.add(p.id)
          return true
        })
        if (projects.length === 0) return

        /** Chỉ user đang đăng nhập + là dev trong project (có giờ nhắc trùng phút) mới được gộp tên dự án. */
        let selfEntry: { name: string; projectNames: string[] } | undefined
        for (const proj of projects) {
          const { devs } = await getProjectMembers(proj.id)
          for (const d of uniqueProjectMembers(devs)) {
            if (d.userId !== selfUserId) continue
            if (!selfEntry) selfEntry = { name: d.name, projectNames: [] }
            selfEntry.projectNames.push(proj.name)
          }
        }

        if (!selfEntry) return

        const { name, projectNames } = selfEntry
        const reported = await getDailyReportByUserAndDate(selfUserId, today)
        if (reported) return
        if (wasRecentlySent(selfUserId, today, currentTimeHhMm)) return

        new Notification({
          title: 'Nhắc báo cáo Daily Report',
          body: buildReminderBody(projectNames),
        }).show()
        markSent(selfUserId, today, currentTimeHhMm)
        l.info(
          `dailyReportReminder: sent to ${name} (${selfUserId}) for projects: ${[...new Set(projectNames)].join(', ')}`
        )
      } catch (err) {
        l.warn('dailyReportReminder: check failed', err)
      } finally {
        tickRunning = false
      }
    })()
  }, 60_000)
}
