import { app, BrowserWindow, type WebContents } from 'electron'
import configurationStore from '../store/ConfigurationStore'

const windowsWithListener = new WeakSet<BrowserWindow>()

type BeforeInputEvent = { preventDefault: () => void }

function handleF12(webContents: WebContents, event: BeforeInputEvent) {
  if (!configurationStore.store.developerMode) return
  if (webContents.isDestroyed()) return
  event.preventDefault()
  if (webContents.isDevToolsOpened()) {
    webContents.closeDevTools()
  } else {
    webContents.openDevTools({ mode: 'bottom' })
  }
}

export function setupDeveloperModeForWindow(win: BrowserWindow) {
  if (!win?.webContents || win.webContents.isDestroyed()) return
  if (windowsWithListener.has(win)) return
  windowsWithListener.add(win)
  win.webContents.on('before-input-event', (event: BeforeInputEvent, input) => {
    if (input.key === 'F12') {
      handleF12(win.webContents, event)
    }
  })
}

export function initDeveloperModeShortcut() {
  app.on('browser-window-created', (_event, win) => {
    setupDeveloperModeForWindow(win)
  })
  // Cửa sổ đã tạo trước khi register (main window)
  for (const win of BrowserWindow.getAllWindows()) {
    setupDeveloperModeForWindow(win)
  }
}

export function registerDeveloperModeShortcut() {
  // Không cần làm gì - handler kiểm tra developerMode mỗi lần F12
}

export function unregisterDeveloperModeShortcut() {
  // Không cần làm gì - handler kiểm tra developerMode mỗi lần
}
