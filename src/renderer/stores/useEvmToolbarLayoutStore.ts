import { create } from 'zustand'

export type EvmMasterSubTab = 'phases' | 'statuses' | 'nonworking'

interface EvmToolbarLayoutState {
  wbsAddSignal: number
  masterAddSignal: number
  masterSubTab: EvmMasterSubTab
  requestWbsAdd: () => void
  requestMasterAdd: () => void
  setMasterSubTab: (tab: EvmMasterSubTab) => void
}

export const useEvmToolbarLayoutStore = create<EvmToolbarLayoutState>(set => ({
  wbsAddSignal: 0,
  masterAddSignal: 0,
  masterSubTab: 'phases',
  requestWbsAdd: () => set(s => ({ wbsAddSignal: s.wbsAddSignal + 1 })),
  requestMasterAdd: () => set(s => ({ masterAddSignal: s.masterAddSignal + 1 })),
  setMasterSubTab: tab => set({ masterSubTab: tab }),
}))
