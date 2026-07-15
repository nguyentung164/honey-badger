'use client'
import { format } from 'date-fns'
import {
  Archive,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Award,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  CircleArrowDown,
  ClipboardList,
  Crown,
  Database,
  Eraser,
  FileWarning,
  GitBranchPlus,
  GitMerge,
  GitPullRequest,
  History,
  KeyRound,
  LineChart,
  ListOrdered,
  Loader2,
  LogOut,
  Minus,
  RefreshCcw,
  Rocket,
  Settings2,
  Sparkles,
  Square,
  SquareArrowDown,
  SquareArrowOutUpRight,
  Terminal,
  Undo2,
  UserCircle,
  Users,
  Workflow,
  X,
} from 'lucide-react'
import { IPC } from 'main/constants'
import { lazy, type RefCallback, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { MAX_RANK_CODE } from 'shared/achievementRanks'
import type { MainShellView } from 'shared/mainShellView'
import { randomUuidV7 } from 'shared/randomUuidV7'
import { AchievementUnlockDialog } from '@/components/achievement/AchievementUnlockDialog'
import { getAchievementDemoMenuItemClass, getAchievementDemoMenuLabelClass, getAchievementDemoMenuTierClass } from '@/components/achievement/achievementTierDemo'
import { BadgeCard } from '@/components/achievement/BadgeCard'
import { LeaderboardDialog } from '@/components/achievement/LeaderboardDialog'
import { getRankDemoMenuItemClass, getRankDemoMenuLabelClass, getRankUsernameClass, RANK_CONFIG as RANK_CONFIG_ACH, RankAvatarRing } from '@/components/achievement/RankBadge'
import { UserProfilePanel } from '@/components/achievement/UserProfilePanel'
import { HolidayCalendarDialog } from '@/components/calendar/HolidayCalendarDialog'
import { AiUsageStatsDialog } from '@/components/dialogs/app/AiUsageStatsDialog'
import { SettingsDialog } from '@/components/dialogs/app/SettingsDialog'
import { UpdateDialog } from '@/components/dialogs/app/UpdateDialog'
import { GitBranchManageDialog } from '@/components/dialogs/git/GitBranchManageDialog'
import { GitCherryPickBranchesDialog } from '@/components/dialogs/git/GitCherryPickBranchesDialog'
import { GitRemoteBranchDialog } from '@/components/dialogs/git/GitRemoteBranchDialog'
import { GitStashDialog } from '@/components/dialogs/git/GitStashDialog'
import { type GitFile, GitSwitchBranchDialog } from '@/components/dialogs/git/GitSwitchBranchDialog'
import { CleanDialog } from '@/components/dialogs/vcs/CleanDialog'
import { NewRevisionDialog } from '@/components/dialogs/vcs/NewRevisionDialog'
import { VcsOperationLogDialog } from '@/components/dialogs/vcs/VcsOperationLogDialog'
import type { SvnStatusCode } from '@/components/shared/constants'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import type { GitStatusUpdatedDetail } from 'shared/gitStatusUpdated'
import { useCommitWorkflowStore } from '@/lib/commitWorkflow/commitWorkflowUtils'
import { openGitConflictDiffFromStatus } from '@/lib/diffViewer/openDiffViewer'
import { requestOpenShowLog } from '@/lib/openShowLog'
import { WorkspaceRepoChrome } from '@/components/workspace/WorkspaceRepoChrome'
import { cn, normalizePathForCompare } from '@/lib/utils'
import { getBranchMode } from '@/lib/workspaceChromeHandlers'
import { ShellTabSwitcher } from '@/pages/main/ShellTabSwitcher'
import { useShowLogSessionStore } from '@/stores/useShowLogSessionStore'
import { shellTabDockButtonClass } from '@/pages/main/shellTabStyles'
import logger from '@/services/logger'
import { useAchievementStore } from '@/stores/useAchievementStore'
import { getConfigDataRelevantSnapshot, useConfigurationStore } from '@/stores/useConfigurationStore'
import { useMultiRepoEffectiveStore } from '@/stores/useMultiRepoEffectiveStore'
import { useSelectedProjectStore } from '@/stores/useSelectedProjectStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

const DevReportForm = lazy(() => import('@/pages/dailyreport/DevReportForm').then(m => ({ default: m.DevReportForm })))
const TaskReminderDialog = lazy(() => import('@/components/dialogs/task/TaskReminderDialog').then(m => ({ default: m.TaskReminderDialog })))

interface TitleBarProps {
  isLoading: boolean
  versionControlSystem?: 'svn' | 'git'
  shellView?: MainShellView
  onShellViewChange?: (view: MainShellView) => void
  enableShellSwitcher?: boolean
  prManagerDetached?: boolean
  onPrManagerDock?: () => void
  onPrManagerDetach?: () => void
  tasksDetached?: boolean
  onTasksDock?: () => void
  onTasksDetach?: () => void
  automationDetached?: boolean
  onAutomationDock?: () => void
  onAutomationDetach?: () => void
  devPipelinesDetached?: boolean
  onDevPipelinesDock?: () => void
  onDevPipelinesDetach?: () => void
  showLogDetached?: boolean
  onShowLogDock?: () => void
  onShowLogDetach?: () => void
  onRequestLogin?: () => void
  onRequestChangePassword?: () => void
  hideUndoCommit?: boolean
  isMultiRepo?: boolean
  activeRepoPath?: string
  activeRepoLabel?: string
  hideVcsToolbar?: boolean
  taskToolbarHostRef?: RefCallback<HTMLDivElement>
  taskToolbarActionsHostRef?: RefCallback<HTMLDivElement>
  prManagerToolbarHostRef?: RefCallback<HTMLDivElement>
  automationToolbarHostRef?: RefCallback<HTMLDivElement>
  devPipelinesToolbarHostRef?: RefCallback<HTMLDivElement>
  showLogToolbarHostRef?: RefCallback<HTMLDivElement>
  terminalOpen?: boolean
  onTerminalToggle?: () => void
  /** When true, integrated terminal can be used (repo/home cwd resolved). */
  terminalAvailable?: boolean
  /** Prompt to save dirty editor tabs before repo/project/branch changes (Editor tab). */
  onEditorWorkspaceGuard?: (proceed: () => void) => void
  multiRepoActiveTab?: string
  onMultiRepoActiveChange?: (tabId: string) => void
}

function TitleBarClockFlagVn({ size = 16 }: { size?: number }) {
  const h = Math.round((size * 2) / 3)
  return (
    <svg className="rounded-xs" width={size} height={h} viewBox="0 0 30 20" aria-hidden>
      <rect width="30" height="20" fill="#da251d" rx="1.5" />
      <path fill="#ff0" d="M15 5 17.94 14.05 10.24 8.45 19.76 8.45 12.06 14.05z" />
    </svg>
  )
}

function TitleBarClockFlagJp({ size = 16 }: { size?: number }) {
  const h = Math.round((size * 2) / 3)
  return (
    <svg className="rounded-xs" width={size} height={h} viewBox="0 0 30 20" aria-hidden>
      <rect width="30" height="20" fill="#fff" rx="1.5" />
      <circle cx="15" cy="10" r="6" fill="#bc002d" />
    </svg>
  )
}

const SELECTED_PROJECT_STORAGE_KEY = 'selected-project-id'

type SvnInfo = {
  author: string
  revision: string
  date: string
  curRevision: string
  commitMessage: string
  changedFiles: { status: SvnStatusCode; path: string }[]
}

/** Dung lượng tải (MB), luôn 2 chữ số thập phân. */
function formatDownloadMb(value: string | number | undefined): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

export const TitleBar = ({
  isLoading,
  versionControlSystem = 'svn',
  shellView = 'vcs',
  onShellViewChange,
  enableShellSwitcher = false,
  prManagerDetached = false,
  onPrManagerDock,
  onPrManagerDetach,
  tasksDetached = false,
  onTasksDock,
  onTasksDetach,
  automationDetached = false,
  onAutomationDock,
  onAutomationDetach,
  devPipelinesDetached = false,
  onDevPipelinesDock,
  onDevPipelinesDetach,
  showLogDetached = false,
  onShowLogDock,
  onShowLogDetach,
  onRequestLogin,
  onRequestChangePassword,
  hideUndoCommit: _hideUndoCommit = false,
  isMultiRepo = false,
  activeRepoPath: activeRepoPathProp,
  activeRepoLabel: activeRepoLabelProp,
  hideVcsToolbar = false,
  taskToolbarHostRef,
  taskToolbarActionsHostRef,
  prManagerToolbarHostRef,
  automationToolbarHostRef,
  devPipelinesToolbarHostRef,
  showLogToolbarHostRef,
  terminalOpen = false,
  onTerminalToggle,
  terminalAvailable,
  onEditorWorkspaceGuard,
  multiRepoActiveTab = '0',
  onMultiRepoActiveChange,
}: TitleBarProps) => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const multiRepoLabels = useMultiRepoEffectiveStore(s => s.labels)
  const multiRepoPaths = useMultiRepoEffectiveStore(s => s.paths)
  const branchManageRepoChoices = useMemo(() => {
    if (!isMultiRepo || multiRepoPaths.length <= 1) return undefined
    return multiRepoPaths.map((path, i) => ({ path, label: (multiRepoLabels[i] ?? path).trim() || path }))
  }, [isMultiRepo, multiRepoPaths, multiRepoLabels])
  const user = useTaskAuthStore(s => s.user)
  const token = useTaskAuthStore(s => s.token)
  const isGuest = useTaskAuthStore(s => s.isGuest)
  const clearSession = useTaskAuthStore(s => s.clearSession)
  const achievementStats = useAchievementStore(s => s.myStats)
  const achievementFetchAll = useAchievementStore(s => s.fetchAll)
  const achievementGetPinnedWithDef = useAchievementStore(s => s.getMyPinnedWithDef)
  const [previewDefs, setPreviewDefs] = useState<Array<{ code: string; name: string; tier: string; sort_order: number }>>([])
  const [previewDefsStatus, setPreviewDefsStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [showProfile, setShowProfile] = useState(false)
  const [demoRankCode, setDemoRankCode] = useState<string | null>(null)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [showAiUsageStats, setShowAiUsageStats] = useState(false)
  const [showHolidayCalendar, setShowHolidayCalendar] = useState(false)
  const [titleBarClock, setTitleBarClock] = useState(() => new Date())

  useEffect(() => {
    const tick = () => setTitleBarClock(new Date())
    const id = window.setInterval(tick, 1000)
    tick()
    return () => window.clearInterval(id)
  }, [])

  const currentRank = achievementStats?.current_rank ?? 'newbie'
  const pinnedBadges = achievementGetPinnedWithDef()
  const isAdmin = user?.role === 'admin'
  const canViewTeamMetrics = Boolean(user && ['admin', 'pl', 'pm'].includes(user.role))

  const titleBarDisplayRank = isAdmin ? (demoRankCode ?? MAX_RANK_CODE) : currentRank
  const pillCfg = RANK_CONFIG_ACH[titleBarDisplayRank as keyof typeof RANK_CONFIG_ACH] ?? RANK_CONFIG_ACH.newbie
  const avatarRingRank = titleBarDisplayRank
  const titleBarNameClass = cn(isAdmin && 'font-semibold', getRankUsernameClass(titleBarDisplayRank))
  useEffect(() => {
    if (user) {
      achievementFetchAll().catch(() => { })
      const t = setTimeout(() => achievementFetchAll().catch(() => { }), 2000)
      return () => clearTimeout(t)
    }
  }, [user, achievementFetchAll])
  const sourceFolder = useConfigurationStore(s => s.sourceFolder)
  const multiRepoEnabled = useConfigurationStore(s => s.multiRepoEnabled)
  const isMultiRepoWorkspace = versionControlSystem === 'git' && !!multiRepoEnabled
  /** Multi-repo workspace: chỉ dùng repo đang chọn trên tab; không fallback `sourceFolder` khi chưa chọn Project (tránh dùng repo single cũ). */
  const gitContextPath =
    versionControlSystem !== 'git' ? undefined : isMultiRepoWorkspace ? (isMultiRepo && activeRepoPathProp ? activeRepoPathProp : undefined) : (sourceFolder ?? undefined)
  const gitContextPathTrimmed = (gitContextPath ?? '').trim()
  /** Có thư mục Git cwd hợp lệ — ẩn branch/sync/stash khi multi-repo chưa chọn project hoặc chưa có repo. */
  const showGitRepoChrome = versionControlSystem === 'git' && !!gitContextPathTrimmed
  /** Git: chỉ Show Log khi đã có cwd repo; SVN luôn hiện. */
  const showGitPathToolbarActions = versionControlSystem === 'svn' || showGitRepoChrome
  const activeRepoLabel = activeRepoLabelProp
  const isConfigLoaded = useConfigurationStore(s => s.isConfigLoaded)
  const setFieldConfiguration = useConfigurationStore(s => s.setFieldConfiguration)
  const saveConfigurationConfig = useConfigurationStore(s => s.saveConfigurationConfig)
  const loadConfigurationConfig = useConfigurationStore(s => s.loadConfigurationConfig)
  const [showSettings, setShowSettings] = useState(false)
  const [showClean, setShowClean] = useState(false)
  const [showSvnUpdateDialog, setShowSvnUpdateDialog] = useState(false)
  const [isSvnDialogManuallyOpened, setIsSvnDialogManuallyOpened] = useState(false)
  const [showGitSwitchBranchDialog, setShowGitSwitchBranchDialog] = useState(false)
  const [showGitBranchManageDialog, setShowGitBranchManageDialog] = useState(false)
  const [showGitStashDialog, setShowGitStashDialog] = useState(false)
  const [showPullFromDialog, setShowPullFromDialog] = useState(false)
  const [showPushToDialog, setShowPushToDialog] = useState(false)
  const [showForcePushConfirmDialog, setShowForcePushConfirmDialog] = useState(false)
  const [cherryPickOpen, setCherryPickOpen] = useState(false)
  const [pendingBranchSwitch, setPendingBranchSwitch] = useState<string>('')
  const [uncommittedFiles, setUncommittedFiles] = useState<GitFile[]>([])
  const [stashCount, setStashCount] = useState(0)
  const [hasSvnConflict, setHasSvnConflict] = useState(false)
  const [hasGitConflict, setHasGitConflict] = useState(false)
  const [gitConflictCount, setGitConflictCount] = useState(0)

  const [status, setStatus] = useState('')
  const [appVersion, setAppVersion] = useState<string>('')
  const [newAppVersion, setNewAppVersion] = useState<string>('')
  const [releaseNotes, setReleaseNotes] = useState<string>('')
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [isUpdateDialogManuallyOpened, setIsUpdateDialogManuallyOpened] = useState(false)
  const [showIconUpdateApp, setShowIconUpdateApp] = useState(false)

  // Download progress states
  const [downloadProgress, setDownloadProgress] = useState<number>(0)
  const [downloadSpeed, setDownloadSpeed] = useState<string>('')
  const [downloadEta, setDownloadEta] = useState<string>('')
  const [downloadedMB, setDownloadedMB] = useState<string>('')
  const [totalMB, setTotalMB] = useState<string>('')

  const [svnInfo, setSvnInfo] = useState<SvnInfo>({ author: '', revision: '', date: '', curRevision: '', commitMessage: '', changedFiles: [] })
  const [hasSvnUpdate, setHasSvnUpdate] = useState(false)

  // Git state
  // const [gitStatus, setGitStatus] = useState<any>(null)
  const [currentBranch, setCurrentBranch] = useState<string>('')
  const previousBranchRef = useRef<string>('') // Lưu branch trước đó để so sánh
  const hasLoggedWaitingConfigRef = useRef(false)
  const hasLoggedWaitingVcsUpdatesRef = useRef(false)
  const gitContextIdRef = useRef(0) // Tăng khi đổi tab (gitContextPath) để bỏ qua setState từ response cũ (6a)
  const checkGitStatusRef = useRef<((options?: { fetchFirst?: boolean }) => Promise<void>) | null>(null)
  const [gitAhead, setGitAhead] = useState<number>(0)
  const [gitBehind, setGitBehind] = useState<number>(0)
  const [branches, setBranches] = useState<any>(null)
  const [isLoadingBranches, setIsLoadingBranches] = useState(false)
  const [isRefreshingBranchesRemote, setIsRefreshingBranchesRemote] = useState(false)
  const branchesRef = useRef<any>(null)
  const branchListLoadIdRef = useRef(0)
  const branchRemoteFetchRef = useRef<{ cwd: string; promise: Promise<void> } | null>(null)
  const [isGitPulling, setIsGitPulling] = useState(false)
  const [isGitPushing, setIsGitPushing] = useState(false)
  const [isGitFetching, setIsGitFetching] = useState(false)
  const [showGitUpdateResultDialog, setShowGitUpdateResultDialog] = useState(false)
  const [gitUpdateResultFiles, setGitUpdateResultFiles] = useState<{ action: string; path: string }[]>([])
  const [gitStreamingLog, setGitStreamingLog] = useState('')
  const [gitIsStreaming, setGitIsStreaming] = useState(false)
  const [gitDialogTitle, setGitDialogTitle] = useState<string | undefined>(undefined)
  const [gitOperationStatus, setGitOperationStatus] = useState<'success' | 'error' | undefined>(undefined)

  // Refresh VCS log (realtime khi click Làm mới)
  const [showRefreshLogDialog, setShowRefreshLogDialog] = useState(false)
  const [refreshStreamingLog, setRefreshStreamingLog] = useState('')
  const [refreshIsStreaming, setRefreshIsStreaming] = useState(false)
  const [refreshVcsType, setRefreshVcsType] = useState<'git' | 'svn'>('git')
  const [refreshOperationStatus, setRefreshOperationStatus] = useState<'success' | 'error' | undefined>(undefined)

  // Source folders state
  const [sourceFolders, setSourceFolders] = useState<{ name: string; path: string }[]>([])
  const [currentFolder, setCurrentFolder] = useState<string>('')
  const [folderVCSTypes, setFolderVCSTypes] = useState<Record<string, 'git' | 'svn' | 'none'>>({})
  const selectedProjectId = useSelectedProjectStore(s => s.selectedProjectId)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isProjectsLoading, setIsProjectsLoading] = useState(false)
  const [isSourceFoldersLoading, setIsSourceFoldersLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isChangingFolder, setIsChangingFolder] = useState(false)
  const [showLogoutConfirmDialog, setShowLogoutConfirmDialog] = useState(false)
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const [editReportInitialDate, setEditReportInitialDate] = useState<string | undefined>()
  const [editReportInitialProjectId, setEditReportInitialProjectId] = useState<string | null | undefined>()
  const [editReportInitialProjectIds, setEditReportInitialProjectIds] = useState<string[] | undefined>()
  const [isOpeningReportDialog, setIsOpeningReportDialog] = useState(false)
  const [reportRefreshKey, setReportRefreshKey] = useState(0)
  const [showReminderDialog, setShowReminderDialog] = useState(false)
  const [reminderCount, setReminderCount] = useState(0)

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  const loadProjects = useCallback(async () => {
    setIsProjectsLoading(true)
    const start = Date.now()
    try {
      const res = await window.api.user.getCurrentUser()
      if (res.status === 'success' && res.data) {
        setIsLoggedIn(true)
        const projRes = await window.api.task.getProjectsForUser()
        if (projRes.status === 'success' && projRes.data) {
          const projectList = projRes.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
          const withFolders = await Promise.all(
            projectList.map(async (p: { id: string; name: string }) => {
              const folderRes = await window.api.task.getSourceFoldersByProject(p.id)
              const hasFolders = folderRes.status === 'success' && Array.isArray(folderRes.data) && folderRes.data.length > 0
              return { project: p, hasFolders }
            })
          )
          const filteredList = withFolders.filter(({ hasFolders }) => hasFolders).map(({ project }) => project)
          setProjects(filteredList)
          const savedId = localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY)
          if (savedId && filteredList.some((p: { id: string; name: string }) => p.id === savedId)) {
            useSelectedProjectStore.getState().setSelectedProjectId(savedId)
          } else {
            useSelectedProjectStore.getState().setSelectedProjectId(null)
          }
        } else {
          setProjects([])
        }
      } else {
        setIsLoggedIn(false)
        setProjects([])
      }
    } finally {
      const elapsed = Date.now() - start
      const minLoadingMs = 400
      if (elapsed < minLoadingMs) {
        await new Promise(r => setTimeout(r, minLoadingMs - elapsed))
      }
      setIsProjectsLoading(false)
    }
  }, [])

  const loadSourceFoldersForProject = useCallback(async () => {
    if (selectedProjectId && isLoggedIn) {
      const res = await window.api.task.getSourceFoldersByProject(selectedProjectId)
      if (res.status === 'success' && res.data) return res.data
      if (res.status === 'error' && (res as { code?: string }).code === 'UNAUTHORIZED') {
        // Không toast ở đây; MainPage đã xử lý session expired khi verifySession. Chỉ fallback.
        return window.api.sourcefolder.get()
      }
      return []
    }
    return window.api.sourcefolder.get()
  }, [selectedProjectId, isLoggedIn])

  // Làm mới danh sách source folder khi mở dropdown (dùng ref để lấy selectedProjectId mới nhất, tránh list cũ khi click nhanh Project rồi Source Folder)
  const refreshSourceFoldersList = useCallback(async () => {
    const projectId = selectedProjectIdRef.current
    try {
      let folders: { name: string; path: string }[]
      if (projectId && isLoggedIn) {
        const res = await window.api.task.getSourceFoldersByProject(projectId)
        folders = res.status === 'success' && res.data ? res.data : []
      } else {
        folders = await window.api.sourcefolder.get()
      }
      setSourceFolders(Array.isArray(folders) ? folders : [])
    } catch {
      setSourceFolders([])
    }
  }, [isLoggedIn])

  // Load projects khi user đã login để restore selectedProjectId từ storage ngay khi mở app
  useEffect(() => {
    if (user && !isGuest) {
      loadProjects()
    }
  }, [user, isGuest, loadProjects])

  // Ref đánh dấu user vừa chọn project từ dropdown → không ghi đè selectedProjectId theo path cũ, và chọn folder đầu tiên của list mới
  const userJustSelectedProjectIdRef = useRef<string | null | undefined>(undefined)
  const selectedProjectIdRef = useRef<string | null>(null)
  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId
  }, [selectedProjectId])

  const handleProjectSelect = useCallback((projectId: string | null) => {
    userJustSelectedProjectIdRef.current = projectId
    useSelectedProjectStore.getState().setSelectedProjectId(projectId)
  }, [])

  const runWithEditorGuard = useCallback(
    (action: () => void | Promise<void>) => {
      if (onEditorWorkspaceGuard) {
        onEditorWorkspaceGuard(() => {
          void action()
        })
        return
      }
      void action()
    },
    [onEditorWorkspaceGuard]
  )

  const gitLogRevision = useShowLogSessionStore(s => s.gitLogRevision)
  const setGitLogRevision = useShowLogSessionStore(s => s.setGitLogRevision)
  const branchMode = getBranchMode(shellView)

  const handleLogRefSelect = useCallback(
    (branchName: string) => {
      const next = branchName === currentBranch ? null : branchName
      setGitLogRevision(next)
    },
    [currentBranch, setGitLogRevision]
  )

  const loadSourceFoldersRequestIdRef = useRef<string | null>(null)
  const dataSnapshotRef = useRef<string | null>(null)

  useEffect(() => {
    const handler = (_event: any, data: any) => {
      setStatus(data.status)
      setShowIconUpdateApp(false)
      logger.info(data)

      // Reset download progress for non-downloading states
      if (data.status !== 'downloading') {
        setDownloadProgress(0)
        setDownloadSpeed('')
        setDownloadEta('')
        setDownloadedMB('')
        setTotalMB('')
      }
      if (data.status === 'available') {
        setAppVersion(`v${data.currentVersion}`)
        setNewAppVersion(`v${data.version}`)
      }
      if (data.status === 'downloaded') {
        setAppVersion(`v${data.currentVersion}`)
        setNewAppVersion(`v${data.version}`)
        setShowIconUpdateApp(true)
        if (data.releaseNotes) {
          setReleaseNotes(data.releaseNotes)
        }
        // Reset download progress
        setDownloadProgress(0)
        setDownloadSpeed('')
        setDownloadEta('')
        setDownloadedMB('')
        setTotalMB('')
      }
      if (data.status === 'downloading') {
        setDownloadProgress(data.progress || 0)
        setDownloadSpeed(formatDownloadMb(data.speed))
        setDownloadEta(data.eta || '')
        setDownloadedMB(formatDownloadMb(data.downloadedMB))
        setTotalMB(formatDownloadMb(data.totalMB))
      }
    }
    window.api.on('updater:status', handler)
    return () => {
      window.api.removeAllListeners('updater:status')
    }
  }, [])

  useEffect(() => {
    // Đợi config load xong trước khi detect VCS
    if (!isConfigLoaded) {
      if (!hasLoggedWaitingConfigRef.current) {
        hasLoggedWaitingConfigRef.current = true
        logger.info('Waiting for config to load before detecting VCS...')
      }
      return
    }
    hasLoggedWaitingConfigRef.current = false

    const requestId = randomUuidV7()
    loadSourceFoldersRequestIdRef.current = requestId

    const loadSourceFolders = async () => {
      setIsSourceFoldersLoading(true)
      try {
        logger.info('Config loaded, now loading source folders and detecting VCS...')
        const folders = await loadSourceFoldersForProject()
        if (loadSourceFoldersRequestIdRef.current !== requestId) return
        setSourceFolders(folders)

        const cfgSync = useConfigurationStore.getState()
        if (cfgSync.versionControlSystem === 'git' && cfgSync.multiRepoEnabled && user && !isGuest && !selectedProjectId?.trim()) {
          // Multi-repo: chưa chọn Project — không gắn currentFolder / VCS Git với sourceFolder single cũ
          setFolderVCSTypes({})
          setCurrentFolder('')
          dataSnapshotRef.current = getConfigDataRelevantSnapshot(cfgSync)
          return
        }

        // Detect VCS type cho tất cả folders
        const vcsTypes: Record<string, 'git' | 'svn' | 'none'> = {}
        for (const folder of folders) {
          try {
            const detectResult = await window.api.system.detect_version_control(folder.path)
            if (detectResult.status === 'success' && detectResult.data) {
              const detectedType = detectResult.data.type
              const isValid = detectResult.data.isValid
              vcsTypes[folder.name] = isValid && detectedType !== 'none' ? (detectedType as 'git' | 'svn') : 'none'
            } else {
              vcsTypes[folder.name] = 'none'
            }
          } catch (error) {
            logger.error(`Error detecting VCS for folder ${folder.name}:`, error)
            vcsTypes[folder.name] = 'none'
          }
        }
        setFolderVCSTypes(vcsTypes)

        const configSourceFolder = useConfigurationStore.getState().sourceFolder
        const isUserJustSelectedProject = userJustSelectedProjectIdRef.current !== undefined

        let effectiveFolder: { name: string; path: string } | undefined
        let usedFallback = false

        if (isUserJustSelectedProject && folders.length > 0) {
          const wasSpecificProject = userJustSelectedProjectIdRef.current !== null
          userJustSelectedProjectIdRef.current = undefined
          // Chỉ khi user chọn một project cụ thể (không phải "Tất cả"): giữ source folder hiện tại nếu nó nằm trong list mới, không thì lấy folder đầu tiên
          if (wasSpecificProject) {
            const folderInNewList = folders.find(f => normalizePathForCompare(f.path) === normalizePathForCompare(configSourceFolder))
            if (folderInNewList) {
              effectiveFolder = folderInNewList
              setCurrentFolder(folderInNewList.name)
              localStorage.setItem('current-source-folder', folderInNewList.name)
              logger.info(`Đổi project: giữ source folder (nằm trong project): ${folderInNewList.name}`)
            } else {
              effectiveFolder = folders[0]
              usedFallback = true
              setCurrentFolder(folders[0].name)
              localStorage.setItem('current-source-folder', folders[0].name)
              setFieldConfiguration('sourceFolder', folders[0].path)
              await window.api.configuration.patch({ sourceFolder: folders[0].path })
              logger.info(`Đổi project: chọn source folder đầu tiên: ${folders[0].name}`)
            }
          }
        }
        if (effectiveFolder === undefined) {
          // Đồng bộ currentFolder với config.sourceFolder (ưu tiên config từ Settings)
          const folderByConfig = folders.find(f => normalizePathForCompare(f.path) === normalizePathForCompare(configSourceFolder))
          if (folderByConfig) {
            effectiveFolder = folderByConfig
            setCurrentFolder(folderByConfig.name)
            localStorage.setItem('current-source-folder', folderByConfig.name)
          } else if (configSourceFolder && configSourceFolder.trim() !== '') {
            // sourceFolder từ config không có trong list API → thêm virtual entry
            const displayName = configSourceFolder.split(/[/\\]/).filter(Boolean).pop() || configSourceFolder
            const virtualEntry = { name: displayName, path: configSourceFolder }
            const mergedFolders = folders.some(f => normalizePathForCompare(f.path) === normalizePathForCompare(configSourceFolder)) ? folders : [...folders, virtualEntry]
            setSourceFolders(mergedFolders)
            setCurrentFolder(virtualEntry.name)
            localStorage.setItem('current-source-folder', virtualEntry.name)
            effectiveFolder = virtualEntry
            try {
              const detectResult = await window.api.system.detect_version_control(configSourceFolder)
              if (detectResult.status === 'success' && detectResult.data) {
                const vcsType = detectResult.data.isValid && detectResult.data.type !== 'none' ? (detectResult.data.type as 'git' | 'svn') : 'none'
                setFolderVCSTypes(prev => ({ ...prev, [virtualEntry.name]: vcsType }))
              }
            } catch {
              // ignore
            }
          } else if (folders.length > 0) {
            const fallbackFolder =
              selectedProjectId && folders.length > 0
                ? folders[0]
                : (() => {
                  const savedFolder = localStorage.getItem('current-source-folder')
                  return (savedFolder ? folders.find(f => f.name === savedFolder) : null) ?? folders[0]
                })()
            if (fallbackFolder) {
              effectiveFolder = fallbackFolder
              usedFallback = true
              setCurrentFolder(fallbackFolder.name)
              localStorage.setItem('current-source-folder', fallbackFolder.name)
              setFieldConfiguration('sourceFolder', fallbackFolder.path)
              await window.api.configuration.patch({ sourceFolder: fallbackFolder.path })
              logger.warning(`config.sourceFolder không có trong sourceFolders, đã fallback sang: ${fallbackFolder.name}`)
            }
          }
        }

        const effectivePath = effectiveFolder?.path ?? configSourceFolder

        // Đồng bộ Project theo sourceFolder chỉ khi KHÔNG phải do user vừa chọn project (tránh ghi đè selectedProjectId).
        // Khi Project đang là "All" (selectedProjectId null) thì không lấy project của sourceFolder — giữ nguyên "All".
        if (!isUserJustSelectedProject && effectivePath && user && !isGuest && selectedProjectIdRef.current !== null) {
          try {
            const res = await window.api.task.getProjectIdByUserAndPath(effectivePath)
            if (res.status === 'success' && res.data) {
              useSelectedProjectStore.getState().setSelectedProjectId(res.data)
            } else {
              useSelectedProjectStore.getState().setSelectedProjectId(null)
            }
          } catch {
            useSelectedProjectStore.getState().setSelectedProjectId(null)
          }
        }

        dataSnapshotRef.current = getConfigDataRelevantSnapshot(useConfigurationStore.getState())
        // Re-detect versionControlSystem khi app mở (tránh config cũ sai). Không dispatch configuration-changed để tránh MainPage gọi reloadData() trùng (đã có initial load).
        if (effectivePath) {
          try {
            const vcsResult = await window.api.system.get_version_control_details(effectivePath)
            if (vcsResult.status === 'success' && vcsResult.data?.isValid && vcsResult.data?.type !== 'none') {
              const detectedType = vcsResult.data.type as 'svn' | 'git'
              const currentVCS = useConfigurationStore.getState().versionControlSystem
              if (detectedType !== currentVCS) {
                logger.info(`Re-detect VCS: ${currentVCS} -> ${detectedType}, cập nhật config`)
                setFieldConfiguration('versionControlSystem', detectedType)
                await window.api.configuration.patch({ versionControlSystem: detectedType })
              }
            }
          } catch (err) {
            logger.error('Error re-detecting VCS on startup:', err)
          }
        }

        // Check VCS updates cho folder hiện tại
        const currentFolderName = effectiveFolder?.name
        if (currentFolderName) {
          const vcsType = vcsTypes[currentFolderName]
          logger.info(`Checking VCS updates for current folder: ${currentFolderName} (${vcsType})`)
          checkVCSUpdates(vcsType)
        }

        // Khi đổi Project, source folder tự lấy folder đầu tiên - cần dispatch để MainPage reload files và check git (giống khi đổi source folder thủ công)
        if (usedFallback && effectiveFolder) {
          const vcsType = vcsTypes[effectiveFolder.name]
          window.dispatchEvent(
            new CustomEvent('configuration-changed', {
              detail: { type: 'configuration', clearData: vcsType === 'none' },
            })
          )
        }
      } catch (error) {
        logger.error('Error loading source folders:', error)
      } finally {
        if (loadSourceFoldersRequestIdRef.current === requestId) {
          loadSourceFoldersRequestIdRef.current = null
        }
        setIsSourceFoldersLoading(false)
      }
    }

    loadSourceFolders()
  }, [isConfigLoaded, loadSourceFoldersForProject, user, isGuest, selectedProjectId])

  // Listen for configuration changes from SettingsDialog
  useEffect(() => {
    const handleConfigurationChange = async (event: CustomEvent) => {
      if (event.detail?.type === 'configuration') {
        // Đợi config load xong nếu chưa load
        if (!isConfigLoaded) {
          logger.info('Config not loaded yet, skipping configuration change handling...')
          return
        }

        const newSnapshot = getConfigDataRelevantSnapshot(useConfigurationStore.getState())
        if (dataSnapshotRef.current !== null && dataSnapshotRef.current === newSnapshot) {
          return
        }
        dataSnapshotRef.current = newSnapshot

        logger.info('Configuration changed in TitleBar, updating current folder...')
        setIsSourceFoldersLoading(true)

        // Reload source folders để có danh sách mới nhất
        try {
          const folders = await loadSourceFoldersForProject()
          setSourceFolders(folders)

          // Detect VCS type cho tất cả folders
          const vcsTypes: Record<string, 'git' | 'svn' | 'none'> = {}
          for (const folder of folders) {
            try {
              const detectResult = await window.api.system.detect_version_control(folder.path)
              if (detectResult.status === 'success' && detectResult.data) {
                const detectedType = detectResult.data.type
                const isValid = detectResult.data.isValid
                vcsTypes[folder.name] = isValid && detectedType !== 'none' ? (detectedType as 'git' | 'svn') : 'none'
              } else {
                vcsTypes[folder.name] = 'none'
              }
            } catch (error) {
              logger.error(`Error detecting VCS for folder ${folder.name}:`, error)
              vcsTypes[folder.name] = 'none'
            }
          }
          setFolderVCSTypes(vcsTypes)

          const cfgAfterChange = useConfigurationStore.getState()
          const projectIdAfterChange = useSelectedProjectStore.getState().selectedProjectId
          const skipFolderSyncForMultiAwaiting =
            cfgAfterChange.versionControlSystem === 'git' && !!cfgAfterChange.multiRepoEnabled && user && !isGuest && !projectIdAfterChange?.trim()

          if (skipFolderSyncForMultiAwaiting) {
            setCurrentFolder('')
          } else {
            // Tìm folder name tương ứng với sourceFolder path (chuẩn hóa path để so sánh)
            const folder = sourceFolder ? folders.find(f => normalizePathForCompare(f.path) === normalizePathForCompare(sourceFolder)) : undefined

            if (folder) {
              setCurrentFolder(folder.name)
              localStorage.setItem('current-source-folder', folder.name)
              logger.info(`Updated current folder to: ${folder.name}`)

              const vcsType = vcsTypes[folder.name]
              if (vcsType && vcsType !== 'none') {
                logger.info(`Checking VCS updates after configuration change: ${folder.name} (${vcsType})`)
                checkVCSUpdates(vcsType)
              }
            } else if (sourceFolder && sourceFolder.trim() !== '') {
              // sourceFolder có giá trị (vd user vừa chọn trong Settings) nhưng không có trong list từ API
              // → Không ghi đè config, chỉ thêm vào list để hiển thị và sync currentFolder
              const displayName = sourceFolder.split(/[/\\]/).filter(Boolean).pop() || sourceFolder
              const virtualEntry = { name: displayName, path: sourceFolder }
              const mergedFolders = folders.some(f => normalizePathForCompare(f.path) === normalizePathForCompare(sourceFolder)) ? folders : [...folders, virtualEntry]
              setSourceFolders(mergedFolders)
              setCurrentFolder(virtualEntry.name)
              localStorage.setItem('current-source-folder', virtualEntry.name)
              try {
                const detectResult = await window.api.system.detect_version_control(sourceFolder)
                if (detectResult.status === 'success' && detectResult.data?.isValid && detectResult.data?.type !== 'none') {
                  setFolderVCSTypes(prev => ({ ...prev, [virtualEntry.name]: detectResult.data?.type as 'git' | 'svn' }))
                  checkVCSUpdates(detectResult.data?.type as 'git' | 'svn')
                }
              } catch {
                // ignore
              }
            } else if (folders.length > 0) {
              // sourceFolder rỗng hoặc thực sự invalid (folder bị xóa) → fallback và lưu
              const savedFolder = localStorage.getItem('current-source-folder')
              const fallbackFolder = (savedFolder ? folders.find(f => f.name === savedFolder) : null) ?? folders[0]
              setCurrentFolder(fallbackFolder.name)
              localStorage.setItem('current-source-folder', fallbackFolder.name)
              setFieldConfiguration('sourceFolder', fallbackFolder.path)
              await window.api.configuration.patch({ sourceFolder: fallbackFolder.path })
              logger.warning(`sourceFolder không tìm thấy trong list, đã fallback sang: ${fallbackFolder.name}`)
              const vcsType = vcsTypes[fallbackFolder.name]
              if (vcsType && vcsType !== 'none') {
                checkVCSUpdates(vcsType)
              }
            }

            // Đồng bộ Project theo sourceFolder chỉ khi Project không phải "All": nếu folder thuộc project nào thì chọn project đó.
            // Khi Project đang là "All" thì không lấy project của sourceFolder — giữ nguyên "All".
            const currentPath = useConfigurationStore.getState().sourceFolder
            if (!user || isGuest) {
              useSelectedProjectStore.getState().setSelectedProjectId(null)
            } else if (selectedProjectIdRef.current !== null && currentPath && currentPath.trim() !== '') {
              try {
                const res = await window.api.task.getProjectIdByUserAndPath(currentPath)
                if (res.status === 'success' && res.data) {
                  useSelectedProjectStore.getState().setSelectedProjectId(res.data)
                } else {
                  useSelectedProjectStore.getState().setSelectedProjectId(null)
                }
              } catch {
                useSelectedProjectStore.getState().setSelectedProjectId(null)
              }
            } else if (selectedProjectIdRef.current !== null && (!currentPath || currentPath.trim() === '')) {
              useSelectedProjectStore.getState().setSelectedProjectId(null)
            }
          }
        } catch (error) {
          logger.error('Error reloading source folders:', error)
        } finally {
          setIsSourceFoldersLoading(false)
        }
      }
    }

    window.addEventListener('configuration-changed', handleConfigurationChange as unknown as EventListener)

    return () => {
      window.removeEventListener('configuration-changed', handleConfigurationChange as unknown as EventListener)
    }
  }, [sourceFolder, isConfigLoaded, loadSourceFoldersForProject, user, isGuest])

  // Detect branch changes khi window focus — chỉ khi tab Workspace (vcs), tránh gọi Git khi đang Tasks/PR Manager
  useEffect(() => {
    if (shellView !== 'vcs') return

    const handleWindowFocus = () => {
      logger.info('Window focused - checking for branch changes')
      checkBranchChanges()
    }

    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
    // shellView + gitContextPath: chỉ subscribe khi Workspace; đổi repo/tab cập nhật handler
  }, [versionControlSystem, gitContextPath, shellView])

  // Load SVN conflict status khi dùng SVN để chỉ hiện icon conflict khi có conflict
  useEffect(() => {
    if (versionControlSystem !== 'svn') {
      setHasSvnConflict(false)
    }
    if (versionControlSystem !== 'git') {
      setHasGitConflict(false)
      setGitConflictCount(0)
    }
    if (versionControlSystem !== 'svn' || !sourceFolder?.trim()) {
      return
    }
    let cancelled = false
    window.api.svn
      .get_conflict_status(sourceFolder)
      .then(result => {
        if (!cancelled && result?.data?.hasConflict) setHasSvnConflict(true)
        else if (!cancelled) setHasSvnConflict(false)
      })
      .catch(() => {
        if (!cancelled) setHasSvnConflict(false)
      })
    return () => {
      cancelled = true
    }
  }, [versionControlSystem, sourceFolder])

  // Function để check SVN updates
  const checkSvnUpdates = async () => {
    try {
      const { status, data, message } = await window.api.svn.info('.')
      if (status === 'success') {
        logger.info(data)
        setHasSvnUpdate(true)
        setSvnInfo(data)
        setIsSvnDialogManuallyOpened(false)
        setShowSvnUpdateDialog(true)
      } else if (status === 'no-change') {
        logger.info('Không có thay đổi')
        setHasSvnUpdate(false)
        setSvnInfo(data)
      } else {
        logger.error('Lỗi SVN:', message)
      }
      if (sourceFolder) {
        const conflictRes = await window.api.svn.get_conflict_status(sourceFolder)
        if (conflictRes?.data?.hasConflict) setHasSvnConflict(true)
        else setHasSvnConflict(false)
      }
    } catch (error) {
      logger.error('Error checking for SVN updates:', error)
      setHasSvnConflict(false)
    }
  }

  // Function để check Git status (chỉ đọc local, không fetch)
  const checkGitStatus = async (options?: { fetchFirst?: boolean }) => {
    if (!gitContextPath) return
    const idAtStart = gitContextIdRef.current
    const cwd = gitContextPath
    try {
      if (options?.fetchFirst) {
        setIsGitFetching(true)
        try {
          const fetchResult = await window.api.git.fetch('origin', undefined, cwd)
          if (fetchResult.status === 'success') {
            logger.info('Git fetch completed before status check')
          }
        } finally {
          setIsGitFetching(false)
        }
      }
      const { status, data, message } = await window.api.git.status(cwd ? { cwd } : undefined)
      if (idAtStart !== gitContextIdRef.current) return
      if (status === 'success') {
        logger.info('Git status:', data)
        const newBranch = data.current || ''
        setCurrentBranch(newBranch)
        if (newBranch && !previousBranchRef.current) {
          previousBranchRef.current = newBranch
          logger.info(`Initial branch set: ${newBranch}`)
        }
        setGitAhead(data.ahead || 0)
        setGitBehind(data.behind || 0)
        const n = data.conflicted?.length ?? 0
        setGitConflictCount(n)
        setHasGitConflict(n > 0)
      } else {
        logger.error('Git status error:', message)
        setHasGitConflict(false)
        setGitConflictCount(0)
      }
    } catch (error) {
      if (idAtStart !== gitContextIdRef.current) return
      logger.error('Error checking Git status:', error)
      setHasGitConflict(false)
      setGitConflictCount(0)
    }
    if (idAtStart !== gitContextIdRef.current) return
    await loadStashCount()
  }
  checkGitStatusRef.current = checkGitStatus

  // Đồng bộ icon conflict với GitStagingTable sau mỗi lần bảng gọi git.status (tránh TitleBar chưa refresh)
  useEffect(() => {
    if (versionControlSystem !== 'git') return
    const onGitStatusUpdated = (ev: Event) => {
      const d = (ev as CustomEvent<GitStatusUpdatedDetail>).detail
      if (d?.cwd && gitContextPath && d.cwd !== gitContextPath) return
      if (d?.fromTable) {
        if (typeof d.conflictCount === 'number') {
          setGitConflictCount(d.conflictCount)
          setHasGitConflict(d.conflictCount > 0)
        }
        if (d.currentBranch) {
          setCurrentBranch(d.currentBranch)
          if (!previousBranchRef.current) {
            previousBranchRef.current = d.currentBranch
          }
        }
        if (typeof d.ahead === 'number') setGitAhead(d.ahead)
        if (typeof d.behind === 'number') setGitBehind(d.behind)
        return
      }
      void checkGitStatusRef.current?.()
    }
    window.addEventListener('git-status-updated', onGitStatusUpdated as EventListener)
    return () => window.removeEventListener('git-status-updated', onGitStatusUpdated as EventListener)
  }, [versionControlSystem, gitContextPath])

  // Cập nhật icon conflict khi user resolve conflict từ cửa sổ Conflict Resolver riêng biệt
  useEffect(() => {
    if (versionControlSystem !== 'git') return
    const onConflictResolved = () => {
      void checkGitStatusRef.current?.()
    }
    window.api.on('git-conflict-resolved', onConflictResolved)
    return () => window.api.removeListener('git-conflict-resolved', onConflictResolved)
  }, [versionControlSystem])

  // Function để check VCS updates dựa trên type
  const checkVCSUpdates = (vcsType: 'git' | 'svn' | 'none') => {
    if (vcsType === 'git') {
      checkGitStatus()
    } else if (vcsType === 'svn') {
      checkSvnUpdates()
    }
  }

  useEffect(() => {
    // Đợi config load xong trước khi check updates
    if (!isConfigLoaded) {
      if (!hasLoggedWaitingVcsUpdatesRef.current) {
        hasLoggedWaitingVcsUpdatesRef.current = true
        logger.info('Waiting for config to load before checking VCS updates...')
      }
      return
    }
    hasLoggedWaitingVcsUpdatesRef.current = false

    const checkAppUpdates = async () => {
      try {
        const result = await window.api.updater.check_for_updates()
        if (result.status === 'available' && result.version) {
          setAppVersion(`v${result.version}`)
        }
        if (result.releaseNotes) {
          setReleaseNotes(result.releaseNotes)
        }
      } catch (error) {
        logger.error('Error checking for app updates:', error)
      }
    }

    logger.info('Config loaded, now checking app and VCS updates...')
    checkAppUpdates()
    // Không gọi checkVCSUpdates ngay ở đây để tránh trùng với effect loadSourceFolders (đã gọi checkVCSUpdates sau khi load folders)

    const appUpdateInterval = setInterval(
      () => {
        checkAppUpdates()
      },
      5 * 60 * 1000 // Check every 5 minutes
    )

    const vcsUpdateInterval = setInterval(
      () => {
        checkVCSUpdates(versionControlSystem)
      },
      5 * 60 * 1000 // Check every 5 minutes
    )

    // Listen for git commit success event
    const handleGitCommitSuccess = async () => {
      if (versionControlSystem === 'git') {
        logger.info('Git commit success, updating badge...')
        checkGitStatus()
      }
    }

    window.addEventListener('git-commit-success', handleGitCommitSuccess)

    return () => {
      clearInterval(appUpdateInterval)
      clearInterval(vcsUpdateInterval)
      window.removeEventListener('git-commit-success', handleGitCommitSuccess)
    }
    // gitContextPath trong deps để interval luôn gọi checkGitStatus đúng repo đang active (tránh stale closure khi đổi tab)
  }, [isConfigLoaded, versionControlSystem, gitContextPath])

  useEffect(() => {
    branchesRef.current = branches
  }, [branches])

  // Khi đổi tab (gitContextPath thay đổi): tăng id để bỏ qua response cũ, clear branches, refetch state cho repo active (checkGitStatus gọi loadStashCount bên trong)
  useEffect(() => {
    if (versionControlSystem !== 'git' || !gitContextPath) return
    gitContextIdRef.current += 1
    branchListLoadIdRef.current += 1
    branchRemoteFetchRef.current = null
    setBranches(null)
    setIsLoadingBranches(false)
    setIsRefreshingBranchesRemote(false)
    checkGitStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi gitContextPath/versionControlSystem đổi
  }, [gitContextPath, versionControlSystem])

  useLayoutEffect(() => {
    if (versionControlSystem !== 'git') return
    if (showGitRepoChrome) return
    setCurrentBranch('')
    previousBranchRef.current = ''
    setBranches(null)
    setGitAhead(0)
    setGitBehind(0)
    setStashCount(0)
    setHasGitConflict(false)
    setGitConflictCount(0)
    setUncommittedFiles([])
  }, [versionControlSystem, showGitRepoChrome])

  const checkForUpdates = async () => {
    if (status === 'downloaded') {
      setIsUpdateDialogManuallyOpened(true)
      setShowUpdateDialog(true)
    } else {
      toast.info(t('toast.isLatestVersion'))
    }
  }

  const fetchReminderStats = useCallback(async () => {
    if (!token) return
    try {
      const res = await window.api.task.getReminderStats(token)
      if (res.status === 'success' && res.data) {
        const s = res.data
        const showDev = s.reminderSections?.showDev !== false
        const showPl = s.reminderSections?.showPl !== false
        const devSum = showDev ? (s.devStats?.todayCount ?? 0) + (s.devStats?.tomorrowCount ?? 0) + (s.devStats?.nearDeadlineCount ?? 0) + (s.devStats?.overdueCount ?? 0) : 0
        const plSum = showPl ? (s.plStats?.needReviewCount ?? 0) + (s.plStats?.longUnreviewedCount ?? 0) : 0
        setReminderCount(devSum + plSum)
      } else {
        setReminderCount(0)
      }
    } catch {
      setReminderCount(0)
    }
  }, [token])

  useEffect(() => {
    if (token) void fetchReminderStats()
    else setReminderCount(0)
  }, [token, fetchReminderStats])

  useEffect(() => {
    const onRefresh = () => void fetchReminderStats()
    window.addEventListener('task-reminder-stats-refresh', onRefresh)
    return () => window.removeEventListener('task-reminder-stats-refresh', onRefresh)
  }, [fetchReminderStats])

  useEffect(() => {
    if (!user || isGuest) return
    const key = 'taskReminderShown'
    if (sessionStorage.getItem(key)) return
    if (reminderCount <= 0) return
    sessionStorage.setItem(key, '1')
    const timer = setTimeout(() => setShowReminderDialog(true), 600)
    return () => clearTimeout(timer)
  }, [user, isGuest, reminderCount])

  useEffect(() => {
    if (!user || isGuest) return
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const stored = localStorage.getItem('taskReminderSentDate')
    if (stored && user.id) {
      try {
        const { userId, date } = JSON.parse(stored) as { userId?: string; date?: string }
        if (userId === user.id && date === todayStr) return
      } catch {
        /* ignore */
      }
    }
    localStorage.setItem('taskReminderSentDate', JSON.stringify({ userId: user.id, date: todayStr }))
    window.api.task.sendDeadlineReminders().catch(() => { })
  }, [user, isGuest])

  const handleReminderOpenChange = useCallback(
    (open: boolean) => {
      setShowReminderDialog(open)
      if (!open) void fetchReminderStats()
    },
    [fetchReminderStats]
  )

  const openTaskDetailFromReminder = useCallback(
    (taskId: string) => {
      if (enableShellSwitcher && onShellViewChange) {
        if (tasksDetached) {
          window.api.taskManagement.openWindow()
          queueMicrotask(() => {
            window.dispatchEvent(new CustomEvent('open-task-from-reminder', { detail: { taskId } }))
          })
          return
        }
        onShellViewChange('tasks')
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent('open-task-from-reminder', { detail: { taskId } }))
        })
        return
      }
      setShowReminderDialog(false)
      navigate('/task-management', { state: { openTaskId: taskId } })
    },
    [enableShellSwitcher, navigate, onShellViewChange, tasksDetached]
  )

  const openSettingsDialog = () => {
    setShowSettings(true)
  }

  const openCleanDialog = () => {
    setShowClean(true)
  }

  const openMergeSvnWindow = () => {
    if (!isLoading) {
      window.api.electron.send(IPC.WINDOW.MERGE_SVN, undefined)
    }
  }

  const openConflictResolverWindow = () => {
    if (isLoading) return
    if (versionControlSystem === 'git') {
      if (gitContextPath) {
        void openGitConflictDiffFromStatus(gitContextPath)
      }
      return
    }
    window.api.electron.send(IPC.WINDOW.CONFLICT_RESOLVER, { versionControlSystem: 'svn' as const })
  }

  const openShowLogWindow = () => {
    if (!isLoading) {
      if (versionControlSystem === 'git' && !gitContextPathTrimmed) return
      const data: any = {
        path: '.',
      }

      if (versionControlSystem === 'svn') {
        data.currentRevision = svnInfo.curRevision
      }

      // Multi-repo Git: gửi path/sourceFolder theo repo đang active để Show Log dùng đúng repo
      if (versionControlSystem === 'git' && gitContextPath) {
        data.path = gitContextPath
        data.sourceFolder = gitContextPath
        data.versionControlSystem = 'git'
      }

      requestOpenShowLog(data)
    }
  }

  const canOpenEvmTool = Boolean(user && !isGuest && ['admin', 'pl', 'pm'].includes(user.role))
  const showVcsChrome = !hideVcsToolbar && (!enableShellSwitcher || shellView === 'vcs')
  const showWorkspaceRepoChrome = !hideVcsToolbar && (!enableShellSwitcher || shellView === 'vcs' || shellView === 'editor' || shellView === 'showLog')
  const showWorkspaceVcsActions = showWorkspaceRepoChrome && (shellView !== 'showLog' || versionControlSystem === 'git')
  const showTerminalToggle =
    Boolean(onTerminalToggle) &&
    (!enableShellSwitcher || shellView === 'editor') &&
    (terminalAvailable ?? ((!isMultiRepo && sourceFolders.length > 0 && !!currentFolder) || (isMultiRepo && !!gitContextPath)))

  const openEVMToolWindow = () => {
    if (isLoading) return
    if (user && !isGuest) {
      if (!canOpenEvmTool) return
      window.api.electron.send(IPC.WINDOW.EVM_TOOL, null)
    } else if (isGuest) {
      toast.warning(t('taskManagement.guestCannotAccess'))
    } else {
      onRequestLogin?.()
    }
  }

  const openDailyReportDialog = useCallback(async () => {
    if (isLoading) return
    if (isGuest) {
      toast.warning(t('taskManagement.guestCannotAccess'))
      return
    }
    if (!user) {
      onRequestLogin?.()
      return
    }
    if (user.role === 'admin' || user.role === 'pl' || user.role === 'pm') {
      window.api.reportManager.openWindow()
      return
    }
    setIsOpeningReportDialog(true)
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    try {
      const res = await window.api.dailyReport.getMine(todayStr)
      if (res.status === 'success' && res.data) {
        setEditReportInitialDate(todayStr)
        setEditReportInitialProjectId(res.data.projectId ?? null)
        const ids = res.data.projectIds?.length ? res.data.projectIds : res.data.projectId ? [res.data.projectId] : []
        setEditReportInitialProjectIds(ids)
      } else {
        setEditReportInitialDate(undefined)
        setEditReportInitialProjectId(undefined)
        setEditReportInitialProjectIds(undefined)
      }
    } catch {
      setEditReportInitialDate(undefined)
      setEditReportInitialProjectId(undefined)
      setEditReportInitialProjectIds(undefined)
    } finally {
      setIsOpeningReportDialog(false)
    }
    setReportDialogOpen(true)
  }, [isLoading, isGuest, user, onRequestLogin, t])

  const openMasterWindow = () => {
    if (isLoading) return
    if (user?.role === 'admin') {
      window.api.electron.send(IPC.WINDOW.MASTER, null)
    }
  }

  const handleLogoutClick = () => {
    setShowLogoutConfirmDialog(true)
  }

  const handleLogoutConfirm = async () => {
    setShowLogoutConfirmDialog(false)
    try {
      await window.api.user.logout()
    } catch {
      // Clear session even if API fails
    } finally {
      clearSession()
      // Đồng bộ UI ngay (không gọi saveConfigurationConfig — tránh ghi đè file bằng snapshot Zustand chưa load).
      setFieldConfiguration('multiRepoEnabled', false)
      window.api.configuration.patch({ multiRepoEnabled: false }).catch(() => { })
    }
  }

  const runPull = async (remote: string = 'origin', branch?: string, options?: { rebase?: boolean }): Promise<{ status: string } | undefined> => {
    if (!gitContextPath || isLoading || isGitPulling) return undefined
    const idAtStart = gitContextIdRef.current
    setIsGitPulling(true)
    setGitStreamingLog('')
    setGitIsStreaming(true)
    setGitUpdateResultFiles([])
    setGitDialogTitle(undefined)
    setGitOperationStatus(undefined)
    setShowGitUpdateResultDialog(true)
    const unsubscribe = window.api.git.onPullStream(chunk => setGitStreamingLog(prev => prev + chunk))
    try {
      const result = await window.api.git.pull(remote, branch, options, gitContextPath)
      setGitIsStreaming(false)
      unsubscribe()
      if (result.status === 'success') {
        const statusResult = await window.api.git.status({ cwd: gitContextPath })
        if (idAtStart === gitContextIdRef.current && statusResult.status === 'success') {
          setGitAhead(statusResult.data.ahead || 0)
          setGitBehind(statusResult.data.behind || 0)
        }
        if (idAtStart === gitContextIdRef.current) {
          const data = result.data as { pullResult?: string; updatedFiles?: { action: string; path: string }[] }
          setGitUpdateResultFiles(data?.updatedFiles ?? [])
          if (data?.pullResult) setGitStreamingLog(prev => prev || (data.pullResult ?? ''))
          setGitOperationStatus('success')
          setTimeout(() => toast.success(t('git.sync.pullSuccess')), 1000)
          window.dispatchEvent(new CustomEvent('git-pull-complete'))
        }
      } else {
        if (idAtStart === gitContextIdRef.current) {
          setGitOperationStatus('error')
          toast.error(result.message || t('git.sync.pullError'))
        }
      }
      return result
    } catch (error) {
      setGitIsStreaming(false)
      unsubscribe()
      if (idAtStart === gitContextIdRef.current) {
        setGitOperationStatus('error')
        toast.error(t('git.sync.pullError'))
      }
      logger.error('Git pull error:', error)
      return { status: 'error' }
    } finally {
      setTimeout(() => setIsGitPulling(false), 1000)
    }
  }

  const runPush = async (remote: string = 'origin', branch?: string, force?: boolean): Promise<{ status: string } | undefined> => {
    if (!gitContextPath || isLoading || isGitPushing) return undefined
    const idAtStart = gitContextIdRef.current
    setIsGitPushing(true)
    setGitStreamingLog('')
    setGitIsStreaming(true)
    setGitUpdateResultFiles([])
    setGitDialogTitle(t('dialog.updateResult.titlePush'))
    setGitOperationStatus(undefined)
    setShowGitUpdateResultDialog(true)
    const unsubscribe = window.api.git.onPushStream(chunk => setGitStreamingLog(prev => prev + chunk))
    try {
      const result = await window.api.git.push(remote, branch, undefined, gitContextPath, force)
      setGitIsStreaming(false)
      unsubscribe()
      if (result.status === 'success') {
        if (result.pushedHashes?.length) {
          window.api.gitCommitQueue.removeMany(result.pushedHashes).catch(err => logger.error('Xóa commit queue:', err))
        }
        const statusResult = await window.api.git.status({ cwd: gitContextPath })
        if (idAtStart === gitContextIdRef.current && statusResult.status === 'success') {
          setGitAhead(statusResult.data.ahead || 0)
          setGitBehind(statusResult.data.behind || 0)
        }
        if (idAtStart === gitContextIdRef.current) {
          setGitOperationStatus('success')
          setTimeout(() => toast.success(t('git.sync.pushSuccess')), 1000)
        }
      } else {
        if (idAtStart === gitContextIdRef.current) {
          if (result.message) setGitStreamingLog(prev => `${prev}\n${result.message}`)
          setGitOperationStatus('error')
          toast.error(result.message || t('git.sync.pushError'))
        }
      }
      return result
    } catch (error) {
      setGitIsStreaming(false)
      unsubscribe()
      if (idAtStart === gitContextIdRef.current) {
        const errMsg = error instanceof Error ? error.message : String(error)
        setGitStreamingLog(prev => `${prev}\n${errMsg}`)
        setGitOperationStatus('error')
        toast.error(t('git.sync.pushError'))
      }
      logger.error('Git push error:', error)
      return { status: 'error' }
    } finally {
      setTimeout(() => setIsGitPushing(false), 1000)
    }
  }

  const gitSync = async () => {
    const pullResult = await runPull('origin')
    if (pullResult?.status === 'success') await runPush('origin')
  }

  const gitPull = () => runPull('origin')
  const gitPullRebase = () => runPull('origin', undefined, { rebase: true })
  const gitPush = () => runPush('origin')

  const handleForcePushConfirm = () => {
    setShowForcePushConfirmDialog(false)
    void runPush('origin', undefined, true)
  }

  const runFetch = async (remote: string = 'origin', options?: { prune?: boolean; all?: boolean }) => {
    if (!gitContextPath || isLoading || isGitFetching) return
    const idAtStart = gitContextIdRef.current
    setIsGitFetching(true)
    setGitStreamingLog('')
    setGitIsStreaming(true)
    setGitUpdateResultFiles([])
    setGitDialogTitle(undefined)
    setGitOperationStatus(undefined)
    setShowGitUpdateResultDialog(true)
    const unsubscribe = window.api.git.onFetchStream(chunk => setGitStreamingLog(prev => prev + chunk))
    try {
      const result = await window.api.git.fetch(remote, options, gitContextPath)
      setGitIsStreaming(false)
      unsubscribe()
      if (result.status === 'success') {
        await checkGitStatus()
        if (idAtStart === gitContextIdRef.current) {
          setGitOperationStatus('success')
          setTimeout(() => toast.success(t('git.sync.fetchSuccess')), 1000)
          window.dispatchEvent(new CustomEvent('git-branch-changed'))
        }
      } else {
        if (idAtStart === gitContextIdRef.current) {
          setGitOperationStatus('error')
          toast.error(result.message || t('git.sync.fetchError'))
        }
      }
    } catch (error) {
      setGitIsStreaming(false)
      unsubscribe()
      if (idAtStart === gitContextIdRef.current) {
        setGitOperationStatus('error')
        toast.error(t('git.sync.fetchError'))
      }
      logger.error('Git fetch error:', error)
    } finally {
      setTimeout(() => setIsGitFetching(false), 1000)
    }
  }

  const gitUndoCommit = async () => {
    if (!gitContextPath || isLoading || gitAhead <= 0) {
      if (gitAhead === 0) toast.warning('Không có commit nào để hoàn tác')
      return
    }
    const idAtStart = gitContextIdRef.current
    try {
      const result = await window.api.git.undo_commit(gitContextPath)
      if (result.status === 'success') {
        const statusResult = await window.api.git.status({ cwd: gitContextPath })
        if (idAtStart === gitContextIdRef.current) {
          if (statusResult.status === 'success') {
            setGitAhead(statusResult.data.ahead || 0)
            setGitBehind(statusResult.data.behind || 0)
          }
          toast.success('Đã hoàn tác commit cuối cùng')
          window.dispatchEvent(
            new CustomEvent('git-undo-commit', {
              detail: { commitMessage: result.commitMessage ?? '' },
            })
          )
        }
      } else {
        if (idAtStart === gitContextIdRef.current) {
          toast.error(result.message || 'Không thể hoàn tác commit')
        }
      }
    } catch (error) {
      if (idAtStart === gitContextIdRef.current) {
        toast.error('Không thể hoàn tác commit')
      }
      logger.error('Git undo commit error:', error)
    }
  }

  const refreshBranchesFromRemote = useCallback(
    async (cwd: string, loadId: number, contextId: number) => {
      const applyBranches = (data: any) => {
        if (contextId !== gitContextIdRef.current) return
        setBranches(data)
      }

      const inflight = branchRemoteFetchRef.current
      if (inflight?.cwd === cwd) {
        setIsRefreshingBranchesRemote(true)
        try {
          await inflight.promise
        } finally {
          if (loadId === branchListLoadIdRef.current) setIsRefreshingBranchesRemote(false)
        }
        return
      }

      setIsRefreshingBranchesRemote(true)
      const entry = { cwd } as { cwd: string; promise: Promise<void> }
      entry.promise = (async () => {
        try {
          const pruneResult = await window.api.git.fetch('origin', { prune: true, all: true, skipUpdateCheck: true }, cwd)
          if (pruneResult.status !== 'success') {
            logger.warning('Fetch prune before branch list skipped or failed:', pruneResult.message)
          }
          const result = await window.api.git.get_branches(cwd)
          if (result.status === 'success') {
            applyBranches(result.data)
            logger.info('Branches loaded (remote refresh):', result.data)
          } else if (!branchesRef.current) {
            toast.error(result.message || t('git.branchListLoadError'))
          }
        } catch (error) {
          if (loadId !== branchListLoadIdRef.current || contextId !== gitContextIdRef.current) return
          logger.error('Error refreshing branches from remote:', error)
          if (!branchesRef.current) {
            toast.error(t('git.branchListLoadError'))
          }
        } finally {
          if (loadId === branchListLoadIdRef.current) {
            setIsRefreshingBranchesRemote(false)
          }
          if (branchRemoteFetchRef.current === entry) {
            branchRemoteFetchRef.current = null
          }
        }
      })()

      branchRemoteFetchRef.current = entry
      await entry.promise
    },
    [t]
  )

  const loadBranches = useCallback(
    async (options?: { background?: boolean; forceFetch?: boolean }) => {
      if (!gitContextPath) return

      const cwd = gitContextPath
      const loadId = ++branchListLoadIdRef.current
      const contextId = gitContextIdRef.current
      const hasCached = branchesRef.current != null

      const applyBranches = (data: any) => {
        if (loadId !== branchListLoadIdRef.current) return
        if (contextId !== gitContextIdRef.current) return
        setBranches(data)
      }

      const needsLocalSnapshot = !hasCached || options?.forceFetch
      const showBlockingLoader = needsLocalSnapshot && !options?.background

      if (showBlockingLoader) setIsLoadingBranches(true)

      try {
        if (needsLocalSnapshot) {
          const localResult = await window.api.git.get_branches(cwd)
          if (loadId !== branchListLoadIdRef.current || contextId !== gitContextIdRef.current) return
          if (localResult.status === 'success') {
            applyBranches(localResult.data)
            logger.info('Branches loaded (local snapshot):', localResult.data)
          } else {
            toast.error(localResult.message || t('git.branchListLoadError'))
          }
        }
      } catch (error) {
        if (loadId !== branchListLoadIdRef.current || contextId !== gitContextIdRef.current) return
        logger.error('Error loading local branches:', error)
        if (!hasCached) toast.error(t('git.branchListLoadError'))
      } finally {
        if (showBlockingLoader) setIsLoadingBranches(false)
      }

      await refreshBranchesFromRemote(cwd, loadId, contextId)
    },
    [gitContextPath, refreshBranchesFromRemote, t]
  )

  const prefetchBranchList = useCallback(() => {
    if (!gitContextPath) return
    void loadBranches({ background: true })
  }, [gitContextPath, loadBranches])

  // Kiểm tra và detect branch changes (do app khác hoặc lệnh command line switch)
  const checkBranchChanges = async () => {
    if (versionControlSystem !== 'git' || !gitContextPath) return

    const idAtStart = gitContextIdRef.current
    try {
      const result = await window.api.git.get_branches(gitContextPath)
      if (idAtStart !== gitContextIdRef.current) return
      if (result.status === 'success' && result.data?.current) {
        const newBranch = result.data.current
        const oldBranch = previousBranchRef.current

        if (oldBranch && newBranch !== oldBranch) {
          logger.info(`Branch changed from ${oldBranch} to ${newBranch}`)
          setCurrentBranch(newBranch)
          previousBranchRef.current = newBranch
          toast.info(`Branch đã được chuyển sang: ${newBranch}`)
          window.dispatchEvent(
            new CustomEvent('git-branch-changed', {
              detail: { oldBranch, newBranch },
            })
          )
        } else if (!oldBranch) {
          previousBranchRef.current = newBranch
        }
      }
    } catch (error) {
      if (idAtStart !== gitContextIdRef.current) return
      logger.error('Error checking branch changes:', error)
    }
  }

  const switchBranch = async (branchName: string) => {
    if (branchName === currentBranch || !gitContextPath) return

    const doSwitch = async () => {
      try {
        // Try checkout first; Git only fails when local changes would be overwritten
        // (untracked files that don't conflict, or only staged new files, switch normally)
        const result = await window.api.git.checkout_branch(branchName, undefined, gitContextPath)

        if (result.status === 'error' && result.data?.hasUncommittedChanges) {
          setPendingBranchSwitch(branchName)
          const rawFiles = result.data.files || []
          setUncommittedFiles(
            Array.isArray(rawFiles)
              ? rawFiles.map((file: any) => ({
                filePath: typeof file === 'string' ? file : file.path,
                status: file.working_dir ?? file.index ?? 'M',
              }))
              : []
          )
          setShowGitSwitchBranchDialog(true)
          return
        }

        if (result.status === 'success') {
          toast.success(`Đã chuyển sang branch ${branchName}`)
          await refreshGitStatus()
        } else {
          toast.error(result.message || 'Không thể chuyển branch')
        }
      } catch (error) {
        logger.error('Error switching branch:', error)
        toast.error('Không thể chuyển branch')
      }
    }

    runWithEditorGuard(doSwitch)
  }

  const handleStashAndSwitch = async () => {
    if (!gitContextPath) return
    try {
      setShowGitSwitchBranchDialog(false)
      toast.info(`Đang stash và chuyển sang branch ${pendingBranchSwitch}...`)
      const result = await window.api.git.checkout_branch(pendingBranchSwitch, { stash: true }, gitContextPath)

      if (result.status === 'success') {
        setPendingBranchSwitch('')
        setUncommittedFiles([])
        toast.success(`Đã stash và chuyển sang branch ${pendingBranchSwitch}`)
        await refreshGitStatus()
        await loadStashCount()
      } else {
        toast.error(result.message || 'Không thể stash và chuyển branch')
      }
    } catch (error) {
      logger.error('Error stash and switch:', error)
      toast.error('Không thể stash và chuyển branch')
    }
  }

  const handleForceSwitch = async () => {
    if (!gitContextPath) return
    try {
      setShowGitSwitchBranchDialog(false)
      toast.info(`Đang force chuyển sang branch ${pendingBranchSwitch}...`)
      const result = await window.api.git.checkout_branch(pendingBranchSwitch, { force: true }, gitContextPath)

      if (result.status === 'success') {
        setPendingBranchSwitch('')
        setUncommittedFiles([])
        toast.success(`Đã chuyển sang branch ${pendingBranchSwitch}`)
        await refreshGitStatus()
      } else {
        toast.error(result.message || 'Không thể force chuyển branch')
      }
    } catch (error) {
      logger.error('Error force switch:', error)
      toast.error('Không thể force chuyển branch')
    }
  }

  const handleCancelSwitch = () => {
    setShowGitSwitchBranchDialog(false)
    setPendingBranchSwitch('')
    setUncommittedFiles([])
  }

  const refreshGitStatus = async () => {
    if (!gitContextPath) return
    const idAtStart = gitContextIdRef.current
    const statusResult = await window.api.git.status({ cwd: gitContextPath })
    if (idAtStart !== gitContextIdRef.current) return
    if (statusResult.status === 'success') {
      const newBranch = statusResult.data.current || ''
      setCurrentBranch(newBranch)
      previousBranchRef.current = newBranch
      setGitAhead(statusResult.data.ahead || 0)
      setGitBehind(statusResult.data.behind || 0)
      const n = statusResult.data.conflicted?.length ?? 0
      setGitConflictCount(n)
      setHasGitConflict(n > 0)
    } else {
      setHasGitConflict(false)
      setGitConflictCount(0)
    }
    // Trigger reload of main page data
    window.dispatchEvent(new CustomEvent('git-branch-changed'))
  }

  const loadStashCount = async () => {
    const idAtStart = gitContextIdRef.current
    const cwd = gitContextPath ?? undefined
    try {
      const result = await window.api.git.stash_list(cwd)
      if (idAtStart !== gitContextIdRef.current) return
      if (result.status === 'success') {
        setStashCount(result.data?.length || 0)
      }
    } catch (error) {
      if (idAtStart !== gitContextIdRef.current) return
      logger.error('Error loading stash count:', error)
    }
  }

  const handleFolderChange = async (folderName: string) => {
    if (isChangingFolder) return

    const folder = sourceFolders.find(f => f.name === folderName)
    if (!folder) {
      toast.error(`Folder "${folderName}" không tìm thấy trong danh sách`)
      return
    }

    const applyFolderChange = async () => {
      setIsChangingFolder(true)
      const startTime = Date.now()
      try {
        setCurrentFolder(folderName)
        localStorage.setItem('current-source-folder', folderName)
        setFieldConfiguration('sourceFolder', folder.path)

        // Dùng cache folderVCSTypes đã detect khi load - tránh gọi detect_version_control lại (execSync ~200-500ms)
        const cachedVcs = folderVCSTypes[folderName]
        if (cachedVcs && cachedVcs !== 'none') {
          setFieldConfiguration('versionControlSystem', cachedVcs)
          await saveConfigurationConfig()
          window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration' } }))
          return
        }
        if (cachedVcs === 'none') {
          await saveConfigurationConfig()
          window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration', clearData: true } }))
          return
        }

        // Fallback: folder mới chưa có trong cache (hiếm khi xảy ra)
        const detectResult = await window.api.system.detect_version_control(folder.path)
        if (detectResult.status === 'success' && detectResult.data) {
          const { type: detectedType, isValid } = detectResult.data
          if (isValid && detectedType !== 'none') {
            setFieldConfiguration('versionControlSystem', detectedType as 'svn' | 'git')
            await saveConfigurationConfig()
            window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration' } }))
          } else {
            toast.warning(`Folder "${folderName}" không phải Git hoặc SVN repository`)
            await saveConfigurationConfig()
            window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration', clearData: true } }))
          }
        } else {
          toast.error('Không thể phát hiện loại repository')
          await saveConfigurationConfig()
          window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration', clearData: true } }))
        }
      } catch (error) {
        logger.error('Error changing folder:', error)
        const errMsg = error instanceof Error ? error.message : String(error)
        toast.error(`Không thể thay đổi folder: ${errMsg}`)
        // Revert: reload config từ file (chưa lưu được) rồi sync currentFolder
        try {
          await loadConfigurationConfig()
          const cfgPath = useConfigurationStore.getState().sourceFolder
          const prevFolder = sourceFolders.find(f => normalizePathForCompare(f.path) === normalizePathForCompare(cfgPath))?.name ?? sourceFolders[0]?.name
          if (prevFolder) {
            setCurrentFolder(prevFolder)
            localStorage.setItem('current-source-folder', prevFolder)
          }
        } catch (revertErr) {
          logger.error('Error reverting folder state:', revertErr)
        }
      } finally {
        // Đảm bảo loading hiển thị ít nhất 400ms để user thấy được
        const elapsed = Date.now() - startTime
        const minVisibleMs = 400
        if (elapsed < minVisibleMs) {
          await new Promise(r => setTimeout(r, minVisibleMs - elapsed))
        }
        setIsChangingFolder(false)
      }
    }

    runWithEditorGuard(applyFolderChange)
  }

  const openSvnUpdateDialog = () => {
    setIsSvnDialogManuallyOpened(true)
    setShowSvnUpdateDialog(true)
  }

  const handleCurRevisionUpdate = (revision: string) => {
    setSvnInfo(prev => ({
      ...prev,
      curRevision: revision,
    }))
    setShowSvnUpdateDialog(false)
    setHasSvnUpdate(false)
  }

  // Function để refresh VCS info (với log realtime trong VcsOperationLogDialog)
  const handleRefreshVCS = async () => {
    if (isRefreshing || !currentFolder) return

    const vcsType = folderVCSTypes[currentFolder]
    if (!vcsType || vcsType === 'none') {
      toast.warning('Folder hiện tại không phải Git hoặc SVN repository')
      return
    }

    setIsRefreshing(true)
    setRefreshVcsType(vcsType)
    setRefreshStreamingLog('')
    setRefreshIsStreaming(true)
    setRefreshOperationStatus(undefined)
    setShowRefreshLogDialog(true)

    let refreshHadError = false
    try {
      logger.info(`Refreshing VCS info for folder: ${currentFolder} (${vcsType})`)

      if (vcsType === 'git') {
        const cwd = gitContextPath ?? undefined
        const unsubscribe = window.api.git.onFetchStream(chunk => {
          setRefreshStreamingLog(prev => prev + chunk)
        })
        try {
          const fetchResult = await window.api.git.fetch('origin', undefined, cwd)
          if (fetchResult.status === 'success') {
            setRefreshStreamingLog(prev => `${prev}\n${t('dialog.updateResult.checkingStatus')}\n`)
            await checkGitStatus()
            setRefreshOperationStatus('success')
          } else {
            setRefreshOperationStatus('error')
            refreshHadError = true
            toast.error(fetchResult.message || 'Git fetch thất bại')
          }
        } finally {
          unsubscribe()
        }
        window.dispatchEvent(new CustomEvent('git-branch-changed'))
      } else {
        const unsubscribe = window.api.svn.onInfoStream(chunk => {
          setRefreshStreamingLog(prev => prev + chunk)
        })
        try {
          const { status, data, message } = await window.api.svn.infoWithStream('.')
          if (status === 'success') {
            setHasSvnUpdate(true)
            setSvnInfo(data)
            setIsSvnDialogManuallyOpened(false)
            setShowSvnUpdateDialog(true)
            setRefreshOperationStatus('success')
          } else if (status === 'no-change') {
            setHasSvnUpdate(false)
            setSvnInfo(data)
            setRefreshOperationStatus('success')
          } else if (status === 'error') {
            setRefreshOperationStatus('error')
            refreshHadError = true
            toast.error(message || 'SVN info thất bại')
          }
        } finally {
          unsubscribe()
        }
      }

      setRefreshIsStreaming(false)
      window.dispatchEvent(
        new CustomEvent('configuration-changed', {
          detail: { type: 'configuration' },
        })
      )
      if (!refreshHadError) toast.success('Đã làm mới thông tin thành công')
    } catch (error) {
      logger.error('Error refreshing VCS info:', error)
      setRefreshOperationStatus('error')
      toast.error('Không thể làm mới thông tin')
      setRefreshIsStreaming(false)
    } finally {
      setTimeout(() => {
        setIsRefreshing(false)
      }, 500)
    }
  }

  const reminderBellControl = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          id="task-reminders-button"
          variant="ghost"
          size="sm"
          onClick={() => setShowReminderDialog(true)}
          className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors rounded-sm h-[25px] w-[25px] p-0 relative text-orange-600 dark:text-orange-400 hover:bg-orange-100/90 dark:hover:bg-orange-950/60 hover:text-orange-800 dark:hover:text-orange-200"
        >
          <Bell strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4 shrink-0" />
          {reminderCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-orange-700 text-white dark:bg-orange-500 text-[10px] font-semibold tabular-nums px-1 shadow-sm leading-none">
              {reminderCount > 99 ? '99+' : reminderCount}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent sideOffset={4} className="max-w-[min(280px,90vw)]">
        {t('taskManagement.reminderTitle')}
      </TooltipContent>
    </Tooltip>
  )

  const gitBranchLeftToolbarControls =
    showGitRepoChrome && currentBranch && (!enableShellSwitcher || shellView === 'vcs') ? (
      <>
        <Separator orientation="vertical" className="h-4 w-px bg-muted mx-0.5 shrink-0" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              id="git-branch-manage-button"
              variant="link"
              size="sm"
              onClick={() => setShowGitBranchManageDialog(true)}
              className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
            >
              <GitBranchPlus strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4 text-green-600 dark:text-green-400" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{activeRepoLabel ? t('git.branchManage.titleForRepo', { repo: activeRepoLabel }) : t('git.branchManage.title')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              id="titlebar-git-cherry-pick-branches-button"
              type="button"
              variant="link"
              size="sm"
              onClick={() => setCherryPickOpen(true)}
              className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors rounded-sm h-[25px] w-[25px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-300"
            >
              <ListOrdered strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('git.cherryPickBranches.tooltip')}</TooltipContent>
        </Tooltip>
      </>
    ) : null

  const appUpdateButton = showIconUpdateApp ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          id="app-update-button"
          variant="link"
          size="sm"
          onClick={checkForUpdates}
          className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors rounded-sm h-[25px] w-[25px] relative no-underline hover:no-underline hover:bg-muted shrink-0"
        >
          <svg width={0} height={0} className="absolute pointer-events-none" aria-hidden>
            <defs>
              <linearGradient id="titlebar-app-update-stroke-grad" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="objectBoundingBox">
                <animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="5s" repeatCount="indefinite" />
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="50%" stopColor="#f97316" />
                <stop offset="100%" stopColor="#facc15" />
              </linearGradient>
            </defs>
          </svg>
          <span className="titlebar-update-icon-anim">
            <CircleArrowDown strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" stroke="url(#titlebar-app-update-stroke-grad)" />
          </span>
          {status === 'downloaded' && <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{status === 'downloaded' ? t('title.checkForUpdate1', { 0: newAppVersion }) : t('title.checkForUpdate')}</TooltipContent>
    </Tooltip>
  ) : null

  return (
    <>
      {/* Dialogs */}
      {showReminderDialog && (
        <Suspense fallback={null}>
          <TaskReminderDialog open={showReminderDialog} onOpenChange={handleReminderOpenChange} onOpenTaskDetail={openTaskDetailFromReminder} />
        </Suspense>
      )}
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
      <CleanDialog open={showClean} onOpenChange={setShowClean} />
      <UpdateDialog
        open={showUpdateDialog}
        onOpenChange={setShowUpdateDialog}
        currentVersion={appVersion}
        newVersion={newAppVersion}
        releaseNotes={releaseNotes}
        isManuallyOpened={isUpdateDialogManuallyOpened}
      />
      <NewRevisionDialog
        open={showSvnUpdateDialog}
        onOpenChange={setShowSvnUpdateDialog}
        onCurRevisionUpdate={handleCurRevisionUpdate}
        isManuallyOpened={isSvnDialogManuallyOpened}
      />
      <VcsOperationLogDialog
        open={showGitUpdateResultDialog}
        onOpenChange={setShowGitUpdateResultDialog}
        vcsType="git"
        updatedFiles={gitUpdateResultFiles}
        streamingLog={gitStreamingLog}
        isStreaming={gitIsStreaming}
        title={gitDialogTitle}
        completionMessage={gitDialogTitle ? t('dialog.updateResult.completedPush') : undefined}
        operationStatus={gitOperationStatus}
        failureMessage={gitDialogTitle ? 'dialog.updateResult.failedPush' : 'dialog.updateResult.failedGit'}
        folderPath={gitContextPath ?? currentFolder ?? undefined}
      />
      <VcsOperationLogDialog
        open={showRefreshLogDialog}
        onOpenChange={setShowRefreshLogDialog}
        vcsType={refreshVcsType}
        streamingLog={refreshStreamingLog}
        isStreaming={refreshIsStreaming}
        title={refreshVcsType === 'git' ? t('dialog.updateResult.titleRefreshGit') : t('dialog.updateResult.titleRefreshSvn')}
        completionMessage="dialog.updateResult.completedRefresh"
        operationStatus={refreshOperationStatus}
        failureMessage="dialog.updateResult.failedRefresh"
        folderPath={currentFolder ?? undefined}
      />
      <GitSwitchBranchDialog
        open={showGitSwitchBranchDialog}
        onOpenChange={setShowGitSwitchBranchDialog}
        currentBranch={currentBranch}
        targetBranch={pendingBranchSwitch}
        changedFiles={uncommittedFiles}
        onStashAndSwitch={handleStashAndSwitch}
        onForceSwitch={handleForceSwitch}
        onCancel={handleCancelSwitch}
      />
      <GitStashDialog
        open={showGitStashDialog}
        onOpenChange={setShowGitStashDialog}
        onStashApplied={() => {
          window.dispatchEvent(new CustomEvent('git-branch-changed'))
          loadStashCount()
        }}
        cwd={gitContextPath ?? undefined}
      />
      <GitBranchManageDialog
        open={showGitBranchManageDialog}
        onOpenChange={setShowGitBranchManageDialog}
        currentBranch={currentBranch}
        onSuccess={() => {
          loadBranches({ forceFetch: true })
          refreshGitStatus()
        }}
        cwd={gitContextPath ?? undefined}
        repoChoices={branchManageRepoChoices}
      />
      <GitRemoteBranchDialog
        open={showPullFromDialog}
        onOpenChange={setShowPullFromDialog}
        mode="pull"
        currentBranch={currentBranch}
        onConfirm={async (remote, branch) => {
          await runPull(remote, branch)
        }}
        cwd={gitContextPath ?? undefined}
      />
      <GitRemoteBranchDialog
        open={showPushToDialog}
        onOpenChange={setShowPushToDialog}
        mode="push"
        currentBranch={currentBranch}
        onConfirm={async (remote, branch) => {
          await runPush(remote, branch)
        }}
        cwd={gitContextPath ?? undefined}
      />
      <GitCherryPickBranchesDialog
        open={cherryPickOpen}
        onOpenChange={setCherryPickOpen}
        selectedSourceFolder={gitContextPathTrimmed || null}
        onComplete={() => {
          window.dispatchEvent(new CustomEvent('git-branch-changed'))
          refreshGitStatus()
        }}
      />
      <AlertDialog open={showLogoutConfirmDialog} onOpenChange={setShowLogoutConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('taskManagement.logoutConfirmWhenTaskOpen')}</AlertDialogTitle>
            <AlertDialogDescription>{t('taskManagement.logoutConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogoutConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('taskManagement.logout')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showForcePushConfirmDialog} onOpenChange={setShowForcePushConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('git.sync.pushForceConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('git.sync.pushForceConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleForcePushConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-6xl! max-h-[90vh]! overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editReportInitialDate ? t('dailyReport.editReport') : t('dailyReport.createReport')}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto pr-2">
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <DevReportForm
                initialReportDate={editReportInitialDate}
                initialProjectId={editReportInitialProjectId}
                initialProjectIds={editReportInitialProjectIds}
                refreshKey={reportRefreshKey}
                onSuccess={() => {
                  setReportDialogOpen(false)
                  setReportRefreshKey(k => k + 1)
                }}
                isPlOrAdmin={user?.role === 'pl' || user?.role === 'pm' || user?.role === 'admin'}
              />
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>
      <div
        className="flex items-center h-8 text-sm select-none w-full min-w-0 gap-1"
        style={
          {
            WebkitAppRegion: 'drag',
            backgroundColor: isAdmin ? 'color-mix(in srgb, var(--main-bg) 90%, #dc2626 10%)' : 'var(--main-bg)',
            color: 'var(--main-fg)',
          } as React.CSSProperties
        }
      >
        {/* Left: logo + Workspace|Tasks (sát logo) + icon theo tab */}
        <div className="flex items-center h-full shrink-0 min-w-0 gap-0.5">
          <div className="w-10 h-6 flex justify-center items-center shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center p-0 border-0 bg-transparent cursor-default rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--main-bg)]"
                  aria-label="Giờ Việt Nam (ICT) và Nhật Bản (JST) — di chuột để xem chi tiết"
                >
                  <img src="logo.png" alt="" draggable="false" className="w-3.5 h-3.5 dark:brightness-130 pointer-events-none" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6} className="max-w-[min(320px,92vw)] bg-popover p-2 text-popover-foreground shadow-md">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2.5">
                    <Badge variant="secondary" className="shrink-0 rounded-md px-1! py-0! text-[12px] font-semibold uppercase tracking-wide tabular-nums shadow-none">
                      <TitleBarClockFlagVn size={16} />
                      ICT
                    </Badge>
                    <p className="min-w-0 flex-1 text-[12px] text-foreground tabular-nums flex items-center gap-1">
                      {new Intl.DateTimeFormat('vi-VN', {
                        timeZone: 'Asia/Ho_Chi_Minh',
                        dateStyle: 'long',
                        timeStyle: 'medium',
                      }).format(titleBarClock)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Badge variant="secondary" className="shrink-0 rounded-md px-1! py-0! text-[12px] font-semibold uppercase tracking-wide tabular-nums shadow-none">
                      <TitleBarClockFlagJp size={16} />
                      JST
                    </Badge>
                    <p className="min-w-0 flex-1 text-[12px] text-foreground tabular-nums flex items-center gap-1">
                      {new Intl.DateTimeFormat('ja-JP', {
                        timeZone: 'Asia/Tokyo',
                        dateStyle: 'long',
                        timeStyle: 'medium',
                      }).format(titleBarClock)}
                    </p>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center h-full min-w-0 gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {enableShellSwitcher && onShellViewChange && (
              <ShellTabSwitcher
                shellView={shellView}
                onShellViewChange={onShellViewChange}
                tasksDetached={tasksDetached}
                prManagerDetached={prManagerDetached}
                automationDetached={automationDetached}
                devPipelinesDetached={devPipelinesDetached}
                showLogDetached={showLogDetached}
              />
            )}
            {enableShellSwitcher && automationDetached && onAutomationDock && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className={shellTabDockButtonClass('automation')} onClick={onAutomationDock}>
                    <Bot strokeWidth={1.25} absoluteStrokeWidth className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('mainShell.automationDockTooltip')}</TooltipContent>
              </Tooltip>
            )}
            {enableShellSwitcher && devPipelinesDetached && onDevPipelinesDock && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className={shellTabDockButtonClass('devPipelines')} onClick={onDevPipelinesDock}>
                    <Rocket strokeWidth={1.25} absoluteStrokeWidth className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('mainShell.devPipelinesDockTooltip', 'Dock Dev Pipelines back to main window')}</TooltipContent>
              </Tooltip>
            )}
            {enableShellSwitcher && showLogDetached && onShowLogDock && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className={shellTabDockButtonClass('showLog')} onClick={onShowLogDock}>
                    <History strokeWidth={1.25} absoluteStrokeWidth className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('mainShell.showLogDockTooltip', 'Dock Show Log back to main window')}</TooltipContent>
              </Tooltip>
            )}
            {enableShellSwitcher && prManagerDetached && onPrManagerDock && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className={shellTabDockButtonClass('prManager')} onClick={onPrManagerDock}>
                    <GitPullRequest strokeWidth={1.25} absoluteStrokeWidth className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('mainShell.prManagerDockTooltip')}</TooltipContent>
              </Tooltip>
            )}
            {enableShellSwitcher && tasksDetached && onTasksDock && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className={shellTabDockButtonClass('tasks')} onClick={onTasksDock}>
                    <CheckSquare strokeWidth={1.25} absoluteStrokeWidth className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('mainShell.tasksDockTooltip')}</TooltipContent>
              </Tooltip>
            )}
            {enableShellSwitcher && (shellView === 'vcs' || shellView === 'editor') && user && !isGuest && (
              <>
                <Separator orientation="vertical" className="h-4 w-px bg-muted mx-0.5 shrink-0" />
                {reminderBellControl}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      id="daily-report-button"
                      variant="link"
                      size="sm"
                      onClick={openDailyReportDialog}
                      disabled={isOpeningReportDialog}
                      className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors rounded-sm h-[25px] w-[25px] text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-300"
                    >
                      {isOpeningReportDialog ? (
                        <Loader2 strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4 animate-spin" />
                      ) : (
                        <ClipboardList strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isOpeningReportDialog ? t('common.loading', 'Đang tải ...') : t('dailyReport.open')}</TooltipContent>
                </Tooltip>
                {gitBranchLeftToolbarControls}
              </>
            )}
            {/* Settings trên bar khi guest */}
            {isGuest && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    id="settings-button"
                    variant="link"
                    size="sm"
                    onClick={openSettingsDialog}
                    className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors rounded-sm h-[25px] w-[25px] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    <Settings2 strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('title.settings')}</TooltipContent>
              </Tooltip>
            )}

            {showVcsChrome && (
              <>
                <Separator orientation="vertical" className="h-4 w-px bg-muted mx-0.5 shrink-0" />

                {showGitPathToolbarActions && !(enableShellSwitcher && user && !isGuest) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        id="svn-log-button"
                        variant="link"
                        size="sm"
                        onClick={openShowLogWindow}
                        className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors rounded-sm h-[25px] w-[25px] text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        <History strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('title.showLogsSvn')}</TooltipContent>
                  </Tooltip>
                )}

                {user && !isGuest && !(enableShellSwitcher && shellView === 'vcs') && (
                  <>
                    <Separator orientation="vertical" className="h-4 w-px bg-muted mx-0.5 shrink-0" />
                    {reminderBellControl}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          id="daily-report-button"
                          variant="link"
                          size="sm"
                          onClick={openDailyReportDialog}
                          disabled={isOpeningReportDialog}
                          className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors rounded-sm h-[25px] w-[25px] text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-300"
                        >
                          {isOpeningReportDialog ? (
                            <Loader2 strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4 animate-spin" />
                          ) : (
                            <ClipboardList strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isOpeningReportDialog ? t('common.loading', 'Đang tải ...') : t('dailyReport.open')}</TooltipContent>
                    </Tooltip>
                    {gitBranchLeftToolbarControls}
                  </>
                )}
              </>
            )}

            {user && !isGuest && enableShellSwitcher && shellView === 'tasks' && !tasksDetached && (
              <>
                <Separator orientation="vertical" className="h-4 w-px bg-muted mx-0.5 shrink-0" />
                {reminderBellControl}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      id="daily-report-button"
                      variant="link"
                      size="sm"
                      onClick={openDailyReportDialog}
                      disabled={isOpeningReportDialog}
                      className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors rounded-sm h-[25px] w-[25px] text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-300"
                    >
                      {isOpeningReportDialog ? (
                        <Loader2 strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4 animate-spin" />
                      ) : (
                        <ClipboardList strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isOpeningReportDialog ? t('common.loading', 'Đang tải ...') : t('dailyReport.open')}</TooltipContent>
                </Tooltip>
                {gitBranchLeftToolbarControls}
                {canOpenEvmTool && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        id="evm-tool-button"
                        variant="link"
                        size="sm"
                        onClick={openEVMToolWindow}
                        className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors rounded-sm h-[25px] w-[25px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-300"
                      >
                        <LineChart strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('evm.open')}</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
          </div>
        </div>

        {/* Download Progress — sát trái (sau logo / shell), trước vùng giữa flex-1 */}
        {status === 'downloading' && (
          <div className="flex shrink-0 items-center gap-2 px-2 py-1 bg-muted rounded text-xs" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <CircleArrowDown className="h-3 w-3 animate-pulse shrink-0" />
            <Progress value={downloadProgress} className="w-10 h-1.5 shrink-0" />
            <span className="text-[10px] tabular-nums shrink-0">{downloadProgress.toFixed(2)}%</span>
            <span className="text-[10px] tabular-nums shrink-0">{formatDownloadMb(downloadSpeed)} MB/s</span>
            <span className="text-[10px] tabular-nums shrink-0">ETA: {downloadEta}</span>
            <span className="text-[10px] opacity-75 tabular-nums shrink-0">
              {formatDownloadMb(downloadedMB)} / {formatDownloadMb(totalMB)} MB
            </span>
          </div>
        )}

        {/* Task toolbar / PR Manager top bar (portal) — giữa trái và phải */}
        {enableShellSwitcher && shellView === 'tasks' && !tasksDetached && taskToolbarHostRef ? (
          <div
            ref={taskToolbarHostRef}
            className="flex-1 min-w-0 flex items-center h-full overflow-x-auto overflow-y-hidden gap-2 px-1"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          />
        ) : enableShellSwitcher && shellView === 'prManager' && !prManagerDetached && prManagerToolbarHostRef ? (
          <div
            ref={prManagerToolbarHostRef}
            className="flex min-w-0 flex-1 basis-0 w-full items-center h-full overflow-x-auto overflow-y-hidden gap-0 px-0"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          />
        ) : enableShellSwitcher && shellView === 'automation' && !automationDetached && automationToolbarHostRef ? (
          <div
            ref={automationToolbarHostRef}
            className="flex min-w-0 flex-1 basis-0 w-full items-center h-full overflow-x-auto overflow-y-hidden gap-0 px-0"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          />
        ) : enableShellSwitcher && shellView === 'devPipelines' && !devPipelinesDetached && devPipelinesToolbarHostRef ? (
          <div
            ref={devPipelinesToolbarHostRef}
            className="flex min-w-0 flex-1 basis-0 w-full items-center h-full overflow-x-auto overflow-y-hidden gap-0 px-0"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          />
        ) : enableShellSwitcher && shellView === 'showLog' && !showLogDetached && showLogToolbarHostRef ? (
          <div
            ref={showLogToolbarHostRef}
            className="flex min-w-0 flex-1 basis-0 w-full items-center h-full overflow-x-auto overflow-y-hidden gap-0 px-0"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          />
        ) : (
          <div className="flex-1 min-w-0 shrink" aria-hidden style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
        )}

        <div className="flex shrink-0 items-center gap-1 h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {showTerminalToggle && (
            <div className="flex items-center gap-0.5 px-1 pr-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => onTerminalToggle?.()}
                    className={cn(
                      'shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]',
                      terminalOpen && 'bg-muted'
                    )}
                  >
                    <Terminal strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t('title.openTerminal')}
                  <span className="ml-1 text-muted-foreground">({t('title.openTerminalShortcut')})</span>
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          {showWorkspaceRepoChrome && (
            <WorkspaceRepoChrome
              shellView={shellView}
              branchMode={branchMode}
              sourceFolders={sourceFolders}
              currentFolder={currentFolder}
              versionControlSystem={versionControlSystem}
              onRefreshVCS={handleRefreshVCS}
              isRefreshing={isRefreshing}
              user={user}
              isMultiRepo={isMultiRepo}
              isMultiRepoWorkspace={isMultiRepoWorkspace}
              projects={projects}
              selectedProjectId={selectedProjectId}
              isProjectsLoading={isProjectsLoading}
              isSourceFoldersLoading={isSourceFoldersLoading}
              loadProjects={loadProjects}
              onProjectSelect={handleProjectSelect}
              runWithEditorGuard={runWithEditorGuard}
              multiRepoLabels={multiRepoLabels}
              multiRepoPaths={multiRepoPaths}
              enableShellSwitcher={enableShellSwitcher}
              onMultiRepoActiveChange={onMultiRepoActiveChange}
              multiRepoActiveTab={multiRepoActiveTab}
              refreshSourceFoldersList={refreshSourceFoldersList}
              isChangingFolder={isChangingFolder}
              isLoading={isLoading}
              onFolderChange={handleFolderChange}
              folderVCSTypes={folderVCSTypes}
              showGitRepoChrome={showGitRepoChrome}
              currentBranch={currentBranch}
              gitLogRevision={gitLogRevision}
              gitAhead={gitAhead}
              gitBehind={gitBehind}
              activeRepoLabel={activeRepoLabel}
              loadBranches={loadBranches}
              prefetchBranchList={prefetchBranchList}
              isRefreshingBranchesRemote={isRefreshingBranchesRemote}
              isLoadingBranches={isLoadingBranches}
              branches={branches}
              onLogRefSelect={handleLogRefSelect}
              onSwitchBranch={switchBranch}
            >
              {showWorkspaceVcsActions ? (
              <div className="flex items-center gap-1 pt-0.5">
                {versionControlSystem === 'svn' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        id="svn-update-button"
                        variant="link"
                        size="sm"
                        onClick={openSvnUpdateDialog}
                        className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px] relative"
                      >
                        <SquareArrowDown strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                        {hasSvnUpdate && <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {hasSvnUpdate ? t('title.updateSvn1', { 0: svnInfo?.revision, 1: svnInfo?.curRevision }) : t('title.updateSvn', { 0: svnInfo?.revision })}
                    </TooltipContent>
                  </Tooltip>
                )}

                {versionControlSystem === 'svn' ? (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          id="svn-merge-button"
                          variant="link"
                          size="sm"
                          onClick={openMergeSvnWindow}
                          className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
                        >
                          <GitMerge strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('title.mergeSvn')}</TooltipContent>
                    </Tooltip>
                    {hasSvnConflict && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            id="svn-conflict-button"
                            variant="link"
                            size="sm"
                            onClick={openConflictResolverWindow}
                            className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
                          >
                            <FileWarning strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('title.resolveConflicts')}</TooltipContent>
                      </Tooltip>
                    )}

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          id="svn-clean-button"
                          variant="link"
                          size="sm"
                          onClick={openCleanDialog}
                          className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
                        >
                          <Eraser strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('title.cleanSvn')}</TooltipContent>
                    </Tooltip>
                  </>
                ) : showGitRepoChrome ? (
                  <>
                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button
                              id="git-sync-dropdown"
                              variant="link"
                              size="sm"
                              disabled={isGitFetching || isGitPulling || isGitPushing}
                              className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px] relative overflow-visible"
                            >
                              {isGitPulling || isGitPushing ? (
                                <Loader2 strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4 animate-spin" />
                              ) : gitAhead > 0 && gitBehind > 0 ? (
                                <ArrowDownUp strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                              ) : gitAhead > 0 ? (
                                <ArrowUp strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                              ) : gitBehind > 0 ? (
                                <ArrowDown strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                              ) : (
                                <RefreshCcw strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                              )}
                              {gitAhead > 0 && !isGitPushing && (
                                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[12px] h-[12px] px-0.5 text-[8px] font-bold text-white bg-green-600 dark:bg-green-500 rounded-full border border-background">
                                  {gitAhead > 99 ? '99+' : gitAhead}
                                </span>
                              )}
                              {gitBehind > 0 && !isGitPulling && (
                                <span className="absolute -top-0.5 -left-0.5 flex items-center justify-center min-w-[12px] h-[12px] px-0.5 text-[8px] font-bold text-white bg-red-600 dark:bg-red-500 rounded-full border border-background">
                                  {gitBehind > 99 ? '99+' : gitBehind}
                                </span>
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent>{activeRepoLabel ? t('git.sync.menuForRepo', { repo: activeRepoLabel }) : t('git.sync.menu')}</TooltipContent>
                      </Tooltip>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => gitSync()} disabled={isGitFetching || isGitPulling || isGitPushing}>
                          {t('git.sync.sync')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => gitPull()} disabled={isGitFetching || isGitPulling || isGitPushing}>
                          {t('git.sync.pull')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => gitPullRebase()} disabled={isGitFetching || isGitPulling || isGitPushing}>
                          {t('git.sync.pullRebase')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowPullFromDialog(true)} disabled={isGitFetching || isGitPulling || isGitPushing}>
                          {t('git.sync.pullFrom')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => gitPush()} disabled={isGitFetching || isGitPulling || isGitPushing}>
                          {t('git.sync.push')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowPushToDialog(true)} disabled={isGitFetching || isGitPulling || isGitPushing}>
                          {t('git.sync.pushTo')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setShowForcePushConfirmDialog(true)}
                          disabled={isGitFetching || isGitPulling || isGitPushing}
                          className="text-destructive focus:text-destructive"
                        >
                          {t('git.sync.pushForce')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => runFetch('origin')} disabled={isGitFetching || isGitPulling || isGitPushing}>
                          {t('git.sync.fetch')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => runFetch('origin', { prune: true })} disabled={isGitFetching || isGitPulling || isGitPushing}>
                          {t('git.sync.fetchPrune')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => runFetch('origin', { all: true })} disabled={isGitFetching || isGitPulling || isGitPushing}>
                          {t('git.sync.fetchAll')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {gitAhead > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            id="git-undo-commit-button"
                            variant="link"
                            size="sm"
                            onClick={gitUndoCommit}
                            disabled={isGitFetching || isGitPulling || isGitPushing}
                            className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px] relative"
                          >
                            <Undo2 strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4 text-red-600 dark:text-red-400" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{activeRepoLabel ? t('git.undoCommitForRepo', { repo: activeRepoLabel }) : 'Hoàn tác commit cuối cùng'}</TooltipContent>
                      </Tooltip>
                    )}

                    {stashCount > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            id="git-stash-button"
                            variant="link"
                            size="sm"
                            onClick={() => setShowGitStashDialog(true)}
                            className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px] relative"
                          >
                            <Archive strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                            {stashCount > 0 && (
                              <span className="absolute top-0 right-0 flex items-center justify-center min-w-[12px] h-[12px] px-0.5 text-[8px] font-bold text-white bg-blue-600 dark:bg-blue-500 rounded-full border border-background">
                                {stashCount}
                              </span>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{activeRepoLabel ? t('git.stashForRepo', { count: stashCount, repo: activeRepoLabel }) : `Git Stash (${stashCount})`}</TooltipContent>
                      </Tooltip>
                    )}

                    {hasGitConflict && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            id="git-conflict-button"
                            variant="link"
                            size="sm"
                            onClick={openConflictResolverWindow}
                            className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px] relative overflow-visible"
                          >
                            <FileWarning strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4" />
                            {gitConflictCount > 0 && (
                              <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[12px] h-[12px] px-0.5 text-[8px] font-bold text-white bg-amber-600 dark:bg-amber-500 rounded-full border border-background">
                                {gitConflictCount > 99 ? '99+' : gitConflictCount}
                              </span>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {activeRepoLabel
                            ? t('title.resolveConflictsForRepoWithCount', { repo: activeRepoLabel, count: gitConflictCount })
                            : t('title.resolveConflictsWithCount', { count: gitConflictCount })}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </>
                ) : null}
              </div>
              ) : null}
            </WorkspaceRepoChrome>
          )}

          {enableShellSwitcher && shellView === 'tasks' && !tasksDetached && taskToolbarActionsHostRef ? (
            <div ref={taskToolbarActionsHostRef} className="flex items-center gap-1.5 shrink-0 h-full pr-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} />
          ) : null}

          {/* User / Auth Section */}
          <div className="flex items-center gap-2 h-8" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {user ? (
              <>
                <DropdownMenu
                  onOpenChange={open => {
                    if (open) {
                      setPreviewDefsStatus('loading')
                      window.api.achievement
                        .getAllDefinitions()
                        .then(res => {
                          if (res.status === 'success' && Array.isArray(res.data)) {
                            setPreviewDefs(res.data)
                            setPreviewDefsStatus('loaded')
                          } else {
                            setPreviewDefsStatus('error')
                          }
                        })
                        .catch(() => setPreviewDefsStatus('error'))
                    } else {
                      setPreviewDefsStatus('idle')
                    }
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className={cn(
                        'font-medium text-xs shrink-0 flex items-center gap-1.5 h-6 px-2! py-0 -mx-1 rounded-md transition-colors',
                        pillCfg.bgColor,
                        pillCfg.pillHoverBg
                      )}
                    >
                      <RankAvatarRing rank={avatarRingRank} size="xs">
                        <Avatar className="size-full bg-transparent">
                          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} className="object-cover" />}
                          <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                            {user.name
                              .split(/\s+/)
                              .map(w => w[0]?.toUpperCase())
                              .join('')
                              .slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                      </RankAvatarRing>
                      {isAdmin && <span className="text-[11px] shrink-0">🛡️</span>}
                      <span className={cn('truncate max-w-[120px]', titleBarNameClass)}>{user.name}</span>
                      {pinnedBadges.slice(0, 3).map(b => (
                        <span
                          key={b.achievement_code}
                          className="inline-flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center overflow-hidden align-middle rounded-sm"
                        >
                          <BadgeCard def={b.def} earned={b} size="3xs" variant="filled" showCount={false} className="h-full w-full min-h-0 min-w-0" />
                        </span>
                      ))}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center">
                    {user?.role === 'admin' && (
                      <>
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">{t('title.userMenu.demo')}</DropdownMenuLabel>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <Award className="h-4 w-4 text-orange-500" />
                              {t('achievement.previewToast')}…
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="max-h-[320px] overflow-y-auto p-1">
                              {previewDefsStatus === 'loading' ? (
                                <div className="px-2 py-3 text-xs text-muted-foreground text-center">{t('common.loading', 'Đang tải...')}</div>
                              ) : previewDefs.length === 0 ? (
                                <DropdownMenuItem className={getAchievementDemoMenuItemClass('bronze')} onSelect={() => window.api.achievement.previewToast()}>
                                  <span className={getAchievementDemoMenuLabelClass('bronze')}>{t('achievement.previewToast')} (Welcome!)</span>
                                </DropdownMenuItem>
                              ) : (
                                previewDefs
                                  .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
                                  .map(def => (
                                    <DropdownMenuItem
                                      key={def.code}
                                      className={getAchievementDemoMenuItemClass(def.tier)}
                                      onSelect={() => window.api.achievement.previewToast(def.code)}
                                    >
                                      <span className={getAchievementDemoMenuLabelClass(def.tier)}>{t(`achievement.def.${def.code}.name`, { defaultValue: def.name })}</span>
                                      <span className={getAchievementDemoMenuTierClass(def.tier)}>{def.tier}</span>
                                    </DropdownMenuItem>
                                  ))
                              )}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <Crown className="h-4 w-4 text-amber-500" />
                              {t('achievement.previewRank')}…
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="max-h-[320px] overflow-y-auto p-1">
                              {(Object.entries(RANK_CONFIG_ACH) as [string, { label: string; minXp?: number }][])
                                .sort((a, b) => (a[1].minXp ?? 0) - (b[1].minXp ?? 0))
                                .map(([code, cfg]) => (
                                  <DropdownMenuItem
                                    key={code}
                                    className={getRankDemoMenuItemClass(code)}
                                    onSelect={() => {
                                      setDemoRankCode(code)
                                      // Defer until dropdown closes — avoids pointer-down-outside closing dialog instantly
                                      window.setTimeout(() => {
                                        emitAchievementToast(
                                          {
                                            id: `rank_up-demo-${code}-${Date.now()}`,
                                            type: 'rank_up',
                                            title: `Rank Up! Bạn đã đạt rank ${cfg.label}`,
                                            payload: { newRank: code },
                                            timestamp: Date.now(),
                                          },
                                          { replace: true }
                                        )
                                      }, 0)
                                    }}
                                  >
                                    <RankAvatarRing rank={code} size="xxs">
                                      <span className="block size-full rounded-full bg-transparent" aria-hidden />
                                    </RankAvatarRing>
                                    <span className={getRankDemoMenuLabelClass(code)}>{cfg.label}</span>
                                    {demoRankCode === code && <Check className="ml-auto size-4 shrink-0 opacity-80" aria-hidden />}
                                  </DropdownMenuItem>
                                ))}
                              {demoRankCode && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onSelect={() => setDemoRankCode(null)}>{t('achievement.previewRankReset')}</DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">{t('title.userMenu.personal')}</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setShowProfile(true)}>
                        <UserCircle className="h-4 w-4 text-blue-500" />
                        {t('achievement.myProfile')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => (window.api as any).progress?.openWindow()}>
                        <BarChart3 className="h-4 w-4 text-blue-500" />
                        {t('progress.myProgress')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowAiUsageStats(true)}>
                        <Sparkles className="h-4 w-4 text-violet-500" />
                        {t('title.aiUsageStats')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          window.setTimeout(() => setShowHolidayCalendar(true), 50)
                        }}
                      >
                        <CalendarDays className="h-4 w-4 text-red-600 dark:text-red-400" />
                        {t('title.holidayCalendarMenu')}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    {canViewTeamMetrics && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">{t('title.userMenu.teamAndRanking')}</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => window.api.teamProgress.openWindow()}>
                            <Users className="h-4 w-4 text-violet-500" />
                            {t('teamProgress.openMenu')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => useCommitWorkflowStore.getState().setQualityDialogOpen(true)}>
                            <Workflow className="h-4 w-4 text-cyan-500" />
                            {t('commitWorkflow.openQualityDashboard')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setShowLeaderboard(true)}>
                            <Crown className="h-4 w-4 text-yellow-500" />
                            {t('achievement.leaderboard')}
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">{t('title.userMenu.settings')}</DropdownMenuLabel>
                      {!hideVcsToolbar && user?.role === 'admin' && (
                        <DropdownMenuItem onClick={() => openMasterWindow()} disabled={isLoading}>
                          <Database className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                          {t('taskManagement.masterOpen')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => openSettingsDialog()}>
                        <Settings2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                        {t('title.settings')}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">{t('title.userMenu.account')}</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => onRequestChangePassword?.()}>
                        <KeyRound className="h-4 w-4 text-amber-500" />
                        {t('taskManagement.changePassword')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleLogoutClick} variant="destructive">
                        <LogOut className="h-4 w-4 text-destructive" />
                        {t('taskManagement.logout')}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                {appUpdateButton}
                {enableShellSwitcher && shellView === 'prManager' && !prManagerDetached && onPrManagerDetach ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-[25px] w-[25px] shrink-0 rounded-sm" onClick={onPrManagerDetach}>
                        <SquareArrowOutUpRight strokeWidth={1.25} absoluteStrokeWidth className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t('mainShell.prManagerDetachTooltip')}</TooltipContent>
                  </Tooltip>
                ) : null}
                {enableShellSwitcher && shellView === 'tasks' && !tasksDetached && onTasksDetach ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-[25px] w-[25px] shrink-0 rounded-sm" onClick={onTasksDetach}>
                        <SquareArrowOutUpRight strokeWidth={1.25} absoluteStrokeWidth className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t('mainShell.tasksDetachTooltip')}</TooltipContent>
                  </Tooltip>
                ) : null}
                {enableShellSwitcher && shellView === 'automation' && !automationDetached && onAutomationDetach ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-[25px] w-[25px] shrink-0 rounded-sm" onClick={onAutomationDetach}>
                        <SquareArrowOutUpRight strokeWidth={1.25} absoluteStrokeWidth className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t('mainShell.automationDetachTooltip')}</TooltipContent>
                  </Tooltip>
                ) : null}
                {enableShellSwitcher && shellView === 'devPipelines' && !devPipelinesDetached && onDevPipelinesDetach ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-[25px] w-[25px] shrink-0 rounded-sm" onClick={onDevPipelinesDetach}>
                        <SquareArrowOutUpRight strokeWidth={1.25} absoluteStrokeWidth className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t('mainShell.devPipelinesDetachTooltip', 'Detach Dev Pipelines to a separate window')}</TooltipContent>
                  </Tooltip>
                ) : null}
                {enableShellSwitcher && shellView === 'showLog' && !showLogDetached && onShowLogDetach ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-[25px] w-[25px] shrink-0 rounded-sm" onClick={onShowLogDetach}>
                        <SquareArrowOutUpRight strokeWidth={1.25} absoluteStrokeWidth className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t('mainShell.showLogDetachTooltip', 'Detach Show Log to a separate window')}</TooltipContent>
                  </Tooltip>
                ) : null}
                <UserProfilePanel open={showProfile} onOpenChange={setShowProfile} />
                <HolidayCalendarDialog open={showHolidayCalendar} onOpenChange={setShowHolidayCalendar} />
                <LeaderboardDialog open={showLeaderboard} onOpenChange={setShowLeaderboard} isAdmin={user?.role === 'admin'} />
                <AiUsageStatsDialog open={showAiUsageStats} onOpenChange={setShowAiUsageStats} isAdmin={isAdmin} currentUserId={user?.id} currentUserName={user?.name} />
              </>
            ) : isGuest ? (
              <>
                <Button
                  variant="ghost"
                  className="font-medium text-xs shrink-0 flex items-center gap-1.5 h-6 px-3 py-0 -mx-1 rounded-md bg-violet-100 dark:bg-violet-900/60 hover:bg-violet-100 dark:hover:bg-violet-900/50"
                  onClick={() => onRequestLogin?.()}
                >
                  <UserCircle className="h-4 w-4 shrink-0" />
                  {t('taskManagement.guest')}
                </Button>
                {appUpdateButton}
              </>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 text-xs py-0 gap-1 shrink-0 bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/50">
                    {t('taskManagement.login')}
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onRequestLogin?.()}>
                    <UserCircle className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    {t('taskManagement.login')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openSettingsDialog()}>
                    <Settings2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                    {t('title.settings')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button onClick={() => handleWindow('minimize')} className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]">
              <Minus size={15.5} strokeWidth={1} absoluteStrokeWidth />
            </button>
            <button onClick={() => handleWindow('maximize')} className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]">
              <Square size={14.5} strokeWidth={1} absoluteStrokeWidth />
            </button>
            <button onClick={() => handleWindow('close')} className="w-10 h-8 flex items-center justify-center hover:bg-red-600 hover:text-white">
              <X size={20} strokeWidth={1} absoluteStrokeWidth />
            </button>
          </div>
        </div>
      </div>
      {/* AchievementToastContainer phải luôn mount (ngoài conditional user) để không bỏ lỡ notification ngay sau login */}
      <AchievementUnlockDialog />
    </>
  )
}
