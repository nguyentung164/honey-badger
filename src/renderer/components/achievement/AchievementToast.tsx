import confetti from 'canvas-confetti'

/** Sao 5 cánh dạng path – xoay như giấy (built-in 'star' không xoay) */
const ROTATING_STAR_SHAPE = (() => {
  try {
    return (confetti as any).shapeFromPath?.('M 0,-10 L 2.35,-3.24 L 9.51,-3.09 L 3.8,1.24 L 5.88,8.09 L 0,4 L -5.88,8.09 L -3.8,1.24 L -9.51,-3.09 L -2.35,-3.24 Z') ?? 'star'
  } catch {
    return 'star' as const
  }
})()
import { X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AchievementNotificationPayload,
  type AchievementToastItem,
  type RankUpNotificationPayload,
  registerAchievementToastCallback,
  useAchievementNotification,
} from '@/hooks/useAchievementNotification'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/useAchievementStore'
import { BadgeCard } from './BadgeCard'
import { RANK_CONFIG } from './RankBadge'

const MAX_TOASTS = 3
const TOAST_DURATION = 6000

interface ToastItemState extends AchievementToastItem {
  removing: boolean
}

function SingleToast({ item, onRemove }: { item: ToastItemState; onRemove: (id: string) => void }) {
  const { t } = useTranslation()
  const definitions = useAchievementStore(s => s.definitions)
  const earned = useAchievementStore(s => s.myEarned)

  const isRankUp = item.type === 'rank_up'
  const achievementPayload = !isRankUp ? (item.payload as AchievementNotificationPayload) : null
  const rankUpPayload = isRankUp ? (item.payload as RankUpNotificationPayload) : null

  const def = definitions.find(d => d.code === achievementPayload?.code)
  const earnedItem = earned.find(e => e.achievement_code === achievementPayload?.code)
  const newRank = rankUpPayload?.newRank ?? null
  const rankCfg = newRank ? RANK_CONFIG[newRank as keyof typeof RANK_CONFIG] : null

  useEffect(() => {
    const timer = setTimeout(() => onRemove(item.id), TOAST_DURATION)
    return () => clearTimeout(timer)
  }, [item.id, onRemove])

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 rounded-xl border p-3 shadow-lg backdrop-blur-sm',
        'bg-background/95 border-border',
        'animate-slide-up-toast',
        item.removing && 'animate-fade-out',
        isRankUp ? 'border-yellow-500/50 min-w-[260px] max-w-[300px]' : 'min-w-[240px] max-w-[280px]'
      )}
    >
      {/* Close button */}
      <button onClick={() => onRemove(item.id)} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors">
        <X size={12} />
      </button>

      {isRankUp ? (
        <>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl">{rankCfg?.emoji ?? '⬆️'}</span>
          </div>
          <div className="flex-1 min-w-0 pr-4">
            <div className="text-xs font-bold text-yellow-500 uppercase tracking-wide">Rank Up!</div>
            <div className={cn('text-sm font-semibold mt-0.5', rankCfg?.color ?? 'text-foreground')}>{rankCfg?.label ?? newRank}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{item.title}</div>
          </div>
        </>
      ) : def ? (
        <>
          <BadgeCard def={def} earned={earnedItem ?? undefined} size="sm" />
          <div className="flex-1 min-w-0 pr-4">
            <div className="text-[10px] font-bold text-violet-500 uppercase tracking-wide">Achievement Unlocked!</div>
            <div className="text-sm font-semibold mt-0.5 truncate">{t(`achievement.def.${def.code}.name`, { defaultValue: def.name })}</div>
            <div className="text-xs text-muted-foreground capitalize">{def.tier} Tier</div>
            {(def.xp_reward ?? 0) > 0 && <div className="text-xs text-yellow-500 font-medium mt-0.5">+{def.xp_reward} XP</div>}
          </div>
        </>
      ) : (
        <div className="flex-1 min-w-0 pr-4">
          <div className="text-xs font-bold text-violet-500 uppercase tracking-wide">Achievement Unlocked!</div>
          <div className="text-sm font-semibold mt-0.5 truncate">{item.title}</div>
        </div>
      )}
    </div>
  )
}

const CONFETTI_COLORS = ['#FFD700', '#FFA500', '#FF69B4', '#7B68EE', '#00CED1']

const RANK_SCALE = {
  newbie: 0.4, contributor: 0.55, developer: 0.7, regular: 0.85,
  pro: 1, expert: 1.15, master: 1.35, legend: 1.6,
} as const

function fireStarBurstConfetti(scale: number) {
  const origin = { x: 0.5, y: 0.6 }
  const scalar = Math.max(0.35, Math.min(1.3, 0.85 * scale))
  const shapes = typeof ROTATING_STAR_SHAPE === 'object' ? [ROTATING_STAR_SHAPE] : ['star' as const]
  const opts = { origin, colors: CONFETTI_COLORS, zIndex: 99999, shapes, scalar, flat: false }
  const fire = (ratio: number, spreadVal: number, velocity: number) =>
    confetti({
      ...opts,
      particleCount: Math.max(2, Math.floor(10 * scale * ratio)),
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

function fireConfetti(item: AchievementToastItem) {
  const rank = (item.payload as RankUpNotificationPayload).newRank
  const scale = RANK_SCALE[rank as keyof typeof RANK_SCALE] ?? 1
  fireStarBurstConfetti(scale)
}

export function AchievementToastContainer() {
  const [toasts, setToasts] = useState<ToastItemState[]>([])

  useAchievementNotification()

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, removing: true } : t)))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
  }, [])

  useEffect(() => {
    registerAchievementToastCallback(item => {
      setToasts(prev => {
        const next = [{ ...item, removing: false }, ...prev].slice(0, MAX_TOASTS)
        return next
      })
      if (item.type === 'rank_up') fireConfetti(item)
    })
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 flex flex-col-reverse gap-2 z-[9998] pointer-events-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {toasts.map(toast => (
        <SingleToast key={toast.id} item={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}
