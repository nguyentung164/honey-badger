import { reachableNodeIdsFrom, type FlowExecEdge } from 'shared/flowExecution'

export const FLOW_START_PAGE_OUTSIDE_BOUNDARY = 'Flow start page is outside the requested scope boundary.'
export const FLOW_START_PAGE_NO_REACHABLE = 'Flow start page has no reachable pages in scope.'

export function isFlowStartPageScopeWarning(message: string): boolean {
  return message === FLOW_START_PAGE_OUTSIDE_BOUNDARY || message === FLOW_START_PAGE_NO_REACHABLE
}

export type ExpandFlowRunPageScopeInput = {
  mergedPageIds: string[]
  startPageId: string
  navEdges: Array<{ id: string; sourcePageId: string; targetPageId: string; runOrder?: number }>
  /** Explicit pageIds from the request (before group merge). */
  explicitPageIds: string[]
  hasGroups: boolean
}

/** Expand page scope for ordered run-from-start; returns warnings when start is invalid. */
export function expandFlowRunPageScope(input: ExpandFlowRunPageScopeInput): { pageIds: string[]; warnings: string[] } {
  const { mergedPageIds, startPageId, navEdges, explicitPageIds, hasGroups } = input
  const flowEdges: FlowExecEdge[] = navEdges.map(e => ({
    id: e.id,
    source: e.sourcePageId,
    target: e.targetPageId,
    runOrder: e.runOrder,
  }))

  const restrictBoundary = shouldRestrictFlowBoundary(mergedPageIds, startPageId, explicitPageIds, hasGroups)
  const boundary = restrictBoundary && mergedPageIds.length > 0 ? new Set(mergedPageIds) : undefined
  const warnings: string[] = []

  if (boundary && !boundary.has(startPageId)) {
    warnings.push(FLOW_START_PAGE_OUTSIDE_BOUNDARY)
    return { pageIds: [], warnings }
  }

  const reachable = reachableNodeIdsFrom([startPageId], flowEdges, boundary)
  if (reachable.length === 0) {
    warnings.push(FLOW_START_PAGE_NO_REACHABLE)
  }

  return { pageIds: reachable, warnings }
}

/** Toolbar run (no explicit scope) expands full subgraph; groups / multi-page selection stay bounded. */
export function shouldRestrictFlowBoundary(
  mergedPageIds: string[],
  startPageId: string,
  explicitPageIds: string[],
  hasGroups: boolean,
): boolean {
  if (hasGroups) return true
  if (explicitPageIds.length === 0) return false
  if (explicitPageIds.length === 1 && explicitPageIds[0] === startPageId) return false
  return mergedPageIds.length > 0
}
