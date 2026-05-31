import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginPageMapSave,
  finishPageMapSave,
  getPageMapSaveState,
  PAGE_MAP_SAVING_MIN_MS,
  resetPageMapSaveState,
  trackPageMapPersist,
  trackPageMapPersistAll,
} from '@/pages/automation/map/pageMapAutosaveStore'

describe('pageMapAutosaveStore', () => {
  afterEach(() => {
    resetPageMapSaveState()
    vi.useRealTimers()
  })

  it('stays saving until all overlapping batches finish', async () => {
    vi.useFakeTimers()
    const first = beginPageMapSave()
    const second = beginPageMapSave()
    expect(getPageMapSaveState()).toBe('saving')

    finishPageMapSave(second, true)
    expect(getPageMapSaveState()).toBe('saving')

    finishPageMapSave(first, false)
    expect(getPageMapSaveState()).toBe('saving')
    await vi.advanceTimersByTimeAsync(PAGE_MAP_SAVING_MIN_MS)
    expect(getPageMapSaveState()).toBe('saved')
  })

  it('uses latest batch result when stale completion drains the queue', async () => {
    vi.useFakeTimers()
    const first = beginPageMapSave()
    const second = beginPageMapSave()

    finishPageMapSave(second, true)
    expect(getPageMapSaveState()).toBe('saving')

    finishPageMapSave(first, false)
    expect(getPageMapSaveState()).toBe('saving')
    await vi.advanceTimersByTimeAsync(PAGE_MAP_SAVING_MIN_MS)
    expect(getPageMapSaveState()).toBe('saved')
  })

  it('keeps saving visible for a minimum duration after a fast API response', async () => {
    vi.useFakeTimers()
    const promise = trackPageMapPersist(async () => ({ status: 'success' as const }))
    await Promise.resolve()
    expect(getPageMapSaveState()).toBe('saving')

    await vi.advanceTimersByTimeAsync(PAGE_MAP_SAVING_MIN_MS - 1)
    expect(getPageMapSaveState()).toBe('saving')

    await vi.advanceTimersByTimeAsync(1)
    await promise
    expect(getPageMapSaveState()).toBe('saved')
  })

  it('trackPageMapPersist marks saved on success', async () => {
    vi.useFakeTimers()
    const promise = trackPageMapPersist(async () => ({ status: 'success' as const }))
    await vi.advanceTimersByTimeAsync(PAGE_MAP_SAVING_MIN_MS)
    await promise
    expect(getPageMapSaveState()).toBe('saved')
  })

  it('trackPageMapPersist marks error on failure', async () => {
    vi.useFakeTimers()
    const promise = trackPageMapPersist(async () => ({ status: 'error' as const }))
    await vi.advanceTimersByTimeAsync(PAGE_MAP_SAVING_MIN_MS)
    await promise
    expect(getPageMapSaveState()).toBe('error')
  })

  it('trackPageMapPersistAll requires every result to succeed', async () => {
    vi.useFakeTimers()
    const promise = trackPageMapPersistAll(async () => [
      { status: 'success' },
      { status: 'error' },
    ])
    await vi.advanceTimersByTimeAsync(PAGE_MAP_SAVING_MIN_MS)
    await promise
    expect(getPageMapSaveState()).toBe('error')
  })
})
