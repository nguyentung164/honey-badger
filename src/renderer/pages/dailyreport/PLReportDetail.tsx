'use client'

import { format, parseISO } from 'date-fns'
import i18n from '@/lib/i18n'
import { formatDateDisplay, getDateTimeWithSecondsDisplayPattern, parseLocalDate } from '@/lib/dateUtils'
import { File, Loader2, X } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GIT_STATUS_COLOR_CLASS_MAP, GIT_STATUS_TEXT, STATUS_COLOR_CLASS_MAP, STATUS_TEXT } from '@/components/shared/constants'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { STATUS_ICON } from '@/components/ui-elements/StatusIcon'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'

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

interface ReportDetail {
  id: string
  userId: string
  projectId: string | null
  projectIds?: string[]
  projectNames?: string[]
  reportDate: string
  workDescription: string | null
  selectedCommits: SelectedCommit[] | null
  selectedSourceFolders?: { id: string; path: string; name: string }[]
  selectedSourceFolderPaths?: string[] | null
  sourceFolderPath: string | null
  vcsType: string | null
}

interface PLReportDetailProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  reportDate: string
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

function StatusIconsWithCount({
  files,
  vcsType,
  className,
}: {
  files: { filePath: string; status: string }[]
  vcsType: string | null
  className?: string
}) {
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
            <TooltipContent>{label} ({count})</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

function CommitDetailDialog({
  commit,
  vcsType,
  onClose,
}: {
  commit: SelectedCommit
  vcsType: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-background border rounded-lg shadow-lg max-w-xl w-full max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
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
              <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('dailyReport.commitMessage')}</h4>
              <div className="max-h-[120px] rounded-md border overflow-y-auto">
                <p className="text-sm whitespace-pre-wrap p-3">{commit.message || '-'}</p>
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
    </div>
  )
}

export function PLReportDetail({ open, onOpenChange, userId, reportDate }: PLReportDetailProps) {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<ReportDetail | null>(null)
  const [detailFolderList, setDetailFolderList] = useState<{ id?: string; name: string; path: string }[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<SelectedCommit | null>(null)

  useEffect(() => {
    if (!open || !userId || !reportDate) return
    let cancelled = false
    setIsLoading(true)
    setDetail(null)
    setDetailFolderList([])
    setSelectedCommit(null)
    window.api.dailyReport
      .getDetail(userId, reportDate)
      .then(res => {
        if (cancelled) return
        if (res.status === 'success' && res.data) {
          setDetail(res.data)
        } else {
          toast.error(res.message || t('dailyReport.loadDetailFailed'))
        }
      })
      .catch(() => {
        if (!cancelled) toast.error(t('dailyReport.loadDetailError'))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, userId, reportDate, t])

  useEffect(() => {
    if (!detail) return
    let cancelled = false
    const load = async () => {
      try {
        const ids = detail.projectIds && detail.projectIds.length > 0 ? detail.projectIds : (detail.projectId ? [detail.projectId] : [])
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
  }, [detail?.id, detail?.projectId, detail?.projectIds])

  const getFolderName = useCallback((path: string) => {
    const byList = detailFolderList.find(f => f.path === path)?.name
    if (byList) return byList
    const segment = path.split(/[/\\]/).filter(Boolean).pop()
    return segment || path
  }, [detailFolderList])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
        onClick={() => onOpenChange(false)}
      >
        <div
          className="bg-background border rounded-lg shadow-lg max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <h2 className="text-lg font-semibold">
              {t('dailyReport.reportDetailWithDate', {
                date: reportDate ? formatDateDisplay(parseLocalDate(reportDate.slice(0, 10)) ?? parseISO(reportDate), i18n.language) : '',
              })}
            </h2>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-4">
            {isLoading ? (
              <div className="flex flex-1 items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : detail ? (
              <ScrollArea className="flex-1 -mr-4 pr-4">
                <div className="space-y-4 p-4">
                  {detail.projectNames && detail.projectNames.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('dailyReport.project')}</h4>
                      <p className="text-sm">{detail.projectNames.join(', ')}</p>
                    </div>
                  )}
                  {(() => {
                    const tags =
                      detail.selectedSourceFolders && detail.selectedSourceFolders.length > 0
                        ? detail.selectedSourceFolders.map(f => ({ key: f.id, title: f.path, label: f.name || getFolderName(f.path) }))
                        : (detail.selectedSourceFolderPaths ?? []).map(p => ({
                            key: p,
                            title: p,
                            label: getFolderName(p),
                          }))
                    return tags.length > 0 ? (
                      <div>
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
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('dailyReport.workDescription')}</h4>
                    <div className="border rounded-md p-3 max-h-[240px] overflow-y-auto">
                      <p className="text-sm whitespace-pre-wrap">{detail.workDescription || t('dailyReport.noDescription')}</p>
                    </div>
                  </div>
                  {detail.selectedCommits && detail.selectedCommits.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">
                        {t('dailyReport.reportedCommits', { count: detail.selectedCommits.length })}
                      </h4>
                      <ScrollArea className="h-[280px] border rounded-md overflow-y-auto">
                        <div className="p-4 space-y-2">
                          {detail.selectedCommits.map(c => (
                            <div
                              key={c.revision}
                              className="flex flex-col gap-1.5 p-2.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors border border-transparent hover:border-muted-foreground/20"
                              onClick={() => setSelectedCommit(c)}
                            >
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {getSourceBadgeLabel(c, getFolderName) ? (
                                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary shrink-0" title={getSourceBadgeLabel(c, getFolderName)}>{getSourceBadgeLabel(c, getFolderName)}</span>
                                  ) : (
                                    <span className="font-mono text-primary text-xs shrink-0" title={c.revision}>{c.revision.length > 8 ? c.revision.substring(0, 8) : c.revision}</span>
                                  )}
                                  {c.files && c.files.length > 0 && (
                                    <StatusIconsWithCount files={c.files} vcsType={c.vcsType ?? detail.vcsType} className="shrink-0" />
                                  )}
                                </div>
                                <span className="text-muted-foreground text-xs shrink-0">{formatCommitDate(c.date)}</span>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-1 pl-0">{getFirstLine(c.message)}</p>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="py-8 text-center text-muted-foreground">{t('dailyReport.noData')}</div>
            )}
          </div>
        </div>
      </div>
      {selectedCommit && detail && (
        <CommitDetailDialog
          commit={selectedCommit}
          vcsType={selectedCommit.vcsType ?? detail.vcsType}
          onClose={() => setSelectedCommit(null)}
        />
      )}
    </>
  )
}
