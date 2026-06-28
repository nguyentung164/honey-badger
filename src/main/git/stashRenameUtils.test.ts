import { describe, expect, it } from 'vitest'
import { getStashDropIndexAfterRenameStore, isStashRenameNoOp } from './stashRenameUtils'

describe('getStashDropIndexAfterRenameStore', () => {
  it('returns n+1 for stash@{0} when only one stash exists', () => {
    expect(getStashDropIndexAfterRenameStore(0)).toBe(1)
  })

  it('returns n+1 for stash@{2} in a multi-stash list', () => {
    expect(getStashDropIndexAfterRenameStore(2)).toBe(3)
  })

  it('throws for negative index', () => {
    expect(() => getStashDropIndexAfterRenameStore(-1)).toThrow('Invalid stash index')
  })

  it('throws for non-integer index', () => {
    expect(() => getStashDropIndexAfterRenameStore(1.5)).toThrow('Invalid stash index')
  })
})

describe('isStashRenameNoOp', () => {
  it('returns true when messages match after trim', () => {
    expect(isStashRenameNoOp('  WIP login  ', 'WIP login')).toBe(true)
  })

  it('returns false when messages differ', () => {
    expect(isStashRenameNoOp('WIP login', 'WIP checkout')).toBe(false)
  })

  it('returns false when new message is empty (trimmed)', () => {
    expect(isStashRenameNoOp('WIP login', '   ')).toBe(false)
  })
})
