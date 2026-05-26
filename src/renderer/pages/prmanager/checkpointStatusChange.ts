import type { TFunction } from 'i18next'
import type { PrBranchCheckpoint, PrCheckpointTemplate, TrackedBranchRow } from './hooks/usePrData'
import type { PrGhStatusKind } from './prGhStatus'
import { PR_GH_STATUS_LABELS } from './prGhStatus'
import { getMergeableUi } from './prMergeableUi'

export type PrCheckpointStatusChangeDetail = {
  before: string
  after: string
}

export function prCheckpointCellKey(trackedBranchId: string, templateId: string): string {
  return `${trackedBranchId}:${templateId}`
}

function deriveOpenMergeableFingerprint(cp: PrBranchCheckpoint): string {
  const ms = (cp.ghPrMergeableState || '').toLowerCase().trim()
  return `open:${ms || 'none'}`
}

/** Fingerprint trạng thái hiển thị của ô pr_* (sau sync so sánh old vs new). */
export function prCheckpointStatusFingerprint(cp: PrBranchCheckpoint | null, mergeCp: PrBranchCheckpoint | null): string {
  if (!cp?.prNumber) return 'no-pr'
  if (mergeCp?.mergedAt || cp.ghPrMerged === true) return 'kind:merged'
  if (cp.ghPrState === 'closed') return 'kind:closed'
  if (cp.ghPrDraft === true) return 'kind:draft'
  if (cp.ghPrState === 'open') return deriveOpenMergeableFingerprint(cp)
  return 'kind:open'
}

function findMergeCompanionCp(row: TrackedBranchRow, prTpl: PrCheckpointTemplate, templates: PrCheckpointTemplate[]): PrBranchCheckpoint | null {
  const mergeTpl = templates.find(t => t.code.toLowerCase().startsWith('merge_') && t.targetBranch === prTpl.targetBranch)
  if (!mergeTpl) return null
  return row.checkpoints.find(c => c.templateId === mergeTpl.id) ?? null
}

export function buildPrCheckpointStatusSnapshot(tracked: TrackedBranchRow[], templates: PrCheckpointTemplate[]): Map<string, string> {
  const out = new Map<string, string>()
  const prTpls = templates.filter(t => t.code.toLowerCase().startsWith('pr_'))
  for (const row of tracked) {
    for (const tpl of prTpls) {
      const cp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
      const mergeCp = findMergeCompanionCp(row, tpl, templates)
      out.set(prCheckpointCellKey(row.id, tpl.id), prCheckpointStatusFingerprint(cp, mergeCp))
    }
  }
  return out
}

export function diffPrCheckpointStatusSnapshot(
  baseline: Map<string, string>,
  tracked: TrackedBranchRow[],
  templates: PrCheckpointTemplate[]
): { changedKeys: Set<string>; details: Map<string, PrCheckpointStatusChangeDetail> } {
  const current = buildPrCheckpointStatusSnapshot(tracked, templates)
  const changedKeys = new Set<string>()
  const details = new Map<string, PrCheckpointStatusChangeDetail>()
  for (const [key, before] of baseline) {
    const after = current.get(key)
    if (after === undefined || after === before) continue
    changedKeys.add(key)
    details.set(key, { before, after })
  }
  return { changedKeys, details }
}

export function branchHasPrStatusChange(changedKeys: Set<string>, trackedBranchId: string): boolean {
  const prefix = `${trackedBranchId}:`
  for (const key of changedKeys) {
    if (key.startsWith(prefix)) return true
  }
  return false
}

export function countPrStatusChangesForBranch(changedKeys: Set<string>, trackedBranchId: string): number {
  const prefix = `${trackedBranchId}:`
  let n = 0
  for (const key of changedKeys) {
    if (key.startsWith(prefix)) n++
  }
  return n
}

export function repoHasPrStatusChange(changedKeys: Set<string>, tracked: TrackedBranchRow[], repoId: string): boolean {
  for (const row of tracked) {
    if (row.repoId !== repoId) continue
    if (branchHasPrStatusChange(changedKeys, row.id)) return true
  }
  return false
}

export function countPrStatusChangesForRepo(changedKeys: Set<string>, tracked: TrackedBranchRow[], repoId: string): number {
  let n = 0
  for (const row of tracked) {
    if (row.repoId !== repoId) continue
    n += countPrStatusChangesForBranch(changedKeys, row.id)
  }
  return n
}

export function formatPrCheckpointStatusFingerprint(fp: string, t: TFunction): string {
  if (fp === 'no-pr') return t('prManager.board.statusFpNoPr')
  if (fp.startsWith('kind:')) {
    const kind = fp.slice(5) as PrGhStatusKind
    if (kind in PR_GH_STATUS_LABELS) return PR_GH_STATUS_LABELS[kind as PrGhStatusKind]
    return kind
  }
  if (fp.startsWith('open:')) {
    const ms = fp.slice(5)
    if (ms === 'none') return t('prManager.mergeableUi.checking')
    return getMergeableUi(ms === 'none' ? null : ms, t).shortLabel
  }
  return fp
}
