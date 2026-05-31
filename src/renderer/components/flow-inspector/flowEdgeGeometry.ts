import { getBezierPath, getSmoothStepPath, getStraightPath, type Position } from '@xyflow/react'
import {
  FLOW_RUN_ORDER_GLYPH_HALF_PX,
  FLOW_RUN_ORDER_LINE_CLEARANCE_PX,
  FLOW_RUN_ORDER_NORMAL_PARALLEL_EPS,
  FLOW_RUN_ORDER_OFFSET_FROM_PORT_PX,
  FLOW_RUN_ORDER_SIBLING_SPREAD_PX,
} from 'shared/flowEdgeRunOrderLayout'
import type { FlowEdgeCurveKind } from 'shared/flowDiagramStyle'

export type FlowEdgePathParams = {
  sourceX: number
  sourceY: number
  sourcePosition: Position
  targetX: number
  targetY: number
  targetPosition: Position
}

export function getFlowEdgePath(curve: FlowEdgeCurveKind, p: FlowEdgePathParams): { path: string; labelX: number; labelY: number } {
  switch (curve) {
    case 'straight': {
      const [path, labelX, labelY] = getStraightPath(p)
      return { path, labelX, labelY }
    }
    case 'step': {
      const [path, labelX, labelY] = getSmoothStepPath(p)
      return { path, labelX, labelY }
    }
    case 'curved':
    default: {
      const [path, labelX, labelY] = getBezierPath(p)
      return { path, labelX, labelY }
    }
  }
}

export type FlowEdgeRunOrderBadgePlacement = {
  path: string
  fanMax?: number
  fanIndex?: number
  strokeWidthPx?: number
  offsetFromPortPx?: number
  lineClearancePx?: number
}

export function portLabelAxes(targetPosition: Position): {
  outward: { ox: number; oy: number }
  spread: { sx: number; sy: number }
} {
  switch (targetPosition) {
    case 'top':
      return { outward: { ox: 0, oy: -1 }, spread: { sx: 1, sy: 0 } }
    case 'bottom':
      return { outward: { ox: 0, oy: 1 }, spread: { sx: 1, sy: 0 } }
    case 'left':
      return { outward: { ox: -1, oy: 0 }, spread: { sx: 0, sy: 1 } }
    case 'right':
      return { outward: { ox: 1, oy: 0 }, spread: { sx: 0, sy: 1 } }
    default:
      return { outward: { ox: 0, oy: -1 }, spread: { sx: 1, sy: 0 } }
  }
}

/** Tangent at target from real SVG path (straight / bezier / step) or source→target chord. */
export function getEdgeTangentAtTargetHandle(pathD: string, p: FlowEdgePathParams): { tx: number; ty: number } {
  return getPathGeometryAtTarget(pathD, p)
}

/** Path tangent + optional near-target point from `getPointAtLength`. */
export function getPathGeometryAtTarget(
  pathD: string,
  p: FlowEdgePathParams,
): { tx: number; ty: number } {
  if (typeof document !== 'undefined' && pathD.trim()) {
    try {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      el.setAttribute('d', pathD)
      const total = el.getTotalLength()
      if (total > 0 && Number.isFinite(total)) {
        const delta = Math.min(14, Math.max(4, total * 0.06))
        const back = el.getPointAtLength(Math.max(0, total - delta))
        let tx = p.targetX - back.x
        let ty = p.targetY - back.y
        const tlen = Math.hypot(tx, ty) || 1
        return { tx: tx / tlen, ty: ty / tlen }
      }
    } catch {
      /* chord fallback */
    }
  }

  const dx = p.targetX - p.sourceX
  const dy = p.targetY - p.sourceY
  const len = Math.hypot(dx, dy) || 1
  return { tx: dx / len, ty: dy / len }
}

/**
 * Unit vector to push the label off the stroke (perpendicular to path tangent).
 * If that direction parallels port-outward, use spread axis instead (step corner case).
 */
export function lineClearanceUnit(
  tangent: { tx: number; ty: number },
  outward: { ox: number; oy: number },
  spread: { sx: number; sy: number },
  sourceSideSign: number,
): { lx: number; ly: number } {
  let lx = -tangent.ty
  let ly = tangent.tx
  let dotOut = lx * outward.ox + ly * outward.oy
  if (dotOut < 0) {
    lx = -lx
    ly = -ly
    dotOut = -dotOut
  }

  if (dotOut > FLOW_RUN_ORDER_NORMAL_PARALLEL_EPS) {
    const len = Math.hypot(spread.sx, spread.sy) || 1
    return { lx: (spread.sx / len) * sourceSideSign, ly: (spread.sy / len) * sourceSideSign }
  }

  const len = Math.hypot(lx, ly) || 1
  return { lx: lx / len, ly: ly / len }
}

export function spreadSignFromSource(p: FlowEdgePathParams, spread: { sx: number; sy: number }): number {
  const d = (p.sourceX - p.targetX) * spread.sx + (p.sourceY - p.targetY) * spread.sy
  if (Math.abs(d) < 1) return 1
  return d > 0 ? 1 : -1
}

/**
 * Target handle + outward (off node) + normal to path (off wire) + optional fan along tangent.
 * Works for straight, curved, and step paths because tangent comes from the rendered `d`.
 */
export function getFlowEdgeRunOrderBadgePoint(
  p: FlowEdgePathParams,
  placement: FlowEdgeRunOrderBadgePlacement,
): { x: number; y: number } {
  const { outward, spread } = portLabelAxes(p.targetPosition)
  const tangent = getPathGeometryAtTarget(placement.path, p)
  const sideSign = spreadSignFromSource(p, spread)
  const lineUnit = lineClearanceUnit(tangent, outward, spread, sideSign)

  const strokeHalf = Math.max(0.5, (placement.strokeWidthPx ?? 2) / 2)
  const portGap =
    (placement.offsetFromPortPx ?? FLOW_RUN_ORDER_OFFSET_FROM_PORT_PX) +
    Math.max(0, strokeHalf - 1) +
    FLOW_RUN_ORDER_GLYPH_HALF_PX

  const lineGap =
    (placement.lineClearancePx ?? FLOW_RUN_ORDER_LINE_CLEARANCE_PX) + strokeHalf + FLOW_RUN_ORDER_GLYPH_HALF_PX

  const fanMax = Math.max(1, placement.fanMax ?? 1)
  const fanIndex = Math.max(1, placement.fanIndex ?? 1)
  const fanAlong = fanMax > 1 ? (fanIndex - (fanMax + 1) / 2) * FLOW_RUN_ORDER_SIBLING_SPREAD_PX : 0

  return {
    x:
      p.targetX +
      outward.ox * portGap +
      lineUnit.lx * lineGap +
      tangent.tx * fanAlong,
    y:
      p.targetY +
      outward.oy * portGap +
      lineUnit.ly * lineGap +
      tangent.ty * fanAlong,
  }
}

/** @deprecated Prefer {@link getFlowEdgeRunOrderBadgePoint}. */
export function getFlowEdgeArrowBadgePoint(p: FlowEdgePathParams, offsetPx = 20): { x: number; y: number } {
  const dx = p.targetX - p.sourceX
  const dy = p.targetY - p.sourceY
  const len = Math.hypot(dx, dy) || 1
  return {
    x: p.targetX - (dx / len) * offsetPx,
    y: p.targetY - (dy / len) * offsetPx,
  }
}
