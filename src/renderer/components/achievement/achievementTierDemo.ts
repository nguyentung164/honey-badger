import { cn } from '@/lib/utils'

const ACHIEVEMENT_TIER_DEMO = {
  bronze: {
    item: 'bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100/95 dark:hover:bg-orange-900/45',
    label: 'font-semibold text-orange-700 dark:text-orange-400',
    tier: 'text-orange-600/80 dark:text-orange-400/80',
  },
  silver: {
    item: 'bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100/95 dark:hover:bg-slate-800/50',
    label: 'font-semibold text-slate-600 dark:text-slate-300',
    tier: 'text-slate-500/80 dark:text-slate-400/80',
  },
  gold: {
    item: 'bg-yellow-50 dark:bg-yellow-950/35 hover:bg-yellow-100/95 dark:hover:bg-yellow-900/40',
    label: 'font-semibold text-yellow-700 dark:text-yellow-400',
    tier: 'text-yellow-600/80 dark:text-yellow-400/80',
  },
  special: {
    item: 'bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100/95 dark:hover:bg-violet-900/45',
    label: 'font-semibold text-violet-700 dark:text-violet-400',
    tier: 'text-violet-600/80 dark:text-violet-400/80',
  },
  negative: {
    item: 'bg-red-50 dark:bg-red-950/40 hover:bg-red-100/95 dark:hover:bg-red-900/45',
    label: 'font-semibold text-red-700 dark:text-red-400',
    tier: 'text-red-600/80 dark:text-red-400/80',
  },
} as const

type AchievementDemoTier = keyof typeof ACHIEVEMENT_TIER_DEMO

function normalizeAchievementDemoTier(tier: string): AchievementDemoTier {
  const t = tier.toLowerCase()
  if (t === 'negative' || t === 'struggle') return 'negative'
  if (t in ACHIEVEMENT_TIER_DEMO) return t as AchievementDemoTier
  return 'bronze'
}

/** Achievement demo submenu — pill background (matches rank demo pattern). */
export function getAchievementDemoMenuItemClass(tier: string) {
  const cfg = ACHIEVEMENT_TIER_DEMO[normalizeAchievementDemoTier(tier)]
  return cn(cfg.item, 'my-0.5 rounded-sm')
}

export function getAchievementDemoMenuLabelClass(tier: string) {
  const cfg = ACHIEVEMENT_TIER_DEMO[normalizeAchievementDemoTier(tier)]
  return cn('min-w-0 truncate', cfg.label)
}

export function getAchievementDemoMenuTierClass(tier: string) {
  const cfg = ACHIEVEMENT_TIER_DEMO[normalizeAchievementDemoTier(tier)]
  return cn('ml-auto text-[10px] capitalize shrink-0', cfg.tier)
}
