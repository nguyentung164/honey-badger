'use client'

import { formatDistanceToNow } from 'date-fns'
import type { TFunction } from 'i18next'
import {
  ExternalLink,
  GitMerge,
  GitPullRequestClosed,
  GitPullRequestCreate,
  GitPullRequestDraft,
  Hourglass,
} from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getDateFnsLocale } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { formatPrCheckpointStatusFingerprint, type PrCheckpointStatusChangeDetail } from '../checkpointStatusChange'
import type { PrBranchCheckpoint, PrCheckpointTemplate, PrRepo } from '../hooks/usePrData'
import { getMergeableUi } from '../prMergeableUi'
import type { PrBoardRowAction } from './prBoardRowActions'
import { PrSizeMetrics, prSizeMetricsFromCheckpoint } from './PrSizeMetrics'
import type { MergeMetricsAlignment } from './prBoardTableModel'
import {
  applyPrMergeCellVisualStyle,
  CELL_CTRL_H,
  CELL_TXT,
  openUrlInDefaultBrowser,
  stripPrMergeCellBackgroundClasses,
  type PrMergeCellVisualStyle,
} from './prBoardTableConstants'

/** outline: không chiếm box-model, khác border — vẫn bo theo rounded-md */
const MERGE_STATUS_CHANGE_FRAME_CLASS =
  'rounded-md outline outline-[0.5px] outline-dashed outline-emerald-400/90 -outline-offset-1 dark:outline-emerald-300/80'

function MergeStatusChangeFrame({ active, children }: { active: boolean; children: ReactNode }) {
  if (!active) return <>{children}</>
  return <div className={cn('w-full min-w-0', MERGE_STATUS_CHANGE_FRAME_CLASS)}>{children}</div>
}

function StatusChangeTooltip({
  active,
  statusChangeDetail,
  children,
}: {
  active: boolean
  statusChangeDetail?: PrCheckpointStatusChangeDetail
  children: ReactNode
}) {
  const { t } = useTranslation()
  if (!active) return <>{children}</>
  const statusTooltip =
    statusChangeDetail != null
      ? t('prManager.board.statusChangedTooltip', {
        before: formatPrCheckpointStatusFingerprint(statusChangeDetail.before, t),
        after: formatPrCheckpointStatusFingerprint(statusChangeDetail.after, t),
      })
      : t('prManager.board.statusChangedBadge')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="min-w-0 cursor-default truncate">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[320px] text-xs">
        <p className="leading-snug">{statusTooltip}</p>
      </TooltipContent>
    </Tooltip>
  )
}

const GH_PR_SURFACE_BG = {
  merged: 'bg-violet-400/12',
  closed: 'bg-rose-400/10',
  draft: 'bg-slate-400/14',
  conflict: 'bg-amber-400/14',
  blocked: 'bg-rose-400/14',
  behind: 'bg-sky-400/14',
  unstable: 'bg-orange-400/12',
  unknown: 'bg-lime-400/10 dark:bg-lime-400/14',
  ready: 'bg-emerald-400/[0.2] dark:bg-emerald-400/[0.14]',
} as const

type GhPrSurfaceBgKey = keyof typeof GH_PR_SURFACE_BG

const PR_COLUMN_LEGEND_ORDER: GhPrSurfaceBgKey[] = [
  'merged',
  'closed',
  'draft',
  'conflict',
  'blocked',
  'behind',
  'unstable',
  'unknown',
  'ready',
]

/**
 * Chỉ cho chấm tròn legend: tông 300/400 sáng, mỗi mục một màu (Closed = rose, Blocked = đỏ — không trùng).
 * Bảng vẫn dùng `GH_PR_SURFACE_BG`.
 */
const PR_COLUMN_LEGEND_DOT_BRIGHT: Record<GhPrSurfaceBgKey, string> = {
  merged: 'bg-violet-300 dark:bg-violet-400/95',
  closed: 'bg-rose-300 dark:bg-rose-400/90',
  draft: 'bg-stone-300 dark:bg-stone-500/85',
  conflict: 'bg-amber-300 dark:bg-amber-400/90',
  blocked: 'bg-red-400 dark:bg-red-500/85',
  behind: 'bg-sky-300 dark:bg-sky-400/90',
  unstable: 'bg-orange-300 dark:bg-orange-400/90',
  unknown: 'bg-lime-300 dark:bg-lime-400/90',
  ready: 'bg-emerald-300 dark:bg-emerald-400/90',
}

/** Cột pr_*: nền theo trạng thái PR; open + ready to merge = emerald (cùng họ với ô Merge). */
function ghPrSurfaceClasses(cp: PrBranchCheckpoint): string {
  if (cp.ghPrMerged === true) {
    return cn(GH_PR_SURFACE_BG.merged, 'text-violet-700 dark:text-violet-300')
  }
  if (cp.ghPrState === 'closed') {
    return cn(GH_PR_SURFACE_BG.closed, 'text-rose-700 dark:text-rose-300')
  }
  if (cp.ghPrDraft === true) {
    return cn(GH_PR_SURFACE_BG.draft, 'text-slate-600 dark:text-slate-300')
  }
  const ms = (cp.ghPrMergeableState || '').toLowerCase().trim()
  if (ms === 'dirty' || ms === 'conflict') {
    return GH_PR_SURFACE_BG.conflict
  }
  if (ms === 'blocked') {
    return GH_PR_SURFACE_BG.blocked
  }
  if (ms === 'behind') {
    return GH_PR_SURFACE_BG.behind
  }
  if (ms === 'unstable') {
    return GH_PR_SURFACE_BG.unstable
  }
  if (ms === 'draft') {
    return GH_PR_SURFACE_BG.draft
  }
  if (ms === 'clean' || ms === 'has_hooks') {
    return GH_PR_SURFACE_BG.ready
  }
  if (ms === 'unknown') {
    return GH_PR_SURFACE_BG.unknown
  }
  return GH_PR_SURFACE_BG.ready
}

function MergeCellMetrics({
  cp,
  alignment,
  onMismatchClick,
}: {
  cp: PrBranchCheckpoint | null
  alignment?: MergeMetricsAlignment
  onMismatchClick?: (kind: 'files' | 'lines') => void
}) {
  if (!cp?.prNumber) return null
  return (
    <PrSizeMetrics
      variant="compact"
      {...prSizeMetricsFromCheckpoint(cp)}
      alignment={alignment}
      onMismatchClick={onMismatchClick}
    />
  )
}

/** merge_*: status trái (icon + text), metrics phải (icon + số). */
function MergeCellRow({
  companionPrCp,
  mergeMetricsAlignment,
  onMismatchClick,
  surfaceClassName,
  title,
  children,
  interactive = false,
  disabled,
  onClick,
}: {
  companionPrCp: PrBranchCheckpoint | null
  mergeMetricsAlignment?: MergeMetricsAlignment
  onMismatchClick?: (kind: 'files' | 'lines') => void
  surfaceClassName: string
  title?: string
  children: ReactNode
  interactive?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  const innerCls = 'flex min-w-0 flex-1 items-center justify-start gap-1 overflow-hidden text-left'
  return (
    <div className="flex w-full min-w-0 items-stretch gap-0.5">
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center justify-between gap-1 rounded-md px-1.5',
          CELL_CTRL_H,
          CELL_TXT,
          surfaceClassName,
          interactive && !disabled && 'hover:brightness-95 dark:hover:brightness-110'
        )}
      >
        {interactive ? (
          <button
            type="button"
            disabled={disabled}
            className={cn(
              innerCls,
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-80'
            )}
            onClick={onClick}
            title={title}
          >
            {children}
          </button>
        ) : (
          <div className={innerCls} title={title}>
            {children}
          </div>
        )}
        <MergeCellMetrics cp={companionPrCp} alignment={mergeMetricsAlignment} onMismatchClick={onMismatchClick} />
      </div>
    </div>
  )
}

function ghPrContentTextClass(cp: PrBranchCheckpoint, t: TFunction): string {
  if (cp.ghPrMerged === true || cp.ghPrState === 'closed' || cp.ghPrDraft === true) return ''
  return getMergeableUi(cp.ghPrMergeableState, t).prText
}

type PrStatusIconProps = { cp: PrBranchCheckpoint; className?: string }
function PrStatusIcon({ cp, className = 'h-3 w-3 shrink-0' }: PrStatusIconProps) {
  const { t } = useTranslation()
  if (cp.ghPrMerged === true) return <GitMerge className={cn(className, 'text-violet-500 dark:text-violet-300')} />
  if (cp.ghPrState === 'closed') return <GitPullRequestClosed className={cn(className, 'text-rose-500 dark:text-rose-300')} />
  if (cp.ghPrDraft === true) return <GitPullRequestDraft className={cn(className, 'text-slate-400 dark:text-slate-300')} />
  const ui = getMergeableUi(cp.ghPrMergeableState, t)
  const I = ui.icon
  return <I className={cn(className, ui.prIcon)} />
}

function CheckpointCellInner({
  rowId,
  tpl,
  cp,
  companionPrCp,
  mergeMetricsAlignment,
  hasStatusChange = false,
  statusChangeDetail,
  cellVisualStyle,
  canOpenInApp,
  dispatchRowAction,
}: {
  rowId: string
  tpl: PrCheckpointTemplate
  cp: PrBranchCheckpoint | null
  companionPrCp: PrBranchCheckpoint | null
  mergeMetricsAlignment?: MergeMetricsAlignment
  hasStatusChange?: boolean
  statusChangeDetail?: PrCheckpointStatusChangeDetail
  cellVisualStyle: PrMergeCellVisualStyle
  canOpenInApp: boolean
  dispatchRowAction: (action: PrBoardRowAction) => void
}) {
  const { t, i18n } = useTranslation()
  const dateLoc = getDateFnsLocale(i18n.language)
  const isMergeKind = tpl.code.toLowerCase().startsWith('merge_')
  const vs = (cls: string) => applyPrMergeCellVisualStyle(cellVisualStyle, cls)
  const stripBtn = (cls: string) => (cellVisualStyle >= 3 ? stripPrMergeCellBackgroundClasses(cls) : cls)
  /** Nút dùng `variant="ghost"`: CVA vẫn có hover:bg-accent — tắt khi style 3–4 đã strip nền. */
  const ghostNoDefaultHover = cellVisualStyle >= 3 ? 'bg-transparent dark:bg-transparent hover:!bg-transparent dark:hover:!bg-transparent' : undefined
  const onMismatchClick = (kind: 'files' | 'lines') => {
    dispatchRowAction({ type: 'openMetricsCompare', rowId, focus: kind })
  }

  if (isMergeKind) {
    const wrapMerge = (node: ReactNode) => <MergeStatusChangeFrame active={hasStatusChange}>{node}</MergeStatusChangeFrame>
    const statusTip = (label: ReactNode) => (
      <StatusChangeTooltip active={hasStatusChange} statusChangeDetail={statusChangeDetail}>
        {label}
      </StatusChangeTooltip>
    )
    const mergedOnRecord = Boolean(cp?.mergedAt)
    const mergedOnGithub = companionPrCp?.ghPrMerged === true
    const showMergedCell = mergedOnRecord || mergedOnGithub

    // Merge cell: merged_at tr\u00ean checkpoint merge_* ho\u1eb7c PR \u1edf pr_* \u0111\u00e3 merged tr\u00ean GitHub
    if (showMergedCell) {
      const when =
        mergedOnRecord && cp?.mergedAt
          ? formatDistanceToNow(new Date(cp.mergedAt), { addSuffix: true, locale: dateLoc })
          : companionPrCp?.ghPrUpdatedAt
            ? formatDistanceToNow(new Date(companionPrCp.ghPrUpdatedAt), { addSuffix: true, locale: dateLoc })
            : null
      const detail = [when, cp?.mergedBy ? t('prManager.board.mergedBy', { name: cp.mergedBy }) : null].filter(Boolean).join(' · ')
      return wrapMerge(
        <MergeCellRow
          companionPrCp={companionPrCp}
          mergeMetricsAlignment={mergeMetricsAlignment}
          onMismatchClick={onMismatchClick}
          surfaceClassName={vs('bg-violet-400/12 text-violet-700 dark:text-violet-300')}
          title={detail || undefined}
        >
          <GitMerge className="h-3.5 w-3.5 shrink-0 text-violet-500 dark:text-violet-300" />
          <span className="min-w-0 truncate font-medium">{statusTip(t('prManager.board.merged'))}</span>
        </MergeCellRow>
      )
    }
    // PR Draft: GitHub ch\u01b0a cho merge \u2014 kh\u00f4ng hi\u1ec7n n\u00fat Merge, hi\u1ec3n th\u1ecb nh\u00e3n thay th\u1ebf (ch\u1eef nh\u1ecf)
    if (companionPrCp?.prNumber != null && companionPrCp.ghPrDraft === true && companionPrCp.ghPrMerged !== true && companionPrCp.ghPrState !== 'closed') {
      const draftN = companionPrCp.prNumber
      const canOpen = canOpenInApp
      return wrapMerge(
        <MergeCellRow
          companionPrCp={companionPrCp}
          mergeMetricsAlignment={mergeMetricsAlignment}
          onMismatchClick={onMismatchClick}
          surfaceClassName={vs('bg-slate-400/10 text-slate-600 dark:text-slate-300')}
          title={t('prManager.board.draftTitle')}
          interactive
          disabled={!canOpen}
          onClick={canOpen ? () => dispatchRowAction({ type: 'openPrInApp', rowId, prNumber: draftN }) : undefined}
        >
          <GitPullRequestDraft className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate font-medium">{statusTip(t('prManager.board.draftLabel'))}</span>
        </MergeCellRow>
      )
    }
    const hasCompanionForMerge = companionPrCp?.prNumber != null && companionPrCp.ghPrMerged !== true && companionPrCp.ghPrState !== 'closed' && companionPrCp.ghPrDraft !== true
    const mergeUi = hasCompanionForMerge ? getMergeableUi(companionPrCp.ghPrMergeableState, t) : null
    // PR m\u1edf nh\u01b0ng mergeable b\u1ea5t th\u01b0\u1eddng (xung \u0111\u1ed9t, blocked, t\u1ee5t base, v.v.) \u2014 c\u1ed9t merge_: n\u1ec1n m\u00e0u + nh\u00e3n, kh\u00f4ng n\u00fat Merge
    if (hasCompanionForMerge && mergeUi?.blockMerge && mergeUi.mergeCell) {
      const MIcon = mergeUi.icon
      const blockN = companionPrCp.prNumber
      const canOpen = canOpenInApp && blockN != null
      return wrapMerge(
        <MergeCellRow
          companionPrCp={companionPrCp}
          mergeMetricsAlignment={mergeMetricsAlignment}
          onMismatchClick={onMismatchClick}
          surfaceClassName={vs(mergeUi.mergeCell)}
          title={mergeUi.mergeTitle ? `${mergeUi.mergeTitle} ${t('prManager.mergeableUi.openInAppHint')}` : t('prManager.mergeableUi.openInAppHint')}
          interactive
          disabled={!canOpen}
          onClick={canOpen ? () => { if (blockN == null) return; dispatchRowAction({ type: 'openPrInApp', rowId, prNumber: blockN }) } : undefined}
        >
          <MIcon className={cn('h-3.5 w-3.5 shrink-0', mergeUi.prIcon)} />
          <span className="min-w-0 truncate font-medium">{statusTip(mergeUi.shortLabel)}</span>
        </MergeCellRow>
      )
    }
    // C\u00f3 PR \u0111ang m\u1edf (s\u1eb5n s\u00e0ng merge) \u2192 n\u00fat Merge
    const canMerge = Boolean(hasCompanionForMerge && mergeUi && !mergeUi.blockMerge)
    if (canMerge) {
      return wrapMerge(
        <div className="flex w-full min-w-0 items-stretch gap-0.5">
          <div
            className={vs(
              cn(
                'flex min-w-0 flex-1 items-center justify-between gap-1 rounded-md px-1.5',
                GH_PR_SURFACE_BG.ready,
                CELL_CTRL_H,
                CELL_TXT
              )
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => dispatchRowAction({ type: 'openMergePr', rowId, tplId: tpl.id })}
              className={cn(
                stripBtn(
                  cn(
                    'min-w-0 flex-1 justify-start rounded-md border-0 bg-transparent px-0 text-emerald-700 shadow-none hover:bg-emerald-400/16 dark:text-emerald-300 dark:hover:bg-emerald-400/12',
                    CELL_CTRL_H,
                    CELL_TXT
                  )
                ),
                ghostNoDefaultHover
              )}
            >
              <GitMerge className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" /> {statusTip(t('prManager.board.merge'))}
            </Button>
            <MergeCellMetrics cp={companionPrCp} alignment={mergeMetricsAlignment} onMismatchClick={onMismatchClick} />
          </div>
        </div>
      )
    }
    // C\u00f3 PR nh\u01b0ng \u0111\u00e3 \u0111\u00f3ng (kh\u00f4ng merge) \u2014 kh\u00f4ng hi\u1ec7n n\u00fat Merge
    if (companionPrCp?.prNumber != null && companionPrCp.ghPrState === 'closed' && companionPrCp.ghPrMerged !== true) {
      const closedN = companionPrCp.prNumber
      const canOpen = canOpenInApp
      return wrapMerge(
        <MergeCellRow
          companionPrCp={companionPrCp}
          mergeMetricsAlignment={mergeMetricsAlignment}
          onMismatchClick={onMismatchClick}
          surfaceClassName={vs('bg-rose-400/10 text-rose-700 dark:text-rose-300')}
          title={t('prManager.board.openPrInApp')}
          interactive
          disabled={!canOpen}
          onClick={canOpen ? () => dispatchRowAction({ type: 'openPrInApp', rowId, prNumber: closedN }) : undefined}
        >
          <GitPullRequestClosed className="h-3.5 w-3.5 shrink-0 text-rose-500 dark:text-rose-300" />
          <span className="min-w-0 truncate font-medium">{statusTip(t('prManager.board.closed'))}</span>
        </MergeCellRow>
      )
    }
    // Ch\u01b0a c\u00f3 PR c\u00f9ng target \u2192 hi\u1ec3n \u201cCh\u1edd PR\u201d
    return wrapMerge(
      <div
        className={vs(cn('flex w-full items-center justify-center gap-1 rounded-md bg-zinc-400/10 text-zinc-700 dark:bg-zinc-500/12 dark:text-zinc-200', CELL_CTRL_H, CELL_TXT))}
      >
        <Hourglass className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" /> {statusTip(t('prManager.board.waitingForPr'))}
      </div>
    )
  }

  // PR cell (pr_*): c\u00f3 PR \u2192 hi\u1ec3n "Created"; ch\u01b0a \u2192 n\u00fat "T\u1ea1o PR"
  if (cp?.prNumber) {
    const prNum = cp.prNumber
    const titleText = cp.ghPrTitle?.trim() ? cp.ghPrTitle : t('prManager.board.created')
    const surface = ghPrSurfaceClasses(cp)
    const openMergeText = ghPrContentTextClass(cp, t)
    const canOpenPr = canOpenInApp
    return (
      <div className="relative flex w-full min-w-0 items-stretch">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={vs(
                cn(
                  'flex min-h-0 min-w-0 flex-1 max-w-full items-center gap-1 rounded-md px-1.5 py-0 text-left',
                  CELL_CTRL_H,
                  CELL_TXT,
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  surface,
                  openMergeText
                )
              )}
              title={titleText}
            >
              <PrStatusIcon cp={cp} className="h-3.5 w-3.5 shrink-0" />
              <button
                type="button"
                disabled={!canOpenInApp}
                className={cn(
                  'min-w-0 flex-1 truncate rounded-sm text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  canOpenPr && 'cursor-pointer hover:underline hover:underline-offset-2',
                  !canOpenPr && 'cursor-default'
                )}
                onClick={canOpenPr ? () => dispatchRowAction({ type: 'openPrInApp', rowId, prNumber: prNum }) : undefined}
                title={titleText}
              >
                {titleText}
              </button>
              {cp.prUrl ? (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-sm opacity-90 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => {
                    if (cp.prUrl) openUrlInDefaultBrowser(cp.prUrl)
                  }}
                  title={cp.prUrl}
                >
                  #{prNum}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </button>
              ) : (
                <span className="shrink-0 opacity-90">#{prNum}</span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[340px] space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-medium leading-snug">
              <PrStatusIcon cp={cp} className="h-3.5 w-3.5 shrink-0" />
              {cp.ghPrMerged === true
                ? t('prManager.board.tooltipMerged')
                : cp.ghPrState === 'closed'
                  ? t('prManager.board.tooltipClosed')
                  : cp.ghPrDraft === true
                    ? t('prManager.board.tooltipDraft')
                    : (() => {
                      const u = getMergeableUi(cp.ghPrMergeableState, t)
                      return u.blockMerge ? t('prManager.board.openBlocked', { label: u.shortLabel }) : t('prManager.board.openReady')
                    })()}
            </div>
            <div className="leading-snug text-muted-foreground">{titleText}</div>
            {cp.ghPrUpdatedAt ? (
              <div className="text-muted-foreground">
                {t('prManager.board.updated', {
                  time: formatDistanceToNow(new Date(cp.ghPrUpdatedAt), { addSuffix: true, locale: dateLoc }),
                })}
              </div>
            ) : null}
            {cp.ghPrMergeableState ? (
              <div>
                {t('prManager.board.mergeable')} <span>{cp.ghPrMergeableState}</span>
              </div>
            ) : null}
            {cp.ghPrAdditions != null || cp.ghPrDeletions != null || cp.ghPrChangedFiles != null ? (
              <div>
                {t('prManager.board.size')} <span className="text-emerald-600 dark:text-emerald-300">+{cp.ghPrAdditions ?? 0}</span>
                {' / '}
                <span className="text-rose-500 dark:text-rose-300">-{cp.ghPrDeletions ?? 0}</span>
                {cp.ghPrChangedFiles != null ? (
                  <>
                    {' '}
                    • {cp.ghPrChangedFiles} {t('prManager.board.files')}
                  </>
                ) : null}
              </div>
            ) : null}
            {cp.ghPrAuthor ? (
              <div>
                {t('prManager.board.author')} {cp.ghPrAuthor}
              </div>
            ) : null}
            {cp.ghPrAssignees && cp.ghPrAssignees.length > 0 ? (
              <div>
                {t('prManager.board.assignees')} {cp.ghPrAssignees.map(a => a.login).join(', ')}
              </div>
            ) : null}
            {cp.ghPrLabels && cp.ghPrLabels.length > 0 ? (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {cp.ghPrLabels.map(l => (
                  <span
                    key={l.name}
                    className="rounded border px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: l.color ? `#${l.color}22` : undefined,
                      borderColor: l.color ? `#${l.color}66` : undefined,
                      color: l.color ? `#${l.color}` : undefined,
                    }}
                  >
                    {l.name}
                  </span>
                ))}
              </div>
            ) : null}
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={() => dispatchRowAction({ type: 'openCreatePr', rowId, tplId: tpl.id })}
      className={cn(
        vs(
          stripBtn(
            cn(
              'w-full rounded-md border-0 bg-zinc-400/10 text-zinc-700 shadow-none hover:bg-zinc-400/14 dark:bg-zinc-500/12 dark:text-zinc-200 dark:hover:bg-zinc-500/18',
              CELL_CTRL_H,
              CELL_TXT
            )
          )
        ),
        ghostNoDefaultHover
      )}
    >
      <GitPullRequestCreate className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" /> {t('prManager.board.createPrCell')}
    </Button>
  )
}

type PrBoardCheckpointCellProps = {
  rowId: string
  tpl: PrCheckpointTemplate
  cp: PrBranchCheckpoint | null
  companionPrCp: PrBranchCheckpoint | null
  mergeMetricsAlignment?: MergeMetricsAlignment
  hasStatusChange?: boolean
  statusChangeDetail?: PrCheckpointStatusChangeDetail
  cellVisualStyle: PrMergeCellVisualStyle
  canOpenInApp: boolean
  dispatchRowAction: (action: PrBoardRowAction) => void
}

export const PrBoardCheckpointCell = memo(function PrBoardCheckpointCell({
  rowId,
  tpl,
  cp,
  companionPrCp,
  mergeMetricsAlignment,
  hasStatusChange,
  statusChangeDetail,
  cellVisualStyle,
  canOpenInApp,
  dispatchRowAction,
}: PrBoardCheckpointCellProps) {
  return (
    <CheckpointCellInner
      rowId={rowId}
      tpl={tpl}
      cp={cp}
      companionPrCp={companionPrCp}
      mergeMetricsAlignment={mergeMetricsAlignment}
      hasStatusChange={hasStatusChange}
      statusChangeDetail={statusChangeDetail}
      cellVisualStyle={cellVisualStyle}
      canOpenInApp={canOpenInApp}
      dispatchRowAction={dispatchRowAction}
    />
  )
})

export { GH_PR_SURFACE_BG, ghPrSurfaceClasses, ghPrContentTextClass, PrStatusIcon, MergeStatusChangeFrame, StatusChangeTooltip }
