'use client'

import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import type React from 'react'
import { useCallback, useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export type VirtualListRevealScroll = {
  index: number
  sequence: number
}

type DiffViewerFileTreeVirtualListProps<T> = {
  rows: readonly T[]
  getRowKey: (row: T, index: number) => string
  estimateRowHeight: (row: T, index: number) => number
  renderRow: (row: T, index: number) => React.ReactNode
  emptyState?: React.ReactNode
  className?: string
  scrollClassName?: string
  scrollRef?: React.RefObject<HTMLDivElement | null>
  /** Scroll virtual list to row after reveal (sequence bumps force re-scroll). */
  revealScroll?: VirtualListRevealScroll | null
  overscan?: number
}

function scheduleScroll(virtualizer: Virtualizer<HTMLDivElement, Element>, index: number) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(index, { align: 'center' })
    })
  })
}

export function DiffViewerFileTreeVirtualList<T>({
  rows,
  getRowKey,
  estimateRowHeight,
  renderRow,
  emptyState,
  className,
  scrollClassName,
  scrollRef: externalScrollRef,
  revealScroll = null,
  overscan = 12,
}: DiffViewerFileTreeVirtualListProps<T>) {
  const internalScrollRef = useRef<HTMLDivElement>(null)
  const scrollRef = externalScrollRef ?? internalScrollRef
  const renderRowRef = useRef(renderRow)
  renderRowRef.current = renderRow

  const getItemKey = useCallback(
    (index: number) => {
      const row = rows[index]
      return row ? getRowKey(row, index) : `row-${index}`
    },
    [rows, getRowKey]
  )

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: index => {
      const row = rows[index]
      return row ? estimateRowHeight(row, index) : 22
    },
    overscan,
    isScrollingResetDelay: 150,
  })

  const lastHandledRevealSequenceRef = useRef(0)

  useLayoutEffect(() => {
    if (!revealScroll) return

    const { index, sequence } = revealScroll
    if (sequence <= lastHandledRevealSequenceRef.current) return
    if (index < 0 || index >= rows.length) return

    lastHandledRevealSequenceRef.current = sequence
    scheduleScroll(virtualizer, index)
  }, [revealScroll, rows, virtualizer])

  if (rows.length === 0) {
    return <div className={cn('px-0.5 py-1', className)}>{emptyState}</div>
  }

  const virtualItems = virtualizer.getVirtualItems()
  const isScrolling = virtualizer.isScrolling

  return (
    <div
      ref={scrollRef}
      className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden [overflow-anchor:none]', scrollClassName, className)}
      style={{ overflowAnchor: 'none' }}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualItems.map(virtualItem => {
          const row = rows[virtualItem.index]
          if (!row) return null
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              className="absolute left-0 top-0 w-full"
              style={{
                height: virtualItem.size,
                transform: `translate3d(0, ${virtualItem.start}px, 0)`,
                contain: 'layout style paint',
                pointerEvents: isScrolling ? 'none' : undefined,
              }}
            >
              {renderRowRef.current(row, virtualItem.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
