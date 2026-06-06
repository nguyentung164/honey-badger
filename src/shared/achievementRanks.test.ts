import { describe, expect, it } from 'vitest'
import { ACHIEVEMENT_RANKS, calculateRank, getNextRankXp, MAX_RANK_CODE, MAX_RANK_MIN_XP } from './achievementRanks'

describe('achievementRanks', () => {
  it('has 9 ranks with mythic as max', () => {
    expect(ACHIEVEMENT_RANKS).toHaveLength(9)
    expect(MAX_RANK_CODE).toBe('mythic')
    expect(MAX_RANK_MIN_XP).toBe(150_000)
  })

  it('calculateRank returns mythic at 150k+', () => {
    expect(calculateRank(149_999)).toBe('legend')
    expect(calculateRank(150_000)).toBe('mythic')
    expect(calculateRank(500_000)).toBe('mythic')
  })

  it('getNextRankXp progresses toward mythic', () => {
    expect(getNextRankXp(80_000)).toEqual({ nextRank: 'mythic', nextXp: 150_000, progress: expect.any(Number) })
    expect(getNextRankXp(150_000)).toEqual({ nextRank: 'mythic', nextXp: 150_000, progress: 100 })
  })
})
