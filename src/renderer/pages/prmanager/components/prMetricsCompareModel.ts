import type { PrBranchCheckpoint, PrCheckpointTemplate, PrRepo, TrackedBranchRow } from '../hooks/usePrData'
import type { PrChangedFileView } from './prChangedFileTypes'

export type ComparePanelSpec = {
  templateId: string
  templateCode: string
  targetBranch: string
  prNumber: number | null
  prTitle: string | null
  changedFiles: number | null
  additions: number | null
  deletions: number | null
}

export type ComparePanelLoadState = {
  templateId: string
  loading: boolean
  error: string | null
  files: PrChangedFileView[] | null
}

export type UnionFilePresence = {
  present: boolean
  status?: string
  additions?: number
  deletions?: number
}

export type UnionFileRow = {
  filename: string
  presence: Record<string, UnionFilePresence>
  panelCount: number
  isPartial: boolean
}

export function buildComparePanels(row: TrackedBranchRow, prTemplates: PrCheckpointTemplate[]): ComparePanelSpec[] {
  const checkpointByTpl = new Map<string, PrBranchCheckpoint>()
  for (const cp of row.checkpoints) {
    checkpointByTpl.set(cp.templateId, cp)
  }

  return prTemplates.map(tpl => {
    const cp = checkpointByTpl.get(tpl.id)
    return {
      templateId: tpl.id,
      templateCode: tpl.code,
      targetBranch: tpl.targetBranch || '',
      prNumber: cp?.prNumber ?? null,
      prTitle: cp?.ghPrTitle?.trim() || null,
      changedFiles: cp?.ghPrChangedFiles ?? null,
      additions: cp?.ghPrAdditions ?? null,
      deletions: cp?.ghPrDeletions ?? null,
    }
  })
}

export async function loadComparePanelFiles(
  repo: PrRepo,
  panels: ComparePanelSpec[]
): Promise<Map<string, ComparePanelLoadState>> {
  const results = new Map<string, ComparePanelLoadState>()

  await Promise.all(
    panels.map(async panel => {
      if (panel.prNumber == null) {
        results.set(panel.templateId, {
          templateId: panel.templateId,
          loading: false,
          error: null,
          files: null,
        })
        return
      }

      try {
        const res = await window.api.pr.prFilesList({
          owner: repo.owner,
          repo: repo.repo,
          number: panel.prNumber,
        })
        if (res.status === 'success' && res.data) {
          results.set(panel.templateId, {
            templateId: panel.templateId,
            loading: false,
            error: null,
            files: res.data as PrChangedFileView[],
          })
        } else {
          results.set(panel.templateId, {
            templateId: panel.templateId,
            loading: false,
            error: res.message || 'Failed to load files',
            files: null,
          })
        }
      } catch (e) {
        results.set(panel.templateId, {
          templateId: panel.templateId,
          loading: false,
          error: e instanceof Error ? e.message : String(e),
          files: null,
        })
      }
    })
  )

  return results
}

export function buildUnionFileSummary(panels: ComparePanelSpec[], loadStates: Map<string, ComparePanelLoadState>): UnionFileRow[] {
  const panelsWithPr = panels.filter(p => p.prNumber != null)
  const panelsWithPrCount = panelsWithPr.length

  const filenameSet = new Set<string>()
  for (const panel of panelsWithPr) {
    const state = loadStates.get(panel.templateId)
    if (!state?.files) continue
    for (const f of state.files) {
      filenameSet.add(f.filename)
    }
  }

  const rows: UnionFileRow[] = []
  for (const filename of filenameSet) {
    const presence: Record<string, UnionFilePresence> = {}
    let panelCount = 0

    for (const panel of panels) {
      if (panel.prNumber == null) {
        presence[panel.templateId] = { present: false }
        continue
      }
      const state = loadStates.get(panel.templateId)
      const file = state?.files?.find(f => f.filename === filename)
      if (file) {
        panelCount++
        presence[panel.templateId] = {
          present: true,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
        }
      } else {
        presence[panel.templateId] = { present: false }
      }
    }

    rows.push({
      filename,
      presence,
      panelCount,
      isPartial: panelsWithPrCount > 0 && panelCount < panelsWithPrCount,
    })
  }

  rows.sort((a, b) => {
    if (a.isPartial !== b.isPartial) return a.isPartial ? -1 : 1
    return a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' })
  })

  return rows
}

/** File có mặt ở ≥2 panel PR nhưng additions/deletions không khớp giữa các panel. */
export function fileHasLineCountMismatch(row: UnionFileRow, panels: ComparePanelSpec[]): boolean {
  const panelsWithPr = panels.filter(p => p.prNumber != null)
  let refAdd: number | null = null
  let refDel: number | null = null

  for (const panel of panelsWithPr) {
    const pres = row.presence[panel.templateId]
    if (!pres?.present) continue

    const add = pres.additions ?? 0
    const del = pres.deletions ?? 0

    if (refAdd === null) {
      refAdd = add
      refDel = del
    } else if (add !== refAdd || del !== refDel) {
      return true
    }
  }

  return false
}

export function buildLineMismatchFilenames(rows: UnionFileRow[], panels: ComparePanelSpec[]): Set<string> {
  const out = new Set<string>()
  for (const row of rows) {
    if (fileHasLineCountMismatch(row, panels)) out.add(row.filename)
  }
  return out
}

export function fileExistsInAnyPanel(filename: string, loadStates: Map<string, ComparePanelLoadState>): boolean {
  for (const state of loadStates.values()) {
    if (state.files?.some(f => f.filename === filename)) return true
  }
  return false
}
