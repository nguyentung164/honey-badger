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

/** Căn giữa stroke 1px theo lưới nửa-pixel — tránh anti-alias hai bên (trông dày ~2px / “mờ”). */
function crispVerticalGridStrokeX(x: number): number {
  return Math.round(x - 0.5) + 0.5
}

/**
 * Lưới dọc timeline.
 * - week / month: vạch tại `period, 2*period, …` (không vẽ tại 0 — tránh đôi vạch với mép cột meta).
 * - monthly: vạch theo `verticalGridLineLeftPx` (lọc `left > 0` — bỏ trùng cột meta).
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
    const stepLines: number[] = []
    for (let x = period; x < chartWidth; x += period) {
      stepLines.push(x)
    }
    return (
      <svg
        aria-hidden
        className={cn('pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-hidden text-border opacity-[0.88] dark:opacity-[0.72]', className)}
        width={chartWidth}
        height="100%"
        preserveAspectRatio="none"
      >
        {stepLines.map(left => (
          <line
            key={left}
            x1={crispVerticalGridStrokeX(left)}
            y1={0}
            x2={crispVerticalGridStrokeX(left)}
            y2="100%"
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    )
  }

  const monthlyLines = verticalGridLineLeftPx.filter(left => left > 0)

  return (
    <svg
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-hidden text-border opacity-[0.88] dark:opacity-[0.72]', className)}
      width={chartWidth}
      height="100%"
      preserveAspectRatio="none"
    >
      {monthlyLines.map(left => (
        <line
          key={left}
          x1={crispVerticalGridStrokeX(left)}
          y1={0}
          x2={crispVerticalGridStrokeX(left)}
          y2="100%"
          stroke="currentColor"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
})
