'use client'

import { format, subDays } from 'date-fns'
import { enUS, ja, vi } from 'date-fns/locale'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bug,
  CheckCircle,
  Circle,
  Columns3,
  Eye,
  FileDown,
  Headphones,
  ListTodo,
  Loader2,
  MessageCircle,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Square,
  Wrench,
  X,
  XCircle,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { canViewTaskChartTab } from 'shared/mainShellView'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { TablePaginationBar } from '@/components/ui/table-pagination-bar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DateRangePickerPopover } from '@/components/ui-elements/DateRangePickerPopover'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import i18n from '@/lib/i18n'
import { cn, getContrastingColor, hexToRgba } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useTaskToolbarPortalTarget } from '@/pages/main/TaskToolbarPortalContext'
import {
  PR_MANAGER_ACCENT_OUTLINE_BTN,
  PR_MANAGER_ACCENT_OUTLINE_BTN_COMPACT,
  PR_MANAGER_ACCENT_OUTLINE_SURFACE,
  PR_MANAGER_ACCENT_TITLEBAR_SURFACE,
} from '@/pages/prmanager/prManagerButtonStyles'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'
import type { ChartTask } from './chartDataUtils'
import { TaskTableRow, type TaskTableRowTask } from './TaskTableRow'

type TaskFacetCounts = {
  status: Record<string, number>
  priority: Record<string, number>
  type: Record<string, number>
  assignee: Record<string, number>
  project: Record<string, number>
}

const getDateFnsLocale = (language: string) => {
  switch (language) {
    case 'ja':
      return ja
    case 'vi':
      return vi
    case 'en':
      return enUS
    default:
      return enUS
  }
}

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

const TASK_COLUMN_IDS = [
  'type',
  'ticketId',
  'project',
  'title',
  'assigneeUserId',
  'status',
  'priority',
  'progress',
  'planStartDate',
  'planEndDate',
  'actualStartDate',
  'actualEndDate',
] as const

const REQUIRED_COLUMN_IDS = ['type', 'ticketId', 'project', 'title', 'assigneeUserId', 'status', 'priority'] as const
const VISIBLE_COLUMNS_STORAGE_KEY = 'task-management-visible-columns'
const AddOrEditTaskDialog = lazy(() => import('@/components/dialogs/task/AddOrEditTaskDialog').then(m => ({ default: m.AddOrEditTaskDialog })))
const SettingsDialog = lazy(() => import('@/components/dialogs/app/SettingsDialog').then(m => ({ default: m.SettingsDialog })))
const TaskCharts = lazy(() => import('./TaskCharts').then(m => ({ default: m.TaskCharts })))

type TaskStatus = string
type TaskType = string
type TaskPriority = string

interface MasterItem {
  code: string
  name: string
  sort_order?: number
  color?: string
  is_active?: boolean
}

interface Task {
  id: string
  title: string
  description: string
  assigneeUserId: string | null
  status: TaskStatus
  progress: number
  priority: TaskPriority
  type?: TaskType
  source?: string
  ticketId?: string
  project?: string
  projectId?: string
  planStartDate: string
  planEndDate: string
  actualStartDate: string
  actualEndDate: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy?: string
  createdByName?: string
  createdByAvatarUrl?: string | null
  updatedByName?: string
  updatedByAvatarUrl?: string | null
  version?: number
}

interface User {
  id: string
  userCode: string
  name: string
  email: string
  receiveCommitNotification?: boolean
  createdAt: string
}

function SortHeader({
  col,
  label,
  className,
  sortColumn,
  sortDirection,
  onSort,
}: {
  col: keyof Task
  label: string
  className?: string
  sortColumn: keyof Task | null
  sortDirection: 'asc' | 'desc'
  onSort: (col: keyof Task) => void
}) {
  return (
    <TableHead className={cn('!text-[var(--table-header-fg)] cursor-pointer hover:bg-muted/50 select-none text-center', className)} onClick={() => onSort(col)}>
      <div className="flex items-center justify-center gap-1">
        {label}
        {sortColumn === col && (sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
      </div>
    </TableHead>
  )
}

export function TaskManagement({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const user = useTaskAuthStore(s => s.user)
  const verifySession = useTaskAuthStore(s => s.verifySession)
  const showChartTab = Boolean(user && canViewTaskChartTab(user.role))
  const clearSession = useTaskAuthStore(s => s.clearSession)
  const [isAuthChecked, setIsAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState<'tasks' | 'chart'>('tasks')
  const [tableTasks, setTableTasks] = useState<Task[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [facetCounts, setFacetCounts] = useState<TaskFacetCounts | null>(null)
  const [scopeMeta, setScopeMeta] = useState<{ hasUnassignedTask: boolean; assigneeIdsOnTasks: string[] } | null>(null)
  const [chartTasks, setChartTasks] = useState<ChartTask[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  const [listRevision, setListRevision] = useState(0)
  const [projects, setProjects] = useState<{ id: string; name: string; version?: number }[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [statuses, setStatuses] = useState<MasterItem[]>([])
  const [priorities, setPriorities] = useState<MasterItem[]>([])
  const [types, setTypes] = useState<MasterItem[]>([])
  const [sources, setSources] = useState<MasterItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [taskApiOk, setTaskApiOk] = useState<boolean | null>(null)
  const [projectFilter, setProjectFilter] = useState<string[]>([])
  const [showTaskDialog, setShowTaskDialog] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)
  const [editingTaskInDialog, setEditingTaskInDialog] = useState<Task | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [sortColumn, setSortColumn] = useState<keyof Task | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [taskPage, setTaskPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [isImporting, setIsImporting] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const to = new Date()
    return { from: subDays(to, 29), to }
  })
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [statusFilterSearch, setStatusFilterSearch] = useState('')
  const [priorityFilterSearch, setPriorityFilterSearch] = useState('')
  const [typeFilterSearch, setTypeFilterSearch] = useState('')
  const [assigneeFilterSearch, setAssigneeFilterSearch] = useState('')
  const [projectFilterSearch, setProjectFilterSearch] = useState('')
  const [favoriteTaskIds, setFavoriteTaskIds] = useState<Set<string>>(new Set())
  const listManagementRequestIdRef = useRef(0)
  const chartManagementRequestIdRef = useRef(0)
  const chartTasksRef = useRef<ChartTask[]>([])
  chartTasksRef.current = chartTasks
  const lastFacetsFiltersKeyRef = useRef<string | null>(null)
  const { center: taskToolbarPortalTarget, actions: taskToolbarActionsTarget } = useTaskToolbarPortalTarget()
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(VISIBLE_COLUMNS_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        if (Array.isArray(parsed)) {
          const migrated = parsed.map(id => (id === 'deadline' ? 'planEndDate' : id === 'actualCompletionDate' ? 'actualEndDate' : id))
          const valid = migrated.filter(id => TASK_COLUMN_IDS.includes(id as (typeof TASK_COLUMN_IDS)[number]))
          const optionalSelected = valid.filter(id => !REQUIRED_COLUMN_IDS.includes(id as (typeof REQUIRED_COLUMN_IDS)[number]))
          return [...REQUIRED_COLUMN_IDS, ...optionalSelected]
        }
      }
    } catch {
      /* ignore */
    }
    return [...TASK_COLUMN_IDS]
  })

  useEffect(() => {
    try {
      localStorage.setItem(VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumnIds))
    } catch {
      /* ignore */
    }
  }, [visibleColumnIds])

  useEffect(() => {
    if (isImporting) setDatePickerOpen(false)
  }, [isImporting])

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => window.clearTimeout(id)
  }, [searchQuery])

  useEffect(() => {
    setTaskPage(1)
  }, [debouncedSearch, statusFilter, assigneeFilter, typeFilter, priorityFilter, projectFilter, dateRange])

  const toggleColumnVisibility = useCallback((colId: string) => {
    if (REQUIRED_COLUMN_IDS.includes(colId as (typeof REQUIRED_COLUMN_IDS)[number])) return
    setVisibleColumnIds(prev => (prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]))
  }, [])

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  const loadData = useCallback(async () => {
    const check = await window.api.task.checkTaskApi()
    if (!check.ok) {
      setTaskApiOk(false)
      setIsLoading(false)
      return
    }
    setTaskApiOk(true)
    setIsLoading(true)
    try {
      const [usersRes, projectsRes, statusesRes, prioritiesRes, typesRes, sourcesRes, favoritesRes, scopeRes] = await Promise.all([
        window.api.user.getUsers(),
        window.api.task.getProjectsForTaskUi(),
        window.api.master.getMasterStatusesAll(),
        window.api.master.getMasterPrioritiesAll(),
        window.api.master.getMasterTypesAll(),
        window.api.master.getMasterSourcesAll(),
        window.api.task.getFavoriteTaskIds(),
        window.api.task.getManagementScopeMeta(),
      ])
      if (usersRes.status === 'error' && (usersRes.code === 'UNAUTHORIZED' || usersRes.code === 'FORBIDDEN')) {
        toast.error(t('taskManagement.tokenExpired'))
        setTaskApiOk(false)
        setTableTasks([])
        setTotalCount(0)
        setFacetCounts(null)
        setScopeMeta(null)
        setUsers([])
        clearSession()
        return
      }
      if (usersRes.status === 'success' && usersRes.data) {
        setUsers(usersRes.data)
      } else {
        setUsers([])
      }
      if (projectsRes.status === 'success' && projectsRes.data) {
        setProjects(projectsRes.data)
      } else {
        setProjects([])
      }
      if (statusesRes.status === 'success' && statusesRes.data) setStatuses(statusesRes.data)
      else setStatuses([])
      if (prioritiesRes.status === 'success' && prioritiesRes.data) setPriorities(prioritiesRes.data)
      else setPriorities([])
      if (typesRes.status === 'success' && typesRes.data) setTypes(typesRes.data)
      else setTypes([])
      if (sourcesRes.status === 'success' && sourcesRes.data) setSources(sourcesRes.data)
      else setSources([])
      if (favoritesRes.status === 'success' && Array.isArray(favoritesRes.data)) {
        setFavoriteTaskIds(new Set(favoritesRes.data))
      } else {
        setFavoriteTaskIds(new Set())
      }
      if (scopeRes.status === 'success' && scopeRes.data) {
        setScopeMeta(scopeRes.data)
      } else {
        setScopeMeta(null)
      }
      lastFacetsFiltersKeyRef.current = null
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setIsLoading(false)
      window.dispatchEvent(new CustomEvent('task-reminder-stats-refresh'))
    }
  }, [t, clearSession])

  useEffect(() => {
    if (!showChartTab && activeTab === 'chart') setActiveTab('tasks')
  }, [showChartTab, activeTab])

  const openTaskDetailById = useCallback(async (taskId: string) => {
    const res = await window.api.task.getTask(taskId)
    if (res.status === 'success' && res.data) {
      setEditingTaskInDialog(res.data as Task)
      setShowTaskDialog(true)
    } else {
      toast.error(res.message || t('taskManagement.loadTasksFailed'))
    }
  }, [t])

  useEffect(() => {
    let cancelled = false
    verifySession().then(loggedIn => {
      if (!cancelled) {
        setIsAuthChecked(true)
        if (loggedIn) {
          loadData()
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [verifySession, loadData])

  useEffect(() => {
    if (!isAuthChecked) return
    window.api.task.checkTaskApi().then(check => {
      setTaskApiOk(check.ok)
    })
  }, [isAuthChecked])

  useEffect(() => {
    if (user && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => { })
    }
  }, [user])

  useEffect(() => {
    const handler = (_event: unknown, payload: { targetUserId: string; title: string; body: string; type?: string }) => {
      if (payload.type === 'achievement_unlocked' || payload.type === 'rank_up') return
      if (user?.id === payload.targetUserId && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(payload.title, { body: payload.body })
      }
    }
    window.api.on('task:notification', handler)
    return () => window.api.removeListener('task:notification', handler)
  }, [user?.id])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ taskId?: string }>).detail
      const taskId = detail?.taskId
      if (!taskId) return
      void openTaskDetailById(taskId)
    }
    window.addEventListener('open-task-from-reminder', handler as EventListener)
    return () => window.removeEventListener('open-task-from-reminder', handler as EventListener)
  }, [openTaskDetailById])

  useEffect(() => {
    if (embedded || !isAuthChecked) return
    const st = location.state as { openTaskId?: string } | undefined
    const taskId = st?.openTaskId
    if (!taskId) return
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: {} })
    void openTaskDetailById(taskId)
  }, [embedded, isAuthChecked, location.pathname, location.search, location.hash, location.state, navigate, openTaskDetailById])

  const handleCreateTask = async (input: any) => {
    const res = await window.api.task.create(input)
    if (res.status === 'success') {
      toast.success(t('taskManagement.createSuccess'))
      setShowTaskDialog(false)
      loadData()
    } else {
      toast.error(res.message || t('taskManagement.createError'))
    }
  }

  const handleImportCsv = async () => {
    const fileRes = await window.api.task.selectCsvFile()
    if (fileRes.canceled || !fileRes.content) {
      if (!fileRes.canceled && fileRes.error) toast.error(fileRes.error)
      return
    }
    setIsImporting(true)
    try {
      const res = await window.api.task.importRedmineCsv(fileRes.content)
      if (res.status === 'success' && res.created !== undefined) {
        const created = res.created ?? 0
        const updated = res.updated ?? 0
        if (created > 0 || updated > 0) {
          if (created > 0 && updated > 0) {
            toast.success(t('taskManagement.importSuccessWithUpdate', { created, updated }))
          } else if (updated > 0) {
            toast.success(t('taskManagement.importSuccessUpdated', { count: updated }))
          } else {
            toast.success(t('taskManagement.importSuccess', { count: created }))
          }
          await loadData()
        } else {
          const msg = res.errors?.length ? res.errors.join('; ') : t('taskManagement.importError', { message: 'Không import được task nào' })
          toast.error(msg)
        }
      } else {
        const msg = res.errors?.length ? res.errors.join('; ') : res.message || t('taskManagement.importError', { message: 'Unknown' })
        toast.error(t('taskManagement.importError', { message: msg }))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsImporting(false)
    }
  }

  const _handleUpdateStatus = async (id: string, status: TaskStatus) => {
    const res = await window.api.task.updateStatus(id, status)
    if (res.status === 'success') {
      toast.success(t('taskManagement.updateSuccess'))
      loadData()
    } else {
      toast.error(res.message || t('taskManagement.updateError'))
    }
  }

  const _handleUpdateProgress = async (id: string, progress: number) => {
    const res = await window.api.task.updateProgress(id, progress)
    if (res.status === 'success') {
      toast.success(t('taskManagement.updateSuccess'))
      loadData()
    } else {
      toast.error(res.message || t('taskManagement.updateError'))
    }
  }

  const _handleAssign = async (id: string, assigneeUserId: string | null) => {
    const res = await window.api.task.assign(id, assigneeUserId)
    if (res.status === 'success') {
      toast.success(t('taskManagement.updateSuccess'))
      loadData()
    } else {
      toast.error(res.message || t('taskManagement.updateError'))
    }
  }

  const handleUpdateTask = async (id: string, data: Record<string, unknown>): Promise<{ success: boolean }> => {
    const res = await window.api.task.updateTask(id, data)
    if (res.status === 'success') {
      toast.success(t('taskManagement.updateSuccess'))
      loadData()
      return { success: true }
    }
    if ((res as { code?: string }).code === 'VERSION_CONFLICT') {
      toast.error(t('taskManagement.versionConflictError'))
      const freshRes = await window.api.task.getTask(id)
      if (freshRes.status === 'success' && freshRes.data) {
        setEditingTaskInDialog(freshRes.data as Task)
        loadData()
      }
      return { success: false }
    }
    toast.error(res.message || t('taskManagement.updateError'))
    return { success: false }
  }

  const handleDeleteTask = async (id: string, version?: number): Promise<{ success: boolean; closeDialog?: boolean }> => {
    const res = await window.api.task.deleteTask(id, version)
    if (res.status === 'success') {
      toast.success(t('taskManagement.deleteTaskSuccess'))
      setTaskToDelete(null)
      loadData()
      return { success: true }
    }
    if ((res as { code?: string }).code === 'VERSION_CONFLICT') {
      const freshRes = await window.api.task.getTask(id)
      if (freshRes.status === 'success' && freshRes.data) {
        toast.error(t('taskManagement.versionConflictError'))
        if (editingTaskInDialog?.id === id) setEditingTaskInDialog(freshRes.data as Task)
        if (taskToDelete?.id === id) setTaskToDelete(freshRes.data as Task)
        loadData()
        return { success: false }
      }
      toast.error(t('taskManagement.taskDeletedByAnotherUser'))
      setTaskToDelete(null)
      loadData()
      return { success: false, closeDialog: true }
    }
    toast.error(res.message || t('taskManagement.deleteError'))
    return { success: false }
  }

  const handleCopyTask = async (task: Task) => {
    const res = await window.api.task.copyTask(task.id)
    if (res.status === 'success' && res.data) {
      toast.success(t('taskManagement.makeCopySuccess'))
      loadData()
    } else {
      const msg = res.message === 'CANNOT_COPY_REDMINE_TASK' ? t('taskManagement.cannotCopyRedmineTask') : res.message || t('taskManagement.updateError')
      toast.error(msg)
    }
  }

  const handleOpenTaskRow = useCallback((task: TaskTableRowTask) => {
    setEditingTaskInDialog(task as Task)
    setShowTaskDialog(true)
  }, [])

  const handleDeleteTaskRow = useCallback(
    async (task: TaskTableRowTask) => {
      const res = await window.api.task.canEditTask(task.id)
      if (res.status === 'success' && res.data?.canDelete) {
        setTaskToDelete(task as Task)
      } else {
        toast.error(t('taskManagement.taskReadOnlyNoPermission'))
      }
    },
    [t]
  )

  const handleToggleFavorite = async (taskId: string) => {
    const isFav = favoriteTaskIds.has(taskId)
    const res = isFav ? await window.api.task.removeTaskFavorite(taskId) : await window.api.task.addTaskFavorite(taskId)
    if (res.status === 'success') {
      setFavoriteTaskIds(prev => {
        const next = new Set(prev)
        if (isFav) next.delete(taskId)
        else next.add(taskId)
        return next
      })
      setListRevision(r => r + 1)
      toast.success(isFav ? t('taskManagement.unfavoriteSuccess') : t('taskManagement.favoriteSuccess'))
    } else {
      toast.error(res.message || t('taskManagement.updateError'))
    }
  }

  const getAssigneeDisplay = useCallback(
    (assigneeUserId: string | null) => {
      if (!assigneeUserId) return '-'
      const u = users.find(us => us.id === assigneeUserId)
      return u ? u.name : '-'
    },
    [users]
  )

  const taskListFiltersKey = useMemo(
    () =>
      JSON.stringify({
        s: debouncedSearch,
        st: [...statusFilter].sort(),
        as: [...assigneeFilter].sort(),
        ty: [...typeFilter].sort(),
        pr: [...priorityFilter].sort(),
        pj: [...projectFilter].sort(),
        dr:
          dateRange?.from != null
            ? `${format(dateRange.from, 'yyyy-MM-dd')}|${dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : format(dateRange.from, 'yyyy-MM-dd')}`
            : null,
      }),
    [debouncedSearch, statusFilter, assigneeFilter, typeFilter, priorityFilter, projectFilter, dateRange]
  )

  useEffect(() => {
    if (!isAuthChecked || isLoading || taskApiOk !== true) return
    const requestId = ++listManagementRequestIdRef.current
    const includeFacets = lastFacetsFiltersKeyRef.current !== taskListFiltersKey
    void (async () => {
      setListLoading(true)
      try {
        const dateRangeApi =
          dateRange?.from != null
            ? {
                from: format(dateRange.from, 'yyyy-MM-dd'),
                to: dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : format(dateRange.from, 'yyyy-MM-dd'),
              }
            : undefined
        const res = await window.api.task.listForManagement({
          page: taskPage,
          limit: pageSize,
          search: debouncedSearch.trim() || undefined,
          statusCodes: statusFilter.length ? statusFilter : undefined,
          assigneeUserIds: assigneeFilter.length ? assigneeFilter : undefined,
          typeCodes: typeFilter.length ? typeFilter : undefined,
          priorityCodes: priorityFilter.length ? priorityFilter : undefined,
          projectIds: projectFilter.length ? projectFilter : undefined,
          dateRange: dateRangeApi,
          sortColumn,
          sortDirection,
          includeFacets,
        })
        if (requestId !== listManagementRequestIdRef.current) return
        if (res.status === 'error' && (res.code === 'UNAUTHORIZED' || res.code === 'FORBIDDEN')) {
          toast.error(t('taskManagement.tokenExpired'))
          setTaskApiOk(false)
          setTableTasks([])
          setTotalCount(0)
          setFacetCounts(null)
          clearSession()
          return
        }
        if (res.status === 'success' && res.data) {
          setTableTasks(res.data.tasks)
          setTotalCount(res.data.total)
          if (res.data.facets) {
            setFacetCounts(res.data.facets)
            lastFacetsFiltersKeyRef.current = taskListFiltersKey
          }
        } else {
          setTableTasks([])
          setTotalCount(0)
          setFacetCounts(null)
        }
      } catch {
        if (requestId === listManagementRequestIdRef.current) {
          setTableTasks([])
          setTotalCount(0)
          setFacetCounts(null)
        }
      } finally {
        if (requestId === listManagementRequestIdRef.current) setListLoading(false)
      }
    })()
    return () => {
      listManagementRequestIdRef.current += 1
    }
  }, [
    isAuthChecked,
    isLoading,
    taskApiOk,
    taskPage,
    pageSize,
    debouncedSearch,
    statusFilter,
    assigneeFilter,
    typeFilter,
    priorityFilter,
    projectFilter,
    dateRange,
    sortColumn,
    sortDirection,
    listRevision,
    taskListFiltersKey,
    t,
    clearSession,
  ])

  useEffect(() => {
    if (activeTab !== 'chart' || !isAuthChecked || taskApiOk !== true || isLoading) return
    const requestId = ++chartManagementRequestIdRef.current
    const blockChartOverlay = chartTasksRef.current.length === 0
    void (async () => {
      if (blockChartOverlay) setChartLoading(true)
      try {
        const dateRangeApi =
          dateRange?.from != null
            ? {
                from: format(dateRange.from, 'yyyy-MM-dd'),
                to: dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : format(dateRange.from, 'yyyy-MM-dd'),
              }
            : undefined
        const res = await window.api.task.listForManagementCharts({
          search: debouncedSearch.trim() || undefined,
          statusCodes: statusFilter.length ? statusFilter : undefined,
          assigneeUserIds: assigneeFilter.length ? assigneeFilter : undefined,
          typeCodes: typeFilter.length ? typeFilter : undefined,
          priorityCodes: priorityFilter.length ? priorityFilter : undefined,
          projectIds: projectFilter.length ? projectFilter : undefined,
          dateRange: dateRangeApi,
        })
        if (requestId !== chartManagementRequestIdRef.current) return
        if (res.status === 'success' && Array.isArray(res.data)) setChartTasks(res.data as ChartTask[])
        else setChartTasks([])
      } catch {
        if (requestId === chartManagementRequestIdRef.current) setChartTasks([])
      } finally {
        if (requestId === chartManagementRequestIdRef.current && blockChartOverlay) setChartLoading(false)
      }
    })()
    return () => {
      chartManagementRequestIdRef.current += 1
    }
  }, [
    activeTab,
    isAuthChecked,
    taskApiOk,
    isLoading,
    debouncedSearch,
    statusFilter,
    assigneeFilter,
    typeFilter,
    priorityFilter,
    projectFilter,
    dateRange,
  ])

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  useEffect(() => {
    if (taskPage > totalPages) setTaskPage(1)
  }, [taskPage, totalPages])

  useEffect(() => {
    setTaskPage(1)
  }, [pageSize])

  const assigneeOptions = useMemo(() => {
    const userItems = users.map(u => ({ value: u.id, label: `${u.name} (${u.userCode})` }))
    const taskAssignees = scopeMeta?.assigneeIdsOnTasks ?? []
    const extra = taskAssignees.filter(uid => !users.some(u => u.id === uid))
    return [...userItems, ...extra.map(uid => ({ value: uid, label: uid }))]
  }, [users, scopeMeta])
  const assigneeOptionsForFilter = useMemo(() => {
    const hasUnassigned = scopeMeta?.hasUnassignedTask ?? false
    return [...(hasUnassigned ? [{ value: '_empty', label: '-' }] : []), ...assigneeOptions]
  }, [assigneeOptions, scopeMeta])

  const statusCounts = facetCounts?.status ?? {}
  const priorityCounts = facetCounts?.priority ?? {}
  const typeCounts = facetCounts?.type ?? {}
  const assigneeCounts = facetCounts?.assignee ?? {}
  const projectCounts = facetCounts?.project ?? {}

  const handleSortClick = useCallback(
    (col: keyof Task) => {
      if (sortColumn === col) {
        if (sortDirection === 'asc') setSortDirection('desc')
        else {
          setSortColumn(null)
          setSortDirection('asc')
        }
      } else {
        setSortColumn(col)
        setSortDirection('asc')
      }
    },
    [sortColumn, sortDirection]
  )

  const FALLBACK_STATUS: Record<string, string> = {
    new: t('taskManagement.statusNew'),
    in_progress: t('taskManagement.statusInProgress'),
    in_review: t('taskManagement.statusInReview'),
    fixed: t('taskManagement.statusFixed'),
    cancelled: t('taskManagement.statusCancelled'),
    done: t('taskManagement.statusDone'),
    feedback: t('taskManagement.statusFeedback'),
  }
  const FALLBACK_PRIORITY: Record<string, string> = {
    critical: t('taskManagement.priorityCritical'),
    high: t('taskManagement.priorityHigh'),
    medium: t('taskManagement.priorityMedium'),
    low: t('taskManagement.priorityLow'),
  }
  const FALLBACK_TYPE: Record<string, string> = {
    bug: t('taskManagement.typeBug'),
    feature: t('taskManagement.typeFeature'),
    support: t('taskManagement.typeSupport'),
    task: t('taskManagement.typeTask'),
  }
  const fallbackTypeItems = useMemo(
    () => [
      { code: 'bug', name: t('taskManagement.typeBug') },
      { code: 'feature', name: t('taskManagement.typeFeature') },
      { code: 'support', name: t('taskManagement.typeSupport') },
      { code: 'task', name: t('taskManagement.typeTask') },
    ],
    [t],
  )
  const getStatusLabel = (s: TaskStatus) => statuses.find(st => st.code === s)?.name ?? FALLBACK_STATUS[s] ?? s

  const getPriorityLabel = (p: TaskPriority) => priorities.find(pr => pr.code === p)?.name ?? FALLBACK_PRIORITY[p] ?? p

  const getTypeLabel = (ty?: TaskType) => {
    if (!ty) return '-'
    return types.find(tp => tp.code === ty)?.name ?? FALLBACK_TYPE[ty] ?? ty
  }

  const locale = getDateFnsLocale(i18n.language)

  const statusColorMap = useMemo(() => Object.fromEntries(statuses.filter((s): s is typeof s & { color: string } => Boolean(s.color)).map(s => [s.code, s.color])), [statuses])
  const priorityColorMap = useMemo(
    () => Object.fromEntries(priorities.filter((p): p is typeof p & { color: string } => Boolean(p.color)).map(p => [p.code, p.color])),
    [priorities]
  )
  const typeColorMap = useMemo(() => Object.fromEntries(types.filter((t): t is typeof t & { color: string } => Boolean(t.color)).map(t => [t.code, t.color])), [types])

  const getBadgeStyle = (code: string, colorMap: Record<string, string>): React.CSSProperties | undefined => {
    const color = colorMap[code]
    if (!color) return undefined
    return { backgroundColor: color, color: getContrastingColor(color) }
  }

  const getPriorityRowStyle = (p: string, _isDone: boolean): React.CSSProperties | undefined => {
    const color = priorityColorMap[p]
    if (!color) return undefined
    return { backgroundColor: hexToRgba(color, 15) }
  }

  /** Bảng màu priority: Red(urgent) → Orange → Sky(trung tính, nổi bật) → Green(calm) */
  const getPriorityRowClass = (p: TaskPriority, isDone: boolean) => {
    if (priorityColorMap[p]) return isDone ? '' : ' font-medium'
    switch (p) {
      case 'critical':
        return `bg-red-200/10 dark:bg-red-200/5 text-red-800 dark:text-red-300${isDone ? '' : ' font-medium'}`
      case 'high':
        return 'bg-orange-200/10 dark:bg-orange-200/5 text-orange-800 dark:text-orange-300'
      case 'medium':
        return 'bg-sky-200/10 dark:bg-sky-200/5 text-sky-700 dark:text-sky-400'
      case 'low':
        return 'bg-emerald-200/10 dark:bg-emerald-200/5 text-emerald-700 dark:text-emerald-400'
      default:
        return ''
    }
  }

  const TYPE_FILTER_COLOR: Record<string, string> = {
    bug: 'text-amber-700 dark:text-amber-400',
    feature: 'text-violet-700 dark:text-violet-400',
    support: 'text-teal-700 dark:text-teal-400',
    task: 'text-blue-700 dark:text-blue-400',
  }
  const STATUS_FILTER_COLOR: Record<string, string> = {
    new: 'text-sky-700 dark:text-sky-400',
    in_progress: 'text-amber-700 dark:text-amber-400',
    in_review: 'text-fuchsia-700 dark:text-fuchsia-400',
    fixed: 'text-teal-700 dark:text-teal-400',
    feedback: 'text-orange-700 dark:text-orange-400',
    cancelled: 'text-red-700 dark:text-red-400',
    done: 'text-emerald-700 dark:text-emerald-400',
  }
  const PRIORITY_FILTER_COLOR: Record<string, string> = {
    critical: 'text-red-700 dark:text-red-400',
    high: 'text-orange-700 dark:text-orange-400',
    medium: 'text-sky-600 dark:text-sky-400',
    low: 'text-emerald-700 dark:text-emerald-400',
  }

  const getStatusIcon = (s: TaskStatus) => {
    switch (s) {
      case 'new':
        return <Circle className="h-4 w-4 shrink-0" />
      case 'in_progress':
        return <Loader2 className="h-4 w-4 shrink-0" />
      case 'in_review':
        return <Eye className="h-4 w-4 shrink-0" />
      case 'fixed':
        return <Wrench className="h-4 w-4 shrink-0" />
      case 'cancelled':
        return <XCircle className="h-4 w-4 shrink-0" />
      case 'feedback':
        return <MessageCircle className="h-4 w-4 shrink-0" />
      case 'done':
        return <CheckCircle className="h-4 w-4 shrink-0" />
      default:
        return null
    }
  }

  const getStatusBadgeClass = (statusCode: string, isFilterActive?: boolean) => {
    const base = 'flex items-center gap-1.5 px-2 py-1 rounded-md'
    const active = isFilterActive ? 'ring-1 ring-offset-1' : 'hover:opacity-90'
    const colorMap: Record<string, string> = {
      new: 'bg-sky-500/20 text-sky-700 dark:text-sky-400',
      in_progress: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
      in_review: 'bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-400',
      fixed: 'bg-teal-500/20 text-teal-700 dark:text-teal-400',
      feedback: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
      cancelled: 'bg-red-500/20 text-red-700 dark:text-red-400',
      done: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
    }
    const colors = colorMap[statusCode] ?? 'bg-slate-500/15 text-slate-700 dark:text-slate-400'
    const ringMap: Record<string, string> = {
      new: 'ring-sky-500/50',
      in_progress: 'ring-amber-500/50',
      in_review: 'ring-fuchsia-500/50',
      fixed: 'ring-teal-500/50',
      feedback: 'ring-orange-500/50',
      cancelled: 'ring-red-500/50',
      done: 'ring-emerald-500/50',
    }
    const ring = isFilterActive ? (ringMap[statusCode] ?? 'ring-slate-500/50') : ''
    return cn(base, active, colors, ring)
  }

  const getPriorityIcon = (p: TaskPriority) => {
    switch (p) {
      case 'critical':
        return <AlertCircle className="h-4 w-4 shrink-0" />
      case 'high':
        return <ArrowUp className="h-4 w-4 shrink-0" />
      case 'medium':
        return <Minus className="h-4 w-4 shrink-0" />
      case 'low':
        return <ArrowDown className="h-4 w-4 shrink-0" />
      default:
        return null
    }
  }

  const getTypeIcon = (ty: TaskType) => {
    switch (ty) {
      case 'bug':
        return <Bug className="h-4 w-4 shrink-0" />
      case 'feature':
        return <Sparkles className="h-4 w-4 shrink-0" />
      case 'support':
        return <Headphones className="h-4 w-4 shrink-0" />
      case 'task':
        return <ListTodo className="h-4 w-4 shrink-0" />
      default:
        return null
    }
  }

  const getTypeBadgeClass = (typeCode: string, isFilterActive?: boolean) => {
    const base = 'flex items-center gap-1.5 px-2 py-1 rounded-md'
    const active = isFilterActive ? 'ring-1 ring-offset-1' : 'hover:opacity-90'
    const colorMap: Record<string, string> = {
      bug: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
      feature: 'bg-violet-500/20 text-violet-700 dark:text-violet-400',
      support: 'bg-teal-500/20 text-teal-700 dark:text-teal-400',
      task: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
    }
    const colors = colorMap[typeCode] ?? 'bg-slate-500/15 text-slate-700 dark:text-slate-400'
    const ringMap: Record<string, string> = {
      bug: 'ring-amber-500/50',
      feature: 'ring-violet-500/50',
      support: 'ring-teal-500/50',
      task: 'ring-blue-500/50',
    }
    const ring = isFilterActive ? (ringMap[typeCode] ?? 'ring-slate-500/50') : ''
    return cn(base, active, colors, ring)
  }

  const rootHeightClass = embedded ? 'h-full min-h-0 flex-1' : 'h-screen'

  if (!isAuthChecked) {
    return (
      <div className={cn('flex w-full items-center justify-center', rootHeightClass)}>
        <GlowLoader className="w-10 h-10" />
      </div>
    )
  }

  if (!user) {
    return (
      <div
        className={cn('flex w-full flex-col items-center justify-center gap-4 text-center', rootHeightClass)}
        style={
          {
            WebkitAppRegion: 'drag',
            backgroundColor: 'var(--main-bg)',
            color: 'var(--main-fg)',
          } as React.CSSProperties
        }
      >
        <Button variant="ghost" size="sm" onClick={() => handleWindow('close')} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {t('common.close')}
        </Button>
      </div>
    )
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={v => {
        if (isImporting) return
        const n = v as 'tasks' | 'chart'
        if (n === 'chart' && !showChartTab) return
        setActiveTab(n)
      }}
      className={cn('flex flex-col w-full', rootHeightClass)}
    >
      {/* {showReminderMockup && (
        <Suspense fallback={null}>
          <TaskReminderMockup open={showReminderMockup} onOpenChange={setShowReminderMockup} />
        </Suspense>
      )} */}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
        </Suspense>
      )}
      {showTaskDialog && (
        <Suspense fallback={null}>
          <AddOrEditTaskDialog
            open={showTaskDialog}
            onOpenChange={open => {
              setShowTaskDialog(open)
              if (!open) setEditingTaskInDialog(null)
            }}
            users={users}
            projects={projects}
            statuses={statuses}
            priorities={priorities}
            types={types}
            sources={sources}
            task={editingTaskInDialog}
            onRelationsChange={() => setListRevision(r => r + 1)}
            onSubmit={handleCreateTask}
            onUpdate={(id, data) => handleUpdateTask(id, data)}
            onDelete={(id, version) => handleDeleteTask(id, version)}
          />
        </Suspense>
      )}
      <AlertDialog open={taskToDelete !== null} onOpenChange={open => !open && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('taskManagement.deleteTaskConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {taskToDelete && (
                <>
                  {t('taskManagement.deleteTaskConfirmDescription')}
                  <span className="mt-2 block font-medium text-foreground">{taskToDelete.title}</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (taskToDelete) await handleDeleteTask(taskToDelete.id, taskToDelete.version)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {embedded && taskToolbarPortalTarget
        ? createPortal(
            <div
              className="flex items-center gap-2 min-w-0 h-full flex-wrap sm:flex-nowrap sm:justify-start"
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
              {showChartTab ? (
                <TabsList className="h-6! p-0.5 rounded-md shrink-0">
                  <TabsTrigger value="tasks" disabled={isImporting} className="h-5 px-2 text-xs data-[state=active]:shadow-none">
                    {t('taskManagement.tabTasks')}
                  </TabsTrigger>
                  <TabsTrigger value="chart" disabled={isImporting} className="h-5 px-2 text-xs data-[state=active]:shadow-none">
                    {t('taskManagement.tabChart')}
                  </TabsTrigger>
                </TabsList>
              ) : null}
              {(activeTab === 'tasks' || (showChartTab && activeTab === 'chart')) && (
                <DateRangePickerPopover
                  dateRange={dateRange}
                  onDateRangeChange={setDateRange}
                  open={datePickerOpen}
                  onOpenChange={setDatePickerOpen}
                  allTimeLabel={t('taskManagement.chartAllTime')}
                  confirmLabel={t('common.confirm')}
                  disabled={isImporting}
                />
              )}
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={loadData}
                      disabled={isLoading || isImporting}
                      className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted rounded-sm h-[25px] w-[25px]"
                    >
                      <RefreshCw strokeWidth={1.25} absoluteStrokeWidth size={15} className={isLoading || isImporting ? 'animate-spin' : ''} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('common.refresh')}</TooltipContent>
                </Tooltip>
              </div>
            </div>,
            taskToolbarPortalTarget,
          )
        : null}
      {embedded && taskToolbarActionsTarget
        ? createPortal(
            activeTab === 'tasks' ? (
              <div
                className="flex items-center gap-1 shrink-0 h-full"
                style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(PR_MANAGER_ACCENT_OUTLINE_BTN_COMPACT, PR_MANAGER_ACCENT_TITLEBAR_SURFACE)}
                  onClick={() => {
                    if (projects.length === 0) {
                      toast.error(t('taskManagement.createProjectFirst'))
                      return
                    }
                    setEditingTaskInDialog(null)
                    setShowTaskDialog(true)
                  }}
                  disabled={!taskApiOk || isLoading || isImporting}
                >
                  <Plus className="h-3 w-3 shrink-0" />
                  {t('taskManagement.createTask')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(PR_MANAGER_ACCENT_OUTLINE_BTN_COMPACT, PR_MANAGER_ACCENT_TITLEBAR_SURFACE)}
                  onClick={handleImportCsv}
                  disabled={!taskApiOk || isLoading || isImporting}
                >
                  <FileDown className="h-3 w-3 shrink-0" />
                  {t('taskManagement.importFromCsv')}
                </Button>
              </div>
            ) : null,
            taskToolbarActionsTarget,
          )
        : null}

      {/* Toolbar cửa sổ Task riêng (không embedded) */}
      {!embedded && (
        <div
          className="flex items-center justify-between h-8 text-sm select-none shrink-0"
          style={
            {
              WebkitAppRegion: 'drag',
              backgroundColor: 'var(--main-bg)',
              color: 'var(--main-fg)',
            } as CSSProperties
          }
        >
          <div className="flex items-center h-full gap-2">
            <div className="w-10 h-6 flex justify-center pt-1.5 pl-1 shrink-0">
              <img src="logo.png" alt="icon" draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
            </div>
            <TabsList className="h-6! p-0.5 rounded-md shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
              <TabsTrigger value="tasks" disabled={isImporting} className="h-5 px-2 text-xs data-[state=active]:shadow-none">
                {t('taskManagement.tabTasks')}
              </TabsTrigger>
              {showChartTab && (
                <TabsTrigger value="chart" disabled={isImporting} className="h-5 px-2 text-xs data-[state=active]:shadow-none">
                  {t('taskManagement.tabChart')}
                </TabsTrigger>
              )}
            </TabsList>
            {(activeTab === 'tasks' || (showChartTab && activeTab === 'chart')) && (
              <DateRangePickerPopover
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                open={datePickerOpen}
                onOpenChange={setDatePickerOpen}
                allTimeLabel={t('taskManagement.chartAllTime')}
                confirmLabel={t('common.confirm')}
                disabled={isImporting}
              />
            )}
            <div className="flex items-center gap-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={loadData}
                    disabled={isLoading || isImporting}
                    className="shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted rounded-sm h-[25px] w-[25px]"
                  >
                    <RefreshCw strokeWidth={1.25} absoluteStrokeWidth size={15} className={isLoading || isImporting ? 'animate-spin' : ''} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('common.refresh')}</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            {activeTab === 'tasks' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE, 'shrink-0 px-2 text-xs')}
                  onClick={() => {
                    if (projects.length === 0) {
                      toast.error(t('taskManagement.createProjectFirst'))
                      return
                    }
                    setEditingTaskInDialog(null)
                    setShowTaskDialog(true)
                  }}
                  disabled={!taskApiOk || isLoading || isImporting}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  {t('taskManagement.createTask')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE, 'shrink-0 px-2 text-xs')}
                  onClick={handleImportCsv}
                  disabled={!taskApiOk || isLoading || isImporting}
                >
                  <FileDown className="h-3.5 w-3.5 shrink-0" />
                  {t('taskManagement.importFromCsv')}
                </Button>
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
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col p-4 gap-3">
        {taskApiOk === false ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 text-muted-foreground">
            <p>{t('taskManagement.taskApiNotConfigured')}</p>
            <Button variant={buttonVariant} size="sm" onClick={() => setShowSettings(true)}>
              <Settings2 className="mr-2 h-4 w-4" />
              {t('taskManagement.openSettings')}
            </Button>
          </div>
        ) : isLoading || isImporting ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <GlowLoader className="w-10 h-10" />
            <p className="text-sm text-muted-foreground">{isImporting ? t('taskManagement.importingCsv') : null}</p>
          </div>
        ) : (
          <>
            <TabsContent value="tasks" className="flex-1 flex flex-col min-h-0 mt-0">
              <div className="flex items-center justify-between gap-2 shrink-0 mb-2 flex-wrap">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px] max-w-xs h-8">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="task-search-input"
                      placeholder={t('taskManagement.searchPlaceholder')}
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-8 h-8"
                    />
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant={buttonVariant} size="sm" className="h-8 gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        {t('taskManagement.assignee')}
                        {assigneeFilter.length > 0 && <span className="text-muted-foreground">({assigneeFilter.length})</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0" align="start">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder={t('taskManagement.assignee')}
                            value={assigneeFilterSearch}
                            onChange={e => setAssigneeFilterSearch(e.target.value)}
                            className="pl-8 h-8"
                          />
                        </div>
                      </div>
                      <div className="max-h-[240px] overflow-y-auto p-1">
                        {assigneeOptionsForFilter
                          .filter(opt => !assigneeFilterSearch.trim() || opt.label.toLowerCase().includes(assigneeFilterSearch.trim().toLowerCase()))
                          .map(opt => (
                            <label
                              htmlFor={`assignee-filter-${opt.value}`}
                              key={opt.value}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/80 text-sm"
                            >
                              <Checkbox
                                id={`assignee-filter-${opt.value}`}
                                checked={assigneeFilter.includes(opt.value)}
                                onCheckedChange={checked => {
                                  setAssigneeFilter(prev => (checked ? [...prev, opt.value] : prev.filter(c => c !== opt.value)))
                                }}
                              />
                              <span className="flex-1">{opt.label}</span>
                              <span className="text-muted-foreground text-xs">{assigneeCounts[opt.value] ?? 0}</span>
                            </label>
                          ))}
                      </div>
                      {assigneeFilter.length > 0 && (
                        <div className="p-2 border-t">
                          <Button variant="ghost" size="sm" className="w-full h-8 text-xs" onClick={() => setAssigneeFilter([])}>
                            <X className="h-3.5 w-3.5 mr-1" />
                            {t('taskManagement.clearFilters')}
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant={buttonVariant} size="sm" className="h-8 gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        {t('taskManagement.project')}
                        {projectFilter.length > 0 && <span className="text-muted-foreground">({projectFilter.length})</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0" align="start">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder={t('taskManagement.project')}
                            value={projectFilterSearch}
                            onChange={e => setProjectFilterSearch(e.target.value)}
                            className="pl-8 h-8"
                          />
                        </div>
                      </div>
                      <div className="max-h-[240px] overflow-y-auto p-1">
                        {projects
                          .filter(p => !projectFilterSearch.trim() || p.name.toLowerCase().includes(projectFilterSearch.trim().toLowerCase()))
                          .map(p => (
                            <label
                              htmlFor={`project-filter-${p.id}`}
                              key={p.id}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/80 text-sm"
                            >
                              <Checkbox
                                id={`project-filter-${p.id}`}
                                checked={projectFilter.includes(p.id)}
                                onCheckedChange={checked => {
                                  setProjectFilter(prev => (checked ? [...prev, p.id] : prev.filter(c => c !== p.id)))
                                }}
                              />
                              <span className="flex-1">{p.name}</span>
                              <span className="text-muted-foreground text-xs">{projectCounts[p.id] ?? 0}</span>
                            </label>
                          ))}
                      </div>
                      {projectFilter.length > 0 && (
                        <div className="p-2 border-t">
                          <Button variant="ghost" size="sm" className="w-full h-8 text-xs" onClick={() => setProjectFilter([])}>
                            <X className="h-3.5 w-3.5 mr-1" />
                            {t('taskManagement.clearFilters')}
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant={buttonVariant} size="sm" className="h-8 gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        {t('taskManagement.type')}
                        {typeFilter.length > 0 &&
                          (types.length > 0 ? types : fallbackTypeItems)
                            .filter(tp => typeFilter.includes(tp.code))
                            .map(tp => (
                              <span
                                key={tp.code}
                                className={cn(
                                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                                  !typeColorMap[tp.code] && getTypeBadgeClass(tp.code, false)
                                )}
                                style={getBadgeStyle(tp.code, typeColorMap)}
                              >
                                {getTypeIcon(tp.code)}
                                {tp.name}
                              </span>
                            ))}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0" align="start">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder={t('taskManagement.type')} value={typeFilterSearch} onChange={e => setTypeFilterSearch(e.target.value)} className="pl-8 h-8" />
                        </div>
                      </div>
                      <div className="max-h-[240px] overflow-y-auto p-1">
                        {(types.length > 0 ? types : fallbackTypeItems)
                          .filter(tp => !typeFilterSearch.trim() || tp.name.toLowerCase().includes(typeFilterSearch.trim().toLowerCase()))
                          .map(tp => (
                            <label
                              htmlFor={`type-filter-${tp.code}`}
                              key={tp.code}
                              className={cn('flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/80 text-sm text-left justify-start')}
                            >
                              <Checkbox
                                id={`type-filter-${tp.code}`}
                                checked={typeFilter.includes(tp.code)}
                                onCheckedChange={checked => {
                                  setTypeFilter(prev => (checked ? [...prev, tp.code] : prev.filter(c => c !== tp.code)))
                                }}
                              />
                              <span className={cn('flex items-center gap-2 flex-1 [&_svg]:shrink-0', TYPE_FILTER_COLOR[tp.code] ?? 'text-foreground')}>
                                {getTypeIcon(tp.code)}
                                {tp.name}
                              </span>
                              <span className="text-muted-foreground text-xs shrink-0">{typeCounts[tp.code] ?? 0}</span>
                            </label>
                          ))}
                      </div>
                      {typeFilter.length > 0 && (
                        <div className="p-2 border-t">
                          <Button variant="ghost" size="sm" className="w-full h-8 text-xs" onClick={() => setTypeFilter([])}>
                            <X className="h-3.5 w-3.5 mr-1" />
                            {t('taskManagement.clearFilters')}
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant={buttonVariant} size="sm" className="h-8 gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        {t('taskManagement.status')}
                        {statusFilter.length > 0 &&
                          statusFilter.map(code => {
                            const s = (
                              statuses.length > 0
                                ? statuses
                                : [
                                  { code: 'new', name: t('taskManagement.statusNew') },
                                  { code: 'in_progress', name: t('taskManagement.statusInProgress') },
                                  { code: 'in_review', name: t('taskManagement.statusInReview') },
                                  { code: 'fixed', name: t('taskManagement.statusFixed') },
                                  { code: 'feedback', name: t('taskManagement.statusFeedback') },
                                  { code: 'cancelled', name: t('taskManagement.statusCancelled') },
                                  { code: 'done', name: t('taskManagement.statusDone') },
                                ]
                            ).find(st => st.code === code)
                            return s ? (
                              <span
                                key={code}
                                className={cn(
                                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                                  !statusColorMap[code] && getStatusBadgeClass(code, false)
                                )}
                                style={getBadgeStyle(code, statusColorMap)}
                              >
                                {getStatusIcon(code)}
                                {s.name}
                              </span>
                            ) : null
                          })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0" align="start">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder={t('taskManagement.status')} value={statusFilterSearch} onChange={e => setStatusFilterSearch(e.target.value)} className="pl-8 h-8" />
                        </div>
                      </div>
                      <div className="max-h-[240px] overflow-y-auto p-1">
                        {(statuses.length > 0
                          ? statuses
                          : [
                            { code: 'new', name: t('taskManagement.statusNew') },
                            { code: 'in_progress', name: t('taskManagement.statusInProgress') },
                            { code: 'in_review', name: t('taskManagement.statusInReview') },
                            { code: 'fixed', name: t('taskManagement.statusFixed') },
                            { code: 'feedback', name: t('taskManagement.statusFeedback') },
                            { code: 'cancelled', name: t('taskManagement.statusCancelled') },
                            { code: 'done', name: t('taskManagement.statusDone') },
                          ]
                        )
                          .filter(s => !statusFilterSearch.trim() || s.name.toLowerCase().includes(statusFilterSearch.trim().toLowerCase()))
                          .map(s => (
                            <label
                              htmlFor={`status-filter-${s.code}`}
                              key={s.code}
                              className={cn('flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/80 text-sm text-left justify-start')}
                            >
                              <Checkbox
                                id={`status-filter-${s.code}`}
                                checked={statusFilter.includes(s.code)}
                                onCheckedChange={checked => {
                                  setStatusFilter(prev => (checked ? [...prev, s.code] : prev.filter(c => c !== s.code)))
                                }}
                              />
                              <span className={cn('flex items-center gap-2 flex-1 [&_svg]:shrink-0', STATUS_FILTER_COLOR[s.code] ?? 'text-foreground')}>
                                {getStatusIcon(s.code)}
                                {s.name}
                              </span>
                              <span className="text-muted-foreground text-xs shrink-0">{statusCounts[s.code] ?? 0}</span>
                            </label>
                          ))}
                      </div>
                      {statusFilter.length > 0 && (
                        <div className="p-2 border-t">
                          <Button variant="ghost" size="sm" className="w-full h-8 text-xs" onClick={() => setStatusFilter([])}>
                            <X className="h-3.5 w-3.5 mr-1" />
                            {t('taskManagement.clearFilters')}
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant={buttonVariant} size="sm" className="h-8 gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        {t('taskManagement.priority')}
                        {priorityFilter.length > 0 &&
                          (priorities.length > 0
                            ? priorities
                            : [
                              { code: 'critical', name: t('taskManagement.priorityCritical') },
                              { code: 'high', name: t('taskManagement.priorityHigh') },
                              { code: 'medium', name: t('taskManagement.priorityMedium') },
                              { code: 'low', name: t('taskManagement.priorityLow') },
                            ]
                          )
                            .filter(p => priorityFilter.includes(p.code))
                            .map(p => (
                              <span
                                key={p.code}
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
                                  !priorityColorMap[p.code] &&
                                  (p.code === 'critical'
                                    ? 'bg-red-500/25 text-red-700 dark:text-red-400'
                                    : p.code === 'high'
                                      ? 'bg-orange-500/25 text-orange-700 dark:text-orange-400'
                                      : p.code === 'medium'
                                        ? 'bg-sky-500/20 text-sky-700 dark:text-sky-400'
                                        : p.code === 'low'
                                          ? 'bg-emerald-500/25 text-emerald-700 dark:text-emerald-400'
                                          : '')
                                )}
                                style={getBadgeStyle(p.code, priorityColorMap)}
                              >
                                {getPriorityIcon(p.code)}
                                {p.name}
                              </span>
                            ))}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0" align="start">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder={t('taskManagement.priority')}
                            value={priorityFilterSearch}
                            onChange={e => setPriorityFilterSearch(e.target.value)}
                            className="pl-8 h-8"
                          />
                        </div>
                      </div>
                      <div className="max-h-[240px] overflow-y-auto p-1">
                        {(priorities.length > 0
                          ? priorities
                          : [
                            { code: 'critical', name: t('taskManagement.priorityCritical') },
                            { code: 'high', name: t('taskManagement.priorityHigh') },
                            { code: 'medium', name: t('taskManagement.priorityMedium') },
                            { code: 'low', name: t('taskManagement.priorityLow') },
                          ]
                        )
                          .filter(p => !priorityFilterSearch.trim() || p.name.toLowerCase().includes(priorityFilterSearch.trim().toLowerCase()))
                          .map(p => (
                            <label
                              htmlFor={`priority-filter-${p.code}`}
                              key={p.code}
                              className={cn('flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/80 text-sm text-left justify-start')}
                            >
                              <Checkbox
                                id={`priority-filter-${p.code}`}
                                checked={priorityFilter.includes(p.code)}
                                onCheckedChange={checked => {
                                  setPriorityFilter(prev => (checked ? [...prev, p.code] : prev.filter(c => c !== p.code)))
                                }}
                              />
                              <span className={cn('flex items-center gap-2 flex-1 [&_svg]:shrink-0', PRIORITY_FILTER_COLOR[p.code] ?? 'text-foreground')}>
                                {getPriorityIcon(p.code)}
                                {p.name}
                              </span>
                              <span className="text-muted-foreground text-xs shrink-0">{priorityCounts[p.code] ?? 0}</span>
                            </label>
                          ))}
                      </div>
                      {priorityFilter.length > 0 && (
                        <div className="p-2 border-t">
                          <Button variant="ghost" size="sm" className="w-full h-8 text-xs" onClick={() => setPriorityFilter([])}>
                            <X className="h-3.5 w-3.5 mr-1" />
                            {t('taskManagement.clearFilters')}
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  {(statusFilter.length > 0 || priorityFilter.length > 0 || typeFilter.length > 0 || assigneeFilter.length > 0 || projectFilter.length > 0) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setStatusFilter([])
                        setPriorityFilter([])
                        setTypeFilter([])
                        setAssigneeFilter([])
                        setProjectFilter([])
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                      {t('taskManagement.filterReset')}
                    </Button>
                  )}
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant={buttonVariant} size="sm" className="h-8 gap-1.5 shrink-0">
                      <Columns3 className="h-3.5 w-3.5" />
                      {t('taskManagement.columns', 'Columns')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-0" align="end">
                    <div className="p-2 border-b">
                      <span className="text-sm font-medium">{t('taskManagement.columns', 'Columns')}</span>
                    </div>
                    <div className="max-h-[280px] overflow-y-auto p-1">
                      {TASK_COLUMN_IDS.map(colId => {
                        const labelMap: Record<string, string> = {
                          type: t('taskManagement.type'),
                          ticketId: t('taskManagement.ticketId'),
                          project: t('taskManagement.project'),
                          title: t('taskManagement.taskTitle'),
                          assigneeUserId: t('taskManagement.assignee'),
                          status: t('taskManagement.status'),
                          priority: t('taskManagement.priority'),
                          progress: t('taskManagement.progress'),
                          planStartDate: t('taskManagement.planStartDate'),
                          planEndDate: t('taskManagement.deadline'),
                          actualStartDate: t('taskManagement.actualStartDate'),
                          actualEndDate: t('taskManagement.actualCompletionDate'),
                        }
                        const label = labelMap[colId] ?? colId
                        const isRequired = REQUIRED_COLUMN_IDS.includes(colId as (typeof REQUIRED_COLUMN_IDS)[number])
                        return (
                          <label
                            key={colId}
                            htmlFor={`col-vis-${colId}`}
                            className={cn('flex items-center gap-2 px-2 py-1.5 rounded-md text-sm', isRequired ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-muted/80')}
                          >
                            <Checkbox
                              id={`col-vis-${colId}`}
                              checked={visibleColumnIds.includes(colId)}
                              disabled={isRequired}
                              onCheckedChange={() => toggleColumnVisibility(colId)}
                            />
                            <span className="flex-1">{label}</span>
                          </label>
                        )
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              {totalCount === 0 && !listLoading ? (
                <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
                  <p>{t('taskManagement.noTasks')}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (projects.length === 0) {
                        toast.error(t('taskManagement.createProjectFirst'))
                        return
                      }
                      setEditingTaskInDialog(null)
                      setShowTaskDialog(true)
                    }}
                    className={cn('mt-2', PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('taskManagement.createTask')}
                  </Button>
                </div>
              ) : (
                <div className="flex-1 min-h-0 border rounded-md overflow-hidden shadow-sm flex flex-col">
                  <div className="relative flex min-h-0 flex-1 flex-col">
                    {listLoading ? (
                      <div
                        className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-background/75"
                        aria-busy="true"
                        aria-live="polite"
                      >
                        <GlowLoader className="w-10 h-10" />
                      </div>
                    ) : null}
                    <div className="min-h-0 flex-1 overflow-auto overflow-x-auto">
                    <Table className="w-max min-w-full">
                      <TableHeader sticky>
                        <TableRow>
                          <TableHead className="!text-[var(--table-header-fg)] w-10 min-w-10 text-center tabular-nums">{t('taskManagement.rowNo')}</TableHead>
                          {visibleColumnIds.includes('type') && (
                            <SortHeader
                              col="type"
                              label={t('taskManagement.type')}
                              className="w-[88px] min-w-[88px] max-w-[88px]"
                              sortColumn={sortColumn}
                              sortDirection={sortDirection}
                              onSort={handleSortClick}
                            />
                          )}
                          {visibleColumnIds.includes('ticketId') && (
                            <SortHeader col="ticketId" label={t('taskManagement.ticketId')} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSortClick} />
                          )}
                          {visibleColumnIds.includes('project') && (
                            <SortHeader col="project" label={t('taskManagement.project')} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSortClick} />
                          )}
                          {visibleColumnIds.includes('title') && (
                            <SortHeader col="title" label={t('taskManagement.taskTitle')} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSortClick} />
                          )}
                          {visibleColumnIds.includes('assigneeUserId') && (
                            <SortHeader col="assigneeUserId" label={t('taskManagement.assignee')} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSortClick} />
                          )}
                          {visibleColumnIds.includes('status') && (
                            <SortHeader col="status" label={t('taskManagement.status')} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSortClick} />
                          )}
                          {visibleColumnIds.includes('priority') && (
                            <SortHeader col="priority" label={t('taskManagement.priority')} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSortClick} />
                          )}
                          {visibleColumnIds.includes('progress') && (
                            <SortHeader
                              col="progress"
                              label={t('taskManagement.progress')}
                              className="min-w-[120px] w-[120px]"
                              sortColumn={sortColumn}
                              sortDirection={sortDirection}
                              onSort={handleSortClick}
                            />
                          )}
                          {visibleColumnIds.includes('planStartDate') && (
                            <SortHeader
                              col="planStartDate"
                              label={t('taskManagement.planStartDate')}
                              sortColumn={sortColumn}
                              sortDirection={sortDirection}
                              onSort={handleSortClick}
                            />
                          )}
                          {visibleColumnIds.includes('planEndDate') && (
                            <SortHeader col="planEndDate" label={t('taskManagement.deadline')} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSortClick} />
                          )}
                          {visibleColumnIds.includes('actualStartDate') && (
                            <SortHeader
                              col="actualStartDate"
                              label={t('taskManagement.actualStartDate')}
                              sortColumn={sortColumn}
                              sortDirection={sortDirection}
                              onSort={handleSortClick}
                            />
                          )}
                          {visibleColumnIds.includes('actualEndDate') && (
                            <SortHeader
                              col="actualEndDate"
                              label={t('taskManagement.actualCompletionDate')}
                              sortColumn={sortColumn}
                              sortDirection={sortDirection}
                              onSort={handleSortClick}
                            />
                          )}
                          <TableHead className="!text-[var(--table-header-fg)] w-24 text-center">{t('taskManagement.actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableTasks.map((task, idx) => {
                          return (
                            <TaskTableRow
                              key={task.id}
                              rowNumber={(taskPage - 1) * pageSize + idx + 1}
                              task={task}
                              getAssigneeDisplay={getAssigneeDisplay}
                              getStatusLabel={getStatusLabel}
                              getPriorityLabel={getPriorityLabel}
                              getTypeLabel={getTypeLabel}
                              getStatusIcon={getStatusIcon}
                              getPriorityIcon={getPriorityIcon}
                              getTypeIcon={getTypeIcon}
                              getTypeBadgeClass={getTypeBadgeClass}
                              getStatusBadgeClass={getStatusBadgeClass}
                              getPriorityRowClass={getPriorityRowClass}
                              statusColorMap={statusColorMap}
                              priorityColorMap={priorityColorMap}
                              typeColorMap={typeColorMap}
                              getBadgeStyle={getBadgeStyle}
                              getPriorityRowStyle={getPriorityRowStyle}
                              locale={locale}
                              onOpenDialog={handleOpenTaskRow}
                              onDelete={handleDeleteTaskRow}
                              onCopy={task => handleCopyTask(task as Task)}
                              onToggleFavorite={handleToggleFavorite}
                              isFavorite={favoriteTaskIds.has(task.id)}
                              visibleColumnIds={visibleColumnIds}
                            />
                          )
                        })}
                      </TableBody>
                    </Table>
                    </div>
                  </div>
                  {totalCount > 0 && (
                    <TablePaginationBar
                      page={taskPage}
                      totalPages={totalPages}
                      totalItems={totalCount}
                      pageSize={pageSize}
                      onPageChange={setTaskPage}
                      onPageSizeChange={setPageSize}
                      pageSizeOptions={PAGE_SIZE_OPTIONS}
                    />
                  )}
                </div>
              )}
            </TabsContent>

            {showChartTab && (
              <TabsContent value="chart" className="flex-1 flex flex-col min-h-0 mt-0">
                <Suspense
                  fallback={
                    <div className="flex flex-1 min-h-[200px] items-center justify-center">
                      <GlowLoader className="w-10 h-10" />
                    </div>
                  }
                >
                  {chartLoading ? (
                    <div className="flex flex-1 items-center justify-center text-muted-foreground gap-2">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <TaskCharts tasks={chartTasks} users={users} statuses={statuses} priorities={priorities} types={types} dateRange={dateRange} />
                  )}
                </Suspense>
              </TabsContent>
            )}
          </>
        )}
      </div>
    </Tabs>
  )
}
