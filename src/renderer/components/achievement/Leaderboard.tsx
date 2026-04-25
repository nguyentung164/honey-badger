import { Crown, Info, Sparkles, Zap } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/useAchievementStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'
import { RANK_CONFIG, RankBadge } from './RankBadge'

const POSITION_STYLE: Record<string, { bg: string; text: string }> = {
  PM:  { bg: 'bg-amber-100  dark:bg-amber-900/50',  text: 'text-amber-700  dark:text-amber-300'  },
  PL:  { bg: 'bg-violet-100 dark:bg-violet-900/50', text: 'text-violet-700 dark:text-violet-300' },
  DEV: { bg: 'bg-sky-100    dark:bg-sky-900/50',    text: 'text-sky-700    dark:text-sky-300'    },
}

function PositionBadge({ position, className }: { position?: string | null; className?: string }) {
  if (!position) return null
  const style = POSITION_STYLE[position]
  if (!style) return null
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-bold leading-none shrink-0',
        style.bg,
        style.text,
        className,
      )}
    >
      {position}
    </span>
  )
}

function parseRoleChips(positions?: string | null): string[] {
  if (!positions?.trim()) return []
  return positions.split(',').map(s => s.trim()).filter(Boolean)
}

/** Một hoặc nhiều chip PM / PL / DEV (user có thể đồng thời PL + DEV ở các project). */
function PositionBadgeGroup({ positions, className }: { positions?: string | null; className?: string }) {
  const tags = parseRoleChips(positions)
  if (tags.length === 0) return null
  return (
    <span className={cn('inline-flex flex-wrap items-center justify-center gap-0.5', className)}>
      {tags.map((tag, i) => (
        <PositionBadge key={`${tag}-${i}`} position={tag} />
      ))}
    </span>
  )
}

/* ─────────────────── keyframes (scoped to component) ─────────────────── */

const KEYFRAMES = `
  @keyframes lb-slide-up {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes lb-crown-float {
    0%,100% { transform: translateY(0) rotate(-6deg); }
    50%      { transform: translateY(-7px) rotate(6deg); }
  }
  @keyframes lb-gold-shimmer {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }
  @keyframes lb-sparkle-drift {
    0%   { opacity: 0;   transform: translate(0, 0) scale(0.5); }
    25%  { opacity: 1; }
    100% { opacity: 0;   transform: translate(var(--sx), var(--sy)) scale(0); }
  }
  @keyframes lb-row-glow-in {
    0%   { box-shadow: 0 0 0 0 rgba(139,92,246,0.5); }
    50%  { box-shadow: 0 0 0 3px rgba(139,92,246,0.18); }
    100% { box-shadow: 0 0 0 0 rgba(139,92,246,0); }
  }
  @keyframes lb-spin-ring {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes lb-spin-ring-rev {
    from { transform: rotate(360deg); }
    to   { transform: rotate(0deg); }
  }
  @keyframes lb-gold-bloom {
    0%,100% { opacity: 0.55; transform: rotate(0deg) scale(1); }
    50%      { opacity: 0.9;  transform: rotate(180deg) scale(1.08); }
  }
  @keyframes lb-gold-mid {
    0%,100% { opacity: 0.75; transform: rotate(0deg); }
    50%      { opacity: 1;    transform: rotate(180deg); }
  }
`

/* ─────────────────── podium config ─────────────────── */

const PODIUM_CFG = [
  {
    medal: '👑',
    avatarSize: 'h-16 w-16',
    pedestalHeight: 'min-h-[88px]',
    pedestalGradient: 'linear-gradient(to bottom, #fde047, #f59e0b, #d97706)',
    nameClass: 'text-sm font-bold text-amber-500 dark:text-amber-300',
    xpClass: 'text-amber-500 dark:text-amber-300',
    medPos: 'text-3xl',
    isGold: true,
  },
  {
    medal: '🥈',
    avatarSize: 'h-12 w-12',
    pedestalHeight: 'min-h-[64px]',
    pedestalGradient: 'linear-gradient(to bottom, #e2e8f0, #cbd5e1, #94a3b8)',
    nameClass: 'text-xs font-semibold text-slate-500 dark:text-slate-300',
    xpClass: 'text-slate-500 dark:text-slate-400',
    medPos: 'text-2xl',
    isGold: false,
  },
  {
    medal: '🥉',
    avatarSize: 'h-11 w-11',
    pedestalHeight: 'min-h-[48px]',
    pedestalGradient: 'linear-gradient(to bottom, #d97706, #b45309, #92400e)',
    nameClass: 'text-xs font-semibold text-amber-700 dark:text-amber-500',
    xpClass: 'text-amber-700 dark:text-amber-500',
    medPos: 'text-2xl',
    isGold: false,
  },
] as const

/* ─────────────────── helpers ─────────────────── */

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase())
    .join('')
    .slice(0, 2)
}

/* XP count-up: mỗi lần enabled false→true đều chạy lại animation từ 0 */
function AnimatedXp({ value, delay = 0, enabled = true }: { value: number; delay?: number; enabled?: boolean }) {
  const [displayed, setDisplayed] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setDisplayed(0)
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      const start = performance.now()
      const dur = 900
      const tick = (now: number) => {
        if (cancelled) return
        const p = Math.min((now - start) / dur, 1)
        setDisplayed(Math.round((1 - (1 - p) ** 3) * value))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, delay)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [value, delay, enabled])

  return <>{displayed.toLocaleString()}</>
}

/* Floating gold sparkles around #1 avatar */
const SPARKLE_PARTICLES = [
  { left: '5%', top: '40%', delay: '0s', dur: '2.6s', sx: '-10px', sy: '-26px' },
  { left: '82%', top: '35%', delay: '0.9s', dur: '2.2s', sx: '8px', sy: '-22px' },
  { left: '48%', top: '8%', delay: '1.5s', dur: '2.8s', sx: '-5px', sy: '-30px' },
  { left: '22%', top: '60%', delay: '0.4s', dur: '2.3s', sx: '12px', sy: '-20px' },
  { left: '72%', top: '55%', delay: '1.2s', dur: '2.5s', sx: '-8px', sy: '-24px' },
]

function GoldSparkles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {SPARKLE_PARTICLES.map((p, i) => (
        <span
          key={i}
          className="absolute text-[9px] text-amber-300 select-none"
          style={
            {
              left: p.left,
              top: p.top,
              animationName: 'lb-sparkle-drift',
              animationDuration: p.dur,
              animationDelay: p.delay,
              animationIterationCount: 'infinite',
              animationTimingFunction: 'ease-out',
              '--sx': p.sx,
              '--sy': p.sy,
            } as React.CSSProperties
          }
        >
          ✦
        </span>
      ))}
    </div>
  )
}

/* ─────────────────── podium avatar rings ─────────────────── */

function PodiumAvatarRing({ posIdx, children }: { posIdx: number; children: React.ReactNode }) {
  if (posIdx === 0) {
    const gradient = [
      'conic-gradient(from 0deg,',
      '#fde047 0%,',
      '#f59e0b 12%,',
      '#fb923c 24%,',
      '#fde047 36%,',
      '#fffbeb 50%,',
      '#fde047 64%,',
      '#f59e0b 76%,',
      '#d97706 88%,',
      '#fde047 100%)',
    ].join(' ')

    return (
      <div className="relative rounded-full" style={{ isolation: 'isolate' }}>
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            inset: '-10px',
            background: gradient,
            animation: 'lb-gold-bloom 2s ease-in-out infinite',
            filter: 'blur(16px)',
          }}
        />
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            inset: '-4px',
            background: gradient,
            animation: 'lb-gold-mid 2s ease-in-out infinite',
            filter: 'blur(6px)',
          }}
        />
        <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: gradient, animation: 'lb-spin-ring 2s linear infinite' }} />
        <div className="absolute rounded-full bg-background pointer-events-none" style={{ inset: '5px' }} />
        <div className="relative">{children}</div>
      </div>
    )
  }

  if (posIdx === 1) {
    const outerGrad = 'conic-gradient(from 0deg, #f8fafc, #94a3b8, #e2e8f0, #475569, #cbd5e1, #94a3b8, #f8fafc)'
    const innerGrad = 'conic-gradient(from 180deg, #e2e8f0, #64748b, #f1f5f9, #94a3b8, #e2e8f0)'
    return (
      <div className="relative rounded-full" style={{ isolation: 'isolate' }}>
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: outerGrad,
            animation: 'lb-spin-ring 7s linear infinite',
            boxShadow: '0 0 10px 2px rgba(148,163,184,0.45)',
          }}
        />
        <div className="absolute rounded-full bg-background pointer-events-none" style={{ inset: '2.5px' }} />
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            inset: '4px',
            background: innerGrad,
            animation: 'lb-spin-ring-rev 5s linear infinite',
          }}
        />
        <div className="absolute rounded-full bg-background pointer-events-none" style={{ inset: '6px' }} />
        <div className="relative">{children}</div>
      </div>
    )
  }

  const bronzeGrad = 'conic-gradient(from 60deg, #fbbf24, #d97706, #92400e, #b45309, #d97706, #fbbf24)'
  return (
    <div className="relative rounded-full" style={{ isolation: 'isolate' }}>
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: '-3px',
          background: bronzeGrad,
          filter: 'blur(6px)',
          opacity: 0.6,
        }}
      />
      <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: bronzeGrad }} />
      <div className="absolute rounded-full bg-background pointer-events-none" style={{ inset: '2.5px' }} />
      <div className="relative">{children}</div>
    </div>
  )
}

/* ─────────────────── XP breakdown info ─────────────────── */

const XP_SOURCES = [
  { label: 'Hoàn thành task', xp: '15–300 XP' },
  { label: 'Commit & Push', xp: '5–150 XP' },
  { label: 'Code Review', xp: '20–300 XP' },
  { label: 'Daily Report', xp: '15–180 XP' },
  { label: 'SpotBugs clean', xp: '50–250 XP' },
  { label: 'Streak liên tục', xp: '70–350 XP' },
]

function XpInfoButton() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            <Info className="h-3 w-3" />
            Cách tính XP
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px] p-3 space-y-2">
          <div className="font-semibold text-xs mb-1">Nguồn XP</div>
          <div className="space-y-1">
            {XP_SOURCES.map(s => (
              <div key={s.label} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-semibold text-amber-500 tabular-nums shrink-0">{s.xp}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground pt-1 border-t">XP tăng khi unlock achievement. Rank lên khi đạt ngưỡng XP nhất định.</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface LeaderboardProps {
  open?: boolean
  isAdmin?: boolean
  /** undefined: không gọi API (chưa sẵn sàng / không có dự án). null: bảng toàn hệ. string: theo project. */
  projectId?: string | null
  onUserClick?: (userId: string, userName: string) => void
}

export function Leaderboard({ open = true, isAdmin = false, projectId, onUserClick }: LeaderboardProps) {
  const { leaderboard, loading, fetchLeaderboard } = useAchievementStore()
  const currentUser = useTaskAuthStore(s => s.user)
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string | null>>({})
  const fetchedRef = useRef<Set<string>>(new Set())
  const [countUpReady, setCountUpReady] = useState(false)

  /* Reset animation + fetch khi mở dialog hoặc đổi project */
  useEffect(() => {
    if (!open) return
    setCountUpReady(false)
    if (projectId === undefined) {
      useAchievementStore.setState({ leaderboard: [], loading: false })
      return
    }
    fetchLeaderboard(projectId)
  }, [open, projectId, fetchLeaderboard])

  /* Fetch avatar + trigger count-up khi có data */
  useEffect(() => {
    if (!open || leaderboard.length === 0) return
    leaderboard.forEach(entry => {
      const userId = entry.user_id
      if (fetchedRef.current.has(userId)) return
      fetchedRef.current.add(userId)
      window.api.user.getAvatarUrl(userId).then(url => {
        setAvatarUrls(prev => ({ ...prev, [userId]: url }))
      })
    })
    setCountUpReady(true)
  }, [open, leaderboard])

  useEffect(() => {
    if (!open) setCountUpReady(false)
  }, [open])

  if (projectId === undefined) {
    return (
      <>
        <style>{KEYFRAMES}</style>
        <div className="flex flex-col items-center justify-center h-52 gap-3 text-muted-foreground px-6 text-center">
          <Crown size={40} className="text-amber-400/40" />
          <p className="text-sm font-medium">Không có dự án để xem bảng xếp hạng</p>
          <p className="text-xs opacity-70 max-w-[240px]">Bạn chưa được gán vào dự án nào trong phạm vi hiển thị.</p>
        </div>
      </>
    )
  }

  /* ── loading state ── */
  if (loading && leaderboard.length === 0) {
    return (
      <>
        <style>{KEYFRAMES}</style>
        <div className="flex flex-col items-center justify-center h-52 gap-3 text-muted-foreground">
          <div className="relative">
            <Crown className="h-12 w-12 text-amber-400" style={{ animation: 'lb-crown-float 2.2s ease-in-out infinite' }} />
            <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-amber-300 animate-pulse" />
          </div>
          <p className="text-sm font-medium">Đang tải bảng xếp hạng...</p>
          <div className="flex gap-1.5">
            {[0, 160, 320].map(d => (
              <span key={d} className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        </div>
      </>
    )
  }

  /* ── empty state ── */
  if (leaderboard.length === 0) {
    return (
      <>
        <style>{KEYFRAMES}</style>
        <div className="flex flex-col items-center justify-center h-52 gap-3 text-muted-foreground px-6 text-center">
          <Crown size={40} className="text-amber-400/40" style={{ animation: 'lb-crown-float 3s ease-in-out infinite' }} />
          {projectId ? (
            <>
              <p className="text-sm font-medium">Dự án này chưa có dữ liệu XP</p>
              <p className="text-xs opacity-70 max-w-[220px]">Thành viên trong dự án cần thực hiện commit, task hoặc review để tích lũy XP.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Chưa có dữ liệu</p>
              <p className="text-xs opacity-70 max-w-[220px]">Bắt đầu commit, hoàn thành task, review code để tích lũy XP và leo bảng xếp hạng!</p>
            </>
          )}
          <XpInfoButton />
        </div>
      </>
    )
  }

  const top3 = leaderboard.slice(0, 3)
  const rest = leaderboard.slice(3)
  /* display order: silver(left) · gold(center) · bronze(right) */
  const podiumOrder = [1, 0, 2]

  return (
    <>
      <style>{KEYFRAMES}</style>

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden">
      {/* ── Top-3 Podium (không scroll) ── */}
      <div className="relative shrink-0 bg-background pb-3 pt-2" style={{ animation: 'lb-slide-up 0.35s ease-out both' }}>
        {/* XP info button */}
        <div className="flex justify-end px-1 pb-1">
          <XpInfoButton />
        </div>
        {/* glow divider at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />

        <div className="flex items-end justify-center gap-0.5">
          {podiumOrder.map(posIdx => {
            const entry = top3[posIdx]
            if (!entry) return null
            const cfg = PODIUM_CFG[posIdx]
            const isCurrentUser = entry.user_id === currentUser?.id
            const rankCfg = RANK_CONFIG[entry.current_rank as keyof typeof RANK_CONFIG] ?? RANK_CONFIG.newbie
            const isClickable = !!(isAdmin && onUserClick)

            const podiumInner = (
              <div className="flex flex-col items-center w-full select-none">
                {/* Medal emoji */}
                <span className={cn(cfg.medPos, 'mb-1 leading-none')} style={cfg.isGold ? { animation: 'lb-crown-float 2.4s ease-in-out infinite' } : undefined}>
                  {cfg.medal}
                </span>

                {/* Avatar with sparkles for #1 */}
                <div className={cn('relative', cfg.isGold && 'group')}>
                  {cfg.isGold && <GoldSparkles />}
                  <PodiumAvatarRing posIdx={posIdx}>
                    <Avatar className={cn(cfg.avatarSize, 'transition-transform duration-200', isClickable && 'group-hover:scale-105')}>
                      {avatarUrls[entry.user_id] && <AvatarImage src={avatarUrls[entry.user_id] ?? ''} alt={entry.name} className="object-cover" />}
                      <AvatarFallback className={cn('font-bold', posIdx === 0 ? 'text-base' : 'text-xs', rankCfg.bgColor, rankCfg.color)}>{getInitials(entry.name)}</AvatarFallback>
                    </Avatar>
                  </PodiumAvatarRing>
                </div>

                {/* Name + XP */}
                <div className="mt-1.5 text-center px-1 w-full max-w-[90px]">
                  <div className={cn('truncate leading-tight', cfg.nameClass)}>{entry.name}</div>
                  <div className="flex items-center justify-center gap-1 mt-0.5 flex-wrap">
                    {isCurrentUser && (
                      <Badge variant="secondary" className="text-[8px] h-3.5 px-1">
                        You
                      </Badge>
                    )}
                    <PositionBadgeGroup positions={entry.positions} />
                  </div>
                  <div className={cn('flex items-center justify-center gap-0.5 mt-0.5', cfg.xpClass)}>
                    <Zap className="h-2.5 w-2.5" />
                    <span className="text-[10px] font-bold tabular-nums">
                      <AnimatedXp value={entry.xp} delay={posIdx * 120} enabled={countUpReady} />
                    </span>
                  </div>
                </div>

                {/* Pedestal */}
                <div
                  className={cn(
                    'relative w-full mt-2 rounded-t-md flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 overflow-hidden',
                    cfg.pedestalHeight,
                  )}
                  style={{ background: cfg.pedestalGradient }}
                >
                  {/* shimmer sweep — only gold */}
                  {cfg.isGold && (
                    <div
                      className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-20deg] pointer-events-none"
                      style={{ animation: 'lb-gold-shimmer 2.8s ease-in-out infinite', animationDelay: '0.5s' }}
                    />
                  )}
                  <RankBadge rank={entry.current_rank} size="lg" noGlow />
                </div>
              </div>
            )

            return (
              <React.Fragment key={entry.user_id}>
                {isClickable ? (
                  <button
                    type="button"
                    onClick={() => onUserClick?.(entry.user_id, entry.name)}
                    className="group flex-1 flex justify-center min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded-t-md"
                  >
                    {podiumInner}
                  </button>
                ) : (
                  <div className="flex-1 flex justify-center min-w-0">{podiumInner}</div>
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* ── Danh sách từ hạng 4 — chỉ khối này scroll ── */}
      {rest.length > 0 && (
        <div className="mt-1 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          {rest.map((entry, idx) => {
            const actualRank = idx + 4
            const isCurrentUser = entry.user_id === currentUser?.id
            const rankCfg = RANK_CONFIG[entry.current_rank as keyof typeof RANK_CONFIG] ?? RANK_CONFIG.newbie
            const isClickable = !!(isAdmin && onUserClick)
            const isEven = idx % 2 === 0
            const entranceDelay = `${idx * 45}ms`

            const rowContent = (
              <>
                <div className="w-7 text-center flex-shrink-0">
                  <span className="text-xs text-muted-foreground font-mono">{actualRank}</span>
                </div>
                <Avatar className={cn('h-8 w-8 flex-shrink-0 ring-2', rankCfg.ringColor)}>
                  {avatarUrls[entry.user_id] ? <AvatarImage src={avatarUrls[entry.user_id] ?? ''} alt={entry.name} className="object-cover" /> : null}
                  <AvatarFallback className={cn('text-xs font-bold', rankCfg.bgColor, rankCfg.color)}>{getInitials(entry.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('text-sm font-medium truncate', isCurrentUser && 'text-violet-600 dark:text-violet-400')}>{entry.name}</span>
                    {isCurrentUser && (
                      <Badge variant="secondary" className="text-[8px] h-3.5 px-1 shrink-0">
                        You
                      </Badge>
                    )}
                    <PositionBadgeGroup positions={entry.positions} />
                  </div>
                  <RankBadge rank={entry.current_rank} size="xs" showLabel className="mt-0.5" noGlow />
                </div>
                <div className="text-center flex-shrink-0 w-10">
                  <div className="text-sm font-semibold">{entry.total_achievements}</div>
                  <div className="text-[9px] text-muted-foreground">badges</div>
                </div>
                <div className="text-right flex-shrink-0 w-14">
                  <div className="text-xs font-bold tabular-nums">
                    <AnimatedXp value={entry.xp} delay={idx * 40 + 400} enabled={countUpReady} />
                  </div>
                  <div className="text-[9px] text-muted-foreground">XP</div>
                </div>
              </>
            )

            const baseStyle: React.CSSProperties = {
              animation: `lb-slide-up 0.3s ease-out ${entranceDelay} both`,
              ...(isCurrentUser ? { animation: `lb-slide-up 0.3s ease-out ${entranceDelay} both, lb-row-glow-in 1.4s ease-out 0.5s 1` } : {}),
            }

            const baseClass = cn(
              'flex items-center gap-3 px-3 py-2 transition-all duration-150',
              isCurrentUser ? 'bg-violet-500/10 dark:bg-violet-900/25 border-l-2 border-violet-500' : isEven ? 'bg-muted/40 dark:bg-muted/20' : 'bg-transparent',
              isClickable && !isCurrentUser && 'hover:bg-muted/70 cursor-pointer',
              !isCurrentUser && 'hover:translate-x-0.5'
            )

            return isClickable ? (
              <button
                key={entry.user_id}
                type="button"
                onClick={() => onUserClick?.(entry.user_id, entry.name)}
                className={cn('w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary', baseClass)}
                style={baseStyle}
              >
                {rowContent}
              </button>
            ) : (
              <div key={entry.user_id} className={baseClass} style={baseStyle}>
                {rowContent}
              </div>
            )
          })}
        </div>
      )}
      </div>
    </>
  )
}
