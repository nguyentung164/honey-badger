'use client'

import { subDays } from 'date-fns'
import { BarChart3, List, Minus, RefreshCw, Square, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DateRangePickerPopover } from '@/components/ui-elements/DateRangePickerPopover'
import { OverlayLoader } from '@/components/ui-elements/OverlayLoader'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

const PLReportList = lazy(() => import('@/pages/dailyreport/PLReportList').then(m => ({ default: m.PLReportList })))

type ActiveTab = 'list' | 'stats'

export function ReportManagerPage() {
  const { t } = useTranslation()
  const user = useTaskAuthStore(s => s.user)
  const verifySession = useTaskAuthStore(s => s.verifySession)
  const [activeTab, setActiveTab] = useState<ActiveTab>('list')
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date()
    return { from: subDays(today, 30), to: today }
  })
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)

  useEffect(() => {
    verifySession()
  }, [verifySession])

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true)
    try {
      const res = await window.api.task.getProjectsForUser()
      if (res.status === 'success' && res.data) {
        const list = res.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
        setProjects(list)
        setSelectedProjectId(prev => prev ?? list[0]?.id ?? null)
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingProjects(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  const isPlOrAdmin = user?.role === 'pl' || user?.role === 'pm' || user?.role === 'admin'

  return (
    <div className="flex h-screen w-full flex-col bg-background overflow-hidden">
      {/* Title bar */}
      <div
        className="flex h-9 items-center justify-between text-sm select-none shrink-0 pl-2 gap-2"
        style={
          {
            WebkitAppRegion: 'drag',
            backgroundColor: 'var(--main-bg)',
            color: 'var(--main-fg)',
          } as CSSProperties
        }
      >
        <div className="flex items-center h-full gap-3 min-w-0 flex-1">
          <div className="w-15 h-6 flex justify-center pt-1.5 pl-1 shrink-0">
            <img src="logo.png" alt="icon" draggable="false" className="w-10 h-3.5 dark:brightness-130" />
          </div>
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as ActiveTab)} className="shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            <TabsList className="h-6! p-0.5 rounded-md">
              <TabsTrigger value="list" className="h-5 px-2 text-xs data-[state=active]:shadow-none gap-1">
                <List className="h-3.5 w-3.5" />
                {t('dailyReport.list')}
              </TabsTrigger>
              <TabsTrigger value="stats" className="h-5 px-2 text-xs data-[state=active]:shadow-none gap-1">
                <BarChart3 className="h-3.5 w-3.5" />
                {t('dailyReport.stats')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            <DateRangePickerPopover
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              open={datePickerOpen}
              onOpenChange={setDatePickerOpen}
              allTimeLabel={t('dailyReport.selectDateRange')}
              confirmLabel={t('common.confirm')}
            />
          </div>
          <div className="shrink-0 min-w-[120px] max-w-[180px]" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            <Combobox
              variant="ghost"
              value={selectedProjectId ?? ''}
              onValueChange={v => setSelectedProjectId(v || null)}
              options={projects.map(p => ({ value: p.id, label: p.name }))}
              placeholder={t('dailyReport.selectProject')}
              emptyText={isLoadingProjects ? t('common.loading') : t('dailyReport.noProjects')}
              searchPlaceholder={t('common.search', 'Tìm...')}
              onOpen={loadProjects}
              disabled={isLoadingProjects && projects.length === 0}
              triggerClassName="h-6 text-xs font-medium px-2 py-0 hover:bg-muted"
              contentClassName="min-w-[180px]"
            />
          </div>
          <div style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRefreshKey(k => k + 1)}
                  disabled={isLoadingProjects}
                  className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-6 w-6 shrink-0"
                >
                  <RefreshCw className={isLoadingProjects ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('common.refresh')}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <button type="button" onClick={() => handleWindow('minimize')} className="w-10 h-9 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]">
            <Minus size={15.5} strokeWidth={1} absoluteStrokeWidth />
          </button>
          <button type="button" onClick={() => handleWindow('maximize')} className="w-10 h-9 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]">
            <Square size={14.5} strokeWidth={1} absoluteStrokeWidth />
          </button>
          <button type="button" onClick={() => handleWindow('close')} className="w-10 h-9 flex items-center justify-center hover:bg-red-600 hover:text-white">
            <X size={20} strokeWidth={1} absoluteStrokeWidth />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-4">
        {!user ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            {t('dailyReport.pleaseLogin')}
          </div>
        ) : !isPlOrAdmin ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            {t('common.noPermission', 'Bạn không có quyền truy cập.')}
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="relative flex-1 min-h-0">
                <OverlayLoader isLoading={true} />
              </div>
            }
          >
            <PLReportList
              activeTab={activeTab}
              dateRange={dateRange}
              projectId={selectedProjectId}
              projects={projects}
              refreshKey={refreshKey}
              onOpenEditReport={() => { }}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
