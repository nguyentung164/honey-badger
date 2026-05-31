import {
  createKeyedDebouncedPersist,
  FLOW_CANVAS_AUTOSAVE_DELAY_MS,
  FLOW_CANVAS_AUTOSAVE_MAX_WAIT_MS,
} from 'shared/debouncedPersist'
import { logPageMapAutosave, logPageMapAutosaveBatch } from '@/pages/automation/map/pageMapAutosaveDebug'

export type PageMapSaveState = 'idle' | 'saving' | 'saved' | 'error'

export type PageMapApiResult = { status: string; message?: string }

/** Minimum time the "Saving…" badge stays visible before showing Saved/Error. */
export const PAGE_MAP_SAVING_MIN_MS = 600

let saveState: PageMapSaveState = 'idle'
const listeners = new Set<() => void>()
let fadeTimer: ReturnType<typeof setTimeout> | null = null
let settleTimer: ReturnType<typeof setTimeout> | null = null
let savingVisibleSince: number | null = null
let settlingAfterSave = false
let saveGeneration = 0
let pendingSaveCount = 0
let latestBatchResultOk = true

function emit() {
  for (const cb of listeners) cb()
}

function clearSettleTimer() {
  if (settleTimer) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
  settlingAfterSave = false
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
  clearSettleTimer()
  if (next === 'saving') {
    savingVisibleSince = Date.now()
  } else if (next === 'idle') {
    savingVisibleSince = null
  }
  saveState = next
  emit()
  if (next === 'saved' || next === 'error') {
    scheduleFadeToIdle()
  }
}

function settleSaveResultState() {
  settleTimer = null
  settlingAfterSave = false
  savingVisibleSince = null
  logPageMapAutosave('badge:settled', { ok: latestBatchResultOk })
  setPageMapSaveState(latestBatchResultOk ? 'saved' : 'error')
}

function scheduleSettleSaveResultState() {
  clearSettleTimer()
  settlingAfterSave = true
  const elapsed = savingVisibleSince != null ? Date.now() - savingVisibleSince : PAGE_MAP_SAVING_MIN_MS
  const remaining = Math.max(0, PAGE_MAP_SAVING_MIN_MS - elapsed)
  if (remaining > 0) {
    settleTimer = setTimeout(settleSaveResultState, remaining)
    return
  }
  settleSaveResultState()
}

/** Marks the start of a position persist batch; returns a generation token for finishPageMapSave. */
export function beginPageMapSave(): number {
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
  const wasSettling = settlingAfterSave
  clearSettleTimer()
  saveGeneration += 1
  pendingSaveCount += 1
  logPageMapAutosave('badge:saving', { generation: saveGeneration, pendingSaveCount })
  if (saveState !== 'saving' || wasSettling) {
    savingVisibleSince = Date.now()
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
    logPageMapAutosave('batch:finish:pending', { generation, ok, pendingSaveCount })
    if (saveState !== 'saving') {
      savingVisibleSince = Date.now()
      saveState = 'saving'
      emit()
    }
    return
  }
  scheduleSettleSaveResultState()
}

/** Wrap a single API persist call with autosave status tracking. */
export async function trackPageMapPersist<T extends PageMapApiResult>(work: () => Promise<T>): Promise<T> {
  const trace = logPageMapAutosaveBatch('persist', 'trackPageMapPersist')
  const gen = beginPageMapSave()
  try {
    const res = await work()
    finishPageMapSave(gen, res.status === 'success')
    trace.done({ status: res.status })
    return res
  } catch (err) {
    finishPageMapSave(gen, false)
    trace.done({ status: 'error', error: String(err) })
    throw err
  }
}

/** Wrap concurrent API persist calls with autosave status tracking. */
export async function trackPageMapPersistAll(work: () => Promise<PageMapApiResult[]>): Promise<PageMapApiResult[]> {
  const trace = logPageMapAutosaveBatch('persistAll', 'trackPageMapPersistAll')
  const gen = beginPageMapSave()
  try {
    const results = await work()
    const ok = results.every(r => r.status === 'success')
    finishPageMapSave(gen, ok)
    trace.done({ apiCallCount: results.length, ok })
    return results
  } catch (err) {
    finishPageMapSave(gen, false)
    trace.done({ status: 'error', error: String(err) })
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
    logPageMapAutosave('debounced:flush', { key })
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
  logPageMapAutosave('debounced:schedule', { key })
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
  clearSettleTimer()
  saveGeneration += 1
  pendingSaveCount = 0
  latestBatchResultOk = true
  savingVisibleSince = null
  saveState = 'idle'
  cancelDebouncedPageMapPersists()
  emit()
}
