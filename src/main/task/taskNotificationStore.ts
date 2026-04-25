import { randomUuidV7 } from 'shared/randomUuidV7'
import { hasDbConfig, query } from './db'

const DEFAULT_UNREAD_LIMIT = 50

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
  const rows = await query<TaskNotificationRow[]>(
    `SELECT id, target_user_id, type, title, body, task_id, is_read, created_at
     FROM task_notifications
     WHERE target_user_id = ? AND is_read = FALSE
     ORDER BY created_at ASC
     LIMIT ?`,
    [userId, String(limitVal)]
  )
  return Array.isArray(rows) ? rows : []
}

/**
 * Đánh dấu một notification đã đọc.
 */
export async function markAsRead(id: string): Promise<void> {
  await query(`UPDATE task_notifications SET is_read = TRUE WHERE id = ?`, [id])
}

/**
 * Đánh dấu nhiều notification đã đọc.
 */
export async function markAsReadBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(', ')
  await query(`UPDATE task_notifications SET is_read = TRUE WHERE id IN (${placeholders})`, ids)
}
