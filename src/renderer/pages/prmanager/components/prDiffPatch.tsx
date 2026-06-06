'use client'

import { useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/** Unified diff line colors (editor-style). */
export function patchLineClass(line: string): string {
  if (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('new file') ||
    line.startsWith('deleted file') ||
    line.startsWith('similarity') ||
    line.startsWith('Binary files') ||
    line.startsWith('rename ')
  ) {
    return 'text-muted-foreground'
  }
  if (line.startsWith('---') || line.startsWith('+++')) {
    return 'text-sky-700/95 dark:text-sky-300/95'
  }
  if (line.startsWith('@@')) {
    return 'bg-blue-500/10 font-medium text-blue-800 dark:text-blue-200'
  }
  if (line.startsWith('+')) {
    return 'bg-emerald-500/[0.12] text-emerald-800 dark:text-emerald-200'
  }
  if (line.startsWith('-')) {
    return 'bg-rose-500/[0.12] text-rose-800 dark:text-rose-200'
  }
  if (line.startsWith('\\')) {
    return 'text-muted-foreground italic'
  }
  return 'text-foreground/88'
}

type DiffPatchBlockProps = {
  patch: string
  maxHeightClass?: string
  scrollContainerRef?: (el: HTMLDivElement | null) => void
  onScrollSync?: (scrollTop: number, scrollLeft: number) => void
}

export function DiffPatchBlock({
  patch,
  maxHeightClass = 'max-h-[min(50vh,360px)]',
  scrollContainerRef,
  onScrollSync,
}: DiffPatchBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRefSlot = useRef(scrollContainerRef)
  scrollContainerRefSlot.current = scrollContainerRef
  const syncEnabled = scrollContainerRef != null
  const lines = patch.split('\n')

  useLayoutEffect(() => {
    const register = scrollContainerRefSlot.current
    if (!register) return
    register(containerRef.current)
    return () => register(null)
  }, [syncEnabled, patch])

  return (
    <div
      ref={containerRef}
      onScroll={e => {
        if (!onScrollSync) return
        const t = e.currentTarget
        onScrollSync(t.scrollTop, t.scrollLeft)
      }}
      className={cn(
        maxHeightClass,
        'min-w-0 max-w-full overflow-x-auto overflow-y-auto',
        'rounded border border-border/50 bg-[hsl(220_14%_96%_/_0.5)] font-mono text-[11px] leading-[1.45] [font-variant-ligatures:none] dark:bg-[hsl(220_14%_8%_/_0.4)]'
      )}
    >
      {lines.map((line, i) => (
        <div key={i} className={cn('min-h-[1.35em] w-full min-w-0 whitespace-pre pl-0.5', patchLineClass(line))}>
          {line || '\u00a0'}
        </div>
      ))}
    </div>
  )
}
