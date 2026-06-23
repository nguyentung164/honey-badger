'use client'

import confetti from 'canvas-confetti'

/** Sao 5 cánh dạng path – dùng wobble/tilt để xoay như giấy (built-in 'star' không xoay) */
const ROTATING_STAR_SHAPE = (() => {
  try {
    return (confetti as any).shapeFromPath?.('M 0,-10 L 2.35,-3.24 L 9.51,-3.09 L 3.8,1.24 L 5.88,8.09 L 0,4 L -5.88,8.09 L -3.8,1.24 L -9.51,-3.09 L -2.35,-3.24 Z') ?? 'star'
  } catch {
    return 'star' as const
  }
})()

import { Sparkles, Trophy, Zap } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  type AchievementNotificationPayload,
  type AchievementToastItem,
  type RankUpNotificationPayload,
  registerAchievementToastCallback,
  useAchievementNotification,
} from '@/hooks/useAchievementNotification'
import { playCelebrationSound, useCelebrationSoundUrl } from '@/hooks/useNotificationSound'
import { ACHIEVEMENT_RANKS, type RankCode } from 'shared/achievementRanks'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/useAchievementStore'
import { BadgeCard } from './BadgeCard'
import { getRankRevealLabelClass, RANK_CONFIG, RankBadge } from './RankBadge'

function getPreviousRankCode(rank: string): RankCode {
  const idx = ACHIEVEMENT_RANKS.findIndex(r => r.code === rank)
  if (idx <= 0) return ACHIEVEMENT_RANKS[0].code
  return ACHIEVEMENT_RANKS[idx - 1].code
}

function RankUpReveal({ newRank }: { newRank: string }) {
  const newCode = (newRank in RANK_CONFIG ? newRank : 'newbie') as RankCode
  const prevCode = getPreviousRankCode(newCode)
  const newCfg = RANK_CONFIG[newCode]
  const prevCfg = RANK_CONFIG[prevCode]

  return (
    <div className="relative flex w-full flex-col items-center overflow-visible py-2">
      <div className="relative flex h-36 w-full items-center justify-center overflow-visible">
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2" aria-hidden>
          <div
            className={cn(
              'h-56 w-56 rounded-full blur-3xl animate-rank-up-halo-pulse',
              RANK_DIALOG_HALO[newCode] ?? 'bg-amber-200/55 dark:bg-amber-400/30'
            )}
          />
        </div>
        <div className="relative z-10 h-32 w-32 overflow-visible">
          <div className="animate-rank-up-old-leave pointer-events-none absolute inset-0 flex items-center justify-center will-change-transform">
            <RankBadge rank={prevCode} variant="simple" size="xl" noGlow />
          </div>
          <div className="animate-rank-up-new-arrive absolute inset-0 flex items-center justify-center will-change-transform">
            <div className="animate-rank-up-float-delayed">
              <RankBadge rank={newCode} variant="simple" size="xl" noGlow />
            </div>
          </div>
        </div>
      </div>
      <div className="relative mt-3 h-11 w-full overflow-visible">
        <div className="animate-rank-up-label-old pointer-events-none absolute inset-0 flex items-center justify-center will-change-transform">
          <span className={cn('achievement-rank-up-name whitespace-nowrap text-center text-2xl font-bold tracking-wide', getRankRevealLabelClass(prevCode, 'prev'))}>
            {prevCfg.label}
          </span>
        </div>
        <div className="animate-rank-up-label-new absolute inset-0 flex items-center justify-center will-change-transform">
          <span className={cn('achievement-rank-up-name achievement-rank-up-name--new whitespace-nowrap text-center text-3xl font-extrabold tracking-wide', getRankRevealLabelClass(newCode, 'new'))}>
            {newCfg.label}
          </span>
        </div>
      </div>
    </div>
  )
}

const TIER_STYLES = {
  bronze: { border: 'border-orange-700/60', badge: 'bg-orange-700/15 text-orange-800 dark:text-orange-400' },
  silver: { border: 'border-slate-400/60', badge: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
  gold: { border: 'border-yellow-500/70', badge: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' },
  special: { border: 'border-violet-500/60', badge: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  negative: { border: 'border-red-500/60', badge: 'bg-red-500/15 text-red-600 dark:text-red-400' },
} as const

/** Halo + góc blur dialog — theo tier badge (không cố định tím). */
const TIER_DIALOG_HALO: Record<string, string> = {
  bronze: 'bg-amber-200/25 dark:bg-amber-500/14',
  silver: 'bg-slate-200/30 dark:bg-slate-400/14',
  gold: 'bg-amber-200/30 dark:bg-yellow-400/14',
  special: 'bg-violet-200/25 dark:bg-violet-500/14',
  negative: 'bg-red-200/25 dark:bg-red-500/14',
}

const TIER_DIALOG_CORNER_TR: Record<string, string> = {
  bronze: 'from-amber-200/45 dark:from-amber-500/22',
  silver: 'from-slate-200/50 dark:from-slate-400/22',
  gold: 'from-amber-200/40 dark:from-yellow-400/22',
  special: 'from-violet-200/40 dark:from-violet-500/22',
  negative: 'from-red-200/40 dark:from-red-500/22',
}

const TIER_DIALOG_CORNER_BL: Record<string, string> = {
  bronze: 'from-amber-100/35 dark:from-amber-600/14',
  silver: 'from-slate-100/35 dark:from-slate-500/14',
  gold: 'from-amber-100/30 dark:from-amber-300/14',
  special: 'from-fuchsia-100/35 dark:from-fuchsia-500/14',
  negative: 'from-rose-100/35 dark:from-rose-600/16',
}

/** Màu confetti riêng theo tier – thay vì dùng màu generic */
const TIER_CONFETTI_COLORS: Record<string, string[]> = {
  bronze: ['#CD7F32', '#E8A050', '#F4C080', '#B8860B', '#FFA040'],
  silver: ['#C0C0C0', '#E8E8F4', '#A8A8B8', '#D8D8E8', '#F0F0F8'],
  gold: ['#FFD700', '#FFC200', '#FFEC6E', '#FF8C00', '#FFA500'],
  special: ['#8B5CF6', '#A78BFA', '#C084FC', '#E879F9', '#7C3AED'],
  negative: ['#EF4444', '#F87171', '#FCA5A5', '#DC2626', '#FF4444'],
}

const RANK_DIALOG_HALO: Record<string, string> = {
  newbie: 'bg-amber-200/55 dark:bg-amber-400/30',
  contributor: 'bg-lime-200/50 dark:bg-lime-400/30',
  developer: 'bg-teal-200/50 dark:bg-teal-400/30',
  regular: 'bg-sky-200/50 dark:bg-sky-400/30',
  pro: 'bg-blue-200/50 dark:bg-blue-400/30',
  expert: 'bg-indigo-200/50 dark:bg-indigo-400/30',
  master: 'bg-purple-200/50 dark:bg-purple-400/30',
  legend: 'bg-rose-200/45 dark:bg-rose-400/25',
  mythic:
    'bg-gradient-to-br from-amber-200/50 via-fuchsia-200/45 to-cyan-200/50 dark:from-amber-400/25 dark:via-fuchsia-400/20 dark:to-cyan-400/30',
}

const RANK_CONFETTI_COLORS: Record<string, string[]> = {
  newbie: ['#FBBF24', '#F59E0B', '#FDE68A', '#D97706', '#FEF3C7'],
  contributor: ['#84CC16', '#A3E635', '#BEF264', '#65A30D', '#ECFCCB'],
  developer: ['#2DD4BF', '#5EEAD4', '#14B8A6', '#0D9488', '#CCFBF1'],
  regular: ['#38BDF8', '#7DD3FC', '#0EA5E9', '#0284C7', '#E0F2FE'],
  pro: ['#3B82F6', '#60A5FA', '#2563EB', '#1D4ED8', '#DBEAFE'],
  expert: ['#6366F1', '#818CF8', '#4F46E5', '#4338CA', '#E0E7FF'],
  master: ['#A855F7', '#C084FC', '#9333EA', '#7E22CE', '#F3E8FF'],
  legend: ['#F43F5E', '#EC4899', '#FB7185', '#E11D48', '#FBCFE8'],
  mythic: ['#FBBF24', '#F59E0B', '#D946EF', '#22D3EE', '#06B6D4', '#0F172A'],
}

/** Style cho label pill + icon + shimmer text theo tier */
const TIER_LABEL_CONFIG = {
  bronze: {
    pill: 'bg-orange-700/10',
    icon: 'text-orange-600 dark:text-orange-400',
    iconGlow: 'animate-achievement-icon-glow-bronze',
    shimmer: 'animate-achievement-text-shimmer-bronze',
  },
  silver: {
    pill: 'bg-slate-400/10',
    icon: 'text-slate-500 dark:text-slate-300',
    iconGlow: 'animate-achievement-icon-glow-silver',
    shimmer: 'animate-achievement-text-shimmer-silver',
  },
  gold: {
    pill: 'bg-yellow-500/15',
    icon: 'text-yellow-500 dark:text-yellow-400',
    iconGlow: 'animate-achievement-icon-glow',
    shimmer: 'animate-achievement-text-shimmer',
  },
  special: {
    pill: 'bg-violet-500/10',
    icon: 'text-violet-500',
    iconGlow: 'animate-achievement-icon-glow-violet',
    shimmer: 'animate-achievement-text-shimmer-violet',
  },
  negative: {
    pill: 'bg-red-500/10',
    icon: 'text-red-500 dark:text-red-400',
    iconGlow: 'animate-achievement-icon-glow-struggle',
    shimmer: 'animate-achievement-text-shimmer-negative',
  },
} as const

/** Màu sparkle ambient theo tier */
const TIER_SPARKLE_COLOR: Record<string, string> = {
  bronze: 'rgba(205,127,50,0.55)',
  silver: 'rgba(192,192,210,0.55)',
  gold: 'rgba(255,215,0,0.65)',
  special: 'rgba(139,92,246,0.55)',
  negative: 'rgba(239,68,68,0.58)',
  rank_up: 'rgba(217,119,6,0.55)',
}

const SPARKLE_SLOTS = [
  { left: '10%', delay: '0s', size: 3 },
  { left: '28%', delay: '0.9s', size: 2 },
  { left: '50%', delay: '1.7s', size: 3.5 },
  { left: '68%', delay: '0.45s', size: 2.5 },
  { left: '85%', delay: '1.3s', size: 3 },
  { left: '40%', delay: '2.2s', size: 2 },
]

function FloatingSparkles({ tier }: { tier: string }) {
  const color = TIER_SPARKLE_COLOR[tier] ?? 'rgba(139,92,246,0.5)'
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden>
      {SPARKLE_SLOTS.map((sp, i) => (
        <div
          key={i}
          className="animate-achievement-sparkle absolute bottom-[8%] rounded-full"
          style={{
            left: sp.left,
            width: sp.size,
            height: sp.size,
            background: color,
            animationDelay: sp.delay,
            boxShadow: `0 0 ${sp.size * 2}px ${color}`,
          }}
        />
      ))}
    </div>
  )
}

/** Đếm số từ 0 lên target với easing – tạo cảm giác XP "đổ vào" */
function useCountUp(target: number, duration = 900, startDelay = 380): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (target <= 0) {
      setCount(0)
      return
    }
    setCount(0)
    let rafId: number
    const timeout = setTimeout(() => {
      const start = performance.now()
      const step = (now: number) => {
        const elapsed = now - start
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - (1 - progress) ** 3
        setCount(Math.round(eased * target))
        if (progress < 1) rafId = requestAnimationFrame(step)
      }
      rafId = requestAnimationFrame(step)
    }, startDelay)
    return () => {
      clearTimeout(timeout)
      cancelAnimationFrame(rafId)
    }
  }, [target, duration, startDelay])
  return count
}

function DialogContentInner({ item, onDismiss }: { item: AchievementToastItem; onDismiss: () => void }) {
  const { t } = useTranslation()
  const definitions = useAchievementStore(s => s.definitions)
  const earned = useAchievementStore(s => s.myEarned)

  const isRankUp = item.type === 'rank_up'
  const achievementPayload = !isRankUp ? (item.payload as AchievementNotificationPayload) : null
  const rankUpPayload = isRankUp ? (item.payload as RankUpNotificationPayload) : null

  const def = definitions.find(d => d.code === achievementPayload?.code)
  const earnedItem = earned.find(e => e.achievement_code === achievementPayload?.code)
  const newRank = rankUpPayload?.newRank ?? null

  const tier = isRankUp ? 'gold' : (def?.tier ?? 'bronze')
  const isStruggle = Boolean(def?.is_negative || def?.tier === 'negative')
  const tierStyle = TIER_STYLES[tier as keyof typeof TIER_STYLES] ?? TIER_STYLES.bronze
  const labelCfg = TIER_LABEL_CONFIG[tier as keyof typeof TIER_LABEL_CONFIG] ?? TIER_LABEL_CONFIG.bronze

  const xpCount = useCountUp(def?.xp_reward ?? 0)
  const sparkleKey = isRankUp ? 'rank_up' : tier

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onDismiss}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onDismiss()
        }
      }}
      className={cn(
        'relative z-[1] cursor-pointer rounded-3xl bg-gradient-to-b from-background via-background to-white/90 shadow-2xl backdrop-blur-xl dark:via-background dark:to-muted/30',
        isRankUp ? 'overflow-visible' : 'overflow-hidden',
        'animate-achievement-dialog',
        tierStyle.border,
        'shadow-2xl'
      )}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* Floating ambient sparkle particles */}
      <FloatingSparkles tier={sparkleKey} />

      {/* Decorative corner accents — màu theo tier */}
      <div
        className={cn(
          'pointer-events-none absolute -top-12 -right-12 h-24 w-24 rounded-full bg-gradient-to-br to-transparent blur-2xl',
          TIER_DIALOG_CORNER_TR[tier] ?? TIER_DIALOG_CORNER_TR.bronze
        )}
      />
      <div
        className={cn(
          'pointer-events-none absolute -bottom-8 -left-8 h-20 w-20 rounded-full bg-gradient-to-tr to-transparent blur-xl',
          TIER_DIALOG_CORNER_BL[tier] ?? TIER_DIALOG_CORNER_BL.bronze
        )}
      />

      {/* Top shine line */}
      <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

      <div className="relative flex flex-col items-center gap-7 px-12 pt-12 pb-6">
        {isRankUp ? (
          <div className="flex flex-col items-center gap-4 overflow-visible pt-2">
            <RankUpReveal newRank={newRank ?? 'newbie'} />
            <div className="flex items-center justify-center gap-3 animate-achievement-label py-1">
              <Trophy size={18} className="text-amber-600 dark:text-amber-500 animate-achievement-icon-shine dark:animate-achievement-icon-glow" />
              <span className="text-xl achievement-rank-up-heading">Rank Up!</span>
              <Trophy size={18} className="text-amber-600 dark:text-amber-500 animate-achievement-icon-shine dark:animate-achievement-icon-glow" />
            </div>
            <p className="pt-2 text-center text-sm text-muted-foreground leading-relaxed animate-achievement-desc">{item.title}</p>
          </div>
        ) : def ? (
          <>
            <div className="relative overflow-visible">
              <div className={cn('pointer-events-none absolute -inset-4 rounded-full blur-2xl', TIER_DIALOG_HALO[tier] ?? TIER_DIALOG_HALO.bronze)} />
              {/* Outer handles entrance pop scale, inner handles continuous float Y */}
              <div className="relative animate-achievement-badge overflow-visible">
                <div className="animate-achievement-badge-float">
                  <BadgeCard def={def} earned={earnedItem ?? undefined} size="lg" forceUnlocked pulseRing />
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className={cn('flex items-center justify-center gap-2 rounded-full px-4 py-1.5 animate-achievement-label', labelCfg.pill)}>
                <Sparkles size={14} className={cn('animate-achievement-icon-shine', labelCfg.icon, labelCfg.iconGlow)} />
                <span className={cn('text-xs font-bold uppercase tracking-[0.2em]', labelCfg.shimmer)}>
                  {isStruggle
                    ? t('achievement.unlockDialog.struggleUnlocked', 'Struggle Badge')
                    : t('achievement.unlockDialog.achievementUnlocked', 'Achievement Unlocked!')}
                </span>
              </div>
              <h3 className="text-2xl font-extrabold tracking-tight text-foreground animate-achievement-title">
                {t(`achievement.def.${def.code}.name`, { defaultValue: def.name })}
              </h3>
              {def.description && (
                <p className="max-w-[260px] text-xs text-muted-foreground leading-relaxed animate-achievement-desc">
                  {t(`achievement.def.${def.code}.description`, { defaultValue: def.description })}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2 animate-achievement-desc">
                <span className={cn('rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider', tierStyle.badge)}>
                  {isStruggle
                    ? t('achievement.unlockDialog.struggleTier', 'Struggle')
                    : t('achievement.unlockDialog.tierLabel', { tier: def.tier, defaultValue: `${def.tier} Tier` })}
                </span>
                {(def.xp_reward ?? 0) > 0 && (
                  <span className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30 tabular-nums">
                    <Zap size={12} />+{xpCount} XP
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className={cn('flex items-center gap-2 rounded-full px-4 py-1.5 animate-achievement-label', labelCfg.pill)}>
              <Sparkles size={14} className={cn('animate-achievement-icon-shine', labelCfg.icon, labelCfg.iconGlow)} />
              <span className={cn('text-xs font-bold uppercase tracking-wide', labelCfg.shimmer)}>Achievement Unlocked!</span>
            </div>
            <h3 className="text-xl font-bold animate-achievement-title">{item.title}</h3>
          </div>
        )}
      </div>
    </div>
  )
}

const TIER_SCALE = { bronze: 0.7, silver: 0.85, gold: 1, special: 1.25, negative: 0.65 } as const
const RANK_SCALE = {
  newbie: 0.6,
  contributor: 0.7,
  developer: 0.8,
  regular: 0.9,
  pro: 1,
  expert: 1.15,
  master: 1.35,
  legend: 1.5,
  mythic: 1.7,
} as const

function getConfettiMeta(item: AchievementToastItem): { scale: number; colors: string[] } {
  if (item.type === 'rank_up') {
    const rank = (item.payload as RankUpNotificationPayload).newRank
    return {
      scale: RANK_SCALE[rank as keyof typeof RANK_SCALE] ?? 1,
      colors: RANK_CONFETTI_COLORS[rank] ?? RANK_CONFETTI_COLORS.pro,
    }
  }
  const code = (item.payload as AchievementNotificationPayload).code
  const def = useAchievementStore.getState().definitions.find(d => d.code === code)
  const tier = def?.tier ?? 'bronze'
  return {
    scale: TIER_SCALE[tier as keyof typeof TIER_SCALE] ?? 0.8,
    colors: TIER_CONFETTI_COLORS[tier] ?? TIER_CONFETTI_COLORS.bronze,
  }
}

function fireStarBurstConfetti(scale: number, colors: string[]) {
  const origin = { x: 0.5, y: 0.5 }
  const scalar = Math.max(0.35, Math.min(1.3, 0.85 * scale))
  const shapes = typeof ROTATING_STAR_SHAPE === 'object' ? [ROTATING_STAR_SHAPE] : ['star' as const]
  const opts = { origin, colors, zIndex: 200, shapes, scalar, flat: false }
  const fire = (ratio: number, spreadVal: number, velocity: number) =>
    confetti({
      ...opts,
      particleCount: Math.max(2, Math.floor(25 * scale * ratio)),
      spread: Math.round(spreadVal * scale),
      startVelocity: Math.round(velocity * scale),
      decay: 0.92,
    })
  fire(0.25, 26, 55)
  fire(0.2, 60, 45)
  fire(0.35, 100, 35)
  fire(0.1, 120, 25)
  fire(0.1, 120, 45)
}

/** Realistic Look: mix multiple bursts với spread/velocity/decay khác nhau (tham khảo https://www.kirilv.com/canvas-confetti/) */
function fireRealisticConfetti(scale: number, colors: string[]) {
  const origin = { x: 0.5, y: 0.5 }
  const opts = { origin, colors, zIndex: 200 }
  const fire = (ratio: number, overrides: object) => confetti({ ...opts, ...overrides, particleCount: Math.max(4, Math.floor(8 * scale * ratio)) })
  fire(0.25, { spread: 26, startVelocity: 55, decay: 0.9 })
  fire(0.2, { spread: 60, startVelocity: 45, decay: 0.9 })
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.85 * scale })
  fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: Math.min(1.2, 1.1 * scale) })
  fire(0.1, { spread: 120, startVelocity: 45, decay: 0.9 })
}

function fireConfetti(item: AchievementToastItem) {
  const { scale, colors } = getConfettiMeta(item)
  if (item.type === 'rank_up') {
    fireStarBurstConfetti(scale, colors)
  } else {
    fireRealisticConfetti(scale, colors)
  }
}

/** Ignore outside-dismiss right after open (dropdown menu click would close instantly). */
const OUTSIDE_DISMISS_GRACE_MS = 450

export function AchievementUnlockDialog() {
  const [queue, setQueue] = useState<AchievementToastItem[]>([])
  const ignoreOutsideDismissRef = useRef(false)
  const resolvedSoundUrl = useCelebrationSoundUrl()

  useAchievementNotification()

  const currentItem = queue[0] ?? null

  const handleClose = useCallback(() => {
    confetti.reset()
    setQueue([])
  }, [])

  const dismissFromOutside = useCallback(
    (e: Event) => {
      if (ignoreOutsideDismissRef.current) {
        e.preventDefault()
        return
      }
      handleClose()
    },
    [handleClose]
  )

  useEffect(() => {
    return registerAchievementToastCallback((item, options) => {
      // Must run before open flips true — blocks menu pointer-down from closing instantly
      ignoreOutsideDismissRef.current = true
      window.setTimeout(() => {
        ignoreOutsideDismissRef.current = false
      }, OUTSIDE_DISMISS_GRACE_MS)
      setQueue(prev => {
        if (options?.replace) return [item]
        if (prev.some(p => p.id === item.id)) return prev
        return [...prev, item]
      })
    })
  }, [])

  useEffect(() => {
    if (!currentItem) return
    playCelebrationSound(resolvedSoundUrl)
    const frame = requestAnimationFrame(() => fireConfetti(currentItem))
    return () => cancelAnimationFrame(frame)
  }, [currentItem?.id, resolvedSoundUrl])

  return (
    <Dialog
      open={!!currentItem}
      onOpenChange={open => {
        if (!open && !ignoreOutsideDismissRef.current) handleClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          'z-[51] max-w-sm border-0 bg-transparent p-0 shadow-none',
          currentItem?.type === 'rank_up' && 'overflow-visible'
        )}
        onPointerDownOutside={dismissFromOutside}
        onEscapeKeyDown={handleClose}
      >
        <DialogTitle className="sr-only">{currentItem?.type === 'rank_up' ? 'Rank Up!' : 'Achievement Unlocked!'}</DialogTitle>
        {currentItem && <DialogContentInner item={currentItem} onDismiss={handleClose} />}
      </DialogContent>
    </Dialog>
  )
}
