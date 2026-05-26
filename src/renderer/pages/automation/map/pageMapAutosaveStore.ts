import {
  createKeyedDebouncedPersist,
  FLOW_CANVAS_AUTOSAVE_DELAY_MS,
  FLOW_CANVAS_AUTOSAVE_MAX_WAIT_MS,
} from 'shared/debouncedPersist'

export type PageMapSaveState = 'idle' | 'saving' | 'saved' | 'error'

export type PageMapApiResult = { status: string }

let saveState: PageMapSaveState = 'idle'
const listeners = new Set<() => void>()
let fadeTimer: ReturnType<typeof setTimeout> | null = null
let saveGeneration = 0
let pendingSaveCount = 0
let latestBatchResultOk = true

function emit() {
  for (const cb of listeners) cb()
}

function scheduleFadeToIdle() {
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
  fadeTimer = setTimeout(() => {
    fadeTimer = null
    saveState = 'idle'
    emit()
  }, 2500)
}

export function getPageMapSaveState(): PageMapSaveState {
  return saveState
}

export function setPageMapSaveState(next: PageMapSaveState) {
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
  saveState = next
  emit()
  if (next === 'saved' || next === 'error') {
    scheduleFadeToIdle()
  }
}

/** Marks the start of a position persist batch; returns a generation token for finishPageMapSave. */
export function beginPageMapSave(): number {
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
  saveGeneration += 1
  pendingSaveCount += 1
  if (saveState !== 'saving') {
    saveState = 'saving'
    emit()
  }
  return saveGeneration
}

/** Completes a position persist batch; stale completions are ignored. */
export function finishPageMapSave(generation: number, ok: boolean) {
  pendingSaveCount = Math.max(0, pendingSaveCount - 1)
  if (generation === saveGeneration) {
    latestBatchResultOk = ok
  }
  if (pendingSaveCount > 0) {
    if (saveState !== 'saving') {
      saveState = 'saving'
      emit()
    }
    return
  }
  setPageMapSaveState(latestBatchResultOk ? 'saved' : 'error')
}

/** Wrap a single API persist call with autosave status tracking. */
export async function trackPageMapPersist<T extends PageMapApiResult>(work: () => Promise<T>): Promise<T> {
  const gen = beginPageMapSave()
  try {
    const res = await work()
    finishPageMapSave(gen, res.status === 'success')
    return res
  } catch (err) {
    finishPageMapSave(gen, false)
    throw err
  }
}

/** Wrap concurrent API persist calls with autosave status tracking. */
export async function trackPageMapPersistAll(work: () => Promise<PageMapApiResult[]>): Promise<PageMapApiResult[]> {
  const gen = beginPageMapSave()
  try {
    const results = await work()
    finishPageMapSave(gen, results.every(r => r.status === 'success'))
    return results
  } catch (err) {
    finishPageMapSave(gen, false)
    throw err
  }
}

export function subscribePageMapSaveState(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

const debouncedPersistWork = new Map<string, () => Promise<PageMapApiResult>>()
const debouncedPersistRunner = createKeyedDebouncedPersist(
  async key => {
    const work = debouncedPersistWork.get(key)
    if (!work) return
    debouncedPersistWork.delete(key)
    await trackPageMapPersist(work)
  },
  FLOW_CANVAS_AUTOSAVE_DELAY_MS,
  FLOW_CANVAS_AUTOSAVE_MAX_WAIT_MS,
)

/** Debounced API persist; coalesces rapid edits (resize, typing, drag batches). */
export function scheduleDebouncedPageMapPersist(
  key: string,
  work: () => Promise<PageMapApiResult>,
): void {
  debouncedPersistWork.set(key, work)
  debouncedPersistRunner.schedule(key)
}

export async function flushDebouncedPageMapPersists(key?: string): Promise<void> {
  await debouncedPersistRunner.flush(key)
}

export function cancelDebouncedPageMapPersists(): void {
  debouncedPersistWork.clear()
  debouncedPersistRunner.cancelAll()
}

export function resetPageMapSaveState() {
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
  saveGeneration += 1
  pendingSaveCount = 0
  latestBatchResultOk = true
  saveState = 'idle'
  cancelDebouncedPageMapPersists()
  emit()
}
