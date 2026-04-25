'use client'
import {
  BarChart2,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Clock,
  Code2,
  Flame,
  GitCommit,
  Minus,
  Square,
  Star,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import { type CSSProperties, Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { RANK_CONFIG } from '@/components/achievement/RankBadge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Combobox } from '@/components/ui/combobox'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/useAchievementStore'
import { useProgressStore } from '@/stores/useProgressStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

const ActivityHeatmap = lazy(() => import('./components/ActivityHeatmap').then(m => ({ default: m.ActivityHeatmap })))
const TrendCharts = lazy(() => import('./components/TrendCharts').then(m => ({ default: m.TrendCharts })))
const DeveloperRadar = lazy(() => import('./components/DeveloperRadar').then(m => ({ default: m.DeveloperRadar })))
const TaskPerformancePanel = lazy(() => import('./components/TaskPerformancePanel').then(m => ({ default: m.TaskPerformancePanel })))
const CodeQualityPanel = lazy(() => import('./components/CodeQualityPanel').then(m => ({ default: m.CodeQualityPanel })))
const ProductiveHoursChart = lazy(() => import('./components/ProductiveHoursChart').then(m => ({ default: m.ProductiveHoursChart })))
const MonthlyHighlights = lazy(() => import('./components/MonthlyHighlights').then(m => ({ default: m.MonthlyHighlights })))
const DailyReportContent = lazy(() => import('./components/DailyReportContent').then(m => ({ default: m.DailyReportContent })))

type Section = 'heatmap' | 'trend' | 'radar' | 'taskperf' | 'quality' | 'hours' | 'highlights' | 'dailyreport'

const progressSidebarTransition =
  'transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-150 motion-reduce:transition-[width]'

const progressLabelTransition =
  'transition-[opacity,max-width,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-150'

const PROGRESS_SIDEBAR_COLLAPSED_KEY = 'progress-sidebar-collapsed'

function readProgressSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(PROGRESS_SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

const SECTIONS: Array<{ id: Section; labelKey: string; icon: React.ElementType }> = [
  { id: 'heatmap', labelKey: 'progress.activityHeatmap', icon: Flame },
  { id: 'trend', labelKey: 'progress.trendCharts', icon: TrendingUp },
  { id: 'radar', labelKey: 'progress.developerProfile', icon: Zap },
  { id: 'taskperf', labelKey: 'progress.taskPerformance', icon: GitCommit },
  { id: 'quality', labelKey: 'progress.codeQuality', icon: Code2 },
  { id: 'hours', labelKey: 'progress.productiveHours', icon: Clock },
  { id: 'highlights', labelKey: 'progress.monthlyHighlights', icon: Star },
  { id: 'dailyreport', labelKey: 'progress.dailyReport', icon: ClipboardList },
]

function SectionSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-[300px] w-full rounded-xl" />
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase())
    .join('')
    .slice(0, 2)
}

export function ProgressTrackingPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const sectionFromUrl = searchParams.get('section')
  const [activeSection, setActiveSection] = useState<Section>(
    sectionFromUrl === 'dailyreport' ? 'dailyreport' : 'heatmap'
  )
  const currentUser = useTaskAuthStore(s => s.user)
  const verifySession = useTaskAuthStore(s => s.verifySession)
  const { selectedUserId, selectedUserName, allUsers, allUsersLoaded, setSelectedUser, loadAllUsers } = useProgressStore()
  const achievementStats = useAchievementStore(s => s.stats)
  const fetchLeaderboard = useAchievementStore(s => s.fetchLeaderboard)
  const fetchStats = useAchievementStore(s => s.fetchStats)
  const leaderboard = useAchievementStore(s => s.leaderboard)
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string | null>>({})
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readProgressSidebarCollapsed)
  const fetchedRef = useRef<Set<string>>(new Set())
  const userRanks = leaderboard.reduce<Record<string, string>>((acc, e) => {
    acc[e.user_id] = e.current_rank
    return acc
  }, {})

  const viewerKey = useMemo(
    () => (currentUser ? `${currentUser.id}|${currentUser.role}` : ''),
    [currentUser?.id, currentUser?.role],
  )

  useEffect(() => {
    verifySession()
  }, [verifySession])

  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0')
    } catch {
      /* ignore quota / private mode */
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    if (currentUser) fetchStats()
  }, [currentUser, fetchStats])

  useEffect(() => {
    void loadAllUsers(viewerKey)
  }, [loadAllUsers, viewerKey])

  useEffect(() => {
    fetchedRef.current.clear()
  }, [viewerKey])

  useEffect(() => {
    if (allUsersLoaded && allUsers.length > 0) fetchLeaderboard()
  }, [allUsersLoaded, allUsers.length, fetchLeaderboard])

  useEffect(() => {
    if (!currentUser || !allUsersLoaded || allUsers.length === 0) return

    const selectedOk = selectedUserId && allUsers.some(u => u.id === selectedUserId)
    if (selectedUserId && !selectedOk) {
      const fallback = allUsers.find(u => u.id === currentUser.id) ?? allUsers[0]
      setSelectedUser(fallback.id, fallback.email ?? null, fallback.name)
      return
    }
    if (!selectedUserId) {
      const found = allUsers.find(u => u.id === currentUser.id)
      setSelectedUser(currentUser.id, found?.email ?? null, currentUser.name)
    }
  }, [allUsersLoaded, currentUser, allUsers, selectedUserId, setSelectedUser])

  useEffect(() => {
    allUsers.forEach(u => {
      if (fetchedRef.current.has(u.id)) return
      fetchedRef.current.add(u.id)
      window.api.user.getAvatarUrl(u.id).then(url => {
        setAvatarUrls(prev => ({ ...prev, [u.id]: url }))
      })
    })
  }, [allUsers])

  const handleUserChange = (userId: string) => {
    const u = allUsers.find(x => x.id === userId)
    if (u) setSelectedUser(u.id, u.email, u.name)
  }

  const canPickProgressUser =
    allUsersLoaded &&
    (currentUser?.role === 'admin' || currentUser?.role === 'pm' || currentUser?.role === 'pl') &&
    allUsers.length >= 1

  const userComboboxOptions = useMemo(
    () =>
      allUsers.map(u => {
        const rank = userRanks[u.id] ?? 'newbie'
        const rankCfg = RANK_CONFIG[rank as keyof typeof RANK_CONFIG] ?? RANK_CONFIG.newbie
        const avatarSrc = u.id === currentUser?.id ? currentUser?.avatarUrl : avatarUrls[u.id]
        return {
          value: u.id,
          label: u.name,
          render: (
            <span className="flex items-center gap-2 min-w-0">
              <Avatar className={cn('h-3.5 w-3.5 shrink-0 ring-1 ml-1', rankCfg.ringColor)}>
                {avatarSrc ? <AvatarImage src={avatarSrc ?? ''} alt={u.name} className="object-cover" /> : null}
                <AvatarFallback className={cn('text-[7px]', rankCfg.bgColor, rankCfg.color)}>{getInitials(u.name)}</AvatarFallback>
              </Avatar>
              <span className="truncate font-medium">{u.name}</span>
            </span>
          ),
        }
      }),
    [allUsers, avatarUrls, userRanks, currentUser],
  )

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden select-none">
      {/* Title bar — same pattern as ShowlogToolbar */}
      <div
        className="flex items-center justify-between h-8 text-sm select-none"
        style={{ WebkitAppRegion: 'drag', backgroundColor: 'var(--main-bg)', color: 'var(--main-fg)' } as CSSProperties}
      >
        <div className="flex items-center h-full">
          <div className="w-15 h-6 flex justify-center pt-1.5 pl-1">
            <img src="logo.png" alt="icon" draggable="false" className="w-10 h-3.5 dark:brightness-130" />
          </div>
          <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            <div className="flex items-center gap-1 pt-0.5">
              <BarChart2 size={13} className="text-blue-500 shrink-0" />
              <span className="font-medium">{t('progress.pageTitle')}</span>
              {canPickProgressUser && (
                <div className="flex items-center h-7 rounded-md overflow-hidden ml-1 w-[min(240px,40vw)] min-w-[160px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="w-full min-w-0">
                        <Combobox
                          value={selectedUserId ?? ''}
                          onValueChange={handleUserChange}
                          options={userComboboxOptions}
                          placeholder={t('progress.selectUser')}
                          searchPlaceholder={t('common.search')}
                          emptyText={t('progress.noUsersMatch')}
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          triggerClassName={cn(
                            'h-7 text-xs font-medium rounded-md border-0 bg-transparent text-blue-600 dark:text-blue-400',
                            'hover:bg-muted! hover:text-blue-700! dark:hover:text-blue-300!',
                            'justify-start px-2 py-1',
                          )}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{selectedUserName ?? t('progress.selectUser')}</TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: window controls */}
        <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <button type="button" onClick={() => handleWindow('minimize')} className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]">
            <Minus size={15.5} strokeWidth={1} absoluteStrokeWidth />
          </button>
          <button type="button" onClick={() => handleWindow('maximize')} className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]">
            <Square size={14.5} strokeWidth={1} absoluteStrokeWidth />
          </button>
          <button type="button" onClick={() => handleWindow('close')} className="w-10 h-8 flex items-center justify-center hover:bg-red-600 hover:text-white">
            <X size={20} strokeWidth={1} absoluteStrokeWidth />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          className={cn(
            'flex shrink-0 flex-col overflow-hidden bg-muted/30',
            progressSidebarTransition,
            sidebarCollapsed ? 'w-[52px]' : 'w-[210px]',
          )}
        >
          <div
            className={cn(
              'flex shrink-0 items-center',
              sidebarCollapsed ? 'justify-center px-1 pb-1 pt-2' : 'justify-end px-2 pb-1 pt-2',
            )}
          >
            <Tooltip delayDuration={400}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(c => !c)}
                  aria-expanded={!sidebarCollapsed}
                  aria-label={sidebarCollapsed ? t('common.expandSidebar') : t('common.collapseSidebar')}
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground',
                    'transition-colors duration-200 hover:bg-accent hover:text-accent-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  )}
                >
                  {sidebarCollapsed ? (
                    <ChevronsRight className="h-4 w-4 transition-transform duration-300 ease-out motion-reduce:duration-150" />
                  ) : (
                    <ChevronsLeft className="h-4 w-4 transition-transform duration-300 ease-out motion-reduce:duration-150" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[220px]">
                {sidebarCollapsed ? t('common.expandSidebar') : t('common.collapseSidebar')}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* User info */}
          <div className={cn('shrink-0', sidebarCollapsed ? 'px-1 pb-2 pt-0' : 'p-3 pt-0')}>
            <div className={cn('flex items-center', sidebarCollapsed ? 'justify-center' : 'gap-2')}>
              {(() => {
                const rank = selectedUserId === currentUser?.id
                  ? (achievementStats?.current_rank ?? 'newbie')
                  : (selectedUserId ? userRanks[selectedUserId] ?? 'newbie' : 'newbie')
                const rankCfg = RANK_CONFIG[rank as keyof typeof RANK_CONFIG] ?? RANK_CONFIG.newbie
                const avatar = (
                  <Avatar className={cn('shrink-0 ring-2', rankCfg.ringColor, sidebarCollapsed ? 'h-9 w-9' : 'h-8 w-8')}>
                    {selectedUserId &&
                      (selectedUserId === currentUser?.id ? currentUser?.avatarUrl : avatarUrls[selectedUserId]) && (
                        <AvatarImage
                          src={(selectedUserId === currentUser?.id ? currentUser?.avatarUrl : avatarUrls[selectedUserId]) ?? ''}
                          alt={selectedUserName ?? ''}
                          className="object-cover"
                        />
                      )}
                    <AvatarFallback className={cn(sidebarCollapsed ? 'text-xs' : 'text-sm', rankCfg.bgColor, rankCfg.color)}>
                      {getInitials(selectedUserName ?? '—')}
                    </AvatarFallback>
                  </Avatar>
                )
                if (sidebarCollapsed) {
                  return (
                    <Tooltip delayDuration={400}>
                      <TooltipTrigger asChild>{avatar}</TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[240px]">
                        {selectedUserName ?? '—'}
                      </TooltipContent>
                    </Tooltip>
                  )
                }
                return (
                  <>
                    {avatar}
                    <div className="min-w-0 transition-opacity duration-300 ease-out motion-reduce:duration-150">
                      <p className="truncate text-sm font-medium">{selectedUserName ?? '—'}</p>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>

          {/* Navigation */}
          <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2" aria-label={t('progress.pageTitle')}>
            {SECTIONS.map(sec => {
              const Icon = sec.icon
              const isActive = activeSection === sec.id
              const btn = (
                <button
                  type="button"
                  onClick={() => setActiveSection(sec.id)}
                  className={cn(
                    'flex w-full items-center rounded-md text-sm text-left',
                    'transition-[background-color,color,padding,gap] duration-200 ease-out',
                    sidebarCollapsed ? 'justify-center gap-0 px-0 py-2' : 'gap-2.5 px-3 py-2',
                    isActive
                      ? 'bg-blue-500/15 font-medium text-blue-700 dark:text-blue-400'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-blue-500' : '')} />
                  <span
                    className={cn(
                      'truncate',
                      progressLabelTransition,
                      sidebarCollapsed ? 'max-w-0 opacity-0 overflow-hidden' : 'max-w-[200px] opacity-100',
                    )}
                  >
                    {t(sec.labelKey)}
                  </span>
                </button>
              )
              if (sidebarCollapsed) {
                return (
                  <Tooltip key={sec.id} delayDuration={400}>
                    <TooltipTrigger asChild>{btn}</TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[240px]">
                      {t(sec.labelKey)}
                    </TooltipContent>
                  </Tooltip>
                )
              }
              return <Fragment key={sec.id}>{btn}</Fragment>
            })}
          </nav>

          {/* Version note */}
          <div
            className={cn(
              'shrink-0 overflow-hidden',
              progressLabelTransition,
              sidebarCollapsed ? 'max-h-0 p-0 opacity-0' : 'p-3 opacity-100',
            )}
          >
            <p className="text-center text-[10px] text-muted-foreground/60">{t('progress.dataNote')}</p>
          </div>
        </div>

        {/* Main content */}
        <div className={cn('flex-1 flex flex-col min-h-0', activeSection === 'dailyreport' ? 'overflow-hidden' : 'overflow-y-auto')}>
          {activeSection === 'dailyreport' ? (
            <Suspense fallback={<SectionSkeleton />}>
              <div key={activeSection} className="flex flex-col flex-1 min-h-0 overflow-hidden animate-in fade-in-0 slide-in-from-right-4 duration-200">
                <DailyReportContent selectedUserId={selectedUserId} selectedUserName={selectedUserName} />
              </div>
            </Suspense>
          ) : selectedUserId ? (
            <Suspense fallback={<SectionSkeleton />}>
              <div key={activeSection} className="animate-in fade-in-0 slide-in-from-right-4 duration-200">
                {activeSection === 'heatmap' && <ActivityHeatmap userId={selectedUserId} />}
                {activeSection === 'trend' && <TrendCharts userId={selectedUserId} />}
                {activeSection === 'radar' && <DeveloperRadar userId={selectedUserId} />}
                {activeSection === 'taskperf' && <TaskPerformancePanel userId={selectedUserId} />}
                {activeSection === 'quality' && <CodeQualityPanel userId={selectedUserId} />}
                {activeSection === 'hours' && <ProductiveHoursChart userId={selectedUserId} />}
                {activeSection === 'highlights' && <MonthlyHighlights userId={selectedUserId} />}
              </div>
            </Suspense>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center space-y-2">
                <BarChart2 className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{t('progress.selectUserToStart')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
