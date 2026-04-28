'use client'

import { formatDistanceToNow } from 'date-fns'
import type { TFunction } from 'i18next'
import {
  AlertCircle,
  ArrowDownToLine,
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  CircleDashed,
  CloudAlert,
  CloudDownload,
  CloudSync,
  CopyPlus,
  ExternalLink,
  FileWarning,
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
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import { getDateFnsLocale } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { checkpointTableHeadGroupClass } from '../checkpointHeaderGroup'
import {
  branchNameMatchesSkipList,
  hydratePrBoardSkippedBranchesFromApi,
  readSkippedBranchesSnapshotText,
  subscribePrBoardSkippedBranches,
} from '../prBoardSkippedBranches'
import { collectOpenPrsForFileOverlap } from '../collectPrFileOverlapCandidates'
import type { PrBranchCheckpoint, PrCheckpointTemplate, PrRepo, TrackedBranchRow } from '../hooks/usePrData'
import { usePrOperationLog } from '../PrOperationLogContext'
import type { PrGhStatusKind } from '../prGhStatus'
import { PR_GH_STATUS_IDS, PR_GH_STATUS_TEXT_CLASS } from '../prGhStatus'
import { PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE } from '../prManagerButtonStyles'
import { PR_MANAGER_REPO_GROUP_VISUAL } from '../prManagerRepoGroupVisual'
import { CreatePrDialog } from './CreatePrDialog'
import { MergePrDialog } from './MergePrDialog'
import { PrBulkActionsDialog } from './PrBulkActionsDialog'
import { PrDetailDialog } from './PrDetailDialog'
import { PrFileOverlapDialog } from './PrFileOverlapDialog'
import { PrAiAssistSheet } from './PrAiAssistSheet'
import {
  activePrTemplates,
  type BulkActionKind,
  countRowsEligibleForBulkCreateOnAnyPrTemplate,
  resolveBulkDeleteBranchTargets,
  resolveBulkPrTargets,
} from './prBoardBulkResolve'

type BulkToolbarConfirm = BulkActionKind | 'clearSelection'

type Props = {
  projectId: string
  /** Theo user để đồng bộ danh sách nhánh bỏ qua với Settings; null = legacy chỉ theo project. */
  userId: string | null
  repos: PrRepo[]
  templates: PrCheckpointTemplate[]
  tracked: TrackedBranchRow[]
  loading: boolean
  onRefresh: () => void | Promise<void>
  /** Cập nhật danh sách nhánh/checkpoint mà không bật OverlayLoader toàn trang (sau sync GitHub). */
  onRefreshTracked?: () => void | Promise<void>
  githubTokenOk?: boolean
}

/** UI đồng bộ GitHub: chỉ `full` mới phủ GlowLoader cả bảng. */
type GithubSyncUiState =
  | { kind: 'idle' }
  | { kind: 'full' }
  | { kind: 'repo'; repoId: string }
  | { kind: 'branch'; rowId: string }

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

/** AND: mọi cột pr_* được lọc hẹp đều phải có PR khớp; cột bật đủ 4 trạng thái = không ràng buộc cột đó. OR: ít nhất một cột có PR khớp. */
type PrGhAdvancedCombineMode = 'and' | 'or'

function prColumnKindMatchesFilters(kind: PrGhFilterId, filters: Set<PrGhFilterId>): boolean {
  const allOn = PR_GH_FILTER_IDS.every(id => filters.has(id))
  if (allOn) return true
  if (filters.size === 0) return false
  return filters.has(kind)
}

/** Lọc nâng cao theo từng cột pr_*; AND = mọi cột có lọc hẹp đều phải có PR khớp (thiếu PR ở cột đó → loại). */
function rowMatchesPrGhFiltersPerTemplate(
  row: TrackedBranchRow,
  activeTemplates: PrCheckpointTemplate[],
  filtersByTplId: Record<string, PrGhFilterId[]>,
  /** Chưa có entry trong map → coi như copy bộ lọc đơn (đồng bộ UI merge template). */
  simpleGhFallback: Set<PrGhFilterId>,
  combineMode: PrGhAdvancedCombineMode
): boolean {
  if (combineMode === 'or') {
    for (const tpl of activeTemplates) {
      if (!tpl.code.toLowerCase().startsWith('pr_')) continue
      const prCp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
      if (!prCp?.prNumber) continue
      const mergeTpl = activeTemplates.find(t => t.code.toLowerCase().startsWith('merge_') && t.targetBranch === tpl.targetBranch)
      const mergeCp = mergeTpl ? (row.checkpoints.find(c => c.templateId === mergeTpl.id) ?? null) : null
      const kind = derivePrKind(prCp, mergeCp)
      const raw = filtersByTplId[tpl.id]
      const filters: Set<PrGhFilterId> =
        raw === undefined
          ? new Set(PR_GH_FILTER_IDS.filter(id => simpleGhFallback.has(id)))
          : raw.length === 0
            ? new Set()
            : new Set(raw)
      if (prColumnKindMatchesFilters(kind, filters)) return true
    }
    return false
  }

  let anyPr = false
  for (const tpl of activeTemplates) {
    if (!tpl.code.toLowerCase().startsWith('pr_')) continue
    const raw = filtersByTplId[tpl.id]
    const filters: Set<PrGhFilterId> =
      raw === undefined
        ? new Set(PR_GH_FILTER_IDS.filter(id => simpleGhFallback.has(id)))
        : raw.length === 0
          ? new Set()
          : new Set(raw)
    const allStatusesSelected = PR_GH_FILTER_IDS.every(id => filters.has(id))

    const prCp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
    if (!prCp?.prNumber) {
      // AND: lọc hẹp (không phải “tất cả” và có chọn ít nhất 1 trạng thái) → cần PR trên cột này mới có thể khớp
      if (!allStatusesSelected && filters.size > 0) return false
      continue
    }

    anyPr = true
    const mergeTpl = activeTemplates.find(t => t.code.toLowerCase().startsWith('merge_') && t.targetBranch === tpl.targetBranch)
    const mergeCp = mergeTpl ? (row.checkpoints.find(c => c.templateId === mergeTpl.id) ?? null) : null
    const kind = derivePrKind(prCp, mergeCp)
    if (!prColumnKindMatchesFilters(kind, filters)) return false
  }
  return anyPr
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

type PageSizeChoice = (typeof PAGE_SIZE_OPTIONS)[number]
const DEFAULT_PAGE_SIZE: PageSizeChoice = 50
const PR_BOARD_PAGE_SIZE_V1_PREFIX = 'pr-manager.prBoard.pageSize.v1:'

function isPageSizeOption(n: number): n is PageSizeChoice {
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
}

function readPrBoardPageSize(projectId: string): PageSizeChoice {
  try {
    const raw = window.localStorage.getItem(PR_BOARD_PAGE_SIZE_V1_PREFIX + projectId)
    if (raw == null || raw === '') return DEFAULT_PAGE_SIZE
    const n = Number(raw)
    if (!Number.isFinite(n) || !isPageSizeOption(n)) return DEFAULT_PAGE_SIZE
    return n
  } catch {
    return DEFAULT_PAGE_SIZE
  }
}

function writePrBoardPageSize(projectId: string, size: PageSizeChoice): void {
  try {
    window.localStorage.setItem(PR_BOARD_PAGE_SIZE_V1_PREFIX + projectId, String(size))
  } catch {
    /* ignore */
  }
}

/** Tạm thời ẩn cột Note trên bảng (bật lại khi cần). */
const SHOW_NOTE_COLUMN = false

/** Cùng chiều cao các ô checkpoint (h-7 + text-xs). */
const CELL_CTRL_H = 'h-7 min-h-7'
const CELL_TXT = 'text-xs leading-tight'

/** Giới hạn rộng cột chữ dài (Branch, PR động, …). */
const COL_BRANCH = 'min-w-0 max-w-[200px] overflow-hidden'
const COL_PR_CHECKPOINT = 'min-w-0 max-w-[180px] overflow-hidden'
/** Viền dọc giữa các cột (cùng style `border-r` cột Repo); cột checkbox cuối không dùng. */
const COL_DIVIDER_R = 'border-r border-r-border/60'
/** Viền ngang từng ô (dùng khi bật lưới viền bảng). */
const COL_DIVIDER_B = 'border-b border-b-border/60'
const PR_BOARD_TABLE_BORDERS_LS = 'pr-manager.prBoard.tableBordersV1'
/** Cũ (toàn cục) — chỉ dùng khi đọc tương thích; ghi mới theo từng project. */
const PR_BOARD_PR_MERGE_CELL_STYLE_LS_LEGACY = 'pr-manager.prBoard.prMergeCellStyleV1'
const PR_BOARD_PR_MERGE_CELL_STYLE_V1_PREFIX = 'pr-manager.prBoard.prMergeCellStyle.v1:'

type PrMergeCellVisualStyle = 1 | 2 | 3 | 4

const PR_MERGE_CELL_STYLE_BORDER = 'border border-border/60 dark:border-border/50'

function parsePrMergeCellStyleValue(raw: string | null): PrMergeCellVisualStyle | null {
  if (raw === '1' || raw === '2' || raw === '3' || raw === '4') return Number(raw) as PrMergeCellVisualStyle
  return null
}

/** Lưu theo project (cùng kiểu page size / filter); legacy global nếu chưa có bản theo project. */
function readPrMergeCellStyleForProject(projectId: string): PrMergeCellVisualStyle {
  try {
    if (typeof window === 'undefined') return 1
    const per = parsePrMergeCellStyleValue(window.localStorage.getItem(PR_BOARD_PR_MERGE_CELL_STYLE_V1_PREFIX + projectId))
    if (per != null) return per
    const legacy = parsePrMergeCellStyleValue(window.localStorage.getItem(PR_BOARD_PR_MERGE_CELL_STYLE_LS_LEGACY))
    if (legacy != null) return legacy
    return 1
  } catch {
    return 1
  }
}

function writePrMergeCellStyleForProject(projectId: string, s: PrMergeCellVisualStyle): void {
  try {
    window.localStorage.setItem(PR_BOARD_PR_MERGE_CELL_STYLE_V1_PREFIX + projectId, String(s))
  } catch {
    /* ignore */
  }
}

function stripBackgroundClasses(className: string): string {
  return className
    .split(/\s+/)
    .filter(Boolean)
    .filter(
      c =>
        !c.startsWith('bg-') &&
        !c.startsWith('dark:bg-') &&
        !c.startsWith('hover:bg-') &&
        !c.startsWith('dark:hover:bg-')
    )
    .join(' ')
}

/** Style 1: giữ nguyên. 2: + viền. 3: không nền + viền. 4: chỉ chữ (bỏ nền + viền). */
function applyPrMergeCellVisualStyle(style: PrMergeCellVisualStyle, surface: string): string {
  const s = surface.trim()
  if (style === 1) return s
  if (style === 2) return cn(s, PR_MERGE_CELL_STYLE_BORDER)
  if (style === 3) return cn(stripBackgroundClasses(s), PR_MERGE_CELL_STYLE_BORDER)
  return stripBackgroundClasses(s)
}
/** ISO hoặc epoch ms — lưu theo projectId trên máy này. */
const PR_BOARD_LAST_GITHUB_SYNC_LS_PREFIX = 'pr-manager.prBoard.lastGithubSyncAt.v1:'

function readLastGithubSyncMs(projectId: string): number | null {
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

function writeLastGithubSyncMs(projectId: string, ms: number): void {
  try {
    window.localStorage.setItem(PR_BOARD_LAST_GITHUB_SYNC_LS_PREFIX + projectId, String(ms))
  } catch {
    /* ignore */
  }
}

const PR_BOARD_LAST_GITHUB_SYNC_WAS_AUTO_LS_PREFIX = 'pr-manager.prBoard.lastGithubSyncWasAuto.v1:'

function readLastGithubSyncWasAuto(projectId: string): boolean {
  try {
    return window.localStorage.getItem(PR_BOARD_LAST_GITHUB_SYNC_WAS_AUTO_LS_PREFIX + projectId) === '1'
  } catch {
    return false
  }
}

function writeLastGithubSyncWasAuto(projectId: string, wasAuto: boolean): void {
  try {
    window.localStorage.setItem(PR_BOARD_LAST_GITHUB_SYNC_WAS_AUTO_LS_PREFIX + projectId, wasAuto ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const PR_BOARD_LAST_GITHUB_SYNC_REPO_LS_PREFIX = 'pr-manager.prBoard.lastGithubSyncRepoAt.v1:'
const PR_BOARD_LAST_GITHUB_SYNC_BRANCH_LS_PREFIX = 'pr-manager.prBoard.lastGithubSyncBranchAt.v1:'

function readLastGithubSyncRepoMs(projectId: string, repoId: string): number | null {
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

function writeLastGithubSyncRepoMs(projectId: string, repoId: string, ms: number): void {
  try {
    window.localStorage.setItem(`${PR_BOARD_LAST_GITHUB_SYNC_REPO_LS_PREFIX}${projectId}:${repoId}`, String(ms))
  } catch {
    /* ignore */
  }
}

function readLastGithubSyncBranchMs(projectId: string, trackedBranchId: string): number | null {
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

function writeLastGithubSyncBranchMs(projectId: string, trackedBranchId: string, ms: number): void {
  try {
    window.localStorage.setItem(`${PR_BOARD_LAST_GITHUB_SYNC_BRANCH_LS_PREFIX}${projectId}:${trackedBranchId}`, String(ms))
  } catch {
    /* ignore */
  }
}

/** Sau khoảng này kể từ mốc sync hiệu lực cuối → CloudAlert vàng. */
const PR_BOARD_SCOPED_SYNC_STALE_AFTER_MS = 60 * 60 * 1000

type GithubScopedSyncIdleVisual = 'never' | 'fresh' | 'stale'

function githubScopedSyncIdleVisual(lastMs: number | null, nowMs: number): GithubScopedSyncIdleVisual {
  if (lastMs == null) return 'never'
  if (nowMs - lastMs >= PR_BOARD_SCOPED_SYNC_STALE_AFTER_MS) return 'stale'
  return 'fresh'
}

/** Icon nhánh: mốc “còn tươi” = mới nhất giữa sync cả repo và sync đúng nhánh đó. */
function effectiveGithubSyncMsForBranchRow(repoMs: number | null, branchMs: number | null): number | null {
  const parts: number[] = []
  if (repoMs != null && Number.isFinite(repoMs)) parts.push(repoMs)
  if (branchMs != null && Number.isFinite(branchMs)) parts.push(branchMs)
  if (parts.length === 0) return null
  return Math.max(...parts)
}

function GithubScopedSyncIdleGlyph({ visual }: { visual: GithubScopedSyncIdleVisual }) {
  if (visual === 'stale') {
    return <CloudAlert className="h-3 w-3 text-amber-500 dark:text-amber-400" />
  }
  if (visual === 'fresh') {
    return (
      <CloudSync className="h-3 w-3 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300" />
    )
  }
  return <CloudSync className="h-3 w-3 text-muted-foreground" />
}

function formatScopedSyncTooltip(ms: number | null, lang: string, t: TFunction): string {
  if (ms == null) return t('prManager.board.lastScopedSyncNever')
  const loc = getDateFnsLocale(lang)
  const relative = formatDistanceToNow(new Date(ms), { addSuffix: true, locale: loc })
  const datetime = new Date(ms).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })
  return t('prManager.board.lastScopedSyncTooltip', { datetime, relative })
}

/** Bộ lọc bảng (GitHub + remote + no-PR) — theo projectId, giữ khi đóng app. */
const PR_BOARD_FILTERS_V1_PREFIX = 'pr-manager.prBoard.filters.v1:'

const DEFAULT_PR_GH_FILTER_LIST: readonly PrGhFilterId[] = ['open', 'draft']

function defaultPrGhFilterSet(): Set<PrGhFilterId> {
  return new Set(DEFAULT_PR_GH_FILTER_LIST)
}

function parsePrGhFiltersFromStorage(raw: unknown): Set<PrGhFilterId> {
  const allowed = new Set<string>(PR_GH_FILTER_IDS)
  if (!Array.isArray(raw)) return defaultPrGhFilterSet()
  const s = new Set<PrGhFilterId>()
  for (const x of raw) {
    if (typeof x === 'string' && allowed.has(x)) s.add(x as PrGhFilterId)
  }
  if (s.size === 0) return defaultPrGhFilterSet()
  return s
}

type PrBoardFiltersV1 = {
  gh: string[]
  remote: boolean
  noPr: boolean
  /** id repo bị bỏ khỏi bảng khi bật lọc — rỗng = hiện tất cả. */
  repoExcluded?: string[]
  /** Lọc theo từng template pr_* (chế độ Advanced). */
  ghByTpl?: Record<string, string[]>
  advancedOpen?: boolean
  /** AND / OR giữa các cột PR khi Advanced mở; mặc định and. */
  ghAdvCombine?: PrGhAdvancedCombineMode
  /** AND / OR giữa các cột PR khi lọc đơn; mặc định or (hành vi cũ). */
  ghSimpleCombine?: PrGhAdvancedCombineMode
}

function parseGhAdvCombineFromStorage(raw: unknown): PrGhAdvancedCombineMode {
  return raw === 'or' ? 'or' : 'and'
}

function parseGhSimpleCombineFromStorage(raw: unknown): PrGhAdvancedCombineMode {
  return raw === 'and' ? 'and' : 'or'
}

function parseGhByTplFromStorage(raw: unknown): Record<string, PrGhFilterId[]> {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, PrGhFilterId[]> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const set = parsePrGhFiltersFromStorage(v)
    out[k] = PR_GH_FILTER_IDS.filter(id => set.has(id))
  }
  return out
}

function parseRepoExcludedFromStorage(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const x of raw) {
    if (typeof x === 'string' && x.trim() !== '') out.push(x)
  }
  return [...new Set(out)].sort()
}

function readPrBoardFilters(projectId: string): {
  prGhFilters: Set<PrGhFilterId>
  onlyExistingOnRemote: boolean
  onlyBranchesWithoutPr: boolean
  prGhFiltersByTpl: Record<string, PrGhFilterId[]>
  advancedFiltersOpen: boolean
  prGhAdvancedCombineMode: PrGhAdvancedCombineMode
  prGhSimpleCombineMode: PrGhAdvancedCombineMode
  repoExcludedIds: string[]
} {
  try {
    const raw = window.localStorage.getItem(PR_BOARD_FILTERS_V1_PREFIX + projectId)
    if (raw == null || raw === '') {
      return {
        prGhFilters: defaultPrGhFilterSet(),
        onlyExistingOnRemote: true,
        onlyBranchesWithoutPr: true,
        prGhFiltersByTpl: {},
        advancedFiltersOpen: false,
        prGhAdvancedCombineMode: 'and',
        prGhSimpleCombineMode: 'or',
        repoExcludedIds: [],
      }
    }
    const p = JSON.parse(raw) as unknown
    if (p == null || typeof p !== 'object' || Array.isArray(p)) {
      return {
        prGhFilters: defaultPrGhFilterSet(),
        onlyExistingOnRemote: true,
        onlyBranchesWithoutPr: true,
        prGhFiltersByTpl: {},
        advancedFiltersOpen: false,
        prGhAdvancedCombineMode: 'and',
        prGhSimpleCombineMode: 'or',
        repoExcludedIds: [],
      }
    }
    const o = p as Record<string, unknown>
    return {
      prGhFilters: parsePrGhFiltersFromStorage(o.gh),
      onlyExistingOnRemote: typeof o.remote === 'boolean' ? o.remote : true,
      onlyBranchesWithoutPr: typeof o.noPr === 'boolean' ? o.noPr : true,
      prGhFiltersByTpl: parseGhByTplFromStorage(o.ghByTpl),
      advancedFiltersOpen: o.advancedOpen === true,
      prGhAdvancedCombineMode: parseGhAdvCombineFromStorage(o.ghAdvCombine),
      prGhSimpleCombineMode: parseGhSimpleCombineFromStorage(o.ghSimpleCombine),
      repoExcludedIds: parseRepoExcludedFromStorage(o.repoExcluded),
    }
  } catch {
    return {
      prGhFilters: defaultPrGhFilterSet(),
      onlyExistingOnRemote: true,
      onlyBranchesWithoutPr: true,
      prGhFiltersByTpl: {},
      advancedFiltersOpen: false,
      prGhAdvancedCombineMode: 'and',
      prGhSimpleCombineMode: 'or',
      repoExcludedIds: [],
    }
  }
}

function writePrBoardFilters(
  projectId: string,
  prGhFilters: Set<PrGhFilterId>,
  onlyExistingOnRemote: boolean,
  onlyBranchesWithoutPr: boolean,
  prGhFiltersByTpl: Record<string, PrGhFilterId[]>,
  advancedFiltersOpen: boolean,
  prGhAdvancedCombineMode: PrGhAdvancedCombineMode,
  prGhSimpleCombineMode: PrGhAdvancedCombineMode,
  repoExcludedIds: string[]
): void {
  try {
    const gh = [...prGhFilters].filter(id => (PR_GH_FILTER_IDS as readonly string[]).includes(id)).sort() as PrGhFilterId[]
    const ghByTpl: Record<string, string[]> = {}
    for (const [tid, arr] of Object.entries(prGhFiltersByTpl)) {
      const sorted = [...arr].filter(id => (PR_GH_FILTER_IDS as readonly string[]).includes(id)).sort() as PrGhFilterId[]
      ghByTpl[tid] = sorted
    }
    const repoExcluded = [...repoExcludedIds].filter(Boolean).sort()
    const payload: PrBoardFiltersV1 = {
      gh,
      remote: onlyExistingOnRemote,
      noPr: onlyBranchesWithoutPr,
      ghByTpl,
      advancedOpen: advancedFiltersOpen,
      ghAdvCombine: prGhAdvancedCombineMode,
      ghSimpleCombine: prGhSimpleCombineMode,
      ...(repoExcluded.length > 0 ? { repoExcluded } : {}),
    }
    window.localStorage.setItem(PR_BOARD_FILTERS_V1_PREFIX + projectId, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

const PR_BOARD_AUTO_SYNC_GITHUB_LS_PREFIX = 'pr-manager.prBoard.autoSyncGithub.v1:'

function readAutoSyncGithub(projectId: string): boolean {
  try {
    return window.localStorage.getItem(PR_BOARD_AUTO_SYNC_GITHUB_LS_PREFIX + projectId) === '1'
  } catch {
    return false
  }
}

function writeAutoSyncGithub(projectId: string, on: boolean): void {
  try {
    window.localStorage.setItem(PR_BOARD_AUTO_SYNC_GITHUB_LS_PREFIX + projectId, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/**
 * Idle trước khi auto-sync: nên đủ lớn để không gọi lại `trackedSyncFromGithub` quá thường xuyên
 * (mỗi lần sync tốn nhiều REST call / repo — gần giới hạn 5000 req/h của GitHub nếu sync liên tục).
 */
const PR_GITHUB_AUTO_SYNC_IDLE_MS = 30 * 60 * 1000
/** Chu kỳ chỉ kiểm tra điều kiện (không gọi API nếu chưa đủ idle). */
const PR_GITHUB_AUTO_SYNC_TICK_MS = 10 * 60 * 1000
/** Sau bulk, chờ thêm trước khi sync full — giảm lệch do GitHub index/API. */
const PR_POST_BULK_SYNC_SETTLE_MS = 750

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
      prText: 'text-teal-800 dark:text-teal-200',
      prIcon: 'text-teal-600 dark:text-teal-400',
      mergeCell: 'bg-teal-500/20 text-teal-950 dark:text-teal-50',
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
      prText: 'text-zinc-800 dark:text-zinc-200',
      prIcon: 'text-zinc-500 dark:text-zinc-400',
      mergeCell: 'bg-zinc-500/15 text-zinc-900 dark:text-zinc-100',
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

/** Cột pr_*: nền theo trạng thái PR; open + ready to merge = emerald (cùng họ với ô Merge). */
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
    return 'bg-teal-500/20'
  }
  if (ms === 'unstable') {
    return 'bg-yellow-500/15'
  }
  if (ms === 'unknown') {
    return 'bg-zinc-500/12 dark:bg-zinc-500/15'
  }
  return 'bg-emerald-500/[0.06] dark:bg-emerald-500/[0.05]'
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

/** Hover dòng: lớp inset rất nhẹ trên nền nhóm repo. */
const REPO_GROUP_ROW_HOVER_TRANSITION = 'transition-[box-shadow] duration-150'
const REPO_GROUP_ROW_HOVER_SHADOW = 'shadow-[inset_0_0_0_9999px_rgb(0_0_0_/_0.03)] dark:shadow-[inset_0_0_0_9999px_rgb(255_255_255_/_0.025)]'

export function PrBoard({
  projectId,
  userId,
  repos,
  templates,
  tracked,
  loading,
  onRefresh,
  onRefreshTracked,
  githubTokenOk = false,
}: Props) {
  const { t, i18n } = useTranslation()
  const opLog = usePrOperationLog()
  const syncLogActiveRef = useRef(false)
  const lastSyncLogAtRef = useRef(0)
  const lastLoggedPercentRef = useRef(-1)
  const [prBoardHoveredRowId, setPrBoardHoveredRowId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [createPrOpen, setCreatePrOpen] = useState(false)
  const [aiAssistOpen, setAiAssistOpen] = useState(false)
  const [createPrInitial, setCreatePrInitial] = useState<{
    repoId: string
    head: string
    base: string
    initialTitle?: string
    initialBody?: string
  } | null>(null)
  const [mergePrOpen, setMergePrOpen] = useState(false)
  const [mergePrCtx, setMergePrCtx] = useState<{ repo: PrRepo | null; prNumber: number | null }>({ repo: null, prNumber: null })
  const [prDetailOpen, setPrDetailOpen] = useState(false)
  const [prDetailRepo, setPrDetailRepo] = useState<PrRepo | null>(null)
  const [prDetailNumber, setPrDetailNumber] = useState<number | null>(null)
  const [fileOverlapOpen, setFileOverlapOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})
  const [githubSyncUi, setGithubSyncUi] = useState<GithubSyncUiState>({ kind: 'idle' })
  const [syncProgress, setSyncProgress] = useState(0)
  const [lastGithubSyncAt, setLastGithubSyncAt] = useState<number | null>(null)
  const [lastGithubSyncWasAuto, setLastGithubSyncWasAuto] = useState(false)
  /** Tăng sau đồng bộ theo repo/nhánh để re-render tooltip (đọc lại localStorage). */
  const [, setScopedSyncTick] = useState(0)
  /** Phút một lần để đổi CloudSync ↔ CloudAlert khi quá ngưỡng thời gian. */
  const [scopedSyncStaleClock, setScopedSyncStaleClock] = useState(0)
  const isAnyGithubSync = githubSyncUi.kind !== 'idle'
  const showFullTableGithubSyncOverlay = githubSyncUi.kind === 'full'
  const rowGithubSyncInteractionDisabled = useCallback(
    (row: TrackedBranchRow): boolean => {
      if (githubSyncUi.kind === 'repo') return row.repoId === githubSyncUi.repoId
      if (githubSyncUi.kind === 'branch') return row.id === githubSyncUi.rowId
      return false
    },
    [githubSyncUi],
  )
  const [autoSyncGithub, setAutoSyncGithub] = useState(false)
  const lastUserActivityAtRef = useRef(Date.now())
  const [prGhFilters, setPrGhFilters] = useState<Set<PrGhFilterId>>(() => new Set<PrGhFilterId>(['open', 'draft']))
  /** Chế độ Advanced: lọc theo từng cột pr_*; key = templateId, mảng rỗng = không chọn trạng thái nào. */
  const [prGhFiltersByTpl, setPrGhFiltersByTpl] = useState<Record<string, PrGhFilterId[]>>({})
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)
  /** Advanced: AND = mọi cột có PR đều khớp; OR = một cột có PR khớp là đủ. */
  const [prGhAdvancedCombineMode, setPrGhAdvancedCombineMode] = useState<PrGhAdvancedCombineMode>('and')
  /** Lọc đơn: AND = mọi cột pr_* (theo cùng bộ check) đều phải khớp; OR = một cột khớp là đủ (mặc định). */
  const [prGhSimpleCombineMode, setPrGhSimpleCombineMode] = useState<PrGhAdvancedCombineMode>('or')
  /** Repo id bị ẩn khi bỏ chọn checkbox — lưu trong bộ lọc v1. */
  const [repoExcludedIds, setRepoExcludedIds] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSizeChoice>(() => DEFAULT_PAGE_SIZE)
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

  const [showTableBorders, setShowTableBorders] = useState<boolean>(() => {
    try {
      if (typeof window === 'undefined') return true
      const v = window.localStorage.getItem(PR_BOARD_TABLE_BORDERS_LS)
      if (v === null) return true
      return v === '1'
    } catch {
      return true
    }
  })

  const persistTableBorders = (on: boolean) => {
    setShowTableBorders(on)
    try {
      window.localStorage.setItem(PR_BOARD_TABLE_BORDERS_LS, on ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  const [prMergeCellStyle, setPrMergeCellStyle] = useState<PrMergeCellVisualStyle>(() => readPrMergeCellStyleForProject(projectId))
  const persistPrMergeCellStyle = useCallback(
    (s: PrMergeCellVisualStyle) => {
      setPrMergeCellStyle(s)
      writePrMergeCellStyleForProject(projectId, s)
    },
    [projectId]
  )

  useEffect(() => {
    setPrMergeCellStyle(readPrMergeCellStyleForProject(projectId))
  }, [projectId])

  useEffect(() => {
    setLastGithubSyncAt(readLastGithubSyncMs(projectId))
    setLastGithubSyncWasAuto(readLastGithubSyncWasAuto(projectId))
  }, [projectId])

  useEffect(() => {
    const id = window.setInterval(() => setScopedSyncStaleClock(c => c + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  useLayoutEffect(() => {
    const r = readPrBoardFilters(projectId)
    setPrGhFilters(r.prGhFilters)
    setOnlyExistingOnRemote(r.onlyExistingOnRemote)
    setOnlyBranchesWithoutPr(r.onlyBranchesWithoutPr)
    setPrGhFiltersByTpl(r.prGhFiltersByTpl)
    setAdvancedFiltersOpen(r.advancedFiltersOpen)
    setPrGhAdvancedCombineMode(r.prGhAdvancedCombineMode)
    setPrGhSimpleCombineMode(r.prGhSimpleCombineMode)
    setRepoExcludedIds(r.repoExcludedIds)
    setPageSize(readPrBoardPageSize(projectId))
  }, [projectId])

  useEffect(() => {
    writePrBoardFilters(
      projectId,
      prGhFilters,
      onlyExistingOnRemote,
      onlyBranchesWithoutPr,
      prGhFiltersByTpl,
      advancedFiltersOpen,
      prGhAdvancedCombineMode,
      prGhSimpleCombineMode,
      repoExcludedIds
    )
  }, [projectId, prGhFilters, onlyExistingOnRemote, onlyBranchesWithoutPr, prGhFiltersByTpl, advancedFiltersOpen, prGhAdvancedCombineMode, prGhSimpleCombineMode, repoExcludedIds])

  useEffect(() => {
    const valid = new Set(repos.map(r => r.id))
    setRepoExcludedIds(prev => {
      const next = prev.filter(id => valid.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [repos])

  useEffect(() => {
    setAutoSyncGithub(readAutoSyncGithub(projectId))
  }, [projectId])

  useEffect(() => {
    if (autoSyncGithub) lastUserActivityAtRef.current = Date.now()
  }, [autoSyncGithub])

  const lastGithubSyncLabel = useMemo(() => {
    if (lastGithubSyncAt == null) return null
    const loc = getDateFnsLocale(i18n.language)
    return formatDistanceToNow(new Date(lastGithubSyncAt), { addSuffix: true, locale: loc })
  }, [lastGithubSyncAt, i18n.language])

  const activeTemplates = useMemo(() => templates.filter(t => t.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [templates])
  const orderedPrCheckpointTemplates = useMemo(() => activePrTemplates(activeTemplates), [activeTemplates])

  /** Thêm mục lọc cho template pr_* mới (copy theo bộ lọc đơn hiện tại). */
  useEffect(() => {
    setPrGhFiltersByTpl(prev => {
      let changed = false
      const next = { ...prev }
      for (const tpl of orderedPrCheckpointTemplates) {
        if (!(tpl.id in next)) {
          next[tpl.id] = PR_GH_FILTER_IDS.filter(id => prGhFilters.has(id))
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [orderedPrCheckpointTemplates, prGhFilters])

  const prOverlapCandidates = useMemo(() => collectOpenPrsForFileOverlap(tracked, activeTemplates), [tracked, activeTemplates])

  useEffect(() => {
    void hydratePrBoardSkippedBranchesFromApi(userId, projectId)
  }, [projectId, userId])

  const skipBranchesSnapshot = useSyncExternalStore(
    useCallback(onChange => subscribePrBoardSkippedBranches(projectId, userId, onChange), [projectId, userId]),
    () => readSkippedBranchesSnapshotText(projectId, userId),
    () => ''
  )
  const skipBranchPatterns = useMemo(
    () => (skipBranchesSnapshot === '' ? [] : skipBranchesSnapshot.split('\n')),
    [skipBranchesSnapshot]
  )

  const sortedReposForFilter = useMemo(
    () => [...repos].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [repos]
  )
  const repoExcludedSet = useMemo(() => new Set(repoExcludedIds), [repoExcludedIds])

  const prGhFilterKey = useMemo(() => {
    if (advancedFiltersOpen) {
      const entries = Object.keys(prGhFiltersByTpl)
        .sort()
        .map(id => `${id}:${PR_GH_FILTER_IDS.filter(k => prGhFiltersByTpl[id]?.includes(k)).join(',')}`)
      return `adv:${prGhAdvancedCombineMode}:${entries.join('|')}`
    }
    return `simp:${prGhSimpleCombineMode}:${[...prGhFilters].sort().join(',')}`
  }, [advancedFiltersOpen, prGhAdvancedCombineMode, prGhSimpleCombineMode, prGhFilters, prGhFiltersByTpl])
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
      if (repoExcludedSet.has(r.repoId)) return false
      if (skipBranchPatterns.length > 0 && branchNameMatchesSkipList(r.branchName, skipBranchPatterns)) return false
      if (!q) return true
      const author = (githubPrCreatorLogin(r, activeTemplates) ?? '').toLowerCase()
      return r.branchName.toLowerCase().includes(q) || r.repoName.toLowerCase().includes(q) || author.includes(q) || (r.note ?? '').toLowerCase().includes(q)
    })
  }, [tracked, search, activeTemplates, skipBranchPatterns, repoExcludedSet])

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

  /** Cùng tập nhánh với `remoteFilteredRows` (đồng bộ count filter GitHub / Advanced với bảng). */
  const prGhFilterCountRows = remoteFilteredRows

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

  /** Số PR theo trạng thái riêng từng cột pr_* (dùng hiển thị trong Advanced). */
  const prGhAdvancedColumnCounts = useMemo(() => {
    const m: Record<string, Record<PrGhFilterId, number>> = {}
    for (const tpl of orderedPrCheckpointTemplates) {
      const counts: Record<PrGhFilterId, number> = { open: 0, draft: 0, merged: 0, closed: 0 }
      for (const row of prGhFilterCountRows) {
        const prCp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
        if (!prCp?.prNumber) continue
        const mergeTpl = activeTemplates.find(t => t.code.toLowerCase().startsWith('merge_') && t.targetBranch === tpl.targetBranch)
        const mergeCp = mergeTpl ? (row.checkpoints.find(c => c.templateId === mergeTpl.id) ?? null) : null
        counts[derivePrKind(prCp, mergeCp)]++
      }
      m[tpl.id] = counts
    }
    return m
  }, [prGhFilterCountRows, orderedPrCheckpointTemplates, activeTemplates])

  const branchesWithoutPrCount = useMemo(() => {
    if (remoteExistMap == null) return 0
    let n = 0
    for (const row of prGhFilterCountRows) {
      if (rowHasAnyPrNumber(row, activeTemplates)) continue
      if (remoteExistMap[row.id] === true) n++
    }
    return n
  }, [prGhFilterCountRows, activeTemplates, remoteExistMap])

  /** Số nhánh trong danh sách hiện tại (search + repo + skip) vẫn còn ref trên GitHub remote — dùng cho label On remote. */
  const branchesOnRemoteCount = useMemo(() => {
    if (remoteExistMap == null) return null
    let n = 0
    for (const row of searchRows) {
      if (remoteExistMap[row.id] === true) n++
    }
    return n
  }, [searchRows, remoteExistMap])

  const filteredRows = useMemo(() => {
    const matchPrRow = (row: TrackedBranchRow) => {
      if (advancedFiltersOpen) {
        return rowMatchesPrGhFiltersPerTemplate(row, activeTemplates, prGhFiltersByTpl, prGhFilters, prGhAdvancedCombineMode)
      }
      return rowMatchesPrGhFiltersPerTemplate(row, activeTemplates, {}, prGhFilters, prGhSimpleCombineMode)
    }
    const fromKind = remoteFilteredRows.filter(matchPrRow)
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
  }, [
    remoteFilteredRows,
    activeTemplates,
    prGhFilters,
    advancedFiltersOpen,
    prGhAdvancedCombineMode,
    prGhSimpleCombineMode,
    prGhFiltersByTpl,
    onlyBranchesWithoutPr,
    onlyExistingOnRemote,
    remoteExistMap,
  ])

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

  /** Số PR theo trạng thái GitHub, chia theo từng cột pr_* (mỗi ô prNumber = 1 PR). */
  const repoPrKindCountsByTpl = useMemo(() => {
    const m = new Map<string, Record<string, Record<PrGhFilterId, number>>>()
    for (const [key, rows] of groupedRows) {
      const byTpl: Record<string, Record<PrGhFilterId, number>> = {}
      for (const tpl of orderedPrCheckpointTemplates) {
        byTpl[tpl.id] = { open: 0, draft: 0, merged: 0, closed: 0 }
      }
      for (const row of rows) {
        for (const tpl of orderedPrCheckpointTemplates) {
          const prCp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
          if (!prCp?.prNumber) continue
          const mergeTpl = activeTemplates.find(t => t.code.toLowerCase().startsWith('merge_') && t.targetBranch === tpl.targetBranch)
          const mergeCp = mergeTpl ? (row.checkpoints.find(c => c.templateId === mergeTpl.id) ?? null) : null
          byTpl[tpl.id][derivePrKind(prCp, mergeCp)]++
        }
      }
      m.set(key, byTpl)
    }
    return m
  }, [groupedRows, orderedPrCheckpointTemplates, activeTemplates])

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

  /** Chỉ gỡ selection khi nhánh không còn trong tracked; giữ checkbox khi đổi search/filter. */
  const trackedRowIdSet = useMemo(() => new Set(tracked.map(r => r.id)), [tracked])

  useEffect(() => {
    setSelectedRowIds(prev => {
      let changed = false
      const n = new Set<string>()
      for (const id of prev) {
        if (trackedRowIdSet.has(id)) n.add(id)
        else changed = true
      }
      if (!changed && n.size === prev.size) return prev
      return n
    })
  }, [trackedRowIdSet])

  const selectedRowsFull = useMemo(() => tracked.filter(r => selectedRowIds.has(r.id)), [tracked, selectedRowIds])

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
      return {
        merge: 0,
        close: 0,
        draft: 0,
        ready: 0,
        approve: 0,
        reopen: 0,
        requestReviewers: 0,
        updateBranch: 0,
        deleteBranch: 0,
        create: 0,
      }
    }
    const countPr = (k: 'merge' | 'close' | 'draft' | 'ready' | 'approve' | 'reopen' | 'requestReviewers' | 'updateBranch') =>
      resolveBulkPrTargets(k, rows, activeTemplates, repos).filter(x => x.eligible).length
    const deleteN = resolveBulkDeleteBranchTargets(rows, repos, activeTemplates, remoteExistMap, onlyExistingOnRemote).filter(x => x.eligible).length
    const createAnyStageN = countRowsEligibleForBulkCreateOnAnyPrTemplate(rows, activeTemplates, repos, remoteExistMap, onlyExistingOnRemote)
    return {
      merge: countPr('merge'),
      close: countPr('close'),
      draft: countPr('draft'),
      ready: countPr('ready'),
      approve: countPr('approve'),
      reopen: countPr('reopen'),
      requestReviewers: countPr('requestReviewers'),
      updateBranch: countPr('updateBranch'),
      deleteBranch: deleteN,
      create: createAnyStageN,
    }
  }, [selectedRowsFull, githubTokenOk, activeTemplates, repos, remoteExistMap, onlyExistingOnRemote])

  const bulkCreatePrToolbarEnabled = githubTokenOk && selectedRowsFull.length > 0 && orderedPrCheckpointTemplates.length > 0 && bulkElig.create > 0

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

  const bumpUserActivity = useCallback(() => {
    lastUserActivityAtRef.current = Date.now()
  }, [])

  const toggleAdvancedFilters = useCallback(() => {
    setAdvancedFiltersOpen(prevOpen => {
      if (!prevOpen) {
        setPrGhFiltersByTpl(prevTpl => {
          const merged = { ...prevTpl }
          for (const tpl of orderedPrCheckpointTemplates) {
            if (!(tpl.id in merged)) {
              merged[tpl.id] = PR_GH_FILTER_IDS.filter(id => prGhFilters.has(id))
            }
          }
          return merged
        })
      }
      return !prevOpen
    })
  }, [orderedPrCheckpointTemplates, prGhFilters])

  const toggleTplGhFilter = useCallback((tplId: string, id: PrGhFilterId, checked: boolean) => {
    setPrGhFiltersByTpl(prev => {
      const base = prev[tplId] !== undefined ? [...prev[tplId]] : PR_GH_FILTER_IDS.filter(k => prGhFilters.has(k))
      const nextSet = new Set(base)
      if (checked) nextSet.add(id)
      else nextSet.delete(id)
      return { ...prev, [tplId]: PR_GH_FILTER_IDS.filter(k => nextSet.has(k)) }
    })
  }, [prGhFilters])

  const syncAdvancedFiltersFromSimple = useCallback(() => {
    setPrGhFiltersByTpl(prev => {
      const next = { ...prev }
      for (const tpl of orderedPrCheckpointTemplates) {
        next[tpl.id] = PR_GH_FILTER_IDS.filter(id => prGhFilters.has(id))
      }
      return next
    })
  }, [orderedPrCheckpointTemplates, prGhFilters])

  const handleSyncFromGithub = useCallback(
    async (source: 'manual' | 'idle' = 'manual', scope?: { repoId?: string; trackedBranchId?: string }) => {
      const isIdle = source === 'idle'
      const effectiveScope = isIdle ? undefined : scope
      bumpUserActivity()

      if (!userId?.trim()) {
        if (!isIdle) {
          toast.error(t('evm.pleaseLoginFirst'))
        }
        return
      }
      const uid = userId.trim()

      if (!isIdle) {
        const scopedIconSync =
          Boolean(effectiveScope?.repoId) || Boolean(effectiveScope?.trackedBranchId)
        if (
          !opLog.startOperation(
            'prManager.operationLog.titleSyncGithub',
            undefined,
            scopedIconSync ? { silent: true } : undefined,
          )
        )
          return
      }

      syncLogActiveRef.current = !isIdle
      lastSyncLogAtRef.current = 0
      lastLoggedPercentRef.current = -1
      setSyncProgress(0)
      if (effectiveScope?.trackedBranchId) {
        setGithubSyncUi({ kind: 'branch', rowId: effectiveScope.trackedBranchId })
      } else if (effectiveScope?.repoId) {
        setGithubSyncUi({ kind: 'repo', repoId: effectiveScope.repoId })
      } else {
        setGithubSyncUi({ kind: 'full' })
      }
      if (!isIdle) {
        opLog.appendLine(t('prManager.operationLog.syncStart'))
      }
      try {
        const res = await window.api.pr.trackedSyncFromGithub(uid, projectId, effectiveScope)
        if (res.status === 'success' && res.data) {
          const { synced, branchesSynced = 0, errors } = res.data
          if (!isIdle) {
            opLog.appendLine(
              t('prManager.operationLog.syncSummary', {
                prs: synced,
                branches: branchesSynced,
              })
            )
          }
          if (!isIdle) {
            if (synced > 0 || branchesSynced > 0) {
              toast.success(t('prManager.board.syncOkDetailed', { prs: synced, branches: branchesSynced }))
            } else {
              toast.success(t('prManager.board.syncNone'))
            }
          }
          if (errors.length > 0) {
            const errText = errors.join('; ')
            if (!isIdle) {
              opLog.appendLine(t('prManager.operationLog.syncSomeErrors', { errors: errText }))
            }
            toast.error(t('prManager.board.syncSomeFailed', { list: errText }))
          }
          const syncAt = Date.now()
          if (effectiveScope?.trackedBranchId) {
            writeLastGithubSyncBranchMs(projectId, effectiveScope.trackedBranchId, syncAt)
            setScopedSyncTick(v => v + 1)
          } else if (effectiveScope?.repoId) {
            const repoId = effectiveScope.repoId
            writeLastGithubSyncRepoMs(projectId, repoId, syncAt)
            const listRes = await window.api.pr.trackedList(uid, projectId)
            if (listRes.status === 'success' && Array.isArray(listRes.data)) {
              for (const row of listRes.data as TrackedBranchRow[]) {
                if (row.repoId === repoId) {
                  writeLastGithubSyncBranchMs(projectId, row.id, syncAt)
                }
              }
            }
            setScopedSyncTick(v => v + 1)
          } else {
            writeLastGithubSyncMs(projectId, syncAt)
            writeLastGithubSyncWasAuto(projectId, isIdle)
            setLastGithubSyncAt(syncAt)
            setLastGithubSyncWasAuto(isIdle)
            for (const r of repos) {
              writeLastGithubSyncRepoMs(projectId, r.id, syncAt)
            }
            const listResFull = await window.api.pr.trackedList(uid, projectId)
            if (listResFull.status === 'success' && Array.isArray(listResFull.data)) {
              for (const row of listResFull.data as TrackedBranchRow[]) {
                writeLastGithubSyncBranchMs(projectId, row.id, syncAt)
              }
            }
            setScopedSyncTick(v => v + 1)
          }
          if (effectiveScope?.repoId || effectiveScope?.trackedBranchId) {
            await Promise.resolve(onRefreshTracked?.())
          } else {
            await Promise.resolve(onRefresh())
          }
          if (!isIdle) {
            opLog.finishSuccess()
          }
        } else {
          const msg = res.message || t('prManager.board.syncFail')
          toast.error(msg)
          if (!isIdle) {
            opLog.finishError(msg)
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!isIdle) {
          opLog.finishError(msg)
        }
        toast.error(msg)
      } finally {
        syncLogActiveRef.current = false
        setGithubSyncUi({ kind: 'idle' })
        setSyncProgress(0)
      }
    },
    [bumpUserActivity, onRefresh, onRefreshTracked, opLog, projectId, repos, t, userId]
  )

  const onAfterBulkBatch = useCallback(async () => {
    if (!userId?.trim()) {
      await Promise.resolve(onRefresh())
      return
    }
    if (githubTokenOk) {
      await new Promise<void>(r => setTimeout(r, PR_POST_BULK_SYNC_SETTLE_MS))
      await handleSyncFromGithub('manual')
    } else {
      await Promise.resolve(onRefresh())
    }
  }, [userId, githubTokenOk, onRefresh, handleSyncFromGithub])

  useEffect(() => {
    if (!autoSyncGithub) return
    const opts: AddEventListenerOptions = { capture: true, passive: true }
    const events: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown', 'wheel']
    for (const ev of events) {
      document.addEventListener(ev, bumpUserActivity as EventListener, opts)
    }
    return () => {
      for (const ev of events) {
        document.removeEventListener(ev, bumpUserActivity as EventListener, opts)
      }
    }
  }, [autoSyncGithub, bumpUserActivity])

  useEffect(() => {
    if (!autoSyncGithub) return
    const id = window.setInterval(() => {
      if (isAnyGithubSync || opLog.isBusy || repos.length === 0 || !githubTokenOk || !userId?.trim()) return
      if (Date.now() - lastUserActivityAtRef.current < PR_GITHUB_AUTO_SYNC_IDLE_MS) return
      void handleSyncFromGithub('idle')
    }, PR_GITHUB_AUTO_SYNC_TICK_MS)
    return () => clearInterval(id)
  }, [autoSyncGithub, githubTokenOk, handleSyncFromGithub, opLog.isBusy, repos.length, isAnyGithubSync, userId])

  const opLogRef = useRef(opLog)
  opLogRef.current = opLog
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    const off = window.api.pr.onTrackedSyncProgress(payload => {
      if (payload.projectId !== projectId) return
      const pct = Math.max(0, Math.min(100, payload.percent))
      setSyncProgress(pct)
      if (!syncLogActiveRef.current) return
      const now = Date.now()
      if (now - lastSyncLogAtRef.current < 350 && Math.abs(pct - lastLoggedPercentRef.current) < 8) return
      lastSyncLogAtRef.current = now
      lastLoggedPercentRef.current = pct
      opLogRef.current.appendLine(tRef.current('prManager.operationLog.syncProgress', { done: payload.done, total: payload.total, percent: pct }))
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleSyncFromGithub('manual')}
            className="h-8 gap-1"
            disabled={repos.length === 0 || isAnyGithubSync}
            title={t('prManager.board.syncFromGithubHelp')}
          >
            <CloudDownload className={cn('h-3.5 w-3.5', showFullTableGithubSyncOverlay && 'animate-pulse')} />
            {showFullTableGithubSyncOverlay ? `${syncProgress}%` : t('prManager.board.syncFromGithub')}
          </Button>
          {lastGithubSyncLabel != null && lastGithubSyncAt != null ? (
            <span
              className="text-xs text-muted-foreground tabular-nums"
              title={
                new Date(lastGithubSyncAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) +
                (lastGithubSyncWasAuto ? t('prManager.board.lastGithubSyncAutoSuffix') : '')
              }
            >
              {t('prManager.board.lastGithubSync', {
                time: lastGithubSyncLabel + (lastGithubSyncWasAuto ? t('prManager.board.lastGithubSyncAutoSuffix') : ''),
              })}
            </span>
          ) : null}
          <div className="flex items-center gap-1.5 border-l border-border/60 pl-2">
            <Checkbox
              id="pr-board-auto-sync-github"
              checked={autoSyncGithub}
              className="data-[state=checked]:border-violet-600 data-[state=checked]:bg-violet-600 data-[state=checked]:text-white dark:data-[state=checked]:border-violet-500 dark:data-[state=checked]:bg-violet-600"
              onCheckedChange={v => {
                const on = v === true
                setAutoSyncGithub(on)
                writeAutoSyncGithub(projectId, on)
              }}
              disabled={!githubTokenOk || repos.length === 0}
            />
            <Label
              htmlFor="pr-board-auto-sync-github"
              title={t('prManager.board.autoSyncGithubHelp')}
              className={cn(
                'cursor-pointer text-xs font-medium leading-none text-violet-900 dark:text-violet-200',
                (!githubTokenOk || repos.length === 0) && 'cursor-not-allowed opacity-50'
              )}
            >
              {t('prManager.board.autoSyncGithub')}
            </Label>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2"
                disabled={!githubTokenOk || repos.length === 0}
                onClick={() => setFileOverlapOpen(true)}
                aria-label={t('prManager.fileOverlap.ariaOpen')}
              >
                <FileWarning className="h-3.5 w-3.5 shrink-0 text-amber-600/85 dark:text-amber-400/90" />
                <span className="max-w-[7rem] truncate text-xs font-medium sm:max-w-none">{t('prManager.fileOverlap.buttonLabel')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {t('prManager.fileOverlap.tooltip')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2"
                disabled={repos.length === 0}
                onClick={() => setAiAssistOpen(true)}
                aria-label={t('prManager.aiAssist.openButton')}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
                <span className="max-w-[6.5rem] truncate text-xs font-medium sm:max-w-none">{t('prManager.aiAssist.openButton')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {t('prManager.aiAssist.sheetHint')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {sortedReposForFilter.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
          <span className="mr-1 shrink-0 text-xs font-medium text-muted-foreground">{t('prManager.board.filterRepos')}</span>
          {sortedReposForFilter.map(repo => (
            <div key={repo.id} className="flex max-w-[min(100%,16rem)] items-center gap-1.5">
              <Checkbox
                id={`pr-repo-filter-${repo.id}`}
                checked={!repoExcludedSet.has(repo.id)}
                className="shrink-0 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-500 dark:data-[state=checked]:bg-blue-600"
                onCheckedChange={v => {
                  const show = v === true
                  setRepoExcludedIds(prev => {
                    if (show) {
                      const next = prev.filter(id => id !== repo.id)
                      return next.length === prev.length ? prev : next
                    }
                    if (prev.includes(repo.id)) return prev
                    return [...prev, repo.id].sort()
                  })
                }}
              />
              <Label
                htmlFor={`pr-repo-filter-${repo.id}`}
                className="min-w-0 cursor-pointer truncate text-xs font-medium leading-none text-foreground"
                title={`${repo.name} (${repo.owner}/${repo.repo})`}
              >
                {repo.name}
              </Label>
            </div>
          ))}
        </div>
      )}

      {repos.length > 0 && activeTemplates.length > 0 && (
        <div className="flex flex-wrap items-stretch gap-2 sm:gap-3">
          <div className="flex min-w-0 min-h-8 flex-1 flex-col gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-xs font-medium text-muted-foreground">
                {advancedFiltersOpen ? t('prManager.board.filterPrsAdvanced') : t('prManager.board.filterPrs')}
              </span>
              {!advancedFiltersOpen
                ? PR_GH_FILTER_IDS.map(id => (
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
                ))
                : null}
              {!advancedFiltersOpen ? (
                <>
                  <div className="h-3 w-px shrink-0 self-center bg-border" aria-hidden />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">{t('prManager.board.advancedCombineLabel')}</span>
                    <ToggleGroup
                      type="single"
                      value={prGhSimpleCombineMode}
                      onValueChange={v => {
                        if (v === 'and' || v === 'or') setPrGhSimpleCombineMode(v)
                      }}
                      variant="default"
                      size="xs"
                      spacing={0}
                      className={cn(
                        'shrink-0 gap-0 rounded-lg bg-zinc-200/95 shadow-sm',
                        'dark:bg-zinc-800 dark:shadow-black/20'
                      )}
                    >
                      <ToggleGroupItem
                        value="and"
                        title={t('prManager.board.advancedCombineAndHelp')}
                        className={cn(
                          'border-0 font-medium shadow-none',
                          'rounded-sm text-muted-foreground hover:bg-zinc-300/70 hover:text-foreground dark:hover:bg-zinc-700',
                          'data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground',
                          'data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground',
                          'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                        )}
                      >
                        {t('prManager.board.advancedCombineAnd')}
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="or"
                        title={t('prManager.board.advancedCombineOrHelp')}
                        className={cn(
                          'border-0 font-medium shadow-none',
                          'rounded-sm text-muted-foreground hover:bg-zinc-300/70 hover:text-foreground dark:hover:bg-zinc-700',
                          'data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground',
                          'data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground',
                          'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                        )}
                      >
                        {t('prManager.board.advancedCombineOr')}
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </>
              ) : null}
              <div className="h-3 w-px shrink-0 self-center bg-border" aria-hidden />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{t('prManager.board.filterByBranchLabel')}</span>
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
                  <Label htmlFor="pr-filter-remote-exists" className="flex cursor-pointer items-center gap-1.5 text-xs font-medium leading-none text-cyan-800 dark:text-cyan-200 tabular-nums">
                    {remoteExistLoading && onlyExistingOnRemote ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : null}
                    {`${t('prManager.board.onlyRemote')} (${remoteExistMap == null && remoteExistLoading ? '—' : branchesOnRemoteCount == null ? '—' : branchesOnRemoteCount})`}
                  </Label>
                </div>
                <div className="h-3 w-px shrink-0 self-center bg-border" aria-hidden />
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
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {advancedFiltersOpen ? (
                  <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground" onClick={syncAdvancedFiltersFromSimple}>
                    {t('prManager.board.syncAdvancedFromSimple')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 px-2 text-xs"
                  onClick={toggleAdvancedFilters}
                  aria-expanded={advancedFiltersOpen}
                  title={t('prManager.board.advancedFiltersHelp')}
                >
                  {advancedFiltersOpen ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                  {advancedFiltersOpen ? t('prManager.board.advancedCollapse') : t('prManager.board.advancedOpen')}
                </Button>
              </div>
            </div>
            {advancedFiltersOpen ? (
              <div className="flex flex-col gap-2 border-t border-border/60 pt-2">
                <p className="text-[11px] leading-snug text-muted-foreground">{t('prManager.board.advancedFiltersHelp')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground">{t('prManager.board.advancedCombineLabel')}</span>
                  <ToggleGroup
                    type="single"
                    value={prGhAdvancedCombineMode}
                    onValueChange={v => {
                      if (v === 'and' || v === 'or') setPrGhAdvancedCombineMode(v)
                    }}
                    variant="default"
                    size="xs"
                    spacing={0}
                    className={cn(
                      'shrink-0 gap-0 rounded-lg bg-zinc-200/95 shadow-sm',
                      'dark:bg-zinc-800 dark:shadow-black/20'
                    )}
                  >
                    <ToggleGroupItem
                      value="and"
                      title={t('prManager.board.advancedCombineAndHelp')}
                      className={cn(
                        'border-0 font-medium shadow-none',
                        'rounded-sm text-muted-foreground hover:bg-zinc-300/70 hover:text-foreground dark:hover:bg-zinc-700',
                        'data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground',
                        'data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground',
                        'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                      )}
                    >
                      {t('prManager.board.advancedCombineAnd')}
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="or"
                      title={t('prManager.board.advancedCombineOrHelp')}
                      className={cn(
                        'border-0 font-medium shadow-none',
                        'rounded-sm text-muted-foreground hover:bg-zinc-300/70 hover:text-foreground dark:hover:bg-zinc-700',
                        'data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground',
                        'data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground',
                        'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                      )}
                    >
                      {t('prManager.board.advancedCombineOr')}
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                {orderedPrCheckpointTemplates.map(tpl => {
                  const colCounts = prGhAdvancedColumnCounts[tpl.id]
                  const effective = prGhFiltersByTpl[tpl.id] ?? PR_GH_FILTER_IDS.filter(k => prGhFilters.has(k))
                  return (
                    <div key={tpl.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-l-2 border-l-border/80 pl-2">
                      <span className="min-w-[6rem] max-w-[160px] truncate text-xs font-semibold text-foreground/90" title={tpl.label}>
                        {tpl.label}
                      </span>
                      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                        {PR_GH_FILTER_IDS.map(id => (
                          <div key={id} className="flex items-center gap-1.5">
                            <Checkbox
                              id={`pr-gh-filter-${tpl.id}-${id}`}
                              checked={effective.includes(id)}
                              className={PR_GH_FILTER_STYLE[id].checkbox}
                              onCheckedChange={v => toggleTplGhFilter(tpl.id, id, v === true)}
                            />
                            <Label
                              htmlFor={`pr-gh-filter-${tpl.id}-${id}`}
                              className={cn('cursor-pointer text-xs font-medium leading-none tabular-nums', PR_GH_FILTER_STYLE[id].label)}
                            >
                              {t(`prManager.ghStatus.${id}`)} ({colCounts?.[id] ?? 0})
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
          <div className="ml-auto flex min-h-8 shrink-0 flex-wrap items-center justify-end gap-1.5 rounded-md border border-dashed bg-muted/30 px-2 py-2 sm:gap-2 sm:px-3">
            {selectedRowIds.size > 0 ? (
              <span className="mr-0.5 text-xs tabular-nums text-muted-foreground">{t('prManager.bulk.nSelected', { count: selectedRowIds.size })}</span>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 text-sky-700 hover:bg-sky-500/10 dark:text-sky-400"
                  disabled={!bulkCreatePrToolbarEnabled}
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
                  className="h-8 w-8 text-violet-700 hover:bg-violet-500/10 dark:text-violet-400"
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
                  className="h-8 w-8 text-teal-700 hover:bg-teal-500/10 dark:text-teal-400"
                  disabled={!githubTokenOk || bulkElig.approve === 0}
                  onClick={() => setBulkToolbarConfirm('approve')}
                >
                  <BadgeCheck className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {t('prManager.bulk.tt.approve')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 text-rose-700 hover:bg-rose-500/10 dark:text-rose-400"
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
                  className="h-8 w-8 text-orange-700 hover:bg-orange-500/10 dark:text-orange-400"
                  disabled={!githubTokenOk || bulkElig.reopen === 0}
                  onClick={() => setBulkToolbarConfirm('reopen')}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {t('prManager.bulk.tt.reopen')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 text-slate-600 hover:bg-slate-500/10 dark:text-slate-400"
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
                  className="h-8 w-8 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
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
                  className="h-8 w-8 text-fuchsia-700 hover:bg-fuchsia-500/10 dark:text-fuchsia-400"
                  disabled={!githubTokenOk || bulkElig.requestReviewers === 0}
                  onClick={() => setBulkToolbarConfirm('requestReviewers')}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {t('prManager.bulk.tt.requestReviewers')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 text-teal-700 hover:bg-teal-500/10 dark:text-teal-400"
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
                  className="h-8 w-8 text-red-700 hover:bg-red-500/10 dark:text-red-400"
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
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  disabled={selectedRowIds.size === 0}
                  onClick={() => setBulkToolbarConfirm('clearSelection')}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {t('prManager.bulk.tt.clearSelection')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      {repos.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed p-10 text-sm text-muted-foreground">{t('prManager.board.emptyNoRepos')}</div>
      ) : activeTemplates.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed p-10 text-sm text-muted-foreground">{t('prManager.board.emptyNoTemplates')}</div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
          {showFullTableGithubSyncOverlay ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/60 backdrop-blur-[1px]" aria-busy="true" aria-live="polite">
              <GlowLoader className="h-10 w-10" />
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain" onScrollCapture={autoSyncGithub ? bumpUserActivity : undefined}>
            <Table>
              <TableHeader className="border-b-2 border-b-border shadow-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead
                    className={cn(
                      'sticky top-0 z-20 w-0 min-w-[200px] max-w-[min(900px,96vw)] whitespace-normal bg-muted/95 px-2 pr-3 text-left align-top backdrop-blur-sm',
                      showTableBorders && COL_DIVIDER_R,
                      showTableBorders && COL_DIVIDER_B
                    )}
                  >
                    {t('prManager.board.colRepo')}
                  </TableHead>
                  <TableHead className={cn(COL_BRANCH, 'sticky top-0 z-20 bg-muted/95 backdrop-blur-sm', showTableBorders && COL_DIVIDER_R, showTableBorders && COL_DIVIDER_B)}>
                    <span className="block truncate">{t('prManager.board.colBranch')}</span>
                  </TableHead>
                  {activeTemplates.map(tpl => (
                    <TableHead
                      key={tpl.id}
                      className={cn(
                        'sticky top-0 z-20 min-w-[72px] whitespace-normal px-1.5 text-center align-top backdrop-blur-sm',
                        checkpointTableHeadGroupClass(tpl.headerGroupId),
                        COL_PR_CHECKPOINT,
                        showTableBorders && COL_DIVIDER_R,
                        showTableBorders && COL_DIVIDER_B
                      )}
                    >
                      <span className="block w-full truncate text-xs font-medium" title={tpl.label}>
                        {tpl.label}
                      </span>
                    </TableHead>
                  ))}
                  {SHOW_NOTE_COLUMN && (
                    <TableHead className={cn('sticky top-0 z-20 min-w-[180px] bg-muted/95 backdrop-blur-sm', showTableBorders && COL_DIVIDER_R, showTableBorders && COL_DIVIDER_B)}>
                      {t('prManager.board.colNote')}
                    </TableHead>
                  )}
                  <TableHead className={cn('sticky top-0 z-20 w-10 bg-muted/95 px-1 text-center backdrop-blur-sm', showTableBorders && COL_DIVIDER_B)}>
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
                  <TableRow className={showTableBorders ? 'border-b-0' : undefined}>
                    <TableCell
                      colSpan={3 + activeTemplates.length + (SHOW_NOTE_COLUMN ? 1 : 0)}
                      className={cn('py-8 text-center text-sm text-muted-foreground', showTableBorders && COL_DIVIDER_B)}
                    >
                      {existenceCheckPending && searchRows.length > 0
                        ? t('prManager.board.emptyFilterChecking')
                        : onlyExistingOnRemote && !existenceCheckPending && searchRows.length > 0 && remoteFilteredRows.length === 0
                          ? t('prManager.board.emptyNoRemote')
                          : t('prManager.board.emptyNoMatch')}
                    </TableCell>
                  </TableRow>
                )}
                {pagedGroupedRows.map(([repoKey, rows], groupIndex) => {
                  const vis = PR_MANAGER_REPO_GROUP_VISUAL[groupIndex % PR_MANAGER_REPO_GROUP_VISUAL.length]
                  const repoTotalBranches = repoBranchTotals.get(repoKey) ?? rows.length
                  const prByTpl = repoPrKindCountsByTpl.get(repoKey)
                  const repoTotalPrs = orderedPrCheckpointTemplates.reduce((s, tpl) => {
                    const c = prByTpl?.[tpl.id]
                    if (!c) return s
                    return s + PR_GH_FILTER_IDS.reduce((acc, id) => acc + c[id], 0)
                  }, 0)
                  return rows.map((row, idx) => {
                    const isThisRowHovered = prBoardHoveredRowId === row.id
                    const isAnyRowInGroupHovered = rows.some(r => r.id === prBoardHoveredRowId)
                    const rowHoverCell = cn(REPO_GROUP_ROW_HOVER_TRANSITION, isThisRowHovered && REPO_GROUP_ROW_HOVER_SHADOW)
                    const repoCellHover = cn(REPO_GROUP_ROW_HOVER_TRANSITION, isAnyRowInGroupHovered && REPO_GROUP_ROW_HOVER_SHADOW)
                    const rowInteractionLocked = rowGithubSyncInteractionDisabled(row)
                    const repoKeyId = rows[0].repoId
                    return (
                      <TableRow
                        key={row.id}
                        data-row-id={row.id}
                        className={cn(
                          'align-top',
                          showTableBorders ? 'border-b-0' : 'border-b border-b-border/60',
                          vis.row,
                          rowInteractionLocked && 'pointer-events-none opacity-[0.65]',
                        )}
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
                              'w-0 min-w-[200px] max-w-[min(900px,96vw)] whitespace-normal align-top font-medium p-2 pr-3',
                              showTableBorders && COL_DIVIDER_R,
                              showTableBorders && COL_DIVIDER_B,
                              vis.row,
                              vis.accent,
                              repoCellHover
                            )}
                          >
                            <div className="sticky top-10 py-0.5">
                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-0">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0 justify-start p-0 hover:bg-accent/60"
                                        disabled={isAnyGithubSync || !githubTokenOk || !userId?.trim()}
                                        aria-label={t('prManager.board.syncRepoFromGithubTitle')}
                                        onClick={e => {
                                          e.stopPropagation()
                                          void handleSyncFromGithub('manual', { repoId: rows[0].repoId })
                                        }}
                                      >
                                        {githubSyncUi.kind === 'repo' && githubSyncUi.repoId === repoKeyId ? (
                                          <GlowLoader className="h-3 w-3 animate-spin" />
                                        ) : (() => {
                                            void scopedSyncStaleClock
                                            const visual = githubScopedSyncIdleVisual(
                                              readLastGithubSyncRepoMs(projectId, rows[0].repoId),
                                              Date.now(),
                                            )
                                            return <GithubScopedSyncIdleGlyph visual={visual} />
                                          })()}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-xs text-xs">
                                      {t('prManager.board.syncRepoFromGithubTitle')}
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="min-w-0 flex-1 cursor-default truncate leading-tight text-foreground/90">
                                        {rows[0].repoName}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                                      {formatScopedSyncTooltip(
                                        readLastGithubSyncRepoMs(projectId, rows[0].repoId),
                                        i18n.language,
                                        t,
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                <div className="mt-1 space-y-1">
                                  <div className="text-[10px] font-normal tabular-nums leading-none text-muted-foreground">
                                    <span>{t('prManager.board.branchCount', { count: repoTotalBranches })}</span>
                                    {repoTotalPrs > 0 ? <span> · {t('prManager.board.prCount', { count: repoTotalPrs })}</span> : null}
                                  </div>
                                  {repoTotalPrs > 0 ? (
                                    <div className="flex flex-col gap-0.5 text-[10px] font-medium leading-tight">
                                      {orderedPrCheckpointTemplates.map(tpl => {
                                        const col = prByTpl?.[tpl.id]
                                        if (!col) return null
                                        const colTotal = PR_GH_FILTER_IDS.reduce((s, id) => s + col[id], 0)
                                        if (colTotal === 0) return null
                                        return (
                                          <div key={tpl.id} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                            <span className="max-w-[8rem] shrink-0 truncate font-semibold text-muted-foreground" title={tpl.label}>
                                              {tpl.label}
                                            </span>
                                            <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                                              {PR_GH_FILTER_IDS.map(id => {
                                                const n = col[id]
                                                if (n === 0) return null
                                                return (
                                                  <span key={id} className={cn('whitespace-nowrap tabular-nums', PR_GH_FILTER_STYLE[id].label)}>
                                                    {t(`prManager.ghStatus.${id}`)} {n}
                                                  </span>
                                                )
                                              })}
                                            </span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        )}
                        <TableCell className={cn(COL_BRANCH, showTableBorders && COL_DIVIDER_R, showTableBorders && COL_DIVIDER_B, 'text-xs align-top', vis.row, rowHoverCell)}>
                          <div className="flex min-w-0 items-center gap-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0 justify-start hover:bg-accent/60"
                                  disabled={isAnyGithubSync || !githubTokenOk || !userId?.trim()}
                                  aria-label={t('prManager.board.syncBranchFromGithubTitle')}
                                  onClick={e => {
                                    e.stopPropagation()
                                    void handleSyncFromGithub('manual', { trackedBranchId: row.id })
                                  }}
                                >
                                  {githubSyncUi.kind === 'branch' && githubSyncUi.rowId === row.id ? (
                                    <GlowLoader className="h-3 w-3 animate-spin" />
                                  ) : (() => {
                                      void scopedSyncStaleClock
                                      const visual = githubScopedSyncIdleVisual(
                                        effectiveGithubSyncMsForBranchRow(
                                          readLastGithubSyncRepoMs(projectId, row.repoId),
                                          readLastGithubSyncBranchMs(projectId, row.id),
                                        ),
                                        Date.now(),
                                      )
                                      return <GithubScopedSyncIdleGlyph visual={visual} />
                                    })()}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-xs">
                                {t('prManager.board.syncBranchFromGithubTitle')}
                              </TooltipContent>
                            </Tooltip>
                            <div className="flex min-w-0 flex-1 items-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="min-w-0 flex-1 truncate rounded-sm text-left text-xs font-inherit text-foreground hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                    onClick={() => openUrlInDefaultBrowser(githubBranchUrl(row))}
                                    title={githubBranchUrl(row)}
                                  >
                                    {row.branchName}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs">
                                  {formatScopedSyncTooltip(readLastGithubSyncBranchMs(projectId, row.id), i18n.language, t)}
                                </TooltipContent>
                              </Tooltip>
                              {remoteExistMap != null && remoteExistMap[row.id] === true ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className="inline-flex shrink-0 text-cyan-600 dark:text-cyan-400"
                                      aria-label={t('prManager.board.branchOnRemoteBadge')}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs text-xs">
                                    {t('prManager.board.branchOnRemoteBadge')}
                                  </TooltipContent>
                                </Tooltip>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        {activeTemplates.map(tpl => {
                          const cp = getCheckpoint(row, tpl)
                          const isMergeKind = tpl.code.toLowerCase().startsWith('merge_')
                          const companionPrCp = isMergeKind ? findCompanionPrCheckpoint(row, tpl) : null
                          return (
                            <TableCell
                              key={tpl.id}
                              className={cn(
                                COL_PR_CHECKPOINT,
                                showTableBorders && COL_DIVIDER_R,
                                showTableBorders && COL_DIVIDER_B,
                                'p-1 text-center align-middle !whitespace-normal',
                                vis.row,
                                rowHoverCell
                              )}
                            >
                              <CheckpointCell
                                tpl={tpl}
                                cp={cp}
                                companionPrCp={companionPrCp}
                                cellVisualStyle={prMergeCellStyle}
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
                          <TableCell className={cn(showTableBorders && COL_DIVIDER_R, showTableBorders && COL_DIVIDER_B, vis.row, rowHoverCell)}>
                            <Input
                              value={noteDraft[row.id] ?? row.note ?? ''}
                              onChange={e => setNoteDraft(prev => ({ ...prev, [row.id]: e.target.value }))}
                              onBlur={() => handleNoteBlur(row)}
                              placeholder={t('prManager.board.notePlaceholder')}
                              className="h-7 border-transparent bg-transparent text-xs focus-visible:border-input focus-visible:bg-background"
                            />
                          </TableCell>
                        )}
                        <TableCell className={cn('w-10 p-1 text-center align-middle', showTableBorders && COL_DIVIDER_B, vis.row, rowHoverCell)} onClick={e => e.stopPropagation()}>
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
                      const n = Number(v) as PageSizeChoice
                      setPageSize(n)
                      writePrBoardPageSize(projectId, n)
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
                <div className="flex items-center gap-2 border-l border-border/60 pl-3 sm:pl-4">
                  <Label htmlFor="pr-board-table-borders" className="cursor-pointer whitespace-nowrap text-xs text-muted-foreground" title={t('prManager.board.tableBordersHelp')}>
                    {t('prManager.board.tableBordersSwitch')}
                  </Label>
                  <Switch
                    id="pr-board-table-borders"
                    size="sm"
                    checked={showTableBorders}
                    onCheckedChange={v => persistTableBorders(v === true)}
                    title={t('prManager.board.tableBordersHelp')}
                  />
                </div>
                <div className="flex min-w-0 max-w-full flex-1 items-center gap-2 border-l border-border/60 pl-3 sm:pl-4 sm:max-w-[min(100%,20rem)]">
                  <span className="shrink-0 text-xs text-muted-foreground" title={t('prManager.board.prMergeCellStyleHelp')}>
                    {t('prManager.board.prMergeCellStyleLabel')}
                  </span>
                  <Select
                    value={String(prMergeCellStyle)}
                    onValueChange={v => {
                      const n = Number(v)
                      if (n === 2 || n === 3 || n === 4) persistPrMergeCellStyle(n)
                      else persistPrMergeCellStyle(1)
                    }}
                  >
                    <SelectTrigger id="pr-board-pr-merge-style" size="sm" className="h-8 min-w-0 flex-1 text-xs" title={t('prManager.board.prMergeCellStyleHelp')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t('prManager.board.prMergeCellStyle1')}</SelectItem>
                      <SelectItem value="2">{t('prManager.board.prMergeCellStyle2')}</SelectItem>
                      <SelectItem value="3">{t('prManager.board.prMergeCellStyle3')}</SelectItem>
                      <SelectItem value="4">{t('prManager.board.prMergeCellStyle4')}</SelectItem>
                    </SelectContent>
                  </Select>
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
        userId={userId}
        repos={repos}
        initialRepoId={createPrInitial?.repoId ?? null}
        initialHead={createPrInitial?.head ?? null}
        initialBase={createPrInitial?.base ?? null}
        initialTitle={createPrInitial?.initialTitle ?? null}
        initialBody={createPrInitial?.initialBody ?? null}
        onCreated={onRefresh}
      />
      <PrAiAssistSheet
        open={aiAssistOpen}
        onOpenChange={setAiAssistOpen}
        projectId={projectId}
        userId={userId}
        repos={repos}
        tracked={tracked}
        githubTokenOk={githubTokenOk}
        onOpenCreatePrDialog={payload => {
          setCreatePrInitial({
            repoId: payload.repoId,
            head: payload.head,
            base: payload.base,
            initialTitle: payload.suggestedTitle,
            initialBody: payload.suggestedBody,
          })
          setCreatePrOpen(true)
        }}
        onOpenBulkCreatePrDialog={({ trackedRowIds }) => {
          setSelectedRowIds(new Set(trackedRowIds))
          setBulkKind('createPr')
          setBulkDlgOpen(true)
        }}
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
          userId={userId}
          selectedRows={selectedRowsFull}
          repos={repos}
          activeTemplates={activeTemplates}
          remoteExistMap={remoteExistMap}
          onlyExistingOnRemote={onlyExistingOnRemote}
          githubTokenOk={githubTokenOk}
          onAfterBatch={onAfterBulkBatch}
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
      <PrFileOverlapDialog open={fileOverlapOpen} onOpenChange={setFileOverlapOpen} candidates={prOverlapCandidates} githubTokenOk={githubTokenOk} />
    </div>
  )
}

function CheckpointCell({
  tpl,
  cp,
  companionPrCp,
  cellVisualStyle,
  rowPrRepo,
  onOpenPrInApp,
  onCreatePR,
  onMerge,
}: {
  tpl: PrCheckpointTemplate
  cp: PrBranchCheckpoint | null
  companionPrCp: PrBranchCheckpoint | null
  cellVisualStyle: PrMergeCellVisualStyle
  rowPrRepo: PrRepo | null
  onOpenPrInApp?: (prNumber: number) => void
  onCreatePR: () => void
  onMerge: () => void
}) {
  const { t, i18n } = useTranslation()
  const dateLoc = getDateFnsLocale(i18n.language)
  const isMergeKind = tpl.code.toLowerCase().startsWith('merge_')
  const vs = (cls: string) => applyPrMergeCellVisualStyle(cellVisualStyle, cls)
  const stripBtn = (cls: string) => (cellVisualStyle >= 3 ? stripBackgroundClasses(cls) : cls)
  /** Nút dùng `variant="ghost"`: CVA vẫn có hover:bg-accent — tắt khi style 3–4 đã strip nền. */
  const ghostNoDefaultHover = cellVisualStyle >= 3 ? 'bg-transparent dark:bg-transparent hover:!bg-transparent dark:hover:!bg-transparent' : undefined

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
            className={vs(
              cn('flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-violet-500/15 px-1.5 text-violet-800 dark:text-violet-200', CELL_CTRL_H, CELL_TXT)
            )}
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
            className={vs(
              cn(
                'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-slate-500/10 px-1.5 text-slate-700 dark:text-slate-300',
                CELL_CTRL_H,
                CELL_TXT,
                canOpen && 'hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:brightness-110',
                !canOpen && 'cursor-not-allowed opacity-80'
              )
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
            className={vs(
              cn(
                'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5',
                CELL_CTRL_H,
                CELL_TXT,
                mergeUi.mergeCell,
                canOpen && 'hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:brightness-110',
                !canOpen && 'cursor-not-allowed opacity-80'
              )
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
          <div
            className={vs(
              cn('flex min-w-0 flex-1 items-center justify-center rounded-md bg-emerald-500/[0.06] dark:bg-emerald-500/[0.05]', CELL_CTRL_H)
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onMerge}
              className={cn(
                stripBtn(
                  cn(
                    'w-full rounded-md border-0 bg-transparent text-emerald-800 shadow-none hover:bg-emerald-500/12 dark:text-emerald-200 dark:hover:bg-emerald-500/10',
                    CELL_CTRL_H,
                    CELL_TXT
                  )
                ),
                ghostNoDefaultHover
              )}
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
            className={vs(
              cn(
                'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-rose-500/10 px-1.5 text-rose-800 dark:text-rose-200',
                CELL_CTRL_H,
                CELL_TXT,
                canOpen && 'hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:brightness-110',
                !canOpen && 'cursor-not-allowed opacity-80'
              )
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
        className={vs(
          cn('flex w-full items-center justify-center gap-1 rounded-md bg-zinc-500/10 text-zinc-800 dark:bg-zinc-900/45 dark:text-zinc-200', CELL_CTRL_H, CELL_TXT)
        )}
      >
        <Hourglass className="h-3.5 w-3.5 shrink-0 text-zinc-600 dark:text-zinc-400" /> {t('prManager.board.waitingForPr')}
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
      variant="ghost"
      size="xs"
      onClick={onCreatePR}
      className={cn(
        vs(
          stripBtn(
            cn(
              'w-full rounded-md border-0 bg-zinc-500/10 text-zinc-800 shadow-none hover:bg-zinc-500/15 dark:bg-zinc-900/45 dark:text-zinc-200 dark:hover:bg-zinc-800',
              CELL_CTRL_H,
              CELL_TXT
            )
          )
        ),
        ghostNoDefaultHover
      )}
    >
      <GitPullRequestCreate className="h-3.5 w-3.5 shrink-0 text-zinc-600 dark:text-zinc-400" /> {t('prManager.board.createPrCell')}
    </Button>
  )
}
