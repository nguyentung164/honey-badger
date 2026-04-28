import type { PrBranchCheckpoint, PrCheckpointTemplate, PrRepo, TrackedBranchRow } from '../hooks/usePrData'

/** Trạng thái PR theo từng cột pr_* (dùng xem trước bulk xóa remote branch). */
export type BulkDeletePrColumnStatus = 'merged' | 'open' | 'draft' | 'closed' | 'noPr' | 'unknown'

function bulkDeletePrColumnStatusFromCheckpoint(cp: PrBranchCheckpoint | null): BulkDeletePrColumnStatus {
  if (!cp?.prNumber) return 'noPr'
  if (cp.ghPrMerged === true) return 'merged'
  if (cp.ghPrState === 'closed') return 'closed'
  if (cp.ghPrDraft === true) return 'draft'
  if (cp.ghPrState === 'open') return 'open'
  return 'unknown'
}

function bulkDeletePrColumnSummaries(
  row: TrackedBranchRow,
  activeTemplates: PrCheckpointTemplate[]
): { templateLabel: string; status: BulkDeletePrColumnStatus }[] {
  const out: { templateLabel: string; status: BulkDeletePrColumnStatus }[] = []
  for (const tpl of activeTemplates) {
    if (!tpl.code.toLowerCase().startsWith('pr_')) continue
    const cp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
    out.push({ templateLabel: tpl.label, status: bulkDeletePrColumnStatusFromCheckpoint(cp) })
  }
  return out
}

export type BulkActionKind =
  | 'merge'
  | 'close'
  | 'draft'
  | 'ready'
  | 'updateBranch'
  | 'approve'
  | 'reopen'
  | 'requestReviewers'
  | 'deleteRemoteBranch'
  | 'createPr'

/** Giống getMergeableUi(...).blockMerge trên PrBoard — không phụ thuộc i18n. */
export function githubMergeableBlocksMerge(mergeable: string | null | undefined): boolean {
  const s = (mergeable || '').toLowerCase().trim()
  return s === 'dirty' || s === 'conflict' || s === 'blocked' || s === 'behind' || s === 'unstable' || s === 'unknown'
}

export type BulkPrRowTarget = {
  id: string
  rowId: string
  repoId: string
  owner: string
  repo: string
  prNumber: number
  templateId: string
  templateLabel: string
  headBranch: string
  baseBranch: string | null
  ghTitle: string | null
  ghPrDraft: boolean | null
  ghPrState: 'open' | 'closed' | null
  ghPrMerged: boolean | null
  ghPrMergeableState: string | null
  /** GitHub: login người tạo PR — không thể thêm làm requested reviewer. */
  ghPrAuthor: string | null
  eligible: boolean
  skipReasonKey: string | null
}

export type BulkDeleteBranchTarget = {
  id: string
  rowId: string
  repoId: string
  owner: string
  repo: string
  branch: string
  eligible: boolean
  skipReasonKey: string | null
  /** Mỗi cột PR (pr_*): nhãn template + trạng thái sync từ GitHub — hiển thị dưới tên nhánh trong dialog. */
  prColumnSummaries: { templateLabel: string; status: BulkDeletePrColumnStatus }[]
}

export type BulkCreatePrTarget = {
  id: string
  rowId: string
  repoId: string
  owner: string
  repo: string
  head: string
  base: string
  templateId: string
  templateLabel: string
  suggestedTitle: string
  eligible: boolean
  skipReasonKey: string | null
  /** Đã có PR gắn template này (vd. skip alreadyHasPr) — để hiển thị đúng # và tiêu đề GitHub. */
  existingPrNumber: number | null
  existingPrTitle: string | null
}

function repoForRow(row: TrackedBranchRow, repos: PrRepo[]): PrRepo | null {
  return repos.find(r => r.id === row.repoId) ?? null
}

function collectOpenPrNumbers(row: TrackedBranchRow, activeTemplates: PrCheckpointTemplate[]): number[] {
  const out: number[] = []
  for (const tpl of activeTemplates) {
    if (!tpl.code.toLowerCase().startsWith('pr_')) continue
    const cp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
    if (!cp?.prNumber) continue
    if (cp.ghPrMerged === true) continue
    if (cp.ghPrState === 'closed') continue
    if (cp.ghPrDraft === true) continue
    out.push(cp.prNumber)
  }
  return out
}

function protectedBranchNames(repo: PrRepo | null, activeTemplates: PrCheckpointTemplate[]): Set<string> {
  const s = new Set(['main', 'master', 'develop', 'gh-pages'].map(x => x.toLowerCase()))
  const def = repo?.defaultBaseBranch?.trim().toLowerCase()
  if (def) s.add(def)
  for (const tpl of activeTemplates) {
    const b = tpl.targetBranch?.trim().toLowerCase()
    if (b) s.add(b)
  }
  return s
}

export function resolveBulkPrTargets(
  kind: Exclude<BulkActionKind, 'deleteRemoteBranch' | 'createPr'>,
  rows: TrackedBranchRow[],
  activeTemplates: PrCheckpointTemplate[],
  repos: PrRepo[]
): BulkPrRowTarget[] {
  const out: BulkPrRowTarget[] = []
  for (const row of rows) {
    const prRepo = repoForRow(row, repos)
    for (const tpl of activeTemplates) {
      if (!tpl.code.toLowerCase().startsWith('pr_')) continue
      const cp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
      if (!cp?.prNumber) continue
      const n = cp.prNumber
      const id = `${row.id}:${tpl.id}:${n}`
      const baseBranch = tpl.targetBranch ?? prRepo?.defaultBaseBranch ?? null

      let eligible = false
      let skipReasonKey: string | null = 'prManager.bulk.skip.generic'

      if (!prRepo) {
        skipReasonKey = 'prManager.bulk.skip.noRepo'
      } else if (kind === 'reopen') {
        if (cp.ghPrMerged === true) {
          skipReasonKey = 'prManager.bulk.skip.merged'
        } else if (cp.ghPrState === 'open') {
          skipReasonKey = 'prManager.bulk.skip.alreadyOpen'
        } else if (cp.ghPrState === 'closed') {
          eligible = true
          skipReasonKey = null
        } else {
          skipReasonKey = 'prManager.bulk.skip.reopenStateUnknown'
        }
      } else if (cp.ghPrMerged === true) {
        skipReasonKey = 'prManager.bulk.skip.merged'
      } else if (cp.ghPrState === 'closed') {
        skipReasonKey = 'prManager.bulk.skip.alreadyClosed'
      } else if (cp.ghPrState !== 'open') {
        skipReasonKey = 'prManager.bulk.skip.notOpen'
      } else if (kind === 'merge') {
        if (cp.ghPrDraft === true) {
          skipReasonKey = 'prManager.bulk.skip.draft'
        } else if (githubMergeableBlocksMerge(cp.ghPrMergeableState)) {
          skipReasonKey = 'prManager.bulk.skip.mergeBlocked'
        } else {
          eligible = true
          skipReasonKey = null
        }
      } else if (kind === 'close') {
        eligible = true
        skipReasonKey = null
      } else if (kind === 'draft') {
        if (cp.ghPrDraft === true) {
          skipReasonKey = 'prManager.bulk.skip.alreadyDraft'
        } else {
          eligible = true
          skipReasonKey = null
        }
      } else if (kind === 'ready') {
        if (cp.ghPrDraft !== true) {
          skipReasonKey = 'prManager.bulk.skip.notDraft'
        } else {
          eligible = true
          skipReasonKey = null
        }
      } else if (kind === 'updateBranch') {
        if (cp.ghPrDraft === true) {
          skipReasonKey = 'prManager.bulk.skip.draft'
        } else if (
          String(cp.ghPrMergeableState ?? '')
            .toLowerCase()
            .trim() !== 'behind'
        ) {
          skipReasonKey = 'prManager.bulk.skip.notBehind'
        } else {
          eligible = true
          skipReasonKey = null
        }
      } else if (kind === 'approve') {
        if (cp.ghPrDraft === true) {
          skipReasonKey = 'prManager.bulk.skip.draft'
        } else {
          eligible = true
          skipReasonKey = null
        }
      } else if (kind === 'requestReviewers') {
        eligible = true
        skipReasonKey = null
      }

      out.push({
        id,
        rowId: row.id,
        repoId: row.repoId,
        owner: row.repoOwner,
        repo: row.repoRepo,
        prNumber: n,
        templateId: tpl.id,
        templateLabel: tpl.label,
        headBranch: row.branchName,
        baseBranch,
        ghTitle: cp.ghPrTitle ?? null,
        ghPrDraft: cp.ghPrDraft,
        ghPrState: cp.ghPrState,
        ghPrMerged: cp.ghPrMerged,
        ghPrMergeableState: cp.ghPrMergeableState,
        ghPrAuthor: cp.ghPrAuthor ?? null,
        eligible,
        skipReasonKey,
      })
    }
  }
  return out
}

export function resolveBulkDeleteBranchTargets(
  rows: TrackedBranchRow[],
  repos: PrRepo[],
  activeTemplates: PrCheckpointTemplate[],
  remoteExistMap: Record<string, boolean> | null,
  onlyExistingOnRemote: boolean
): BulkDeleteBranchTarget[] {
  const out: BulkDeleteBranchTarget[] = []
  const prot = (repo: PrRepo | null) => protectedBranchNames(repo, activeTemplates)

  for (const row of rows) {
    const prRepo = repoForRow(row, repos)
    const id = `${row.id}:branch`
    const b = row.branchName.trim()
    let eligible = true
    let skipReasonKey: string | null = null

    if (!prRepo) {
      eligible = false
      skipReasonKey = 'prManager.bulk.skip.noRepo'
    } else if (!b) {
      eligible = false
      skipReasonKey = 'prManager.bulk.skip.generic'
    } else if (prot(prRepo).has(b.toLowerCase())) {
      eligible = false
      skipReasonKey = 'prManager.bulk.skip.protectedBranch'
    } else if (onlyExistingOnRemote && remoteExistMap && remoteExistMap[row.id] !== true) {
      eligible = false
      skipReasonKey = 'prManager.bulk.skip.notOnRemote'
    } else if (collectOpenPrNumbers(row, activeTemplates).length > 0) {
      eligible = false
      skipReasonKey = 'prManager.bulk.skip.openPrExists'
    }

    out.push({
      id,
      rowId: row.id,
      repoId: row.repoId,
      owner: row.repoOwner,
      repo: row.repoRepo,
      branch: row.branchName,
      eligible,
      skipReasonKey,
      prColumnSummaries: bulkDeletePrColumnSummaries(row, activeTemplates),
    })
  }
  return out
}

export function resolveBulkCreatePrTargets(
  rows: TrackedBranchRow[],
  template: PrCheckpointTemplate,
  repos: PrRepo[],
  remoteExistMap: Record<string, boolean> | null,
  onlyExistingOnRemote: boolean
): BulkCreatePrTarget[] {
  const out: BulkCreatePrTarget[] = []
  const prRepo = (row: TrackedBranchRow) => repoForRow(row, repos)

  for (const row of rows) {
    const repo = prRepo(row)
    const cp = row.checkpoints.find(c => c.templateId === template.id) ?? null
    const id = `${row.id}:${template.id}`
    const base = (template.targetBranch?.trim() || repo?.defaultBaseBranch?.trim() || 'stage').trim()
    const head = row.branchName.trim()
    const suggestedTitle = `${head} → ${base}`

    let eligible = true
    let skipReasonKey: string | null = null

    if (!repo) {
      eligible = false
      skipReasonKey = 'prManager.bulk.skip.noRepo'
    } else if (cp?.prNumber) {
      eligible = false
      skipReasonKey = 'prManager.bulk.skip.alreadyHasPr'
    } else if (!head) {
      eligible = false
      skipReasonKey = 'prManager.bulk.skip.generic'
    } else if (head.toLowerCase() === base.toLowerCase()) {
      eligible = false
      skipReasonKey = 'prManager.bulk.skip.sameHeadBase'
    } else if (onlyExistingOnRemote && remoteExistMap && remoteExistMap[row.id] !== true) {
      eligible = false
      skipReasonKey = 'prManager.bulk.skip.notOnRemote'
    }

    out.push({
      id,
      rowId: row.id,
      repoId: row.repoId,
      owner: row.repoOwner,
      repo: row.repoRepo,
      head,
      base,
      templateId: template.id,
      templateLabel: template.label,
      suggestedTitle,
      eligible,
      skipReasonKey,
      existingPrNumber: typeof cp?.prNumber === 'number' ? cp.prNumber : null,
      existingPrTitle: cp?.ghPrTitle ?? null,
    })
  }
  return out
}

/** Số dòng có ít nhất một cột pr_* đủ điều kiện tạo PR bulk (ví dụ stage đã PR, main chưa). */
export function countRowsEligibleForBulkCreateOnAnyPrTemplate(
  rows: TrackedBranchRow[],
  activeTemplates: PrCheckpointTemplate[],
  repos: PrRepo[],
  remoteExistMap: Record<string, boolean> | null,
  onlyExistingOnRemote: boolean
): number {
  const prTpls = activePrTemplates(activeTemplates)
  if (prTpls.length === 0) return 0
  let n = 0
  for (const row of rows) {
    for (const tpl of prTpls) {
      const targets = resolveBulkCreatePrTargets([row], tpl, repos, remoteExistMap, onlyExistingOnRemote)
      if (targets[0]?.eligible) {
        n++
        break
      }
    }
  }
  return n
}

export function activePrTemplates(activeTemplates: PrCheckpointTemplate[]): PrCheckpointTemplate[] {
  return activeTemplates.filter(t => t.code.toLowerCase().startsWith('pr_'))
}
