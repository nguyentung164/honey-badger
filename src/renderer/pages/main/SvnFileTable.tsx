'use client'
import { type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, type Row, type SortingState, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { t } from 'i18next'
import { VcsOperationLogDialog } from '@/components/dialogs/vcs/VcsOperationLogDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { StatusIcon } from '@/components/ui-elements/StatusIcon'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import logger from '@/services/logger'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import 'ldrs/react/Quantum.css'
import { Copy, File, FileText, Folder, FolderOpen, History, Info, Pencil, Plus, RefreshCw, RotateCcw } from 'lucide-react'
import { IPC } from 'main/constants'
import { forwardRef, type HTMLProps, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { STATUS_COLOR_CLASS_MAP, STATUS_TEXT, type SvnStatusCode } from '../../components/shared/constants'

export type SvnFile = {
  filePath: string
  status: SvnStatusCode
  propStatus: SvnStatusCode
  lockStatus: SvnStatusCode
  historyStatus: SvnStatusCode
  switchedStatus: SvnStatusCode
  lockInfo: SvnStatusCode
  versionStatus: SvnStatusCode
  isFile: boolean
}

export type GitFile = {
  filePath: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'staged' | 'untracked' | 'conflicted'
  isFile: boolean
  fileType?: string
}

export type FileData = SvnFile | GitFile

const ROW_HEIGHT = 24 // Đồng bộ với GitStagingTable (h-6 = 24px)

const IndeterminateCheckbox = memo(
  forwardRef<HTMLInputElement, { indeterminate?: boolean } & HTMLProps<HTMLInputElement>>(({ indeterminate = false, className = '', ...rest }, forwardedRef) => {
    const localRef = useRef<HTMLInputElement>(null)
    useImperativeHandle(forwardedRef, () => localRef.current as HTMLInputElement)
    useEffect(() => {
      if (localRef.current) {
        localRef.current.indeterminate = !rest.checked && indeterminate
      }
    }, [indeterminate, rest.checked])
    return <input type="checkbox" ref={localRef} className={`${className} cursor-pointer`} {...rest} />
  })
)
IndeterminateCheckbox.displayName = 'IndeterminateCheckbox'

export function buildColumns({
  handleCheckboxChange,
  handleFilePathDoubleClick,
}: {
  handleCheckboxChange: (row: any) => void
  handleFilePathDoubleClick?: (row: any) => void
}): ColumnDef<FileData>[] {
  return [
    {
      id: 'select',
      size: 30,
      minSize: 30,
      maxSize: 30,
      header: ({ table }) => (
        <IndeterminateCheckbox
          {...{
            checked: table.getIsAllRowsSelected(),
            indeterminate: table.getIsSomeRowsSelected(),
            onChange: table.getToggleAllRowsSelectedHandler(),
          }}
        />
      ),
      cell: ({ row }) => (
        <IndeterminateCheckbox
          {...{
            checked: row.getIsSelected(),
            disabled: !row.getCanSelect(),
            indeterminate: row.getIsSomeSelected(),
            // onChange: row.getToggleSelectedHandler(),
            onChange: () => {
              handleCheckboxChange(row)
            },
          }}
        />
      ),
    },
    {
      accessorKey: 'filePath',
      minSize: 200,
      meta: { flex: true },
      header: ({ column }) => {
        return (
          <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
            {t('table.filePath')}
            <span className="pr-0.5">
              {!column.getIsSorted()}
              {column.getIsSorted() === 'asc' && '↑'}
              {column.getIsSorted() === 'desc' && '↓'}
            </span>
          </Button>
        )
      },
      cell: ({ row }) => {
        const fileData = row.original as FileData
        const isGitFile =
          'status' in fileData && typeof fileData.status === 'string' && ['modified', 'added', 'deleted', 'renamed', 'staged', 'untracked', 'conflicted'].includes(fileData.status)

        let statusCode: SvnStatusCode | string
        let className: string

        if (isGitFile) {
          // Git file status
          statusCode = (fileData as GitFile).status
          const gitStatusMap: Record<string, string> = {
            modified: 'text-yellow-600',
            added: 'text-green-600',
            deleted: 'text-red-600',
            renamed: 'text-blue-600',
            staged: 'text-green-700',
            untracked: 'text-gray-600',
            conflicted: 'text-red-700',
          }
          className = gitStatusMap[statusCode] || 'text-gray-600'
        } else {
          // SVN file status
          statusCode = (fileData as SvnFile).status || (fileData as SvnFile).versionStatus
          className = STATUS_COLOR_CLASS_MAP[statusCode as SvnStatusCode]
        }

        return (
          <button
            className={cn('flex items-center gap-2 w-full h-full min-w-0 cursor-pointer bg-transparent border-none text-left', className)}
            onDoubleClick={handleFilePathDoubleClick ? () => handleFilePathDoubleClick(row) : undefined}
          >
            {(isGitFile ? !fileData.filePath.endsWith('/') : row.getValue('isFile')) ? (
              isGitFile ? (
                // Git file icon with better visual feedback
                <div
                  className={cn('w-4 h-4 rounded-sm flex items-center justify-center', {
                    'bg-yellow-500 text-white text-xs font-bold': statusCode === 'modified',
                    'bg-green-500 text-white text-xs font-bold': statusCode === 'added' || statusCode === 'staged',
                    'bg-red-500 text-white text-xs font-bold': statusCode === 'deleted' || statusCode === 'conflicted',
                    'bg-blue-500 text-white text-xs font-bold': statusCode === 'renamed',
                    'bg-gray-400 text-white text-xs font-bold': statusCode === 'untracked',
                  })}
                >
                  {statusCode === 'modified' && 'M'}
                  {statusCode === 'added' && 'A'}
                  {statusCode === 'staged' && 'S'}
                  {statusCode === 'deleted' && 'D'}
                  {statusCode === 'renamed' && 'R'}
                  {statusCode === 'untracked' && 'U'}
                  {statusCode === 'conflicted' && 'C'}
                </div>
              ) : (
                <StatusIcon code={statusCode as SvnStatusCode} />
              )
            ) : (
              <Folder fill="#F5A623" color="#F5A623" strokeWidth={1.25} className={cn('w-4 h-4', className)} />
            )}
            <span className="truncate">{row.getValue('filePath')}</span>
          </button>
        )
      },
    },

    {
      accessorKey: 'isFile',
      size: 70,
      minSize: 70,
      maxSize: 70,
      header: ({ column }) => {
        return (
          <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
            {t('table.isFile')}
            <span className="pr-0.5">
              {!column.getIsSorted()}
              {column.getIsSorted() === 'asc' && '↑'}
              {column.getIsSorted() === 'desc' && '↓'}
            </span>
          </Button>
        )
      },
      cell: ({ row }) => {
        const fileData = row.original as FileData
        const isGitFile =
          'status' in fileData && typeof fileData.status === 'string' && ['modified', 'added', 'deleted', 'renamed', 'staged', 'untracked', 'conflicted'].includes(fileData.status)

        if (isGitFile) {
          // For Git files, we assume they are files unless the path ends with '/'
          const isFile = !fileData.filePath.endsWith('/')
          return <div>{isFile ? 'Yes' : 'No'}</div>
        }
        return <div>{row.getValue('isFile') ? 'Yes' : 'No'}</div>
      },
    },

    {
      accessorKey: 'fileType',
      size: 90,
      minSize: 90,
      maxSize: 90,
      header: ({ column }) => {
        return (
          <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
            {t('table.extension')}
            <span className="pr-0.5">
              {!column.getIsSorted()}
              {column.getIsSorted() === 'asc' && '↑'}
              {column.getIsSorted() === 'desc' && '↓'}
            </span>
          </Button>
        )
      },
      cell: ({ row }) => {
        const fileData = row.original as FileData
        const isGitFile =
          'status' in fileData && typeof fileData.status === 'string' && ['modified', 'added', 'deleted', 'renamed', 'staged', 'untracked', 'conflicted'].includes(fileData.status)

        let statusCode: SvnStatusCode | string
        let className: string

        if (isGitFile) {
          // Git file status
          statusCode = (fileData as GitFile).status
          const gitStatusMap: Record<string, string> = {
            modified: 'text-yellow-600',
            added: 'text-green-600',
            deleted: 'text-red-600',
            renamed: 'text-blue-600',
            staged: 'text-green-700',
            untracked: 'text-gray-600',
            conflicted: 'text-red-700',
          }
          className = gitStatusMap[statusCode] || 'text-gray-600'
        } else {
          // SVN file status
          statusCode = (fileData as SvnFile).status || (fileData as SvnFile).versionStatus
          className = STATUS_COLOR_CLASS_MAP[statusCode as SvnStatusCode]
        }

        return <div className={className}>{isGitFile ? (fileData as GitFile).fileType || '' : row.getValue('fileType')}</div>
      },
    },
    {
      accessorKey: 'status',
      size: 80,
      minSize: 80,
      maxSize: 80,
      header: ({ column }) => {
        return (
          <Button className="!p-0 !h-7 !bg-transparent !hover:bg-transparent" variant="ghost" onClick={() => column.toggleSorting()}>
            {t('table.status')}
            <span className="pr-0.5">
              {!column.getIsSorted()}
              {column.getIsSorted() === 'asc' && '↑'}
              {column.getIsSorted() === 'desc' && '↓'}
            </span>
          </Button>
        )
      },
      cell: ({ row }) => {
        const fileData = row.original as FileData
        const isGitFile =
          'status' in fileData && typeof fileData.status === 'string' && ['modified', 'added', 'deleted', 'renamed', 'staged', 'untracked', 'conflicted'].includes(fileData.status)

        if (isGitFile) {
          // Git file status
          const gitStatus = (fileData as GitFile).status
          const gitStatusMap: Record<string, string> = {
            added: 'git.status.added',
            modified: 'git.status.modified',
            deleted: 'git.status.deleted',
            renamed: 'git.status.renamed',
            staged: 'git.status.staged',
            untracked: 'git.status.untracked',
            conflicted: 'git.status.conflicted',
          }
          const statusText = gitStatusMap[gitStatus] || gitStatus
          const className =
            gitStatus === 'modified'
              ? 'text-yellow-600'
              : gitStatus === 'added' || gitStatus === 'staged'
                ? 'text-green-600'
                : gitStatus === 'deleted' || gitStatus === 'conflicted'
                  ? 'text-red-600'
                  : gitStatus === 'renamed'
                    ? 'text-blue-600'
                    : 'text-gray-600'
          return <div className={className}>{t(statusText)}</div>
        }
        // SVN file status
        let statusCode = row.getValue('status') as SvnStatusCode
        if (!statusCode) {
          statusCode = row.getValue('versionStatus') as SvnStatusCode
        }
        const status = STATUS_TEXT[statusCode]
        const className = STATUS_COLOR_CLASS_MAP[statusCode]
        return <div className={className}>{t(status)}</div>
      },
    },
    {
      accessorKey: 'versionStatus',
      size: 80,
      minSize: 80,
      maxSize: 80,
    },
  ]
}

interface SvnFileTableProps {
  targetPath?: string
  versionControlSystem?: 'svn' | 'git' // Giữ lại để backward compatibility
  onLoadingChange?: (loading: boolean) => void
}

export const SvnFileTable = forwardRef(({ targetPath, onLoadingChange }: SvnFileTableProps, ref) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState({})
  const [isTableLoading, setIsTableLoading] = useState(false)
  const [data, setData] = useState<FileData[]>([])
  const hasLoaded = useRef(false)
  const [selectedFiles, setSelectedFiles] = useState<FileData[]>([])
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)
  const [anchorRowIndex, setAnchorRowIndex] = useState<number | null>(null)
  const [confirmDialogProps, setConfirmDialogProps] = useState<{
    title: string
    description: string
    onConfirm: () => void
    actionText?: string
    cancelText?: string
  } | null>(null)
  const [globalFilter, setGlobalFilter] = useState('')
  type StatusSelectKey = 'non-versioned' | 'versioned' | 'added' | 'deleted' | 'modified'
  type TypeSelectKey = 'files' | 'directories'
  const [showSvnUpdateResultDialog, setShowSvnUpdateResultDialog] = useState(false)
  const [svnUpdateResultFiles, setSvnUpdateResultFiles] = useState<{ action: string; path: string }[]>([])
  const [svnStreamingLog, setSvnStreamingLog] = useState('')
  const [svnIsStreaming, setSvnIsStreaming] = useState(false)
  const [showFileInfoDialog, setShowFileInfoDialog] = useState(false)
  const [fileInfoContent, setFileInfoContent] = useState('')
  const [fileInfoPath, setFileInfoPath] = useState('')
  const tableRef = useRef<any>(null)
  const isAutoReloadingRef = useRef(false)

  // Di chuyển hook lên top level
  const { versionControlSystem, sourceFolder } = useConfigurationStore()

  const changedFiles = useCallback(async (): Promise<FileData[]> => {
    logger.info('versionControlSystem', versionControlSystem)
    if (versionControlSystem === 'git') {
      try {
        const result = await window.api.git.status()
        logger.info('Git status result:', result)

        if (!result) {
          toast.error('Git status returned null or undefined')
          return []
        }

        const { status, data } = result
        logger.info('Git status data:', data)
        logger.info('Git status data keys:', data ? Object.keys(data) : 'no data')
        if (status === 'error') {
          return []
        }

        // Convert Git status to FileData format
        const gitFiles: GitFile[] = []

        // Add modified files
        if (data?.modified) {
          logger.info('Modified files:', data.modified)
          data.modified.forEach((filePath: string) => {
            gitFiles.push({
              filePath,
              status: 'modified',
              isFile: true,
              fileType: filePath.split('.').pop()?.toLowerCase() || '',
            })
          })
        }

        // Add added files
        if (data?.created) {
          logger.info('Created files:', data.created)
          data.created.forEach((filePath: string) => {
            gitFiles.push({
              filePath,
              status: 'added',
              isFile: true,
              fileType: filePath.split('.').pop()?.toLowerCase() || '',
            })
          })
        }

        // Add deleted files
        if (data?.deleted) {
          logger.info('Deleted files:', data.deleted)
          data.deleted.forEach((filePath: string) => {
            gitFiles.push({
              filePath,
              status: 'deleted',
              isFile: true,
              fileType: filePath.split('.').pop()?.toLowerCase() || '',
            })
          })
        }

        // Add renamed files
        if (data?.renamed) {
          logger.info('Renamed files:', data.renamed)
          data.renamed.forEach((filePath: string) => {
            gitFiles.push({
              filePath,
              status: 'renamed',
              isFile: true,
              fileType: filePath.split('.').pop()?.toLowerCase() || '',
            })
          })
        }

        // Add untracked files
        if (data?.not_added) {
          logger.info('Untracked files:', data.not_added)
          data.not_added.forEach((filePath: string) => {
            gitFiles.push({
              filePath,
              status: 'untracked',
              isFile: true,
              fileType: filePath.split('.').pop()?.toLowerCase() || '',
            })
          })
        }

        // Add staged files (files that are in staging area)
        if (data?.staged) {
          logger.info('Staged files:', data.staged)
          data.staged.forEach((filePath: string) => {
            gitFiles.push({
              filePath,
              status: 'staged',
              isFile: true,
              fileType: filePath.split('.').pop()?.toLowerCase() || '',
            })
          })
        }

        // Add conflicted files
        if (data?.conflicted) {
          logger.info('Conflicted files:', data.conflicted)
          data.conflicted.forEach((filePath: string) => {
            gitFiles.push({
              filePath,
              status: 'conflicted',
              isFile: true,
              fileType: filePath.split('.').pop()?.toLowerCase() || '',
            })
          })
        }

        logger.info(`Git status: Found ${gitFiles.length} changed files`)
        return gitFiles
      } catch (error) {
        logger.error('Error in git status:', error)
        return []
      }
    }

    // SVN logic
    try {
      const result = await window.api.svn.changed_files(targetPath || '')
      const { status, message, data } = result
      if (status === 'error') {
        toast.error(message)
        return []
      }
      return data as SvnFile[]
    } catch (error) {
      logger.error('Error in svn changed_files:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(`SVN error: ${errorMessage}`)
      return []
    }
  }, [versionControlSystem])

  const reloadData = useCallback(
    async (isAutoReload = false) => {
      setIsTableLoading(true)
      onLoadingChange?.(true)
      try {
        logger.info('Reloading data...', { isAutoReload })
        isAutoReloadingRef.current = isAutoReload
        const result = await changedFiles()
        logger.info(`Reloaded ${result.length} files`)
        setData(result)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        logger.error('Error reloading data:', err)
        // Chỉ hiển thị toast khi không phải auto reload
        if (!isAutoReload) {
          toast.error(errorMessage)
        }
      } finally {
        setIsTableLoading(false)
        onLoadingChange?.(false)
        // Reset flag sau một chút để đảm bảo các lần reload tiếp theo vẫn hiển thị toast nếu cần
        setTimeout(() => {
          isAutoReloadingRef.current = false
        }, 1000)
      }
    },
    [changedFiles, onLoadingChange]
  )

  const clearData = useCallback(() => {
    logger.info('Clearing SvnFileTable data...')
    setData([])
    setRowSelection({})
    setSelectedFiles([])
    setAnchorRowIndex(null)
  }, [])

  useImperativeHandle(ref, () => ({
    reloadData,
    clearData,
    table,
  }))

  useEffect(() => {
    if (!hasLoaded.current) {
      reloadData(false)
      hasLoaded.current = true
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F5' || (event.ctrlKey && event.key === 'r')) {
        event.preventDefault()
        logger.info('F5 or Ctrl+R pressed, reloading data...')
        reloadData(false)
        logger.info(t('toast.getListSuccess'))
        // Clear selection after data is reloaded
        setTimeout(() => {
          if (tableRef.current) {
            tableRef.current.toggleAllPageRowsSelected(false)
          }
        }, 100)
      }
    }

    // Note: configuration-changed event is handled by MainPage which calls reloadData() via ref
    // No need to listen here to avoid duplicate API calls

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [reloadData])

  const getParentDirectory = (filePath: string) => {
    const parts = filePath.split('\\')
    parts.pop()
    const parentDirectory = parts.join('\\')
    return parentDirectory
  }

  const handleCheckboxChange = useCallback(
    (row: any) => {
      const tbl = tableRef.current
      if (!tbl) return
      const { filePath, status } = row.original
      const willBeSelected = !row.getIsSelected()
      const normalizedFolder = filePath.replaceAll('\\', '/')
      const rows = tbl.getRowModel().rows

      if (willBeSelected) {
        if (status === '?') {
          let currentPath = filePath
          while (true) {
            const parentPath = getParentDirectory(currentPath)
            if (!parentPath) break
            const parentStatus = data.find(f => f.filePath === parentPath)?.status ?? null
            if (parentStatus !== '?') break
            const parentRow = rows.find((r: Row<FileData>) => r.original.filePath === parentPath)
            if (parentRow) {
              parentRow.toggleSelected(true)
            }
            currentPath = parentPath
          }
          for (const r of rows) {
            const childPath = r.original.filePath.replaceAll('\\', '/')
            if (childPath.startsWith(`${normalizedFolder}/`)) {
              r.toggleSelected(true)
            }
          }
        } else if (status === '!') {
          for (const r of rows) {
            const childPath = r.original.filePath.replaceAll('\\', '/')
            if (childPath.startsWith(`${normalizedFolder}/`)) {
              r.toggleSelected(true)
            }
          }
        }
      } else {
        for (const r of rows) {
          const childPath = r.original.filePath.replaceAll('\\', '/')
          if (childPath !== normalizedFolder && childPath.startsWith(`${normalizedFolder}/`)) {
            r.toggleSelected(false)
          }
        }
      }

      row.toggleSelected(willBeSelected)
    },
    [data]
  )

  const handleFilePathDoubleClick = useCallback(async (row: any) => {
    const { filePath } = row.original
    try {
      window.api.svn.open_diff(filePath)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(errorMessage)
    }
  }, [])

  const lastClickRef = useRef({ time: 0, rowId: '' })
  const handleRowClick = (event: React.MouseEvent, row: any) => {
    const allRows = table.getRowModel().rows
    const currentRowIndex = allRows.findIndex(r => r.id === row.id)
    const currentTime = Date.now()
    if ((event.target as HTMLElement).tagName === 'INPUT') {
      return
    }
    if (lastClickRef.current.rowId === row.id && currentTime - lastClickRef.current.time < 300) {
      return
    }
    lastClickRef.current = { time: currentTime, rowId: row.id }

    if (event.shiftKey) {
      if (anchorRowIndex !== null) {
        const start = Math.min(anchorRowIndex, currentRowIndex)
        const end = Math.max(anchorRowIndex, currentRowIndex)
        const selectedRowIds: Record<string, boolean> = {}
        for (let i = start; i <= end; i++) {
          selectedRowIds[allRows[i].id] = true
        }
        table.setRowSelection(selectedRowIds)
      } else {
        table.setRowSelection({ [row.id]: true })
        setAnchorRowIndex(currentRowIndex)
      }
    } else if (event.ctrlKey) {
      const currentSelection = { ...table.getState().rowSelection }
      currentSelection[row.id] = !currentSelection[row.id]
      table.setRowSelection(currentSelection)
      setAnchorRowIndex(currentRowIndex)
    } else {
      table.setRowSelection({ [row.id]: true })
      setAnchorRowIndex(currentRowIndex)
    }
    updateSelectedFiles()
  }

  const updateSelectedFiles = () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows
    const files = selectedRows.map(row => row.original)
    setSelectedFiles(files)
  }

  const revealInFileExplorer = (filePath: string) => {
    window.api.system.reveal_in_file_explorer(filePath)
  }

  const copyFilePath = useCallback(
    async (filePath: string | string[]) => {
      const paths = Array.isArray(filePath) ? filePath : [filePath]
      const text = paths.join('\n')
      try {
        await navigator.clipboard.writeText(text)
        toast.success(t('toast.copied'))
      } catch {
        toast.error('Failed to copy')
      }
    },
    [t]
  )

  const copyFileName = useCallback(
    async (filePath: string | string[]) => {
      const paths = Array.isArray(filePath) ? filePath : [filePath]
      const names = paths.map(p => p.replace(/^.*[/\\]/, ''))
      try {
        await navigator.clipboard.writeText(names.join('\n'))
        toast.success(t('toast.copied'))
      } catch {
        toast.error('Failed to copy')
      }
    },
    [t]
  )

  const copyFullPath = useCallback(
    async (filePath: string | string[]) => {
      const paths = Array.isArray(filePath) ? filePath : [filePath]
      const fullPaths = paths.map(p => (sourceFolder ? `${sourceFolder.replace(/\\/g, '/')}/${p.replace(/\\/g, '/')}`.replace(/\/+/g, '/') : p))
      try {
        await navigator.clipboard.writeText(fullPaths.join('\n'))
        toast.success(t('toast.copied'))
      } catch {
        toast.error('Failed to copy')
      }
    },
    [sourceFolder, t]
  )

  const openInExternalEditor = useCallback(async (filePath: string) => {
    try {
      const result = await window.api.system.open_in_external_editor(filePath)
      if (!result?.success) {
        toast.error(result?.error || 'Failed to open in external editor')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open in external editor')
    }
  }, [])

  const showFileInfo = useCallback(async (filePath: string) => {
    try {
      const result = await window.api.svn.info(filePath)
      const { status, message, data } = result
      if (status === 'success') {
        setFileInfoPath(filePath)
        setFileInfoContent(typeof data === 'string' ? data : JSON.stringify(data, null, 2))
        setShowFileInfoDialog(true)
      } else {
        toast.error(message)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to get file info')
    }
  }, [])

  const showLog = useCallback(
    (filePath: string | string[]) => {
      if (versionControlSystem === 'git') {
        // For Git, we can show log for specific files
        window.api.electron.send(IPC.WINDOW.SHOW_LOG, {
          path: Array.isArray(filePath) ? filePath[0] : filePath,
          isGit: true,
        })
      } else {
        // For SVN, use existing logic
        window.api.electron.send(IPC.WINDOW.SHOW_LOG, {
          path: Array.isArray(filePath) ? filePath[0] : filePath,
        })
      }
    },
    [versionControlSystem]
  )

  const showGitBlame = (filePath: string) => {
    window.api.electron.send(IPC.WINDOW.SHOW_GIT_BLAME, { path: filePath })
  }

  const showConfirmationDialog = (title: string, description: string, onConfirm: () => void, actionText?: string, cancelText?: string) => {
    setConfirmDialogProps({
      title,
      description,
      onConfirm,
      actionText: actionText || t('common.confirm'),
      cancelText: cancelText || t('common.cancel'),
    })
    setIsConfirmDialogOpen(true)
  }

  const revertFile = useCallback(
    async (filePath: string | string[]) => {
      if (versionControlSystem === 'git') {
        // Git revert logic
        const files = Array.isArray(filePath) ? filePath : [filePath]
        try {
          const result = await window.api.git.revert(files)
          if (result.status === 'success') {
            toast.success('Files reverted successfully')
            reloadData(false)
          } else {
            toast.error(result.message || 'Failed to revert files')
          }
        } catch (error) {
          logger.error('Error reverting Git files:', error)
          toast.error('Error reverting files')
        }
      } else {
        // SVN revert logic
        const files = Array.isArray(filePath) ? filePath : [filePath]
        const hasUnversionedFiles = files.some(file => {
          const fileData = data.find(d => d.filePath === file) as SvnFile
          return fileData?.status === '?'
        })

        if (hasUnversionedFiles) {
          toast.error('Cannot revert unversioned files')
          return
        }

        showConfirmationDialog(
          t('dialog.revert.title'),
          t('dialog.revert.description'),
          async () => {
            try {
              const result = await window.api.svn.revert(files)
              if (result.status === 'success') {
                toast.success(t('toast.revertSuccess'))
                reloadData(false)
              } else {
                toast.error(result.message || t('toast.revertError'))
              }
            } catch (error) {
              logger.error('Error reverting files:', error)
              toast.error(t('toast.revertError'))
            }
          },
          t('dialog.revert.action'),
          t('common.cancel')
        )
      }
    },
    [versionControlSystem, data, reloadData, showConfirmationDialog, t]
  )

  const updateFile = useCallback(
    async (filePath: string | string[]) => {
      if (versionControlSystem === 'git') {
        // Git doesn't have update, this would be pull
        logger.info('Git pull is available in the title bar')
        return
      }

      const numFiles = Array.isArray(filePath) ? filePath.length : 1
      const fileText = numFiles > 1 ? `${numFiles} ${t('common.files', { count: numFiles }).toLowerCase()}` : `"${typeof filePath === 'string' ? filePath : filePath.join(', ')}"`

      showConfirmationDialog(
        t('dialog.update.title'),
        t('dialog.update.description', { files: fileText }),
        async () => {
          let unsubscribe = () => {}
          try {
            setSvnStreamingLog('')
            setSvnIsStreaming(true)
            setSvnUpdateResultFiles([])
            setShowSvnUpdateResultDialog(true)
            unsubscribe = window.api.svn.onUpdateStream(chunk => setSvnStreamingLog(prev => prev + chunk))
            if (Array.isArray(filePath)) {
              logger.info(t('toast.updatingMultiple', { count: filePath.length }))
            } else {
              logger.info(t('toast.updatingSingle', { file: filePath }))
            }
            const result = await window.api.svn.update(filePath)
            setSvnIsStreaming(false)
            unsubscribe()
            if (result.status === 'success') {
              toast.success(result.message || (Array.isArray(filePath) ? t('toast.updatedMultiple', { count: filePath.length }) : t('toast.updatedSingle', { file: filePath })))
              const data = result.data as { rawOutput?: string; updatedFiles?: { action: string; path: string }[] }
              setSvnUpdateResultFiles(data?.updatedFiles ?? [])
              if (data?.rawOutput) setSvnStreamingLog(prev => prev || data.rawOutput || '')
              setShowSvnUpdateResultDialog(true)
              await reloadData(false)
              if (tableRef.current) tableRef.current.toggleAllPageRowsSelected(false)
            } else {
              toast.error(result.message)
            }
          } catch (error) {
            setSvnIsStreaming(false)
            unsubscribe()
            toast.error(t('toast.updateError', { error: error instanceof Error ? error.message : String(error) }))
          }
        },
        t('common.update')
      )
    },
    [versionControlSystem, t, reloadData, showConfirmationDialog]
  )

  const gitAdd = useCallback(
    async (filePath: string | string[]) => {
      try {
        const files = Array.isArray(filePath) ? filePath : [filePath]
        const result = await window.api.git.add(files)
        if (result.status === 'success') {
          toast.success('Files added to staging area')
          await reloadData(false)
          if (tableRef.current) {
            tableRef.current.toggleAllPageRowsSelected(false)
          }
        } else {
          toast.error(result.message || 'Failed to add files')
        }
      } catch (error) {
        toast.error('Failed to add files')
        logger.error('Git add error:', error)
      }
    },
    [reloadData]
  )

  const gitStage = useCallback(
    async (filePath: string | string[]) => {
      await gitAdd(filePath)
    },
    [gitAdd]
  )

  const gitUnstage = useCallback(
    async (filePath: string | string[]) => {
      try {
        const _files = Array.isArray(filePath) ? filePath : [filePath]
        const result = await window.api.git.reset_staged()
        if (result.status === 'success') {
          toast.success('Files unstaged successfully')
          reloadData(false)
        } else {
          toast.error(result.message || 'Failed to unstage files')
        }
      } catch (error) {
        logger.error('Error unstaging Git files:', error)
        toast.error('Error unstaging files')
      }
    },
    [reloadData]
  )

  const columns = useMemo(() => buildColumns({ handleCheckboxChange, handleFilePathDoubleClick }), [handleCheckboxChange, handleFilePathDoubleClick])

  const getFileStatus = (row: FileData): string => {
    const isGitFile = 'status' in row && typeof row.status === 'string' && ['modified', 'added', 'deleted', 'renamed', 'staged', 'untracked', 'conflicted'].includes(row.status)
    return isGitFile ? (row as GitFile).status : (((row as SvnFile).status || (row as SvnFile).versionStatus) ?? '')
  }

  const getIsFile = (row: FileData): boolean => {
    const isGitFile = 'status' in row && typeof row.status === 'string' && ['modified', 'added', 'deleted', 'renamed', 'staged', 'untracked', 'conflicted'].includes(row.status)
    return isGitFile ? !row.filePath.endsWith('/') : (row as SvnFile).isFile
  }

  const rowMatchesStatus = (row: FileData, key: StatusSelectKey): boolean => {
    const status = getFileStatus(row)
    if (versionControlSystem === 'git') {
      switch (key) {
        case 'non-versioned':
          return status === 'untracked'
        case 'versioned':
          return !['untracked'].includes(status)
        case 'added':
          return ['added', 'staged'].includes(status)
        case 'deleted':
          return status === 'deleted'
        case 'modified':
          return status === 'modified'
        default:
          return false
      }
    }
    switch (key) {
      case 'non-versioned':
        return status === '?'
      case 'versioned':
        return status !== '?' && status !== ''
      case 'added':
        return status === 'A'
      case 'deleted':
        return status === 'D'
      case 'modified':
        return status === 'M'
      default:
        return false
    }
  }

  const rowMatchesType = (row: FileData, key: TypeSelectKey): boolean => {
    const isFile = getIsFile(row)
    return key === 'files' ? isFile : !isFile
  }

  const selectByStatus = useCallback(
    (key: StatusSelectKey) => {
      const tbl = tableRef.current
      if (!tbl) return
      const rows = tbl.getRowModel().rows
      const matchingRows = rows.filter((r: Row<FileData>) => rowMatchesStatus(r.original, key))
      if (matchingRows.length === 0) return
      const newSelection = { ...tbl.getState().rowSelection }
      matchingRows.forEach((r: Row<FileData>) => {
        newSelection[r.id] = true
      })
      tbl.setRowSelection(newSelection)
      setTimeout(updateSelectedFiles, 0)
    },
    [versionControlSystem]
  )

  const selectByType = useCallback((key: TypeSelectKey) => {
    const tbl = tableRef.current
    if (!tbl) return
    const rows = tbl.getRowModel().rows
    const matchingRows = rows.filter((r: Row<FileData>) => rowMatchesType(r.original, key))
    if (matchingRows.length === 0) return
    const newSelection = { ...tbl.getState().rowSelection }
    matchingRows.forEach((r: Row<FileData>) => {
      newSelection[r.id] = true
    })
    tbl.setRowSelection(newSelection)
    setTimeout(updateSelectedFiles, 0)
  }, [])

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onRowSelectionChange: updatedRowSelection => {
      setRowSelection(updatedRowSelection)
      setTimeout(updateSelectedFiles, 0)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableSortingRemoval: true,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    state: {
      sorting,
      rowSelection,
      globalFilter,
      columnVisibility: {
        isFile: false,
        versionStatus: false,
      },
    },
  })

  // Store table reference for use in event handlers
  useEffect(() => {
    tableRef.current = table
  }, [table])

  const rows = table.getRowModel().rows
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })
  const virtualItems = rowVirtualizer.getVirtualItems()

  return (
    <div className="h-full p-2 relative">
      {isTableLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 rounded-md">
          <GlowLoader className="h-10 w-10" />
        </div>
      )}
      <div className="flex flex-col border rounded-md h-full overflow-hidden">
        <div className="flex items-center gap-2 px-2 py-1.5 border-b bg-muted/30 shrink-0">
          <Input placeholder={t('placeholder.search')} value={globalFilter ?? ''} onChange={e => setGlobalFilter(e.target.value)} className="h-7 max-w-[200px] text-sm" />
          <span className="shrink-0 text-sm text-muted-foreground whitespace-nowrap">
            {t('message.rowSelected', {
              0: table.getFilteredSelectedRowModel().rows.length,
              1: table.getFilteredRowModel().rows.length,
            })}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {(
              [
                { key: 'non-versioned' as const, code: '?' as SvnStatusCode, labelKey: 'table.filter.nonVersioned' },
                { key: 'versioned' as const, code: 'X' as SvnStatusCode, labelKey: 'table.filter.versioned' },
                { key: 'added' as const, code: 'A' as SvnStatusCode, labelKey: 'table.filter.added' },
                { key: 'deleted' as const, code: 'D' as SvnStatusCode, labelKey: 'table.filter.deleted' },
                { key: 'modified' as const, code: 'M' as SvnStatusCode, labelKey: 'table.filter.modified' },
              ] as const
            ).map(({ key, code, labelKey }) => (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 min-w-0 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    onClick={() => selectByStatus(key)}
                  >
                    <StatusIcon code={code} className="w-4 h-4" vcsType={versionControlSystem} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t(labelKey)}</TooltipContent>
              </Tooltip>
            ))}
            <div className="w-px h-4 bg-border mx-0.5" />
            {(
              [
                { key: 'files' as const, Icon: File, labelKey: 'table.filter.files' },
                { key: 'directories' as const, Icon: Folder, labelKey: 'table.filter.directories' },
              ] as const
            ).map(({ key, Icon, labelKey }) => (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 min-w-0 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    onClick={() => selectByType(key)}
                  >
                    <Icon strokeWidth={1.5} className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t(labelKey)}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
        <div ref={tableContainerRef} className={cn('flex-1 min-h-0 overflow-auto', rows.length === 0 && 'flex items-center justify-center')}>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm p-4">{t('common.noData')}</p>
          ) : (
            <table className="w-full caption-bottom text-sm table-auto border-collapse" style={{ display: 'grid' }}>
              <TableHeader sticky style={{ display: 'grid' }}>
                {table.getHeaderGroups().map(headerGroup => (
                  <TableRow key={headerGroup.id} className="flex w-full">
                    {headerGroup.headers.map((header, index) => (
                      <TableHead
                        key={header.id}
                        style={
                          (header.column.columnDef.meta as { flex?: boolean })?.flex
                            ? { flex: '1 1 0', minWidth: header.column.columnDef.minSize ?? 200 }
                            : { flex: '0 0 auto', width: header.getSize(), minWidth: header.column.columnDef.minSize }
                        }
                        className={cn(
                          'relative group h-9 px-2 flex items-center',
                          '!text-[var(--table-header-fg)]',
                          index === 0 && 'justify-center text-center',
                          (header.column.columnDef.meta as { flex?: boolean })?.flex ? 'min-w-0' : 'shrink-0'
                        )}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody
                className="relative"
                style={{
                  display: 'grid',
                  height: `${rowVirtualizer.getTotalSize()}px`,
                }}
              >
                {virtualItems.map(virtualRow => {
                  const row = rows[virtualRow.index] as Row<FileData>
                  const isMultipleSelected = selectedFiles.length > 1 && row.getIsSelected()
                  const filePaths = selectedFiles.map(file => file.filePath)
                  const hasUnversionedFiles = selectedFiles.some(file => file.status === '?')

                  return (
                    <ContextMenu key={row.id}>
                      <ContextMenuTrigger asChild>
                        <TableRow
                          data-state={row.getIsSelected() && 'selected'}
                          onClick={e => handleRowClick(e, row)}
                          className="absolute top-0 left-0 w-full flex cursor-pointer data-[state=selected]:!bg-primary/15 data-[state=selected]:hover:!bg-primary/10"
                          style={{
                            transform: `translateY(${virtualRow.start}px)`,
                            height: `${ROW_HEIGHT}px`,
                          }}
                        >
                          {row.getVisibleCells().map((cell, index) => (
                            <TableCell
                              key={cell.id}
                              className={cn(
                                'p-0 h-6 px-2 flex items-center',
                                index === 0 && 'justify-center text-center',
                                cell.column.id === 'filePath' && 'cursor-pointer min-w-0',
                                !(cell.column.columnDef.meta as { flex?: boolean })?.flex && 'shrink-0'
                              )}
                              style={
                                (cell.column.columnDef.meta as { flex?: boolean })?.flex
                                  ? { flex: '1 1 0', minWidth: cell.column.columnDef.minSize ?? 200 }
                                  : { flex: '0 0 auto', width: cell.column.getSize(), minWidth: cell.column.columnDef.minSize }
                              }
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      </ContextMenuTrigger>
                      {!targetPath && (
                        <ContextMenuContent>
                          {isMultipleSelected ? (
                            <>
                              <ContextMenuSub>
                                <ContextMenuSubTrigger>{t('contextMenu.copy')}</ContextMenuSubTrigger>
                                <ContextMenuSubContent>
                                  <ContextMenuItem onClick={() => copyFilePath(filePaths)}>
                                    {t('contextMenu.copyPath')}
                                    <ContextMenuShortcut>
                                      <Copy strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                  <ContextMenuItem onClick={() => copyFileName(filePaths)}>
                                    {t('contextMenu.copyFileName')}
                                    <ContextMenuShortcut>
                                      <Copy strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                  <ContextMenuItem onClick={() => copyFullPath(filePaths)}>
                                    {t('contextMenu.copyFullPath')}
                                    <ContextMenuShortcut>
                                      <Copy strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                </ContextMenuSubContent>
                              </ContextMenuSub>
                              <ContextMenuSeparator />
                              {versionControlSystem === 'git' ? (
                                <>
                                  <ContextMenuItem
                                    onClick={() => gitStage(filePaths)}
                                    disabled={
                                      (filePaths.length > 1 && filePaths.every(f => (data.find(d => d.filePath === f) as GitFile).status === 'staged')) ||
                                      (filePaths.length === 1 && (data.find(d => d.filePath === filePaths[0]) as GitFile).status === 'staged')
                                    }
                                  >
                                    Stage Files
                                    <ContextMenuShortcut>
                                      <Plus strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                  <ContextMenuItem
                                    onClick={() => gitUnstage(filePaths)}
                                    disabled={
                                      (filePaths.length > 1 && filePaths.every(f => (data.find(d => d.filePath === f) as GitFile).status !== 'staged')) ||
                                      (filePaths.length === 1 && (data.find(d => d.filePath === filePaths[0]) as GitFile).status !== 'staged')
                                    }
                                  >
                                    Unstage Files
                                    <ContextMenuShortcut>
                                      <RotateCcw strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                </>
                              ) : (
                                <>
                                  <ContextMenuItem onClick={() => showLog(filePaths)}>
                                    Show Log
                                    <ContextMenuShortcut>
                                      <History strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                  <ContextMenuItem variant="destructive" disabled={hasUnversionedFiles} onClick={() => revertFile(filePaths)}>
                                    Revert Selected Files
                                    <ContextMenuShortcut>
                                      <RotateCcw strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                  <ContextMenuItem onClick={() => updateFile(filePaths)}>
                                    Update Selected Files
                                    <ContextMenuShortcut>
                                      <RefreshCw strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              <ContextMenuItem disabled={row.original.status === '!'} onClick={() => revealInFileExplorer(row.original.filePath)}>
                                {t('contextMenu.revealInExplorer')}
                                <ContextMenuShortcut>
                                  <FolderOpen strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                </ContextMenuShortcut>
                              </ContextMenuItem>
                              <ContextMenuItem
                                disabled={row.original.status === '!' || (versionControlSystem === 'git' && (row.original as GitFile).status === 'deleted')}
                                onClick={() => openInExternalEditor(row.original.filePath)}
                              >
                                {t('contextMenu.openInExternalEditor')}
                                <ContextMenuShortcut>
                                  <Pencil strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                </ContextMenuShortcut>
                              </ContextMenuItem>
                              <ContextMenuSub>
                                <ContextMenuSubTrigger>{t('contextMenu.copy')}</ContextMenuSubTrigger>
                                <ContextMenuSubContent>
                                  <ContextMenuItem onClick={() => copyFilePath(row.original.filePath)}>
                                    {t('contextMenu.copyPath')}
                                    <ContextMenuShortcut>
                                      <Copy strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                  <ContextMenuItem onClick={() => copyFileName(row.original.filePath)}>
                                    {t('contextMenu.copyFileName')}
                                    <ContextMenuShortcut>
                                      <Copy strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                  <ContextMenuItem onClick={() => copyFullPath(row.original.filePath)}>
                                    {t('contextMenu.copyFullPath')}
                                    <ContextMenuShortcut>
                                      <Copy strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                </ContextMenuSubContent>
                              </ContextMenuSub>
                              <ContextMenuSeparator />
                              {versionControlSystem === 'git' ? (
                                <>
                                  <ContextMenuItem onClick={() => gitStage(row.original.filePath)} disabled={(row.original as GitFile).status === 'staged'}>
                                    Stage File
                                    <ContextMenuShortcut>
                                      <Plus strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                  <ContextMenuItem onClick={() => gitUnstage(row.original.filePath)} disabled={(row.original as GitFile).status !== 'staged'}>
                                    Unstage File
                                    <ContextMenuShortcut>
                                      <RotateCcw strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                  <ContextMenuSeparator />
                                  <ContextMenuItem onClick={() => showLog(row.original.filePath)}>
                                    Show Git Log
                                    <ContextMenuShortcut>
                                      <History strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                  <ContextMenuItem onClick={() => showGitBlame(row.original.filePath)}>
                                    Git Blame
                                    <ContextMenuShortcut>
                                      <History strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                  <ContextMenuItem
                                    variant="destructive"
                                    onClick={() => revertFile(row.original.filePath)}
                                    disabled={(row.original as GitFile).status === 'untracked'}
                                  >
                                    Revert Changes
                                    <ContextMenuShortcut>
                                      <RotateCcw strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                </>
                              ) : (
                                <>
                                  <ContextMenuItem onClick={() => showFileInfo(row.original.filePath)}>
                                    {t('contextMenu.fileInfo')}
                                    <ContextMenuShortcut>
                                      <Info strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                  <ContextMenuItem onClick={() => showLog(row.original.filePath)}>
                                    Show Log
                                    <ContextMenuShortcut>
                                      <History strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                  <ContextMenuItem variant="destructive" disabled={row.original.status === '?'} onClick={() => revertFile(row.original.filePath)}>
                                    Revert
                                    <ContextMenuShortcut>
                                      <RotateCcw strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                  <ContextMenuItem onClick={() => updateFile(row.original.filePath)}>
                                    Update
                                    <ContextMenuShortcut>
                                      <RefreshCw strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                    </ContextMenuShortcut>
                                  </ContextMenuItem>
                                </>
                              )}
                            </>
                          )}
                        </ContextMenuContent>
                      )}
                    </ContextMenu>
                  )
                })}
              </TableBody>
            </table>
          )}
        </div>
      </div>
      {confirmDialogProps && (
        <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmDialogProps.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmDialogProps.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsConfirmDialogOpen(false)}>{confirmDialogProps.cancelText}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  confirmDialogProps.onConfirm()
                  setIsConfirmDialogOpen(false)
                }}
              >
                {confirmDialogProps.actionText}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <VcsOperationLogDialog
        open={showSvnUpdateResultDialog}
        onOpenChange={setShowSvnUpdateResultDialog}
        vcsType="svn"
        updatedFiles={svnUpdateResultFiles}
        streamingLog={svnStreamingLog}
        isStreaming={svnIsStreaming}
      />
      <Dialog open={showFileInfoDialog} onOpenChange={setShowFileInfoDialog}>
        <DialogContent className="max-w-4xl! max-h-[85vh]! gap-0 p-0 overflow-hidden">
          <div className="flex flex-col h-full">
            <DialogHeader className="px-6 pt-6 pb-4 border-b bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-base font-semibold truncate" title={fileInfoPath}>
                    {fileInfoPath}
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('contextMenu.fileInfo')}</p>
                </div>
              </div>
            </DialogHeader>
            <ScrollArea>
              <div className="p-4 space-y-1">
                {(() => {
                  const content = fileInfoContent || ''
                  const lines = content.split('\n').filter(Boolean)
                  const isKeyValueFormat = lines.some(l => l.includes(':') && !l.trim().startsWith('{'))
                  const importantKeys = ['Revision', 'URL', 'Repository Root', 'Last Changed Rev', 'Last Changed Author', 'Last Changed Date']

                  if (isKeyValueFormat) {
                    const parsed = lines.map(line => {
                      const colonIdx = line.indexOf(':')
                      if (colonIdx === -1) return { key: line, value: '', important: false }
                      const key = line.slice(0, colonIdx).trim()
                      const value = line.slice(colonIdx + 1).trim()
                      return { key, value, important: importantKeys.some(k => key.includes(k)) }
                    })
                    return parsed.map(({ key, value, important }, i) => (
                      <div
                        key={i}
                        className={cn('flex gap-4 py-2.5 px-3 rounded-md text-sm transition-colors', important ? 'bg-primary/5 dark:bg-primary/10' : 'hover:bg-muted/50')}
                      >
                        <span className="shrink-0 w-40 font-medium text-muted-foreground">{key}</span>
                        <span className="flex-1 min-w-0 break-all font-mono text-[13px] text-foreground">{value || '—'}</span>
                      </div>
                    ))
                  }
                  return <pre className="text-xs whitespace-pre-wrap font-mono p-3 rounded-md bg-muted/30">{content}</pre>
                })()}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})
