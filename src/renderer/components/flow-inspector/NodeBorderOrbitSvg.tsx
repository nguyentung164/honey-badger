'use client'

import type { CSSProperties, ReactNode, RefObject } from 'react'
import { useRef } from 'react'
import type { FlowNodeAnimationKind, GradientStop } from 'shared/flowDiagramStyle'
import { parseFlowColor } from 'shared/flowColor'
import { FLOW_NODE_SHELL_RADIUS_PX } from '@/components/flow-inspector/flowNodeShellVisual'
import { NodeRimGradientClip } from '@/components/flow-inspector/NodeRimGradientClip'
import { ensureRainbowStyle, SpinningGrad } from '@/components/flow-inspector/borderGradientRing'
import { type NodeRimBox, svgRimCenterlinePath } from '@/components/flow-inspector/nodeRimGeometry'
import { useNodeRimBox } from '@/components/flow-inspector/useNodeRimBox'

/** Scale a "2.8s"-style duration string by a speed multiplier. */
function sd(base: string, speed: number): string {
  const s = Number.parseFloat(base) / Math.max(0.1, speed)
  return `${s.toFixed(2)}s`
}

// ── Gradient animation helpers ────────────────────────────────────────────

function hexToRgbArr(color: string): [number, number, number] {
  const { r, g, b } = parseFlowColor(color)
  return [r, g, b]
}

function hexToRgba(color: string, a: number): string {
  const parsed = parseFlowColor(color)
  const alpha = color.trim().startsWith('#') && color.trim().length <= 7 ? a : parsed.a
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${alpha.toFixed(3)})`
}

function interpolateGrad(stops: GradientStop[], pos: number): string {
  if (!stops.length) return '#94a3b8'
  const s = [...stops].sort((a, b) => a.position - b.position)
  if (pos <= s[0].position) return s[0].color
  if (pos >= s[s.length - 1].position) return s[s.length - 1].color
  const hi = s.findIndex(st => st.position > pos)
  const lo = s[hi - 1], h = s[hi]
  const t = (pos - lo.position) / (h.position - lo.position)
  const [lr, lg, lb] = hexToRgbArr(lo.color)
  const [hr, hg, hb] = hexToRgbArr(h.color)
  return `#${[lr + (hr - lr) * t, lg + (hg - lg) * t, lb + (hb - lb) * t].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Builds the conic-gradient COLOR STOPS (no outer wrapper) for a sweep region.
 * mode: 'lens' = symmetric fade-in + fade-out; 'cw' = tail→head (head at sweepEnd);
 *       'ccw' = head→tail (head at sweepStart).
 * reversed: flip stop color order (for CCW comets matching gradient direction of motion).
 */
function animGradStops(
  stops: GradientStop[],
  sweepStart: number,
  sweepEnd: number,
  mode: 'lens' | 'cw' | 'ccw',
  reversed = false,
  n = 14,
): string {
  const src = reversed
    ? [...stops].reverse().map((s, i, a) => ({
      color: s.color,
      position: ((a.length - 1 - i) / Math.max(1, a.length - 1)) * 100,
    }))
    : stops
  const range = sweepEnd - sweepStart
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const deg = (sweepStart + t * range).toFixed(1)
    const alpha =
      mode === 'lens' ? Math.min(1, Math.min(t, 1 - t) * 3.0)
      : mode === 'cw' ? Math.pow(t, 0.5)
      : Math.pow(1 - t, 0.5)
    return `${hexToRgba(interpolateGrad(src, t * 100), Math.max(0, Math.min(1, alpha)))} ${deg}deg`
  }).join(', ')
}

/** Full-ring conic gradient from accent stops (position 0–100 → degrees). */
function stopsToConicGradient(stops: GradientStop[]): string {
  const s = [...stops].sort((a, b) => a.position - b.position)
  if (!s.length) return 'conic-gradient(at 50% 50%, #94a3b8 0deg, #94a3b8 360deg)'
  const parts: string[] = []
  if (s[0].position > 0) parts.push(`${s[0].color} 0deg`)
  for (const st of s) {
    parts.push(`${st.color} ${((st.position / 100) * 360).toFixed(2)}deg`)
  }
  // 0° and 360° must share the same color or the ring shows a hard seam (neon, static halos).
  parts.push(`${s[0].color} 360deg`)
  return `conic-gradient(at 50% 50%, ${parts.join(', ')})`
}

/** Base palette from accent stops (one entry per stop). */
function marqueeDotColors(grad: GradientStop[] | null, accent: string): string[] {
  if (!grad?.length) return [accent]
  return [...grad].sort((a, b) => a.position - b.position).map(s => s.color)
}

const MARQUEE_MIN_DOTS = 18
const MARQUEE_REPEAT_PER_COLOR = 4

/** Repeat palette around the ring so marquee shows many chaser dots. */
function buildMarqueeDotColors(grad: GradientStop[] | null, accent: string): string[] {
  const base = marqueeDotColors(grad, accent)
  const total = Math.max(MARQUEE_MIN_DOTS, base.length * MARQUEE_REPEAT_PER_COLOR)
  return Array.from({ length: total }, (_, i) => base[i % base.length] ?? accent)
}

/** Long neon sweep (~340°) with soft caps; seam colors cross-fade at 0°/360°. */
function neonSweepGradient(stops: GradientStop[]): string {
  const sweepStart = 8
  const sweepEnd = 352
  const feather = 14
  const fadeIn = Math.max(0, sweepStart - feather)
  const fadeOut = Math.min(360, sweepEnd + feather)
  const body = animGradStops(stops, sweepStart, sweepEnd, 'lens', false, 32)
  const sorted = [...stops].sort((a, b) => a.position - b.position)
  const first = sorted[0]?.color ?? '#94a3b8'
  const last = sorted[sorted.length - 1]?.color ?? first
  const seamLo = hexToRgba(last, 0.14)
  const seamHi = hexToRgba(first, 0.14)
  return (
    `conic-gradient(at 50% 50%, ${seamLo} 0deg, transparent ${fadeIn.toFixed(1)}deg, ` +
    `${body}, transparent ${fadeOut.toFixed(1)}deg, ${seamHi} 360deg)`
  )
}

function borderConicBackground(accent: string, grad: GradientStop[] | null): string {
  return grad ? stopsToConicGradient(grad) : `conic-gradient(at 50% 50%, ${accent} 0deg, ${accent} 360deg)`
}

type FocusCorner = 'tl' | 'tr' | 'br' | 'bl'

/** Corner L-brackets in CSS px — same `rx` as the node card (`<rect rx={rx}>`). */
function FocusBracketCorner({
  corner, arm, rx, color, sw, dur, delay,
}: {
  corner: FocusCorner
  arm: number
  rx: number
  color: string
  sw: number
  dur: string
  delay: string
}) {
  const shared: React.CSSProperties = {
    position: 'absolute',
    width: arm,
    height: arm,
    pointerEvents: 'none',
    borderStyle: 'solid',
    borderColor: color,
    opacity: 0.35,
    animationName: 'rf-focus-pulse',
    animationDuration: dur,
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    animationDelay: delay,
    animationFillMode: 'backwards',
  }
  const byCorner: Record<FocusCorner, React.CSSProperties> = {
    tl: {
      ...shared,
      top: 0,
      left: 0,
      borderWidth: `${sw}px 0 0 ${sw}px`,
      borderTopLeftRadius: rx,
    },
    tr: {
      ...shared,
      top: 0,
      right: 0,
      borderWidth: `${sw}px ${sw}px 0 0`,
      borderTopRightRadius: rx,
    },
    br: {
      ...shared,
      bottom: 0,
      right: 0,
      borderWidth: `0 ${sw}px ${sw}px 0`,
      borderBottomRightRadius: rx,
    },
    bl: {
      ...shared,
      bottom: 0,
      left: 0,
      borderWidth: `0 0 ${sw}px ${sw}px`,
      borderBottomLeftRadius: rx,
    },
  }
  return <span aria-hidden style={byCorner[corner]} />
}

/** Glassmorphism border: frost + accent tint + white specular highlight. */
function glassRimFrostGradient(accent: string, grad: GradientStop[] | null): string {
  const tint = hexToRgba(accent, 0.22)
  const tintLo = hexToRgba(accent, 0.1)
  const frostHi = 'rgba(255,255,255,0.42)'
  const frostLo = 'rgba(255,255,255,0.1)'
  if (grad) {
    const s = [...grad].sort((a, b) => a.position - b.position)
    const mid = hexToRgba(interpolateGrad(s, 50), 0.28)
    return `conic-gradient(at 50% 50%, ${frostLo} 0deg, ${tintLo} 70deg, ${mid} 160deg, ${frostHi} 250deg, ${tint} 320deg, ${frostLo} 360deg)`
  }
  return `conic-gradient(at 50% 50%, ${frostLo} 0deg, ${tintLo} 90deg, ${frostHi} 210deg, ${tint} 300deg, ${frostLo} 360deg)`
}

function glassRimSpecularSheen(): string {
  return (
    'conic-gradient(at 50% 50%, transparent 0deg, transparent 252deg, ' +
    'rgba(255,255,255,0.65) 272deg, rgba(255,255,255,0.18) 292deg, transparent 312deg 360deg)'
  )
}

const NEON_GRAD_LAYER: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  minWidth: '300%',
  minHeight: '300%',
  aspectRatio: '1',
  transform: 'translate(-50%, -50%)',
}

type RimAnimCtx = {
  box: NodeRimBox
  bw: number
  rx: number
  accent: string
  grad: GradientStop[] | null
  speed: number
}

function RimStrokeSvg({
  ctx,
  stroke,
  strokeWidth,
  strokeDasharray,
  strokeLinecap = 'round',
  children,
}: {
  ctx: RimAnimCtx
  stroke: string
  strokeWidth?: number
  strokeDasharray: string
  strokeLinecap?: 'round' | 'butt'
  children?: ReactNode
}) {
  const path = svgRimCenterlinePath(ctx.box, ctx.bw, ctx.rx)
  if (!path) return null
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
      viewBox={`0 0 ${ctx.box.w} ${ctx.box.h}`}
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth ?? ctx.bw}
        strokeLinecap={strokeLinecap}
        pathLength={100}
        strokeDasharray={strokeDasharray}
      >
        {children}
      </path>
    </svg>
  )
}

function RimGradientRing({
  ctx,
  scale = 1,
  outerStyle,
  children,
}: {
  ctx: RimAnimCtx
  scale?: number
  outerStyle?: CSSProperties
  children: ReactNode
}) {
  return (
    <NodeRimGradientClip box={ctx.box} strokePx={ctx.bw} radiusPx={ctx.rx} scale={scale} outerStyle={outerStyle}>
      {children}
    </NodeRimGradientClip>
  )
}

function renderOrbitKind(kind: FlowNodeAnimationKind, ctx: RimAnimCtx): ReactNode {
  const { accent, grad, speed, bw, rx } = ctx

  switch (kind) {
    case 'glow':
      return (
        <RimStrokeSvg ctx={ctx} stroke={accent} strokeDasharray="11 89">
          <animate attributeName="stroke-dashoffset" from="0" to="-100" dur={sd('2.8s', speed)} repeatCount="indefinite" />
        </RimStrokeSvg>
      )

    case 'pulse':
      return (
        <RimStrokeSvg ctx={ctx} stroke={accent} strokeDasharray="26 74">
          <animate attributeName="stroke-dashoffset" from="0" to="-100" dur={sd('2.05s', speed)} repeatCount="indefinite" />
        </RimStrokeSvg>
      )

    case 'bounce': {
      ensureRainbowStyle()
      const dur = sd('3.7s', speed)
      const bg = grad
        ? `conic-gradient(at 50% 50%, transparent 0deg, transparent 124deg, ${animGradStops(grad, 126, 174, 'cw')}, transparent 174deg, transparent 304deg, ${animGradStops(grad, 306, 354, 'cw')}, transparent 354deg 360deg)`
        : `conic-gradient(at 50% 50%, transparent 0deg, transparent 126deg, ${accent} 174deg, transparent 174deg, transparent 306deg, ${accent} 354deg, transparent 354deg 360deg)`
      return (
        <RimGradientRing ctx={ctx}>
          <SpinningGrad dur={dur} gradient={bg} />
        </RimGradientRing>
      )
    }

    case 'beam': {
      ensureRainbowStyle()
      const dur = sd('3s', speed)
      // Symmetric lens (nhọn 2 đầu): transparent → gradient/accent → transparent.
      const bg = grad
        ? `conic-gradient(at 50% 50%, transparent 0deg, transparent 248deg, ${animGradStops(grad, 250, 360, 'lens')}, transparent 360deg)`
        : `conic-gradient(at 50% 50%, transparent 0deg, transparent 250deg, ${accent} 305deg, transparent 360deg)`
      return (
        <RimGradientRing ctx={ctx}>
          <SpinningGrad dur={dur} gradient={bg} />
        </RimGradientRing>
      )
    }

    case 'doubleBeam': {
      ensureRainbowStyle()
      const dur = sd('2.4s', speed)
      const half = Number.parseFloat(dur) / 2
      // CW comet: bright at HIGH angle (354°) = CW-leading edge.
      const cwGrad = grad
        ? `conic-gradient(at 50% 50%, transparent 0deg, transparent 304deg, ${animGradStops(grad, 306, 354, 'cw')}, transparent 354deg 360deg)`
        : `conic-gradient(at 50% 50%, transparent 0deg, transparent 306deg, ${accent} 354deg, transparent 354deg 360deg)`
      // CCW comet: bright at LOW angle (306°) = CCW-leading edge.
      // reversed=true so the gradient progresses in the direction of CCW motion (head=last stop).
      const ccwGrad = grad
        ? `conic-gradient(at 50% 50%, transparent 0deg, transparent 304deg, ${animGradStops(grad, 306, 354, 'ccw', true)}, transparent 354deg 360deg)`
        : `conic-gradient(at 50% 50%, transparent 0deg, transparent 306deg, ${accent} 306deg, transparent 354deg 360deg)`
      return (
        <RimGradientRing ctx={ctx}>
          <SpinningGrad dur={dur} gradient={cwGrad} />
          <SpinningGrad dur={dur} gradient={ccwGrad} ccw delay={half} />
        </RimGradientRing>
      )
    }

    /** Marquee: many colored dots per lap (palette repeats around the ring). */
    case 'dots': {
      const dur = sd('2.5s', speed)
      const colors = buildMarqueeDotColors(grad, accent)
      const n = colors.length
      const slot = 100 / n
      const dotLen = Math.min(2.8, slot * 0.38)
      const gap = 100 - dotLen
      return (
        <>
          {colors.map((color, i) => (
            <RimStrokeSvg
              key={i}
              ctx={ctx}
              stroke={color}
              strokeWidth={bw * 1.35}
              strokeDasharray={`${dotLen.toFixed(3)} ${gap.toFixed(3)}`}
            >
              <animate
                attributeName="stroke-dashoffset"
                from={(-i * slot).toFixed(3)}
                to={(-i * slot - 100).toFixed(3)}
                dur={dur}
                repeatCount="indefinite"
              />
            </RimStrokeSvg>
          ))}
        </>
      )
    }

    case 'borderBeam': {
      ensureRainbowStyle()
      const dur = sd('2.2s', speed)
      const stops = grad ?? [{ color: accent, position: 0 }, { color: accent, position: 100 }]
      const bg =
        `conic-gradient(at 50% 50%, transparent 0deg, transparent 308deg, ` +
        `${animGradStops(stops, 310, 346, 'cw', false, 8)}, transparent 348deg 360deg)`
      return (
        <RimGradientRing ctx={ctx} scale={1.15}>
          <SpinningGrad dur={dur} gradient={bg} />
        </RimGradientRing>
      )
    }

    case 'aurora': {
      ensureRainbowStyle()
      const durMesh = sd('18s', speed)
      const durBlob = sd('12s', speed)
      const breathe = sd('5s', speed)
      const stops = grad ?? [{ color: accent, position: 0 }, { color: accent, position: 100 }]
      const mesh = borderConicBackground(accent, grad)
      const blob =
        `conic-gradient(at 50% 50%, transparent 0deg, transparent 36deg, ` +
        `${animGradStops(stops, 38, 128, 'lens', false, 18)}, transparent 130deg 360deg)`
      return (
        <>
          <RimGradientRing ctx={ctx} scale={0.85} outerStyle={{ opacity: 0.38 }}>
            <SpinningGrad dur={durMesh} gradient={mesh} />
          </RimGradientRing>
          <RimGradientRing ctx={ctx} scale={2} outerStyle={{ filter: 'blur(6px)' }}>
            <div
              style={{
                width: '100%',
                height: '100%',
                animationName: 'rf-aurora-breathe',
                animationDuration: breathe,
                animationTimingFunction: 'ease-in-out',
                animationIterationCount: 'infinite',
              }}
            >
              <SpinningGrad dur={durBlob} gradient={blob} ccw />
            </div>
          </RimGradientRing>
        </>
      )
    }

    case 'shimmer': {
      ensureRainbowStyle()
      const dur = sd('3.5s', speed)
      const bg = grad
        ? `conic-gradient(at 50% 50%, transparent 0deg, transparent 222deg, ${animGradStops(grad, 224, 354, 'cw')}, transparent 354deg 360deg)`
        : `conic-gradient(at 50% 50%, transparent 0deg, transparent 224deg, ${accent} 354deg, transparent 354deg 360deg)`
      return (
        <RimGradientRing ctx={ctx}>
          <SpinningGrad dur={dur} gradient={bg} />
        </RimGradientRing>
      )
    }

    case 'radar':
      return (
        <RimStrokeSvg ctx={ctx} stroke={accent} strokeWidth={bw * 1.25} strokeDasharray="5 95">
          <animate attributeName="stroke-dashoffset" from="0" to="-100" dur={sd('4.5s', speed)} repeatCount="indefinite" />
        </RimStrokeSvg>
      )

    case 'dashed':
      return (
        <RimStrokeSvg ctx={ctx} stroke={accent} strokeDasharray="8 9">
          <animate attributeName="stroke-dashoffset" from="0" to="-100" dur={sd('3s', speed)} repeatCount="indefinite" />
        </RimStrokeSvg>
      )

    case 'neon': {
      ensureRainbowStyle()
      const dur = sd('2.8s', speed)
      const sweepStops = grad ?? [{ color: accent, position: 0 }, { color: accent, position: 100 }]
      const sweep = neonSweepGradient(sweepStops)
      const halo = borderConicBackground(accent, grad)
      return (
        <>
          <RimGradientRing ctx={ctx} scale={0.55}>
            <div style={{ ...NEON_GRAD_LAYER, background: halo, opacity: grad ? 0.14 : 0.16 }} />
          </RimGradientRing>
          <RimGradientRing ctx={ctx} scale={2.4} outerStyle={{ filter: 'blur(7px)' }}>
            <SpinningGrad dur={dur} gradient={sweep} />
          </RimGradientRing>
          <RimGradientRing ctx={ctx} scale={0.95}>
            <SpinningGrad dur={dur} gradient={sweep} />
          </RimGradientRing>
        </>
      )
    }

    case 'morse': {
      ensureRainbowStyle()
      const dur = sd('3.5s', speed)
      const bg = grad
        ? `conic-gradient(at 50% 50%, transparent 0deg, ${animGradStops(grad, 0, 29, 'lens', false, 8)}, transparent 29deg, transparent 43deg, ${animGradStops(grad, 43, 54, 'lens', false, 6)}, transparent 54deg, transparent 68deg, ${animGradStops(grad, 68, 97, 'lens', false, 8)}, transparent 97deg 360deg)`
        : `conic-gradient(at 50% 50%, transparent 0deg, ${accent} 14deg, transparent 29deg, transparent 43deg, ${accent} 49deg, transparent 54deg, transparent 68deg, ${accent} 83deg, transparent 97deg, transparent 360deg)`
      return (
        <RimGradientRing ctx={ctx}>
          <SpinningGrad dur={dur} gradient={bg} />
        </RimGradientRing>
      )
    }

    case 'focusBrackets': {
      ensureRainbowStyle()
      const dur = sd('2.2s', speed)
      const arm = Math.min(36, Math.round(12 + rx * 1.65))
      const sw = Math.max(0.25, bw)
      const sorted = grad ? [...grad].sort((a, b) => a.position - b.position) : []
      const cornerColors: [string, string, string, string] = [
        sorted[0]?.color ?? accent,
        sorted[1]?.color ?? sorted[0]?.color ?? accent,
        sorted[sorted.length - 1]?.color ?? accent,
        sorted[Math.max(0, sorted.length - 2)]?.color ?? sorted[0]?.color ?? accent,
      ]
      const corners: FocusCorner[] = ['tl', 'tr', 'br', 'bl']
      return (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
          {corners.map((c, i) => (
            <FocusBracketCorner
              key={c}
              corner={c}
              arm={arm}
              rx={rx}
              color={cornerColors[i]}
              sw={sw}
              dur={dur}
              delay={`${(i * 0.18).toFixed(2)}s`}
            />
          ))}
        </div>
      )
    }

    case 'sparkle': {
      const count = 12
      const palette = buildMarqueeDotColors(grad, accent)
      const lap = sd('2.6s', speed)
      const twinkle = sd('1.35s', speed)
      const slot = 100 / count
      return (
        <>
          {Array.from({ length: count }, (_, i) => {
            const phase = (-slot * i).toFixed(2)
            const color = palette[i % palette.length] ?? accent
            const begin = ((i / count) * Number.parseFloat(lap)).toFixed(2)
            return (
              <RimStrokeSvg key={i} ctx={ctx} stroke={color} strokeWidth={bw * 1.25} strokeDasharray="0.001 99.999">
                <animate
                  attributeName="stroke-dashoffset"
                  from={phase}
                  to={(Number(phase) - 100).toFixed(2)}
                  dur={lap}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="stroke-opacity"
                  values="0.1;1;0.1"
                  keyTimes="0;0.42;1"
                  dur={twinkle}
                  begin={`${begin}s`}
                  repeatCount="indefinite"
                />
              </RimStrokeSvg>
            )
          })}
        </>
      )
    }

    case 'glassRim': {
      ensureRainbowStyle()
      const frost = glassRimFrostGradient(accent, grad)
      const specular = glassRimSpecularSheen()
      const innerGloss =
        'conic-gradient(at 50% 50%, rgba(255,255,255,0.2) 0deg, rgba(255,255,255,0.04) 120deg, rgba(255,255,255,0.16) 240deg, rgba(255,255,255,0.2) 360deg)'
      return (
        <>
          <RimGradientRing
            ctx={ctx}
            scale={0.8}
            outerStyle={{
              opacity: 0.72,
              backdropFilter: 'blur(12px) saturate(1.35)',
              WebkitBackdropFilter: 'blur(12px) saturate(1.35)',
            }}
          >
            <SpinningGrad dur={sd('30s', speed)} gradient={frost} />
          </RimGradientRing>
          <RimGradientRing ctx={ctx} scale={0.45} outerStyle={{ opacity: 0.9 }}>
            <SpinningGrad dur={sd('5s', speed)} gradient={specular} />
          </RimGradientRing>
          <RimGradientRing ctx={ctx} scale={Math.max(0.5, bw * 0.3) / bw} outerStyle={{ opacity: 0.5 }}>
            <SpinningGrad dur={sd('18s', speed)} gradient={innerGloss} ccw />
          </RimGradientRing>
        </>
      )
    }

    default:
      return null
  }
}

/** Animated border — same rim geometry + frame measure as {@link NodeInlineRimOverlay}. */
export function NodeBorderOrbitSvg({
  measureRef: measureRefProp,
  kind,
  accent,
  gradient,
  rx = FLOW_NODE_SHELL_RADIUS_PX,
  speed = 1,
  borderPx = 0.75,
}: {
  measureRef?: RefObject<HTMLElement | null>
  kind: FlowNodeAnimationKind
  accent: string
  gradient?: GradientStop[]
  rx?: number
  speed?: number
  borderPx?: number
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const measureRef = measureRefProp ?? hostRef
  const box = useNodeRimBox(measureRef)

  if (!kind || kind === 'none') return null

  const bw = Math.max(0.25, borderPx)
  const grad = gradient && gradient.length >= 2 && new Set(gradient.map(s => s.color)).size > 1 ? gradient : null
  const ctx: RimAnimCtx = { box, bw, rx, accent, grad, speed }

  return (
    <div
      ref={measureRefProp ? undefined : hostRef}
      className="pointer-events-none absolute z-[1] overflow-visible"
      style={
        box.w > 0 && box.h > 0
          ? { left: 0, top: 0, width: box.w, height: box.h }
          : { left: 0, top: 0, right: 0, bottom: 0 }
      }
      aria-hidden
    >
      {box.w > 0 && box.h > 0 ? renderOrbitKind(kind, ctx) : null}
    </div>
  )
}
