import path from 'node:path'
import { app } from 'electron'

/**
 * Pin userData + Chromium disk cache before any electron-store / BrowserWindow init.
 * Avoids "Unable to move the cache: Access is denied" when a stale Electron process
 * still holds the default cache dir (common with `pnpm dev --watch`).
 */
export function bootstrapAppPaths(): void {
  const userData = path.join(app.getPath('appData'), 'honey-badger')
  app.setPath('userData', userData)
  app.commandLine.appendSwitch('disk-cache-dir', path.join(userData, 'ChromiumCache'))
}

bootstrapAppPaths()
