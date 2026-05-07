'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'

export type GanttTimelineGridScale = 'week' | 'month' | 'monthly'

type GanttTimelineGridOverlayProps = {
  scale: GanttTimelineGridScale
  pixelPerDay: number
  chartWidth: number
  /** `monthly`: vạch theo đầu tháng (ít phần tử). */
  verticalGridLineLeftPx: number[]
  className?: string
}

/**
 * Lưới dọc timeline — week/month: **một** lớp `mask + background` (không còn O(n) `div`).
 * monthly: SVG gọn (thường chỉ vài chục vạch).
 */
export const GanttTimelineGridOverlay = memo(function GanttTimelineGridOverlay({
  scale,
  pixelPerDay,
  chartWidth,
  verticalGridLineLeftPx,
  className,
}: GanttTimelineGridOverlayProps) {
  if (scale === 'week' || scale === 'month') {
    const period = scale === 'week' ? Math.max(1, pixelPerDay) : Math.max(1, pixelPerDay * 7)
    const mask = `repeating-linear-gradient(90deg, #000 0px, #000 1px, transparent 1px, transparent ${period}px)`
    return (
      <div
        aria-hidden
        className={cn('pointer-events-none absolute inset-0 z-[1] bg-border/88 dark:bg-border/70', className)}
        style={{
          width: chartWidth,
          minHeight: '100%',
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      />
    )
  }

  return (
    <svg
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-hidden text-border opacity-[0.88] dark:opacity-[0.72]', className)}
      width={chartWidth}
      height="100%"
      preserveAspectRatio="none"
    >
      {verticalGridLineLeftPx.map(left => (
        <line
          key={left}
          x1={left}
          y1={0}
          x2={left}
          y2="100%"
          stroke="currentColor"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
})
