'use client'

import { Loader2 } from 'lucide-react'
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
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import {
  buildPrCheckpointStatusSnapshot,
  diffPrCheckpointStatusSnapshot,
  type PrCheckpointStatusChangeDetail,
} from '../checkpointStatusChange'
import { collectOpenPrsForFileOverlap } from '../collectPrFileOverlapCandidates'
import type { PrBranchCheckpoint, PrCheckpointTemplate, PrRepo, TrackedBranchRow } from '../hooks/usePrData'
import { usePrOperationLog } from '../PrOperationLogContext'
import { readPrBoardStatusBaseline, writePrBoardStatusBaseline } from '../prBoardStatusBaseline'
import { branchNameMatchesSkipList, hydratePrBoardSkippedBranchesFromApi, readSkippedBranchesSnapshotText, subscribePrBoardSkippedBranches } from '../prBoardSkippedBranches'
import type { PrGhStatusKind } from '../prGhStatus'
import { PR_GH_STATUS_IDS } from '../prGhStatus'
import {
  collectProjectBaseBranches,
  type RepoBaseInsightsMap,
} from '../repoBaseBranchInsights'
import { CreatePrDialog } from './CreatePrDialog'
import { MergePrDialog } from './MergePrDialog'
import { PrMetricsCompareDialog } from './PrMetricsCompareDialog'
import { PrAiAssistSheet } from './PrAiAssistSheet'
import { PrBulkActionsDialog } from './PrBulkActionsDialog'
import { PrDetailDialog } from './PrDetailDialog'
import { PrFileOverlapDialog } from './PrFileOverlapDialog'
import { activePrTemplates, type BulkActionKind, countRowsEligibleForBulkCreateOnAnyPrTemplate, resolveBulkDeleteBranchTargets, resolveBulkPrTargets } from './prBoardBulkResolve'
import { useStableRowActionDispatch, type PrBoardRowActions } from './prBoardRowActions'
import {
  readAutoSyncGithub,
  readLastGithubSyncMs,
  readLastGithubSyncWasAuto,
  writeAutoSyncGithub,
  writeLastGithubSyncBranchMs,
  writeLastGithubSyncMs,
  writeLastGithubSyncRepoMs,
  writeLastGithubSyncWasAuto,
} from './prBoardSyncStorage'
import {
  DEFAULT_PAGE_SIZE,
  PR_BOARD_TABLE_BORDERS_LS,
  githubBranchUrl,
  openUrlInDefaultBrowser,
  readPrBoardPageSize,
  readPrMergeCellStyleForProject,
  writePrMergeCellStyleForProject,
  type PageSizeChoice,
  type PrMergeCellVisualStyle,
} from './prBoardTableConstants'
import { buildPagedTableViewModel, buildRepoById, stabilizeTableViewModel } from './prBoardTableModel'
import {
  derivePrKind,
  flattenPrBoardRowsForPaging,
  isPrGhStatusFilterNarrowed,
  mergePrBoardFilteredRows,
  rowMatchesPrGhBoardFilters,
  type PrGhAdvancedCombineMode,
} from './prBoardGhFilters'
import { PrBoardTable } from './PrBoardTable'
import { PrBoardToolbar } from './PrBoardToolbar'
import type { PrBoardSyncProgressEvent } from './PrBoardFullTableSyncButton'

type BulkToolbarConfirm = BulkActionKind

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
type GithubSyncUiState = { kind: 'idle' } | { kind: 'full' } | { kind: 'repo'; repoId: string } | { kind: 'branch'; rowId: string }

/** L\u1ecdc theo tr\u1ea1ng th\u00e1i PR tr\u00ean GitHub (m\u1ed7i c\u1ed9t pr_* + merge_*). \u0110\u1ed3ng b\u1ed9 m\u00e0u v\u1edbi prGhStatus. */
const PR_GH_FILTER_IDS = PR_GH_STATUS_IDS
type PrGhFilterId = PrGhStatusKind

/** Login GitHub c\u1ee7a ng\u01b0\u1eddi t\u1ea1o PR (checkpoint pr_* \u0111\u1ea7u ti\u00eAn c\u00f3 s\u1ed1 PR v\u00e0 \u0111\u00e3 sync). */
function githubPrCreatorLogin(row: TrackedBranchRow, orderedTemplates: PrCheckpointTemplate[]): string | null {
  for (const tpl of orderedTemplates) {
    if (!tpl.code.toLowerCase().startsWith('pr_')) continue
    const cp = row.checkpoints.find(c => c.templateId === tpl.id)
    if (cp?.prNumber && cp.ghPrAuthor) return cp.ghPrAuthor
  }
  return null
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

/** Row đã có bất kỳ checkpoint PR nào để giữ lịch sử hiển thị dù head ref trên remote đã biến mất. */
function rowHasAnyPrHistory(row: TrackedBranchRow): boolean {
  return row.checkpoints.some(cp => cp.prNumber != null)
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

/**
 * Idle trước khi auto-sync: nên đủ lớn để không gọi lại `trackedSyncFromGithub` quá thường xuyên
 * (mỗi lần sync tốn nhiều REST call / repo — gần giới hạn 5000 req/h của GitHub nếu sync liên tục).
 */
const PR_GITHUB_AUTO_SYNC_IDLE_MS = 30 * 60 * 1000
/** Chu kỳ chỉ kiểm tra điều kiện (không gọi API nếu chưa đủ idle). */
const PR_GITHUB_AUTO_SYNC_TICK_MS = 10 * 60 * 1000
/** Sau bulk, chờ thêm trước khi sync full — giảm lệch do GitHub index/API. */
const PR_POST_BULK_SYNC_SETTLE_MS = 750

export function PrBoard({ projectId, userId, repos, templates, tracked, loading, onRefresh, onRefreshTracked, githubTokenOk = false }: Props) {
  const { t, i18n } = useTranslation()
  const opLog = usePrOperationLog()
  const syncLogActiveRef = useRef(false)
  const lastSyncLogAtRef = useRef(0)
  const lastLoggedPercentRef = useRef(-1)
  /** Sync thủ công lần đầu (chưa có baseline): ghi mốc ban đầu sau khi `tracked` refresh. */
  const pendingSeedBaselineIfMissingRef = useRef(false)
  const [statusChangedKeys, setStatusChangedKeys] = useState<Set<string>>(() => new Set())
  const statusChangeDetailsRef = useRef<Map<string, PrCheckpointStatusChangeDetail>>(new Map())
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
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
  const [metricsCompareOpen, setMetricsCompareOpen] = useState(false)
  const [metricsCompareCtx, setMetricsCompareCtx] = useState<{
    row: TrackedBranchRow
    repo: PrRepo
    focus?: 'files' | 'lines'
  } | null>(null)
  const [fileOverlapOpen, setFileOverlapOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})
  const [githubSyncUi, setGithubSyncUi] = useState<GithubSyncUiState>({ kind: 'idle' })
  const syncProgressResetRef = useRef<(() => void) | null>(null)
  const [lastGithubSyncAt, setLastGithubSyncAt] = useState<number | null>(null)
  const [lastGithubSyncWasAuto, setLastGithubSyncWasAuto] = useState(false)
  /** Tăng sau đồng bộ theo repo/nhánh để re-render tooltip (đọc lại localStorage). */
  const [, setScopedSyncTick] = useState(0)
  const isAnyGithubSync = githubSyncUi.kind !== 'idle'
  const showFullTableGithubSyncOverlay = githubSyncUi.kind === 'full'
  /** Loading dữ liệu board hoặc đồng bộ GitHub full-table — chỉ phủ khung bảng, không phủ toolbar. */
  const showTableBlockingOverlay = loading || showFullTableGithubSyncOverlay
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
  /** Shield khi GitHub REST `getBranch` báo `protected` (branch protection hoặc rulesets) hoặc `protection.enabled`. */
  const [branchProtectedMap, setBranchProtectedMap] = useState<Record<string, boolean> | null>(null)
  const [remoteExistLoading, setRemoteExistLoading] = useState(false)
  const remoteExistKeyRef = useRef<string | null>(null)
  const [repoBaseInsights, setRepoBaseInsights] = useState<RepoBaseInsightsMap>({})
  const [repoBaseInsightsLoading, setRepoBaseInsightsLoading] = useState(false)
  const repoBaseInsightsKeyRef = useRef<string | null>(null)
  const [repoBaseInsightsTick, setRepoBaseInsightsTick] = useState(0)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set())
  const [bulkDlgOpen, setBulkDlgOpen] = useState(false)
  const [bulkKind, setBulkKind] = useState<BulkActionKind | null>(null)
  const [bulkToolbarConfirm, setBulkToolbarConfirm] = useState<BulkToolbarConfirm | null>(null)
  const bulkToolbarConfirmRef = useRef<BulkToolbarConfirm | null>(null)
  bulkToolbarConfirmRef.current = bulkToolbarConfirm

  const [pruneStaleOpen, setPruneStaleOpen] = useState(false)
  const [pruneStalePreview, setPruneStalePreview] = useState<{
    wouldDelete: number
    preview: Array<{ id: string; branchName: string; repoKey: string }>
    errors: string[]
  } | null>(null)
  const [pruningStaleBusy, setPruningStaleBusy] = useState(false)

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

  const activeTemplates = useMemo(() => templates.filter(t => t.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [templates])
  const orderedPrCheckpointTemplates = useMemo(() => activePrTemplates(activeTemplates), [activeTemplates])
  const projectBaseBranches = useMemo(() => collectProjectBaseBranches(activeTemplates), [activeTemplates])
  const repoBaseInsightsFetchKey = useMemo(() => {
    if (!projectBaseBranches.length || !repos.length) return ''
    const repoPart = repos
      .map(r => `${r.id}\0${r.owner}\0${r.repo}`)
      .sort()
      .join('\n')
    return `${projectBaseBranches.join('\x1f')}\n${repoPart}`
  }, [projectBaseBranches, repos])

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
  const skipBranchPatterns = useMemo(() => (skipBranchesSnapshot === '' ? [] : skipBranchesSnapshot.split('\n')), [skipBranchesSnapshot])

  const sortedReposForFilter = useMemo(() => [...repos].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), [repos])
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

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(id)
  }, [search])

  const searchRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()

    return tracked.filter(r => {
      if (repoExcludedSet.has(r.repoId)) return false
      if (skipBranchPatterns.length > 0 && branchNameMatchesSkipList(r.branchName, skipBranchPatterns)) return false
      if (!q) return true
      const author = (githubPrCreatorLogin(r, activeTemplates) ?? '').toLowerCase()
      return r.branchName.toLowerCase().includes(q) || r.repoName.toLowerCase().includes(q) || author.includes(q) || (r.note ?? '').toLowerCase().includes(q)
    })
  }, [tracked, debouncedSearch, activeTemplates, skipBranchPatterns, repoExcludedSet])

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
          setBranchProtectedMap({})
          setRemoteExistLoading(false)
        }
        return
      }
      const res = await window.api.pr.githubRemoteBranchesExist(items)
      if (cancelled) return
      if (res.status === 'success' && res.data) {
        remoteExistKeyRef.current = trackedExistenceKey
        setRemoteExistMap(res.data.existence)
        setBranchProtectedMap(res.data.branchProtected)
      } else {
        toast.error(res.message || t('prManager.board.toastRemoteCheck'))
        remoteExistKeyRef.current = null
        setRemoteExistMap(null)
        setBranchProtectedMap(null)
      }
      setRemoteExistLoading(false)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [trackedExistenceKey, loading, t])

  /** Tip commit + PR merge cuối vào dev/stage/main (theo template targetBranch). */
  useEffect(() => {
    if (loading || !githubTokenOk || !projectBaseBranches.length || !repos.length) {
      if (!githubTokenOk || !projectBaseBranches.length) {
        setRepoBaseInsights({})
        setRepoBaseInsightsLoading(false)
        repoBaseInsightsKeyRef.current = null
      }
      return
    }
    if (repoBaseInsightsKeyRef.current === repoBaseInsightsFetchKey) {
      setRepoBaseInsightsLoading(false)
      return
    }

    let cancelled = false
    const run = async () => {
      setRepoBaseInsightsLoading(true)
      const requests = repos.map(r => ({
        repoId: r.id,
        owner: r.owner,
        repo: r.repo,
        baseBranches: projectBaseBranches,
      }))
      const res = await window.api.pr.githubRepoBaseBranchInsights(requests)
      if (cancelled) return
      if (res.status === 'success' && res.data) {
        repoBaseInsightsKeyRef.current = repoBaseInsightsFetchKey
        setRepoBaseInsights(res.data)
      } else if (res.message) {
        toast.error(res.message)
        repoBaseInsightsKeyRef.current = null
        setRepoBaseInsights({})
      }
      setRepoBaseInsightsLoading(false)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [githubTokenOk, loading, projectBaseBranches, repoBaseInsightsFetchKey, repoBaseInsightsTick, repos])

  const needRemoteBranchCheck = onlyExistingOnRemote || onlyBranchesWithoutPr
  const existenceCheckPending = needRemoteBranchCheck && (remoteExistLoading || remoteExistMap === null)

  const remoteFilteredRows = useMemo(() => {
    if (!onlyExistingOnRemote) return searchRows
    if (!remoteExistMap) return []
    return searchRows.filter(r => remoteExistMap[r.id] === true || rowHasAnyPrHistory(r))
  }, [searchRows, onlyExistingOnRemote, remoteExistMap])

  /** Cùng tập nhánh với `remoteFilteredRows` (đồng bộ count filter GitHub / Advanced với bảng). */
  const prGhFilterCountRows = remoteFilteredRows

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

  const prGhCombineMode = advancedFiltersOpen ? prGhAdvancedCombineMode : prGhSimpleCombineMode

  const prGhStatusFilterNarrowed = useMemo(
    () => isPrGhStatusFilterNarrowed(orderedPrCheckpointTemplates, prGhFilters, advancedFiltersOpen, prGhFiltersByTpl),
    [orderedPrCheckpointTemplates, prGhFilters, advancedFiltersOpen, prGhFiltersByTpl]
  )

  const filteredRows = useMemo(() => {
    const boardFilterOptions = {
      advancedFiltersOpen,
      prGhFilters,
      prGhFiltersByTpl,
      combineMode: prGhCombineMode,
    }
    const fromKind = remoteFilteredRows.filter(row =>
      rowMatchesPrGhBoardFilters(row, orderedPrCheckpointTemplates, activeTemplates, boardFilterOptions)
    )
    if (!onlyBranchesWithoutPr) return fromKind
    const fromNoPr = remoteFilteredRows.filter(row => {
      if (rowHasAnyPrNumber(row, activeTemplates)) return false
      if (onlyExistingOnRemote) return true
      if (remoteExistMap == null) return false
      return remoteExistMap[row.id] === true
    })
    return mergePrBoardFilteredRows(fromKind, fromNoPr, onlyBranchesWithoutPr, prGhStatusFilterNarrowed)
  }, [
    remoteFilteredRows,
    orderedPrCheckpointTemplates,
    activeTemplates,
    advancedFiltersOpen,
    prGhFilters,
    prGhFiltersByTpl,
    prGhCombineMode,
    onlyBranchesWithoutPr,
    onlyExistingOnRemote,
    remoteExistMap,
    prGhStatusFilterNarrowed,
  ])

  /** Số PR theo trạng thái trên các nhánh đang hiện trong bảng (đồng bộ AND/OR + bộ lọc). */
  const prGhFilterCounts = useMemo(() => {
    const counts: Record<PrGhFilterId, number> = { open: 0, draft: 0, merged: 0, closed: 0 }
    for (const row of filteredRows) {
      for (const tpl of orderedPrCheckpointTemplates) {
        const prCp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
        if (!prCp?.prNumber) continue
        const mergeTpl = activeTemplates.find(t => t.code.toLowerCase().startsWith('merge_') && t.targetBranch === tpl.targetBranch)
        const mergeCp = mergeTpl ? (row.checkpoints.find(c => c.templateId === mergeTpl.id) ?? null) : null
        counts[derivePrKind(prCp, mergeCp)]++
      }
    }
    return counts
  }, [filteredRows, orderedPrCheckpointTemplates, activeTemplates])

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
        const aNoPr = !rowHasAnyPrNumber(a, activeTemplates)
        const bNoPr = !rowHasAnyPrNumber(b, activeTemplates)
        if (aNoPr !== bNoPr) {
          // Khi lọc trạng thái PR hẹp: nhánh có PR lên trước để AND/OR thấy ngay trên trang 1
          return prGhStatusFilterNarrowed ? (aNoPr ? 1 : -1) : aNoPr ? -1 : 1
        }
        return a.branchName.localeCompare(b.branchName, undefined, { sensitivity: 'base' })
      })
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredRows, activeTemplates, prGhStatusFilterNarrowed])

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

  const flatOrderedRows = useMemo(
    () =>
      flattenPrBoardRowsForPaging(
        groupedRows,
        row => rowHasAnyPrNumber(row, activeTemplates),
        prGhStatusFilterNarrowed,
        onlyBranchesWithoutPr
      ),
    [groupedRows, activeTemplates, prGhStatusFilterNarrowed, onlyBranchesWithoutPr]
  )

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
    return {
      title: t(`prManager.bulk.title.${a}`),
      description: a === 'deleteRemoteBranch' ? t('prManager.bulk.confirm.deleteRemoteWarning') : t('prManager.bulk.confirm.bulkPreviewHint'),
      destructive: a === 'deleteRemoteBranch',
    }
  }, [bulkToolbarConfirm, t])


  const PR_COLUMN_LEGEND_ORDER = ['merged', 'closed', 'draft', 'conflict', 'blocked', 'behind', 'unstable', 'unknown', 'ready'] as const
  const PR_COLUMN_LEGEND_DOT_BRIGHT: Record<(typeof PR_COLUMN_LEGEND_ORDER)[number], string> = {
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

  const prColumnLegendItems = useMemo(
    () =>
      PR_COLUMN_LEGEND_ORDER.map(key => ({
        dotBright: PR_COLUMN_LEGEND_DOT_BRIGHT[key],
        label:
          key === 'merged'
            ? t('prManager.ghStatus.merged')
            : key === 'closed'
              ? t('prManager.ghStatus.closed')
              : key === 'draft'
                ? t('prManager.ghStatus.draft')
                : key === 'unknown'
                  ? t('prManager.mergeableUi.checking')
                  : key === 'ready'
                    ? t('prManager.mergeableUi.ready')
                    : key === 'conflict'
                      ? t('prManager.mergeableUi.conflict')
                      : key === 'blocked'
                        ? t('prManager.mergeableUi.blocked')
                        : key === 'behind'
                          ? t('prManager.mergeableUi.behind')
                          : t('prManager.mergeableUi.ciFailing'),
      })),
    [t]
  )

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
  const pageRowIdsRef = useRef(pageRowIds)
  pageRowIdsRef.current = pageRowIds
  const allPageSelectedRef = useRef(allPageSelected)
  allPageSelectedRef.current = allPageSelected

  const toggleSelectAllPage = useCallback(() => {
    setSelectedRowIds(prev => {
      const n = new Set(prev)
      if (allPageSelectedRef.current) {
        for (const id of pageRowIdsRef.current) n.delete(id)
      } else {
        for (const id of pageRowIdsRef.current) n.add(id)
      }
      return n
    })
  }, [])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, prGhFilterKey, onlyExistingOnRemote, onlyBranchesWithoutPr])

  useEffect(() => {
    setPage(p => Math.min(p, totalPages))
  }, [totalPages])

  const templateById = useMemo(() => {
    const m = new Map<string, PrCheckpointTemplate>()
    for (const t of templates) m.set(t.id, t)
    return m
  }, [templates])

  const repoById = useMemo(() => buildRepoById(repos), [repos])

  const handleNoteBlur = async (row: TrackedBranchRow) => {
    const draft = noteDraft[row.id]
    if (draft === undefined) return
    if (draft === (row.note ?? '')) return
    const res = await window.api.pr.trackedUpdateNote(row.id, { note: draft })
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

  const toggleTplGhFilter = useCallback(
    (tplId: string, id: PrGhFilterId, checked: boolean) => {
      setPrGhFiltersByTpl(prev => {
        const base = prev[tplId] !== undefined ? [...prev[tplId]] : PR_GH_FILTER_IDS.filter(k => prGhFilters.has(k))
        const nextSet = new Set(base)
        if (checked) nextSet.add(id)
        else nextSet.delete(id)
        return { ...prev, [tplId]: PR_GH_FILTER_IDS.filter(k => nextSet.has(k)) }
      })
    },
    [prGhFilters]
  )

  const handleSyncFromGithub = useCallback(
    async (source: 'manual' | 'idle' = 'manual', scope?: { repoId?: string; trackedBranchId?: string; silentOpLog?: boolean }) => {
      const isIdle = source === 'idle'
      const silentOpLogFlag = Boolean(scope?.silentOpLog)
      const effectiveScope = isIdle
        ? undefined
        : scope && (scope.repoId !== undefined || scope.trackedBranchId !== undefined)
          ? {
            ...(scope.repoId !== undefined ? { repoId: scope.repoId } : {}),
            ...(scope.trackedBranchId !== undefined ? { trackedBranchId: scope.trackedBranchId } : {}),
          }
          : undefined
      bumpUserActivity()

      if (!userId?.trim()) {
        if (!isIdle) {
          toast.error(t('evm.pleaseLoginFirst'))
        }
        return
      }
      const uid = userId.trim()

      if (!isIdle) {
        if (!opLog.startOperation('prManager.operationLog.titleSyncGithub', undefined, { silent: true })) return
      }

      syncLogActiveRef.current = !isIdle
      lastSyncLogAtRef.current = 0
      lastLoggedPercentRef.current = -1
      syncProgressResetRef.current?.()
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
          if (!isIdle && !silentOpLogFlag) {
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
            setSelectedRowIds(new Set())
          }
          if (!isIdle && !readPrBoardStatusBaseline(uid, projectId)) {
            pendingSeedBaselineIfMissingRef.current = true
          }
          repoBaseInsightsKeyRef.current = null
          setRepoBaseInsightsTick(v => v + 1)
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
        syncProgressResetRef.current?.()
      }
    },
    [activeTemplates, bumpUserActivity, onRefresh, onRefreshTracked, opLog, projectId, repos, setSelectedRowIds, t, tracked, userId]
  )

  useEffect(() => {
    const uid = userId?.trim()
    if (!uid || !projectId) return
    if (activeTemplates.length === 0) return

    if (pendingSeedBaselineIfMissingRef.current) {
      pendingSeedBaselineIfMissingRef.current = false
      if (!readPrBoardStatusBaseline(uid, projectId)) {
        writePrBoardStatusBaseline(uid, projectId, buildPrCheckpointStatusSnapshot(tracked, activeTemplates))
      }
    }

    const baseline = readPrBoardStatusBaseline(uid, projectId)
    if (!baseline) {
      setStatusChangedKeys(new Set())
      statusChangeDetailsRef.current = new Map()
      return
    }
    const { changedKeys, details } = diffPrCheckpointStatusSnapshot(baseline, tracked, activeTemplates)
    statusChangeDetailsRef.current = details
    setStatusChangedKeys(changedKeys)
  }, [activeTemplates, projectId, tracked, userId])

  const handleDismissStatusChanges = useCallback(() => {
    const uid = userId?.trim()
    if (!uid || !projectId) return
    writePrBoardStatusBaseline(uid, projectId, buildPrCheckpointStatusSnapshot(tracked, activeTemplates))
    setStatusChangedKeys(new Set())
    statusChangeDetailsRef.current = new Map()
  }, [activeTemplates, projectId, tracked, userId])

  const handlePruneStaleDryRun = useCallback(async () => {
    if (!userId?.trim()) {
      toast.error(t('evm.pleaseLoginFirst'))
      return
    }
    const uid = userId.trim()
    setPruningStaleBusy(true)
    try {
      const res = await window.api.pr.trackedPruneNotOnGithub({ userId: uid, projectId, dryRun: true })
      if (res.status !== 'success' || !res.data) {
        toast.error(res.message ?? t('prManager.board.pruneStaleFail'))
        return
      }
      if (!('wouldDelete' in res.data)) {
        toast.error(t('prManager.board.pruneStaleFail'))
        return
      }
      const { wouldDelete, preview, errors } = res.data
      if (errors.length > 0) {
        toast.warning(t('prManager.board.pruneStaleToastRepoWarn', { list: errors.join('; ') }))
      }
      if (wouldDelete === 0) {
        if (errors.length === 0) toast.info(t('prManager.board.pruneStaleNone'))
        return
      }
      setPruneStalePreview({ wouldDelete, preview, errors })
      setPruneStaleOpen(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setPruningStaleBusy(false)
    }
  }, [userId, projectId, t])

  const handlePruneStaleConfirm = useCallback(async () => {
    if (!userId?.trim()) return
    const uid = userId.trim()
    setPruningStaleBusy(true)
    try {
      const res = await window.api.pr.trackedPruneNotOnGithub({ userId: uid, projectId, dryRun: false })
      if (res.status !== 'success' || !res.data || !('deleted' in res.data)) {
        toast.error(res.message ?? t('prManager.board.pruneStaleFail'))
        return
      }
      const { deleted, errors } = res.data
      setPruneStaleOpen(false)
      setPruneStalePreview(null)
      toast.success(t('prManager.board.pruneStaleOk', { count: deleted }))
      if (errors.length > 0) {
        toast.warning(t('prManager.board.pruneStaleToastRepoWarn', { list: errors.join('; ') }))
      }
      await Promise.resolve(onRefreshTracked?.() ?? onRefresh())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setPruningStaleBusy(false)
    }
  }, [userId, projectId, t, onRefresh, onRefreshTracked])

  const onAfterBulkBatch = useCallback(
    async (batchKind: BulkActionKind) => {
      if (!userId?.trim()) {
        await Promise.resolve(onRefresh())
        return
      }
      if (githubTokenOk) {
        await new Promise<void>(r => setTimeout(r, PR_POST_BULK_SYNC_SETTLE_MS))
        await handleSyncFromGithub('manual', { silentOpLog: true })
        /** Sau khi xóa nhánh trên GitHub, dọn luôn các tracked branch không còn trên remote (cùng luồng nút Prune stale). */
        if (batchKind === 'deleteRemoteBranch') {
          const uid = userId.trim()
          try {
            const res = await window.api.pr.trackedPruneNotOnGithub({ userId: uid, projectId, dryRun: false })
            if (res.status === 'success' && res.data && 'deleted' in res.data) {
              const { deleted, errors } = res.data
              if (deleted > 0) {
                toast.success(t('prManager.board.pruneStaleOk', { count: deleted }))
              }
              if (errors.length > 0) {
                toast.warning(t('prManager.board.pruneStaleToastRepoWarn', { list: errors.join('; ') }))
              }
              await Promise.resolve(onRefreshTracked?.() ?? onRefresh())
            } else {
              toast.error(res.message ?? t('prManager.board.pruneStaleFail'))
            }
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e))
          }
        }
      } else {
        await Promise.resolve(onRefresh())
      }
    },
    [userId, projectId, githubTokenOk, onRefresh, onRefreshTracked, handleSyncFromGithub, t]
  )

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

  const registerSyncProgressReset = useCallback((reset: () => void) => {
    syncProgressResetRef.current = reset
    return () => {
      if (syncProgressResetRef.current === reset) syncProgressResetRef.current = null
    }
  }, [])

  const handleSyncProgress = useCallback((event: PrBoardSyncProgressEvent) => {
    if (!syncLogActiveRef.current) return
    const now = Date.now()
    const pct = event.percent
    if (now - lastSyncLogAtRef.current < 350 && Math.abs(pct - lastLoggedPercentRef.current) < 8) return
    lastSyncLogAtRef.current = now
    lastLoggedPercentRef.current = pct
    opLogRef.current.appendLine(
      tRef.current('prManager.operationLog.syncProgress', { done: event.done, total: event.total, percent: pct })
    )
  }, [])

  const openCreatePr = (row: TrackedBranchRow, tpl: PrCheckpointTemplate) => {
    setCreatePrInitial({
      repoId: row.repoId,
      head: row.branchName,
      base: tpl.targetBranch || repoById.get(row.repoId)?.defaultBaseBranch || 'stage',
    })
    setCreatePrOpen(true)
  }

  const openCreatePrFromToolbar = () => {
    setCreatePrInitial(null)
    setCreatePrOpen(true)
  }

  const openMergePr = (row: TrackedBranchRow, cp: PrBranchCheckpoint) => {
    const repo = repoById.get(row.repoId) ?? null
    setMergePrCtx({ repo, prNumber: cp.prNumber })
    setMergePrOpen(true)
  }

  const lockedRowId = githubSyncUi.kind === 'branch' ? githubSyncUi.rowId : null
  const lockedRepoId = githubSyncUi.kind === 'repo' ? githubSyncUi.repoId : null

  const tableViewModelRef = useRef<ReturnType<typeof buildPagedTableViewModel> | null>(null)
  const tableStabilizeKeyRef = useRef(prGhFilterKey)

  const tableViewModel = useMemo(() => {
    const stabilizeFrom = tableStabilizeKeyRef.current === prGhFilterKey ? tableViewModelRef.current : null
    tableStabilizeKeyRef.current = prGhFilterKey

    const next = buildPagedTableViewModel({
      projectId,
      pagedGroupedRows,
      repoBranchTotals,
      repoPrKindCountsByTpl,
      orderedPrCheckpointTemplates,
      activeTemplates,
      templateById,
      statusChangedKeys,
      statusChangeDetails: statusChangeDetailsRef.current,
      tracked,
      selectedRowIds,
      lockedRowId,
      lockedRepoId,
      branchProtectedMap,
      pageRowIds,
      totalRowCount,
      totalPages,
      safePage,
    })
    const stabilized = stabilizeTableViewModel(stabilizeFrom, next)
    tableViewModelRef.current = stabilized
    return stabilized
  }, [
    projectId,
    prGhFilterKey,
    pagedGroupedRows,
    repoBranchTotals,
    repoPrKindCountsByTpl,
    orderedPrCheckpointTemplates,
    activeTemplates,
    templateById,
    statusChangedKeys,
    tracked,
    selectedRowIds,
    lockedRowId,
    lockedRepoId,
    branchProtectedMap,
    pageRowIds,
    totalRowCount,
    totalPages,
    safePage,
  ]
  )

  const handleNoteChange = useCallback((rowId: string, value: string) => {
    setNoteDraft(prev => ({ ...prev, [rowId]: value }))
  }, [])

  const handleSyncRepo = useCallback(
    (repoId: string) => {
      void handleSyncFromGithub('manual', { repoId })
    },
    [handleSyncFromGithub]
  )

  const rowById = useMemo(() => {
    const m = new Map<string, TrackedBranchRow>()
    for (const r of tracked) m.set(r.id, r)
    return m
  }, [tracked])

  const rowActions = useMemo<PrBoardRowActions>(
    () => ({
      openCreatePr: (row, tpl) => openCreatePr(row, tpl),
      openMergePr: (row, cp) => openMergePr(row, cp),
      openPrInApp: (row, prNumber) => {
        const r = repoById.get(row.repoId) ?? null
        setPrDetailRepo(r)
        setPrDetailNumber(prNumber)
        setPrDetailOpen(true)
      },
      openMetricsCompare: (row, focus) => {
        const r = repoById.get(row.repoId) ?? null
        if (!r) {
          toast.error(t('prManager.metricsCompare.noRepo'))
          return
        }
        if (!githubTokenOk) {
          toast.error(t('prManager.metricsCompare.needGithub'))
          return
        }
        setMetricsCompareCtx({ row, repo: r, focus })
        setMetricsCompareOpen(true)
      },
      syncBranch: rowId => void handleSyncFromGithub('manual', { trackedBranchId: rowId }),
      syncRepo: repoId => void handleSyncFromGithub('manual', { repoId }),
      toggleSelect: rowId =>
        setSelectedRowIds(prev => {
          const n = new Set(prev)
          if (n.has(rowId)) n.delete(rowId)
          else n.add(rowId)
          return n
        }),
      openBranchUrl: row => openUrlInDefaultBrowser(githubBranchUrl(row)),
      noteBlur: row => void handleNoteBlur(row),
    }),
    [repoById, handleSyncFromGithub, handleNoteBlur, githubTokenOk, t]
  )

  const dispatchRowAction = useStableRowActionDispatch(rowById, templateById, rowActions)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <PrBoardToolbar
        search={search}
        onSearchChange={setSearch}
        i18nLanguage={i18n.language}
        handleSyncFromGithub={handleSyncFromGithub}
        showFullTableGithubSyncOverlay={showFullTableGithubSyncOverlay}
        onSyncProgress={handleSyncProgress}
        onRegisterSyncProgressReset={registerSyncProgressReset}
        lastGithubSyncAt={lastGithubSyncAt}
        lastGithubSyncWasAuto={lastGithubSyncWasAuto}
        statusChangedKeysSize={statusChangedKeys.size}
        handleDismissStatusChanges={handleDismissStatusChanges}
        autoSyncGithub={autoSyncGithub}
        setAutoSyncGithub={setAutoSyncGithub}
        writeAutoSyncGithub={writeAutoSyncGithub}
        projectId={projectId}
        githubTokenOk={githubTokenOk}
        repos={repos}
        isAnyGithubSync={isAnyGithubSync}
        openCreatePrFromToolbar={openCreatePrFromToolbar}
        handlePruneStaleDryRun={handlePruneStaleDryRun}
        userId={userId}
        pruningStaleBusy={pruningStaleBusy}
        setFileOverlapOpen={setFileOverlapOpen}
        setAiAssistOpen={setAiAssistOpen}
        sortedReposForFilter={sortedReposForFilter}
        activeTemplates={activeTemplates}
        repoExcludedSet={repoExcludedSet}
        setRepoExcludedIds={setRepoExcludedIds}
        onlyExistingOnRemote={onlyExistingOnRemote}
        setOnlyExistingOnRemote={setOnlyExistingOnRemote}
        remoteExistLoading={remoteExistLoading}
        remoteExistMap={remoteExistMap}
        branchesOnRemoteCount={branchesOnRemoteCount}
        onlyBranchesWithoutPr={onlyBranchesWithoutPr}
        setOnlyBranchesWithoutPr={setOnlyBranchesWithoutPr}
        branchesWithoutPrCount={branchesWithoutPrCount}
        advancedFiltersOpen={advancedFiltersOpen}
        prGhAdvancedCombineMode={prGhAdvancedCombineMode}
        prGhSimpleCombineMode={prGhSimpleCombineMode}
        setPrGhAdvancedCombineMode={setPrGhAdvancedCombineMode}
        setPrGhSimpleCombineMode={setPrGhSimpleCombineMode}
        prGhFilters={prGhFilters}
        setPrGhFilters={setPrGhFilters}
        prGhFilterCounts={prGhFilterCounts}
        toggleAdvancedFilters={toggleAdvancedFilters}
        orderedPrCheckpointTemplates={orderedPrCheckpointTemplates}
        prGhAdvancedColumnCounts={prGhAdvancedColumnCounts}
        prGhFiltersByTpl={prGhFiltersByTpl}
        toggleTplGhFilter={toggleTplGhFilter}
        bulkCreatePrToolbarEnabled={bulkCreatePrToolbarEnabled}
        bulkElig={bulkElig}
        setBulkToolbarConfirm={setBulkToolbarConfirm}
        selectedRowIdsSize={selectedRowIds.size}
      />

      {repos.length === 0 ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed p-10 text-sm text-muted-foreground">{t('prManager.board.emptyNoRepos')}</div>
          {loading ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center rounded-md bg-background/60 backdrop-blur-[1px]" aria-busy="true" aria-live="polite">
              <GlowLoader className="h-10 w-10" />
            </div>
          ) : null}
        </div>
      ) : activeTemplates.length === 0 ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed p-10 text-sm text-muted-foreground">{t('prManager.board.emptyNoTemplates')}</div>
          {loading ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center rounded-md bg-background/60 backdrop-blur-[1px]" aria-busy="true" aria-live="polite">
              <GlowLoader className="h-10 w-10" />
            </div>
          ) : null}
        </div>
      ) : (
        <PrBoardTable
          viewModel={tableViewModel}
          activeTemplates={activeTemplates}
          orderedPrCheckpointTemplates={orderedPrCheckpointTemplates}
          showTableBlockingOverlay={showTableBlockingOverlay}
          showTableBorders={showTableBorders}
          prMergeCellStyle={prMergeCellStyle}
          filteredRowsEmpty={filteredRows.length === 0}
          existenceCheckPending={existenceCheckPending}
          searchRowsCount={searchRows.length}
          remoteFilteredRowsEmpty={remoteFilteredRows.length === 0}
          onlyExistingOnRemote={onlyExistingOnRemote}
          projectId={projectId}
          pageSize={pageSize}
          projectBaseBranches={projectBaseBranches}
          repoBaseInsights={repoBaseInsights}
          repoBaseInsightsLoading={repoBaseInsightsLoading}
          githubTokenOk={githubTokenOk}
          userId={userId}
          isAnyGithubSync={isAnyGithubSync}
          githubSyncUi={githubSyncUi}
          noteDraft={noteDraft}
          prColumnLegendItems={prColumnLegendItems}
          autoSyncGithub={autoSyncGithub}
          onScrollCapture={bumpUserActivity}
          onToggleSelectAllPage={toggleSelectAllPage}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onPersistTableBorders={persistTableBorders}
          onPersistPrMergeCellStyle={persistPrMergeCellStyle}
          onNoteChange={handleNoteChange}
          dispatchRowAction={dispatchRowAction}
          onSyncRepo={handleSyncRepo}
        />
      )}

      <AlertDialog
        open={pruneStaleOpen}
        onOpenChange={open => {
          if (!open) {
            setPruneStaleOpen(false)
            setPruneStalePreview(null)
          }
        }}
      >
        <AlertDialogContent className="max-h-[min(90vh,32rem)] gap-4 overflow-hidden sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('prManager.board.pruneStaleDialogTitle', { count: pruneStalePreview?.wouldDelete ?? 0 })}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-muted-foreground text-sm flex max-h-[min(60vh,22rem)] flex-col gap-3 overflow-hidden text-left">
                <span>{t('prManager.board.pruneStaleDialogIntro')}</span>
                {pruneStalePreview != null && pruneStalePreview.preview.length > 0 ? (
                  <ul className="max-h-36 shrink-0 overflow-auto rounded border border-border/60 bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed">
                    {pruneStalePreview.preview.slice(0, 5).map(row => (
                      <li key={row.id}>
                        {row.repoKey} — {row.branchName}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {pruneStalePreview != null && pruneStalePreview.preview.length > 5 ? (
                  <span className="text-xs">{t('prManager.board.pruneStalePreviewMore', { count: pruneStalePreview.preview.length - 5 })}</span>
                ) : null}
                {pruneStalePreview != null && pruneStalePreview.errors.length > 0 ? (
                  <div className="min-h-0 shrink overflow-auto rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    <p className="mb-1 font-medium">{t('prManager.board.pruneStaleRepoErrorsIntro')}</p>
                    <ul className="font-mono leading-relaxed">
                      {pruneStalePreview.errors.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pruningStaleBusy}>{t('common.cancel')}</AlertDialogCancel>
            <Button variant="destructive" disabled={pruningStaleBusy} onClick={() => void handlePruneStaleConfirm()}>
              {pruningStaleBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('prManager.board.pruneStaleConfirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
      {metricsCompareCtx ? (
        <PrMetricsCompareDialog
          open={metricsCompareOpen}
          onOpenChange={v => {
            setMetricsCompareOpen(v)
            if (!v) setMetricsCompareCtx(null)
          }}
          projectId={projectId}
          row={metricsCompareCtx.row}
          repo={metricsCompareCtx.repo}
          prTemplates={orderedPrCheckpointTemplates}
          onOpenPrDetail={(repo, prNumber) => {
            setPrDetailRepo(repo)
            setPrDetailNumber(prNumber)
            setPrDetailOpen(true)
          }}
        />
      ) : null}
      <PrFileOverlapDialog open={fileOverlapOpen} onOpenChange={setFileOverlapOpen} candidates={prOverlapCandidates} githubTokenOk={githubTokenOk} />
    </div>
  )
}
