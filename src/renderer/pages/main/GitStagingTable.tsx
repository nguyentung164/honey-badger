'use client'
import { type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, type SortingState, useReactTable } from '@tanstack/react-table'
import { t } from 'i18next'
import { Columns2, Copy, FolderOpen, History, Pencil, Plus, RotateCcw, Rows2, SquareMinus, SquarePlus } from 'lucide-react'
import { IPC } from 'main/constants'
import { forwardRef, type HTMLProps, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import logger from '@/services/logger'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useConfigurationStore } from '@/stores/useConfigurationStore'

export type GitFile = {
  filePath: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'staged' | 'untracked' | 'conflicted'
  isFile: boolean
  fileType?: string
}

export type FileData = GitFile

interface BuildColumnsParams {
  handleCheckboxChange?: (row: any) => void
  handleFilePathDoubleClick?: (row: any) => void
  showSelectColumn?: boolean
}

export function buildColumns({ handleCheckboxChange, handleFilePathDoubleClick, showSelectColumn = true }: BuildColumnsParams): ColumnDef<FileData>[] {
  const columns: ColumnDef<FileData>[] = []

  if (showSelectColumn && handleCheckboxChange) {
    columns.push({
      id: 'select',
      size: 30,
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
            onChange: () => {
              handleCheckboxChange(row)
            },
          }}
        />
      ),
    })
  }

  columns.push(
    {
      accessorKey: 'filePath',
      minSize: 500,
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
        const fileData = row.original as GitFile
        const statusCode = fileData.status
        const gitStatusMap: Record<string, string> = {
          modified: 'text-blue-600 dark:text-blue-400',
          added: 'text-green-600 dark:text-green-400',
          deleted: 'text-red-600 dark:text-red-400',
          renamed: 'text-purple-600 dark:text-purple-400',
          staged: 'text-green-700 dark:text-green-300',
          untracked: 'text-green-600 dark:text-green-400',
          conflicted: 'text-red-700 dark:text-red-300',
        }
        const className = gitStatusMap[statusCode] || 'text-gray-600'

        return (
          <button
            className={cn('flex items-center gap-2 w-full h-full cursor-pointer bg-transparent border-none text-left', className)}
            onDoubleClick={handleFilePathDoubleClick ? () => handleFilePathDoubleClick(row) : undefined}
          >
            <div
              className={cn('w-4 h-4 rounded-sm flex items-center justify-center text-[10px] font-bold', {
                'bg-blue-500 text-white': statusCode === 'modified',
                'bg-green-500 text-white': statusCode === 'added' || statusCode === 'staged' || statusCode === 'untracked',
                'bg-red-500 text-white': statusCode === 'deleted' || statusCode === 'conflicted',
                'bg-purple-500 text-white': statusCode === 'renamed',
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
            {row.getValue('filePath')}
          </button>
        )
      },
    },
    {
      accessorKey: 'status',
      size: 80,
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
        const gitStatus = row.getValue('status') as string
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
            ? 'text-blue-600 dark:text-blue-400'
            : gitStatus === 'added' || gitStatus === 'staged' || gitStatus === 'untracked'
              ? 'text-green-600 dark:text-green-400'
              : gitStatus === 'deleted' || gitStatus === 'conflicted'
                ? 'text-red-600 dark:text-red-400'
                : gitStatus === 'renamed'
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-gray-600 dark:text-gray-400'
        return <div className={className}>{t(statusText)}</div>
      },
    }
  )

  return columns
}

const Table = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement> & { wrapperClassName?: string }>(({ className, wrapperClassName, ...props }, ref) => (
  <div className={cn('relative w-full overflow-auto', wrapperClassName)}>
    <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
  </div>
))
Table.displayName = 'Table'

interface GitStagingTableProps {
  onLoadingChange?: (loading: boolean) => void
  /** When set, all git operations (status, add, reset_staged) use this path instead of config sourceFolder */
  cwd?: string
  /** Label shown above the table when in multi-repo mode (e.g. "Frontend", "Backend") */
  label?: string
}

export const GitStagingTable = forwardRef(({ onLoadingChange, cwd, label }: GitStagingTableProps, ref) => {
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [changesData, setChangesData] = useState<GitFile[]>([])
  const [stagedData, setStagedData] = useState<GitFile[]>([])
  const [isTableLoading, setIsTableLoading] = useState(false)
  const [changesSorting, setChangesSorting] = useState<SortingState>([])
  const [stagedSorting, setStagedSorting] = useState<SortingState>([])
  const [changesRowSelection, setChangesRowSelection] = useState({})
  const [stagedRowSelection, setStagedRowSelection] = useState({})
  const [stagedAnchorRowIndex, setStagedAnchorRowIndex] = useState<number | null>(null)
  const [layoutDirection, setLayoutDirection] = useState<'horizontal' | 'vertical'>(() => {
    const saved = localStorage.getItem('git-dual-table-layout')
    return (saved as 'horizontal' | 'vertical') || 'horizontal'
  })
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const [discardConfirmPayload, setDiscardConfirmPayload] = useState<string[] | null>(null)
  const [changesAnchorRowIndex, setChangesAnchorRowIndex] = useState<number | null>(null)
  const [changesFilter, setChangesFilter] = useState('')
  const [stagedFilter, setStagedFilter] = useState('')
  const { sourceFolder } = useConfigurationStore()
  const lastChangesClickRef = useRef({ time: 0, rowId: '' })
  const lastStagedClickRef = useRef({ time: 0, rowId: '' })

  const loadGitStatus = useCallback(async () => {
    setIsTableLoading(true)
    onLoadingChange?.(true)
    try {
      const result = await window.api.git.status(cwd ? { cwd } : undefined)
      logger.info('Git status result:', result)

      if (!result) {
        toast.error('Git status returned null or undefined')
        return
      }

      const { status, data, message } = result
      if (status === 'error') {
        const isNotRepo = !message || message.toLowerCase().includes('not a git repository')
        if (isNotRepo) {
          toast.warning(t('git.notAGitRepo'))
        }
        return
      }

      // Separate changes and staged files
      const changes: GitFile[] = []
      const staged: GitFile[] = []
      const seenConflictPaths = new Set<string>()

      const isUnmergedPorcelain = (index: string, workingDir: string) => {
        const ix = (index || ' ').trim()
        const wd = (workingDir || ' ').trim()
        return ix === 'U' || wd === 'U' || (ix === 'A' && wd === 'A') || (ix === 'D' && wd === 'D')
      }

      // Use data.files for accurate status information
      // Each file has index (staged) and working_dir (unstaged) status
      if (data?.files && Array.isArray(data.files)) {
        data.files.forEach((file: { path: string; index: string; working_dir: string }) => {
          const fileType = file.path.split('.').pop()?.toLowerCase() || ''

          if (isUnmergedPorcelain(file.index, file.working_dir)) {
            seenConflictPaths.add(file.path)
            changes.push({
              filePath: file.path,
              status: 'conflicted',
              isFile: true,
              fileType,
            })
            return
          }

          // Check if file has staged changes (index status is not empty/space)
          if (file.index && file.index !== ' ' && file.index !== '?') {
            let stagedStatus: GitFile['status'] = 'staged'
            if (file.index === 'M') stagedStatus = 'modified'
            else if (file.index === 'A') stagedStatus = 'added'
            else if (file.index === 'D') stagedStatus = 'deleted'
            else if (file.index === 'R') stagedStatus = 'renamed'

            staged.push({
              filePath: file.path,
              status: stagedStatus,
              isFile: true,
              fileType,
            })
          }

          // Check if file has unstaged changes (working_dir status is not empty/space)
          if (file.working_dir && file.working_dir !== ' ') {
            let changesStatus: GitFile['status'] = 'modified'
            if (file.working_dir === 'M') changesStatus = 'modified'
            else if (file.working_dir === 'A') changesStatus = 'added'
            else if (file.working_dir === 'D') changesStatus = 'deleted'
            else if (file.working_dir === '?') changesStatus = 'untracked'

            changes.push({
              filePath: file.path,
              status: changesStatus,
              isFile: true,
              fileType,
            })
          }
        })
      }

      // Thêm conflict từ API (đã gộp diff-filter); tránh trùng dòng với unmerged trong files
      if (data?.conflicted) {
        data.conflicted.forEach((filePath: string) => {
          if (seenConflictPaths.has(filePath)) return
          seenConflictPaths.add(filePath)
          changes.push({
            filePath,
            status: 'conflicted',
            isFile: true,
            fileType: filePath.split('.').pop()?.toLowerCase() || '',
          })
        })
      }

      setChangesData(changes)
      setStagedData(staged)
      logger.info(`Git status: Found ${changes.length} changes and ${staged.length} staged files`)
      const statusCwd = cwd ?? sourceFolder
      window.dispatchEvent(new CustomEvent('git-status-updated', { detail: { cwd: statusCwd } }))
    } catch (error) {
      logger.error('Error loading git status:', error)
    } finally {
      setIsTableLoading(false)
      onLoadingChange?.(false)
    }
  }, [onLoadingChange, cwd, sourceFolder])

  const reloadData = useCallback(async () => {
    await loadGitStatus()
  }, [loadGitStatus])

  const clearData = useCallback(() => {
    logger.info('Clearing GitStagingTable data...')
    setChangesData([])
    setStagedData([])
    setChangesRowSelection({})
    setStagedRowSelection({})
    setChangesAnchorRowIndex(null)
    setStagedAnchorRowIndex(null)
  }, [])

  useImperativeHandle(ref, () => ({
    reloadData,
    clearData,
    changesTable,
    stagedTable,
    getAllStagedFiles: () => {
      return stagedData
    },
  }))

  // Initial load do MainPage gọi reloadData() 1 lần khi config + git ready. Ở đây chỉ setup keydown.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F5' || (event.ctrlKey && event.key === 'r')) {
        event.preventDefault()
        logger.info('F5 or Ctrl+R pressed, reloading data...')
        reloadData()
        toast.info(t('toast.getListSuccess'))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [reloadData])

  const handleChangesCheckboxChange = useCallback((row: any) => {
    row.toggleSelected()
  }, [])

  const gitAdd = useCallback(
    async (filePath: string | string[]) => {
      try {
        const files = Array.isArray(filePath) ? filePath : [filePath]
        const result = await window.api.git.add(files, cwd ? { cwd } : undefined)
        if (result.status === 'success') {
          logger.success(t('toast.gitAddSuccess'))
          // Clear selection first
          changesTable.toggleAllPageRowsSelected(false)
          setChangesRowSelection({})
          // Reload data to update both lists
          await reloadData()
          logger.info('Git add completed and data reloaded')
        } else {
          toast.error(result.message || t('toast.gitAddError'))
          logger.error(result.message || t('toast.gitAddError'))
        }
      } catch (error) {
        toast.error(t('toast.gitAddError'))
        logger.error('Git add error:', error)
      }
    },
    [reloadData, cwd]
  )

  const gitUnstage = useCallback(
    async (filePath: string | string[]) => {
      try {
        const files = Array.isArray(filePath) ? filePath : [filePath]
        const result = await window.api.git.reset_staged(files, cwd ? { cwd } : undefined)
        if (result.status === 'success') {
          logger.success(t('toast.gitUnstageSuccess'))
          setStagedRowSelection({})
          setStagedAnchorRowIndex(null)
          await reloadData()
          logger.info('Git unstage completed and data reloaded')
        } else {
          toast.error(result.message || t('toast.gitUnstageError'))
        }
      } catch (error) {
        logger.error('Error unstaging Git files:', error)
        toast.error(t('toast.gitUnstageError'))
      }
    },
    [reloadData, cwd]
  )

  const showLog = (filePath: string) => {
    window.api.electron.send(IPC.WINDOW.SHOW_LOG, {
      path: filePath,
      isGit: true,
    })
  }

  const showGitBlame = (filePath: string) => {
    window.api.electron.send(IPC.WINDOW.SHOW_GIT_BLAME, { path: filePath })
  }

  const handleDiscardChangesClick = useCallback((files: string[]) => {
    setDiscardConfirmPayload(files)
    setDiscardConfirmOpen(true)
  }, [])

  const handleDiscardConfirm = useCallback(async () => {
    if (!discardConfirmPayload || discardConfirmPayload.length === 0) return
    try {
      const result = await window.api.git.discardChanges(discardConfirmPayload, cwd || sourceFolder || undefined)
      if (result.status === 'success') {
        logger.success(t('toast.revertSuccess'))
        setChangesRowSelection({})
        await reloadData()
      } else {
        toast.error(result.message || t('toast.revertError'))
      }
    } catch (error) {
      logger.error('Error discarding changes:', error)
      toast.error(t('toast.revertError'))
    }
    setDiscardConfirmPayload(null)
    setDiscardConfirmOpen(false)
  }, [discardConfirmPayload, cwd, sourceFolder, reloadData])

  const revealInFileExplorer = (filePath: string) => {
    window.api.system.reveal_in_file_explorer(filePath)
  }

  const copyFilePath = useCallback(
    async (filePath: string | string[]) => {
      const paths = Array.isArray(filePath) ? filePath : [filePath]
      try {
        await navigator.clipboard.writeText(paths.join('\n'))
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
      const root = (cwd ?? sourceFolder ?? '').replace(/\\/g, '/').replace(/\/$/, '')
      const fullPaths = paths.map(p => (root ? `${root}/${p.replace(/\\/g, '/')}`.replace(/\/+/g, '/') : p))
      try {
        await navigator.clipboard.writeText(fullPaths.join('\n'))
        toast.success(t('toast.copied'))
      } catch {
        toast.error('Failed to copy')
      }
    },
    [cwd, sourceFolder, t]
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

  const handleFilePathDoubleClick = useCallback(async (row: any) => {
    const { filePath, status } = row.original
    try {
      window.api.git.open_diff(filePath, {
        fileStatus: status,
        ...(cwd ? { cwd } : {}),
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(errorMessage)
      toast.error(errorMessage)
    }
  }, [cwd])

  const changesColumns = useMemo(
    () =>
      buildColumns({
        handleCheckboxChange: handleChangesCheckboxChange,
        handleFilePathDoubleClick,
      }),
    [handleChangesCheckboxChange, handleFilePathDoubleClick]
  )

  const stagedColumns = useMemo(
    () =>
      buildColumns({
        handleFilePathDoubleClick,
        showSelectColumn: false,
      }),
    [handleFilePathDoubleClick]
  )

  const changesTable = useReactTable({
    data: changesData,
    columns: changesColumns,
    onSortingChange: setChangesSorting,
    onRowSelectionChange: setChangesRowSelection,
    onGlobalFilterChange: setChangesFilter,
    globalFilterFn: 'includesString',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableSortingRemoval: true,
    state: {
      sorting: changesSorting,
      rowSelection: changesRowSelection,
      globalFilter: changesFilter,
    },
  })

  const stagedTable = useReactTable({
    data: stagedData,
    columns: stagedColumns,
    onSortingChange: setStagedSorting,
    onRowSelectionChange: setStagedRowSelection,
    onGlobalFilterChange: setStagedFilter,
    globalFilterFn: 'includesString',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableSortingRemoval: true,
    state: {
      sorting: stagedSorting,
      rowSelection: stagedRowSelection,
      globalFilter: stagedFilter,
    },
  })

  const handleChangesRowClick = useCallback(
    (event: React.MouseEvent, row: any) => {
      const allRows = changesTable.getRowModel().rows
      const currentRowIndex = allRows.findIndex((r: any) => r.id === row.id)
      const currentTime = Date.now()
      if ((event.target as HTMLElement).tagName === 'INPUT') {
        return
      }
      if (lastChangesClickRef.current.rowId === row.id && currentTime - lastChangesClickRef.current.time < 300) {
        return
      }
      lastChangesClickRef.current = { time: currentTime, rowId: row.id }

      if (event.shiftKey) {
        if (changesAnchorRowIndex !== null) {
          const start = Math.min(changesAnchorRowIndex, currentRowIndex)
          const end = Math.max(changesAnchorRowIndex, currentRowIndex)
          const selectedRowIds: Record<string, boolean> = {}
          for (let i = start; i <= end; i++) {
            selectedRowIds[allRows[i].id] = true
          }
          changesTable.setRowSelection(selectedRowIds)
        } else {
          changesTable.setRowSelection({ [row.id]: true })
          setChangesAnchorRowIndex(currentRowIndex)
        }
      } else if (event.ctrlKey) {
        const currentSelection = { ...changesTable.getState().rowSelection }
        currentSelection[row.id] = !currentSelection[row.id]
        changesTable.setRowSelection(currentSelection)
        setChangesAnchorRowIndex(currentRowIndex)
      } else {
        changesTable.setRowSelection({ [row.id]: true })
        setChangesAnchorRowIndex(currentRowIndex)
      }
    },
    [changesAnchorRowIndex, changesTable]
  )

  const handleStagedRowClick = useCallback(
    (event: React.MouseEvent, row: any) => {
      const allRows = stagedTable.getRowModel().rows
      const currentRowIndex = allRows.findIndex((r: any) => r.id === row.id)
      const currentTime = Date.now()
      if ((event.target as HTMLElement).tagName === 'INPUT') {
        return
      }
      if (lastStagedClickRef.current.rowId === row.id && currentTime - lastStagedClickRef.current.time < 300) {
        return
      }
      lastStagedClickRef.current = { time: currentTime, rowId: row.id }

      if (event.shiftKey) {
        if (stagedAnchorRowIndex !== null) {
          const start = Math.min(stagedAnchorRowIndex, currentRowIndex)
          const end = Math.max(stagedAnchorRowIndex, currentRowIndex)
          const selectedRowIds: Record<string, boolean> = {}
          for (let i = start; i <= end; i++) {
            selectedRowIds[allRows[i].id] = true
          }
          stagedTable.setRowSelection(selectedRowIds)
        } else {
          stagedTable.setRowSelection({ [row.id]: true })
          setStagedAnchorRowIndex(currentRowIndex)
        }
      } else if (event.ctrlKey) {
        const currentSelection = { ...stagedTable.getState().rowSelection }
        currentSelection[row.id] = !currentSelection[row.id]
        stagedTable.setRowSelection(currentSelection)
        setStagedAnchorRowIndex(currentRowIndex)
      } else {
        stagedTable.setRowSelection({ [row.id]: true })
        setStagedAnchorRowIndex(currentRowIndex)
      }
    },
    [stagedAnchorRowIndex, stagedTable]
  )

  const toggleLayout = () => {
    const newDirection = layoutDirection === 'horizontal' ? 'vertical' : 'horizontal'
    setLayoutDirection(newDirection)
    localStorage.setItem('git-dual-table-layout', newDirection)
  }

  const renderTableContent = (table: any, title: string, isStaged: boolean) => {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-2 py-2 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            {!isStaged && (
              <Button
                size="sm"
                variant={buttonVariant}
                className="h-6 w-6 p-0"
                onClick={toggleLayout}
                title={layoutDirection === 'horizontal' ? 'Chuyển sang xếp dọc' : 'Chuyển sang xếp ngang'}
              >
                {layoutDirection === 'horizontal' ? <Rows2 className="h-2.5 w-2.5" /> : <Columns2 className="h-2.5 w-2.5" />}
              </Button>
            )}
            <h3 className="text-sm font-semibold">{title}</h3>
            <Input
              placeholder={t('placeholder.search')}
              value={isStaged ? stagedFilter : changesFilter}
              onChange={e => (isStaged ? setStagedFilter(e.target.value) : setChangesFilter(e.target.value))}
              className="h-7 w-[140px] text-sm"
            />
            <div className="text-xs text-muted-foreground">
              {isStaged
                ? `(${t('message.rowSelected', { 0: table.getFilteredSelectedRowModel().rows.length, 1: table.getFilteredRowModel().rows.length })})`
                : `(${t('message.rowSelected', { 0: table.getFilteredSelectedRowModel().rows.length, 1: table.getFilteredRowModel().rows.length })})`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isStaged && (
              <>
                <Button
                  size="sm"
                  variant={buttonVariant}
                  className="h-7 px-2! text-xs"
                  onClick={() => {
                    const files = changesData.map(f => f.filePath)
                    if (files.length === 0) {
                      toast.warning(t('message.noFilesChanged'))
                      return
                    }
                    gitAdd(files)
                  }}
                  title={t('git.stageAll')}
                >
                  <SquarePlus className="h-3 w-3 mr-1" />
                  {t('git.stageAll')}
                </Button>
                <Button
                  size="sm"
                  variant={buttonVariant}
                  className="h-7 px-2! text-xs"
                  onClick={() => {
                    const selectedRows = changesTable.getSelectedRowModel().rows
                    if (selectedRows.length === 0) {
                      toast.warning(t('message.noFilesWarning'))
                      return
                    }
                    const files = selectedRows.map(row => row.original.filePath)
                    gitAdd(files)
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('git.stageSelected')}
                </Button>
              </>
            )}
            {isStaged && (
              <>
                <Button
                  size="sm"
                  variant={buttonVariant}
                  className="h-7 px-2! text-xs"
                  onClick={() => {
                    const files = stagedData.map(f => f.filePath)
                    if (files.length === 0) {
                      toast.warning(t('git.noStagedFiles'))
                      return
                    }
                    gitUnstage(files)
                  }}
                  title={t('git.unstageAll')}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  {t('git.unstageAll')}
                </Button>
                <Button
                  size="sm"
                  variant={buttonVariant}
                  className="h-7 px-2! text-xs"
                  onClick={() => {
                    const selectedRows = stagedTable.getSelectedRowModel().rows
                    if (selectedRows.length === 0) {
                      toast.warning(t('message.noFilesWarning'))
                      return
                    }
                    const files = selectedRows.map(row => row.original.filePath)
                    gitUnstage(files)
                  }}
                  title={t('git.unstageSelected')}
                >
                  <SquareMinus className="h-3 w-3 mr-1" />
                  {t('git.unstageSelected')}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <Table wrapperClassName="h-full">
            <TableHeader sticky>
              {table.getHeaderGroups().map((headerGroup: any) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header: any) => (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={cn('relative group h-9 px-2', '!text-[var(--table-header-fg)]', header.id === 'select' && 'text-center')}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody className="[&>tr[data-state=selected]]:!bg-primary/15 [&>tr[data-state=selected]]:hover:!bg-primary/10">
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row: any) => {
                  const filePath = row.original.filePath
                  const selectedRows =
                    row.getIsSelected() && table.getSelectedRowModel().rows.length > 0
                      ? table.getSelectedRowModel().rows
                      : [row]
                  const filesToActOn = selectedRows.map((r: any) => r.original.filePath)
                  const showDiscardChanges = !isStaged && filesToActOn.length > 0

                  return (
                    <ContextMenu key={row.id}>
                      <ContextMenuTrigger asChild>
                        <TableRow
                          data-state={row.getIsSelected() ? 'selected' : undefined}
                          onClick={!isStaged ? (e: React.MouseEvent) => handleChangesRowClick(e, row) : (e: React.MouseEvent) => handleStagedRowClick(e, row)}
                          className="cursor-pointer data-[state=selected]:!bg-primary/15 data-[state=selected]:hover:!bg-primary/10"
                        >
                          {row.getVisibleCells().map((cell: any) => (
                            <TableCell key={cell.id} className={cn('p-0 h-6 px-2', cell.column.id === 'select' && 'text-center')}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => revealInFileExplorer(filePath)}>
                          {t('contextMenu.revealInExplorer')}
                          <ContextMenuShortcut>
                            <FolderOpen strokeWidth={1.25} className="ml-3 h-4 w-4" />
                          </ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuItem disabled={row.original.status === 'deleted'} onClick={() => openInExternalEditor(filePath)}>
                          {t('contextMenu.openInExternalEditor')}
                          <ContextMenuShortcut>
                            <Pencil strokeWidth={1.25} className="ml-3 h-4 w-4" />
                          </ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger>{t('contextMenu.copy')}</ContextMenuSubTrigger>
                          <ContextMenuSubContent>
                            <ContextMenuItem onClick={() => copyFilePath(filesToActOn)}>
                              {t('contextMenu.copyPath')}
                              <ContextMenuShortcut>
                                <Copy strokeWidth={1.25} className="ml-3 h-4 w-4" />
                              </ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => copyFileName(filesToActOn)}>
                              {t('contextMenu.copyFileName')}
                              <ContextMenuShortcut>
                                <Copy strokeWidth={1.25} className="ml-3 h-4 w-4" />
                              </ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => copyFullPath(filesToActOn)}>
                              {t('contextMenu.copyFullPath')}
                              <ContextMenuShortcut>
                                <Copy strokeWidth={1.25} className="ml-3 h-4 w-4" />
                              </ContextMenuShortcut>
                            </ContextMenuItem>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator />
                        {!isStaged && (
                          <ContextMenuItem onClick={() => gitAdd(filesToActOn)}>
                            {t('git.stageFile')}
                            <ContextMenuShortcut>
                              <Plus strokeWidth={1.25} className="ml-3 h-4 w-4" />
                            </ContextMenuShortcut>
                          </ContextMenuItem>
                        )}
                        {isStaged && (
                          <ContextMenuItem onClick={() => gitUnstage(filesToActOn)}>
                            {t('git.unstageFile')}
                            <ContextMenuShortcut>
                              <RotateCcw strokeWidth={1.25} className="ml-3 h-4 w-4" />
                            </ContextMenuShortcut>
                          </ContextMenuItem>
                        )}
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => showLog(filePath)}>
                          {t('contextMenu.showLog')}
                          <ContextMenuShortcut>
                            <History strokeWidth={1.25} className="ml-3 h-4 w-4" />
                          </ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => showGitBlame(filePath)}>
                          Git Blame
                          <ContextMenuShortcut>
                            <History strokeWidth={1.25} className="ml-3 h-4 w-4" />
                          </ContextMenuShortcut>
                        </ContextMenuItem>
                        {showDiscardChanges && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem variant="destructive" onClick={() => handleDiscardChangesClick(filesToActOn)}>
                              {t('contextMenu.discardChanges')}
                              <ContextMenuShortcut>
                                <RotateCcw strokeWidth={1.25} className="ml-3 h-4 w-4" />
                              </ContextMenuShortcut>
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                })
              ) : (
                <TableRow className="h-full">
                  <TableCell colSpan={table.getAllColumns().length} className="text-center h-full">
                    <div className="flex flex-col items-center justify-center gap-4 py-8">
                      <p className="text-muted-foreground text-sm">{isStaged ? t('git.noStagedFiles') : t('message.noFilesChanged')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full relative flex flex-col">
      <div className={cn('h-full relative flex-1 min-h-0', label && 'mt-0')}>
        {isTableLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60">
            <GlowLoader className="h-10 w-10" />
          </div>
        )}
        <ResizablePanelGroup direction={layoutDirection} className="h-full">
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className={cn('h-full overflow-hidden', layoutDirection === 'horizontal' ? 'rounded-l-md' : 'rounded-t-md')}>
              {renderTableContent(changesTable, t('git.changes'), false)}
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className={cn('h-full overflow-hidden', layoutDirection === 'horizontal' ? 'rounded-r-md' : 'rounded-b-md')}>
              {renderTableContent(stagedTable, t('git.stagedChanges'), true)}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
        <AlertDialog
          open={discardConfirmOpen}
          onOpenChange={open => {
            setDiscardConfirmOpen(open)
            if (!open) setDiscardConfirmPayload(null)
          }}
        >
          <AlertDialogContent className="min-w-3xl! overflow-x-hidden">
            <AlertDialogHeader className="min-w-0 w-full max-w-full">
              <AlertDialogTitle className="min-w-0 max-w-full break-words">{t('dialog.discardChanges.title')}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="min-w-0 w-full max-w-full overflow-hidden">
                  <p className="min-w-0 break-words">{t('dialog.discardChanges.description')}</p>
                  {discardConfirmPayload && discardConfirmPayload.length > 0 && (
                    <ul className="mt-2 max-h-40 min-w-0 w-full max-w-full overflow-y-auto overflow-x-hidden space-y-1 text-left text-destructive font-medium">
                      {discardConfirmPayload.map(f => (
                        <li key={f} className="min-w-0 max-w-full break-all [overflow-wrap:anywhere]" title={f}>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDiscardConfirm}>
                {t('dialog.discardChanges.action')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
})

const IndeterminateCheckbox = forwardRef<HTMLInputElement, { indeterminate?: boolean } & HTMLProps<HTMLInputElement>>(
  ({ indeterminate = false, className = '', ...rest }, forwardedRef) => {
    const localRef = useRef<HTMLInputElement>(null)
    useImperativeHandle(forwardedRef, () => localRef.current as HTMLInputElement)
    useEffect(() => {
      if (localRef.current) {
        localRef.current.indeterminate = !rest.checked && indeterminate
      }
    }, [indeterminate, rest.checked])
    return <input type="checkbox" ref={localRef} className={`${className} translate-y-[2px] cursor-pointer`} {...rest} />
  }
)
