'use client'
import { type ColumnDef, flexRender, getCoreRowModel, getSortedRowModel, type SortingState, useReactTable } from '@tanstack/react-table'
import { Search } from 'lucide-react'
import type React from 'react'
import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from 'shared/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import logger from '@/services/logger'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { STATUS_TEXT, type SvnStatusCode } from '../../shared/constants'
import { GlowLoader } from '../../ui-elements/GlowLoader'
import { StatusIcon } from '../../ui-elements/StatusIcon'
import toast from '../../ui-elements/Toast'
import { VcsOperationLogDialog } from './VcsOperationLogDialog'

const ScrollableTable = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement> & { wrapperClassName?: string }>(({ className, wrapperClassName, ...props }, ref) => (
  <div className={cn('relative w-full overflow-auto', wrapperClassName)}>
    <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
  </div>
))
ScrollableTable.displayName = 'ScrollableTable'

interface NewRevisionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCurRevisionUpdate: (revision: string) => void
  isManuallyOpened?: boolean
}

interface LogEntry {
  revision: string
  author: string
  date: string
  isoDate: string
  message: string
  referenceId: string
  action: SvnStatusCode[]
  changedFiles: LogFile[]
}

interface LogFile {
  action: SvnStatusCode
  filePath: string
}

type SvnInfo = {
  author: string
  revision: string
  date: string
  curRevision: string
  commitMessage: string
  changedFiles: { status: SvnStatusCode; path: string }[]
}

export function NewRevisionDialog({ open, onOpenChange, onCurRevisionUpdate, isManuallyOpened = false }: NewRevisionDialogProps) {
  const { t, i18n } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [isLoading, setLoading] = useState(false)
  const [isCheckingForUpdate, setCheckingForUpdate] = useState(true)
  const [svnInfo, setSvnInfo] = useState<SvnInfo | null>(null)
  const [hasSvnUpdate, setHasSvnUpdate] = useState(false)

  // New states for log data
  const [allLogData, setAllLogData] = useState<LogEntry[]>([])
  const [selectedRevision, setSelectedRevision] = useState<string | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [changedFiles, setChangedFiles] = useState<LogFile[]>([])
  const [statusSummary, setStatusSummary] = useState<Record<SvnStatusCode, number>>({} as Record<SvnStatusCode, number>)
  const [searchTerm, setSearchTerm] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [showUpdateResultDialog, setShowUpdateResultDialog] = useState(false)
  const [updateResultFiles, setUpdateResultFiles] = useState<{ action: string; path: string }[]>([])
  const [streamingLog, setStreamingLog] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  // Define columns for the table (memoized to prevent useReactTable re-creation on every render)
  const columns: ColumnDef<LogEntry>[] = useMemo(
    () => [
      {
        accessorKey: 'revision',
        size: 30,
        maxSize: 30,
        header: ({ column }) => (
          <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
            {t('dialog.showLogs.revision')}
            <span className="pr-0.5">
              {!column.getIsSorted()}
              {column.getIsSorted() === 'asc' && '↑'}
              {column.getIsSorted() === 'desc' && '↓'}
            </span>
          </Button>
        ),
        cell: ({ row }) => <div>{row.getValue('revision')}</div>,
      },
      {
        accessorKey: 'date',
        size: 30,
        maxSize: 30,
        header: ({ column }) => (
          <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
            {t('dialog.showLogs.date')}
            <span className="pr-0.5">
              {!column.getIsSorted()}
              {column.getIsSorted() === 'asc' && '↑'}
              {column.getIsSorted() === 'desc' && '↓'}
            </span>
          </Button>
        ),
        cell: ({ row }) => <div>{row.getValue('date')}</div>,
      },
      {
        accessorKey: 'author',
        size: 30,
        maxSize: 30,
        header: ({ column }) => (
          <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
            {t('dialog.showLogs.author')}
            <span className="pr-0.5">
              {!column.getIsSorted()}
              {column.getIsSorted() === 'asc' && '↑'}
              {column.getIsSorted() === 'desc' && '↓'}
            </span>
          </Button>
        ),
        cell: ({ row }) => <div>{row.getValue('author')}</div>,
      },
      {
        accessorKey: 'action',
        size: 80,
        header: ({ column }) => (
          <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
            {t('dialog.showLogs.action')}
            <span className="pr-0.5">
              {!column.getIsSorted()}
              {column.getIsSorted() === 'asc' && '↑'}
              {column.getIsSorted() === 'desc' && '↓'}
            </span>
          </Button>
        ),
        cell: ({ row }) => {
          const actions: SvnStatusCode[] = row.getValue('action')
          return (
            <div className="flex gap-1">
              {actions.map((code, index) => (
                <div className="relative group" key={`${code}-${index}`}>
                  <StatusIcon code={code} />
                </div>
              ))}
            </div>
          )
        },
      },
    ],
    [t]
  )

  useEffect(() => {
    if (open) {
      const dontShowRevisionDialog = localStorage.getItem('dont-show-revision-dialog') === 'true'
      if (dontShowRevisionDialog && !isManuallyOpened) {
        onOpenChange(false)
        return
      }

      const checkSvnUpdates = async () => {
        setCheckingForUpdate(true)
        try {
          // First get current revision info
          const { status, data } = await window.api.svn.info('.')
          if (status === 'success') {
            setSvnInfo(data)
            setHasSvnUpdate(true)

            // Then load log data from current revision to HEAD
            await loadLogData(data.curRevision)
          } else if (status === 'no-change') {
            setSvnInfo(data)
            setHasSvnUpdate(false)

            // Still load log data for display
            await loadLogData(data.curRevision)
          }
        } catch (_error) {
          toast.error('Error checking for SVN updates')
        } finally {
          setCheckingForUpdate(false)
        }
      }

      checkSvnUpdates()
    }
  }, [open, onOpenChange, isManuallyOpened])

  // Load log data function
  const loadLogData = async (currentRevision: string) => {
    try {
      const language = i18n.language
      setCommitMessage('')
      setChangedFiles([])
      setStatusSummary({} as Record<SvnStatusCode, number>)
      setAllLogData([])

      // Get log data from current revision to HEAD with specific revision range
      const options = {
        revisionFrom: currentRevision,
        revisionTo: undefined, // Will default to HEAD
      }
      const result = await window.api.svn.log('.', options)
      if (result.status === 'success') {
        const sourceFolderPrefix = result.sourceFolderPrefix
        const rawLog = result.data as string
        const entries = rawLog
          .split('------------------------------------------------------------------------')
          .map(entry => entry.trim())
          .filter(entry => entry)

        const parsedEntries: LogEntry[] = []
        const addedRevisions = new Set<string>()

        for (const entry of entries) {
          const lines = entry
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
          const headerMatch = lines[0]?.match(/^r(\d+)\s+\|\s+(.+?)\s+\|\s+(.+?)\s+\|\s+(\d+)\s+line/)
          if (!headerMatch) continue

          const [, revisionStr, author, date] = headerMatch

          let i = 1
          if (lines[i]?.startsWith('Changed paths:')) i++
          const changedFiles: LogFile[] = []
          const isSvnStatusCode = (code: string): code is SvnStatusCode => Object.keys(STATUS_TEXT).includes(code)

          while (i < lines.length) {
            const line = lines[i]
            const match = line.match(/^([A-Z?!~])\s+(\/.+)$/)
            if (!match) break
            const [, actionCode, filePath] = match
            if (!isSvnStatusCode(actionCode)) break

            let processedPath = filePath
            if (sourceFolderPrefix) {
              const prefixPattern = new RegExp(`^/?${sourceFolderPrefix}/?`)
              processedPath = filePath.replace(prefixPattern, '')
            }
            changedFiles.push({ action: actionCode, filePath: processedPath })
            i++
          }

          const messageLines = lines.slice(i)
          const fullMessage = messageLines.join('\n').trim()
          const messageFirstLine = fullMessage.split('\n')[0] || ''
          const referenceId = messageFirstLine.trim()

          if (!addedRevisions.has(revisionStr)) {
            const originalDate = new Date(date)
            parsedEntries.push({
              revision: revisionStr,
              author,
              date: formatDateTime(originalDate, language),
              isoDate: originalDate.toISOString(),
              message: fullMessage,
              referenceId: referenceId,
              action: Array.from(new Set(changedFiles.map(f => f.action))),
              changedFiles,
            })
            addedRevisions.add(revisionStr)
          }
        }

        // Sort by revision number (newest first)
        const sortedEntries = parsedEntries.sort((a, b) => parseInt(b.revision, 10) - parseInt(a.revision, 10))
        setAllLogData(sortedEntries)

        // Auto-select the newest revision (HEAD)
        if (sortedEntries.length > 0) {
          selectRevision(sortedEntries[0].revision)
        }
      } else {
        toast.error(result.message)
        setAllLogData([])
      }
    } catch (_error) {
      toast.error('Error loading log data')
      setAllLogData([])
    }
  }

  const calculateStatusSummary = useCallback((changedFiles: LogFile[]) => {
    const summary: Record<SvnStatusCode, number> = {} as Record<SvnStatusCode, number>
    for (const code of Object.keys(STATUS_TEXT)) {
      summary[code as SvnStatusCode] = 0
    }
    for (const file of changedFiles) {
      summary[file.action] = (summary[file.action] || 0) + 1
    }
    return summary
  }, [])

  const selectRevision = useCallback(
    (revision: string) => {
      const entry = allLogData.find(e => e.revision === revision)
      if (entry) {
        setSelectedRevision(revision)
        setCommitMessage(entry.message)
        setChangedFiles(entry.changedFiles)
        setStatusSummary(calculateStatusSummary(entry.changedFiles))
      }
    },
    [allLogData, calculateStatusSummary]
  )

  // Filter data based on search term
  const filteredLogData = useMemo(() => {
    if (!searchTerm.trim()) return allLogData
    const lowerSearchTerm = searchTerm.toLowerCase()
    return allLogData.filter(
      entry =>
        entry.revision.toLowerCase().includes(lowerSearchTerm) ||
        entry.author.toLowerCase().includes(lowerSearchTerm) ||
        entry.message.toLowerCase().includes(lowerSearchTerm) ||
        entry.date.toLowerCase().includes(lowerSearchTerm)
    )
  }, [allLogData, searchTerm])

  // React table setup
  const table = useReactTable({
    data: filteredLogData,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: true,
    state: {
      sorting,
    },
  })

  const handleSvnUpdate = () => {
    logger.info(t('Updating SVN...'))
    setLoading(true)
    setStreamingLog('')
    setIsStreaming(true)
    setUpdateResultFiles([])
    setShowUpdateResultDialog(true)

    const unsubscribe = window.api.svn.onUpdateStream(chunk => {
      setStreamingLog(prev => prev + chunk)
    })

    const targetRevision = selectedRevision || undefined
    window.api.svn
      .update('.', targetRevision)
      .then(result => {
        setIsStreaming(false)
        unsubscribe()
        if (result.status === 'success') {
          if (svnInfo?.revision && typeof onCurRevisionUpdate === 'function') {
            onCurRevisionUpdate(selectedRevision || svnInfo.revision)
          }
          toast.success(t('SVN updated successfully'))
          const data = result.data as { rawOutput?: string; updatedFiles?: { action: string; path: string }[] }
          setUpdateResultFiles(data?.updatedFiles ?? [])
          if (data?.rawOutput) setStreamingLog(prev => prev || data.rawOutput || '')
          setShowUpdateResultDialog(true)
        } else {
          toast.error(result.message)
        }
      })
      .catch((error: Error) => {
        setIsStreaming(false)
        unsubscribe()
        toast.error(error.message || 'Error updating SVN')
      })
      .finally(() => setLoading(false))
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-[70vw]! h-[90vh]! flex flex-col overflow-hidden"
          aria-describedby={t('dialog.updateSvn.title')}
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>{t('dialog.updateSvn.title')}</DialogTitle>
            {!isCheckingForUpdate && hasSvnUpdate && svnInfo && (
              <DialogDescription>{t('dialog.updateSvn.description', { 0: svnInfo.revision, 1: svnInfo.curRevision })}</DialogDescription>
            )}
            {!isCheckingForUpdate && !hasSvnUpdate && svnInfo && <DialogDescription>You are up to date. Current revision is {svnInfo.curRevision}</DialogDescription>}
          </DialogHeader>

          {isCheckingForUpdate ? (
            <div className="flex items-center justify-center h-full">
              <GlowLoader className="w-10 h-10" />
            </div>
          ) : (
            <div className="flex flex-1 min-h-[400px] flex-col overflow-hidden gap-2">
              {/* Top - Revisions Table (3) */}
              <div className="min-h-0 flex-[3] flex flex-col overflow-hidden">
                <div className="flex flex-col h-full min-h-0">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input placeholder={t('dialog.showLogs.placeholderSearch')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8" />
                    </div>
                  </div>
                  <div className="flex flex-col min-h-0 flex-1 border rounded-md overflow-auto">
                    <ScrollArea className="h-full w-full">
                      <ScrollableTable wrapperClassName={cn('overflow-clip', table.getRowModel().rows.length === 0 && 'h-full')}>
                        <TableHeader sticky>
                          {table.getHeaderGroups().map(headerGroup => (
                            <TableRow key={headerGroup.id}>
                              {headerGroup.headers.map((header, index) => (
                                <TableHead
                                  key={header.id}
                                  style={{ width: header.getSize() }}
                                  className={cn('relative group h-9 px-2', '!text-[var(--table-header-fg)]', index === 0 && 'text-center')}
                                >
                                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                </TableHead>
                              ))}
                            </TableRow>
                          ))}
                        </TableHeader>
                        <TableBody className={table.getRowModel().rows.length === 0 ? 'h-full' : ''}>
                          {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map(row => (
                              <TableRow
                                key={row.id}
                                data-state={row.getValue('revision') === selectedRevision && 'selected'}
                                onClick={() => {
                                  selectRevision(row.original.revision)
                                }}
                                className="cursor-pointer data-[state=selected]:bg-blue-100 dark:data-[state=selected]:bg-blue-900"
                              >
                                {row.getVisibleCells().map((cell, index) => {
                                  const isCurrentRevision = row.getValue('revision') === svnInfo?.curRevision
                                  return (
                                    <TableCell
                                      key={cell.id}
                                      className={cn('p-0 h-6 px-2', index === 0 && 'text-center', isCurrentRevision && 'text-blue-700 dark:text-yellow-400')}
                                    >
                                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                  )
                                })}
                              </TableRow>
                            ))
                          ) : (
                            <TableRow className="h-full">
                              <TableCell colSpan={table.getAllColumns().length} className="text-center h-full">
                                <div className="flex flex-col items-center justify-center gap-4 h-full">
                                  <p className="text-muted-foreground">{t('common.noData')}</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </ScrollableTable>
                      <ScrollBar orientation="vertical" />
                      <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                  </div>
                </div>
              </div>

              {/* Middle - Commit Message (3.5) */}
              <div className="min-h-0 flex-[3.5] flex flex-col overflow-hidden">
                <div className="pb-1 pt-2 font-medium text-center shrink-0">
                  {t('dialog.showLogs.commitMessage')} & {t('dialog.showLogs.changedFiles')}
                </div>
                <div className="min-h-0 flex-1 relative">
                  <Textarea
                    className="absolute inset-0 w-full h-full resize-none border-1 cursor-default break-all focus-visible:ring-0 !shadow-none focus-visible:border-color"
                    readOnly={true}
                    value={commitMessage}
                    spellCheck={false}
                  />
                </div>
              </div>

              {/* Bottom - Changed Files (3.5) */}
              <div className="min-h-0 flex-[3.5] flex flex-col overflow-hidden">
                <div className="pb-1 pt-1.5 font-medium flex justify-between items-center shrink-0">
                  <div className="flex gap-2">
                    {Object.entries(statusSummary).map(([code, count]) =>
                      count > 0 ? (
                        <div key={code} className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded">
                          <StatusIcon code={code as SvnStatusCode} />
                          <span>{count}</span>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
                <ScrollArea className="min-h-0 flex-1 border-1 rounded-md overflow-auto">
                  <ScrollableTable wrapperClassName={cn('overflow-clip', changedFiles.length === 0 && 'h-full')}>
                    <TableHeader sticky>
                      <TableRow>
                        <TableHead className="w-24 h-9!">{t('dialog.showLogs.action')}</TableHead>
                        <TableHead className="h-9!">{t('dialog.showLogs.path')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className={changedFiles.length === 0 ? 'h-full' : ''}>
                      {changedFiles.length > 0 ? (
                        changedFiles.map((file, index) => (
                          <TableRow key={index}>
                            <TableCell className="p-0 h-6 px-2">
                              <StatusIcon code={file.action} />
                            </TableCell>
                            <TableCell
                              className="p-0 h-6 px-2 cursor-pointer break-words whitespace-normal"
                              onClick={() => {
                                try {
                                  if (selectedRevision && svnInfo) {
                                    window.api.svn.open_diff(file.filePath, {
                                      fileStatus: file.action,
                                      revision: selectedRevision,
                                      currentRevision: svnInfo.curRevision,
                                    })
                                  } else {
                                    window.api.svn.open_diff(file.filePath)
                                  }
                                } catch (error) {
                                  const errorMessage = error instanceof Error ? error.message : String(error)
                                  toast.error(errorMessage)
                                }
                              }}
                            >
                              {file.filePath}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center py-4">
                            {selectedRevision ? 'No files changed in this revision' : 'Select a revision to view changed files'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </ScrollableTable>
                  <ScrollBar orientation="vertical" />
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>

              {/* Footer with buttons */}
              {(hasSvnUpdate || isManuallyOpened) && !isCheckingForUpdate && (
                <DialogFooter className="mt-4 shrink-0 flex-col items-start sm:flex-row sm:items-center">
                  <div className="flex w-full justify-end space-x-2">
<Button variant={buttonVariant} onClick={() => onOpenChange(false)}>
                    {t('common.cancel')}
                  </Button>
                    {hasSvnUpdate && (
                      <Button
                        className={`relative ${isLoading ? 'border-effect cursor-progress' : ''}`}
                        variant="destructive"
                        disabled={isLoading || selectedRevision === svnInfo?.curRevision}
                        onClick={() => {
                          if (!isLoading) {
                            handleSvnUpdate()
                          }
                        }}
                      >
                        {isLoading ? <GlowLoader /> : null} {t('common.update')}
                      </Button>
                    )}
                  </div>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <VcsOperationLogDialog
        open={showUpdateResultDialog}
        onOpenChange={setShowUpdateResultDialog}
        vcsType="svn"
        updatedFiles={updateResultFiles}
        streamingLog={streamingLog}
        isStreaming={isStreaming}
      />
    </>
  )
}
