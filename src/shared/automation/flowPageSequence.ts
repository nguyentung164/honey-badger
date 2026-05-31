import {
  buildOrderedExecutionPlan,
  FlowExecutionError,
  normalizeAllRunOrders,
  orderedTraversal,
  type FlowExecEdge,
  type FlowExecNode,
} from 'shared/flowExecution'
import type { TestPageNavEdge } from './types'

export type ComputeFlowPageSequenceInput = {
  pageIdsInScope: string[]
  pages: Array<{ id: string; sortOrder?: number; executionDisabled?: boolean }>
  navEdges: TestPageNavEdge[]
  startPageId?: string
  caseCountByPageId?: Record<string, number>
}

export type ComputeFlowPageSequenceResult = {
  /** Page ids with cases, in flow execution order. */
  runnableSequence: string[]
  /** Full traversal order including pages without cases (for highlight). */
  fullSequence: string[]
  warnings: string[]
}

export const FLOW_UNREACHABLE_IN_SCOPE_PREFIX = 'Pages in scope not reachable in flow:'

export function isFlowUnreachableWarning(message: string): boolean {
  return message.startsWith(FLOW_UNREACHABLE_IN_SCOPE_PREFIX)
}

export function computeFlowPageSequence(input: ComputeFlowPageSequenceInput): ComputeFlowPageSequenceResult {
  const scopeSet = new Set(input.pageIdsInScope)
  const warnings: string[] = []
  const pageById = new Map(input.pages.map(p => [p.id, p]))

  const scopedPages = input.pageIdsInScope.filter(id => pageById.has(id))
  const nodes: FlowExecNode[] = scopedPages.map(id => {
    const p = pageById.get(id)!
    return {
      id,
      disabled: p.executionDisabled === true,
      sortKey: p.sortOrder ?? 0,
      label: id,
    }
  })

  const rawEdges: FlowExecEdge[] = input.navEdges
    .filter(e => scopeSet.has(e.sourcePageId) && scopeSet.has(e.targetPageId))
    .map(e => ({
      id: e.id,
      source: e.sourcePageId,
      target: e.targetPageId,
      runOrder: e.runOrder,
    }))

  const edges = normalizeAllRunOrders(rawEdges)

  try {
    const plan = buildOrderedExecutionPlan(nodes, edges, input.startPageId ? { startNodeIds: [input.startPageId] } : undefined)
    const fullSequence = orderedTraversal(plan, { scopeNodeIds: scopeSet })
    const fullSequenceSet = new Set(fullSequence)
    const unreachable = scopedPages.filter(id => !fullSequenceSet.has(id))
    if (unreachable.length) {
      warnings.push(`${FLOW_UNREACHABLE_IN_SCOPE_PREFIX} ${unreachable.join(', ')}`)
    }
    const caseCounts = input.caseCountByPageId ?? {}
    const runnableSequence = fullSequence.filter(pid => (caseCounts[pid] ?? 0) > 0)
    return { runnableSequence, fullSequence, warnings }
  } catch (err) {
    if (err instanceof FlowExecutionError) {
      warnings.push(err.message)
      return { runnableSequence: [], fullSequence: [], warnings }
    }
    throw err
  }
}
