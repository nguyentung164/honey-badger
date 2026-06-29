import type { BrowserWindow } from 'electron'

/** Mỗi key tối đa một BrowserWindow — dùng focus thay vì tạo trùng. */
const singletonWindows = new Map<string, BrowserWindow>()

/** Nếu đã có cửa sổ còn sống cho key: restore, show, focus và trả về instance. */
export function focusSingletonWindow(key: string): BrowserWindow | null {
  const win = singletonWindows.get(key)
  if (!win || win.isDestroyed()) {
    if (win?.isDestroyed()) singletonWindows.delete(key)
    return null
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return win
}

/** Gắn key với cửa sổ mới; khi đóng sẽ gỡ khỏi map. */
export function registerSingletonWindow(key: string, win: BrowserWindow): void {
  singletonWindows.set(key, win)
  win.once('closed', () => {
    if (singletonWindows.get(key) === win) singletonWindows.delete(key)
  })
}

/** Lấy singleton còn sống (không focus). */
export function getSingletonWindow(key: string): BrowserWindow | null {
  const win = singletonWindows.get(key)
  if (!win || win.isDestroyed()) {
    if (win?.isDestroyed()) singletonWindows.delete(key)
    return null
  }
  return win
}

/** Đóng singleton vì dock — không gửi WINDOW_CLOSED sang main window. */
const suppressWindowClosedKeys = new Set<string>()

export function closeSingletonWindowForDock(key: string): boolean {
  suppressWindowClosedKeys.add(key)
  return closeSingletonWindow(key)
}

/** Trả true nếu lần đóng này do dock (đã suppress WINDOW_CLOSED). */
export function consumeSuppressWindowClosed(key: string): boolean {
  return suppressWindowClosedKeys.delete(key)
}

/** Đóng singleton nếu còn sống (map được gỡ trong listener `closed` đã đăng ký). */
export function closeSingletonWindow(key: string): boolean {
  const win = singletonWindows.get(key)
  if (!win || win.isDestroyed()) {
    if (win?.isDestroyed()) singletonWindows.delete(key)
    return false
  }
  win.close()
  return true
}
