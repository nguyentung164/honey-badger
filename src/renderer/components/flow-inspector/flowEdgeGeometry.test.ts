import { describe, expect, it } from 'vitest'
import {
  getFlowEdgeRunOrderBadgePoint,
  getPathGeometryAtTarget,
  lineClearanceUnit,
  portLabelAxes,
  type FlowEdgePathParams,
} from './flowEdgeGeometry'

const intoTopPort: FlowEdgePathParams = {
  sourceX: 50,
  sourceY: 0,
  sourcePosition: 'bottom',
  targetX: 50,
  targetY: 100,
  targetPosition: 'top',
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-6) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
  const qx = x1 + t * dx
  const qy = y1 + t * dy
  return Math.hypot(px - qx, py - qy)
}

describe('lineClearanceUnit', () => {
  it('is perpendicular to tangent', () => {
    const { outward, spread } = portLabelAxes('top')
    const t = { tx: 0, ty: 1 }
    const u = lineClearanceUnit(t, outward, spread, 1)
    expect(Math.abs(u.lx * t.tx + u.ly * t.ty)).toBeLessThan(0.01)
  })

  it('uses spread axis when tangent is horizontal into top port', () => {
    const { outward, spread } = portLabelAxes('top')
    const u = lineClearanceUnit({ tx: 1, ty: 0 }, outward, spread, 1)
    expect(Math.abs(u.lx)).toBeGreaterThan(0.9)
    expect(Math.abs(u.ly)).toBeLessThan(0.1)
  })
})

describe('getFlowEdgeRunOrderBadgePoint', () => {
  it('straight vertical: clears the segment', () => {
    const badge = getFlowEdgeRunOrderBadgePoint(intoTopPort, { path: 'M 50 0 L 50 100', fanMax: 1 })
    const d = distToSegment(badge.x, badge.y, 50, 0, 50, 100)
    expect(d).toBeGreaterThan(6)
  })

  it('step path: badge clears the last orthogonal segment', () => {
    const stepPath = 'M 50 0 L 50 80 L 200 80 L 200 100'
    const p: FlowEdgePathParams = {
      sourceX: 50,
      sourceY: 0,
      sourcePosition: 'bottom',
      targetX: 200,
      targetY: 100,
      targetPosition: 'top',
    }
    const badge = getFlowEdgeRunOrderBadgePoint(p, { path: stepPath, fanMax: 1 })
    const dLast = distToSegment(badge.x, badge.y, 200, 80, 200, 100)
    expect(dLast).toBeGreaterThan(3)
  })

  it('curved: badge off chord near target', () => {
    const path = 'M 0 40 C 80 40 120 100 200 100'
    const p: FlowEdgePathParams = {
      sourceX: 0,
      sourceY: 40,
      sourcePosition: 'right',
      targetX: 200,
      targetY: 100,
      targetPosition: 'top',
    }
    const badge = getFlowEdgeRunOrderBadgePoint(p, { path, fanMax: 1 })
    const d = distToSegment(badge.x, badge.y, 180, 100, 200, 100)
    expect(d).toBeGreaterThan(5)
  })

  it('fanMax=1 does not shift by fanIndex', () => {
    const a = getFlowEdgeRunOrderBadgePoint(intoTopPort, { path: 'M 50 0 L 50 100', fanMax: 1, fanIndex: 1 })
    const b = getFlowEdgeRunOrderBadgePoint(intoTopPort, { path: 'M 50 0 L 50 100', fanMax: 1, fanIndex: 3 })
    expect(a.x).toBeCloseTo(b.x, 5)
    expect(a.y).toBeCloseTo(b.y, 5)
  })
})
