import { ipcMain } from 'electron'
import log from 'electron-log/main'
import { IPC } from 'main/constants'

export function registerAppLogsIpcHandlers() {
  ipcMain.handle(IPC.APP_LOGS.READ, async () => {
    try {
      const result = log.transports.file.readAllLogs()
      return result
    } catch (error) {
      log.error('Failed to read app logs:', error)
      throw error
    }
  })
}
