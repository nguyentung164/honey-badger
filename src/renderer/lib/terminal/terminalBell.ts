let bellAudio: HTMLAudioElement | null = null

export async function playTerminalBell(): Promise<void> {
  try {
    if (!bellAudio) {
      const url = await window.api.system.get_default_notification_sound_url()
      if (url) {
        bellAudio = new Audio(url)
        bellAudio.volume = 0.35
      }
    }
    if (bellAudio) {
      bellAudio.currentTime = 0
      await bellAudio.play()
      return
    }
  } catch {
    // fallback below
  }

  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.value = 0.08
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.12)
    oscillator.onended = () => void ctx.close()
  } catch {
    // ignore
  }
}
