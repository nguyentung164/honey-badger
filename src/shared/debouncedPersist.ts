import debounce from 'lodash/debounce'

/** Trailing debounce delay for flow-canvas autosave (industry common: 500–1000 ms). */
export const FLOW_CANVAS_AUTOSAVE_DELAY_MS = 800

/** Force a save if edits never pause (prevents unbounded defer during continuous drag). */
export const FLOW_CANVAS_AUTOSAVE_MAX_WAIT_MS = 5000

export type DebouncedPersistHandle = {
  schedule: () => void
  flush: () => Promise<void>
  cancel: () => void
}

/**
 * Trailing debounce with maxWait and in-flight coalescing.
 * Each `schedule()` resets the idle timer; `flush()` runs immediately (e.g. navigation).
 */
export function createDebouncedPersist(
  run: () => void | Promise<void>,
  delayMs: number = FLOW_CANVAS_AUTOSAVE_DELAY_MS,
  maxWaitMs: number = FLOW_CANVAS_AUTOSAVE_MAX_WAIT_MS,
): DebouncedPersistHandle {
  let inFlight: Promise<void> | null = null
  let queued = false

  const execute = async (): Promise<void> => {
    if (inFlight) {
      queued = true
      return inFlight
    }
    inFlight = (async () => {
      do {
        queued = false
        await run()
      } while (queued)
    })().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  const debounced = debounce(
    () => {
      void execute()
    },
    delayMs,
    { maxWait: maxWaitMs },
  )

  return {
    schedule: () => debounced(),
    flush: async () => {
      debounced.cancel()
      await execute()
    },
    cancel: () => {
      debounced.cancel()
      queued = false
    },
  }
}

export type KeyedDebouncedPersistHandle = {
  schedule: (key: string) => void
  flush: (key?: string) => Promise<void>
  cancelAll: () => void
}

/** Per-key trailing debounce; latest work function wins for each key. */
export function createKeyedDebouncedPersist(
  run: (key: string) => void | Promise<void>,
  delayMs: number = FLOW_CANVAS_AUTOSAVE_DELAY_MS,
  maxWaitMs: number = FLOW_CANVAS_AUTOSAVE_MAX_WAIT_MS,
): KeyedDebouncedPersistHandle {
  const handles = new Map<string, DebouncedPersistHandle>()

  const schedule = (key: string) => {
    let handle = handles.get(key)
    if (!handle) {
      handle = createDebouncedPersist(() => run(key), delayMs, maxWaitMs)
      handles.set(key, handle)
    }
    handle.schedule()
  }

  const flush = async (key?: string) => {
    if (key) {
      await handles.get(key)?.flush()
      return
    }
    await Promise.all([...handles.values()].map(h => h.flush()))
  }

  const cancelAll = () => {
    for (const handle of handles.values()) handle.cancel()
    handles.clear()
  }

  return { schedule, flush, cancelAll }
}
