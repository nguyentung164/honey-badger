import { startOfDay } from 'date-fns'
import { parseLocalDate } from '@/lib/dateUtils'
import type { TaskTableRowTask } from './TaskTableRow'

/** Cùng key với Gantt « Group rows » — Calendar và Gantt dùng chung. */
export const LS_TASK_BOARD_ROW_GROUPING = 'honey_badger.taskGantt.rowGroup.v1'

export type TaskBoardRowGrouping = 'flat' | 'assignee' | 'project'

export type BucketTasksSortBy = 'planStart' | 'title'

function parsePlanDateForSort(raw: string | undefined): Date | null {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null
  const trimmed = raw.trim().slice(0, 10)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? (parseLocalDate(trimmed) ?? null) : new Date(raw)
  if (!d || Number.isNaN(d.getTime())) return null
  return startOfDay(d)
}

export function bucketTasksByGroup(
  tasks: TaskTableRowTask[],
  mode: TaskBoardRowGrouping,
  getAssigneeDisplay?: (id: string | null) => string,
  sortBy: BucketTasksSortBy = 'planStart'
): { segmentKey: string; title: string; tasks: TaskTableRowTask[] }[] {
  const cmp = (a: TaskTableRowTask, b: TaskTableRowTask) => {
    if (sortBy === 'title') {
      return (a.title ?? '').localeCompare(b.title ?? '', undefined, { sensitivity: 'base' })
    }
    const pa = parsePlanDateForSort(a.planStartDate)?.getTime() ?? 0
    const pb = parsePlanDateForSort(b.planStartDate)?.getTime() ?? 0
    if (pa !== pb) return pa - pb
    return (a.title ?? '').localeCompare(b.title ?? '', undefined, { sensitivity: 'base' })
  }

  if (mode === 'flat') {
    return [{ segmentKey: 'flat', title: '', tasks: [...tasks].sort(cmp) }]
  }

  const m = new Map<string, { title: string; tasks: TaskTableRowTask[] }>()
  for (const t of tasks) {
    let key = ''
    let title = ''
    if (mode === 'assignee') {
      const uid = (t.assigneeUserId || '').trim()
      key = uid !== '' ? uid : '_none'
      title = uid !== '' ? (getAssigneeDisplay?.(uid) ?? uid) : '(—)'
    } else {
      const pid = (t.projectId || '').trim()
      key = pid !== '' ? pid : '_none'
      title = ((t.project && String(t.project).trim()) || (pid !== '' ? pid : null)) ?? '(—)'
    }
    const ex = m.get(key)
    if (ex) ex.tasks.push(t)
    else m.set(key, { title, tasks: [t] })
  }

  const entries = [...m.entries()].sort(([ka, a], [kb, b]) => {
    const na = ka === '_none' ? 1 : 0
    const nb = kb === '_none' ? 1 : 0
    if (na !== nb) return na - nb
    return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
  })

  return entries.map(([segmentKey, g], i) => ({
    segmentKey: `${segmentKey}_${i}`,
    title: g.title,
    tasks: [...g.tasks].sort(cmp),
  }))
}

export function loadTaskBoardRowGrouping(): TaskBoardRowGrouping {
  try {
    const raw = localStorage.getItem(LS_TASK_BOARD_ROW_GROUPING)
    if (!raw) return 'flat'
    const v = JSON.parse(raw) as string
    if (v === 'flat' || v === 'assignee' || v === 'project') return v
  } catch {
    /* ignore */
  }
  return 'flat'
}

export function saveTaskBoardRowGrouping(mode: TaskBoardRowGrouping) {
  try {
    localStorage.setItem(LS_TASK_BOARD_ROW_GROUPING, JSON.stringify(mode))
  } catch {
    /* ignore */
  }
}

/** Gantt + Calendar — các nhóm Unschedule đang thu gọn (segmentKey từ `bucketTasksByGroup`). */
export const LS_TASK_BOARD_UNSCHED_COLLAPSED_SEGMENTS = 'honey_badger.taskGantt.collapsedUnschedGroupSegments.v1'

export function loadUnschedCollapsedSegments(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_TASK_BOARD_UNSCHED_COLLAPSED_SEGMENTS)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set((arr as unknown[]).filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

export function saveUnschedCollapsedSegments(keys: Set<string>) {
  try {
    localStorage.setItem(LS_TASK_BOARD_UNSCHED_COLLAPSED_SEGMENTS, JSON.stringify([...keys]))
  } catch {
    /* ignore */
  }
}
