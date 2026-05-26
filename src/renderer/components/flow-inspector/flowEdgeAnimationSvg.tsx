/**
 * SVG layers for path-based edge animations (StyledFlowEdge + inspector previews).
 */

/** Fixed positions along path (0–1) for firefly twinkle — no travel, opacity only. */
export const FLOW_EDGE_FIREFLY_KEYPOINTS = [0.15, 0.35, 0.55, 0.75, 0.9] as const

/** Discrete hop fractions for serpent (quantum) animation. */
const QUANTUM_HOP_FRACTIONS = [0, 0.2, 0.4, 0.6, 0.8, 1] as const

export function flowEdgeAnimDuration(baseSeconds: number, animSpeed: number): string {
  return `${(baseSeconds / Math.max(0.1, animSpeed)).toFixed(2)}s`
}

export function spotlightSweepDash(strokeW: number): { seg: number; gap: number } {
  const seg = Math.max(10, strokeW * 11)
  const gap = 240
  return { seg, gap }
}

type AnimLayerProps = {
  path: string
  color: string
  strokeW: number
  animSpeed: number
}

type StrokeAnimProps = AnimLayerProps & {
  /** Stroke paint (solid or `url(#gradient)`). */
  stroke: string
}

/** Single bright segment sweeping along a dim base edge (spotlight). */
export function FlowEdgeSpotlightSweep({ path, stroke, strokeW, animSpeed }: StrokeAnimProps) {
  const { seg, gap } = spotlightSweepDash(strokeW)
  const period = seg + gap
  const dur = flowEdgeAnimDuration(1.75, animSpeed)
  return (
    <path d={path} fill="none" stroke={stroke} strokeWidth={strokeW} strokeLinecap="round" strokeDasharray={`${seg} ${gap}`}>
      <animate attributeName="stroke-dashoffset" values={`0;-${period}`} dur={dur} repeatCount="indefinite" />
    </path>
  )
}

/** Bidirectional marker (diamond) ping-pong along path. */
export function FlowEdgeShuttleMarker({ path, color, strokeW, animSpeed }: AnimLayerProps) {
  const dur = flowEdgeAnimDuration(2.4, animSpeed)
  const half = Math.max(2.5, strokeW * 1.1)
  return (
    <polygon points={`0,${-half} ${half * 1.35},0 0,${half} ${-half * 1.35},0`} fill={color} opacity={0.92}>
      <animateMotion
        dur={dur}
        repeatCount="indefinite"
        path={path}
        rotate="auto"
        keyPoints="0;1;0"
        keyTimes="0;0.5;1"
        calcMode="linear"
      />
    </polygon>
  )
}

/** Packet that hops between fixed path fractions (quantum / discrete). */
export function FlowEdgeQuantumHopMarker({ path, color, strokeW, animSpeed }: AnimLayerProps) {
  const dur = flowEdgeAnimDuration(2.1, animSpeed)
  const r = Math.max(2.2, strokeW * 0.65)
  const rPulse = r * 1.55
  const keyPoints = QUANTUM_HOP_FRACTIONS.flatMap(f => [f, f]).join(';')
  const n = QUANTUM_HOP_FRACTIONS.length
  const keyTimes = QUANTUM_HOP_FRACTIONS.flatMap((_, i) => {
    const t = (i / (n - 1)).toFixed(3)
    return [t, t]
  }).join(';')
  return (
    <g>
      <circle r={r * 2.2} fill={color} opacity={0.12}>
        <animateMotion dur={dur} repeatCount="indefinite" path={path} keyPoints={keyPoints} keyTimes={keyTimes} calcMode="linear" />
        <animate attributeName="opacity" values="0;0.2;0;0.2;0;0.2;0" dur={dur} repeatCount="indefinite" />
      </circle>
      <circle r={r} fill={color} stroke="#ffffff" strokeWidth={0.35} strokeOpacity={0.55}>
        <animateMotion dur={dur} repeatCount="indefinite" path={path} keyPoints={keyPoints} keyTimes={keyTimes} calcMode="linear" />
        <animate attributeName="r" values={`${r};${rPulse};${r};${rPulse};${r};${rPulse};${r}`} dur={dur} repeatCount="indefinite" />
      </circle>
    </g>
  )
}

/** Twinkling dots held at fixed path fractions. */
export function FlowEdgeFireflyMarkers({ path, color, strokeW, animSpeed }: AnimLayerProps) {
  return (
    <>
      {FLOW_EDGE_FIREFLY_KEYPOINTS.map((kp, i) => {
        const begin = (i * 0.22) / animSpeed
        const twinkleDur = flowEdgeAnimDuration(0.85 + i * 0.14, animSpeed)
        return (
          <circle key={kp} r={Math.max(1.8, strokeW * 0.5)} fill={color}>
            <animateMotion dur="1s" repeatCount="indefinite" path={path} keyPoints={`${kp};${kp}`} keyTimes="0;1" calcMode="linear" />
            <animate
              attributeName="opacity"
              values="0.06;0.98;0.06"
              dur={twinkleDur}
              repeatCount="indefinite"
              begin={`${begin.toFixed(2)}s`}
            />
          </circle>
        )
      })}
    </>
  )
}
