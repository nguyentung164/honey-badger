import { getBezierPath, getSmoothStepPath, getStraightPath, type Position } from '@xyflow/react'
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
