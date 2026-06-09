'use client'
import { type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, type SortingState, useReactTable } from '@tanstack/react-table'
import { t } from 'i18next'
import { Check, Columns2, Copy, Folder, FolderOpen, History, ListFilter, Pencil, Plus, RotateCcw, Rows2, SquareMinus, SquarePlus, Trash2, X } from 'lucide-react'
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

const GIT_CHANGES_LOCAL_IGNORE_STORAGE_KEY = 'git-changes-local-ignore-regexes'

function normalizeRepoRootPath(repo: string): string {
  return repo.replace(/\\/g, '/').replace(/\/+$/, '')
}

function readLocalIgnoreRegexMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(GIT_CHANGES_LOCAL_IGNORE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string[]> = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(v) && v.every(x => typeof x === 'string')) out[k] = v as string[]
      }
      return out
    }
  } catch {
    /* ignore */
  }
  return {}
}

function writeLocalIgnorePatternsForRepo(repoKey: string, patterns: string[]): void {
  const map = readLocalIgnoreRegexMap()
  if (patterns.length === 0) delete map[repoKey]
  else map[repoKey] = patterns
  localStorage.setItem(GIT_CHANGES_LOCAL_IGNORE_STORAGE_KEY, JSON.stringify(map))
}

function escapeRegExpSegment(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function basenameFromFilePath(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] ?? filePath
}

function normalizeGitPath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

/** Regex matching only the file name (basename), for local Changes hide list */
function regexForBasenameOnly(filePath: string): string {
  return `^${escapeRegExpSegment(basenameFromFilePath(filePath))}$`
}

/** Parent directory prefix as regex (all files under that folder), repo-relative path */
function regexForParentDirOfFile(filePath: string): string | null {
  const norm = normalizeGitPath(filePath).replace(/\/+$/, '')
  const slash = norm.lastIndexOf('/')
  if (slash <= 0) return null
  return `^${escapeRegExpSegment(norm.slice(0, slash + 1))}`
}

function tryCompileRegex(p: string): RegExp | null {
  try {
    return new RegExp(p)
  } catch {
    return null
  }
}

/** Each pattern is tested against basename and against normalized path (forward slashes). */
function pathMatchesLocalIgnore(filePath: string, patterns: string[]): boolean {
  const norm = normalizeGitPath(filePath)
  const basename = basenameFromFilePath(filePath)
  for (const p of patterns) {
    const re = tryCompileRegex(p)
    if (re && (re.test(basename) || re.test(norm))) return true
  }
  return false
}

/** When the row is a directory: hide everything under this path (not the parent). */
function regexForDirectoryPathItself(filePath: string): string | null {
  const norm = normalizeGitPath(filePath).replace(/\/+$/, '')
  if (!norm) return null
  return `^${escapeRegExpSegment(norm)}/`
}

function pathEntryKindCacheKey(repoKey: string, relativePath: string): string {
  return `${repoKey}\0${relativePath}`
}

function pruneRowSelection(selection: Record<string, boolean>, validIds: Set<string>): Record<string, boolean> {
  const pruned: Record<string, boolean> = {}
  let changed = false
  for (const [id, selected] of Object.entries(selection)) {
    if (selected && validIds.has(id)) {
      pruned[id] = true
    } else if (selected) {
      changed = true
    }
  }
  return changed || Object.keys(pruned).length !== Object.keys(selection).length ? pruned : selection
}

function removePathsFromRowSelection(selection: Record<string, boolean>, pathsToRemove: Set<string>): Record<string, boolean> {
  const next: Record<string, boolean> = {}
  let changed = false
  for (const [id, selected] of Object.entries(selection)) {
    if (selected && !pathsToRemove.has(id)) {
      next[id] = true
    } else if (selected) {
      changed = true
    }
  }
  return changed ? next : selection
}

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
  const repoRootKey = useMemo(
    () => normalizeRepoRootPath((cwd ?? sourceFolder ?? '').trim() || '__none__'),
    [cwd, sourceFolder]
  )
  const [changesIgnorePatterns, setChangesIgnorePatterns] = useState<string[]>([])
  const [changesIgnoreListOpen, setChangesIgnoreListOpen] = useState(false)
  const [localIgnoreCustomInput, setLocalIgnoreCustomInput] = useState('')
  const [editingIgnoreOld, setEditingIgnoreOld] = useState<string | null>(null)
  const [editingIgnoreDraft, setEditingIgnoreDraft] = useState('')
  const [pathEntryKinds, setPathEntryKinds] = useState<Record<string, 'file' | 'directory' | 'missing'>>({})

  useEffect(() => {
    const map = readLocalIgnoreRegexMap()
    setChangesIgnorePatterns(map[repoRootKey] ?? [])
    setPathEntryKinds({})
  }, [repoRootKey])

  useEffect(() => {
    if (changesIgnoreListOpen) {
      setLocalIgnoreCustomInput('')
      setEditingIgnoreOld(null)
      setEditingIgnoreDraft('')
    }
  }, [changesIgnoreListOpen])

  const appendIgnorePatterns = useCallback(
    (additions: string[]) => {
      const clean = additions.filter(Boolean)
      if (clean.length === 0) return
      setChangesIgnorePatterns(prev => {
        const next = [...prev]
        let added = 0
        for (const r of clean) {
          if (!next.includes(r)) {
            next.push(r)
            added++
          }
        }
        if (added > 0) {
          writeLocalIgnorePatternsForRepo(repoRootKey, next)
          queueMicrotask(() => {
            toast.success(t('git.localIgnoreAdded', { count: added }))
            setChangesRowSelection({})
            setChangesAnchorRowIndex(null)
          })
          return next
        }
        queueMicrotask(() => toast.info(t('git.localIgnoreAlreadyPresent')))
        return prev
      })
    },
    [repoRootKey, t]
  )

  const addChangesIgnorePatternsForPaths = useCallback(
    (filePaths: string[]) => {
      appendIgnorePatterns(filePaths.map(regexForBasenameOnly))
    },
    [appendIgnorePatterns]
  )

  const addChangesIgnoreFolderForPaths = useCallback(
    (filePaths: string[], entryKinds: Array<'file' | 'directory' | 'missing'>) => {
      const seen = new Set<string>()
      const additions: string[] = []
      filePaths.forEach((fp, i) => {
        const kind = entryKinds[i] ?? 'file'
        const r = kind === 'directory' ? regexForDirectoryPathItself(fp) : regexForParentDirOfFile(fp)
        if (r && !seen.has(r)) {
          seen.add(r)
          additions.push(r)
        }
      })
      if (additions.length === 0) {
        toast.warning(t('git.localIgnoreNoParentFolder'))
        return
      }
      appendIgnorePatterns(additions)
    },
    [appendIgnorePatterns, t]
  )

  const addCustomLocalIgnorePattern = useCallback(() => {
    const raw = localIgnoreCustomInput.trim()
    if (!raw) {
      toast.warning(t('git.localIgnoreEmptyPattern'))
      return
    }
    if (tryCompileRegex(raw) === null) {
      toast.error(t('git.localIgnoreInvalidRegex'))
      return
    }
    appendIgnorePatterns([raw])
    setLocalIgnoreCustomInput('')
  }, [localIgnoreCustomInput, appendIgnorePatterns, t])

  const removeChangesIgnorePattern = useCallback(
    (pattern: string) => {
      setChangesIgnorePatterns(prev => {
        const next = prev.filter(p => p !== pattern)
        writeLocalIgnorePatternsForRepo(repoRootKey, next)
        return next
      })
    },
    [repoRootKey]
  )

  const updateChangesIgnorePattern = useCallback(
    (fromPattern: string, toRaw: string) => {
      const raw = toRaw.trim()
      if (!raw) {
        toast.warning(t('git.localIgnoreEmptyPattern'))
        return
      }
      if (tryCompileRegex(raw) === null) {
        toast.error(t('git.localIgnoreInvalidRegex'))
        return
      }
      setChangesIgnorePatterns(prev => {
        const idx = prev.indexOf(fromPattern)
        if (idx === -1) return prev
        if (raw === fromPattern) {
          queueMicrotask(() => {
            setEditingIgnoreOld(null)
            setEditingIgnoreDraft('')
          })
          return prev
        }
        if (prev.some(p => p === raw && p !== fromPattern)) {
          queueMicrotask(() => toast.info(t('git.localIgnoreAlreadyPresent')))
          return prev
        }
        const next = prev.map(p => (p === fromPattern ? raw : p))
        writeLocalIgnorePatternsForRepo(repoRootKey, next)
        queueMicrotask(() => {
          toast.success(t('git.localIgnorePatternUpdated'))
          setEditingIgnoreOld(null)
          setEditingIgnoreDraft('')
        })
        return next
      })
    },
    [repoRootKey, t]
  )

  const displayedChangesData = useMemo(
    () => changesData.filter(f => !pathMatchesLocalIgnore(f.filePath, changesIgnorePatterns)),
    [changesData, changesIgnorePatterns]
  )

  useEffect(() => {
    const validIds = new Set(displayedChangesData.map(f => f.filePath))
    setChangesRowSelection(prev => pruneRowSelection(prev, validIds))
  }, [displayedChangesData])

  useEffect(() => {
    const validIds = new Set(stagedData.map(f => f.filePath))
    setStagedRowSelection(prev => pruneRowSelection(prev, validIds))
  }, [stagedData])

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
    const discardedPaths = new Set(discardConfirmPayload)
    try {
      const result = await window.api.git.discardChanges(discardConfirmPayload, cwd || sourceFolder || undefined)
      if (result.status === 'success') {
        logger.success(t('toast.revertSuccess'))
        setChangesRowSelection(prev => removePathsFromRowSelection(prev, discardedPaths))
        setChangesAnchorRowIndex(null)
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

  const handleFilePathDoubleClick = useCallback(
    async (row: any) => {
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
    },
    [cwd]
  )

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
    data: displayedChangesData,
    columns: changesColumns,
    getRowId: row => row.filePath,
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
    getRowId: row => row.filePath,
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
    const localIgnoreMenuI18nKey = (base: 'addToLocalIgnore' | 'addFolderToLocalIgnore', paths: string[]) => {
      const kinds = paths.map(p => pathEntryKinds[pathEntryKindCacheKey(repoRootKey, p)])
      if (kinds.some(k => k === undefined)) return `contextMenu.${base}_unknown`
      const uniq = new Set(kinds)
      if (uniq.size > 1) return `contextMenu.${base}_mixed`
      const k = kinds[0]
      if (k === 'directory') return `contextMenu.${base}_folder`
      if (k === 'file') return `contextMenu.${base}_file`
      return `contextMenu.${base}_unknown`
    }

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
                    const files = displayedChangesData.map(f => f.filePath)
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
                <Button
                  size="sm"
                  variant={buttonVariant}
                  className="h-7 w-7 shrink-0 p-0"
                  type="button"
                  title={t('git.localIgnoreListTitle')}
                  aria-label={t('git.localIgnoreListTitle')}
                  onClick={() => setChangesIgnoreListOpen(true)}
                >
                  <ListFilter className="h-3.5 w-3.5" />
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
                  const selectedRows = row.getIsSelected() && table.getSelectedRowModel().rows.length > 0 ? table.getSelectedRowModel().rows : [row]
                  const filesToActOn: string[] = selectedRows.map((r: any) => r.original.filePath as string)
                  const showDiscardChanges = !isStaged && filesToActOn.length > 0

                  return (
                    <ContextMenu
                      key={row.id}
                      onOpenChange={open => {
                        if (isStaged || !open) return
                        for (const fp of [...new Set(filesToActOn)]) {
                          void window.api.system.get_path_entry_kind({ relativePath: fp, cwd }).then(kind => {
                            setPathEntryKinds(prev => ({ ...prev, [pathEntryKindCacheKey(repoRootKey, fp)]: kind }))
                          })
                        }
                      }}
                    >
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
                        {!isStaged && (
                          <ContextMenuSub>
                            <ContextMenuSubTrigger>{t('contextMenu.hideFromChangesLocal')}</ContextMenuSubTrigger>
                            <ContextMenuSubContent>
                              <ContextMenuItem onClick={() => addChangesIgnorePatternsForPaths(filesToActOn)}>
                                {t(localIgnoreMenuI18nKey('addToLocalIgnore', filesToActOn))}
                                <ContextMenuShortcut>
                                  <ListFilter strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                </ContextMenuShortcut>
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() =>
                                  addChangesIgnoreFolderForPaths(
                                    filesToActOn,
                                    filesToActOn.map(fp => pathEntryKinds[pathEntryKindCacheKey(repoRootKey, fp)] ?? 'file')
                                  )
                                }
                              >
                                {t(localIgnoreMenuI18nKey('addFolderToLocalIgnore', filesToActOn))}
                                <ContextMenuShortcut>
                                  <Folder strokeWidth={1.25} className="ml-3 h-4 w-4" />
                                </ContextMenuShortcut>
                              </ContextMenuItem>
                            </ContextMenuSubContent>
                          </ContextMenuSub>
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
        <Dialog open={changesIgnoreListOpen} onOpenChange={setChangesIgnoreListOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('git.localIgnoreDialogTitle')}</DialogTitle>
              <DialogDescription className="text-left">{t('git.localIgnoreDialogHint')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div className="flex gap-2">
                <Input
                  value={localIgnoreCustomInput}
                  onChange={e => setLocalIgnoreCustomInput(e.target.value)}
                  placeholder={t('git.localIgnoreCustomPlaceholder')}
                  className="font-mono text-xs h-9"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustomLocalIgnorePattern()
                    }
                  }}
                />
                <Button type="button" variant={buttonVariant} className="shrink-0 h-9" onClick={addCustomLocalIgnorePattern}>
                  {t('git.localIgnoreAddCustom')}
                </Button>
              </div>
              <div className="text-sm font-medium">{t('git.localIgnoreListHeading')}</div>
              {changesIgnorePatterns.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('git.localIgnoreListEmpty')}</p>
              ) : (
                <ul className="max-h-64 overflow-y-auto space-y-1 rounded-md border p-2">
                  {changesIgnorePatterns.map(p => (
                    <li key={p} className="flex items-center justify-between gap-2 text-xs font-mono">
                      {editingIgnoreOld === p ? (
                        <>
                          <Input
                            value={editingIgnoreDraft}
                            onChange={e => setEditingIgnoreDraft(e.target.value)}
                            className="h-8 min-w-0 flex-1 font-mono text-xs"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                updateChangesIgnorePattern(p, editingIgnoreDraft)
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault()
                                setEditingIgnoreOld(null)
                                setEditingIgnoreDraft('')
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 shrink-0 p-0"
                            onClick={() => updateChangesIgnorePattern(p, editingIgnoreDraft)}
                            aria-label={t('git.localIgnoreSavePattern')}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 shrink-0 p-0"
                            onClick={() => {
                              setEditingIgnoreOld(null)
                              setEditingIgnoreDraft('')
                            }}
                            aria-label={t('git.localIgnoreCancelEdit')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 break-all" title={p}>
                            {p}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 shrink-0 p-0"
                            onClick={() => {
                              setEditingIgnoreOld(p)
                              setEditingIgnoreDraft(p)
                            }}
                            aria-label={t('git.localIgnoreEditPattern')}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 shrink-0 p-0"
                            onClick={() => {
                              if (editingIgnoreOld === p) {
                                setEditingIgnoreOld(null)
                                setEditingIgnoreDraft('')
                              }
                              removeChangesIgnorePattern(p)
                            }}
                            aria-label={t('git.localIgnoreRemovePattern')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant={buttonVariant} onClick={() => setChangesIgnoreListOpen(false)}>
                {t('git.localIgnoreClose')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
