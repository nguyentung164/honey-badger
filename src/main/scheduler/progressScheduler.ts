import l from 'electron-log'
import { hasDbConfig } from '../task/db'
import {
  getAllUsersWithEmail,
  getGitCommitQueueForUserAndDate,
  getSnapshotDatesForUser,
  getTasksDoneForUserAndDate,
  getTasksOverdueForDate,
  getReviewsDoneForUserAndDate,
  hasDailyReportForDate,
  getEvmHoursForUserAndDate,
  upsertDailySnapshot,
} from '../task/progressStore'

/** Chờ sau khi mở app rồi mới backfill — tránh tranh tài nguyên lúc khởi động. Có thể set HONEY_BADGER_PROGRESS_BACKFILL_DELAY_MS (ms). */
const BACKFILL_START_DELAY_MS = Number(process.env.HONEY_BADGER_PROGRESS_BACKFILL_DELAY_MS) || 45_000
/** Sau mỗi N ngày snapshot thì nghỉ ngắn để UI/IPC không bị nghẽn. */
const BACKFILL_PAUSE_EVERY_DATES = 12
const BACKFILL_PAUSE_MS = 400

async function yieldEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

function msUntilNext0005(): number {
  const now = new Date()
  const target = new Date(now)
  target.setHours(0, 5, 0, 0)
  if (target <= now) target.setDate(target.getDate() + 1)
  return target.getTime() - now.getTime()
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function subtractDays(from: Date, days: number): Date {
  const d = new Date(from)
  d.setDate(d.getDate() - days)
  return d
}

async function buildDailySnapshot(
  userId: string,
  userEmail: string,
  userName: string,
  userCode: string,
  date: string,
): Promise<void> {
  const [commitRows, taskRows, overdueCount, reviewsCount, hasReport, evmHours] = await Promise.all([
    getGitCommitQueueForUserAndDate(userEmail || null, userName || null, userCode || null, date),
    getTasksDoneForUserAndDate(userId, date),
    getTasksOverdueForDate(userId, date),
    getReviewsDoneForUserAndDate(userId, date),
    hasDailyReportForDate(userId, date),
    getEvmHoursForUserAndDate(userId, date),
  ])

  let commits_count = 0
  let lines_inserted = 0
  let lines_deleted = 0
  let files_changed = 0
  let commits_with_rule_check = 0
  let commits_with_spotbugs = 0
  const commits_total_in_queue = commitRows.length

  for (const c of commitRows) {
    commits_count++
    lines_inserted += Number(c.insertions ?? 0)
    lines_deleted += Number(c.deletions ?? 0)
    const added = Array.isArray(c.added_files) ? c.added_files.length : 0
    const modified = Array.isArray(c.modified_files) ? c.modified_files.length : 0
    const deleted = Array.isArray(c.deleted_files) ? c.deleted_files.length : 0
    files_changed += added + modified + deleted
    if (c.has_check_coding_rule) commits_with_rule_check++
    if (c.has_check_spotbugs) commits_with_spotbugs++
  }

  let tasks_done = 0
  let tasks_done_on_time = 0
  for (const t of taskRows) {
    tasks_done++
    if (t.plan_end_date && t.actual_end_date <= t.plan_end_date) tasks_done_on_time++
  }

  await upsertDailySnapshot({
    userId,
    date,
    commits_count,
    lines_inserted,
    lines_deleted,
    files_changed,
    commits_with_rule_check,
    commits_with_spotbugs,
    commits_total_in_queue,
    tasks_done,
    tasks_done_on_time,
    tasks_overdue_opened: overdueCount,
    reviews_done: reviewsCount,
    has_daily_report: hasReport ? 1 : 0,
    evm_hours_logged: evmHours,
  })
}

async function buildYesterdaySnapshots(): Promise<void> {
  if (!hasDbConfig()) return
  const yesterday = formatDate(subtractDays(new Date(), 1))
  const users = await getAllUsersWithEmail()
  await Promise.allSettled(
    users.map((u) =>
      buildDailySnapshot(u.id, u.email ?? '', u.name ?? '', u.user_code ?? '', yesterday).catch((err) =>
        l.warn(`progressScheduler: failed to build snapshot for user ${u.id} on ${yesterday}`, err),
      ),
    ),
  )
  l.info(`progressScheduler: built snapshots for ${users.length} users on ${yesterday}`)
}

async function backfillAllUsers(daysBack: number = 365): Promise<void> {
  if (!hasDbConfig()) return
  const users = await getAllUsersWithEmail()
  const today = new Date()
  l.info(`progressScheduler: starting backfill for ${users.length} users, ${daysBack} days back`)

  for (const user of users) {
    try {
      const existingDates = new Set(await getSnapshotDatesForUser(user.id))
      const datesToFill: string[] = []
      for (let i = 1; i <= daysBack; i++) {
        const d = formatDate(subtractDays(today, i))
        if (!existingDates.has(d)) datesToFill.push(d)
      }
      if (datesToFill.length === 0) continue

      l.info(`progressScheduler: backfilling ${datesToFill.length} days for user ${user.name}`)
      for (let i = 0; i < datesToFill.length; i++) {
        const date = datesToFill[i]
        await buildDailySnapshot(user.id, user.email ?? '', user.name ?? '', user.user_code ?? '', date).catch((err) =>
          l.warn(`progressScheduler: backfill failed for user ${user.id} on ${date}`, err),
        )
        await yieldEventLoop()
        const isLast = i === datesToFill.length - 1
        if (!isLast && (i + 1) % BACKFILL_PAUSE_EVERY_DATES === 0) {
          await new Promise<void>((r) => setTimeout(r, BACKFILL_PAUSE_MS))
        }
      }
    } catch (err) {
      l.warn(`progressScheduler: backfill error for user ${user.id}`, err)
    }
  }
  l.info('progressScheduler: backfill complete')
}

function scheduleNextRun(): void {
  const delay = msUntilNext0005()
  setTimeout(async () => {
    await buildYesterdaySnapshots().catch((err) => l.warn('progressScheduler: daily run error', err))
    scheduleNextRun()
  }, delay)
}

export function startProgressScheduler(): void {
  setTimeout(() => backfillAllUsers(365).catch(() => {}), BACKFILL_START_DELAY_MS)
  scheduleNextRun()
}
