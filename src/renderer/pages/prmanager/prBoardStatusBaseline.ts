const PR_BOARD_STATUS_BASELINE_LS_PREFIX = 'pr-manager.prBoard.statusBaseline.v1:'

type StatusBaselinePayloadV1 = {
  v: 1
  /** Cell key → status fingerprint */
  fp: Record<string, string>
  at: number
}

function baselineStorageKey(userId: string, projectId: string): string {
  return `${PR_BOARD_STATUS_BASELINE_LS_PREFIX}${userId.trim()}:${projectId}`
}

export function readPrBoardStatusBaseline(userId: string, projectId: string): Map<string, string> | null {
  if (!userId.trim() || !projectId) return null
  try {
    const raw = window.localStorage.getItem(baselineStorageKey(userId, projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StatusBaselinePayloadV1
    if (parsed?.v !== 1 || typeof parsed.fp !== 'object' || parsed.fp == null) return null
    return new Map(Object.entries(parsed.fp))
  } catch {
    return null
  }
}

export function writePrBoardStatusBaseline(userId: string, projectId: string, snapshot: Map<string, string>): void {
  if (!userId.trim() || !projectId) return
  const payload: StatusBaselinePayloadV1 = {
    v: 1,
    fp: Object.fromEntries(snapshot),
    at: Date.now(),
  }
  try {
    window.localStorage.setItem(baselineStorageKey(userId, projectId), JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function clearPrBoardStatusBaseline(userId: string, projectId: string): void {
  if (!userId.trim() || !projectId) return
  try {
    window.localStorage.removeItem(baselineStorageKey(userId, projectId))
  } catch {
    /* ignore */
  }
}
