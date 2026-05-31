'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type Props = {
  runOrder: number
  max: number
  editable?: boolean
  onChange?: (next: number) => void
  className?: string
}

export function FlowRunOrderBadge({ runOrder, max, editable = true, onChange, className }: Props) {
  const { t } = useTranslation()
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(String(runOrder))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) setDraft(String(runOrder))
  }, [open, runOrder])

  useEffect(() => {
    if (open) {
      const tmr = setTimeout(() => inputRef.current?.select(), 0)
      return () => clearTimeout(tmr)
    }
  }, [open])

  const commit = useCallback(() => {
    const n = Number.parseInt(draft, 10)
    if (!Number.isFinite(n) || n < 1) {
      setDraft(String(runOrder))
      setOpen(false)
      return
    }
    const clamped = Math.max(1, Math.min(max, n))
    onChange?.(clamped)
    setOpen(false)
  }, [draft, max, onChange, runOrder])

  const badge = (
    <span
      className={cn(
        'inline-flex min-h-0 min-w-[1ch] items-center justify-center px-px text-[6px] font-semibold tabular-nums leading-none text-foreground [text-shadow:0_0_1.5px_hsl(var(--background)),0_0_3px_hsl(var(--background))]',
        editable && onChange && 'cursor-pointer hover:text-primary',
        className,
      )}
      aria-label={t('flowInspector.runOrderBadge', { order: runOrder })}
    >
      {runOrder}
    </span>
  )

  if (!editable || !onChange) return badge

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="nodrag nopan inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          {badge}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="nodrag nopan w-44 p-3"
        align="center"
        side="top"
        onPointerDown={e => e.stopPropagation()}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {t('flowInspector.runOrder')}
        </label>
        <Input
          id={inputId}
          ref={inputRef}
          type="number"
          min={1}
          max={max}
          value={draft}
          className="h-8 tabular-nums"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setDraft(String(runOrder))
              setOpen(false)
            }
          }}
          onBlur={commit}
        />
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{t('flowInspector.runOrderHint')}</p>
      </PopoverContent>
    </Popover>
  )
}
