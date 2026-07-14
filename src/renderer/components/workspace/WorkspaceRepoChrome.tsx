'use client'

import { ChevronDown, ChevronRight, Folder, GitBranch, Loader2, RefreshCw, Turtle } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MainShellView } from 'shared/mainShellView'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { BranchMode } from '@/lib/workspaceChromeHandlers'
import type { TaskAuthUser } from '@/stores/useTaskAuthStore'

type FolderVCSType = 'git' | 'svn' | 'none'

export interface WorkspaceRepoChromeProps {
  shellView: MainShellView
  branchMode: BranchMode

  onShowLogRefresh?: () => void
  showLogRefreshing?: boolean
  sourceFolders: { name: string; path: string }[]
  currentFolder: string
  versionControlSystem?: 'svn' | 'git'
  onRefreshVCS: () => void
  isRefreshing: boolean

  user: TaskAuthUser | null
  isMultiRepo?: boolean
  isMultiRepoWorkspace: boolean
  projects: { id: string; name: string }[]
  selectedProjectId: string | null
  isProjectsLoading: boolean
  isSourceFoldersLoading: boolean
  loadProjects: () => void
  onProjectSelect: (projectId: string | null) => void
  runWithEditorGuard: (action: () => void | Promise<void>) => void

  multiRepoLabels: string[]
  multiRepoPaths: string[]
  enableShellSwitcher?: boolean
  onMultiRepoActiveChange?: (tabId: string) => void
  multiRepoActiveTab?: string

  refreshSourceFoldersList: () => void
  isChangingFolder: boolean
  isLoading: boolean
  onFolderChange: (folderName: string) => void
  folderVCSTypes: Record<string, FolderVCSType>

  showGitRepoChrome: boolean
  currentBranch: string
  gitLogRevision: string | null
  gitAhead: number
  gitBehind: number
  activeRepoLabel?: string
  loadBranches: (options?: { background?: boolean; forceFetch?: boolean }) => void | Promise<void>
  prefetchBranchList: () => void
  isRefreshingBranchesRemote: boolean
  isLoadingBranches: boolean
  branches: any
  onLogRefSelect: (branchName: string) => void
  onSwitchBranch: (branchName: string) => void

  multiRepoBadgeScrollRef?: React.RefObject<HTMLSpanElement | null>
  onMultiRepoBadgeWheel?: (e: React.WheelEvent) => void
  onMultiRepoBadgeMouseDown?: (e: React.MouseEvent) => void
  onMultiRepoBadgeMouseMove?: (e: React.MouseEvent) => void
  onMultiRepoBadgeMouseUp?: () => void
  marqueeDuplicate?: boolean
  className?: string

  children?: ReactNode
}

function getVCSIcon(folderName: string, folderVCSTypes: Record<string, FolderVCSType>) {
  const vcsType = folderVCSTypes[folderName]
  if (vcsType === 'git') {
    return <GitBranch className="h-3 w-3" />
  }
  if (vcsType === 'svn') {
    return <Turtle className="h-3 w-3" />
  }
  return <Folder className="h-3 w-3 opacity-50" />
}

function getVCSText(folderName: string, folderVCSTypes: Record<string, FolderVCSType>) {
  const vcsType = folderVCSTypes[folderName]
  if (vcsType === 'git') return 'Git'
  if (vcsType === 'svn') return 'SVN'
  return ''
}

export function WorkspaceRepoChrome({
  shellView,
  branchMode,
  onShowLogRefresh,
  showLogRefreshing = false,
  sourceFolders,
  currentFolder,
  versionControlSystem = 'svn',
  onRefreshVCS,
  isRefreshing,
  user,
  isMultiRepo = false,
  isMultiRepoWorkspace,
  projects,
  selectedProjectId,
  isProjectsLoading,
  isSourceFoldersLoading,
  loadProjects,
  onProjectSelect,
  runWithEditorGuard,
  multiRepoLabels,
  multiRepoPaths,
  enableShellSwitcher = false,
  onMultiRepoActiveChange,
  multiRepoActiveTab = '0',
  refreshSourceFoldersList,
  isChangingFolder,
  isLoading,
  onFolderChange,
  folderVCSTypes,
  showGitRepoChrome,
  currentBranch,
  gitLogRevision,
  gitAhead,
  gitBehind,
  activeRepoLabel,
  loadBranches,
  prefetchBranchList,
  isRefreshingBranchesRemote,
  isLoadingBranches,
  branches,
  onLogRefSelect,
  onSwitchBranch,
  multiRepoBadgeScrollRef: multiRepoBadgeScrollRefProp,
  onMultiRepoBadgeWheel: onMultiRepoBadgeWheelProp,
  onMultiRepoBadgeMouseDown: onMultiRepoBadgeMouseDownProp,
  onMultiRepoBadgeMouseMove: onMultiRepoBadgeMouseMoveProp,
  onMultiRepoBadgeMouseUp: onMultiRepoBadgeMouseUpProp,
  marqueeDuplicate: marqueeDuplicateProp,
  className,
  children,
}: WorkspaceRepoChromeProps) {
  const { t } = useTranslation()

  const internalScrollRef = useRef<HTMLSpanElement>(null)
  const multiRepoBadgeScrollRef = multiRepoBadgeScrollRefProp ?? internalScrollRef
  const multiRepoDragRef = useRef({ isDragging: false, startX: 0, scrollLeft: 0 })
  const [internalMarqueeDuplicate, setInternalMarqueeDuplicate] = useState(false)
  const marqueeDuplicate = marqueeDuplicateProp ?? internalMarqueeDuplicate
  const singleCopyScrollWidthRef = useRef(0)
  const useInternalMarquee = marqueeDuplicateProp === undefined

  const handleMultiRepoBadgeWheelInternal = useCallback(
    (e: React.WheelEvent) => {
      const el = multiRepoBadgeScrollRef.current
      if (!el) return
      e.preventDefault()
      el.scrollLeft += e.deltaY + e.deltaX
    },
    [multiRepoBadgeScrollRef]
  )

  const handleMultiRepoBadgeMouseDownInternal = useCallback(
    (e: React.MouseEvent) => {
      const el = multiRepoBadgeScrollRef.current
      if (!el) return
      multiRepoDragRef.current = { isDragging: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft }
      el.style.cursor = 'grabbing'
    },
    [multiRepoBadgeScrollRef]
  )

  const handleMultiRepoBadgeMouseMoveInternal = useCallback(
    (e: React.MouseEvent) => {
      if (!multiRepoDragRef.current.isDragging) return
      const el = multiRepoBadgeScrollRef.current
      if (!el) return
      e.preventDefault()
      const x = e.pageX - el.offsetLeft
      const walk = x - multiRepoDragRef.current.startX
      el.scrollLeft = multiRepoDragRef.current.scrollLeft - walk
    },
    [multiRepoBadgeScrollRef]
  )

  const handleMultiRepoBadgeMouseUpInternal = useCallback(() => {
    multiRepoDragRef.current.isDragging = false
    if (multiRepoBadgeScrollRef.current) {
      multiRepoBadgeScrollRef.current.style.cursor = 'grab'
    }
  }, [multiRepoBadgeScrollRef])

  const handleMultiRepoBadgeWheel = onMultiRepoBadgeWheelProp ?? handleMultiRepoBadgeWheelInternal
  const handleMultiRepoBadgeMouseDown = onMultiRepoBadgeMouseDownProp ?? handleMultiRepoBadgeMouseDownInternal
  const handleMultiRepoBadgeMouseMove = onMultiRepoBadgeMouseMoveProp ?? handleMultiRepoBadgeMouseMoveInternal
  const handleMultiRepoBadgeMouseUp = onMultiRepoBadgeMouseUpProp ?? handleMultiRepoBadgeMouseUpInternal

  useEffect(() => {
    if (!useInternalMarquee) return
    const el = multiRepoBadgeScrollRef.current
    if (!el) return
    const timer = setTimeout(() => {
      singleCopyScrollWidthRef.current = el.scrollWidth
      const shouldDuplicate = el.scrollWidth > el.clientWidth
      setInternalMarqueeDuplicate(prev => (prev === shouldDuplicate ? prev : shouldDuplicate))
    }, 80)
    return () => clearTimeout(timer)
  }, [multiRepoLabels, multiRepoBadgeScrollRef, useInternalMarquee])

  useEffect(() => {
    if (!useInternalMarquee) return
    const el = multiRepoBadgeScrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const storedSingle = singleCopyScrollWidthRef.current
      if (storedSingle === 0) return
      const shouldDuplicate = storedSingle > el.clientWidth
      setInternalMarqueeDuplicate(prev => (prev === shouldDuplicate ? prev : shouldDuplicate))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [multiRepoBadgeScrollRef, useInternalMarquee])

  useEffect(() => {
    if (!useInternalMarquee || !marqueeDuplicate) return
    const el = multiRepoBadgeScrollRef.current
    if (!el) return

    el.scrollLeft = 0
    let rafId: number
    let paused = false

    const pauseScroll = () => {
      paused = true
    }
    const resumeScroll = () => {
      paused = false
    }
    el.addEventListener('mouseenter', pauseScroll)
    el.addEventListener('mouseleave', resumeScroll)

    let lastTime = performance.now()
    const SPEED = 0.05
    let accumulated = 0

    const tick = (now: number) => {
      const dt = Math.min(now - lastTime, 50)
      lastTime = now

      if (!paused && !multiRepoDragRef.current.isDragging) {
        accumulated += SPEED * dt
        const halfWidth = el.scrollWidth / 2
        if (accumulated >= halfWidth) {
          accumulated -= halfWidth
        }
        el.scrollLeft = accumulated
      } else {
        accumulated = el.scrollLeft
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      el.removeEventListener('mouseenter', pauseScroll)
      el.removeEventListener('mouseleave', resumeScroll)
    }
  }, [marqueeDuplicate, multiRepoBadgeScrollRef, useInternalMarquee])

  return (
    <div className={cn('flex gap-1 items-center justify-center h-full px-2', className)} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {shellView === 'showLog' && onShowLogRefresh ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="link"
              size="sm"
              onClick={onShowLogRefresh}
              disabled={showLogRefreshing}
              className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
            >
              <RefreshCw strokeWidth={1.25} absoluteStrokeWidth size={15} className={`h-4 w-4 ${showLogRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('workspaceChrome.refreshShowLog', 'Làm mới log')}</TooltipContent>
        </Tooltip>
      ) : (
        sourceFolders.length > 0 &&
        currentFolder &&
        versionControlSystem === 'svn' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="link"
                size="sm"
                onClick={onRefreshVCS}
                disabled={isRefreshing}
                className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-[25px] w-[25px]"
              >
                <RefreshCw strokeWidth={1.25} absoluteStrokeWidth size={15} className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isRefreshing ? 'Đang làm mới...' : 'Làm mới thông tin SVN'}</TooltipContent>
          </Tooltip>
        )
      )}

      {(user || sourceFolders.length > 0) && (
        <div className="flex items-center h-7 rounded-md overflow-hidden">
          {user &&
            (!isMultiRepo || isMultiRepoWorkspace) &&
            (() => {
              const projectBarHasRight = (isMultiRepo && multiRepoLabels.length > 0) || (!isMultiRepo && sourceFolders.length > 0 && !isMultiRepoWorkspace)
              const projectTriggerRounded = projectBarHasRight ? 'rounded-l-md' : 'rounded-md'
              const projectLabel = isMultiRepoWorkspace
                ? selectedProjectId
                  ? (projects.find(p => p.id === selectedProjectId)?.name ?? t('settings.versioncontrol.multiRepoSelectProject', 'Chọn Project'))
                  : t('settings.versioncontrol.multiRepoSelectProject', 'Chọn Project')
                : selectedProjectId
                  ? (projects.find(p => p.id === selectedProjectId)?.name ?? t('dailyReport.all'))
                  : t('showlog.allProjects', 'Tất cả')
              const projectTooltip = isProjectsLoading || isSourceFoldersLoading ? t('common.loading', 'Đang tải ...') : projectLabel
              return (
                <DropdownMenu onOpenChange={open => open && loadProjects()}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isProjectsLoading || isSourceFoldersLoading}
                          className={`flex items-center gap-1 px-2 py-1 h-7 text-xs font-medium rounded-none border-0 bg-transparent text-pink-800 dark:text-pink-400 hover:bg-muted hover:text-pink-900! dark:hover:text-pink-300! ${projectTriggerRounded}`}
                        >
                          {isProjectsLoading || isSourceFoldersLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          <span className="font-medium">{projectLabel}</span>
                          <ChevronDown className={cn('h-3 w-3', (isProjectsLoading || isSourceFoldersLoading) && 'opacity-50')} />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{projectTooltip}</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="start">
                    {isProjectsLoading ? (
                      <div className="flex items-center justify-center p-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="ml-2 text-xs">Đang tải projects...</span>
                      </div>
                    ) : (
                      <>
                        {!isMultiRepoWorkspace && (
                          <DropdownMenuItem onClick={() => runWithEditorGuard(() => onProjectSelect(null))} className={!selectedProjectId ? 'bg-muted' : ''}>
                            {t('showlog.allProjects', 'Tất cả')}
                          </DropdownMenuItem>
                        )}
                        {projects.map(p => (
                          <DropdownMenuItem key={p.id} onClick={() => runWithEditorGuard(() => onProjectSelect(p.id))} className={selectedProjectId === p.id ? 'bg-muted' : ''}>
                            {p.name}
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            })()}
          {user &&
            (!isMultiRepo || isMultiRepoWorkspace) &&
            ((isMultiRepo && multiRepoLabels.length > 0) || (!isMultiRepo && sourceFolders.length > 0 && !isMultiRepoWorkspace)) && (
              <ChevronRight className="h-3.5 w-3.5 text-pink-600 dark:text-pink-400 shrink-0" aria-hidden />
            )}
          {isMultiRepo && multiRepoLabels.length > 0 ? (
            enableShellSwitcher && (shellView === 'editor' || shellView === 'showLog') && onMultiRepoActiveChange && multiRepoLabels.length > 1 ? (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex items-center gap-1 px-2 py-1 h-7 text-xs font-medium rounded-r-md border-0 bg-transparent text-pink-800 dark:text-pink-400 hover:bg-muted hover:text-pink-900! dark:hover:text-pink-300!"
                      >
                        <GitBranch className="h-3 w-3 shrink-0" />
                        <span className="font-medium max-w-[10rem] truncate">{multiRepoLabels[Number(multiRepoActiveTab)] ?? multiRepoLabels[0]}</span>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{t('editor.titleBar.activeRepo', 'Repo đang mở')}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="center">
                  {multiRepoLabels.map((label, i) => (
                    <DropdownMenuItem
                      key={multiRepoPaths[i] ?? label}
                      onClick={() =>
                        runWithEditorGuard(() => {
                          onMultiRepoActiveChange(String(i))
                        })
                      }
                      className={multiRepoActiveTab === String(i) ? 'bg-muted' : ''}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span
                className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md bg-muted/50 text-pink-800 dark:text-pink-400"
                style={{ maxWidth: 'clamp(120px, 30vw, 600px)' }}
              >
                <GitBranch className="h-3 w-3 shrink-0" />
                <span className="shrink-0">Multi-repo:</span>
                {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-to-scroll interaction on a presentational container */}
                <span
                  ref={multiRepoBadgeScrollRef}
                  role="presentation"
                  className="text-foreground font-normal flex items-center gap-1 overflow-x-auto select-none"
                  style={{ scrollbarWidth: 'none', cursor: 'grab' }}
                  onWheel={handleMultiRepoBadgeWheel}
                  onMouseDown={handleMultiRepoBadgeMouseDown}
                  onMouseMove={handleMultiRepoBadgeMouseMove}
                  onMouseUp={handleMultiRepoBadgeMouseUp}
                  onMouseLeave={handleMultiRepoBadgeMouseUp}
                >
                  {(marqueeDuplicate ? [...multiRepoLabels, ...multiRepoLabels] : multiRepoLabels).map((label, i) => {
                    const repoColors = [
                      'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
                      'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
                      'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
                      'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
                      'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
                    ] as const
                    const originalIdx = i % multiRepoLabels.length
                    return (
                      <span key={i} className="flex items-center gap-1 shrink-0">
                        <span className={cn('px-1.5 rounded', repoColors[originalIdx % 5])}>{label}</span>
                      </span>
                    )
                  })}
                </span>
              </span>
            )
          ) : isMultiRepoWorkspace ? null : sourceFolders.length > 0 ? (
            <DropdownMenu onOpenChange={open => open && refreshSourceFoldersList()}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isChangingFolder || isLoading || isSourceFoldersLoading}
                      className={`flex items-center gap-1 px-2 py-1 h-7 text-xs font-medium rounded-none border-0 bg-transparent text-pink-800 dark:text-pink-400 hover:bg-muted hover:text-pink-900! dark:hover:text-pink-300! ${user ? 'rounded-r-md' : 'rounded-md'}`}
                    >
                      {isChangingFolder || isLoading || isSourceFoldersLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : getVCSIcon(currentFolder, folderVCSTypes)}
                      <span className="font-medium">{currentFolder || ''}</span>
                      {!isChangingFolder && !isLoading && !isSourceFoldersLoading && getVCSText(currentFolder, folderVCSTypes) && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">{getVCSText(currentFolder, folderVCSTypes)}</span>
                      )}
                      <ChevronDown className={cn('h-3 w-3', (isChangingFolder || isLoading || isSourceFoldersLoading) && 'opacity-50')} />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  {isChangingFolder || isLoading || isSourceFoldersLoading ? (isChangingFolder ? t('title.switchingFolder') : t('common.loading', 'Đang tải ...')) : currentFolder}
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="center">
                {sourceFolders.map(folder => (
                  <DropdownMenuItem key={folder.name} onClick={() => setTimeout(() => onFolderChange(folder.name), 0)} className={currentFolder === folder.name ? 'bg-muted' : ''}>
                    {getVCSIcon(folder.name, folderVCSTypes)}
                    <span className="ml-2">{folder.name}</span>
                    {getVCSText(folder.name, folderVCSTypes) && (
                      <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1 rounded">{getVCSText(folder.name, folderVCSTypes)}</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      )}

      {showGitRepoChrome && currentBranch && (
        <DropdownMenu
          onOpenChange={open => {
            if (open) void loadBranches()
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-1 px-1 py-1 h-7 text-xs" onMouseEnter={prefetchBranchList}>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 rounded flex items-center gap-0.5">
                    <GitBranch className="h-2.5 w-2.5" />
                    {branchMode === 'logRef' ? (gitLogRevision ?? currentBranch) : currentBranch}
                  </span>
                  {gitAhead > 0 && <span className="text-green-600 dark:text-green-400"> ↑{gitAhead}</span>}
                  {gitBehind > 0 && <span className="text-red-600 dark:text-red-400"> ↓{gitBehind}</span>}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              {branchMode === 'logRef' && gitLogRevision && gitLogRevision !== currentBranch
                ? `${t('workspaceChrome.logRefActive')}: ${gitLogRevision} — ${t('showlog.checkoutBranchIs', 'branch đang checkout')}: ${currentBranch}`
                : activeRepoLabel
                  ? t('git.branchForRepo', { repo: activeRepoLabel })
                  : currentBranch}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="center" className="max-h-[300px] overflow-y-auto">
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
                {branchMode === 'logRef' && (
                  <>
                    <DropdownMenuItem onClick={() => onLogRefSelect(currentBranch)}>
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

                      const isCurrent = currentBranch === branch
                      const isLogScope = branchMode === 'logRef' && (gitLogRevision ?? currentBranch) === branch
                      return (
                        <DropdownMenuItem
                          key={branch}
                          onClick={() =>
                            setTimeout(() => {
                              if (branchMode === 'logRef') onLogRefSelect(branch)
                              else onSwitchBranch(branch)
                            }, 0)
                          }
                          className={branchMode === 'logRef' ? (isLogScope ? 'bg-muted/60' : '') : isCurrent ? 'bg-muted/60' : ''}
                        >
                          <GitBranch className={`h-3 w-3 mr-2 shrink-0 ${isCurrent ? 'text-green-600 dark:text-green-400' : ''}`} />
                          <span
                            className={`flex-1 truncate ${branchMode === 'logRef' && isLogScope ? 'font-medium' : ''} ${isCurrent ? 'font-medium text-green-600 dark:text-green-400' : ''}`}
                          >
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
                      const branchName = branch.includes('/') ? branch.split('/').slice(1).join('/') : branch
                      const isLogScope = branchMode === 'logRef' && (gitLogRevision ?? currentBranch) === branchName
                      return (
                        <DropdownMenuItem
                          key={branch}
                          onClick={() =>
                            setTimeout(() => {
                              if (branchMode === 'logRef') onLogRefSelect(branchName)
                              else onSwitchBranch(branchName)
                            }, 0)
                          }
                          className={branchMode === 'logRef' ? (isLogScope ? 'bg-muted/60 font-medium text-foreground' : 'text-muted-foreground') : 'text-muted-foreground'}
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

      {children}
    </div>
  )
}
