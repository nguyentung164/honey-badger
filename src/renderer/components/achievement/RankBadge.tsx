import { cn } from '@/lib/utils'

export const RANK_CONFIG = {
  newbie: {
    label: 'Newbie',
    color: 'text-slate-400',
    ringColor: 'ring-slate-400',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    pillHoverBg: 'hover:bg-slate-200/90 dark:hover:bg-slate-700/90',
    glowClass: '',
    achievementGlowClass: 'animate-achievement-rank-glow-gray',
    emoji: '🌱',
    minXp: 0,
  },
  contributor: {
    label: 'Contributor',
    color: 'text-emerald-500',
    ringColor: 'ring-emerald-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/30',
    pillHoverBg: 'hover:bg-emerald-100/95 dark:hover:bg-emerald-900/45',
    glowClass: '',
    achievementGlowClass: 'animate-achievement-rank-glow-emerald',
    emoji: '🌿',
    minXp: 200,
  },
  developer: {
    label: 'Developer',
    color: 'text-sky-500',
    ringColor: 'ring-sky-500',
    bgColor: 'bg-sky-50 dark:bg-sky-900/30',
    pillHoverBg: 'hover:bg-sky-100/95 dark:hover:bg-sky-900/45',
    glowClass: '',
    achievementGlowClass: 'animate-achievement-rank-glow-sky',
    emoji: '💻',
    minXp: 800,
  },
  regular: {
    label: 'Regular',
    color: 'text-blue-500',
    ringColor: 'ring-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-900/30',
    pillHoverBg: 'hover:bg-blue-100/95 dark:hover:bg-blue-900/45',
    glowClass: '',
    achievementGlowClass: 'animate-achievement-rank-glow-blue',
    emoji: '⚡',
    minXp: 2000,
  },
  pro: {
    label: 'Pro',
    color: 'text-violet-500',
    ringColor: 'ring-violet-500',
    bgColor: 'bg-violet-50 dark:bg-violet-900/30',
    pillHoverBg: 'hover:bg-violet-100/95 dark:hover:bg-violet-900/45',
    glowClass: 'rank-glow-violet',
    achievementGlowClass: 'animate-achievement-rank-glow-violet',
    emoji: '🔮',
    minXp: 5000,
  },
  expert: {
    label: 'Expert',
    color: 'text-amber-500',
    ringColor: 'ring-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-900/30',
    pillHoverBg: 'hover:bg-amber-100/95 dark:hover:bg-amber-900/45',
    glowClass: 'rank-glow-gold',
    achievementGlowClass: 'animate-achievement-rank-glow-amber',
    emoji: '⭐',
    minXp: 12000,
  },
  master: {
    label: 'Master',
    color: 'text-rose-500',
    ringColor: 'ring-rose-500',
    bgColor: 'bg-rose-50 dark:bg-rose-900/30',
    pillHoverBg: 'hover:bg-rose-100/95 dark:hover:bg-rose-900/45',
    glowClass: 'rank-glow-rose rank-pulse',
    achievementGlowClass: 'animate-achievement-rank-glow-rose',
    emoji: '🔥',
    minXp: 30000,
  },
  legend: {
    label: 'Legend',
    color: 'text-transparent bg-clip-text bg-gradient-to-r from-rose-500 via-violet-500 to-blue-500',
    ringColor: 'ring-rose-500',
    bgColor: 'bg-gradient-to-br from-rose-50 via-violet-50 to-blue-50 dark:from-rose-900/20 dark:via-violet-900/20 dark:to-blue-900/20',
    pillHoverBg:
      'hover:from-rose-100 hover:via-violet-100 hover:to-blue-100 dark:hover:from-rose-900/32 dark:hover:via-violet-900/32 dark:hover:to-blue-900/32',
    glowClass: 'rank-glow-legend rank-shimmer',
    achievementGlowClass: 'animate-achievement-rank-glow-legend',
    emoji: '👑',
    minXp: 70000,
  },
} as const

export type RankCode = keyof typeof RANK_CONFIG

interface RankBadgeProps {
  rank: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
  noGlow?: boolean
}

const sizeConfig = {
  xs: { container: 'h-4 w-4 text-[10px]', text: 'text-[10px]' },
  sm: { container: 'h-6 w-6 text-xs', text: 'text-xs' },
  md: { container: 'h-8 w-8 text-sm', text: 'text-sm' },
  lg: { container: 'h-12 w-12 text-lg', text: 'text-base' },
}

export function RankBadge({ rank, size = 'sm', showLabel = false, className, noGlow = false }: RankBadgeProps) {
  const config = RANK_CONFIG[rank as RankCode] ?? RANK_CONFIG.newbie
  const sizes = sizeConfig[size]

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full',
          config.bgColor,
          !noGlow && config.glowClass,
          sizes.container
        )}
        title={config.label}
      >
        <span role="img" aria-label={config.label} style={{ fontSize: size === 'lg' ? 20 : size === 'md' ? 14 : size === 'sm' ? 10 : 8 }}>
          {config.emoji}
        </span>
      </span>
      {showLabel && (
        <span className={cn('font-semibold', config.color, sizes.text)}>
          {config.label}
        </span>
      )}
    </span>
  )
}

export function getNextRankXp(currentXp: number): { nextRank: string; nextXp: number; progress: number } {
  const legendMinXp = RANK_CONFIG.legend.minXp

  /* At or beyond max rank — always full */
  if (currentXp >= legendMinXp) {
    return { nextRank: 'legend', nextXp: legendMinXp, progress: 100 }
  }

  const ranks = Object.entries(RANK_CONFIG).sort((a, b) => a[1].minXp - b[1].minXp)
  for (let i = 0; i < ranks.length - 1; i++) {
    const [, curr] = ranks[i]
    const [nextCode, next] = ranks[i + 1]
    if (currentXp >= curr.minXp && currentXp < next.minXp) {
      const progress = ((currentXp - curr.minXp) / (next.minXp - curr.minXp)) * 100
      return { nextRank: nextCode, nextXp: next.minXp, progress: Math.min(100, progress) }
    }
  }

  /* Fallback: should not reach here, but guard anyway */
  return { nextRank: 'legend', nextXp: legendMinXp, progress: 100 }
}
