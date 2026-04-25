import { useNotificationSound } from '@/hooks/useNotificationSound'

export function NotificationSoundProvider() {
  useNotificationSound()
  return null
}
