'use client'

import type { Locale } from 'date-fns'
import { formatDistanceToNow } from 'date-fns'
import type { TFunction } from 'i18next'
import type { LucideIcon } from 'lucide-react'
import {
  AlertCircle,
  ArrowDownToLine,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CircleOff,
  ExternalLink,
  FileCode,
  GitCommit,
  GitMerge,
  GitMergeConflict,
  Info,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Send,
  Upload,
  Users,
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import { getDateFnsLocale } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import type { PrRepo } from '../hooks/usePrData'
import { PR_GH_STATUS_BADGE_CLASS, prSummaryToGhStatusKind } from '../prGhStatus'
import { githubMergeableBlocksMerge } from './prBoardBulkResolve'
import { MergePrDialog } from './MergePrDialog'

type PrSummary = {
  number: number
  title: string
  state: 'open' | 'closed'
  draft: boolean
  merged: boolean
  htmlUrl: string
  head: string
  base: string
  headSha: string | null
  author?: string | null
  mergeableState?: string | null
  additions?: number | null
  deletions?: number | null
  changedFiles?: number | null
  updatedAt: string
  /** Users GitHub asked to review (pending still listed here). */
  requestedReviewers?: { login: string; avatarUrl?: string | null }[] | null
  /** Teams requested for review. */
  requestedTeams?: { name: string; slug: string }[] | null
  /** Submitted reviews (latest per user; from pulls.listReviews). */
  reviewSubmissions?: { login: string; avatarUrl: string | null; state: string; submittedAt: string | null }[] | null
}

type PrCommitRow = {
  sha: string
  message: string
  author?: string | null
  date?: string | null
}

type PrFile = {
  filename: string
  status: string
  patch: string | null
  patchTruncated: boolean
  additions: number
  deletions: number
  blobUrl: string | null
}

type PrComment = {
  kind: 'issue' | 'review' | 'inline'
  id: number
  body: string
  userLogin: string | null
  userAvatarUrl: string | null
  createdAt: string
  updatedAt: string
  htmlUrl: string | null
  reviewState: string | null
  filePath?: string | null
}

type ConfirmKind = 'approve' | 'merge' | 'reload' | 'comment' | 'github' | 'folder' | 'githubFiles' | 'alertFilesLink'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  prRepo: PrRepo | null
  prNumber: number | null
  onAfterChange?: () => void
}

function openUrl(url: string): void {
  void window.api.system.open_external_url(url)
}

function githubCommitPageUrl(owner: string, repo: string, fullSha: string): string {
  return `https://github.com/${owner}/${repo}/commit/${fullSha}`
}

function firstLineOfCommitMessage(s: string): string {
  const i = s.indexOf('\n')
  return i === -1 ? s : s.slice(0, i)
}

function prFilesTabUrl(pullHtmlUrl: string): string {
  const u = pullHtmlUrl.replace(/\/$/, '')
  if (u.includes('/pull/') && !u.endsWith('/files')) {
    return `${u}/files`
  }
  return u
}

function reviewStateLabel(state: string, t: TFunction): string {
  const s = state.toUpperCase()
  if (s === 'APPROVED') return t('prManager.detail.reviewState.APPROVED')
  if (s === 'CHANGES_REQUESTED') return t('prManager.detail.reviewState.CHANGES_REQUESTED')
  if (s === 'COMMENTED') return t('prManager.detail.reviewState.COMMENTED')
  if (s === 'DISMISSED') return t('prManager.detail.reviewState.DISMISSED')
  return state
}

function issueToConversationEntry(c: {
  id: number
  body: string
  userLogin: string | null
  userAvatarUrl: string | null
  createdAt: string
  updatedAt: string
  htmlUrl: string | null
}): PrComment {
  return {
    kind: 'issue',
    id: c.id,
    body: c.body,
    userLogin: c.userLogin,
    userAvatarUrl: c.userAvatarUrl,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    htmlUrl: c.htmlUrl,
    reviewState: null,
  }
}

function reviewStateBadgeClass(state: string): string {
  const s = state.toUpperCase()
  if (s === 'APPROVED') return 'bg-emerald-500/20 text-emerald-900 dark:text-emerald-100'
  if (s === 'CHANGES_REQUESTED') return 'bg-amber-500/20 text-amber-950 dark:text-amber-100'
  if (s === 'COMMENTED') return 'bg-slate-500/15 text-slate-800 dark:text-slate-200'
  if (s === 'DISMISSED') return 'text-muted-foreground line-through'
  return 'bg-muted text-foreground/85'
}

/**
 * `mergeable_state` from GitHub (pulls.get): whether head merges cleanly into base
 * (clean, dirty, blocked, behind, ...). May be "unknown" while computing or when not applicable.
 */
/** `mergeable_state` dirty/conflict: GitHub không tự cấp từng file; cần merge-tree (local) hoặc mở web. */
function prMergeableIsConflict(mergeableState: string | null | undefined): boolean {
  const s = (mergeableState || '').toLowerCase().trim()
  return s === 'dirty' || s === 'conflict'
}

function mergeableStateForSubtitle(pr: PrSummary, t: TFunction): { label: string; title: string } {
  const raw = pr.mergeableState
  const tUnknown = t('prManager.detail.mergeableHelp')
  if (raw == null) {
    if (pr.merged || pr.state === 'closed') {
      return { label: '—', title: tUnknown }
    }
    return { label: '—', title: t('prManager.detail.mergeableHelpNull', { help: tUnknown }) }
  }
  const lower = String(raw).toLowerCase()
  if (lower === 'unknown') {
    if (pr.merged || pr.state === 'closed') {
      return { label: '—', title: tUnknown }
    }
    return {
      label: t('prManager.detail.mergeableLabelUnknown'),
      title: t('prManager.detail.mergeableHelpOpen', { help: tUnknown }),
    }
  }
  return { label: String(raw), title: t('prManager.detail.mergeableCurrent', { help: tUnknown, value: String(raw) }) }
}

function prLifecycleBadge(pr: PrSummary, t: TFunction): { label: string; className: string; title: string } {
  const kind = prSummaryToGhStatusKind(pr)
  return {
    label: t(`prManager.ghStatus.${kind}`),
    className: PR_GH_STATUS_BADGE_CLASS[kind],
    title: t(`prManager.ghStatus.tooltips.${kind}`),
  }
}

/** Mergeable badge (open PRs only, not draft). */
function mergeableBadgeForPr(pr: PrSummary, t: TFunction): { label: string; className: string; title: string } | null {
  if (pr.merged || pr.state === 'closed' || pr.draft) return null
  const meta = mergeableStateForSubtitle(pr, t)
  const raw = pr.mergeableState
  const lower = raw == null ? '' : String(raw).toLowerCase()
  let className = 'bg-muted/65 text-foreground/90'
  if (lower === 'clean') {
    className = 'bg-emerald-500/18 text-emerald-900 dark:text-emerald-100'
  } else if (['dirty', 'blocked', 'behind', 'unstable'].includes(lower)) {
    className = 'bg-amber-500/20 text-amber-950 dark:text-amber-50'
  } else if (lower === 'unknown') {
    className = 'bg-slate-500/18 text-slate-800 dark:text-slate-200'
  }
  return { label: meta.label, className, title: meta.title }
}

/** One-line summary when the reviewers block is collapsed. */
function reviewerSummaryLine(pr: PrSummary, t: TFunction): string {
  const bits: string[] = []
  if (pr.author) bits.push(`@${pr.author}`)
  const nReq = pr.requestedReviewers?.length ?? 0
  if (nReq > 0) bits.push(t('prManager.detail.reviewRequested', { count: nReq }))
  const nTeam = pr.requestedTeams?.length ?? 0
  if (nTeam > 0) bits.push(t('prManager.detail.teamCount', { count: nTeam }))
  const nSub = pr.reviewSubmissions?.length ?? 0
  if (nSub > 0) bits.push(t('prManager.detail.submittedReviews', { count: nSub }))
  if (bits.length === 0) return t('prManager.detail.noAuthorFromApi')
  return bits.join(' · ')
}

/** Accordion lead: icon and tint from submitted review states (changes requested over approval). */
function reviewAccordionLead(
  pr: PrSummary,
  t: TFunction
): {
  Icon: LucideIcon
  boxClass: string
  iconClass: string
  tooltip: string
} {
  const subs = pr.reviewSubmissions
  if (!subs?.length) {
    return {
      Icon: Users,
      boxClass: 'bg-primary/10 text-primary',
      iconClass: 'h-4 w-4',
      tooltip: t('prManager.detail.noSubmittedReviews'),
    }
  }
  const up = (s: string) => s.toUpperCase()
  const has = (st: string) => subs.some(x => up(x.state) === st)
  const parts: string[] = []
  if (has('CHANGES_REQUESTED')) parts.push(t('prManager.detail.reviewParts.changesRequested'))
  if (has('APPROVED')) parts.push(t('prManager.detail.reviewParts.approved'))
  if (has('COMMENTED')) parts.push(t('prManager.detail.reviewParts.comment'))
  if (has('DISMISSED')) parts.push(t('prManager.detail.reviewParts.dismissed'))
  const tip = parts.length ? parts.join(' · ') : t('prManager.detail.reviewsOnGithub')

  if (has('CHANGES_REQUESTED')) {
    return {
      Icon: AlertCircle,
      boxClass: 'bg-amber-500/18 text-amber-600 dark:text-amber-400',
      iconClass: 'h-[1.15rem] w-[1.15rem]',
      tooltip: tip,
    }
  }
  if (has('APPROVED')) {
    return {
      Icon: CheckCircle2,
      boxClass: 'bg-emerald-500/18 text-emerald-600 dark:text-emerald-400',
      iconClass: 'h-[1.15rem] w-[1.15rem]',
      tooltip: tip,
    }
  }
  if (has('COMMENTED')) {
    return {
      Icon: MessageCircle,
      boxClass: 'bg-slate-500/14 text-slate-700 dark:text-slate-200',
      iconClass: 'h-4 w-4',
      tooltip: tip,
    }
  }
  if (has('DISMISSED')) {
    return {
      Icon: CircleOff,
      boxClass: 'bg-muted text-muted-foreground',
      iconClass: 'h-4 w-4',
      tooltip: tip,
    }
  }
  return {
    Icon: CheckCircle2,
    boxClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    iconClass: 'h-[1.15rem] w-[1.15rem]',
    tooltip: tip,
  }
}

/** Unified diff line colors (editor-style). */
function patchLineClass(line: string): string {
  if (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('new file') ||
    line.startsWith('deleted file') ||
    line.startsWith('similarity') ||
    line.startsWith('Binary files') ||
    line.startsWith('rename ')
  ) {
    return 'text-muted-foreground'
  }
  if (line.startsWith('---') || line.startsWith('+++')) {
    return 'text-sky-700/95 dark:text-sky-300/95'
  }
  if (line.startsWith('@@')) {
    return 'bg-blue-500/10 font-medium text-blue-800 dark:text-blue-200'
  }
  if (line.startsWith('+')) {
    return 'bg-emerald-500/[0.12] text-emerald-800 dark:text-emerald-200'
  }
  if (line.startsWith('-')) {
    return 'bg-rose-500/[0.12] text-rose-800 dark:text-rose-200'
  }
  if (line.startsWith('\\')) {
    return 'text-muted-foreground italic'
  }
  return 'text-foreground/88'
}

function DiffPatchBlock({ patch }: { patch: string }) {
  const lines = patch.split('\n')
  return (
    <div
      className={cn(
        'max-h-[min(50vh,360px)] min-w-0 max-w-full overflow-x-auto',
        'rounded border border-border/50 bg-[hsl(220_14%_96%_/_0.5)] font-mono text-[11px] leading-[1.45] [font-variant-ligatures:none] dark:bg-[hsl(220_14%_8%_/_0.4)]'
      )}
    >
      {lines.map((line, i) => (
        <div key={i} className={cn('min-h-[1.35em] w-full min-w-0 whitespace-pre pl-0.5', patchLineClass(line))}>
          {line || '\u00a0'}
        </div>
      ))}
    </div>
  )
}

function HeaderIconBtn({ label, disabled, onRequest, children, className }: { label: string; disabled?: boolean; onRequest: () => void; children: ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className={cn('h-8 w-8 shrink-0', className)} disabled={disabled} onClick={onRequest} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs max-w-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function HeaderToolbarSep() {
  return <div className="mx-1.5 h-5 w-px shrink-0 self-center bg-border/90" aria-hidden />
}

function HeaderMetaSep() {
  return <div className="h-4 w-px shrink-0 self-center bg-border/70" aria-hidden />
}

export function PrDetailDialog({ open, onOpenChange, projectId, prRepo, prNumber, onAfterChange }: Props) {
  const { t, i18n } = useTranslation()
  const dateLoc = getDateFnsLocale(i18n.language) as Locale
  const [loading, setLoading] = useState(false)
  const [pr, setPr] = useState<PrSummary | null>(null)
  const [files, setFiles] = useState<PrFile[]>([])
  const [comments, setComments] = useState<PrComment[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [approving, setApproving] = useState(false)
  const [markingReady, setMarkingReady] = useState(false)
  const [markingDraft, setMarkingDraft] = useState(false)
  const [updatingBranch, setUpdatingBranch] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [fileOpen, setFileOpen] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null)
  const [detailTab, setDetailTab] = useState<'conversation' | 'commits' | 'files'>('conversation')
  const [commits, setCommits] = useState<PrCommitRow[]>([])
  const [reviewersBlockOpen, setReviewersBlockOpen] = useState(false)
  const [commitResetTarget, setCommitResetTarget] = useState<{ sha: string; shortSha: string; message: string } | null>(null)
  const [commitForcePushOpen, setCommitForcePushOpen] = useState(false)
  const [commitBusySha, setCommitBusySha] = useState<string | null>(null)
  const [localMergeConflict, setLocalMergeConflict] = useState<{
    loading: boolean
    hasConflict: boolean
    paths: string[] | null
    localSaysClean: boolean
    noLocal: boolean
    err: string | null
  }>({ loading: false, hasConflict: false, paths: null, localSaysClean: false, noLocal: false, err: null })

  const canLocalBranchOps = Boolean(prRepo?.localPath && pr?.head)
  const headBranch = pr?.head?.trim() ?? ''

  const load = useCallback(async () => {
    if (!prRepo || prNumber == null) return
    setLoading(true)
    try {
      const [a, b, c, d] = await Promise.all([
        window.api.pr.prGet({ owner: prRepo.owner, repo: prRepo.repo, number: prNumber }),
        window.api.pr.prFilesList({ owner: prRepo.owner, repo: prRepo.repo, number: prNumber }),
        window.api.pr.prIssueCommentsList({ owner: prRepo.owner, repo: prRepo.repo, number: prNumber }),
        window.api.pr.prGetCommits({ owner: prRepo.owner, repo: prRepo.repo, number: prNumber }),
      ])
      if (a.status === 'success' && a.data) {
        setPr(a.data as PrSummary)
      } else {
        setPr(null)
        toast.error(a.message || t('prManager.detail.toastLoad'))
      }
      if (b.status === 'success' && b.data) {
        setFiles(b.data)
      } else {
        setFiles([])
        if (b.status === 'error') toast.error(b.message || t('prManager.detail.toastFiles'))
      }
      if (c.status === 'success' && c.data) {
        setComments(c.data as PrComment[])
      } else {
        setComments([])
        if (c.status === 'error') {
          toast.error(c.message || t('prManager.detail.toastComments'))
        }
      }
      if (d.status === 'success' && d.data) {
        setCommits(d.data as PrCommitRow[])
      } else {
        setCommits([])
        if (d.status === 'error') {
          toast.error(d.message || t('prManager.detail.toastCommits'))
        }
      }
    } finally {
      setLoading(false)
    }
  }, [prNumber, prRepo, t])

  useEffect(() => {
    if (open && prRepo && prNumber != null) {
      setCommentDraft('')
      setFileOpen(null)
      setDetailTab('conversation')
      setReviewersBlockOpen(false)
      void load()
    } else {
      setPr(null)
      setFiles([])
      setComments([])
      setCommits([])
      setCommitResetTarget(null)
      setCommitForcePushOpen(false)
      setCommitBusySha(null)
      setMarkingReady(false)
      setUpdatingBranch(false)
    }
  }, [open, prNumber, prRepo, load])

  useEffect(() => {
    if (!open || !pr || prNumber == null) {
      setLocalMergeConflict({ loading: false, hasConflict: false, paths: null, localSaysClean: false, noLocal: false, err: null })
      return
    }
    if (!prMergeableIsConflict(pr.mergeableState)) {
      setLocalMergeConflict({ loading: false, hasConflict: false, paths: null, localSaysClean: false, noLocal: false, err: null })
      return
    }
    if (!prRepo?.localPath) {
      setLocalMergeConflict({
        loading: false,
        hasConflict: false,
        paths: null,
        localSaysClean: false,
        noLocal: true,
        err: null,
      })
      return
    }
    if (!pr.headSha) {
      setLocalMergeConflict({
        loading: false,
        hasConflict: false,
        paths: null,
        localSaysClean: false,
        noLocal: false,
        err: t('prManager.detail.noHeadSha'),
      })
      return
    }
    setLocalMergeConflict({
      loading: true,
      hasConflict: false,
      paths: null,
      localSaysClean: false,
      noLocal: false,
      err: null,
    })
    void window.api.pr
      .prLocalMergeConflicts({ repoId: prRepo.id, prNumber, base: pr.base, headSha: pr.headSha })
      .then(res => {
        if (res.status === 'success' && res.data) {
          setLocalMergeConflict({
            loading: false,
            hasConflict: res.data.hasConflict,
            paths: res.data.paths,
            localSaysClean: res.data.localSaysClean,
            noLocal: false,
            err: null,
          })
        } else if (res.status === 'unavailable' && (res as { reason?: string }).reason === 'noLocalPath') {
          setLocalMergeConflict({
            loading: false,
            hasConflict: false,
            paths: null,
            localSaysClean: false,
            noLocal: true,
            err: null,
          })
        } else if (res.status === 'unavailable') {
          setLocalMergeConflict({
            loading: false,
            hasConflict: false,
            paths: null,
            localSaysClean: false,
            noLocal: false,
            err: (res as { message: string }).message,
          })
        } else {
          setLocalMergeConflict({
            loading: false,
            hasConflict: false,
            paths: null,
            localSaysClean: false,
            noLocal: false,
            err: (res as { message?: string }).message ?? t('prManager.detail.mergeConflictFileListError'),
          })
        }
      })
      .catch((e: unknown) => {
        setLocalMergeConflict({
          loading: false,
          hasConflict: false,
          paths: null,
          localSaysClean: false,
          noLocal: false,
          err: e instanceof Error ? e.message : String(e),
        })
      })
  }, [open, pr, prNumber, prRepo, t])

  const doSendComment = async () => {
    if (!prRepo || prNumber == null) return
    const b = commentDraft.trim()
    if (!b) return
    setSending(true)
    try {
      const res = await window.api.pr.prIssueCommentCreate({
        owner: prRepo.owner,
        repo: prRepo.repo,
        number: prNumber,
        body: b,
      })
      if (res.status === 'success' && res.data) {
        const newComment = res.data as {
          id: number
          body: string
          userLogin: string | null
          userAvatarUrl: string | null
          createdAt: string
          updatedAt: string
          htmlUrl: string | null
        }
        setCommentDraft('')
        setComments(prev => [...prev, issueToConversationEntry(newComment)])
        onAfterChange?.()
        toast.success(t('prManager.detail.commentPosted'))
      } else {
        toast.error(res.message || t('prManager.detail.postFail'))
      }
    } finally {
      setSending(false)
    }
  }

  const doApprove = async () => {
    if (!prRepo || prNumber == null || !pr?.headSha) {
      toast.error(t('prManager.detail.noHeadSha'))
      return
    }
    setApproving(true)
    try {
      const res = await window.api.pr.prReviewApprove({
        owner: prRepo.owner,
        repo: prRepo.repo,
        number: prNumber,
        headSha: pr.headSha,
      })
      if (res.status === 'success') {
        toast.success(t('prManager.detail.approved'))
        onAfterChange?.()
        await load()
      } else {
        toast.error(res.message || t('prManager.detail.approveFail'))
      }
    } finally {
      setApproving(false)
    }
  }

  const doMarkReady = async () => {
    if (!prRepo || prNumber == null || !pr?.draft) return
    setMarkingReady(true)
    try {
      const res = await window.api.pr.prMarkReady({ owner: prRepo.owner, repo: prRepo.repo, number: prNumber })
      if (res.status === 'success') {
        toast.success(t('prManager.detail.markReady'))
        onAfterChange?.()
        await load()
      } else {
        toast.error(res.message || t('prManager.detail.stateFail'))
      }
    } finally {
      setMarkingReady(false)
    }
  }

  const doMarkDraft = async () => {
    if (!prRepo || prNumber == null || !pr || pr.draft || pr.state !== 'open' || pr.merged) return
    setMarkingDraft(true)
    try {
      const res = await window.api.pr.prMarkDraft({ owner: prRepo.owner, repo: prRepo.repo, number: prNumber })
      if (res.status === 'success') {
        toast.success(t('prManager.detail.markDraft'))
        onAfterChange?.()
        await load()
      } else {
        toast.error(res.message || t('prManager.detail.stateFail'))
      }
    } finally {
      setMarkingDraft(false)
    }
  }

  const doUpdateBranch = async () => {
    if (!prRepo || prNumber == null) return
    if (
      !pr ||
      pr.state !== 'open' ||
      pr.merged ||
      pr.draft ||
      String(pr.mergeableState ?? '')
        .toLowerCase()
        .trim() !== 'behind'
    ) {
      return
    }
    setUpdatingBranch(true)
    try {
      const res = await window.api.pr.prUpdateBranch({
        owner: prRepo.owner,
        repo: prRepo.repo,
        number: prNumber,
        expectedHeadSha: pr?.headSha ?? null,
      })
      if (res.status === 'success') {
        toast.success(t('prManager.detail.updateBranch'))
        onAfterChange?.()
        await load()
      } else {
        toast.error(res.message || t('prManager.detail.branchUpdateFail'))
      }
    } finally {
      setUpdatingBranch(false)
    }
  }

  const doCommitResetHard = async () => {
    if (!commitResetTarget || !prRepo || !headBranch) return
    setCommitBusySha(commitResetTarget.sha)
    try {
      const res = await window.api.pr.branchResetHard({ repoId: prRepo.id, branch: headBranch, sha: commitResetTarget.sha })
      if (res.status === 'success') {
        toast.success(res.message || t('prManager.detail.resetOk', { sha: commitResetTarget.shortSha }))
        setCommitResetTarget(null)
        onAfterChange?.()
        await load()
      } else {
        toast.error(res.message || t('prManager.detail.resetFail'))
        setCommitResetTarget(null)
      }
    } finally {
      setCommitBusySha(null)
    }
  }

  const doCommitForcePush = async () => {
    if (!prRepo || !headBranch) return
    setCommitBusySha('__push__')
    try {
      const res = await window.api.pr.branchForcePush({ repoId: prRepo.id, branch: headBranch })
      if (res.status === 'success') {
        toast.success(res.message || t('prManager.detail.forcePushOk'))
        onAfterChange?.()
        await load()
      } else {
        toast.error(res.message || t('prManager.detail.forcePushFail'))
      }
    } finally {
      setCommitBusySha(null)
      setCommitForcePushOpen(false)
    }
  }

  /** Cùng tiêu chí PrBoard / bulk: dirty, conflict, blocked, behind, unstable, unknown → không bật Merge. */
  const mergeBlockedByMergeable = Boolean(pr && githubMergeableBlocksMerge(pr.mergeableState))
  const canMergeUi = Boolean(
    pr && pr.state === 'open' && !pr.merged && !pr.draft && !mergeBlockedByMergeable
  )
  const canApprove = Boolean(pr && pr.state === 'open' && !pr.merged && !pr.draft && pr.headSha)
  const isPrBranchBehind =
    pr &&
    pr.state === 'open' &&
    !pr.merged &&
    !pr.draft &&
    String(pr.mergeableState ?? '')
      .toLowerCase()
      .trim() === 'behind'

  const canMarkDraft = Boolean(pr && pr.state === 'open' && !pr.merged && !pr.draft)

  const showHeaderBranchGroup = pr != null && (detailTab === 'commits' || (pr.draft && pr.state === 'open') || isPrBranchBehind || canMarkDraft)

  return (
    <TooltipProvider delayDuration={200}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="font-sans flex max-h-[min(90dvh,920px)] min-h-0 !max-w-6xl flex-col gap-0 overflow-hidden p-0"
          onOpenAutoFocus={e => e.preventDefault()}
          onPointerDownOutside={e => e.preventDefault()}
          onEscapeKeyDown={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 space-y-0 border-b px-4 py-2.5 pr-12 text-left">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                {(() => {
                  const life = pr ? prLifecycleBadge(pr, t) : null
                  const mergeB = pr ? mergeableBadgeForPr(pr, t) : null
                  const titleText = pr
                    ? loading
                      ? t('prManager.detail.loading')
                      : pr.title?.trim() || t('prManager.detail.pullRequest')
                    : loading
                      ? t('prManager.detail.loading')
                      : t('prManager.detail.pullRequest')
                  return (
                    <div className="flex w-full min-w-0 max-w-full flex-nowrap items-center gap-x-2.5 pr-1">
                      {life ? (
                        <Badge
                          variant="secondary"
                          className={cn('h-6 min-h-6 max-w-[min(7rem,22vw)] shrink-0 border-0 px-2 py-0 text-xs font-semibold leading-6 shadow-none', life.className)}
                          title={life.title}
                        >
                          <span className="block truncate">{life.label}</span>
                        </Badge>
                      ) : null}
                      {prNumber != null ? (
                        <Badge
                          asChild
                          variant="secondary"
                          className="!w-fit h-6 min-h-6 shrink-0 border-0 bg-primary/16 p-0 text-xs font-semibold leading-6 text-primary shadow-none tabular-nums"
                        >
                          <button
                            type="button"
                            title={t('prManager.detail.openOnGithub')}
                            disabled={!pr?.htmlUrl}
                            className="inline-flex h-6 w-fit shrink-0 items-center justify-center rounded-full px-2.5 py-0 text-inherit hover:bg-primary/22 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => setConfirm('github')}
                          >
                            #{prNumber}
                          </button>
                        </Badge>
                      ) : null}
                      {mergeB ? (
                        <Badge
                          variant="secondary"
                          className={cn('h-6 min-h-6 min-w-0 max-w-[min(11rem,32vw)] shrink-0 border-0 px-2 py-0 text-xs font-medium leading-6 shadow-none', mergeB.className)}
                          title={mergeB.title}
                        >
                          <span className="block truncate">{mergeB.label}</span>
                        </Badge>
                      ) : null}
                      {pr ? (
                        <DialogTitle
                          className="m-0 min-h-0 max-w-full min-w-0 flex-1 basis-0 truncate pr-0 text-left text-base !font-semibold !leading-6 tracking-tight sm:text-lg"
                          title={!loading && (pr.title?.trim() ?? '') ? (pr.title ?? undefined) : undefined}
                        >
                          {titleText}
                        </DialogTitle>
                      ) : (
                        <DialogTitle className="m-0 min-h-0 max-w-full min-w-0 flex-1 basis-0 truncate pr-0 text-left text-base !font-semibold !leading-6 sm:text-lg">
                          {titleText}
                        </DialogTitle>
                      )}
                    </div>
                  )
                })()}
                {pr ? (
                  <DialogDescription asChild>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                      <div className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
                        <Badge
                          variant="secondary"
                          className="h-6 min-h-6 max-w-[min(100%,14rem)] border-0 bg-muted/80 px-2 py-0 text-xs font-medium leading-tight text-foreground/90 shadow-none [overflow-wrap:anywhere] break-words"
                          title={t('prManager.detail.head', { name: pr.head })}
                        >
                          {pr.head}
                        </Badge>
                        <span className="shrink-0 select-none text-xs text-muted-foreground/80" aria-hidden>
                          →
                        </span>
                        <Badge
                          variant="secondary"
                          className="h-6 min-h-6 max-w-[min(100%,14rem)] border-0 bg-muted/80 px-2 py-0 text-xs font-medium leading-tight text-foreground/90 shadow-none [overflow-wrap:anywhere] break-words"
                          title={t('prManager.detail.base', { name: pr.base })}
                        >
                          {pr.base}
                        </Badge>
                      </div>
                      {pr.updatedAt ? (
                        <>
                          <HeaderMetaSep />
                          <span className="shrink-0 text-xs leading-snug text-muted-foreground/90">
                            {t('prManager.detail.updated', {
                              time: formatDistanceToNow(new Date(pr.updatedAt), { addSuffix: true, locale: dateLoc }),
                            })}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </DialogDescription>
                ) : null}
              </div>
              {pr && (
                <div className="flex min-w-0 max-w-full shrink-0 flex-wrap items-center justify-end gap-y-1 pl-1">
                  <div className="flex items-center gap-0.5">
                    <HeaderIconBtn label={t('prManager.detail.reloadPr')} onRequest={() => setConfirm('reload')} disabled={loading}>
                      {loading ? <GlowLoader className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </HeaderIconBtn>
                  </div>
                  {showHeaderBranchGroup ? (
                    <>
                      <HeaderToolbarSep />
                      <div className="flex items-center gap-0.5">
                        {detailTab === 'commits' ? (
                          <HeaderIconBtn
                            label={t('prManager.detail.forcePush', { branch: headBranch || '…' })}
                            disabled={!canLocalBranchOps || !headBranch || commitBusySha !== null}
                            onRequest={() => setCommitForcePushOpen(true)}
                            className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                          >
                            {commitBusySha === '__push__' ? <GlowLoader className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                          </HeaderIconBtn>
                        ) : null}
                        {canMarkDraft ? (
                          <HeaderIconBtn
                            label={t('prManager.detail.markDraftLabel')}
                            disabled={!prRepo || markingDraft}
                            onRequest={() => void doMarkDraft()}
                            className="text-amber-600 hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-400/95 dark:hover:bg-amber-500/15 dark:hover:text-amber-300"
                          >
                            {markingDraft ? <GlowLoader className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
                          </HeaderIconBtn>
                        ) : null}
                        {pr.draft && pr.state === 'open' ? (
                          <HeaderIconBtn
                            label={t('prManager.detail.markReadyLabel')}
                            disabled={!prRepo || markingReady}
                            onRequest={() => void doMarkReady()}
                            className="text-sky-600 hover:bg-sky-500/10 hover:text-sky-800 dark:text-sky-400 dark:hover:bg-sky-500/15 dark:hover:text-sky-300"
                          >
                            {markingReady ? <GlowLoader className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                          </HeaderIconBtn>
                        ) : null}
                        {isPrBranchBehind ? (
                          <HeaderIconBtn
                            label={t('prManager.detail.updateBranchLabel')}
                            disabled={!prRepo || updatingBranch}
                            onRequest={() => void doUpdateBranch()}
                            className="text-violet-600 hover:bg-violet-500/10 hover:text-violet-800 dark:text-violet-400 dark:hover:bg-violet-500/15 dark:hover:text-violet-300"
                          >
                            {updatingBranch ? <GlowLoader className="h-3.5 w-3.5" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
                          </HeaderIconBtn>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                  <HeaderToolbarSep />
                  <div className="flex items-center gap-0.5">
                    <HeaderIconBtn label={t('prManager.detail.approveLabel')} onRequest={() => setConfirm('approve')} disabled={!canApprove || approving}>
                      {approving ? <GlowLoader className="h-3.5 w-3.5" /> : <BadgeCheck className="text-emerald-600 h-3.5 w-3.5" />}
                    </HeaderIconBtn>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mr-2 h-8 gap-1 border-emerald-600 px-2.5 text-sm text-emerald-700 hover:border-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-800 dark:border-emerald-500 dark:text-emerald-400 dark:hover:border-emerald-400 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300"
                      onClick={() => setConfirm('merge')}
                      disabled={!canMergeUi || !prRepo}
                      title={mergeBlockedByMergeable ? t('prManager.bulk.skip.mergeBlocked') : t('prManager.detail.mergeOnGithub')}
                    >
                      <GitMerge className="h-3.5 w-3.5" />
                      {t('prManager.detail.merge')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            {pr && (pr.additions != null || pr.deletions != null || pr.changedFiles != null) ? (
              <div className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
                {pr.changedFiles != null ? <span>{pr.changedFiles === 1 ? t('prManager.detail.file') : t('prManager.detail.file_plural', { count: pr.changedFiles })}</span> : null}
                {pr.additions != null && <span className="ml-1 text-emerald-600 dark:text-emerald-400">+{pr.additions}</span>}
                {pr.deletions != null && <span className="text-rose-600 dark:text-rose-400"> −{pr.deletions}</span>}
              </div>
            ) : null}
          </DialogHeader>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {pr && pr.state === 'open' && prMergeableIsConflict(pr.mergeableState) ? (
              <div className="shrink-0 border-b border-amber-500/25 bg-amber-500/[0.08] px-4 py-2.5 text-sm dark:bg-amber-500/10">
                <Alert className="border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100 [&>div]:!text-amber-950 dark:[&>div]:!text-amber-100">
                  <GitMergeConflict className="h-4 w-4 !text-amber-700 dark:!text-amber-200" />
                  <AlertTitle className="text-sm font-semibold">{t('prManager.detail.mergeConflictFileListTitle')}</AlertTitle>
                  <AlertDescription className="text-xs text-amber-900/90 dark:text-amber-100/90">
                    <p className="mb-1.5 leading-relaxed">{t('prManager.detail.mergeConflictFileListApiNote')}</p>
                    {localMergeConflict.loading ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <GlowLoader className="h-3.5 w-3.5 shrink-0" />
                        <span>{t('prManager.detail.mergeConflictFileListLoading')}</span>
                      </div>
                    ) : null}
                    {!localMergeConflict.loading && localMergeConflict.noLocal ? (
                      <p className="leading-relaxed text-amber-900/95 dark:text-amber-50/95">
                        {t('prManager.detail.mergeConflictFileListNoLocal')}
                      </p>
                    ) : null}
                    {!localMergeConflict.loading && !localMergeConflict.noLocal && localMergeConflict.err ? (
                      <p className="[overflow-wrap:anywhere] break-words leading-relaxed text-amber-900/95 dark:text-amber-50/95">
                        {localMergeConflict.err}
                      </p>
                    ) : null}
                    {!localMergeConflict.loading && !localMergeConflict.noLocal && !localMergeConflict.err && localMergeConflict.localSaysClean && !localMergeConflict.hasConflict ? (
                      <p className="leading-relaxed text-sky-900/95 dark:text-sky-100/95">
                        {t('prManager.detail.mergeConflictFileListLocalClean', { base: pr.base, head: pr.head })}
                      </p>
                    ) : null}
                    {!localMergeConflict.loading && !localMergeConflict.noLocal && !localMergeConflict.err && localMergeConflict.hasConflict && (localMergeConflict.paths?.length ?? 0) > 0 ? (
                      <ul className="mt-1.5 max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto rounded border border-amber-500/20 bg-background/50 px-2.5 py-1.5 font-mono text-[12px] leading-snug text-foreground/95">
                        {localMergeConflict.paths?.map(p => (
                          <li key={p} className="[overflow-wrap:anywhere] break-words" title={p}>
                            {p}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {!localMergeConflict.loading && !localMergeConflict.noLocal && !localMergeConflict.err && localMergeConflict.hasConflict && (localMergeConflict.paths?.length ?? 0) === 0 ? (
                      <p className="leading-relaxed text-amber-900/95 dark:text-amber-50/95">{t('prManager.detail.mergeConflictFileListNoPaths')}</p>
                    ) : null}
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}
            {loading && !pr ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <GlowLoader className="h-8 w-8" />
              </div>
            ) : pr ? (
              <Tabs
                value={detailTab}
                onValueChange={v => setDetailTab(v as 'conversation' | 'commits' | 'files')}
                className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden"
              >
                <div className="shrink-0 bg-muted/20 px-4 py-2">
                  <TabsList className="grid h-10 w-full min-w-0 max-w-full grid-cols-3 gap-0.5 p-0.5" variant="default">
                    <TabsTrigger value="conversation" className="gap-1.5 text-sm">
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                      {t('prManager.detail.tabConversation')}
                    </TabsTrigger>
                    <TabsTrigger value="commits" className="gap-1.5 text-sm">
                      <GitCommit className="h-3.5 w-3.5 shrink-0" />
                      {t('prManager.detail.tabCommits')}
                    </TabsTrigger>
                    <TabsTrigger value="files" className="gap-1.5 text-sm leading-snug sm:gap-2">
                      <FileCode className="h-3.5 w-3.5 shrink-0" />
                      <span className="max-w-[5.5rem] text-center sm:max-w-none">{t('prManager.detail.tabFiles')}</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent
                  value="conversation"
                  className="mt-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain [scrollbar-gutter:stable] outline-none data-[state=active]:mt-0"
                >
                  <div className="min-w-0 max-w-full space-y-3 px-4 py-3 pb-4">
                    <Collapsible open={reviewersBlockOpen} onOpenChange={setReviewersBlockOpen} className="overflow-hidden rounded-lg border border-border/60 bg-card/50 shadow-sm">
                      <CollapsibleTrigger
                        type="button"
                        className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2.5 text-left outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/50"
                        aria-label={reviewersBlockOpen ? t('prManager.detail.collapseReviewers') : t('prManager.detail.expandReviewers')}
                      >
                        {(() => {
                          const lead = reviewAccordionLead(pr, t)
                          const LeadIcon = lead.Icon
                          return (
                            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', lead.boxClass)} title={lead.tooltip}>
                              <LeadIcon className={cn(lead.iconClass, 'shrink-0')} aria-hidden />
                            </div>
                          )
                        })()}
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="text-xs font-semibold text-foreground/90 sm:text-sm">{t('prManager.detail.authorReviewers')}</div>
                          <p className="line-clamp-2 min-w-0 break-words text-sm leading-snug text-muted-foreground" title={reviewerSummaryLine(pr, t)}>
                            {reviewerSummaryLine(pr, t)}
                          </p>
                        </div>
                        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', reviewersBlockOpen && 'rotate-180')} />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="data-[state=closed]:animate-none">
                        <div className="space-y-3 border-t border-border/40 bg-muted/15 px-3 pb-3 pt-3 text-sm text-muted-foreground">
                          {pr.author ? (
                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="shrink-0 text-xs font-medium text-muted-foreground/95">{t('prManager.detail.author')}</span>
                              <span className="min-w-0 break-all text-sm text-foreground">@{pr.author}</span>
                            </div>
                          ) : null}
                          {pr.requestedReviewers && pr.requestedReviewers.length > 0 ? (
                            <div className="space-y-1.5">
                              <div className="text-xs font-medium text-muted-foreground/95">{t('prManager.detail.reviewRequestedUsers')}</div>
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                {pr.requestedReviewers.map(u => (
                                  <Tooltip key={u.login}>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex min-h-[2rem] items-center gap-1.5 rounded-md border border-border/55 bg-background/90 px-2 py-1 shadow-sm">
                                        <Avatar className="h-6 w-6">
                                          {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt="" /> : null}
                                          <AvatarFallback className="text-[10px]">{u.login.slice(0, 1).toUpperCase()}</AvatarFallback>
                                        </Avatar>
                                        <span className="max-w-[9rem] truncate text-sm text-foreground">@{u.login}</span>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-sm">
                                      {u.login}
                                    </TooltipContent>
                                  </Tooltip>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {pr.requestedTeams && pr.requestedTeams.length > 0 ? (
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="shrink-0 text-xs font-medium text-muted-foreground/95">{t('prManager.detail.teams')}</span>
                              {pr.requestedTeams.map(team => (
                                <span
                                  key={team.slug}
                                  className="max-w-full rounded-md border border-dashed border-border/70 bg-background/50 px-2 py-1 [overflow-wrap:anywhere] break-words text-sm text-foreground/95"
                                  title={team.slug}
                                >
                                  {team.name}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {pr.reviewSubmissions && pr.reviewSubmissions.length > 0 ? (
                            <ul className="min-w-0 space-y-1.5 pl-0">
                              <li className="list-none text-xs font-medium text-muted-foreground/95">{t('prManager.detail.submittedReviewsList')}</li>
                              {pr.reviewSubmissions.map(s => (
                                <li key={s.login} className="flex min-w-0 items-center gap-2 rounded-md border border-border/30 bg-background/50 py-1.5 pl-2 pr-1.5">
                                  <Avatar className="h-6 w-6 shrink-0">
                                    {s.avatarUrl ? <AvatarImage src={s.avatarUrl} alt="" /> : null}
                                    <AvatarFallback className="text-[10px]">{s.login.slice(0, 1).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={s.login}>
                                    @{s.login}
                                  </span>
                                  <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium', reviewStateBadgeClass(s.state))}>
                                    {reviewStateLabel(s.state, t)}
                                  </span>
                                  {s.submittedAt ? (
                                    <span className="shrink-0 text-xs text-muted-foreground" title={s.submittedAt}>
                                      {formatDistanceToNow(new Date(s.submittedAt), { addSuffix: true, locale: dateLoc })}
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : pr.state === 'open' && !pr.merged && !pr.draft ? (
                            <p className="text-sm italic text-muted-foreground/95">{t('prManager.detail.noReviewsYet')}</p>
                          ) : null}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    <section>
                      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/80 text-muted-foreground">
                          <MessageSquare className="h-4 w-4" />
                        </div>
                        {t('prManager.detail.discussion')}
                      </h3>
                      <p className="mb-2.5 pl-0 text-sm text-muted-foreground sm:pl-10">{t('prManager.detail.discussionHint')}</p>
                      <div className="mb-3 max-h-80 min-h-[3rem] space-y-3 overflow-y-auto rounded-lg border border-border/50 bg-card/30 p-3 text-sm shadow-sm sm:p-3.5">
                        {comments.length === 0 ? (
                          <p className="text-sm text-muted-foreground">{t('prManager.detail.noItems')}</p>
                        ) : (
                          comments.map(c => (
                            <div key={`${c.kind}-${c.id}`} className="flex gap-2.5 border-b border-border/35 pb-3 last:border-0 last:pb-0">
                              <Avatar className="h-8 w-8 shrink-0">
                                {c.userAvatarUrl ? <AvatarImage src={c.userAvatarUrl} alt="" /> : null}
                                <AvatarFallback className="text-xs">{(c.userLogin ?? '?').slice(0, 2).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                                  <span className="font-semibold text-foreground">{c.userLogin?.trim() ? c.userLogin : t('prManager.detail.unknownUser')}</span>
                                  {c.kind === 'issue' && (
                                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{t('prManager.detail.comment')}</span>
                                  )}
                                  {c.kind === 'review' && c.reviewState && (
                                    <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-medium', reviewStateBadgeClass(c.reviewState))}>
                                      {t('prManager.detail.review', { state: reviewStateLabel(c.reviewState, t) })}
                                    </span>
                                  )}
                                  {c.kind === 'inline' && (
                                    <span className="rounded-md bg-blue-500/15 px-1.5 py-0.5 text-xs font-medium text-blue-800 dark:text-blue-200">
                                      {t('prManager.detail.onDiff')}
                                    </span>
                                  )}
                                  {c.createdAt ? <span className="text-xs">· {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: dateLoc })}</span> : null}
                                  {c.htmlUrl && (
                                    <button
                                      type="button"
                                      className="shrink-0 text-xs font-medium text-primary underline underline-offset-2"
                                      onClick={() => c.htmlUrl && openUrl(c.htmlUrl)}
                                    >
                                      {t('prManager.detail.openOnGithub2')}
                                    </button>
                                  )}
                                </div>
                                {c.kind === 'inline' && c.filePath ? (
                                  <p className="pt-1 text-xs text-muted-foreground [overflow-wrap:anywhere] break-all sm:text-sm">{c.filePath}</p>
                                ) : null}
                                {c.body.trim() ? (
                                  <div className="whitespace-pre-wrap break-words pt-1.5 text-sm leading-relaxed text-foreground [overflow-wrap:anywhere] sm:text-base">
                                    {c.body}
                                  </div>
                                ) : c.kind === 'review' ? (
                                  <p className="pt-1.5 text-sm italic text-muted-foreground">{t('prManager.detail.emptyReview')}</p>
                                ) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <Textarea
                        placeholder={t('prManager.detail.commentPlaceholder')}
                        value={commentDraft}
                        onChange={e => setCommentDraft(e.target.value)}
                        className="min-h-[80px] resize-y text-base"
                        disabled={sending}
                      />
                      <div className="mt-2 flex justify-end">
                        <Button type="button" size="default" className="text-sm" onClick={() => setConfirm('comment')} disabled={sending || !commentDraft.trim()}>
                          {sending ? <GlowLoader className="h-4 w-4" /> : t('prManager.detail.postComment')}
                        </Button>
                      </div>
                    </section>
                  </div>
                </TabsContent>

                <TabsContent value="commits" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden overflow-x-hidden outline-none data-[state=active]:mt-0">
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 px-4 py-3 pb-4">
                    <p className="shrink-0 text-xs text-muted-foreground">{t('prManager.detail.commitsLead', { count: commits.length })}</p>
                    {!canLocalBranchOps && prRepo ? (
                      <p className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-900 dark:text-amber-100">
                        {t('prManager.detail.resetNeedsLocal')}
                      </p>
                    ) : null}
                    {commits.length === 0 ? (
                      <p className="shrink-0 text-sm text-muted-foreground">{t('prManager.detail.noCommitData')}</p>
                    ) : prRepo ? (
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border/60">
                        <div className="min-h-0 min-w-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
                          <Table wrapperClassName="min-w-0">
                            <colgroup>
                              <col style={{ width: '6.5rem' }} />
                              <col className="w-full" style={{ minWidth: '12rem' }} />
                              <col style={{ minWidth: '7.5rem' }} />
                              <col style={{ minWidth: '7.5rem' }} />
                              <col style={{ width: '44px' }} />
                            </colgroup>
                            <TableHeader sticky>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="whitespace-nowrap !text-[var(--table-header-fg)] text-sm">{t('prManager.detail.hash')}</TableHead>
                                <TableHead className="!text-[var(--table-header-fg)] text-sm">{t('prManager.detail.message')}</TableHead>
                                <TableHead className="whitespace-nowrap !text-[var(--table-header-fg)] text-sm sm:text-left">{t('prManager.detail.author')}</TableHead>
                                <TableHead className="whitespace-nowrap !text-[var(--table-header-fg)] text-sm text-right sm:text-left">{t('prManager.detail.time')}</TableHead>
                                <TableHead className="!text-[var(--table-header-fg)]" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {commits.map(c => {
                                const fullMsg = (c.message || '').trim()
                                const subject = firstLineOfCommitMessage(fullMsg) || '—'
                                const shortSha = c.sha.slice(0, 7)
                                const commitUrl = githubCommitPageUrl(prRepo.owner, prRepo.repo, c.sha)
                                const isBusy = commitBusySha === c.sha
                                const timeLabel = c.date != null ? formatDistanceToNow(new Date(c.date), { addSuffix: true, locale: dateLoc }) : '—'
                                return (
                                  <TableRow key={c.sha} className="align-middle">
                                    <TableCell className="whitespace-nowrap py-2.5 text-sm tabular-nums tracking-tight">
                                      <button
                                        type="button"
                                        onClick={() => openUrl(commitUrl)}
                                        className="inline-flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-400"
                                        title={c.sha}
                                      >
                                        {shortSha}
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                      </button>
                                    </TableCell>
                                    <TableCell className="overflow-hidden py-2.5" style={{ maxWidth: 0 }}>
                                      <Tooltip delayDuration={300}>
                                        <TooltipTrigger asChild>
                                          <div className="w-full cursor-default truncate text-left text-sm text-foreground">{subject}</div>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" align="start" className="max-h-[min(50vh,320px)] max-w-md overflow-y-auto whitespace-pre-wrap break-words">
                                          {fullMsg || '—'}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TableCell>
                                    <TableCell className="max-w-[12rem] truncate py-2.5 text-left text-sm text-foreground/90" title={c.author ?? undefined}>
                                      {c.author?.trim() || '—'}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap py-2.5 text-right text-sm text-muted-foreground sm:text-left" title={c.date ?? undefined}>
                                      {timeLabel}
                                    </TableCell>
                                    <TableCell className="py-1.5">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-amber-600"
                                            disabled={!canLocalBranchOps || commitBusySha !== null}
                                            onClick={() => setCommitResetTarget({ sha: c.sha, shortSha, message: subject })}
                                          >
                                            {isBusy ? <GlowLoader className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{t('prManager.detail.resetTooltip', { sha: shortSha })}</TooltipContent>
                                      </Tooltip>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </TabsContent>

                <TabsContent
                  value="files"
                  className="mt-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain [scrollbar-gutter:stable] outline-none data-[state=active]:mt-0"
                >
                  <div className="min-w-0 max-w-full space-y-3 px-4 py-3 pb-4">
                    {files.some(f => f.patchTruncated) && pr.htmlUrl ? (
                      <Alert className="border-amber-500/40 bg-amber-500/10" variant="default">
                        <Info className="h-4 w-4" />
                        <AlertTitle className="text-sm">{t('prManager.detail.truncatedTitle')}</AlertTitle>
                        <AlertDescription className="text-sm">
                          {t('prManager.detail.truncatedDesc')}{' '}
                          <button type="button" className="font-medium underline underline-offset-2" onClick={() => setConfirm('githubFiles')}>
                            {t('prManager.detail.openFilesTab')}
                          </button>
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    <div className="space-y-1.5">
                      {files.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('prManager.detail.noFileData')}</p>
                      ) : (
                        files.map(f => {
                          const key = f.filename
                          const isO = fileOpen === key
                          return (
                            <Collapsible
                              key={key}
                              open={isO}
                              onOpenChange={o => setFileOpen(o ? key : null)}
                              className="overflow-hidden rounded-lg border border-border/60 bg-card/30"
                            >
                              <CollapsibleTrigger className="flex w-full min-w-0 items-start gap-2 px-2.5 py-2 text-left text-xs font-medium hover:bg-muted/50" type="button">
                                <span className="min-w-0 flex-1 [overflow-wrap:anywhere] break-words pr-1 text-left leading-snug" title={f.filename}>
                                  {f.filename}
                                </span>
                                <span className="mt-0.5 max-w-[48%] shrink-0 text-right text-[10px] leading-tight text-muted-foreground sm:max-w-[40%]">
                                  {f.status}
                                  {f.patchTruncated && (
                                    <span className="ml-1 text-amber-700 dark:text-amber-300" title={t('prManager.detail.patchTruncated')}>
                                      [{t('prManager.detail.patchTruncated')}]
                                    </span>
                                  )}
                                  {f.additions > 0 && <span className="text-emerald-600"> +{f.additions}</span>}
                                  {f.deletions > 0 && <span className="text-rose-600"> −{f.deletions}</span>}
                                </span>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="border-t border-border/40 p-1.5 pt-0">
                                  {!f.patch ? (
                                    <p className="pt-1 text-xs text-amber-800 dark:text-amber-200">
                                      {t('prManager.detail.noPatch')}{' '}
                                      {f.blobUrl ? (
                                        <button type="button" className="underline" onClick={() => f.blobUrl && openUrl(f.blobUrl)}>
                                          {t('prManager.detail.onGithub')}
                                        </button>
                                      ) : null}
                                    </p>
                                  ) : (
                                    <div className="pt-1">
                                      <DiffPatchBlock patch={f.patch} />
                                    </div>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          )
                        })
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={o => {
          if (!o) setConfirm(null)
        }}
      >
        <AlertDialogContent size="default" className="font-sans sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm != null ? t(`prManager.detail.confirm.${confirm}.title`) : null}</AlertDialogTitle>
            <AlertDialogDescription>{confirm != null ? t(`prManager.detail.confirm.${confirm}.desc`) : null}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => {
                e.preventDefault()
                const k = confirm
                setConfirm(null)
                if (!k) return
                if (k === 'reload') void load()
                else if (k === 'approve') void doApprove()
                else if (k === 'merge') setMergeOpen(true)
                else if (k === 'comment') void doSendComment()
                else if (k === 'github' && pr?.htmlUrl) openUrl(pr.htmlUrl)
                else if (k === 'githubFiles' && pr?.htmlUrl) openUrl(prFilesTabUrl(pr.htmlUrl))
                else if (k === 'folder' && prRepo?.localPath) void window.api.system.open_folder_in_explorer(prRepo.localPath)
                else if (k === 'alertFilesLink' && pr?.htmlUrl) openUrl(prFilesTabUrl(pr.htmlUrl))
              }}
            >
              {confirm === 'github' || confirm === 'githubFiles' || confirm === 'alertFilesLink' || confirm === 'folder'
                ? t('prManager.detail.continue')
                : t('prManager.detail.confirmBtn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={commitResetTarget !== null} onOpenChange={v => !v && setCommitResetTarget(null)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('prManager.detail.resetHardTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <div>
                  {t('prManager.detail.resetHardP1')}{' '}
                  <span className="rounded bg-muted/60 px-1 py-0.5 text-sm font-medium [overflow-wrap:anywhere] break-all">{headBranch || '—'}</span>{' '}
                  {t('prManager.detail.resetHardP2')}
                </div>
                <div className="rounded-md bg-muted/50 px-2 py-1.5 text-xs leading-relaxed [overflow-wrap:anywhere] break-words">
                  git checkout {headBranch || '…'} && git reset --hard {commitResetTarget?.shortSha}
                </div>
                {commitResetTarget?.message ? <div className="mt-2 rounded border bg-muted/40 p-2 text-xs">{commitResetTarget.message}</div> : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => {
                e.preventDefault()
                void doCommitResetHard()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('prManager.detail.resetHard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={commitForcePushOpen} onOpenChange={v => !v && setCommitForcePushOpen(false)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('prManager.detail.forcePushTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <div>
                  {t('prManager.detail.forcePushP1')}{' '}
                  <span className="rounded bg-muted/60 px-1 py-0.5 text-sm font-medium [overflow-wrap:anywhere] break-all">{headBranch || '—'}</span>{' '}
                  {t('prManager.detail.forcePushP2')}
                </div>
                <div className="rounded-md bg-muted/50 px-2 py-1.5 text-xs leading-relaxed [overflow-wrap:anywhere] break-words">git push --force origin {headBranch || '…'}</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => {
                e.preventDefault()
                void doCommitForcePush()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('prManager.detail.pushForce')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MergePrDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        projectId={projectId}
        repo={prRepo}
        prNumber={prNumber}
        onMerged={() => {
          onAfterChange?.()
          void load()
        }}
      />
    </TooltipProvider>
  )
}
