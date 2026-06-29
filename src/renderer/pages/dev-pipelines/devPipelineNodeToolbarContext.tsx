import { createContext, useContext } from 'react'

export type DevPipelineNodeToolbarActions = {
  openStepDetails: (id: string) => void
  duplicateStep: (id: string) => void
  deleteStep: (id: string) => void
  runThisStep: (stepId: string) => void
  runFlowFromStep: (stepId: string) => void
  toggleExecutionDisabled: (stepId: string) => void
  /** Commit workflow: toggle step enabled (skip when disabled). */
  toggleStepEnabled?: (stepId: string) => void
  canRunStep: boolean
  canDeleteStep: boolean
  canDuplicateStep?: boolean
  canEditStep?: boolean
}

export const DevPipelineNodeToolbarContext = createContext<DevPipelineNodeToolbarActions | null>(null)

export function useDevPipelineNodeToolbar(): DevPipelineNodeToolbarActions | null {
  return useContext(DevPipelineNodeToolbarContext)
}
