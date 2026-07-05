import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

import Store from 'electron-store'
import { createWindow } from 'lib/electron-app/factories/windows/create'
import { stopFileWatcher } from 'main/utils/fileWatcher'
import { getWindowBackgroundColor } from 'main/utils/windowBackground'
import { IPC } from 'main/constants'
import { ENVIRONMENT } from 'shared/constants'
import { displayName } from '~/package.json'

const store = new Store()

import l from 'electron-log'
import { autoUpdater } from 'electron-updater'

autoUpdater.logger = l
l.transports.file.level = 'info'
l.info('App starting...')

export async function MainWindow() {
  const window = createWindow({
    id: 'main',
    title: displayName,
    frame: false,
    backgroundColor: getWindowBackgroundColor(),
    width: 1366,
    height: 768,
    minWidth: 1366,
    minHeight: 768,
    show: true,
    center: true,
    movable: true,
    resizable: true,
    roundedCorners: true,
    // alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: app.isPackaged ? join(app.getAppPath(), 'preload', 'index.js') : join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      /** Bản cài (.exe) dùng file:// — tắt webSecurity tránh chặn module/worker/subresource so với origin file. */
      webSecurity: !app.isPackaged,
    },
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    l.error('Main window did-fail-load', { errorCode, errorDescription, validatedURL })
  })

  window.webContents.on('did-finish-load', () => {
    if (ENVIRONMENT.IS_DEV) {
      window.webContents.openDevTools({ mode: 'detach' })
    }
  })

  const notifyRendererFocus = () => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(IPC.SYSTEM.APP_WINDOW_FOCUS)
    }
  }
  window.on('focus', notifyRendererFocus)
  window.on('show', notifyRendererFocus)

  window.on('close', () => {
    stopFileWatcher()
    store.set('bounds', window.getBounds())
    for (const window of BrowserWindow.getAllWindows()) {
      window.destroy()
    }
  })

  window.setBounds(store.get('bounds') as Partial<Electron.Rectangle>)
  return window
}
