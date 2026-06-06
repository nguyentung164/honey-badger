import type { TFunction } from 'i18next'
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  GitBranch,
  GitMergeConflict,
  GitPullRequestDraft,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react'

/** Trạng thái mergeable từ GitHub REST `mergeable_state` (mirror GraphQL MergeStateStatus, chữ thường). */
export type MergeableUi = {
  prText: string
  prIcon: string
  /** merge_ column / badge: nền + chữ; rỗng nếu không hiển thị cảnh báo. */
  mergeCell: string
  mergeBadge: string
  shortLabel: string
  subLabel: string
  blockMerge: boolean
  icon: LucideIcon
  mergeTitle: string
}

const MERGE_BADGE_DEFAULT = 'bg-muted/65 text-foreground/90'

/** Nền cột pr_* (`GH_PR_SURFACE_BG`) + chữ `prText` — đồng bộ merge_* status. */
function mergeCellSurface(bg: string, prText: string): string {
  return `${bg} ${prText}`
}

export function getMergeableUi(mergeable: string | null | undefined, t: TFunction): MergeableUi {
  const s = (mergeable || '').toLowerCase().trim()
  if (s === 'dirty' || s === 'conflict') {
    const prText = 'text-amber-700 dark:text-amber-300'
    const prIcon = 'text-amber-500 dark:text-amber-300'
    const mergeCell = mergeCellSurface('bg-amber-400/14', prText)
    return {
      prText,
      prIcon,
      mergeCell,
      mergeBadge: mergeCell,
      shortLabel: t('prManager.mergeableUi.conflict'),
      subLabel: t('prManager.mergeableUi.conflictSub'),
      blockMerge: true,
      icon: GitMergeConflict,
      mergeTitle: t('prManager.mergeableUi.conflictTitle'),
    }
  }
  if (s === 'blocked') {
    const prText = 'text-rose-700 dark:text-rose-300'
    const prIcon = 'text-rose-500 dark:text-rose-300'
    const mergeCell = mergeCellSurface('bg-rose-400/14', prText)
    return {
      prText,
      prIcon,
      mergeCell,
      mergeBadge: mergeCell,
      shortLabel: t('prManager.mergeableUi.blocked'),
      subLabel: t('prManager.mergeableUi.blockedSub'),
      blockMerge: true,
      icon: Ban,
      mergeTitle: t('prManager.mergeableUi.blockedTitle'),
    }
  }
  if (s === 'behind') {
    const prText = 'text-sky-700 dark:text-sky-300'
    const prIcon = 'text-sky-500 dark:text-sky-300'
    const mergeCell = mergeCellSurface('bg-sky-400/14', prText)
    return {
      prText,
      prIcon,
      mergeCell,
      mergeBadge: mergeCell,
      shortLabel: t('prManager.mergeableUi.behind'),
      subLabel: t('prManager.mergeableUi.behindSub'),
      blockMerge: true,
      icon: GitBranch,
      mergeTitle: t('prManager.mergeableUi.behindTitle'),
    }
  }
  if (s === 'unstable') {
    const prText = 'text-orange-700 dark:text-orange-300'
    const prIcon = 'text-orange-500 dark:text-orange-300'
    const mergeCell = mergeCellSurface('bg-orange-400/12', prText)
    return {
      prText,
      prIcon,
      mergeCell,
      mergeBadge: mergeCell,
      shortLabel: t('prManager.mergeableUi.ciFailing'),
      subLabel: t('prManager.mergeableUi.ciFailingSub'),
      blockMerge: true,
      icon: AlertCircle,
      mergeTitle: t('prManager.mergeableUi.ciFailingTitle'),
    }
  }
  if (s === 'draft') {
    const prText = 'text-slate-600 dark:text-slate-300'
    const prIcon = 'text-slate-400 dark:text-slate-300'
    const mergeCell = mergeCellSurface('bg-slate-400/14', prText)
    return {
      prText,
      prIcon,
      mergeCell,
      mergeBadge: mergeCell,
      shortLabel: t('prManager.mergeableUi.mergeStateDraft'),
      subLabel: t('prManager.mergeableUi.mergeStateDraftSub'),
      blockMerge: true,
      icon: GitPullRequestDraft,
      mergeTitle: t('prManager.mergeableUi.mergeStateDraftTitle'),
    }
  }
  if (s === 'clean' || s === 'has_hooks') {
    return {
      prText: 'text-emerald-700 dark:text-emerald-300',
      prIcon: 'text-emerald-500 dark:text-emerald-300',
      mergeCell: '',
      mergeBadge: MERGE_BADGE_DEFAULT,
      shortLabel: t('prManager.mergeableUi.ready'),
      subLabel: s === 'has_hooks' ? t('prManager.mergeableUi.mergeStateHooksSub') : '',
      blockMerge: false,
      icon: CheckCircle2,
      mergeTitle: '',
    }
  }
  if (s === 'unknown') {
    const prText = 'text-lime-700 dark:text-lime-300'
    const prIcon = 'text-lime-600 dark:text-lime-300'
    const mergeCell = mergeCellSurface('bg-lime-400/10 dark:bg-lime-400/14', prText)
    return {
      prText,
      prIcon,
      mergeCell,
      mergeBadge: mergeCell,
      shortLabel: t('prManager.mergeableUi.checking'),
      subLabel: t('prManager.mergeableUi.checkingSub'),
      blockMerge: true,
      icon: HelpCircle,
      mergeTitle: t('prManager.mergeableUi.checkingTitle'),
    }
  }
  return {
    prText: 'text-emerald-700 dark:text-emerald-300',
    prIcon: 'text-emerald-500 dark:text-emerald-300',
    mergeCell: '',
    mergeBadge: MERGE_BADGE_DEFAULT,
    shortLabel: t('prManager.mergeableUi.ready'),
    subLabel: '',
    blockMerge: false,
    icon: CheckCircle2,
    mergeTitle: '',
  }
}
