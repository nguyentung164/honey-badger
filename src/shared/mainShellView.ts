import { TASK_AUTH_STORAGE_KEY } from '@/stores/useTaskAuthStore'

export type MainShellView = 'vcs' | 'tasks'

export const MAIN_SHELL_VIEW_KEY = 'main-shell-view'

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
    if (v === 'vcs' || v === 'tasks') return v
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
