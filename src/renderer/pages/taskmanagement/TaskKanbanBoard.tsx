'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowUpRight, Briefcase, ChevronDown, ChevronRight, Layers, PanelLeftClose, SlidersHorizontal, Users } from 'lucide-react'
import {
  createContext,
  memo,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { TaskBoardCard, type TaskBoardCardProps } from './TaskBoardCard'
import type { TaskTableRowTask } from './TaskTableRow'
import { taskStatusKanbanColumnBodyStyle, taskStatusKanbanHeaderStyle } from './taskStatusVisual'

/** Kích hoạt kéo sau khi di chuyển (px) — tránh nhầm với click. */
const DRAG_ACTIVATION_PX = 8

const LS_ORDER_KEY = 'honey_badger.taskKanban.colOrder.v2'
const LS_WIP_KEY = 'honey_badger.taskKanban.wip.v1'
const LS_SWIM_KEY = 'honey_badger.taskKanban.swimlane.v1'
const LS_COLLAPSED_KEY = 'honey_badger.taskKanban.collapsedCols.v1'
const LS_ONLY_MINE_KEY = 'honey_badger.taskKanban.onlyMine.v1'

/** Flat: virtual khi ≥ ngưỡng — không mount full list. */
const KANBAN_VIRTUAL_MIN_TASKS = 36
const KANBAN_VIRTUAL_ESTIMATE_PX = 120

export type KanbanMasterStatus = { code: string; name: string; is_active?: boolean; sort_order?: number }
export type KanbanSwimlaneMode = 'flat' | 'assignee' | 'project'

function loadJsonLs<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveJsonLs(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch {
    /* ignore quota */
  }
}

function arrayMoveIds(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids
  const next = [...ids]
  const item = next[from]
  if (item === undefined) return ids
  next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function sortedTasksForStatus(statusCode: string, rows: TaskTableRowTask[], orderByColumn: Record<string, string[]>): TaskTableRowTask[] {
  const inCol = rows.filter(t => t.status === statusCode)
  const order = orderByColumn[statusCode]
  if (!order?.length) return inCol

  const byId = new Map(inCol.map(t => [t.id, t]))
  const picked: TaskTableRowTask[] = []
  const seen = new Set<string>()
  for (const id of order) {
    const row = byId.get(id)
    if (row) {
      picked.push(row)
      seen.add(id)
    }
  }
  for (const t of inCol) {
    if (!seen.has(t.id)) picked.push(t)
  }
  return picked
}

type LaneSeg = { key: string; title: string; tasks: TaskTableRowTask[] }

function segmentedBySwimlane(sorted: TaskTableRowTask[], swim: KanbanSwimlaneMode, getAssigneeDisplay: (id: string | null) => string): LaneSeg[] {
  if (swim === 'flat') return [{ key: 'flat', title: '', tasks: sorted }]

  type LaneEntry = { title: string; tasks: TaskTableRowTask[] }
  const laneMap = new Map<string, LaneEntry>()

  for (const t of sorted) {
    let laneId = ''
    let title = ''
    if (swim === 'assignee') {
      const uid = t.assigneeUserId?.trim()
      laneId = uid && uid !== '' ? uid : '_none'
      title = uid && uid !== '' ? getAssigneeDisplay(uid) || uid : '(—)'
    } else {
      const pid = t.projectId?.trim()
      laneId = pid && pid !== '' ? pid : '_none'
      title = (t.project && String(t.project).trim()) || (pid && pid !== '' ? pid : '(—)')
    }

    let entry = laneMap.get(laneId)
    if (!entry) {
      entry = { title, tasks: [] }
      laneMap.set(laneId, entry)
    }
    entry.tasks.push(t)
  }

  const ordered = [...laneMap.entries()].sort((a, b) => {
    const [idA, ga] = a
    const [idB, gb] = b
    const aN = idA === '_none' ? 1 : 0
    const bN = idB === '_none' ? 1 : 0
    if (aN !== bN) return aN - bN
    return ga.title.localeCompare(gb.title, undefined, { sensitivity: 'base' })
  })

  return ordered.map(([laneId, g], i) => ({ key: `${laneId}_${i}`, title: g.title, tasks: g.tasks }))
}

type KanbanDragContextValue = {
  draggingTaskId: string | null
  onCardPointerDown: (task: TaskTableRowTask, event: ReactPointerEvent<HTMLDivElement>) => void
}

const KanbanDragContext = createContext<KanbanDragContextValue | null>(null)

/** Hit-test — bỏ qua card đang kéo (vẫn nằm trong DOM, opacity 0). */
function resolveDropFromPoint(
  clientX: number,
  clientY: number,
  ignoreTaskId: string | null,
): { columnCode: string | null; overTaskId: string | null } {
  let overTaskId: string | null = null
  let columnCode: string | null = null
  try {
    const stack = document.elementsFromPoint(clientX, clientY)
    for (const node of stack) {
      if (!(node instanceof HTMLElement)) continue
      const host = node.closest('[data-kanban-task-id]')
      const tid = host?.getAttribute('data-kanban-task-id') ?? null
      if (tid && tid !== ignoreTaskId) {
        overTaskId = tid
        break
      }
    }
    for (const node of stack) {
      if (!(node instanceof HTMLElement)) continue
      const host = node.closest('[data-kanban-column]')
      const col = host?.getAttribute('data-kanban-column') ?? null
      if (col) {
        columnCode = col
        break
      }
    }
  } catch {
    /* ignore */
  }
  return { columnCode, overTaskId }
}

const DraggableKanbanCard = memo(function DraggableKanbanCard({
  task,
  cardPropsBase,
  getAssigneeDisplay,
  onOpenTask,
  selected,
  onToggleSelect,
}: {
  task: TaskTableRowTask
  cardPropsBase: Omit<TaskBoardCardProps, 'task' | 'assigneeDisplay'>
  getAssigneeDisplay: (assigneeUserId: string | null) => string
  onOpenTask: (task: TaskTableRowTask) => void
  selected?: boolean
  onToggleSelect?: (taskId: string) => void
}) {
  const { t } = useTranslation()
  const ctx = useContext(KanbanDragContext)
  const dragging = ctx?.draggingTaskId === task.id

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    ctx?.onCardPointerDown(task, e)
  }

  return (
    <div
      data-kanban-task-id={task.id}
      onPointerDown={onPointerDown}
      className={cn(
        'rounded-md bg-card touch-none cursor-grab active:cursor-grabbing select-none',
        dragging && 'opacity-0',
      )}
      style={{ touchAction: 'none' }}
    >
      <TaskBoardCard
        task={task}
        assigneeDisplay={getAssigneeDisplay(task.assigneeUserId)}
        {...cardPropsBase}
        titleStartSlot={
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('taskManagement.kanbanOpenTaskDetails')}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              onOpenTask(task)
            }}
          >
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </button>
        }
        badgeRowTrailingSlot={
          onToggleSelect && (task.type ?? 'bug') !== 'milestone' ? (
            <Checkbox
              checked={Boolean(selected)}
              onCheckedChange={() => onToggleSelect(task.id)}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              className="h-4 w-4"
              aria-label={`Bulk select ${task.title || 'task'}`}
            />
          ) : undefined
        }
      />
    </div>
  )
})

function VirtualKanbanFlatList({
  tasks,
  scrollRef,
  cardPropsBase,
  getAssigneeDisplay,
  onCardClick,
  selectedTaskIds,
  onToggleTaskSelect,
}: {
  tasks: TaskTableRowTask[]
  scrollRef: RefObject<HTMLDivElement | null>
  cardPropsBase: Omit<TaskBoardCardProps, 'task' | 'assigneeDisplay'>
  getAssigneeDisplay: (assigneeUserId: string | null) => string
  onCardClick: (task: TaskTableRowTask) => void
  selectedTaskIds?: Set<string>
  onToggleTaskSelect?: (taskId: string) => void
}) {
  const tasksRowKey = useMemo(() => tasks.map(t => t.id).join('\x1e'), [tasks])

  const rowVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => KANBAN_VIRTUAL_ESTIMATE_PX,
    overscan: 8,
    getItemKey: index => tasks[index]?.id ?? `__vacant:${String(index)}`,
  })

  useLayoutEffect(() => {
    rowVirtualizer.measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksRowKey])

  return (
    <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
      {rowVirtualizer.getVirtualItems().map(vi => {
        const task = tasks[vi.index]
        return (
          <div key={task.id} data-index={vi.index} ref={rowVirtualizer.measureElement} className="absolute left-0 w-full pb-2.5" style={{ top: vi.start }}>
            <DraggableKanbanCard
              task={task}
              cardPropsBase={cardPropsBase}
              getAssigneeDisplay={getAssigneeDisplay}
              onOpenTask={onCardClick}
              selected={selectedTaskIds?.has(task.id)}
              onToggleSelect={onToggleTaskSelect}
            />
          </div>
        )
      })}
    </div>
  )
}

function columnTaskMembershipKey(tasks: TaskTableRowTask[]) {
  return tasks
    .map(t => t.id)
    .sort()
    .join('\x1e')
}

const KanbanColumn = memo(function KanbanColumn(props: {
  statusCode: string
  label: string
  sortedTasks: TaskTableRowTask[]
  swimlaneMode: KanbanSwimlaneMode
  cardPropsBase: Omit<TaskBoardCardProps, 'task' | 'assigneeDisplay'>
  getAssigneeDisplay: (assigneeUserId: string | null) => string
  onCardClick: (task: TaskTableRowTask) => void
  selectedTaskIds?: Set<string>
  onToggleTaskSelect?: (taskId: string) => void
  statusColorHex?: string
  wipLimit?: number
  onCommitWip: (columnCode: string, limit: number | undefined) => void
  wipExceededLabel: string
  wipDialogTitle: string
  wipDialogSave: string
  collapsed?: boolean
  onToggleCollapsed?: (columnCode: string) => void
  ariaCollapseColumn?: string
  ariaExpandColumn?: string
  columnDropActive?: boolean
}) {
  const {
    statusCode,
    label,
    sortedTasks,
    swimlaneMode,
    cardPropsBase,
    getAssigneeDisplay,
    onCardClick,
    selectedTaskIds,
    onToggleTaskSelect,
    statusColorHex,
    wipLimit,
    onCommitWip,
    wipExceededLabel,
    wipDialogTitle,
    wipDialogSave,
    collapsed = false,
    onToggleCollapsed,
    ariaCollapseColumn,
    ariaExpandColumn,
    columnDropActive = false,
  } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerTint = taskStatusKanbanHeaderStyle(statusColorHex)
  const columnBodyTint = taskStatusKanbanColumnBodyStyle(statusColorHex)
  const wipBad = wipLimit !== undefined && sortedTasks.length > wipLimit

  const [wipDraft, setWipDraft] = useState(() => (wipLimit === undefined ? '' : String(wipLimit)))

  const columnMembershipKey = useMemo(() => columnTaskMembershipKey(sortedTasks), [sortedTasks])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = 0
  }, [columnMembershipKey])

  useEffect(() => {
    setWipDraft(wipLimit === undefined ? '' : String(wipLimit))
  }, [wipLimit])

  const laneSegs = useMemo(() => segmentedBySwimlane(sortedTasks, swimlaneMode, getAssigneeDisplay), [sortedTasks, swimlaneMode, getAssigneeDisplay])

  /** true = thu gọn (ẩn card) trong nhóm assignee/project — key duy nhất theo cột + lane. */
  const [swimlaneGroupFolded, setSwimlaneGroupFolded] = useState<Record<string, boolean>>({})
  const toggleSwimlaneGroupFold = useCallback((laneFoldKey: string) => {
    setSwimlaneGroupFolded(prev => ({ ...prev, [laneFoldKey]: !prev[laneFoldKey] }))
  }, [])

  const { t } = useTranslation()

  const handleColumnCollapseToggle = useCallback(() => {
    onToggleCollapsed?.(statusCode)
  }, [onToggleCollapsed, statusCode])

  const handleWipCommit = useCallback(() => {
    const n = wipDraft.trim() === '' ? undefined : Number(wipDraft)
    if (n !== undefined && (Number.isNaN(n) || n < 1)) return
    onCommitWip(statusCode, n)
  }, [wipDraft, onCommitWip, statusCode])

  if (collapsed && onToggleCollapsed) {
    return (
      <div
        data-kanban-column={statusCode}
        className="flex w-11 shrink-0 flex-1 flex-col self-stretch min-h-0 overflow-hidden rounded-lg bg-muted/45 dark:bg-muted/30"
      >
        <div className={cn('flex min-h-0 flex-1 flex-col items-center gap-2 px-1 py-2', columnDropActive && 'rounded-lg bg-primary/18 dark:bg-primary/22')}>
          <button
            type="button"
            onClick={handleColumnCollapseToggle}
            className="flex h-8 w-full shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={ariaExpandColumn ?? 'Expand column'}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span
            className="line-clamp-[12] flex-1 select-none text-center text-[10px] font-semibold leading-tight text-foreground"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            title={`${label} (${sortedTasks.length})`}
          >
            {label}
          </span>
          <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">{sortedTasks.length}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      data-kanban-column={statusCode}
      className="flex min-h-0 min-w-[220px] flex-1 basis-0 flex-col self-stretch overflow-hidden rounded-lg bg-muted/45 dark:bg-muted/30"
    >
      <div className="shrink-0 rounded-t-lg px-2 py-1.5 text-xs font-semibold text-foreground" style={headerTint}>
        <div className="flex items-center gap-1.5 justify-between">
          <span className="min-w-0 truncate">
            {label}
            <span className={cn('ml-1.5 font-normal', wipBad ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
              ({sortedTasks.length}
              {wipLimit !== undefined ? `/${wipLimit}` : ''}){wipBad ? ` • ${wipExceededLabel}` : ''}
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            {onToggleCollapsed ? (
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground"
                aria-label={ariaCollapseColumn ?? 'Collapse column'}
                onClick={handleColumnCollapseToggle}
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground"
                  aria-label={wipDialogTitle}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 space-y-2 p-3">
                <Label className="text-xs">{wipDialogTitle}</Label>
                <Input value={wipDraft} onChange={e => setWipDraft(e.target.value)} placeholder="∞" className="h-8 text-sm" inputMode="numeric" />
                <Button size="sm" className="w-full h-8" type="button" onClick={handleWipCommit}>
                  {wipDialogSave}
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 basis-0 overflow-y-auto overflow-x-hidden" onWheel={e => e.stopPropagation()}>
        <div
          data-kanban-column={statusCode}
          className={cn('flex min-h-full flex-col gap-2.5 rounded-b-lg p-2', columnDropActive && 'bg-primary/18 dark:bg-primary/22')}
          style={columnDropActive ? undefined : columnBodyTint}
        >
          {laneSegs.map(seg => {
            const laneFoldKey = `${statusCode}::${seg.key}`
            const isLaneFolded = Boolean(swimlaneGroupFolded[laneFoldKey])

            return seg.title ? (
              <div key={`${statusCode}-lane-${seg.key}`} className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSwimlaneGroupFold(laneFoldKey)}
                  className="flex w-full min-h-8 min-w-0 items-center gap-1 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-muted/50"
                  aria-expanded={!isLaneFolded}
                  aria-label={
                    isLaneFolded
                      ? t('taskManagement.kanbanSwimlaneGroupExpand', {
                          group: `${seg.title} (${seg.tasks.length})`,
                        })
                      : t('taskManagement.kanbanSwimlaneGroupCollapse', {
                          group: `${seg.title} (${seg.tasks.length})`,
                        })
                  }
                >
                  <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
                    <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{seg.title}</span>
                    <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">({seg.tasks.length})</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground" aria-hidden>
                    {isLaneFolded ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </span>
                </button>
                {!isLaneFolded
                  ? seg.tasks.map(task => (
                      <DraggableKanbanCard
                        key={task.id}
                        task={task}
                        cardPropsBase={cardPropsBase}
                        getAssigneeDisplay={getAssigneeDisplay}
                        onOpenTask={onCardClick}
                        selected={selectedTaskIds?.has(task.id)}
                        onToggleSelect={onToggleTaskSelect}
                      />
                    ))
                  : null}
              </div>
            ) : swimlaneMode === 'flat' && seg.tasks.length >= KANBAN_VIRTUAL_MIN_TASKS ? (
              <VirtualKanbanFlatList
                key={`flat-v-${statusCode}-${columnTaskMembershipKey(seg.tasks)}`}
                tasks={seg.tasks}
                scrollRef={scrollRef}
                cardPropsBase={cardPropsBase}
                getAssigneeDisplay={getAssigneeDisplay}
                onCardClick={onCardClick}
                selectedTaskIds={selectedTaskIds}
                onToggleTaskSelect={onToggleTaskSelect}
              />
            ) : (
              <div key={`${statusCode}-flat`} className="flex flex-col gap-2.5">
                {seg.tasks.map(task => (
                  <DraggableKanbanCard
                    key={task.id}
                    task={task}
                    cardPropsBase={cardPropsBase}
                    getAssigneeDisplay={getAssigneeDisplay}
                    onOpenTask={onCardClick}
                    selected={selectedTaskIds?.has(task.id)}
                    onToggleSelect={onToggleTaskSelect}
                  />
                ))}
              </div>
            )
          })}
          {sortedTasks.length === 0 ? <div className="rounded-b-lg bg-muted/25 py-8 text-center text-[11px] text-muted-foreground dark:bg-muted/20">—</div> : null}
        </div>
      </div>
    </div>
  )
})

export function TaskKanbanBoard({
  tasks,
  statuses,
  statusColorMap,
  onMoveTask,
  onOpenTask,
  cardPropsBase,
  getAssigneeDisplay,
  selectedTaskIds,
  onToggleTaskSelect,
  currentUserId,
  disableSwimlanes = false,
}: {
  tasks: TaskTableRowTask[]
  statuses: KanbanMasterStatus[]
  statusColorMap?: Record<string, string>
  onMoveTask: (taskId: string, newStatus: string, version?: number) => Promise<void>
  onOpenTask: (task: TaskTableRowTask) => void
  cardPropsBase: Omit<TaskBoardCardProps, 'task' | 'assigneeDisplay'>
  getAssigneeDisplay: (assigneeUserId: string | null) => string
  selectedTaskIds?: Set<string>
  onToggleTaskSelect?: (taskId: string) => void
  currentUserId?: string | null
  disableSwimlanes?: boolean
}) {
  const { t } = useTranslation()
  const [orderMap, setOrderMap] = useState<Record<string, string[]>>(() => loadJsonLs(LS_ORDER_KEY, {}))
  const [wipMap, setWipMap] = useState<Record<string, number>>(() => loadJsonLs(LS_WIP_KEY, {}))
  const [swimlaneMode, setSwimlaneMode] = useState<KanbanSwimlaneMode>(() => loadJsonLs(LS_SWIM_KEY, 'flat'))
  const [onlyMine, setOnlyMine] = useState(() => loadJsonLs<boolean>(LS_ONLY_MINE_KEY, false))
  const [collapsedCols, setCollapsedCols] = useState<string[]>(() => loadJsonLs(LS_COLLAPSED_KEY, []))
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [dropHighlightColumnCode, setDropHighlightColumnCode] = useState<string | null>(null)

  const draggingTaskIdRef = useRef<string | null>(null)

  useEffect(() => {
    draggingTaskIdRef.current = draggingTaskId
  }, [draggingTaskId])

  const overlayRef = useRef<HTMLDivElement | null>(null)
  const overlayRafRef = useRef<number>(0)
  const pendingDropRef = useRef<{ columnCode: string | null; overTaskId: string | null }>({ columnCode: null, overTaskId: null })
  const dropHighlightColRef = useRef<string | null>(null)
  const dragSessionRef = useRef<{
    taskId: string
    pointerId: number
    sourceEl: HTMLElement | null
    grabOffsetX: number
    grabOffsetY: number
    originX: number
    originY: number
    started: boolean
  } | null>(null)

  const visibleTasksRef = useRef<TaskTableRowTask[]>([])
  const sortedByColumnRef = useRef<Record<string, TaskTableRowTask[]>>({})
  const onMoveTaskRef = useRef(onMoveTask)
  const persistOrderColRef = useRef<(code: string, ids: string[]) => void>(() => {})

  useEffect(() => {
    saveJsonLs(LS_ONLY_MINE_KEY, onlyMine)
  }, [onlyMine])

  useEffect(() => {
    saveJsonLs(LS_COLLAPSED_KEY, collapsedCols)
  }, [collapsedCols])

  useEffect(() => {
    const uid = (currentUserId || '').trim()
    if (!uid && onlyMine) setOnlyMine(false)
  }, [currentUserId, onlyMine])

  useEffect(() => {
    onMoveTaskRef.current = onMoveTask
  }, [onMoveTask])

  const collapsedSet = useMemo(() => new Set(collapsedCols), [collapsedCols])
  const swimlaneEffective = disableSwimlanes ? 'flat' : swimlaneMode

  const visibleTasks = useMemo(() => {
    const uid = (currentUserId || '').trim()
    const base = !onlyMine || !uid ? tasks : tasks.filter(x => (x.assigneeUserId || '').trim() === uid)
    return base.filter(x => (x.type ?? 'bug') !== 'milestone')
  }, [tasks, onlyMine, currentUserId])

  const toggleColCollapsed = useCallback((code: string) => {
    setCollapsedCols(prev => (prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]))
  }, [])

  useEffect(() => {
    if (disableSwimlanes) return
    saveJsonLs(LS_SWIM_KEY, swimlaneMode)
  }, [disableSwimlanes, swimlaneMode])

  const activeStatuses = useMemo(
    () => [...statuses].filter(s => s.is_active !== false).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.code.localeCompare(b.code)),
    [statuses],
  )

  const orderedCodes = useMemo(() => {
    const extra = new Set<string>()
    for (const t of visibleTasks) extra.add(t.status)
    const ordered = [...activeStatuses.map(s => s.code)]
    for (const c of extra) {
      if (!ordered.includes(c)) ordered.push(c)
    }
    return ordered
  }, [visibleTasks, activeStatuses])

  const sortedByColumn = useMemo(() => {
    const o: Record<string, TaskTableRowTask[]> = {}
    for (const code of orderedCodes) {
      o[code] = sortedTasksForStatus(code, visibleTasks, orderMap)
    }
    return o
  }, [visibleTasks, orderMap, orderedCodes])

  useEffect(() => {
    visibleTasksRef.current = visibleTasks
    sortedByColumnRef.current = sortedByColumn
  }, [visibleTasks, sortedByColumn])

  const persistOrderCol = useCallback((code: string, nextIds: string[]) => {
    setOrderMap(prev => {
      const n = { ...prev, [code]: nextIds }
      saveJsonLs(LS_ORDER_KEY, n)
      return n
    })
  }, [])

  useEffect(() => {
    persistOrderColRef.current = persistOrderCol
  }, [persistOrderCol])

  const activeDragTask = useMemo(() => {
    if (!draggingTaskId) return null
    return visibleTasks.find(x => x.id === draggingTaskId) ?? null
  }, [draggingTaskId, visibleTasks])

  const handleCommitColumnWip = useCallback((columnCode: string, limit: number | undefined) => {
    setWipMap(prev => {
      const nx = { ...prev }
      if (limit === undefined || limit < 1) delete nx[columnCode]
      else nx[columnCode] = limit
      saveJsonLs(LS_WIP_KEY, nx)
      return nx
    })
  }, [])

  const commitDrop = useCallback(async (taskId: string) => {
    const { columnCode, overTaskId } = pendingDropRef.current
    pendingDropRef.current = { columnCode: null, overTaskId: null }
    setDraggingTaskId(null)
    draggingTaskIdRef.current = null
    dropHighlightColRef.current = null
    setDropHighlightColumnCode(null)

    if (!columnCode) return

    const visible = visibleTasksRef.current
    const byCol = sortedByColumnRef.current
    const activeRow = visible.find(x => x.id === taskId)
    if (!activeRow) return

    const moveTask = onMoveTaskRef.current

    if (overTaskId && overTaskId !== taskId) {
      const overRow = visible.find(x => x.id === overTaskId)
      if (!overRow) return

      if (activeRow.status !== overRow.status) {
        await moveTask(taskId, overRow.status, activeRow.version)
        return
      }

      const col = activeRow.status
      const list = [...(byCol[col] ?? [])]
      const oi = list.findIndex(x => x.id === taskId)
      const ni = list.findIndex(x => x.id === overTaskId)
      if (oi === -1 || ni === -1 || oi === ni) return
      persistOrderColRef.current(
        col,
        arrayMoveIds(
          list.map(x => x.id),
          oi,
          ni,
        ),
      )
      return
    }

    if (activeRow.status !== columnCode) {
      await moveTask(taskId, columnCode, activeRow.version)
    }
  }, [])

  const scheduleOverlayMove = useCallback((clientX: number, clientY: number) => {
    const el = overlayRef.current
    const sess = dragSessionRef.current
    if (!el || !sess?.started) return
    if (overlayRafRef.current) cancelAnimationFrame(overlayRafRef.current)
    overlayRafRef.current = requestAnimationFrame(() => {
      overlayRafRef.current = 0
      el.style.transform = `translate3d(${Math.round(clientX - sess.grabOffsetX)}px, ${Math.round(clientY - sess.grabOffsetY)}px, 0)`
    })
  }, [])

  const updateHighlightFromPoint = useCallback((clientX: number, clientY: number) => {
    const ignore = draggingTaskIdRef.current
    const { columnCode, overTaskId } = resolveDropFromPoint(clientX, clientY, ignore)
    pendingDropRef.current = { columnCode, overTaskId }

    if (dropHighlightColRef.current !== columnCode) {
      dropHighlightColRef.current = columnCode
      setDropHighlightColumnCode(columnCode)
    }
  }, [])

  const onCardPointerDown = useCallback(
    (task: TaskTableRowTask, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      if (draggingTaskIdRef.current) return

      const target = event.target as HTMLElement | null
      if (target?.closest?.('button, a, input, textarea, [role="checkbox"], [data-no-kanban-drag]')) return

      const cardEl = event.currentTarget
      const rect = cardEl.getBoundingClientRect()
      const grabOffsetX = event.clientX - rect.left
      const grabOffsetY = event.clientY - rect.top

      dragSessionRef.current = {
        taskId: task.id,
        pointerId: event.pointerId,
        sourceEl: cardEl,
        grabOffsetX,
        grabOffsetY,
        originX: event.clientX,
        originY: event.clientY,
        started: false,
      }

      const onMove = (ev: PointerEvent) => {
        const sess = dragSessionRef.current
        if (!sess || sess.taskId !== task.id) return

        const dx = ev.clientX - sess.originX
        const dy = ev.clientY - sess.originY
        if (!sess.started) {
          if (dx * dx + dy * dy < DRAG_ACTIVATION_PX * DRAG_ACTIVATION_PX) return
          sess.started = true
          draggingTaskIdRef.current = task.id
          try {
            cardEl.setPointerCapture(ev.pointerId)
          } catch {
            /* ignore */
          }
          setDraggingTaskId(task.id)
          pendingDropRef.current = { columnCode: null, overTaskId: null }
          dropHighlightColRef.current = null
          setDropHighlightColumnCode(null)
          document.body.style.userSelect = 'none'

          requestAnimationFrame(() => {
            const ov = overlayRef.current
            const s = dragSessionRef.current
            if (!ov || !s?.started) return
            ov.style.transform = `translate3d(${Math.round(ev.clientX - s.grabOffsetX)}px, ${Math.round(ev.clientY - s.grabOffsetY)}px, 0)`
          })
        }

        scheduleOverlayMove(ev.clientX, ev.clientY)
        updateHighlightFromPoint(ev.clientX, ev.clientY)
      }

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== event.pointerId) return
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)

        const sess = dragSessionRef.current
        const hadDrag = sess?.started ?? false
        const tid = sess?.taskId
        dragSessionRef.current = null

        if (sess?.sourceEl) {
          try {
            sess.sourceEl.releasePointerCapture(ev.pointerId)
          } catch {
            /* already released */
          }
        }
        document.body.style.userSelect = ''
        if (overlayRafRef.current) {
          cancelAnimationFrame(overlayRafRef.current)
          overlayRafRef.current = 0
        }

        if (hadDrag && tid) {
          updateHighlightFromPoint(ev.clientX, ev.clientY)
          void commitDrop(tid)
        } else {
          setDraggingTaskId(null)
          draggingTaskIdRef.current = null
          dropHighlightColRef.current = null
          setDropHighlightColumnCode(null)
          pendingDropRef.current = { columnCode: null, overTaskId: null }
        }
      }

      window.addEventListener('pointermove', onMove, { passive: true })
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [commitDrop, scheduleOverlayMove, updateHighlightFromPoint],
  )

  const dragCtx = useMemo<KanbanDragContextValue>(
    () => ({
      draggingTaskId,
      onCardPointerDown,
    }),
    [draggingTaskId, onCardPointerDown],
  )

  return (
    <KanbanDragContext.Provider value={dragCtx}>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!disableSwimlanes ? (
            <>
              <span className="text-muted-foreground text-xs">{t('taskManagement.boardSwimlanes')}</span>
              <ToggleGroup
                type="single"
                value={swimlaneMode}
                onValueChange={v => v && setSwimlaneMode(v as KanbanSwimlaneMode)}
                variant="outline"
                size="sm"
                className="justify-start gap-px"
              >
                <ToggleGroupItem value="flat" className="h-8 gap-1 px-2 text-[11px]" title={t('taskManagement.kanbanSwimlaneOff')}>
                  <Layers className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t('taskManagement.kanbanSwimlaneOff')}</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="assignee" className="h-8 gap-1 px-2 text-[11px]" title={t('taskManagement.kanbanSwimlaneAssignee')}>
                  <Users className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t('taskManagement.kanbanSwimlaneAssignee')}</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="project" className="h-8 gap-1 px-2 text-[11px]" title={t('taskManagement.kanbanSwimlaneProject')}>
                  <Briefcase className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t('taskManagement.kanbanSwimlaneProject')}</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </>
          ) : null}
          <div
            className={cn(
              'flex min-w-0 shrink-0 items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-1',
              !disableSwimlanes && 'ml-auto',
            )}
          >
            <Switch
              id="hb-kanban-only-mine"
              size="sm"
              checked={onlyMine && Boolean((currentUserId || '').trim())}
              disabled={!(currentUserId || '').trim()}
              onCheckedChange={v => setOnlyMine(Boolean(v))}
            />
            <Label
              htmlFor="hb-kanban-only-mine"
              className={cn('cursor-pointer truncate text-[11px] font-normal leading-none', !(currentUserId || '').trim() && 'cursor-not-allowed opacity-50')}
            >
              {t('taskManagement.kanbanOnlyMyTasks')}
            </Label>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          {orderedCodes.map(code => {
            const sorted = sortedByColumn[code] ?? []
            const label = statuses.find(s => s.code === code)?.name ?? code
            const wipVal = wipMap[code]
            const columnDropActive = Boolean(draggingTaskId) && dropHighlightColumnCode === code
            return (
              <KanbanColumn
                key={code}
                statusCode={code}
                label={label}
                sortedTasks={sorted}
                swimlaneMode={swimlaneEffective}
                cardPropsBase={cardPropsBase}
                getAssigneeDisplay={getAssigneeDisplay}
                onCardClick={onOpenTask}
                selectedTaskIds={selectedTaskIds}
                onToggleTaskSelect={onToggleTaskSelect}
                statusColorHex={statusColorMap?.[code]}
                wipLimit={wipVal}
                onCommitWip={handleCommitColumnWip}
                wipExceededLabel={t('taskManagement.kanbanWipExceeded', { limit: wipVal ?? sorted.length })}
                wipDialogTitle={t('taskManagement.kanbanWipDialogTitle')}
                wipDialogSave={t('taskManagement.kanbanWipSave')}
                collapsed={collapsedSet.has(code)}
                onToggleCollapsed={toggleColCollapsed}
                ariaCollapseColumn={t('taskManagement.kanbanCollapseColumnAria', { column: label })}
                ariaExpandColumn={t('taskManagement.kanbanExpandColumnAria', { column: label })}
                columnDropActive={columnDropActive}
              />
            )
          })}
        </div>

        <div
          ref={overlayRef}
          className={cn(
            'pointer-events-none fixed left-0 top-0 z-[200] min-w-[220px] max-w-[min(92vw,420px)] will-change-transform',
            draggingTaskId ? 'opacity-100' : 'opacity-0 invisible',
          )}
          style={{ transform: 'translate3d(-9999px, -9999px, 0)' }}
          aria-hidden={!draggingTaskId}
        >
          {activeDragTask ? (
            <div className="cursor-grabbing rounded-md bg-card shadow-2xl">
              <TaskBoardCard
                task={activeDragTask}
                assigneeDisplay={getAssigneeDisplay(activeDragTask.assigneeUserId)}
                {...cardPropsBase}
                titleStartSlot={
                  <span className="mt-0.5 inline-flex shrink-0 rounded p-0.5 text-muted-foreground" aria-hidden>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                }
              />
            </div>
          ) : null}
        </div>
      </div>
    </KanbanDragContext.Provider>
  )
}
