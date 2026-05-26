'use client'

import { useId, useRef, type RefObject } from 'react'
import type { CSSProperties } from 'react'
import type { GradientStop } from 'shared/flowDiagramStyle'
import { FLOW_NODE_SHELL_RADIUS_PX } from '@/components/flow-inspector/flowNodeShellVisual'
import { nodeRimGeometry, svgRimRingPath, svgRoundedRectPath } from '@/components/flow-inspector/nodeRimGeometry'
import { useNodeRimBox } from '@/components/flow-inspector/useNodeRimBox'

type Props = {
  /** Card frame to measure — layout px, not getBoundingClientRect (RF viewport zoom skews that). */
  measureRef: RefObject<HTMLElement | null>
  strokePx: number
  radiusPx?: number
  solidColor?: string
  gradientStops?: GradientStop[]
  /** Inset panel fill — same geometry as the ring hole (SVG or HTML fallback for CSS gradients). */
  panelFill?: CSSProperties
}

/**
 * Viền = even-odd path (fill), mép ngoài khớp border box (0,0,w,h) — không dùng stroke centerline.
 */
export function NodeInlineRimOverlay({
  measureRef,
  strokePx,
  radiusPx = FLOW_NODE_SHELL_RADIUS_PX,
  solidColor,
  gradientStops,
  panelFill,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const box = useNodeRimBox(measureRef)
  const gradId = useId().replace(/:/g, '')

  if (strokePx <= 0) {
    return <div ref={hostRef} aria-hidden className="pointer-events-none absolute inset-0 z-[1]" />
  }

  if (box.w <= 0 || box.h <= 0) {
    return <div ref={hostRef} aria-hidden className="pointer-events-none absolute inset-0 z-[1]" />
  }

  const stops = gradientStops && gradientStops.length >= 2 ? gradientStops : null
  const ringFill = stops != null ? `url(#rf-rim-${gradId})` : (solidColor ?? '#94a3b8')
  const ringPath = svgRimRingPath(box, strokePx, radiusPx)
  const { inset, innerRx } = nodeRimGeometry(strokePx, box, radiusPx)
  const innerW = Math.max(0, box.w - inset * 2)
  const innerH = Math.max(0, box.h - inset * 2)
  const innerPath = svgRoundedRectPath(inset, inset, innerW, innerH, innerRx)

  const panelUsesImage = Boolean(panelFill?.backgroundImage)
  const panelColor = panelFill?.backgroundColor

  return (
    <div ref={hostRef} aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-visible">
      {panelUsesImage ? (
        <div
          className="absolute"
          style={{
            top: inset,
            right: inset,
            bottom: inset,
            left: inset,
            borderRadius: innerRx,
            backgroundImage: panelFill?.backgroundImage,
            backgroundColor: panelFill?.backgroundColor,
          }}
        />
      ) : null}

      <svg className="absolute inset-0 size-full overflow-visible" aria-hidden>
        {stops ? (
          <defs>
            <linearGradient id={`rf-rim-${gradId}`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={box.w} y2={box.h}>
              {stops.map((stop, i) => (
                <stop key={i} offset={`${stop.position}%`} stopColor={stop.color} />
              ))}
            </linearGradient>
          </defs>
        ) : null}

        {!panelUsesImage && panelColor && innerPath ? (
          <path d={innerPath} fill={panelColor} />
        ) : null}

        {ringPath ? <path d={ringPath} fill={ringFill} fillRule="evenodd" /> : null}
      </svg>
    </div>
  )
}
