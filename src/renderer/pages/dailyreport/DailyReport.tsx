'use client'

import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { BarChart3, CalendarDays, FileEdit, List, Loader2, Minus, RefreshCw, Square, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DateRangePickerPopover } from '@/components/ui-elements/DateRangePickerPopover'
import { OverlayLoader } from '@/components/ui-elements/OverlayLoader'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

const DevReportForm = lazy(() => import('./DevReportForm').then(m => ({ default: m.DevReportForm })))
const DevReportHistory = lazy(() => import('./DevReportHistory').then(m => ({ default: m.DevReportHistory })))
const PLReportList = lazy(() => import('./PLReportList').then(m => ({ default: m.PLReportList })))

export function DailyReport() {
  const { t } = useTranslation()
  const user = useTaskAuthStore(s => s.user)
  const verifySession = useTaskAuthStore(s => s.verifySession)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const [reportDatePickerOpen, setReportDatePickerOpen] = useState(false)
  const [plDateRange, setPlDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date()
    return { from: today, to: today }
  })
  const [plActiveTab, setPlActiveTab] = useState('history')
  const [editReportInitialDate, setEditReportInitialDate] = useState<string | undefined>()
  const [editReportInitialProjectId, setEditReportInitialProjectId] = useState<string | null | undefined>()
  const [editReportInitialProjectIds, setEditReportInitialProjectIds] = useState<string[] | undefined>()
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  const [isOpeningReportDialog, setIsOpeningReportDialog] = useState(false)

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  const loadProjects = useCallback(async () => {
    if (!user) {
      setIsLoadingProjects(false)
      return
    }
    setIsLoadingProjects(true)
    try {
      const res = await window.api.task.getProjectsForUser()
      if (res.status === 'success' && res.data) {
        setProjects(res.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingProjects(false)
    }
  }, [user])

  useEffect(() => {
    verifySession()
  }, [verifySession])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const isPlOrAdmin = user?.role === 'pl' || user?.role === 'pm' || user?.role === 'admin'

  const handleOpenReportDialog = useCallback(async () => {
    setIsOpeningReportDialog(true)
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    try {
      const res = await window.api.dailyReport.getMine(todayStr)
      if (res.status === 'success' && res.data) {
        setEditReportInitialDate(todayStr)
        setEditReportInitialProjectId(res.data.projectId ?? null)
        const ids = res.data.projectIds?.length ? res.data.projectIds : (res.data.projectId ? [res.data.projectId] : [])
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
  }, [])

  const handleOpenEditReport = useCallback((date: string, projectIdFromReport?: string | null, projectIdsFromReport?: string[]) => {
    setEditReportInitialDate(date)
    setEditReportInitialProjectId(projectIdFromReport)
    setEditReportInitialProjectIds(projectIdsFromReport)
    setReportDialogOpen(true)
  }, [])

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <div
        className="flex h-9 items-center justify-between text-sm select-none shrink-0 pl-2 gap-2"
        style={
          {
            WebkitAppRegion: 'drag',
            backgroundColor: 'var(--main-bg)',
            color: 'var(--main-fg)',
          } as React.CSSProperties
        }
      >
        <div className="flex items-center h-full gap-3 min-w-0 flex-1">
          <div className="w-15 h-6 flex justify-center pt-1.5 pl-1 shrink-0">
            <img src="logo.png" alt="icon" draggable="false" className="w-10 h-3.5 dark:brightness-130" />
          </div>
          {user && isPlOrAdmin && (
            <>
              <Tabs value={plActiveTab} onValueChange={setPlActiveTab} className="shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <TabsList className="h-6! p-0.5 rounded-md">
                  <TabsTrigger value="history" className="h-5 px-2 text-xs data-[state=active]:shadow-none gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {t('dailyReport.history')}
                  </TabsTrigger>
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
              {(plActiveTab === 'list' || plActiveTab === 'stats') && (
                <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                  <DateRangePickerPopover
                    dateRange={plDateRange}
                    onDateRangeChange={setPlDateRange}
                    open={reportDatePickerOpen}
                    onOpenChange={setReportDatePickerOpen}
                    allTimeLabel={t('dailyReport.selectDateRange')}
                    confirmLabel={t('common.confirm')}
                  />
                </div>
              )}
            </>
          )}
          <div className="flex-1 flex justify-center min-w-0">
            <span className="text-sm font-medium">{t('dailyReport.open')}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {user && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleOpenReportDialog}
                    disabled={isOpeningReportDialog || isLoadingProjects}
                    onPointerDown={e => e.stopPropagation()}
                    className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-8 w-8 shrink-0"
                  >
                    {isOpeningReportDialog ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileEdit className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isOpeningReportDialog ? t('common.loading', 'Đang tải ...') : t('dailyReport.createReport')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRefreshKey(k => k + 1)}
                    disabled={isLoadingProjects}
                    onPointerDown={e => e.stopPropagation()}
                    className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted transition-colors rounded-sm h-8 w-8 shrink-0"
                  >
                    <RefreshCw className={isLoadingProjects ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('common.refresh')}</TooltipContent>
              </Tooltip>
            </>
          )}
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

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-4">
        {!user ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            {t('dailyReport.pleaseLogin')}
          </div>
        ) : isPlOrAdmin ? (
          <Suspense
            fallback={
              <div className="relative flex-1 min-h-0">
                <OverlayLoader isLoading={true} />
              </div>
            }
          >
            <PLReportList
              activeTab={plActiveTab}
              dateRange={plDateRange}
              projectId={null}
              projects={projects}
              refreshKey={refreshKey}
              onOpenEditReport={handleOpenEditReport}
            />
          </Suspense>
        ) : (
          <Suspense
            fallback={
              <div className="relative flex-1 min-h-0 flex flex-col">
                <OverlayLoader isLoading={true} />
              </div>
            }
          >
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <DevReportHistory
                refreshKey={refreshKey}
                onOpenEditReport={(date, projectIdFromReport) => handleOpenEditReport(date, projectIdFromReport)}
              />
            </div>
          </Suspense>
        )}

        <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
          <DialogContent className="max-w-6xl! max-h-[90vh]! overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{editReportInitialDate ? t('dailyReport.editReport') : t('dailyReport.createReport')}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto pr-2">
              <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                <DevReportForm
                  initialReportDate={editReportInitialDate}
                  initialProjectId={editReportInitialProjectId}
                  initialProjectIds={editReportInitialProjectIds}
                  refreshKey={refreshKey}
                  onSuccess={() => {
                    setReportDialogOpen(false)
                    setRefreshKey(k => k + 1)
                  }}
                  isPlOrAdmin={isPlOrAdmin}
                />
              </Suspense>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
