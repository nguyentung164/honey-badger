import type { EdgeMarker } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'

/** Long-ish chevron scaled in user units so arrows stay visible even with thin edge strokes (<1px via strokeWidth-linked markerUnits). */
const MARKER_MAIN_W = 28
const MARKER_MAIN_H = 9

/** Arrow at the target side of an edge (`orient='auto'`). */
export function flowDiagramArrowMarkerEnd(color: string): EdgeMarker {
  return {
    type: MarkerType.ArrowClosed,
    color,
    width: MARKER_MAIN_W,
    height: MARKER_MAIN_H,
    markerUnits: 'userSpaceOnUse',
    orient: 'auto',
  }
}

/** Arrow at the source side (`orient='auto-start-reverse'`) — use when `bidirectional` is true. */
export function flowDiagramArrowMarkerStart(color: string): EdgeMarker {
  return {
    type: MarkerType.ArrowClosed,
    color,
    width: MARKER_MAIN_W,
    height: MARKER_MAIN_H,
    markerUnits: 'userSpaceOnUse',
    orient: 'auto-start-reverse',
  }
}
