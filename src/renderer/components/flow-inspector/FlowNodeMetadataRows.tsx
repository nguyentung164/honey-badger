'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Row = { label: string; value: ReactNode; title?: string; valueClassName?: string }

type Props = {
  rows: Row[]
  emptyMessage?: string
  className?: string
}

export function FlowNodeMetadataRows({ rows, emptyMessage, className }: Props) {
  const hasContent = rows.some(r => r.value != null && r.value !== '')
  if (!hasContent && emptyMessage) {
    return <p className={cn('text-center text-[8px] leading-tight text-muted-foreground', className)}>{emptyMessage}</p>
  }
  return (
    <div className={cn('nodrag nopan relative z-[2] space-y-1 px-2 pb-1.5 pt-1', className)}>
      {rows.map(row =>
        row.value != null && row.value !== '' ? (
          <div key={row.label} className="flex items-baseline justify-between gap-2 text-[8px] leading-tight">
            <span className="shrink-0 font-medium uppercase tracking-wide text-muted-foreground/85">{row.label}</span>
            <span
              className={cn('min-w-0 truncate text-right tabular-nums text-foreground/95', row.valueClassName)}
              title={row.title}
            >
              {row.value}
            </span>
          </div>
        ) : null,
      )}
    </div>
  )
}
