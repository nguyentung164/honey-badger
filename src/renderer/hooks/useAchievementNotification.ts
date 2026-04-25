import { useEffect } from 'react'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'
import { useAchievementStore } from '@/stores/useAchievementStore'

export interface AchievementNotificationPayload {
  code: string
  tier: string
  xpReward: number
  earnedCount: number
}

export interface RankUpNotificationPayload {
  newRank: string
}

export interface AchievementToastItem {
  id: string
  type: 'achievement' | 'rank_up'
  title: string
  payload: AchievementNotificationPayload | RankUpNotificationPayload
  timestamp: number
}

type ToastCallback = (item: AchievementToastItem) => void

let toastCallback: ToastCallback | null = null

export function registerAchievementToastCallback(cb: ToastCallback) {
  toastCallback = cb
}

export function useAchievementNotification() {
  const fetchAll = useAchievementStore(s => s.fetchAll)
  const currentUserId = useTaskAuthStore(s => s.user?.id)

  useEffect(() => {
    const handleNotification = (_event: any, data: { targetUserId: string; title: string; body: string; type?: string }) => {
      const type = data.type as string
      if (type !== 'achievement_unlocked' && type !== 'rank_up') return
      // Chỉ hiển thị toast cho đúng user đang đăng nhập
      if (currentUserId && data.targetUserId !== currentUserId) return

      try {
        const payload = JSON.parse(data.body || '{}')
        const toastItem: AchievementToastItem = {
          id: `${type}-${Date.now()}-${Math.random()}`,
          type: type === 'rank_up' ? 'rank_up' : 'achievement',
          title: data.title,
          payload,
          timestamp: Date.now(),
        }
        toastCallback?.(toastItem)
        // Refresh stats after achievement
        setTimeout(() => fetchAll(), 500)
      } catch {
        // ignore parse errors
      }
    }

    window.api.on('task:notification', handleNotification)
    return () => {
      window.api.removeListener('task:notification', handleNotification)
    }
  }, [fetchAll, currentUserId])
}
