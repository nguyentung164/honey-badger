import { Award, Camera, Check, ChevronLeft, Flame, Loader2, Pin, PinOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { computeDevScore, computeRadarScores } from '@/pages/progress/components/DeveloperRadar'
import { getDevScoreGrade, radarMetricLabel } from '@/pages/progress/components/radarDevScoreUtils'
import { getRadarProfileSummary, type RadarProfileMetricKey } from '@/pages/progress/components/radarProfileInsights'
import { type UserAchievementWithDef, useAchievementStore } from '@/stores/useAchievementStore'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'
import { AchievementBadgesDialog } from './AchievementBadgesDialog'
import { AvatarCropDialog } from './AvatarCropDialog'
import { BadgeCard } from './BadgeCard'
import { getNextRankXp, RANK_CONFIG, RankBadge } from './RankBadge'

interface StatCardProps {
  label: string
  value: number | string
  icon?: React.ReactNode
  highlight?: boolean
}

function StatCard({ label, value, icon, highlight }: StatCardProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-lg p-2 gap-0.5', highlight ? 'bg-orange-500/15 dark:bg-orange-500/20' : 'bg-muted/50 dark:bg-muted/30')}>
      <div className="flex items-center gap-1">
        {icon}
        <span className={cn('text-base font-bold tabular-nums', highlight && 'text-orange-600 dark:text-orange-400')}>{value}</span>
      </div>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  )
}

interface BadgeSelectorProps {
  earned: UserAchievementWithDef[]
  pinned: string[]
  onChange: (codes: string[]) => void
}

function BadgeSelector({ earned, pinned, onChange }: BadgeSelectorProps) {
  const toggle = (code: string) => {
    if (pinned.includes(code)) {
      onChange(pinned.filter(c => c !== code))
    } else if (pinned.length < 3) {
      onChange([...pinned, code])
    }
  }

  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 place-items-center">
      {earned.map(e => {
        const isPinned = pinned.includes(e.achievement_code)
        return (
          <div key={e.achievement_code} className="relative inline-flex justify-self-center">
            <BadgeCard
              def={e.def}
              earned={e}
              size="sm"
              showName
              selected={isPinned}
              showSelectedRing={false}
              onClick={() => toggle(e.achievement_code)}
              className={!isPinned && pinned.length >= 3 ? 'opacity-50' : ''}
              variant="filled"
            />
            {isPinned && (
              <span className="absolute -top-1 -right-1 bg-green-500 rounded-full p-[2px]">
                <Check size={8} className="text-white" />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

const RANK_BADGE_BG: Record<string, React.CSSProperties> = {
  newbie: { background: '#64748b' },                                        /* slate-500  */
  contributor: { background: '#059669' },                                        /* emerald-600 */
  developer: { background: '#0284c7' },                                        /* sky-600    */
  regular: { background: '#2563eb' },                                        /* blue-600   */
  pro: { background: 'linear-gradient(135deg, #5b21b6, #7c3aed)' },     /* violet     */
  expert: { background: 'linear-gradient(135deg, #b45309, #f59e0b)' },     /* amber      */
  master: { background: 'linear-gradient(135deg, #9f1239, #f43f5e)' },     /* rose       */
  legend: { background: 'linear-gradient(90deg, #f43f5e, #8b5cf6, #3b82f6)' },
}

/**
 * Gradient 2 màu: từ màu rank hiện tại → màu rank tiếp theo
 * legend dùng class .legend-xp-bar (animated) thay vì inline style
 */
const XP_BAR_COLOR: Record<string, string> = {
  newbie: 'linear-gradient(90deg, #94a3b8, #10b981)',   /* slate  → emerald */
  contributor: 'linear-gradient(90deg, #10b981, #0ea5e9)',   /* emerald→ sky     */
  developer: 'linear-gradient(90deg, #0ea5e9, #3b82f6)',   /* sky    → blue    */
  regular: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',   /* blue   → violet  */
  pro: 'linear-gradient(90deg, #8b5cf6, #f59e0b)',   /* violet → amber   */
  expert: 'linear-gradient(90deg, #f59e0b, #f43f5e)',   /* amber  → rose    */
  master: 'linear-gradient(90deg, #f43f5e, #8b5cf6)',   /* rose   → violet  */
}

/* ─────────────────── Dev Score helpers ─────────────────── */

function nowYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const METRIC_COLORS: Record<string, string> = {
  velocity: 'var(--chart-1)',
  quality: 'var(--chart-2)',
  reliability: 'var(--chart-3)',
  delivery: 'var(--chart-4)',
  collaboration: 'var(--chart-5)',
  impact: 'var(--chart-6)',
}

interface DevScoreData {
  score: number
  velocity: number
  quality: number
  reliability: number
  delivery: number
  collaboration: number
  impact: number
}

function DevScoreSection({ data }: { data: DevScoreData }) {
  const { t } = useTranslation()
  const grade = getDevScoreGrade(data.score)
  const summary = getRadarProfileSummary({
    velocity: data.velocity,
    quality: data.quality,
    reliability: data.reliability,
    delivery: data.delivery,
    collaboration: data.collaboration,
    impact: data.impact,
  })

  /* Compact gauge */
  const R = 36
  const cx = 44
  const cy = 44
  const stroke = 7
  const circumference = Math.PI * R
  const filled = circumference * Math.min(data.score / 100, 1)
  const gap = circumference - filled

  const metrics: Array<{ key: RadarProfileMetricKey; value: number }> = [
    { key: 'velocity', value: data.velocity },
    { key: 'quality', value: data.quality },
    { key: 'reliability', value: data.reliability },
    { key: 'delivery', value: data.delivery },
    { key: 'collaboration', value: data.collaboration },
    { key: 'impact', value: data.impact },
  ]

  return (
    <div className="px-6 pb-4 border-t pt-3">
      <div
        className="rounded-xl p-3 space-y-2"
        style={{ background: grade.bg }}
      >
        <div className="flex items-start gap-3">
          <div className="relative w-[88px] h-[50px] shrink-0 overflow-hidden text-muted-foreground">
            <svg viewBox="0 0 88 50" className="w-full h-full" aria-hidden>
              <path
                d={`M ${cx - R},${cy} A ${R},${R} 0 0 1 ${cx + R},${cy}`}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.15}
                strokeWidth={stroke}
                strokeLinecap="round"
              />
              <path
                d={`M ${cx - R},${cy} A ${R},${R} 0 0 1 ${cx + R},${cy}`}
                fill="none"
                stroke={grade.color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${filled} ${gap + 1}`}
              />
            </svg>
            <div className="absolute inset-0 flex items-end justify-center pb-0.5">
              <span className="text-lg font-black tabular-nums leading-none" style={{ color: grade.color }}>
                {data.score}
              </span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('progress.devScore')}
            </p>
            <p className="text-xs font-bold mt-0.5" style={{ color: grade.color }}>
              {t(grade.gradeKey)}
            </p>
            <p className="text-[10px] text-muted-foreground leading-snug mt-1">
              {t('progress.devScoreSubtitle')}
            </p>
            <p className="text-[10px] text-muted-foreground/90 leading-snug mt-1">
              {t('progress.devScoreDisclaimer')}
            </p>
          </div>
        </div>

        <p className="text-[10px] font-medium text-foreground/90 leading-snug">
          {t(summary.shapeI18nKey)}
        </p>
        <div className="space-y-0.5 text-[10px] leading-snug">
          <p>
            <span className="text-muted-foreground">{t('progress.devScoreStrength')}</span>{' '}
            <span className="font-semibold" style={{ color: METRIC_COLORS[summary.strengthKey] }}>
              {radarMetricLabel(t, summary.strengthKey)}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">{t('progress.devScoreFocusArea')}</span>{' '}
            <span className="font-semibold" style={{ color: METRIC_COLORS[summary.weakKey] }}>
              {radarMetricLabel(t, summary.weakKey)}
            </span>
          </p>
        </div>

        {/* 6-metric mini bars */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1 border-t border-border/40">
          {metrics.map(m => (
            <div key={m.key}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-medium truncate mr-1" style={{ color: METRIC_COLORS[m.key] }}>
                  {radarMetricLabel(t, m.key)}
                </span>
                <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color: METRIC_COLORS[m.key] }}>{m.value}</span>
              </div>
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{ width: `${m.value}%`, background: METRIC_COLORS[m.key] }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface UserProfilePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, view another user's profile (Admin only). Pass userName for display. */
  userId?: string
  userName?: string
  /** Shown as back control when viewing another user (e.g. from admin list). */
  backLabel?: string
}

export function UserProfilePanel({ open, onOpenChange, userId: viewingUserId, userName: viewingUserName, backLabel }: UserProfilePanelProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const user = useTaskAuthStore(s => s.user)
  const {
    stats,
    pinned,
    otherUserBundleAppliedForUserId,
    fetchAll,
    fetchAchievementBundleForUser,
    pinBadges,
    getEarnedWithDef,
    getPinnedWithDef,
  } = useAchievementStore()
  const [editingPinned, setEditingPinned] = useState(false)
  const [devScoreData, setDevScoreData] = useState<DevScoreData | null>(null)
  const [tempPinned, setTempPinned] = useState<string[]>([])
  const [showBadgesDialog, setShowBadgesDialog] = useState(false)
  const [otherUserAvatar, setOtherUserAvatar] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarCropOpen, setAvatarCropOpen] = useState(false)
  const [avatarCropSrc, setAvatarCropSrc] = useState<string | null>(null)

  const isViewingOther = Boolean(viewingUserId)
  const isAdminProfile = user?.role === 'admin' && !isViewingOther

  useEffect(() => {
    if (open) {
      if (viewingUserId) {
        setOtherUserAvatar(null)
        void fetchAchievementBundleForUser(viewingUserId)
        window.api.user.getAvatarUrl(viewingUserId).then(setOtherUserAvatar)
      } else {
        setOtherUserAvatar(null)
        fetchAll()
      }
      /* Fetch Dev Score for the viewed user */
      const uid = viewingUserId ?? user?.id
      if (uid) {
        setDevScoreData(null)
        window.api.progress.getRadar(uid, nowYearMonth()).then(res => {
          if (res.status === 'success' && res.data) {
            const scores = computeRadarScores(res.data.current)
            setDevScoreData({
              score: computeDevScore(scores),
              velocity: scores.velocity,
              quality: scores.quality,
              reliability: scores.reliability,
              delivery: scores.delivery,
              collaboration: scores.collaboration,
              impact: scores.impact,
            })
          }
        })
      }
    }
  }, [open, viewingUserId, fetchAll, fetchAchievementBundleForUser, user?.id])

  const otherProfileLoading = isViewingOther && otherUserBundleAppliedForUserId !== viewingUserId

  useEffect(() => {
    if (!open && isViewingOther && user) {
      fetchAll()
    }
  }, [open, isViewingOther, user, fetchAll])

  useEffect(() => {
    setTempPinned(pinned.map(p => p.achievement_code))
  }, [pinned])

  const earnedWithDef = getEarnedWithDef()
  const pinnedWithDef = getPinnedWithDef()
  const positiveEarned = earnedWithDef.filter(e => !e.def.is_negative)
  const totalEarned = earnedWithDef.length

  const xp = stats?.xp ?? 0
  const currentRank = stats?.current_rank ?? 'newbie'
  const rankCfg = RANK_CONFIG[currentRank as keyof typeof RANK_CONFIG] ?? RANK_CONFIG.newbie
  const { nextXp, progress: rawProgress } = getNextRankXp(xp)
  /* When already at MAX rank, always show full bar regardless of xp/stats inconsistency */
  const progress = currentRank === 'legend' ? 100 : rawProgress

  const displayName = isViewingOther ? (viewingUserName ?? '—') : (user?.name ?? '—')
  const initials =
    displayName !== '—'
      ? displayName
        .split(/\s+/)
        .map(w => w[0]?.toUpperCase())
        .join('')
        .slice(0, 2)
      : '??'

  const handleSavePinned = async () => {
    await pinBadges(tempPinned)
    setEditingPinned(false)
  }

  const displayAvatarUrl = isViewingOther ? otherUserAvatar : (user?.avatarUrl ?? null)

  const handlePickAvatarFile = async () => {
    if (!user || uploadingAvatar) return
    const filePath = await window.api.user.selectAvatarFile()
    if (!filePath) return
    const prep = await window.api.user.readAvatarFileAsDataUrl(filePath)
    if (prep.status !== 'success' || !prep.data?.dataUrl) {
      toast.error(prep.message ?? t('achievement.avatarCropLoadError'))
      return
    }
    setAvatarCropSrc(prep.data.dataUrl)
    setAvatarCropOpen(true)
  }

  const handleAvatarCropped = async (dataUrl: string) => {
    if (!user) {
      toast.error(t('achievement.avatarUploadError', 'Failed to upload avatar'))
      throw new Error('NO_SESSION')
    }
    setUploadingAvatar(true)
    try {
      const res = await window.api.user.uploadAvatar(dataUrl)
      if (res.status === 'success' && res.data?.avatarUrl) {
        const token = useTaskAuthStore.getState().token
        if (token) {
          useTaskAuthStore.getState().setSession(token, { ...user, avatarUrl: res.data.avatarUrl })
        }
        toast.success(t('achievement.avatarUploadSuccess', 'Avatar updated successfully'))
        return
      }
      const msg = res.message ?? t('achievement.avatarUploadError', 'Failed to upload avatar')
      toast.error(msg)
      throw new Error('UPLOAD_FAILED')
    } catch (e) {
      if (e instanceof Error && (e.message === 'UPLOAD_FAILED' || e.message === 'NO_SESSION')) throw e
      toast.error(t('achievement.avatarUploadError', 'Failed to upload avatar'))
      throw e
    } finally {
      setUploadingAvatar(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="pl-6 pt-3 pb-3 border-b space-y-0 gap-0">
            <div className="flex items-center gap-2 min-w-0">
              {isViewingOther && backLabel && (
                <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 -ml-2 gap-1 px-2" onClick={() => onOpenChange(false)}>
                  <ChevronLeft className="h-4 w-4" />
                  <span className="truncate max-w-[10rem]">{backLabel}</span>
                </Button>
              )}
              <DialogTitle className="text-base min-w-0 truncate">{isViewingOther ? `${displayName}'s Profile` : 'My Profile'}</DialogTitle>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto relative min-h-[240px]">
            {otherProfileLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-[1px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
              </div>
            )}
            {/* Avatar + Rank + XP */}
            <div className={cn('flex flex-col items-center gap-2 pt-5 pb-4 px-6', otherProfileLoading && 'pointer-events-none opacity-40')}>
              {/* Avatar với hover overlay upload */}
              <div className={cn('relative rounded-full group/avatar-wrapper', isAdminProfile ? 'rank-glow-admin' : rankCfg.glowClass)}>
                <div className="relative">
                  <Avatar
                    className={cn(
                      'h-20! w-20! ring-4 ring-offset-2 ring-offset-background transition-shadow',
                      isAdminProfile ? 'ring-red-400 dark:ring-red-500' : rankCfg.ringColor,
                      isAdminProfile ? 'bg-red-50 dark:bg-red-900/30' : rankCfg.bgColor,
                      !isViewingOther && 'cursor-pointer'
                    )}
                    size="lg"
                  >
                    {displayAvatarUrl && <AvatarImage src={displayAvatarUrl} alt={displayName} className="object-cover" />}
                    <AvatarFallback className={cn('text-4xl font-bold', isAdminProfile ? 'text-red-600 dark:text-red-400' : rankCfg.color)}>{initials}</AvatarFallback>
                  </Avatar>
                  {!isViewingOther && (
                    <button
                      type="button"
                      onClick={handlePickAvatarFile}
                      disabled={uploadingAvatar}
                      className={cn(
                        'absolute inset-0 flex items-center justify-center rounded-full cursor-pointer',
                        'bg-black/50 opacity-0 group-hover/avatar-wrapper:opacity-100 transition-opacity duration-200',
                        'hover:bg-black/60 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        uploadingAvatar && 'opacity-100 bg-black/50 cursor-wait'
                      )}
                      title={t('achievement.uploadAvatar', 'Upload avatar')}
                    >
                      {uploadingAvatar ? <Loader2 size={32} className="animate-spin text-white" /> : <Camera size={32} className="text-white" />}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-center gap-1 pt-1">
                <div className="font-semibold text-sm">{displayName}</div>
                {isAdminProfile ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-bold text-xs text-white"
                    style={{ background: 'linear-gradient(135deg, #991b1b, #dc2626, #f87171)' }}
                  >
                    🛡️ ADMIN
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-bold text-xs text-white"
                    style={RANK_BADGE_BG[currentRank] ?? RANK_BADGE_BG.newbie}
                  >
                    <RankBadge rank={currentRank} size="xs" showLabel={false} />
                    {rankCfg.label}
                  </span>
                )}
              </div>

              {/* XP Bar */}
              <div className="w-full max-w-xs space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{xp.toLocaleString()} XP</span>
                  {currentRank === 'legend' ? (
                    <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-rose-500 via-violet-500 to-blue-500">MAX RANK 👑</span>
                  ) : (
                    <span>Next: {nextXp.toLocaleString()} XP</span>
                  )}
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-700',
                      currentRank === 'legend' && 'legend-xp-bar',
                    )}
                    style={
                      currentRank === 'legend'
                        ? { width: `${progress}%` }
                        : { width: `${progress}%`, background: XP_BAR_COLOR[currentRank] ?? '#94a3b8' }
                    }
                  />
                </div>
                {currentRank !== 'legend' && <div className="text-center text-[10px] text-muted-foreground">{progress.toFixed(1)}% to next rank</div>}
              </div>
            </div>

            {/* Dev Score Section */}
            {devScoreData && (
              <div className={cn(otherProfileLoading && 'pointer-events-none opacity-40')}>
                <DevScoreSection data={devScoreData} />
              </div>
            )}

            {/* Stats Grid */}
            <div className={cn('px-6 pb-4', otherProfileLoading && 'pointer-events-none opacity-40')}>
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Tasks Done" value={stats?.total_tasks_done ?? 0} />
                <StatCard label="Commits" value={stats?.total_commits ?? 0} />
                <StatCard label="Reviews" value={stats?.total_reviews ?? 0} />
                <StatCard label="Reports" value={stats?.total_reports ?? 0} />
                <StatCard label="Files Committed" value={(stats?.total_files_committed ?? 0).toLocaleString()} />
                <StatCard
                  label="Streak"
                  value={`${stats?.current_streak_days ?? 0}d`}
                  icon={<Flame size={12} className="text-orange-500" />}
                  highlight={Boolean(stats?.current_streak_days && stats.current_streak_days >= 3)}
                />
              </div>
            </div>

            {/* Pinned Badges */}
            <div className={cn('px-6 pb-4 border-t pt-3', otherProfileLoading && 'pointer-events-none opacity-40')}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <Pin size={12} />
                  Pinned Badges
                  <span className="text-muted-foreground font-normal normal-case">({pinned.length}/3)</span>
                </div>
                {earnedWithDef.filter(e => !e.def.is_negative).length > 0 && !isViewingOther && (
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingPinned(!editingPinned)}>
                    {editingPinned ? <PinOff size={12} /> : <Pin size={12} />}
                    {editingPinned ? 'Cancel' : 'Edit'}
                  </Button>
                )}
              </div>

              {editingPinned ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Select up to 3 badges to display.</p>
                  <BadgeSelector earned={positiveEarned} pinned={tempPinned} onChange={setTempPinned} />
                  <Button size="sm" className="w-full mt-2" onClick={handleSavePinned}>
                    Save
                  </Button>
                </div>
              ) : pinnedWithDef.length > 0 ? (
                <div className="grid grid-cols-3 gap-3 place-items-center">
                  {pinnedWithDef.map(b => (
                    <BadgeCard key={b.achievement_code} def={b.def} earned={b} size="sm" showName variant="filled" />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">{isViewingOther ? 'No badges pinned yet.' : 'No badges pinned yet. Click Edit to pin badges.'}</p>
              )}
            </div>

            {/* Badges Link */}
            <div className={cn('px-6 pb-6 border-t pt-3', otherProfileLoading && 'pointer-events-none opacity-40')}>
              <Button variant={buttonVariant} size="sm" className="w-full gap-2" onClick={() => setShowBadgesDialog(true)}>
                <Award size={14} />
                {t('achievement.viewAllBadges', { count: totalEarned })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AchievementBadgesDialog open={showBadgesDialog} onOpenChange={setShowBadgesDialog} userId={viewingUserId} userName={viewingUserName} />
      <AvatarCropDialog
        open={avatarCropOpen}
        onOpenChange={open => {
          setAvatarCropOpen(open)
          if (!open) setAvatarCropSrc(null)
        }}
        imageSrc={avatarCropSrc}
        onCropped={handleAvatarCropped}
      />
    </>
  )
}
