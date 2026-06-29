'use client'
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  LayoutTemplate,
  Loader2,
  Minus,
  Square,
  SquareArrowOutDownLeft,
  Turtle,
  X,
} from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { randomUuidV7 } from 'shared/randomUuidV7'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import { cn, normalizePathForCompare } from '@/lib/utils'
import logger from '@/services/logger'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

interface ShowlogProps {
  filePath?: string
  isLoading: boolean
  onToggleLayout?: () => void
  versionControlSystem: 'svn' | 'git'
  contextSourceFolder?: string
  onFolderChange?: (sourceFolder: string, versionControlSystem: 'git' | 'svn') => void
  /** Git: xem log theo branch/ref này mà không checkout (null = HEAD hiện tại). */
  gitLogRevision?: string | null
  onGitLogRevisionChange?: (revision: string | null) => void
  /** Embedded trong main shell — ẩn logo, title giữa, window controls. */
  embedded?: boolean
  /** Cửa sổ standalone — dock về main window (chỉ khi user đã login). */
  onStandaloneDock?: () => void
}
const SELECTED_PROJECT_STORAGE_KEY = 'selected-project-id'

export const ShowlogToolbar: React.FC<ShowlogProps> = ({
  filePath,
  isLoading,
  onToggleLayout,
  versionControlSystem,
  contextSourceFolder,
  onFolderChange,
  gitLogRevision = null,
  onGitLogRevisionChange,
  embedded = false,
  onStandaloneDock,
}) => {
  const { t } = useTranslation()
  const user = useTaskAuthStore(s => s.user)
  const isGuest = useTaskAuthStore(s => s.isGuest)
  const { isConfigLoaded, sourceFolder: configSourceFolder } = useConfigurationStore()
  const [currentFolder, setCurrentFolder] = useState<string>('')
  const [sourceFolders, setSourceFolders] = useState<{ name: string; path: string }[]>([])
  const [folderVCSTypes, setFolderVCSTypes] = useState<Record<string, 'git' | 'svn' | 'none'>>({})
  const [currentBranch, setCurrentBranch] = useState<string>('')
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
  const [isRefreshingBranchesRemote, setIsRefreshingBranchesRemote] = useState(false)
  const [gitAhead, setGitAhead] = useState(0)
  const [gitBehind, setGitBehind] = useState(0)
  const gitContextIdRef = useRef(0)
  const branchesRef = useRef<any>(null)
  const branchListLoadIdRef = useRef(0)
  const branchRemoteFetchRef = useRef<{ cwd: string; promise: Promise<void> } | null>(null)

  useEffect(() => {
    branchesRef.current = branches
  }, [branches])

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId
  }, [selectedProjectId])
  useEffect(() => {
    onFolderChangeRef.current = onFolderChange
  }, [onFolderChange])

  useEffect(() => {
    if (versionControlSystem === 'git' && contextSourceFolder) {
      gitContextIdRef.current += 1
      branchListLoadIdRef.current += 1
      setBranches(null)
    }
  }, [contextSourceFolder, versionControlSystem])

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
            logger.info('Branches loaded (ShowlogToolbar remote refresh):', result.data)
          } else if (!branchesRef.current) {
            toast.error(result.message || t('git.branchListLoadError'))
          }
        } catch (error) {
          if (loadId !== branchListLoadIdRef.current || contextId !== gitContextIdRef.current) return
          logger.error('Error refreshing branches from remote (ShowlogToolbar):', error)
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
      if (!gitCwd || versionControlSystem !== 'git') return

      const cwd = gitCwd
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
            logger.info('Branches loaded (ShowlogToolbar local snapshot):', localResult.data)
          } else {
            toast.error(localResult.message || t('git.branchListLoadError'))
          }
        }
      } catch (error) {
        if (loadId !== branchListLoadIdRef.current || contextId !== gitContextIdRef.current) return
        logger.error('Error loading local branches (ShowlogToolbar):', error)
        if (!hasCached) toast.error(t('git.branchListLoadError'))
      } finally {
        if (showBlockingLoader) setIsLoadingBranches(false)
      }

      await refreshBranchesFromRemote(cwd, loadId, contextId)
    },
    [gitCwd, refreshBranchesFromRemote, t, versionControlSystem]
  )

  const prefetchBranchList = useCallback(() => {
    if (!gitCwd) return
    void loadBranches({ background: true })
  }, [gitCwd, loadBranches])

  /** Chỉ đổi ref dùng cho `git log` — không checkout, TitleBar/HEAD không đổi. */
  const selectLogBranch = (pickName: string) => {
    if (!onGitLogRevisionChange) return
    const next = pickName === currentBranch ? null : pickName
    onGitLogRevisionChange(next)
  }

  const effectiveLogRef = gitLogRevision ?? currentBranch

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
      className={cn('flex items-center justify-between h-8 min-w-0 flex-1 text-sm select-none gap-2', embedded && 'w-full')}
      style={
        {
          WebkitAppRegion: 'drag',
          ...(!embedded ? { backgroundColor: 'var(--main-bg)', color: 'var(--main-fg)' } : {}),
        } as React.CSSProperties
      }
    >
      {!embedded ? (
        <div className="w-10 h-6 flex justify-center items-center shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <img src="logo.png" alt="icon" draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
        </div>
      ) : null}

      {!embedded ? (
        <Button variant="ghost" className="min-w-0 flex-1 justify-center font-medium text-xs truncate px-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {filePath !== '.' ? t('dialog.showLogs.titleWithPath', { 0: filePath }) : t('dialog.showLogs.title')}
        </Button>
      ) : (
        <div className="min-h-0 min-w-0 flex-1 self-stretch" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} aria-hidden />
      )}

      <div className="flex min-w-0 shrink-0 items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex items-center gap-1 pt-0.5">
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
                          <ChevronDown className="h-3 w-3 shrink-0" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      {selectedProjectId ? (projects.find(p => p.id === selectedProjectId)?.name ?? t('dailyReport.all')) : t('showlog.allProjects', 'Tất cả')}
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end">
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
                          <span className="font-medium max-w-[8rem] truncate">{isSourceFoldersLoading || isLoading ? t('common.loading', 'Đang tải ...') : currentFolder || ''}</span>
                          {!isSourceFoldersLoading && !isLoading && getVCSText(currentFolder) && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">{getVCSText(currentFolder)}</span>
                          )}
                          <ChevronDown className={cn('h-3 w-3 shrink-0', (isSourceFoldersLoading || isLoading) && 'opacity-50')} />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{isSourceFoldersLoading || isLoading ? t('common.loading', 'Đang tải ...') : currentFolder}</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end">
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

          {showGitBranchChrome && (effectiveLogRef || currentBranch) && (
            <DropdownMenu
              onOpenChange={open => {
                if (open) void loadBranches()
              }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center gap-1 px-2 py-1 h-7 text-xs"
                      onMouseEnter={prefetchBranchList}
                    >
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 rounded flex items-center gap-0.5">
                        <GitBranch className="h-2.5 w-2.5 shrink-0" />
                        {effectiveLogRef || currentBranch}
                      </span>
                      {gitAhead > 0 && <span className="text-green-600 dark:text-green-400 shrink-0"> ↑{gitAhead}</span>}
                      {gitBehind > 0 && <span className="text-red-600 dark:text-red-400 shrink-0"> ↓{gitBehind}</span>}
                      <ChevronDown className="h-3 w-3 shrink-0" />
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
              <DropdownMenuContent align="end" className="max-h-[300px] overflow-y-auto">
                {isRefreshingBranchesRemote && (
                  <div className="flex items-center gap-2 border-b px-2 py-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    <span>{t('git.branchListRefreshing')}</span>
                  </div>
                )}
                {isLoadingBranches && !branches ? (
                  <div className="flex items-center justify-center p-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="ml-2 text-xs">{t('common.loading', 'Đang tải...')}</span>
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
                            <DropdownMenuItem key={branch} onClick={() => setTimeout(() => selectLogBranch(branch), 0)} className={isLogScope ? 'bg-muted/60' : ''}>
                              <GitBranch className={`h-3 w-3 mr-2 shrink-0 ${isCheckout ? 'text-green-600 dark:text-green-400' : ''}`} />
                              <span className={`flex-1 truncate ${isLogScope ? 'font-medium' : ''} ${isCheckout ? 'text-green-600 dark:text-green-400' : ''}`}>{branch}</span>
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
                  <div className="px-2 py-1 text-xs text-muted-foreground">{t('git.branchListEmpty')}</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

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
        {onStandaloneDock ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-[25px] w-[25px] shrink-0 rounded-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                onClick={onStandaloneDock}
                aria-label={t('showlog.dock', 'Dock Show Log to main window')}
              >
                <SquareArrowOutDownLeft strokeWidth={1.25} absoluteStrokeWidth className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('showlog.dock', 'Dock Show Log to main window')}</TooltipContent>
          </Tooltip>
        ) : null}
        {!embedded ? (
          <>
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
          </>
        ) : null}
      </div>
    </div>
  )
}
