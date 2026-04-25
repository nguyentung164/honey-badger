'use client'

import { CheckIcon, ChevronsUpDownIcon, Loader2 } from 'lucide-react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 80

function formatTaskLabel(ticketId: string | undefined, title: string) {
  const tid = (ticketId ?? '').trim()
  return tid ? `${tid} - ${title}` : title
}

export interface TaskPickerComboboxProps {
  pickerMode: 'link' | 'subtask'
  currentTaskId: string
  contextProjectId?: string | null
  extraExcludeIds?: string[]
  value: string
  onValueChange: (taskId: string) => void
  emptyOptionLabel: string
  placeholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  size?: 'sm' | 'default'
  searchPlaceholder?: string
  emptyText?: string
}

export function TaskPickerCombobox({
  pickerMode,
  currentTaskId,
  contextProjectId,
  extraExcludeIds = [],
  value,
  onValueChange,
  emptyOptionLabel,
  placeholder = 'Select...',
  disabled = false,
  className,
  triggerClassName,
  size = 'sm',
  searchPlaceholder,
  emptyText,
}: TaskPickerComboboxProps) {
  const { t } = useTranslation()
  const sp = searchPlaceholder ?? t('common.search')
  const et = emptyText ?? t('taskManagement.noTasks')

  const [open, setOpen] = React.useState(false)
  const [searchInput, setSearchInput] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const [rows, setRows] = React.useState<{ id: string; title: string; ticketId: string }[]>([])
  const [remoteHasMore, setRemoteHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [previewLabel, setPreviewLabel] = React.useState<string | null>(null)
  const loadingLock = React.useRef(false)

  const fetchParamsBase = React.useMemo(() => {
    const excludeTaskIds = [currentTaskId, ...extraExcludeIds].filter(Boolean)
    return {
      pickerMode,
      ...(pickerMode === 'subtask' ? { contextProjectId: contextProjectId ?? null } : {}),
      excludeTaskIds,
    }
  }, [pickerMode, contextProjectId, currentTaskId, extraExcludeIds])

  React.useEffect(() => {
    const tid = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(tid)
  }, [searchInput])

  React.useEffect(() => {
    if (!open) {
      setSearchInput('')
      setDebouncedSearch('')
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await window.api.task.listForPickerPage({
          offset: 0,
          limit: PAGE_SIZE,
          search: debouncedSearch || undefined,
          ...fetchParamsBase,
        })
        if (cancelled) return
        if (res.status !== 'success' || !res.data) {
          toast.error(res.message || t('taskManagement.updateError'))
          setRows([])
          setRemoteHasMore(false)
          return
        }
        setRows(res.data.items)
        setRemoteHasMore(res.data.hasMore)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, debouncedSearch, fetchParamsBase, t])

  const loadMore = React.useCallback(async () => {
    if (!open || !remoteHasMore || loadingLock.current || loading) return
    loadingLock.current = true
    setLoadingMore(true)
    try {
      const res = await window.api.task.listForPickerPage({
        offset: rows.length,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        ...fetchParamsBase,
      })
      if (res.status !== 'success' || !res.data) return
      setRows(prev => {
        const seen = new Set(prev.map(r => r.id))
        const next = [...prev]
        for (const it of res.data!.items) {
          if (!seen.has(it.id)) {
            seen.add(it.id)
            next.push(it)
          }
        }
        return next
      })
      setRemoteHasMore(res.data.hasMore)
    } finally {
      loadingLock.current = false
      setLoadingMore(false)
    }
  }, [open, remoteHasMore, loading, rows.length, debouncedSearch, fetchParamsBase])

  const handleListScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      if (el.scrollHeight - el.scrollTop - el.clientHeight >= 64) return
      void loadMore()
    },
    [loadMore]
  )

  React.useEffect(() => {
    if (!value) {
      setPreviewLabel(null)
      return
    }
    if (rows.some(r => r.id === value)) {
      setPreviewLabel(null)
      return
    }
    let cancelled = false
    window.api.task.getTask(value).then(res => {
      if (cancelled || res.status !== 'success' || !res.data) return
      const tk = res.data as { title?: string; ticketId?: string }
      setPreviewLabel(formatTaskLabel(tk.ticketId, tk.title ?? ''))
    })
    return () => {
      cancelled = true
    }
  }, [value, rows])

  const displayLabel = React.useMemo(() => {
    if (!value) return placeholder
    const r = rows.find(x => x.id === value)
    if (r) return formatTaskLabel(r.ticketId, r.title)
    if (previewLabel) return previewLabel
    return placeholder
  }, [value, rows, previewLabel, placeholder])

  const handleSelect = (id: string) => {
    onValueChange(id)
    setOpen(false)
  }

  return (
    <div className={cn('min-w-0 w-full overflow-hidden', className)}>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'data-[placeholder]:text-muted-foreground [&_svg]:text-muted-foreground font-normal w-full min-w-0 shrink',
              'grid grid-cols-[minmax(0,1fr)_auto] gap-2 shadow-none ring-0 focus-visible:ring-0 border-input',
              size === 'default' && 'h-9',
              size === 'sm' && 'h-8 py-1',
              !value && 'text-muted-foreground',
              triggerClassName
            )}
          >
            <span className="truncate min-w-0 text-left overflow-hidden text-ellipsis whitespace-nowrap" title={displayLabel}>
              {displayLabel}
            </span>
            <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={sp} value={searchInput} onValueChange={setSearchInput} />
            <CommandList className="max-h-[300px]" onScroll={handleListScroll}>
              <CommandEmpty>{loading ? t('common.loading') : et}</CommandEmpty>
              <CommandItem value={`${emptyOptionLabel} __none__`} onSelect={() => handleSelect('')}>
                {emptyOptionLabel}
                {!value ? <CheckIcon className="ml-auto size-4" /> : null}
              </CommandItem>
              {rows.map(row => (
                <CommandItem
                  key={row.id}
                  value={`${formatTaskLabel(row.ticketId, row.title)} ${row.id}`}
                  onSelect={() => handleSelect(row.id)}
                >
                  {formatTaskLabel(row.ticketId, row.title)}
                  {value === row.id ? <CheckIcon className="ml-auto size-4" /> : null}
                </CommandItem>
              ))}
              {loadingMore ? (
                <div className="flex justify-center py-2">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                </div>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
