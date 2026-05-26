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

export function getMergeableUi(mergeable: string | null | undefined, t: TFunction): MergeableUi {
  const s = (mergeable || '').toLowerCase().trim()
  if (s === 'dirty' || s === 'conflict') {
    const mergeCell = 'bg-amber-400/16 text-amber-900 dark:text-amber-100'
    return {
      prText: 'text-amber-700 dark:text-amber-300',
      prIcon: 'text-amber-500 dark:text-amber-300',
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
    const mergeCell = 'bg-rose-400/16 text-rose-900 dark:text-rose-100'
    return {
      prText: 'text-rose-700 dark:text-rose-300',
      prIcon: 'text-rose-500 dark:text-rose-300',
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
    const mergeCell = 'bg-sky-400/16 text-sky-900 dark:text-sky-100'
    return {
      prText: 'text-sky-700 dark:text-sky-300',
      prIcon: 'text-sky-500 dark:text-sky-300',
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
    const mergeCell = 'bg-orange-400/14 text-orange-900 dark:text-orange-100'
    return {
      prText: 'text-orange-700 dark:text-orange-300',
      prIcon: 'text-orange-500 dark:text-orange-300',
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
    const mergeCell = 'bg-slate-400/16 text-slate-900 dark:text-slate-100'
    return {
      prText: 'text-slate-600 dark:text-slate-300',
      prIcon: 'text-slate-400 dark:text-slate-300',
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
    const mergeCell = 'bg-lime-400/14 text-lime-950 dark:text-lime-50'
    return {
      prText: 'text-lime-700 dark:text-lime-300',
      prIcon: 'text-lime-600 dark:text-lime-300',
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
