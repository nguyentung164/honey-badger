import { create } from 'zustand'

type ShowLogSessionState = {
  gitLogRevision: string | null
  setGitLogRevision: (ref: string | null) => void
  resetLogSession: () => void
}

export const useShowLogSessionStore = create<ShowLogSessionState>(set => ({
  gitLogRevision: null,
  setGitLogRevision: ref => set({ gitLogRevision: ref }),
  resetLogSession: () => set({ gitLogRevision: null }),
}))
