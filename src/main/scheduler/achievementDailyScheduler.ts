import l from 'electron-log'
import { hasDbConfig } from '../task/db'
import { getUserIdsNeedingNegativeCheck } from '../task/achievementStore'
import { checkDailyNegativeBadges } from '../task/achievementService'

function localTodayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function msUntilNextMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime() - now.getTime()
}

async function runDailyCheck(): Promise<void> {
  if (!hasDbConfig()) return
  const today = localTodayStr()
  try {
    const userIds = await getUserIdsNeedingNegativeCheck(today)
    if (userIds.length > 0) {
      await checkDailyNegativeBadges(userIds)
    }
  } catch (err) {
    l.warn('achievementDailyScheduler: daily check failed', err)
  }
}

function scheduleNextRun(): void {
  const delay = msUntilNextMidnight()
  setTimeout(async () => {
    await runDailyCheck()
    scheduleNextRun()
  }, delay)
}

export function startAchievementDailyScheduler(): void {
  // Run immediately on startup (catch any missed days)
  runDailyCheck().catch(() => {})
  scheduleNextRun()
}
