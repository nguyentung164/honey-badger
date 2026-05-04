'use client'

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowUpRight, Briefcase, ChevronRight, Layers, PanelLeftClose, SlidersHorizontal, Users } from 'lucide-react'
import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

const COL_PREFIX = 'col::'

/** Map task id → status column để highlight đích kéo O(1), không lặp nested mỗi cột. */
function columnIsKanbanDropTarget(overId: string | null, columnCode: string, taskIdToColumn: Map<string, string>): boolean {
  if (!overId) return false
  if (overId === `${COL_PREFIX}${columnCode}`) return true
  return taskIdToColumn.get(overId) === columnCode
}

const LS_ORDER_KEY = 'honey_badger.taskKanban.colOrder.v2'
const LS_WIP_KEY = 'honey_badger.taskKanban.wip.v1'
const LS_SWIM_KEY = 'honey_badger.taskKanban.swimlane.v1'
const LS_COLLAPSED_KEY = 'honey_badger.taskKanban.collapsedCols.v1'
const LS_ONLY_MINE_KEY = 'honey_badger.taskKanban.onlyMine.v1'

/** Flat: virtual khi ≥ ngưỡng — không mount full list lúc drag (tránh đứng hình khi bắt kéo). */
const KANBAN_VIRTUAL_MIN_TASKS = 36
const KANBAN_VIRTUAL_ESTIMATE_PX = 116

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

function SortableKanbanCard({
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    animateLayoutChanges: () => false,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn('rounded-md bg-card touch-none cursor-grab active:cursor-grabbing', isDragging && 'opacity-0')}
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
          onToggleSelect ? (
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
}

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
    overscan: 10,
    getItemKey: index => tasks[index]?.id ?? `__vacant:${String(index)}`,
  })

  useLayoutEffect(() => {
    rowVirtualizer.measure()
    // Chỉ đo lại khi tập task trong cột đổi; không gắn `rowVirtualizer` — tránh measure() mỗi lần parent re-render (kéo thả gây đứng hình).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksRowKey])

  return (
    <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
      <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map(vi => {
          const task = tasks[vi.index]
          return (
            <div key={task.id} data-index={vi.index} ref={rowVirtualizer.measureElement} className="absolute left-0 w-full pb-2" style={{ top: vi.start }}>
              <SortableKanbanCard
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
    </SortableContext>
  )
}

// Khi đổi filter: reset scroll cột khi tập id task trong cột thay đổi (không reset khi chỉ reorder cùng tập).
function columnTaskMembershipKey(tasks: TaskTableRowTask[]) {
  return tasks
    .map(t => t.id)
    .sort()
    .join('\x1e')
}

function KanbanColumn(props: {
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
  onCommitWip: (limit: number | undefined) => void
  wipExceededLabel: string
  wipDialogTitle: string
  wipDialogSave: string
  collapsed?: boolean
  onToggleCollapsed?: () => void
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
  const { setNodeRef } = useDroppable({ id: `${COL_PREFIX}${statusCode}` })
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

  if (collapsed && onToggleCollapsed) {
    return (
      <div ref={setNodeRef} className="flex w-11 shrink-0 flex-1 flex-col self-stretch min-h-0 overflow-hidden rounded-lg bg-muted/45 dark:bg-muted/30">
        <div className={cn('flex min-h-0 flex-1 flex-col items-center gap-2 px-1 py-2', columnDropActive && 'rounded-lg bg-primary/18 dark:bg-primary/22')}>
          <button
            type="button"
            onClick={onToggleCollapsed}
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
    <div ref={setNodeRef} className="flex min-h-0 min-w-[220px] flex-1 basis-0 flex-col self-stretch overflow-hidden rounded-lg bg-muted/45 dark:bg-muted/30">
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
                onClick={onToggleCollapsed}
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
                <Button
                  size="sm"
                  className="w-full h-8"
                  type="button"
                  onClick={() => {
                    const n = wipDraft.trim() === '' ? undefined : Number(wipDraft)
                    if (n !== undefined && (Number.isNaN(n) || n < 1)) return
                    onCommitWip(n)
                  }}
                >
                  {wipDialogSave}
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 basis-0 overflow-y-auto overflow-x-hidden" onWheel={e => e.stopPropagation()}>
        <div
          className={cn('flex min-h-full flex-col gap-2 rounded-b-lg p-2', columnDropActive && 'bg-primary/18 dark:bg-primary/22')}
          style={columnDropActive ? undefined : columnBodyTint}
        >
          {laneSegs.map(seg =>
            seg.title ? (
              <div key={`${statusCode}-lane-${seg.key}`} className="space-y-1.5 pt-2 first:pt-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{seg.title}</div>
                <SortableContext items={seg.tasks.map(x => x.id)} strategy={verticalListSortingStrategy}>
                  {seg.tasks.map(task => (
                    <SortableKanbanCard
                      key={task.id}
                      task={task}
                      cardPropsBase={cardPropsBase}
                      getAssigneeDisplay={getAssigneeDisplay}
                      onOpenTask={onCardClick}
                      selected={selectedTaskIds?.has(task.id)}
                      onToggleSelect={onToggleTaskSelect}
                    />
                  ))}
                </SortableContext>
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
              <SortableContext key={`${statusCode}-flat`} items={seg.tasks.map(x => x.id)} strategy={verticalListSortingStrategy}>
                {seg.tasks.map(task => (
                  <SortableKanbanCard
                    key={task.id}
                    task={task}
                    cardPropsBase={cardPropsBase}
                    getAssigneeDisplay={getAssigneeDisplay}
                    onOpenTask={onCardClick}
                    selected={selectedTaskIds?.has(task.id)}
                    onToggleSelect={onToggleTaskSelect}
                  />
                ))}
              </SortableContext>
            )
          )}
          {sortedTasks.length === 0 ? <div className="rounded-b-lg bg-muted/25 py-8 text-center text-[11px] text-muted-foreground dark:bg-muted/20">—</div> : null}
        </div>
      </div>
    </div>
  )
}

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
  /** Ẩn nhóm swimlane và luôn flat (dev / không phải Admin-PL-PM). */
  disableSwimlanes?: boolean
}) {
  const { t } = useTranslation()
  const [orderMap, setOrderMap] = useState<Record<string, string[]>>(() => loadJsonLs(LS_ORDER_KEY, {}))
  const [wipMap, setWipMap] = useState<Record<string, number>>(() => loadJsonLs(LS_WIP_KEY, {}))
  const [swimlaneMode, setSwimlaneMode] = useState<KanbanSwimlaneMode>(() => loadJsonLs(LS_SWIM_KEY, 'flat'))
  const [onlyMine, setOnlyMine] = useState(() => loadJsonLs<boolean>(LS_ONLY_MINE_KEY, false))
  const [collapsedCols, setCollapsedCols] = useState<string[]>(() => loadJsonLs(LS_COLLAPSED_KEY, []))
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

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

  const collapsedSet = useMemo(() => new Set(collapsedCols), [collapsedCols])
  const swimlaneEffective = disableSwimlanes ? 'flat' : swimlaneMode

  const visibleTasks = useMemo(() => {
    const uid = (currentUserId || '').trim()
    if (!onlyMine || !uid) return tasks
    return tasks.filter(x => (x.assigneeUserId || '').trim() === uid)
  }, [tasks, onlyMine, currentUserId])

  const activeDragTask = useMemo(() => {
    if (!activeDragId) return null
    return visibleTasks.find(x => x.id === activeDragId) ?? null
  }, [activeDragId, visibleTasks])

  const toggleColCollapsed = useCallback((code: string) => {
    setCollapsedCols(prev => (prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]))
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  useEffect(() => {
    if (disableSwimlanes) return
    saveJsonLs(LS_SWIM_KEY, swimlaneMode)
  }, [disableSwimlanes, swimlaneMode])

  const activeStatuses = useMemo(
    () => [...statuses].filter(s => s.is_active !== false).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.code.localeCompare(b.code)),
    [statuses]
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

  /** task id → mã cột: highlight đích kéo O(1), không lặp list mỗi cột mỗi frame. */
  const taskIdToColumnCode = useMemo(() => {
    const m = new Map<string, string>()
    for (const code of orderedCodes) {
      for (const t of sortedByColumn[code] ?? []) m.set(t.id, code)
    }
    return m
  }, [sortedByColumn, orderedCodes])

  const dragOverIdRef = useRef<string | null>(null)

  const persistOrderCol = (code: string, nextIds: string[]) => {
    setOrderMap(prev => {
      const n = { ...prev, [code]: nextIds }
      saveJsonLs(LS_ORDER_KEY, n)
      return n
    })
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    dragOverIdRef.current = null
    setActiveDragId(String(event.active.id))
    setDragOverId(null)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const next = event.over ? String(event.over.id) : null
    if (dragOverIdRef.current === next) return
    dragOverIdRef.current = next
    setDragOverId(next)
  }, [])

  const handleDragCancel = useCallback(() => {
    dragOverIdRef.current = null
    setActiveDragId(null)
    setDragOverId(null)
  }, [])

  const handleDragEnd = async (event: DragEndEvent) => {
    dragOverIdRef.current = null
    setActiveDragId(null)
    setDragOverId(null)
    const { active, over } = event
    if (!over) return

    const taskId = active.id as string
    const activeRow = visibleTasks.find(x => x.id === taskId)
    if (!activeRow) return

    const oid = String(over.id)

    if (oid.startsWith(COL_PREFIX)) {
      const tgt = oid.slice(COL_PREFIX.length)
      if (tgt && tgt !== activeRow.status) {
        await onMoveTask(taskId, tgt, activeRow.version)
      }
      return
    }

    const overRow = visibleTasks.find(x => x.id === oid)
    if (!overRow) return

    if (activeRow.status !== overRow.status) {
      await onMoveTask(taskId, overRow.status, activeRow.version)
      return
    }

    const col = activeRow.status
    const list = [...(sortedByColumn[col] ?? [])]
    const oi = list.findIndex(x => x.id === taskId)
    const ni = list.findIndex(x => x.id === oid)
    if (oi === -1 || ni === -1 || oi === ni) return
    const ids = arrayMove(
      list.map(x => x.id),
      oi,
      ni
    )
    persistOrderCol(col, ids)
  }

  return (
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
        onDragEnd={e => void handleDragEnd(e)}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          {orderedCodes.map(code => {
            const sorted = sortedByColumn[code] ?? []
            const label = statuses.find(s => s.code === code)?.name ?? code
            const wipVal = wipMap[code]
            const columnDropActive = Boolean(activeDragId) && columnIsKanbanDropTarget(dragOverId, code, taskIdToColumnCode)
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
                onCommitWip={n => {
                  setWipMap(prev => {
                    const nx = { ...prev }
                    if (n === undefined || n < 1) delete nx[code]
                    else nx[code] = n
                    saveJsonLs(LS_WIP_KEY, nx)
                    return nx
                  })
                }}
                wipExceededLabel={t('taskManagement.kanbanWipExceeded', { limit: wipVal ?? sorted.length })}
                wipDialogTitle={t('taskManagement.kanbanWipDialogTitle')}
                wipDialogSave={t('taskManagement.kanbanWipSave')}
                collapsed={collapsedSet.has(code)}
                onToggleCollapsed={() => toggleColCollapsed(code)}
                ariaCollapseColumn={t('taskManagement.kanbanCollapseColumnAria', { column: label })}
                ariaExpandColumn={t('taskManagement.kanbanExpandColumnAria', { column: label })}
                columnDropActive={columnDropActive}
              />
            )
          })}
        </div>
        <DragOverlay className="z-[200]" dropAnimation={null}>
          {activeDragTask ? (
            <div className="min-w-[220px] max-w-[min(92vw,420px)] cursor-grabbing rounded-md bg-card shadow-2xl">
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
        </DragOverlay>
      </DndContext>
    </div>
  )
}
