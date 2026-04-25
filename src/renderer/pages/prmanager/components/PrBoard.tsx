'use client'

import { formatDistanceToNow } from 'date-fns'
import type { TFunction } from 'i18next'
import {
  AlertCircle,
  ArrowDownToLine,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleDashed,
  CloudDownload,
  CopyPlus,
  ExternalLink,
  GitBranch,
  GitMerge,
  GitMergeConflict,
  GitPullRequestClosed,
  GitPullRequestCreate,
  GitPullRequestDraft,
  HelpCircle,
  Hourglass,
  Loader2,
  type LucideIcon,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import { getDateFnsLocale } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import type { PrBranchCheckpoint, PrCheckpointTemplate, PrRepo, TrackedBranchRow } from '../hooks/usePrData'
import type { PrGhStatusKind } from '../prGhStatus'
import { PR_GH_STATUS_IDS, PR_GH_STATUS_TEXT_CLASS } from '../prGhStatus'
import { PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_TEXT } from '../prManagerButtonStyles'
import { CreatePrDialog } from './CreatePrDialog'
import { MergePrDialog } from './MergePrDialog'
import { PrBulkActionsDialog } from './PrBulkActionsDialog'
import { PrDetailDialog } from './PrDetailDialog'
import { activePrTemplates, type BulkActionKind, resolveBulkCreatePrTargets, resolveBulkDeleteBranchTargets, resolveBulkPrTargets } from './prBoardBulkResolve'

type BulkToolbarConfirm = BulkActionKind | 'clearSelection'

type Props = {
  projectId: string
  repos: PrRepo[]
  templates: PrCheckpointTemplate[]
  tracked: TrackedBranchRow[]
  loading: boolean
  onRefresh: () => void
  githubTokenOk?: boolean
}

/** L\u1ecdc theo tr\u1ea1ng th\u00e1i PR tr\u00ean GitHub (m\u1ed7i c\u1ed9t pr_* + merge_*). \u0110\u1ed3ng b\u1ed9 m\u00e0u v\u1edbi prGhStatus. */
const PR_GH_FILTER_IDS = PR_GH_STATUS_IDS
type PrGhFilterId = PrGhStatusKind
/** Màu nhãn + checkbox khi checked (màu chữ = {@link PR_GH_STATUS_TEXT_CLASS}). */
const PR_GH_FILTER_STYLE: Record<PrGhFilterId, { label: string; checkbox: string }> = {
  open: {
    label: PR_GH_STATUS_TEXT_CLASS.open,
    checkbox:
      'data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:text-white dark:data-[state=checked]:border-emerald-500 dark:data-[state=checked]:bg-emerald-600',
  },
  draft: {
    label: PR_GH_STATUS_TEXT_CLASS.draft,
    checkbox:
      'data-[state=checked]:border-slate-500 data-[state=checked]:bg-slate-500 data-[state=checked]:text-white dark:data-[state=checked]:border-slate-500 dark:data-[state=checked]:bg-slate-500',
  },
  merged: {
    label: PR_GH_STATUS_TEXT_CLASS.merged,
    checkbox:
      'data-[state=checked]:border-violet-600 data-[state=checked]:bg-violet-600 data-[state=checked]:text-white dark:data-[state=checked]:border-violet-500 dark:data-[state=checked]:bg-violet-600',
  },
  closed: {
    label: PR_GH_STATUS_TEXT_CLASS.closed,
    checkbox:
      'data-[state=checked]:border-rose-600 data-[state=checked]:bg-rose-600 data-[state=checked]:text-white dark:data-[state=checked]:border-rose-500 dark:data-[state=checked]:bg-rose-600',
  },
}

/** Login GitHub c\u1ee7a ng\u01b0\u1eddi t\u1ea1o PR (checkpoint pr_* \u0111\u1ea7u ti\u00eAn c\u00f3 s\u1ed1 PR v\u00e0 \u0111\u00e3 sync). */
function githubPrCreatorLogin(row: TrackedBranchRow, orderedTemplates: PrCheckpointTemplate[]): string | null {
  for (const tpl of orderedTemplates) {
    if (!tpl.code.toLowerCase().startsWith('pr_')) continue
    const cp = row.checkpoints.find(c => c.templateId === tpl.id)
    if (cp?.prNumber && cp.ghPrAuthor) return cp.ghPrAuthor
  }
  return null
}

function derivePrKind(prCp: PrBranchCheckpoint, mergeCp: PrBranchCheckpoint | null): PrGhFilterId {
  if (mergeCp?.mergedAt || prCp.ghPrMerged === true) return 'merged'
  // Closed trước Draft: PR draft bị đóng trên GitHub vẫn có draft:true — phải là closed cho lọc, không lọt nhóm Draft
  if (prCp.ghPrState === 'closed') return 'closed'
  if (prCp.ghPrDraft === true) return 'draft'
  if (prCp.ghPrState === 'open') return 'open'
  return 'open'
}

function collectRowPrKinds(row: TrackedBranchRow, activeTemplates: PrCheckpointTemplate[]): Set<PrGhFilterId> {
  const kinds = new Set<PrGhFilterId>()
  for (const tpl of activeTemplates) {
    if (!tpl.code.toLowerCase().startsWith('pr_')) continue
    const prCp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
    if (!prCp?.prNumber) continue
    const mergeTpl = activeTemplates.find(t => t.code.toLowerCase().startsWith('merge_') && t.targetBranch === tpl.targetBranch)
    const mergeCp = mergeTpl ? (row.checkpoints.find(c => c.templateId === mergeTpl.id) ?? null) : null
    kinds.add(derivePrKind(prCp, mergeCp))
  }
  return kinds
}

/** Có ít nhất một ô pr_* (checkpoint) đã gắn số PR. */
function rowHasAnyPrNumber(row: TrackedBranchRow, activeTemplates: PrCheckpointTemplate[]): boolean {
  for (const tpl of activeTemplates) {
    if (!tpl.code.toLowerCase().startsWith('pr_')) continue
    const prCp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
    if (prCp?.prNumber) return true
  }
  return false
}

function rowMatchesPrGhFilters(row: TrackedBranchRow, activeTemplates: PrCheckpointTemplate[], prGhFilters: Set<PrGhFilterId>): boolean {
  const allGhOn = PR_GH_FILTER_IDS.every(id => prGhFilters.has(id))
  if (allGhOn) return true
  if (prGhFilters.size === 0) return false
  const kinds = collectRowPrKinds(row, activeTemplates)
  if (kinds.size === 0) return false
  // Hàng hiện nếu có ít nhất một PR khớp bộ lọc (nhánh nhiều PR stage/main thường có merged + open)
  return [...kinds].some(k => prGhFilters.has(k))
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

/** Tạm thời ẩn cột Note trên bảng (bật lại khi cần). */
const SHOW_NOTE_COLUMN = false

/** Cùng chiều cao các ô checkpoint (h-7 + text-xs). */
const CELL_CTRL_H = 'h-7 min-h-7'
const CELL_TXT = 'text-xs leading-tight'

/** Giới hạn rộng cột chữ dài (Branch, PR động, …). */
const COL_BRANCH = 'min-w-0 max-w-[200px] overflow-hidden'
const COL_PR_CHECKPOINT = 'min-w-0 max-w-[180px] overflow-hidden'

function openUrlInDefaultBrowser(url: string): void {
  void window.api.system.open_external_url(url)
}

function githubBranchUrl(row: TrackedBranchRow): string {
  const branchPath = encodeURIComponent(row.branchName).replace(/%2F/g, '/')
  return `https://github.com/${row.repoOwner}/${row.repoRepo}/tree/${branchPath}`
}

/** Trạng thái mergeable từ GitHub (PR mở): pr_* = màu chữ; merge_* = nền trạng thái. */
type MergeableUi = {
  prText: string
  prIcon: string
  /** merge_ column: nền + chữ; rỗng nếu không hiển thị cảnh báo. */
  mergeCell: string
  shortLabel: string
  subLabel: string
  blockMerge: boolean
  icon: LucideIcon
  mergeTitle: string
}

function getMergeableUi(mergeable: string | null | undefined, t: TFunction): MergeableUi {
  const s = (mergeable || '').toLowerCase().trim()
  // conflict: một số luồng tự map; GitHub dùng dirty cho merge conflict
  if (s === 'dirty' || s === 'conflict') {
    return {
      prText: 'text-amber-800 dark:text-amber-200',
      prIcon: 'text-amber-600 dark:text-amber-400',
      mergeCell: 'bg-amber-500/20 text-amber-950 dark:text-amber-50',
      shortLabel: t('prManager.mergeableUi.conflict'),
      subLabel: t('prManager.mergeableUi.conflictSub'),
      blockMerge: true,
      icon: GitMergeConflict,
      mergeTitle: t('prManager.mergeableUi.conflictTitle'),
    }
  }
  if (s === 'blocked') {
    return {
      prText: 'text-rose-800 dark:text-rose-200',
      prIcon: 'text-rose-600 dark:text-rose-400',
      mergeCell: 'bg-rose-500/20 text-rose-950 dark:text-rose-50',
      shortLabel: t('prManager.mergeableUi.blocked'),
      subLabel: t('prManager.mergeableUi.blockedSub'),
      blockMerge: true,
      icon: Ban,
      mergeTitle: t('prManager.mergeableUi.blockedTitle'),
    }
  }
  if (s === 'behind') {
    return {
      prText: 'text-sky-800 dark:text-sky-200',
      prIcon: 'text-sky-600 dark:text-sky-400',
      mergeCell: 'bg-sky-500/20 text-sky-950 dark:text-sky-50',
      shortLabel: t('prManager.mergeableUi.behind'),
      subLabel: t('prManager.mergeableUi.behindSub'),
      blockMerge: true,
      icon: GitBranch,
      mergeTitle: t('prManager.mergeableUi.behindTitle'),
    }
  }
  if (s === 'unstable') {
    return {
      prText: 'text-yellow-800 dark:text-yellow-200',
      prIcon: 'text-yellow-600 dark:text-yellow-400',
      mergeCell: 'bg-yellow-500/15 text-yellow-950 dark:text-yellow-100',
      shortLabel: t('prManager.mergeableUi.ciFailing'),
      subLabel: t('prManager.mergeableUi.ciFailingSub'),
      blockMerge: true,
      icon: AlertCircle,
      mergeTitle: t('prManager.mergeableUi.ciFailingTitle'),
    }
  }
  if (s === 'unknown') {
    return {
      prText: 'text-muted-foreground',
      prIcon: 'text-muted-foreground',
      mergeCell: 'bg-slate-500/12 text-slate-800 dark:text-slate-200',
      shortLabel: t('prManager.mergeableUi.checking'),
      subLabel: t('prManager.mergeableUi.checkingSub'),
      blockMerge: true,
      icon: HelpCircle,
      mergeTitle: t('prManager.mergeableUi.checkingTitle'),
    }
  }
  // clean, rỗng, hoặc giá trị khác: coi như sẵn sàng (hoặc chưa sync)
  return {
    prText: 'text-emerald-800 dark:text-emerald-200',
    prIcon: 'text-emerald-600 dark:text-emerald-400',
    mergeCell: '',
    shortLabel: t('prManager.mergeableUi.ready'),
    subLabel: '',
    blockMerge: false,
    icon: CheckCircle2,
    mergeTitle: '',
  }
}

/** Cột pr_*: nền trung tính nếu PR mở (màu trạng thái mergeable chỉ ở chữ). */
function ghPrSurfaceClasses(cp: PrBranchCheckpoint): string {
  if (cp.ghPrMerged === true) {
    return 'bg-violet-500/15 text-violet-800 dark:text-violet-200'
  }
  if (cp.ghPrState === 'closed') {
    return 'bg-rose-500/12 text-rose-800 dark:text-rose-200'
  }
  if (cp.ghPrDraft === true) {
    return 'bg-slate-500/10 text-slate-700 dark:text-slate-300'
  }
  const ms = (cp.ghPrMergeableState || '').toLowerCase().trim()
  if (ms === 'dirty' || ms === 'conflict') {
    return 'bg-amber-500/20'
  }
  if (ms === 'blocked') {
    return 'bg-rose-500/20'
  }
  if (ms === 'behind') {
    return 'bg-sky-500/20'
  }
  return 'bg-muted/20'
}

function ghPrContentTextClass(cp: PrBranchCheckpoint, t: TFunction): string {
  if (cp.ghPrMerged === true || cp.ghPrState === 'closed' || cp.ghPrDraft === true) return ''
  return getMergeableUi(cp.ghPrMergeableState, t).prText
}

type PrStatusIconProps = { cp: PrBranchCheckpoint; className?: string }
function PrStatusIcon({ cp, className = 'h-3 w-3 shrink-0' }: PrStatusIconProps) {
  const { t } = useTranslation()
  if (cp.ghPrMerged === true) return <GitMerge className={cn(className, 'text-violet-600 dark:text-violet-400')} />
  if (cp.ghPrState === 'closed') return <GitPullRequestClosed className={cn(className, 'text-rose-600 dark:text-rose-400')} />
  if (cp.ghPrDraft === true) return <GitPullRequestDraft className={cn(className, 'text-slate-500 dark:text-slate-400')} />
  const ui = getMergeableUi(cp.ghPrMergeableState, t)
  const I = ui.icon
  return <I className={cn(className, ui.prIcon)} />
}

/** Nền cả hàng (mọi ô) + viền trái nhấn mạnh trên cột Repo. */
const REPO_GROUP_VISUAL: ReadonlyArray<{
  row: string
  accent: string
}> = [
  {
    row: 'bg-slate-100/95 dark:bg-slate-900/55',
    accent: 'border-l-[3px] border-l-sky-500/80',
  },
  {
    row: 'bg-emerald-50/80 dark:bg-emerald-950/25',
    accent: 'border-l-[3px] border-l-emerald-500/70',
  },
  {
    row: 'bg-violet-100/60 dark:bg-violet-950/35',
    accent: 'border-l-[3px] border-l-violet-500/65',
  },
  {
    row: 'bg-amber-100/50 dark:bg-amber-950/25',
    accent: 'border-l-[3px] border-l-amber-500/60',
  },
]

/** Hover dòng: lớp inset không thay thế nền nhóm repo (ô Repo rowSpan dùng hover theo cả nhóm branch). */
const REPO_GROUP_ROW_HOVER_TRANSITION = 'transition-[box-shadow] duration-150'
const REPO_GROUP_ROW_HOVER_SHADOW =
  'shadow-[inset_0_0_0_9999px_rgb(0_0_0_/_0.055)] dark:shadow-[inset_0_0_0_9999px_rgb(255_255_255_/_0.07)]'

export function PrBoard({ projectId, repos, templates, tracked, loading, onRefresh, githubTokenOk = false }: Props) {
  const { t } = useTranslation()
  const [prBoardHoveredRowId, setPrBoardHoveredRowId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [createPrOpen, setCreatePrOpen] = useState(false)
  const [createPrInitial, setCreatePrInitial] = useState<{ repoId: string; head: string; base: string } | null>(null)
  const [mergePrOpen, setMergePrOpen] = useState(false)
  const [mergePrCtx, setMergePrCtx] = useState<{ repo: PrRepo | null; prNumber: number | null }>({ repo: null, prNumber: null })
  const [prDetailOpen, setPrDetailOpen] = useState(false)
  const [prDetailRepo, setPrDetailRepo] = useState<PrRepo | null>(null)
  const [prDetailNumber, setPrDetailNumber] = useState<number | null>(null)
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [prGhFilters, setPrGhFilters] = useState<Set<PrGhFilterId>>(() => new Set<PrGhFilterId>(['open', 'draft']))
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20)
  const [onlyExistingOnRemote, setOnlyExistingOnRemote] = useState(true)
  const [onlyBranchesWithoutPr, setOnlyBranchesWithoutPr] = useState(true)
  const [remoteExistMap, setRemoteExistMap] = useState<Record<string, boolean> | null>(null)
  const [remoteExistLoading, setRemoteExistLoading] = useState(false)
  const remoteExistKeyRef = useRef<string | null>(null)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set())
  const [bulkDlgOpen, setBulkDlgOpen] = useState(false)
  const [bulkKind, setBulkKind] = useState<BulkActionKind | null>(null)
  const [bulkToolbarConfirm, setBulkToolbarConfirm] = useState<BulkToolbarConfirm | null>(null)
  const bulkToolbarConfirmRef = useRef<BulkToolbarConfirm | null>(null)
  bulkToolbarConfirmRef.current = bulkToolbarConfirm

  const activeTemplates = useMemo(() => templates.filter(t => t.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [templates])
  const prGhFilterKey = useMemo(() => [...prGhFilters].sort().join(','), [prGhFilters])
  const trackedExistenceKey = useMemo(
    () =>
      tracked
        .map(t => `${t.id}\0${t.branchName}\0${t.repoOwner}\0${t.repoRepo}`)
        .sort()
        .join('\n'),
    [tracked]
  )

  const searchRows = useMemo(() => {
    const q = search.trim().toLowerCase()

    return tracked.filter(r => {
      if (!q) return true
      const author = (githubPrCreatorLogin(r, activeTemplates) ?? '').toLowerCase()
      return r.branchName.toLowerCase().includes(q) || r.repoName.toLowerCase().includes(q) || author.includes(q) || (r.note ?? '').toLowerCase().includes(q)
    })
  }, [tracked, search, activeTemplates])

  /** Tải map nhánh còn trên remote (dùng cho count chưa PR, filter no-PR, v.v.) — chạy theo tracked, không phụ thuộc checkbox. */
  useEffect(() => {
    if (loading) return
    if (remoteExistKeyRef.current === trackedExistenceKey) {
      setRemoteExistLoading(false)
      return
    }

    let cancelled = false
    const run = async () => {
      setRemoteExistLoading(true)
      const items = tracked.map(r => ({
        id: r.id,
        owner: r.repoOwner,
        repo: r.repoRepo,
        branch: r.branchName,
      }))
      if (items.length === 0) {
        if (!cancelled) {
          remoteExistKeyRef.current = trackedExistenceKey
          setRemoteExistMap({})
          setRemoteExistLoading(false)
        }
        return
      }
      const res = await window.api.pr.githubRemoteBranchesExist(items)
      if (cancelled) return
      if (res.status === 'success' && res.data) {
        remoteExistKeyRef.current = trackedExistenceKey
        setRemoteExistMap(res.data)
      } else {
        toast.error(res.message || t('prManager.board.toastRemoteCheck'))
        remoteExistKeyRef.current = null
        setRemoteExistMap(null)
      }
      setRemoteExistLoading(false)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [trackedExistenceKey, loading, t])

  const needRemoteBranchCheck = onlyExistingOnRemote || onlyBranchesWithoutPr
  const existenceCheckPending = needRemoteBranchCheck && (remoteExistLoading || remoteExistMap === null)

  const remoteFilteredRows = useMemo(() => {
    if (!onlyExistingOnRemote) return searchRows
    if (!remoteExistMap) return []
    return searchRows.filter(r => remoteExistMap[r.id] === true)
  }, [searchRows, onlyExistingOnRemote, remoteExistMap])

  const prGhFilterCountRows = onlyExistingOnRemote && remoteExistMap !== null ? remoteFilteredRows : searchRows

  const prGhFilterCounts = useMemo(() => {
    const counts: Record<PrGhFilterId, number> = { open: 0, draft: 0, merged: 0, closed: 0 }
    for (const row of prGhFilterCountRows) {
      const kinds = collectRowPrKinds(row, activeTemplates)
      for (const id of PR_GH_FILTER_IDS) {
        if (kinds.has(id)) counts[id]++
      }
    }
    return counts
  }, [prGhFilterCountRows, activeTemplates])

  const branchesWithoutPrCount = useMemo(() => {
    if (remoteExistMap == null) return 0
    let n = 0
    for (const row of prGhFilterCountRows) {
      if (rowHasAnyPrNumber(row, activeTemplates)) continue
      if (remoteExistMap[row.id] === true) n++
    }
    return n
  }, [prGhFilterCountRows, activeTemplates, remoteExistMap])

  const filteredRows = useMemo(() => {
    const fromKind = remoteFilteredRows.filter(row => rowMatchesPrGhFilters(row, activeTemplates, prGhFilters))
    if (!onlyBranchesWithoutPr) return fromKind
    const fromNoPr = remoteFilteredRows.filter(row => {
      if (rowHasAnyPrNumber(row, activeTemplates)) return false
      if (onlyExistingOnRemote) return true
      if (remoteExistMap == null) return false
      return remoteExistMap[row.id] === true
    })
    const byId = new Map<string, TrackedBranchRow>()
    for (const row of fromNoPr) byId.set(row.id, row)
    for (const row of fromKind) byId.set(row.id, row)
    return Array.from(byId.values())
  }, [remoteFilteredRows, activeTemplates, prGhFilters, onlyBranchesWithoutPr, onlyExistingOnRemote, remoteExistMap])

  const groupedRows = useMemo(() => {
    const groups = new Map<string, TrackedBranchRow[]>()
    for (const row of filteredRows) {
      const key = `${row.repoOwner}/${row.repoRepo}`
      const arr = groups.get(key) ?? []
      arr.push(row)
      groups.set(key, arr)
    }
    for (const [, arr] of groups) {
      arr.sort((a, b) => {
        const aNo = !rowHasAnyPrNumber(a, activeTemplates) ? 0 : 1
        const bNo = !rowHasAnyPrNumber(b, activeTemplates) ? 0 : 1
        if (aNo !== bNo) return aNo - bNo
        return a.branchName.localeCompare(b.branchName, undefined, { sensitivity: 'base' })
      })
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredRows, activeTemplates])

  const repoBranchTotals = useMemo(() => {
    const m = new Map<string, number>()
    for (const [key, rows] of groupedRows) m.set(key, rows.length)
    return m
  }, [groupedRows])

  /** Số PR theo trạng thái GitHub (mỗi ô pr_* có prNumber = 1 PR), cùng tập dữ liệu đã lọc. */
  const repoPrKindCounts = useMemo(() => {
    const m = new Map<string, Record<PrGhFilterId, number>>()
    for (const [key, rows] of groupedRows) {
      const counts: Record<PrGhFilterId, number> = { open: 0, draft: 0, merged: 0, closed: 0 }
      for (const row of rows) {
        for (const tpl of activeTemplates) {
          if (!tpl.code.toLowerCase().startsWith('pr_')) continue
          const prCp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
          if (!prCp?.prNumber) continue
          const mergeTpl = activeTemplates.find(t => t.code.toLowerCase().startsWith('merge_') && t.targetBranch === tpl.targetBranch)
          const mergeCp = mergeTpl ? (row.checkpoints.find(c => c.templateId === mergeTpl.id) ?? null) : null
          counts[derivePrKind(prCp, mergeCp)]++
        }
      }
      m.set(key, counts)
    }
    return m
  }, [groupedRows, activeTemplates])

  const flatOrderedRows = useMemo(() => {
    const out: TrackedBranchRow[] = []
    for (const [, rows] of groupedRows) out.push(...rows)
    return out
  }, [groupedRows])

  const totalRowCount = flatOrderedRows.length
  const totalPages = Math.max(1, Math.ceil(totalRowCount / pageSize))
  const safePage = Math.min(page, totalPages)

  const pagedFlatRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return flatOrderedRows.slice(start, start + pageSize)
  }, [flatOrderedRows, safePage, pageSize])

  const pagedGroupedRows = useMemo(() => {
    const groups = new Map<string, TrackedBranchRow[]>()
    for (const row of pagedFlatRows) {
      const key = `${row.repoOwner}/${row.repoRepo}`
      const arr = groups.get(key) ?? []
      arr.push(row)
      groups.set(key, arr)
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [pagedFlatRows])

  const filteredRowIdSet = useMemo(() => new Set(filteredRows.map(r => r.id)), [filteredRows])

  useEffect(() => {
    setSelectedRowIds(prev => {
      let changed = false
      const n = new Set<string>()
      for (const id of prev) {
        if (filteredRowIdSet.has(id)) n.add(id)
        else changed = true
      }
      if (!changed && n.size === prev.size) return prev
      return n
    })
  }, [filteredRowIdSet])

  const selectedRowsFull = useMemo(() => filteredRows.filter(r => selectedRowIds.has(r.id)), [filteredRows, selectedRowIds])

  const defaultPrTemplate = useMemo(() => activePrTemplates(activeTemplates)[0] ?? null, [activeTemplates])

  const bulkToolbarConfirmCopy = useMemo(() => {
    const a = bulkToolbarConfirm
    if (!a) return { title: '', description: '', destructive: false }
    if (a === 'clearSelection') {
      return {
        title: t('prManager.bulk.confirm.clearTitle'),
        description: t('prManager.bulk.confirm.clearDesc'),
        destructive: false,
      }
    }
    return {
      title: t(`prManager.bulk.title.${a}`),
      description: a === 'deleteRemoteBranch' ? t('prManager.bulk.confirm.deleteRemoteWarning') : t('prManager.bulk.confirm.bulkPreviewHint'),
      destructive: a === 'deleteRemoteBranch',
    }
  }, [bulkToolbarConfirm, t])

  const bulkElig = useMemo(() => {
    const rows = selectedRowsFull
    if (!githubTokenOk || rows.length === 0) {
      return { merge: 0, close: 0, draft: 0, ready: 0, updateBranch: 0, deleteBranch: 0, create: 0 }
    }
    const countPr = (k: 'merge' | 'close' | 'draft' | 'ready' | 'updateBranch') => resolveBulkPrTargets(k, rows, activeTemplates, repos).filter(x => x.eligible).length
    const deleteN = resolveBulkDeleteBranchTargets(rows, repos, activeTemplates, remoteExistMap, onlyExistingOnRemote).filter(x => x.eligible).length
    const createN =
      defaultPrTemplate != null ? resolveBulkCreatePrTargets(rows, defaultPrTemplate, null, repos, remoteExistMap, onlyExistingOnRemote).filter(x => x.eligible).length : 0
    return {
      merge: countPr('merge'),
      close: countPr('close'),
      draft: countPr('draft'),
      ready: countPr('ready'),
      updateBranch: countPr('updateBranch'),
      deleteBranch: deleteN,
      create: createN,
    }
  }, [selectedRowsFull, githubTokenOk, activeTemplates, repos, remoteExistMap, onlyExistingOnRemote, defaultPrTemplate])

  const pageRowIds = useMemo(() => pagedFlatRows.map(r => r.id), [pagedFlatRows])
  const allPageSelected = pageRowIds.length > 0 && pageRowIds.every(id => selectedRowIds.has(id))
  const somePageSelected = pageRowIds.some(id => selectedRowIds.has(id))

  const toggleSelectAllPage = () => {
    setSelectedRowIds(prev => {
      const n = new Set(prev)
      if (allPageSelected) {
        for (const id of pageRowIds) n.delete(id)
      } else {
        for (const id of pageRowIds) n.add(id)
      }
      return n
    })
  }

  useEffect(() => {
    setPage(1)
  }, [search, prGhFilterKey, onlyExistingOnRemote, onlyBranchesWithoutPr])

  useEffect(() => {
    setPage(p => Math.min(p, totalPages))
  }, [totalPages])

  const getCheckpoint = (row: TrackedBranchRow, tpl: PrCheckpointTemplate): PrBranchCheckpoint | null => {
    return row.checkpoints.find(c => c.templateId === tpl.id) ?? null
  }

  const templateById = useMemo(() => {
    const m = new Map<string, PrCheckpointTemplate>()
    for (const t of templates) m.set(t.id, t)
    return m
  }, [templates])

  /** T\u00ecm checkpoint pr_* cho c\u00f9ng target_branch \u0111\u1ec3 merge cell d\u00f9ng khi ch\u01b0a t\u1ef1 merge. */
  const findCompanionPrCheckpoint = (row: TrackedBranchRow, mergeTpl: PrCheckpointTemplate): PrBranchCheckpoint | null => {
    if (!mergeTpl.targetBranch) return null
    for (const cp of row.checkpoints) {
      const tpl = templateById.get(cp.templateId)
      if (!tpl) continue
      if (tpl.code.toLowerCase().startsWith('pr_') && tpl.targetBranch === mergeTpl.targetBranch && cp.prNumber) {
        return cp
      }
    }
    return null
  }

  const handleNoteBlur = async (row: TrackedBranchRow) => {
    const draft = noteDraft[row.id]
    if (draft === undefined) return
    if (draft === (row.note ?? '')) return
    const res = await window.api.pr.trackedUpdateStatusNote(row.id, { note: draft })
    if (res.status === 'success') {
      onRefresh()
    } else toast.error(res.message || t('prManager.board.toastNote'))
  }

  const handleSyncFromGithub = async () => {
    setSyncProgress(0)
    setSyncing(true)
    try {
      const res = await window.api.pr.trackedSyncFromGithub(projectId)
      if (res.status === 'success' && res.data) {
        const { synced, branchesSynced = 0, errors } = res.data
        if (synced > 0 || branchesSynced > 0) {
          toast.success(t('prManager.board.syncOkDetailed', { prs: synced, branches: branchesSynced }))
        } else {
          toast.success(t('prManager.board.syncNone'))
        }
        if (errors.length > 0) toast.error(t('prManager.board.syncSomeFailed', { list: errors.join('; ') }))
        onRefresh()
      } else {
        toast.error(res.message || t('prManager.board.syncFail'))
      }
    } finally {
      setSyncing(false)
      setSyncProgress(0)
    }
  }

  useEffect(() => {
    const off = window.api.pr.onTrackedSyncProgress(payload => {
      if (payload.projectId !== projectId) return
      setSyncProgress(Math.max(0, Math.min(100, payload.percent)))
    })
    return off
  }, [projectId])

  const openCreatePr = (row: TrackedBranchRow, tpl: PrCheckpointTemplate) => {
    setCreatePrInitial({
      repoId: row.repoId,
      head: row.branchName,
      base: tpl.targetBranch || repos.find(r => r.id === row.repoId)?.defaultBaseBranch || 'stage',
    })
    setCreatePrOpen(true)
  }

  const openMergePr = (row: TrackedBranchRow, cp: PrBranchCheckpoint) => {
    const repo = repos.find(r => r.id === row.repoId) ?? null
    setMergePrCtx({ repo, prNumber: cp.prNumber })
    setMergePrOpen(true)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('prManager.board.searchPh')} className="h-8 w-[260px] pl-7 text-sm" />
        </div>
        <Button size="sm" variant="outline" onClick={onRefresh} className="h-8 gap-1">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> {t('prManager.board.refresh')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSyncFromGithub}
          className="h-8 gap-1"
          disabled={repos.length === 0 || syncing}
          title={t('prManager.board.syncFromGithubHelp')}
        >
          <CloudDownload className={cn('h-3.5 w-3.5', syncing && 'animate-pulse')} />
          {syncing ? `${syncProgress}%` : t('prManager.board.syncFromGithub')}
        </Button>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {selectedRowIds.size > 0 ? (
            <span className="mr-0.5 text-xs tabular-nums text-muted-foreground">{t('prManager.bulk.nSelected', { count: selectedRowIds.size })}</span>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={!githubTokenOk || bulkElig.create === 0}
                onClick={() => setBulkToolbarConfirm('createPr')}
              >
                <CopyPlus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {t('prManager.bulk.tt.createPr')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={!githubTokenOk || bulkElig.merge === 0}
                onClick={() => setBulkToolbarConfirm('merge')}
              >
                <GitMerge className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {t('prManager.bulk.tt.merge')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={!githubTokenOk || bulkElig.close === 0}
                onClick={() => setBulkToolbarConfirm('close')}
              >
                <GitPullRequestClosed className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {t('prManager.bulk.tt.close')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={!githubTokenOk || bulkElig.draft === 0}
                onClick={() => setBulkToolbarConfirm('draft')}
              >
                <CircleDashed className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {t('prManager.bulk.tt.draft')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={!githubTokenOk || bulkElig.ready === 0}
                onClick={() => setBulkToolbarConfirm('ready')}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {t('prManager.bulk.tt.ready')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={!githubTokenOk || bulkElig.updateBranch === 0}
                onClick={() => setBulkToolbarConfirm('updateBranch')}
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {t('prManager.bulk.tt.updateBranch')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 text-rose-700 hover:bg-rose-500/10 dark:text-rose-400"
                disabled={!githubTokenOk || bulkElig.deleteBranch === 0}
                onClick={() => setBulkToolbarConfirm('deleteRemoteBranch')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {t('prManager.bulk.tt.deleteRemoteBranch')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={selectedRowIds.size === 0} onClick={() => setBulkToolbarConfirm('clearSelection')}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {t('prManager.bulk.tt.clearSelection')}
            </TooltipContent>
          </Tooltip>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setCreatePrInitial(null)
              setCreatePrOpen(true)
            }}
            className={cn(
              PR_MANAGER_ACCENT_OUTLINE_BTN,
              'border-emerald-500/50 bg-emerald-500/22 hover:bg-emerald-500/32 dark:border-emerald-400/40 dark:bg-emerald-500/18 dark:hover:bg-emerald-500/28'
            )}
            disabled={repos.length === 0}
          >
            <GitPullRequestCreate className="h-3.5 w-3.5" /> {t('prManager.board.createPr')}
          </Button>
        </div>
      </div>

      {repos.length > 0 && activeTemplates.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-dashed bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">{t('prManager.board.filterPrs')}</span>
          {PR_GH_FILTER_IDS.map(id => (
            <div key={id} className="flex items-center gap-1.5">
              <Checkbox
                id={`pr-gh-filter-${id}`}
                checked={prGhFilters.has(id)}
                className={PR_GH_FILTER_STYLE[id].checkbox}
                onCheckedChange={v => {
                  setPrGhFilters(prev => {
                    const n = new Set(prev)
                    if (v === true) n.add(id)
                    else n.delete(id)
                    return n
                  })
                }}
              />
              <Label htmlFor={`pr-gh-filter-${id}`} className={cn('cursor-pointer text-xs font-medium leading-none tabular-nums', PR_GH_FILTER_STYLE[id].label)}>
                {t(`prManager.ghStatus.${id}`)} ({prGhFilterCounts[id]})
              </Label>
            </div>
          ))}
          <div className="h-3 w-px bg-border" aria-hidden />
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="pr-filter-remote-exists"
              checked={onlyExistingOnRemote}
              className="data-[state=checked]:border-cyan-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:text-white dark:data-[state=checked]:border-cyan-500"
              onCheckedChange={v => {
                if (v === true) setOnlyExistingOnRemote(true)
                else setOnlyExistingOnRemote(false)
              }}
            />
            <Label htmlFor="pr-filter-remote-exists" className="flex cursor-pointer items-center gap-1.5 text-xs font-medium leading-none text-cyan-800 dark:text-cyan-200">
              {remoteExistLoading && onlyExistingOnRemote ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : null}
              {t('prManager.board.onlyRemote')}
            </Label>
          </div>
          <div className="h-3 w-px bg-border" aria-hidden />
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="pr-filter-without-pr"
              checked={onlyBranchesWithoutPr}
              className="data-[state=checked]:border-amber-600 data-[state=checked]:bg-amber-600 data-[state=checked]:text-white dark:data-[state=checked]:border-amber-500"
              onCheckedChange={v => {
                if (v === true) setOnlyBranchesWithoutPr(true)
                else setOnlyBranchesWithoutPr(false)
              }}
            />
            <Label
              htmlFor="pr-filter-without-pr"
              title={t('prManager.board.onlyNoPrTitle')}
              className="flex cursor-pointer items-center gap-1.5 text-xs font-medium leading-none text-amber-900 tabular-nums dark:text-amber-200"
            >
              {remoteExistLoading && onlyBranchesWithoutPr && !onlyExistingOnRemote ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : null}
              {t('prManager.board.onlyNoPr')} ({remoteExistMap == null && remoteExistLoading ? '—' : branchesWithoutPrCount})
            </Label>
          </div>
        </div>
      )}

      {repos.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed p-10 text-sm text-muted-foreground">{t('prManager.board.emptyNoRepos')}</div>
      ) : activeTemplates.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed p-10 text-sm text-muted-foreground">{t('prManager.board.emptyNoTemplates')}</div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
          {syncing ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/60 backdrop-blur-[1px]" aria-busy="true" aria-live="polite">
              <GlowLoader className="h-10 w-10" />
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
            <Table>
              <TableHeader className="border-b-2 border-b-border shadow-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky top-0 z-20 w-0 min-w-[200px] max-w-[min(900px,96vw)] whitespace-normal bg-muted/95 text-left align-top backdrop-blur-sm">
                    {t('prManager.board.colRepo')}
                  </TableHead>
                  <TableHead className={cn(COL_BRANCH, 'sticky top-0 z-20 bg-muted/95 backdrop-blur-sm')}>
                    <span className="block truncate">{t('prManager.board.colBranch')}</span>
                  </TableHead>
                  {activeTemplates.map(tpl => (
                    <TableHead
                      key={tpl.id}
                      className={cn('sticky top-0 z-20 min-w-[72px] whitespace-normal bg-muted/95 px-1.5 text-center align-top backdrop-blur-sm', COL_PR_CHECKPOINT)}
                    >
                      <span className="block w-full truncate text-xs font-medium" title={tpl.label}>
                        {tpl.label}
                      </span>
                    </TableHead>
                  ))}
                  {SHOW_NOTE_COLUMN && <TableHead className="sticky top-0 z-20 min-w-[180px] bg-muted/95 backdrop-blur-sm">{t('prManager.board.colNote')}</TableHead>}
                  <TableHead className="sticky top-0 z-20 w-10 bg-muted/95 px-1 text-center backdrop-blur-sm">
                    <Checkbox
                      checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                      onCheckedChange={() => toggleSelectAllPage()}
                      disabled={pageRowIds.length === 0}
                      aria-label={t('prManager.bulk.selectPage')}
                      className="mx-auto"
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&>tr:nth-child(odd)]:bg-transparent [&>tr:nth-child(even)]:bg-transparent [&>tr:hover]:bg-transparent">
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3 + activeTemplates.length + (SHOW_NOTE_COLUMN ? 1 : 0)} className="py-8 text-center text-sm text-muted-foreground">
                      {existenceCheckPending && searchRows.length > 0
                        ? t('prManager.board.emptyFilterChecking')
                        : onlyExistingOnRemote && !existenceCheckPending && searchRows.length > 0 && remoteFilteredRows.length === 0
                          ? t('prManager.board.emptyNoRemote')
                          : t('prManager.board.emptyNoMatch')}
                    </TableCell>
                  </TableRow>
                )}
                {pagedGroupedRows.map(([repoKey, rows], groupIndex) => {
                  const vis = REPO_GROUP_VISUAL[groupIndex % REPO_GROUP_VISUAL.length]
                  const repoTotalBranches = repoBranchTotals.get(repoKey) ?? rows.length
                  const prByKind = repoPrKindCounts.get(repoKey) ?? {
                    open: 0,
                    draft: 0,
                    merged: 0,
                    closed: 0,
                  }
                  const repoTotalPrs = PR_GH_FILTER_IDS.reduce((s, id) => s + prByKind[id], 0)
                  return rows.map((row, idx) => {
                    const isThisRowHovered = prBoardHoveredRowId === row.id
                    const isAnyRowInGroupHovered = rows.some(r => r.id === prBoardHoveredRowId)
                    const rowHoverCell = cn(REPO_GROUP_ROW_HOVER_TRANSITION, isThisRowHovered && REPO_GROUP_ROW_HOVER_SHADOW)
                    const repoCellHover = cn(REPO_GROUP_ROW_HOVER_TRANSITION, isAnyRowInGroupHovered && REPO_GROUP_ROW_HOVER_SHADOW)
                    return (
                      <TableRow
                        key={row.id}
                        data-row-id={row.id}
                        className={cn('align-top border-b border-b-border/60', vis.row)}
                        onMouseEnter={() => setPrBoardHoveredRowId(row.id)}
                        onMouseLeave={e => {
                          const rel = e.relatedTarget as HTMLElement | null
                          const nextRow = rel?.closest?.('tr[data-row-id]')
                          if (nextRow && nextRow !== e.currentTarget) {
                            const nextId = nextRow.getAttribute('data-row-id')
                            if (nextId) {
                              setPrBoardHoveredRowId(nextId)
                              return
                            }
                          }
                          setPrBoardHoveredRowId(null)
                        }}
                      >
                        {idx === 0 && (
                          <TableCell
                            rowSpan={rows.length}
                            className={cn(
                              'w-0 min-w-[200px] max-w-[min(900px,96vw)] whitespace-normal border-r border-r-border/60 align-top font-medium',
                              vis.row,
                              vis.accent,
                              repoCellHover
                            )}
                          >
                            <div className="sticky top-10 py-0.5">
                              <span className="leading-tight text-foreground/90">{rows[0].repoName}</span>
                              <div className="mt-1 space-y-1">
                                <div className="text-[10px] font-normal tabular-nums leading-none text-muted-foreground">
                                  <span>{t('prManager.board.branchCount', { count: repoTotalBranches })}</span>
                                  {repoTotalPrs > 0 ? <span> · {t('prManager.board.prCount', { count: repoTotalPrs })}</span> : null}
                                </div>
                                {repoTotalPrs > 0 ? (
                                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-medium leading-tight">
                                    {PR_GH_FILTER_IDS.map(id => {
                                      const n = prByKind[id]
                                      if (n === 0) return null
                                      return (
                                        <span key={id} className={cn('whitespace-nowrap tabular-nums', PR_GH_FILTER_STYLE[id].label)}>
                                          {t(`prManager.ghStatus.${id}`)} {n}
                                        </span>
                                      )
                                    })}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                        )}
                        <TableCell className={cn(COL_BRANCH, 'text-xs align-top', vis.row, rowHoverCell)}>
                          <button
                            type="button"
                            className="block w-full min-w-0 truncate rounded-sm text-left text-xs font-inherit text-foreground hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            onClick={() => openUrlInDefaultBrowser(githubBranchUrl(row))}
                            title={githubBranchUrl(row)}
                          >
                            {row.branchName}
                          </button>
                        </TableCell>
                        {activeTemplates.map(tpl => {
                          const cp = getCheckpoint(row, tpl)
                          const isMergeKind = tpl.code.toLowerCase().startsWith('merge_')
                          const companionPrCp = isMergeKind ? findCompanionPrCheckpoint(row, tpl) : null
                          return (
                            <TableCell key={tpl.id} className={cn(COL_PR_CHECKPOINT, 'p-1 text-center align-middle !whitespace-normal', vis.row, rowHoverCell)}>
                              <CheckpointCell
                                tpl={tpl}
                                cp={cp}
                                companionPrCp={companionPrCp}
                                rowPrRepo={repos.find(r => r.id === row.repoId) ?? null}
                                onOpenPrInApp={n => {
                                  const r = repos.find(x => x.id === row.repoId) ?? null
                                  setPrDetailRepo(r)
                                  setPrDetailNumber(n)
                                  setPrDetailOpen(true)
                                }}
                                onCreatePR={() => openCreatePr(row, tpl)}
                                onMerge={() => {
                                  const target = cp?.prNumber ? cp : companionPrCp
                                  if (target) openMergePr(row, target)
                                }}
                              />
                            </TableCell>
                          )
                        })}
                        {SHOW_NOTE_COLUMN && (
                          <TableCell className={cn(vis.row, rowHoverCell)}>
                            <Input
                              value={noteDraft[row.id] ?? row.note ?? ''}
                              onChange={e => setNoteDraft(prev => ({ ...prev, [row.id]: e.target.value }))}
                              onBlur={() => handleNoteBlur(row)}
                              placeholder={t('prManager.board.notePlaceholder')}
                              className="h-7 border-transparent bg-transparent text-xs focus-visible:border-input focus-visible:bg-background"
                            />
                          </TableCell>
                        )}
                        <TableCell className={cn('w-10 p-1 text-center align-middle', vis.row, rowHoverCell)} onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedRowIds.has(row.id)}
                            onCheckedChange={() => {
                              setSelectedRowIds(prev => {
                                const n = new Set(prev)
                                if (n.has(row.id)) n.delete(row.id)
                                else n.add(row.id)
                                return n
                              })
                            }}
                            aria-label={t('prManager.bulk.selectRow')}
                            className="mx-auto"
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })
                })}
              </TableBody>
            </Table>
          </div>
          {filteredRows.length > 0 && (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/80 bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              <div>
                {totalRowCount === 0
                  ? t('prManager.board.zeroRows')
                  : t('prManager.board.showRows', {
                      from: (safePage - 1) * pageSize + 1,
                      to: Math.min(safePage * pageSize, totalRowCount),
                      total: totalRowCount,
                    })}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="whitespace-nowrap">{t('prManager.board.rowsPerPage')}</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={v => {
                      setPageSize(Number(v) as (typeof PAGE_SIZE_OPTIONS)[number])
                      setPage(1)
                    }}
                  >
                    <SelectTrigger className="h-8 w-[84px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map(n => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={safePage <= 1}
                    onClick={() => setPage(1)}
                    title={t('prManager.board.firstPage')}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={safePage <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    title={t('prManager.board.prevPage')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[4.5rem] px-1 text-center tabular-nums text-foreground">
                    {safePage} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    title={t('prManager.board.nextPage')}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(totalPages)}
                    title={t('prManager.board.lastPage')}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <AlertDialog
        open={bulkToolbarConfirm != null}
        onOpenChange={open => {
          if (!open) setBulkToolbarConfirm(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bulkToolbarConfirmCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>{bulkToolbarConfirmCopy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant={bulkToolbarConfirmCopy.destructive ? 'destructive' : 'default'}
              onClick={() => {
                const a = bulkToolbarConfirmRef.current
                setBulkToolbarConfirm(null)
                if (!a) return
                if (a === 'clearSelection') {
                  setSelectedRowIds(new Set())
                  return
                }
                setBulkKind(a)
                setBulkDlgOpen(true)
              }}
            >
              {t('prManager.bulk.confirm.continue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreatePrDialog
        open={createPrOpen}
        onOpenChange={setCreatePrOpen}
        projectId={projectId}
        repos={repos}
        initialRepoId={createPrInitial?.repoId ?? null}
        initialHead={createPrInitial?.head ?? null}
        initialBase={createPrInitial?.base ?? null}
        onCreated={onRefresh}
      />
      {bulkDlgOpen && bulkKind ? (
        <PrBulkActionsDialog
          open={bulkDlgOpen}
          onOpenChange={v => {
            setBulkDlgOpen(v)
            if (!v) setBulkKind(null)
          }}
          kind={bulkKind}
          projectId={projectId}
          selectedRows={selectedRowsFull}
          repos={repos}
          activeTemplates={activeTemplates}
          remoteExistMap={remoteExistMap}
          onlyExistingOnRemote={onlyExistingOnRemote}
          githubTokenOk={githubTokenOk}
          onAfterBatch={onRefresh}
        />
      ) : null}
      <MergePrDialog open={mergePrOpen} onOpenChange={setMergePrOpen} projectId={projectId} repo={mergePrCtx.repo} prNumber={mergePrCtx.prNumber} onMerged={onRefresh} />
      <PrDetailDialog
        open={prDetailOpen}
        onOpenChange={v => {
          setPrDetailOpen(v)
          if (!v) {
            setPrDetailRepo(null)
            setPrDetailNumber(null)
          }
        }}
        projectId={projectId}
        prRepo={prDetailRepo}
        prNumber={prDetailNumber}
        onAfterChange={onRefresh}
      />
    </div>
  )
}

function CheckpointCell({
  tpl,
  cp,
  companionPrCp,
  rowPrRepo,
  onOpenPrInApp,
  onCreatePR,
  onMerge,
}: {
  tpl: PrCheckpointTemplate
  cp: PrBranchCheckpoint | null
  companionPrCp: PrBranchCheckpoint | null
  rowPrRepo: PrRepo | null
  onOpenPrInApp?: (prNumber: number) => void
  onCreatePR: () => void
  onMerge: () => void
}) {
  const { t, i18n } = useTranslation()
  const dateLoc = getDateFnsLocale(i18n.language)
  const isMergeKind = tpl.code.toLowerCase().startsWith('merge_')

  if (isMergeKind) {
    const mergedOnRecord = Boolean(cp?.mergedAt)
    const mergedOnGithub = companionPrCp?.ghPrMerged === true
    const showMergedCell = mergedOnRecord || mergedOnGithub

    // Merge cell: merged_at tr\u00ean checkpoint merge_* ho\u1eb7c PR \u1edf pr_* \u0111\u00e3 merged tr\u00ean GitHub
    if (showMergedCell) {
      const linkSrc = cp?.prNumber != null || cp?.prUrl ? cp : companionPrCp
      const when =
        mergedOnRecord && cp?.mergedAt
          ? formatDistanceToNow(new Date(cp.mergedAt), { addSuffix: true, locale: dateLoc })
          : companionPrCp?.ghPrUpdatedAt
            ? formatDistanceToNow(new Date(companionPrCp.ghPrUpdatedAt), { addSuffix: true, locale: dateLoc })
            : null
      const detail = [when, cp?.mergedBy ? t('prManager.board.mergedBy', { name: cp.mergedBy }) : null].filter(Boolean).join(' · ')
      return (
        <div className="flex w-full min-w-0 items-stretch gap-0.5">
          <div
            className={cn('flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-violet-500/15 px-1.5 text-violet-800 dark:text-violet-200', CELL_CTRL_H, CELL_TXT)}
            title={detail || undefined}
          >
            <GitMerge className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
            <span className="min-w-0 truncate font-medium">
              {t('prManager.board.merged')}
              {linkSrc?.prUrl ? (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    if (linkSrc.prUrl) openUrlInDefaultBrowser(linkSrc.prUrl)
                  }}
                  className="ml-0.5 font-inherit underline-offset-2 hover:underline"
                >
                  #{linkSrc.prNumber}
                </button>
              ) : linkSrc?.prNumber != null ? (
                <span className="ml-0.5">#{linkSrc.prNumber}</span>
              ) : null}
            </span>
          </div>
        </div>
      )
    }
    // PR Draft: GitHub ch\u01b0a cho merge \u2014 kh\u00f4ng hi\u1ec7n n\u00fat Merge, hi\u1ec3n th\u1ecb nh\u00e3n thay th\u1ebf (ch\u1eef nh\u1ecf)
    if (companionPrCp?.prNumber != null && companionPrCp.ghPrDraft === true && companionPrCp.ghPrMerged !== true && companionPrCp.ghPrState !== 'closed') {
      const draftN = companionPrCp.prNumber
      const canOpen = Boolean(onOpenPrInApp && rowPrRepo)
      return (
        <div className="flex w-full min-w-0 items-stretch gap-0.5">
          <button
            type="button"
            disabled={!canOpen}
            className={cn(
              'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-slate-500/10 px-1.5 text-slate-700 dark:text-slate-300',
              CELL_CTRL_H,
              CELL_TXT,
              canOpen && 'hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:brightness-110',
              !canOpen && 'cursor-not-allowed opacity-80'
            )}
            onClick={canOpen ? () => onOpenPrInApp?.(draftN) : undefined}
            title={t('prManager.board.draftTitle')}
          >
            <GitPullRequestDraft className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">
              <span className="font-medium">{t('prManager.board.draftLabel')}</span>
            </span>
          </button>
        </div>
      )
    }
    const hasCompanionForMerge = companionPrCp?.prNumber != null && companionPrCp.ghPrMerged !== true && companionPrCp.ghPrState !== 'closed' && companionPrCp.ghPrDraft !== true
    const mergeUi = hasCompanionForMerge ? getMergeableUi(companionPrCp.ghPrMergeableState, t) : null
    // PR m\u1edf nh\u01b0ng mergeable b\u1ea5t th\u01b0\u1eddng (xung \u0111\u1ed9t, blocked, t\u1ee5t base, v.v.) \u2014 c\u1ed9t merge_: n\u1ec1n m\u00e0u + nh\u00e3n, kh\u00f4ng n\u00fat Merge
    if (hasCompanionForMerge && mergeUi?.blockMerge && mergeUi.mergeCell) {
      const MIcon = mergeUi.icon
      const blockN = companionPrCp.prNumber
      const canOpen = Boolean(onOpenPrInApp && rowPrRepo && blockN != null)
      return (
        <div className="flex w-full min-w-0 items-stretch gap-0.5">
          <button
            type="button"
            disabled={!canOpen}
            className={cn(
              'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5',
              CELL_CTRL_H,
              CELL_TXT,
              mergeUi.mergeCell,
              canOpen && 'hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:brightness-110',
              !canOpen && 'cursor-not-allowed opacity-80'
            )}
            onClick={
              canOpen
                ? () => {
                    if (blockN == null) return
                    onOpenPrInApp?.(blockN)
                  }
                : undefined
            }
            title={mergeUi.mergeTitle ? `${mergeUi.mergeTitle} ${t('prManager.mergeableUi.openInAppHint')}` : t('prManager.mergeableUi.openInAppHint')}
          >
            <MIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">
              <span className="font-medium">{mergeUi.shortLabel}</span>
            </span>
          </button>
        </div>
      )
    }
    // C\u00f3 PR \u0111ang m\u1edf (s\u1eb5n s\u00e0ng merge) \u2192 n\u00fat Merge
    const canMerge = Boolean(hasCompanionForMerge && mergeUi && !mergeUi.blockMerge)
    if (canMerge) {
      return (
        <div className="flex w-full min-w-0 items-stretch gap-0.5">
          <div className={cn('flex min-w-0 flex-1 items-center justify-center rounded-md bg-emerald-500/10', CELL_CTRL_H)}>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onMerge}
              className={cn('w-full text-emerald-800 shadow-none hover:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/20', CELL_CTRL_H, CELL_TXT)}
            >
              <GitMerge className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" /> {t('prManager.board.merge')}
            </Button>
          </div>
        </div>
      )
    }
    // C\u00f3 PR nh\u01b0ng \u0111\u00e3 \u0111\u00f3ng (kh\u00f4ng merge) \u2014 kh\u00f4ng hi\u1ec7n n\u00fat Merge
    if (companionPrCp?.prNumber != null && companionPrCp.ghPrState === 'closed' && companionPrCp.ghPrMerged !== true) {
      const closedN = companionPrCp.prNumber
      const canOpen = Boolean(onOpenPrInApp && rowPrRepo)
      return (
        <div className="flex w-full min-w-0 items-stretch gap-0.5">
          <button
            type="button"
            disabled={!canOpen}
            className={cn(
              'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-rose-500/10 px-1.5 text-rose-800 dark:text-rose-200',
              CELL_CTRL_H,
              CELL_TXT,
              canOpen && 'hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:brightness-110',
              !canOpen && 'cursor-not-allowed opacity-80'
            )}
            onClick={canOpen ? () => onOpenPrInApp?.(closedN) : undefined}
            title={t('prManager.board.openPrInApp')}
          >
            <GitPullRequestClosed className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" /> {t('prManager.board.closed')}
          </button>
        </div>
      )
    }
    // Ch\u01b0a c\u00f3 PR c\u00f9ng target \u2192 hi\u1ec3n \u201cCh\u1edd PR\u201d
    return (
      <div
        className={cn(
          'flex w-full items-center justify-center gap-1 rounded-md bg-sky-500/15 text-sky-800 dark:bg-sky-950/40 dark:text-sky-100',
          CELL_CTRL_H,
          CELL_TXT
        )}
      >
        <Hourglass className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" /> {t('prManager.board.waitingForPr')}
      </div>
    )
  }

  // PR cell (pr_*): c\u00f3 PR \u2192 hi\u1ec3n "Created"; ch\u01b0a \u2192 n\u00fat "T\u1ea1o PR"
  if (cp?.prNumber) {
    const prNum = cp.prNumber
    const titleText = cp.ghPrTitle?.trim() ? cp.ghPrTitle : t('prManager.board.created')
    const surface = ghPrSurfaceClasses(cp)
    const openMergeText = ghPrContentTextClass(cp, t)
    const canOpenInApp = Boolean(onOpenPrInApp && rowPrRepo)
    return (
      <div className="flex w-full min-w-0 items-stretch">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex min-h-0 min-w-0 flex-1 max-w-full items-center gap-1 rounded-md px-1.5 py-0 text-left',
                CELL_CTRL_H,
                CELL_TXT,
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                surface,
                openMergeText
              )}
              title={titleText}
            >
              <PrStatusIcon cp={cp} className="h-3.5 w-3.5 shrink-0" />
              <button
                type="button"
                disabled={!canOpenInApp}
                className={cn(
                  'min-w-0 flex-1 truncate rounded-sm text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  canOpenInApp && 'cursor-pointer hover:underline hover:underline-offset-2',
                  !canOpenInApp && 'cursor-default'
                )}
                onClick={canOpenInApp ? () => onOpenPrInApp?.(prNum) : undefined}
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
                {t('prManager.board.size')} <span className="text-emerald-600 dark:text-emerald-400">+{cp.ghPrAdditions ?? 0}</span>
                {' / '}
                <span className="text-rose-600 dark:text-rose-400">-{cp.ghPrDeletions ?? 0}</span>
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
      variant="outline"
      size="xs"
      onClick={onCreatePR}
      className={cn(
        'w-full rounded-md border-0 bg-emerald-500/22 shadow-none hover:bg-emerald-500/32 dark:bg-emerald-500/16 dark:hover:bg-emerald-500/26',
        PR_MANAGER_ACCENT_TEXT,
        CELL_CTRL_H,
        CELL_TXT
      )}
    >
      <GitPullRequestCreate className="h-3.5 w-3.5 shrink-0" /> {t('prManager.board.createPrCell')}
    </Button>
  )
}
