import { caseCodeToSpecStem, specRelPathToStem } from './reporterSpecPath'
import type { PageMapNodeStatus } from './types'

export interface CasePageRow {
  case_id: string
  case_code: string
  page_id: string
}

export interface CaseResultPageLookup {
  caseId?: string
  caseCode?: string
  testTitle?: string
  specFile?: string
}

/** Trích mã TC từ title — khớp logic `reportParser.extractCaseCodeFromTitle`. */
export function extractCaseCodeFromTitle(title?: string): string | undefined {
  if (!title?.trim()) return undefined
  const m = /\b(TC[-_]?[A-Za-z0-9-]+)\b/.exec(title.trim())
  return m?.[1]
}

export function buildCasePageLookupMaps(casePageRows: CasePageRow[]) {
  const pageByCaseId = new Map<string, string>()
  const pageByCaseCode = new Map<string, string>()
  const pageBySpecStem = new Map<string, string>()

  for (const row of casePageRows) {
    pageByCaseId.set(row.case_id, row.page_id)
    const code = row.case_code?.trim()
    if (!code) continue
    pageByCaseCode.set(code, row.page_id)
    pageByCaseCode.set(code.toLowerCase(), row.page_id)
    pageBySpecStem.set(canonicalSpecStem(caseCodeToSpecStem(code)), row.page_id)
  }

  return { pageByCaseId, pageByCaseCode, pageBySpecStem }
}

function canonicalSpecStem(stem: string): string {
  return stem.replace(/[-_]/g, '').toLowerCase()
}

function lookupSpecStem(stem: string | undefined, pageBySpecStem: Map<string, string>): string | undefined {
  const trimmed = stem?.trim()
  if (!trimmed) return undefined
  return pageBySpecStem.get(canonicalSpecStem(trimmed)) ?? pageBySpecStem.get(canonicalSpecStem(caseCodeToSpecStem(trimmed)))
}

function lookupCaseCode(
  code: string | undefined,
  pageByCaseCode: Map<string, string>,
  pageBySpecStem: Map<string, string>
): string | undefined {
  const trimmed = code?.trim()
  if (!trimmed) return undefined
  return (
    pageByCaseCode.get(trimmed) ??
    pageByCaseCode.get(trimmed.toLowerCase()) ??
    lookupSpecStem(trimmed, pageBySpecStem) ??
    lookupSpecStem(caseCodeToSpecStem(trimmed), pageBySpecStem)
  )
}

/** Resolve catalog page id for a persisted case result row. */
export function resolvePageIdForCaseResult(
  sample: CaseResultPageLookup,
  maps: ReturnType<typeof buildCasePageLookupMaps>
): string | undefined {
  const { pageByCaseId, pageByCaseCode, pageBySpecStem } = maps

  const caseId = sample.caseId?.trim()
  if (caseId && pageByCaseId.has(caseId)) return pageByCaseId.get(caseId)

  const fromCaseCode = lookupCaseCode(sample.caseCode, pageByCaseCode, pageBySpecStem)
  if (fromCaseCode) return fromCaseCode

  const fromTitle = lookupCaseCode(extractCaseCodeFromTitle(sample.testTitle), pageByCaseCode, pageBySpecStem)
  if (fromTitle) return fromTitle

  const specFile = sample.specFile?.trim()
  if (specFile) {
    const stem = specRelPathToStem(specFile.replace(/\\/g, '/'))
    const fromSpec = lookupSpecStem(stem ?? undefined, pageBySpecStem)
    if (fromSpec) return fromSpec
  }

  return undefined
}

export function hasTerminalPageMapStatus(pageStatus: Record<string, PageMapNodeStatus> | undefined | null): boolean {
  if (!pageStatus) return false
  return Object.values(pageStatus).some(s => s === 'done' || s === 'error' || s === 'cancelled')
}
