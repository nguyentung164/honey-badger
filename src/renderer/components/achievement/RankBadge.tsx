import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { MAX_RANK_CODE, RANK_MIN_XP, getNextRankXp as getNextRankXpFromShared, type RankCode } from 'shared/achievementRanks'
import { RANK_BADGE_SRC, resolveRankBadgeSrc, type RankBadgeVariant } from './rankBadgeAssets'

export const RANK_CONFIG = {
  newbie: {
    label: 'Newbie',
    color: 'text-amber-600 dark:text-amber-400',
    ringColor: 'ring-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/25',
    pillHoverBg: 'hover:bg-amber-100/95 dark:hover:bg-amber-900/40',
    glowClass: '',
    achievementGlowClass: 'animate-achievement-rank-glow-amber',
    emoji: '🌱',
    minXp: RANK_MIN_XP.newbie,
  },
  contributor: {
    label: 'Contributor',
    color: 'text-lime-600 dark:text-lime-400',
    ringColor: 'ring-lime-500',
    bgColor: 'bg-lime-50 dark:bg-lime-900/25',
    pillHoverBg: 'hover:bg-lime-100/95 dark:hover:bg-lime-900/40',
    glowClass: '',
    achievementGlowClass: 'animate-achievement-rank-glow-emerald',
    emoji: '🌿',
    minXp: RANK_MIN_XP.contributor,
  },
  developer: {
    label: 'Developer',
    color: 'text-teal-600 dark:text-teal-400',
    ringColor: 'ring-teal-500',
    bgColor: 'bg-teal-50 dark:bg-teal-900/25',
    pillHoverBg: 'hover:bg-teal-100/95 dark:hover:bg-teal-900/40',
    glowClass: '',
    achievementGlowClass: 'animate-achievement-rank-glow-sky',
    emoji: '💻',
    minXp: RANK_MIN_XP.developer,
  },
  regular: {
    label: 'Regular',
    color: 'text-sky-600 dark:text-sky-400',
    ringColor: 'ring-sky-500',
    bgColor: 'bg-sky-50 dark:bg-sky-900/25',
    pillHoverBg: 'hover:bg-sky-100/95 dark:hover:bg-sky-900/40',
    glowClass: '',
    achievementGlowClass: 'animate-achievement-rank-glow-blue',
    emoji: '⚡',
    minXp: RANK_MIN_XP.regular,
  },
  pro: {
    label: 'Pro',
    color: 'text-blue-600 dark:text-blue-400',
    ringColor: 'ring-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/25',
    pillHoverBg: 'hover:bg-blue-100/95 dark:hover:bg-blue-900/40',
    glowClass: 'rank-glow-violet',
    achievementGlowClass: 'animate-achievement-rank-glow-violet',
    emoji: '🔮',
    minXp: RANK_MIN_XP.pro,
  },
  expert: {
    label: 'Expert',
    color: 'text-indigo-600 dark:text-indigo-400',
    ringColor: 'ring-indigo-600',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/25',
    pillHoverBg: 'hover:bg-indigo-100/95 dark:hover:bg-indigo-900/40',
    glowClass: 'rank-glow-gold',
    achievementGlowClass: 'animate-achievement-rank-glow-amber',
    emoji: '⭐',
    minXp: RANK_MIN_XP.expert,
  },
  master: {
    label: 'Master',
    color: 'text-purple-600 dark:text-purple-400',
    ringColor: 'ring-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-900/25',
    pillHoverBg: 'hover:bg-purple-100/95 dark:hover:bg-purple-900/40',
    glowClass: 'rank-glow-rose rank-pulse',
    achievementGlowClass: 'animate-achievement-rank-glow-rose',
    emoji: '🔥',
    minXp: RANK_MIN_XP.master,
  },
  legend: {
    label: 'Legend',
    color:
      'text-transparent bg-clip-text bg-gradient-to-r from-rose-600 via-violet-600 to-blue-600 dark:from-rose-500 dark:via-violet-500 dark:to-blue-500',
    ringColor: 'ring-rose-500',
    bgColor: 'bg-gradient-to-br from-rose-50 via-violet-50 to-blue-50 dark:from-rose-900/20 dark:via-violet-900/20 dark:to-blue-900/20',
    pillHoverBg: 'hover:from-rose-100 hover:via-violet-100 hover:to-blue-100 dark:hover:from-rose-900/32 dark:hover:via-violet-900/32 dark:hover:to-blue-900/32',
    glowClass: 'rank-glow-legend',
    achievementGlowClass: 'animate-achievement-rank-glow-legend',
    emoji: '👑',
    minXp: RANK_MIN_XP.legend,
  },
  mythic: {
    label: 'Mythic',
    color:
      'text-transparent bg-clip-text bg-gradient-to-r from-amber-600 via-fuchsia-600 to-cyan-600 dark:from-amber-400 dark:via-fuchsia-500 dark:to-cyan-400',
    ringColor: 'ring-cyan-400',
    bgColor:
      'bg-gradient-to-br from-amber-100/90 via-fuchsia-100/80 to-cyan-100/90 dark:from-amber-950/45 dark:via-fuchsia-950/40 dark:to-cyan-950/45',
    pillHoverBg:
      'hover:from-amber-200/95 hover:via-fuchsia-200/90 hover:to-cyan-200/95 dark:hover:from-amber-900/55 dark:hover:via-fuchsia-900/50 dark:hover:to-cyan-900/55',
    glowClass: 'rank-glow-mythic rank-shimmer-mythic',
    achievementGlowClass: 'animate-achievement-rank-glow-mythic',
    emoji: '✨',
    minXp: RANK_MIN_XP.mythic,
  },
} as const satisfies Record<
  RankCode,
  {
    label: string
    color: string
    ringColor: string
    bgColor: string
    pillHoverBg: string
    glowClass: string
    achievementGlowClass: string
    emoji: string
    minXp: number
  }
>

export type { RankCode }
export { MAX_RANK_CODE }

const RANK_PROFILE_AURA: Partial<Record<RankCode, string>> = {
  pro: 'rank-profile-aura-violet',
  expert: 'rank-profile-aura-gold',
  master: 'rank-profile-aura-rose',
  legend: 'rank-profile-aura-legend',
  mythic: 'rank-profile-aura-mythic',
}

/** My Profile avatar — soft blurred aura (no ring box-shadow). */
export function getRankProfileAuraClass(rank: string) {
  const code = (rank in RANK_CONFIG ? rank : 'newbie') as RankCode
  return RANK_PROFILE_AURA[code] ?? ''
}

const RANK_USERNAME_EMPHASIS: readonly RankCode[] = ['pro', 'expert', 'master', 'legend', 'mythic']

export type RankUsernameClassOptions = {
  /** pro+ get font-semibold (default true) */
  emphasizeHighRanks?: boolean
  /** Reduced opacity — e.g. rank-up "previous" phase */
  muted?: boolean
  /** Animated text glow — rank-up reveal; avoid on compact UI */
  withGlow?: boolean
}

/** Username text color by rank — gradient for legend/mythic (matches rank-up dialog). */
export function getRankUsernameClass(rank: string, options: RankUsernameClassOptions = {}): string {
  const { emphasizeHighRanks = true, muted = false, withGlow = false } = options
  const code = (rank in RANK_CONFIG ? rank : 'newbie') as RankCode
  const cfg = RANK_CONFIG[code]
  const isGradient = cfg.color.includes('bg-clip-text')

  return cn(
    emphasizeHighRanks && (RANK_USERNAME_EMPHASIS as readonly string[]).includes(code) && 'font-semibold',
    muted && 'opacity-70',
    isGradient && 'inline-block',
    cfg.color,
    withGlow && cfg.achievementGlowClass
  )
}

/** Rank-up dialog rank label (previous vs new). Weight comes from dialog (`font-bold` / `font-extrabold`). */
export function getRankRevealLabelClass(code: RankCode, phase: 'prev' | 'new'): string {
  return getRankUsernameClass(code, {
    muted: phase === 'prev',
    withGlow: phase === 'new',
    emphasizeHighRanks: false,
  })
}

/** Rank demo submenu — pill background only (text color goes on the label span). */
export function getRankDemoMenuItemClass(rank: string) {
  const code = (rank in RANK_CONFIG ? rank : 'newbie') as RankCode
  const cfg = RANK_CONFIG[code]
  return cn(cfg.bgColor, cfg.pillHoverBg, 'my-0.5 rounded-sm')
}

/** Rank demo submenu label — gradient legend/mythic; must not be on the flex menu item. */
export function getRankDemoMenuLabelClass(rank: string) {
  return cn('min-w-0 truncate', getRankUsernameClass(rank))
}

interface RankBadgeProps {
  rank: string
  variant?: RankBadgeVariant
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  showLabel?: boolean
  className?: string
  noGlow?: boolean
}

interface RankAvatarRingProps {
  rank: string
  size?: 'xxs' | 'xs' | 'sm' | 'member' | 'md' | 'base' | 'lg' | 'xl' | 'profile'
  className?: string
  children: ReactNode
}

const avatarRingSizes = {
  xxs: { ring: 'h-4 w-4', inner: 'h-3.5 w-3.5' },
  xs: { ring: 'h-5 w-5', inner: 'h-[18px] w-[18px]' },
  sm: { ring: 'h-10 w-10', inner: 'h-8 w-8' },
  member: { ring: 'h-9 w-9', inner: 'h-7 w-7' },
  md: { ring: 'h-11 w-11', inner: 'h-9 w-9' },
  base: { ring: 'h-[3.25rem] w-[3.25rem]', inner: 'h-11 w-11' },
  lg: { ring: 'h-14 w-14', inner: 'h-12 w-12' },
  xl: { ring: 'h-[4.5rem] w-[4.5rem]', inner: 'h-16 w-16' },
  profile: { ring: 'h-24 w-24', inner: 'h-[5.25rem] w-[5.25rem]' },
} as const

/** Leaderboard podium: gold · silver · bronze avatar sizes */
export const PODIUM_AVATAR_RING_SIZE = ['xl', 'lg', 'base'] as const satisfies readonly (keyof typeof avatarRingSizes)[]

const avatarRingInnerClass =
  '[&_[data-slot=avatar]]:!size-full [&_[data-slot=avatar]]:shrink-0 [&_[data-slot=avatar-image]]:size-full [&_[data-slot=avatar-image]]:object-cover [&_[data-slot=avatar-fallback]]:size-full'

const sizeConfig = {
  xs: { container: 'h-5 w-5', text: 'text-[10px]', px: 20 },
  sm: { container: 'h-7 w-7', text: 'text-xs', px: 28 },
  md: { container: 'h-9 w-9', text: 'text-sm', px: 36 },
  lg: { container: 'h-14 w-14', text: 'text-base', px: 56 },
  xl: { container: 'h-32 w-32', text: 'text-lg', px: 128 },
}

export function RankAvatarRing({ rank, size = 'xs', className, children }: RankAvatarRingProps) {
  const code = (rank in RANK_BADGE_SRC ? rank : 'newbie') as RankCode
  const config = RANK_CONFIG[code] ?? RANK_CONFIG.newbie
  const sizes = avatarRingSizes[size]
  const src = resolveRankBadgeSrc(code, 'avatar-ring')

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', sizes.ring, className)}
      title={config.label}
    >
      <span className={cn('relative z-[1] overflow-hidden rounded-full', avatarRingInnerClass, sizes.inner)}>{children}</span>
      <img
        src={src}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2] size-full object-cover select-none"
        draggable={false}
      />
      <span className="sr-only">{config.label}</span>
    </span>
  )
}

export function RankBadge({ rank, variant = 'full', size = 'sm', showLabel = false, className, noGlow = false }: RankBadgeProps) {
  const code = (rank in RANK_BADGE_SRC ? rank : 'newbie') as RankCode
  const config = RANK_CONFIG[code] ?? RANK_CONFIG.newbie
  const sizes = sizeConfig[size]
  const src = resolveRankBadgeSrc(code, variant)

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn('relative inline-flex shrink-0 items-center justify-center bg-transparent', sizes.container, !noGlow && config.glowClass)}
        title={config.label}
      >
        <img
          src={src}
          alt=""
          aria-hidden
          width={sizes.px}
          height={sizes.px}
          className="max-w-none object-contain select-none pointer-events-none"
          style={{ width: sizes.px, height: sizes.px }}
          draggable={false}
        />
        <span className="sr-only">{config.label}</span>
      </span>
      {showLabel && <span className={cn('font-semibold', config.color, sizes.text)}>{config.label}</span>}
    </span>
  )
}

export function getNextRankXp(currentXp: number) {
  return getNextRankXpFromShared(currentXp)
}
