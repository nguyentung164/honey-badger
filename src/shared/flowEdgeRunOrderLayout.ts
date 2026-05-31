/**
 * Run-order digit layout constants + fan grouping (same source+target only).
 */

/** Distance from target handle outward (away from node body). */
export const FLOW_RUN_ORDER_OFFSET_FROM_PORT_PX = 5

export const FLOW_RUN_ORDER_SIBLING_SPREAD_PX = 7
/** Perpendicular gap from wire (before stroke + glyph padding). */
export const FLOW_RUN_ORDER_LINE_CLEARANCE_PX = 3
/** Half-height of run-order digit for layout padding (matches ~6px font). */
export const FLOW_RUN_ORDER_GLYPH_HALF_PX = 2.5

/** |dot(unitNormal, outward)| above this → use spread axis for clearance instead. */
export const FLOW_RUN_ORDER_NORMAL_PARALLEL_EPS = 0.85

export type RunOrderFanEdge = { id: string; source: string; target: string }

export function runOrderFanPlacementForEdge(
  edge: RunOrderFanEdge,
  allEdges: RunOrderFanEdge[],
  orderById: Map<string, number>,
): { fanMax: number; fanIndex: number } {
  const group = allEdges.filter(e => e.source === edge.source && e.target === edge.target)
  if (group.length <= 1) return { fanMax: 1, fanIndex: 1 }
  const sorted = [...group].sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0))
  const fanIndex = sorted.findIndex(e => e.id === edge.id) + 1
  return { fanMax: group.length, fanIndex: fanIndex > 0 ? fanIndex : 1 }
}
