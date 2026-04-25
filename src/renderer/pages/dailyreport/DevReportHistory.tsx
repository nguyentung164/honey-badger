'use client'

import { endOfMonth, format, parseISO, startOfDay, startOfMonth } from 'date-fns'
import { File, FileText, Loader2, Pencil, X } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GIT_STATUS_COLOR_CLASS_MAP, GIT_STATUS_TEXT, STATUS_COLOR_CLASS_MAP, STATUS_TEXT } from '@/components/shared/constants'
import { Button } from '@/components/ui/button'
import { Calendar, CalendarDayButton } from '@/components/ui/calendar'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { STATUS_ICON } from '@/components/ui-elements/StatusIcon'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import i18n from '@/lib/i18n'
import { formatDateDisplay, getDateFnsLocale, getDateOnlyPattern, getDateTimeWithSecondsDisplayPattern, parseLocalDate } from '@/lib/dateUtils'

interface HistoryItem {
  id: string
  reportDate: string
  projectId: string | null
  projectName: string | null
  projectIds?: string[]
  projectNames?: string[]
  workDescription: string | null
  selectedCommitsCount: number
  createdAt: string
}

interface SelectedCommit {
  revision: string
  message: string
  author: string
  date: string
  files?: { filePath: string; status: string }[]
  sourceFolderPath?: string
  branch?: string
  vcsType?: 'git' | 'svn'
}

interface ReportFullDetail {
  id: string
  reportDate: string
  projectId: string | null
  projectIds?: string[]
  workDescription: string | null
  vcsType: string | null
  selectedCommits: SelectedCommit[] | null
  selectedSourceFolders?: { id: string; path: string; name: string }[]
  selectedSourceFolderPaths?: string[] | null
}

/** Chuẩn hóa reportDate về 'yyyy-MM-dd' theo giờ local (tránh ISO timezone làm lệch ngày) */
function toReportDateStr(val: string | Date): string {
  if (val == null) return ''
  if (val instanceof Date) return format(val, 'yyyy-MM-dd')
  const s = String(val).trim()
  if (s.includes('T')) return format(new Date(s), 'yyyy-MM-dd')
  return s.substring(0, 10)
}

/** Chuyển reportDate sang Date (local) để so sánh với calendar cells */
function toReportDate(val: string | Date): Date | null {
  const s = toReportDateStr(val)
  if (!s || s.length < 10) return null
  const [y, m, d] = s.split('-').map(Number)
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null
  return new Date(y, m - 1, d)
}

/** Báo cáo có thể sửa khi ngày báo cáo là hôm nay hoặc tương lai (so sánh theo ngày local) */
function canEditReportDate(reportDateVal: string | Date): boolean {
  const reportDay = toReportDate(reportDateVal)
  if (!reportDay) return false
  const todayStart = startOfDay(new Date())
  return reportDay.getTime() >= todayStart.getTime()
}

function formatCommitDate(dateStr: string): string {
  try {
    const d = /^\d{4}-\d{2}-\d{2}T/.test(dateStr) ? parseISO(dateStr) : new Date(dateStr)
    return Number.isNaN(d.getTime()) ? dateStr : format(d, getDateTimeWithSecondsDisplayPattern(i18n.language))
  } catch {
    return dateStr
  }
}

function getFirstLine(msg: string): string {
  const first = (msg || '').split(/\r?\n/)[0]?.trim()
  return first || '-'
}

function getSourceBadgeLabel(c: SelectedCommit, getFolderName: (path: string) => string): string {
  const name = c.sourceFolderPath ? getFolderName(c.sourceFolderPath) : ''
  if (!name) return ''
  return c.branch ? `${name} (${c.branch})` : name
}

function getStatusCounts(files: { filePath: string; status: string }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const f of files) {
    const code = f.status?.trim() || '?'
    counts.set(code, (counts.get(code) || 0) + 1)
  }
  return counts
}

function StatusIconsWithCount({ files, vcsType, className }: { files: { filePath: string; status: string }[]; vcsType: string | null; className?: string }) {
  const { t } = useTranslation()
  const counts = getStatusCounts(files)
  const isGit = vcsType === 'git'
  const statusTextMap = isGit ? GIT_STATUS_TEXT : STATUS_TEXT
  const colorMap = isGit ? GIT_STATUS_COLOR_CLASS_MAP : STATUS_COLOR_CLASS_MAP

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {Array.from(counts.entries()).map(([code, count]) => {
        const Icon = (STATUS_ICON as Record<string, React.ElementType>)[code] ?? File
        const colorClass = (colorMap as Record<string, string>)[code] ?? 'text-muted-foreground'
        const label = (statusTextMap as Record<string, string>)[code] ? t((statusTextMap as Record<string, string>)[code]) : code
        return (
          <Tooltip key={code}>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5">
                <Icon strokeWidth={1.5} className={cn('w-3.5 h-3.5', colorClass)} />
                <span className="text-xs">({count})</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {label} ({count})
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

function CommitDetailDialog({ commit, vcsType, onClose }: { commit: SelectedCommit; vcsType: string | null; onClose: () => void }) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 cursor-default"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClose()
        }
      }}
      aria-label={t('common.close')}
    >
      <div className="bg-background border rounded-lg shadow-lg max-w-xl w-full max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h3 className="text-base font-semibold font-mono truncate" title={commit.revision}>
            {commit.revision.length > 12 ? commit.revision.substring(0, 12) + '...' : commit.revision}
          </h3>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 min-h-0 -mr-4 pr-4">
          <div className="p-4 space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1 text-left">{t('dailyReport.commitMessage')}</h4>
              <div className="max-h-[120px] rounded-md border overflow-y-auto text-left">
                <p className="text-sm whitespace-pre-wrap p-3 text-left">{commit.message || '-'}</p>
              </div>
            </div>
            {commit.files && commit.files.length > 0 && (
              <div className="text-left">
                <h4 className="text-sm font-medium text-muted-foreground mb-2 text-left">
                  {t('dailyReport.files')} ({commit.files.length})
                </h4>
                <div className="max-h-[180px] rounded-md border overflow-y-auto text-left">
                  <div className="space-y-1.5 p-3 text-left">
                    {commit.files.map((f, j) => {
                      const Icon = (STATUS_ICON as Record<string, React.ElementType>)[f.status?.trim() || '?'] ?? File
                      const isGit = vcsType === 'git'
                      const colorMap = isGit ? GIT_STATUS_COLOR_CLASS_MAP : STATUS_COLOR_CLASS_MAP
                      const colorClass = (colorMap as Record<string, string>)[f.status?.trim() || '?'] ?? 'text-muted-foreground'
                      return (
                        <div key={j} className="flex items-center gap-2 text-sm">
                          <Icon strokeWidth={1.5} className={cn('w-4 h-4 shrink-0', colorClass)} />
                          <span className="break-all">{f.filePath}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </button>
  )
}

interface DevReportHistoryProps {
  /** Tăng lên sau khi save report để History/Calendar reload data */
  refreshKey?: number
  onOpenEditReport: (reportDate: string, projectId?: string | null, projectIds?: string[]) => void
  /** Admin/PL xem lịch sử của user khác */
  targetUserId?: string
  isViewingOtherUser?: boolean
}

export function DevReportHistory({ refreshKey, onOpenEditReport, targetUserId, isViewingOtherUser }: DevReportHistoryProps) {
  const { t } = useTranslation()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [detailItem, setDetailItem] = useState<HistoryItem | null>(null)
  const [fullDetail, setFullDetail] = useState<ReportFullDetail | null>(null)
  const [detailFolderList, setDetailFolderList] = useState<{ name: string; path: string }[]>([])
  const [selectedCommit, setSelectedCommit] = useState<SelectedCommit | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)

  const loadCalendarMonth = useCallback(async () => {
    const from = startOfMonth(currentMonth)
    const to = endOfMonth(currentMonth)
    setIsLoading(true)
    try {
      const res = await window.api.dailyReport.getMyHistory({
        dateFrom: format(from, 'yyyy-MM-dd'),
        dateTo: format(to, 'yyyy-MM-dd'),
        targetUserId: targetUserId ?? undefined,
      })
      if (res.status === 'success' && res.data) {
        setHistory(res.data)
      } else {
        setHistory([])
      }
    } catch {
      setHistory([])
    } finally {
      setIsLoading(false)
    }
  }, [currentMonth, targetUserId])

  useEffect(() => {
    setHistory([])
    setDetailItem(null)
    setFullDetail(null)
    setSelectedDate(undefined)
  }, [targetUserId])

  useEffect(() => {
    loadCalendarMonth()
  }, [loadCalendarMonth, refreshKey])

  useEffect(() => {
    setSelectedCommit(null)
    if (!detailItem) {
      setFullDetail(null)
      setDetailFolderList([])
      return
    }
    const reportDate = toReportDateStr(detailItem.reportDate as string | Date)
    if (!reportDate) return
    let cancelled = false
    setIsLoadingDetail(true)
    setFullDetail(null)
    setDetailFolderList([])
    const detailPromise = isViewingOtherUser && targetUserId
      ? window.api.dailyReport.getDetail(targetUserId, reportDate)
      : window.api.dailyReport.getMine(reportDate)
    detailPromise
      .then(res => {
        if (cancelled) return
        if (res.status === 'success' && res.data) {
          setFullDetail(res.data)
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetail(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailItem, refreshKey, targetUserId, isViewingOtherUser])

  useEffect(() => {
    if (!fullDetail) return
    let cancelled = false
    const load = async () => {
      try {
        const ids = fullDetail.projectIds && fullDetail.projectIds.length > 0 ? fullDetail.projectIds : (fullDetail.projectId ? [fullDetail.projectId] : [])
        if (ids.length > 0) {
          const res = await window.api.task.getSourceFoldersByProjects(ids)
          if (cancelled) return
          if (res.status === 'success' && res.data) setDetailFolderList(res.data)
          else setDetailFolderList([])
        } else {
          const data = await window.api.sourcefolder.get()
          if (cancelled) return
          setDetailFolderList(Array.isArray(data) ? data : [])
        }
      } catch {
        if (!cancelled) setDetailFolderList([])
      }
    }
    load()
    return () => { cancelled = true }
  }, [fullDetail?.id, fullDetail?.projectId, fullDetail?.projectIds])

  const getFolderName = useCallback((path: string) => {
    const byList = detailFolderList.find(f => f.path === path)?.name
    if (byList) return byList
    const segment = path.split(/[/\\]/).filter(Boolean).pop()
    return segment || path
  }, [detailFolderList])

  const reportDatesForCalendar = useMemo(() => {
    return history.map(h => toReportDate(h.reportDate as string | Date)).filter((d): d is Date => d != null)
  }, [history])

  const reportDateStrSet = useMemo(() => new Set(reportDatesForCalendar.map(d => format(d, 'yyyy-MM-dd'))), [reportDatesForCalendar])

  const modifiers = useMemo(
    () => ({
      hasReport: reportDatesForCalendar,
      overdueNoReport: (date: Date) => {
        if (reportDateStrSet.has(format(date, 'yyyy-MM-dd'))) return false
        const today = startOfDay(new Date())
        const d = startOfDay(date)
        if (d >= today) return false
        const dayOfWeek = date.getDay()
        if (dayOfWeek === 0 || dayOfWeek === 6) return false
        return true
      },
    }),
    [reportDatesForCalendar, reportDateStrSet]
  )

  const modifiersClassNames = useMemo(
    () => ({
      hasReport: 'text-primary font-medium',
      overdueNoReport: 'text-orange-500 font-medium',
    }),
    []
  )

  const detailPanel = (
    <>
      <div className="flex items-center justify-between gap-2 py-2.5 px-3 shrink-0 min-w-0 relative z-10">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">
            {detailItem
              ? t('dailyReport.reportDetailWithDate', {
                  date: (() => {
                    const ymd = toReportDateStr(detailItem.reportDate as string | Date)
                    const d =
                      ymd.length >= 10 ? parseLocalDate(ymd.slice(0, 10)) : undefined
                    return formatDateDisplay(d ?? new Date(detailItem.reportDate as string | Date), i18n.language)
                  })(),
                })
              : t('dailyReport.reportDetail')}
          </span>
        </div>
        {detailItem && !isViewingOtherUser && (() => {
          const canEdit = canEditReportDate(detailItem.reportDate as string | Date)
          const disabled = !onOpenEditReport || !canEdit
          return (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-6 w-6 shrink-0 flex-shrink-0 relative z-10 cursor-pointer"
              title={
                canEdit
                  ? t('dailyReport.editReport')
                  : t('dailyReport.cannotEditPastReport')
              }
              disabled={disabled}
              onClick={() => {
                if (!disabled) {
                  const ids = detailItem.projectIds && detailItem.projectIds.length > 0 ? detailItem.projectIds : (detailItem.projectId ? [detailItem.projectId] : [])
                  onOpenEditReport(toReportDateStr(detailItem.reportDate as string | Date), detailItem.projectId, ids)
                }
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )
        })()}
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col min-h-[120px] bg-background/60">
        {!detailItem ? (
          <div className="flex flex-1 items-center justify-center h-full text-muted-foreground text-sm">{t('dailyReport.selectDetailHint')}</div>
        ) : isLoadingDetail ? (
          <div className="flex flex-1 items-center justify-center min-h-[120px] text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : fullDetail ? (
          <div className="flex flex-col flex-1 min-h-0 p-4">
            <div className="shrink-0">
              <h4 className="text-sm font-medium text-muted-foreground mb-1.5">{t('dailyReport.project')}</h4>
              <div className="flex flex-wrap gap-1.5">
                {(detailItem.projectNames && detailItem.projectNames.length > 0 ? detailItem.projectNames : [detailItem.projectName ?? '-']).map((name, i) => (
                  <span key={i} className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                    {name}
                  </span>
                ))}
              </div>
            </div>
            {(() => {
              const tags =
                fullDetail.selectedSourceFolders && fullDetail.selectedSourceFolders.length > 0
                  ? fullDetail.selectedSourceFolders.map(f => ({ key: f.id, title: f.path, label: f.name || getFolderName(f.path) }))
                  : (fullDetail.selectedSourceFolderPaths ?? []).map(p => ({
                    key: p,
                    title: p,
                    label: getFolderName(p),
                  }))
              return tags.length > 0 ? (
                <div className="shrink-0 mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-1.5">{t('dailyReport.sourceFolderLabel')}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map(tg => (
                      <span
                        key={tg.key}
                        className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
                        title={tg.title}
                      >
                        {tg.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null
            })()}
            <div className="shrink-0 mt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('dailyReport.workDescription')}</h4>
              <div className="rounded-lg bg-muted/50 p-3 max-h-[240px] overflow-y-auto">
                <p className="text-sm whitespace-pre-wrap">{fullDetail.workDescription || t('dailyReport.noDescription')}</p>
              </div>
            </div>
            {fullDetail.selectedCommits && fullDetail.selectedCommits.length > 0 ? (
              <div className="flex flex-col flex-1 min-h-0 mt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-2 shrink-0">{t('dailyReport.reportedCommits', { count: fullDetail.selectedCommits.length })}</h4>
                <div className="flex-1 min-h-0 rounded-lg bg-muted/40 overflow-y-auto">
                  <div className="space-y-2 p-2">
                    {fullDetail.selectedCommits.map(c => (
                      <button
                        key={c.revision}
                        type="button"
                        className="flex flex-col gap-1.5 p-2.5 rounded-md cursor-pointer hover:bg-muted/70 transition-colors text-left w-full"
                        onClick={() => setSelectedCommit(c)}
                      >
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {getSourceBadgeLabel(c, getFolderName) ? (
                              <span className="inline-flex items-center rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary shrink-0" title={getSourceBadgeLabel(c, getFolderName)}>{getSourceBadgeLabel(c, getFolderName)}</span>
                            ) : (
                              <span className="font-mono text-primary text-xs shrink-0" title={c.revision}>{c.revision.length > 8 ? c.revision.substring(0, 8) : c.revision}</span>
                            )}
                            {c.files && c.files.length > 0 && <StatusIconsWithCount files={c.files} vcsType={c.vcsType ?? fullDetail.vcsType} className="shrink-0" />}
                          </div>
                          <span className="text-muted-foreground text-xs shrink-0">{formatCommitDate(c.date)}</span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1 pl-0">{getFirstLine(c.message)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center min-h-[120px] text-muted-foreground text-sm">{t('dailyReport.loadDetailFailed')}</div>
        )}
      </div>
    </>
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden h-full">
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 rounded-xl overflow-hidden bg-muted/40 shadow-sm">
        <ResizablePanel id="dev-history-left" defaultSize={300} minSize={300} maxSize={300} className="flex flex-col min-h-0 bg-muted/30">
          <div className="relative flex flex-col gap-4 flex-1 min-h-0 p-3 items-center justify-center">
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            <Calendar
              className="bg-transparent"
              mode="single"
              selected={selectedDate}
              components={{
                DayButton: ({ className, modifiers, ...props }) => (
                  <CalendarDayButton
                    {...props}
                    modifiers={modifiers}
                    className={cn(
                      className,
                      modifiers.hasReport && '!text-blue-600 dark:!text-blue-400 font-medium',
                      modifiers.overdueNoReport && '!text-orange-500 font-medium'
                    )}
                  />
                ),
              }}
              onSelect={date => {
                setSelectedDate(date)
                if (date) {
                  const dateStr = format(date, 'yyyy-MM-dd')
                  const item = history.find(h => toReportDateStr(h.reportDate as string | Date) === dateStr)
                  if (item) {
                    setDetailItem(item)
                  } else {
                    toast.info(t('dailyReport.noReportOnDate', { date: format(date, getDateOnlyPattern(i18n.language)) }))
                  }
                }
              }}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              modifiers={modifiers}
              modifiersClassNames={modifiersClassNames}
              locale={getDateFnsLocale(i18n.language)}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle className="bg-border/20" />
        <ResizablePanel id="dev-history-right" className="flex flex-col min-h-0 pl-0 bg-muted/30">
          {detailPanel}
        </ResizablePanel>
      </ResizablePanelGroup>
      {selectedCommit && fullDetail && <CommitDetailDialog commit={selectedCommit} vcsType={selectedCommit.vcsType ?? fullDetail.vcsType} onClose={() => setSelectedCommit(null)} />}
    </div>
  )
}
