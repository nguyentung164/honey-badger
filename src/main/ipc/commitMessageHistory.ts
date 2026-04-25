import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { addHistoryMessage, getHistoryMessages } from '../task/mysqlCommitMessageHistory'

export function registerCommitMessageHistoryIpcHandlers() {
  l.info('Registering CommitMessageHistory IPC Handlers...')

  ipcMain.handle(IPC.COMMIT_MESSAGE_HISTORY.GET, async () => {
    try {
      const messages = await getHistoryMessages()
      return { status: 'success' as const, data: messages }
    } catch (error: any) {
      l.error('commit-message-history:get error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.COMMIT_MESSAGE_HISTORY.ADD, async (_event, message: { message: string; date: string }) => {
    try {
      await addHistoryMessage(message)
      return { status: 'success' as const }
    } catch (error: any) {
      l.error('commit-message-history:add error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })
}
