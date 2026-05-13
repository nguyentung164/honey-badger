import l from 'electron-log'
import { retentionPruneAll } from '../ipc/automationTest'
import { getAutomationSettings } from '../automation/settingsStore'

const RUN_EVERY_MS = 6 * 60 * 60 * 1000

async function runOnce(): Promise<void> {
  try {
    const settings = getAutomationSettings()
    const keep = Math.max(5, Number(settings.runRetention ?? 30))
    await retentionPruneAll(keep)
  } catch (err) {
    l.warn('automationRetention: prune failed', err)
  }
}

export function startAutomationRetentionScheduler(): void {
  setTimeout(() => {
    void runOnce()
  }, 60_000)
  setInterval(() => {
    void runOnce()
  }, RUN_EVERY_MS)
}
