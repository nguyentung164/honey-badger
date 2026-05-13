import type { ImportLayout, ImportPreview } from 'shared/automation/types'
import { buildPreview, buildRowFromHeader, type RawCaseRow } from './shared'

/**
 * Parse Excel workbook (.xlsx) bằng ExcelJS - chỉ dynamic import để tránh load
 * thư viện vào main bundle khi user không dùng.
 */
export async function parseExcelFile(projectId: string, filePath: string, layout: ImportLayout): Promise<ImportPreview> {
  const ExcelJSModule = await import('exceljs')
  const ExcelJS = ExcelJSModule.default ?? ExcelJSModule
  const wb = new (ExcelJS as unknown as { Workbook: new () => { xlsx: { readFile: (p: string) => Promise<void> }; worksheets: Array<{ rowCount: number; getRow: (n: number) => { values: unknown[] } }> } }).Workbook()
  await wb.xlsx.readFile(filePath)
  const sheet = wb.worksheets[0]
  if (!sheet) return { cases: [], warnings: ['No worksheet in workbook.'] }

  const rowCount = sheet.rowCount
  if (rowCount === 0) return { cases: [], warnings: ['Worksheet is empty.'] }

  const headerRowVals = sheet.getRow(1).values as unknown[]
  const header = headerRowVals.slice(1).map(v => (v == null ? '' : String(v)))

  const rawRows: RawCaseRow[] = []
  for (let r = 2; r <= rowCount; r++) {
    const row = sheet.getRow(r).values as unknown[]
    if (!row || row.length === 0) continue
    const values = row.slice(1).map(v => (v == null ? '' : typeof v === 'object' && v && 'text' in (v as object) ? String((v as { text: unknown }).text ?? '') : String(v)))
    if (values.every(v => !v?.trim())) continue
    rawRows.push(buildRowFromHeader(header, values))
  }
  return buildPreview(projectId, 'excel', rawRows, layout)
}
