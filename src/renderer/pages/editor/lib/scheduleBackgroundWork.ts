type BackgroundWorkOptions = {
  /** Max wait before running even if the main thread stays busy (ms). */
  timeout?: number
}

/**
 * Run work off the critical path — after paint / when the browser is idle.
 */
export function scheduleBackgroundWork(work: () => void, options: BackgroundWorkOptions = {}): () => void {
  const { timeout = 2000 } = options

  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(work, { timeout })
    return () => cancelIdleCallback(id)
  }

  const timer = window.setTimeout(work, 16)
  return () => window.clearTimeout(timer)
}

/**
 * Coalesce rapid callbacks (e.g. LSP didChange, localStorage) into one idle flush.
 */
export function createBackgroundFlusher<T>(flush: (value: T) => void, delayMs = 120) {
  let timer: number | null = null
  let pending: T | null = null
  let cancelIdle: (() => void) | null = null

  const runFlush = () => {
    timer = null
    cancelIdle?.()
    cancelIdle = null
    const value = pending
    pending = null
    if (value != null) flush(value)
  }

  return {
    push(value: T) {
      pending = value
      if (timer) return
      timer = window.setTimeout(() => {
        cancelIdle = scheduleBackgroundWork(runFlush, { timeout: 1500 })
      }, delayMs)
    },
    /** Write the latest pending value immediately (e.g. app close). */
    flush() {
      if (timer) window.clearTimeout(timer)
      timer = null
      cancelIdle?.()
      cancelIdle = null
      if (pending == null) return
      const value = pending
      pending = null
      flush(value)
    },
    cancel() {
      if (timer) window.clearTimeout(timer)
      timer = null
      cancelIdle?.()
      cancelIdle = null
      pending = null
    },
  }
}
