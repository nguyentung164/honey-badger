'use client'

import { createContext, useContext } from 'react'

export type FlowNodeActions = {
  openInspector: (nodeId: string) => void
  openGroupInspector?: (groupId: string) => void
  openAnnotationInspector?: (annotationId: string) => void
}

export const FlowNodeActionsContext = createContext<FlowNodeActions | null>(null)

export function useFlowNodeActions(): FlowNodeActions | null {
  return useContext(FlowNodeActionsContext)
}
