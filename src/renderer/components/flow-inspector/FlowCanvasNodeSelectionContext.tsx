'use client'

import { createContext, type ReactNode, useContext, useMemo } from 'react'

type Ctx = { anyNodeSelected: boolean }

const FlowCanvasNodeSelectionContext = createContext<Ctx | null>(null)

/**
 * Một boolean từ cha — tránh mỗi edge gọi `useStore(s => s.nodes.some…)` (O(nodes)×N edges mỗi lần store đổi).
 */
export function FlowCanvasNodeSelectionProvider({ children, anyNodeSelected }: { children: ReactNode; anyNodeSelected: boolean }) {
  const value = useMemo(() => ({ anyNodeSelected }), [anyNodeSelected])
  return <FlowCanvasNodeSelectionContext.Provider value={value}>{children}</FlowCanvasNodeSelectionContext.Provider>
}

export function useFlowCanvasAnyNodeSelected(): boolean {
  const ctx = useContext(FlowCanvasNodeSelectionContext)
  if (ctx == null) throw new Error('useFlowCanvasAnyNodeSelected requires FlowCanvasNodeSelectionProvider')
  return ctx.anyNodeSelected
}
