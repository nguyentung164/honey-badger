import path from 'node:path'
import type { ImportLayout, ImportPreview } from 'shared/automation/types'

export type ImporterKind = 'excel' | 'csv' | 'markdown' | 'pdf'

export function detectImporter(filePath: string): ImporterKind | null {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.xlsx' || ext === '.xlsm' || ext === '.xls') return 'excel'
  if (ext === '.csv') return 'csv'
  if (ext === '.md' || ext === '.markdown' || ext === '.feature') return 'markdown'
  if (ext === '.pdf') return 'pdf'
  return null
}

export async function parseImportFile(
  projectId: string,
  filePath: string,
  opts: { layout: ImportLayout }
): Promise<ImportPreview> {
  const kind = detectImporter(filePath)
  if (!kind) {
    return { cases: [], warnings: [`Unsupported file extension for "${path.basename(filePath)}".`] }
  }
  switch (kind) {
    case 'excel': {
      const { parseExcelFile } = await import('./excel')
      return parseExcelFile(projectId, filePath, opts.layout)
    }
    case 'csv': {
      const { parseCsvFile } = await import('./csv')
      return parseCsvFile(projectId, filePath, opts.layout)
    }
    case 'markdown': {
      const { parseMarkdownFile } = await import('./markdown')
      return parseMarkdownFile(projectId, filePath)
    }
    case 'pdf': {
      const { parsePdfFile } = await import('./pdf')
      return parsePdfFile(projectId, filePath)
    }
  }
}
