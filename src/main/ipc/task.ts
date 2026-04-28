import { readFile } from 'node:fs/promises'
import type { IpcMainInvokeEvent } from 'electron'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { sendTaskNotification } from '../notification/taskNotification'
import configurationStore from '../store/ConfigurationStore'
import {
  onCodingRuleCreated,
  onCommitReview,
  onTaskCreated,
  onTaskDone,
} from '../task/achievementService'
import { getTokenFromStore, type SessionData, verifyToken } from '../task/auth'
import { checkTaskSchemaAppliedOverConnection, resetPoolAndWait, testConnection } from '../task/db'
import type { CreateTaskInput, ListTasksForPickerParams, TaskStatus, UpdateTaskInput } from '../task/mysqlTaskStore'
import {
  addTaskFavorite,
  assignTask,
  canUserViewTaskByScope,
  canUserDeleteTask,
  canUserUpdateOrDeleteDoneTask,
  canUserUpdateTask,
  copyTask,
  createCodingRule,
  createProject,
  createTask,
  createTaskChild,
  createTaskLink,
  createTasksFromRedmineCsv,
  deleteCodingRule,
  deleteCommitReview,
  deleteProject,
  deleteTask,
  deleteTaskLink,
  deleteUserProjectSourceFolder,
  getCanManageProjectRoles,
  getCodingRuleContentByIdOrName,
  getCodingRulesForManagement,
  getCodingRulesForSelection,
  getCodingRulesGlobalOnly,
  getCommitReview,
  getCommitReviewsBySourceFolder,
  getFavoriteTaskIds,
  getProjectIdByUserAndPath,
  getProjectMembers,
  getProjectPlUserIds,
  getProjectReminderTime,
  getProjects,
  getProjectsForLeaderboardPicker,
  getProjectsForUser,
  getReminderStats,
  getProjectsForTaskManagement,
  getReviewedCommitIds,
  getSourceFoldersByProject,
  getSourceFoldersByProjects,
  getTask,
  getTaskChildren,
  getTaskLinks,
  getManagementScopeMeta,
  getTasksForSession,
  listTasksForManagementForCharts,
  listTasksForManagementWithFacets,
  listTasksForPickerPage,
  type TaskManagementListParams,
  getUserProjectSourceFolderMappings,
  getUsers,
  hasPlRole,
  removeTaskFavorite,
  saveCommitReview,
  updateCodingRule,
  updateProject,
  updateProjectReminderTime,
  updateTask,
  updateTaskDates,
  updateTaskProgress,
  updateTaskStatus,
  upsertUserProjectSourceFolder,
} from '../task/mysqlTaskStore'
import { initTaskSchema } from '../task/schemaInit'
import type { TaskNotificationType } from '../task/taskNotificationStore'
import { insertTaskNotification, markAsRead } from '../task/taskNotificationStore'

/** Insert vào DB (cross-machine) rồi gửi thông báo local. Khi currentUserId === targetUserId: gửi ngay và markAsRead để tránh poller gửi trùng. */
async function persistAndSendTaskNotification(
  targetUserId: string,
  type: TaskNotificationType,
  title: string,
  body: string,
  taskId?: string | null,
  currentUserId?: string | null
): Promise<void> {
  let notificationId: string | null = null
  try {
    notificationId = await insertTaskNotification(targetUserId, type, title, body, taskId)
  } catch (e) {
    l.warn('persistTaskNotification failed:', e)
  }
  if (currentUserId === targetUserId && notificationId) {
    sendTaskNotification(targetUserId, title, body)
    const maxRetries = 2
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await markAsRead(notificationId)
        return
      } catch (e) {
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 300))
        } else {
          l.warn('markAsRead failed after retries:', e)
        }
      }
    }
  }
}

function withAuthFromStore<T extends unknown[]>(handler: (event: IpcMainInvokeEvent, session: SessionData, ...args: T) => Promise<unknown>) {
  return async (event: IpcMainInvokeEvent, ...args: T) => {
    const token = getTokenFromStore()
    const session = token ? verifyToken(token) : null
    if (!session) {
      return { status: 'error' as const, code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    }
    return handler(event, session, ...args)
  }
}

/** Chỉ role pl, pm hoặc admin mới được gọi handler (dùng cho Commit Review mark/unmark) */
function requirePlOrAdmin<T extends unknown[]>(handler: (event: IpcMainInvokeEvent, session: SessionData, ...args: T) => Promise<unknown>) {
  return withAuthFromStore(async (event, session, ...args: T) => {
    if (session.role !== 'pl' && session.role !== 'pm' && session.role !== 'admin') {
      return { status: 'error' as const, code: 'FORBIDDEN', message: 'PL, PM or Admin role required' }
    }
    return handler(event, session, ...args)
  })
}

/** Chỉ admin mới được gọi handler (dùng cho createProject, tạo user, v.v.) */
function requireAdminFromStore<T extends unknown[]>(handler: (event: IpcMainInvokeEvent, session: SessionData, ...args: T) => Promise<unknown>) {
  return withAuthFromStore(async (event, session, ...args: T) => {
    if (session.role !== 'admin') {
      return { status: 'error' as const, code: 'FORBIDDEN', message: 'Chỉ admin mới được thực hiện thao tác này' }
    }
    return handler(event, session, ...args)
  })
}

/** Chỉ admin hoặc PL mới được gọi handler (dùng cho tạo coding rule). */
function requireAdminOrPl<T extends unknown[]>(handler: (event: IpcMainInvokeEvent, session: SessionData, ...args: T) => Promise<unknown>) {
  return withAuthFromStore(async (event, session, ...args: T) => {
    if (session.role !== 'admin' && session.role !== 'pl') {
      return { status: 'error' as const, code: 'FORBIDDEN', message: 'Chỉ admin hoặc PL mới được tạo coding rule' }
    }
    return handler(event, session, ...args)
  })
}

export function registerTaskIpcHandlers() {
  l.info('Registering Task IPC Handlers...')

  ipcMain.handle(IPC.TASK.CHECK_ONEDRIVE, async () => {
    const { oneDriveClientId, oneDriveClientSecret, oneDriveRefreshToken } = configurationStore.store
    if (!oneDriveClientId?.trim() || !oneDriveClientSecret?.trim() || !oneDriveRefreshToken?.trim()) {
      return { ok: false, code: 'ONEDRIVE_NOT_CONFIGURED' }
    }
    return { ok: true }
  })

  ipcMain.handle(IPC.TASK.CHECK_TASK_API, async () => {
    const { dbHost, dbName } = configurationStore.store
    if (!dbHost?.trim() || !dbName?.trim()) {
      return { ok: false, code: 'TASK_DB_NOT_CONFIGURED' }
    }
    const res = await testConnection()
    if (!res.ok) return { ok: false, code: 'TASK_DB_UNREACHABLE', error: res.error }
    return { ok: true }
  })

  ipcMain.handle(IPC.TASK.CHECK_TASK_SCHEMA_APPLIED, async () => {
    return checkTaskSchemaAppliedOverConnection()
  })

  ipcMain.handle(IPC.TASK.GET_REMINDER_STATS, async (_event, token: string) => {
    const session = verifyToken(token)
    if (!session) return { status: 'error' as const, code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    const run = async () => getReminderStats(session.userId, session.role)
    try {
      const data = await run()
      return { status: 'success' as const, data }
    } catch (error: any) {
      const msg = error?.message ?? String(error)
      if (msg.includes('Pool is closed')) {
        await resetPoolAndWait()
        await new Promise(r => setTimeout(r, 200))
        try {
          const data = await run()
          return { status: 'success' as const, data }
        } catch (retryErr: any) {
          l.error('task:get-reminder-stats error (after retry):', retryErr)
          return { status: 'error' as const, message: retryErr?.message ?? String(retryErr) }
        }
      }
      l.error('task:get-reminder-stats error:', error)
      return { status: 'error' as const, message: msg }
    }
  })

  ipcMain.handle(
    IPC.TASK.SEND_DEADLINE_REMINDERS,
    withAuthFromStore(async (_event, session) => {
      const run = async (): Promise<{ status: 'success' }> => {
        const stats = await getReminderStats(session.userId, session.role)
        const { overdueCount, todayCount, tomorrowCount } = stats.devStats
        if (overdueCount > 0) {
          await persistAndSendTaskNotification(session.userId, 'deadline_overdue', 'Task quá hạn', `Bạn có ${overdueCount} task quá hạn`, undefined, session.userId)
        }
        if (todayCount > 0) {
          await persistAndSendTaskNotification(session.userId, 'deadline_today', 'Task deadline hôm nay', `Bạn có ${todayCount} task deadline hôm nay`, undefined, session.userId)
        }
        if (tomorrowCount > 0) {
          await persistAndSendTaskNotification(
            session.userId,
            'deadline_tomorrow',
            'Task sắp deadline',
            `Bạn có ${tomorrowCount} task deadline ngày mai`,
            undefined,
            session.userId
          )
        }
        const { needReviewCount, longUnreviewedCount } = stats.plStats
        if (longUnreviewedCount > 0) {
          await persistAndSendTaskNotification(
            session.userId,
            'review_long_unreviewed',
            'Task lâu chưa review',
            `Bạn có ${longUnreviewedCount} task lâu chưa review (quá 3 ngày)`,
            undefined,
            session.userId
          )
        }
        if (needReviewCount > 0) {
          await persistAndSendTaskNotification(
            session.userId,
            'review_needed',
            'Task cần review',
            `Bạn có ${needReviewCount} task cần review`,
            undefined,
            session.userId
          )
        }
        return { status: 'success' as const }
      }
      try {
        return await run()
      } catch (error: any) {
        const msg = error?.message ?? String(error)
        if (msg.includes('Pool is closed')) {
          await resetPoolAndWait()
          await new Promise(r => setTimeout(r, 200))
          try {
            return await run()
          } catch (retryErr: any) {
            l.error('task:send-deadline-reminders error (after retry):', retryErr)
            return { status: 'error' as const, message: retryErr?.message ?? String(retryErr) }
          }
        }
        l.error('task:send-deadline-reminders error:', error)
        return { status: 'error' as const, message: msg }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_PROJECT_MEMBERS,
    withAuthFromStore(async (_event, session, projectId: string) => {
      try {
        const [data, perms] = await Promise.all([getProjectMembers(projectId), getCanManageProjectRoles(session.userId, projectId)])
        return { status: 'success' as const, data: { ...data, ...perms } }
      } catch (error: any) {
        l.error('task:get-project-members error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(IPC.TASK.INIT_TASK_SCHEMA, async () => {
    try {
      const recreated = await initTaskSchema()
      return { recreated }
    } catch (error: any) {
      l.error('task:init-schema error:', error)
      throw new Error(error?.message ?? String(error))
    }
  })

  ipcMain.handle(
    IPC.TASK.GET_ALL,
    withAuthFromStore(async (_event, session, projectId?: string) => {
      try {
        const tasks = await getTasksForSession(session.userId, session.role, projectId)
        return { status: 'success' as const, data: tasks }
      } catch (error: any) {
        l.error('task:get-all error:', error)
        if (error?.response?.status === 401 || error?.statusCode === 401) {
          return { status: 'error' as const, code: 'UNAUTHORIZED', message: error.message }
        }
        if (error?.response?.status === 403 || error?.statusCode === 403) {
          return { status: 'error' as const, code: 'FORBIDDEN', message: error.message }
        }
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.LIST_FOR_PICKER_PAGE,
    withAuthFromStore(async (_event, session, body: ListTasksForPickerParams) => {
      try {
        const offset = Math.max(0, Math.floor(Number(body?.offset) || 0))
        const limit = Math.min(100, Math.max(1, Math.floor(Number(body?.limit) || 80)))
        const data = await listTasksForPickerPage(session.userId, session.role, {
          offset,
          limit,
          search: typeof body?.search === 'string' ? body.search : undefined,
          pickerMode: body?.pickerMode === 'subtask' ? 'subtask' : 'link',
          contextProjectId: body?.contextProjectId === undefined ? undefined : body.contextProjectId,
          excludeTaskIds: Array.isArray(body?.excludeTaskIds) ? body.excludeTaskIds.filter((x): x is string => typeof x === 'string') : [],
        })
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:list-for-picker-page error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  function parseTaskManagementListBody(body: unknown): TaskManagementListParams {
    const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const page = Math.max(1, Math.floor(Number(b.page) || 1))
    const limit = Math.min(100, Math.max(1, Math.floor(Number(b.limit) || 25)))
    const sortColumn = b.sortColumn === null || b.sortColumn === undefined ? null : typeof b.sortColumn === 'string' ? b.sortColumn : null
    const sortDirection = b.sortDirection === 'desc' ? 'desc' : 'asc'
    const dr = b.dateRange && typeof b.dateRange === 'object' ? (b.dateRange as Record<string, unknown>) : null
    const dateRange =
      dr && typeof dr.from === 'string'
        ? { from: dr.from.slice(0, 32), to: typeof dr.to === 'string' ? dr.to.slice(0, 32) : undefined }
        : undefined
    return {
      page,
      limit,
      search: typeof b.search === 'string' ? b.search : undefined,
      statusCodes: Array.isArray(b.statusCodes) ? b.statusCodes.filter((x): x is string => typeof x === 'string') : undefined,
      assigneeUserIds: Array.isArray(b.assigneeUserIds) ? b.assigneeUserIds.filter((x): x is string => typeof x === 'string') : undefined,
      typeCodes: Array.isArray(b.typeCodes) ? b.typeCodes.filter((x): x is string => typeof x === 'string') : undefined,
      priorityCodes: Array.isArray(b.priorityCodes) ? b.priorityCodes.filter((x): x is string => typeof x === 'string') : undefined,
      projectIds: Array.isArray(b.projectIds) ? b.projectIds.filter((x): x is string => typeof x === 'string') : undefined,
      dateRange,
      sortColumn,
      sortDirection,
    }
  }

  ipcMain.handle(
    IPC.TASK.LIST_FOR_MANAGEMENT,
    withAuthFromStore(async (_event, session, body: unknown) => {
      try {
        const params = parseTaskManagementListBody(body)
        const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
        const includeFacets = b.includeFacets === false ? false : true
        const data = await listTasksForManagementWithFacets(session.userId, session.role, params, { includeFacets })
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:list-for-management error:', error)
        if (error?.response?.status === 401 || error?.statusCode === 401) {
          return { status: 'error' as const, code: 'UNAUTHORIZED' as const, message: error.message }
        }
        if (error?.response?.status === 403 || error?.statusCode === 403) {
          return { status: 'error' as const, code: 'FORBIDDEN' as const, message: error.message }
        }
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.LIST_FOR_MANAGEMENT_CHARTS,
    withAuthFromStore(async (_event, session, body: unknown) => {
      try {
        const p = parseTaskManagementListBody(body)
        const data = await listTasksForManagementForCharts(session.userId, session.role, {
          search: p.search,
          statusCodes: p.statusCodes,
          assigneeUserIds: p.assigneeUserIds,
          typeCodes: p.typeCodes,
          priorityCodes: p.priorityCodes,
          projectIds: p.projectIds,
          dateRange: p.dateRange,
        })
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:list-for-management-charts error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_MANAGEMENT_SCOPE_META,
    withAuthFromStore(async (_event, session) => {
      try {
        const data = await getManagementScopeMeta(session.userId, session.role)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:get-management-scope-meta error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_TASK,
    withAuthFromStore(async (_event, session, id: string) => {
      try {
        const task = await getTask(id)
        if (!task) return { status: 'error' as const, message: 'Task not found' }
        const ok = await canUserViewTaskByScope(session.userId, session.role, task)
        if (!ok) return { status: 'error' as const, code: 'FORBIDDEN' as const, message: 'Không có quyền xem task này' }
        return { status: 'success' as const, data: task }
      } catch (error: any) {
        l.error('task:get-task error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.CREATE,
    withAuthFromStore(async (_event, session, input: CreateTaskInput) => {
      try {
        const task = await createTask({ ...input, createdBy: session.userId })
        if (task.assigneeUserId && task.title) {
          await persistAndSendTaskNotification(task.assigneeUserId, 'assign', 'Task mới được assign', `Bạn được assign task mới: "${task.title}"`, task.id, session.userId)
        }
        onTaskCreated(session.userId).catch(() => { })
        return { status: 'success' as const, data: task }
      } catch (error: any) {
        l.error('task:create error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.UPDATE_STATUS,
    withAuthFromStore(async (_event, session, id: string, status: TaskStatus, version?: number) => {
      try {
        const task = await getTask(id)
        if (!task) return { status: 'error' as const, message: 'Task not found' }
        const projectId = task.projectId
        if (!projectId || typeof projectId !== 'string') return { status: 'error' as const, code: 'FORBIDDEN', message: 'Task không có project' }
        const canUpdate =
          task.status === 'done'
            ? await canUserUpdateOrDeleteDoneTask(session.userId, projectId, session.role === 'admin')
            : await canUserUpdateTask(session.userId, projectId, task.assigneeUserId ?? null, session.role === 'admin')
        if (!canUpdate) return { status: 'error' as const, code: 'FORBIDDEN', message: 'Không có quyền sửa task' }
        await updateTaskStatus(id, status, version, session.userId)
        const updatedTask = await getTask(id)
        if (!updatedTask) return { status: 'error' as const, message: 'Task not found' }
        const updatedProjectId = updatedTask.projectId
        if (updatedProjectId && typeof updatedProjectId === 'string' && updatedProjectId.trim()) {
          const plIds = await getProjectPlUserIds(updatedProjectId)
          const assigneeId = updatedTask.assigneeUserId
          const title = updatedTask.title || 'Task'
          if (status === 'done' && plIds.length > 0) {
            const assigneeName = assigneeId ? (await getUsers()).find((u: any) => u.id === assigneeId)?.name : ''
            for (const plId of plIds)
              await persistAndSendTaskNotification(plId, 'done', 'Task hoàn thành', `Task "${title}" đã hoàn thành bởi ${assigneeName || 'assignee'}`, id, session.userId)
          } else if (status === 'in_review' && plIds.length > 0) {
            for (const plId of plIds) await persistAndSendTaskNotification(plId, 'review', 'Task cần review', `Task "${title}" cần review`, id, session.userId)
          } else if (status === 'feedback' && assigneeId) {
            await persistAndSendTaskNotification(assigneeId, 'feedback', 'Task có feedback', `Task "${title}" có feedback cần xử lý`, id, session.userId)
          }
        }
        if (status === 'done' && updatedTask.assigneeUserId) {
          onTaskDone(updatedTask.assigneeUserId, {
            taskId: id,
            type: updatedTask.type,
            priority: updatedTask.priority,
            planEndDate: updatedTask.planEndDate,
            actualEndDate: updatedTask.actualEndDate,
          }).catch(() => { })
        }
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:update-status error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.UPDATE_PROGRESS,
    withAuthFromStore(async (_event, session, id: string, progress: number, version?: number) => {
      try {
        const task = await getTask(id)
        if (!task) return { status: 'error' as const, message: 'Task not found' }
        const projectId = task.projectId
        if (!projectId || typeof projectId !== 'string') return { status: 'error' as const, code: 'FORBIDDEN', message: 'Task không có project' }
        const canUpdate =
          task.status === 'done'
            ? await canUserUpdateOrDeleteDoneTask(session.userId, projectId, session.role === 'admin')
            : await canUserUpdateTask(session.userId, projectId, task.assigneeUserId ?? null, session.role === 'admin')
        if (!canUpdate) return { status: 'error' as const, code: 'FORBIDDEN', message: 'Không có quyền sửa task' }
        await updateTaskProgress(id, progress, version, session.userId)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:update-progress error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.UPDATE_DATES,
    withAuthFromStore(async (_event, session, id: string, dates: { planStartDate?: string; planEndDate?: string; actualStartDate?: string; actualEndDate?: string }, version?: number) => {
      try {
        const task = await getTask(id)
        if (!task) return { status: 'error' as const, message: 'Task not found' }
        const projectId = task.projectId
        if (!projectId || typeof projectId !== 'string') return { status: 'error' as const, code: 'FORBIDDEN', message: 'Task không có project' }
        const canUpdate =
          task.status === 'done'
            ? await canUserUpdateOrDeleteDoneTask(session.userId, projectId, session.role === 'admin')
            : await canUserUpdateTask(session.userId, projectId, task.assigneeUserId ?? null, session.role === 'admin')
        if (!canUpdate) return { status: 'error' as const, code: 'FORBIDDEN', message: 'Không có quyền sửa task' }
        await updateTaskDates(id, dates, version, session.userId)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:update-dates error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.UPDATE_TASK,
    withAuthFromStore(async (_event, session, id: string, data: UpdateTaskInput) => {
      try {
        const before = await getTask(id)
        if (!before) return { status: 'error' as const, message: 'Task not found' }
        const projectId = before.projectId
        if (!projectId || typeof projectId !== 'string') return { status: 'error' as const, message: 'Task has no project' }
        const canUpdate =
          before.status === 'done'
            ? await canUserUpdateOrDeleteDoneTask(session.userId, projectId, session.role === 'admin')
            : await canUserUpdateTask(session.userId, projectId, before.assigneeUserId ?? null, session.role === 'admin')
        if (!canUpdate) return { status: 'error' as const, code: 'FORBIDDEN', message: 'Không có quyền sửa task' }
        if (data.parentId !== undefined) {
          const parentTask = data.parentId ? await getTask(data.parentId) : null
          if (parentTask && parentTask.status === 'done') {
            const parentProjectId = parentTask.projectId
            if (parentProjectId && typeof parentProjectId === 'string') {
              const canUpdateParent = await canUserUpdateOrDeleteDoneTask(session.userId, parentProjectId, session.role === 'admin')
              if (!canUpdateParent) return { status: 'error' as const, code: 'FORBIDDEN', message: 'Không có quyền thêm child vào task đã done' }
            }
          }
        }
        await updateTask(id, data, session.userId)
        const after = await getTask(id)
        if (!after) return { status: 'error' as const, message: 'Task not found' }
        const updatedProjectId = after.projectId
        if (data.status !== undefined && data.status === 'done' && data.status !== before?.status && after.assigneeUserId) {
          onTaskDone(after.assigneeUserId, {
            taskId: id,
            type: after.type,
            priority: after.priority,
            planEndDate: after.planEndDate,
            actualEndDate: after.actualEndDate,
          }).catch(() => { })
        }
        if (!updatedProjectId || typeof updatedProjectId !== 'string' || !updatedProjectId.trim()) return { status: 'success' as const }
        const plIds = await getProjectPlUserIds(updatedProjectId)
        const title = after.title || 'Task'
        if (data.status !== undefined && data.status !== before?.status) {
          if (data.status === 'done' && plIds.length > 0) {
            const assigneeName = after.assigneeUserId ? (await getUsers()).find((u: any) => u.id === after.assigneeUserId)?.name : ''
            for (const plId of plIds)
              await persistAndSendTaskNotification(plId, 'done', 'Task hoàn thành', `Task "${title}" đã hoàn thành bởi ${assigneeName || 'assignee'}`, id, session.userId)
          } else if (data.status === 'in_review' && plIds.length > 0) {
            for (const plId of plIds) await persistAndSendTaskNotification(plId, 'review', 'Task cần review', `Task "${title}" cần review`, id, session.userId)
          } else if (data.status === 'feedback' && after.assigneeUserId) {
            await persistAndSendTaskNotification(after.assigneeUserId, 'feedback', 'Task có feedback', `Task "${title}" có feedback cần xử lý`, id, session.userId)
          }
        }
        if (data.assigneeUserId !== undefined && data.assigneeUserId !== before?.assigneeUserId && data.assigneeUserId) {
          await persistAndSendTaskNotification(data.assigneeUserId, 'assign', 'Task được assign', `Bạn được assign task: "${title}"`, id, session.userId)
        }
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:update-task error:', error)
        if (error?.code === 'VERSION_CONFLICT') {
          return { status: 'error' as const, code: 'VERSION_CONFLICT', message: error?.message ?? String(error) }
        }
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.DELETE_TASK,
    withAuthFromStore(async (_event, session, id: string, version?: number) => {
      try {
        const task = await getTask(id)
        if (!task) return { status: 'error' as const, message: 'Task not found' }
        const projectId = task.projectId
        if (!projectId || typeof projectId !== 'string') return { status: 'error' as const, message: 'Task has no project' }
        const canDelete =
          task.status === 'done'
            ? await canUserUpdateOrDeleteDoneTask(session.userId, projectId, session.role === 'admin')
            : session.role === 'admin'
              ? true
              : await canUserDeleteTask(session.userId, projectId)
        if (!canDelete) return { status: 'error' as const, code: 'FORBIDDEN', message: 'Không có quyền xóa task' }
        await deleteTask(id, version)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:delete-task error:', error)
        if (error?.code === 'VERSION_CONFLICT') {
          return { status: 'error' as const, code: 'VERSION_CONFLICT', message: error?.message ?? String(error) }
        }
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.CAN_EDIT_TASK,
    withAuthFromStore(async (_event, session, taskId: string) => {
      try {
        const task = await getTask(taskId)
        if (!task) return { status: 'success' as const, data: { canEdit: false, canDelete: false } }
        const projectId = task.projectId
        if (!projectId || typeof projectId !== 'string') return { status: 'success' as const, data: { canEdit: false, canDelete: false } }
        const [canEdit, canDelete] =
          task.status === 'done'
            ? await Promise.all([
              canUserUpdateOrDeleteDoneTask(session.userId, projectId, session.role === 'admin'),
              canUserUpdateOrDeleteDoneTask(session.userId, projectId, session.role === 'admin'),
            ])
            : await Promise.all([
              canUserUpdateTask(session.userId, projectId, task.assigneeUserId ?? null, session.role === 'admin'),
              session.role === 'admin' ? Promise.resolve(true) : canUserDeleteTask(session.userId, projectId),
            ])
        return { status: 'success' as const, data: { canEdit, canDelete } }
      } catch (error: any) {
        l.error('task:can-edit-task error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_FAVORITE_TASK_IDS,
    withAuthFromStore(async (_event, session) => {
      try {
        const ids = await getFavoriteTaskIds(session.userId)
        return { status: 'success' as const, data: Array.from(ids) }
      } catch (error: any) {
        l.error('task:get-favorite-task-ids error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.ADD_TASK_FAVORITE,
    withAuthFromStore(async (_event, session, taskId: string) => {
      try {
        await addTaskFavorite(session.userId, taskId)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:add-task-favorite error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.REMOVE_TASK_FAVORITE,
    withAuthFromStore(async (_event, session, taskId: string) => {
      try {
        await removeTaskFavorite(session.userId, taskId)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:remove-task-favorite error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.COPY_TASK,
    withAuthFromStore(async (_event, session, taskId: string) => {
      try {
        const task = await copyTask(taskId, session.userId)
        if (task.assigneeUserId && task.title) {
          await persistAndSendTaskNotification(task.assigneeUserId, 'assign', 'Task mới được assign', `Bạn được assign task mới: "${task.title}"`, task.id, session.userId)
        }
        return { status: 'success' as const, data: task }
      } catch (error: any) {
        l.error('task:copy-task error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.ASSIGN,
    withAuthFromStore(async (_event, session, id: string, assigneeUserId: string | null, version?: number) => {
      try {
        const task = await getTask(id)
        if (!task) return { status: 'error' as const, message: 'Task not found' }
        const projectId = task.projectId
        if (!projectId || typeof projectId !== 'string') return { status: 'error' as const, code: 'FORBIDDEN', message: 'Task không có project' }
        const canUpdate =
          task.status === 'done'
            ? await canUserUpdateOrDeleteDoneTask(session.userId, projectId, session.role === 'admin')
            : await canUserUpdateTask(session.userId, projectId, task.assigneeUserId ?? null, session.role === 'admin')
        if (!canUpdate) return { status: 'error' as const, code: 'FORBIDDEN', message: 'Không có quyền sửa task' }
        await assignTask(id, assigneeUserId, version, session.userId)
        if (assigneeUserId) {
          const task = await getTask(id)
          if (task?.title) {
            await persistAndSendTaskNotification(assigneeUserId, 'assign', 'Task được assign', `Bạn được assign task: "${task.title}"`, id, session.userId)
          }
        }
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:assign error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.SELECT_CSV_FILE,
    withAuthFromStore(async (_event, _session) => {
      try {
        const win = BrowserWindow.getAllWindows()[0] ?? undefined
        const result = await dialog.showOpenDialog(win, {
          title: 'Select Redmine CSV file',
          filters: [
            { name: 'CSV', extensions: ['csv'] },
            { name: 'All', extensions: ['*'] },
          ],
          properties: ['openFile'],
        })
        if (result.canceled || !result.filePaths.length) {
          return { canceled: true }
        }
        const content = await readFile(result.filePaths[0], 'utf-8')
        return { canceled: false, content }
      } catch (error: any) {
        l.error('task:select-csv-file error:', error)
        return { canceled: true, error: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.IMPORT_REDMINE_CSV,
    withAuthFromStore(async (_event, session, csvContent: string) => {
      try {
        const users = await getUsers()
        const { created, updated, errors } = await createTasksFromRedmineCsv(csvContent, users as any, session.userId)
        return { status: 'success' as const, created, updated, errors }
      } catch (error: any) {
        l.error('task:import-redmine-csv error:', error)
        if (error?.response?.status === 401 || error?.statusCode === 401) {
          return { status: 'error' as const, code: 'UNAUTHORIZED', message: error.message }
        }
        if (error?.response?.status === 403 || error?.statusCode === 403) {
          return { status: 'error' as const, code: 'FORBIDDEN', message: error.message }
        }
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_PROJECTS,
    withAuthFromStore(async (_event, _session) => {
      try {
        const projects = await getProjects()
        return { status: 'success' as const, data: projects }
      } catch (error: any) {
        l.error('task:get-projects error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_PROJECTS_FOR_TASK_UI,
    withAuthFromStore(async (_event, session) => {
      try {
        const projects = await getProjectsForTaskManagement(session.userId, session.role)
        return { status: 'success' as const, data: projects }
      } catch (error: any) {
        l.error('task:get-projects-for-task-ui error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.CREATE_PROJECT,
    requireAdminFromStore(async (_event, _session, name: string, pmUserId?: string | null) => {
      try {
        const project = await createProject(name, pmUserId)
        return { status: 'success' as const, data: project }
      } catch (error: any) {
        l.error('task:create-project error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.UPDATE_PROJECT,
    withAuthFromStore(async (_event, _session, id: string, name: string, version?: number) => {
      try {
        const project = await updateProject(id, name, version)
        return { status: 'success' as const, data: project }
      } catch (error: any) {
        l.error('task:update-project error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_PROJECT_REMINDER_TIME,
    withAuthFromStore(async (_event, _session, projectId: string) => {
      try {
        const time = await getProjectReminderTime(projectId)
        return { status: 'success' as const, data: time }
      } catch (error: any) {
        l.error('task:get-project-reminder-time error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.UPDATE_PROJECT_REMINDER_TIME,
    requirePlOrAdmin(async (_event, _session, projectId: string, time: string | null) => {
      try {
        await updateProjectReminderTime(projectId, time)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:update-project-reminder-time error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.DELETE_PROJECT,
    withAuthFromStore(async (_event, _session, id: string, version?: number) => {
      try {
        await deleteProject(id, version)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:delete-project error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.UPSERT_USER_PROJECT_SOURCE_FOLDER,
    withAuthFromStore(async (_event, session, projectId: string, sourceFolderPath: string, sourceFolderName?: string) => {
      try {
        const result = await upsertUserProjectSourceFolder(session.userId, projectId, sourceFolderPath, sourceFolderName)
        if (!result.success) return { status: 'error' as const, message: result.error }
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:upsert-user-project-source-folder error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_SOURCE_FOLDERS_BY_PROJECT,
    withAuthFromStore(async (_event, session, projectId: string) => {
      try {
        const data = await getSourceFoldersByProject(session.userId, projectId)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:get-source-folders-by-project error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_SOURCE_FOLDERS_BY_PROJECTS,
    withAuthFromStore(async (_event, session, projectIds: string[]) => {
      try {
        const ids = Array.isArray(projectIds) ? projectIds.filter((id): id is string => typeof id === 'string') : []
        const data = await getSourceFoldersByProjects(session.userId, ids)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:get-source-folders-by-projects error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_USER_PROJECT_SOURCE_FOLDER_MAPPINGS,
    withAuthFromStore(async (_event, session) => {
      try {
        const mappings = await getUserProjectSourceFolderMappings(session.userId)
        return { status: 'success' as const, data: mappings }
      } catch (error: any) {
        l.error('task:get-user-project-source-folder-mappings error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_PROJECTS_FOR_USER,
    withAuthFromStore(async (_event, session) => {
      try {
        const projects = await getProjectsForUser(session.userId)
        return { status: 'success' as const, data: projects }
      } catch (error: any) {
        l.error('task:get-projects-for-user error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_PROJECTS_FOR_LEADERBOARD_PICKER,
    withAuthFromStore(async (_event, session) => {
      try {
        const data = await getProjectsForLeaderboardPicker(session.userId)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:get-projects-for-leaderboard-picker error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.DELETE_USER_PROJECT_SOURCE_FOLDER,
    withAuthFromStore(async (_event, session, sourceFolderPath: string) => {
      try {
        await deleteUserProjectSourceFolder(session.userId, sourceFolderPath)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:delete-user-project-source-folder error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_PROJECT_ID_BY_USER_AND_PATH,
    withAuthFromStore(async (_event, session, sourceFolderPath: string) => {
      try {
        const projectId = await getProjectIdByUserAndPath(session.userId, sourceFolderPath)
        return { status: 'success' as const, data: projectId }
      } catch (error: any) {
        l.error('task:get-project-id-by-user-and-path error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.HAS_PL_ROLE,
    withAuthFromStore(async (_event, _session, userId: string) => {
      try {
        const result = await hasPlRole(userId)
        return { status: 'success' as const, data: result }
      } catch (error: any) {
        l.error('task:has-pl-role error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.CODING_RULE_GET_FOR_SELECTION,
    withAuthFromStore(async (_event, session, sourceFolderPath: string) => {
      try {
        const data = await getCodingRulesForSelection(session.userId, sourceFolderPath)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:coding-rule:get-for-selection error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(IPC.TASK.CODING_RULE_GET_GLOBAL_ONLY, async () => {
    try {
      const data = await getCodingRulesGlobalOnly()
      return { status: 'success' as const, data }
    } catch (error: any) {
      l.error('task:coding-rule:get-global-only error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.TASK.CODING_RULE_GET_CONTENT, async (_event, idOrName: string, options?: { sourceFolderPath?: string; userId?: string }) => {
    try {
      const content = await getCodingRuleContentByIdOrName(idOrName, options)
      return { status: 'success' as const, data: content }
    } catch (error: any) {
      l.error('task:coding-rule:get-content error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(
    IPC.TASK.CODING_RULE_CREATE,
    requireAdminOrPl(async (_event, session, input: { name: string; content: string; projectId?: string | null }) => {
      try {
        const data = await createCodingRule({
          name: input.name,
          content: input.content,
          projectId: input.projectId ?? null,
          createdBy: session.userId,
        })
        onCodingRuleCreated(session.userId).catch(() => { })
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:coding-rule:create error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.CODING_RULE_UPDATE,
    withAuthFromStore(async (_event, session, id: string, input: { name?: string; content?: string }) => {
      try {
        const data = await updateCodingRule(id, input, session.userId)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:coding-rule:update error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.CODING_RULE_DELETE,
    withAuthFromStore(async (_event, session, id: string) => {
      try {
        await deleteCodingRule(id, session.userId)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:coding-rule:delete error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.CODING_RULE_GET_FOR_MANAGEMENT,
    withAuthFromStore(async (_event, session) => {
      try {
        const data = await getCodingRulesForManagement(session.userId)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:coding-rule:get-for-management error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_TASK_CHILDREN,
    withAuthFromStore(async (_event, _session, taskId: string) => {
      try {
        const data = await getTaskChildren(taskId)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:get-task-children error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.CREATE_TASK_CHILD,
    withAuthFromStore(async (_event, session, taskId: string, input: CreateTaskInput) => {
      try {
        const parentTask = await getTask(taskId)
        if (!parentTask) return { status: 'error' as const, message: 'Task not found' }
        if (parentTask.status === 'done') {
          const projectId = parentTask.projectId
          if (!projectId || typeof projectId !== 'string') return { status: 'error' as const, code: 'FORBIDDEN', message: 'Task không có project' }
          const canUpdate = await canUserUpdateOrDeleteDoneTask(session.userId, projectId, session.role === 'admin')
          if (!canUpdate) return { status: 'error' as const, code: 'FORBIDDEN', message: 'Không có quyền thêm sub-task vào task đã done' }
        }
        const data = await createTaskChild(taskId, { ...input, createdBy: session.userId })
        if (data.assigneeUserId && data.title) {
          await persistAndSendTaskNotification(data.assigneeUserId, 'assign', 'Task mới được assign', `Bạn được assign task mới: "${data.title}"`, data.id, session.userId)
        }
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:create-task-child error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.GET_TASK_LINKS,
    withAuthFromStore(async (_event, _session, taskId: string) => {
      try {
        const data = await getTaskLinks(taskId)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:get-task-links error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.CREATE_TASK_LINK,
    withAuthFromStore(async (_event, session, taskId: string, toTaskId: string, linkType: string) => {
      try {
        const task = await getTask(taskId)
        if (!task) return { status: 'error' as const, message: 'Task not found' }
        if (task.status === 'done') {
          const projectId = task.projectId
          if (!projectId || typeof projectId !== 'string') return { status: 'error' as const, code: 'FORBIDDEN', message: 'Task không có project' }
          const canUpdate = await canUserUpdateOrDeleteDoneTask(session.userId, projectId, session.role === 'admin')
          if (!canUpdate) return { status: 'error' as const, code: 'FORBIDDEN', message: 'Không có quyền thêm link vào task đã done' }
        }
        const data = await createTaskLink(taskId, toTaskId, linkType)
        return { status: 'success' as const, data }
      } catch (error: any) {
        l.error('task:create-task-link error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(
    IPC.TASK.DELETE_TASK_LINK,
    withAuthFromStore(async (_event, session, taskId: string, linkId: string, version?: number) => {
      try {
        const task = await getTask(taskId)
        if (!task) return { status: 'error' as const, message: 'Task not found' }
        if (task.status === 'done') {
          const projectId = task.projectId
          if (!projectId || typeof projectId !== 'string') return { status: 'error' as const, code: 'FORBIDDEN', message: 'Task không có project' }
          const canUpdate = await canUserUpdateOrDeleteDoneTask(session.userId, projectId, session.role === 'admin')
          if (!canUpdate) return { status: 'error' as const, code: 'FORBIDDEN', message: 'Không có quyền xóa link của task đã done' }
        }
        await deleteTaskLink(taskId, linkId, version)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:delete-task-link error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  // Commit Review save/delete - chỉ PL hoặc admin mới được mark/unmark
  ipcMain.handle(
    IPC.TASK.COMMIT_REVIEW_SAVE,
    requirePlOrAdmin(
      async (
        _event,
        session,
        record: {
          sourceFolderPath: string
          commitId: string
          vcsType: 'git' | 'svn'
          reviewerUserId?: string | null
          note?: string | null
        }
      ) => {
        try {
          // Luôn gắn người review = user đang đăng nhập (token hợp lệ), không tin reviewerUserId từ client.
          const merged = { ...record, reviewerUserId: session.userId }
          await saveCommitReview(merged)
          if (merged.reviewerUserId) onCommitReview(merged.reviewerUserId).catch(() => { })
          return { status: 'success' as const }
        } catch (error: any) {
          l.error('task:commit-review:save error:', error)
          return { status: 'error' as const, message: error?.message ?? String(error) }
        }
      }
    )
  )

  ipcMain.handle(
    IPC.TASK.COMMIT_REVIEW_DELETE,
    requirePlOrAdmin(async (_event, _session, sourceFolderPath: string, commitId: string, version?: number) => {
      try {
        await deleteCommitReview(sourceFolderPath, commitId, version)
        return { status: 'success' as const }
      } catch (error: any) {
        l.error('task:commit-review:delete error:', error)
        return { status: 'error' as const, message: error?.message ?? String(error) }
      }
    })
  )

  ipcMain.handle(IPC.TASK.COMMIT_REVIEW_GET, async (_event, sourceFolderPath: string, commitId: string) => {
    try {
      const data = await getCommitReview(sourceFolderPath, commitId)
      return { status: 'success' as const, data }
    } catch (error: any) {
      l.error('task:commit-review:get error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.TASK.COMMIT_REVIEW_GET_ALL_BY_SOURCE, async (_event, sourceFolderPath: string) => {
    try {
      const data = await getCommitReviewsBySourceFolder(sourceFolderPath)
      return { status: 'success' as const, data }
    } catch (error: any) {
      l.error('task:commit-review:get-all-by-source error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  ipcMain.handle(IPC.TASK.COMMIT_REVIEW_GET_REVIEWED_IDS, async (_event, sourceFolderPath: string) => {
    try {
      const set = await getReviewedCommitIds(sourceFolderPath)
      return { status: 'success' as const, data: Array.from(set) }
    } catch (error: any) {
      l.error('task:commit-review:get-reviewed-ids error:', error)
      return { status: 'error' as const, message: error?.message ?? String(error) }
    }
  })

  l.info('Task IPC Handlers Registered')
}
