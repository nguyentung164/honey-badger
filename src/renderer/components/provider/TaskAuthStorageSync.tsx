'use client'

import { useEffect } from 'react'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import type { TaskAuthUser } from '@/stores/useTaskAuthStore'
import { TASK_AUTH_STORAGE_KEY, useTaskAuthStore } from '@/stores/useTaskAuthStore'

/**
 * Listens for storage events from other windows (e.g. Main window login/logout)
 * and syncs auth state to this window's store.
 * Storage event only fires in windows other than the one that made the change.
 */
export function TaskAuthStorageSync() {
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== TASK_AUTH_STORAGE_KEY) return
      if (e.newValue) {
        try {
          const data = JSON.parse(e.newValue) as {
            token: string | null
            user: TaskAuthUser | null
            isGuest?: boolean
          }
          useTaskAuthStore.setState({
            token: data.token ?? null,
            user: data.user ?? null,
            isGuest: data.isGuest ?? false,
          })
        } catch {
          // ignore parse errors
        }
      } else {
        useTaskAuthStore.setState({ token: null, user: null, isGuest: false })
        // Chỉ patch multiRepo — không saveConfigurationConfig (cửa sổ này có thể chưa load config → snapshot rỗng ghi đè file).
        useConfigurationStore.getState().setFieldConfiguration('multiRepoEnabled', false)
        window.api.configuration.patch({ multiRepoEnabled: false }).catch(() => {})
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])
  return null
}
