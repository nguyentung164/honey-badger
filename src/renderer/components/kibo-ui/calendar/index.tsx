'use client'

import { format, getDay, getDaysInMonth, isSameDay, startOfDay } from 'date-fns'
import { enUS, ja, vi } from 'date-fns/locale'
import { atom, useAtom } from 'jotai'
import { Check, ChevronLeftIcon, ChevronRightIcon, ChevronsUpDown } from 'lucide-react'
import { createContext, memo, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatVietnameseLunarCompact } from '@/lib/lunarVietnamese'
import { cn } from '@/lib/utils'
import { CountryFlag } from './flag-icons'

export type CalendarState = {
  month: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
  year: number
}

const monthAtom = atom<CalendarState['month']>(new Date().getMonth() as CalendarState['month'])
const yearAtom = atom<CalendarState['year']>(new Date().getFullYear())

export const useCalendarMonth = () => useAtom(monthAtom)
export const useCalendarYear = () => useAtom(yearAtom)

export type CalendarDensity = 'default' | 'compact'

type CalendarContextProps = {
  locale: Intl.LocalesArgument
  startDay: number
  showLunar: boolean
  density: CalendarDensity
}

const CalendarContext = createContext<CalendarContextProps>({
  locale: 'en-US',
  startDay: 0,
  showLunar: false,
  density: 'default',
})

/** Accent color for Âm lịch text (distinct from Dương lịch / muted). */
const lunarTextClass = 'text-amber-700 tabular-nums dark:text-amber-400'

export type Status = {
  id: string
  name: string
  color: string
  countryCode?: 'jp' | 'vn'
}

export type Feature = {
  id: string
  name: string
  /** JP: extra tooltip line — Vietnamese when available, else English (date-holidays often repeats JA for `vi`). */
  jpTooltipSubtitle?: string
  startAt: Date
  endAt: Date
  status: Status
}

function calendarLocaleToDateFns(locale: Intl.LocalesArgument) {
  const s = String(locale).toLowerCase()
  if (s.startsWith('vi')) return vi
  if (s.startsWith('ja')) return ja
  return enUS
}

function featureCountryKey(f: Feature) {
  return f.status.countryCode ?? f.status.id
}

function splitFeaturesByCountry(features: Feature[]) {
  const vn: Feature[] = []
  const jp: Feature[] = []
  const other: Feature[] = []
  for (const f of features) {
    const key = featureCountryKey(f)
    if (key === 'vn') vn.push(f)
    else if (key === 'jp') jp.push(f)
    else other.push(f)
  }
  return { jp, other, vn }
}

function DayHolidaysTooltipPanel({ dayDate, features, locale, showLunar }: { dayDate: Date; features: Feature[]; locale: Intl.LocalesArgument; showLunar: boolean }) {
  const dfLocale = calendarLocaleToDateFns(locale)
  const { vn, jp, other } = splitFeaturesByCountry(features)

  return (
    <div className="max-w-sm space-y-3 text-left text-xs">
      <div>
        <p className="font-medium text-foreground text-sm">{format(dayDate, 'PPP', { locale: dfLocale })}</p>
        {showLunar && <p className={cn('mt-0.5', lunarTextClass)}>{formatVietnameseLunarCompact(dayDate)}</p>}
      </div>
      {vn.length > 0 && (
        <section>
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
            <CountryFlag className="h-2.5 w-[15px] shrink-0" code="vn" />
            <span>{vn[0]?.status.name}</span>
          </div>
          <div className="space-y-0.5 text-muted-foreground">
            {vn.map(f => (
              <div key={f.id}>{f.name}</div>
            ))}
          </div>
        </section>
      )}
      {jp.length > 0 && (
        <section>
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
            <CountryFlag className="h-2.5 w-[15px] shrink-0" code="jp" />
            <span>{jp[0]?.status.name}</span>
          </div>
          <div className="space-y-0.5 text-muted-foreground">
            {jp.map(f => (
              <div key={f.id}>
                <div>{f.name}</div>
                {f.jpTooltipSubtitle != null && f.jpTooltipSubtitle !== '' && (
                  <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{f.jpTooltipSubtitle}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {other.length > 0 && (
        <section>
          <div className="mb-1 font-semibold text-foreground">{other[0]?.status.name}</div>
          <div className="space-y-0.5 text-muted-foreground">
            {other.map(f => (
              <div key={f.id}>{f.name}</div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

type ComboboxProps = {
  value: string
  setValue: (value: string) => void
  data: {
    value: string
    label: string
  }[]
  labels: {
    button: string
    empty: string
    search: string
  }
  className?: string
}

export const monthsForLocale = (localeName: Intl.LocalesArgument, monthFormat: Intl.DateTimeFormatOptions['month'] = 'long') => {
  const format = new Intl.DateTimeFormat(localeName, { month: monthFormat }).format

  return [...new Array(12).keys()].map(m => format(new Date(Date.UTC(2021, m, 2))))
}

export const daysForLocale = (locale: Intl.LocalesArgument, startDay: number) => {
  const weekdays: string[] = []
  const baseDate = new Date(2024, 0, startDay)

  for (let i = 0; i < 7; i++) {
    weekdays.push(new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(baseDate))
    baseDate.setDate(baseDate.getDate() + 1)
  }

  return weekdays
}

const Combobox = ({ value, setValue, data, labels, className }: ComboboxProps) => {
  const [open, setOpen] = useState(false)

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button aria-expanded={open} className={cn('w-40 justify-between capitalize', className)} variant="outline">
          {value ? data.find(item => item.value === value)?.label : labels.button}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[110] w-40 p-0">
        <Command
          filter={(value, search) => {
            const label = data.find(item => item.value === value)?.label

            return label?.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder={labels.search} />
          <CommandList>
            <CommandEmpty>{labels.empty}</CommandEmpty>
            <CommandGroup>
              {data.map(item => (
                <CommandItem
                  className="capitalize"
                  key={item.value}
                  onSelect={currentValue => {
                    setValue(currentValue)
                    setOpen(false)
                  }}
                  value={item.value}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === item.value ? 'opacity-100' : 'opacity-0')} />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

type OutOfBoundsDayProps = {
  day: number
  lunarLabel?: string
}

const OutOfBoundsDay = ({ day, lunarLabel }: OutOfBoundsDayProps) => {
  const { density } = useContext(CalendarContext)
  const compact = density === 'compact'

  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col bg-secondary text-muted-foreground',
        compact ? 'gap-0.5 p-0.5' : 'gap-0.5 p-1 text-xs'
      )}
    >
      <span className={cn('tabular-nums', compact ? 'text-base font-semibold text-foreground' : '')}>{day}</span>
      {lunarLabel != null && lunarLabel !== '' && (
        <span className={cn('leading-tight', compact ? 'text-[10px]' : 'text-[10px] opacity-90', lunarTextClass)}>{lunarLabel}</span>
      )}
    </div>
  )
}

export type CalendarBodyProps = {
  features: Feature[]
  children: (props: { feature: Feature }) => ReactNode
}

export const CalendarBody = ({ features, children }: CalendarBodyProps) => {
  const [month] = useCalendarMonth()
  const [year] = useCalendarYear()
  const { locale, startDay, showLunar, density } = useContext(CalendarContext)
  const compact = density === 'compact'

  // Memoize expensive date calculations
  const currentMonthDate = useMemo(() => new Date(year, month, 1), [year, month])
  const daysInMonth = useMemo(() => getDaysInMonth(currentMonthDate), [currentMonthDate])
  const firstDay = useMemo(() => (getDay(currentMonthDate) - startDay + 7) % 7, [currentMonthDate, startDay])

  // Memoize previous month calculations
  const prevMonthData = useMemo(() => {
    const prevMonth = month === 0 ? 11 : month - 1
    const prevMonthYear = month === 0 ? year - 1 : year
    const prevMonthDays = getDaysInMonth(new Date(prevMonthYear, prevMonth, 1))
    const prevMonthDaysArray = Array.from({ length: prevMonthDays }, (_, i) => i + 1)
    return { prevMonthDays, prevMonthDaysArray, prevMonth, prevMonthYear }
  }, [month, year])

  // Memoize next month calculations
  const nextMonthData = useMemo(() => {
    const nextMonth = month === 11 ? 0 : month + 1
    const nextMonthYear = month === 11 ? year + 1 : year
    const nextMonthDays = getDaysInMonth(new Date(nextMonthYear, nextMonth, 1))
    const nextMonthDaysArray = Array.from({ length: nextMonthDays }, (_, i) => i + 1)
    return { nextMonthDaysArray, nextMonth, nextMonthYear }
  }, [month, year])

  // Memoize features filtering by day to avoid recalculating on every render
  const featuresByDay = useMemo(() => {
    const result: { [day: number]: Feature[] } = {}
    for (let day = 1; day <= daysInMonth; day++) {
      result[day] = features.filter(feature => {
        return isSameDay(startOfDay(new Date(feature.endAt)), startOfDay(new Date(year, month, day)))
      })
    }
    return result
  }, [features, daysInMonth, year, month])

  type BodyCell = { content: ReactNode; key: string; shellClassName?: string }
  const cells: BodyCell[] = []

  for (let i = 0; i < firstDay; i++) {
    const day = prevMonthData.prevMonthDaysArray[prevMonthData.prevMonthDays - firstDay + i]

    if (day) {
      const prevDate = new Date(prevMonthData.prevMonthYear, prevMonthData.prevMonth, day)
      const lunarLabel = showLunar ? formatVietnameseLunarCompact(prevDate) : undefined
      cells.push({ content: <OutOfBoundsDay day={day} lunarLabel={lunarLabel} />, key: `prev-${i}` })
    }
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const featuresForDay = featuresByDay[day] || []
    const dayDate = new Date(year, month, day)

    const hasJp = featuresForDay.some(f => featureCountryKey(f) === 'jp')
    const hasVn = featuresForDay.some(f => featureCountryKey(f) === 'vn')
    const isToday = isSameDay(dayDate, new Date())
    const holidayShellClass =
      featuresForDay.length === 0
        ? undefined
        : cn(
            hasJp && hasVn
              ? 'bg-gradient-to-br from-red-500/20 to-blue-500/20 dark:from-red-500/26 dark:to-blue-500/26'
              : hasJp
                ? 'bg-red-500/18 dark:bg-red-500/24'
                : hasVn
                  ? 'bg-blue-500/18 dark:bg-blue-500/24'
                  : 'bg-muted/55 dark:bg-muted/40',
            ''
          )

    const holidayDayNumberClass =
      featuresForDay.length === 0
        ? undefined
        : cn(
            'font-bold tabular-nums',
            hasJp && hasVn
              ? 'bg-gradient-to-r from-red-600 to-blue-600 bg-clip-text text-transparent dark:from-red-400 dark:to-blue-400'
              : hasJp
                ? 'text-red-600 dark:text-red-400'
                : hasVn
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'font-bold text-foreground'
          )

    const todayShellClass = isToday && featuresForDay.length === 0 ? 'bg-primary/12 dark:bg-primary/18' : undefined

    const holidayList = (
      <div className={cn('min-w-0 w-full space-y-0.5', compact && 'text-xs')}>
        {featuresForDay.slice(0, 3).map(feature => children({ feature }))}
      </div>
    )

    const lunarLabel = showLunar ? formatVietnameseLunarCompact(dayDate) : null

    cells.push({
      content: (
        <div
          className={cn(
            'relative flex flex-1 min-h-0 w-full min-w-0 flex-col',
            compact ? 'gap-0.5 p-0.5' : 'gap-1 p-1 text-muted-foreground text-xs'
          )}
        >
          <div className={cn('flex flex-col', compact ? 'gap-0' : 'gap-0.5')}>
            <span
              className={cn(
                'tabular-nums',
                compact && !holidayDayNumberClass && 'text-base font-semibold text-foreground',
                compact && holidayDayNumberClass && 'text-base',
                holidayDayNumberClass,
                !holidayDayNumberClass && isToday && 'font-semibold text-primary'
              )}
            >
              {day}
            </span>
            {lunarLabel != null && (
              <span className={cn('leading-tight', compact ? 'text-[10px]' : 'text-[10px] opacity-90', lunarTextClass)}>{lunarLabel}</span>
            )}
          </div>
          {featuresForDay.length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="min-w-0 w-full cursor-default space-y-0.5">
                  {holidayList}
                  {featuresForDay.length > 3 && <span className="block text-muted-foreground text-xs">+{featuresForDay.length - 3} more</span>}
                </div>
              </TooltipTrigger>
              <TooltipContent className="z-[120] max-w-sm px-3 py-2.5 text-left" side="top" sideOffset={6}>
                <DayHolidaysTooltipPanel dayDate={dayDate} features={featuresForDay} locale={locale} showLunar={showLunar} />
              </TooltipContent>
            </Tooltip>
          ) : (
            holidayList
          )}
        </div>
      ),
      key: `day-${day}`,
      shellClassName: cn(holidayShellClass, todayShellClass),
    })
  }

  const remainingDays = 7 - ((firstDay + daysInMonth) % 7)
  if (remainingDays < 7) {
    for (let i = 0; i < remainingDays; i++) {
      const day = nextMonthData.nextMonthDaysArray[i]

      if (day) {
        const nextDate = new Date(nextMonthData.nextMonthYear, nextMonthData.nextMonth, day)
        const lunarLabel = showLunar ? formatVietnameseLunarCompact(nextDate) : undefined
        cells.push({ content: <OutOfBoundsDay day={day} lunarLabel={lunarLabel} />, key: `next-${i}` })
      }
    }
  }

  return (
    <div className="grid flex-grow grid-cols-7">
      {cells.map(({ content, key, shellClassName }, index) => (
        <div
          className={cn(
            'relative flex flex-col border-t border-r align-top',
            compact ? 'min-h-[3.75rem] sm:min-h-[4rem]' : 'min-h-[5.5rem] sm:min-h-[6.5rem]',
            shellClassName,
            index % 7 === 6 && 'border-r-0'
          )}
          key={key}
        >
          {content}
        </div>
      ))}
    </div>
  )
}

export type CalendarDatePickerProps = {
  className?: string
  children: ReactNode
}

export const CalendarDatePicker = ({ className, children }: CalendarDatePickerProps) => <div className={cn('flex items-center gap-1', className)}>{children}</div>

export type CalendarMonthPickerProps = {
  className?: string
}

export const CalendarMonthPicker = ({ className }: CalendarMonthPickerProps) => {
  const [month, setMonth] = useCalendarMonth()
  const { locale } = useContext(CalendarContext)

  // Memoize month data to avoid recalculating date formatting
  const monthData = useMemo(() => {
    return monthsForLocale(locale).map((month, index) => ({
      value: index.toString(),
      label: month,
    }))
  }, [locale])

  return (
    <Combobox
      className={className}
      data={monthData}
      labels={{
        button: 'Select month',
        empty: 'No month found',
        search: 'Search month',
      }}
      setValue={value => setMonth(Number.parseInt(value, 10) as CalendarState['month'])}
      value={month.toString()}
    />
  )
}

export type CalendarYearPickerProps = {
  className?: string
  start: number
  end: number
}

export const CalendarYearPicker = ({ className, start, end }: CalendarYearPickerProps) => {
  const [year, setYear] = useCalendarYear()

  return (
    <Combobox
      className={className}
      data={Array.from({ length: end - start + 1 }, (_, i) => ({
        value: (start + i).toString(),
        label: (start + i).toString(),
      }))}
      labels={{
        button: 'Select year',
        empty: 'No year found',
        search: 'Search year',
      }}
      setValue={value => setYear(Number.parseInt(value, 10))}
      value={year.toString()}
    />
  )
}

export type CalendarDatePaginationProps = {
  className?: string
}

export const CalendarDatePagination = ({ className }: CalendarDatePaginationProps) => {
  const [month, setMonth] = useCalendarMonth()
  const [year, setYear] = useCalendarYear()

  const handlePreviousMonth = useCallback(() => {
    if (month === 0) {
      setMonth(11)
      setYear(year - 1)
    } else {
      setMonth((month - 1) as CalendarState['month'])
    }
  }, [month, year, setMonth, setYear])

  const handleNextMonth = useCallback(() => {
    if (month === 11) {
      setMonth(0)
      setYear(year + 1)
    } else {
      setMonth((month + 1) as CalendarState['month'])
    }
  }, [month, year, setMonth, setYear])

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button onClick={handlePreviousMonth} size="icon" variant="ghost">
        <ChevronLeftIcon size={16} />
      </Button>
      <Button onClick={handleNextMonth} size="icon" variant="ghost">
        <ChevronRightIcon size={16} />
      </Button>
    </div>
  )
}

export type CalendarDateProps = {
  children: ReactNode
}

export const CalendarDate = ({ children }: CalendarDateProps) => {
  const { density } = useContext(CalendarContext)
  return <div className={cn('flex items-center justify-between', density === 'compact' ? 'p-2' : 'p-3')}>{children}</div>
}

export type CalendarHeaderProps = {
  className?: string
}

export const CalendarHeader = ({ className }: CalendarHeaderProps) => {
  const { locale, startDay, density } = useContext(CalendarContext)

  // Memoize days data to avoid recalculating date formatting
  const daysData = useMemo(() => {
    return daysForLocale(locale, startDay)
  }, [locale, startDay])

  return (
    <div className={cn('grid flex-grow grid-cols-7', className)}>
      {daysData.map(day => (
        <div className={cn('text-right text-muted-foreground text-xs', density === 'compact' ? 'px-1 py-1.5' : 'p-3')} key={day}>
          {day}
        </div>
      ))}
    </div>
  )
}

export type CalendarItemProps = {
  feature: Feature
  className?: string
}

export const CalendarItem = memo(({ feature, className }: CalendarItemProps) => {
  const code = feature.status.countryCode

  return (
    <div className={cn('flex w-full min-w-0 items-center gap-1.5', className)}>
      {code ? (
        <CountryFlag className="h-3.5 w-[21px] shrink-0" code={code} />
      ) : (
        <div
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            backgroundColor: feature.status.color,
          }}
        />
      )}
      <span className="min-w-0 flex-1 truncate text-foreground">{feature.name}</span>
    </div>
  )
})

CalendarItem.displayName = 'CalendarItem'

export type CalendarProviderProps = {
  locale?: Intl.LocalesArgument
  startDay?: number
  showLunar?: boolean
  density?: CalendarDensity
  children: ReactNode
  className?: string
}

export const CalendarProvider = ({ locale = 'en-US', startDay = 0, showLunar = false, density = 'default', children, className }: CalendarProviderProps) => (
  <CalendarContext.Provider value={{ locale, startDay, showLunar, density }}>
    <div className={cn('relative flex flex-col', className)}>{children}</div>
  </CalendarContext.Provider>
)
