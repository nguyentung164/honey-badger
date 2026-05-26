'use client'

import { createContext, useContext } from 'react'

export type FlowEdgeActions = {
  openInspector: (edgeId: string) => void
}

export const FlowEdgeActionsContext = createContext<FlowEdgeActions | null>(null)

export function useFlowEdgeActions(): FlowEdgeActions | null {
  return useContext(FlowEdgeActionsContext)
}
