import { useEffect, useState } from 'react'
import { useConfigurationStore } from '@/stores/useConfigurationStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

const NOTIFICATION_SOUND_EVENT = 'notification-sound-playing'

let currentPlayingAudio: HTMLAudioElement | null = null

function dispatchPlayingState(playing: boolean): void {
  window.dispatchEvent(new CustomEvent(NOTIFICATION_SOUND_EVENT, { detail: playing }))
}

export function stopNotificationSound(): void {
  if (currentPlayingAudio) {
    try {
      currentPlayingAudio.pause()
      currentPlayingAudio.currentTime = 0
    } catch {
      // ignore
    }
    currentPlayingAudio = null
    dispatchPlayingState(false)
  }
}

function playSound(url: string): void {
  stopNotificationSound()
  try {
    const audio = new Audio(url)
    audio.volume = 0.5
    audio.addEventListener('ended', () => {
      currentPlayingAudio = null
      dispatchPlayingState(false)
    })
    currentPlayingAudio = audio
    dispatchPlayingState(true)
    audio.play().catch(() => {
      currentPlayingAudio = null
      dispatchPlayingState(false)
    })
  } catch {
    // ignore
  }
}

function getFallbackSoundUrl(): string {
  try {
    return new URL('notification.wav', window.location.href).href
  } catch {
    return '/notification.wav'
  }
}

export function useNotificationSound() {
  const user = useTaskAuthStore(s => s.user)
  const playNotificationSound = useConfigurationStore(s => s.playNotificationSound ?? true)
  const notificationSoundPath = useConfigurationStore(s => s.notificationSoundPath ?? '')
  const [resolvedSoundUrl, setResolvedSoundUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!window.api?.system) return
    let cancelled = false
    if (notificationSoundPath?.trim()) {
      window.api.system
        .get_notification_sound_url(notificationSoundPath)
        .then(url => {
          if (!cancelled) setResolvedSoundUrl(url)
        })
        .catch(() => {
          if (!cancelled) setResolvedSoundUrl(null)
        })
    } else {
      window.api.system
        .get_default_notification_sound_url()
        .then(url => {
          if (!cancelled) setResolvedSoundUrl(url)
        })
        .catch(() => {
          if (!cancelled) setResolvedSoundUrl(null)
        })
    }
    return () => {
      cancelled = true
    }
  }, [notificationSoundPath])

  useEffect(() => {
    if (!window.api?.on || !window.api?.removeListener) return
    const handler = (
      _event: unknown,
      payload: { targetUserId: string; title: string; body: string; type?: string }
    ) => {
      if (user?.id !== payload.targetUserId) return
      if (!playNotificationSound) return
      const url = resolvedSoundUrl ?? getFallbackSoundUrl()
      playSound(url)
    }

    window.api.on('task:notification', handler)
    return () => window.api.removeListener('task:notification', handler)
  }, [user?.id, playNotificationSound, resolvedSoundUrl])
}

export { NOTIFICATION_SOUND_EVENT }

export async function playNotificationSoundTest(notificationSoundPath: string): Promise<void> {
  if (!window.api?.system) return
  const url = notificationSoundPath?.trim()
    ? await window.api.system.get_notification_sound_url(notificationSoundPath)
    : await window.api.system.get_default_notification_sound_url()
  const soundUrl = url ?? getFallbackSoundUrl()
  playSound(soundUrl)
}
