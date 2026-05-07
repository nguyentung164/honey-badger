'use client'

import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useState } from 'react'
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
  allTimeLabel: string
  confirmLabel: string
  /** Đồng bộ với date range header Dashboard */
  disabled?: boolean
  /** Ưu tiên sau các class cố định (vd. `h-8` để khớp ô search). */
  triggerClassName?: string
  /** Tooltip gốc trên nút mở lịch — native `title` có độ trễ ~0.5–1s của trình duyệt. */
  triggerTitle?: string
  /**
   * Mỗi lần giá trị **thay đổi** → đóng popover từ xa (vd. import, reset filter).
   * `open` cố ý **không** lift lên cha: TaskManagement rất nặng — controlled open làm cả trang re-render
   * trước khi Radix kịp mount Calendar → cảm giác “mở chậm”.
   */
  dismissSignal?: number
}

/**
 * Date range picker với state nội bộ - chỉ cập nhật parent khi user bấm Confirm.
 * Tránh re-render component cha (TaskManagement) mỗi lần chọn ngày → giảm lag/giật.
 */
export function DateRangePickerPopover({
  dateRange,
  onDateRangeChange,
  allTimeLabel,
  confirmLabel,
  disabled = false,
  triggerClassName,
  triggerTitle,
  dismissSignal,
}: DateRangePickerPopoverProps) {
  const locale = getDateFnsLocale(i18n.language)
  const dateFormat = getDateOnlyPattern(i18n.language)
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)

  const [open, setOpen] = useState(false)
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(dateRange)

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
  }, [])

  useEffect(() => {
    if (dismissSignal === undefined) return
    setOpen(false)
  }, [dismissSignal])

  useEffect(() => {
    if (open) {
      setDraftRange(dateRange)
    }
  }, [open, dateRange])

  const handleConfirm = () => {
    if (draftRange?.from) {
      onDateRangeChange(draftRange)
      setOpen(false)
    }
  }

  const handleClear = () => {
    setDraftRange(undefined)
    onDateRangeChange(undefined)
    setOpen(false)
  }

  const displayText = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, dateFormat, { locale })} - ${format(dateRange.to, dateFormat, { locale })}`
      : format(dateRange.from, dateFormat, { locale })
    : allTimeLabel

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant={buttonVariant}
          size="sm"
          disabled={disabled}
          title={triggerTitle}
          className={cn(
            'inline-flex min-h-0 min-w-0 max-w-full items-center gap-1.5 px-2 font-normal justify-start text-left transition-all duration-200',
            !dateRange?.from && 'text-muted-foreground',
            triggerClassName ?? 'h-6',
          )}
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">{displayText}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          'w-auto p-0',
          'data-[state=open]:animate-none data-[state=closed]:animate-none',
        )}
      >
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
