import l from 'electron-log'
import { sendTaskNotification } from '../notification/taskNotification'
import configurationStore from '../store/ConfigurationStore'
import { getTokenFromStore, verifyToken } from '../task/auth'
import { getUnreadByUserId, markAsReadBatch } from '../task/taskNotificationStore'

const POLL_INTERVAL_MS = 30_000
const MARK_READ_RETRY_COUNT = 2

let pollerStarted = false

async function pollOnce(): Promise<void> {
  try {
    if (!configurationStore?.store) return
    const { showNotifications, dbHost, dbName } = configurationStore.store
    if (!showNotifications) return
    if (!dbHost?.trim() || !dbName?.trim()) return

    const token = getTokenFromStore()
    const session = token ? verifyToken(token) : null
    if (!session?.userId) return

    const rows = await getUnreadByUserId(session.userId)
    const successfullySentIds: string[] = []
    for (const row of rows) {
      try {
        sendTaskNotification(session.userId, row.title, row.body ?? '', row.type)
        successfullySentIds.push(row.id)
      } catch (e) {
        l.warn('taskNotificationPoller: failed to show notification', row.id, e)
      }
    }
    if (successfullySentIds.length > 0) {
      const ids = successfullySentIds
      let lastErr: unknown
      for (let attempt = 0; attempt <= MARK_READ_RETRY_COUNT; attempt++) {
        try {
          await markAsReadBatch(ids)
          return
        } catch (e) {
          lastErr = e
          if (attempt < MARK_READ_RETRY_COUNT) {
            await new Promise(r => setTimeout(r, 500))
          }
        }
      }
      l.warn('taskNotificationPoller: markAsReadBatch failed after retries', lastErr)
    }
  } catch (err) {
    l.warn('taskNotificationPoller: poll failed', err)
  }
}

function scheduleNextPoll(): void {
  setTimeout(async () => {
    await pollOnce()
    scheduleNextPoll()
  }, POLL_INTERVAL_MS)
}

export function startTaskNotificationPoller(): void {
  if (pollerStarted) return
  pollerStarted = true

  pollOnce()
    .then(() => scheduleNextPoll())
    .catch(() => scheduleNextPoll())
}
