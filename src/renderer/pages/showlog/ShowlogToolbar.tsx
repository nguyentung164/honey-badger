'use client'
import { Separator } from '@radix-ui/react-separator'
import { format } from 'date-fns'
import {
  BarChart3,
  CalendarIcon,
  ChevronDown,
  ChevronRight,
  FileCheck,
  GitBranch,
  GitBranchPlus,
  History,
  LayoutTemplate,
  Loader2,
  Minus,
  RefreshCcw,
  Sparkles,
  Square,
  Turtle,
  X,
} from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'
import { randomUuidV7 } from 'shared/randomUuidV7'
import { GitBranchManageDialog } from '@/components/dialogs/git/GitBranchManageDialog'
import { AIAnalysisHistoryDialog } from '@/components/dialogs/showlog/AIAnalysisHistoryDialog'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import { getDateFnsLocale, getDateOnlyPattern } from '@/lib/dateUtils'
import i18n from '@/lib/i18n'
import { cn, normalizePathForCompare } from '@/lib/utils'
import logger from '@/services/logger'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

interface ShowlogProps {
  onRefresh: () => void
  filePath?: string
  isLoading: boolean
  dateRange?: DateRange
  setDateRange?: (range: DateRange | undefined) => void
  onOpenStatistic?: () => void
  onOpenAIAnalysis?: () => void
  onOpenCommitReviewStat?: () => void
  unreviewedCount?: number
  onToggleLayout?: () => void
  versionControlSystem: 'svn' | 'git'
  contextSourceFolder?: string
  onFolderChange?: (sourceFolder: string, versionControlSystem: 'git' | 'svn') => void
  /** Git: xem log theo branch/ref này mà không checkout (null = HEAD hiện tại). */
  gitLogRevision?: string | null
  onGitLogRevisionChange?: (revision: string | null) => void
}
const SELECTED_PROJECT_STORAGE_KEY = 'selected-project-id'

export const ShowlogToolbar: React.FC<ShowlogProps> = ({
  onRefresh,
  filePath,
  isLoading,
  dateRange,
  setDateRange,
  onOpenStatistic,
  onOpenAIAnalysis,
  onOpenCommitReviewStat,
  unreviewedCount = 0,
  onToggleLayout,
  versionControlSystem,
  contextSourceFolder,
  onFolderChange,
  gitLogRevision = null,
  onGitLogRevisionChange,
}) => {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const user = useTaskAuthStore(s => s.user)
  const isGuest = useTaskAuthStore(s => s.isGuest)
  const { isConfigLoaded, sourceFolder: configSourceFolder } = useConfigurationStore()
  const [currentFolder, setCurrentFolder] = useState<string>('')
  const [sourceFolders, setSourceFolders] = useState<{ name: string; path: string }[]>([])
  const [folderVCSTypes, setFolderVCSTypes] = useState<Record<string, 'git' | 'svn' | 'none'>>({})
  const [currentBranch, setCurrentBranch] = useState<string>('')
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isProjectsLoading, setIsProjectsLoading] = useState(false)
  const [isSourceFoldersLoading, setIsSourceFoldersLoading] = useState(true)

  const userJustSelectedProjectIdRef = useRef<string | null | undefined>(undefined)
  const selectedProjectIdRef = useRef<string | null>(null)
  const onFolderChangeRef = useRef(onFolderChange)
  const [reloadKey, setReloadKey] = useState(0)

  const [branches, setBranches] = useState<any>(null)
  const [isLoadingBranches, setIsLoadingBranches] = useState(false)
  const [showGitBranchManageDialog, setShowGitBranchManageDialog] = useState(false)
  const [gitAhead, setGitAhead] = useState(0)
  const [gitBehind, setGitBehind] = useState(0)
  const gitContextIdRef = useRef(0)

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId
  }, [selectedProjectId])
  useEffect(() => {
    onFolderChangeRef.current = onFolderChange
  }, [onFolderChange])

  useEffect(() => {
    if (versionControlSystem === 'git' && contextSourceFolder) {
      gitContextIdRef.current += 1
      setBranches(null)
    }
  }, [contextSourceFolder, versionControlSystem])

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [datePickerValue, setDatePickerValue] = useState<DateRange | undefined>(undefined)

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
            setSelectedProjectId(savedId)
          } else {
            setSelectedProjectId(null)
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

  const handleProjectSelect = useCallback((projectId: string | null) => {
    userJustSelectedProjectIdRef.current = projectId
    setSelectedProjectId(projectId)
    localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, projectId ?? '')
    setReloadKey(k => k + 1)
  }, [])

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

  useEffect(() => {
    if (user && !isGuest) {
      loadProjects()
    }
  }, [user, isGuest, loadProjects])

  const loadSourceFoldersRequestIdRef = useRef<string | null>(null)

  // Load source folders và detect VCS type (song song + requestId tránh race).
  // Chỉ phụ thuộc isConfigLoaded, context/config, isLoggedIn, reloadKey (user chọn project) — không phụ thuộc selectedProjectId/onFolderChange để tránh chạy đúp.
  const fetchFoldersByProjectOrAll = useCallback(async (): Promise<{ name: string; path: string }[]> => {
    const projectId = selectedProjectIdRef.current
    if (projectId && isLoggedIn) {
      const res = await window.api.task.getSourceFoldersByProject(projectId)
      if (res.status === 'success' && res.data) return res.data
      if (res.status === 'error' && (res as { code?: string }).code === 'UNAUTHORIZED') {
        toast.warning(t('common.sessionExpired'))
        return window.api.sourcefolder.get()
      }
      return []
    }
    return window.api.sourcefolder.get()
  }, [isLoggedIn, t])

  useEffect(() => {
    if (!isConfigLoaded) {
      logger.info('Waiting for config to load before detecting VCS in ShowlogToolbar...')
      return
    }

    const requestId = randomUuidV7()
    loadSourceFoldersRequestIdRef.current = requestId

    const loadSourceFolders = async () => {
      setIsSourceFoldersLoading(true)
      try {
        logger.info('Config loaded, now loading source folders and detecting VCS in ShowlogToolbar...')
        const folders = await fetchFoldersByProjectOrAll()
        if (loadSourceFoldersRequestIdRef.current !== requestId) return

        setSourceFolders(folders)

        // Detect VCS type song song cho tất cả folders
        const vcsResults = await Promise.all(folders.map(f => window.api.system.detect_version_control(f.path)))
        if (loadSourceFoldersRequestIdRef.current !== requestId) return

        const vcsTypes: Record<string, 'git' | 'svn' | 'none'> = {}
        folders.forEach((folder, i) => {
          try {
            const r = vcsResults[i]
            if (r?.status === 'success' && r?.data) {
              const detectedType = r.data.type
              const isValid = r.data.isValid
              vcsTypes[folder.name] = isValid && detectedType !== 'none' ? (detectedType as 'git' | 'svn') : 'none'
            } else {
              vcsTypes[folder.name] = 'none'
            }
          } catch {
            vcsTypes[folder.name] = 'none'
          }
        })
        setFolderVCSTypes(vcsTypes)

        const currentPath = contextSourceFolder || configSourceFolder
        const isUserJustSelectedProject = userJustSelectedProjectIdRef.current !== undefined

        let effectiveFolder: { name: string; path: string } | undefined

        if (isUserJustSelectedProject && folders.length > 0) {
          const wasSpecificProject = userJustSelectedProjectIdRef.current !== null
          userJustSelectedProjectIdRef.current = undefined
          if (wasSpecificProject) {
            const folderInNewList = currentPath ? folders.find(f => normalizePathForCompare(f.path) === normalizePathForCompare(currentPath)) : undefined
            if (folderInNewList) {
              effectiveFolder = folderInNewList
              setCurrentFolder(folderInNewList.name)
              logger.info(`Đổi project: giữ source folder (nằm trong project): ${folderInNewList.name}`)
            } else {
              effectiveFolder = folders[0]
              setCurrentFolder(folders[0].name)
              const vcs = vcsTypes[folders[0].name]
              if (vcs && vcs !== 'none') onFolderChangeRef.current?.(folders[0].path, vcs)
              logger.info(`Đổi project: chọn source folder đầu tiên: ${folders[0].name}`)
            }
          }
        }
        if (effectiveFolder === undefined) {
          const folderByConfig = currentPath ? folders.find(f => normalizePathForCompare(f.path) === normalizePathForCompare(currentPath)) : undefined
          if (folderByConfig) {
            effectiveFolder = folderByConfig
            setCurrentFolder(folderByConfig.name)
          } else if (folders.length > 0) {
            const savedFolder = localStorage.getItem('current-source-folder')
            const fallbackFolder = (savedFolder ? folders.find(f => f.name === savedFolder) : null) ?? folders[0]
            effectiveFolder = fallbackFolder
            setCurrentFolder(fallbackFolder.name)
            const vcs = vcsTypes[fallbackFolder.name]
            if (vcs && vcs !== 'none') onFolderChangeRef.current?.(fallbackFolder.path, vcs)
          }
        }

        const effectivePath = effectiveFolder?.path ?? currentPath

        // Khi Project đang là "All" thì không lấy project của sourceFolder — giữ nguyên "All".
        if (!isUserJustSelectedProject && effectivePath && user && !isGuest && selectedProjectIdRef.current !== null) {
          try {
            const res = await window.api.task.getProjectIdByUserAndPath(effectivePath)
            if (res.status === 'success' && res.data) {
              setSelectedProjectId(res.data)
              localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, res.data)
            } else {
              setSelectedProjectId(null)
              localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, '')
            }
          } catch {
            setSelectedProjectId(null)
            localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, '')
          }
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
  }, [isConfigLoaded, contextSourceFolder, configSourceFolder, fetchFoldersByProjectOrAll, user, isGuest, reloadKey])

  const loadCurrentBranch = useCallback(async () => {
    if (versionControlSystem !== 'git') {
      setCurrentBranch('')
      return
    }
    const cwd = contextSourceFolder
    if (!cwd) {
      setCurrentBranch('')
      return
    }
    try {
      const result = await window.api.git.get_branches(cwd)
      if (result.status === 'success' && result.data?.current) {
        setCurrentBranch(result.data.current)
        logger.info(`Current Git branch: ${result.data.current}`)
      } else {
        setCurrentBranch('')
      }
    } catch (error) {
      logger.error('Error loading current branch:', error)
      setCurrentBranch('')
    }
  }, [versionControlSystem, contextSourceFolder])

  // Load current branch khi versionControlSystem hoặc contextSourceFolder thay đổi
  useEffect(() => {
    if (isConfigLoaded && versionControlSystem === 'git') {
      loadCurrentBranch()
    } else {
      setCurrentBranch('')
    }
  }, [isConfigLoaded, versionControlSystem, contextSourceFolder, loadCurrentBranch])

  // Đồng bộ ahead/behind trên nút branch (giống TitleBar)
  useEffect(() => {
    if (!isConfigLoaded || versionControlSystem !== 'git' || !contextSourceFolder?.trim()) {
      setGitAhead(0)
      setGitBehind(0)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const s = await window.api.git.status({ cwd: contextSourceFolder })
        if (cancelled) return
        if (s.status === 'success' && s.data) {
          setGitAhead(s.data.ahead || 0)
          setGitBehind(s.data.behind || 0)
        }
      } catch {
        if (!cancelled) {
          setGitAhead(0)
          setGitBehind(0)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isConfigLoaded, versionControlSystem, contextSourceFolder])

  const gitCwd = contextSourceFolder?.trim()
  /** Giống cwd thực tế khi load log: windowContext hoặc folder global — luôn có path khi user đã cấu hình repo Git */
  const showGitBranchChrome = versionControlSystem === 'git' && !!gitCwd

  const refreshAfterBranchSwitch = useCallback(async () => {
    if (!gitCwd || versionControlSystem !== 'git') return
    const idAtStart = gitContextIdRef.current
    try {
      const statusResult = await window.api.git.status({ cwd: gitCwd })
      if (idAtStart !== gitContextIdRef.current) return
      if (statusResult.status === 'success' && statusResult.data) {
        setCurrentBranch(statusResult.data.current || '')
        setGitAhead(statusResult.data.ahead || 0)
        setGitBehind(statusResult.data.behind || 0)
      }
    } catch (e) {
      logger.error('refreshAfterBranchSwitch:', e)
    }
    window.dispatchEvent(new CustomEvent('git-branch-changed'))
    onRefresh()
  }, [gitCwd, versionControlSystem, onRefresh])

  const loadBranches = async () => {
    if (isLoadingBranches || !gitCwd || versionControlSystem !== 'git') return

    setIsLoadingBranches(true)
    const idAtStart = gitContextIdRef.current
    const cwd = gitCwd
    const start = Date.now()
    try {
      const pruneResult = await window.api.git.fetch('origin', { prune: true, all: true }, cwd)
      if (pruneResult.status !== 'success') {
        logger.warning('Fetch prune before branch list skipped or failed:', pruneResult.message)
      }
      const result = await window.api.git.get_branches(cwd)
      if (idAtStart !== gitContextIdRef.current) return
      if (result.status === 'success') {
        setBranches(result.data)
        logger.info('Branches loaded (ShowlogToolbar):', result.data)
      } else {
        toast.error(result.message || 'Không thể tải danh sách branches')
      }
    } catch (error) {
      if (idAtStart !== gitContextIdRef.current) return
      logger.error('Error loading branches:', error)
      toast.error('Không thể tải danh sách branches')
    } finally {
      const elapsed = Date.now() - start
      const minLoadingMs = 400
      if (elapsed < minLoadingMs) {
        await new Promise(r => setTimeout(r, minLoadingMs - elapsed))
      }
      setIsLoadingBranches(false)
    }
  }

  /** Chỉ đổi ref dùng cho `git log` — không checkout, TitleBar/HEAD không đổi. */
  const selectLogBranch = (pickName: string) => {
    if (!onGitLogRevisionChange) return
    const next = pickName === currentBranch ? null : pickName
    onGitLogRevisionChange(next)
  }

  const effectiveLogRef = gitLogRevision ?? currentBranch

  useEffect(() => {
    setDatePickerValue(dateRange)
  }, [dateRange])

  const locale = getDateFnsLocale(i18n.language)
  const dateFormat = getDateOnlyPattern(i18n.language)

  // Helper function để lấy icon VCS
  const getVCSIcon = (folderName: string) => {
    const vcsType = folderVCSTypes[folderName]
    if (vcsType === 'git') {
      return <GitBranch className="h-3 w-3" />
    }
    if (vcsType === 'svn') {
      return <Turtle className="h-3 w-3" />
    }
    return null
  }

  // Helper function để lấy text VCS
  const getVCSText = (folderName: string) => {
    const vcsType = folderVCSTypes[folderName]
    if (vcsType === 'git') return 'Git'
    if (vcsType === 'svn') return 'SVN'
    return ''
  }

  // Chọn folder - update UI, localStorage (đồng bộ với TitleBar), gọi onFolderChange; KHÔNG update config
  const handleFolderChange = (folderName: string) => {
    const folder = sourceFolders.find(f => f.name === folderName)
    const vcsType = folderVCSTypes[folderName]
    if (!folder || !vcsType || vcsType === 'none') return
    setCurrentFolder(folderName)
    localStorage.setItem('current-source-folder', folderName)
    setCurrentBranch('')
    setBranches(null)
    setGitAhead(0)
    setGitBehind(0)
    onFolderChange?.(folder.path, vcsType)
  }

  return (
    <div
      className="flex items-center justify-between h-8 text-sm select-none"
      style={
        {
          WebkitAppRegion: 'drag',
          backgroundColor: 'var(--main-bg)',
          color: 'var(--main-fg)',
        } as React.CSSProperties
      }
    >
      <div className="flex items-center h-full">
        <div className="w-10 h-6 flex justify-center pt-1.5 pl-1 shrink-0">
          <img src="logo.png" alt="icon" draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
        </div>
        <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="flex items-center gap-1 pt-0.5">
            {/* Cụm Project + Source Folder - một nhóm UI chung như TitleBar */}
            {(user || sourceFolders.length > 0) && (
              <div className="flex items-center h-7 rounded-md overflow-hidden">
                {user && (
                  <DropdownMenu onOpenChange={open => open && loadProjects()}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isProjectsLoading}
                            className={cn(
                              'flex items-center gap-1 px-2 py-1 h-7 text-xs font-medium rounded-none border-0 bg-transparent text-pink-800 dark:text-pink-400 hover:bg-muted! hover:text-pink-900! dark:hover:text-pink-300!',
                              sourceFolders.length > 0 ? 'rounded-l-md' : 'rounded-md'
                            )}
                          >
                            <span className="font-medium">
                              {selectedProjectId ? (projects.find(p => p.id === selectedProjectId)?.name ?? t('dailyReport.all')) : t('showlog.allProjects', 'Tất cả')}
                            </span>
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        {selectedProjectId ? (projects.find(p => p.id === selectedProjectId)?.name ?? t('dailyReport.all')) : t('showlog.allProjects', 'Tất cả')}
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="start">
                      {isProjectsLoading ? (
                        <div className="flex items-center justify-center p-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="ml-2 text-xs">Đang tải projects...</span>
                        </div>
                      ) : (
                        <>
                          <DropdownMenuItem onClick={() => handleProjectSelect(null)} className={!selectedProjectId ? 'bg-muted' : ''}>
                            {t('showlog.allProjects', 'Tất cả')}
                          </DropdownMenuItem>
                          {projects.map(p => (
                            <DropdownMenuItem key={p.id} onClick={() => handleProjectSelect(p.id)} className={selectedProjectId === p.id ? 'bg-muted' : ''}>
                              {p.name}
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {user && sourceFolders.length > 0 && <ChevronRight className="h-3.5 w-3.5 text-pink-600 dark:text-pink-400 shrink-0" aria-hidden />}
                {sourceFolders.length > 0 ? (
                  <DropdownMenu onOpenChange={open => open && refreshSourceFoldersList()}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSourceFoldersLoading || isLoading}
                            className={cn(
                              'flex items-center gap-1 px-2 py-1 h-7 text-xs font-medium rounded-none border-0 bg-transparent text-pink-800 dark:text-pink-400 hover:bg-muted hover:text-pink-900! dark:hover:text-pink-300!',
                              user ? 'rounded-r-md' : 'rounded-md'
                            )}
                          >
                            {isSourceFoldersLoading || isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : getVCSIcon(currentFolder)}
                            <span className="font-medium">{isSourceFoldersLoading || isLoading ? t('common.loading', 'Đang tải ...') : currentFolder || ''}</span>
                            {!isSourceFoldersLoading && !isLoading && getVCSText(currentFolder) && (
                              <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">{getVCSText(currentFolder)}</span>
                            )}
                            <ChevronDown className={cn('h-3 w-3', (isSourceFoldersLoading || isLoading) && 'opacity-50')} />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>{isSourceFoldersLoading || isLoading ? t('common.loading', 'Đang tải ...') : currentFolder}</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="center">
                      {sourceFolders.map(folder => (
                        <DropdownMenuItem
                          key={folder.name}
                          onClick={() => setTimeout(() => handleFolderChange(folder.name), 0)}
                          className={currentFolder === folder.name ? 'bg-muted' : ''}
                          disabled={folderVCSTypes[folder.name] === 'none'}
                        >
                          {getVCSIcon(folder.name)}
                          <span className="ml-2">{folder.name}</span>
                          {getVCSText(folder.name) && <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1 rounded">{getVCSText(folder.name)}</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  (isSourceFoldersLoading || isLoading) && (
                    <Button variant="ghost" size="sm" disabled className="flex items-center gap-1 px-2 py-1 h-7 text-xs rounded-r-md">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="font-medium">{t('common.loading', 'Đang tải ...')}</span>
                    </Button>
                  )
                )}
              </div>
            )}

            {showGitBranchChrome && (
              <>
                <DropdownMenu
                  onOpenChange={open => {
                    if (open) loadBranches()
                  }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="flex items-center gap-1 px-2 py-1 h-7 text-xs">
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 rounded flex items-center gap-0.5 min-w-[4.5rem] justify-center">
                            <GitBranch className="h-2.5 w-2.5 shrink-0" />
                            {effectiveLogRef ? (
                              effectiveLogRef
                            ) : (
                              <Loader2 className="h-3 w-3 animate-spin" aria-label={t('common.loading')} />
                            )}
                          </span>
                          {gitAhead > 0 && <span className="text-green-600 dark:text-green-400"> ↑{gitAhead}</span>}
                          {gitBehind > 0 && <span className="text-red-600 dark:text-red-400"> ↓{gitBehind}</span>}
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      <span className="block max-w-xs">
                        {gitLogRevision && gitLogRevision !== currentBranch
                          ? `${t('showlog.logViewBranchTooltip', 'Đang xem log của')}: ${gitLogRevision} — ${t('showlog.checkoutBranchIs', 'branch đang checkout')}: ${currentBranch || '…'}`
                          : currentFolder
                            ? t('git.branchForRepo', { repo: currentFolder })
                            : currentBranch || t('common.loading', 'Đang tải ...')}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="center" className="max-h-[300px] overflow-y-auto">
                    {isLoadingBranches ? (
                      <div className="flex items-center justify-center p-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="ml-2 text-xs">Đang tải branches...</span>
                      </div>
                    ) : branches ? (
                      <>
                        {gitLogRevision != null && onGitLogRevisionChange && (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                onGitLogRevisionChange(null)
                              }}
                            >
                              {t('showlog.logFollowHead', 'Log theo HEAD đang checkout')}
                              {currentBranch ? ` (${currentBranch})` : ''}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        {branches.local?.all && branches.local.all.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Local Branches</div>
                            {branches.local.all.map((branch: string) => {
                              const branchInfo = branches.local.branches[branch]
                              const ahead = branchInfo?.ahead || 0
                              const behind = branchInfo?.behind || 0

                              const isCheckout = currentBranch === branch
                              const isLogScope = effectiveLogRef === branch
                              return (
                                <DropdownMenuItem
                                  key={branch}
                                  onClick={() => setTimeout(() => selectLogBranch(branch), 0)}
                                  className={isLogScope ? 'bg-muted/60' : ''}
                                >
                                  <GitBranch className={`h-3 w-3 mr-2 shrink-0 ${isCheckout ? 'text-green-600 dark:text-green-400' : ''}`} />
                                  <span className={`flex-1 truncate ${isLogScope ? 'font-medium' : ''} ${isCheckout ? 'text-green-600 dark:text-green-400' : ''}`}>
                                    {branch}
                                  </span>
                                  <div className="ml-2 flex shrink-0 items-center gap-1">
                                    {ahead > 0 && <span className="flex items-center text-[10px] text-green-600 dark:text-green-400">↑{ahead}</span>}
                                    {behind > 0 && <span className="flex items-center text-[10px] text-red-600 dark:text-red-400">↓{behind}</span>}
                                  </div>
                                </DropdownMenuItem>
                              )
                            })}
                          </>
                        )}
                        {branches.remote?.all && branches.remote.all.length > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Remote Branches</div>
                            {branches.remote.all.map((branch: string) => {
                              const shortName = branch.includes('/') ? branch.split('/').slice(1).join('/') : branch
                              const isLogScope = effectiveLogRef === shortName
                              return (
                                <DropdownMenuItem
                                  key={branch}
                                  onClick={() =>
                                    setTimeout(() => {
                                      selectLogBranch(shortName)
                                    }, 0)
                                  }
                                  className={cn('text-muted-foreground', isLogScope && 'bg-muted/60 font-medium text-foreground')}
                                >
                                  <GitBranch className="h-3 w-3 mr-2" />
                                  {branch}
                                </DropdownMenuItem>
                              )
                            })}
                          </>
                        )}
                      </>
                    ) : (
                      <div className="px-2 py-1 text-xs text-muted-foreground">Không có branches</div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => setShowGitBranchManageDialog(true)}
                      className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
                    >
                      <GitBranchPlus strokeWidth={1.25} absoluteStrokeWidth size={15} className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{currentFolder ? t('git.branchManage.titleForRepo', { repo: currentFolder }) : t('git.branchManage.title')}</TooltipContent>
                </Tooltip>
              </>
            )}

            <Separator orientation="vertical" className="h-4 w-px bg-muted mx-1 mr-2" />

            {/* Date Range Picker - style đồng bộ với TaskManagement */}
            {setDateRange && (
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant={buttonVariant}
                    size="sm"
                    disabled={isLoading}
                    className={cn('h-6 px-2 text-xs justify-start text-left font-normal transition-all duration-200', !dateRange?.from && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                    {dateRange?.from
                      ? dateRange.to
                        ? `${format(dateRange.from, dateFormat, { locale })} - ${format(dateRange.to, dateFormat, { locale })}`
                        : format(dateRange.from, dateFormat, { locale })
                      : t('taskManagement.chartAllTime')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    locale={locale}
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={datePickerValue ?? dateRange}
                    onSelect={v => setDatePickerValue(v)}
                    numberOfMonths={2}
                  />
                  <div className="flex gap-2 p-2 border-t">
                    <Button
                      variant={buttonVariant}
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setDateRange(undefined)
                        setDatePickerValue(undefined)
                        setDatePickerOpen(false)
                        setTimeout(() => onRefresh(), 100)
                      }}
                    >
                      {t('taskManagement.chartAllTime')}
                    </Button>
                    <Button
                      variant={buttonVariant}
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        const value = datePickerValue ?? dateRange
                        if (value?.from) {
                          setDateRange(value)
                          setDatePickerOpen(false)
                          setTimeout(() => onRefresh(), 100)
                        }
                      }}
                    >
                      {t('common.confirm')}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="link"
                  disabled={isLoading}
                  size="sm"
                  onClick={async () => {
                    // Không sync config từ localStorage - mỗi ShowLog window giữ context riêng
                    if (versionControlSystem === 'git' && contextSourceFolder) {
                      await loadCurrentBranch()
                      try {
                        const s = await window.api.git.status({ cwd: contextSourceFolder })
                        if (s.status === 'success' && s.data) {
                          setGitAhead(s.data.ahead || 0)
                          setGitBehind(s.data.behind || 0)
                        }
                      } catch {
                        /* ignore */
                      }
                    }
                    onRefresh()
                  }}
                  className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('common.refresh')}</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-4 w-px bg-muted mx-1" />

            {onOpenStatistic && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="link"
                    disabled={isLoading}
                    size="sm"
                    onClick={onOpenStatistic}
                    className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('dialog.statisticSvn.title')}</TooltipContent>
              </Tooltip>
            )}

            {onOpenAIAnalysis && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="link"
                    disabled={isLoading}
                    size="sm"
                    onClick={onOpenAIAnalysis}
                    className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>AI Phân tích Commit</TooltipContent>
              </Tooltip>
            )}

            {onOpenAIAnalysis && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="link"
                    disabled={isLoading}
                    size="sm"
                    onClick={() => setShowHistoryDialog(true)}
                    className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
                  >
                    <History className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Lịch sử phân tích</TooltipContent>
              </Tooltip>
            )}

            <Separator orientation="vertical" className="h-4 w-px bg-muted mx-1" />

            {onOpenCommitReviewStat && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={onOpenCommitReviewStat}
                    className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px] relative"
                  >
                    <FileCheck className="h-4 w-4" />
                    {unreviewedCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 flex items-center justify-center text-[10px] font-bold bg-amber-500 text-white rounded-full">
                        {unreviewedCount > 99 ? '99+' : unreviewedCount}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{unreviewedCount > 0 ? `PL Review (${unreviewedCount} chưa review)` : 'PL Review - Thống kê'}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {/* Center Section (Title) */}
      <Button variant="ghost" className="font-medium text-xs">
        {filePath !== '.' ? t('dialog.showLogs.titleWithPath', { 0: filePath }) : t('dialog.showLogs.title')}
      </Button>

      {/* Right Section (Window Controls) */}
      <div className="flex gap-1 items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {onToggleLayout && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="link"
                size="sm"
                onClick={onToggleLayout}
                className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px] mr-2"
              >
                <LayoutTemplate className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
          </Tooltip>
        )}
        <button
          type="button"
          onClick={() => handleWindow('minimize')}
          className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]"
        >
          <Minus size={15.5} strokeWidth={1} absoluteStrokeWidth />
        </button>
        <button
          type="button"
          onClick={() => handleWindow('maximize')}
          className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]"
        >
          <Square size={14.5} strokeWidth={1} absoluteStrokeWidth />
        </button>
        <button type="button" onClick={() => handleWindow('close')} className="w-10 h-8 flex items-center justify-center hover:bg-red-600 hover:text-white">
          <X size={20} strokeWidth={1} absoluteStrokeWidth />
        </button>
      </div>

      <GitBranchManageDialog
        open={showGitBranchManageDialog}
        onOpenChange={setShowGitBranchManageDialog}
        currentBranch={currentBranch}
        onSuccess={() => {
          void loadBranches()
          void refreshAfterBranchSwitch()
        }}
        cwd={gitCwd}
      />

      <AIAnalysisHistoryDialog isOpen={showHistoryDialog} onOpenChange={setShowHistoryDialog} />
    </div>
  )
}
