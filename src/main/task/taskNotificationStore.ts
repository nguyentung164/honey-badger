import { randomUuidV7 } from 'shared/randomUuidV7'
import { hasDbConfig, query } from './db'

const DEFAULT_UNREAD_LIMIT = 50
let isReadColumnIsBoolean: boolean | null = null

export type TaskNotificationType =
  | 'assign'
  | 'done'
  | 'review'
  | 'feedback'
  | 'deadline_overdue'
  | 'deadline_today'
  | 'deadline_tomorrow'
  | 'review_needed'
  | 'review_long_unreviewed'
  | 'achievement_unlocked'
  | 'rank_up'

export interface TaskNotificationRow {
  id: string
  target_user_id: string
  type: string
  title: string
  body: string | null
  task_id: string | null
  is_read: boolean
  created_at: Date
}

async function detectIsReadColumnType(): Promise<boolean> {
  if (isReadColumnIsBoolean !== null) return isReadColumnIsBoolean
  try {
    const rows = await query<{ data_type?: string }>(
      `SELECT data_type
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'task_notifications'
         AND column_name = 'is_read'
       LIMIT 1`
    )
    const dataType = rows?.[0]?.data_type?.toLowerCase() ?? ''
    isReadColumnIsBoolean = dataType === 'boolean'
  } catch {
    isReadColumnIsBoolean = true
  }
  return isReadColumnIsBoolean
}

/**
 * Insert thông báo task vào DB (cho cross-machine polling).
 * @returns id của notification vừa tạo
 */
export async function insertTaskNotification(
  targetUserId: string,
  type: TaskNotificationType,
  title: string,
  body: string,
  taskId?: string | null
): Promise<string> {
  if (!hasDbConfig()) throw new Error('Task database not configured')
  const id = randomUuidV7()
  await query(
    `INSERT INTO task_notifications (id, target_user_id, type, title, body, task_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, targetUserId, type, title, body || '', taskId ?? null]
  )
  return id
}

/**
 * Lấy danh sách thông báo chưa đọc cho user, sắp xếp theo created_at ASC.
 */
export async function getUnreadByUserId(userId: string, limit = DEFAULT_UNREAD_LIMIT): Promise<TaskNotificationRow[]> {
  if (!hasDbConfig()) return []
  const limitVal = Math.max(1, Math.min(limit, 100))
  const useBoolean = await detectIsReadColumnType()
  const unreadWhere = useBoolean ? 'is_read = FALSE' : 'COALESCE(is_read, 0) = 0'
  const rows = await query(
    `SELECT id, target_user_id, type, title, body, task_id, is_read, created_at
     FROM task_notifications
     WHERE target_user_id = ? AND ${unreadWhere}
     ORDER BY created_at ASC
     LIMIT ?`,
    [userId, String(limitVal)]
  )
  return Array.isArray(rows) ? (rows as unknown as TaskNotificationRow[]) : []
}

/**
 * Đánh dấu một notification đã đọc.
 */
export async function markAsRead(id: string): Promise<void> {
  const useBoolean = await detectIsReadColumnType()
  const readValue = useBoolean ? 'TRUE' : '1'
  await query(`UPDATE task_notifications SET is_read = ${readValue} WHERE id = ?`, [id])
}

/**
 * Đánh dấu nhiều notification đã đọc.
 */
export async function markAsReadBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const useBoolean = await detectIsReadColumnType()
  const readValue = useBoolean ? 'TRUE' : '1'
  const placeholders = ids.map(() => '?').join(', ')
  await query(`UPDATE task_notifications SET is_read = ${readValue} WHERE id IN (${placeholders})`, ids)
}
