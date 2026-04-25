import { withTransaction } from './db'

/** Lấy ticket_id tiếp theo (format 000001) cho project+source. Atomic. */
export async function getNextTicketId(projectId: string, source: string): Promise<string> {
  const effectiveSource = (source || 'in_app').toLowerCase().replace(/\s+/g, '_')
  const nextValue = await withTransaction<number>(async txQuery => {
    await txQuery(
      `INSERT INTO task_ticket_sequences (project_id, source, next_value) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE next_value = next_value + 1`,
      [projectId, effectiveSource]
    )
    const rows = (await txQuery('SELECT next_value FROM task_ticket_sequences WHERE project_id = ? AND source = ?', [projectId, effectiveSource])) as any[]
    const val = rows?.[0]?.next_value
    return typeof val === 'number' ? val : Number(val) || 1
  })
  return String(nextValue).padStart(6, '0')
}
