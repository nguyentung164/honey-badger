import { promises as fs } from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import type { TestCase } from 'shared/automation/types'
import { getProject, listCases, listCatalogPages, listFlowsForPage } from '../db'

const INVALID_FILE_CHARS = /[<>:"/\\|?*]/g

function sanitizeFileBase(name: string): string {
  const s = name.replace(INVALID_FILE_CHARS, '_').replace(/\s+/g, ' ').trim() || 'export'
  return s.slice(0, 100)
}

/** Excel worksheet name: max 31 chars; no []:*?/\ */
function sanitizeSheetBase(name: string): string {
  let s =
    name
      .replace(/[[\]:*?/\\]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'Flow'
  if (s.length > 31) s = s.slice(0, 31)
  return s
}

function uniqueSheetName(base: string, used: Set<string>): string {
  const name = sanitizeSheetBase(base)
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  for (let i = 2; i < 200; i++) {
    const suffix = `_${i}`
    const max = 31 - suffix.length
    const truncated = sanitizeSheetBase(base).slice(0, Math.max(1, max))
    const candidate = (truncated + suffix).slice(0, 31)
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
  const fallback = `F_${used.size + 1}`.slice(0, 31)
  used.add(fallback)
  return fallback
}

function stepsCell(tc: TestCase): string {
  try {
    return JSON.stringify(tc.steps ?? [])
  } catch {
    return '[]'
  }
}

/**
 * Mỗi Page → một file .xlsx; mỗi Flow → một sheet; mỗi hàng → một TestCase.
 */
export async function exportProjectCasesByPageToDirectory(projectId: string, directoryPath: string): Promise<{ files: string[] }> {
  const proj = await getProject(projectId)
  if (!proj) throw new Error('Project not found.')

  await fs.mkdir(directoryPath, { recursive: true })

  const pages = await listCatalogPages(projectId)
  const allCases = await listCases(projectId)
  const byFlow = new Map<string, TestCase[]>()
  for (const c of allCases) {
    const fid = c.flowId
    if (!fid) continue
    const arr = byFlow.get(fid)
    if (arr) arr.push(c)
    else byFlow.set(fid, [c])
  }

  const usedFileNames = new Set<string>()
  const files: string[] = []

  for (const page of pages) {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Honey Badger'
    wb.created = new Date()

    const flows = await listFlowsForPage(page.id)
    const usedSheets = new Set<string>()

    if (flows.length === 0) {
      const ws = wb.addWorksheet(uniqueSheetName('_NoFlows', usedSheets))
      ws.addRow(['This page has no flows yet. Add flows in the Cases tab, then export again.'])
    }

    const header = ['Code', 'Title', 'Priority', 'Tags', 'Preconditions', 'Steps (JSON)', 'Expected', 'Source', 'Spec status']

    for (const flow of flows) {
      const sheetName = uniqueSheetName(flow.name, usedSheets)
      const ws = wb.addWorksheet(sheetName)
      ws.addRow(header)
      const cases = (byFlow.get(flow.id) ?? []).slice().sort((a, b) => a.code.localeCompare(b.code))
      for (const tc of cases) {
        ws.addRow([tc.code, tc.title, tc.priority, (tc.tags ?? []).join(', '), tc.preconditions ?? '', stepsCell(tc), tc.expected, tc.source, tc.specStatus])
      }
    }

    let baseName = sanitizeFileBase(`${proj.name}__${page.name}`)
    let fileName = `${baseName}.xlsx`
    let attempt = 0
    while (usedFileNames.has(fileName.toLowerCase())) {
      attempt += 1
      baseName = sanitizeFileBase(`${proj.name}__${page.name}__${page.id.slice(0, 8)}_${attempt}`)
      fileName = `${baseName}.xlsx`
    }
    usedFileNames.add(fileName.toLowerCase())

    const dest = path.join(directoryPath, fileName)
    await wb.xlsx.writeFile(dest)
    files.push(dest)
  }

  return { files }
}
