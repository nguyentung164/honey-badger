import { useCallback, useRef } from 'react'
import type { PrBranchCheckpoint, PrCheckpointTemplate, TrackedBranchRow } from '../hooks/usePrData'

export type PrBoardRowAction =
  | { type: 'openCreatePr'; rowId: string; tplId: string }
  | { type: 'openMergePr'; rowId: string; tplId: string }
  | { type: 'openPrInApp'; rowId: string; prNumber: number }
  | { type: 'syncBranch'; rowId: string }
  | { type: 'syncRepo'; repoId: string }
  | { type: 'toggleSelect'; rowId: string }
  | { type: 'openBranchUrl'; rowId: string }
  | { type: 'noteBlur'; rowId: string }

export type PrBoardRowActions = {
  openCreatePr: (row: TrackedBranchRow, tpl: PrCheckpointTemplate) => void
  openMergePr: (row: TrackedBranchRow, cp: PrBranchCheckpoint) => void
  openPrInApp: (row: TrackedBranchRow, prNumber: number) => void
  syncBranch: (rowId: string) => void
  syncRepo: (repoId: string) => void
  toggleSelect: (rowId: string) => void
  openBranchUrl: (row: TrackedBranchRow) => void
  noteBlur: (row: TrackedBranchRow) => void
}

export function useStableRowActionDispatch(
  rowById: Map<string, TrackedBranchRow>,
  templateById: Map<string, PrCheckpointTemplate>,
  actions: PrBoardRowActions
) {
  const rowByIdRef = useRef(rowById)
  rowByIdRef.current = rowById
  const templateByIdRef = useRef(templateById)
  templateByIdRef.current = templateById
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  const dispatchRowAction = useCallback((action: PrBoardRowAction) => {
    const a = actionsRef.current
    switch (action.type) {
      case 'openCreatePr': {
        const row = rowByIdRef.current.get(action.rowId)
        const tpl = templateByIdRef.current.get(action.tplId)
        if (row && tpl) a.openCreatePr(row, tpl)
        break
      }
      case 'openMergePr': {
        const row = rowByIdRef.current.get(action.rowId)
        const tpl = templateByIdRef.current.get(action.tplId)
        if (!row || !tpl) break
        const cp = row.checkpoints.find(c => c.templateId === tpl.id) ?? null
        const isMerge = tpl.code.toLowerCase().startsWith('merge_')
        if (isMerge) {
          for (const c of row.checkpoints) {
            const t = templateByIdRef.current.get(c.templateId)
            if (t?.code.toLowerCase().startsWith('pr_') && t.targetBranch === tpl.targetBranch && c.prNumber) {
              a.openMergePr(row, c)
              return
            }
          }
        }
        if (cp?.prNumber) a.openMergePr(row, cp)
        break
      }
      case 'openPrInApp': {
        const row = rowByIdRef.current.get(action.rowId)
        if (row) a.openPrInApp(row, action.prNumber)
        break
      }
      case 'syncBranch':
        a.syncBranch(action.rowId)
        break
      case 'syncRepo':
        a.syncRepo(action.repoId)
        break
      case 'toggleSelect':
        a.toggleSelect(action.rowId)
        break
      case 'openBranchUrl': {
        const row = rowByIdRef.current.get(action.rowId)
        if (row) a.openBranchUrl(row)
        break
      }
      case 'noteBlur': {
        const row = rowByIdRef.current.get(action.rowId)
        if (row) a.noteBlur(row)
        break
      }
    }
  }, [])

  return dispatchRowAction
}
