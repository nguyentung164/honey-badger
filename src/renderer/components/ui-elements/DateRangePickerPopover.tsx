'use client'

import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import i18n from '@/lib/i18n'
import { getDateFnsLocale, getDateOnlyPattern } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'

interface DateRangePickerPopoverProps {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  allTimeLabel: string
  confirmLabel: string
  /** Đồng bộ với date range header Dashboard */
  disabled?: boolean
}

/**
 * Date range picker với state nội bộ - chỉ cập nhật parent khi user bấm Confirm.
 * Tránh re-render component cha (TaskManagement) mỗi lần chọn ngày → giảm lag/giật.
 */
export function DateRangePickerPopover({
  dateRange,
  onDateRangeChange,
  open,
  onOpenChange,
  allTimeLabel,
  confirmLabel,
  disabled = false,
}: DateRangePickerPopoverProps) {
  const locale = getDateFnsLocale(i18n.language)
  const dateFormat = getDateOnlyPattern(i18n.language)
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)

  const [draftRange, setDraftRange] = useState<DateRange | undefined>(dateRange)

  useEffect(() => {
    if (open) {
      setDraftRange(dateRange)
    }
  }, [open, dateRange])

  const handleConfirm = () => {
    if (draftRange?.from) {
      onDateRangeChange(draftRange)
      onOpenChange(false)
    }
  }

  const handleClear = () => {
    setDraftRange(undefined)
    onDateRangeChange(undefined)
    onOpenChange(false)
  }

  const displayText = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, dateFormat, { locale })} - ${format(dateRange.to, dateFormat, { locale })}`
      : format(dateRange.from, dateFormat, { locale })
    : allTimeLabel

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant={buttonVariant}
          size="sm"
          disabled={disabled}
          className={cn(
            'h-6 px-2 text-xs justify-start text-left font-normal transition-all duration-200',
            !dateRange?.from && 'text-muted-foreground'
          )}
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar locale={locale} mode="range" defaultMonth={draftRange?.from ?? dateRange?.from} selected={draftRange} onSelect={setDraftRange} numberOfMonths={2} />
        <div className="flex gap-2 p-2 border-t">
          <Button variant={buttonVariant} size="sm" className="flex-1" onClick={handleClear}>
            {allTimeLabel}
          </Button>
          <Button variant={buttonVariant} size="sm" className="flex-1" onClick={handleConfirm} disabled={!draftRange?.from}>
            {confirmLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
