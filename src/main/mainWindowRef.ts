import type { BrowserWindow } from 'electron'

let mainWindowRef: BrowserWindow | null = null

export function setMainWindowRef(win: BrowserWindow | null): void {
  mainWindowRef = win
}

export function getMainWindowRef(): BrowserWindow | null {
  return mainWindowRef
}
