import { create } from 'zustand'

type MultiRepoEffectiveStore = {
  paths: string[]
  labels: string[]
  setEffective: (paths: string[], labels: string[]) => void
}

export const useMultiRepoEffectiveStore = create<MultiRepoEffectiveStore>(set => ({
  paths: [],
  labels: [],
  setEffective: (paths: string[], labels: string[]) => set({ paths, labels }),
}))
