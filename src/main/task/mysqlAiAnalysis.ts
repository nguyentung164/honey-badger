import { query } from './db'

export interface AIAnalysisRecord {
  sourceFolderPath: string
  sourceFolderName: string
  analysisDate: string
  analysisResult: {
    mostActiveUser: { author: string; count: number }
    leastActiveUser: { author: string; count: number }
    repeatFixes: Array<{
      issue: string
      fixCount: number
      authors: string[]
    }>
    summary: string
  }
}

export interface AIAnalysisHistoryRecord {
  id?: number
  sourceFolderPath: string
  sourceFolderName: string
  analysisDate: string
  timestamp: number
  totalCommits: number
  dateRange?: string
  analysisResult: {
    mostActiveUser: { author: string; count: number }
    leastActiveUser: { author: string; count: number }
    repeatFixes: Array<{
      issue: string
      fixCount: number
      authors: string[]
    }>
    summary: string
  }
}

function parseAnalysisResult(json: string | object | null): AIAnalysisRecord['analysisResult'] | null {
  if (!json) return null
  const obj = typeof json === 'string' ? (JSON.parse(json) as object) : json
  if (!obj || typeof obj !== 'object') return null
  return obj as AIAnalysisRecord['analysisResult']
}

export async function saveAnalysis(record: AIAnalysisRecord): Promise<void> {
  const analysisResult = JSON.stringify(record.analysisResult)
  await query(
    `INSERT INTO ai_analysis (source_folder_path, source_folder_name, analysis_date, analysis_result)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       source_folder_name = VALUES(source_folder_name),
       analysis_date = VALUES(analysis_date),
       analysis_result = VALUES(analysis_result),
       updated_at = CURRENT_TIMESTAMP`,
    [record.sourceFolderPath, record.sourceFolderName, record.analysisDate, analysisResult]
  )
}

export async function getAnalysis(sourceFolderPath: string): Promise<AIAnalysisRecord | null> {
  const rows = await query<{ source_folder_path: string; source_folder_name: string; analysis_date: string; analysis_result: string }[]>(
    'SELECT source_folder_path, source_folder_name, analysis_date, analysis_result FROM ai_analysis WHERE source_folder_path = ?',
    [sourceFolderPath]
  )
  if (!Array.isArray(rows) || rows.length === 0) return null
  const r = rows[0]
  const analysisResult = parseAnalysisResult(r.analysis_result)
  if (!analysisResult) return null
  return {
    sourceFolderPath: r.source_folder_path,
    sourceFolderName: r.source_folder_name,
    analysisDate: r.analysis_date,
    analysisResult,
  }
}

export async function deleteAnalysis(sourceFolderPath: string): Promise<void> {
  await query('DELETE FROM ai_analysis WHERE source_folder_path = ?', [sourceFolderPath])
}

export async function saveAnalysisHistory(record: AIAnalysisHistoryRecord): Promise<number> {
  const analysisResult = JSON.stringify(record.analysisResult)
  const result = await query<{ insertId: number }>(
    `INSERT INTO ai_analysis_history (source_folder_path, source_folder_name, analysis_date, timestamp, total_commits, date_range, analysis_result)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      record.sourceFolderPath,
      record.sourceFolderName,
      record.analysisDate,
      record.timestamp,
      record.totalCommits,
      record.dateRange ?? null,
      analysisResult,
    ]
  )
  return Number((result as { insertId?: number }).insertId) || 0
}

export async function getAllHistory(): Promise<AIAnalysisHistoryRecord[]> {
  const rows = await query<
    { id: number; source_folder_path: string; source_folder_name: string; analysis_date: string; timestamp: number; total_commits: number; date_range: string | null; analysis_result: string }[]
  >(
    'SELECT id, source_folder_path, source_folder_name, analysis_date, timestamp, total_commits, date_range, analysis_result FROM ai_analysis_history ORDER BY timestamp DESC'
  )
  if (!Array.isArray(rows)) return []
  const list: AIAnalysisHistoryRecord[] = []
  for (const r of rows) {
    const analysisResult = parseAnalysisResult(r.analysis_result)
    if (!analysisResult) continue
    list.push({
      id: r.id,
      sourceFolderPath: r.source_folder_path,
      sourceFolderName: r.source_folder_name,
      analysisDate: r.analysis_date,
      timestamp: r.timestamp,
      totalCommits: r.total_commits,
      dateRange: r.date_range ?? undefined,
      analysisResult,
    })
  }
  return list
}

export async function getHistoryByFolder(sourceFolderPath: string): Promise<AIAnalysisHistoryRecord[]> {
  const rows = await query<
    { id: number; source_folder_path: string; source_folder_name: string; analysis_date: string; timestamp: number; total_commits: number; date_range: string | null; analysis_result: string }[]
  >(
    'SELECT id, source_folder_path, source_folder_name, analysis_date, timestamp, total_commits, date_range, analysis_result FROM ai_analysis_history WHERE source_folder_path = ? ORDER BY timestamp DESC',
    [sourceFolderPath]
  )
  if (!Array.isArray(rows)) return []
  const list: AIAnalysisHistoryRecord[] = []
  for (const r of rows) {
    const analysisResult = parseAnalysisResult(r.analysis_result)
    if (!analysisResult) continue
    list.push({
      id: r.id,
      sourceFolderPath: r.source_folder_path,
      sourceFolderName: r.source_folder_name,
      analysisDate: r.analysis_date,
      timestamp: r.timestamp,
      totalCommits: r.total_commits,
      dateRange: r.date_range ?? undefined,
      analysisResult,
    })
  }
  return list
}

export async function getHistoryById(id: number): Promise<AIAnalysisHistoryRecord | null> {
  const rows = await query<
    { id: number; source_folder_path: string; source_folder_name: string; analysis_date: string; timestamp: number; total_commits: number; date_range: string | null; analysis_result: string }[]
  >(
    'SELECT id, source_folder_path, source_folder_name, analysis_date, timestamp, total_commits, date_range, analysis_result FROM ai_analysis_history WHERE id = ?',
    [id]
  )
  if (!Array.isArray(rows) || rows.length === 0) return null
  const r = rows[0]
  const analysisResult = parseAnalysisResult(r.analysis_result)
  if (!analysisResult) return null
  return {
    id: r.id,
    sourceFolderPath: r.source_folder_path,
    sourceFolderName: r.source_folder_name,
    analysisDate: r.analysis_date,
    timestamp: r.timestamp,
    totalCommits: r.total_commits,
    dateRange: r.date_range ?? undefined,
    analysisResult,
  }
}

export async function deleteHistoryById(id: number): Promise<void> {
  await query('DELETE FROM ai_analysis_history WHERE id = ?', [id])
}
