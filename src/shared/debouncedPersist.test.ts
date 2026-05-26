import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDebouncedPersist } from './debouncedPersist'

describe('createDebouncedPersist', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs once after delay and resets on repeated schedule (trailing)', async () => {
    vi.useFakeTimers()
    const run = vi.fn(async () => {})
    const handle = createDebouncedPersist(run, 400, 2000)

    handle.schedule()
    handle.schedule()
    handle.schedule()
    expect(run).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(399)
    expect(run).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('flush runs immediately', async () => {
    vi.useFakeTimers()
    const run = vi.fn(async () => {})
    const handle = createDebouncedPersist(run, 800, 5000)

    handle.schedule()
    await handle.flush()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('cancel prevents pending run', async () => {
    vi.useFakeTimers()
    const run = vi.fn(async () => {})
    const handle = createDebouncedPersist(run, 400, 2000)

    handle.schedule()
    handle.cancel()
    await vi.advanceTimersByTimeAsync(500)
    expect(run).not.toHaveBeenCalled()
  })
})
