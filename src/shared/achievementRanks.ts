export const ACHIEVEMENT_RANKS = [
  { code: 'newbie', minXp: 0, name: 'Newbie' },
  { code: 'contributor', minXp: 200, name: 'Contributor' },
  { code: 'developer', minXp: 800, name: 'Developer' },
  { code: 'regular', minXp: 2000, name: 'Regular' },
  { code: 'pro', minXp: 5000, name: 'Pro' },
  { code: 'expert', minXp: 12000, name: 'Expert' },
  { code: 'master', minXp: 30000, name: 'Master' },
  { code: 'legend', minXp: 70000, name: 'Legend' },
  { code: 'mythic', minXp: 150_000, name: 'Mythic' },
] as const

export type RankCode = (typeof ACHIEVEMENT_RANKS)[number]['code']
export type AchievementRankDef = (typeof ACHIEVEMENT_RANKS)[number]

export const MAX_RANK_CODE: RankCode = ACHIEVEMENT_RANKS[ACHIEVEMENT_RANKS.length - 1].code
export const MAX_RANK_MIN_XP = ACHIEVEMENT_RANKS[ACHIEVEMENT_RANKS.length - 1].minXp

export const RANK_MIN_XP = Object.fromEntries(ACHIEVEMENT_RANKS.map(r => [r.code, r.minXp])) as Record<RankCode, number>

export function calculateRank(xp: number): RankCode {
  let rank: RankCode = ACHIEVEMENT_RANKS[0].code
  for (const r of ACHIEVEMENT_RANKS) {
    if (xp >= r.minXp) rank = r.code
  }
  return rank
}

export function getNextRankXp(currentXp: number): { nextRank: RankCode; nextXp: number; progress: number } {
  if (currentXp >= MAX_RANK_MIN_XP) {
    return { nextRank: MAX_RANK_CODE, nextXp: MAX_RANK_MIN_XP, progress: 100 }
  }

  for (let i = 0; i < ACHIEVEMENT_RANKS.length - 1; i++) {
    const curr = ACHIEVEMENT_RANKS[i]
    const next = ACHIEVEMENT_RANKS[i + 1]
    if (currentXp >= curr.minXp && currentXp < next.minXp) {
      const progress = ((currentXp - curr.minXp) / (next.minXp - curr.minXp)) * 100
      return { nextRank: next.code, nextXp: next.minXp, progress: Math.min(100, progress) }
    }
  }

  return { nextRank: MAX_RANK_CODE, nextXp: MAX_RANK_MIN_XP, progress: 100 }
}
