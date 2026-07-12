import type { WorkloadBoardSegment, WorkloadDayCell, WorkloadUserMeta } from './taskGanttWorkloadTypes'

export function workloadRowKey(projectId: string, userId: string): string {
  return `${projectId}|${userId}`
}

/** Chuẩn hoá payload IPC / legacy (snake_case) → một shape duy nhất — tránh mất giờ do đọc sai field. */
export function normalizeWorkloadDay(raw: WorkloadDayCell & Record<string, unknown>): WorkloadDayCell {
  const userId = String(raw.userId ?? raw.user_id ?? '').trim()
  const date = String(raw.date ?? '')
    .trim()
    .slice(0, 10)
  const d0 = Number(raw.derivedHours ?? raw.derived_hours)
  const derivedHours = Number.isFinite(d0) ? d0 : 0
  const a0 = raw.actualWorkHours ?? raw.actual_work_hours
  const actualWorkHours =
    a0 == null || a0 === '' || (typeof a0 === 'number' && Number.isNaN(a0))
      ? null
      : (() => {
        const n = Number(a0)
        return Number.isFinite(n) ? n : null
      })()
  const o0 = raw.overrideHours ?? raw.override_hours
  const overrideHours =
    o0 == null || o0 === '' || (typeof o0 === 'number' && Number.isNaN(o0))
      ? null
      : (() => {
        const n = Number(o0)
        return Number.isFinite(n) ? n : null
      })()
  const tc0 = Number(raw.taskCount ?? raw.task_count)
  const taskCount = Number.isFinite(tc0) ? Math.max(0, Math.floor(tc0)) : 0
  const idsRaw = raw.taskIds ?? raw.task_ids
  const taskIds = taskCount > 0 && Array.isArray(idsRaw) ? idsRaw.map(x => String(x).trim()).filter(Boolean) : []
  return { userId, date, derivedHours, actualWorkHours, overrideHours, taskCount, taskIds }
}

function effectiveHoursOfCell(cell: WorkloadDayCell | undefined, preferActual: boolean): number {
  if (!cell) return 0
  if (cell.overrideHours != null) return Number(cell.overrideHours) || 0
  if (preferActual && cell.actualWorkHours != null) return Number(cell.actualWorkHours) || 0
  return Number(cell.derivedHours) || 0
}

/** Gộp workload nhiều project → một user một dòng, cộng giờ / task theo ngày (Assignee mode). */
function mergeWorkloadSegmentsByAssignee(segments: WorkloadBoardSegment[], preferActual: boolean): WorkloadBoardSegment {
  const orderedUserIds: string[] = []
  const userMetaById = new Map<string, WorkloadUserMeta>()
  const dayMerge = new Map<string, WorkloadDayCell>()
  const nonWorkingDates = new Set<string>()
  let hoursPerDay = 8
  let canEditAll = false
  let selfUserId = ''

  for (const seg of segments) {
    const d = seg.data
    hoursPerDay = d.hoursPerDay ?? hoursPerDay
    canEditAll = canEditAll || d.canEditAll
    if (!selfUserId && d.selfUserId) selfUserId = d.selfUserId
    for (const nw of d.nonWorkingDates ?? []) nonWorkingDates.add(nw)
    for (const u of d.users) {
      if (!userMetaById.has(u.userId)) {
        userMetaById.set(u.userId, u)
        orderedUserIds.push(u.userId)
      }
    }
    for (const raw of d.days) {
      const n = normalizeWorkloadDay(raw as WorkloadDayCell & Record<string, unknown>)
      const k = `${n.userId}|${n.date}`
      const prev = dayMerge.get(k)
      if (!prev) {
        dayMerge.set(k, { ...n })
      } else {
        const effSum = effectiveHoursOfCell(prev, preferActual) + effectiveHoursOfCell(n, preferActual)
        const taskIdSet = new Set<string>([...prev.taskIds, ...n.taskIds])
        const mergedIds = Array.from(taskIdSet)
        dayMerge.set(k, {
          userId: n.userId,
          date: n.date,
          derivedHours: effSum,
          actualWorkHours: null,
          overrideHours: null,
          taskCount: mergedIds.length,
          taskIds: mergedIds,
        })
      }
    }
  }

  const users = orderedUserIds.map(id => userMetaById.get(id)).filter((u): u is WorkloadUserMeta => Boolean(u))
  const days = Array.from(dayMerge.values())

  return {
    projectId: '__workload_assignee__',
    projectLabel: '',
    data: {
      users,
      days,
      hoursPerDay,
      nonWorkingDates: Array.from(nonWorkingDates).sort(),
      canEditAll,
      selfUserId,
    },
  }
}

/** Payload có thể lặp cùng một user (ví dụ nhiều vai trò) — workload dùng một dòng / userId cho key + matrix. */
function dedupeWorkloadUsersPreserveOrder(users: WorkloadUserMeta[]): WorkloadUserMeta[] {
  const seen = new Set<string>()
  const out: WorkloadUserMeta[] = []
  for (const u of users) {
    const id = String(u.userId ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(u)
  }
  return out
}

function dedupeSegmentWorkloadUsers(seg: WorkloadBoardSegment): WorkloadBoardSegment {
  const users = dedupeWorkloadUsersPreserveOrder(seg.data.users)
  if (users.length === seg.data.users.length) return seg
  return { ...seg, data: { ...seg.data, users } }
}

export function buildDisplayWorkloadSegments(
  workloadRowGrouping: 'flat' | 'assignee' | 'project',
  segments: WorkloadBoardSegment[],
  showActualBars: boolean
): WorkloadBoardSegment[] {
  const base =
    workloadRowGrouping === 'assignee' && segments.length > 0
      ? [mergeWorkloadSegmentsByAssignee(segments, showActualBars)]
      : segments
  const mapped = base.map(dedupeSegmentWorkloadUsers)
  return mapped.every((s, i) => s === base[i]) ? base : mapped
}

/** By-project workload: đóng (0) → mở khối project (1) → mở mini-Gantt user (2) → đóng. Khi không có user row thì chỉ 0↔1. */
export function getWorkloadProjectBulkCyclePhase(
  projectIds: string[],
  userRowKeys: string[],
  collapsedProjectIds: Set<string>,
  expandedRowKeys: Set<string>
): 0 | 1 | 2 {
  if (!projectIds.length) return 0
  const allCollapsed = projectIds.every(id => collapsedProjectIds.has(id))
  const allExpanded = projectIds.every(id => !collapsedProjectIds.has(id))
  const allMinisOpen = userRowKeys.length > 0 && userRowKeys.every(k => expandedRowKeys.has(k))

  if (allCollapsed) return 0
  if (allExpanded && allMinisOpen) return 2
  if (allExpanded) return 1
  return 0
}
