'use client'

import { createContext, useContext } from 'react'

export type EvmAiPanelControl = {
  togglePanel: () => void
}

export const EvmAiPanelContext = createContext<EvmAiPanelControl | null>(null)

export function useEvmAiPanelControl(): EvmAiPanelControl | null {
  return useContext(EvmAiPanelContext)
}
