import { BrowserWindow, Notification } from 'electron'
import { IPC } from 'main/constants'
import configurationStore from '../store/ConfigurationStore'
import { getTokenFromStore, verifyToken } from '../task/auth'

/** Exported for unit testing */
export function sendTaskNotification(
  targetUserId: string | null,
  title: string,
  body: string,
  type?: string,
  options?: { force?: boolean }
): void {
  if (!targetUserId) return
  const { showNotifications } = configurationStore.store
  if (!options?.force && !showNotifications) return
  const wins = BrowserWindow.getAllWindows().filter(w => !w.webContents.isDestroyed())
  if (wins.length > 0) {
    for (const win of wins) {
      if (!win.webContents.isDestroyed()) {
        win.webContents.send(IPC.TASK.NOTIFICATION, { targetUserId, title, body, type })
      }
    }
  } else {
    const token = getTokenFromStore()
    const session = token ? verifyToken(token) : null
    if (session?.userId === targetUserId && Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  }
}
