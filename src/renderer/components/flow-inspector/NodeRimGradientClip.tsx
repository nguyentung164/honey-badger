'use client'

import { useId, type CSSProperties, type ReactNode } from 'react'
import { svgRimRingPath } from '@/components/flow-inspector/nodeRimGeometry'
import type { NodeRimBox } from '@/components/flow-inspector/nodeRimGeometry'

type Props = {
  box: NodeRimBox
  strokePx: number
  radiusPx: number
  /** Scale rim thickness (neon halo layers). */
  scale?: number
  outerStyle?: CSSProperties
  children: ReactNode
}

/**
 * Spinning conic gradient clipped to the rim band — same even-odd SVG ring as static border
 * ({@link svgRimRingPath}), sized with measured layout px so all four sides match.
 */
export function NodeRimGradientClip({ box, strokePx, radiusPx, scale = 1, outerStyle, children }: Props) {
  const maskUid = useId().replace(/:/g, '')
  const bw = Math.max(0.25, strokePx * scale)
  if (box.w <= 0 || box.h <= 0) return null

  const ringPath = svgRimRingPath(box, bw, radiusPx)
  if (!ringPath) return null

  const maskId = `rf-orbit-rim-${maskUid}`

  return (
    <>
      <svg aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={box.w} height={box.h}>
            <path d={ringPath} fill="white" fillRule="evenodd" />
          </mask>
        </defs>
      </svg>
      <div
        aria-hidden
        className="pointer-events-none absolute overflow-hidden"
        style={{
          left: 0,
          top: 0,
          width: box.w,
          height: box.h,
          borderRadius: radiusPx,
          WebkitMaskImage: `url(#${maskId})`,
          maskImage: `url(#${maskId})`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskSize: `${box.w}px ${box.h}px`,
          maskSize: `${box.w}px ${box.h}px`,
          ...outerStyle,
        }}
      >
        {children}
      </div>
    </>
  )
}
