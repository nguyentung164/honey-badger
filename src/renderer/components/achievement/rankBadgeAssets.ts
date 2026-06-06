import type { RankCode } from 'shared/achievementRanks'

export const RANK_BADGE_VARIANTS = ['full', 'simple', 'medal', 'avatar-ring'] as const
export type RankBadgeVariant = (typeof RANK_BADGE_VARIANTS)[number]

const VARIANT_DIR: Record<RankBadgeVariant, string> = {
  full: 'full',
  simple: 'simple',
  medal: 'medal',
  'avatar-ring': 'avatar-ring',
}

const svgModulesByVariant = {
  full: import.meta.glob<string>('../../assets/ranks/full/*.svg', {
    eager: true,
    import: 'default',
    query: '?url',
  }),
  simple: import.meta.glob<string>('../../assets/ranks/simple/*.svg', {
    eager: true,
    import: 'default',
    query: '?url',
  }),
  medal: import.meta.glob<string>('../../assets/ranks/medal/*.svg', {
    eager: true,
    import: 'default',
    query: '?url',
  }),
  'avatar-ring': import.meta.glob<string>('../../assets/ranks/avatar-ring/*.svg', {
    eager: true,
    import: 'default',
    query: '?url',
  }),
} as const satisfies Record<RankBadgeVariant, Record<string, string>>

const pngModulesByVariant = {
  full: import.meta.glob<string>('../../assets/ranks/full/*.png', {
    eager: true,
    import: 'default',
    query: '?url',
  }),
  simple: import.meta.glob<string>('../../assets/ranks/simple/*.png', {
    eager: true,
    import: 'default',
    query: '?url',
  }),
  medal: import.meta.glob<string>('../../assets/ranks/medal/*.png', {
    eager: true,
    import: 'default',
    query: '?url',
  }),
  'avatar-ring': import.meta.glob<string>('../../assets/ranks/avatar-ring/*.png', {
    eager: true,
    import: 'default',
    query: '?url',
  }),
} as const satisfies Record<RankBadgeVariant, Record<string, string>>

function moduleForRank(
  modules: Record<string, string>,
  variant: RankBadgeVariant,
  rank: RankCode,
  ext: string,
): string | undefined {
  const suffix = `/assets/ranks/${VARIANT_DIR[variant]}/${rank}.${ext}`
  const key = Object.keys(modules).find(k => k.replace(/\\/g, '/').endsWith(suffix))
  return key ? modules[key] : undefined
}

export function resolveRankBadgeSrc(rank: RankCode, variant: RankBadgeVariant = 'full'): string {
  const svgModules = svgModulesByVariant[variant]
  const pngModules = pngModulesByVariant[variant]
  return (
    moduleForRank(svgModules, variant, rank, 'svg') ??
    moduleForRank(pngModules, variant, rank, 'png') ??
    moduleForRank(pngModules, variant, 'newbie', 'png') ??
    moduleForRank(svgModulesByVariant.full, 'full', rank, 'svg') ??
    moduleForRank(pngModulesByVariant.full, 'full', rank, 'png')!
  )
}

/** Default badge art (full variant) — leaderboard, toasts, etc. */
export const RANK_BADGE_SRC: Record<RankCode, string> = {
  newbie: resolveRankBadgeSrc('newbie'),
  contributor: resolveRankBadgeSrc('contributor'),
  developer: resolveRankBadgeSrc('developer'),
  regular: resolveRankBadgeSrc('regular'),
  pro: resolveRankBadgeSrc('pro'),
  expert: resolveRankBadgeSrc('expert'),
  master: resolveRankBadgeSrc('master'),
  legend: resolveRankBadgeSrc('legend'),
  mythic: resolveRankBadgeSrc('mythic'),
}
