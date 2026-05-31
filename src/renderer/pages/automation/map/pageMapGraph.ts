import type { Node, ReactFlowInstance } from '@xyflow/react'
import type { TFunction } from 'i18next'
import type { RunScopeResolution, TestCatalogGroup, TestCatalogPage, TestPageMapAnnotation, TestPageNavEdge } from 'shared/automation/types'
import { FLOW_CANVAS_DEFAULT_NODE_SIZE } from 'shared/flowNodeContentLayout'
import type { PageMapAnnotationStyle } from 'shared/pageMapAnnotationStyle'
import {
  mergePageMapAnnotationStyle,
  PAGE_MAP_ANNOTATION_DEFAULT_H,
  PAGE_MAP_ANNOTATION_DEFAULT_W,
} from 'shared/pageMapAnnotationStyle'

export type PageMapActionsValue = {
  canvasLocked: boolean
  runThisPage: (pageId: string) => void
  runFlowFromPage: (pageId: string) => void
  togglePageExecutionDisabled: (pageId: string) => void
  runBusy: boolean
  duplicatePage: (pageId: string) => void
  requestDeletePage: (pageId: string) => void
  pageActionBusy: boolean
  /** Gỡ trang khỏi catalog group (groupId → null), không xóa khung nhóm. */
  removePagesFromGroup: (pageIds: string[]) => void
  removeFromGroupBusy: boolean
  runThisGroup?: (groupId: string) => void
  openCasesForGroup?: (groupId: string) => void
  requestDeleteGroup?: (groupId: string) => void
  groupActionBusy?: boolean
  duplicateAnnotation?: (annotationId: string) => void
  deleteAnnotation?: (annotationId: string) => void
  annotationActionBusy?: boolean
  persistGroupSize?: (groupId: string, size: { width: number; height: number }) => void
  persistAnnotationContent?: (annotationId: string, content: string) => void
  persistAnnotationSize?: (
    annotationId: string,
    size: { width: number; minHeight: number; nodeHeight?: number }
  ) => void
}

export const PAGE_MAP_GROUP_DEFAULT_W = 420
export const PAGE_MAP_GROUP_DEFAULT_H = 280

/** Insets used when placing catalog pages inside a group frame (keep in sync with pageMapLayout). */
export const PAGE_MAP_GROUP_INNER_PAD = 24
export const PAGE_MAP_GROUP_TITLE_RESERVE = 44
export const PAGE_MAP_GROUP_FOOTER_RESERVE = 32

/** Pages in resolved run scope that have at least one executable test case. */
export function pageIdsWithCasesInScope(
  scope: Pick<RunScopeResolution, 'pageIdsExpanded' | 'caseIdsByPageId' | 'caseCountByPageId'>
): string[] {
  const expanded = scope.pageIdsExpanded ?? []
  if (expanded.length > 0) {
    return expanded.filter(pid => (scope.caseCountByPageId[pid] ?? scope.caseIdsByPageId[pid]?.length ?? 0) > 0)
  }
  return Object.keys(scope.caseIdsByPageId).filter(pid => (scope.caseIdsByPageId[pid]?.length ?? 0) > 0)
}

/** Kích thước giả định khi clamp page con trong khung group (RF đo DOM sau). */
const PAGE_IN_GROUP_ASSUMED_W = FLOW_CANVAS_DEFAULT_NODE_SIZE.width
const PAGE_IN_GROUP_ASSUMED_H = FLOW_CANVAS_DEFAULT_NODE_SIZE.height

function centeredPageDefaultInGroup(groupWidth: number, groupHeight: number): { x: number; y: number } {
  const gw = Math.max(120, groupWidth)
  const gh = Math.max(100, groupHeight)
  const availW = Math.max(0, gw - PAGE_MAP_GROUP_INNER_PAD * 2)
  const availH = Math.max(0, gh - PAGE_MAP_GROUP_TITLE_RESERVE - PAGE_MAP_GROUP_FOOTER_RESERVE - PAGE_MAP_GROUP_INNER_PAD)
  return {
    x: PAGE_MAP_GROUP_INNER_PAD + Math.max(0, (availW - PAGE_IN_GROUP_ASSUMED_W) / 2),
    y: PAGE_MAP_GROUP_TITLE_RESERVE + Math.max(0, (availH - PAGE_IN_GROUP_ASSUMED_H) / 2),
  }
}

/**
 * Giữ tọa độ diagram của page con nằm trong khung group (tọa độ tương đối parent trong React Flow).
 * Nếu DB còn tọa độ "global" từ trước khi có group (thường >> kích thước group), reset về mặc định căn giữa.
 */
export function normalizePageDiagramPositionInGroup(
  diagramX: number | null | undefined,
  diagramY: number | null | undefined,
  groupWidth: number,
  groupHeight: number,
  pad = PAGE_MAP_GROUP_INNER_PAD
): { x: number; y: number } {
  const gw = Math.max(120, groupWidth)
  const gh = Math.max(100, groupHeight)
  const centered = centeredPageDefaultInGroup(gw, gh)
  const x = diagramX ?? centered.x
  const y = diagramY ?? centered.y
  const looksLikeGlobalCoords = x > gw - 8 || y > gh - 8 || x < -200 || y < -200
  if (looksLikeGlobalCoords) {
    return centered
  }
  const maxX = Math.max(pad, gw - PAGE_IN_GROUP_ASSUMED_W - pad)
  const maxY = Math.max(pad, gh - PAGE_IN_GROUP_ASSUMED_H - pad)
  return {
    x: Math.min(Math.max(pad, x), maxX),
    y: Math.min(Math.max(PAGE_MAP_GROUP_TITLE_RESERVE, y), maxY),
  }
}

function groupNodeRectSize(n: Node): { w: number; h: number } {
  const sw = n.style?.width
  const sh = n.style?.height
  const w = typeof sw === 'number' ? sw : PAGE_MAP_GROUP_DEFAULT_W
  const h = typeof sh === 'number' ? sh : PAGE_MAP_GROUP_DEFAULT_H
  return { w: Math.max(1, w), h: Math.max(1, h) }
}

/**
 * Khi thả page: chọn group chứa (giao bbox) có diện tích nhỏ nhất — ưu tiên group con lồng nhau.
 */
export function resolveSmallestIntersectingCatalogGroupId(inst: Pick<ReactFlowInstance, 'getNode' | 'getIntersectingNodes'>, pageId: string): string | null {
  const pageN = inst.getNode(pageId)
  if (!pageN || pageN.type !== 'catalogPage') return null
  const overlaps = inst.getIntersectingNodes(pageN, true).filter(n => n.type === 'catalogGroup')
  if (!overlaps.length) return null
  const first = overlaps[0]
  if (!first) return null
  let best = first
  let bestArea = Infinity
  for (const g of overlaps) {
    const { w, h } = groupNodeRectSize(g)
    const area = w * h
    if (area < bestArea) {
      bestArea = area
      best = g
    }
  }
  return best.id
}

export type { PageMapNodeStatus } from 'shared/automation/types'
import type { PageMapNodeStatus } from 'shared/automation/types'

const STATUS_RANK: Record<PageMapNodeStatus, number> = {
  error: 60,
  cancelled: 50,
  running: 40,
  queued: 30,
  done: 20,
  idle: 10,
}

function subtreeGroupIdsIncludingRoot(rootId: string, groups: TestCatalogGroup[]): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const g of groups) {
    const p = g.parentGroupId ?? '__root__'
    if (!childrenByParent.has(p)) childrenByParent.set(p, [])
    const bucket = childrenByParent.get(p)
    if (bucket) bucket.push(g.id)
  }
  const out = new Set<string>()
  const st = [rootId]
  while (st.length) {
    const id = st.pop()
    if (id === undefined) break
    if (out.has(id)) continue
    out.add(id)
    for (const c of childrenByParent.get(id) ?? []) st.push(c)
  }
  return out
}

/** Pages whose `groupId` lies in the subtree of `groupId` (including that group). */
export function filterPagesByCatalogGroupSubtree(pages: TestCatalogPage[], groups: TestCatalogGroup[], groupId: string | null): TestCatalogPage[] {
  if (!groupId) return pages
  const st = subtreeGroupIdsIncludingRoot(groupId, groups)
  return pages.filter(p => p.groupId != null && st.has(p.groupId))
}

/** Trạng thái hiển thị trên node group: ưu tiên error > running > queued > done > idle. */
export function deriveGroupMapStatus(groupId: string, groups: TestCatalogGroup[], pages: TestCatalogPage[], pageStatus: Record<string, PageMapNodeStatus>): PageMapNodeStatus {
  const st = subtreeGroupIdsIncludingRoot(groupId, groups)
  let best: PageMapNodeStatus = 'idle'
  let bestRank = STATUS_RANK.idle
  for (const p of pages) {
    if (!p.groupId || !st.has(p.groupId)) continue
    const s = pageStatus[p.id] ?? 'idle'
    const r = STATUS_RANK[s] ?? 0
    if (r > bestRank) {
      bestRank = r
      best = s
    }
  }
  return best
}

export function countPagesInGroupSubtree(groupId: string, groups: TestCatalogGroup[], pages: TestCatalogPage[]): number {
  const st = subtreeGroupIdsIncludingRoot(groupId, groups)
  let n = 0
  for (const p of pages) {
    if (p.groupId && st.has(p.groupId)) n += 1
  }
  return n
}

/** React Flow: parent nodes trước children. */
export function sortNodesParentBeforeChildren(nodes: Node[]): Node[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const visited = new Set<string>()
  const out: Node[] = []

  function walk(id: string) {
    if (visited.has(id)) return
    const n = byId.get(id)
    if (!n) return
    const pid = n.parentId ? String(n.parentId) : null
    if (pid) walk(pid)
    if (!visited.has(id)) {
      visited.add(id)
      out.push(n)
    }
  }

  for (const n of nodes) walk(n.id)
  return out
}

export type CatalogGroupNodeData = {
  label: string
  hint?: string
  status: PageMapNodeStatus
  statusLabel: string
  pageCount: number
  caseCount: number
  diagramVisual?: import('shared/flowDiagramStyle').FlowNodeVisualStyle
}

export type CatalogPageNodeDataForGraph = {
  label: string
  hint: string
  status: PageMapNodeStatus
  statusLabel: string
  panelTestCount: number
  panelLinksLine?: string
  panelUpdatedLine?: string
  panelSlugLine?: string
  diagramVisual?: import('shared/flowDiagramStyle').FlowNodeVisualStyle
  inGroup: boolean
  executionDisabled?: boolean
}

function navEdgeDegreesMap(navEdges: TestPageNavEdge[], pageIds: string[]): Record<string, { in: number; out: number }> {
  const deg: Record<string, { in: number; out: number }> = {}
  for (const id of pageIds) deg[id] = { in: 0, out: 0 }
  for (const e of navEdges) {
    if (deg[e.sourcePageId]) deg[e.sourcePageId].out += 1
    if (deg[e.targetPageId]) deg[e.targetPageId].in += 1
  }
  return deg
}

function formatPageUpdatedShort(iso: string | undefined, _t: TFunction): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: '2-digit' }).format(d)
  } catch {
    return undefined
  }
}

export type PageMapAnnotationNodeDataForGraph = {
  labelNumber: number
  content: string
  style?: PageMapAnnotationStyle
  /** CSS min-height floor — not a fixed RF node height. */
  minHeight?: number
}

export function buildPageMapNodes(input: {
  pages: TestCatalogPage[]
  groups: TestCatalogGroup[]
  annotations?: TestPageMapAnnotation[]
  groupCaseCounts: Record<string, number>
  fallbackHint: string
  pageCaseCounts: Record<string, number>
  pageStatus: Record<string, PageMapNodeStatus>
  statusLabels: Record<PageMapNodeStatus, string>
  navEdges: TestPageNavEdge[]
  t: TFunction
}): Node[] {
  const { pages, groups, annotations = [], groupCaseCounts, fallbackHint, pageCaseCounts, pageStatus, statusLabels, navEdges, t } = input
  const pageIds = pages.map(p => p.id)
  const deg = navEdgeDegreesMap(navEdges, pageIds)

  const groupNodes: Node[] = groups.map((g, i) => {
    const st = deriveGroupMapStatus(g.id, groups, pages, pageStatus)
    const pageCount = countPagesInGroupSubtree(g.id, groups, pages)
    const caseCount = groupCaseCounts[g.id] ?? 0
    const hintParts = [g.description].filter(Boolean) as string[]
    const hintStr = hintParts.length ? hintParts.join(' · ') : undefined
    return {
      id: g.id,
      type: 'catalogGroup',
      position: {
        x: g.diagramX ?? (i % 3) * 480,
        y: g.diagramY ?? Math.floor(i / 3) * 320,
      },
      parentId: g.parentGroupId ?? undefined,
      extent: g.parentGroupId ? ('parent' as const) : undefined,
      style: {
        width: g.diagramWidth ?? PAGE_MAP_GROUP_DEFAULT_W,
        height: g.diagramHeight ?? PAGE_MAP_GROUP_DEFAULT_H,
      },
      zIndex: 0,
      data: {
        label: g.name,
        hint: hintStr,
        status: st,
        statusLabel: statusLabels[st],
        pageCount,
        caseCount,
        diagramVisual: g.diagramStyle,
      } satisfies CatalogGroupNodeData,
    }
  })

  const groupById = new Map(groups.map(g => [g.id, g]))

  const pageNodes: Node[] = pages.map((p, i) => {
    const st = pageStatus[p.id] ?? 'idle'
    const raw = pageCaseCounts[p.id]
    const panelTestCount = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
    const hintParts = [p.slug, p.description].filter(Boolean) as string[]
    const hintStr = hintParts.length ? hintParts.join(' · ') : fallbackHint
    const { in: inn, out: outn } = deg[p.id] ?? { in: 0, out: 0 }
    const panelLinksLine = inn > 0 || outn > 0 ? t('automation.pageMap.nodePanelLinksValue', { in: inn, out: outn }) : undefined
    const rawSlug = p.slug?.trim()
    const panelSlugLine = rawSlug ? (rawSlug.startsWith('/') ? rawSlug : `/${rawSlug}`) : undefined
    const hasParent = Boolean(p.groupId)
    const gMeta = p.groupId ? groupById.get(p.groupId) : undefined
    const gw = gMeta?.diagramWidth ?? PAGE_MAP_GROUP_DEFAULT_W
    const gh = gMeta?.diagramHeight ?? PAGE_MAP_GROUP_DEFAULT_H
    const pos = hasParent
      ? normalizePageDiagramPositionInGroup(p.diagramX, p.diagramY, gw, gh)
      : {
          x: p.diagramX ?? (i % 4) * 280,
          y: p.diagramY ?? Math.floor(i / 4) * 160,
        }
    return {
      id: p.id,
      type: 'catalogPage',
      parentId: p.groupId ?? undefined,
      extent: hasParent ? ('parent' as const) : undefined,
      position: pos,
      zIndex: 1,
      data: {
        label: p.name,
        hint: hintStr,
        status: st,
        statusLabel: statusLabels[st],
        panelTestCount,
        panelLinksLine,
        panelUpdatedLine: formatPageUpdatedShort(p.updatedAt, t),
        panelSlugLine,
        diagramVisual: p.diagramStyle,
        inGroup: hasParent,
        executionDisabled: p.executionDisabled === true,
      } satisfies CatalogPageNodeDataForGraph,
    }
  })

  const annotationNodes: Node[] = annotations.map((a, i) => {
    const w = a.diagramWidth ?? PAGE_MAP_ANNOTATION_DEFAULT_W
    const h = a.diagramHeight ?? PAGE_MAP_ANNOTATION_DEFAULT_H
    return {
      id: a.id,
      type: 'mapAnnotation',
      position: {
        x: a.diagramX ?? 40 + (i % 3) * 240,
        y: a.diagramY ?? 40 + Math.floor(i / 3) * 120,
      },
      style: { width: w, height: h },
      zIndex: 2,
      selectable: true,
      draggable: true,
      deletable: true,
      connectable: false,
      data: {
        labelNumber: a.labelNumber,
        content: a.content,
        style: mergePageMapAnnotationStyle(a.style),
        minHeight: h,
      } satisfies PageMapAnnotationNodeDataForGraph,
    }
  })

  return sortNodesParentBeforeChildren([...groupNodes, ...pageNodes, ...annotationNodes])
}
