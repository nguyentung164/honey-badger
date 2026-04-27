import { app, type BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { makeAppWithSingleInstanceLock } from 'lib/electron-app/factories/app/instance'
import { makeAppSetup } from 'lib/electron-app/factories/app/setup'
import { registerAchievementIpcHandlers } from './ipc/achievement'
import { registerAiAnalysisIpcHandlers } from './ipc/aiAnalysis'
import { registerAiUsageIpcHandlers } from './ipc/aiUsage'
import { registerAppLogsIpcHandlers } from './ipc/appLogs'
import { registerCommitMessageHistoryIpcHandlers } from './ipc/commitMessageHistory'
import { registerDailyReportIpcHandlers } from './ipc/dailyReport'
import { registerDashboardIpcHandlers } from './ipc/dashboard'
import { registerEVMHandlers } from './ipc/evm'
import { registerGitIpcHandlers } from './ipc/git'
import { registerGitCommitQueueIpcHandlers } from './ipc/gitCommitQueue'
import { registerMasterIpcHandlers } from './ipc/master'
import { registerNotificationsIpcHandlers } from './ipc/notifications'
import { registerOpenAiIpcHandlers } from './ipc/openai'
import { registerPrIpcHandlers } from './ipc/pr'
import { registerProgressIpcHandlers } from './ipc/progress'
import { getResolvedWatchPathsForFileWatcher, registerSettingsIpcHandlers } from './ipc/settings'
import { registerSourceFolderIpcHandlers } from './ipc/sourcefolder'
import { registerSvnIpcHandlers } from './ipc/svn'
import { registerSystemIpcHandlers } from './ipc/system'
import { registerTaskIpcHandlers } from './ipc/task'
import { registerUserIpcHandlers } from './ipc/user'
import { registerVcsIpcHandlers } from './ipc/vcs'
import { registerWindowIpcHandlers } from './ipc/window'
import { setMainWindowRef } from './mainWindowRef'
import configurationStore from './store/ConfigurationStore'
import { initAutoUpdater } from './updater'
import { initDeveloperModeShortcut } from './utils/developerModeShortcut'
import { startFileWatcher } from './utils/fileWatcher'
import { MainWindow } from './windows/main'
import { initOverlayManager } from './windows/overlayStateManager'
import { setupAppFeatures } from './windows/tray'

export let mainWindow: BrowserWindow | null = null

makeAppWithSingleInstanceLock(async () => {
  await app.whenReady()

  // Khởi tạo electron-log để renderer process có thể gửi log qua IPC
  log.initialize()

  // Thêm caller (file gọi log) vào format - giống FE
  const { setupElectronLogWithCaller } = await import('./utils/loggerSetup')
  setupElectronLogWithCaller()

  // Register all IPC handlers
  registerAppLogsIpcHandlers()
  registerWindowIpcHandlers()
  registerSettingsIpcHandlers()
  registerDashboardIpcHandlers()
  registerUserIpcHandlers()
  registerMasterIpcHandlers()
  registerTaskIpcHandlers()
  registerEVMHandlers()
  registerCommitMessageHistoryIpcHandlers()
  registerDailyReportIpcHandlers()
  registerAiAnalysisIpcHandlers()
  registerGitCommitQueueIpcHandlers()
  registerSvnIpcHandlers()
  registerVcsIpcHandlers()
  registerGitIpcHandlers()
  registerPrIpcHandlers()
  registerOpenAiIpcHandlers()
  registerAiUsageIpcHandlers()
  registerSystemIpcHandlers()
  registerNotificationsIpcHandlers()
  registerSourceFolderIpcHandlers()
  registerAchievementIpcHandlers()
  registerProgressIpcHandlers()

  // Assign the created window to the exported variable
  mainWindow = await makeAppSetup(MainWindow)
  setMainWindowRef(mainWindow)

  initDeveloperModeShortcut()

  const win = mainWindow
  const kickoffBackgroundWork = (): void => {
    setImmediate(() => {
      void (async () => {
        if (win) {
          const { autoRefreshEnabled } = configurationStore.store
          startFileWatcher(getResolvedWatchPathsForFileWatcher(), win, autoRefreshEnabled ?? true)
        }
        const { pullIntegrationSettingsFromDbToLocalStores } = await import('./task/integrationSettings')
        await pullIntegrationSettingsFromDbToLocalStores().catch(() => {})
        const { startDailyReportReminderScheduler } = await import('./scheduler/dailyReportReminder')
        startDailyReportReminderScheduler()
        const { startTaskNotificationPoller } = await import('./scheduler/taskNotificationPoller')
        startTaskNotificationPoller()
        const { seedAchievements } = await import('./task/achievementSeed')
        seedAchievements().catch(() => {})
        const { startAchievementDailyScheduler } = await import('./scheduler/achievementDailyScheduler')
        startAchievementDailyScheduler()
        const { startProgressScheduler } = await import('./scheduler/progressScheduler')
        startProgressScheduler()
        const { migratePrCheckpointGithubColumns, migratePrCheckpointTemplateHeaderGroup } = await import('./task/taskDbPatches')
        await migratePrCheckpointGithubColumns().catch(() => {})
        await migratePrCheckpointTemplateHeaderGroup().catch(() => {})
        const { startPrStatusSync } = await import('./scheduler/prStatusSync')
        startPrStatusSync()
      })()
    })
  }

  if (win?.webContents.isLoading()) {
    win.webContents.once('did-finish-load', kickoffBackgroundWork)
  } else {
    kickoffBackgroundWork()
  }

  if (win) {
    const tray = setupAppFeatures(win)
    initOverlayManager(win, tray)
    initAutoUpdater(win)
  }
})
