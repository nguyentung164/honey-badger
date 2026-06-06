import { countPrStatusChangesForBranch, countPrStatusChangesForRepo, prCheckpointCellKey, type PrCheckpointStatusChangeDetail } from '../checkpointStatusChange'
import type { PrBranchCheckpoint, PrCheckpointTemplate, PrRepo, TrackedBranchRow } from '../hooks/usePrData'
import { PR_MANAGER_REPO_GROUP_VISUAL } from '../prManagerRepoGroupVisual'
import type { PrGhStatusKind } from '../prGhStatus'
import { PR_GH_STATUS_IDS } from '../prGhStatus'
import type { RepoBaseInsightsMap } from '../repoBaseBranchInsights'
import { readLastGithubSyncBranchMs, readLastGithubSyncRepoMs, effectiveGithubSyncMsForBranchRow } from './prBoardSyncStorage'

export type MergeMetricAlignStatus = 'neutral' | 'match' | 'mismatch'

/** So khớp files / lines giữa các cột merge_* trên cùng một dòng. */
export type MergeMetricsAlignment = {
  files: MergeMetricAlignStatus
  lines: MergeMetricAlignStatus
}

export type PrBoardMergeCellViewModel = {
  tplId: string
  cp: PrBranchCheckpoint | null
  companionPrCp: PrBranchCheckpoint | null
  hasStatusChange: boolean
  statusChangeDetail?: PrCheckpointStatusChangeDetail
}

export type PrBoardRowViewModel = {
  row: TrackedBranchRow
  rowId: string
  isFirstInGroup: boolean
  isSelected: boolean
  isRowSyncLocked: boolean
  branchProtected: boolean
  branchStatusChangeCount: number
  branchHasStatusChange: boolean
  branchSyncMs: number | null
  effectiveBranchSyncMs: number | null
  mergeCells: PrBoardMergeCellViewModel[]
  /** O(1) lookup theo template id — tránh `.find()` khi render. */
  mergeCellsByTplId: ReadonlyMap<string, PrBoardMergeCellViewModel>
  mergeMetricsAlignment: MergeMetricsAlignment
  vis: (typeof PR_MANAGER_REPO_GROUP_VISUAL)[number]
}

function metricAlignStatus(values: Array<number | null | undefined>): MergeMetricAlignStatus {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v) && v >= 0)
  if (nums.length < 2) return 'neutral'
  const first = nums[0]
  return nums.every(n => n === first) ? 'match' : 'mismatch'
}

function linePairAlignStatus(
  pairs: Array<{ additions?: number | null; deletions?: number | null }>
): MergeMetricAlignStatus {
  const keys = pairs
    .filter(
      p =>
        (p.additions != null && Number.isFinite(p.additions)) || (p.deletions != null && Number.isFinite(p.deletions))
    )
    .map(p => `${p.additions ?? '∅'}:${p.deletions ?? '∅'}`)
  if (keys.length < 2) return 'neutral'
  const first = keys[0]
  return keys.every(k => k === first) ? 'match' : 'mismatch'
}

function computeMergeMetricsAlignment(mergeCells: PrBoardMergeCellViewModel[]): MergeMetricsAlignment {
  const companions = mergeCells
    .map(c => c.companionPrCp)
    .filter((cp): cp is PrBranchCheckpoint => cp?.prNumber != null)
  return {
    files: metricAlignStatus(companions.map(c => c.ghPrChangedFiles)),
    lines: linePairAlignStatus(companions.map(c => ({ additions: c.ghPrAdditions, deletions: c.ghPrDeletions }))),
  }
}

export type PrBoardRepoGroupViewModel = {
  repoKey: string
  repoId: string
  repoName: string
  repoOwner: string
  repoRepo: string
  groupIndex: number
  rowSpan: number
  rows: PrBoardRowViewModel[]
  repoTotalBranches: number
  repoTotalPrs: number
  repoStatusChangeCount: number
  repoHasStatusChange: boolean
  repoSyncMs: number | null
  prByTpl: Record<string, Record<PrGhStatusKind, number>> | undefined
  vis: (typeof PR_MANAGER_REPO_GROUP_VISUAL)[number]
}

export type PrBoardTableViewModel = {
  groups: PrBoardRepoGroupViewModel[]
  totalRowCount: number
  totalPages: number
  safePage: number
  pageRowIds: string[]
  allPageSelected: boolean
  somePageSelected: boolean
}

export function buildRepoById(repos: PrRepo[]): Map<string, PrRepo> {
  const m = new Map<string, PrRepo>()
  for (const r of repos) m.set(r.id, r)
  return m
}

export function buildCheckpointByTplId(row: TrackedBranchRow): Map<string, PrBranchCheckpoint | null> {
  const m = new Map<string, PrBranchCheckpoint | null>()
  for (const cp of row.checkpoints) {
    m.set(cp.templateId, cp)
  }
  return m
}

export function buildCompanionPrMap(
  row: TrackedBranchRow,
  activeTemplates: PrCheckpointTemplate[],
  templateById: Map<string, PrCheckpointTemplate>
): Map<string, PrBranchCheckpoint | null> {
  const m = new Map<string, PrBranchCheckpoint | null>()
  for (const tpl of activeTemplates) {
    if (!tpl.code.toLowerCase().startsWith('merge_')) continue
    let companion: PrBranchCheckpoint | null = null
    if (tpl.targetBranch) {
      for (const cp of row.checkpoints) {
        const cpTpl = templateById.get(cp.templateId)
        if (!cpTpl) continue
        if (cpTpl.code.toLowerCase().startsWith('pr_') && cpTpl.targetBranch === tpl.targetBranch && cp.prNumber) {
          companion = cp
          break
        }
      }
    }
    m.set(tpl.id, companion)
  }
  return m
}

type BuildPagedTableViewModelInput = {
  projectId: string
  pagedGroupedRows: Array<[string, TrackedBranchRow[]]>
  repoBranchTotals: Map<string, number>
  repoPrKindCountsByTpl: Map<string, Record<string, Record<PrGhStatusKind, number>>>
  orderedPrCheckpointTemplates: PrCheckpointTemplate[]
  activeTemplates: PrCheckpointTemplate[]
  templateById: Map<string, PrCheckpointTemplate>
  statusChangedKeys: Set<string>
  statusChangeDetails: Map<string, PrCheckpointStatusChangeDetail>
  tracked: TrackedBranchRow[]
  selectedRowIds: Set<string>
  lockedRowId: string | null
  lockedRepoId: string | null
  branchProtectedMap: Record<string, boolean> | null
  pageRowIds: string[]
  totalRowCount: number
  totalPages: number
  safePage: number
}

export function buildPagedTableViewModel(input: BuildPagedTableViewModelInput): PrBoardTableViewModel {
  const {
    projectId,
    pagedGroupedRows,
    repoBranchTotals,
    repoPrKindCountsByTpl,
    orderedPrCheckpointTemplates,
    activeTemplates,
    templateById,
    statusChangedKeys,
    statusChangeDetails,
    tracked,
    selectedRowIds,
    lockedRowId,
    lockedRepoId,
    branchProtectedMap,
    pageRowIds,
    totalRowCount,
    totalPages,
    safePage,
  } = input

  const groups: PrBoardRepoGroupViewModel[] = pagedGroupedRows.map(([repoKey, rows], groupIndex) => {
    const repoId = rows[0].repoId
    const prByTpl = repoPrKindCountsByTpl.get(repoKey)
    const repoTotalBranches = repoBranchTotals.get(repoKey) ?? rows.length
    const repoTotalPrs = orderedPrCheckpointTemplates.reduce((s, tpl) => {
      const c = prByTpl?.[tpl.id]
      if (!c) return s
      return s + PR_GH_STATUS_IDS.reduce((acc, id) => acc + c[id], 0)
    }, 0)
    const repoStatusChangeCount = countPrStatusChangesForRepo(statusChangedKeys, tracked, repoId)
    const repoHasStatusChange = repoStatusChangeCount > 0
    const repoSyncMs = readLastGithubSyncRepoMs(projectId, repoId)
    const vis = PR_MANAGER_REPO_GROUP_VISUAL[groupIndex % PR_MANAGER_REPO_GROUP_VISUAL.length]

    const rowViewModels: PrBoardRowViewModel[] = rows.map((row, idx) => {
      const branchStatusChangeCount = countPrStatusChangesForBranch(statusChangedKeys, row.id)
      const branchSyncMs = readLastGithubSyncBranchMs(projectId, row.id)
      const effectiveBranchSyncMs = effectiveGithubSyncMsForBranchRow(repoSyncMs, branchSyncMs)
      const checkpointByTplId = buildCheckpointByTplId(row)
      const companionMap = buildCompanionPrMap(row, activeTemplates, templateById)

      const mergeCells: PrBoardMergeCellViewModel[] = activeTemplates.map(tpl => {
        const cp = checkpointByTplId.get(tpl.id) ?? null
        const isMergeKind = tpl.code.toLowerCase().startsWith('merge_')
        const companionPrCp = isMergeKind ? (companionMap.get(tpl.id) ?? null) : null
        const companionPrTplForMerge = isMergeKind
          ? activeTemplates.find(
              activeTpl => activeTpl.code.toLowerCase().startsWith('pr_') && activeTpl.targetBranch === tpl.targetBranch
            )
          : null
        const statusChangePrCellKey =
          companionPrTplForMerge != null ? prCheckpointCellKey(row.id, companionPrTplForMerge.id) : null
        const hasStatusChange = Boolean(isMergeKind && statusChangePrCellKey != null && statusChangedKeys.has(statusChangePrCellKey))
        const statusChangeDetail =
          hasStatusChange && statusChangePrCellKey != null ? statusChangeDetails.get(statusChangePrCellKey) : undefined
        return { tplId: tpl.id, cp, companionPrCp, hasStatusChange, statusChangeDetail }
      })
      const mergeCellsByTplId = new Map(mergeCells.map(cell => [cell.tplId, cell]))

      const isRowSyncLocked =
        (lockedRowId != null && row.id === lockedRowId) || (lockedRepoId != null && row.repoId === lockedRepoId)

      return {
        row,
        rowId: row.id,
        isFirstInGroup: idx === 0,
        isSelected: selectedRowIds.has(row.id),
        isRowSyncLocked,
        branchProtected: branchProtectedMap != null && branchProtectedMap[row.id] === true,
        branchStatusChangeCount,
        branchHasStatusChange: branchStatusChangeCount > 0,
        branchSyncMs,
        effectiveBranchSyncMs,
        mergeCells,
        mergeCellsByTplId,
        mergeMetricsAlignment: computeMergeMetricsAlignment(mergeCells),
        vis,
      }
    })

    return {
      repoKey,
      repoId,
      repoName: rows[0].repoName,
      repoOwner: rows[0].repoOwner,
      repoRepo: rows[0].repoRepo,
      groupIndex,
      rowSpan: rows.length,
      rows: rowViewModels,
      repoTotalBranches,
      repoTotalPrs,
      repoStatusChangeCount,
      repoHasStatusChange,
      repoSyncMs,
      prByTpl,
      vis,
    }
  })

  const allPageSelected = pageRowIds.length > 0 && pageRowIds.every(id => selectedRowIds.has(id))
  const somePageSelected = pageRowIds.some(id => selectedRowIds.has(id))

  return {
    groups,
    totalRowCount,
    totalPages,
    safePage,
    pageRowIds,
    allPageSelected,
    somePageSelected,
  }
}

function mergeCellVmEqual(a: PrBoardMergeCellViewModel, b: PrBoardMergeCellViewModel): boolean {
  return (
    a.tplId === b.tplId &&
    a.cp === b.cp &&
    a.companionPrCp === b.companionPrCp &&
    a.hasStatusChange === b.hasStatusChange &&
    a.statusChangeDetail === b.statusChangeDetail
  )
}

function mergeCellsEqual(a: readonly PrBoardMergeCellViewModel[], b: readonly PrBoardMergeCellViewModel[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!mergeCellVmEqual(a[i], b[i])) return false
  }
  return true
}

function rowVmContentEqualExceptSelection(a: PrBoardRowViewModel, b: PrBoardRowViewModel): boolean {
  return (
    a.row === b.row &&
    a.rowId === b.rowId &&
    a.isFirstInGroup === b.isFirstInGroup &&
    a.isRowSyncLocked === b.isRowSyncLocked &&
    a.branchProtected === b.branchProtected &&
    a.branchStatusChangeCount === b.branchStatusChangeCount &&
    a.branchHasStatusChange === b.branchHasStatusChange &&
    a.branchSyncMs === b.branchSyncMs &&
    a.effectiveBranchSyncMs === b.effectiveBranchSyncMs &&
    a.mergeMetricsAlignment.files === b.mergeMetricsAlignment.files &&
    a.mergeMetricsAlignment.lines === b.mergeMetricsAlignment.lines &&
    a.vis === b.vis &&
    mergeCellsEqual(a.mergeCells, b.mergeCells)
  )
}

function reuseRowViewModel(prev: PrBoardRowViewModel | undefined, next: PrBoardRowViewModel): PrBoardRowViewModel {
  if (!prev) return next
  if (prev === next) return prev
  if (rowVmContentEqualExceptSelection(prev, next)) {
    return prev.isSelected === next.isSelected ? prev : { ...prev, isSelected: next.isSelected }
  }
  return next
}

function groupMetaEqualExceptRows(a: PrBoardRepoGroupViewModel, b: PrBoardRepoGroupViewModel): boolean {
  return (
    a.repoKey === b.repoKey &&
    a.repoId === b.repoId &&
    a.repoName === b.repoName &&
    a.repoOwner === b.repoOwner &&
    a.repoRepo === b.repoRepo &&
    a.groupIndex === b.groupIndex &&
    a.rowSpan === b.rowSpan &&
    a.repoTotalBranches === b.repoTotalBranches &&
    a.repoTotalPrs === b.repoTotalPrs &&
    a.repoStatusChangeCount === b.repoStatusChangeCount &&
    a.repoHasStatusChange === b.repoHasStatusChange &&
    a.repoSyncMs === b.repoSyncMs &&
    a.prByTpl === b.prByTpl &&
    a.vis === b.vis
  )
}

function rowsArraySameRefs(a: readonly PrBoardRowViewModel[], b: readonly PrBoardRowViewModel[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** Giữ reference row/group cũ khi chỉ `isSelected` (hoặc không đổi) — giúp `memo` row hiệu quả. */
export function stabilizeTableViewModel(
  prev: PrBoardTableViewModel | null,
  next: PrBoardTableViewModel
): PrBoardTableViewModel {
  if (!prev) return next

  const prevRowById = new Map<string, PrBoardRowViewModel>()
  for (const group of prev.groups) {
    for (const row of group.rows) prevRowById.set(row.rowId, row)
  }

  const groups: PrBoardRepoGroupViewModel[] = next.groups.map(nextGroup => {
    const prevGroup = prev.groups.find(g => g.repoKey === nextGroup.repoKey)
    const rows = nextGroup.rows.map(row => reuseRowViewModel(prevRowById.get(row.rowId), row))
    if (prevGroup && groupMetaEqualExceptRows(prevGroup, nextGroup) && rowsArraySameRefs(prevGroup.rows, rows)) {
      return prevGroup
    }
    return { ...nextGroup, rows }
  })

  const groupsUnchanged = prev.groups.length === groups.length && prev.groups.every((g, i) => g === groups[i])

  const topSame =
    prev.totalRowCount === next.totalRowCount &&
    prev.totalPages === next.totalPages &&
    prev.safePage === next.safePage &&
    prev.allPageSelected === next.allPageSelected &&
    prev.somePageSelected === next.somePageSelected &&
    prev.pageRowIds.length === next.pageRowIds.length &&
    prev.pageRowIds.every((id, i) => id === next.pageRowIds[i])

  if (groupsUnchanged && topSame) return prev

  return {
    groups,
    totalRowCount: next.totalRowCount,
    totalPages: next.totalPages,
    safePage: next.safePage,
    pageRowIds: topSame ? prev.pageRowIds : next.pageRowIds,
    allPageSelected: next.allPageSelected,
    somePageSelected: next.somePageSelected,
  }
}

export type { RepoBaseInsightsMap }
