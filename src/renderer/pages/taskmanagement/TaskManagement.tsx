'use client'

import { addDays, format, startOfDay, subDays } from 'date-fns'
import { enUS, ja, vi } from 'date-fns/locale'
import type { TFunction } from 'i18next'
import {
  AlertCircle,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Bug,
  CalendarRange,
  CheckCircle,
  Circle,
  Columns3,
  Eye,
  FileDown,
  Headphones,
  Kanban,
  LayoutList,
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
import { type CSSProperties, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { MANAGEMENT_BOARD_MAX_ROWS } from 'shared/constants'
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
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TablePaginationBar } from '@/components/ui/table-pagination-bar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DateRangePickerPopover } from '@/components/ui-elements/DateRangePickerPopover'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import toast from '@/components/ui-elements/Toast'
import i18n from '@/lib/i18n'
import { cn, getContrastingColor, hexToRgba } from '@/lib/utils'
import { useTaskToolbarPortalTarget } from '@/pages/main/TaskToolbarPortalContext'
import {
  PR_MANAGER_ACCENT_OUTLINE_BTN,
  PR_MANAGER_ACCENT_OUTLINE_BTN_COMPACT,
  PR_MANAGER_ACCENT_OUTLINE_SURFACE,
  PR_MANAGER_ACCENT_TITLEBAR_SURFACE,
} from '@/pages/prmanager/prManagerButtonStyles'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'
import type { ChartTask } from './chartDataUtils'
import { TaskBulkActionsBar } from './TaskBulkActionsBar'
import { TaskCalendarView } from './TaskCalendarView'
import { TaskGanttView } from './TaskGanttView'
import type { WorkloadData, WorkloadOverrideUpsertInput } from './TaskGanttWorkload'
import { TaskKanbanBoard } from './TaskKanbanBoard'
import { TaskSavedViewsPopover } from './TaskSavedViewsPopover'
import { TaskTableRow, type TaskTableRowTask } from './TaskTableRow'
import {
  buildSavedViewSnapshot,
  coerceTaskManagementPageSize,
  isPersistedTaskView,
  keysToDateRange,
  loadSavedViewsFromStorage,
  loadTaskManagementSessionActiveTab,
  loadTaskManagementSessionSnapshot,
  normalizeSnapshot,
  sanitizeSortColumnKey,
  sanitizeVisibleColumnIds,
  saveSavedViewsToStorage,
  saveTaskManagementSessionActiveTab,
  saveTaskManagementSessionSnapshot,
  snapshotsAreEqual,
  snapshotsMatchAnySaved,
  type TaskManagementSavedView,
  type TaskManagementSavedViewSnapshot,
} from './taskManagementSavedViews'

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
const TASK_VIEW_STORAGE_KEY = 'task-management-task-view'

/** Nút filter facet (Assignee, Project, Type, Status, Priority): đã chọn ít nhất một giá trị */
const TASK_MGMT_FILTER_TRIGGER_ACTIVE = 'border-primary/55 bg-primary/[0.09] font-medium text-foreground shadow-sm dark:border-primary/45 dark:bg-primary/14'

type TaskManagementViewMode = 'table' | 'board' | 'gantt' | 'calendar'

function TaskViewModeToggle({
  value,
  onValueChange,
  disabled,
  t,
  className,
}: {
  value: TaskManagementViewMode
  onValueChange: (v: TaskManagementViewMode) => void
  disabled: boolean
  t: TFunction
  className?: string
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={v => v && onValueChange(v as TaskManagementViewMode)}
      variant="outline"
      size="sm"
      spacing={0}
      disabled={disabled}
      className={cn('h-6 shrink-0', className)}
    >
      <ToggleGroupItem value="table" className="h-5 gap-0.5 px-1.5 text-[10px]" title={t('taskManagement.viewTable')}>
        <LayoutList className="h-3 w-3 shrink-0" />
        <span className="hidden sm:inline">{t('taskManagement.viewTableShort')}</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="board" className="h-5 gap-0.5 px-1.5 text-[10px]" title={t('taskManagement.viewBoard')}>
        <Kanban className="h-3 w-3 shrink-0" />
        <span className="hidden sm:inline">{t('taskManagement.viewBoardShort')}</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="gantt" className="h-5 gap-0.5 px-1.5 text-[10px]" title={t('taskManagement.viewGantt')}>
        <AlignLeft className="h-3 w-3 shrink-0" />
        <span className="hidden sm:inline">{t('taskManagement.viewGanttShort')}</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="calendar" className="h-5 gap-0.5 px-1.5 text-[10px]" title={t('taskManagement.viewCalendar')}>
        <CalendarRange className="h-3 w-3 shrink-0" />
        <span className="hidden sm:inline">{t('taskManagement.viewCalendarShort')}</span>
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

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
  disabled,
}: {
  col: keyof Task
  label: string
  className?: string
  sortColumn: keyof Task | null
  sortDirection: 'asc' | 'desc'
  onSort: (col: keyof Task) => void
  disabled?: boolean
}) {
  return (
    <TableHead
      className={cn(
        '!text-[var(--table-header-fg)] select-none text-center',
        disabled ? 'cursor-not-allowed opacity-55 pointer-events-none' : 'cursor-pointer hover:bg-muted/50',
        className
      )}
      onClick={() => {
        if (disabled) return
        onSort(col)
      }}
    >
      <div className="flex items-center justify-center gap-1">
        {label}
        {sortColumn === col && (sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
      </div>
    </TableHead>
  )
}

/** Snapshot filter gửi API. PL/PM: facet + ngày đồng bộ ngay; text search chỉ khi bấm «Tìm kiếm». Admin/Dev: không dùng (filter trực tiếp). */
interface AppliedMgmtFiltersSlice {
  search: string
  statusCodes: string[]
  assigneeUserIds: string[]
  typeCodes: string[]
  priorityCodes: string[]
  projectIds: string[]
  dateFromKey: string | null
  dateToKey: string | null
  createdDateFromKey: string | null
  createdDateToKey: string | null
  updatedDateFromKey: string | null
  updatedDateToKey: string | null
}

function dateRangeToOptionalApi(range: DateRange | undefined): { from: string; to: string } | undefined {
  if (!range?.from) return undefined
  const from = format(range.from, 'yyyy-MM-dd')
  const to = range.to ? format(range.to, 'yyyy-MM-dd') : from
  return { from, to }
}

function appliedSliceKeysToApi(fromKey: string | null, toKey: string | null): { from: string; to: string } | undefined {
  if (!fromKey) return undefined
  const to = (toKey ?? fromKey).slice(0, 10)
  return { from: fromKey.slice(0, 10), to }
}

function buildAppliedMgmtFromDraft(
  searchQuery: string,
  statusFilter: string[],
  assigneeFilter: string[],
  typeFilter: string[],
  priorityFilter: string[],
  projectFilter: string[],
  dateRange: DateRange | undefined,
  createdDateRange: DateRange | undefined,
  updatedDateRange: DateRange | undefined
): AppliedMgmtFiltersSlice {
  let dateFromKey: string | null = null
  let dateToKey: string | null = null
  if (dateRange?.from) {
    dateFromKey = format(dateRange.from, 'yyyy-MM-dd')
    dateToKey = dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : dateFromKey
  }
  let createdDateFromKey: string | null = null
  let createdDateToKey: string | null = null
  if (createdDateRange?.from) {
    createdDateFromKey = format(createdDateRange.from, 'yyyy-MM-dd')
    createdDateToKey = createdDateRange.to ? format(createdDateRange.to, 'yyyy-MM-dd') : createdDateFromKey
  }
  let updatedDateFromKey: string | null = null
  let updatedDateToKey: string | null = null
  if (updatedDateRange?.from) {
    updatedDateFromKey = format(updatedDateRange.from, 'yyyy-MM-dd')
    updatedDateToKey = updatedDateRange.to ? format(updatedDateRange.to, 'yyyy-MM-dd') : updatedDateFromKey
  }
  return {
    search: searchQuery.trim(),
    statusCodes: [...statusFilter],
    assigneeUserIds: [...assigneeFilter],
    typeCodes: [...typeFilter],
    priorityCodes: [...priorityFilter],
    projectIds: [...projectFilter],
    dateFromKey,
    dateToKey,
    createdDateFromKey,
    createdDateToKey,
    updatedDateFromKey,
    updatedDateToKey,
  }
}

function fingerprintAppliedMgmtFilters(s: AppliedMgmtFiltersSlice): string {
  return JSON.stringify({
    search: s.search,
    statusCodes: [...s.statusCodes].sort(),
    assigneeUserIds: [...s.assigneeUserIds].sort(),
    typeCodes: [...s.typeCodes].sort(),
    priorityCodes: [...s.priorityCodes].sort(),
    projectIds: [...s.projectIds].sort(),
    dateFromKey: s.dateFromKey,
    dateToKey: s.dateToKey,
    createdDateFromKey: s.createdDateFromKey,
    createdDateToKey: s.createdDateToKey,
    updatedDateFromKey: s.updatedDateFromKey,
    updatedDateToKey: s.updatedDateToKey,
  })
}

function appliedMgmtFromSavedViewSnapshot(snap: TaskManagementSavedViewSnapshot): AppliedMgmtFiltersSlice {
  const base = {
    search: snap.searchQuery.trim(),
    statusCodes: [...snap.statusCodes],
    assigneeUserIds: [...snap.assigneeUserIds],
    typeCodes: [...snap.typeCodes],
    priorityCodes: [...snap.priorityCodes],
    projectIds: [...snap.projectIds],
  }
  const dateFromKey = snap.dateRangeAllTime ? null : snap.dateRangeFromKey
  const dateToKey = snap.dateRangeAllTime ? null : (snap.dateRangeToKey ?? snap.dateRangeFromKey ?? null)
  const createdDateFromKey = snap.createdRangeAllTime ? null : snap.createdRangeFromKey
  const createdDateToKey = snap.createdRangeAllTime ? null : (snap.createdRangeToKey ?? snap.createdRangeFromKey ?? null)
  const updatedDateFromKey = snap.updatedRangeAllTime ? null : snap.updatedRangeFromKey
  const updatedDateToKey = snap.updatedRangeAllTime ? null : (snap.updatedRangeToKey ?? snap.updatedRangeFromKey ?? null)
  return {
    ...base,
    dateFromKey,
    dateToKey,
    createdDateFromKey,
    createdDateToKey,
    updatedDateFromKey,
    updatedDateToKey,
  }
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
  /** Admin / PL / PM: swimlane Gantt + Kanban. */
  const canManageTaskRowGrouping = useMemo(() => {
    const r = user?.role
    return r === 'admin' || r === 'pl' || r === 'pm'
  }, [user?.role])
  const requiresManualMgmtApply = useMemo(() => {
    const r = (user?.role ?? '').toLowerCase()
    return r === 'pl' || r === 'pm'
  }, [user?.role])
  const taskMgmtSessionScope = user?.id ?? 'guest'
  const [appliedMgmtFilters, setAppliedMgmtFilters] = useState<AppliedMgmtFiltersSlice | null>(null)

  useEffect(() => {
    setAppliedMgmtFilters(null)
  }, [user?.id])

  useEffect(() => {
    if (!requiresManualMgmtApply) setAppliedMgmtFilters(null)
  }, [requiresManualMgmtApply])
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
  const [createdDateRange, setCreatedDateRange] = useState<DateRange | undefined>(undefined)
  const [updatedDateRange, setUpdatedDateRange] = useState<DateRange | undefined>(undefined)
  const [mgmtTimelinePickerOpen, setMgmtTimelinePickerOpen] = useState(false)
  const [mgmtCreatedPickerOpen, setMgmtCreatedPickerOpen] = useState(false)
  const [mgmtUpdatedPickerOpen, setMgmtUpdatedPickerOpen] = useState(false)
  /** Tab biểu đồ chỉ cần khoảng timeline chính — tách state mở Popover tránh trùng Tasks. */
  const [chartTimelinePickerOpen, setChartTimelinePickerOpen] = useState(false)
  const [statusFilterSearch, setStatusFilterSearch] = useState('')
  const [priorityFilterSearch, setPriorityFilterSearch] = useState('')
  const [typeFilterSearch, setTypeFilterSearch] = useState('')
  const [assigneeFilterSearch, setAssigneeFilterSearch] = useState('')
  const [projectFilterSearch, setProjectFilterSearch] = useState('')
  const [favoriteTaskIds, setFavoriteTaskIds] = useState<Set<string>>(new Set())
  const [taskView, setTaskView] = useState<TaskManagementViewMode>(() => {
    try {
      const s = localStorage.getItem(TASK_VIEW_STORAGE_KEY)
      if (s === 'table' || s === 'board' || s === 'gantt' || s === 'calendar') return s
    } catch {
      /* ignore */
    }
    return 'table'
  })
  const [boardTasks, setBoardTasks] = useState<Task[]>([])
  const [boardTotal, setBoardTotal] = useState(0)
  const [boardTruncated, setBoardTruncated] = useState(false)
  const [boardLoading, setBoardLoading] = useState(false)
  /** Workload Gantt section: chỉ active khi taskView === 'gantt' và đúng 1 project được chọn. */
  const [workloadData, setWorkloadData] = useState<WorkloadData | null>(null)
  const [workloadLoading, setWorkloadLoading] = useState(false)
  const workloadRequestIdRef = useRef(0)
  const [savedViews, setSavedViews] = useState<TaskManagementSavedView[]>([])
  const [selectedTaskIds, setSelectedTaskIds] = useState(() => new Set<string>())
  const boardManagementRequestIdRef = useRef(0)
  /** Kéo Kanban thành công: vẫn refetch board theo listRevision nhưng không bật overlay loading cả vùng board. */
  const skipBoardFullPageLoadingRef = useRef(false)
  const skipPersistSavedViewsAfterHydrateRef = useRef(false)
  const skipPersistSessionAfterHydrateRef = useRef(false)
  const listManagementRequestIdRef = useRef(0)
  const chartManagementRequestIdRef = useRef(0)
  const chartTasksRef = useRef<ChartTask[]>([])
  chartTasksRef.current = chartTasks
  const lastFacetsFiltersKeyRef = useRef<string | null>(null)
  /** Kanban/Gantt/Lịch không gọi list bảng — dùng ref này để request facet cho popover filter. */
  const managementFacetPopoverRequestIdRef = useRef(0)
  const [pinnedSavedViewId, setPinnedSavedViewId] = useState<string | null>(null)
  const [importUiPhase, setImportUiPhase] = useState<'idle' | 'prep' | 'run'>('idle')
  const [bulkSkipDetail, setBulkSkipDetail] = useState<{ open: boolean; lines: string[] }>({ open: false, lines: [] })
  const [importErrorDetail, setImportErrorDetail] = useState<{ open: boolean; text: string }>({ open: false, text: '' })
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
    try {
      localStorage.setItem(TASK_VIEW_STORAGE_KEY, taskView)
    } catch {
      /* ignore */
    }
  }, [taskView])

  useEffect(() => {
    if (isImporting) {
      setMgmtTimelinePickerOpen(false)
      setMgmtCreatedPickerOpen(false)
      setMgmtUpdatedPickerOpen(false)
      setChartTimelinePickerOpen(false)
    }
  }, [isImporting])

  useEffect(() => {
    if (!isImporting) {
      setImportUiPhase('idle')
      return
    }
    setImportUiPhase('prep')
    const tm = window.setTimeout(() => setImportUiPhase('run'), 450)
    return () => window.clearTimeout(tm)
  }, [isImporting])

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => window.clearTimeout(id)
  }, [searchQuery])

  /** PL/PM: đổi facet hoặc khoảng ngày → refetch ngay; giữ `search` đã áp cho API cho đến khi bấm «Tìm kiếm». */
  useEffect(() => {
    if (!requiresManualMgmtApply) return
    setAppliedMgmtFilters(prev =>
      buildAppliedMgmtFromDraft(
        prev ? prev.search : searchQuery.trim(),
        statusFilter,
        assigneeFilter,
        typeFilter,
        priorityFilter,
        projectFilter,
        dateRange,
        createdDateRange,
        updatedDateRange
      )
    )
    setTaskPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ facet/ngày; không kéo typing search vào để tránh áp nhầm từng ký tự
  }, [requiresManualMgmtApply, statusFilter, assigneeFilter, typeFilter, priorityFilter, projectFilter, dateRange, createdDateRange, updatedDateRange])

  useEffect(() => {
    if (requiresManualMgmtApply) return
    setTaskPage(1)
  }, [requiresManualMgmtApply, debouncedSearch, statusFilter, assigneeFilter, typeFilter, priorityFilter, projectFilter, dateRange, createdDateRange, updatedDateRange])

  const toggleColumnVisibility = useCallback((colId: string) => {
    if (REQUIRED_COLUMN_IDS.includes(colId as (typeof REQUIRED_COLUMN_IDS)[number])) return
    setVisibleColumnIds(prev => (prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]))
  }, [])

  const currentSavedSnapshot = useMemo(
    () =>
      buildSavedViewSnapshot({
        searchQuery,
        statusCodes: statusFilter,
        assigneeUserIds: assigneeFilter,
        typeCodes: typeFilter,
        priorityCodes: priorityFilter,
        projectIds: projectFilter,
        dateRange,
        createdDateRange,
        updatedDateRange,
        sortColumnKey: sortColumn as string | null,
        sortDirection,
        taskView,
        pageSize,
        visibleColumnIds,
        taskColumnIds: TASK_COLUMN_IDS,
        requiredColumnIds: REQUIRED_COLUMN_IDS,
      }),
    [
      searchQuery,
      statusFilter,
      assigneeFilter,
      typeFilter,
      priorityFilter,
      projectFilter,
      dateRange,
      createdDateRange,
      updatedDateRange,
      sortColumn,
      sortDirection,
      taskView,
      pageSize,
      visibleColumnIds,
    ]
  )

  const matchingSavedView = useMemo(() => snapshotsMatchAnySaved(savedViews, currentSavedSnapshot), [savedViews, currentSavedSnapshot])

  const pinnedSavedViewDirty = useMemo(() => {
    if (!pinnedSavedViewId) return false
    const v = savedViews.find(x => x.id === pinnedSavedViewId)
    if (!v) return false
    return !snapshotsAreEqual(normalizeSnapshot(v.snapshot), normalizeSnapshot(currentSavedSnapshot))
  }, [pinnedSavedViewId, savedViews, currentSavedSnapshot])

  useEffect(() => {
    if (!pinnedSavedViewId) return
    if (!savedViews.some(x => x.id === pinnedSavedViewId)) setPinnedSavedViewId(null)
  }, [savedViews, pinnedSavedViewId])

  const hasNarrowingFilters = useMemo(() => {
    const q = requiresManualMgmtApply ? searchQuery.trim().length > 0 : debouncedSearch.trim().length > 0
    return (
      q ||
      statusFilter.length > 0 ||
      assigneeFilter.length > 0 ||
      typeFilter.length > 0 ||
      priorityFilter.length > 0 ||
      projectFilter.length > 0 ||
      Boolean(dateRange?.from) ||
      Boolean(createdDateRange?.from) ||
      Boolean(updatedDateRange?.from)
    )
  }, [
    requiresManualMgmtApply,
    searchQuery,
    debouncedSearch,
    statusFilter,
    assigneeFilter,
    typeFilter,
    priorityFilter,
    projectFilter,
    dateRange?.from,
    createdDateRange?.from,
    updatedDateRange?.from,
  ])

  const reloadManagementLists = useCallback(() => setListRevision(r => r + 1), [])

  const toastVersionConflict = useCallback(() => {
    toast.error(t('taskManagement.versionConflictError'), {
      actions: [{ label: t('taskManagement.toastReloadList'), onClick: () => reloadManagementLists() }],
    })
  }, [t, reloadManagementLists])

  const applySavedSnapshot = useCallback(
    (snap: TaskManagementSavedViewSnapshot) => {
      setSearchQuery(snap.searchQuery)
      setDebouncedSearch(snap.searchQuery)
      setStatusFilter([...snap.statusCodes])
      setAssigneeFilter([...snap.assigneeUserIds])
      setTypeFilter([...snap.typeCodes])
      setPriorityFilter([...snap.priorityCodes])
      setProjectFilter([...snap.projectIds])
      setDateRange(keysToDateRange(snap.dateRangeFromKey, snap.dateRangeToKey, snap.dateRangeAllTime))
      setCreatedDateRange(keysToDateRange(snap.createdRangeFromKey, snap.createdRangeToKey, snap.createdRangeAllTime))
      setUpdatedDateRange(keysToDateRange(snap.updatedRangeFromKey, snap.updatedRangeToKey, snap.updatedRangeAllTime))
      const col = sanitizeSortColumnKey(snap.sortColumn)
      setSortColumn(col ? (col as keyof Task) : null)
      setSortDirection(snap.sortDirection)
      setTaskView(isPersistedTaskView(snap.taskView) ? snap.taskView : 'table')
      setPageSize(coerceTaskManagementPageSize(snap.pageSize))
      setVisibleColumnIds(sanitizeVisibleColumnIds(snap.visibleColumnIds, TASK_COLUMN_IDS, REQUIRED_COLUMN_IDS))
      setTaskPage(1)
      if (requiresManualMgmtApply) {
        setAppliedMgmtFilters(appliedMgmtFromSavedViewSnapshot(snap))
      }
    },
    [requiresManualMgmtApply]
  )

  useEffect(() => {
    if (user?.id) {
      skipPersistSavedViewsAfterHydrateRef.current = true
      setSavedViews(loadSavedViewsFromStorage(user.id))
    } else {
      setSavedViews([])
    }
    skipPersistSessionAfterHydrateRef.current = true
    const sessionSnap = loadTaskManagementSessionSnapshot(taskMgmtSessionScope)
    if (sessionSnap) applySavedSnapshot(sessionSnap)
    const persistedTasksTab = loadTaskManagementSessionActiveTab(taskMgmtSessionScope)
    if (persistedTasksTab === 'tasks' || (persistedTasksTab === 'chart' && showChartTab)) setActiveTab(persistedTasksTab)
  }, [taskMgmtSessionScope, user?.id, applySavedSnapshot, showChartTab])

  useEffect(() => {
    if (!user?.id) return
    if (skipPersistSavedViewsAfterHydrateRef.current) {
      skipPersistSavedViewsAfterHydrateRef.current = false
      return
    }
    saveSavedViewsToStorage(user.id, savedViews)
  }, [user?.id, savedViews])

  const clearNarrowingFilters = useCallback(() => {
    setSearchQuery('')
    setDebouncedSearch('')
    setStatusFilter([])
    setPriorityFilter([])
    setTypeFilter([])
    setAssigneeFilter([])
    setProjectFilter([])
    setDateRange(undefined)
    setCreatedDateRange(undefined)
    setUpdatedDateRange(undefined)
    setTaskPage(1)
    setMgmtTimelinePickerOpen(false)
    setMgmtCreatedPickerOpen(false)
    setMgmtUpdatedPickerOpen(false)
    setChartTimelinePickerOpen(false)
    if (requiresManualMgmtApply) {
      setAppliedMgmtFilters(buildAppliedMgmtFromDraft('', [], [], [], [], [], undefined, undefined, undefined))
    }
  }, [requiresManualMgmtApply])

  useEffect(() => {
    if (skipPersistSessionAfterHydrateRef.current) {
      skipPersistSessionAfterHydrateRef.current = false
      return
    }
    const id = window.setTimeout(() => {
      saveTaskManagementSessionSnapshot(taskMgmtSessionScope, normalizeSnapshot(currentSavedSnapshot))
      saveTaskManagementSessionActiveTab(taskMgmtSessionScope, activeTab === 'chart' ? 'chart' : 'tasks')
    }, 200)
    return () => window.clearTimeout(id)
  }, [taskMgmtSessionScope, currentSavedSnapshot, activeTab])

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

  const openTaskDetailById = useCallback(
    async (taskId: string) => {
      const res = await window.api.task.getTask(taskId)
      if (res.status === 'success' && res.data) {
        setEditingTaskInDialog(res.data as Task)
        setShowTaskDialog(true)
      } else {
        toast.error(res.message || t('taskManagement.loadTasksFailed'))
      }
    },
    [t]
  )

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
      Notification.requestPermission().catch(() => {})
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
        const errLines = Array.isArray(res.errors) ? res.errors.filter((e): e is string => typeof e === 'string' && e.trim().length > 0) : []
        const errText = errLines.join('\n')
        if (created > 0 || updated > 0) {
          if (created > 0 && updated > 0) {
            toast.success(t('taskManagement.importSuccessWithUpdate', { created, updated }))
          } else if (updated > 0) {
            toast.success(t('taskManagement.importSuccessUpdated', { count: updated }))
          } else {
            toast.success(t('taskManagement.importSuccess', { count: created }))
          }
          if (errLines.length > 0) {
            toast.warning(t('taskManagement.importWarningsCount', { count: errLines.length }), {
              actions: [
                {
                  label: t('taskManagement.importErrorViewLog'),
                  onClick: () => setImportErrorDetail({ open: true, text: errText }),
                },
              ],
            })
          }
          await loadData()
        } else {
          const fallback = errText || t('taskManagement.importNothingApplied')
          const msg = errLines.length ? errText : t('taskManagement.importError', { message: fallback })
          if (errLines.length > 0) {
            setImportErrorDetail({ open: true, text: errText })
            toast.error(t('taskManagement.importError', { message: t('taskManagement.importErrorOpenLogHint') }))
          } else {
            toast.error(msg)
          }
        }
      } else {
        const raw = res as { message?: string; errors?: unknown }
        const errs = Array.isArray(raw.errors) ? raw.errors.filter((e): e is string => typeof e === 'string' && e.trim().length > 0) : []
        const msg = errs.join('\n') || raw.message || 'Unknown'
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
      toastVersionConflict()
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
      toastVersionConflict()
      const freshRes = await window.api.task.getTask(id)
      if (freshRes.status === 'success' && freshRes.data) {
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

  const handleBoardMoveStatus = useCallback(
    async (taskId: string, newStatus: string, version?: number) => {
      const can = await window.api.task.canEditTask(taskId)
      if (can.status !== 'success' || !can.data?.canEdit) {
        toast.error(t('taskManagement.taskReadOnlyNoPermission'))
        return
      }
      let previousSnapshot: Task[] = []
      setBoardTasks(prev => {
        previousSnapshot = prev
        return prev.map(x => (x.id === taskId ? { ...x, status: newStatus } : x))
      })
      const res = await window.api.task.updateStatus(taskId, newStatus, version)
      if (res.status === 'success') {
        skipBoardFullPageLoadingRef.current = true
        setListRevision(r => r + 1)
        return
      }
      setBoardTasks(previousSnapshot)
      if ((res as { code?: string }).code === 'VERSION_CONFLICT') toastVersionConflict()
      else toast.error(res.message || t('taskManagement.updateError'))
    },
    [t, toastVersionConflict]
  )

  const handleUpdatePlanDates = useCallback(
    async (taskId: string, planStartDate: string, planEndDate: string, version?: number) => {
      const can = await window.api.task.canEditTask(taskId)
      if (can.status !== 'success' || !can.data?.canEdit) {
        toast.error(t('taskManagement.taskReadOnlyNoPermission'))
        return false
      }
      let previousSnapshot: Task[] = []
      setBoardTasks(prev => {
        previousSnapshot = prev
        return prev.map(x => (x.id === taskId ? { ...x, planStartDate, planEndDate } : x))
      })
      const res = await window.api.task.updateDates(taskId, { planStartDate, planEndDate }, version)
      if (res.status === 'success') {
        setListRevision(r => r + 1)
        return true
      }
      setBoardTasks(previousSnapshot)
      if ((res as { code?: string }).code === 'VERSION_CONFLICT') toastVersionConflict()
      else toast.error(res.message || t('taskManagement.updateError'))
      return false
    },
    [t, toastVersionConflict]
  )

  const toggleBulkTaskSelection = useCallback((taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }, [])

  const handleBulkApply = useCallback(
    async (patch: { status?: string; priority?: string; assigneeUserId?: string | null }) => {
      const sourceRows = taskView === 'table' ? tableTasks : boardTasks
      const items: { id: string; version: number }[] = []
      for (const id of selectedTaskIds) {
        const row = sourceRows.find(t => t.id === id)
        if (row) items.push({ id: row.id, version: Number(row.version ?? 0) })
      }
      if (items.length === 0) {
        toast.error(t('taskManagement.bulkNothingToApply'))
        return
      }
      const summarizeSkipped = (ids: string[]) =>
        ids.map(id => {
          const row = sourceRows.find(t => t.id === id)
          if (!row) return id
          const tid = (row as TaskTableRowTask).ticketId?.trim()
          return tid ? `${tid} — ${row.title ?? id}` : row.title || id
        })
      const res = await window.api.task.bulkUpdateTasks({ items, patch })
      if (res.status === 'success' && res.data) {
        const { updatedCount, skippedIds } = res.data
        const lines = summarizeSkipped(skippedIds)
        if (updatedCount > 0) {
          toast.success(t('taskManagement.bulkSuccess', { count: updatedCount }))
          setListRevision(r => r + 1)
        }
        if (skippedIds.length > 0 && updatedCount === 0) {
          toast.error(t('taskManagement.bulkAllSkipped'), {
            actions: [
              {
                label: t('taskManagement.bulkSkippedDetails'),
                onClick: () => setBulkSkipDetail({ open: true, lines }),
              },
            ],
          })
        } else if (skippedIds.length > 0) {
          toast.warning(t('taskManagement.bulkPartialSkip', { count: skippedIds.length }), {
            actions: [
              {
                label: t('taskManagement.bulkSkippedDetails'),
                onClick: () => setBulkSkipDetail({ open: true, lines }),
              },
            ],
          })
        }
        return
      }
      toast.error((res as { message?: string }).message || t('taskManagement.updateError'))
    },
    [taskView, tableTasks, boardTasks, selectedTaskIds, t]
  )

  const getAssigneeDisplay = useCallback(
    (assigneeUserId: string | null) => {
      if (!assigneeUserId) return '-'
      const u = users.find(us => us.id === assigneeUserId)
      return u ? u.name : '-'
    },
    [users]
  )

  const mgmtApiFilters = useMemo(() => {
    if (!requiresManualMgmtApply) {
      const dateRangeApi =
        dateRange?.from != null
          ? {
              from: format(dateRange.from, 'yyyy-MM-dd'),
              to: dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : format(dateRange.from, 'yyyy-MM-dd'),
            }
          : undefined
      return {
        ready: true as const,
        search: debouncedSearch.trim(),
        statusCodes: statusFilter,
        assigneeUserIds: assigneeFilter,
        typeCodes: typeFilter,
        priorityCodes: priorityFilter,
        projectIds: projectFilter,
        dateRangeApi,
        createdDateRangeApi: dateRangeToOptionalApi(createdDateRange),
        updatedDateRangeApi: dateRangeToOptionalApi(updatedDateRange),
      }
    }
    if (appliedMgmtFilters === null) return { ready: false as const }
    const dateRangeApi =
      appliedMgmtFilters.dateFromKey != null
        ? {
            from: appliedMgmtFilters.dateFromKey,
            to: appliedMgmtFilters.dateToKey ?? appliedMgmtFilters.dateFromKey,
          }
        : undefined
    return {
      ready: true as const,
      search: appliedMgmtFilters.search,
      statusCodes: appliedMgmtFilters.statusCodes,
      assigneeUserIds: appliedMgmtFilters.assigneeUserIds,
      typeCodes: appliedMgmtFilters.typeCodes,
      priorityCodes: appliedMgmtFilters.priorityCodes,
      projectIds: appliedMgmtFilters.projectIds,
      dateRangeApi,
      createdDateRangeApi: appliedSliceKeysToApi(appliedMgmtFilters.createdDateFromKey, appliedMgmtFilters.createdDateToKey),
      updatedDateRangeApi: appliedSliceKeysToApi(appliedMgmtFilters.updatedDateFromKey, appliedMgmtFilters.updatedDateToKey),
    }
  }, [
    requiresManualMgmtApply,
    debouncedSearch,
    statusFilter,
    assigneeFilter,
    typeFilter,
    priorityFilter,
    projectFilter,
    dateRange,
    createdDateRange,
    updatedDateRange,
    appliedMgmtFilters,
  ])

  const commitMgmtFiltersFromDraft = useCallback(() => {
    if (!requiresManualMgmtApply) return
    setAppliedMgmtFilters(
      buildAppliedMgmtFromDraft(searchQuery, statusFilter, assigneeFilter, typeFilter, priorityFilter, projectFilter, dateRange, createdDateRange, updatedDateRange)
    )
    setTaskPage(1)
  }, [requiresManualMgmtApply, searchQuery, statusFilter, assigneeFilter, typeFilter, priorityFilter, projectFilter, dateRange, createdDateRange, updatedDateRange])

  const mgmtSearchDirtyOrInitial = useMemo(() => {
    if (!requiresManualMgmtApply) return false
    const fpDraft = fingerprintAppliedMgmtFilters(
      buildAppliedMgmtFromDraft(searchQuery, statusFilter, assigneeFilter, typeFilter, priorityFilter, projectFilter, dateRange, createdDateRange, updatedDateRange)
    )
    if (!appliedMgmtFilters) return true
    return fpDraft !== fingerprintAppliedMgmtFilters(appliedMgmtFilters)
  }, [
    requiresManualMgmtApply,
    searchQuery,
    statusFilter,
    assigneeFilter,
    typeFilter,
    priorityFilter,
    projectFilter,
    dateRange,
    createdDateRange,
    updatedDateRange,
    appliedMgmtFilters,
  ])

  const reloadTaskMgmtMastersAndList = useCallback(() => {
    void loadData()
    setListRevision(r => r + 1)
  }, [loadData])

  const taskListFiltersKey = useMemo(() => {
    if (!mgmtApiFilters.ready) return '__pending_mgmt__'
    const f = mgmtApiFilters
    return JSON.stringify({
      s: f.search,
      st: [...f.statusCodes].sort(),
      as: [...f.assigneeUserIds].sort(),
      ty: [...f.typeCodes].sort(),
      pr: [...f.priorityCodes].sort(),
      pj: [...f.projectIds].sort(),
      dr: f.dateRangeApi?.from ? `${f.dateRangeApi.from}|${f.dateRangeApi.to ?? f.dateRangeApi.from}` : null,
      dc: f.createdDateRangeApi?.from ? `${f.createdDateRangeApi.from}|${f.createdDateRangeApi.to ?? f.createdDateRangeApi.from}` : null,
      du: f.updatedDateRangeApi?.from ? `${f.updatedDateRangeApi.from}|${f.updatedDateRangeApi.to ?? f.updatedDateRangeApi.from}` : null,
    })
  }, [mgmtApiFilters])

  const bulkSelectionClearKey = useMemo(() => `${taskView}|${taskPage}|${taskListFiltersKey}|${listRevision}`, [taskView, taskPage, taskListFiltersKey, listRevision])

  useEffect(() => {
    setSelectedTaskIds(new Set())
  }, [bulkSelectionClearKey])

  useEffect(() => {
    if (!isAuthChecked || isLoading || taskApiOk !== true) return
    if (taskView !== 'table') return
    if (!mgmtApiFilters.ready) {
      setListLoading(false)
      setTableTasks([])
      setTotalCount(0)
      setFacetCounts(null)
      return
    }
    const f = mgmtApiFilters
    const requestId = ++listManagementRequestIdRef.current
    const includeFacets = lastFacetsFiltersKeyRef.current !== taskListFiltersKey
    void (async () => {
      setListLoading(true)
      try {
        const res = await window.api.task.listForManagement({
          page: taskPage,
          limit: pageSize,
          search: f.search || undefined,
          statusCodes: f.statusCodes.length ? f.statusCodes : undefined,
          assigneeUserIds: f.assigneeUserIds.length ? f.assigneeUserIds : undefined,
          typeCodes: f.typeCodes.length ? f.typeCodes : undefined,
          priorityCodes: f.priorityCodes.length ? f.priorityCodes : undefined,
          projectIds: f.projectIds.length ? f.projectIds : undefined,
          dateRange: f.dateRangeApi,
          createdDateRange: f.createdDateRangeApi,
          updatedDateRange: f.updatedDateRangeApi,
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
  }, [isAuthChecked, isLoading, taskApiOk, taskPage, pageSize, mgmtApiFilters, sortColumn, sortDirection, listRevision, taskListFiltersKey, t, clearSession, taskView])

  /** Board/Gantt/Lịch: chỉ khi `taskView===table` mới fetch list bảng (+ facet) — các view khác vẫn cần facet counts trong popover. */
  useEffect(() => {
    if (!isAuthChecked || isLoading || taskApiOk !== true || activeTab !== 'tasks') return
    if (taskView === 'table') return
    if (!mgmtApiFilters.ready) {
      setFacetCounts(null)
      return
    }
    const f = mgmtApiFilters
    const requestId = ++managementFacetPopoverRequestIdRef.current
    void (async () => {
      try {
        const res = await window.api.task.listForManagement({
          page: 1,
          limit: 1,
          search: f.search || undefined,
          statusCodes: f.statusCodes.length ? f.statusCodes : undefined,
          assigneeUserIds: f.assigneeUserIds.length ? f.assigneeUserIds : undefined,
          typeCodes: f.typeCodes.length ? f.typeCodes : undefined,
          priorityCodes: f.priorityCodes.length ? f.priorityCodes : undefined,
          projectIds: f.projectIds.length ? f.projectIds : undefined,
          dateRange: f.dateRangeApi,
          createdDateRange: f.createdDateRangeApi,
          updatedDateRange: f.updatedDateRangeApi,
          sortColumn: null,
          sortDirection: 'asc',
          includeFacets: true,
        })
        if (requestId !== managementFacetPopoverRequestIdRef.current) return
        if (res.status === 'error' && (res.code === 'UNAUTHORIZED' || res.code === 'FORBIDDEN')) return
        if (res.status === 'success' && res.data?.facets) {
          setFacetCounts(res.data.facets)
          lastFacetsFiltersKeyRef.current = taskListFiltersKey
        }
      } catch {
        /* bỏ qua — lần fetch sau hoặc tab bảng sẽ cập nhật */
      }
    })()
    return () => {
      managementFacetPopoverRequestIdRef.current += 1
    }
  }, [isAuthChecked, isLoading, taskApiOk, activeTab, taskView, mgmtApiFilters, taskListFiltersKey, listRevision])

  useEffect(() => {
    if (activeTab !== 'chart' || !isAuthChecked || taskApiOk !== true || isLoading) return
    if (!mgmtApiFilters.ready) {
      setChartTasks([])
      setChartLoading(false)
      return
    }
    const f = mgmtApiFilters
    const requestId = ++chartManagementRequestIdRef.current
    const blockChartOverlay = chartTasksRef.current.length === 0
    void (async () => {
      if (blockChartOverlay) setChartLoading(true)
      try {
        const res = await window.api.task.listForManagementCharts({
          search: f.search || undefined,
          statusCodes: f.statusCodes.length ? f.statusCodes : undefined,
          assigneeUserIds: f.assigneeUserIds.length ? f.assigneeUserIds : undefined,
          typeCodes: f.typeCodes.length ? f.typeCodes : undefined,
          priorityCodes: f.priorityCodes.length ? f.priorityCodes : undefined,
          projectIds: f.projectIds.length ? f.projectIds : undefined,
          dateRange: f.dateRangeApi,
          createdDateRange: f.createdDateRangeApi,
          updatedDateRange: f.updatedDateRangeApi,
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
  }, [activeTab, isAuthChecked, taskApiOk, isLoading, mgmtApiFilters, listRevision])

  useEffect(() => {
    if (!isAuthChecked || isLoading || taskApiOk !== true) return
    if (activeTab !== 'tasks' || taskView === 'table') return
    if (!mgmtApiFilters.ready) {
      setBoardLoading(false)
      setBoardTasks([])
      setBoardTotal(0)
      setBoardTruncated(false)
      return
    }
    const f = mgmtApiFilters
    const requestId = ++boardManagementRequestIdRef.current
    void (async () => {
      const skipFullPageLoad = skipBoardFullPageLoadingRef.current
      skipBoardFullPageLoadingRef.current = false
      if (!skipFullPageLoad) setBoardLoading(true)
      try {
        const res = await window.api.task.listForManagementBoard({
          search: f.search || undefined,
          statusCodes: f.statusCodes.length ? f.statusCodes : undefined,
          assigneeUserIds: f.assigneeUserIds.length ? f.assigneeUserIds : undefined,
          typeCodes: f.typeCodes.length ? f.typeCodes : undefined,
          priorityCodes: f.priorityCodes.length ? f.priorityCodes : undefined,
          projectIds: f.projectIds.length ? f.projectIds : undefined,
          dateRange: f.dateRangeApi,
          createdDateRange: f.createdDateRangeApi,
          updatedDateRange: f.updatedDateRangeApi,
        })
        if (requestId !== boardManagementRequestIdRef.current) return
        if (res.status === 'error' && (res.code === 'UNAUTHORIZED' || res.code === 'FORBIDDEN')) {
          toast.error(t('taskManagement.tokenExpired'))
          setTaskApiOk(false)
          setBoardTasks([])
          setBoardTotal(0)
          setBoardTruncated(false)
          clearSession()
          return
        }
        if (res.status === 'success' && res.data) {
          setBoardTasks(res.data.tasks as Task[])
          setBoardTotal(res.data.total)
          setBoardTruncated(Boolean(res.data.truncated))
        } else {
          setBoardTasks([])
          setBoardTotal(0)
          setBoardTruncated(false)
        }
      } catch {
        if (requestId === boardManagementRequestIdRef.current) {
          setBoardTasks([])
          setBoardTotal(0)
          setBoardTruncated(false)
        }
      } finally {
        if (requestId === boardManagementRequestIdRef.current) setBoardLoading(false)
      }
    })()
    return () => {
      boardManagementRequestIdRef.current += 1
    }
  }, [activeTab, taskView, isAuthChecked, isLoading, taskApiOk, mgmtApiFilters, listRevision, taskListFiltersKey, t, clearSession])

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
    [t]
  )
  const getStatusLabel = (s: TaskStatus) => statuses.find(st => st.code === s)?.name ?? FALLBACK_STATUS[s] ?? s

  const tableToolbarColSpan = 2 + visibleColumnIds.length + 1

  const getPriorityLabel = useCallback((p: TaskPriority) => priorities.find(pr => pr.code === p)?.name ?? FALLBACK_PRIORITY[p] ?? p, [priorities])

  const getTypeLabel = useCallback(
    (ty?: TaskType) => {
      if (!ty) return '-'
      return types.find(tp => tp.code === ty)?.name ?? FALLBACK_TYPE[ty] ?? ty
    },
    [types]
  )

  const bulkStatusComboOptions = useMemo(() => {
    const rows = statuses.filter(s => s.is_active !== false)
    if (rows.length > 0) return rows.map(s => ({ value: s.code, label: s.name }))
    return (['new', 'in_progress', 'in_review', 'fixed', 'feedback', 'cancelled', 'done'] as TaskStatus[]).map(code => ({
      value: code,
      label: FALLBACK_STATUS[code] ?? code,
    }))
  }, [statuses, FALLBACK_STATUS])

  const bulkPriorityComboOptions = useMemo(() => {
    const rows = priorities.filter(p => p.is_active !== false)
    if (rows.length > 0) return rows.map(p => ({ value: p.code, label: p.name }))
    return (['critical', 'high', 'medium', 'low'] as TaskPriority[]).map(code => ({
      value: code,
      label: FALLBACK_PRIORITY[code] ?? code,
    }))
  }, [priorities, FALLBACK_PRIORITY])

  const locale = getDateFnsLocale(i18n.language)

  const statusColorMap = useMemo(() => Object.fromEntries(statuses.filter((s): s is typeof s & { color: string } => Boolean(s.color)).map(s => [s.code, s.color])), [statuses])
  const priorityColorMap = useMemo(
    () => Object.fromEntries(priorities.filter((p): p is typeof p & { color: string } => Boolean(p.color)).map(p => [p.code, p.color])),
    [priorities]
  )
  const typeColorMap = useMemo(() => Object.fromEntries(types.filter((t): t is typeof t & { color: string } => Boolean(t.color)).map(t => [t.code, t.color])), [types])

  const getBadgeStyle = useCallback((code: string, colorMap: Record<string, string>): React.CSSProperties | undefined => {
    const color = colorMap[code]
    if (!color) return undefined
    return { backgroundColor: color, color: getContrastingColor(color) }
  }, [])

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

  const getPriorityIcon = useCallback((p: TaskPriority) => {
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
  }, [])

  const getTypeIcon = useCallback((ty: TaskType) => {
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
  }, [])

  const getTypeBadgeClass = useCallback((typeCode: string, isFilterActive?: boolean) => {
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
  }, [])

  const taskKanbanCardPropsBase = useMemo(
    () => ({
      getPriorityLabel,
      getTypeLabel,
      getPriorityIcon,
      getTypeIcon,
      getTypeBadgeClass,
      getBadgeStyle,
      priorityColorMap,
      typeColorMap,
      statusColorMap,
    }),
    [getPriorityLabel, getTypeLabel, getPriorityIcon, getTypeIcon, getTypeBadgeClass, getBadgeStyle, priorityColorMap, typeColorMap, statusColorMap]
  )

  const ganttFilterRange = useMemo(() => {
    if (dateRange?.from == null) return undefined
    return { from: dateRange.from, to: dateRange.to ?? dateRange.from }
  }, [dateRange?.from, dateRange?.to])

  /** Range fetch workload: bám theo dateRange nếu có; nếu không, lấy ±60 ngày quanh hôm nay (đủ rộng cho zoom Tháng). */
  const workloadFetchRange = useMemo(() => {
    const today = startOfDay(new Date())
    const fallbackFrom = startOfDay(addDays(today, -60))
    const fallbackTo = startOfDay(addDays(today, 60))
    let fromD = ganttFilterRange?.from ?? fallbackFrom
    let toD = ganttFilterRange?.to ?? fallbackTo
    fromD = startOfDay(addDays(fromD, -14))
    toD = startOfDay(addDays(toD, 14))
    if (fromD.getTime() > toD.getTime()) [fromD, toD] = [toD, fromD]
    return { from: fromD, to: toD }
  }, [ganttFilterRange?.from, ganttFilterRange?.to])

  const workloadProjectId = projectFilter.length === 1 ? projectFilter[0] : null
  const workloadMultiProject = taskView === 'gantt' && projectFilter.length !== 1
  const workloadFromIso = format(workloadFetchRange.from, 'yyyy-MM-dd')
  const workloadToIso = format(workloadFetchRange.to, 'yyyy-MM-dd')

  const fetchWorkload = useCallback(async () => {
    if (taskView !== 'gantt' || !workloadProjectId) {
      setWorkloadData(null)
      setWorkloadLoading(false)
      return
    }
    const reqId = ++workloadRequestIdRef.current
    setWorkloadLoading(true)
    try {
      const res = await window.api.task.workload.get({ projectId: workloadProjectId, from: workloadFromIso, to: workloadToIso })
      if (reqId !== workloadRequestIdRef.current) return
      if (res?.status === 'success' && res.data) {
        setWorkloadData(res.data as WorkloadData)
      } else {
        setWorkloadData(null)
      }
    } catch {
      if (reqId === workloadRequestIdRef.current) setWorkloadData(null)
    } finally {
      if (reqId === workloadRequestIdRef.current) setWorkloadLoading(false)
    }
  }, [taskView, workloadProjectId, workloadFromIso, workloadToIso])

  useEffect(() => {
    void fetchWorkload()
  }, [fetchWorkload])

  const handleUpsertWorkloadOverride = useCallback(
    async (input: WorkloadOverrideUpsertInput) => {
      if (!workloadProjectId) return
      try {
        const res = await window.api.task.workload.upsertOverride({
          projectId: workloadProjectId,
          userId: input.userId,
          workDate: input.workDate,
          overrideHours: input.overrideHours,
          note: input.note,
        })
        if (res?.status !== 'success') {
          if (res?.code === 'FORBIDDEN') {
            toast.error(t('taskManagement.workloadOverrideReadOnly'))
          } else {
            toast.error(res?.message || 'Workload override failed')
          }
          return
        }
        await fetchWorkload()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error(msg)
      }
    },
    [workloadProjectId, fetchWorkload, t]
  )

  const calendarToolbarMessages = useMemo(
    () => ({
      agenda: t('taskManagement.calendarAgenda'),
      month: t('taskManagement.calendarMonth'),
      week: t('taskManagement.calendarWeek'),
      day: t('taskManagement.calendarDay'),
      today: t('taskManagement.calendarToday'),
      previous: t('taskManagement.calendarPrevious'),
      next: t('taskManagement.calendarNext'),
      toolbarViewLabel: t('taskManagement.calendarToolbarView'),
      allDayCollapseAria: t('taskManagement.calendarAllDayCollapseAria'),
      allDayExpandAria: t('taskManagement.calendarAllDayExpandAria'),
      allDayCollapseLabel: t('taskManagement.calendarAllDayCollapseLabel'),
      allDayExpandLabel: t('taskManagement.calendarAllDayExpandLabel'),
    }),
    [t]
  )

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

      <AlertDialog open={bulkSkipDetail.open} onOpenChange={open => setBulkSkipDetail(d => ({ ...d, open }))}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('taskManagement.bulkSkippedDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-left text-sm text-foreground">
                <ScrollArea className="max-h-[min(50vh,20rem)] rounded-md border border-border/80 p-2 mt-2">
                  <ul className="space-y-1 pr-3 text-xs leading-relaxed font-mono">
                    {bulkSkipDetail.lines.map((line, ix) => (
                      <li key={`${line}-${ix}`}>{line}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel>{t('common.close')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void navigator.clipboard.writeText(bulkSkipDetail.lines.join('\n'))
              }}
            >
              {t('taskManagement.bulkSkippedDialogCopy')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={importErrorDetail.open} onOpenChange={open => setImportErrorDetail(d => ({ ...d, open }))}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('taskManagement.importErrorLogTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-left text-sm text-foreground">
                <ScrollArea className="max-h-[min(50vh,22rem)] rounded-md border border-border/80 p-2 mt-2">
                  <pre className="whitespace-pre-wrap break-words pr-3 text-xs leading-relaxed">{importErrorDetail.text}</pre>
                </ScrollArea>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel>{t('common.close')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void navigator.clipboard.writeText(importErrorDetail.text)
              }}
            >
              {t('taskManagement.importErrorCopyAll')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {embedded && taskToolbarPortalTarget
        ? createPortal(
            <div className="flex items-center gap-2 min-w-0 h-full flex-wrap sm:flex-nowrap sm:justify-start" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
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
              {activeTab === 'tasks' && <TaskViewModeToggle value={taskView} onValueChange={setTaskView} disabled={isImporting || taskApiOk !== true} t={t} />}
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={reloadTaskMgmtMastersAndList}
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
            taskToolbarPortalTarget
          )
        : null}
      {embedded && taskToolbarActionsTarget
        ? createPortal(
            activeTab === 'tasks' ? (
              <div className="flex items-center gap-1 shrink-0 h-full" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
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
            taskToolbarActionsTarget
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
            {activeTab === 'tasks' && <TaskViewModeToggle value={taskView} onValueChange={setTaskView} disabled={isImporting || taskApiOk !== true} t={t} />}
            <div className="flex items-center gap-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={reloadTaskMgmtMastersAndList}
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
            <button
              type="button"
              onClick={() => handleWindow('minimize')}
              className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]"
            >
              <Minus size={15.5} strokeWidth={1} absoluteStrokeWidth />
            </button>
            <button
              type="button"
              onClick={() => handleWindow('maximize')}
              className="w-10 h-8 flex items-center justify-center hover:bg-[var(--hover-bg)] hover:text-[var(--hover-fg)]"
            >
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
          <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6 text-center">
            <GlowLoader className="w-10 h-10" />
            {isImporting ? (
              <>
                <p className="text-sm font-medium text-foreground">{t('taskManagement.importingCsv')}</p>
                <p className="text-xs text-muted-foreground max-w-sm">{importUiPhase === 'prep' ? t('taskManagement.importPhasePrep') : t('taskManagement.importPhaseRun')}</p>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <TabsContent value="tasks" className="flex-1 flex flex-col min-h-0 mt-0">
              <div className="shrink-0 flex flex-col gap-2 mb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex flex-wrap items-end gap-x-5 gap-y-2 flex-1 min-w-0">
                    <div className={cn('flex flex-col gap-1 min-w-0', requiresManualMgmtApply ? 'min-w-[220px] max-w-md flex-1' : 'min-w-[200px] max-w-xs shrink-0')}>
                      <Label htmlFor="task-search-input" className="text-[10px] font-normal text-muted-foreground leading-none whitespace-nowrap">
                        {t('taskManagement.toolbarSearchTitle')}
                      </Label>
                      <div className="flex items-center gap-1.5 h-8 w-full">
                        <div className="relative min-w-0 flex-1 h-8">
                          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="task-search-input"
                            placeholder={t('taskManagement.searchPlaceholder')}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => {
                              if (!requiresManualMgmtApply) return
                              if (e.key !== 'Enter') return
                              e.preventDefault()
                              commitMgmtFiltersFromDraft()
                            }}
                            className="pl-8 h-8"
                          />
                        </div>
                        {requiresManualMgmtApply ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant={mgmtSearchDirtyOrInitial ? 'default' : 'outline'}
                                size="sm"
                                className="h-8 shrink-0 px-3"
                                onClick={commitMgmtFiltersFromDraft}
                              >
                                {t('taskManagement.mgmtApplySearch')}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs text-left">
                              {t('taskManagement.mgmtApplySearchTooltip')}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                      <div className="flex min-w-0 shrink-0 flex-col gap-0.5">
                        <span className="text-[10px] leading-none whitespace-nowrap text-muted-foreground">{t('taskManagement.mgmtDateTimelineLabel')}</span>
                        <DateRangePickerPopover
                          dateRange={dateRange}
                          onDateRangeChange={setDateRange}
                          open={mgmtTimelinePickerOpen}
                          onOpenChange={setMgmtTimelinePickerOpen}
                          allTimeLabel={t('taskManagement.chartAllTime')}
                          confirmLabel={t('common.confirm')}
                          disabled={isImporting}
                          triggerClassName="h-8 min-h-8 max-w-[13rem] shrink-0"
                        />
                      </div>
                      <div className="flex min-w-0 shrink-0 flex-col gap-0.5">
                        <span className="text-[10px] leading-none whitespace-nowrap text-muted-foreground">{t('taskManagement.mgmtDateCreatedLabel')}</span>
                        <DateRangePickerPopover
                          dateRange={createdDateRange}
                          onDateRangeChange={setCreatedDateRange}
                          open={mgmtCreatedPickerOpen}
                          onOpenChange={setMgmtCreatedPickerOpen}
                          allTimeLabel={t('taskManagement.chartAllTime')}
                          confirmLabel={t('common.confirm')}
                          disabled={isImporting}
                          triggerClassName="h-8 min-h-8 max-w-[13rem] shrink-0"
                        />
                      </div>
                      <div className="flex min-w-0 shrink-0 flex-col gap-0.5">
                        <span className="text-[10px] leading-none whitespace-nowrap text-muted-foreground">{t('taskManagement.mgmtDateUpdatedLabel')}</span>
                        <DateRangePickerPopover
                          dateRange={updatedDateRange}
                          onDateRangeChange={setUpdatedDateRange}
                          open={mgmtUpdatedPickerOpen}
                          onOpenChange={setMgmtUpdatedPickerOpen}
                          allTimeLabel={t('taskManagement.chartAllTime')}
                          confirmLabel={t('common.confirm')}
                          disabled={isImporting}
                          triggerClassName="h-8 min-h-8 max-w-[13rem] shrink-0"
                        />
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[10px] font-normal leading-none whitespace-nowrap text-muted-foreground">{t('taskManagement.toolbarFiltersTitle')}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        {user?.id ? (
                          <TaskSavedViewsPopover
                            variant={buttonVariant}
                            disabled={isImporting || taskApiOk !== true}
                            savedViews={savedViews}
                            currentSnapshot={currentSavedSnapshot}
                            activeSavedViewId={matchingSavedView?.id ?? null}
                            pinnedViewDirty={pinnedSavedViewDirty}
                            onChangeSavedViews={setSavedViews}
                            onApplySnapshot={applySavedSnapshot}
                            onSelectSavedViewItem={v => setPinnedSavedViewId(v.id)}
                          />
                        ) : null}
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant={buttonVariant} size="sm" className={cn('h-8 gap-1.5', assigneeFilter.length > 0 && TASK_MGMT_FILTER_TRIGGER_ACTIVE)}>
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
                            <Button variant={buttonVariant} size="sm" className={cn('h-8 gap-1.5', projectFilter.length > 0 && TASK_MGMT_FILTER_TRIGGER_ACTIVE)}>
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
                            <Button variant={buttonVariant} size="sm" className={cn('h-8 gap-1.5', typeFilter.length > 0 && TASK_MGMT_FILTER_TRIGGER_ACTIVE)}>
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
                            <Button variant={buttonVariant} size="sm" className={cn('h-8 gap-1.5', statusFilter.length > 0 && TASK_MGMT_FILTER_TRIGGER_ACTIVE)}>
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
                                <Input
                                  placeholder={t('taskManagement.status')}
                                  value={statusFilterSearch}
                                  onChange={e => setStatusFilterSearch(e.target.value)}
                                  className="pl-8 h-8"
                                />
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
                            <Button variant={buttonVariant} size="sm" className={cn('h-8 gap-1.5', priorityFilter.length > 0 && TASK_MGMT_FILTER_TRIGGER_ACTIVE)}>
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
                        {hasNarrowingFilters && (
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            className="h-8 gap-1.5 shrink-0 border-destructive/80 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => clearNarrowingFilters()}
                          >
                            <X className="h-3.5 w-3.5 text-destructive" />
                            {t('taskManagement.filterReset')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  {taskView === 'table' && (
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
                                className={cn(
                                  'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm',
                                  isRequired ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-muted/80'
                                )}
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
                  )}
                </div>
              </div>
              {selectedTaskIds.size > 0 ? (
                <TaskBulkActionsBar
                  count={selectedTaskIds.size}
                  disabled={taskApiOk !== true || isImporting || listLoading || (requiresManualMgmtApply && !mgmtApiFilters.ready)}
                  variant={buttonVariant}
                  statusOptions={bulkStatusComboOptions}
                  priorityOptions={bulkPriorityComboOptions}
                  assigneeOptions={assigneeOptions}
                  onBulkApply={handleBulkApply}
                  onClearSelection={() => setSelectedTaskIds(new Set())}
                />
              ) : null}
              {taskView !== 'table' ? (
                <div className="flex min-w-0 flex-1 min-h-0 flex-col gap-2 mt-1">
                  {boardTruncated && (
                    <div className="shrink-0 rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
                      {t('taskManagement.boardListTruncated', {
                        shown: boardTasks.length,
                        total: boardTotal,
                        max: MANAGEMENT_BOARD_MAX_ROWS,
                      })}
                    </div>
                  )}
                  {requiresManualMgmtApply && !mgmtApiFilters.ready ? (
                    <div className="flex flex-col items-center justify-center flex-1 min-h-[280px] rounded-md border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center text-muted-foreground">
                      <p className="font-medium text-foreground">{t('taskManagement.mgmtPendingTitle')}</p>
                      <p className="mt-1 max-w-md text-sm">{t('taskManagement.mgmtPendingHint')}</p>
                      <Button
                        type="button"
                        className={cn('mt-4', PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE)}
                        variant="outline"
                        size="sm"
                        onClick={commitMgmtFiltersFromDraft}
                      >
                        {t('taskManagement.mgmtApplySearch')}
                      </Button>
                    </div>
                  ) : boardLoading && boardTasks.length === 0 ? (
                    <div className="flex flex-1 min-h-[280px] items-center justify-center">
                      <GlowLoader className="w-10 h-10" />
                    </div>
                  ) : boardTotal === 0 && !boardLoading ? (
                    <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground px-6 py-12 text-center">
                      <p className="font-medium text-foreground">{hasNarrowingFilters ? t('taskManagement.emptyFilteredTitle') : t('taskManagement.noTasks')}</p>
                      <p className="mt-1 max-w-md text-sm">{hasNarrowingFilters ? t('taskManagement.emptyFilteredHint') : t('taskManagement.emptyNoTasksHint')}</p>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {hasNarrowingFilters ? (
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            className="border-destructive/80 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => clearNarrowingFilters()}
                          >
                            <X className="h-3.5 w-3.5 text-destructive" />
                            {t('taskManagement.emptyClearFilters')}
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => {
                            if (projects.length === 0) {
                              toast.error(t('taskManagement.createProjectFirst'))
                              return
                            }
                            setEditingTaskInDialog(null)
                            setShowTaskDialog(true)
                          }}
                          className={cn(PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {t('taskManagement.createTask')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex flex-1 min-h-0 flex-col rounded-md bg-background shadow-sm min-w-0 overflow-hidden">
                      {boardLoading ? (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/55 backdrop-blur-[1px]" aria-busy aria-live="polite">
                          <GlowLoader className="w-10 h-10" />
                        </div>
                      ) : null}
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                        {taskView === 'board' && (
                          <TaskKanbanBoard
                            tasks={boardTasks as unknown as TaskTableRowTask[]}
                            statuses={statuses}
                            statusColorMap={statusColorMap}
                            onMoveTask={handleBoardMoveStatus}
                            onOpenTask={handleOpenTaskRow}
                            getAssigneeDisplay={getAssigneeDisplay}
                            selectedTaskIds={selectedTaskIds}
                            onToggleTaskSelect={toggleBulkTaskSelection}
                            currentUserId={user?.id ?? null}
                            cardPropsBase={taskKanbanCardPropsBase}
                            disableSwimlanes={!canManageTaskRowGrouping}
                          />
                        )}
                        {taskView === 'gantt' && (
                          <TaskGanttView
                            tasks={boardTasks as unknown as TaskTableRowTask[]}
                            locale={locale}
                            language={i18n.language}
                            filterRange={ganttFilterRange}
                            statusColorMap={statusColorMap}
                            getAssigneeDisplay={getAssigneeDisplay}
                            getStatusLabel={getStatusLabel}
                            getPriorityLabel={getPriorityLabel}
                            getStatusIcon={getStatusIcon}
                            getPriorityIcon={getPriorityIcon}
                            getStatusToneClass={code => STATUS_FILTER_COLOR[code] ?? 'text-foreground'}
                            getPriorityToneClass={code => PRIORITY_FILTER_COLOR[code] ?? 'text-foreground'}
                            onSelectTask={handleOpenTaskRow}
                            selectedTaskIds={selectedTaskIds}
                            onToggleTaskSelect={toggleBulkTaskSelection}
                            onUpdatePlanDates={handleUpdatePlanDates}
                            disableRowGrouping={!canManageTaskRowGrouping}
                            workloadData={workloadData}
                            workloadLoading={workloadLoading}
                            workloadMultiProject={workloadMultiProject}
                            onUpsertWorkloadOverride={handleUpsertWorkloadOverride}
                            labels={{
                              week: t('taskManagement.ganttScaleWeek'),
                              month: t('taskManagement.ganttScaleMonth'),
                              twoWeek: t('taskManagement.ganttScaleTwoWeek'),
                              monthly: t('taskManagement.ganttScaleMonthly'),
                              unscheduled: t('taskManagement.ganttUnscheduled'),
                              zoom: t('taskManagement.ganttZoom'),
                              emptyScheduled: t('taskManagement.ganttEmptyScheduled'),
                              fitRange: t('taskManagement.ganttFitRange'),
                              goToToday: t('taskManagement.ganttGoToToday'),
                              todayMark: t('taskManagement.ganttTodayTooltip'),
                              groupRows: t('taskManagement.ganttGroupRows'),
                              groupingFlat: t('taskManagement.ganttGroupingFlat'),
                              groupingByAssignee: t('taskManagement.ganttGroupingByAssignee'),
                              groupingByProject: t('taskManagement.ganttGroupingByProject'),
                              resizeLabelColumn: t('taskManagement.ganttResizeLabelColumn'),
                              gridBordersSwitch: t('taskManagement.ganttGridBordersSwitch'),
                              gridBordersHelp: t('taskManagement.ganttGridBordersHelp'),
                            }}
                          />
                        )}
                        {taskView === 'calendar' && (
                          <TaskCalendarView
                            tasks={boardTasks as unknown as TaskTableRowTask[]}
                            language={i18n.language}
                            messages={calendarToolbarMessages}
                            statusColorMap={statusColorMap}
                            onSelectTask={handleOpenTaskRow}
                            selectedTaskIds={selectedTaskIds}
                            onToggleTaskSelect={toggleBulkTaskSelection}
                            unscheduledLabel={t('taskManagement.calendarNoPlanDates')}
                            onUpdatePlanDates={handleUpdatePlanDates}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : requiresManualMgmtApply && !mgmtApiFilters.ready ? (
                <div className="flex flex-col items-center justify-center flex-1 rounded-md border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center text-muted-foreground">
                  <p className="font-medium text-foreground">{t('taskManagement.mgmtPendingTitle')}</p>
                  <p className="mt-1 max-w-md text-sm">{t('taskManagement.mgmtPendingHint')}</p>
                  <Button
                    type="button"
                    className={cn('mt-4', PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE)}
                    variant="outline"
                    size="sm"
                    onClick={commitMgmtFiltersFromDraft}
                  >
                    {t('taskManagement.mgmtApplySearch')}
                  </Button>
                </div>
              ) : totalCount === 0 && !listLoading ? (
                <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground px-6 text-center">
                  <p className="font-medium text-foreground">{hasNarrowingFilters ? t('taskManagement.emptyFilteredTitle') : t('taskManagement.noTasks')}</p>
                  <p className="mt-1 max-w-md text-sm">{hasNarrowingFilters ? t('taskManagement.emptyFilteredHint') : t('taskManagement.emptyNoTasksHint')}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {hasNarrowingFilters ? (
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        className="border-destructive/80 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => clearNarrowingFilters()}
                      >
                        <X className="h-3.5 w-3.5 text-destructive" />
                        {t('taskManagement.emptyClearFilters')}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => {
                        if (projects.length === 0) {
                          toast.error(t('taskManagement.createProjectFirst'))
                          return
                        }
                        setEditingTaskInDialog(null)
                        setShowTaskDialog(true)
                      }}
                      className={cn(PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('taskManagement.createTask')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 border rounded-md overflow-hidden shadow-sm flex flex-col">
                  {listLoading ? (
                    <div className="h-1 w-full shrink-0 bg-primary/20" aria-hidden="true" title={t('taskManagement.tableLoading')}>
                      <div className="h-full w-1/3 origin-left animate-pulse rounded-r bg-primary/60 motion-reduce:animate-none" />
                    </div>
                  ) : null}
                  <div className="relative flex min-h-0 flex-1 flex-col">
                    {listLoading && tableTasks.length > 0 ? (
                      <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-background/65" aria-busy="true" aria-live="polite">
                        <GlowLoader className="w-10 h-10" />
                      </div>
                    ) : null}
                    <div className="min-h-0 flex-1 overflow-auto overflow-x-auto">
                      <Table className="w-max min-w-full">
                        <TableHeader sticky>
                          <TableRow>
                            <TableHead className="!text-[var(--table-header-fg)] w-9 min-w-9 px-1 text-center">
                              <Checkbox
                                disabled={listLoading || tableTasks.length === 0}
                                checked={tableTasks.length > 0 && tableTasks.every(t => selectedTaskIds.has(t.id))}
                                onCheckedChange={v => {
                                  const on = v === true
                                  setSelectedTaskIds(prev => {
                                    const next = new Set(prev)
                                    for (const t of tableTasks) {
                                      if (on) next.add(t.id)
                                      else next.delete(t.id)
                                    }
                                    return next
                                  })
                                }}
                                aria-label={t('taskManagement.bulkSelectPage')}
                              />
                            </TableHead>
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
                              <SortHeader
                                col="assigneeUserId"
                                label={t('taskManagement.assignee')}
                                sortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSort={handleSortClick}
                              />
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
                          {listLoading && tableTasks.length === 0
                            ? Array.from({ length: 8 }).map((_, ri) => (
                                <TableRow key={`tbl-sk-${ri}`} aria-hidden>
                                  <TableCell colSpan={tableToolbarColSpan} className="py-3">
                                    <Skeleton className="h-9 w-full max-w-4xl mx-auto rounded-md opacity-85" />
                                  </TableCell>
                                </TableRow>
                              ))
                            : tableTasks.map((task, idx) => (
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
                                  onCopy={taskRow => handleCopyTask(taskRow as Task)}
                                  onToggleFavorite={handleToggleFavorite}
                                  isFavorite={favoriteTaskIds.has(task.id)}
                                  visibleColumnIds={visibleColumnIds}
                                  bulkSelect={{
                                    checked: selectedTaskIds.has(task.id),
                                    onToggle: () => toggleBulkTaskSelection(task.id),
                                  }}
                                />
                              ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  {taskView === 'table' && totalCount > 0 && (
                    <div className="flex shrink-0 flex-col border-t border-border/70 bg-background">
                      <TablePaginationBar
                        page={taskPage}
                        totalPages={totalPages}
                        totalItems={totalCount}
                        pageSize={pageSize}
                        onPageChange={setTaskPage}
                        onPageSizeChange={setPageSize}
                        pageSizeOptions={PAGE_SIZE_OPTIONS}
                      />
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {showChartTab && (
              <TabsContent value="chart" className="flex-1 flex flex-col min-h-0 mt-0">
                {requiresManualMgmtApply && !mgmtApiFilters.ready ? (
                  <div className="flex flex-col items-center justify-center flex-1 min-h-[240px] rounded-md border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center text-muted-foreground">
                    <p className="font-medium text-foreground">{t('taskManagement.mgmtPendingTitle')}</p>
                    <p className="mt-1 max-w-md text-sm">{t('taskManagement.mgmtPendingHint')}</p>
                    <Button
                      type="button"
                      className={cn('mt-4', PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE)}
                      variant="outline"
                      size="sm"
                      onClick={commitMgmtFiltersFromDraft}
                    >
                      {t('taskManagement.mgmtApplySearch')}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex shrink-0 flex-wrap items-end gap-2 pb-2 mb-2 border-b border-border/70">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-[10px] font-normal leading-none text-muted-foreground whitespace-nowrap">{t('taskManagement.mgmtDateTimelineLabel')}</span>
                        <DateRangePickerPopover
                          dateRange={dateRange}
                          onDateRangeChange={setDateRange}
                          open={chartTimelinePickerOpen}
                          onOpenChange={setChartTimelinePickerOpen}
                          allTimeLabel={t('taskManagement.chartAllTime')}
                          confirmLabel={t('common.confirm')}
                          disabled={isImporting}
                          triggerClassName="h-8 min-h-8 max-w-[16rem]"
                        />
                      </div>
                    </div>
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
                        <TaskCharts
                          tasks={chartTasks}
                          users={users}
                          statuses={statuses}
                          priorities={priorities}
                          types={types}
                          dateRange={dateRange}
                          persistSessionScope={taskMgmtSessionScope}
                        />
                      )}
                    </Suspense>
                  </>
                )}
              </TabsContent>
            )}
          </>
        )}
      </div>
    </Tabs>
  )
}
