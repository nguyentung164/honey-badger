import { create } from 'zustand'

export const TASK_AUTH_STORAGE_KEY = 'honey-badger-task-auth'

export interface TaskAuthUser {
  id: string
  userCode: string
  name: string
  role: string
  avatarUrl?: string | null
}

interface TaskAuthState {
  token: string | null
  user: TaskAuthUser | null
  isGuest: boolean
  setSession: (token: string, user: TaskAuthUser) => void
  clearSession: () => void
  setGuestMode: (value: boolean) => void
  verifySession: () => Promise<boolean>
}

function getInitialState(): Pick<TaskAuthState, 'token' | 'user' | 'isGuest'> {
  try {
    const raw = localStorage.getItem(TASK_AUTH_STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw) as { token: string | null; user: TaskAuthUser | null; isGuest?: boolean }
      return {
        token: data.token ?? null,
        user: data.user ?? null,
        isGuest: data.isGuest ?? false,
      }
    }
  } catch {
    // ignore parse errors
  }
  return { token: null, user: null, isGuest: false }
}

const initialState = getInitialState()

export const useTaskAuthStore = create<TaskAuthState>(set => ({
  ...initialState,

  setSession: (token, user) => {
    const state = { token, user, isGuest: false }
    set(state)
    try {
      localStorage.setItem(TASK_AUTH_STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore
    }
  },

  clearSession: () => {
    set({ token: null, user: null, isGuest: false })
    try {
      localStorage.removeItem(TASK_AUTH_STORAGE_KEY)
    } catch {
      // ignore
    }
  },

  setGuestMode: (value: boolean) => {
    if (value) {
      const state = { token: null, user: null, isGuest: true }
      set(state)
      try {
        localStorage.setItem(TASK_AUTH_STORAGE_KEY, JSON.stringify(state))
      } catch {
        // ignore
      }
    } else {
      const state = { token: null, user: null, isGuest: false }
      set(state)
      try {
        localStorage.setItem(TASK_AUTH_STORAGE_KEY, JSON.stringify(state))
      } catch {
        // ignore
      }
    }
  },

  verifySession: async () => {
    try {
      const res = await window.api.user.getCurrentUser()
      if (res.status === 'success' && res.data?.user) {
        const token = res.data.token ?? null
        const user = res.data.user
        const state = { token, user, isGuest: false }
        set(state)
        try {
          localStorage.setItem(TASK_AUTH_STORAGE_KEY, JSON.stringify(state))
        } catch {
          // ignore
        }
        return true
      }
      set({ token: null, user: null, isGuest: false })
      try {
        localStorage.removeItem(TASK_AUTH_STORAGE_KEY)
      } catch {
        // ignore
      }
      return false
    } catch {
      set({ token: null, user: null, isGuest: false })
      try {
        localStorage.removeItem(TASK_AUTH_STORAGE_KEY)
      } catch {
        // ignore
      }
      return false
    }
  },
}))
