import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginPageMapSave,
  finishPageMapSave,
  getPageMapSaveState,
  resetPageMapSaveState,
  trackPageMapPersist,
  trackPageMapPersistAll,
} from '@/pages/automation/map/pageMapAutosaveStore'

describe('pageMapAutosaveStore', () => {
  afterEach(() => {
    resetPageMapSaveState()
    vi.useRealTimers()
  })

  it('stays saving until all overlapping batches finish', () => {
    const first = beginPageMapSave()
    const second = beginPageMapSave()
    expect(getPageMapSaveState()).toBe('saving')

    finishPageMapSave(second, true)
    expect(getPageMapSaveState()).toBe('saving')

    finishPageMapSave(first, false)
    expect(getPageMapSaveState()).toBe('saved')
  })

  it('uses latest batch result when stale completion drains the queue', () => {
    const first = beginPageMapSave()
    const second = beginPageMapSave()

    finishPageMapSave(second, true)
    expect(getPageMapSaveState()).toBe('saving')

    finishPageMapSave(first, false)
    expect(getPageMapSaveState()).toBe('saved')
  })

  it('trackPageMapPersist marks saved on success', async () => {
    const res = await trackPageMapPersist(async () => ({ status: 'success' as const }))
    expect(res.status).toBe('success')
    expect(getPageMapSaveState()).toBe('saved')
  })

  it('trackPageMapPersist marks error on failure', async () => {
    await trackPageMapPersist(async () => ({ status: 'error' as const }))
    expect(getPageMapSaveState()).toBe('error')
  })

  it('trackPageMapPersistAll requires every result to succeed', async () => {
    await trackPageMapPersistAll(async () => [
      { status: 'success' },
      { status: 'error' },
    ])
    expect(getPageMapSaveState()).toBe('error')
  })
})
