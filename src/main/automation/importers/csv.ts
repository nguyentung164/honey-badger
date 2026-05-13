import { promises as fs } from 'node:fs'
import type { ImportLayout, ImportPreview } from 'shared/automation/types'
import { parseCSVRows } from '../../task/seed/importCsv'
import { buildPreview, buildRowFromHeader } from './shared'

export async function parseCsvFile(projectId: string, filePath: string, layout: ImportLayout): Promise<ImportPreview> {
  const content = await fs.readFile(filePath, 'utf8')
  return parseCsvContent(projectId, content, layout)
}

export function parseCsvContent(projectId: string, content: string, layout: ImportLayout): ImportPreview {
  const rows = parseCSVRows(content)
  if (rows.length === 0) return { cases: [], warnings: ['Empty CSV.'] }
  const header = rows[0]
  const dataRows = rows.slice(1)
  const rawRows = dataRows.map(r => buildRowFromHeader(header, r))
  return buildPreview(projectId, 'csv', rawRows, layout)
}
