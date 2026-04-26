import { TASK_AUTH_STORAGE_KEY } from '@/stores/useTaskAuthStore'

export type MainShellView = 'vcs' | 'tasks' | 'prManager'

export const MAIN_SHELL_VIEW_KEY = 'main-shell-view'

/** PR Manager đang tách cửa sổ riêng (ẩn tab trên title bar). */
export const MAIN_PR_MANAGER_DETACHED_KEY = 'main-pr-manager-detached'

export function readPersistedPrManagerDetached(): boolean {
  try {
    return localStorage.getItem(MAIN_PR_MANAGER_DETACHED_KEY) === '1'
  } catch {
    return false
  }
}

export function writePersistedPrManagerDetached(detached: boolean): void {
  try {
    localStorage.setItem(MAIN_PR_MANAGER_DETACHED_KEY, detached ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function isTaskShellRole(role: string | undefined): boolean {
  return role === 'pl' || role === 'pm' || role === 'admin'
}

/** Tab Chart / báo cáo tổng hợp task: admin, PL, PM. */
export function canViewTaskChartTab(role: string | undefined): boolean {
  return role === 'admin' || role === 'pl' || role === 'pm'
}

export function readStoredShellView(): MainShellView | null {
  try {
    const v = localStorage.getItem(MAIN_SHELL_VIEW_KEY)
    if (v === 'vcs' || v === 'tasks' || v === 'prManager') return v
  } catch {
    /* ignore */
  }
  return null
}

/** Khởi tạo shell: ưu tiên localStorage; PL/PM/Admin chưa có key → tasks; Dev → Workspace. */
export function getInitialShellViewFromStorage(): MainShellView {
  const stored = readStoredShellView()
  if (stored) return stored
  try {
    const raw = localStorage.getItem(TASK_AUTH_STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw) as { user?: { role?: string }; isGuest?: boolean }
      if (!data.isGuest && isTaskShellRole(data.user?.role)) return 'tasks'
    }
  } catch {
    /* ignore */
  }
  return 'vcs'
}
