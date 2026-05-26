'use client'

import type { LucideIcon } from 'lucide-react'
import dynamicIconImports from 'lucide-react/dynamicIconImports'
import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { lucideSlugToExportName } from '@/components/flow-inspector/nodeIconUtils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const ALL_SLUGS: string[] = Object.keys(dynamicIconImports).sort((a, b) => a.localeCompare(b))

const GRID_COLS = 8

export type FlowLucideIconPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedExportName?: string | undefined
  onPickExportName: (exportName: string) => void
}

export function FlowLucideIconPickerDialog({
  open,
  onOpenChange,
  selectedExportName,
  onPickExportName,
}: FlowLucideIconPickerDialogProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const virtualScrollRef = useRef<HTMLElement | null>(null)
  const [viewportEl, setViewportEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (open) setQuery('')
    if (!open) setViewportEl(null)
  }, [open])

  const scrollRefMerged = useCallback((node: HTMLElement | null) => {
    virtualScrollRef.current = node
    setViewportEl(node)
  }, [])

  const ql = query.trim().toLowerCase().replace(/\s+/g, '')

  const filtered = useMemo(() => {
    if (!ql) return ALL_SLUGS
    const out: string[] = []
    for (const slug of ALL_SLUGS) {
      if (slug.includes(ql)) {
        out.push(slug)
        continue
      }
      const camel = lucideSlugToExportName(slug).toLowerCase()
      if (camel.includes(ql)) out.push(slug)
    }
    return out
  }, [ql])

  const rowCount = Math.max(1, Math.ceil(filtered.length / GRID_COLS))
  const ROW_EST = 58

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => virtualScrollRef.current,
    estimateSize: () => ROW_EST,
    overscan: 12,
    getItemKey: index => filtered[index * GRID_COLS] ?? `row-${index}`,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88vh,760px)] w-full max-w-3xl flex-col gap-0 overflow-hidden pb-5">
        <DialogHeader className="shrink-0 space-y-1 pr-1">
          <DialogTitle>{t('flowInspector.lucidePickerTitle')}</DialogTitle>
          <DialogDescription className="text-xs">{t('flowInspector.lucidePickerHint')}</DialogDescription>
        </DialogHeader>

        <div className="mt-3 shrink-0 space-y-2 pr-1">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t('flowInspector.lucidePickerSearchLabel')}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={e => setQuery(e.target.value)} className="h-9 pl-8" spellCheck={false} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('flowInspector.lucidePickerCount', {
              filtered: filtered.length,
              total: ALL_SLUGS.length,
            })}
          </p>
        </div>

        <div className="mt-3 flex min-h-0 flex-1 flex-col pr-1">
          <section
            ref={scrollRefMerged}
            data-lucide-picker-scroll=""
            className="min-h-[260px] max-h-[min(440px,calc(88vh-220px))] w-full shrink-0 overflow-y-auto overflow-x-hidden rounded-lg border border-border/70 bg-muted/10 px-px py-1 [-webkit-overflow-scrolling:touch]"
            aria-label={t('flowInspector.lucidePickerGridLabel')}
          >
            <div
              className="relative w-full"
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
              }}
            >
              {rowVirtualizer.getVirtualItems().map(vRow => {
                const rowIndex = vRow.index
                const offset = rowIndex * GRID_COLS
                return (
                  <div
                    key={vRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={vRow.index}
                    className="absolute left-0 top-0 grid w-full gap-1 px-1"
                    style={{
                      gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
                      transform: `translateY(${vRow.start}px)`,
                    }}
                  >
                    {Array.from({ length: GRID_COLS }).map((_, ci) => {
                      const slug = filtered[offset + ci]
                      if (!slug)
                        return <div key={`e-${rowIndex}-${ci}`} style={{ minHeight: ROW_EST }} className="shrink-0" />
                      const ex = lucideSlugToExportName(slug)
                      const sel = selectedExportName?.trim() === ex
                      return (
                        <div key={slug} className="flex items-stretch pb-px">
                          <button
                            type="button"
                            title={`${slug} → ${ex}`}
                            onClick={() => {
                              onPickExportName(ex)
                              onOpenChange(false)
                            }}
                            className={cn(
                              'flex min-h-[52px] w-full flex-col items-center justify-center gap-px rounded-md border px-0.5 py-1 text-center text-muted-foreground transition-colors',
                              sel ? 'border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/35' : 'border-transparent hover:bg-muted/80 hover:text-foreground'
                            )}
                          >
                            <span className="flex h-8 w-full shrink-0 items-center justify-center">
                              <LucideSlugCell slug={slug} scrollRootEl={viewportEl} dialogOpen={open} />
                            </span>
                            <span className="line-clamp-2 w-full max-w-[11ch] break-all px-0.5 text-[8px] leading-tight opacity-75">{slug}</span>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <DialogFooter className="mt-4 shrink-0">
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            {t('flowInspector.lucidePickerClose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LucideSlugCell({
  slug,
  scrollRootEl,
  dialogOpen,
}: {
  slug: string
  scrollRootEl: HTMLElement | null
  dialogOpen: boolean
}) {
  const [Ico, setIco] = useState<LucideIcon | null | false>(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!dialogOpen) {
      setIco(false)
      return
    }
    if (!scrollRootEl) return

    let cancelled = false
    let started = false

    const startImport = () => {
      if (started || cancelled) return
      started = true
      const loader = dynamicIconImports[slug as keyof typeof dynamicIconImports]
      void loader()
        .then(m => {
          if (!cancelled) setIco(() => m.default)
        })
        .catch(() => {
          if (!cancelled) setIco(null)
        })
    }

    const el = wrapRef.current
    if (!el) return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          startImport()
          io.disconnect()
        }
      },
      { root: scrollRootEl, rootMargin: '320px 0px', threshold: 0 }
    )

    io.observe(el)
    /** Guarantee first paint intersects scrollport (TanStack mounts rows post-layout). */
    const tKick = window.setTimeout(() => {
      try {
        if (cancelled || started) return
        const rr = scrollRootEl.getBoundingClientRect()
        const ee = wrapRef.current?.getBoundingClientRect()
        if (ee && ee.bottom >= rr.top && ee.top <= rr.bottom) startImport()
      } catch {
        startImport()
      }
    }, 32)

    return () => {
      cancelled = true
      window.clearTimeout(tKick)
      io.disconnect()
    }
  }, [slug, scrollRootEl, dialogOpen])

  if (Ico === false)
    return <span ref={wrapRef} className="inline-flex size-6 animate-pulse rounded-[4px] bg-muted/80" aria-hidden />
  if (Ico === null) return <span ref={wrapRef} className="inline-block size-6 opacity-30" aria-hidden />
  const L = Ico
  return (
    <span ref={wrapRef} className="inline-flex">
      <L className="size-5 shrink-0 text-foreground opacity-95" aria-hidden />
    </span>
  )
}
