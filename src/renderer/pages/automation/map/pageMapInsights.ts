import type { TestCase, TestCatalogPage, TestPageNavEdge } from 'shared/automation/types'
import { findFirstDirectedCycle, orphanPageIds } from '@/pages/automation/map/pageMapLayout'

export function navEdgesToPageEdgeList(navEdges: TestPageNavEdge[]): Array<{ source: string; target: string }> {
  return navEdges.map(e => ({ source: e.sourcePageId, target: e.targetPageId }))
}

export function computeOrphanPageIds(pages: TestCatalogPage[], navEdges: TestPageNavEdge[]): string[] {
  const pageIds = pages.map(p => p.id)
  return orphanPageIds(pageIds, navEdgesToPageEdgeList(navEdges))
}

export function computeZeroCasePageIds(pages: TestCatalogPage[], caseCountByPageId: Record<string, number>): string[] {
  return pages.filter(p => (caseCountByPageId[p.id] ?? 0) === 0).map(p => p.id)
}

export function computeZeroCasePageIdsFromCases(
  pages: TestCatalogPage[],
  cases: TestCase[],
  pageIdByFlowId: Record<string, string>
): string[] {
  const counts: Record<string, number> = {}
  for (const c of cases) {
    if (!c.flowId) continue
    const pageId = pageIdByFlowId[c.flowId]
    if (pageId) counts[pageId] = (counts[pageId] ?? 0) + 1
  }
  return computeZeroCasePageIds(pages, counts)
}

export function computeFirstCyclePageIds(pages: TestCatalogPage[], navEdges: TestPageNavEdge[]): string[] | null {
  const pageIds = pages.map(p => p.id)
  return findFirstDirectedCycle(pageIds, navEdgesToPageEdgeList(navEdges))
}

/** Edge ids on a directed cycle (including wrap-around). */
export function cycleNavEdgeIds(cyclePageIds: string[], navEdges: TestPageNavEdge[]): string[] {
  if (cyclePageIds.length < 2) return []
  const edgeByPair = new Map<string, string>()
  for (const e of navEdges) {
    edgeByPair.set(`${e.sourcePageId}\0${e.targetPageId}`, e.id)
  }
  const ids: string[] = []
  for (let i = 0; i < cyclePageIds.length - 1; i++) {
    const a = cyclePageIds[i]
    const b = cyclePageIds[i + 1]
    if (!a || !b) continue
    const id = edgeByPair.get(`${a}\0${b}`)
    if (id) ids.push(id)
  }
  return ids
}
