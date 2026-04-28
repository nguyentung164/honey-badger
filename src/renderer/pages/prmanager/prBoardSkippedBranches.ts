/** Danh sách nhánh bỏ qua khi hiển thị bảng PR — lưu DB (user + project), đồng bộ UI qua cache + CustomEvent. */

const LEGACY_LS_PREFIX = 'pr-manager.prBoard.skipBranches.v1:'
const LEGACY_LS_USER_PREFIX = 'pr-manager.prBoard.skipBranches.v2:'

/** Cùng cửa sổ: đồng bộ sau hydrate hoặc Lưu trong Settings. */
export const PR_BOARD_SKIP_BRANCHES_CHANGED = 'pr-manager:prBoardSkipBranches'

const skippedBranchesSnapshotCache = new Map<string, string>()

function cacheKey(projectId: string, userId: string): string {
  return `${userId}\t${projectId}`
}

function parseStoredLines(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw === '') return []
  return raw
    .split(/\r?\n/)
    .map(l => l.trimEnd())
    .filter(l => l.trim().length > 0)
}

/** Chuẩn hóa và khử trùng để khớp ổn định. */
export function normalizeSkippedBranchLines(lines: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

function publishSkippedBranchesChanged(projectId: string, userId: string | null): void {
  window.dispatchEvent(new CustomEvent(PR_BOARD_SKIP_BRANCHES_CHANGED, { detail: { projectId, userId } }))
}

/** Snapshot đồng bộ cho PR Board (chuỗi nối bằng xuống dòng); userId null → không lọc (cache trống). */
export function readSkippedBranchesSnapshotText(projectId: string, userId: string | null): string {
  if (!userId) return ''
  return skippedBranchesSnapshotCache.get(cacheKey(projectId, userId)) ?? ''
}

export function writeSkippedBranchesSnapshotCache(projectId: string, userId: string, lines: readonly string[]): void {
  const text = normalizeSkippedBranchLines(lines).join('\n')
  skippedBranchesSnapshotCache.set(cacheKey(projectId, userId), text)
  publishSkippedBranchesChanged(projectId, userId)
}

/** Đọc localStorage legacy (v1/v2) để migrate một lần sang DB. */
function collectLegacyLocalStorageSkipLines(projectId: string, userId: string): string[] {
  try {
    const v2Key = `${LEGACY_LS_USER_PREFIX}${userId}:${projectId}`
    const v2 = window.localStorage.getItem(v2Key)
    const v1 = window.localStorage.getItem(`${LEGACY_LS_PREFIX}${projectId}`)
    const merged = [...parseStoredLines(v2), ...parseStoredLines(v1)]
    return normalizeSkippedBranchLines(merged)
  } catch {
    return []
  }
}

function clearLegacyLocalStorageSkipKeys(projectId: string, userId: string): void {
  try {
    window.localStorage.removeItem(`${LEGACY_LS_USER_PREFIX}${userId}:${projectId}`)
    window.localStorage.removeItem(`${LEGACY_LS_PREFIX}${projectId}`)
  } catch {
    /* ignore */
  }
}

/**
 * Tải từ DB vào cache (và migrate từ localStorage khi DB trống).
 * Gọi khi đổi project/user hoặc sau khi PR Manager mount.
 */
export async function hydratePrBoardSkippedBranchesFromApi(userId: string | null, projectId: string): Promise<void> {
  if (!userId?.trim()) {
    publishSkippedBranchesChanged(projectId, null)
    return
  }
  const uid = userId.trim()
  const res = await window.api.pr.boardSkipBranchesGet(uid, projectId)
  if (res.status !== 'success' || !res.data) {
    return
  }
  let lines = Array.isArray(res.data.lines) ? res.data.lines.map(String) : []
  lines = normalizeSkippedBranchLines(lines)
  if (lines.length === 0) {
    const migrated = collectLegacyLocalStorageSkipLines(projectId, uid)
    if (migrated.length > 0) {
      const setRes = await window.api.pr.boardSkipBranchesSet(uid, projectId, migrated)
      if (setRes.status === 'success') {
        lines = migrated
        clearLegacyLocalStorageSkipKeys(projectId, uid)
      }
    }
  }
  writeSkippedBranchesSnapshotCache(projectId, uid, lines)
}

/**
 * Dòng chỉ gồm ASCII `*` ở cuối → khớp tiền tố (không tính `*`).
 * Ngược lại → khớp đúng tên nhánh (phân biệt hoa thường, như ref Git).
 */
export function branchNameMatchesSkipList(branchName: string, patterns: readonly string[]): boolean {
  for (const raw of patterns) {
    const p = raw.trim()
    if (!p) continue
    if (p.endsWith('*') && p.length > 1) {
      const pre = p.slice(0, -1)
      if (branchName.startsWith(pre)) return true
    } else if (branchName === p) {
      return true
    }
  }
  return false
}

export function subscribePrBoardSkippedBranches(projectId: string, userId: string | null, onChange: () => void): () => void {
  const onLocal = (e: Event) => {
    const ce = e as CustomEvent<{ projectId?: string; userId?: string | null }>
    if (ce.detail?.projectId !== projectId) return
    const uid = ce.detail?.userId
    if (userId != null && userId !== '') {
      if (uid === userId) onChange()
    } else if (uid === null || uid === undefined) {
      onChange()
    }
  }
  window.addEventListener(PR_BOARD_SKIP_BRANCHES_CHANGED, onLocal)
  return () => {
    window.removeEventListener(PR_BOARD_SKIP_BRANCHES_CHANGED, onLocal)
  }
}
