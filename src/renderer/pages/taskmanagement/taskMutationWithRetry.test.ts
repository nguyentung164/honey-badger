import { describe, expect, it, vi } from 'vitest'
import { runTaskMutationWithRetry, updateTaskPlanDatesWithRetry, updateTaskStatusWithRetry } from './taskMutationWithRetry'

describe('runTaskMutationWithRetry', () => {
  it('returns server version on first success', async () => {
    const mutate = vi.fn().mockResolvedValue({ status: 'success', data: { version: 4 } })
    const getTask = vi.fn()

    const result = await runTaskMutationWithRetry(3, { mutate, getTask })

    expect(result).toEqual({ ok: true, version: 4 })
    expect(mutate).toHaveBeenCalledWith(3)
    expect(getTask).not.toHaveBeenCalled()
  })
})

describe('updateTaskStatusWithRetry', () => {
  it('retries once after version conflict', async () => {
    const updateStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: 'error', code: 'VERSION_CONFLICT' })
      .mockResolvedValueOnce({ status: 'success', data: { version: 8 } })
    const getTask = vi.fn().mockResolvedValue({
      status: 'success',
      data: { status: 'in_progress', version: 7 },
    })

    const result = await updateTaskStatusWithRetry({ updateStatus, getTask }, 't1', 'done', 5)

    expect(result).toEqual({ ok: true, version: 8 })
    expect(updateStatus).toHaveBeenLastCalledWith('t1', 'done', 7)
  })
})

describe('updateTaskPlanDatesWithRetry', () => {
  it('treats matching plan dates as already applied', async () => {
    const updateDates = vi.fn().mockResolvedValue({ status: 'error', code: 'VERSION_CONFLICT' })
    const getTask = vi.fn().mockResolvedValue({
      status: 'success',
      data: { planStartDate: '2026-01-01', planEndDate: '2026-01-10', version: 3 },
    })

    const result = await updateTaskPlanDatesWithRetry(
      { updateDates, getTask },
      't1',
      '2026-01-01',
      '2026-01-10',
      2
    )

    expect(result).toEqual({ ok: true, version: 3, alreadyApplied: true })
    expect(updateDates).toHaveBeenCalledOnce()
  })
})
