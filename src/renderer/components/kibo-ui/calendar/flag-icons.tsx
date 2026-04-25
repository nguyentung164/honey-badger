import { cn } from '@/lib/utils'

type FlagProps = {
  className?: string
}

/** Cờ Nhật (tỉ lệ 3:2), dùng làm icon nhỏ trong lịch. */
export function FlagJp({ className }: FlagProps) {
  return (
    <svg
      aria-hidden
      className={cn('rounded-sm', className)}
      viewBox="0 0 900 600"
    >
      <rect fill="#fff" height="600" width="900" />
      <circle cx="450" cy="300" fill="#bc002d" r="180" />
    </svg>
  )
}

/** Cờ Việt Nam (tỉ lệ 3:2), dùng làm icon nhỏ trong lịch. */
export function FlagVn({ className }: FlagProps) {
  return (
    <svg aria-hidden className={cn('rounded-sm', className)} viewBox="0 0 900 600">
      <rect fill="#da251d" height="600" width="900" />
      <polygon
        fill="#ffcd00"
        points="450,135 486,248 605,248 510,319 546,432 450,361 354,432 390,319 295,248 414,248"
      />
    </svg>
  )
}

export function CountryFlag({ code, className }: { code: 'jp' | 'vn' } & FlagProps) {
  return code === 'jp' ? <FlagJp className={className} /> : <FlagVn className={className} />
}
