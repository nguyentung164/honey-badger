import path from 'node:path'
import type { Cell, CellValue, Worksheet } from 'exceljs'
import { ValueType } from 'exceljs'

export interface ExcelSheetInfo {
  name: string
}

/** 1-based row/column indices (Excel convention). */
export interface ExcelSheetSelectionOptions {
  filePath: string
  sheetNames: string[]
  /** Row containing column labels (used for JSON keys + `label` field). */
  headerRow: number
  firstDataRow?: number
  lastRow?: number
  firstCol?: number
  lastCol?: number
}

/** Structured payload before `JSON.stringify` (also documents the wire format). */
export interface ExcelExportJsonV2 {
  format: 'honey-badger.excel-export'
  version: 2
  sourceFile: string
  generatedAt: string
  meta: {
    /** Data rows that are entirely empty in the export column range are dropped. */
    omitEmptyDataRows: true
    /** Merged cells: only the merge master exports text; other cells in the merge export "". (ExcelJS `cell.master`.) */
    mergedCellsUseMaster: true
    /** Column span = max occupied column index across header + data rows (eachCell), capped. */
    columnSpanInference: 'eachCell-max-over-header-and-data-rows'
    /** Prefer ExcelJS display string (`cell.text`); then typed value / formula result. */
    valueRendering: 'exceljs-text-then-typed-fallback'
    maxColumnIndex: number
    maxDataRowsScannedForLastRow: number
  }
  sheets: Array<{
    name: string
    range: {
      headerRow: number
      firstDataRow: number
      lastDataRow: number
      firstCol: number
      lastCol: number
    }
    columns: Array<{ key: string; label: string }>
    /** One object per non-empty data row; values are always strings. */
    rows: Array<Record<string, string>>
  }>
}

const COL_HARD_CAP = 16384 // Excel 2007+ grid (XFD)
const DATA_ROW_SCAN_MAX = 500_000

function normalizeCellText(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function formatDateForExport(d: Date): string {
  if (!Number.isFinite(d.getTime())) return ''
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = d.getHours()
  const mi = d.getMinutes()
  const se = d.getSeconds()
  const ms = d.getMilliseconds()
  if (h === 0 && mi === 0 && se === 0 && ms === 0) return `${y}-${mo}-${day}`
  const hh = String(h).padStart(2, '0')
  const mm = String(mi).padStart(2, '0')
  const ss = String(se).padStart(2, '0')
  return `${y}-${mo}-${day}T${hh}:${mm}:${ss}`
}

function formatNumberForExport(n: number): string {
  if (!Number.isFinite(n)) return ''
  if (Number.isInteger(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER) return String(n)
  return String(Number(n.toPrecision(15)))
}

function scalarCellResultToString(v: unknown): string {
  if (v == null || v === '') return ''
  if (v instanceof Date) return formatDateForExport(v)
  if (typeof v === 'number') return formatNumberForExport(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object' && v !== null && 'error' in v) {
    const err = (v as { error: string }).error
    return typeof err === 'string' ? err : ''
  }
  if (typeof v === 'object' && v !== null && 'text' in v && 'hyperlink' in v) {
    const o = v as { text?: string; hyperlink?: string }
    const t = (o.text ?? '').trim()
    const u = (o.hyperlink ?? '').trim()
    if (t && u) return normalizeCellText(`${t} (${u})`)
    return normalizeCellText(t || u)
  }
  return normalizeCellText(String(v))
}

function cellValueToExportString(value: CellValue | null | undefined): string {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return normalizeCellText(value)
  if (typeof value === 'number') return formatNumberForExport(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return formatDateForExport(value)
  if (typeof value === 'object' && value !== null && 'error' in value) {
    return String((value as { error: string }).error)
  }
  if (typeof value === 'object' && value !== null && 'richText' in value) {
    const parts = (value as { richText?: Array<{ text?: string }> }).richText
    if (Array.isArray(parts)) return normalizeCellText(parts.map(p => p.text ?? '').join(''))
  }
  if (typeof value === 'object' && value !== null && 'text' in value && 'hyperlink' in value) {
    const h = value as { text?: string; hyperlink?: string }
    const t = (h.text ?? '').trim()
    const u = (h.hyperlink ?? '').trim()
    if (t && u) return normalizeCellText(`${t} (${u})`)
    return normalizeCellText(t || u)
  }
  if (typeof value === 'object' && value !== null && ('formula' in value || 'sharedFormula' in value)) {
    const r = (value as { result?: unknown }).result
    return scalarCellResultToString(r)
  }
  return normalizeCellText(String(value))
}

/** Prefer Excel display / merge master; then formula result; then raw value. */
function exportCellString(cell: Cell): string {
  const mc = cell.master
  if (mc !== cell) {
    return ''
  }

  if (mc.type === ValueType.Formula) {
    const viaText = normalizeCellText(String(mc.text ?? '')).trim()
    if (viaText !== '') {
      return enrichHyperlinkDisplay(viaText, mc)
    }
    return scalarCellResultToString(mc.result)
  }

  if (mc.type === ValueType.Date && mc.value instanceof Date) {
    return formatDateForExport(mc.value)
  }

  if (mc.type === ValueType.Number) {
    const viaText = normalizeCellText(String(mc.text ?? '')).trim()
    if (viaText !== '') return enrichHyperlinkDisplay(viaText, mc)
    if (typeof mc.value === 'number') return formatNumberForExport(mc.value)
  }

  let s = normalizeCellText(String(mc.text ?? '')).trim()
  if (s === '') {
    s = cellValueToExportString(mc.value).trim()
  }
  if (s === '') return ''
  return enrichHyperlinkDisplay(s, mc)
}

function enrichHyperlinkDisplay(text: string, mc: Cell): string {
  if (!mc.isHyperlink) return normalizeCellText(text)
  const url = String(mc.hyperlink ?? '').trim()
  if (!url || text.includes(url)) return normalizeCellText(text)
  return normalizeCellText(`${text} (${url})`)
}

function inferMaxColInRange(sheet: Worksheet, rStart: number, rEnd: number, colStart: number, colHardCap: number): number {
  let max = colStart
  const lo = Math.min(rStart, rEnd)
  const hi = Math.max(rStart, rEnd)
  for (let r = lo; r <= hi; r++) {
    const row = sheet.getRow(r)
    row.eachCell({ includeEmpty: false }, (_c: Cell, colNumber: number) => {
      if (colNumber >= colStart && colNumber <= colHardCap) {
        max = Math.max(max, colNumber)
      }
    })
  }
  return Math.max(max, colStart)
}

function rowHasExportContent(sheet: Worksheet, rowNum: number, colStart: number, colEnd: number): boolean {
  const row = sheet.getRow(rowNum)
  for (let c = colStart; c <= colEnd; c++) {
    if (exportCellString(row.getCell(c)).trim()) return true
  }
  return false
}

function inferLastDataRow(
  sheet: Worksheet,
  firstDataRow: number,
  colStart: number,
  colEnd: number,
  explicitLastRow?: number
): number {
  if (explicitLastRow !== undefined && explicitLastRow >= firstDataRow) {
    return Math.min(explicitLastRow, sheet.rowCount)
  }
  let last = firstDataRow - 1
  const max = Math.min(sheet.rowCount, firstDataRow + DATA_ROW_SCAN_MAX)
  for (let r = firstDataRow; r <= max; r++) {
    if (rowHasExportContent(sheet, r, colStart, colEnd)) last = r
  }
  return last >= firstDataRow ? last : firstDataRow - 1
}

/** Build stable unique JSON keys from header labels (Excel column index used if empty). */
function buildColumnDescriptors(labels: string[], colStart: number): Array<{ key: string; label: string }> {
  const used = new Map<string, number>()
  const out: Array<{ key: string; label: string }> = []

  const nextKey = (base: string): string => {
    const n = (used.get(base) ?? 0) + 1
    used.set(base, n)
    return n === 1 ? base : `${base}__${n}`
  }

  const slugFromLabel = (label: string): string => {
    const t = label
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\p{L}\p{N}_.-]+/gu, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
    return t.length > 120 ? t.slice(0, 120) : t
  }

  for (let i = 0; i < labels.length; i++) {
    const excelCol = colStart + i
    const label = labels[i] ?? ''
    const slug = slugFromLabel(label)
    const base = slug.length > 0 ? slug : `Column_${excelCol}`
    out.push({ key: nextKey(base), label })
  }
  return out
}

function readHeaderLabels(sheet: Worksheet, headerRow: number, colStart: number, colEnd: number): string[] {
  const row = sheet.getRow(headerRow)
  const labels: string[] = []
  for (let c = colStart; c <= colEnd; c++) {
    labels.push(exportCellString(row.getCell(c)))
  }
  return labels
}

function isDataRowEmpty(sheet: Worksheet, rowNum: number, colStart: number, colEnd: number): boolean {
  return !rowHasExportContent(sheet, rowNum, colStart, colEnd)
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
    const wb = new (ExcelJS as unknown as {
      Workbook: new () => { xlsx: { readFile: (p: string) => Promise<unknown> }; worksheets: Array<{ name: string }> }
    }).Workbook()
    await wb.xlsx.readFile(filePath)
    const sheets = wb.worksheets.map(ws => ({ name: ws.name }))
    return { sheets, warnings: sheets.length === 0 ? ['Workbook has no worksheets.'] : [] }
  } catch (e) {
    return { sheets: [], warnings: [(e as Error).message] }
  }
}

/**
 * Resolve column bounds and last data row (two-pass: widen columns from data, then re-scan last row).
 */
function resolveRange(
  sheet: Worksheet,
  headerRow: number,
  colStart: number,
  userLastCol: number | undefined,
  firstData: number,
  userLastRow: number | undefined
): { colEnd: number; lastData: number; warnings: string[] } {
  const warnings: string[] = []
  let colEnd =
    userLastCol !== undefined && userLastCol >= colStart ?
      Math.min(userLastCol, COL_HARD_CAP)
    : inferMaxColInRange(sheet, headerRow, headerRow, colStart, COL_HARD_CAP)

  if (colEnd < colStart) {
    return { colEnd: colStart, lastData: firstData - 1, warnings: ['Invalid column range.'] }
  }

  let lastData = inferLastDataRow(sheet, firstData, colStart, colEnd, userLastRow)

  if (userLastCol === undefined && lastData >= firstData) {
    const widened = inferMaxColInRange(sheet, headerRow, lastData, colStart, COL_HARD_CAP)
    if (widened > colEnd) {
      colEnd = widened
      lastData = inferLastDataRow(sheet, firstData, colStart, colEnd, userLastRow)
    }
  }

  if (userLastCol === undefined && lastData - firstData + 1 > DATA_ROW_SCAN_MAX) {
    warnings.push(
      `Sheet "${sheet.name}": row scan capped at ${DATA_ROW_SCAN_MAX} data rows for last-row detection; set Last row explicitly if the table is longer.`
    )
  }

  return { colEnd, lastData, warnings }
}

function escapeTsvField(cell: string): string {
  if (/[\t\n\r"]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`
  }
  return cell
}

/** Tab-separated blocks per sheet (UTF-8). Same row/column rules as JSON export. */
export function excelExportPayloadToPlainTsv(payload: ExcelExportJsonV2): string {
  const blocks: string[] = []
  for (const sh of payload.sheets) {
    const lines: string[] = []
    const bannerName = sh.name.replace(/\r?\n/g, ' ').trim() || 'Sheet'
    lines.push(`=== Sheet: ${bannerName} ===`)
    lines.push(sh.columns.map(c => escapeTsvField(c.label)).join('\t'))
    for (const row of sh.rows) {
      lines.push(sh.columns.map(col => escapeTsvField(row[col.key] ?? '')).join('\t'))
    }
    blocks.push(lines.join('\n'))
  }
  return blocks.join('\n\n')
}

async function buildExcelExportPayload(opts: ExcelSheetSelectionOptions): Promise<{ payload: ExcelExportJsonV2 | null; warnings: string[] }> {
  const warnings: string[] = []
  const ext = path.extname(opts.filePath).toLowerCase()
  if (ext !== '.xlsx' && ext !== '.xlsm') {
    return { payload: null, warnings: ['Only .xlsx and .xlsm workbooks are supported.'] }
  }
  if (!opts.sheetNames.length) {
    return { payload: null, warnings: ['No sheets selected.'] }
  }
  const headerRow = Math.max(1, Math.floor(opts.headerRow))
  const colStart = Math.max(1, opts.firstCol ?? 1)
  const userLastCol = opts.lastCol !== undefined ? Math.floor(opts.lastCol) : undefined
  const userLastRow = opts.lastRow !== undefined ? Math.floor(opts.lastRow) : undefined

  try {
    const ExcelJSModule = await import('exceljs')
    const ExcelJS = ExcelJSModule.default ?? ExcelJSModule
    const wb = new (ExcelJS as unknown as {
      Workbook: new () => {
        xlsx: { readFile: (p: string) => Promise<unknown> }
        getWorksheet: (name: string) => Worksheet | undefined
      }
    }).Workbook()
    await wb.xlsx.readFile(opts.filePath)

    const sheetsOut: ExcelExportJsonV2['sheets'] = []

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

      const firstData =
        opts.firstDataRow !== undefined && opts.firstDataRow > headerRow ?
          Math.floor(opts.firstDataRow)
        : headerRow + 1

      const { colEnd, lastData, warnings: rangeWarn } = resolveRange(
        sheet,
        headerRow,
        colStart,
        userLastCol,
        firstData,
        userLastRow
      )
      warnings.push(...rangeWarn)

      if (colEnd < colStart) {
        warnings.push(`Sheet "${sheetName}": invalid column range. Skipped.`)
        continue
      }

      if (lastData < firstData) {
        warnings.push(`Sheet "${sheetName}": no data rows after header. Skipped.`)
        continue
      }
      if (userLastRow !== undefined && userLastRow < firstData) {
        warnings.push(`Sheet "${sheetName}": last row is before first data row. Skipped.`)
        continue
      }

      const headerCells = readHeaderLabels(sheet, headerRow, colStart, colEnd)
      const hasHeader = headerCells.some(c => c.trim().length > 0)
      const labels = hasHeader ? headerCells : headerCells.map((_, i) => `Column ${colStart + i}`)
      const columns = buildColumnDescriptors(labels, colStart)

      const rows: Array<Record<string, string>> = []
      for (let r = firstData; r <= lastData; r++) {
        if (isDataRowEmpty(sheet, r, colStart, colEnd)) continue
        const row = sheet.getRow(r)
        const rowObj: Record<string, string> = {}
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i]
          const c = colStart + i
          if (col) rowObj[col.key] = exportCellString(row.getCell(c))
        }
        rows.push(rowObj)
      }

      if (rows.length === 0) {
        warnings.push(`Sheet "${sheetName}": no non-empty data rows in the selected column range. Skipped.`)
        continue
      }

      const safeName = sheetName.replace(/\r?\n/g, ' ').trim() || 'Sheet'
      sheetsOut.push({
        name: safeName,
        range: {
          headerRow,
          firstDataRow: firstData,
          lastDataRow: lastData,
          firstCol: colStart,
          lastCol: colEnd,
        },
        columns,
        rows,
      })
    }

    if (!sheetsOut.length) {
      return { payload: null, warnings: [...warnings, 'No sheet data was exported to JSON.'] }
    }

    const payload: ExcelExportJsonV2 = {
      format: 'honey-badger.excel-export',
      version: 2,
      sourceFile: path.basename(opts.filePath),
      generatedAt: new Date().toISOString(),
      meta: {
        omitEmptyDataRows: true,
        mergedCellsUseMaster: true,
        columnSpanInference: 'eachCell-max-over-header-and-data-rows',
        valueRendering: 'exceljs-text-then-typed-fallback',
        maxColumnIndex: COL_HARD_CAP,
        maxDataRowsScannedForLastRow: DATA_ROW_SCAN_MAX,
      },
      sheets: sheetsOut,
    }

    return { payload, warnings }
  } catch (e) {
    return { payload: null, warnings: [...warnings, (e as Error).message] }
  }
}

/** Trích các sheet được chọn thành JSON (UTF-8 string, pretty-printed). */
export async function excelSelectionsToJson(opts: ExcelSheetSelectionOptions): Promise<{ json: string; warnings: string[] }> {
  const { payload, warnings } = await buildExcelExportPayload(opts)
  if (!payload) {
    return { json: '', warnings }
  }
  const json = `${JSON.stringify(payload, null, 2)}\n`
  return { json, warnings }
}

/** Same selection as JSON export, UTF-8 tab-separated text (one block per sheet). */
export async function excelSelectionsToPlainText(opts: ExcelSheetSelectionOptions): Promise<{ text: string; warnings: string[] }> {
  const { payload, warnings } = await buildExcelExportPayload(opts)
  if (!payload) {
    return { text: '', warnings }
  }
  return { text: `${excelExportPayloadToPlainTsv(payload)}\n`, warnings }
}
