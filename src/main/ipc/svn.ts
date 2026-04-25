import { ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { blame } from 'main/svn/blame'
import { cat } from 'main/svn/cat'
import { changedFiles } from 'main/svn/changed-files'
import { cleanup } from 'main/svn/cleanup'
import { commit } from 'main/svn/commit'
import { getSvnConflictDetail } from 'main/svn/conflict-detail'
import { getSvnConflictStatus } from 'main/svn/conflict-status'
import { getDiff } from 'main/svn/get-diff'
import { getCurrentRevision, info } from 'main/svn/info'
import { type LogOptions, log as logSvn } from 'main/svn/log'
import { createSnapshot, getCommitsForMerge, merge, resolveConflict, resolveConflictWithContent } from 'main/svn/merge'
import { revert } from 'main/svn/revert'
import { getStatistics, type StatisticsOptions } from 'main/svn/statistics'
import { update } from 'main/svn/update'

const SVN_LOG_DEDUP_MS = 300
let svnLogInFlight: { key: string; promise: Promise<any>; timestamp: number } | null = null

export function registerSvnIpcHandlers() {
  l.info('🔄 Registering SVN IPC Handlers...')

  ipcMain.handle(IPC.SVN.CHANGED_FILES, async (_event, targetPath: string) => await changedFiles(targetPath))
  ipcMain.handle(IPC.SVN.GET_DIFF, async (_event, selectedFiles: any[]) => await getDiff(selectedFiles))
  ipcMain.handle(
    IPC.SVN.COMMIT,
    async (event, commitMessage: string, selectedFiles: any[], options: { hasCheckCodingRule: boolean; hasCheckSpotbugs: boolean }) =>
      await commit(commitMessage, selectedFiles, options, event.sender)
  )
  ipcMain.handle(IPC.SVN.INFO, async (_event, filePath: string) => await info(filePath))
  ipcMain.handle(IPC.SVN.GET_CURRENT_REVISION, async (_event, cwd?: string) => await getCurrentRevision(cwd))
  ipcMain.handle(IPC.SVN.INFO_WITH_STREAM, async (event, filePath: string) => await info(filePath, event.sender))
  ipcMain.handle(
    IPC.SVN.CAT,
    async (_event, filePath: string, fileStatus: string, revision?: string, options?: { cwd?: string }) =>
      await cat(filePath, fileStatus, revision, options?.cwd)
  )
  ipcMain.handle(IPC.SVN.BLAME, async (_event, filePath: string) => await blame(filePath))
  ipcMain.handle(IPC.SVN.REVERT, async (_event, filePath: string | string[]) => await revert(filePath))
  ipcMain.handle(IPC.SVN.CLEANUP, async (_event, options?: string[]) => await cleanup(options))
  ipcMain.handle(IPC.SVN.LOG, async (_event, filePath: string | string[], options?: LogOptions) => {
    const key = JSON.stringify({ filePath, options })
    const now = Date.now()
    if (svnLogInFlight?.key === key && now - svnLogInFlight.timestamp < SVN_LOG_DEDUP_MS) {
      return svnLogInFlight.promise
    }
    const promise = logSvn(filePath, options).finally(() => {
      if (svnLogInFlight?.key === key) svnLogInFlight = null
    })
    svnLogInFlight = { key, promise, timestamp: now }
    return promise
  })
  ipcMain.handle(IPC.SVN.UPDATE, async (event, filePath?: string | string[], revision?: string) => await update(filePath, revision, event.sender))
  ipcMain.handle(IPC.SVN.STATISTICS, async (_event, filePath: string, options?: StatisticsOptions) => await getStatistics(filePath, options))
  ipcMain.handle(IPC.SVN.MERGE, async (_event, options) => await merge(options))
  ipcMain.handle(IPC.SVN.MERGE_RESOLVE_CONFLICT, async (_event, filePath, resolution, isRevisionConflict) => await resolveConflict(filePath, resolution, isRevisionConflict))
  ipcMain.handle(IPC.SVN.MERGE_CREATE_SNAPSHOT, async (_event, targetPath) => await createSnapshot(targetPath))
  ipcMain.handle(IPC.SVN.MERGE_GET_COMMITS, async (_event, options) => await getCommitsForMerge(options))
  ipcMain.handle(IPC.SVN.GET_CONFLICT_STATUS, async (_event, sourceFolder?: string) => await getSvnConflictStatus(sourceFolder))
  ipcMain.handle(IPC.SVN.GET_CONFLICT_DETAIL, async (_event, filePath: string, sourceFolder?: string) => await getSvnConflictDetail(filePath, sourceFolder))
  ipcMain.handle(
    IPC.SVN.RESOLVE_CONFLICT_WITH_CONTENT,
    async (_event, filePath: string, resolvedContent: string, sourceFolder?: string) => await resolveConflictWithContent(filePath, resolvedContent, sourceFolder)
  )

  l.info('✅ SVN IPC Handlers Registered')
}
