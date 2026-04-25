import { create } from 'zustand'

const SELECTED_PROJECT_STORAGE_KEY = 'selected-project-id'

function getStored(): string | null {
  if (typeof window === 'undefined') return null
  const v = localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY)
  return v && v.trim() ? v : null
}

type SelectedProjectStore = {
  selectedProjectId: string | null
  setSelectedProjectId: (id: string | null) => void
}

export const useSelectedProjectStore = create<SelectedProjectStore>(set => ({
  selectedProjectId: getStored(),
  setSelectedProjectId: (id: string | null) => {
    const value = id ?? ''
    if (typeof window !== 'undefined') localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, value)
    set({ selectedProjectId: id && id.trim() ? id : null })
  },
}))
