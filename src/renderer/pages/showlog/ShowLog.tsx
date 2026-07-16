'use client'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import chalk from 'chalk'
import { IPC } from 'main/constants'
import { forwardRef, type MutableRefObject, memo, startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { formatDateTime, toGitLogSinceParam, toGitLogUntilParam } from 'shared/utils'
import { GitConflictDialog } from '@/components/dialogs/git/GitConflictDialog'
import { GitInteractiveRebaseDialog } from '@/components/dialogs/git/GitInteractiveRebaseDialog'
import { AIAnalysisDialog } from '@/components/dialogs/showlog/AIAnalysisDialog'
import { AIAnalysisHistoryDialog } from '@/components/dialogs/showlog/AIAnalysisHistoryDialog'
import { StatisticDialog } from '@/components/dialogs/showlog/StatisticDialog'
import { GIT_STATUS_TEXT, type GitStatusCode, STATUS_TEXT, type SvnStatusCode } from '@/components/shared/constants'
import { TranslatePanel } from '@/components/shared/TranslatePanel'
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
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { StatusIcon } from '@/components/ui-elements/StatusIcon'
import toast from '@/components/ui-elements/Toast'
import { openGitHistoryDiff, openSvnRevisionDiff, openSvnWorkingDiff } from '@/lib/diffViewer/openDiffViewer'
import i18n from '@/lib/i18n'
import { buildShowLogOpenPayload, canOpenShowLogEmbedded, type ShowLogOpenPayload } from '@/lib/openShowLog'
import { buildGitCommitWebUrl, resolveOriginRemoteUrl } from '@/lib/gitCommitWebUrl'
import { cn } from '@/lib/utils'
import { useShowLogToolbarPortalTarget } from '@/pages/main/ShowLogToolbarPortalContext'
import logger from '@/services/logger'
import { useButtonVariant } from '@/stores/useAppearanceStore'
import { getConfigDataRelevantSnapshot, useConfigurationStore } from '@/stores/useConfigurationStore'
import { useSelectedProjectStore } from '@/stores/useSelectedProjectStore'
import { useShowLogSessionStore } from '@/stores/useShowLogSessionStore'
import { ShowLogTableSection } from './ShowLogTableSection'
import { ShowlogToolbar } from './ShowlogToolbar'

export interface LogEntry {
  revision: string
  fullCommitId?: string // full hash (Git) or revision (SVN)
  author: string
  email?: string
  date: string
  isoDate: string
  message: string
  referenceId: string
  changedFiles: LogFile[]
  /** Git: commit on upstream not yet merged into checked-out branch */
  syncStatus?: 'incoming' | 'outgoing'
}

interface LogFile {
  action: SvnStatusCode | GitStatusCode
  filePath: string
}

// Git log entry interface
interface GitLogEntry {
  hash: string
  author: string
  authorEmail?: string
  date: string
  subject: string
  body: string
  files?: GitLogFile[]
}

interface GitLogFile {
  file: string
  status: string
  changes: number
  insertions: number
  deletions: number
}

const GIT_LOG_PAGE_SIZE = 100

function isGitWorkingTreeDirty(data: {
  conflicted?: string[]
  not_added?: string[]
  created?: string[]
  deleted?: string[]
  modified?: string[]
  renamed?: string[]
  staged?: string[]
}): boolean {
  return (
    (data.conflicted?.length ?? 0) > 0 ||
    (data.not_added?.length ?? 0) > 0 ||
    (data.created?.length ?? 0) > 0 ||
    (data.deleted?.length ?? 0) > 0 ||
    (data.modified?.length ?? 0) > 0 ||
    (data.renamed?.length ?? 0) > 0 ||
    (data.staged?.length ?? 0) > 0
  )
}

type GitLogQueryContext = {
  path: string | string[]
  cwd?: string
  logRefs?: string[]
  revision?: string
  /** Ref used for incoming/outgoing sync markers (null = HEAD). */
  compareLogRef?: string | null
  incomingHashes: string[]
  outgoingHashes: string[]
}

function parseGitLogEntries(
  gitLogData: GitLogEntry[],
  incomingHashSet: Set<string>,
  outgoingHashSet: Set<string>,
  language: string
): LogEntry[] {
  return gitLogData
    .filter(entry => typeof entry?.hash === 'string' && /^[0-9a-f]{40}$/i.test(entry.hash))
    .map(entry => {
      const originalDate = new Date(entry.date)
      const fullMessage = entry.body ? `${entry.subject}\n\n${entry.body}`.trim() : entry.subject
      return {
        revision: entry.hash.substring(0, 8),
        fullCommitId: entry.hash,
        author: entry.author,
        email: entry.authorEmail,
        date: formatDateTime(originalDate, language),
        isoDate: originalDate.toISOString(),
        message: fullMessage,
        referenceId: entry.subject,
        changedFiles: [],
        syncStatus: incomingHashSet.has(entry.hash) ? 'incoming' : outgoingHashSet.has(entry.hash) ? 'outgoing' : undefined,
      }
    })
}

function applySyncMarkersToEntries(
  entries: LogEntry[],
  incomingHashSet: Set<string>,
  outgoingHashSet: Set<string>
): LogEntry[] {
  return entries.map(entry => {
    const hash = entry.fullCommitId || entry.revision
    const syncStatus = incomingHashSet.has(hash) ? 'incoming' : outgoingHashSet.has(hash) ? 'outgoing' : undefined
    return entry.syncStatus === syncStatus ? entry : { ...entry, syncStatus }
  })
}

const SHOWLOG_LAYOUT_KEY = 'showlog-layout-config'
const SHOWLOG_PANEL_SIZES_KEY = 'showlog-panel-sizes-config'

interface ShowlogLayoutConfig {
  direction: 'horizontal' | 'vertical'
}

interface ShowlogPanelSizes {
  mainPanelSize: number
  secondPanelSize: number
  commitPanelSize: number
  filesPanelSize: number
}

const DEFAULT_SHOWLOG_PANEL_SIZES: ShowlogPanelSizes = {
  mainPanelSize: 50,
  secondPanelSize: 50,
  commitPanelSize: 50,
  filesPanelSize: 50,
}

const SHOWLOG_PANEL_MAIN_ID = 'showlog-main'
const SHOWLOG_PANEL_SECOND_ID = 'showlog-second'
const SHOWLOG_PANEL_COMMIT_ID = 'showlog-commit'
const SHOWLOG_PANEL_FILES_ID = 'showlog-files'

function clampPanelSize(size: number, min = 20, max = 80): number {
  if (!Number.isFinite(size)) return 50
  return Math.max(min, Math.min(max, size))
}

function readSavedShowlogPanelSizes(): ShowlogPanelSizes {
  try {
    const saved = localStorage.getItem(SHOWLOG_PANEL_SIZES_KEY)
    if (!saved) return DEFAULT_SHOWLOG_PANEL_SIZES
    const sizes = JSON.parse(saved) as Partial<ShowlogPanelSizes>
    return {
      mainPanelSize: clampPanelSize(sizes.mainPanelSize ?? DEFAULT_SHOWLOG_PANEL_SIZES.mainPanelSize),
      secondPanelSize: clampPanelSize(sizes.secondPanelSize ?? DEFAULT_SHOWLOG_PANEL_SIZES.secondPanelSize),
      commitPanelSize: clampPanelSize(sizes.commitPanelSize ?? DEFAULT_SHOWLOG_PANEL_SIZES.commitPanelSize),
      filesPanelSize: clampPanelSize(sizes.filesPanelSize ?? DEFAULT_SHOWLOG_PANEL_SIZES.filesPanelSize),
    }
  } catch {
    return DEFAULT_SHOWLOG_PANEL_SIZES
  }
}

function readSavedShowlogLayoutDirection(): 'horizontal' | 'vertical' {
  try {
    const saved = localStorage.getItem(SHOWLOG_LAYOUT_KEY)
    if (!saved) return 'horizontal'
    const config = JSON.parse(saved) as ShowlogLayoutConfig
    return config.direction === 'vertical' ? 'vertical' : 'horizontal'
  } catch {
    return 'horizontal'
  }
}

const Table = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement> & { wrapperClassName?: string }>(({ className, wrapperClassName, ...props }, ref) => {
  return (
    <div className={cn('relative w-full overflow-auto', wrapperClassName)}>
      <table ref={ref} className={cn('w-full caption-bottom text-sm table-auto', className)} {...props} />
    </div>
  )
})
Table.displayName = 'Table'

const REDMINE_BASE_URL = 'https://repo.system-exe.co.jp/redmine/issues'

/** Tách text theo #xxxxxx (Redmine issue id) và render phần #xxxxxx thành link mở trình duyệt mặc định. */
const MessageWithRedmineLinks = memo(function MessageWithRedmineLinks({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(#\d+)/)
  return (
    <span className={cn('whitespace-pre-wrap break-words', className)}>
      {parts.map((part, i) => {
        const match = part.match(/^#(\d+)$/)
        if (match) {
          const issueId = match[1]
          const url = `${REDMINE_BASE_URL}/${issueId}`
          return (
            <button
              key={`${i}-${issueId}`}
              type="button"
              className="text-primary underline cursor-pointer hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-primary rounded px-0.5"
              onClick={e => {
                e.stopPropagation()
                window.api.system.open_external_url(url)
              }}
            >
              {part}
            </button>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
})

const CommitHashLink = memo(function CommitHashLink({
  label,
  webUrl,
}: {
  label: string
  webUrl: string | null
}) {
  if (!webUrl) return <span>{label}</span>
  return (
    <button
      type="button"
      className="text-primary underline cursor-pointer hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-primary rounded px-0.5"
      title={webUrl}
      onClick={e => {
        e.stopPropagation()
        void window.api.system.open_external_url(webUrl)
      }}
    >
      {label}
    </button>
  )
})

const StatusSummary = memo(({ statusSummary }: { statusSummary: Record<string, number> }) => (
  <div className="flex gap-2">
    {Object.entries(statusSummary).map(([code, count]) =>
      count > 0 ? (
        <div key={code} className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded">
          <StatusIcon code={code as SvnStatusCode} />
          <span>{count}</span>
        </div>
      ) : null
    )}
  </div>
))

/** Context riêng cho mỗi ShowLog window — không dùng config chung khi mở cửa sổ ShowLog độc lập */
interface ShowLogWindowContext {
  sourceFolder: string
  versionControlSystem: 'git' | 'svn'
}

export type ShowLogProps = {
  mode?: 'embedded' | 'standalone'
  pendingOpenPayload?: ShowLogOpenPayload | null
  /** Main shell embedded: đọc context hiện tại khi detach. */
  handoffGetterRef?: MutableRefObject<(() => ShowLogOpenPayload) | null>
  /** Main shell: TitleBar refresh gọi qua ref. */
  refreshRef?: MutableRefObject<(() => void) | null>
  onRefreshingChange?: (loading: boolean) => void
  activeRepoPath?: string
  isMultiRepo?: boolean
  /** Embedded: gọi sau khi đã consume payload autoLoad để MainPage xóa state. */
  onPendingOpenPayloadConsumed?: () => void
  /** Embedded: tab Show Log đang active (không bị CSS hidden). */
  shellTabActive?: boolean
}

function applyOpenPayload(
  data: ShowLogOpenPayload | Record<string, unknown>,
  setWindowContext: (ctx: ShowLogWindowContext | null) => void,
  setFilePath: (path: string | string[]) => void,
  setCurrentRevision: (rev: string) => void,
  resetLists: () => void
) {
  const path = typeof data === 'string' ? data : (data.path as string | string[])
  const revision = typeof data === 'string' ? '' : String((data as { currentRevision?: string }).currentRevision || '')
  const ctx =
    (data as { sourceFolder?: string; versionControlSystem?: 'git' | 'svn' }).sourceFolder &&
      (data as { sourceFolder?: string; versionControlSystem?: 'git' | 'svn' }).versionControlSystem
      ? {
        sourceFolder: (data as { sourceFolder: string }).sourceFolder,
        versionControlSystem: (data as { versionControlSystem: 'git' | 'svn' }).versionControlSystem,
      }
      : null
  setWindowContext(ctx)
  setFilePath(path)
  setCurrentRevision(revision)
  resetLists()
}

export default function ShowLog({
  mode = 'standalone',
  pendingOpenPayload,
  handoffGetterRef,
  refreshRef,
  onRefreshingChange,
  activeRepoPath,
  isMultiRepo = false,
  onPendingOpenPayloadConsumed,
  shellTabActive = true,
}: ShowLogProps) {
  const embedded = mode === 'embedded'
  const portal = useShowLogToolbarPortalTarget()
  const { t } = useTranslation()
  const variant = useButtonVariant()
  const { versionControlSystem, loadConfigurationConfig, isConfigLoaded, sourceFolder } = useConfigurationStore()
  const selectedProjectId = useSelectedProjectStore(s => s.selectedProjectId)
  const [windowContext, setWindowContext] = useState<ShowLogWindowContext | null>(null)
  const [layoutDirection, setLayoutDirection] = useState<'horizontal' | 'vertical'>(readSavedShowlogLayoutDirection)
  const gitLogRevision = useShowLogSessionStore(s => s.gitLogRevision)
  const setGitLogRevision = useShowLogSessionStore(s => s.setGitLogRevision)
  const resetLogSession = useShowLogSessionStore(s => s.resetLogSession)

  const workspaceSourceFolder = isMultiRepo && activeRepoPath ? activeRepoPath : sourceFolder
  const effectiveSourceFolder = embedded ? workspaceSourceFolder : (windowContext?.sourceFolder ?? sourceFolder)
  const effectiveVersionControlSystem = embedded ? versionControlSystem : (windowContext?.versionControlSystem ?? versionControlSystem)
  // For Git, always use graph view; for SVN, use list view
  // const viewMode = versionControlSystem === 'git' ? 'graph' : 'list'

  // State declarations - moved up before useEffect
  const [isLoading, setIsLoading] = useState(false)
  const [filePath, setFilePath] = useState<string | string[]>('')
  const [currentRevision, setCurrentRevision] = useState<string>('')

  const displayFilePath = useMemo(() => {
    if (Array.isArray(filePath)) {
      return filePath.length > 1 ? `${filePath[0]} (+${filePath.length - 1} files)` : filePath[0]
    }
    return filePath
  }, [filePath])

  const [selectedRevision, setSelectedRevision] = useState<string | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [changedFiles, setChangedFiles] = useState<LogFile[]>([])
  const [statusSummary, setStatusSummary] = useState<Record<string, number>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date()
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(today.getDate() - 7)
    return {
      from: oneWeekAgo,
      to: today,
    }
  })

  const [isStatisticOpen, setIsStatisticOpen] = useState(false)
  const [isAIAnalysisOpen, setIsAIAnalysisOpen] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [showGitConflictDialog, setShowGitConflictDialog] = useState(false)
  const [showInteractiveRebaseDialog, setShowInteractiveRebaseDialog] = useState(false)
  const [interactiveRebaseBaseRef, setInteractiveRebaseBaseRef] = useState<string>('')
  const [cherryPickConfirmOpen, setCherryPickConfirmOpen] = useState(false)
  const [cherryPickEntry, setCherryPickEntry] = useState<LogEntry | null>(null)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [resetPending, setResetPending] = useState<{ entry: LogEntry; mode: 'soft' | 'mixed' | 'hard' } | null>(null)

  const [panelSizes, setPanelSizes] = useState<ShowlogPanelSizes>(() => readSavedShowlogPanelSizes())

  const outerPanelGroupRef = useRef<any>(null)
  const innerPanelGroupRef = useRef<any>(null)
  const panelSizesRef = useRef<ShowlogPanelSizes>(panelSizes)
  panelSizesRef.current = panelSizes
  const hasLoadedPanelSizesRef = useRef(true)
  const isApplyingPanelLayoutRef = useRef(false)

  const [allLogData, setAllLogData] = useState<LogEntry[]>([])
  const [filteredLogData, setFilteredLogData] = useState<LogEntry[]>([])
  const [totalEntriesFromBackend, setTotalEntriesFromBackend] = useState(0)
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const selectedRevisionRef = useRef<string | null>(null)
  const [logSyncUpstream, setLogSyncUpstream] = useState<string | null>(null)
  const [logSyncCompareRef, setLogSyncCompareRef] = useState<string | null>(null)
  const [logSyncUpstreamSource, setLogSyncUpstreamSource] = useState<'tracking' | 'origin_branch' | 'origin_head' | 'none' | null>(null)
  const [incomingCommitCount, setIncomingCommitCount] = useState(0)
  const [outgoingCommitCount, setOutgoingCommitCount] = useState(0)
  const [gitCommitRemoteUrl, setGitCommitRemoteUrl] = useState<string | null>(null)
  const [hasMoreGitLog, setHasMoreGitLog] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isGitPulling, setIsGitPulling] = useState(false)
  const [isGitPushing, setIsGitPushing] = useState(false)
  const gitLogQueryRef = useRef<GitLogQueryContext | null>(null)
  const loadMoreInFlightRef = useRef(false)

  // Refs to avoid "before initialization" errors
  const loadLogDataRef = useRef<
    | ((
        path: string | string[],
        override?: { cwd?: string; versionControlSystem?: 'git' | 'svn'; gitLogRevision?: string | null; forceFetch?: boolean }
      ) => Promise<void>)
    | null
  >(null)
  const dataSnapshotRef = useRef<string | null>(null)
  const lastLoadKeyRef = useRef<{ key: string; timestamp: number }>({ key: '', timestamp: 0 })
  const lastErrorToastRef = useRef<{ message: string; timestamp: number }>({ message: '', timestamp: 0 })
  const embeddedGitLogRevisionLoadRef = useRef<string | null | undefined>(undefined)
  const loadSeqRef = useRef(0)
  const lastShowLogFetchRef = useRef<{ cwd: string; at: number } | null>(null)
  const skipNextBranchReloadRef = useRef(false)
  const SHOWLOG_FETCH_DEBOUNCE_MS = 15_000

  const getHandoffPayload = useCallback(
    (): ShowLogOpenPayload =>
      buildShowLogOpenPayload({
        filePath: filePath || '.',
        currentRevision,
        sourceFolder: effectiveSourceFolder || undefined,
        versionControlSystem: effectiveVersionControlSystem,
      }),
    [filePath, currentRevision, effectiveSourceFolder, effectiveVersionControlSystem]
  )

  useLayoutEffect(() => {
    if (!handoffGetterRef) return
    handoffGetterRef.current = getHandoffPayload
    return () => {
      handoffGetterRef.current = null
    }
  }, [handoffGetterRef, getHandoffPayload])

  useEffect(() => {
    if (embedded) return
    window.api.showLog.syncHandoff(getHandoffPayload())
  }, [embedded, getHandoffPayload])

  const handleStandaloneDock = useCallback(() => {
    window.api.showLog.requestDock(getHandoffPayload())
  }, [getHandoffPayload])

  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem(SHOWLOG_LAYOUT_KEY)
      if (savedConfig) {
        const config: ShowlogLayoutConfig = JSON.parse(savedConfig)
        setLayoutDirection(config.direction)
      }
    } catch (error) {
      logger.error('Lỗi khi đọc cấu hình layout từ localStorage:', error)
    }
  }, [])

  const applyShowLogPanelLayout = useCallback(() => {
    const sizes = panelSizesRef.current
    isApplyingPanelLayoutRef.current = true
    outerPanelGroupRef.current?.setLayout?.({
      [SHOWLOG_PANEL_MAIN_ID]: sizes.mainPanelSize,
      [SHOWLOG_PANEL_SECOND_ID]: sizes.secondPanelSize,
    })
    innerPanelGroupRef.current?.setLayout?.({
      [SHOWLOG_PANEL_COMMIT_ID]: sizes.commitPanelSize,
      [SHOWLOG_PANEL_FILES_ID]: sizes.filesPanelSize,
    })
    queueMicrotask(() => {
      isApplyingPanelLayoutRef.current = false
    })
  }, [])

  const panelResizeDebounceRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; pending: Partial<ShowlogPanelSizes> }>({ timer: null, pending: {} })

  const persistPanelSizes = useCallback((partial: Partial<ShowlogPanelSizes>) => {
    if (isApplyingPanelLayoutRef.current) return
    const ref = panelResizeDebounceRef.current
    Object.assign(ref.pending, partial)
    if (ref.timer) clearTimeout(ref.timer)
    ref.timer = setTimeout(() => {
      const next = { ...panelSizesRef.current, ...ref.pending }
      panelSizesRef.current = next
      setPanelSizes(next)
      ref.pending = {}
      ref.timer = null
    }, 150)
  }, [])

  useEffect(() => {
    if (!hasLoadedPanelSizesRef.current) return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(SHOWLOG_PANEL_SIZES_KEY, JSON.stringify(panelSizes))
      } catch (error) {
        logger.error('Lỗi khi lưu kích thước panel vào localStorage:', error)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [panelSizes])

  useEffect(() => {
    return () => {
      const ref = panelResizeDebounceRef.current
      if (ref.timer) clearTimeout(ref.timer)
      try {
        localStorage.setItem(SHOWLOG_PANEL_SIZES_KEY, JSON.stringify(panelSizesRef.current))
      } catch (error) {
        logger.error('Lỗi khi lưu kích thước panel vào localStorage:', error)
      }
    }
  }, [])

  useEffect(() => {
    if (embedded && !shellTabActive) return
    if (!isConfigLoaded) return
    const id = window.setTimeout(() => applyShowLogPanelLayout(), 0)
    return () => window.clearTimeout(id)
  }, [embedded, shellTabActive, isConfigLoaded, layoutDirection, applyShowLogPanelLayout])

  useEffect(() => {
    if (embedded && !shellTabActive) return
    if (!isConfigLoaded || isLoading) return
    const id = window.setTimeout(() => applyShowLogPanelLayout(), 0)
    return () => window.clearTimeout(id)
  }, [embedded, shellTabActive, isConfigLoaded, isLoading, applyShowLogPanelLayout])

  // Load configuration when component mounts
  useEffect(() => {
    loadConfigurationConfig().catch(error => {
      logger.error('Error loading configuration in ShowLog:', error)
    })
  }, [loadConfigurationConfig])

  const loadLogData = useCallback(
    async (
      path: string | string[],
      override?: { cwd?: string; versionControlSystem?: 'git' | 'svn'; gitLogRevision?: string | null; forceFetch?: boolean }
    ) => {
      const loadId = ++loadSeqRef.current
      const isStale = () => loadId !== loadSeqRef.current

      try {
        const language = i18n.language
        const useCwd = override?.cwd ?? (embedded ? effectiveSourceFolder : windowContext?.sourceFolder) ?? effectiveSourceFolder
        const useVcs = override?.versionControlSystem ?? effectiveVersionControlSystem

        setCommitMessage('')
        setChangedFiles([])
        setStatusSummary({} as Record<SvnStatusCode, number>)
        setIsLoading(true)
        setAllLogData([])
        setFilteredLogData([])
        setTotalEntriesFromBackend(0)
        setLogSyncUpstream(null)
        setLogSyncCompareRef(null)
        setLogSyncUpstreamSource(null)
        setIncomingCommitCount(0)
        setOutgoingCommitCount(0)
        setGitCommitRemoteUrl(null)
        setHasMoreGitLog(false)
        gitLogQueryRef.current = null

        const options: any = {}
        if (useVcs !== 'git' && dateRange?.from) {
          options.dateFrom = toGitLogSinceParam(dateRange.from)
          if (dateRange.to) {
            options.dateTo = toGitLogUntilParam(dateRange.to)
          }
        }
        if (useCwd) {
          options.cwd = useCwd
        }
        const activeLogRevision = override?.gitLogRevision !== undefined ? override.gitLogRevision : gitLogRevision
        let result: any
        let incomingHashSet = new Set<string>()
        let outgoingHashSet = new Set<string>()

        if (useVcs === 'git') {
          const shouldFetch =
            !!useCwd &&
            (override?.forceFetch ||
              !lastShowLogFetchRef.current ||
              lastShowLogFetchRef.current.cwd !== useCwd ||
              Date.now() - lastShowLogFetchRef.current.at > SHOWLOG_FETCH_DEBOUNCE_MS)

          if (shouldFetch) {
            const fetchResult = await window.api.git.fetch('origin', { skipUpdateCheck: true }, useCwd)
            if (isStale()) return
            if (fetchResult.status === 'success') {
              lastShowLogFetchRef.current = { cwd: useCwd, at: Date.now() }
            } else {
              logger.warning('ShowLog fetch before log skipped or failed:', fetchResult.message)
            }
          }

          const [markersResult, remotesResult] = await Promise.all([
            window.api.git.get_log_sync_markers(useCwd, activeLogRevision ?? undefined),
            window.api.git.get_remotes(useCwd),
          ])
          if (isStale()) return
          if (remotesResult.status === 'success' && remotesResult.data) {
            setGitCommitRemoteUrl(resolveOriginRemoteUrl(remotesResult.data))
          } else {
            setGitCommitRemoteUrl(null)
          }
          if (markersResult.status === 'success' && markersResult.data) {
            const { upstream, upstreamSource, incomingHashes, outgoingHashes, compareRef } = markersResult.data
            incomingHashSet = new Set(incomingHashes)
            outgoingHashSet = new Set(outgoingHashes)
            setLogSyncUpstream(upstream ?? null)
            setLogSyncCompareRef(compareRef ?? null)
            setLogSyncUpstreamSource(upstreamSource ?? 'none')
          } else {
            setLogSyncUpstream(null)
            setLogSyncCompareRef(null)
            setLogSyncUpstreamSource(null)
          }

          const logBase = activeLogRevision || 'HEAD'
          const upstreamRef = markersResult.status === 'success' ? markersResult.data?.upstream?.trim() : ''
          if (upstreamRef && upstreamRef !== logBase) {
            options.logRefs = [logBase, upstreamRef]
          } else if (activeLogRevision) {
            options.revision = activeLogRevision
          }
          options.messagesOnly = true
          options.maxCount = GIT_LOG_PAGE_SIZE
          options.skip = 0

          result = await window.api.git.log(path, options)
          if (result.status !== 'success' && options.logRefs) {
            const retryOptions = { ...options }
            delete retryOptions.logRefs
            if (activeLogRevision) {
              retryOptions.revision = activeLogRevision
            }
            result = await window.api.git.log(path, retryOptions)
          }
        } else {
          result = await window.api.svn.log(path, options)
        }

        if (isStale()) return

        if (result.status === 'success') {
          const sourceFolderPrefix = result.sourceFolderPrefix
          const backendTotal = result.totalEntries ?? 0
          setTotalEntriesFromBackend(backendTotal)

          let parsedEntries: LogEntry[] = []

          if (useVcs === 'git') {
            let gitLogData: GitLogEntry[] = []
            try {
              const parsed = JSON.parse(result.data as string)
              gitLogData = Array.isArray(parsed) ? (parsed as GitLogEntry[]) : []
            } catch (parseError) {
              logger.error('Failed to parse git log JSON:', parseError)
              throw parseError
            }
            if (gitLogData.length > 0) {
              const firstEntry = gitLogData[0]
              logger.info('First Git log entry:')
              logger.info('  Hash:', firstEntry.hash?.substring(0, 8))
              logger.info('  Subject:', firstEntry.subject)
              logger.info('  Body length:', firstEntry.body?.length || 0)
              logger.info('  Body preview:', firstEntry.body?.substring(0, 100))
            }

            parsedEntries = parseGitLogEntries(gitLogData, incomingHashSet, outgoingHashSet, language)

            gitLogQueryRef.current = {
              path,
              cwd: useCwd,
              logRefs: options.logRefs,
              revision: options.revision,
              compareLogRef: activeLogRevision ?? null,
              incomingHashes: [...incomingHashSet],
              outgoingHashes: [...outgoingHashSet],
            }
            setHasMoreGitLog(parsedEntries.length >= GIT_LOG_PAGE_SIZE)

            // Debug: Log first parsed entry
            if (parsedEntries.length > 0) {
              logger.info('First parsed entry message length:', parsedEntries[0].message.length)
              logger.info('First parsed entry message preview:', parsedEntries[0].message.substring(0, 150))
            }
            // }
          } else {
            // Parse SVN log data (existing logic)
            const rawLog = result.data as string
            const entries = rawLog
              .split('------------------------------------------------------------------------')
              .map(entry => entry.trim())
              .filter(entry => entry)

            if (entries.length !== backendTotal && backendTotal > 0) {
              logger.warning(chalk.yellow.bold(`Số entries parse (${entries.length}) khác với total từ backend (${backendTotal})!`))
            }

            const addedRevisions = new Set<string>()
            for (const entry of entries) {
              const lines = entry
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean)
              const headerMatch = lines[0]?.match(/^r(\d+)\s+\|\s+(.+?)\s+\|\s+(.+?)\s+\|\s+(\d+)\s+line/)
              if (!headerMatch) continue
              const [, revisionStr, author, date] = headerMatch
              // SVN author may be "Name <email@example.com>" - extract email if present
              const emailMatch = author?.match(/<([^>]+@[^>]+)>/)
              const email = emailMatch ? emailMatch[1] : undefined
              let i = 1
              if (lines[i]?.startsWith('Changed paths:')) i++
              const changedFiles: LogFile[] = []
              const isSvnStatusCode = (code: string): code is SvnStatusCode => Object.keys(STATUS_TEXT).includes(code)
              while (i < lines.length) {
                const line = lines[i]
                const match = line.match(/^([A-Z?!~])\s+(\/.+)$/)
                if (!match) break
                const [, actionCode, filePath] = match
                if (!isSvnStatusCode(actionCode)) break

                let processedPath = filePath
                if (sourceFolderPrefix) {
                  const prefixPattern = new RegExp(`^/?${sourceFolderPrefix}/?`)
                  processedPath = filePath.replace(prefixPattern, '')
                }
                changedFiles.push({ action: actionCode, filePath: processedPath })
                i++
              }
              const messageLines = lines.slice(i)
              const fullMessage = messageLines.join('\n').trim()
              const messageFirstLine = fullMessage.split('\n')[0] || ''
              const referenceId = messageFirstLine.trim()
              if (!addedRevisions.has(revisionStr)) {
                const originalDate = new Date(date)
                parsedEntries.push({
                  revision: revisionStr,
                  fullCommitId: revisionStr, // SVN revision = fullCommitId
                  author,
                  email,
                  date: formatDateTime(originalDate, language),
                  isoDate: originalDate.toISOString(),
                  message: fullMessage,
                  referenceId: referenceId,
                  changedFiles,
                })
                addedRevisions.add(revisionStr)
              } else {
                logger.warning(`Skipping duplicate revision entry found during frontend parsing: r${revisionStr}`)
              }
            }
          }

          // Git: giữ nguyên thứ tự từ backend (giống git log). SVN: sort theo số revision giảm dần.
          const finalEntries = useVcs === 'git' ? parsedEntries : [...parsedEntries].sort((a, b) => parseInt(b.revision, 10) - parseInt(a.revision, 10))

          if (useVcs === 'git') {
            setIncomingCommitCount(finalEntries.filter(entry => entry.syncStatus === 'incoming').length)
            setOutgoingCommitCount(finalEntries.filter(entry => entry.syncStatus === 'outgoing').length)
          }

          // Set all state in one batch to avoid extra render cycle - UI shows data immediately
          setAllLogData(finalEntries)
          setFilteredLogData(finalEntries)

          if (useVcs !== 'git' && result.suggestedStartDate) {
            const suggestedDate = new Date(result.suggestedStartDate)
            if (dateRange?.from?.getTime() !== suggestedDate.getTime()) {
              setDateRange(prevRange => ({
                from: suggestedDate,
                to: prevRange?.to,
              }))
            }
          } else if (useVcs !== 'git' && parsedEntries.length > 0 && !dateRange?.from) {
            const earliestIsoDate = finalEntries[0].isoDate
            const earliestDate = new Date(earliestIsoDate)
            setDateRange(prevRange => ({
              from: earliestDate,
              to: prevRange?.to,
            }))
          }
        } else {
          const msg = result.message ?? 'Error loading log data'
          const now = Date.now()
          if (now - lastErrorToastRef.current.timestamp > 500 || lastErrorToastRef.current.message !== msg) {
            lastErrorToastRef.current = { message: msg, timestamp: now }
            toast.error(msg)
          }
          if (isStale()) return
          setAllLogData([])
          setFilteredLogData([])
          setTotalEntriesFromBackend(0)
          setIncomingCommitCount(0)
        setOutgoingCommitCount(0)
        }
      } catch (error) {
        logger.error('Error loading log data:', error)
        const msg = error instanceof Error && error.message ? error.message : 'Error loading log data'
        const now = Date.now()
        if (now - lastErrorToastRef.current.timestamp > 500 || lastErrorToastRef.current.message !== msg) {
          lastErrorToastRef.current = { message: msg, timestamp: now }
          toast.error(msg)
        }
        if (isStale()) return
        setAllLogData([])
        setFilteredLogData([])
        setTotalEntriesFromBackend(0)
        setIncomingCommitCount(0)
        setOutgoingCommitCount(0)
      } finally {
        if (loadId === loadSeqRef.current) setIsLoading(false)
      }
    },
    [effectiveVersionControlSystem, dateRange, loadConfigurationConfig, windowContext, gitLogRevision, embedded, effectiveSourceFolder]
  )

  const loadMoreGitLog = useCallback(async () => {
    const ctx = gitLogQueryRef.current
    if (!ctx || !hasMoreGitLog || loadMoreInFlightRef.current || effectiveVersionControlSystem !== 'git') {
      return
    }

    loadMoreInFlightRef.current = true
    setIsLoadingMore(true)

    try {
      const language = i18n.language
      const skip = allLogData.length
      const options: Record<string, unknown> = {
        cwd: ctx.cwd,
        messagesOnly: true,
        maxCount: GIT_LOG_PAGE_SIZE,
        skip,
      }
      if (ctx.logRefs?.length) {
        options.logRefs = ctx.logRefs
      } else if (ctx.revision) {
        options.revision = ctx.revision
      }

      let incomingHashSet = new Set(ctx.incomingHashes)
      let outgoingHashSet = new Set(ctx.outgoingHashes)
      if (ctx.cwd) {
        const markersResult = await window.api.git.get_log_sync_markers(ctx.cwd, ctx.compareLogRef ?? undefined)
        if (markersResult.status === 'success' && markersResult.data) {
          const { upstream, upstreamSource, incomingHashes, outgoingHashes, compareRef } = markersResult.data
          incomingHashSet = new Set(incomingHashes)
          outgoingHashSet = new Set(outgoingHashes)
          setLogSyncUpstream(upstream ?? null)
          setLogSyncCompareRef(compareRef ?? null)
          setLogSyncUpstreamSource(upstreamSource ?? 'none')
        }
      }

      const result = await window.api.git.log(ctx.path, options)

      if (result.status !== 'success') {
        logger.warning('Failed to load more git log:', result.message)
        setHasMoreGitLog(false)
        return
      }

      const gitLogData = JSON.parse(result.data as string) as GitLogEntry[]
      const newEntries = parseGitLogEntries(gitLogData, incomingHashSet, outgoingHashSet, language)

      if (newEntries.length === 0) {
        setHasMoreGitLog(false)
        return
      }

      let incomingCount = 0
      let outgoingCount = 0
      setAllLogData(prev => {
        const resynced = applySyncMarkersToEntries(prev, incomingHashSet, outgoingHashSet)
        const existingHashes = new Set(resynced.map(entry => entry.fullCommitId || entry.revision))
        const merged = [...resynced]
        for (const entry of newEntries) {
          const id = entry.fullCommitId || entry.revision
          if (!existingHashes.has(id)) {
            merged.push(entry)
            existingHashes.add(id)
          }
        }
        incomingCount = merged.filter(entry => entry.syncStatus === 'incoming').length
        outgoingCount = merged.filter(entry => entry.syncStatus === 'outgoing').length
        return merged
      })
      setIncomingCommitCount(incomingCount)
      setOutgoingCommitCount(outgoingCount)
      if (ctx) {
        gitLogQueryRef.current = {
          ...ctx,
          incomingHashes: [...incomingHashSet],
          outgoingHashes: [...outgoingHashSet],
        }
      }
      setHasMoreGitLog(newEntries.length >= GIT_LOG_PAGE_SIZE)
    } catch (error) {
      logger.error('Error loading more git log:', error)
    } finally {
      loadMoreInFlightRef.current = false
      setIsLoadingMore(false)
    }
  }, [allLogData.length, effectiveVersionControlSystem, hasMoreGitLog])

  // Assign loadLogData to ref after it's declared
  loadLogDataRef.current = loadLogData

  const clearLogLists = useCallback(() => {
    setAllLogData([])
    setFilteredLogData([])
    setTotalEntriesFromBackend(0)
    setCommitMessage('')
    setChangedFiles([])
    setStatusSummary({} as Record<SvnStatusCode, number>)
    setSelectedRevision(null)
    selectedRevisionRef.current = null
    setRowSelection({})
    setLogSyncUpstream(null)
    setLogSyncCompareRef(null)
    setLogSyncUpstreamSource(null)
    setIncomingCommitCount(0)
    setOutgoingCommitCount(0)
    setGitCommitRemoteUrl(null)
    setHasMoreGitLog(false)
    setIsGitPulling(false)
    setIsGitPushing(false)
    gitLogQueryRef.current = null
  }, [])

  useEffect(() => {
    if (!embedded) return
    resetLogSession()
    clearLogLists()
    embeddedGitLogRevisionLoadRef.current = undefined
    lastShowLogFetchRef.current = null
  }, [embedded, selectedProjectId, workspaceSourceFolder, activeRepoPath, resetLogSession, clearLogLists])

  const handleFolderChange = useCallback(
    (folderPath: string, vcs: 'git' | 'svn') => {
      if (embedded) return
      resetLogSession()
      setWindowContext({ sourceFolder: folderPath, versionControlSystem: vcs })
      if (loadLogDataRef.current) {
        const path = Array.isArray(filePath) ? filePath : filePath || '.'
        loadLogDataRef.current(path, { cwd: folderPath, versionControlSystem: vcs })
      }
    },
    [embedded, filePath, resetLogSession]
  )

  useEffect(() => {
    if (!embedded) return
    const path = Array.isArray(filePath) ? filePath : filePath
    if (!path || !loadLogDataRef.current) return

    const revKey = gitLogRevision ?? ''
    if (embeddedGitLogRevisionLoadRef.current === undefined) {
      embeddedGitLogRevisionLoadRef.current = revKey
      return
    }
    if (embeddedGitLogRevisionLoadRef.current === revKey) return
    embeddedGitLogRevisionLoadRef.current = revKey
    void loadLogDataRef.current(path, { gitLogRevision })
  }, [embedded, gitLogRevision, filePath])

  // Load log data khi filePath/config/vcs thay đổi
  useEffect(() => {
    if (embedded) return
    if (!isConfigLoaded && !windowContext) {
      logger.info('Waiting for config to load in ShowLog before loading data...')
      return
    }
    if (!filePath || !effectiveVersionControlSystem || !loadLogDataRef.current) return

    const key = `${filePath}|${effectiveSourceFolder ?? ''}|${effectiveVersionControlSystem}|${gitLogRevision ?? ''}`
    const now = Date.now()
    if (now - lastLoadKeyRef.current.timestamp < 150 && lastLoadKeyRef.current.key === key) {
      return
    }
    lastLoadKeyRef.current = { key, timestamp: now }

    setAllLogData([])
    setFilteredLogData([])
    setTotalEntriesFromBackend(0)
    loadLogDataRef.current(filePath)
  }, [embedded, effectiveVersionControlSystem, filePath, isConfigLoaded, windowContext, effectiveSourceFolder, gitLogRevision])

  useEffect(() => {
    return () => {
      try {
        const config: ShowlogLayoutConfig = {
          direction: layoutDirection,
        }
        localStorage.setItem(SHOWLOG_LAYOUT_KEY, JSON.stringify(config))
      } catch (error) {
        logger.error('Lỗi khi lưu cấu hình layout vào localStorage:', error)
      }
    }
  }, [layoutDirection])

  useEffect(() => {
    try {
      const config: ShowlogLayoutConfig = {
        direction: layoutDirection,
      }
      localStorage.setItem(SHOWLOG_LAYOUT_KEY, JSON.stringify(config))
    } catch (error) {
      logger.error('Lỗi khi lưu cấu hình layout vào localStorage:', error)
    }
  }, [layoutDirection])

  const columns = useMemo<ColumnDef<LogEntry>[]>(
    () => [
      {
        accessorKey: 'revision',
        size: 70,
        minSize: 70,
        header: ({ column }) => (
          <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
            {effectiveVersionControlSystem === 'git' ? t('dialog.showLogs.commit') : t('dialog.showLogs.revision')}
            <span className="pr-0.5">
              {!column.getIsSorted()}
              {column.getIsSorted() === 'asc' && '↑'}
              {column.getIsSorted() === 'desc' && '↓'}
            </span>
          </Button>
        ),
        cell: ({ row }) => {
          const revision = String(row.getValue('revision') ?? '')
          if (effectiveVersionControlSystem !== 'git') {
            return <div>{revision}</div>
          }
          const fullHash = row.original.fullCommitId || revision
          const webUrl = buildGitCommitWebUrl(gitCommitRemoteUrl, fullHash)
          return <CommitHashLink label={revision} webUrl={webUrl} />
        },
      },
      {
        accessorKey: 'date',
        size: 135,
        minSize: 135,
        header: ({ column }) => {
          return (
            <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
              {t('dialog.showLogs.date')}
              <span className="pr-0.5">
                {!column.getIsSorted()}
                {column.getIsSorted() === 'asc' && '↑'}
                {column.getIsSorted() === 'desc' && '↓'}
              </span>
            </Button>
          )
        },
        cell: ({ row }) => <div>{row.getValue('date')}</div>,
      },
      {
        accessorKey: 'author',
        size: 230,
        minSize: 230,
        header: ({ column }) => {
          return (
            <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
              {t('dialog.showLogs.author')}
              <span className="pr-0.5">
                {!column.getIsSorted()}
                {column.getIsSorted() === 'asc' && '↑'}
                {column.getIsSorted() === 'desc' && '↓'}
              </span>
            </Button>
          )
        },
        cell: ({ row }) => <div>{row.getValue('author')}</div>,
      },
      ...(effectiveVersionControlSystem === 'git'
        ? [
          {
            accessorKey: 'email',
            size: 200,
            minSize: 150,
            header: ({ column }) => (
              <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
                {t('dialog.showLogs.email')}
                <span className="pr-0.5">
                  {!column.getIsSorted()}
                  {column.getIsSorted() === 'asc' && '↑'}
                  {column.getIsSorted() === 'desc' && '↓'}
                </span>
              </Button>
            ),
            cell: ({ row }) => (
              <div className="truncate" title={row.original.email ?? ''}>
                {row.original.email ?? '-'}
              </div>
            ),
          } as ColumnDef<LogEntry>,
        ]
        : []),
      {
        accessorKey: 'referenceId',
        size: 300,
        minSize: 180,
        header: ({ column }) => (
          <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
            {t('dialog.showLogs.message')}
            <span className="pr-0.5">
              {!column.getIsSorted()}
              {column.getIsSorted() === 'asc' && '↑'}
              {column.getIsSorted() === 'desc' && '↓'}
            </span>
          </Button>
        ),
        cell: ({ row }) => {
          const text = String(row.getValue('referenceId') ?? '')
          return (
            <div className="min-w-0 overflow-hidden" title={text}>
              <MessageWithRedmineLinks text={text} className="text-sm block truncate!" />
            </div>
          )
        },
      },
      {
        accessorKey: 'message',
        size: 300,
        minSize: 200,
        header: ({ column }) => {
          return (
            <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
              {t('dialog.showLogs.message')}
              <span className="pr-0.5">
                {!column.getIsSorted()}
                {column.getIsSorted() === 'asc' && '↑'}
                {column.getIsSorted() === 'desc' && '↓'}
              </span>
            </Button>
          )
        },
        cell: ({ row }) => {
          const message = row.getValue('message') as string
          const referenceId = row.getValue('referenceId') as string
          const displayMessage = referenceId && message.startsWith(referenceId) ? message.substring(referenceId.length).trim() : message

          return (
            <div className="overflow-hidden w-[400px] max-h-[150px] overflow-y-auto" title={displayMessage}>
              <MessageWithRedmineLinks text={displayMessage} className="text-sm leading-relaxed" />
            </div>
          )
        },
      },
    ],
    [t, effectiveVersionControlSystem, gitCommitRemoteUrl]
  )

  // Callbacks - moved up after state declarations
  const calculateStatusSummary = useCallback(
    (changedFiles: LogFile[]) => {
      if (effectiveVersionControlSystem === 'git') {
        const summary: Record<GitStatusCode, number> = {} as Record<GitStatusCode, number>
        for (const code of Object.keys(GIT_STATUS_TEXT)) {
          summary[code as GitStatusCode] = 0
        }
        for (const file of changedFiles) {
          const action = file.action as GitStatusCode
          if (action in GIT_STATUS_TEXT) {
            summary[action] = (summary[action] || 0) + 1
          }
        }
        return summary
      }
      const summary: Record<SvnStatusCode, number> = {} as Record<SvnStatusCode, number>
      for (const code of Object.keys(STATUS_TEXT)) {
        summary[code as SvnStatusCode] = 0
      }
      for (const file of changedFiles) {
        const action = file.action as SvnStatusCode
        if (action in STATUS_TEXT) {
          summary[action] = (summary[action] || 0) + 1
        }
      }
      return summary
    },
    [effectiveVersionControlSystem]
  )

  const selectRevision = useCallback(
    async (revision: string) => {
      if (revision === selectedRevision) return

      selectedRevisionRef.current = revision
      const entry = allLogData.find(e => e.revision === revision)
      if (entry) {
        // For Git: if changedFiles is empty, load from API
        if (effectiveVersionControlSystem === 'git' && (!entry.changedFiles || entry.changedFiles.length === 0)) {
          startTransition(() => {
            setSelectedRevision(revision)
            setCommitMessage(entry.message)
          })
          try {
            // Find the full hash from the revision (shortHash)
            const hashToUse = entry.fullCommitId || revision

            logger.info('Loading changed files for commit:', hashToUse)
            const result = await window.api.git.getCommitFiles(hashToUse, windowContext?.sourceFolder ? { cwd: windowContext.sourceFolder } : undefined)

            if (result.status === 'success' && result.data?.files) {
              const files: LogFile[] = result.data.files.map((f: any) => ({
                action: f.status as GitStatusCode,
                filePath: f.file,
              }))
              startTransition(() => {
                setChangedFiles(files)
                setStatusSummary(calculateStatusSummary(files))
              })
            } else {
              logger.info('No files found for commit:', hashToUse)
              startTransition(() => {
                setChangedFiles([])
                setStatusSummary({})
              })
            }
          } catch (error) {
            logger.error('Error loading commit files:', error)
            startTransition(() => {
              setChangedFiles([])
              setStatusSummary({})
            })
          }
        } else {
          // SVN: dùng startTransition để ưu tiên hiển thị row selection trước, detail panel cập nhật sau
          startTransition(() => {
            setSelectedRevision(revision)
            setCommitMessage(entry.message)
            setChangedFiles(entry.changedFiles)
            setStatusSummary(calculateStatusSummary(entry.changedFiles))
          })
        }
      }
    },
    [allLogData, selectedRevision, calculateStatusSummary, effectiveVersionControlSystem]
  )

  const handleRefresh = useCallback(() => {
    const path = Array.isArray(filePath) ? filePath : filePath || '.'
    if (!filePath) setFilePath(path)
    if (loadLogDataRef.current) {
      void loadLogDataRef.current(path, { forceFetch: true })
    }
  }, [filePath])

  const reloadGitLogAfterRemoteSync = useCallback(async () => {
    const path = Array.isArray(filePath) ? filePath : filePath || '.'
    if (!path || !loadLogDataRef.current) return
    const preserveLogRevision = useShowLogSessionStore.getState().gitLogRevision
    lastShowLogFetchRef.current = null
    skipNextBranchReloadRef.current = true
    try {
      await loadLogDataRef.current(path, { gitLogRevision: preserveLogRevision, forceFetch: true })
      window.dispatchEvent(new CustomEvent('git-branch-changed'))
    } finally {
      skipNextBranchReloadRef.current = false
    }
  }, [filePath])

  const handleGitPull = useCallback(async () => {
    if (!effectiveSourceFolder || isGitPulling || isLoading || effectiveVersionControlSystem !== 'git') return
    setIsGitPulling(true)
    try {
      const statusResult = await window.api.git.status({ cwd: effectiveSourceFolder })
      if (statusResult.status !== 'success' || !statusResult.data) {
        toast.error(t('git.sync.pullError'))
        return
      }
      const currentBranch = statusResult.data.current?.trim() ?? ''
      const targetBranch = gitLogRevision?.trim() || currentBranch
      if (!targetBranch) {
        toast.error(t('git.sync.pullError'))
        return
      }
      if (currentBranch === targetBranch && isGitWorkingTreeDirty(statusResult.data)) {
        toast.error(t('git.cherryPickBranches.dirtyTree'))
        return
      }

      const result =
        currentBranch === targetBranch
          ? await window.api.git.pull('origin', targetBranch, undefined, effectiveSourceFolder)
          : await window.api.git.fetch_update_local_branch('origin', targetBranch, effectiveSourceFolder)

      if (result.status === 'success') {
        toast.success(t('git.sync.pullSuccess'))
        await reloadGitLogAfterRemoteSync()
      } else {
        toast.error(result.message || t('git.sync.pullError'))
      }
    } catch (error) {
      logger.error('ShowLog git pull error:', error)
      toast.error(t('git.sync.pullError'))
    } finally {
      setIsGitPulling(false)
    }
  }, [
    effectiveSourceFolder,
    effectiveVersionControlSystem,
    gitLogRevision,
    isGitPulling,
    isLoading,
    reloadGitLogAfterRemoteSync,
    t,
  ])

  const handleGitPush = useCallback(async () => {
    if (!effectiveSourceFolder || isGitPushing || isLoading || effectiveVersionControlSystem !== 'git') return
    setIsGitPushing(true)
    try {
      const statusResult = await window.api.git.status({ cwd: effectiveSourceFolder })
      if (statusResult.status !== 'success' || !statusResult.data) {
        toast.error(t('git.sync.pushError'))
        return
      }
      const currentBranch = statusResult.data.current?.trim() ?? ''
      const targetBranch = gitLogRevision?.trim() || currentBranch
      if (!targetBranch) {
        toast.error(t('git.sync.pushError'))
        return
      }
      if (currentBranch === targetBranch && isGitWorkingTreeDirty(statusResult.data)) {
        toast.error(t('git.cherryPickBranches.dirtyTree'))
        return
      }

      const result = await window.api.git.push('origin', targetBranch, undefined, effectiveSourceFolder, false)
      if (result.status === 'success') {
        toast.success(t('git.sync.pushSuccess'))
        await reloadGitLogAfterRemoteSync()
      } else {
        toast.error(result.message || t('git.sync.pushError'))
      }
    } catch (error) {
      logger.error('ShowLog git push error:', error)
      toast.error(t('git.sync.pushError'))
    } finally {
      setIsGitPushing(false)
    }
  }, [
    effectiveSourceFolder,
    effectiveVersionControlSystem,
    gitLogRevision,
    isGitPushing,
    isLoading,
    reloadGitLogAfterRemoteSync,
    t,
  ])

  useLayoutEffect(() => {
    if (!refreshRef) return
    refreshRef.current = handleRefresh
    return () => {
      refreshRef.current = null
    }
  }, [refreshRef, handleRefresh])

  useEffect(() => {
    onRefreshingChange?.(isLoading)
  }, [isLoading, onRefreshingChange])

  const handleGitLogRevisionChange = useCallback(
    (rev: string | null) => {
      setGitLogRevision(rev)
      const path = Array.isArray(filePath) ? filePath : filePath
      if (!path || !loadLogDataRef.current) return
      void loadLogDataRef.current(path, { gitLogRevision: rev })
    },
    [filePath, setGitLogRevision]
  )

  useEffect(() => {
    if (effectiveVersionControlSystem !== 'git') return

    const onBranchChanged = () => {
      if (skipNextBranchReloadRef.current) return
      const path = Array.isArray(filePath) ? filePath : filePath || '.'
      if (!path || !loadLogDataRef.current) return
      const preserveLogRevision = useShowLogSessionStore.getState().gitLogRevision
      void loadLogDataRef.current(path, { gitLogRevision: preserveLogRevision, forceFetch: true })
    }

    window.addEventListener('git-branch-changed', onBranchChanged)
    return () => window.removeEventListener('git-branch-changed', onBranchChanged)
  }, [effectiveVersionControlSystem, filePath])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F5' || (event.ctrlKey && event.key === 'r')) {
        event.preventDefault()
        handleRefresh()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleRefresh])

  const handleCherryPick = useCallback((entry: LogEntry) => {
    setCherryPickEntry(entry)
    setCherryPickConfirmOpen(true)
  }, [])

  const handleCherryPickConfirm = useCallback(async () => {
    const entry = cherryPickEntry
    if (!entry) return
    setCherryPickConfirmOpen(false)
    setCherryPickEntry(null)
    const commitHash = entry.fullCommitId || entry.revision
    try {
      const result = await window.api.git.cherry_pick(commitHash, effectiveSourceFolder || undefined)
      if (result.status === 'success') {
        toast.success(t('git.cherryPick.success'))
        handleRefresh()
        window.dispatchEvent(new CustomEvent('git-branch-changed'))
      } else if (result.status === 'conflict') {
        toast.warning(t('git.cherryPick.conflicts'))
        setShowGitConflictDialog(true)
      } else {
        toast.error(result.message || t('git.cherryPick.error'))
      }
    } catch (error) {
      logger.error('Cherry-pick error:', error)
      toast.error(t('git.cherryPick.error'))
    }
  }, [cherryPickEntry, effectiveSourceFolder, handleRefresh, t])

  const handleInteractiveRebase = useCallback((entry: LogEntry) => {
    const commitHash = entry.fullCommitId || entry.revision
    setInteractiveRebaseBaseRef(`${commitHash}^`)
    setShowInteractiveRebaseDialog(true)
  }, [])

  const handleReset = useCallback((entry: LogEntry, mode: 'soft' | 'mixed' | 'hard') => {
    setResetPending({ entry, mode })
    setResetConfirmOpen(true)
  }, [])

  const handleResetConfirm = useCallback(async () => {
    const pending = resetPending
    if (!pending) return
    setResetConfirmOpen(false)
    setResetPending(null)
    const { entry, mode } = pending
    const commitHash = entry.fullCommitId || entry.revision
    try {
      const result = await window.api.git.reset(commitHash, mode, effectiveSourceFolder || undefined)
      if (result.status === 'success') {
        toast.success(t('git.reset.success'))
        handleRefresh()
        window.dispatchEvent(new CustomEvent('git-branch-changed'))
      } else {
        toast.error(result.message || t('git.reset.error'))
      }
    } catch (error) {
      logger.error('Reset error:', error)
      toast.error(t('git.reset.error'))
    }
  }, [effectiveSourceFolder, handleRefresh, resetPending, t])

  const handleFileClick = useCallback(
    async (file: LogFile) => {
      try {
        if (effectiveVersionControlSystem === 'git') {
          if (selectedRevision) {
            const selectedEntry = allLogData.find(entry => entry.revision === selectedRevision)
            if (selectedEntry) {
              const hashToUse = selectedEntry.fullCommitId || selectedRevision
              const opts = effectiveSourceFolder ? { cwd: effectiveSourceFolder } : undefined
              const parentHash = await window.api.git.getParentCommit(hashToUse, opts)
              openGitHistoryDiff({
                filePath: file.filePath,
                fileStatus: file.action,
                commitHash: hashToUse,
                currentCommitHash: parentHash ?? undefined,
                isRootCommit: !parentHash,
                cwd: effectiveSourceFolder ?? undefined,
                files: changedFiles,
                currentFileIndex: changedFiles.findIndex(f => f.filePath === file.filePath),
              })
            } else {
              toast.error('Could not find selected commit')
            }
          } else {
            toast.info('Select a commit to view diff')
          }
        } else {
          if (selectedRevision) {
            openSvnRevisionDiff({
              filePath: file.filePath,
              fileStatus: file.action,
              revision: selectedRevision,
              currentRevision: currentRevision,
              cwd: effectiveSourceFolder ?? undefined,
              files: changedFiles,
              currentFileIndex: changedFiles.findIndex(f => f.filePath === file.filePath),
            })
          } else {
            openSvnWorkingDiff({
              filePath: file.filePath,
              fileStatus: file.action ?? '',
              cwd: effectiveSourceFolder ?? undefined,
              svnTargetPath: effectiveSourceFolder ?? undefined,
            })
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        toast.error(errorMessage)
      }
    },
    [effectiveVersionControlSystem, selectedRevision, allLogData, currentRevision, effectiveSourceFolder, changedFiles]
  )

  useEffect(() => {
    if (!pendingOpenPayload?.autoLoad) return
    applyOpenPayload(pendingOpenPayload, setWindowContext, setFilePath, setCurrentRevision, () => {
      setAllLogData([])
      setFilteredLogData([])
      setTotalEntriesFromBackend(0)
    })
    const path =
      typeof pendingOpenPayload === 'string'
        ? pendingOpenPayload
        : pendingOpenPayload.path || '.'
    if (loadLogDataRef.current) {
      void loadLogDataRef.current(path, { forceFetch: true })
    }
    onPendingOpenPayloadConsumed?.()
  }, [pendingOpenPayload, onPendingOpenPayloadConsumed])

  useEffect(() => {
    const handler = (_event: unknown, data: ShowLogOpenPayload | Record<string, unknown>) => {
      applyOpenPayload(data, setWindowContext, setFilePath, setCurrentRevision, () => {
        setAllLogData([])
        setFilteredLogData([])
        setTotalEntriesFromBackend(0)
      })
    }

    window.api.on('load-diff-data', handler)

    if (!embedded) {
      window.api.electron.send(IPC.WINDOW.REQUEST_DIFF_DATA)
    }

    return () => {
      window.api.removeListener('load-diff-data', handler)
    }
  }, [embedded])

  useEffect(() => {
    const handleConfigurationChange = async (event: CustomEvent) => {
      if (event.detail?.type === 'configuration' && !windowContext) {
        if (event.detail?.clearData) {
          logger.info('Clearing data - folder is not a valid Git/SVN repository')
          setAllLogData([])
          setFilteredLogData([])
          setTotalEntriesFromBackend(0)
          setCommitMessage('')
          setChangedFiles([])
          setStatusSummary({})
          setSelectedRevision(null)
          return
        }
        logger.info('Configuration changed in ShowLog, reloading configuration...')
        await loadConfigurationConfig()
        const state = useConfigurationStore.getState()
        const newSnapshot = getConfigDataRelevantSnapshot(state)
        if (dataSnapshotRef.current !== null && dataSnapshotRef.current === newSnapshot) {
          return
        }
        dataSnapshotRef.current = newSnapshot
        logger.info('Configuration reloaded, versionControlSystem:', state.versionControlSystem)
        // Embedded: clear log via context effect; user refreshes manually (F5 / TitleBar).
        if (embedded) return
        if (filePath && loadLogDataRef.current) {
          logger.info('Reloading log data with new configuration...')
          loadLogDataRef.current(filePath)
        }
      }
    }

    window.addEventListener('configuration-changed', handleConfigurationChange as unknown as EventListener)
    return () => {
      window.removeEventListener('configuration-changed', handleConfigurationChange as unknown as EventListener)
    }
  }, [embedded, filePath, windowContext, loadConfigurationConfig])

  useEffect(() => {
    if (allLogData.length > 0) {
      const topRevision = allLogData[0].revision
      setRowSelection({ [topRevision]: true })
      selectRevision(topRevision)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi allLogData thay đổi (load mới), không phụ thuộc selectRevision
  }, [allLogData])

  // Filter effect: debounced search via useDeferredValue; virtual table renders full filtered list
  useEffect(() => {
    let filtered = allLogData
    if (deferredSearchTerm.trim()) {
      const lowerSearchTerm = deferredSearchTerm.toLowerCase()
      filtered = allLogData.filter(
        entry =>
          entry.revision.toLowerCase().includes(lowerSearchTerm) ||
          entry.author.toLowerCase().includes(lowerSearchTerm) ||
          (entry.email?.toLowerCase().includes(lowerSearchTerm) ?? false) ||
          entry.message.toLowerCase().includes(lowerSearchTerm) ||
          entry.date.toLowerCase().includes(lowerSearchTerm)
      )
    }

    startTransition(() => {
      setFilteredLogData(filtered)
    })

    if (filtered.length > 0) {
      const sel = selectedRevisionRef.current
      const isSelectedRowVisible = sel && filtered.some(entry => entry.revision === sel)

      if (!sel || !isSelectedRowVisible) {
        const firstRevision = filtered[0].revision
        setRowSelection({ [firstRevision]: true })
        selectRevision(firstRevision)
      }
    } else {
      setCommitMessage('')
      setChangedFiles([])
      setStatusSummary({} as Record<SvnStatusCode, number>)
      setSelectedRevision(null)
      selectedRevisionRef.current = null
      setRowSelection({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedRevision excluded to avoid re-run on row click
  }, [allLogData, deferredSearchTerm, selectRevision, effectiveVersionControlSystem])

  const toolbar = (
    <ShowlogToolbar
      filePath={displayFilePath}
      isLoading={isLoading}
      onToggleLayout={() => setLayoutDirection(prev => (prev === 'horizontal' ? 'vertical' : 'horizontal'))}
      versionControlSystem={effectiveVersionControlSystem}
      contextSourceFolder={effectiveSourceFolder || undefined}
      onFolderChange={embedded ? undefined : handleFolderChange}
      gitLogRevision={effectiveVersionControlSystem === 'git' ? gitLogRevision : null}
      onGitLogRevisionChange={embedded ? undefined : handleGitLogRevisionChange}
      embedded={embedded}
      onStandaloneDock={!embedded && canOpenShowLogEmbedded() ? handleStandaloneDock : undefined}
    />
  )

  const logTableFilterProps = {
    ...(effectiveVersionControlSystem !== 'git' ? { dateRange, setDateRange } : {}),
    onRefresh: handleRefresh,
    onOpenStatistic: () => setIsStatisticOpen(true),
    onOpenAIAnalysis: () => setIsAIAnalysisOpen(true),
    onOpenAnalysisHistory: () => setShowHistoryDialog(true),
    ...(effectiveVersionControlSystem === 'git'
      ? {
          hasMoreGitLog,
          isLoadingMore,
          onLoadMore: loadMoreGitLog,
          loadedGitLogCount: allLogData.length,
          onGitPull: handleGitPull,
          isGitPulling,
          onGitPush: handleGitPush,
          isGitPushing,
          outgoingCommitCount,
        }
      : {}),
  }

  return (
    <div className={cn('flex w-full', embedded ? 'h-full min-h-0' : 'h-screen')}>
      {/* Dialogs */}
      <StatisticDialog
        data={allLogData}
        isOpen={isStatisticOpen}
        onOpenChange={setIsStatisticOpen}
        filePath={displayFilePath as string}
        sourceFolderPath={effectiveSourceFolder || undefined}
        dateRange={dateRange}
        versionControlSystem={effectiveVersionControlSystem}
      />
      <AIAnalysisDialog data={allLogData} isOpen={isAIAnalysisOpen} onOpenChange={setIsAIAnalysisOpen} filePath={displayFilePath as string} dateRange={dateRange} />
      <AIAnalysisHistoryDialog isOpen={showHistoryDialog} onOpenChange={setShowHistoryDialog} />
      {effectiveVersionControlSystem === 'git' && <GitConflictDialog open={showGitConflictDialog} onOpenChange={setShowGitConflictDialog} onResolved={() => handleRefresh()} />}
      {effectiveVersionControlSystem === 'git' && (
        <GitInteractiveRebaseDialog
          open={showInteractiveRebaseDialog}
          onOpenChange={setShowInteractiveRebaseDialog}
          baseRef={interactiveRebaseBaseRef || 'HEAD~10'}
          onComplete={() => handleRefresh()}
        />
      )}

      <AlertDialog
        open={cherryPickConfirmOpen}
        onOpenChange={open => {
          setCherryPickConfirmOpen(open)
          if (!open) setCherryPickEntry(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('git.cherryPick.title', 'Cherry-pick')}</AlertDialogTitle>
            <AlertDialogDescription>{t('git.cherryPick.confirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCherryPickConfirm}>{t('common.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={resetConfirmOpen}
        onOpenChange={open => {
          setResetConfirmOpen(open)
          if (!open) setResetPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('git.reset.title', 'Reset')}</AlertDialogTitle>
            <AlertDialogDescription>
              {resetPending
                ? resetPending.mode === 'soft'
                  ? t('git.reset.confirmSoft')
                  : resetPending.mode === 'mixed'
                    ? t('git.reset.confirmMixed')
                    : t('git.reset.confirmHard')
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col flex-1 w-full min-h-0">
        {embedded && portal.host ? createPortal(toolbar, portal.host) : null}
        {!embedded ? toolbar : null}
        {!isConfigLoaded ? (
          <div className="flex items-center justify-center h-full">
            <GlowLoader className="w-10 h-10" />
          </div>
        ) : (
          <div className="relative flex-1 h-full flex flex-col overflow-hidden border-t p-3">
            {isLoading ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70">
                <GlowLoader className="w-10 h-10" />
              </div>
            ) : null}
            {layoutDirection === 'horizontal' ? (
              <ResizablePanelGroup
                groupRef={outerPanelGroupRef}
                orientation="horizontal"
                className="flex-1 min-h-0"
                defaultLayout={{
                  [SHOWLOG_PANEL_MAIN_ID]: panelSizes.mainPanelSize,
                  [SHOWLOG_PANEL_SECOND_ID]: panelSizes.secondPanelSize,
                }}
                onLayoutChanged={layout => {
                  const main = layout[SHOWLOG_PANEL_MAIN_ID]
                  const second = layout[SHOWLOG_PANEL_SECOND_ID]
                  if (typeof main !== 'number' || typeof second !== 'number') return
                  persistPanelSizes({ mainPanelSize: main, secondPanelSize: second })
                }}
              >
                <ResizablePanel id={SHOWLOG_PANEL_MAIN_ID} defaultSize={panelSizes.mainPanelSize} minSize={30} className="h-full">
                  <div className="h-full pr-2 flex flex-col overflow-scroll pb-0!">
                    <div className="flex flex-col h-full">
                      <ShowLogTableSection
                        filteredLogData={filteredLogData}
                        columns={columns}
                        rowSelection={rowSelection}
                        setRowSelection={setRowSelection}
                        selectRevision={selectRevision}
                        currentRevision={currentRevision}
                        sorting={sorting}
                        setSorting={setSorting}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        isLoading={isLoading}
                        totalEntriesFromBackend={totalEntriesFromBackend}
                        variant={variant}
                        versionControlSystem={effectiveVersionControlSystem}
                        headCommitId={effectiveVersionControlSystem === 'git' ? allLogData[0]?.fullCommitId : undefined}
                        onCherryPick={handleCherryPick}
                        onReset={handleReset}
                        onInteractiveRebase={effectiveVersionControlSystem === 'git' ? handleInteractiveRebase : undefined}
                        logSyncUpstream={logSyncUpstream}
                        logSyncCompareRef={logSyncCompareRef}
                        logSyncUpstreamSource={logSyncUpstreamSource}
                        incomingCommitCount={incomingCommitCount}
                        outgoingCommitCount={outgoingCommitCount}
                        {...logTableFilterProps}
                      />
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle showGrip={false} className="bg-transparent" />

                <ResizablePanel id={SHOWLOG_PANEL_SECOND_ID} defaultSize={panelSizes.secondPanelSize} minSize={layoutDirection === 'horizontal' ? 30 : 40} className="h-full w-full">
                  <ResizablePanelGroup
                    groupRef={innerPanelGroupRef}
                    orientation="vertical"
                    className="h-full"
                    defaultLayout={{
                      [SHOWLOG_PANEL_COMMIT_ID]: panelSizes.commitPanelSize,
                      [SHOWLOG_PANEL_FILES_ID]: panelSizes.filesPanelSize,
                    }}
                    onLayoutChanged={layout => {
                      const commit = layout[SHOWLOG_PANEL_COMMIT_ID]
                      const files = layout[SHOWLOG_PANEL_FILES_ID]
                      if (typeof commit !== 'number' || typeof files !== 'number') return
                      persistPanelSizes({ commitPanelSize: commit, filesPanelSize: files })
                    }}
                  >
                    <ResizablePanel id={SHOWLOG_PANEL_COMMIT_ID} defaultSize={panelSizes.commitPanelSize} minSize={20} className="flex flex-col min-h-0">
                      <TranslatePanel
                        text={commitMessage}
                        readOnly
                        variant="inline"
                        title={t('dialog.showLogs.commitMessage')}
                        className="flex-1 min-h-0 flex flex-col"
                        renderContent={displayText => (
                          <div className="h-full flex-1 min-h-0">
                            <div className="w-full h-full overflow-auto resize-none border-1 rounded-md p-2 min-h-0 cursor-default break-all relative focus-visible:ring-0 !shadow-none focus-visible:border-color">
                              <MessageWithRedmineLinks text={displayText} className="text-sm block w-full cursor-default break-words" />
                            </div>
                          </div>
                        )}
                      />
                    </ResizablePanel>

                    <ResizableHandle showGrip={false} className="bg-transparent" />

                    <ResizablePanel id={SHOWLOG_PANEL_FILES_ID} defaultSize={panelSizes.filesPanelSize} minSize={20} className="flex flex-col">
                      <div className="py-2 font-medium flex justify-between items-center">
                        <span>{t('dialog.showLogs.changedFiles')}</span>
                        <div className="flex items-center gap-2">
                          <StatusSummary statusSummary={statusSummary} />
                        </div>
                      </div>
                      <div className="h-full overflow-auto border-1 rounded-md">
                        <ScrollArea className="h-full">
                          <Table wrapperClassName={cn('overflow-clip', changedFiles.length === 0 && 'h-full')}>
                            <TableHeader sticky>
                              <TableRow>
                                <TableHead className="w-8 min-w-8 shrink-0 h-9!">{t('dialog.showLogs.action')}</TableHead>
                                <TableHead className="h-9!">{t('dialog.showLogs.path')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody className={changedFiles.length === 0 ? 'h-full' : ''}>
                              {changedFiles.length > 0 ? (
                                changedFiles.map((file, index) => (
                                  <TableRow key={index}>
                                    <TableCell className="p-0 h-6 px-2">
                                      <StatusIcon code={file.action} />
                                    </TableCell>
                                    <TableCell className="p-0 h-6 px-2 cursor-pointer break-words whitespace-normal" onClick={() => handleFileClick(file)}>
                                      {file.filePath}
                                    </TableCell>
                                  </TableRow>
                                ))
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={2} className="text-center py-4">
                                    {selectedRevision ? 'No files changed in this revision' : 'Select a revision to view changed files'}
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                          <ScrollBar orientation="vertical" />
                          <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              <ResizablePanelGroup
                groupRef={outerPanelGroupRef}
                orientation="vertical"
                className="flex-1 min-h-0"
                defaultLayout={{
                  [SHOWLOG_PANEL_MAIN_ID]: panelSizes.mainPanelSize,
                  [SHOWLOG_PANEL_SECOND_ID]: panelSizes.secondPanelSize,
                }}
                onLayoutChanged={layout => {
                  const main = layout[SHOWLOG_PANEL_MAIN_ID]
                  const second = layout[SHOWLOG_PANEL_SECOND_ID]
                  if (typeof main !== 'number' || typeof second !== 'number') return
                  persistPanelSizes({ mainPanelSize: main, secondPanelSize: second })
                }}
              >
                <ResizablePanel id={SHOWLOG_PANEL_MAIN_ID} defaultSize={panelSizes.mainPanelSize} minSize={20} className="w-full">
                  <div className="h-full pb-2">
                    <div className="flex flex-col h-full">
                      <ShowLogTableSection
                        filteredLogData={filteredLogData}
                        columns={columns}
                        rowSelection={rowSelection}
                        setRowSelection={setRowSelection}
                        selectRevision={selectRevision}
                        currentRevision={currentRevision}
                        sorting={sorting}
                        setSorting={setSorting}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        isLoading={isLoading}
                        totalEntriesFromBackend={totalEntriesFromBackend}
                        variant={variant}
                        versionControlSystem={effectiveVersionControlSystem}
                        headCommitId={effectiveVersionControlSystem === 'git' ? allLogData[0]?.fullCommitId : undefined}
                        onCherryPick={handleCherryPick}
                        onReset={handleReset}
                        onInteractiveRebase={effectiveVersionControlSystem === 'git' ? handleInteractiveRebase : undefined}
                        logSyncUpstream={logSyncUpstream}
                        logSyncCompareRef={logSyncCompareRef}
                        logSyncUpstreamSource={logSyncUpstreamSource}
                        incomingCommitCount={incomingCommitCount}
                        outgoingCommitCount={outgoingCommitCount}
                        {...logTableFilterProps}
                      />
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle showGrip={false} className="bg-transparent" />

                <ResizablePanel id={SHOWLOG_PANEL_SECOND_ID} defaultSize={panelSizes.secondPanelSize} minSize={40} className="w-full">
                  <ResizablePanelGroup
                    groupRef={innerPanelGroupRef}
                    orientation="horizontal"
                    className="h-full"
                    defaultLayout={{
                      [SHOWLOG_PANEL_COMMIT_ID]: panelSizes.commitPanelSize,
                      [SHOWLOG_PANEL_FILES_ID]: panelSizes.filesPanelSize,
                    }}
                    onLayoutChanged={layout => {
                      const commit = layout[SHOWLOG_PANEL_COMMIT_ID]
                      const files = layout[SHOWLOG_PANEL_FILES_ID]
                      if (typeof commit !== 'number' || typeof files !== 'number') return
                      persistPanelSizes({ commitPanelSize: commit, filesPanelSize: files })
                    }}
                  >
                    <ResizablePanel id={SHOWLOG_PANEL_COMMIT_ID} defaultSize={panelSizes.commitPanelSize} minSize={20} className="pr-2 flex flex-col min-h-0">
                      <TranslatePanel
                        text={commitMessage}
                        readOnly
                        variant="inline"
                        title={t('dialog.showLogs.commitMessage')}
                        className="flex-1 min-h-0 flex flex-col"
                        renderContent={displayText => (
                          <div className="h-full overflow-auto flex-1 min-h-0">
                            <div className="w-full h-full resize-none border-1 rounded-md p-2 min-h-0 cursor-default break-all relative focus-visible:ring-0 !shadow-none focus-visible:border-color">
                              <MessageWithRedmineLinks text={displayText} className="text-sm block w-full cursor-default break-words" />
                            </div>
                          </div>
                        )}
                      />
                    </ResizablePanel>

                    <ResizableHandle showGrip={false} className="bg-transparent" />

                    <ResizablePanel id={SHOWLOG_PANEL_FILES_ID} defaultSize={panelSizes.filesPanelSize} minSize={20} className="flex flex-col pl-2">
                      <div className="py-2 font-medium flex justify-between items-center">
                        <span>{t('dialog.showLogs.changedFiles')}</span>
                        <div className="flex items-center gap-2">
                          <StatusSummary statusSummary={statusSummary} />
                        </div>
                      </div>
                      <div className="h-full overflow-auto border-1 rounded-md">
                        <ScrollArea className="h-full">
                          <Table wrapperClassName={cn('overflow-clip', changedFiles.length === 0 && 'h-full')}>
                            <TableHeader sticky>
                              <TableRow>
                                <TableHead className="w-8 min-w-8 shrink-0 h-9!">{t('dialog.showLogs.action')}</TableHead>
                                <TableHead className="h-9!">{t('dialog.showLogs.path')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody className={changedFiles.length === 0 ? 'h-full' : ''}>
                              {changedFiles.length > 0 ? (
                                changedFiles.map((file, index) => (
                                  <TableRow key={index}>
                                    <TableCell className="p-0 h-6 px-2">
                                      <StatusIcon code={file.action} />
                                    </TableCell>
                                    <TableCell className="p-0 h-6 px-2 cursor-pointer break-words whitespace-normal" onClick={() => handleFileClick(file)}>
                                      {file.filePath}
                                    </TableCell>
                                  </TableRow>
                                ))
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={2} className="text-center py-4">
                                    {selectedRevision ? 'No files changed in this revision' : 'Select a revision to view changed files'}
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                          <ScrollBar orientation="vertical" />
                          <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
