import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { randomUuidV7 } from 'shared/randomUuidV7'
import toast from '@/components/ui-elements/Toast'
import type { WorkspaceRepoChromeProps } from '@/components/workspace/WorkspaceRepoChrome'
import { normalizePathForCompare } from '@/lib/utils'
import logger from '@/services/logger'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import { useSelectedProjectStore } from '@/stores/useSelectedProjectStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

type UseStandaloneWorkspaceRepoChromeOptions = {
  versionControlSystem: 'git' | 'svn'
  contextSourceFolder?: string
  gitLogRevision: string | null
  onGitLogRevisionChange?: (revision: string | null) => void
  onFolderChange?: (sourceFolder: string, versionControlSystem: 'git' | 'svn') => void
  isLoading: boolean
}

const noopGuard = (action: () => void | Promise<void>) => {
  void action()
}

export function useStandaloneWorkspaceRepoChrome({
  versionControlSystem,
  contextSourceFolder,
  gitLogRevision,
  onGitLogRevisionChange,
  onFolderChange,
  isLoading,
}: UseStandaloneWorkspaceRepoChromeOptions): Pick<
  WorkspaceRepoChromeProps,
  | 'sourceFolders'
  | 'currentFolder'
  | 'versionControlSystem'
  | 'onRefreshVCS'
  | 'isRefreshing'
  | 'user'
  | 'isMultiRepo'
  | 'isMultiRepoWorkspace'
  | 'projects'
  | 'selectedProjectId'
  | 'isProjectsLoading'
  | 'isSourceFoldersLoading'
  | 'loadProjects'
  | 'onProjectSelect'
  | 'runWithEditorGuard'
  | 'multiRepoLabels'
  | 'multiRepoPaths'
  | 'enableShellSwitcher'
  | 'refreshSourceFoldersList'
  | 'isChangingFolder'
  | 'onFolderChange'
  | 'folderVCSTypes'
  | 'showGitRepoChrome'
  | 'currentBranch'
  | 'gitLogRevision'
  | 'gitAhead'
  | 'gitBehind'
  | 'activeRepoLabel'
  | 'loadBranches'
  | 'prefetchBranchList'
  | 'isRefreshingBranchesRemote'
  | 'isLoadingBranches'
  | 'branches'
  | 'onLogRefSelect'
  | 'onSwitchBranch'
> {
  const { t } = useTranslation()
  const user = useTaskAuthStore(s => s.user)
  const isGuest = useTaskAuthStore(s => s.isGuest)
  const { isConfigLoaded, sourceFolder: configSourceFolder } = useConfigurationStore()
  const selectedProjectId = useSelectedProjectStore(s => s.selectedProjectId)
  const setSelectedProjectId = useSelectedProjectStore(s => s.setSelectedProjectId)

  const [currentFolder, setCurrentFolder] = useState('')
  const [sourceFolders, setSourceFolders] = useState<{ name: string; path: string }[]>([])
  const [folderVCSTypes, setFolderVCSTypes] = useState<Record<string, 'git' | 'svn' | 'none'>>({})
  const [currentBranch, setCurrentBranch] = useState('')
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isProjectsLoading, setIsProjectsLoading] = useState(false)
  const [isSourceFoldersLoading, setIsSourceFoldersLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [branches, setBranches] = useState<any>(null)
  const [isLoadingBranches, setIsLoadingBranches] = useState(false)
  const [isRefreshingBranchesRemote, setIsRefreshingBranchesRemote] = useState(false)
  const [gitAhead, setGitAhead] = useState(0)
  const [gitBehind, setGitBehind] = useState(0)

  const userJustSelectedProjectIdRef = useRef<string | null | undefined>(undefined)
  const selectedProjectIdRef = useRef<string | null>(null)
  const onFolderChangeRef = useRef(onFolderChange)
  const gitContextIdRef = useRef(0)
  const branchesRef = useRef<any>(null)
  const branchListLoadIdRef = useRef(0)
  const branchRemoteFetchRef = useRef<{ cwd: string; promise: Promise<void> } | null>(null)
  const loadSourceFoldersRequestIdRef = useRef<string | null>(null)

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

  const handleProjectSelect = useCallback(
    (projectId: string | null) => {
      userJustSelectedProjectIdRef.current = projectId
      setSelectedProjectId(projectId)
      setReloadKey(k => k + 1)
    },
    [setSelectedProjectId]
  )

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
    if (!isConfigLoaded) return

    const requestId = randomUuidV7()
    loadSourceFoldersRequestIdRef.current = requestId

    const loadSourceFolders = async () => {
      setIsSourceFoldersLoading(true)
      try {
        const folders = await fetchFoldersByProjectOrAll()
        if (loadSourceFoldersRequestIdRef.current !== requestId) return

        setSourceFolders(folders)

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
            } else {
              effectiveFolder = folders[0]
              setCurrentFolder(folders[0].name)
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
          }
        }

        const effectivePath = effectiveFolder?.path ?? currentPath

        if (!isUserJustSelectedProject && effectivePath && user && !isGuest && selectedProjectIdRef.current !== null) {
          try {
            const res = await window.api.task.getProjectIdByUserAndPath(effectivePath)
            if (res.status === 'success' && res.data) {
              setSelectedProjectId(res.data)
            } else {
              setSelectedProjectId(null)
            }
          } catch {
            setSelectedProjectId(null)
          }
        }
      } catch (error) {
        logger.error('Error loading source folders (standalone chrome):', error)
      } finally {
        if (loadSourceFoldersRequestIdRef.current === requestId) {
          loadSourceFoldersRequestIdRef.current = null
        }
        setIsSourceFoldersLoading(false)
      }
    }

    void loadSourceFolders()
  }, [isConfigLoaded, contextSourceFolder, configSourceFolder, fetchFoldersByProjectOrAll, user, isGuest, reloadKey, setSelectedProjectId])

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
      } else {
        setCurrentBranch('')
      }
    } catch (error) {
      logger.error('Error loading current branch (standalone chrome):', error)
      setCurrentBranch('')
    }
  }, [versionControlSystem, contextSourceFolder])

  useEffect(() => {
    if (isConfigLoaded && versionControlSystem === 'git') {
      void loadCurrentBranch()
    } else {
      setCurrentBranch('')
    }
  }, [isConfigLoaded, versionControlSystem, contextSourceFolder, loadCurrentBranch])

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
  const showGitRepoChrome = versionControlSystem === 'git' && !!gitCwd

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
          } else if (!branchesRef.current) {
            toast.error(result.message || t('git.branchListLoadError'))
          }
        } catch (error) {
          if (loadId !== branchListLoadIdRef.current || contextId !== gitContextIdRef.current) return
          logger.error('Error refreshing branches from remote (standalone chrome):', error)
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
          } else {
            toast.error(localResult.message || t('git.branchListLoadError'))
          }
        }
      } catch (error) {
        if (loadId !== branchListLoadIdRef.current || contextId !== gitContextIdRef.current) return
        logger.error('Error loading local branches (standalone chrome):', error)
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

  const handleFolderChange = useCallback(
    (folderName: string) => {
      const folder = sourceFolders.find(f => f.name === folderName)
      const vcsType = folderVCSTypes[folderName]
      if (!folder || !vcsType || vcsType === 'none') return
      setCurrentFolder(folderName)
      localStorage.setItem('current-source-folder', folderName)
      setCurrentBranch('')
      setBranches(null)
      setGitAhead(0)
      setGitBehind(0)
      onFolderChangeRef.current?.(folder.path, vcsType)
    },
    [sourceFolders, folderVCSTypes]
  )

  const handleLogRefSelect = useCallback(
    (branchName: string) => {
      if (!onGitLogRevisionChange) return
      const next = branchName === currentBranch ? null : branchName
      onGitLogRevisionChange(next)
    },
    [currentBranch, onGitLogRevisionChange]
  )

  return {
    sourceFolders,
    currentFolder,
    versionControlSystem,
    onRefreshVCS: () => {},
    isRefreshing: false,
    user,
    isMultiRepo: false,
    isMultiRepoWorkspace: false,
    projects,
    selectedProjectId,
    isProjectsLoading,
    isSourceFoldersLoading,
    loadProjects,
    onProjectSelect: handleProjectSelect,
    runWithEditorGuard: noopGuard,
    multiRepoLabels: [],
    multiRepoPaths: [],
    enableShellSwitcher: false,
    refreshSourceFoldersList,
    isChangingFolder: false,
    isLoading,
    onFolderChange: handleFolderChange,
    folderVCSTypes,
    showGitRepoChrome,
    currentBranch,
    gitLogRevision,
    gitAhead,
    gitBehind,
    activeRepoLabel: currentFolder || undefined,
    loadBranches,
    prefetchBranchList,
    isRefreshingBranchesRemote,
    isLoadingBranches,
    branches,
    onLogRefSelect: handleLogRefSelect,
    onSwitchBranch: () => {},
  }
}
