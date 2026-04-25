'use client'
import { format } from 'date-fns'
import { CheckCircle2, Circle, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import i18n from '@/lib/i18n'
import { formatDateDisplay } from '@/lib/dateUtils'
import logger from '@/services/logger'
import { type CommitReviewRecord, useCommitReviewStore } from '@/stores/useCommitReviewStore'

interface LogEntry {
  revision: string
  fullCommitId?: string
  author: string
  date: string
  isoDate: string
  message: string
}

interface CommitReviewStatisticDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  allLogData: LogEntry[]
  sourceFolderPath: string
  versionControlSystem: 'svn' | 'git'
}

export function CommitReviewStatisticDialog({ isOpen, onOpenChange, allLogData, sourceFolderPath, versionControlSystem }: CommitReviewStatisticDialogProps) {
  const { t } = useTranslation()
  const getAllBySourceFolder = useCommitReviewStore(s => s.getAllBySourceFolder)
  const [reviews, setReviews] = useState<CommitReviewRecord[]>([])

  const loadReviews = useCallback(async () => {
    if (!sourceFolderPath || !isOpen) return
    try {
      const data = await getAllBySourceFolder(sourceFolderPath)
      setReviews(data)
    } catch (error) {
      logger.error('Error loading reviews:', error)
    }
  }, [sourceFolderPath, isOpen, getAllBySourceFolder])

  useEffect(() => {
    if (isOpen) {
      loadReviews()
    }
  }, [isOpen, loadReviews])

  const reviewedSet = useMemo(() => new Set(reviews.map(r => r.commitId)), [reviews])

  const { total, reviewedCount, unreviewedCount } = useMemo(() => {
    const total = allLogData.length
    const reviewed = allLogData.filter(e => {
      const id = versionControlSystem === 'git' ? e.fullCommitId || e.revision : e.revision
      return reviewedSet.has(id)
    }).length
    return {
      total,
      reviewedCount: reviewed,
      unreviewedCount: total - reviewed,
    }
  }, [allLogData, reviewedSet, versionControlSystem])

  const getRowColor = (ratio: number) => {
    if (ratio >= 1) return 'rgb(22, 163, 74)' // green-600 - đã review hết
    if (ratio <= 0) return 'rgb(194, 65, 12)' // orange-800 - chưa review
    // Interpolate: cam đậm -> cam nhạt -> vàng -> xanh nhạt -> xanh lá
    const stops: [number, [number, number, number]][] = [
      [0, [194, 65, 12]],
      [0.25, [234, 88, 12]],
      [0.5, [202, 138, 4]],
      [0.75, [101, 163, 13]],
      [1, [22, 163, 74]],
    ]
    for (let i = 0; i < stops.length - 1; i++) {
      const [r1, c1] = stops[i]
      const [r2, c2] = stops[i + 1]
      if (ratio <= r2) {
        const t = (ratio - r1) / (r2 - r1)
        const r = Math.round(c1[0] + t * (c2[0] - c1[0]))
        const g = Math.round(c1[1] + t * (c2[1] - c1[1]))
        const b = Math.round(c1[2] + t * (c2[2] - c1[2]))
        return `rgb(${r}, ${g}, ${b})`
      }
    }
    return 'rgb(22, 163, 74)'
  }

  const byDate = useMemo(() => {
    const map = new Map<string, { total: number; reviewed: number }>()
    for (const entry of allLogData) {
      const dateKey = entry.isoDate ? format(new Date(entry.isoDate), 'yyyy-MM-dd') : ''
      const current = map.get(dateKey) || { total: 0, reviewed: 0 }
      const id = versionControlSystem === 'git' ? entry.fullCommitId || entry.revision : entry.revision
      current.total += 1
      if (reviewedSet.has(id)) current.reviewed += 1
      map.set(dateKey, current)
    }
    return Array.from(map.entries())
      .filter(([d]) => d)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 14)
      .map(([date, data]) => ({
        date,
        ...data,
        unreviewed: data.total - data.reviewed,
        ratio: data.total > 0 ? data.reviewed / data.total : 0,
      }))
  }, [allLogData, reviewedSet, versionControlSystem])

  const handleClose = () => onOpenChange(false)

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) return
        onOpenChange(open)
      }}
    >
      <DialogContent className="max-w-3xl! max-h-[90vh]! p-0 gap-0 overflow-hidden flex flex-col [&>button]:hidden">
        <div
          className="flex items-center justify-between h-8 text-sm border-b select-none shrink-0"
          style={{
            backgroundColor: 'var(--main-bg)',
            color: 'var(--main-fg)',
          }}
        >
          <div className="flex items-center h-full pl-3">
            <span className="text-xs font-medium">{t('dialog.commitReview.statisticsTitle')}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClose} className="h-7 px-2 gap-1.5 hover:bg-muted mr-2" title={t('common.close')}>
            <X className="h-2.5 w-2.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4 py-4 px-6">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t('dialog.commitReview.totalCommits')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  {t('dialog.commitReview.reviewed')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{reviewedCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1">
                  <Circle className="h-4 w-4 text-amber-500" />
                  {t('dialog.commitReview.unreviewed')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">{unreviewedCount}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="p-0!">
            <CardContent className="p-0!">
              <div className="max-h-[min(50vh,320px)] overflow-auto overflow-x-auto">
                <Table className="w-max min-w-full">
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead>{t('dialog.showLogs.date')}</TableHead>
                      <TableHead className="text-center">{t('dialog.commitReview.total')}</TableHead>
                      <TableHead className="text-center">{t('dialog.commitReview.reviewed')}</TableHead>
                      <TableHead className="text-center">{t('dialog.commitReview.unreviewed')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byDate.map(row => (
                      <TableRow key={row.date}>
                        <TableCell className="font-medium" style={{ color: getRowColor(row.ratio) }}>
                          {formatDateDisplay(row.date, i18n.language)}
                        </TableCell>
                        <TableCell className="text-center">{row.total}</TableCell>
                        <TableCell className="text-center text-green-600">{row.reviewed}</TableCell>
                        <TableCell className="text-center text-amber-600">{row.unreviewed}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
