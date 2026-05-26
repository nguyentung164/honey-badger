import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import type { ExcelExportJsonV2 } from './excelSheetExport'
import { excelExportPayloadToPlainTsv, excelSelectionsToJson, excelSelectionsToPlainText } from './excelSheetExport'

describe('excelExportPayloadToPlainTsv', () => {
  it('formats tab-separated blocks and escapes special characters', () => {
    const payload: ExcelExportJsonV2 = {
      format: 'honey-badger.excel-export',
      version: 2,
      sourceFile: 'x.xlsx',
      generatedAt: '2020-01-01T00:00:00.000Z',
      meta: {
        omitEmptyDataRows: true,
        mergedCellsUseMaster: true,
        columnSpanInference: 'eachCell-max-over-header-and-data-rows',
        valueRendering: 'exceljs-text-then-typed-fallback',
        maxColumnIndex: 16384,
        maxDataRowsScannedForLastRow: 500_000,
      },
      sheets: [
        {
          name: 'Tabby',
          range: { headerRow: 1, firstDataRow: 2, lastDataRow: 2, firstCol: 1, lastCol: 2 },
          columns: [
            { key: 'a', label: 'H1' },
            { key: 'b', label: 'say "hi"' },
          ],
          rows: [{ a: 'line1\nline2', b: 'x\ty' }],
        },
      ],
    }
    const tsv = excelExportPayloadToPlainTsv(payload)
    expect(tsv.startsWith('=== Sheet: Tabby ===\n')).toBe(true)
    expect(tsv).toContain('H1\t"say ""hi"""')
    expect(tsv).toContain('"line1\nline2"\t"x\ty"')
  })
})

describe('excelSelectionsToJson merged cells', () => {
  let tmpFile: string | undefined

  afterEach(async () => {
    if (tmpFile) {
      await fs.unlink(tmpFile).catch(() => {})
      tmpFile = undefined
    }
  })

  it('exports text only on merge master; slaves are empty strings', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('S1')

    ws.mergeCells('A1:B1')
    ws.getCell('A1').value = 'H1'
    ws.getCell('A2').value = 'a'
    ws.getCell('B2').value = 'b'

    ws.mergeCells('A3:A5')
    ws.getCell('A3').value = 'V'
    ws.getCell('B3').value = 'p3'
    ws.getCell('B4').value = 'p4'
    ws.getCell('B5').value = 'p5'

    tmpFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'hb-excel-')), 'm.xlsx')
    await wb.xlsx.writeFile(tmpFile)

    const { json, warnings } = await excelSelectionsToJson({
      filePath: tmpFile,
      sheetNames: ['S1'],
      headerRow: 1,
      firstDataRow: 2,
      lastCol: 2,
    })
    expect(warnings).toEqual([])

    const payload = JSON.parse(json) as ExcelExportJsonV2
    expect(payload.sheets).toHaveLength(1)
    const sheet = payload.sheets[0]
    expect(sheet).toBeDefined()
    if (!sheet) return

    const k0 = sheet.columns[0]?.key
    const k1 = sheet.columns[1]?.key
    expect(k0).toBeDefined()
    expect(k1).toBeDefined()
    if (k0 === undefined || k1 === undefined) return

    expect(sheet.rows).toHaveLength(4)
    expect(sheet.rows[0]?.[k0]).toBe('a')
    expect(sheet.rows[0]?.[k1]).toBe('b')
    expect(sheet.rows[1]?.[k0]).toBe('V')
    expect(sheet.rows[1]?.[k1]).toBe('p3')
    expect(sheet.rows[2]?.[k0]).toBe('')
    expect(sheet.rows[2]?.[k1]).toBe('p4')
    expect(sheet.rows[3]?.[k0]).toBe('')
    expect(sheet.rows[3]?.[k1]).toBe('p5')
  })

  it('excelSelectionsToPlainText matches tab-separated layout for same workbook', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('S1')
    ws.getCell('A1').value = 'ColA'
    ws.getCell('B1').value = 'ColB'
    ws.getCell('A2').value = '1'
    ws.getCell('B2').value = '2'

    tmpFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'hb-excel-')), 'plain.xlsx')
    await wb.xlsx.writeFile(tmpFile)

    const { text, warnings } = await excelSelectionsToPlainText({
      filePath: tmpFile,
      sheetNames: ['S1'],
      headerRow: 1,
      firstDataRow: 2,
      lastCol: 2,
    })
    expect(warnings).toEqual([])
    expect(text.trim().split('\n')).toEqual(['=== Sheet: S1 ===', 'ColA\tColB', '1\t2'])
  })
})
