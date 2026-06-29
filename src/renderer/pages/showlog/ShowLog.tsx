'use client'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import chalk from 'chalk'
import { IPC } from 'main/constants'
import { forwardRef, memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import type { DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from 'shared/utils'
import { GitConflictDialog } from '@/components/dialogs/git/GitConflictDialog'
import { GitInteractiveRebaseDialog } from '@/components/dialogs/git/GitInteractiveRebaseDialog'
import { AIAnalysisDialog } from '@/components/dialogs/showlog/AIAnalysisDialog'
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
import i18n from '@/lib/i18n'
import { openGitHistoryDiff, openSvnRevisionDiff, openSvnWorkingDiff } from '@/lib/diffViewer/openDiffViewer'
import { cn } from '@/lib/utils'
import { buildShowLogOpenPayload, canOpenShowLogEmbedded, type ShowLogOpenPayload } from '@/lib/openShowLog'
import { useShowLogToolbarPortalTarget } from '@/pages/main/ShowLogToolbarPortalContext'
import logger from '@/services/logger'
import { useButtonVariant } from '@/stores/useAppearanceStore'
import { getConfigDataRelevantSnapshot, useConfigurationStore } from '@/stores/useConfigurationStore'
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
  action: string[]
  changedFiles: LogFile[]
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

export default function ShowLog({ mode = 'standalone', pendingOpenPayload, handoffGetterRef }: ShowLogProps) {
  const embedded = mode === 'embedded'
  const portal = useShowLogToolbarPortalTarget()
  const { t } = useTranslation()
  const variant = useButtonVariant()
  const { versionControlSystem, loadConfigurationConfig, isConfigLoaded, sourceFolder } = useConfigurationStore()
  const [windowContext, setWindowContext] = useState<ShowLogWindowContext | null>(null)
  const [layoutDirection, setLayoutDirection] = useState<'horizontal' | 'vertical'>('horizontal')
  /** Git: hiển thị log theo ref này (không checkout). null = mặc định theo HEAD hiện tại. */
  const [gitLogRevision, setGitLogRevision] = useState<string | null>(null)

  const effectiveSourceFolder = windowContext?.sourceFolder ?? sourceFolder
  const effectiveVersionControlSystem = windowContext?.versionControlSystem ?? versionControlSystem
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
  const [showGitConflictDialog, setShowGitConflictDialog] = useState(false)
  const [showInteractiveRebaseDialog, setShowInteractiveRebaseDialog] = useState(false)
  const [interactiveRebaseBaseRef, setInteractiveRebaseBaseRef] = useState<string>('')
  const [cherryPickConfirmOpen, setCherryPickConfirmOpen] = useState(false)
  const [cherryPickEntry, setCherryPickEntry] = useState<LogEntry | null>(null)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [resetPending, setResetPending] = useState<{ entry: LogEntry; mode: 'soft' | 'mixed' | 'hard' } | null>(null)

  const [panelSizes, setPanelSizes] = useState<ShowlogPanelSizes>({
    mainPanelSize: 50,
    secondPanelSize: 50,
    commitPanelSize: 50,
    filesPanelSize: 50,
  })

  const mainPanelRef = useRef<any>(null)
  const secondPanelRef = useRef<any>(null)
  const commitPanelRef = useRef<any>(null)
  const filesPanelRef = useRef<any>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})

  const [allLogData, setAllLogData] = useState<LogEntry[]>([])
  const [filteredLogData, setFilteredLogData] = useState<LogEntry[]>([])
  const [dataForCurrentPage, setDataForCurrentPage] = useState<LogEntry[]>([])
  const [totalEntriesFromBackend, setTotalEntriesFromBackend] = useState(0)

  // Refs to avoid "before initialization" errors
  const loadLogDataRef = useRef<((path: string | string[], override?: { cwd?: string; versionControlSystem?: 'git' | 'svn' }) => Promise<void>) | null>(null)
  const dataSnapshotRef = useRef<string | null>(null)
  const lastLoadKeyRef = useRef<{ key: string; timestamp: number }>({ key: '', timestamp: 0 })
  const lastErrorToastRef = useRef<{ message: string; timestamp: number }>({ message: '', timestamp: 0 })

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

  // Load configuration when component mounts
  useEffect(() => {
    loadConfigurationConfig().catch(error => {
      logger.error('Error loading configuration in ShowLog:', error)
    })
  }, [loadConfigurationConfig])

  const loadLogData = useCallback(
    async (path: string | string[], override?: { cwd?: string; versionControlSystem?: 'git' | 'svn' }) => {
      try {
        const language = i18n.language
        const useCwd = override?.cwd ?? windowContext?.sourceFolder
        const useVcs = override?.versionControlSystem ?? effectiveVersionControlSystem

        setCommitMessage('')
        setChangedFiles([])
        setStatusSummary({} as Record<SvnStatusCode, number>)
        setIsLoading(true)
        setAllLogData([])
        setFilteredLogData([])
        setDataForCurrentPage([])
        setTotalEntriesFromBackend(0)
        setCurrentPage(1)

        const options: any = {}
        if (dateRange?.from) {
          options.dateFrom = dateRange.from.toISOString()
          if (dateRange.to) {
            options.dateTo = dateRange.to.toISOString()
          }
        }
        if (useCwd) {
          options.cwd = useCwd
        }
        if (useVcs === 'git' && gitLogRevision) {
          options.revision = gitLogRevision
        }

        let result: any

        if (useVcs === 'git') {
          result = await window.api.git.log(path, options)
        } else {
          result = await window.api.svn.log(path, options)
        }

        if (result.status === 'success') {
          const sourceFolderPrefix = result.sourceFolderPrefix
          const backendTotal = result.totalEntries ?? 0
          setTotalEntriesFromBackend(backendTotal)

          let parsedEntries: LogEntry[] = []

          if (useVcs === 'git') {
            const gitLogData = JSON.parse(result.data as string) as GitLogEntry[]
            if (gitLogData.length > 0) {
              const firstEntry = gitLogData[0]
              logger.info('First Git log entry:')
              logger.info('  Hash:', firstEntry.hash?.substring(0, 8))
              logger.info('  Subject:', firstEntry.subject)
              logger.info('  Body length:', firstEntry.body?.length || 0)
              logger.info('  Body preview:', firstEntry.body?.substring(0, 100))
            }

            parsedEntries = gitLogData.map(entry => {
              const originalDate = new Date(entry.date)
              const fullMessage = entry.body ? `${entry.subject}\n\n${entry.body}`.trim() : entry.subject
              const actions = new Set<string>()
              if (entry.files && entry.files.length > 0) {
                for (const file of entry.files) {
                  actions.add(file.status)
                }
              }

              return {
                revision: entry.hash.substring(0, 8), // Use short hash
                fullCommitId: entry.hash,
                author: entry.author,
                email: entry.authorEmail,
                date: formatDateTime(originalDate, language),
                isoDate: originalDate.toISOString(),
                message: fullMessage,
                referenceId: entry.subject,
                action: Array.from(actions),
                changedFiles:
                  entry.files?.map(file => ({
                    action: file.status as SvnStatusCode | GitStatusCode,
                    filePath: file.file,
                  })) || [],
              }
            })

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
                  action: Array.from(new Set(changedFiles.map(f => f.action))),
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

          // Set all state in one batch to avoid extra render cycle - UI shows data immediately
          setAllLogData(finalEntries)
          setFilteredLogData(finalEntries)
          setDataForCurrentPage(finalEntries.slice(0, pageSize))

          if (result.suggestedStartDate) {
            const suggestedDate = new Date(result.suggestedStartDate)
            if (dateRange?.from?.getTime() !== suggestedDate.getTime()) {
              setDateRange(prevRange => ({
                from: suggestedDate,
                to: prevRange?.to,
              }))
            }
          } else if (parsedEntries.length > 0 && !dateRange?.from) {
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
          setAllLogData([])
          setFilteredLogData([])
          setDataForCurrentPage([])
          setTotalEntriesFromBackend(0)
        }
      } catch (_error) {
        const msg = 'Error loading log data'
        const now = Date.now()
        if (now - lastErrorToastRef.current.timestamp > 500 || lastErrorToastRef.current.message !== msg) {
          lastErrorToastRef.current = { message: msg, timestamp: now }
          toast.error(msg)
        }
        setAllLogData([])
        setFilteredLogData([])
        setDataForCurrentPage([])
        setTotalEntriesFromBackend(0)
      } finally {
        setIsLoading(false)
      }
    },
    [effectiveVersionControlSystem, dateRange, loadConfigurationConfig, windowContext, gitLogRevision]
  )

  // Assign loadLogData to ref after it's declared
  loadLogDataRef.current = loadLogData

  const handleFolderChange = useCallback(
    (sourceFolder: string, vcs: 'git' | 'svn') => {
      setGitLogRevision(null)
      setWindowContext({ sourceFolder, versionControlSystem: vcs })
      if (loadLogDataRef.current) {
        const path = Array.isArray(filePath) ? filePath : filePath || '.'
        loadLogDataRef.current(path, { cwd: sourceFolder, versionControlSystem: vcs })
      }
    },
    [filePath]
  )

  // Load log data khi filePath/config/vcs thay đổi - CHỈ MỘT useEffect để tránh gọi svn.log 2 lần
  useEffect(() => {
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

    setCurrentPage(1)
    setAllLogData([])
    setFilteredLogData([])
    setDataForCurrentPage([])
    setTotalEntriesFromBackend(0)
    loadLogDataRef.current(filePath)
  }, [effectiveVersionControlSystem, filePath, isConfigLoaded, windowContext, effectiveSourceFolder, gitLogRevision])

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
        cell: ({ row }) => <div>{row.getValue('revision')}</div>,
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
        accessorKey: 'action',
        size: 200,
        minSize: 200,
        header: ({ column }) => {
          return (
            <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
              {t('dialog.showLogs.action')}
              <span className="pr-0.5">
                {!column.getIsSorted()}
                {column.getIsSorted() === 'asc' && '↑'}
                {column.getIsSorted() === 'desc' && '↓'}
              </span>
            </Button>
          )
        },
        cell: ({ row }) => {
          const actions: (SvnStatusCode | GitStatusCode)[] = row.getValue('action')
          const changedFiles: LogFile[] = row.original.changedFiles || []

          // Count files by action
          const actionCounts = new Map<string, number>()
          for (const file of changedFiles) {
            const count = actionCounts.get(file.action) || 0
            actionCounts.set(file.action, count + 1)
          }

          return (
            <div className="flex gap-1.5 flex-nowrap">
              {actions.map(code => {
                const count = actionCounts.get(code) || 0
                return (
                  <div className="relative group flex items-center gap-0.5" key={code}>
                    <StatusIcon code={code} />
                    {count > 0 && <span className="text-xs text-muted-foreground">({count})</span>}
                  </div>
                )
              })}
            </div>
          )
        },
      },
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
    [t, effectiveVersionControlSystem]
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
    if (filePath && loadLogDataRef.current) {
      loadLogDataRef.current(filePath)
    }
  }, [filePath])

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

  const totalPages = useMemo(() => {
    if (filteredLogData.length <= 0 || pageSize <= 0) return 1
    const pages = Math.ceil(filteredLogData.length / pageSize)
    return pages
  }, [filteredLogData, pageSize])

  const handlePageChange = useCallback(
    (newPage: number) => {
      const p = Math.min(Math.max(1, Math.floor(newPage)), totalPages)
      if (p !== currentPage) setCurrentPage(p)
    },
    [currentPage, totalPages]
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [pageSize])

  useEffect(() => {
    if (!pendingOpenPayload) return
    applyOpenPayload(
      pendingOpenPayload,
      setWindowContext,
      setFilePath,
      setCurrentRevision,
      () => {
        setCurrentPage(1)
        setAllLogData([])
        setFilteredLogData([])
        setDataForCurrentPage([])
        setTotalEntriesFromBackend(0)
      }
    )
  }, [pendingOpenPayload])

  useEffect(() => {
    const handler = (_event: unknown, data: ShowLogOpenPayload | Record<string, unknown>) => {
      applyOpenPayload(data, setWindowContext, setFilePath, setCurrentRevision, () => {
        setCurrentPage(1)
        setAllLogData([])
        setFilteredLogData([])
        setDataForCurrentPage([])
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
          setDataForCurrentPage([])
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
  }, [filePath, windowContext, loadConfigurationConfig])

  useEffect(() => {
    try {
      const savedPanelSizes = localStorage.getItem(SHOWLOG_PANEL_SIZES_KEY)
      if (savedPanelSizes) {
        const sizes: ShowlogPanelSizes = JSON.parse(savedPanelSizes)
        setPanelSizes(sizes)
        setTimeout(() => {
          if (mainPanelRef.current?.resize) mainPanelRef.current.resize(sizes.mainPanelSize)
          if (secondPanelRef.current?.resize) secondPanelRef.current.resize(sizes.secondPanelSize)
          if (commitPanelRef.current?.resize) commitPanelRef.current.resize(sizes.commitPanelSize)
          if (filesPanelRef.current?.resize) filesPanelRef.current.resize(sizes.filesPanelSize)
        }, 0)
      }
    } catch (error) {
      logger.error('Lỗi khi đọc kích thước panel từ localStorage:', error)
    }
  }, [])

  const panelResizeDebounceRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; pending: Partial<ShowlogPanelSizes> }>({ timer: null, pending: {} })
  const panelSizesRef = useRef(panelSizes)
  panelSizesRef.current = panelSizes

  useEffect(() => {
    try {
      localStorage.setItem(SHOWLOG_PANEL_SIZES_KEY, JSON.stringify(panelSizes))
    } catch (error) {
      logger.error('Lỗi khi lưu kích thước panel vào localStorage:', error)
    }
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
  const handlePanelResize = useCallback((panelName: keyof ShowlogPanelSizes, size: number) => {
    const ref = panelResizeDebounceRef.current
    ref.pending[panelName] = size
    if (ref.timer) clearTimeout(ref.timer)
    ref.timer = setTimeout(() => {
      setPanelSizes(prev => ({ ...prev, ...ref.pending }))
      ref.pending = {}
      ref.timer = null
    }, 150)
  }, [])

  useEffect(() => {
    if (allLogData.length > 0) {
      const topRevision = allLogData[0].revision
      setRowSelection({ [topRevision]: true })
      selectRevision(topRevision)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi allLogData thay đổi (load mới), không phụ thuộc selectRevision
  }, [allLogData])

  // Filter effect: chỉ chạy khi filter inputs thay đổi, không phụ thuộc selectedRevision để tránh re-render không cần thiết khi click row
  useEffect(() => {
    let filtered = allLogData
    if (searchTerm.trim()) {
      const lowerSearchTerm = searchTerm.toLowerCase()
      filtered = allLogData.filter(
        entry =>
          entry.revision.toLowerCase().includes(lowerSearchTerm) ||
          entry.author.toLowerCase().includes(lowerSearchTerm) ||
          (entry.email?.toLowerCase().includes(lowerSearchTerm) ?? false) ||
          entry.message.toLowerCase().includes(lowerSearchTerm) ||
          entry.date.toLowerCase().includes(lowerSearchTerm)
      )
    }
    setFilteredLogData(filtered)

    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    const currentPageData = filtered.slice(startIndex, endIndex)
    setDataForCurrentPage(currentPageData)

    if (currentPageData.length > 0) {
      const isSelectedRowVisible = selectedRevision && currentPageData.some(entry => entry.revision === selectedRevision)

      if (!selectedRevision || !isSelectedRowVisible) {
        setRowSelection({ [currentPageData[0].revision]: true })
        selectRevision(currentPageData[0].revision)
      }
    } else {
      setCommitMessage('')
      setChangedFiles([])
      setStatusSummary({} as Record<SvnStatusCode, number>)
      setSelectedRevision(null)
      setRowSelection({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedRevision excluded to avoid re-run on row click
  }, [allLogData, searchTerm, currentPage, pageSize, selectRevision, effectiveVersionControlSystem])

  const toolbar = (
    <ShowlogToolbar
      onRefresh={handleRefresh}
      filePath={displayFilePath}
      isLoading={isLoading}
      dateRange={dateRange}
      setDateRange={setDateRange}
      onOpenStatistic={() => setIsStatisticOpen(true)}
      onOpenAIAnalysis={() => setIsAIAnalysisOpen(true)}
      onToggleLayout={() => setLayoutDirection(prev => (prev === 'horizontal' ? 'vertical' : 'horizontal'))}
      versionControlSystem={effectiveVersionControlSystem}
      contextSourceFolder={effectiveSourceFolder || undefined}
      onFolderChange={handleFolderChange}
      gitLogRevision={effectiveVersionControlSystem === 'git' ? gitLogRevision : null}
      onGitLogRevisionChange={setGitLogRevision}
      embedded={embedded}
      onStandaloneDock={!embedded && canOpenShowLogEmbedded() ? handleStandaloneDock : undefined}
    />
  )

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
        {!isConfigLoaded || isLoading ? (
          <div className="flex items-center justify-center h-full">
            <GlowLoader className="w-10 h-10" />
          </div>
        ) : (
          <div className="p-4 space-y-4 flex-1 h-full flex flex-col overflow-hidden">
            {layoutDirection === 'horizontal' ? (
              <ResizablePanelGroup orientation="horizontal">
                <ResizablePanel
                  key={`main-panel-${layoutDirection}`}
                  defaultSize={panelSizes.mainPanelSize}
                  minSize={30}
                  className="h-full"
                  onResize={size => handlePanelResize('mainPanelSize', size)}
                  ref={mainPanelRef}
                >
                  <div className="h-full pr-2 flex flex-col overflow-scroll pb-0!">
                    <div className="flex flex-col h-full">
                      <ShowLogTableSection
                        dataForCurrentPage={dataForCurrentPage}
                        columns={columns}
                        rowSelection={rowSelection}
                        setRowSelection={setRowSelection}
                        selectRevision={selectRevision}
                        currentRevision={currentRevision}
                        sorting={sorting}
                        setSorting={setSorting}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        filteredLogData={filteredLogData}
                        isLoading={isLoading}
                        totalEntriesFromBackend={totalEntriesFromBackend}
                        handlePageChange={handlePageChange}
                        currentPage={currentPage}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        onPageSizeChange={setPageSize}
                        variant={variant}
                        versionControlSystem={effectiveVersionControlSystem}
                        headCommitId={effectiveVersionControlSystem === 'git' ? allLogData[0]?.fullCommitId : undefined}
                        onCherryPick={handleCherryPick}
                        onReset={handleReset}
                        onInteractiveRebase={effectiveVersionControlSystem === 'git' ? handleInteractiveRebase : undefined}
                      />
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle className="bg-transparent" />

                <ResizablePanel
                  key={`second-panel-${layoutDirection}`}
                  defaultSize={panelSizes.secondPanelSize}
                  minSize={layoutDirection === 'horizontal' ? 30 : 40}
                  onResize={size => handlePanelResize('secondPanelSize', size)}
                  ref={secondPanelRef}
                >
                  <ResizablePanelGroup orientation="vertical" className="h-full">
                    <ResizablePanel
                      key={`commit-panel-${layoutDirection}`}
                      defaultSize={panelSizes.commitPanelSize}
                      minSize={20}
                      className="flex flex-col min-h-0"
                      onResize={size => handlePanelResize('commitPanelSize', size)}
                      ref={commitPanelRef}
                    >
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

                    <ResizableHandle className="bg-transparent" />

                    <ResizablePanel
                      key={`files-panel-${layoutDirection}`}
                      defaultSize={panelSizes.filesPanelSize}
                      minSize={20}
                      className="flex flex-col"
                      onResize={size => handlePanelResize('filesPanelSize', size)}
                      ref={filesPanelRef}
                    >
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
              <ResizablePanelGroup orientation="vertical">
                <ResizablePanel
                  key={`main-panel-${layoutDirection}`}
                  defaultSize={panelSizes.mainPanelSize}
                  minSize={20}
                  className="w-full"
                  onResize={size => handlePanelResize('mainPanelSize', size)}
                  ref={mainPanelRef}
                >
                  <div className="h-full pb-2">
                    <div className="flex flex-col h-full">
                      <ShowLogTableSection
                        dataForCurrentPage={dataForCurrentPage}
                        columns={columns}
                        rowSelection={rowSelection}
                        setRowSelection={setRowSelection}
                        selectRevision={selectRevision}
                        currentRevision={currentRevision}
                        sorting={sorting}
                        setSorting={setSorting}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        filteredLogData={filteredLogData}
                        isLoading={isLoading}
                        totalEntriesFromBackend={totalEntriesFromBackend}
                        handlePageChange={handlePageChange}
                        currentPage={currentPage}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        onPageSizeChange={setPageSize}
                        variant={variant}
                        versionControlSystem={effectiveVersionControlSystem}
                        headCommitId={effectiveVersionControlSystem === 'git' ? allLogData[0]?.fullCommitId : undefined}
                        onCherryPick={handleCherryPick}
                        onReset={handleReset}
                        onInteractiveRebase={effectiveVersionControlSystem === 'git' ? handleInteractiveRebase : undefined}
                      />
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle className="bg-transparent" />

                <ResizablePanel
                  key={`second-panel-${layoutDirection}`}
                  defaultSize={panelSizes.secondPanelSize}
                  minSize={40}
                  onResize={size => handlePanelResize('secondPanelSize', size)}
                  ref={secondPanelRef}
                >
                  <ResizablePanelGroup orientation="horizontal" className="h-full">
                    <ResizablePanel
                      key={`commit-panel-${layoutDirection}`}
                      defaultSize={panelSizes.commitPanelSize}
                      minSize={20}
                      className="pr-2 flex flex-col min-h-0"
                      onResize={size => handlePanelResize('commitPanelSize', size)}
                      ref={commitPanelRef}
                    >
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

                    <ResizableHandle className="bg-transparent" />

                    <ResizablePanel
                      key={`files-panel-${layoutDirection}`}
                      defaultSize={panelSizes.filesPanelSize}
                      minSize={20}
                      className="flex flex-col pl-2"
                      onResize={size => handlePanelResize('filesPanelSize', size)}
                      ref={filesPanelRef}
                    >
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
