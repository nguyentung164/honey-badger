import type { PrBranchCheckpoint, PrCheckpointTemplate, TrackedBranchRow } from '../hooks/usePrData'
import type { PrGhStatusKind } from '../prGhStatus'
import { PR_GH_STATUS_IDS } from '../prGhStatus'

export type PrGhFilterId = PrGhStatusKind
export type PrGhAdvancedCombineMode = 'and' | 'or'

export function derivePrKind(prCp: PrBranchCheckpoint, mergeCp: PrBranchCheckpoint | null): PrGhFilterId {
  if (mergeCp?.mergedAt || prCp.ghPrMerged === true) return 'merged'
  if (prCp.ghPrState === 'closed') return 'closed'
  if (prCp.ghPrDraft === true) return 'draft'
  if (prCp.ghPrState === 'open') return 'open'
  return 'open'
}

export function prColumnKindMatchesFilters(kind: PrGhFilterId, filters: Set<PrGhFilterId>): boolean {
  const allOn = PR_GH_STATUS_IDS.every(id => filters.has(id))
  if (allOn) return true
  if (filters.size === 0) return false
  return filters.has(kind)
}

function filtersForTemplate(
  tplId: string,
  filtersByTplId: Record<string, PrGhFilterId[]>,
  simpleGhFallback: Set<PrGhFilterId>
): Set<PrGhFilterId> {
  const raw = filtersByTplId[tplId]
  if (raw === undefined) return new Set(PR_GH_STATUS_IDS.filter(id => simpleGhFallback.has(id)))
  if (raw.length === 0) return new Set()
  return new Set(raw)
}

/** AND: mọi cột pr_* có lọc hẹp đều phải có PR khớp; OR: ít nhất một cột có PR khớp. */
export function rowMatchesPrGhFiltersPerTemplate(
  row: TrackedBranchRow,
  prCheckpointTemplates: PrCheckpointTemplate[],
  activeTemplates: PrCheckpointTemplate[],
  filtersByTplId: Record<string, PrGhFilterId[]>,
  simpleGhFallback: Set<PrGhFilterId>,
  combineMode: PrGhAdvancedCombineMode
): boolean {
  if (prCheckpointTemplates.length === 0) return false

  if (combineMode === 'or') {
    for (const tpl of prCheckpointTemplates) {
      const prCp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
      if (!prCp?.prNumber) continue
      const mergeTpl = activeTemplates.find(t => t.code.toLowerCase().startsWith('merge_') && t.targetBranch === tpl.targetBranch)
      const mergeCp = mergeTpl ? (row.checkpoints.find(c => c.templateId === mergeTpl.id) ?? null) : null
      const kind = derivePrKind(prCp, mergeCp)
      const filters = filtersForTemplate(tpl.id, filtersByTplId, simpleGhFallback)
      if (prColumnKindMatchesFilters(kind, filters)) return true
    }
    return false
  }

  let anyPr = false
  for (const tpl of prCheckpointTemplates) {
    const filters = filtersForTemplate(tpl.id, filtersByTplId, simpleGhFallback)
    const allStatusesSelected = PR_GH_STATUS_IDS.every(id => filters.has(id))

    const prCp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
    if (!prCp?.prNumber) {
      if (!allStatusesSelected && filters.size > 0) return false
      continue
    }

    anyPr = true
    const mergeTpl = activeTemplates.find(t => t.code.toLowerCase().startsWith('merge_') && t.targetBranch === tpl.targetBranch)
    const mergeCp = mergeTpl ? (row.checkpoints.find(c => c.templateId === mergeTpl.id) ?? null) : null
    const kind = derivePrKind(prCp, mergeCp)
    if (!prColumnKindMatchesFilters(kind, filters)) return false
  }
  return anyPr
}

export type PrGhBoardFilterOptions = {
  advancedFiltersOpen: boolean
  prGhFilters: Set<PrGhFilterId>
  prGhFiltersByTpl: Record<string, PrGhFilterId[]>
  combineMode: PrGhAdvancedCombineMode
}

/** Lọc nhánh theo bộ lọc GitHub + AND/OR — dùng chung cho bảng và đếm. */
export function rowMatchesPrGhBoardFilters(
  row: TrackedBranchRow,
  prCheckpointTemplates: PrCheckpointTemplate[],
  activeTemplates: PrCheckpointTemplate[],
  options: PrGhBoardFilterOptions
): boolean {
  const { advancedFiltersOpen, prGhFilters, prGhFiltersByTpl, combineMode } = options
  const filtersByTpl = advancedFiltersOpen ? prGhFiltersByTpl : {}
  return rowMatchesPrGhFiltersPerTemplate(row, prCheckpointTemplates, activeTemplates, filtersByTpl, prGhFilters, combineMode)
}

export function filterPrBoardRowsByGhFilters(
  rows: TrackedBranchRow[],
  prCheckpointTemplates: PrCheckpointTemplate[],
  activeTemplates: PrCheckpointTemplate[],
  options: PrGhBoardFilterOptions
): TrackedBranchRow[] {
  return rows.filter(row => rowMatchesPrGhBoardFilters(row, prCheckpointTemplates, activeTemplates, options))
}

/** Ghép nhánh khớp lọc PR + (tuỳ chọn) nhánh chưa PR; khi lọc hẹp thì nhánh có PR luôn đứng trước. */
export function mergePrBoardFilteredRows(
  fromKind: TrackedBranchRow[],
  fromNoPr: TrackedBranchRow[],
  onlyBranchesWithoutPr: boolean,
  prGhStatusFilterNarrowed: boolean
): TrackedBranchRow[] {
  if (!onlyBranchesWithoutPr) return fromKind
  if (prGhStatusFilterNarrowed) return [...fromKind, ...fromNoPr]
  const byId = new Map<string, TrackedBranchRow>()
  for (const row of fromNoPr) byId.set(row.id, row)
  for (const row of fromKind) byId.set(row.id, row)
  return Array.from(byId.values())
}

/** Phân trang: khi lọc PR hẹp + hiện nhánh chưa PR, xếp toàn board — nhánh có PR (đã qua AND/OR) trước. */
export function flattenPrBoardRowsForPaging(
  groupedRows: ReadonlyArray<readonly [string, TrackedBranchRow[]]>,
  rowHasAnyPr: (row: TrackedBranchRow) => boolean,
  prGhStatusFilterNarrowed: boolean,
  onlyBranchesWithoutPr: boolean
): TrackedBranchRow[] {
  if (!prGhStatusFilterNarrowed || !onlyBranchesWithoutPr) {
    const out: TrackedBranchRow[] = []
    for (const [, rows] of groupedRows) out.push(...rows)
    return out
  }
  const withPr: TrackedBranchRow[] = []
  const withoutPr: TrackedBranchRow[] = []
  for (const [, rows] of groupedRows) {
    for (const row of rows) {
      if (rowHasAnyPr(row)) withPr.push(row)
      else withoutPr.push(row)
    }
  }
  const byBranch = (a: TrackedBranchRow, b: TrackedBranchRow) =>
    a.branchName.localeCompare(b.branchName, undefined, { sensitivity: 'base' })
  withPr.sort(byBranch)
  withoutPr.sort(byBranch)
  return [...withPr, ...withoutPr]
}

/** Có lọc trạng thái PR hẹp (không phải cả 4) — dùng sắp xếp bảng ưu tiên nhánh có PR. */
export function isPrGhStatusFilterNarrowed(
  prCheckpointTemplates: PrCheckpointTemplate[],
  prGhFilters: Set<PrGhFilterId>,
  advancedFiltersOpen: boolean,
  prGhFiltersByTpl: Record<string, PrGhFilterId[]>
): boolean {
  if (prGhFilters.size === 0) return false
  if (advancedFiltersOpen) {
    return prCheckpointTemplates.some(tpl => {
      const effective = prGhFiltersByTpl[tpl.id] ?? PR_GH_STATUS_IDS.filter(k => prGhFilters.has(k))
      return effective.length > 0 && !PR_GH_STATUS_IDS.every(id => effective.includes(id))
    })
  }
  return !PR_GH_STATUS_IDS.every(id => prGhFilters.has(id))
}
