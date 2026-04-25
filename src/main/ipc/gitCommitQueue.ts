import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { getTokenFromStore, verifyToken } from '../task/auth'
import { getUserEmailById } from '../task/mysqlTaskStore'
import { addToQueue } from '../task/mysqlGitCommitQueue'

export function registerGitCommitQueueIpcHandlers() {
  l.info('Registering GitCommitQueue IPC Handlers...')

  ipcMain.handle(IPC.GIT_COMMIT_QUEUE.ADD, async (_event, record: Parameters<typeof addToQueue>[0]) => {
    try {
      let rec = { ...record }
      const token = getTokenFromStore()
      const session = token ? verifyToken(token) : null
      if (session?.userId) {
        const email = await getUserEmailById(session.userId)
        const e = email?.trim()
        if (e) rec = { ...rec, commitUser: e }
      }
      await addToQueue(rec)
      return { status: 'success' as const }
    } catch (error: any) {
      l.error('git-commit-queue:add error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.GIT_COMMIT_QUEUE.REMOVE_MANY, async () => {
    // Không xóa MySQL: bảng git_commit_queue dùng cho heatmap/progress (đồng bộ với push-pull).
    return { status: 'success' as const }
  })
}
