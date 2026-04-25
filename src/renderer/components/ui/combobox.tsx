'use client'

import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
  disabled?: boolean
  render?: React.ReactNode
  /** Nếu có: chỉ dùng trong danh sách; trigger vẫn hiển thị `label` (không dùng `render`). */
  listRender?: React.ReactNode
}

/** Danh sách rất dài: batch ban đầu + kéo scroll tới cuối để tăng dần (không mount hết một lúc). */
export interface ComboboxLazyList {
  /** Số item (task) hiển thị lần đầu / sau mỗi lần reset ô tìm. */
  maxResults: number
  /** Mỗi lần cuộn tới gần đáy, thêm tối đa bấy nhiêu item (mặc định 100). */
  loadMoreBatchSize?: number
  /** Chỉ bật lazy khi số option ≥ ngưỡng (mặc định 80); ít hơn thì filter client như cũ. */
  enableWhenOptionCountAtLeast?: number
}

export interface ComboboxProps {
  value: string
  onValueChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  disabled?: boolean
  emptyText?: string
  searchPlaceholder?: string
  /** Hiển thị khi lazy và số task > maxResults (gợi ý gõ ô tìm để lọc). */
  lazySearchHint?: string
  className?: string
  contentClassName?: string
  triggerClassName?: string
  triggerStyle?: React.CSSProperties
  size?: 'sm' | 'default'
  variant?: 'outline' | 'ghost'
  onOpen?: () => void
  lazyList?: ComboboxLazyList
  /** Nội dung cố định dưới danh sách (vd. nút hành động). */
  footer?: React.ReactNode
  /** Điều khiển mở/đóng từ ngoài (kèm `onOpenChange`). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function Combobox({
  value,
  onValueChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  emptyText = 'No item found.',
  searchPlaceholder = 'Search...',
  lazySearchHint,
  className,
  contentClassName,
  triggerClassName,
  triggerStyle,
  size = 'default',
  variant = 'outline',
  onOpen,
  lazyList,
  footer,
  open: openControlled,
  onOpenChange,
}: ComboboxProps) {
  const [openInternal, setOpenInternal] = React.useState(false)
  const isOpenControlled = openControlled !== undefined
  const open = isOpenControlled ? openControlled : openInternal
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isOpenControlled) setOpenInternal(next)
      onOpenChange?.(next)
    },
    [isOpenControlled, onOpenChange]
  )
  const [lazyQuery, setLazyQuery] = React.useState('')
  const [lazyVisibleCap, setLazyVisibleCap] = React.useState(() => lazyList?.maxResults ?? 200)

  const lazyThreshold = lazyList?.enableWhenOptionCountAtLeast ?? 80
  const useLazyList = Boolean(lazyList) && options.length >= lazyThreshold
  const initialLazyCap = lazyList?.maxResults ?? 200
  const loadMoreStep = lazyList?.loadMoreBatchSize ?? 100

  React.useEffect(() => {
    if (!open) {
      setLazyQuery('')
      setLazyVisibleCap(initialLazyCap)
    }
  }, [open, initialLazyCap])

  React.useEffect(() => {
    if (useLazyList) setLazyVisibleCap(initialLazyCap)
  }, [lazyQuery, useLazyList, initialLazyCap])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) onOpen?.()
  }

  const selectedOption = options.find(opt => opt.value === value)
  const displayLabel = selectedOption?.label ?? placeholder
  const triggerDisplay =
    selectedOption == null
      ? placeholder
      : selectedOption.listRender != null
        ? selectedOption.label
        : (selectedOption.render ?? selectedOption.label)

  const handleSelect = (optValue: string) => {
    onValueChange(optValue)
    setOpen(false)
  }

  const maxLazyResults = lazyList?.maxResults ?? 200

  /** Pool đã sort hoặc đã lọc theo ô tìm — dùng để slice theo lazyVisibleCap và biết còn item phía sau không. */
  const lazyOrderedOrMatched = React.useMemo(() => {
    if (!useLazyList || !lazyList) return null

    const q = lazyQuery.trim().toLowerCase()
    const pool = options.filter(o => o.value !== '_none' && o.value !== '_empty')

    if (q.length === 0) {
      return [...pool].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    }
    return pool.filter(o => `${o.label} ${o.value}`.toLowerCase().includes(q))
  }, [options, lazyQuery, useLazyList, lazyList])

  const listOptions = React.useMemo(() => {
    if (!useLazyList || !lazyList || lazyOrderedOrMatched === null) return options

    const sentinels = options.filter(o => o.value === '_none' || o.value === '_empty')
    const selectedOpt =
      value && value !== '_none' && value !== '_empty' ? options.find(o => o.value === value) : undefined

    const pushUnique = (out: ComboboxOption[], items: ComboboxOption[]) => {
      for (const o of items) {
        if (!out.some(x => x.value === o.value)) out.push(o)
      }
    }

    const out: ComboboxOption[] = [...sentinels]
    pushUnique(out, lazyOrderedOrMatched.slice(0, lazyVisibleCap))

    if (selectedOpt && !out.some(o => o.value === selectedOpt.value)) out.push(selectedOpt)
    return out
  }, [options, value, useLazyList, lazyList, lazyOrderedOrMatched, lazyVisibleCap])

  const poolTaskCount = React.useMemo(() => {
    if (!useLazyList) return 0
    return options.filter(o => o.value !== '_none' && o.value !== '_empty').length
  }, [options, useLazyList])

  const showLazyHint = Boolean(
    useLazyList && lazySearchHint && poolTaskCount > maxLazyResults && lazyQuery.trim().length === 0
  )

  const lazyTotalCount = lazyOrderedOrMatched?.length ?? 0
  const lazyHasMore = useLazyList && lazyTotalCount > lazyVisibleCap

  const handleLazyListScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!lazyHasMore) return
      const el = e.currentTarget
      const { scrollTop, scrollHeight, clientHeight } = el
      const nearBottom = scrollHeight - scrollTop - clientHeight < 56
      if (!nearBottom) return
      setLazyVisibleCap(prev => {
        const next = Math.min(prev + loadMoreStep, lazyTotalCount)
        return next > prev ? next : prev
      })
    },
    [lazyHasMore, loadMoreStep, lazyTotalCount]
  )

  return (
    <div className={cn('min-w-0 w-full overflow-hidden', className)}>
      <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
        <PopoverTrigger asChild>
          <Button
            variant={variant}
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            style={triggerStyle}
            className={cn(
              'data-[placeholder]:text-muted-foreground [&_svg]:text-muted-foreground font-normal w-full min-w-0 shrink',
              'grid grid-cols-[minmax(0,1fr)_auto] gap-2',
              /* Ghi đè ring từ buttonVariants — tránh border + ring chồng (Tailwind v4 không luôn bị globals.css tắt hết) */
              'shadow-none ring-0 focus-visible:ring-0',
              variant === 'outline' && 'border-input',
              size === 'default' && 'h-9',
              size === 'sm' && 'h-8',
              !value && 'text-muted-foreground',
              triggerClassName
            )}
          >
            <span className="truncate min-w-0 text-left overflow-hidden text-ellipsis whitespace-nowrap inline-flex items-center gap-1.5" title={displayLabel}>
              {triggerDisplay}
            </span>
            <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className={cn('w-[var(--radix-popover-trigger-width)] p-0', contentClassName)} align="start">
          <Command
            {...(useLazyList
              ? { shouldFilter: false as const }
              : {
                  filter: (itemValue: string, search: string) => {
                    const v = itemValue.toLowerCase()
                    const s = search.trim().toLowerCase()
                    return v.includes(s) ? 1 : 0
                  },
                })}
          >
            <CommandInput
              placeholder={searchPlaceholder}
              {...(useLazyList ? { value: lazyQuery, onValueChange: setLazyQuery } : {})}
            />
            {showLazyHint ? <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">{lazySearchHint}</p> : null}
            <CommandList className="max-h-[300px]" onScroll={useLazyList ? handleLazyListScroll : undefined}>
              <CommandEmpty>{emptyText}</CommandEmpty>
              {listOptions.map(opt => (
                <CommandItem
                  key={opt.value}
                  value={`${opt.label} ${opt.value}`}
                  disabled={opt.disabled}
                  onSelect={() => !opt.disabled && handleSelect(opt.value)}
                >
                  {opt.listRender ?? opt.render ?? opt.label}
                  {value === opt.value ? <CheckIcon className="ml-auto size-4" /> : null}
                </CommandItem>
              ))}
            </CommandList>
            {footer ? <div className="border-t border-border p-1">{footer}</div> : null}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { Combobox }
