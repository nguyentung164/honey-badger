import { Position } from '@xyflow/react'
import type { FlowEdgeCurveKind } from 'shared/flowDiagramStyle'
import { getFlowEdgePath, type FlowEdgePathParams } from '@/components/flow-inspector/flowEdgeGeometry'

/**
 * Hệ Bottom→Left node → Top→Right node (đúng mặc định `edgeHandleIds`: sourceBottom + targetTop).
 * Chỉ dùng cho preview inspector — tọa độ cố định khớp thư viện @xyflow như canvas.
 */
const FLOW_INSPECTOR_EDGE_PREVIEW_COORDS: FlowEdgePathParams = {
  sourceX: 82,
  sourceY: 48,
  sourcePosition: Position.Bottom,
  targetX: 202,
  targetY: 12,
  targetPosition: Position.Top,
}

/** viewBox chứa path + chỗ nhãn (± padding). Narrowed horizontally to zoom in ~30%. */
export const FLOW_INSPECTOR_EDGE_PREVIEW_VB = { x: 20, y: -8, w: 240, h: 72 } as const

export function getFlowInspectorEdgePreviewPath(curve: FlowEdgeCurveKind): { path: string; labelX: number; labelY: number } {
  return getFlowEdgePath(curve, FLOW_INSPECTOR_EDGE_PREVIEW_COORDS)
}
