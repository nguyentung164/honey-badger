import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Archive,
  Award,
  BadgeCheck,
  BookMarked,
  BookOpen,
  Bug,
  BugOff,
  CalendarCheck,
  CalendarCheck2,
  CalendarDays,
  CalendarX,
  CheckCircle,
  Clock,
  Crown,
  DraftingCompass,
  Eye,
  Factory,
  FileCode,
  FileText,
  Flame,
  Gem,
  Ghost,
  GitBranch,
  GitCommit,
  GitMerge,
  HardDrive,
  History,
  Layers,
  Lock,
  Moon,
  Package,
  PenLine,
  Scissors,
  ScrollText,
  SearchCheck,
  Send,
  Server,
  Shield,
  ShieldCheck,
  ShieldPlus,
  Sparkles,
  Sunrise,
  Swords,
  Telescope,
  Trophy,
  Upload,
  VolumeX,
  Waves,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateByLocale } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import type { AchievementDef, UserAchievement } from '@/stores/useAchievementStore'

const ICON_MAP: Record<string, LucideIcon> = {
  'alert-triangle': AlertTriangle,
  archive: Archive,
  award: Award,
  'badge-check': BadgeCheck,
  'book-marked': BookMarked,
  'book-open': BookOpen,
  bug: Bug,
  'bug-off': BugOff,
  'calendar-check': CalendarCheck,
  'calendar-check-2': CalendarCheck2,
  'calendar-days': CalendarDays,
  'calendar-x': CalendarX,
  'check-circle': CheckCircle,
  clock: Clock,
  crown: Crown,
  'drafting-compass': DraftingCompass,
  eye: Eye,
  factory: Factory,
  'file-code': FileCode,
  'file-text': FileText,
  flame: Flame,
  gem: Gem,
  ghost: Ghost,
  'git-branch': GitBranch,
  'git-commit': GitCommit,
  'git-merge': GitMerge,
  'hard-drive': HardDrive,
  history: History,
  layers: Layers,
  moon: Moon,
  package: Package,
  'pen-line': PenLine,
  scissors: Scissors,
  'scroll-text': ScrollText,
  'search-check': SearchCheck,
  send: Send,
  server: Server,
  shield: Shield,
  'shield-check': ShieldCheck,
  'shield-plus': ShieldPlus,
  sparkles: Sparkles,
  sunrise: Sunrise,
  swords: Swords,
  telescope: Telescope,
  trophy: Trophy,
  upload: Upload,
  'volume-x': VolumeX,
  waves: Waves,
  zap: Zap,
}

const TIER_CONFIG = {
  bronze: {
    border: 'border-orange-700',
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    bgFilled: 'bg-orange-700/90 dark:bg-orange-800/90',
    iconColor: 'text-orange-800 dark:text-orange-400',
    iconColorFilled: 'text-white',
    label: 'Bronze',
    labelColor: 'text-orange-800 dark:text-orange-400',
  },
  silver: {
    border: 'border-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-800/60',
    bgFilled: 'bg-slate-500/90 dark:bg-slate-600/90',
    iconColor: 'text-slate-500 dark:text-slate-300',
    iconColorFilled: 'text-white',
    label: 'Silver',
    labelColor: 'text-slate-500 dark:text-slate-300',
  },
  gold: {
    border: 'border-yellow-500',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    bgFilled: 'bg-yellow-500/90 dark:bg-yellow-600/90',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    iconColorFilled: 'text-white',
    label: 'Gold',
    labelColor: 'text-yellow-600 dark:text-yellow-400',
  },
  special: {
    border: 'border-violet-500',
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    bgFilled: 'bg-violet-500/90 dark:bg-violet-600/90',
    iconColor: 'text-violet-600 dark:text-violet-400',
    iconColorFilled: 'text-white',
    label: 'Special',
    labelColor: 'text-violet-600 dark:text-violet-400',
  },
  negative: {
    border: 'border-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    bgFilled: 'bg-orange-500/90 dark:bg-orange-600/90',
    iconColor: 'text-orange-500 dark:text-orange-400',
    iconColorFilled: 'text-white',
    label: 'Struggle',
    labelColor: 'text-orange-500 dark:text-orange-400',
  },
} as const

const SIZE_CONFIG = {
  '3xs': { container: 'h-4.5 w-4.5', icon: 9, countBubble: 'text-[5px] h-1.5 min-w-[6px] -top-0.5 -right-0.5' },
  '2xs': { container: 'h-5 w-5', icon: 10, countBubble: 'text-[7px] h-2.5 min-w-[10px] -top-0.5 -right-0.5' },
  xs: { container: 'h-7 w-7', icon: 12, countBubble: 'text-[8px] h-3 min-w-[12px] -top-1 -right-1' },
  sm: { container: 'h-10 w-10', icon: 16, countBubble: 'text-[9px] h-3.5 min-w-[14px] -top-1 -right-1' },
  md: { container: 'h-14 w-14', icon: 22, countBubble: 'text-xs h-4 min-w-[16px] -top-1 -right-1' },
  lg: { container: 'h-20 w-20', icon: 30, countBubble: 'text-xs h-5 min-w-[20px] -top-1 -right-1' },
} as const

type BadgeSize = keyof typeof SIZE_CONFIG

/** Ô chứa ảnh achievement (`img:`) — lớn hơn bản Lucide cùng `size` (3xs: trùng khung icon, dùng TitleBar). */
const SIZE_CONFIG_ASSET_CONTAINER: Record<BadgeSize, string> = {
  '3xs': 'h-4.5 w-4.5 min-w-[1.125rem] min-h-[1.125rem] max-w-[1.125rem] max-h-[1.125rem] flex-none',
  '2xs': 'h-11 w-11',
  xs: 'h-14 w-14',
  sm: 'h-[5.5rem] w-[5.5rem]',
  md: 'h-[8rem] w-[8rem]',
  lg: 'h-48 w-48',
}

/** Màu hạt bụi theo tier badge (bronze / silver / …) — `R, G, B`. */
const TIER_DUST_RGB: Record<string, string> = {
  bronze: '245, 158, 11',
  silver: '100, 116, 139',
  gold: '202, 138, 4',
  special: '124, 58, 237',
  negative: '234, 88, 12',
}

/** Ring khi badge được chọn (ghim) — theo tier, tránh tím mặc định cho bronze/welcome. */
const TIER_SELECTED_RING: Record<string, string> = {
  bronze: 'ring-amber-500',
  silver: 'ring-slate-400',
  gold: 'ring-yellow-500',
  special: 'ring-violet-500',
  negative: 'ring-orange-500',
}

/** Khoảng tràn bụi (px) quanh ảnh theo size. */
const ASSET_DUST_OUTSET: Record<BadgeSize, number> = {
  '3xs': 12,
  '2xs': 14,
  xs: 16,
  sm: 20,
  md: 28,
  lg: 40,
}

/** Giống màu sparkle cuối dialog unlock — `AchievementUnlockDialog` `TIER_SPARKLE_COLOR`. */
const TIER_RISE_DUST_COLOR: Record<string, string> = {
  bronze: 'rgba(205,127,50,0.55)',
  silver: 'rgba(192,192,210,0.55)',
  gold: 'rgba(255,215,0,0.65)',
  special: 'rgba(139,92,246,0.55)',
  negative: 'rgba(249,115,22,0.55)',
}

/** Quãng bay dọc (px) gốc cho lg — nhân scale theo size badge. */
const SHOWCASE_RISE_SCALE: Record<BadgeSize, number> = {
  '3xs': 0.22,
  '2xs': 0.34,
  xs: 0.42,
  sm: 0.55,
  md: 0.72,
  lg: 1,
}

type DustParticle = {
  left: string
  top: string
  sz: number
  glow: number
  a: number
  tx: number
  ty: number
  dur: number
  delay: string
}

/** Nhiều hạt nhỏ, drift chậm — lớp khói mịn quanh ảnh (không emphasis). */
function buildFineDustParticles(count: number): DustParticle[] {
  const particles: DustParticle[] = []
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + i * 0.17
    const r = 44 + (i % 10) * 2.05
    const left = `${50 + Math.cos(angle) * r}%`
    const top = `${50 + Math.sin(angle) * r}%`
    const tx = Math.round(Math.cos(angle + 0.9) * 22) / 10
    const ty = Math.round(Math.sin(angle + 0.9) * -22) / 10
    particles.push({
      left,
      top,
      sz: 1 + (i % 5 === 0 ? 1 : 0),
      glow: 1.2 + (i % 5) * 0.55,
      a: 0.12 + (i % 8) * 0.038,
      tx,
      ty,
      dur: 5.6 + (i % 10) * 0.52,
      delay: `${((i * 0.047) % 1.2).toFixed(3)}s`,
    })
  }
  return particles
}

const ASSET_DUST_PARTICLES = buildFineDustParticles(46)

type RiseDustSlot = {
  leftPct: number
  /** % từ đáy khung — tán đều + vài hạt hơi dưới mép để không thành một hàng. */
  bottomPct: number
  sz: number
  delay: number
  dur: number
  /** Độ cao bay (px) trước khi nhân SHOWCASE_RISE_SCALE — thiết kế cho lg. */
  riseBasePx: number
  /** Lệch ngang (px) kết thúc animation — nhân riseScale khi render. */
  driftXPx: number
}

/** Số giả ngẫu nhiên 0..1 ổn định theo index (không nhấp nháy mỗi render). */
function dustFrac(i: number, salt: number): number {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Nhiều hạt: đáy rải theo chiều dọc + ngang, bay lên có drift ngang nhẹ. */
function buildShowcaseRiseParticles(count: number): RiseDustSlot[] {
  const slots: RiseDustSlot[] = []
  for (let i = 0; i < count; i++) {
    const leftPct = 1.5 + dustFrac(i, 1.73) * 95.5
    const bottomPct = -1.2 + dustFrac(i, 0.41) * 15.8
    const sz = 1.45 + dustFrac(i, 3.11) * 2.85
    const delay = (dustFrac(i, 0.92) * 2.95 + (i % 5) * 0.09) % 2.95
    const dur = 2.25 + dustFrac(i, 4.07) * 2.15
    const riseBasePx = 128 + Math.floor(dustFrac(i, 5.19) * 118)
    const driftXPx = Math.round((dustFrac(i, 2.51) * 2 - 1) * 20)
    slots.push({ leftPct, bottomPct, sz, delay, dur, riseBasePx, driftXPx })
  }
  return slots
}

const SHOWCASE_RISE_PARTICLES = buildShowcaseRiseParticles(132)

function AchievementAssetDust({ tier, size, emphasis = false }: { tier: string; size: BadgeSize; emphasis?: boolean }) {
  const rgb = TIER_DUST_RGB[tier] ?? TIER_DUST_RGB.bronze
  const outset = ASSET_DUST_OUTSET[size]

  if (emphasis) {
    const color = TIER_RISE_DUST_COLOR[tier] ?? TIER_RISE_DUST_COLOR.bronze
    const riseScale = SHOWCASE_RISE_SCALE[size]
    return (
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-visible"
        aria-hidden
      >
        {SHOWCASE_RISE_PARTICLES.map((p, i) => {
          const risePx = Math.round(p.riseBasePx * riseScale)
          const driftX = Math.round(p.driftXPx * riseScale)
          return (
            <div
              key={i}
              className="animate-achievement-badge-dust-rise absolute shrink-0 rounded-full [aspect-ratio:1/1]"
              style={{
                left: `${p.leftPct.toFixed(2)}%`,
                bottom: `${p.bottomPct.toFixed(2)}%`,
                marginLeft: -p.sz / 2,
                width: p.sz,
                height: p.sz,
                minWidth: p.sz,
                minHeight: p.sz,
                background: color,
                boxShadow: `0 0 ${p.sz * 2}px ${color}`,
                ['--dust-rise-px' as string]: `-${risePx}px`,
                ['--dust-rise-drift-x' as string]: `${driftX}px`,
                ['--dust-rise-dur' as string]: `${p.dur}s`,
                ['--dust-rise-delay' as string]: `${p.delay}s`,
              }}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className="pointer-events-none absolute z-0 overflow-visible" style={{ inset: -outset }} aria-hidden>
      {ASSET_DUST_PARTICLES.map((p, i) => (
        <span key={i} className="absolute" style={{ left: p.left, top: p.top, transform: 'translate(-50%, -50%)' }}>
          <span
            className="block shrink-0 rounded-full [aspect-ratio:1/1] animate-achievement-asset-dust"
            style={{
              width: p.sz,
              height: p.sz,
              minWidth: p.sz,
              minHeight: p.sz,
              background: `rgba(${rgb}, ${p.a})`,
              boxShadow: `0 0 ${p.glow}px rgba(${rgb}, 0.26), 0 0 ${p.glow * 1.8}px rgba(${rgb}, 0.12)`,
              filter: 'blur(0.75px)',
              ['--dust-tx' as string]: `${p.tx}px`,
              ['--dust-ty' as string]: `${p.ty}px`,
              ['--dust-dur' as string]: `${p.dur}s`,
              animationDelay: p.delay,
            }}
          />
        </span>
      ))}
    </div>
  )
}

function getDynamicIcon(iconName: string, size: number, color: string) {
  const IconComp = ICON_MAP[iconName] ?? Award
  return (
    <IconComp
      size={size}
      width={size}
      height={size}
      className={color}
      style={{ width: size, height: size, minWidth: size, minHeight: size, flexShrink: 0 }}
    />
  )
}

/** `img:` + đường dẫn trong `src/resources/public` (vd. `/achievements/x.png`). */
function achievementIconToImageSrc(icon: string): string | null {
  if (!icon.startsWith('img:')) return null
  return icon.slice(4)
}

function BadgeGraphic({
  icon,
  sizePx,
  lucideColorClass,
  assetTinyInline = false,
}: {
  icon: string
  sizePx: number
  lucideColorClass: string
  /** 3xs/TitleBar: tránh flex `min-size:auto` theo kích thước nội tại ảnh làm tràn khung. */
  assetTinyInline?: boolean
}) {
  const imgSrc = achievementIconToImageSrc(icon)
  if (imgSrc) {
    return (
      <img
        src={imgSrc}
        alt=""
        draggable={false}
        className={cn(
          'block object-contain select-none',
          // min-w-0 / min-h-0: bắt buộc — ảnh lớn không còn “đẩy” flex item vượt parent
          'min-h-0 min-w-0 max-h-full max-w-full h-full w-full',
          assetTinyInline && 'rounded-sm'
        )}
        decoding="async"
      />
    )
  }
  return getDynamicIcon(icon, sizePx, lucideColorClass)
}

interface BadgeCardProps {
  def: AchievementDef
  earned?: UserAchievement | null
  size?: '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg'
  showName?: boolean
  onClick?: () => void
  selected?: boolean
  className?: string
  forceUnlocked?: boolean
  variant?: 'default' | 'filled'
  showSelectedRing?: boolean
  /** % users đã earn achievement này (0-100). Hiển thị trong tooltip. */
  rarity?: number
  /** Dialog unlock: bụi quỹ đạo 3D quanh ảnh, rõ và dày hơn. */
  dustEmphasis?: boolean
}

function getRarityLabel(pct: number): { label: string; color: string } {
  if (pct <= 5) return { label: 'Cực hiếm', color: 'text-violet-500' }
  if (pct <= 15) return { label: 'Hiếm', color: 'text-blue-500' }
  if (pct <= 35) return { label: 'Không phổ biến', color: 'text-green-500' }
  return { label: 'Phổ biến', color: 'text-muted-foreground' }
}

export function BadgeCard({
  def,
  earned,
  size = 'md',
  showName = false,
  onClick,
  selected,
  className,
  forceUnlocked = false,
  variant = 'default',
  showSelectedRing = true,
  rarity,
  dustEmphasis = false,
}: BadgeCardProps) {
  const { t, i18n } = useTranslation()
  const tierCfg = TIER_CONFIG[def.tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.bronze
  const sizeCfg = SIZE_CONFIG[size]
  const isLocked = !forceUnlocked && !earned
  const earnedCount = earned?.earned_count ?? 0
  const isFilled = variant === 'filled'
  const usesAssetIcon = achievementIconToImageSrc(def.icon) !== null
  const isInlineTinyAsset = usesAssetIcon && size === '3xs'
  const badgeBoxClass = usesAssetIcon ? SIZE_CONFIG_ASSET_CONTAINER[size] : sizeCfg.container
  const lockIconPx = usesAssetIcon ? Math.round(sizeCfg.icon * 1.65) : sizeCfg.icon

  const cardClassName = cn(
    'relative inline-flex min-w-0 min-h-0 flex-col items-center gap-1 bg-transparent border-none p-0',
    isInlineTinyAsset && 'shrink-0 overflow-hidden',
    onClick ? 'cursor-pointer' : 'cursor-default',
    className
  )
  const innerContent = (
    <>
      <div
        className={cn(
          'relative box-border flex items-center justify-center transition-all duration-200',
          badgeBoxClass,
          usesAssetIcon && !isLocked && (isInlineTinyAsset ? 'overflow-hidden rounded-md' : 'overflow-visible'),
          usesAssetIcon
            ? cn(
              'border-0 bg-transparent shadow-none',
              isLocked && 'opacity-45 grayscale',
              !isLocked && (isInlineTinyAsset ? 'hover:scale-100' : 'hover:scale-105')
            )
            : cn(
              'rounded-xl',
              isFilled ? 'border-0' : 'border-2',
              isFilled && !isLocked ? tierCfg.bgFilled : isFilled && isLocked ? 'bg-gray-200 dark:bg-gray-700 opacity-50' : tierCfg.bg,
              !isFilled && (isLocked ? 'border-gray-300 dark:border-gray-700 opacity-40 grayscale' : tierCfg.border),
              !isLocked && def.tier === 'gold' && 'hover:shadow-yellow-400/40 hover:shadow-md',
              !isLocked && 'hover:scale-110'
            ),
          selected &&
          showSelectedRing &&
          cn('ring-2 ring-offset-1 ring-offset-background', TIER_SELECTED_RING[def.tier] ?? TIER_SELECTED_RING.bronze)
        )}
      >
        {usesAssetIcon && !isLocked && !isInlineTinyAsset && (
          <AchievementAssetDust tier={def.tier} size={size} emphasis={dustEmphasis} />
        )}
        <div
          className={cn(
            'relative z-[1] box-border flex h-full w-full min-h-0 min-w-0 items-center justify-center',
            isInlineTinyAsset && 'overflow-hidden'
          )}
        >
          {isLocked ? (
            <Lock
              size={lockIconPx}
              width={lockIconPx}
              height={lockIconPx}
              className="text-gray-400"
              style={{ width: lockIconPx, height: lockIconPx, minWidth: lockIconPx, minHeight: lockIconPx, flexShrink: 0 }}
            />
          ) : (
            <BadgeGraphic
              icon={def.icon}
              sizePx={sizeCfg.icon}
              lucideColorClass={isFilled ? tierCfg.iconColorFilled : tierCfg.iconColor}
              assetTinyInline={isInlineTinyAsset}
            />
          )}
        </div>

        {/* Count bubble for repeatable badges */}
        {earnedCount > 1 && (
          <span
            className={cn(
              'absolute z-[2] flex items-center justify-center rounded-full bg-red-500 text-white font-bold px-1 leading-none',
              sizeCfg.countBubble,
              'animate-bounce-once'
            )}
          >
            {earnedCount > 99 ? '99+' : earnedCount}
          </span>
        )}
      </div>

      {showName && (
        <span
          className={cn(
            'text-center leading-tight max-w-full truncate',
            size === '2xs' ? 'text-[8px]' : size === 'xs' ? 'text-[9px]' : size === 'sm' ? 'text-[10px]' : 'text-xs',
            isLocked ? 'text-muted-foreground' : 'text-foreground font-medium'
          )}
        >
          {t(`achievement.def.${def.code}.name`, { defaultValue: def.name })}
        </span>
      )}
    </>
  )
  const card = onClick ? (
    <button
      type="button"
      className={cardClassName}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') onClick()
      }}
    >
      {innerContent}
    </button>
  ) : (
    <div className={cardClassName}>{innerContent}</div>
  )

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] space-y-1 text-xs">
          <div className="font-semibold">{t(`achievement.def.${def.code}.name`, { defaultValue: def.name })}</div>
          <div className={cn('text-[10px] font-medium uppercase tracking-wide', tierCfg.labelColor)}>{tierCfg.label}</div>
          <div className="text-muted-foreground">{t(`achievement.def.${def.code}.description`, { defaultValue: def.description })}</div>
          {!isLocked && def.xp_reward > 0 && <div className="text-yellow-500 font-medium">+{def.xp_reward} XP</div>}
          {!isLocked && earned && (
            <div className="text-muted-foreground">
              First earned: {formatDateByLocale(earned.first_earned_at, i18n.language)}
              {earnedCount > 1 && <span> · Count: {earnedCount}</span>}
            </div>
          )}
          {isLocked && <div className="text-muted-foreground italic">Not yet earned</div>}
          {rarity !== undefined && (
            <div className="flex items-center gap-1.5 pt-0.5 border-t border-border/50">
              <span className={cn('font-semibold', getRarityLabel(rarity).color)}>
                {getRarityLabel(rarity).label}
              </span>
              <span className="text-muted-foreground">· {rarity}% người dùng đã đạt</span>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface BadgeProgressProps {
  def: AchievementDef
  stats: Partial<Record<string, number>>
  size?: 'sm' | 'md'
  variant?: 'default' | 'filled'
  /** Khi true, luôn hiện icon achievement thay vì ổ khóa (cho locked badges) */
  forceUnlocked?: boolean
  rarity?: number
}

// Map condition_type values that don't directly match a stats field
const CONDITION_TYPE_TO_STAT: Record<string, string> = {
  commit_streak_7: 'current_streak_days',
  commit_streak_14: 'current_streak_days',
  commit_streak_30: 'current_streak_days',
  commit_streak_60: 'current_streak_days',
  report_streak_7: 'current_report_streak_days',
  report_streak_14: 'current_report_streak_days',
  report_streak_30: 'current_report_streak_days',
}

// condition_types that can't be expressed as a simple numeric progress
const NO_PROGRESS_TYPES = new Set([
  'commits_after_1am',
  'commit_files_le3',
  'commit_files_16_30',
  'commit_files_gt50',
  'commit_files_ge100',
  'commit_files_gt100_neg',
  'commit_files_gt200_neg',
])

export function BadgeWithProgress({ def, stats, size = 'md', variant = 'default', forceUnlocked = false, rarity }: BadgeProgressProps) {
  const getProgress = (): number => {
    if (!def.condition_threshold) return 0
    if (NO_PROGRESS_TYPES.has(def.condition_type)) return 0
    const statKey = CONDITION_TYPE_TO_STAT[def.condition_type] ?? def.condition_type
    const value = stats[statKey] ?? 0
    return Math.min(100, (value / def.condition_threshold) * 100)
  }

  const getCurrentValue = (): number => {
    if (!def.condition_threshold) return 0
    if (NO_PROGRESS_TYPES.has(def.condition_type)) return 0
    const statKey = CONDITION_TYPE_TO_STAT[def.condition_type] ?? def.condition_type
    return stats[statKey] ?? 0
  }

  const showProgressBar = !!def.condition_threshold && !NO_PROGRESS_TYPES.has(def.condition_type)
  const progress = getProgress()
  const currentValue = getCurrentValue()

  return (
    <div className="flex flex-col items-center gap-1">
      <BadgeCard def={def} size={size} showName variant={variant} forceUnlocked={forceUnlocked} rarity={rarity} />
      {showProgressBar && (
        <div className={cn('w-full', size === 'sm' ? 'max-w-[40px]' : 'max-w-[56px]')}>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-violet-400 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-center text-[8px] text-muted-foreground mt-0.5 tabular-nums">
            {currentValue}/{def.condition_threshold}
          </div>
        </div>
      )}
    </div>
  )
}
