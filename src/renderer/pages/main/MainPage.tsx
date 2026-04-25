'use client'
import { Bug, CheckCircle, CircleAlert, HelpCircle, SendHorizontal, SlidersHorizontal, Sparkles, TableOfContents } from 'lucide-react' // Added icons
import { IPC } from 'main/constants'
import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getInitialShellViewFromStorage, isTaskShellRole, MAIN_SHELL_VIEW_KEY, type MainShellView, readStoredShellView } from 'shared/mainShellView'
import { ChangePasswordDialog } from '@/components/dialogs/auth/ChangePasswordDialog'
import { LoginDialog } from '@/components/dialogs/auth/LoginDialog'
import { VcsOperationLogDialog } from '@/components/dialogs/vcs/VcsOperationLogDialog'
import { LANGUAGES } from '@/components/shared/constants'
import { TranslatePanel } from '@/components/shared/TranslatePanel'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { OverlayLoader } from '@/components/ui-elements/OverlayLoader'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { validateCommitMessage } from '@/lib/validateCommitMessage'
import { GitStagingTable } from '@/pages/main/GitStagingTable'
import { type FileData, SvnFileTable } from '@/pages/main/SvnFileTable'
import { TaskToolbarPortalContext } from '@/pages/main/TaskToolbarPortalContext'
import { TitleBar } from '@/pages/main/TitleBar'
import logger from '@/services/logger'
import { useAppearanceStoreSelect, useButtonVariant } from '@/stores/useAppearanceStore'
import { getConfigDataRelevantSnapshot, useConfigurationStore } from '@/stores/useConfigurationStore'
import { useHistoryStore } from '@/stores/useHistoryStore'
import { useMultiRepoEffectiveStore } from '@/stores/useMultiRepoEffectiveStore'
import { useSelectedProjectStore } from '@/stores/useSelectedProjectStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

const IsolatedTextarea = memo(function IsolatedTextarea({
  valueRef,
  initialValue,
  ...props
}: Omit<React.ComponentProps<typeof Textarea>, 'value' | 'onChange'> & { valueRef: React.MutableRefObject<string>; initialValue: string }) {
  const [value, setValue] = useState(initialValue)
  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])
  useEffect(() => {
    valueRef.current = value
  }, [value, valueRef])
  return <Textarea value={value} onChange={e => setValue(e.target.value)} {...props} />
})

const MAIN_PANEL_SIZES_KEY = 'main-panel-sizes-config'

const TaskManagement = lazy(() => import('@/pages/taskmanagement/TaskManagement').then(m => ({ default: m.TaskManagement })))

let _initialGitLoadDone = false

interface MainPanelSizes {
  topPanelSize: number
  bottomPanelSize: number
}

export function MainPage() {
  const language = useAppearanceStoreSelect(s => s.language)
  const { t } = useTranslation()
  const variant = useButtonVariant()
  const { addHistory } = useHistoryStore()
  const codingRule = useConfigurationStore(s => s.codingRule)
  const codingRuleId = useConfigurationStore(s => s.codingRuleId)
  const commitMessageDetailLevel = useConfigurationStore(s => s.commitMessageDetailLevel)
  const loadConfigurationConfig = useConfigurationStore(s => s.loadConfigurationConfig)
  const versionControlSystem = useConfigurationStore(s => s.versionControlSystem)
  const isConfigLoaded = useConfigurationStore(s => s.isConfigLoaded)
  const commitConventionEnabled = useConfigurationStore(s => s.commitConventionEnabled)
  const commitConventionMode = useConfigurationStore(s => s.commitConventionMode)
  const sourceFolder = useConfigurationStore(s => s.sourceFolder)
  const gitleaksEnabled = useConfigurationStore(s => s.gitleaksEnabled)
  const gitleaksMode = useConfigurationStore(s => s.gitleaksMode)
  const gitleaksConfigPath = useConfigurationStore(s => s.gitleaksConfigPath)
  const multiRepoEnabled = useConfigurationStore(s => s.multiRepoEnabled)
  const selectedProjectId = useSelectedProjectStore(s => s.selectedProjectId)
  const setEffectiveMultiRepo = useMultiRepoEffectiveStore(s => s.setEffective)
  const token = useTaskAuthStore(s => s.token)
  const user = useTaskAuthStore(s => s.user)
  const isGuest = useTaskAuthStore(s => s.isGuest)
  const verifySession = useTaskAuthStore(s => s.verifySession)
  const sessionExpiredShownRef = useRef(false)
  const prevVersionControlSystemRef = useRef<typeof versionControlSystem | null>(null)
  const dataSnapshotRef = useRef<string | null>(null)
  const tableRef = useRef<any>(null)
  const gitDualTableRef = useRef<any>(null)
  const [effectivePaths, setEffectivePaths] = useState<string[]>([])
  const [effectiveLabels, setEffectiveLabels] = useState<string[]>([])
  const [multiRepoActiveTab, setMultiRepoActiveTab] = useState('0')
  const [repoLinksVersion, setRepoLinksVersion] = useState(0)
  const gitMultiTableRefs = useRef<any[]>([])
  const effectivePathsRef = useRef<string[]>([])
  const prevIsMultiRepoRef = useRef<boolean>(false)
  const isMultiRepo = versionControlSystem === 'git' && !!multiRepoEnabled && effectivePaths.length >= 1

  useEffect(() => {
    const init = async () => {
      try {
        await loadConfigurationConfig()
        logger.info('Configuration loaded in MainPage')
        dataSnapshotRef.current = getConfigDataRelevantSnapshot(useConfigurationStore.getState())
      } catch (error) {
        logger.error('Error during initialization in MainPage:', error)
      }
    }
    init()
  }, [loadConfigurationConfig])

  // Lắng nghe sự kiện link/unlink repo để refetch effective paths
  useEffect(() => {
    const handler = () => setRepoLinksVersion(v => v + 1)
    window.addEventListener('multi-repo-links-changed', handler)
    return () => window.removeEventListener('multi-repo-links-changed', handler)
  }, [])

  // Resolve effective multi-repo paths and labels (từ Source Folders của Project đang chọn, chỉ Git)
  useEffect(() => {
    if (versionControlSystem !== 'git' || !multiRepoEnabled) {
      effectivePathsRef.current = []
      setEffectivePaths([])
      setEffectiveLabels([])
      setEffectiveMultiRepo([], [])
      return
    }
    if (!selectedProjectId?.trim()) {
      effectivePathsRef.current = []
      setEffectivePaths([])
      setEffectiveLabels([])
      setEffectiveMultiRepo([], [])
      return
    }
    let cancelled = false
    ;(async () => {
      const res = await window.api.task.getSourceFoldersByProject(selectedProjectId)
      if (cancelled) return
      if (res.status !== 'success' || !Array.isArray(res.data) || res.data.length === 0) {
        effectivePathsRef.current = []
        setEffectivePaths([])
        setEffectiveLabels([])
        setEffectiveMultiRepo([], [])
        return
      }
      const paths: string[] = []
      const labels: string[] = []
      for (const folder of res.data) {
        const p = (folder.path ?? '').trim()
        if (!p) continue
        const det = await window.api.system.detect_version_control(p)
        if (cancelled) return
        if (det.status === 'success' && det.data?.type === 'git' && det.data?.isValid) {
          paths.push(p)
          labels.push(folder.name ?? p.split(/[/\\]/).filter(Boolean).pop() ?? p)
        }
      }
      if (cancelled) return
      const limit = 5
      const truncated = paths.length > limit
      const finalPaths = truncated ? paths.slice(0, limit) : paths
      const finalLabels = truncated ? labels.slice(0, limit) : labels
      effectivePathsRef.current = finalPaths
      setEffectivePaths(finalPaths)
      setEffectiveLabels(finalLabels)
      setEffectiveMultiRepo(finalPaths, finalLabels)
      if (truncated && !cancelled) {
        toast.warning(t('settings.versioncontrol.multiRepoTooManyTruncated', 'Chỉ hiển thị tối đa 5 repo; các repo còn lại bị ẩn'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [versionControlSystem, multiRepoEnabled, selectedProjectId, repoLinksVersion, setEffectiveMultiRepo])

  // Reset multi-repo tab khi số repo thay đổi (tránh tab không hợp lệ)
  useEffect(() => {
    const n = effectivePaths.length
    if (n === 0) return
    setMultiRepoActiveTab(prev => {
      const idx = Number(prev)
      if (Number.isNaN(idx) || idx < 0 || idx >= n) return '0'
      return prev
    })
  }, [effectivePaths.length])

  // Sync multi-repo watch paths to main (byProject: paths from effectivePaths; else or empty → main uses sourceFolder)
  useEffect(() => {
    if (versionControlSystem !== 'git' || !multiRepoEnabled) {
      window.api.configuration.setMultirepoWatchPaths([]).catch(() => {})
      return
    }
    if (effectivePaths.length > 0) {
      window.api.configuration.setMultirepoWatchPaths(effectivePaths).catch(() => {})
    } else {
      window.api.configuration.setMultirepoWatchPaths([]).catch(() => {})
    }
  }, [versionControlSystem, multiRepoEnabled, effectivePaths])

  // Kiểm tra token còn hợp lệ khi vào MainPage (nếu đang có session)
  useEffect(() => {
    if (!token) {
      sessionExpiredShownRef.current = false
      return
    }
    verifySession().then(valid => {
      if (!valid && !sessionExpiredShownRef.current) {
        sessionExpiredShownRef.current = true
        toast.error(t('common.sessionExpired'))
      }
      if (valid) sessionExpiredShownRef.current = false
    })
  }, [token, verifySession, t])

  // Initial load: gọi reloadData() đúng 1 lần (chỉ single-repo). Multi-repo do effect bên dưới xử lý để tránh gọi trùng.
  useEffect(() => {
    if (!isConfigLoaded || versionControlSystem !== 'git') return
    if (isMultiRepo && effectivePaths.length > 0) return // Multi-repo: để effect "Reload khi effectivePaths thay đổi" xử lý
    if (_initialGitLoadDone) return
    _initialGitLoadDone = true
    queueMicrotask(() => {
      const table = gitDualTableRef.current
      if (table) table.reloadData()
    })
  }, [isConfigLoaded, versionControlSystem, isMultiRepo, effectivePaths.length])

  // Reload khi effectivePaths thay đổi (vd user vừa chọn Project trong Settings, hoặc link/unlink repo).
  // Cũng reload gitDualTableRef khi chuyển từ multi-repo về single-repo.
  useEffect(() => {
    if (!isConfigLoaded || versionControlSystem !== 'git') return
    const wasMultiRepo = prevIsMultiRepoRef.current
    prevIsMultiRepoRef.current = isMultiRepo

    if (isMultiRepo && effectivePaths.length > 0) {
      const timer = setTimeout(() => {
        effectivePaths.forEach((_, i) => {
          gitMultiTableRefs.current[i]?.reloadData?.()
        })
      }, 0)
      return () => clearTimeout(timer)
    }
    if (wasMultiRepo && !isMultiRepo) {
      const timer = setTimeout(() => {
        gitDualTableRef.current?.reloadData?.()
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [isConfigLoaded, versionControlSystem, isMultiRepo, effectivePaths])

  // Reload data khi versionControlSystem thay đổi (user đổi SVN ↔ Git)
  useEffect(() => {
    const prev = prevVersionControlSystemRef.current
    prevVersionControlSystemRef.current = versionControlSystem
    if (prev === null) return
    if (prev === versionControlSystem) return
    if (versionControlSystem === 'git') {
      logger.info('Version control system changed to Git')
      const paths = effectivePathsRef.current
      const multi = isMultiRepo && paths.length > 0
      if (multi) {
        paths.forEach((_, i) => {
          gitMultiTableRefs.current[i]?.reloadData?.()
        })
      } else if (gitDualTableRef.current) {
        gitDualTableRef.current.reloadData()
      }
    } else if (versionControlSystem === 'svn' && tableRef.current) {
      logger.info('Version control system changed to SVN')
      tableRef.current.reloadData()
    }
  }, [versionControlSystem, isMultiRepo, effectivePaths.length])

  // Listen for config-updated from main process (e.g. when Dashboard updates config)
  useEffect(() => {
    const handleConfigUpdated = () => {
      window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration' } }))
    }
    window.api.on(IPC.CONFIG_UPDATED, handleConfigUpdated)
    return () => window.api.removeAllListeners(IPC.CONFIG_UPDATED)
  }, [])

  // Listen for file changes (auto-refresh when files change in source folder)
  useEffect(() => {
    const handleFilesChanged = () => {
      logger.info('Files changed in source folder, reloading data...')
      const cfg = useConfigurationStore.getState()
      const vcs = cfg.versionControlSystem
      const paths = effectivePathsRef.current
      const multi = vcs === 'git' && !!cfg.multiRepoEnabled && paths.length >= 1
      if (vcs === 'git') {
        if (multi && paths.length > 0) {
          paths.forEach((_, i) => {
            gitMultiTableRefs.current[i]?.reloadData?.()
          })
        } else if (gitDualTableRef.current) {
          gitDualTableRef.current.reloadData()
        }
      } else if (vcs === 'svn' && tableRef.current) {
        tableRef.current.reloadData()
      }
    }
    window.api.on(IPC.FILES_CHANGED, handleFilesChanged)
    return () => window.api.removeAllListeners(IPC.FILES_CHANGED)
  }, [])

  // Listen for configuration changes
  useEffect(() => {
    const handleConfigurationChange = async (event: CustomEvent) => {
      if (event.detail?.type === 'configuration') {
        // Kiểm tra xem có phải clear data không (folder không phải Git/SVN)
        if (event.detail?.clearData) {
          logger.info('Clearing data - folder is not a valid Git/SVN repository')
          if (gitDualTableRef.current?.clearData) gitDualTableRef.current.clearData()
          gitMultiTableRefs.current.forEach(ref => {
            ref?.clearData?.()
          })
          if (tableRef.current?.clearData) tableRef.current.clearData()
          return
        }

        logger.info('Configuration changed in MainPage, reloading configuration...')
        await loadConfigurationConfig()
        const state = useConfigurationStore.getState()
        const newSnapshot = getConfigDataRelevantSnapshot(state)
        if (dataSnapshotRef.current !== null && dataSnapshotRef.current === newSnapshot) {
          logger.info('Configuration data-relevant unchanged (e.g. only developerMode), skip reloadData')
          return
        }
        dataSnapshotRef.current = newSnapshot
        const updatedVCS = state.versionControlSystem
        const updatedMultiRepo = !!state.multiRepoEnabled && (state.multiRepoSource === 'byProject' || (Array.isArray(state.multiRepoPaths) && state.multiRepoPaths.length >= 2))
        logger.info('Configuration reloaded in MainPage, versionControlSystem:', updatedVCS, 'multiRepo:', updatedMultiRepo)

        const paths = effectivePathsRef.current
        if (updatedVCS === 'git') {
          if (updatedMultiRepo && paths.length > 0) {
            paths.forEach((_, i) => {
              gitMultiTableRefs.current[i]?.reloadData?.()
            })
          } else if (gitDualTableRef.current) {
            gitDualTableRef.current.reloadData()
          }
        } else if (updatedVCS === 'svn' && tableRef.current) {
          tableRef.current.reloadData()
        }
      }
    }

    const handleGitBranchChange = () => {
      logger.info('Git branch changed, reloading data...')
      const cfg = useConfigurationStore.getState()
      const paths = effectivePathsRef.current
      const multi = cfg.versionControlSystem === 'git' && !!cfg.multiRepoEnabled && paths.length >= 1
      if (cfg.versionControlSystem === 'git') {
        if (multi && paths.length > 0) {
          paths.forEach((_, i) => {
            gitMultiTableRefs.current[i]?.reloadData?.()
          })
        } else if (gitDualTableRef.current) {
          gitDualTableRef.current.reloadData()
        }
      }
    }

    const handleGitUndoCommit = () => {
      logger.info('Git undo commit detected, reloading data...')
      const cfg = useConfigurationStore.getState()
      const paths = effectivePathsRef.current
      const multi = cfg.versionControlSystem === 'git' && !!cfg.multiRepoEnabled && paths.length >= 1
      if (cfg.versionControlSystem === 'git') {
        if (multi && paths.length > 0) {
          paths.forEach((_, i) => {
            gitMultiTableRefs.current[i]?.reloadData?.()
          })
        } else if (gitDualTableRef.current) {
          gitDualTableRef.current.reloadData()
        }
      }
    }

    window.addEventListener('configuration-changed', handleConfigurationChange as unknown as EventListener)
    window.addEventListener('git-branch-changed', handleGitBranchChange)
    window.addEventListener('git-undo-commit', handleGitUndoCommit)

    return () => {
      window.removeEventListener('configuration-changed', handleConfigurationChange as unknown as EventListener)
      window.removeEventListener('git-branch-changed', handleGitBranchChange)
      window.removeEventListener('git-undo-commit', handleGitUndoCommit)
    }
  }, [loadConfigurationConfig])

  const [isLoadingGenerate, setLoadingGenerate] = useState(false)
  const [isLoadingCommit, setLoadingCommit] = useState(false)
  const [isTableLoading, setIsTableLoading] = useState(false)
  const [commitMessageSeed, setCommitMessageSeed] = useState('')
  const commitMessageRef = useRef<string>('')
  const referenceIdRef = useRef<HTMLInputElement>(null)
  const referenceId = useRef('')
  const hasCheckCodingRuleRef = useRef(false)
  const hasCheckSpotbugsRef = useRef(false)
  const isAnyLoading = isLoadingGenerate || isLoadingCommit
  const [commitConventionDialog, setCommitConventionDialog] = useState<{
    open: boolean
    errors: string[]
    warnings: string[]
    onConfirm: () => void
  } | null>(null)
  const [gitleaksDialog, setGitleaksDialog] = useState<{
    open: boolean
    findings: { ruleId: string; file: string; startLine?: number; repoLabel?: string; description?: string }[]
    onConfirm: () => void
  } | null>(null)
  const [autoPush, setAutoPush] = useState(false)
  const [commitAmend, setCommitAmend] = useState(false)
  const [commitSignOff, setCommitSignOff] = useState(false)
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false)
  const [shellView, setShellView] = useState<MainShellView>(() => getInitialShellViewFromStorage())

  const persistShellView = useCallback((v: MainShellView) => {
    setShellView(v)
    try {
      localStorage.setItem(MAIN_SHELL_VIEW_KEY, v)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!user || isGuest) {
      setShellView('vcs')
      return
    }
    const stored = readStoredShellView()
    const next = stored ?? (isTaskShellRole(user.role) ? 'tasks' : 'vcs')
    setShellView(next)
    if (stored === null && isTaskShellRole(user.role)) {
      try {
        localStorage.setItem(MAIN_SHELL_VIEW_KEY, 'tasks')
      } catch {
        /* ignore */
      }
    }
  }, [user, isGuest])

  const enableShellSwitcher = Boolean(user && !isGuest)
  const showEmbeddedTasks = enableShellSwitcher && shellView === 'tasks'
  const [taskToolbarHostEl, setTaskToolbarHostEl] = useState<HTMLDivElement | null>(null)
  const taskToolbarHostRef = useCallback((node: HTMLDivElement | null) => {
    setTaskToolbarHostEl(node)
  }, [])
  const [taskToolbarActionsEl, setTaskToolbarActionsEl] = useState<HTMLDivElement | null>(null)
  const taskToolbarActionsHostRef = useCallback((node: HTMLDivElement | null) => {
    setTaskToolbarActionsEl(node)
  }, [])

  const [showCommitResultDialog, setShowCommitResultDialog] = useState(false)
  const [commitStreamingLog, setCommitStreamingLog] = useState('')
  const [commitIsStreaming, setCommitIsStreaming] = useState(false)
  const [commitDialogTitle, setCommitDialogTitle] = useState('')
  const [commitCompletionMessage, setCommitCompletionMessage] = useState('')
  const [commitOperationStatus, setCommitOperationStatus] = useState<'success' | 'error' | undefined>(undefined)

  const [panelSizes, setPanelSizes] = useState<MainPanelSizes>({
    topPanelSize: 50,
    bottomPanelSize: 50,
  })

  const topPanelRef = useRef<any>(null)
  const bottomPanelRef = useRef<any>(null)
  const panelGroupRef = useRef<any>(null)

  useEffect(() => {
    try {
      const savedPanelSizes = localStorage.getItem(MAIN_PANEL_SIZES_KEY)
      if (savedPanelSizes) {
        const sizes: MainPanelSizes = JSON.parse(savedPanelSizes)
        const top = Math.max(25, Math.min(75, sizes.topPanelSize))
        const bottom = Math.max(25, Math.min(75, sizes.bottomPanelSize))
        const normalized = { topPanelSize: top, bottomPanelSize: bottom }
        setPanelSizes(normalized)
        setTimeout(() => {
          panelGroupRef.current?.setLayout?.({
            'changed-files-table': top,
            'commit-message-panel': bottom,
          })
        }, 0)
      }
    } catch (error) {
      logger.error('Lỗi khi đọc kích thước panel từ localStorage:', error)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(MAIN_PANEL_SIZES_KEY, JSON.stringify(panelSizes))
      } catch (error) {
        logger.error('Lỗi khi lưu kích thước panel vào localStorage:', error)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [panelSizes])

  const handleReferenceId = (e: React.ChangeEvent<HTMLInputElement>) => {
    referenceId.current = e.target.value
  }

  const generateCommitMessage = useCallback(async () => {
    let selectedFiles: any[] = []

    if (versionControlSystem === 'git') {
      if (isMultiRepo) {
        const stagedPerRepo = effectivePaths.map((_, i) => gitMultiTableRefs.current[i]?.getAllStagedFiles?.() ?? [])
        const totalStaged = stagedPerRepo.flat().length
        if (totalStaged === 0) {
          toast.warning(t('settings.versioncontrol.multiRepoNoStagedFiles'))
          return
        }
        selectedFiles = stagedPerRepo.flat()
      } else {
        if (!gitDualTableRef.current) {
          toast.warning(t('message.noFilesWarning'))
          return
        }
        selectedFiles = gitDualTableRef.current.getAllStagedFiles()
        if (selectedFiles.length === 0) {
          toast.warning(t('git.noStagedFiles'))
          return
        }
      }
    } else {
      const selectedRows = tableRef.current.table?.getSelectedRowModel().rows ?? []
      selectedFiles = selectedRows.map((row: { original: { filePath: any; status: any } }) => ({
        filePath: row.original.filePath,
        status: row.original.status,
      }))
      if (selectedFiles.length === 0) {
        toast.warning(t('message.noFilesWarning'))
        return
      }
    }

    const languageName = LANGUAGES.find(lang => lang.code === language)?.label || 'English'
    setLoadingGenerate(true)

    let diffContent = ''
    let deletedFilesList = ''
    try {
      if (versionControlSystem === 'git' && isMultiRepo && effectivePaths.length > 0) {
        const stagedPerRepo = effectivePaths.map((_, i) => gitMultiTableRefs.current[i]?.getAllStagedFiles?.() ?? [])
        const diffPromises = effectivePaths.map((path, i) => {
          const files = stagedPerRepo[i].map((f: FileData) => f.filePath)
          return files.length > 0
            ? window.api.git.get_diff(files, { cwd: path })
            : Promise.resolve({ status: 'success' as const, data: { diffContent: '', deletedFiles: [] as string[] } })
        })
        const results = await Promise.all(diffPromises)
        const parts: string[] = []
        const delParts: string[] = []
        results.forEach((res, i) => {
          const content = res.status === 'success' && res.data?.diffContent ? res.data.diffContent : 'No modifications found.'
          parts.push(`[${effectiveLabels[i] ?? effectivePaths[i]}]\n${content}`)
          if (res.status === 'success' && res.data?.deletedFiles?.length) {
            delParts.push(res.data.deletedFiles.map((f: string) => `- ${f}`).join('\n'))
          }
        })
        diffContent = parts.join('\n\n')
        deletedFilesList = delParts.filter(Boolean).join('\n')
      } else if (versionControlSystem === 'git') {
        const selectedFilePaths = selectedFiles.map((file: FileData) => file.filePath)
        const result = await window.api.git.get_diff(selectedFilePaths)
        if (result.status !== 'success' || !result.data) {
          toast.error(result.message || 'No diff data received')
          setLoadingGenerate(false)
          return
        }
        diffContent = result.data.diffContent ? result.data.diffContent : 'No modifications found.'
        deletedFilesList = result.data.deletedFiles?.length > 0 ? result.data.deletedFiles.map((f: string) => `- ${f}`).join('\n') : ''
      } else {
        const result = await window.api.svn.get_diff(selectedFiles)
        if (result.status !== 'success' || !result.data) {
          toast.error(result.message || 'No diff data received')
          setLoadingGenerate(false)
          return
        }
        diffContent = result.data.diffContent ? result.data.diffContent : 'No modifications found.'
        deletedFilesList = result.data.deletedFiles?.length > 0 ? result.data.deletedFiles.map((f: string) => `- ${f}`).join('\n') : ''
      }

      const params = {
        type: 'GENERATE_COMMIT' as const,
        values: {
          diff_content: diffContent,
          language: languageName,
          deletedFiles: deletedFilesList,
          commitMessageDetailLevel,
        },
      }
      const openai_result = await window.api.openai.send_message(params)
      setCommitMessageSeed(openai_result)
      logger.info(openai_result)
      addHistory({ message: openai_result, date: new Date().toISOString() }).catch(error => logger.error('Không thể lưu vào lịch sử:', error))
      toast.success(t('toast.generateSuccess'))
    } catch (error) {
      logger.error('Error getting diff or generating message:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(errorMessage)
    }
    setLoadingGenerate(false)
  }, [versionControlSystem, language, commitMessageDetailLevel, t, isMultiRepo, effectivePaths, effectiveLabels])

  const checkViolations = async () => {
    let selectedFiles: any[] = []
    if (versionControlSystem === 'git') {
      if (isMultiRepo && effectivePaths.length > 0) {
        selectedFiles = effectivePaths.flatMap((_, i) => gitMultiTableRefs.current[i]?.getAllStagedFiles?.() ?? [])
      } else if (gitDualTableRef.current) {
        selectedFiles = gitDualTableRef.current.getAllStagedFiles()
      }
      if (selectedFiles.length === 0) {
        toast.warning(isMultiRepo ? t('settings.versioncontrol.multiRepoNoStagedFiles') : t('git.noStagedFiles'))
        return
      }
    } else {
      const selectedRows = tableRef.current.table?.getSelectedRowModel().rows ?? []
      selectedFiles = selectedRows.map((row: { original: { filePath: any; status: any } }) => ({
        filePath: row.original.filePath,
        status: row.original.status,
      }))
      if (selectedFiles.length === 0) {
        toast.warning(t('message.noFilesWarning'))
        return
      }
    }

    window.api.electron.send(IPC.WINDOW.CHECK_CODING_RULES, {
      selectedFiles,
      codingRuleId: codingRuleId || undefined,
      codingRuleName: codingRule || undefined,
    })
    hasCheckCodingRuleRef.current = true
  }

  const performCommit = useCallback(
    async (selectedFiles: any[], finalCommitMessage: string, multiRepoPayload?: { repos: { path: string; files: FileData[] }[]; labels?: string[] } | null) => {
      setLoadingCommit(true)
      setCommitStreamingLog('')
      setCommitIsStreaming(true)
      setCommitDialogTitle(t('dialog.updateResult.titleCommit'))
      setCommitCompletionMessage('dialog.updateResult.completedCommit')
      setCommitOperationStatus(undefined)
      setShowCommitResultDialog(true)

      const commitOptionsBase = {
        hasCheckCodingRule: hasCheckCodingRuleRef.current,
        hasCheckSpotbugs: hasCheckSpotbugsRef.current,
        ...(versionControlSystem === 'git' ? { scope: 'staged' as const, amend: commitAmend, signOff: commitSignOff } : {}),
      }

      const unsubCommit =
        versionControlSystem === 'git'
          ? window.api.git.onCommitStream(chunk => setCommitStreamingLog(prev => prev + chunk))
          : window.api.svn.onCommitStream(chunk => setCommitStreamingLog(prev => prev + chunk))

      if (versionControlSystem === 'git' && multiRepoPayload?.repos?.length) {
        const { repos, labels: payloadLabels } = multiRepoPayload
        const labels = payloadLabels ?? useMultiRepoEffectiveStore.getState().labels
        try {
          for (let i = 0; i < repos.length; i++) {
            const { path, files } = repos[i]
            if (i > 0) {
              setCommitStreamingLog(prev => `${prev}\n[${labels[i] ?? path}]\n`)
            }
            if (files.length > 0) {
              const result = await window.api.git.commit(
                finalCommitMessage,
                files.map((f: FileData) => f.filePath),
                { ...commitOptionsBase, cwd: path }
              )
              if (result.status === 'error') {
                unsubCommit()
                setCommitIsStreaming(false)
                setCommitOperationStatus('error')
                setLoadingCommit(false)
                toast.error(t('settings.versioncontrol.multiRepoCommitBlocked'))
                toast.error(result.message)
                return
              }
              if (result.data?.commitInfo) {
                window.api.gitCommitQueue.add(result.data.commitInfo).catch(err => logger.error('Lưu commit queue:', err))
              }
            }
          }
          unsubCommit()
          hasCheckCodingRuleRef.current = false
          hasCheckSpotbugsRef.current = false
          repos.forEach((_, i) => {
            gitMultiTableRefs.current[i]?.reloadData?.()
          })
          window.dispatchEvent(new CustomEvent('git-commit-success'))
          setCommitMessageSeed('')
          if (referenceIdRef.current) {
            referenceIdRef.current.value = ''
            referenceId.current = ''
          }
          const reposWithCommits = repos.map((r, i) => ({ path: r.path, label: labels[i] ?? r.path, files: r.files })).filter(r => r.files.length > 0)
          if (autoPush && reposWithCommits.length > 0) {
            setCommitDialogTitle(t('dialog.updateResult.titlePush'))
            setCommitCompletionMessage('dialog.updateResult.completedPush')
            const unsubPush = window.api.git.onPushStream(chunk => setCommitStreamingLog(prev => prev + chunk))
            try {
              let allPushOk = true
              let lastPushErr: string | undefined
              const allPushedHashes: string[] = []
              for (let j = 0; j < reposWithCommits.length; j++) {
                const { path, label } = reposWithCommits[j]
                setCommitStreamingLog(prev => `${prev}\n[push: ${label}]\n`)
                const pushResult = await window.api.git.push('origin', undefined, undefined, path)
                if (pushResult.status === 'success') {
                  if (pushResult.pushedHashes?.length) {
                    allPushedHashes.push(...pushResult.pushedHashes)
                  }
                } else {
                  allPushOk = false
                  lastPushErr = pushResult.message || t('toast.pushError')
                }
              }
              unsubPush()
              if (allPushedHashes.length > 0) {
                window.api.gitCommitQueue.removeMany(allPushedHashes).catch(err => logger.error('Xóa commit queue:', err))
              }
              if (allPushOk) {
                setCommitOperationStatus('success')
                toast.success(t('toast.commitPushSuccess'))
              } else {
                setCommitOperationStatus('error')
                toast.success(t('toast.commitSuccess'))
                toast.error(lastPushErr || t('toast.pushError'))
              }
            } catch (error) {
              unsubPush()
              setCommitOperationStatus('error')
              toast.success(t('toast.commitSuccess'))
              toast.error(`${t('toast.pushError')}: ${error instanceof Error ? error.message : String(error)}`)
            }
          } else {
            setCommitOperationStatus('success')
            toast.success(t('toast.commitSuccess'))
          }
        } catch (error) {
          unsubCommit()
          setCommitIsStreaming(false)
          setCommitOperationStatus('error')
          setLoadingCommit(false)
          toast.error(error instanceof Error ? error.message : String(error))
          return
        }
        setCommitIsStreaming(false)
        setLoadingCommit(false)
        return
      }

      let result: any
      try {
        if (versionControlSystem === 'git') {
          const selectedFilePaths = selectedFiles.map((file: FileData) => file.filePath)
          result = await window.api.git.commit(finalCommitMessage, selectedFilePaths, commitOptionsBase)
        } else {
          result = await window.api.svn.commit(finalCommitMessage, selectedFiles, commitOptionsBase as any)
        }
      } catch (error) {
        unsubCommit()
        setCommitIsStreaming(false)
        setCommitOperationStatus('error')
        setLoadingCommit(false)
        const errMsg = error instanceof Error ? error.message : String(error)
        toast.error(errMsg)
        return
      }

      unsubCommit()
      const { status, message } = result

      if (status === 'success') {
        hasCheckCodingRuleRef.current = false
        hasCheckSpotbugsRef.current = false

        if (versionControlSystem === 'git') {
          const commitInfo = result.data?.commitInfo
          if (commitInfo) {
            if (autoPush) {
              await window.api.gitCommitQueue.add(commitInfo).catch(err => logger.error('Lưu commit queue:', err))
            } else {
              window.api.gitCommitQueue.add(commitInfo).catch(err => logger.error('Lưu commit queue:', err))
            }
          }
          gitDualTableRef.current?.reloadData?.()
          window.dispatchEvent(new CustomEvent('git-commit-success'))
          if (autoPush) {
            setCommitDialogTitle(t('dialog.updateResult.titlePush'))
            setCommitCompletionMessage('dialog.updateResult.completedPush')
            const unsubPush = window.api.git.onPushStream(chunk => setCommitStreamingLog(prev => prev + chunk))
            try {
              const pushResult = await window.api.git.push('origin', undefined)
              unsubPush()
              if (pushResult.status === 'success') {
                if (pushResult.pushedHashes?.length) {
                  window.api.gitCommitQueue.removeMany(pushResult.pushedHashes).catch(err => logger.error('Xóa commit queue:', err))
                }
                setCommitOperationStatus('success')
                toast.success(t('toast.commitPushSuccess'))
                window.dispatchEvent(new CustomEvent('git-commit-success'))
              } else {
                setCommitOperationStatus('error')
                toast.success(t('toast.commitSuccess'))
                toast.error(pushResult.message || t('toast.pushError'))
              }
            } catch (error) {
              unsubPush()
              const errMsg = error instanceof Error ? error.message : String(error)
              setCommitOperationStatus('error')
              toast.success(t('toast.commitSuccess'))
              toast.error(`${t('toast.pushError')}: ${errMsg}`)
            }
          } else {
            setCommitOperationStatus('success')
            toast.success(t('toast.commitSuccess'))
          }
        } else if (tableRef.current) {
          setCommitOperationStatus('success')
          toast.success(t('toast.commitSuccess'))
          tableRef.current.reloadData()
          setTimeout(() => {
            tableRef.current.table.toggleAllPageRowsSelected(false)
          }, 0)
        }
        setCommitMessageSeed('')
        if (referenceIdRef.current) {
          referenceIdRef.current.value = ''
          referenceId.current = ''
        }
      } else {
        setCommitOperationStatus('error')
        toast.error(message)
      }
      setCommitIsStreaming(false)
      setLoadingCommit(false)
    },
    [versionControlSystem, t, autoPush, commitAmend, commitSignOff]
  )

  const proceedWithCommit = useCallback(
    async (selectedFiles: any[], finalCommitMessage: string, multiRepoPayload: { repos: { path: string; files: FileData[] }[]; labels: string[] } | null) => {
      if (versionControlSystem !== 'git' || !gitleaksEnabled) {
        await performCommit(selectedFiles, finalCommitMessage, multiRepoPayload)
        return
      }

      const repos: { cwd: string; label?: string }[] = []
      if (isMultiRepo && multiRepoPayload?.repos?.length) {
        const labels = multiRepoPayload.labels ?? effectiveLabels
        for (let i = 0; i < multiRepoPayload.repos.length; i++) {
          const r = multiRepoPayload.repos[i]
          if ((r.files?.length ?? 0) > 0) {
            repos.push({ cwd: r.path, label: labels[i] ?? r.path })
          }
        }
      } else {
        const cwd = sourceFolder?.trim()
        if (!cwd) {
          toast.error(t('gitleaks.noSourceFolder'))
          return
        }
        repos.push({ cwd })
      }

      if (repos.length === 0) {
        await performCommit(selectedFiles, finalCommitMessage, multiRepoPayload)
        return
      }

      try {
        const scan = await window.api.git.scanStagedSecrets({
          repos,
          configPath: gitleaksConfigPath?.trim() || undefined,
        })
        if (scan.status === 'error') {
          toast.error(scan.message?.trim() ? scan.message : t('gitleaks.scanError'))
          return
        }
        if (scan.status === 'leaks') {
          if (gitleaksMode === 'block') {
            toast.error(t('gitleaks.blocked', { count: scan.findings.length }))
            return
          }
          setGitleaksDialog({
            open: true,
            findings: scan.findings,
            onConfirm: () => {
              setGitleaksDialog(null)
              void performCommit(selectedFiles, finalCommitMessage, multiRepoPayload)
            },
          })
          return
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('gitleaks.scanError'))
        return
      }

      await performCommit(selectedFiles, finalCommitMessage, multiRepoPayload)
    },
    [versionControlSystem, gitleaksEnabled, gitleaksMode, gitleaksConfigPath, isMultiRepo, effectiveLabels, sourceFolder, performCommit, t]
  )

  const commitCode = useCallback(async () => {
    const messageToCommit = commitMessageRef.current.trim()
    if (!messageToCommit) {
      toast.warning(t('message.commitMessageWarning'))
      return
    }

    let selectedFiles: any[] = []
    let multiRepoPayload: { repos: { path: string; files: FileData[] }[]; labels: string[] } | null = null

    if (versionControlSystem === 'git') {
      if (isMultiRepo && effectivePaths.length > 0) {
        const stagedPerRepo = effectivePaths.map((_, i) => gitMultiTableRefs.current[i]?.getAllStagedFiles?.() ?? [])
        if (stagedPerRepo.every(files => files.length === 0)) {
          toast.warning(t('settings.versioncontrol.multiRepoNoStagedFiles'))
          return
        }
        multiRepoPayload = {
          repos: effectivePaths.map((path, i) => ({ path, files: stagedPerRepo[i] ?? [] })),
          labels: effectiveLabels,
        }
        selectedFiles = stagedPerRepo.flat()
      } else {
        if (!gitDualTableRef.current) {
          toast.warning(t('message.noFilesWarning'))
          return
        }
        selectedFiles = gitDualTableRef.current.getAllStagedFiles()
        if (selectedFiles.length === 0) {
          toast.warning(t('git.noStagedFiles'))
          return
        }
      }
    } else {
      const selectedRows = tableRef.current.table?.getSelectedRowModel().rows ?? []
      selectedFiles = selectedRows.map((row: { original: { filePath: any; status: any } }) => ({
        filePath: row.original.filePath,
        status: row.original.status,
      }))
      if (selectedFiles.length === 0) {
        toast.warning(t('message.noFilesWarning'))
        return
      }
    }

    const refId = referenceIdRef.current?.value || ''
    const finalCommitMessage = refId ? `${refId}\n${messageToCommit}` : messageToCommit

    if (commitConventionEnabled) {
      const validationResult = validateCommitMessage(messageToCommit)
      const hasErrors = validationResult.errors.length > 0
      const hasWarnings = validationResult.warnings.length > 0
      const isInvalid = !validationResult.valid || hasErrors || hasWarnings

      if (isInvalid) {
        const allMessages = [...validationResult.errors, ...validationResult.warnings]

        if (commitConventionMode === 'block') {
          toast.error(`${t('commitConvention.blocked')}: ${allMessages.join('; ')}`)
          return
        }

        setCommitConventionDialog({
          open: true,
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          onConfirm: () => {
            setCommitConventionDialog(null)
            void proceedWithCommit(selectedFiles, finalCommitMessage, multiRepoPayload)
          },
        })
        return
      }
    }

    await proceedWithCommit(selectedFiles, finalCommitMessage, multiRepoPayload)
  }, [versionControlSystem, t, commitConventionEnabled, commitConventionMode, proceedWithCommit, isMultiRepo, effectivePaths, effectiveLabels])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [])

  const activeRepoPath = isMultiRepo && effectivePaths.length > 0 ? (effectivePaths[Number(multiRepoActiveTab)] ?? effectivePaths[0]) : undefined
  const activeRepoLabel = isMultiRepo && effectiveLabels.length > 0 ? (effectiveLabels[Number(multiRepoActiveTab)] ?? effectiveLabels[0]) : undefined

  return (
    <div className="flex h-screen w-full">
      {/* Main Content */}
      <div className="flex flex-col flex-1 w-full">
        {/* Title Bar */}
        <TitleBar
          isLoading={isLoadingGenerate || isLoadingCommit || isTableLoading}
          versionControlSystem={versionControlSystem}
          hideUndoCommit={isMultiRepo && !activeRepoPath}
          isMultiRepo={isMultiRepo}
          activeRepoPath={activeRepoPath}
          activeRepoLabel={activeRepoLabel}
          hideVcsToolbar={versionControlSystem === 'git' && !!multiRepoEnabled && effectivePaths.length === 0 && !token}
          shellView={shellView}
          onShellViewChange={persistShellView}
          enableShellSwitcher={enableShellSwitcher}
          onRequestLogin={() => setShowLoginDialog(true)}
          onRequestChangePassword={() => setShowChangePasswordDialog(true)}
          taskToolbarHostRef={taskToolbarHostRef}
          taskToolbarActionsHostRef={taskToolbarActionsHostRef}
        />
        {/* Content */}
        <div className={cn('flex-1 flex flex-col min-h-0', showEmbeddedTasks ? 'p-0 overflow-hidden' : 'p-4')}>
          {enableShellSwitcher && showEmbeddedTasks ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <Suspense
                fallback={
                  <div className="flex min-h-0 flex-1 items-center justify-center">
                    <GlowLoader className="w-10 h-10" />
                  </div>
                }
              >
                <TaskToolbarPortalContext.Provider value={{ center: taskToolbarHostEl, actions: taskToolbarActionsEl }}>
                  <TaskManagement embedded />
                </TaskToolbarPortalContext.Provider>
              </Suspense>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <ResizablePanelGroup
                groupRef={panelGroupRef}
                direction="vertical"
                className="rounded-sm border flex-1 min-h-0"
                defaultLayout={{ 'changed-files-table': panelSizes.topPanelSize, 'commit-message-panel': panelSizes.bottomPanelSize }}
                onLayoutChanged={layout => {
                  const top = layout['changed-files-table']
                  const bottom = layout['commit-message-panel']
                  if (typeof top === 'number' && typeof bottom === 'number') {
                    setPanelSizes({ topPanelSize: top, bottomPanelSize: bottom })
                  }
                }}
                resizeTargetMinimumSize={{ coarse: 37, fine: 27 }}
              >
                <ResizablePanel id="changed-files-table" minSize={25} className="min-h-0 overflow-hidden" ref={topPanelRef}>
                  {!isConfigLoaded ? (
                    <div className="flex items-center justify-center h-full">
                      <GlowLoader className="w-10 h-10" />
                    </div>
                  ) : versionControlSystem === 'git' ? (
                    isMultiRepo && effectivePaths.length > 0 ? (
                      <Tabs value={multiRepoActiveTab} onValueChange={setMultiRepoActiveTab} className="h-full flex flex-col min-h-0 gap-0!">
                        <TabsList className="w-full flex shrink-0 overflow-x-auto justify-start rounded-none!">
                          {effectiveLabels.map((label, i) => (
                            <TabsTrigger key={effectivePaths[i]} value={String(i)} className="shrink-0">
                              {label}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                        {effectivePaths.map((path, i) => (
                          <TabsContent key={path} value={String(i)} forceMount className="flex-1 min-h-0 mt-0 overflow-hidden data-[state=inactive]:hidden">
                            <GitStagingTable
                              ref={el => {
                                gitMultiTableRefs.current[i] = el
                              }}
                              cwd={path}
                              label={effectiveLabels[i]}
                              onLoadingChange={setIsTableLoading}
                            />
                          </TabsContent>
                        ))}
                      </Tabs>
                    ) : multiRepoEnabled && effectivePaths.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground p-4 text-center">
                        {!token
                          ? t('settings.versioncontrol.multiRepoPleaseLogin')
                          : !selectedProjectId
                            ? t('settings.versioncontrol.multiRepoSelectProjectPrompt')
                            : t('settings.versioncontrol.multiRepoNoGitFoldersInProject')}
                      </div>
                    ) : (
                      <GitStagingTable ref={gitDualTableRef} onLoadingChange={setIsTableLoading} />
                    )
                  ) : (
                    <SvnFileTable ref={tableRef} onLoadingChange={setIsTableLoading} />
                  )}
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel id="commit-message-panel" className="flex min-h-0 flex-col p-2" minSize={25} ref={bottomPanelRef}>
                  <div className="relative flex flex-col min-h-0 flex-1">
                    <div className="relative min-h-0 flex-1">
                      <OverlayLoader isLoading={isLoadingGenerate} />
                      <TranslatePanel
                        text={() => commitMessageRef.current}
                        variant="inline"
                        readOnly={false}
                        disabled={isAnyLoading}
                        placeholder={t('placeholder.commitMessage')}
                        className="h-full flex flex-col min-h-0"
                        renderHeader={({ translateButton, viewToggleButton }) => (
                          <div className="mb-2 flex w-[500px] shrink-0 items-center gap-2">
                            <Input
                              id="reference-id-input"
                              placeholder={t('placeholder.referenceId')}
                              className="flex-1 min-w-0"
                              onChange={handleReferenceId}
                              ref={referenceIdRef}
                              spellCheck={false}
                            />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  aria-label={t('joyride.main.referenceId')}
                                >
                                  <HelpCircle className="w-4 h-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">Ô này điền ticket id, issues id của Redmine, hoặc tên file tài liệu.</TooltipContent>
                            </Tooltip>
                            {translateButton}
                            <span className="text-xs text-muted-foreground shrink-0" title={t('translation.commitUsesEnglish')}>
                              ({t('translation.commitUsesEnglish')})
                            </span>
                            {viewToggleButton}
                          </div>
                        )}
                        renderContent={(displayText, isTranslated) => (
                          <div className="absolute inset-0 w-full h-full min-h-0">
                            <IsolatedTextarea
                              id="commit-message-area"
                              placeholder={t('placeholder.commitMessage')}
                              className="absolute inset-0 w-full h-full resize-none p-2"
                              valueRef={commitMessageRef}
                              initialValue={commitMessageSeed}
                              spellCheck={false}
                            />
                            {isTranslated && (
                              <div className="absolute inset-0 w-full h-full overflow-auto resize-none border rounded-md p-2 min-h-0 cursor-default break-words text-sm bg-background whitespace-pre-wrap">
                                {displayText}
                              </div>
                            )}
                          </div>
                        )}
                      />
                    </div>
                    <span className="mt-2 flex shrink-0 flex-row items-center gap-2 text-xs text-muted-foreground">
                      <CircleAlert className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                      {t('message.aiContentWarning')}
                    </span>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>

              {/* Footer Buttons */}
              <div className="flex flex-shrink-0 flex-wrap justify-center items-center gap-x-3 mt-4">
                {/* Commit Message History + Generate Commit Message button group */}
                <div className="inline-flex rounded-md overflow-hidden [&_button]:rounded-none [&_button:first-child]:rounded-l-md [&_button:last-child]:rounded-r-md">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        id="history-button"
                        variant={variant}
                        size="icon"
                        onClick={() => {
                          if (!isAnyLoading) {
                            window.api.electron.send(IPC.WINDOW.COMMIT_MESSAGE_HISTORY, undefined)
                          }
                        }}
                        disabled={isAnyLoading}
                        className="h-9 w-9 shrink-0 border-r border-border text-foreground"
                      >
                        <TableOfContents className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('title.historyCommitMessage')}</TooltipContent>
                  </Tooltip>
                  <Button
                    id="generate-button"
                    className={`relative ${isLoadingGenerate ? 'border-effect' : ''} ${isAnyLoading ? 'cursor-progress' : ''} text-foreground`}
                    variant={variant}
                    onClick={() => {
                      if (!isAnyLoading) {
                        generateCommitMessage()
                      }
                    }}
                  >
                    {isLoadingGenerate ? <GlowLoader /> : <Sparkles className="h-4 w-4" />} {t('common.generate')}
                  </Button>
                </div>

                <Button
                  id="check-button"
                  className={`relative ${isAnyLoading ? 'cursor-progress' : ''} text-foreground`}
                  variant={variant}
                  onClick={() => {
                    if (!isAnyLoading) {
                      checkViolations()
                    }
                  }}
                >
                  <CheckCircle className="h-4 w-4" /> {t('common.check')}
                </Button>
                <Button
                  id="spotbugs-button"
                  className={`relative ${isAnyLoading ? 'cursor-progress' : ''} text-foreground`}
                  variant={variant}
                  onClick={() => {
                    if (!isAnyLoading) {
                      let selectedFiles: string[] = []

                      if (versionControlSystem === 'git') {
                        // For Git, use only selected (checked) staged files
                        if (isMultiRepo && effectivePaths.length > 0) {
                          const stagedFiles = effectivePaths.flatMap((_, i) => gitMultiTableRefs.current[i]?.getAllStagedFiles?.() ?? [])
                          selectedFiles = stagedFiles.filter((file: any) => file.filePath.endsWith('.java')).map((file: any) => file.filePath)
                        } else if (gitDualTableRef.current) {
                          const stagedFiles = gitDualTableRef.current.getAllStagedFiles()
                          selectedFiles = stagedFiles.filter((file: any) => file.filePath.endsWith('.java')).map((file: any) => file.filePath)
                        } else {
                          toast.warning(t('message.noFilesWarning'))
                          return
                        }
                      } else {
                        // For SVN, use selected rows from DataTable
                        const selectedRows = tableRef.current.table?.getSelectedRowModel().rows ?? []
                        selectedFiles = selectedRows
                          .filter((row: any) => {
                            const filePath = row.original.filePath
                            return filePath.endsWith('.java')
                          })
                          .map((row: any) => row.original.filePath)
                      }

                      if (selectedFiles.length === 0) {
                        toast.warning(t('toast.leastOneJavaFile'))
                        return
                      }
                      window.api.electron.send(IPC.WINDOW.SPOTBUGS, selectedFiles)
                      hasCheckSpotbugsRef.current = true
                    }
                  }}
                >
                  <Bug className="h-4 w-4" /> {t('SpotBugs')}
                </Button>
                {/* Commit + Commit Options (Git) button group - Options left, Commit right */}
                {versionControlSystem === 'git' ? (
                  <div className="inline-flex rounded-md overflow-hidden [&_button]:rounded-none [&_button:first-child]:rounded-l-md [&_button:last-child]:rounded-r-md">
                    <Popover>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant={variant}
                              size="icon"
                              className="h-9 w-9 shrink-0 border-r border-border text-foreground"
                              aria-label={t('git.commitOptions')}
                            >
                              <SlidersHorizontal className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="top">{t('git.commitOptions')}</TooltipContent>
                      </Tooltip>
                      <PopoverContent className="w-56 p-3" align="end" side="top">
                        <div className="space-y-3">
                          {autoPush ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <label htmlFor="commit-amend-popover" className="flex items-center gap-2 cursor-not-allowed select-none opacity-60">
                                  <Checkbox id="commit-amend-popover" checked={commitAmend} onCheckedChange={c => setCommitAmend(c === true)} disabled />
                                  <span className="text-sm">{t('git.commitAmend')}</span>
                                </label>
                              </TooltipTrigger>
                              <TooltipContent side="top">{t('git.commitAmendDisabledHint')}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <label htmlFor="commit-amend-popover" className="flex items-center gap-2 cursor-pointer select-none">
                              <Checkbox id="commit-amend-popover" checked={commitAmend} onCheckedChange={c => setCommitAmend(c === true)} />
                              <span className="text-sm">{t('git.commitAmend')}</span>
                            </label>
                          )}
                          <label htmlFor="commit-signoff-popover" className="flex items-center gap-2 cursor-pointer select-none">
                            <Checkbox id="commit-signoff-popover" checked={commitSignOff} onCheckedChange={c => setCommitSignOff(c === true)} />
                            <span className="text-sm">{t('git.commitSignOff')}</span>
                          </label>
                          <label htmlFor="auto-push-popover" className="flex items-center gap-2 cursor-pointer select-none">
                            <Checkbox id="auto-push-popover" checked={autoPush} onCheckedChange={checked => setAutoPush(checked === true)} />
                            <span className="text-sm">{t('git.autoPush')}</span>
                          </label>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button
                      id="commit-button"
                      className={`relative ${isLoadingCommit ? 'border-effect' : ''} ${isAnyLoading ? 'cursor-progress' : ''} text-foreground`}
                      variant={variant}
                      onClick={() => {
                        if (!isAnyLoading) {
                          commitCode()
                        }
                      }}
                    >
                      {isLoadingCommit ? <GlowLoader /> : <SendHorizontal className="h-4 w-4" />} {t('common.commit')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    id="commit-button"
                    className={`relative ${isLoadingCommit ? 'border-effect' : ''} ${isAnyLoading ? 'cursor-progress' : ''} text-foreground`}
                    variant={variant}
                    onClick={() => {
                      if (!isAnyLoading) {
                        commitCode()
                      }
                    }}
                  >
                    {isLoadingCommit ? <GlowLoader /> : <SendHorizontal className="h-4 w-4" />} {t('common.commit')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Commit Convention Warning Dialog (warn mode) - conditional mount */}
        {commitConventionDialog && (
          <AlertDialog
            open={commitConventionDialog.open}
            onOpenChange={open => {
              if (!open) setCommitConventionDialog(null)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('commitConvention.warnTitle')}</AlertDialogTitle>
              </AlertDialogHeader>
              <div className="space-y-2 py-2">
                <p className="text-sm text-muted-foreground">{t('commitConvention.warnDescription')}</p>
                {(commitConventionDialog?.errors.length ?? 0) > 0 && (
                  <ul className="list-disc list-inside text-sm text-destructive space-y-1">
                    {commitConventionDialog?.errors.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                )}
                {(commitConventionDialog?.warnings.length ?? 0) > 0 && (
                  <ul className="list-disc list-inside text-sm text-amber-600 dark:text-amber-500 space-y-1">
                    {commitConventionDialog?.warnings.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                )}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setCommitConventionDialog(null)}>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => commitConventionDialog?.onConfirm()}>{t('commitConvention.continueAnyway')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {gitleaksDialog && (
          <AlertDialog
            open={gitleaksDialog.open}
            onOpenChange={open => {
              if (!open) setGitleaksDialog(null)
            }}
          >
            <AlertDialogContent className="max-w-lg max-h-[85vh] flex flex-col">
              <AlertDialogHeader>
                <AlertDialogTitle>{t('gitleaks.warnTitle')}</AlertDialogTitle>
              </AlertDialogHeader>
              <div className="space-y-2 py-2 overflow-y-auto min-h-0">
                <p className="text-sm text-muted-foreground">{t('gitleaks.warnDescription')}</p>
                <ul className="list-disc list-inside text-sm space-y-1 font-mono break-all">
                  {gitleaksDialog.findings.slice(0, 40).map((f, i) => (
                    <li key={i}>
                      {f.repoLabel ? `[${f.repoLabel}] ` : ''}
                      {f.file}
                      {f.startLine != null ? `:${f.startLine}` : ''} — {f.ruleId}
                    </li>
                  ))}
                </ul>
                {gitleaksDialog.findings.length > 40 && (
                  <p className="text-xs text-muted-foreground">{t('gitleaks.moreFindings', { count: gitleaksDialog.findings.length - 40 })}</p>
                )}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setGitleaksDialog(null)}>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => gitleaksDialog?.onConfirm()}>{t('gitleaks.continueAnyway')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Commit/Push Realtime Log Dialog */}
        <VcsOperationLogDialog
          open={showCommitResultDialog}
          onOpenChange={setShowCommitResultDialog}
          vcsType={versionControlSystem === 'git' ? 'git' : 'svn'}
          title={commitDialogTitle}
          streamingLog={commitStreamingLog}
          isStreaming={commitIsStreaming}
          completionMessage={commitCompletionMessage}
          operationStatus={commitOperationStatus}
          failureMessage={commitCompletionMessage === 'dialog.updateResult.completedPush' ? 'dialog.updateResult.failedPush' : 'dialog.updateResult.failedCommit'}
          folderPath={isMultiRepo && effectivePaths.length > 0 ? (effectivePaths[Number(multiRepoActiveTab)] ?? effectivePaths[0]) : undefined}
          label={isMultiRepo && effectiveLabels.length > 0 ? (effectiveLabels[Number(multiRepoActiveTab)] ?? effectiveLabels[0]) : undefined}
        />

        {/* Login Dialog: import tĩnh + luôn mount (open=false) để mở tức thì — tránh delay do lazy chunk như trước */}
        <LoginDialog open={showLoginDialog} onOpenChange={setShowLoginDialog} onSuccess={() => setShowLoginDialog(false)} />

        {/* Change Password Dialog - opened from TitleBar user dropdown */}
        {showChangePasswordDialog && (
          <Suspense fallback={null}>
            <ChangePasswordDialog open={showChangePasswordDialog} onOpenChange={setShowChangePasswordDialog} />
          </Suspense>
        )}
      </div>
    </div>
  )
}
