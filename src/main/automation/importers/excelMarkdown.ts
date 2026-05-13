import path from 'node:path'

export interface ExcelSheetInfo {
  name: string
}

export interface ExcelMarkdownOptions {
  filePath: string
  sheetNames: string[]
  /** 1-based row containing Markdown table header cells */
  headerRow: number
  /** 1-based first body row; default headerRow + 1 */
  firstDataRow?: number
  /** 1-based inclusive last row; default = last row with any cell in range */
  lastRow?: number
  /** 1-based first column (A = 1) */
  firstCol?: number
  /** 1-based inclusive last column; default = inferred from header row */
  lastCol?: number
}

function cellToString(cell: unknown): string {
  if (cell == null || cell === '') return ''
  if (typeof cell === 'object' && cell !== null && 'text' in cell) {
    return String((cell as { text: unknown }).text ?? '')
  }
  if (typeof cell === 'object' && cell !== null && 'richText' in cell) {
    const parts = (cell as { richText?: Array<{ text?: string }> }).richText
    if (Array.isArray(parts)) return parts.map(p => p.text ?? '').join('')
  }
  return String(cell)
}

function escapeMarkdownCell(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()
}

function readRowValues(
  sheet: { getRow: (n: number) => { values?: unknown[] } },
  rowNum: number,
  colStart: number,
  colEnd: number
): string[] {
  const values = sheet.getRow(rowNum).values as unknown[] | undefined
  const out: string[] = []
  for (let c = colStart; c <= colEnd; c++) {
    const raw = values?.[c]
    out.push(escapeMarkdownCell(cellToString(raw)))
  }
  return out
}

function rowHasContent(
  sheet: { getRow: (n: number) => { values?: unknown[] } },
  rowNum: number,
  colStart: number,
  colEnd: number
): boolean {
  const values = sheet.getRow(rowNum).values as unknown[] | undefined
  if (!values) return false
  for (let c = colStart; c <= colEnd; c++) {
    if (cellToString(values[c]).trim()) return true
  }
  return false
}

function inferLastCol(
  sheet: { getRow: (n: number) => { values?: unknown[] } },
  headerRowNum: number,
  colStart: number,
  maxScan: number
): number {
  let last = colStart
  const values = sheet.getRow(headerRowNum).values as unknown[] | undefined
  if (!values) return colStart
  const cap = Math.min(maxScan, values.length > 0 ? values.length - 1 : colStart)
  for (let c = colStart; c <= cap; c++) {
    if (cellToString(values[c]).trim()) last = c
  }
  return Math.max(last, colStart)
}

function inferLastDataRow(
  sheet: { rowCount: number; getRow: (n: number) => { values?: unknown[] } },
  firstDataRow: number,
  colStart: number,
  colEnd: number
): number {
  let last = firstDataRow - 1
  const max = Math.min(sheet.rowCount, firstDataRow + 50000)
  for (let r = firstDataRow; r <= max; r++) {
    if (rowHasContent(sheet, r, colStart, colEnd)) last = r
  }
  return last >= firstDataRow ? last : firstDataRow - 1
}

function buildMarkdownTable(header: string[], body: string[][]): string {
  const sep = header.map(() => '---')
  const lines = [`| ${header.join(' | ')} |`, `| ${sep.join(' | ')} |`]
  for (const row of body) {
    const r = [...row]
    while (r.length < header.length) r.push('')
    lines.push(`| ${r.slice(0, header.length).join(' | ')} |`)
  }
  return lines.join('\n')
}

/** Danh sách tên sheet trong workbook (.xlsx / .xlsm). */
export async function listExcelWorkbookSheets(filePath: string): Promise<{
  sheets: ExcelSheetInfo[]
  warnings: string[]
}> {
  const ext = path.extname(filePath).toLowerCase()
  if (ext !== '.xlsx' && ext !== '.xlsm') {
    return { sheets: [], warnings: ['Only .xlsx and .xlsm workbooks are supported for this import.'] }
  }
  try {
    const ExcelJSModule = await import('exceljs')
    const ExcelJS = ExcelJSModule.default ?? ExcelJSModule
    const wb = new (ExcelJS as { Workbook: new () => { xlsx: { readFile: (p: string) => Promise<void> }; worksheets: Array<{ name: string }> } }).Workbook()
    await wb.xlsx.readFile(filePath)
    const sheets = wb.worksheets.map(ws => ({ name: ws.name }))
    return { sheets, warnings: sheets.length === 0 ? ['Workbook has no worksheets.'] : [] }
  } catch (e) {
    return { sheets: [], warnings: [(e as Error).message] }
  }
}

const COL_SCAN_MAX = 512

/** Trích các sheet được chọn thành Markdown (mỗi sheet một bảng). */
export async function excelSelectionsToMarkdown(opts: ExcelMarkdownOptions): Promise<{ markdown: string; warnings: string[] }> {
  const warnings: string[] = []
  const ext = path.extname(opts.filePath).toLowerCase()
  if (ext !== '.xlsx' && ext !== '.xlsm') {
    return { markdown: '', warnings: ['Only .xlsx and .xlsm workbooks are supported.'] }
  }
  if (!opts.sheetNames.length) {
    return { markdown: '', warnings: ['No sheets selected.'] }
  }
  const headerRow = Math.max(1, Math.floor(opts.headerRow))
  const colStart = Math.max(1, opts.firstCol ?? 1)

  try {
    const ExcelJSModule = await import('exceljs')
    const ExcelJS = ExcelJSModule.default ?? ExcelJSModule
    const wb = new (ExcelJS as {
      Workbook: new () => {
        xlsx: { readFile: (p: string) => Promise<void> }
        getWorksheet: (name: string) =>
          | {
              name: string
              rowCount: number
              getRow: (n: number) => { values?: unknown[] }
            }
          | undefined
      }
    }).Workbook()
    await wb.xlsx.readFile(opts.filePath)

    const sections: string[] = []

    for (const sheetName of opts.sheetNames) {
      const sheet = wb.getWorksheet(sheetName)
      if (!sheet) {
        warnings.push(`Sheet not found (skipped): "${sheetName}"`)
        continue
      }
      if (headerRow > sheet.rowCount) {
        warnings.push(`Sheet "${sheetName}": header row ${headerRow} is past the last row (${sheet.rowCount}). Skipped.`)
        continue
      }

      const colEnd =
        opts.lastCol !== undefined && opts.lastCol >= colStart ?
          Math.floor(opts.lastCol)
        : inferLastCol(sheet, headerRow, colStart, COL_SCAN_MAX)

      if (colEnd < colStart) {
        warnings.push(`Sheet "${sheetName}": invalid column range. Skipped.`)
        continue
      }

      const headerCells = readRowValues(sheet, headerRow, colStart, colEnd)
      const hasHeader = headerCells.some(c => c.length > 0)
      const displayHeader = hasHeader ? headerCells : headerCells.map((_, i) => `Column ${colStart + i}`)

      const firstData =
        opts.firstDataRow !== undefined && opts.firstDataRow > headerRow ?
          Math.floor(opts.firstDataRow)
        : headerRow + 1

      const lastRowOpt = opts.lastRow !== undefined ? Math.floor(opts.lastRow) : undefined
      const lastData =
        lastRowOpt !== undefined && lastRowOpt >= firstData ? lastRowOpt : inferLastDataRow(sheet, firstData, colStart, colEnd)

      if (lastData < firstData) {
        warnings.push(`Sheet "${sheetName}": no data rows after header. Skipped.`)
        continue
      }
      if (lastRowOpt !== undefined && lastRowOpt < firstData) {
        warnings.push(`Sheet "${sheetName}": last row is before first data row. Skipped.`)
        continue
      }

      const body: string[][] = []
      for (let r = firstData; r <= lastData; r++) {
        body.push(readRowValues(sheet, r, colStart, colEnd))
      }

      const table = buildMarkdownTable(displayHeader, body)
      const safeTitle = sheetName.replace(/\r?\n/g, ' ').trim() || 'Sheet'
      sections.push(`## ${safeTitle}\n\n${table}`)
    }

    if (!sections.length) {
      return { markdown: '', warnings: [...warnings, 'No Markdown tables were produced.'] }
    }

    const markdown = sections.join('\n\n---\n\n')
    return { markdown, warnings }
  } catch (e) {
    return { markdown: '', warnings: [...warnings, (e as Error).message] }
  }
}
