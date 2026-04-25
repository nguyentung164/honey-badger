import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { registerRoute } from 'lib/electron-router-dom'
import type { WindowProps } from 'shared/types'

function rendererIndexHtmlPath(): string {
  return app.isPackaged ? join(app.getAppPath(), 'renderer', 'index.html') : join(__dirname, '../renderer/index.html')
}

export function createWindow({ id, ...settings }: WindowProps) {
  const window = new BrowserWindow(settings)

  registerRoute({
    id,
    browserWindow: window,
    htmlFile: rendererIndexHtmlPath(),
  })

  window.on('closed', window.destroy)

  return window
}
