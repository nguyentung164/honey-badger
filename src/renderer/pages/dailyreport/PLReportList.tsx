'use client'

import { format, parseISO } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TablePaginationBar } from '@/components/ui/table-pagination-bar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { formatDateDisplay, parseLocalDate } from '@/lib/dateUtils'
import i18n from '@/lib/i18n'
import { PLReportDetail } from './PLReportDetail'
import { PLReportStatistics } from './PLReportStatistics'

const DevReportHistory = lazy(() => import('./DevReportHistory').then(m => ({ default: m.DevReportHistory })))

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

/** Chuẩn hóa reportDate (string | Date) thành chuỗi 'yyyy-MM-dd' hoặc '' */
function toReportDateStr(v: string | Date | null | undefined): string {
  if (!v) return ''
  if (v instanceof Date) return format(v, 'yyyy-MM-dd')
  return String(v)
}

interface PLReportListProps {
  activeTab: string
  dateRange: DateRange | undefined
  projectId: string | null
  projects: { id: string; name: string }[]
  refreshKey?: number
  onOpenEditReport: (reportDate: string, projectId?: string | null, projectIds?: string[]) => void
  defaultDevFilter?: string
}

interface ReportListItem {
  id: string
  userId: string
  userName: string
  userCode: string
  projectId: string | null
  projectName: string | null
  projectIds?: string[]
  projectNames?: string[]
  reportDate: string
  workDescription: string | null
  selectedCommitsCount: number
  sourceFolderPath: string | null
  vcsType: string | null
  createdAt: string
}

export function PLReportList({ activeTab, dateRange, projectId, projects, refreshKey, onOpenEditReport, defaultDevFilter }: PLReportListProps) {
  const { t } = useTranslation()
  const [reports, setReports] = useState<ReportListItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedReport, setSelectedReport] = useState<{ userId: string; reportDate: string } | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [devFilter, setDevFilter] = useState<string>(defaultDevFilter ?? 'all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const dateFrom = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  const dateTo = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')

  const loadReports = useCallback(async () => {
    if (activeTab !== 'list') return
    setIsLoading(true)
    try {
      const res = await window.api.dailyReport.listForPlByDateRange(dateFrom, dateTo, projectId)
      if (res.status === 'success' && res.data) {
        setReports(res.data)
      } else {
        toast.error(res.message || t('dailyReport.loadReportsFailed'))
      }
    } catch {
      toast.error(t('dailyReport.loadListError'))
    } finally {
      setIsLoading(false)
    }
  }, [activeTab, dateFrom, dateTo, projectId, t])

  useEffect(() => {
    loadReports()
  }, [loadReports, refreshKey])

  const handleRowClick = useCallback((userId: string, reportDate: string) => {
    setSelectedReport({ userId, reportDate })
    setDetailOpen(true)
  }, [])

  const handleDetailOpenChange = useCallback((open: boolean) => {
    setDetailOpen(open)
    if (!open) setSelectedReport(null)
  }, [])

  const devsFromReports = useMemo(() => {
    const seen = new Set<string>()
    return reports
      .filter(r => !seen.has(r.userId) && seen.add(r.userId))
      .map(r => ({ userId: r.userId, userName: r.userName, userCode: r.userCode }))
      .sort((a, b) => (a.userName || a.userCode).localeCompare(b.userName || b.userCode))
  }, [reports])

  const filteredReports = useMemo(() => {
    if (devFilter === 'all') return reports
    return reports.filter(r => r.userId === devFilter)
  }, [reports, devFilter])

  const totalPages = Math.max(1, Math.ceil(filteredReports.length / pageSize))
  const paginatedReports = useMemo(() => filteredReports.slice((page - 1) * pageSize, page * pageSize), [filteredReports, page, pageSize])

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  useEffect(() => {
    setPage(1)
  }, [devFilter, pageSize])

  useEffect(() => {
    if (devFilter !== 'all' && !devsFromReports.some(d => d.userId === devFilter)) {
      setDevFilter(defaultDevFilter ?? 'all')
    }
  }, [devFilter, devsFromReports, defaultDevFilter])

  useEffect(() => {
    setDevFilter(defaultDevFilter ?? 'all')
    setPage(1)
  }, [defaultDevFilter])

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {activeTab === 'history' && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <DevReportHistory refreshKey={refreshKey} onOpenEditReport={onOpenEditReport} />
          </Suspense>
        </div>
      )}
      {activeTab === 'list' && (
        <div className="relative flex-1 min-h-0 flex flex-col gap-4">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {reports.length === 0 ? (
            <div className="py-8 text-muted-foreground text-center">{t('dailyReport.noReportsInRange')}</div>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Dev:</span>
                  <Select value={devFilter} onValueChange={v => setDevFilter(v)}>
                    <SelectTrigger className="w-[180px] h-8">
                      <SelectValue placeholder="Tất cả" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      {devsFromReports.map(d => (
                        <SelectItem key={d.userId} value={d.userId}>
                          {d.userName || d.userCode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border rounded-md overflow-hidden flex flex-col flex-1 min-h-0 shadow-sm">
                <div className="flex-1 min-h-0 overflow-auto overflow-x-auto">
                  <Table className="w-max min-w-full">
                    <TableHeader sticky>
                      <TableRow>
                        <TableHead>{t('dailyReport.date')}</TableHead>
                        <TableHead>{t('dailyReport.dev')}</TableHead>
                        <TableHead>{t('dailyReport.project')}</TableHead>
                        <TableHead>{t('dailyReport.description')}</TableHead>
                        <TableHead className="text-center">{t('dailyReport.commitCount')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedReports.map(r => (
                        <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleRowClick(r.userId, toReportDateStr(r.reportDate))}>
                          <TableCell className="font-medium">
                            {(() => {
                              if (!r.reportDate) return '-'
                              const reportDateVal = r.reportDate as unknown
                              const d =
                                reportDateVal instanceof Date
                                  ? reportDateVal
                                  : parseLocalDate(String(r.reportDate).slice(0, 10)) ?? parseISO(String(r.reportDate))
                              return !Number.isNaN(d.getTime()) ? formatDateDisplay(d, i18n.language) : '-'
                            })()}
                          </TableCell>
                          <TableCell className="font-medium">{r.userName}</TableCell>
                          <TableCell>{r.projectNames && r.projectNames.length > 0 ? r.projectNames.join(', ') : (r.projectName ?? '-')}</TableCell>
                          <TableCell className="max-w-[300px] truncate">{r.workDescription ?? '-'}</TableCell>
                          <TableCell className="text-center">{r.selectedCommitsCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {filteredReports.length > 0 && (
                  <TablePaginationBar
                    page={page}
                    totalPages={totalPages}
                    totalItems={filteredReports.length}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}
      {activeTab === 'stats' && (
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <PLReportStatistics dateRange={dateRange} projectId={projectId} projects={projects} />
        </div>
      )}

      {selectedReport && <PLReportDetail open={detailOpen} onOpenChange={handleDetailOpenChange} userId={selectedReport.userId} reportDate={selectedReport.reportDate} />}
    </div>
  )
}
