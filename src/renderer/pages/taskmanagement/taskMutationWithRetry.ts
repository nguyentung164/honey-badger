export type TaskMutationApiResult =
  | { status: 'success'; data?: { version?: number } }
  | { status: 'error'; message?: string; code?: string }

export type TaskGetSnapshotResult = {
  status: string
  data?: Record<string, unknown>
  message?: string
}

export type TaskMutationRetryResult =
  | { ok: true; version?: number; alreadyApplied?: boolean }
  | { ok: false; code?: string; message?: string }

/** Task đang được lưu (Kanban/Gantt) — client từ chối thao tác trùng. */
export const TASK_SAVE_IN_PROGRESS_CODE = 'SAVE_IN_PROGRESS' as const

export type KanbanMoveTaskResult = TaskMutationRetryResult

type RunTaskMutationWithRetryOpts = {
  mutate: (version?: number) => Promise<TaskMutationApiResult>
  getTask: () => Promise<TaskGetSnapshotResult>
  isAlreadyApplied?: (fresh: Record<string, unknown>) => boolean
}

export async function runTaskMutationWithRetry(version: number | undefined, opts: RunTaskMutationWithRetryOpts): Promise<TaskMutationRetryResult> {
  let attemptVersion = version
  let res = await opts.mutate(attemptVersion)

  if (res.status === 'success') {
    return { ok: true, version: res.data?.version }
  }

  if ((res as { code?: string }).code !== 'VERSION_CONFLICT') {
    return { ok: false, code: (res as { code?: string }).code, message: res.message }
  }

  const freshRes = await opts.getTask()
  if (freshRes.status !== 'success' || !freshRes.data) {
    return { ok: false, code: 'VERSION_CONFLICT', message: res.message }
  }

  const fresh = freshRes.data
  if (opts.isAlreadyApplied?.(fresh)) {
    return { ok: true, version: typeof fresh.version === 'number' ? fresh.version : undefined, alreadyApplied: true }
  }

  if (typeof fresh.version !== 'number') {
    return { ok: false, code: 'VERSION_CONFLICT', message: res.message }
  }

  attemptVersion = fresh.version
  res = await opts.mutate(attemptVersion)
  if (res.status === 'success') {
    return { ok: true, version: res.data?.version }
  }

  return {
    ok: false,
    code: (res as { code?: string }).code ?? 'VERSION_CONFLICT',
    message: res.message,
  }
}

export type TaskStatusUpdateDeps = {
  updateStatus: (id: string, status: string, version?: number) => Promise<TaskMutationApiResult>
  getTask: (id: string) => Promise<TaskGetSnapshotResult>
}

export async function updateTaskStatusWithRetry(
  deps: TaskStatusUpdateDeps,
  taskId: string,
  newStatus: string,
  version?: number
): Promise<KanbanMoveTaskResult> {
  return runTaskMutationWithRetry(version, {
    mutate: v => deps.updateStatus(taskId, newStatus, v),
    getTask: () => deps.getTask(taskId),
    isAlreadyApplied: fresh => fresh.status === newStatus,
  })
}

export type TaskDatesUpdateDeps = {
  updateDates: (
    id: string,
    dates: { planStartDate?: string; planEndDate?: string },
    version?: number
  ) => Promise<TaskMutationApiResult>
  getTask: (id: string) => Promise<TaskGetSnapshotResult>
}

export async function updateTaskPlanDatesWithRetry(
  deps: TaskDatesUpdateDeps,
  taskId: string,
  planStartDate: string,
  planEndDate: string,
  version?: number
): Promise<TaskMutationRetryResult> {
  const dates = { planStartDate, planEndDate }
  return runTaskMutationWithRetry(version, {
    mutate: v => deps.updateDates(taskId, dates, v),
    getTask: () => deps.getTask(taskId),
    isAlreadyApplied: fresh => {
      const ps = String(fresh.planStartDate ?? '').slice(0, 10)
      const pe = String(fresh.planEndDate ?? '').slice(0, 10)
      return ps === planStartDate && pe === planEndDate
    },
  })
}
