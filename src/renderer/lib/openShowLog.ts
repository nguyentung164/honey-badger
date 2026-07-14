import { canOpenShowLogEmbedded as canOpenShowLogEmbeddedFromAccess } from '@/lib/mainShellTabAccess'

export type ShowLogOpenPayload = {
  path: string | string[]
  currentRevision?: string
  sourceFolder?: string
  versionControlSystem?: 'git' | 'svn'
  isGit?: boolean
  /** Embedded tab: chỉ load log khi mở tường minh (context menu, dock…), không khi chỉ click tab. */
  autoLoad?: boolean
}

export const MAIN_SHELL_OPEN_SHOW_LOG_EVENT = 'main-shell:open-show-log'

export function buildShowLogOpenPayload(input: {
  filePath: string | string[]
  currentRevision?: string
  sourceFolder?: string
  versionControlSystem: 'git' | 'svn'
}): ShowLogOpenPayload {
  const path = input.filePath || '.'
  const payload: ShowLogOpenPayload = { path }
  if (input.currentRevision) payload.currentRevision = input.currentRevision
  if (input.sourceFolder) {
    payload.sourceFolder = input.sourceFolder
    payload.versionControlSystem = input.versionControlSystem
    if (input.versionControlSystem === 'git') payload.isGit = true
  }
  return payload
}

export function canOpenShowLogEmbedded(): boolean {
  return canOpenShowLogEmbeddedFromAccess()
}

/** Mở Show Log embedded (tab) khi đã đăng nhập và chưa tách; ngược lại mở cửa sổ riêng. */
export function requestOpenShowLog(data: ShowLogOpenPayload): void {
  const payload: ShowLogOpenPayload = { ...data, autoLoad: true }
  if (canOpenShowLogEmbedded()) {
    window.dispatchEvent(new CustomEvent(MAIN_SHELL_OPEN_SHOW_LOG_EVENT, { detail: payload }))
    return
  }
  window.api.showLog.openWindow(payload)
}
