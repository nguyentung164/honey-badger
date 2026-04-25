import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { sendSupportFeedbackToTeams } from 'main/notification/sendTeams'
import type { SupportFeedback } from 'main/types/types'

export function registerNotificationsIpcHandlers() {
  l.info('🔄 Registering Notifications IPC Handlers...')

  ipcMain.handle(IPC.NOTIFICATIONS.SEND_SUPPORT_FEEDBACK, async (_event, data: SupportFeedback) => {
    l.info('Received support/feedback data via IPC:', data)
    try {
      const result = await sendSupportFeedbackToTeams(data)
      if (result.success) {
        l.info('Support feedback sent successfully via Teams.')
        return { status: 'success', message: 'Feedback sent successfully.' }
      }
      l.error('Failed to send support feedback via Teams:', result.error)
      return { status: 'error', message: result.error || 'Failed to send feedback.' }
    } catch (error: any) {
      l.error('Error handling SEND_SUPPORT_FEEDBACK IPC:', error)
      return { status: 'error', message: error.message || 'An internal error occurred while sending feedback.' }
    }
  })

  l.info('✅ Notifications IPC Handlers Registered')
}
