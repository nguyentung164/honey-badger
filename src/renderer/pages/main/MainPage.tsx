'use client'
import { IPC } from 'main/constants'
import { lazy, type MutableRefObject, type RefObject, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CommitWorkflowRunChoices } from 'shared/commitWorkflow/runChoices'
import { EMPTY_COMMIT_WORKFLOW_RUN_CHOICES } from 'shared/commitWorkflow/runChoices'
import {
  AUTOMATION_RENDERER_CHANNELS,
  DEV_PIPELINE_RENDERER_CHANNELS,
  PR_MANAGER_RENDERER_CHANNELS,
  SHOW_LOG_RENDERER_CHANNELS,
  TASK_MANAGEMENT_RENDERER_CHANNELS,
} from 'shared/constants'
import type { FilesChangedPayload } from 'shared/filesChanged'
import { normalizeRepoRoot, resolveRepoRootForPath } from 'shared/filesChanged'
import {
  getInitialShellViewFromStorage,
  isTaskShellRole,
  MAIN_SHELL_VIEW_KEY,
  type MainShellView,
  readPersistedAutomationDetached,
  readPersistedDevPipelinesDetached,
  readPersistedPrManagerDetached,
  readPersistedShowLogDetached,
  readPersistedTasksDetached,
  readStoredShellView,
  writePersistedAutomationDetached,
  writePersistedDevPipelinesDetached,
  writePersistedPrManagerDetached,
  writePersistedShowLogDetached,
  writePersistedTasksDetached,
} from 'shared/mainShellView'
import { CommitWorkflowPreCommitDialog, type PreCommitRepoTab } from '@/components/commit-workflow/CommitWorkflowPreCommitDialog'
import { ChangePasswordDialog } from '@/components/dialogs/auth/ChangePasswordDialog'
import { LoginDialog } from '@/components/dialogs/auth/LoginDialog'
import { VcsOperationLogDialog } from '@/components/dialogs/vcs/VcsOperationLogDialog'
import { LANGUAGES } from '@/components/shared/constants'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import { useTerminalPrefs } from '@/hooks/useTerminalPrefs'
import { triggerCommitWorkflowAfterCommit } from '@/lib/commitWorkflow/commitWorkflowUtils'
import { gitStagingRepoRootKey, readGitStagingLayoutDirection } from '@/lib/diffViewer/openDiffViewer'
import { buildEditorWorkspaceFolders, resolveEditorRepoCwd } from '@/lib/multiRepoUtils'
import { MAIN_SHELL_OPEN_EDITOR_EVENT } from '@/lib/openEditor'
import { buildShowLogOpenPayload, MAIN_SHELL_OPEN_SHOW_LOG_EVENT, type ShowLogOpenPayload } from '@/lib/openShowLog'
import { requestTerminalAtPath } from '@/lib/terminal/terminalLaunchBridge'
import { isTerminalToggleShortcut, shouldBlockTerminalToggleShortcut } from '@/lib/terminal/terminalToggleShortcut'
import { validateCommitMessage } from '@/lib/validateCommitMessage'
import { useEditorSessionLifecycle } from '@/pages/editor/hooks/useEditorSessionLifecycle'
import { useEditorWorkspace } from '@/pages/editor/hooks/useEditorWorkspace'
import { AutomationToolbarPortalContext } from '@/pages/main/AutomationToolbarPortalContext'
import { CommitFooterActions } from '@/pages/main/CommitFooterActions'
import { CommitGenerateButton } from '@/pages/main/CommitGenerateButton'
import { CommitMessagePanel } from '@/pages/main/CommitMessagePanel'
import { DevPipelinesToolbarPortalContext } from '@/pages/main/DevPipelinesToolbarPortalContext'
import { GitStagingTable } from '@/pages/main/GitStagingTable'
import { IntegratedTerminalPanel } from '@/pages/main/IntegratedTerminalPanel'
import { PrManagerToolbarPortalContext } from '@/pages/main/PrManagerToolbarPortalContext'
import { QuickCreatePrDialog } from '@/pages/main/QuickCreatePrDialog'
import { ShowLogToolbarPortalContext } from '@/pages/main/ShowLogToolbarPortalContext'
import { type FileData, SvnFileTable } from '@/pages/main/SvnFileTable'
import { type LazyShellView, ShellTabPanel, useShellTabIdleUnload, useShellTabLastActiveAt, useShellTabVisited } from '@/pages/main/shellTabLifecycle'
import { TaskToolbarPortalContext } from '@/pages/main/TaskToolbarPortalContext'
import { TitleBar } from '@/pages/main/TitleBar'
import { useMainTerminalPanel } from '@/pages/main/useMainTerminalPanel'
import logger from '@/services/logger'
import { useAppearanceStoreSelect, useButtonVariant } from '@/stores/useAppearanceStore'
import { getConfigDataRelevantSnapshot, useConfigurationStore } from '@/stores/useConfigurationStore'
import { useHistoryStore } from '@/stores/useHistoryStore'
import { useMultiRepoEffectiveStore } from '@/stores/useMultiRepoEffectiveStore'
import { useSelectedProjectStore } from '@/stores/useSelectedProjectStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

import { normalizeShellTabOrder } from '@/lib/shellTabDefs'

const MAIN_PANEL_SIZES_KEY = 'main-panel-sizes-config'
const MAIN_GIT_COMMIT_OPTIONS_KEY = 'main-git-commit-options'

type GitCommitOptionsPersisted = { amend: boolean; signOff: boolean; autoPush: boolean }

function readGitCommitOptionsFromStorage(): GitCommitOptionsPersisted {
  const defaults: GitCommitOptionsPersisted = { amend: false, signOff: false, autoPush: false }
  try {
    const raw = localStorage.getItem(MAIN_GIT_COMMIT_OPTIONS_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<GitCommitOptionsPersisted>
    return {
      amend: typeof parsed.amend === 'boolean' ? parsed.amend : defaults.amend,
      signOff: typeof parsed.signOff === 'boolean' ? parsed.signOff : defaults.signOff,
      autoPush: typeof parsed.autoPush === 'boolean' ? parsed.autoPush : defaults.autoPush,
    }
  } catch {
    return defaults
  }
}

function stripSignedOffByLine(message: string): string {
  return message.replace(/\n\nSigned-off-by: .+ <[^>]+>\s*$/s, '').trimEnd()
}

/** Restore commit panel fields from the undone git commit message. */
function applyUndoneCommitMessageToPanel(
  fullMessage: string,
  setCommitMessageSeed: (value: string) => void,
  referenceIdRef: RefObject<HTMLInputElement | null>,
  referenceId: MutableRefObject<string>
) {
  const message = stripSignedOffByLine(fullMessage)
  const newlineIdx = message.indexOf('\n')
  if (newlineIdx === -1) {
    setCommitMessageSeed(message)
    if (referenceIdRef.current) {
      referenceIdRef.current.value = ''
      referenceId.current = ''
    }
    return
  }
  const refId = message.slice(0, newlineIdx).trim()
  const body = message.slice(newlineIdx + 1)
  if (referenceIdRef.current) {
    referenceIdRef.current.value = refId
    referenceId.current = refId
  }
  setCommitMessageSeed(body)
}

const TaskManagement = lazy(() => import('@/pages/taskmanagement/TaskManagement').then(m => ({ default: m.TaskManagement })))

const PrManager = lazy(() => import('@/pages/prmanager/PrManager').then(m => ({ default: m.PrManager })))

const AutomationPage = lazy(() => import('@/pages/automation/AutomationPage').then(m => ({ default: m.AutomationPage })))

const DevPipelinesPage = lazy(() => import('@/pages/dev-pipelines/DevPipelinesPage').then(m => ({ default: m.default })))

const ShowLogPage = lazy(() => import('@/pages/showlog/ShowLog').then(m => ({ default: m.default })))

const EditorPage = lazy(() => import('@/pages/editor/EditorPage').then(m => ({ default: m.EditorPage })))

function getInitialMainPageShellView(): MainShellView {
  const v = getInitialShellViewFromStorage()
  if (readPersistedPrManagerDetached() && v === 'prManager') return 'vcs'
  if (readPersistedTasksDetached() && v === 'tasks') return 'vcs'
  if (readPersistedAutomationDetached() && v === 'automation') return 'vcs'
  if (readPersistedDevPipelinesDetached() && v === 'devPipelines') return 'vcs'
  if (readPersistedShowLogDetached() && v === 'showLog') return 'vcs'
  return v
}

let _initialGitLoadDone = false

interface MainPanelSizes {
  topPanelSize: number
  bottomPanelSize: number
}

export function MainPage() {
  const language = useAppearanceStoreSelect(s => s.language)
  const hiddenShellTabs = useAppearanceStoreSelect(s => s.hiddenShellTabs)
  const shellTabOrder = useAppearanceStoreSelect(s => s.shellTabOrder)
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
  const enableShellSwitcher = Boolean(user && !isGuest)
  const verifySession = useTaskAuthStore(s => s.verifySession)
  const sessionExpiredShownRef = useRef(false)
  const prevVersionControlSystemRef = useRef<typeof versionControlSystem | null>(null)
  const dataSnapshotRef = useRef<string | null>(null)
  const tableRef = useRef<any>(null)
  const gitDualTableRef = useRef<any>(null)
  const [effectivePaths, setEffectivePaths] = useState<string[]>([])
  const [effectiveLabels, setEffectiveLabels] = useState<string[]>([])
  const [multiRepoActiveTab, setMultiRepoActiveTab] = useState('0')
  const multiRepoActiveTabRef = useRef('0')
  multiRepoActiveTabRef.current = multiRepoActiveTab
  const [repoLinksVersion, setRepoLinksVersion] = useState(0)
  /** Map repo root path → bảng staging (tránh lệch index A/B/C khi React reconcile tab) */
  const gitMultiTableRefs = useRef<Record<string, any>>({})
  const effectivePathsRef = useRef<string[]>([])
  const prevIsMultiRepoRef = useRef<boolean>(false)
  /** VCS tab đang hiển thị — dùng trong IPC handlers để defer reload khi tab ẩn. */
  const vcsShellTabActiveRef = useRef(true)
  const pendingVcsActionRef = useRef<'reload' | 'clear' | null>(null)
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
      ; (async () => {
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

  // Bỏ ref repo không còn trong project (tránh giữ instance cũ trùng key)
  useEffect(() => {
    if (versionControlSystem !== 'git' || !multiRepoEnabled) return
    const allowed = new Set(effectivePaths)
    for (const k of Object.keys(gitMultiTableRefs.current)) {
      if (!allowed.has(k)) delete gitMultiTableRefs.current[k]
    }
  }, [versionControlSystem, multiRepoEnabled, effectivePaths])

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
      window.api.configuration.setMultirepoWatchPaths([]).catch(() => { })
      return
    }
    if (effectivePaths.length > 0) {
      window.api.configuration.setMultirepoWatchPaths(effectivePaths).catch(() => { })
    } else {
      window.api.configuration.setMultirepoWatchPaths([]).catch(() => { })
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
      else pendingVcsActionRef.current = 'reload'
    })
  }, [isConfigLoaded, versionControlSystem, isMultiRepo, effectivePaths.length])

  // Reload khi effectivePaths thay đổi (vd user vừa chọn Project trong Settings, hoặc link/unlink repo).
  // Cũng reload gitDualTableRef khi chuyển từ multi-repo về single-repo.
  useEffect(() => {
    if (!isConfigLoaded || versionControlSystem !== 'git') return
    const wasMultiRepo = prevIsMultiRepoRef.current
    prevIsMultiRepoRef.current = isMultiRepo

    if (isMultiRepo && effectivePaths.length > 0) {
      if (!vcsShellTabActiveRef.current) {
        pendingVcsActionRef.current = 'reload'
        return
      }
      const timer = setTimeout(() => {
        effectivePaths.forEach(path => {
          gitMultiTableRefs.current[path]?.reloadData?.()
        })
      }, 0)
      return () => clearTimeout(timer)
    }
    if (wasMultiRepo && !isMultiRepo) {
      if (!vcsShellTabActiveRef.current) {
        pendingVcsActionRef.current = 'reload'
        return
      }
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
    if (!vcsShellTabActiveRef.current) {
      pendingVcsActionRef.current = 'reload'
      return
    }
    if (versionControlSystem === 'git') {
      logger.info('Version control system changed to Git')
      const paths = effectivePathsRef.current
      const multi = isMultiRepo && paths.length > 0
      if (multi) {
        paths.forEach(path => {
          gitMultiTableRefs.current[path]?.reloadData?.()
        })
      } else if (gitDualTableRef.current) {
        gitDualTableRef.current.reloadData()
      }
    } else if (versionControlSystem === 'svn' && tableRef.current) {
      logger.info('Version control system changed to SVN')
      tableRef.current.reloadData()
    }
  }, [versionControlSystem, isMultiRepo, effectivePaths.length])

  // Listen for config-updated from main process (e.g. when another window updates shared config)
  useEffect(() => {
    const handleConfigUpdated = () => {
      window.dispatchEvent(new CustomEvent('configuration-changed', { detail: { type: 'configuration' } }))
    }
    window.api.on(IPC.CONFIG_UPDATED, handleConfigUpdated)
    return () => window.api.removeAllListeners(IPC.CONFIG_UPDATED)
  }, [])

  // Listen for file changes (auto-refresh when files change in source folder)
  useEffect(() => {
    const handleFilesChanged = (_event: unknown, detail?: FilesChangedPayload) => {
      logger.info('Files changed in source folder, reloading data...', detail)
      if (!vcsShellTabActiveRef.current) {
        pendingVcsActionRef.current = 'reload'
        return
      }
      const cfg = useConfigurationStore.getState()
      const vcs = cfg.versionControlSystem
      const paths = effectivePathsRef.current
      const multi = vcs === 'git' && !!cfg.multiRepoEnabled && paths.length >= 1
      const reloadOpts = detail?.source === 'watcher' || detail?.source === 'staging' ? { silent: true as const } : undefined
      if (vcs === 'git') {
        if (multi && paths.length > 0) {
          let targetPath: string | undefined
          if (detail?.cwd) {
            const cwdNorm = normalizeRepoRoot(detail.cwd)
            targetPath = paths.find(p => normalizeRepoRoot(p) === cwdNorm)
          } else if (detail?.changedPath) {
            targetPath = resolveRepoRootForPath(paths, detail.changedPath)
          }
          if (targetPath) {
            gitMultiTableRefs.current[targetPath]?.reloadData?.(reloadOpts)
            return
          }
          if (detail?.source === 'staging') {
            const idx = Number(multiRepoActiveTabRef.current)
            const activePath = paths[idx] ?? paths[0]
            gitMultiTableRefs.current[activePath]?.reloadData?.(reloadOpts)
            return
          }
          paths.forEach(path => {
            gitMultiTableRefs.current[path]?.reloadData?.(reloadOpts)
          })
        } else if (gitDualTableRef.current) {
          void gitDualTableRef.current.reloadData(reloadOpts)
        }
      } else if (vcs === 'svn' && tableRef.current) {
        void tableRef.current.reloadData(detail?.source === 'watcher')
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
          if (!vcsShellTabActiveRef.current) {
            pendingVcsActionRef.current = 'clear'
            return
          }
          if (gitDualTableRef.current?.clearData) gitDualTableRef.current.clearData()
          Object.values(gitMultiTableRefs.current).forEach(ref => {
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

        if (!vcsShellTabActiveRef.current) {
          pendingVcsActionRef.current = 'reload'
          return
        }
        const paths = effectivePathsRef.current
        if (updatedVCS === 'git') {
          if (updatedMultiRepo && paths.length > 0) {
            paths.forEach(path => {
              gitMultiTableRefs.current[path]?.reloadData?.()
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
      if (!vcsShellTabActiveRef.current) {
        pendingVcsActionRef.current = 'reload'
        return
      }
      const cfg = useConfigurationStore.getState()
      const paths = effectivePathsRef.current
      const multi = cfg.versionControlSystem === 'git' && !!cfg.multiRepoEnabled && paths.length >= 1
      if (cfg.versionControlSystem === 'git') {
        if (multi && paths.length > 0) {
          paths.forEach(path => {
            gitMultiTableRefs.current[path]?.reloadData?.()
          })
        } else if (gitDualTableRef.current) {
          gitDualTableRef.current.reloadData()
        }
      }
    }

    const handleGitUndoCommit = () => {
      logger.info('Git undo commit detected, reloading data...')
      if (!vcsShellTabActiveRef.current) {
        pendingVcsActionRef.current = 'reload'
        return
      }
      const cfg = useConfigurationStore.getState()
      const paths = effectivePathsRef.current
      const multi = cfg.versionControlSystem === 'git' && !!cfg.multiRepoEnabled && paths.length >= 1
      if (cfg.versionControlSystem === 'git') {
        if (multi && paths.length > 0) {
          paths.forEach(path => {
            gitMultiTableRefs.current[path]?.reloadData?.()
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
  useEffect(() => {
    const handleGitUndoCommitMessage = (event: Event) => {
      const commitMessage = (event as CustomEvent<{ commitMessage?: string }>).detail?.commitMessage
      if (!commitMessage?.trim()) return
      applyUndoneCommitMessageToPanel(commitMessage, setCommitMessageSeed, referenceIdRef, referenceId)
    }
    window.addEventListener('git-undo-commit', handleGitUndoCommitMessage)
    return () => window.removeEventListener('git-undo-commit', handleGitUndoCommitMessage)
  }, [])
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
  const [preCommitOpen, setPreCommitOpen] = useState(false)
  const [preCommitTabs, setPreCommitTabs] = useState<PreCommitRepoTab[]>([])
  const pendingCommitRef = useRef<{
    selectedFiles: any[]
    finalCommitMessage: string
    multiRepoPayload: { repos: { path: string; files: FileData[] }[]; labels?: string[] } | null
  } | null>(null)
  const [autoPush, setAutoPush] = useState(() => readGitCommitOptionsFromStorage().autoPush)
  const [commitAmend, setCommitAmend] = useState(() => readGitCommitOptionsFromStorage().amend)
  const [commitSignOff, setCommitSignOff] = useState(() => readGitCommitOptionsFromStorage().signOff)

  useEffect(() => {
    try {
      const payload: GitCommitOptionsPersisted = { amend: commitAmend, signOff: commitSignOff, autoPush }
      localStorage.setItem(MAIN_GIT_COMMIT_OPTIONS_KEY, JSON.stringify(payload))
    } catch {
      /* ignore */
    }
  }, [commitAmend, commitSignOff, autoPush])
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false)
  const [shellView, setShellView] = useState<MainShellView>(() => getInitialMainPageShellView())
  const { visitedShellTabs, markVisited, unmarkVisited, resetVisited } = useShellTabVisited(getInitialMainPageShellView(), false)
  const shellTabLastActiveAtRef = useShellTabLastActiveAt()
  const [prManagerDetached, setPrManagerDetached] = useState<boolean>(() => readPersistedPrManagerDetached())
  const [tasksDetached, setTasksDetached] = useState<boolean>(() => readPersistedTasksDetached())
  const [automationDetached, setAutomationDetached] = useState<boolean>(() => readPersistedAutomationDetached())
  const [devPipelinesDetached, setDevPipelinesDetached] = useState<boolean>(() => readPersistedDevPipelinesDetached())
  const [showLogDetached, setShowLogDetached] = useState<boolean>(() => readPersistedShowLogDetached())
  const [showLogOpenPayload, setShowLogOpenPayload] = useState<ShowLogOpenPayload | null>(null)
  const showLogHandoffGetterRef = useRef<(() => ShowLogOpenPayload) | null>(null)
  const prevShellForShowLogRef = useRef<MainShellView | null>(null)

  /** TitleBar dock chỉ gỡ trạng thái tách; dock từ cửa sổ riêng vẫn chuyển shell sang tab tương ứng. */
  const dockFromTitleBarRef = useRef({ pr: false, tasks: false, automation: false, devPipelines: false, showLog: false })
  const editorLayoutLeaveRef = useRef<((action: () => void) => void) | null>(null)
  const registerEditorLayoutLeave = useCallback((fn: (action: () => void) => void) => {
    editorLayoutLeaveRef.current = fn
  }, [])

  useEditorSessionLifecycle()

  const guardEditorWorkspaceChange = useCallback(
    (proceed: () => void) => {
      if (shellView !== 'editor') {
        proceed()
        return
      }
      if (!useEditorWorkspace.getState().hasDirtyTabs()) {
        proceed()
        return
      }
      const guard = editorLayoutLeaveRef.current
      if (guard) {
        guard(proceed)
        return
      }
      toast.warning(t('editor.unsavedWait', 'Editor is still loading. Try again in a moment.'))
    },
    [shellView, t]
  )

  const applyShellView = useCallback((v: MainShellView) => {
    setShellView(v)
    try {
      localStorage.setItem(MAIN_SHELL_VIEW_KEY, v)
    } catch {
      /* ignore */
    }
  }, [])

  const persistShellView = useCallback(
    (v: MainShellView) => {
      if (shellView === 'editor' && v !== 'editor' && useEditorWorkspace.getState().hasDirtyTabs()) {
        const guard = editorLayoutLeaveRef.current
        if (guard) {
          guard(() => applyShellView(v))
          return
        }
        toast.warning(t('editor.unsavedWait', 'Editor is still loading. Try again in a moment.'))
        return
      }
      applyShellView(v)
    },
    [applyShellView, shellView, t]
  )

  const persistPrManagerDetached = useCallback((detached: boolean) => {
    setPrManagerDetached(detached)
    writePersistedPrManagerDetached(detached)
  }, [])

  const persistTasksDetached = useCallback((detached: boolean) => {
    setTasksDetached(detached)
    writePersistedTasksDetached(detached)
  }, [])

  const persistAutomationDetached = useCallback((detached: boolean) => {
    setAutomationDetached(detached)
    writePersistedAutomationDetached(detached)
  }, [])

  const persistDevPipelinesDetached = useCallback((detached: boolean) => {
    setDevPipelinesDetached(detached)
    writePersistedDevPipelinesDetached(detached)
  }, [])

  const persistShowLogDetached = useCallback((detached: boolean) => {
    setShowLogDetached(detached)
    writePersistedShowLogDetached(detached)
  }, [])

  useEffect(() => {
    if (!user || isGuest) {
      setShellView('vcs')
      resetVisited('vcs', false)
      setPrManagerDetached(false)
      writePersistedPrManagerDetached(false)
      setTasksDetached(false)
      writePersistedTasksDetached(false)
      setAutomationDetached(false)
      writePersistedAutomationDetached(false)
      setDevPipelinesDetached(false)
      writePersistedDevPipelinesDetached(false)
      setShowLogDetached(false)
      writePersistedShowLogDetached(false)
      setShowLogOpenPayload(null)
      try {
        localStorage.setItem(MAIN_SHELL_VIEW_KEY, 'vcs')
      } catch {
        /* ignore */
      }
      return
    }
    const stored = readStoredShellView()
    let next = stored ?? (isTaskShellRole(user.role) ? 'tasks' : 'vcs')
    if (readPersistedPrManagerDetached() && next === 'prManager') {
      next = 'vcs'
    }
    if (readPersistedTasksDetached() && next === 'tasks') {
      next = 'vcs'
    }
    if (readPersistedAutomationDetached() && next === 'automation') {
      next = 'vcs'
    }
    if (readPersistedDevPipelinesDetached() && next === 'devPipelines') {
      next = 'vcs'
    }
    if (readPersistedShowLogDetached() && next === 'showLog') {
      next = 'vcs'
    }
    setShellView(next)
    resetVisited(next, true)
    if (stored === null && isTaskShellRole(user.role)) {
      try {
        localStorage.setItem(MAIN_SHELL_VIEW_KEY, 'tasks')
      } catch {
        /* ignore */
      }
    }
  }, [user, isGuest, resetVisited])

  useEffect(() => {
    if (!enableShellSwitcher) return
    markVisited('editor')
    markVisited(shellView)
  }, [enableShellSwitcher, shellView, markVisited])

  const handlePrManagerDetach = useCallback(() => {
    persistPrManagerDetached(true)
    persistShellView('vcs')
    window.api.prManager.openWindow()
  }, [persistPrManagerDetached, persistShellView])

  const handlePrManagerDockFromTitleBar = useCallback(() => {
    dockFromTitleBarRef.current.pr = true
    window.api.prManager.requestDock()
  }, [])

  const handleTasksDetach = useCallback(() => {
    persistTasksDetached(true)
    persistShellView('vcs')
    window.api.taskManagement.openWindow()
  }, [persistTasksDetached, persistShellView])

  const handleTasksDockFromTitleBar = useCallback(() => {
    dockFromTitleBarRef.current.tasks = true
    window.api.taskManagement.requestDock()
  }, [])

  const handleAutomationDetach = useCallback(() => {
    persistAutomationDetached(true)
    persistShellView('vcs')
    window.api.automation.openWindow()
  }, [persistAutomationDetached, persistShellView])

  const handleAutomationDockFromTitleBar = useCallback(() => {
    dockFromTitleBarRef.current.automation = true
    window.api.automation.requestDock()
  }, [])

  const handleDevPipelinesDetach = useCallback(() => {
    persistDevPipelinesDetached(true)
    persistShellView('vcs')
    window.api.devPipelines.openWindow()
  }, [persistDevPipelinesDetached, persistShellView])

  const handleDevPipelinesDockFromTitleBar = useCallback(() => {
    dockFromTitleBarRef.current.devPipelines = true
    window.api.devPipelines.requestDock()
  }, [])

  const handleShowLogDetach = useCallback(() => {
    const payload = showLogHandoffGetterRef.current?.() ?? showLogOpenPayload ?? { path: '.' }
    persistShowLogDetached(true)
    persistShellView('vcs')
    window.api.showLog.openWindow(payload)
  }, [persistShowLogDetached, persistShellView, showLogOpenPayload])

  const handleShowLogDockFromTitleBar = useCallback(() => {
    dockFromTitleBarRef.current.showLog = true
    window.api.showLog.requestDock()
  }, [])

  useEffect(() => {
    const onDocked = () => {
      persistPrManagerDetached(false)
      if (dockFromTitleBarRef.current.pr) {
        dockFromTitleBarRef.current.pr = false
      } else {
        persistShellView('prManager')
      }
    }
    const onWindowClosed = () => {
      persistPrManagerDetached(false)
      persistShellView('prManager')
    }
    window.api.on(PR_MANAGER_RENDERER_CHANNELS.DOCKED_TO_MAIN, onDocked)
    window.api.on(PR_MANAGER_RENDERER_CHANNELS.WINDOW_CLOSED, onWindowClosed)
    return () => {
      window.api.removeListener(PR_MANAGER_RENDERER_CHANNELS.DOCKED_TO_MAIN, onDocked)
      window.api.removeListener(PR_MANAGER_RENDERER_CHANNELS.WINDOW_CLOSED, onWindowClosed)
    }
  }, [persistPrManagerDetached, persistShellView])

  useEffect(() => {
    const onDocked = () => {
      persistTasksDetached(false)
      if (dockFromTitleBarRef.current.tasks) {
        dockFromTitleBarRef.current.tasks = false
      } else {
        persistShellView('tasks')
      }
    }
    const onWindowClosed = () => {
      persistTasksDetached(false)
      persistShellView('tasks')
    }
    window.api.on(TASK_MANAGEMENT_RENDERER_CHANNELS.DOCKED_TO_MAIN, onDocked)
    window.api.on(TASK_MANAGEMENT_RENDERER_CHANNELS.WINDOW_CLOSED, onWindowClosed)
    return () => {
      window.api.removeListener(TASK_MANAGEMENT_RENDERER_CHANNELS.DOCKED_TO_MAIN, onDocked)
      window.api.removeListener(TASK_MANAGEMENT_RENDERER_CHANNELS.WINDOW_CLOSED, onWindowClosed)
    }
  }, [persistTasksDetached, persistShellView])

  useEffect(() => {
    const onDocked = () => {
      persistAutomationDetached(false)
      if (dockFromTitleBarRef.current.automation) {
        dockFromTitleBarRef.current.automation = false
      } else {
        persistShellView('automation')
      }
    }
    const onWindowClosed = () => {
      persistAutomationDetached(false)
      persistShellView('automation')
    }
    window.api.on(AUTOMATION_RENDERER_CHANNELS.DOCKED_TO_MAIN, onDocked)
    window.api.on(AUTOMATION_RENDERER_CHANNELS.WINDOW_CLOSED, onWindowClosed)
    return () => {
      window.api.removeListener(AUTOMATION_RENDERER_CHANNELS.DOCKED_TO_MAIN, onDocked)
      window.api.removeListener(AUTOMATION_RENDERER_CHANNELS.WINDOW_CLOSED, onWindowClosed)
    }
  }, [persistAutomationDetached, persistShellView])

  useEffect(() => {
    const onDocked = () => {
      persistDevPipelinesDetached(false)
      if (dockFromTitleBarRef.current.devPipelines) {
        dockFromTitleBarRef.current.devPipelines = false
      } else {
        persistShellView('devPipelines')
      }
    }
    const onWindowClosed = () => {
      persistDevPipelinesDetached(false)
      persistShellView('devPipelines')
    }
    window.api.on(DEV_PIPELINE_RENDERER_CHANNELS.DOCKED_TO_MAIN, onDocked)
    window.api.on(DEV_PIPELINE_RENDERER_CHANNELS.WINDOW_CLOSED, onWindowClosed)
    return () => {
      window.api.removeListener(DEV_PIPELINE_RENDERER_CHANNELS.DOCKED_TO_MAIN, onDocked)
      window.api.removeListener(DEV_PIPELINE_RENDERER_CHANNELS.WINDOW_CLOSED, onWindowClosed)
    }
  }, [persistDevPipelinesDetached, persistShellView])

  useEffect(() => {
    const onDocked = (_event: unknown, payload?: ShowLogOpenPayload) => {
      persistShowLogDetached(false)
      if (payload && typeof payload === 'object' && 'path' in payload) {
        setShowLogOpenPayload(payload)
      }
      if (dockFromTitleBarRef.current.showLog) {
        dockFromTitleBarRef.current.showLog = false
      } else {
        persistShellView('showLog')
      }
    }
    const onWindowClosed = () => {
      persistShowLogDetached(false)
      persistShellView('showLog')
    }
    window.api.on(SHOW_LOG_RENDERER_CHANNELS.DOCKED_TO_MAIN, onDocked)
    window.api.on(SHOW_LOG_RENDERER_CHANNELS.WINDOW_CLOSED, onWindowClosed)
    return () => {
      window.api.removeListener(SHOW_LOG_RENDERER_CHANNELS.DOCKED_TO_MAIN, onDocked)
      window.api.removeListener(SHOW_LOG_RENDERER_CHANNELS.WINDOW_CLOSED, onWindowClosed)
    }
  }, [persistShowLogDetached, persistShellView])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ShowLogOpenPayload>).detail
      if (!detail) return
      setShowLogOpenPayload(detail)
      persistShellView('showLog')
    }
    window.addEventListener(MAIN_SHELL_OPEN_SHOW_LOG_EVENT, handler)
    return () => window.removeEventListener(MAIN_SHELL_OPEN_SHOW_LOG_EVENT, handler)
  }, [persistShellView])

  useEffect(() => {
    const handler = () => {
      if (!enableShellSwitcher) return
      persistShellView('editor')
    }
    window.addEventListener(MAIN_SHELL_OPEN_EDITOR_EVENT, handler)
    return () => window.removeEventListener(MAIN_SHELL_OPEN_EDITOR_EVENT, handler)
  }, [enableShellSwitcher, persistShellView])

  // Tab đang active bị ẩn qua setting (Appearance) → chuyển sang tab còn hiển thị gần nhất.
  useEffect(() => {
    if (!enableShellSwitcher || !hiddenShellTabs.includes(shellView)) return
    const detachedByView: Record<MainShellView, boolean> = {
      editor: false,
      vcs: false,
      tasks: tasksDetached,
      prManager: prManagerDetached,
      automation: automationDetached,
      devPipelines: devPipelinesDetached,
      showLog: showLogDetached,
    }
    const fallback = normalizeShellTabOrder(shellTabOrder).find(view => !hiddenShellTabs.includes(view) && !detachedByView[view])
    if (fallback) persistShellView(fallback)
  }, [enableShellSwitcher, hiddenShellTabs, shellTabOrder, shellView, persistShellView, tasksDetached, prManagerDetached, automationDetached, devPipelinesDetached, showLogDetached])

  // Show Log: giữ context khi đổi tab; seed mặc định khi vào tab lần đầu
  useEffect(() => {
    const prev = prevShellForShowLogRef.current
    prevShellForShowLogRef.current = shellView
    if (prev === 'showLog' && shellView !== 'showLog') {
      const snap = showLogHandoffGetterRef.current?.()
      if (snap) setShowLogOpenPayload(snap)
    }
  }, [shellView])

  useEffect(() => {
    if (shellView !== 'showLog' || showLogDetached || !enableShellSwitcher) return
    if (showLogOpenPayload) return
    if (!isConfigLoaded) return
    setShowLogOpenPayload(
      buildShowLogOpenPayload({
        filePath: '.',
        sourceFolder: sourceFolder || undefined,
        versionControlSystem,
      })
    )
  }, [shellView, showLogDetached, enableShellSwitcher, showLogOpenPayload, isConfigLoaded, sourceFolder, versionControlSystem])

  const showEmbeddedEditor = enableShellSwitcher && shellView === 'editor'
  const showEmbeddedTasks = enableShellSwitcher && shellView === 'tasks' && !tasksDetached
  const showEmbeddedPrManager = enableShellSwitcher && shellView === 'prManager' && !prManagerDetached
  const showEmbeddedAutomation = enableShellSwitcher && shellView === 'automation' && !automationDetached
  const showEmbeddedDevPipelines = enableShellSwitcher && shellView === 'devPipelines' && !devPipelinesDetached
  const showEmbeddedShowLog = enableShellSwitcher && shellView === 'showLog' && !showLogDetached
  const anyEmbeddedShellView = showEmbeddedEditor || showEmbeddedTasks || showEmbeddedPrManager || showEmbeddedAutomation || showEmbeddedDevPipelines || showEmbeddedShowLog
  /** Workspace VCS luôn mounted; chỉ ẩn bằng CSS khi tab embedded khác đang hiển thị. */
  const vcsWorkspaceVisible = !enableShellSwitcher || !anyEmbeddedShellView
  vcsShellTabActiveRef.current = vcsWorkspaceVisible

  const reloadGitWorkspaceData = useCallback(
    (options?: { silent?: boolean }) => {
      if (versionControlSystem !== 'git') return
      const paths = effectivePathsRef.current
      const multi = !!multiRepoEnabled && paths.length >= 1
      if (multi) {
        paths.forEach(path => {
          gitMultiTableRefs.current[path]?.reloadData?.(options)
        })
      } else {
        gitDualTableRef.current?.reloadData?.(options)
      }
    },
    [versionControlSystem, multiRepoEnabled]
  )

  useEffect(() => {
    if (!vcsWorkspaceVisible || !isConfigLoaded) return
    const action = pendingVcsActionRef.current
    if (!action) return
    pendingVcsActionRef.current = null
    const timer = setTimeout(() => {
      if (action === 'clear') {
        logger.info('Returned to Workspace tab, clearing stale file list...')
        gitDualTableRef.current?.clearData?.()
        Object.values(gitMultiTableRefs.current).forEach(ref => {
          ref?.clearData?.()
        })
        tableRef.current?.clearData?.()
        return
      }
      logger.info('Returned to Workspace tab with pending changes, refreshing silently...')
      if (useConfigurationStore.getState().versionControlSystem === 'svn') {
        tableRef.current?.reloadData?.(true)
        return
      }
      reloadGitWorkspaceData({ silent: true })
    }, 0)
    return () => clearTimeout(timer)
  }, [vcsWorkspaceVisible, isConfigLoaded, reloadGitWorkspaceData])

  const handleUnloadLazyShellTab = useCallback(
    (view: LazyShellView) => {
      logger.info(`Idle unload shell tab: ${view}`)
      unmarkVisited(view)
    },
    [unmarkVisited]
  )

  const handleUnloadEditorShellTab = useCallback(() => {
    logger.info('Idle unload shell tab: editor')
    unmarkVisited('editor')
  }, [unmarkVisited])

  useShellTabIdleUnload({
    enabled: enableShellSwitcher,
    activeView: shellView,
    visitedShellTabs,
    shellTabLastActiveAtRef,
    onUnloadLazy: handleUnloadLazyShellTab,
    onUnloadEditor: handleUnloadEditorShellTab,
  })

  const shellTabLoader = (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <GlowLoader className="w-10 h-10" />
    </div>
  )

  const [taskToolbarHostEl, setTaskToolbarHostEl] = useState<HTMLDivElement | null>(null)
  const taskToolbarHostRef = useCallback((node: HTMLDivElement | null) => {
    setTaskToolbarHostEl(prev => (prev === node ? prev : node))
  }, [])
  const [taskToolbarActionsEl, setTaskToolbarActionsEl] = useState<HTMLDivElement | null>(null)
  const taskToolbarActionsHostRef = useCallback((node: HTMLDivElement | null) => {
    setTaskToolbarActionsEl(prev => (prev === node ? prev : node))
  }, [])
  const [prManagerToolbarHostEl, setPrManagerToolbarHostEl] = useState<HTMLDivElement | null>(null)
  const prManagerToolbarHostRef = useCallback((node: HTMLDivElement | null) => {
    setPrManagerToolbarHostEl(prev => (prev === node ? prev : node))
  }, [])
  const [automationToolbarHostEl, setAutomationToolbarHostEl] = useState<HTMLDivElement | null>(null)
  const automationToolbarHostRef = useCallback((node: HTMLDivElement | null) => {
    setAutomationToolbarHostEl(prev => (prev === node ? prev : node))
  }, [])
  const [devPipelinesToolbarHostEl, setDevPipelinesToolbarHostEl] = useState<HTMLDivElement | null>(null)
  const devPipelinesToolbarHostRef = useCallback((node: HTMLDivElement | null) => {
    setDevPipelinesToolbarHostEl(prev => (prev === node ? prev : node))
  }, [])
  const [showLogToolbarHostEl, setShowLogToolbarHostEl] = useState<HTMLDivElement | null>(null)
  const showLogToolbarHostRef = useCallback((node: HTMLDivElement | null) => {
    setShowLogToolbarHostEl(prev => (prev === node ? prev : node))
  }, [])

  const [showCommitResultDialog, setShowCommitResultDialog] = useState(false)
  const [commitStreamingLog, setCommitStreamingLog] = useState('')
  const [commitIsStreaming, setCommitIsStreaming] = useState(false)
  const [commitDialogTitle, setCommitDialogTitle] = useState('')
  const [commitCompletionMessage, setCommitCompletionMessage] = useState('')
  const [commitOperationStatus, setCommitOperationStatus] = useState<'success' | 'error' | undefined>(undefined)
  const [quickPrDialogOpen, setQuickPrDialogOpen] = useState(false)
  const [gitStagingLayoutDirection, setGitStagingLayoutDirection] = useState<'horizontal' | 'vertical'>(() => readGitStagingLayoutDirection(gitStagingRepoRootKey(sourceFolder)))
  const setGitStagingLayoutDirectionIfChanged = useCallback((direction: 'horizontal' | 'vertical') => {
    setGitStagingLayoutDirection(prev => (prev === direction ? prev : direction))
  }, [])
  const gitCommitMessageInTree = versionControlSystem === 'git' && gitStagingLayoutDirection === 'vertical'

  const [panelSizes, setPanelSizes] = useState<MainPanelSizes>({
    topPanelSize: 50,
    bottomPanelSize: 50,
  })

  const topPanelRef = useRef<any>(null)
  const bottomPanelRef = useRef<any>(null)
  const panelGroupRef = useRef<any>(null)
  const tablePanelSizesRef = useRef<MainPanelSizes>({ topPanelSize: 50, bottomPanelSize: 50 })
  const isApplyingMainPanelLayoutRef = useRef(false)
  const hasLoadedPanelSizesRef = useRef(false)

  const applyMainPanelLayout = useCallback(
    (layout: Record<string, number>) => {
      const group = panelGroupRef.current
      if (!group?.setLayout) return
      // Vertical git staging collapses to a single panel; a two-panel layout throws at runtime.
      const effectiveLayout = gitCommitMessageInTree ? { 'changed-files-table': layout['changed-files-table'] ?? 100 } : layout
      isApplyingMainPanelLayoutRef.current = true
      group.setLayout(effectiveLayout)
      queueMicrotask(() => {
        isApplyingMainPanelLayoutRef.current = false
      })
    },
    [gitCommitMessageInTree]
  )

  const persistTablePanelSizes = useCallback((top: number, bottom: number) => {
    const next: MainPanelSizes = {
      topPanelSize: Math.max(25, Math.min(75, top)),
      bottomPanelSize: Math.max(25, Math.min(75, bottom)),
    }
    tablePanelSizesRef.current = next
    setPanelSizes(prev => (prev.topPanelSize === next.topPanelSize && prev.bottomPanelSize === next.bottomPanelSize ? prev : next))
  }, [])

  useEffect(() => {
    try {
      const savedPanelSizes = localStorage.getItem(MAIN_PANEL_SIZES_KEY)
      if (savedPanelSizes) {
        const sizes: MainPanelSizes = JSON.parse(savedPanelSizes)
        const top = Math.max(25, Math.min(75, sizes.topPanelSize))
        const bottom = Math.max(25, Math.min(75, sizes.bottomPanelSize))
        const normalized = { topPanelSize: top, bottomPanelSize: bottom }
        tablePanelSizesRef.current = normalized
        setPanelSizes(normalized)
        setTimeout(() => {
          if (gitCommitMessageInTree) {
            applyMainPanelLayout({ 'changed-files-table': 100 })
            return
          }
          applyMainPanelLayout({
            'changed-files-table': top,
            'commit-message-panel': bottom,
          })
        }, 0)
      }
    } catch (error) {
      logger.error('Lỗi khi đọc kích thước panel từ localStorage:', error)
    } finally {
      hasLoadedPanelSizesRef.current = true
    }
  }, [applyMainPanelLayout, gitCommitMessageInTree])

  useEffect(() => {
    if (!hasLoadedPanelSizesRef.current) return
    if (gitCommitMessageInTree) return
    if (panelSizes.bottomPanelSize <= 0) return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(MAIN_PANEL_SIZES_KEY, JSON.stringify(panelSizes))
      } catch (error) {
        logger.error('Lỗi khi lưu kích thước panel vào localStorage:', error)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [panelSizes, gitCommitMessageInTree])

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (gitCommitMessageInTree) {
        applyMainPanelLayout({ 'changed-files-table': 100 })
        return
      }
      const saved = tablePanelSizesRef.current
      applyMainPanelLayout({
        'changed-files-table': saved.topPanelSize,
        'commit-message-panel': saved.bottomPanelSize,
      })
    }, 0)
    return () => window.clearTimeout(id)
  }, [gitCommitMessageInTree, applyMainPanelLayout])

  useEffect(() => {
    if (!vcsWorkspaceVisible) return
    const id = window.setTimeout(() => {
      if (gitCommitMessageInTree) {
        applyMainPanelLayout({ 'changed-files-table': 100 })
        return
      }
      const saved = tablePanelSizesRef.current
      applyMainPanelLayout({
        'changed-files-table': saved.topPanelSize,
        'commit-message-panel': saved.bottomPanelSize,
      })
    }, 0)
    return () => window.clearTimeout(id)
  }, [vcsWorkspaceVisible, gitCommitMessageInTree, applyMainPanelLayout])

  const handleReferenceId = (e: React.ChangeEvent<HTMLInputElement>) => {
    referenceId.current = e.target.value
  }

  const generateCommitMessage = useCallback(async () => {
    let selectedFiles: any[] = []

    if (versionControlSystem === 'git') {
      if (isMultiRepo) {
        const stagedPerRepo = effectivePaths.map(path => gitMultiTableRefs.current[path]?.getAllStagedFiles?.() ?? [])
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
        const stagedPerRepo = effectivePaths.map(path => gitMultiTableRefs.current[path]?.getAllStagedFiles?.() ?? [])
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
        selectedFiles = effectivePaths.flatMap(path => gitMultiTableRefs.current[path]?.getAllStagedFiles?.() ?? [])
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
    async (
      selectedFiles: any[],
      finalCommitMessage: string,
      multiRepoPayload?: { repos: { path: string; files: FileData[] }[]; labels?: string[] } | null,
      runChoicesByRepo?: Record<string, CommitWorkflowRunChoices>
    ) => {
      const workflowChoices = (repoPath: string) => runChoicesByRepo?.[repoPath] ?? structuredClone(EMPTY_COMMIT_WORKFLOW_RUN_CHOICES)
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
                void triggerCommitWorkflowAfterCommit({ ...result.data.commitInfo, sourceFolderPath: path }, path, workflowChoices(path))
              }
            }
          }
          unsubCommit()
          hasCheckCodingRuleRef.current = false
          hasCheckSpotbugsRef.current = false
          repos.forEach(r => {
            gitMultiTableRefs.current[r.path]?.reloadData?.()
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
            const repoPath = commitInfo.sourceFolderPath || sourceFolder || ''
            if (repoPath) {
              void triggerCommitWorkflowAfterCommit(commitInfo, repoPath, workflowChoices(repoPath))
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
          const svnData = result.data as
            | {
              revision?: string
              addedFiles?: string[]
              modifiedFiles?: string[]
              deletedFiles?: string[]
              svnDiffContent?: string
            }
            | undefined
          const repoPath = sourceFolder?.trim() || ''
          if (svnData?.revision && repoPath) {
            void triggerCommitWorkflowAfterCommit(
              {
                commitHash: `svn:r${svnData.revision}`,
                commitMessage: finalCommitMessage,
                addedFiles: svnData.addedFiles ?? [],
                modifiedFiles: svnData.modifiedFiles ?? [],
                deletedFiles: svnData.deletedFiles ?? [],
                svnDiffContent: svnData.svnDiffContent,
              },
              repoPath,
              workflowChoices(repoPath)
            )
          }
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
    [versionControlSystem, t, autoPush, commitAmend, commitSignOff, sourceFolder]
  )

  const buildPreCommitTabs = useCallback(
    (selectedFiles: { filePath: string }[], multiRepoPayload: { repos: { path: string; files: FileData[] }[]; labels?: string[] } | null): PreCommitRepoTab[] => {
      if (versionControlSystem === 'git' && multiRepoPayload?.repos?.length) {
        const labels = multiRepoPayload.labels ?? effectiveLabels
        return multiRepoPayload.repos
          .filter(r => r.files.length > 0)
          .map((r, i) => ({
            repoPath: r.path,
            label: labels[i] ?? r.path,
            stagedFiles: r.files.map(f => f.filePath),
          }))
      }
      const repoPath = sourceFolder?.trim() || ''
      return [{ repoPath, label: repoPath, stagedFiles: selectedFiles.map(f => f.filePath) }]
    },
    [effectiveLabels, sourceFolder, versionControlSystem]
  )

  const proceedWithCommit = useCallback(
    async (
      selectedFiles: any[],
      finalCommitMessage: string,
      multiRepoPayload: { repos: { path: string; files: FileData[] }[]; labels?: string[] } | null,
      runChoicesByRepo?: Record<string, CommitWorkflowRunChoices>
    ) => {
      if (versionControlSystem !== 'git' || !gitleaksEnabled) {
        await performCommit(selectedFiles, finalCommitMessage, multiRepoPayload, runChoicesByRepo)
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
        await performCommit(selectedFiles, finalCommitMessage, multiRepoPayload, runChoicesByRepo)
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
              void performCommit(selectedFiles, finalCommitMessage, multiRepoPayload, runChoicesByRepo)
            },
          })
          return
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('gitleaks.scanError'))
        return
      }

      await performCommit(selectedFiles, finalCommitMessage, multiRepoPayload, runChoicesByRepo)
    },
    [versionControlSystem, gitleaksEnabled, gitleaksMode, gitleaksConfigPath, isMultiRepo, effectiveLabels, sourceFolder, performCommit, t]
  )

  const showPreCommitDialog = useCallback(
    (selectedFiles: any[], finalCommitMessage: string, multiRepoPayload: { repos: { path: string; files: FileData[] }[]; labels?: string[] } | null) => {
      const tabs = buildPreCommitTabs(selectedFiles, multiRepoPayload)
      pendingCommitRef.current = { selectedFiles, finalCommitMessage, multiRepoPayload }
      setPreCommitTabs(tabs)
      setPreCommitOpen(true)
    },
    [buildPreCommitTabs]
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
        const stagedPerRepo = effectivePaths.map(path => gitMultiTableRefs.current[path]?.getAllStagedFiles?.() ?? [])
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
            showPreCommitDialog(selectedFiles, finalCommitMessage, multiRepoPayload)
          },
        })
        return
      }
    }

    showPreCommitDialog(selectedFiles, finalCommitMessage, multiRepoPayload)
  }, [versionControlSystem, t, commitConventionEnabled, commitConventionMode, showPreCommitDialog, isMultiRepo, effectivePaths, effectiveLabels])

  const activeRepoPath = isMultiRepo && effectivePaths.length > 0 ? (effectivePaths[Number(multiRepoActiveTab)] ?? effectivePaths[0]) : undefined
  const isMultiRepoWorkspace = versionControlSystem === 'git' && !!multiRepoEnabled && enableShellSwitcher
  const editorRepoCwd = resolveEditorRepoCwd({
    versionControlSystem,
    multiRepoEnabled: !!multiRepoEnabled,
    isLoggedIn: enableShellSwitcher,
    sourceFolder: sourceFolder ?? '',
    activeRepoPath,
  })
  const editorWorkspaceFolders = isMultiRepo ? buildEditorWorkspaceFolders(effectivePaths, effectiveLabels) : undefined
  const editorEmptyMessage = useMemo(() => {
    if (!isMultiRepoWorkspace) return undefined
    if (!token) return t('settings.versioncontrol.multiRepoPleaseLogin')
    if (!selectedProjectId?.trim()) return t('settings.versioncontrol.multiRepoSelectProjectPrompt')
    if (effectivePaths.length === 0) return t('settings.versioncontrol.multiRepoNoGitFoldersInProject')
    return undefined
  }, [effectivePaths.length, isMultiRepoWorkspace, selectedProjectId, t, token])
  const terminalCwd = editorRepoCwd?.trim() || undefined
  const { prefs: terminalPrefs } = useTerminalPrefs()
  const [terminalEverOpened, setTerminalEverOpened] = useState(false)

  const {
    terminalOpen,
    terminalPanelSize,
    terminalPanelGroupRef,
    toggleTerminal,
    openTerminal,
    closeTerminal,
    syncTerminalPanelExpanded,
    handleTerminalLayoutChanged,
    mainShellContentPanelId,
    integratedTerminalPanelId,
    maxTerminalPanelSize,
  } = useMainTerminalPanel()

  /** Panel layout visible only on Editor; `terminalOpen` keeps sessions alive across tab switches. */
  const terminalPanelExpanded = terminalOpen && (!enableShellSwitcher || shellView === 'editor')

  useEffect(() => {
    syncTerminalPanelExpanded(terminalPanelExpanded)
  }, [terminalPanelExpanded, syncTerminalPanelExpanded])

  useEffect(() => {
    if (terminalOpen) setTerminalEverOpened(true)
  }, [terminalOpen])

  useEffect(() => {
    if (!terminalPrefs.keepSessionsWhenPanelClosed && !terminalOpen) {
      setTerminalEverOpened(false)
    }
  }, [terminalPrefs.keepSessionsWhenPanelClosed, terminalOpen])

  const canUseTerminal = terminalPrefs.cwdMode === 'home' || Boolean(terminalCwd)
  const shouldMountTerminal = canUseTerminal && (terminalOpen || (terminalPrefs.keepSessionsWhenPanelClosed && terminalEverOpened))

  const handleTerminalToggle = useCallback(() => {
    if (!canUseTerminal) {
      toast.error(t('terminal.noFolder'))
      return
    }
    toggleTerminal()
  }, [canUseTerminal, toggleTerminal, t])

  const handleOpenInTerminal = useCallback(
    (absoluteCwd: string) => {
      if (!canUseTerminal) {
        toast.error(t('terminal.noFolder'))
        return
      }
      openTerminal()
      requestTerminalAtPath(absoluteCwd)
    },
    [canUseTerminal, openTerminal, t]
  )

  const handleEditorFocusedFolderChange = useCallback((index: string) => {
    setMultiRepoActiveTab(index)
  }, [])

  const renderCommitGenerateButton = useCallback(
    (compact: boolean) => (
      <CommitGenerateButton compact={compact} variant={variant} isAnyLoading={isAnyLoading} isLoadingGenerate={isLoadingGenerate} onGenerate={generateCommitMessage} />
    ),
    [variant, isAnyLoading, isLoadingGenerate, generateCommitMessage]
  )

  const renderCommitFooterActions = useCallback(
    (compact: boolean) => (
      <CommitFooterActions
        compact={compact}
        variant={variant}
        isAnyLoading={isAnyLoading}
        isLoadingCommit={isLoadingCommit}
        versionControlSystem={versionControlSystem}
        isMultiRepo={isMultiRepo}
        effectivePaths={effectivePaths}
        gitMultiTableRefs={gitMultiTableRefs}
        gitDualTableRef={gitDualTableRef}
        tableRef={tableRef}
        autoPush={autoPush}
        commitAmend={commitAmend}
        commitSignOff={commitSignOff}
        setCommitAmend={setCommitAmend}
        setCommitSignOff={setCommitSignOff}
        setAutoPush={setAutoPush}
        isGuest={isGuest}
        userId={user?.id}
        activeRepoPath={activeRepoPath}
        sourceFolder={sourceFolder}
        quickPrCwd={editorRepoCwd}
        hasCheckSpotbugsRef={hasCheckSpotbugsRef}
        onCheck={checkViolations}
        onCommit={commitCode}
        onQuickPrOpen={() => setQuickPrDialogOpen(true)}
      />
    ),
    [
      variant,
      isAnyLoading,
      isLoadingCommit,
      versionControlSystem,
      isMultiRepo,
      effectivePaths,
      autoPush,
      commitAmend,
      commitSignOff,
      isGuest,
      user?.id,
      activeRepoPath,
      sourceFolder,
      editorRepoCwd,
      checkViolations,
      commitCode,
    ]
  )

  const embeddedCommitMessagePanel = useMemo(
    () => (
      <CommitMessagePanel
        compact
        isLoadingGenerate={isLoadingGenerate}
        isAnyLoading={isAnyLoading}
        commitMessageRef={commitMessageRef}
        commitMessageSeed={commitMessageSeed}
        referenceIdRef={referenceIdRef}
        onReferenceIdChange={handleReferenceId}
        generateAction={renderCommitGenerateButton(true)}
        actions={renderCommitFooterActions(true)}
        actionsPlacement="header"
        className="h-full"
      />
    ),
    [isLoadingGenerate, isAnyLoading, commitMessageSeed, renderCommitGenerateButton, renderCommitFooterActions]
  )

  const renderStagingWorkspace = () => {
    let content: React.ReactNode = null

    if (isConfigLoaded) {
      if (versionControlSystem === 'git') {
        if (isMultiRepo && effectivePaths.length > 0) {
          content = (
            <Tabs value={multiRepoActiveTab} onValueChange={setMultiRepoActiveTab} className="flex h-full min-h-0 flex-col gap-0!">
              <TabsList className="flex w-full shrink-0 justify-start overflow-x-auto rounded-none!">
                {effectiveLabels.map((label, i) => (
                  <TabsTrigger key={effectivePaths[i]} value={String(i)} className="shrink-0">
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {effectivePaths.map((path, i) => (
                <TabsContent key={path} value={String(i)} forceMount className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
                  <GitStagingTable
                    ref={el => {
                      if (el) gitMultiTableRefs.current[path] = el
                      else delete gitMultiTableRefs.current[path]
                    }}
                    cwd={path}
                    label={effectiveLabels[i]}
                    shellTabActive={vcsWorkspaceVisible}
                    onLoadingChange={setIsTableLoading}
                    commitMessagePanel={embeddedCommitMessagePanel}
                    onLayoutDirectionChange={dir => {
                      if (multiRepoActiveTab === String(i)) setGitStagingLayoutDirectionIfChanged(dir)
                    }}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )
        } else if (multiRepoEnabled && effectivePaths.length === 0) {
          content = (
            <div className="flex h-full items-center justify-center p-4 text-center text-muted-foreground">
              {!token
                ? t('settings.versioncontrol.multiRepoPleaseLogin')
                : !selectedProjectId
                  ? t('settings.versioncontrol.multiRepoSelectProjectPrompt')
                  : t('settings.versioncontrol.multiRepoNoGitFoldersInProject')}
            </div>
          )
        } else {
          content = (
            <GitStagingTable
              ref={gitDualTableRef}
              shellTabActive={vcsWorkspaceVisible}
              onLoadingChange={setIsTableLoading}
              commitMessagePanel={embeddedCommitMessagePanel}
              onLayoutDirectionChange={setGitStagingLayoutDirectionIfChanged}
            />
          )
        }
      } else {
        content = <SvnFileTable ref={tableRef} onLoadingChange={setIsTableLoading} />
      }
    }

    const showWorkspaceLoader = !isConfigLoaded || isTableLoading

    return (
      <div className="relative h-full min-h-0">
        {content}
        {showWorkspaceLoader ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60">
            <GlowLoader className="h-10 w-10" />
          </div>
        ) : null}
      </div>
    )
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (isTerminalToggleShortcut(event)) {
        if (enableShellSwitcher && shellView !== 'editor') return
        if (shouldBlockTerminalToggleShortcut(event)) return
        event.preventDefault()
        event.stopPropagation()
        handleTerminalToggle()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [enableShellSwitcher, handleTerminalToggle, shellView])

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
          prManagerDetached={prManagerDetached}
          onPrManagerDock={handlePrManagerDockFromTitleBar}
          onPrManagerDetach={handlePrManagerDetach}
          tasksDetached={tasksDetached}
          onTasksDock={handleTasksDockFromTitleBar}
          onTasksDetach={handleTasksDetach}
          automationDetached={automationDetached}
          onAutomationDock={handleAutomationDockFromTitleBar}
          onAutomationDetach={handleAutomationDetach}
          devPipelinesDetached={devPipelinesDetached}
          onDevPipelinesDock={handleDevPipelinesDockFromTitleBar}
          onDevPipelinesDetach={handleDevPipelinesDetach}
          devPipelinesToolbarHostRef={devPipelinesToolbarHostRef}
          showLogDetached={showLogDetached}
          onShowLogDock={handleShowLogDockFromTitleBar}
          onShowLogDetach={handleShowLogDetach}
          showLogToolbarHostRef={showLogToolbarHostRef}
          onRequestLogin={() => setShowLoginDialog(true)}
          onRequestChangePassword={() => setShowChangePasswordDialog(true)}
          taskToolbarHostRef={taskToolbarHostRef}
          taskToolbarActionsHostRef={taskToolbarActionsHostRef}
          prManagerToolbarHostRef={prManagerToolbarHostRef}
          automationToolbarHostRef={automationToolbarHostRef}
          terminalOpen={terminalOpen}
          onTerminalToggle={handleTerminalToggle}
          terminalAvailable={canUseTerminal}
          onEditorWorkspaceGuard={guardEditorWorkspaceChange}
          multiRepoActiveTab={multiRepoActiveTab}
          onMultiRepoActiveChange={setMultiRepoActiveTab}
        />
        <div className="flex min-h-0 flex-1 flex-col">
          <ResizablePanelGroup
            groupRef={terminalPanelGroupRef}
            direction="vertical"
            className="min-h-0 flex-1"
            defaultLayout={{
              [mainShellContentPanelId]: terminalPanelExpanded ? 100 - terminalPanelSize : 100,
              [integratedTerminalPanelId]: terminalPanelExpanded ? terminalPanelSize : 0,
            }}
            onLayoutChanged={handleTerminalLayoutChanged}
          >
            <ResizablePanel id={mainShellContentPanelId} minSize={terminalPanelExpanded ? 100 - maxTerminalPanelSize : 25} className="min-h-0 overflow-hidden">
              {/* Content */}
              <div className="h-full flex flex-col min-h-0 p-0 overflow-hidden">
                {/* Shell tabs: siblings + CSS hidden (never Activity at shell level — Monaco dispose race). */}
                {enableShellSwitcher ? (
                  <ShellTabPanel visible={showEmbeddedEditor} mounted={visitedShellTabs.has('editor')}>
                    <Suspense fallback={shellTabLoader}>
                      <EditorPage
                        repoCwd={editorRepoCwd}
                        workspaceFolders={editorWorkspaceFolders}
                        workspaceSessionKey={selectedProjectId ?? undefined}
                        activeFolderIndex={multiRepoActiveTab}
                        onFocusedFolderChange={handleEditorFocusedFolderChange}
                        workspaceEmptyMessage={editorEmptyMessage}
                        onRegisterLayoutLeave={registerEditorLayoutLeave}
                        onOpenInTerminal={handleOpenInTerminal}
                        shellTabActive={showEmbeddedEditor}
                      />
                    </Suspense>
                  </ShellTabPanel>
                ) : null}
                {enableShellSwitcher ? (
                  <ShellTabPanel visible={showEmbeddedTasks} mounted={visitedShellTabs.has('tasks') && !tasksDetached}>
                    <Suspense fallback={shellTabLoader}>
                      <TaskToolbarPortalContext.Provider value={{ center: taskToolbarHostEl, actions: taskToolbarActionsEl }}>
                        <TaskManagement embedded shellTabActive={showEmbeddedTasks} />
                      </TaskToolbarPortalContext.Provider>
                    </Suspense>
                  </ShellTabPanel>
                ) : null}
                {enableShellSwitcher ? (
                  <ShellTabPanel visible={showEmbeddedPrManager} mounted={visitedShellTabs.has('prManager') && !prManagerDetached}>
                    <Suspense fallback={shellTabLoader}>
                      <PrManagerToolbarPortalContext.Provider value={{ host: prManagerToolbarHostEl }}>
                        <PrManager embedded />
                      </PrManagerToolbarPortalContext.Provider>
                    </Suspense>
                  </ShellTabPanel>
                ) : null}
                {enableShellSwitcher ? (
                  <ShellTabPanel visible={showEmbeddedAutomation} mounted={visitedShellTabs.has('automation') && !automationDetached}>
                    <Suspense fallback={shellTabLoader}>
                      <AutomationToolbarPortalContext.Provider value={{ host: automationToolbarHostEl }}>
                        <AutomationPage mode="embedded" />
                      </AutomationToolbarPortalContext.Provider>
                    </Suspense>
                  </ShellTabPanel>
                ) : null}
                {enableShellSwitcher ? (
                  <ShellTabPanel visible={showEmbeddedDevPipelines} mounted={visitedShellTabs.has('devPipelines') && !devPipelinesDetached}>
                    <Suspense fallback={shellTabLoader}>
                      <DevPipelinesToolbarPortalContext.Provider value={{ host: devPipelinesToolbarHostEl }}>
                        <DevPipelinesPage mode="embedded" />
                      </DevPipelinesToolbarPortalContext.Provider>
                    </Suspense>
                  </ShellTabPanel>
                ) : null}
                {enableShellSwitcher ? (
                  <ShellTabPanel visible={showEmbeddedShowLog} mounted={visitedShellTabs.has('showLog') && !showLogDetached}>
                    <Suspense fallback={shellTabLoader}>
                      <ShowLogToolbarPortalContext.Provider value={{ host: showLogToolbarHostEl }}>
                        <ShowLogPage mode="embedded" pendingOpenPayload={showLogOpenPayload} handoffGetterRef={showLogHandoffGetterRef} />
                      </ShowLogToolbarPortalContext.Provider>
                    </Suspense>
                  </ShellTabPanel>
                ) : null}
                {/* Workspace VCS: luôn mounted (CSS hidden) — giữ state + Monaco embedded diff khi chuyển tab */}
                <ShellTabPanel visible={vcsWorkspaceVisible} mounted={!enableShellSwitcher || visitedShellTabs.has('vcs')}>
                  <ResizablePanelGroup
                    groupRef={panelGroupRef}
                    direction="vertical"
                    className="min-h-0 flex-1 border-t"
                    defaultLayout={
                      gitCommitMessageInTree
                        ? { 'changed-files-table': 100 }
                        : { 'changed-files-table': panelSizes.topPanelSize, 'commit-message-panel': panelSizes.bottomPanelSize }
                    }
                    onLayoutChanged={layout => {
                      if (gitCommitMessageInTree || isApplyingMainPanelLayoutRef.current) return
                      const top = layout['changed-files-table']
                      const bottom = layout['commit-message-panel']
                      if (typeof top !== 'number' || typeof bottom !== 'number') return
                      if (bottom <= 0) return
                      persistTablePanelSizes(top, bottom)
                    }}
                  >
                    <ResizablePanel id="changed-files-table" minSize={gitCommitMessageInTree ? 100 : 25} className="min-h-0 overflow-hidden" ref={topPanelRef}>
                      {renderStagingWorkspace()}
                    </ResizablePanel>
                    {!gitCommitMessageInTree ? (
                      <>
                        <ResizableHandle showGrip={false} className="bg-transparent" />
                        <ResizablePanel id="commit-message-panel" className="flex min-h-0 flex-col p-2" minSize={25} ref={bottomPanelRef}>
                          <CommitMessagePanel
                            isLoadingGenerate={isLoadingGenerate}
                            isAnyLoading={isAnyLoading}
                            commitMessageRef={commitMessageRef}
                            commitMessageSeed={commitMessageSeed}
                            referenceIdRef={referenceIdRef}
                            onReferenceIdChange={handleReferenceId}
                            generateAction={renderCommitGenerateButton(false)}
                            actions={renderCommitFooterActions(false)}
                            actionsPlacement="header"
                            className="h-full"
                          />
                        </ResizablePanel>
                      </>
                    ) : null}
                  </ResizablePanelGroup>
                </ShellTabPanel>
              </div>
            </ResizablePanel>
            <ResizableHandle
              showGrip={false}
              className={terminalPanelExpanded ? 'bg-transparent' : 'bg-transparent pointer-events-none opacity-0'}
            />
            <ResizablePanel
              id={integratedTerminalPanelId}
              minSize={0}
              maxSize={`${maxTerminalPanelSize}%`}
              defaultSize={terminalPanelExpanded ? `${terminalPanelSize}%` : '0%'}
              className="min-h-0 overflow-hidden"
            >
              {shouldMountTerminal ? <IntegratedTerminalPanel repoCwd={terminalCwd} panelVisible={terminalPanelExpanded} onClose={closeTerminal} /> : null}
            </ResizablePanel>
          </ResizablePanelGroup>
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

        <QuickCreatePrDialog open={quickPrDialogOpen} onOpenChange={setQuickPrDialogOpen} cwd={editorRepoCwd} projectId={selectedProjectId} userId={user?.id ?? null} />

        <CommitWorkflowPreCommitDialog
          open={preCommitOpen}
          onOpenChange={open => {
            setPreCommitOpen(open)
            if (!open) pendingCommitRef.current = null
          }}
          projectId={selectedProjectId}
          tabs={preCommitTabs}
          onConfirm={choicesByRepo => {
            const pending = pendingCommitRef.current
            setPreCommitOpen(false)
            pendingCommitRef.current = null
            if (!pending) return
            void proceedWithCommit(pending.selectedFiles, pending.finalCommitMessage, pending.multiRepoPayload, choicesByRepo)
          }}
        />

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
