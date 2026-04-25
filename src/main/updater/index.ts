import type { BrowserWindow } from 'electron'
import { app, ipcMain, Notification } from 'electron'
import l from 'electron-log'
import { autoUpdater } from 'electron-updater'
import { getResourcePath } from 'main/utils/utils'
import { IPC } from '../constants'
import configurationStore from '../store/ConfigurationStore'
import { updateAppStatus } from '../windows/overlayStateManager'

const currentVersion = app.getVersion()
l.transports.file.level = 'info'
autoUpdater.logger = l
// Chỉ bật forceDevUpdateConfig khi đã package; dev không có dev-app-update.yml sẽ gây ENOENT
autoUpdater.forceDevUpdateConfig = app.isPackaged
autoUpdater.autoDownload = true
autoUpdater.fullChangelog = true
autoUpdater.requestHeaders = {
  'Cache-Control': 'no-cache',
}

export function initAutoUpdater(window: BrowserWindow) {
  const { showNotifications } = configurationStore.store
  autoUpdater.on('checking-for-update', () => {
    window.webContents.send(IPC.UPDATER.STATUS, { status: 'checking' })
  })

  autoUpdater.on('update-available', info => {
    l.info(`Update available: ${info.version}`)
    window.webContents.send(IPC.UPDATER.STATUS, {
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes,
      currentVersion,
    })
  })

  autoUpdater.on('update-not-available', _info => {
    updateAppStatus(false)
    window.webContents.send(IPC.UPDATER.STATUS, { status: 'not-available' })
  })

  autoUpdater.on('error', err => {
    updateAppStatus(false)
    const isDevUpdateMissing =
      !app.isPackaged &&
      err?.message?.includes('ENOENT') &&
      err?.message?.includes('dev-app-update.yml')
    if (isDevUpdateMissing) {
      window.webContents.send(IPC.UPDATER.STATUS, { status: 'not-available' })
    } else {
      window.webContents.send(IPC.UPDATER.STATUS, { status: 'error', error: err.message })
    }
  })

  autoUpdater.on('download-progress', progressObj => {
    const { percent, bytesPerSecond, total, transferred } = progressObj

    // Tính tốc độ tải
    const speedKBps = (bytesPerSecond / 1024).toFixed(2)
    const _speedMBps = (bytesPerSecond / (1024 * 1024)).toFixed(2)

    // Tính thời gian còn lại
    const remainingBytes = total - transferred
    const etaSeconds = remainingBytes / bytesPerSecond
    const eta = etaSeconds < 60 ? `${Math.round(etaSeconds)}s` : `${Math.round(etaSeconds / 60)}m`

    // Log tốc độ tải
    l.info(
      `[Updater] Download progress: ${percent.toFixed(1)}% | Speed: ${speedKBps} KB/s | ETA: ${eta} | Downloaded: ${(transferred / (1024 * 1024)).toFixed(2)} MB / ${(total / (1024 * 1024)).toFixed(2)} MB`
    )

    window.webContents.send(IPC.UPDATER.STATUS, {
      status: 'downloading',
      progress: progressObj.percent,
      speed: speedKBps,
      eta,
      downloadedMB: (transferred / (1024 * 1024)).toFixed(2),
      totalMB: (total / (1024 * 1024)).toFixed(2),
    })
  })

  autoUpdater.on('update-downloaded', info => {
    updateAppStatus(true)
    if (showNotifications && Notification.isSupported()) {
      const icon = getResourcePath('icon.ico')
      const notification = new Notification({
        title: 'App Update Available',
        body: `Version ${info.version} is available. It will be downloaded in the background.`,
        icon: icon,
      })
      notification.show()
    } else {
      l.warn('[Updater] Notifications not supported on this system.')
    }
    window.webContents.send(IPC.UPDATER.STATUS, {
      status: 'downloaded',
      version: info.version,
      releaseNotes: info.releaseNotes,
      currentVersion,
    })
  })

  ipcMain.handle(IPC.UPDATER.GET_VERSION, () => {
    return app.getVersion()
  })

  ipcMain.handle(IPC.UPDATER.CHECK_FOR_UPDATES, async () => {
    try {
      l.info('Manually checking for updates...')
      const updateCheckResult = await autoUpdater.checkForUpdates()
      if (updateCheckResult?.updateInfo) {
        const currentVersion = app.getVersion()
        const latestVersion = updateCheckResult.updateInfo.version
        const releaseNotes = updateCheckResult.updateInfo.releaseNotes
        const updateAvailable = latestVersion !== currentVersion
        return {
          status: updateAvailable ? 'available' : 'not-available',
          version: latestVersion,
          releaseNotes,
          currentVersion,
        }
      }
      return { status: 'not-available' }
    } catch (error: unknown) {
      if (!app.isPackaged) {
        const msg = error instanceof Error ? error.message : String(error)
        const isDevUpdateMissing =
          (error as NodeJS.ErrnoException)?.code === 'ENOENT' ||
          (msg.includes('ENOENT') && msg.includes('dev-app-update.yml'))
        if (isDevUpdateMissing) {
          return { status: 'not-available' }
        }
      }
      l.error('Error checking for updates:', error)
      throw error
    }
  })

  ipcMain.handle(IPC.UPDATER.INSTALL_UPDATES, () => {
    autoUpdater.quitAndInstall(false, true)
  })
}
