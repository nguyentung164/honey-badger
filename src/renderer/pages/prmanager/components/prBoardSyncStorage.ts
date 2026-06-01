import { formatDistanceToNow } from 'date-fns'
import type { TFunction } from 'i18next'
import { getDateFnsLocale } from '@/lib/dateUtils'

/** ISO hoặc epoch ms — lưu theo projectId trên máy này. */
const PR_BOARD_LAST_GITHUB_SYNC_LS_PREFIX = 'pr-manager.prBoard.lastGithubSyncAt.v1:'

export function readLastGithubSyncMs(projectId: string): number | null {
  try {
    const raw = window.localStorage.getItem(PR_BOARD_LAST_GITHUB_SYNC_LS_PREFIX + projectId)
    if (raw == null || raw === '') return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return null
    return n < 1e12 ? n * 1000 : n
  } catch {
    return null
  }
}

export function writeLastGithubSyncMs(projectId: string, ms: number): void {
  try {
    window.localStorage.setItem(PR_BOARD_LAST_GITHUB_SYNC_LS_PREFIX + projectId, String(ms))
  } catch {
    /* ignore */
  }
}

const PR_BOARD_LAST_GITHUB_SYNC_WAS_AUTO_LS_PREFIX = 'pr-manager.prBoard.lastGithubSyncWasAuto.v1:'

export function readLastGithubSyncWasAuto(projectId: string): boolean {
  try {
    return window.localStorage.getItem(PR_BOARD_LAST_GITHUB_SYNC_WAS_AUTO_LS_PREFIX + projectId) === '1'
  } catch {
    return false
  }
}

export function writeLastGithubSyncWasAuto(projectId: string, wasAuto: boolean): void {
  try {
    window.localStorage.setItem(PR_BOARD_LAST_GITHUB_SYNC_WAS_AUTO_LS_PREFIX + projectId, wasAuto ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const PR_BOARD_LAST_GITHUB_SYNC_REPO_LS_PREFIX = 'pr-manager.prBoard.lastGithubSyncRepoAt.v1:'
const PR_BOARD_LAST_GITHUB_SYNC_BRANCH_LS_PREFIX = 'pr-manager.prBoard.lastGithubSyncBranchAt.v1:'

export function readLastGithubSyncRepoMs(projectId: string, repoId: string): number | null {
  try {
    const raw = window.localStorage.getItem(`${PR_BOARD_LAST_GITHUB_SYNC_REPO_LS_PREFIX}${projectId}:${repoId}`)
    if (raw == null || raw === '') return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return null
    return n < 1e12 ? n * 1000 : n
  } catch {
    return null
  }
}

export function writeLastGithubSyncRepoMs(projectId: string, repoId: string, ms: number): void {
  try {
    window.localStorage.setItem(`${PR_BOARD_LAST_GITHUB_SYNC_REPO_LS_PREFIX}${projectId}:${repoId}`, String(ms))
  } catch {
    /* ignore */
  }
}

export function readLastGithubSyncBranchMs(projectId: string, trackedBranchId: string): number | null {
  try {
    const raw = window.localStorage.getItem(`${PR_BOARD_LAST_GITHUB_SYNC_BRANCH_LS_PREFIX}${projectId}:${trackedBranchId}`)
    if (raw == null || raw === '') return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return null
    return n < 1e12 ? n * 1000 : n
  } catch {
    return null
  }
}

export function writeLastGithubSyncBranchMs(projectId: string, trackedBranchId: string, ms: number): void {
  try {
    window.localStorage.setItem(`${PR_BOARD_LAST_GITHUB_SYNC_BRANCH_LS_PREFIX}${projectId}:${trackedBranchId}`, String(ms))
  } catch {
    /* ignore */
  }
}

/** Sau khoảng này kể từ mốc sync hiệu lực cuối → CloudAlert vàng. */
export const PR_BOARD_SCOPED_SYNC_STALE_AFTER_MS = 60 * 60 * 1000

export type GithubScopedSyncIdleVisual = 'never' | 'fresh' | 'stale'

export function githubScopedSyncIdleVisual(lastMs: number | null, nowMs: number): GithubScopedSyncIdleVisual {
  if (lastMs == null) return 'never'
  if (nowMs - lastMs >= PR_BOARD_SCOPED_SYNC_STALE_AFTER_MS) return 'stale'
  return 'fresh'
}

/** Icon nhánh: mốc “còn tươi” = mới nhất giữa sync cả repo và sync đúng nhánh đó. */
export function effectiveGithubSyncMsForBranchRow(repoMs: number | null, branchMs: number | null): number | null {
  const parts: number[] = []
  if (repoMs != null && Number.isFinite(repoMs)) parts.push(repoMs)
  if (branchMs != null && Number.isFinite(branchMs)) parts.push(branchMs)
  if (parts.length === 0) return null
  return Math.max(...parts)
}

export function formatScopedSyncTooltip(ms: number | null, lang: string, t: TFunction): string {
  if (ms == null) return t('prManager.board.lastScopedSyncNever')
  const loc = getDateFnsLocale(lang)
  const relative = formatDistanceToNow(new Date(ms), { addSuffix: true, locale: loc })
  const datetime = new Date(ms).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })
  return t('prManager.board.lastScopedSyncTooltip', { datetime, relative })
}

const PR_BOARD_AUTO_SYNC_GITHUB_LS_PREFIX = 'pr-manager.prBoard.autoSyncGithub.v1:'

export function readAutoSyncGithub(projectId: string): boolean {
  try {
    return window.localStorage.getItem(PR_BOARD_AUTO_SYNC_GITHUB_LS_PREFIX + projectId) === '1'
  } catch {
    return false
  }
}

export function writeAutoSyncGithub(projectId: string, on: boolean): void {
  try {
    window.localStorage.setItem(PR_BOARD_AUTO_SYNC_GITHUB_LS_PREFIX + projectId, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}
