import { useId } from 'react'
import { cn } from '@/lib/utils'
import { FRAME_LAYOUTS, TIER_TO_SHAPE, type FrameShape } from './badgeFrameLayout'

type CircleStroke = {
  kind: 'circle'
  viewBox: string
  cx: number
  cy: number
  r: number
}

type PathStroke = {
  kind: 'path'
  viewBox: string
  d: string
}

type ShapeStroke = CircleStroke | PathStroke

/** Outer silhouette paths from Figma `base.svg` per shape — stroke follows exact badge border. */
const SHAPE_STROKES: Record<FrameShape, ShapeStroke> = {
  circle: {
    kind: 'circle',
    viewBox: '0 0 146.667 146.667',
    cx: 73.3333,
    cy: 73.3333,
    r: 73.3333,
  },
  shield: {
    kind: 'path',
    viewBox: '0 0 139.333 145.21',
    d: 'M0 9.16667C0 4.10406 4.10406 0 9.16667 0H130.167C135.229 0 139.333 4.10406 139.333 9.16667V100.601C139.333 103.855 137.608 106.866 134.8 108.511L74.3001 143.952C71.4386 145.629 67.8948 145.629 65.0332 143.952L4.53323 108.511C1.72532 106.866 0 103.855 0 100.601V9.16667Z',
  },
  pentagon: {
    kind: 'path',
    viewBox: '0 0 159.58 152.606',
    d: 'M73.8004 1.94446C77.3728 -0.648158 82.2077 -0.64815 85.7801 1.94447L155.372 52.4496C158.95 55.0464 160.447 59.6531 159.08 63.8575L132.503 145.562C131.136 149.763 127.222 152.606 122.805 152.606H36.7756C32.3589 152.606 28.4441 149.763 27.0779 145.562L0.50085 63.8575C-0.866756 59.6531 0.630575 55.0464 4.20879 52.4496L73.8004 1.94446Z',
  },
  hexagon: {
    kind: 'path',
    viewBox: '0 0 141.167 161.602',
    d: 'M65.6438 1.33541C68.6961 -0.445136 72.4705 -0.445137 75.5229 1.33541L136.303 36.7905C139.315 38.5473 141.167 41.7716 141.167 45.2583V116.344C141.167 119.831 139.315 123.055 136.303 124.812L75.5229 160.267C72.4705 162.048 68.6961 162.048 65.6438 160.267L4.86367 124.812C1.85194 123.055 0 119.831 0 116.344V45.2583C0 41.7716 1.85194 38.5473 4.86367 36.7905L65.6438 1.33541Z',
  },
}

const TIER_PULSE_GRADIENT: Record<string, { a: string; b: string; c: string }> = {
  bronze: { a: '#FFE8C8', b: '#E8A050', c: '#8C4010' },
  silver: { a: '#F4F6FC', b: '#B0B8D0', c: '#5A6478' },
  gold: { a: '#FFF6BF', b: '#FFD060', c: '#B8860B' },
  special: { a: '#F0E0FF', b: '#A855F7', c: '#5820A8' },
  negative: { a: '#FECACA', b: '#EF4444', c: '#7F1D1D' },
}

function PulseStroke({
  stroke,
  gradientId,
  delay,
}: {
  stroke: ShapeStroke
  gradientId: string
  delay: string
}) {
  const common = {
    fill: 'none' as const,
    stroke: `url(#${gradientId})`,
    strokeWidth: 3.5,
    strokeLinejoin: 'round' as const,
    className: 'animate-badge-pulse-ring origin-center',
    style: { animationDelay: delay, transformBox: 'fill-box' as const, transformOrigin: 'center' },
  }

  return stroke.kind === 'circle' ? (
    <circle cx={stroke.cx} cy={stroke.cy} r={stroke.r} {...common} />
  ) : (
    <path d={stroke.d} {...common} />
  )
}

/**
 * One-shot SVG stroke pulse aligned to each badge tier shape (unlock dialog).
 * Uses the same outer path as Figma frame `base.svg`.
 */
export function BadgePulseRing({ tier, className }: { tier: string; className?: string }) {
  const shape = TIER_TO_SHAPE[tier] ?? TIER_TO_SHAPE.bronze
  const layout = FRAME_LAYOUTS[shape].base
  const stroke = SHAPE_STROKES[shape]
  const colors = TIER_PULSE_GRADIENT[tier] ?? TIER_PULSE_GRADIENT.bronze
  const rawUid = useId()
  const uid = rawUid.replace(/[^a-zA-Z0-9]/g, '_')
  const gradientId = `${uid}pulse`

  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 select-none', className)}>
      <div
        className="absolute"
        style={{ left: layout.left, top: layout.top, width: layout.width, height: layout.height }}
      >
        <div className="absolute" style={{ inset: layout.inset ?? 0 }}>
          <svg viewBox={stroke.viewBox} className="size-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={colors.a} stopOpacity="0.95" />
                <stop offset="45%" stopColor={colors.b} stopOpacity="0.85" />
                <stop offset="100%" stopColor={colors.c} stopOpacity="0.7" />
              </linearGradient>
            </defs>
            <PulseStroke stroke={stroke} gradientId={gradientId} delay="0.12s" />
            <PulseStroke stroke={stroke} gradientId={gradientId} delay="0.38s" />
          </svg>
        </div>
      </div>
    </div>
  )
}
