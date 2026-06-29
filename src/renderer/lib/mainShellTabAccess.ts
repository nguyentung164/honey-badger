import { TASK_AUTH_STORAGE_KEY } from '@/stores/useTaskAuthStore'
import { readPersistedDevPipelinesDetached, readPersistedShowLogDetached } from 'shared/mainShellView'

export function isLoggedInMainShellUser(): boolean {
  try {
    const raw = localStorage.getItem(TASK_AUTH_STORAGE_KEY)
    if (!raw) return false
    const data = JSON.parse(raw) as { user?: unknown; isGuest?: boolean }
    return Boolean(data.user && !data.isGuest)
  } catch {
    return false
  }
}

export function canOpenDevPipelinesEmbedded(): boolean {
  if (readPersistedDevPipelinesDetached()) return false
  return isLoggedInMainShellUser()
}

export function canOpenShowLogEmbedded(): boolean {
  if (readPersistedShowLogDetached()) return false
  return isLoggedInMainShellUser()
}
