import { query } from '../schema/db'

/**
 * commit_message_history: Postgres qua IPC.
 */
export interface HistoryCommitMessage {
  message: string
  date: string
}

export async function getHistoryMessages(): Promise<HistoryCommitMessage[]> {
  const rows = await query<{ date: string; message: string }>('SELECT date, message FROM commit_message_history ORDER BY date ASC')
  if (!Array.isArray(rows)) return []
  return rows.map(r => ({ date: r.date, message: r.message }))
}

export async function addHistoryMessage(message: HistoryCommitMessage): Promise<void> {
  await query('INSERT INTO commit_message_history (date, message) VALUES (?, ?) ON CONFLICT (date) DO UPDATE SET message = EXCLUDED.message', [message.date, message.message])
}
