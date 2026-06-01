import { cn } from '@/lib/utils'

type FlagProps = {
  className?: string
  /** Stretch flag to fill the container (calendar cell backdrop). */
  cover?: boolean
}

/** Cờ Nhật (tỉ lệ 3:2), dùng làm icon nhỏ trong lịch. */
export function FlagJp({ className, cover }: FlagProps) {
  return (
    <svg
      aria-hidden
      className={cn(cover ? undefined : 'rounded-sm', className)}
      preserveAspectRatio={cover ? 'xMidYMid slice' : 'xMidYMid meet'}
      viewBox="0 0 900 600"
    >
      <rect fill="#fff" height="600" width="900" />
      <circle cx="450" cy="300" fill="#bc002d" r="180" />
    </svg>
  )
}

/** Cờ Việt Nam (tỉ lệ 3:2), dùng làm icon nhỏ trong lịch. */
export function FlagVn({ className, cover }: FlagProps) {
  return (
    <svg
      aria-hidden
      className={cn(cover ? undefined : 'rounded-sm', className)}
      preserveAspectRatio={cover ? 'xMidYMid slice' : 'xMidYMid meet'}
      viewBox="0 0 900 600"
    >
      <rect fill="#da251d" height="600" width="900" />
      <polygon fill="#ffcd00" points="450,135 486,248 605,248 510,319 546,432 450,361 354,432 390,319 295,248 414,248" />
    </svg>
  )
}

export function CountryFlag({ code, className }: { code: 'jp' | 'vn' } & FlagProps) {
  return code === 'jp' ? <FlagJp className={className} /> : <FlagVn className={className} />
}

/** Full-cell muted flag backdrop for holiday calendar cells. */
export function HolidayCellFlagBackdrop({ hasJp, hasVn }: { hasJp: boolean; hasVn: boolean }) {
  if (!hasJp && !hasVn) return null

  const flagClass = 'opacity-[0.18] dark:opacity-[0.24]'

  if (hasJp && hasVn) {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <FlagJp className={cn('absolute inset-y-0 left-0 h-full w-1/2', flagClass)} cover />
        <FlagVn className={cn('absolute inset-y-0 right-0 h-full w-1/2', flagClass)} cover />
        <div className="absolute inset-0 bg-background/35 dark:bg-background/45" />
      </div>
    )
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {hasJp ? <FlagJp className={cn('h-full w-full', flagClass)} cover /> : <FlagVn className={cn('h-full w-full', flagClass)} cover />}
      <div className="absolute inset-0 bg-background/35 dark:bg-background/45" />
    </div>
  )
}
