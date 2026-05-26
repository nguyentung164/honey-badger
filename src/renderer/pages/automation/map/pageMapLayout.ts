import type { Edge, Node } from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import { resolveFlowCanvasNodeLayoutSize, FLOW_CANVAS_DEFAULT_NODE_SIZE } from 'shared/flowNodeContentLayout'
import {
  PAGE_MAP_GROUP_DEFAULT_H,
  PAGE_MAP_GROUP_DEFAULT_W,
  PAGE_MAP_GROUP_FOOTER_RESERVE,
  PAGE_MAP_GROUP_INNER_PAD,
  PAGE_MAP_GROUP_TITLE_RESERVE,
} from '@/pages/automation/map/pageMapGraph'

const NODE_W = FLOW_CANVAS_DEFAULT_NODE_SIZE.width
const NODE_H = FLOW_CANVAS_DEFAULT_NODE_SIZE.height

const INNER_PAD = PAGE_MAP_GROUP_INNER_PAD
const GROUP_GAP = 32
/** Space reserved for group title chip at top of frame. */
export const GROUP_TITLE_RESERVE = PAGE_MAP_GROUP_TITLE_RESERVE
/** Space reserved for group footer badges at bottom of frame. */
export const GROUP_FOOTER_RESERVE = PAGE_MAP_GROUP_FOOTER_RESERVE

function readNumericStyle(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function groupBox(n: Node): { w: number; h: number } {
  return {
    w: readNumericStyle(n.style?.width, PAGE_MAP_GROUP_DEFAULT_W),
    h: readNumericStyle(n.style?.height, PAGE_MAP_GROUP_DEFAULT_H),
  }
}

function dagreLayout(nodes: Node[], edges: Edge[], rankdir: 'TB' | 'LR'): Record<string, { x: number; y: number }> {
  if (!nodes.length) return {}
  const ranksep = rankdir === 'LR' ? 140 : 90
  const nodesep = rankdir === 'LR' ? 40 : 48
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir, ranksep, nodesep, marginx: 24, marginy: 24 })
  const sizeById = new Map<string, { width: number; height: number }>()
  for (const n of nodes) {
    const size = resolveFlowCanvasNodeLayoutSize(n)
    sizeById.set(n.id, size)
    g.setNode(n.id, { width: size.width, height: size.height })
  }
  for (const e of edges) {
    if (e.source && e.target) g.setEdge(e.source, e.target)
  }
  dagre.layout(g)
  const out: Record<string, { x: number; y: number }> = {}
  for (const n of nodes) {
    const lp = g.node(n.id) as { x: number; y: number } | undefined
    if (!lp) continue
    const { width, height } = sizeById.get(n.id) ?? { width: NODE_W, height: NODE_H }
    out[n.id] = { x: lp.x - width / 2, y: lp.y - height / 2 }
  }
  return out
}

/** Top → Down layout (Dagre TB). */
export function layoutCatalogWithDagre(nodes: Node[], edges: Edge[]): Record<string, { x: number; y: number }> {
  return dagreLayout(nodes, edges, 'TB')
}

/** Left → Right layout (Dagre LR). */
export function layoutCatalogHorizontal(nodes: Node[], edges: Edge[]): Record<string, { x: number; y: number }> {
  return dagreLayout(nodes, edges, 'LR')
}

const RADIAL_RING_PX = 210

/** Radial layout: BFS from highest-degree node, each depth layer placed on a concentric ring. */
export function layoutCatalogRadial(nodes: Node[], edges: Edge[]): Record<string, { x: number; y: number }> {
  if (!nodes.length) return {}
  const firstSize = resolveFlowCanvasNodeLayoutSize(nodes[0])
  if (nodes.length === 1) return { [nodes[0].id]: { x: -firstSize.width / 2, y: -firstSize.height / 2 } }

  const nodeIds = nodes.map(n => n.id)

  // Build undirected adjacency
  const adj = new Map<string, Set<string>>()
  for (const id of nodeIds) adj.set(id, new Set())
  for (const e of edges) {
    if (e.source && e.target && adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source)?.add(e.target)
      adj.get(e.target)?.add(e.source)
    }
  }

  // Pick root: node with most connections; tie-break by index
  let root = nodeIds[0]
  let maxDeg = 0
  for (const id of nodeIds) {
    const deg = adj.get(id)?.size ?? 0
    if (deg > maxDeg) { maxDeg = deg; root = id }
  }

  // BFS layers from root
  const layer = new Map<string, number>()
  const queue: string[] = [root]
  layer.set(root, 0)
  while (queue.length) {
    const u = queue.shift()
    if (u === undefined) break
    const d = layer.get(u) ?? 0
    for (const v of adj.get(u) ?? new Set<string>()) {
      if (!layer.has(v)) { layer.set(v, d + 1); queue.push(v) }
    }
  }

  // Group unreached nodes (disconnected) together at the outermost ring
  const maxLayer = layer.size > 0 ? Math.max(...layer.values()) : 0
  const unreached = nodeIds.filter(id => !layer.has(id))
  if (unreached.length) {
    const outerLayer = maxLayer + 1
    for (const id of unreached) layer.set(id, outerLayer)
  }

  // Group by layer
  const byLayer = new Map<number, string[]>()
  for (const [id, l] of layer) {
    const arr = byLayer.get(l) ?? []
    arr.push(id)
    byLayer.set(l, arr)
  }

  const out: Record<string, { x: number; y: number }> = {}
  const sizeFor = (id: string) => {
    const n = nodes.find(x => x.id === id)
    return n ? resolveFlowCanvasNodeLayoutSize(n) : { width: NODE_W, height: NODE_H }
  }
  for (const [l, ids] of byLayer) {
    if (l === 0) {
      const s0 = sizeFor(ids[0])
      out[ids[0]] = { x: -s0.width / 2, y: -s0.height / 2 }
      for (let i = 1; i < ids.length; i++) {
        const a = (2 * Math.PI * i) / ids.length
        const si = sizeFor(ids[i])
        out[ids[i]] = {
          x: RADIAL_RING_PX * 0.4 * Math.cos(a) - si.width / 2,
          y: RADIAL_RING_PX * 0.4 * Math.sin(a) - si.height / 2,
        }
      }
    } else {
      const r = RADIAL_RING_PX * l
      const step = (2 * Math.PI) / ids.length
      const start = -Math.PI / 2
      ids.forEach((id, i) => {
        const a = start + step * i
        const si = sizeFor(id)
        out[id] = { x: r * Math.cos(a) - si.width / 2, y: r * Math.sin(a) - si.height / 2 }
      })
    }
  }
  return out
}

export function isValidCatalogSlug(raw: string): boolean {
  const s = raw.trim()
  if (!s) return true
  return /^[a-z0-9][a-z0-9-_.]*$/i.test(s) && s.length <= 120
}

export function bfsShortestPathEdges(start: string, goal: string, directed: Array<{ id: string; source: string; target: string }>): string[] {
  if (start === goal) return []
  const adj = new Map<string, Array<{ t: string; id: string }>>()
  for (const e of directed) {
    if (!adj.has(e.source)) adj.set(e.source, [])
    const arr = adj.get(e.source)
    if (arr) arr.push({ t: e.target, id: e.id })
  }
  const prev = new Map<string, { node: string; edgeId: string }>()
  const q: string[] = [start]
  const seen = new Set<string>([start])
  while (q.length) {
    const u = q.shift()
    if (u === undefined) break
    if (u === goal) break
    for (const { t, id } of adj.get(u) ?? []) {
      if (seen.has(t)) continue
      seen.add(t)
      prev.set(t, { node: u, edgeId: id })
      q.push(t)
    }
  }
  if (!prev.has(goal)) return []
  const edgeIds: string[] = []
  let cur = goal
  while (cur !== start) {
    const p = prev.get(cur)
    if (!p) return []
    edgeIds.push(p.edgeId)
    cur = p.node
  }
  return edgeIds.reverse()
}

/** Shortest path treating each edge as undirected (walk either way). Use for “path between two pages” UX. */
export function bfsShortestPathEdgesUndirected(
  start: string,
  goal: string,
  edges: Array<{ id: string; source: string; target: string }>
): string[] {
  if (start === goal) return []
  const adj = new Map<string, Array<{ n: string; edgeId: string }>>()
  for (const e of edges) {
    const push = (u: string, v: string) => {
      let list = adj.get(u)
      if (!list) {
        list = []
        adj.set(u, list)
      }
      list.push({ n: v, edgeId: e.id })
    }
    push(e.source, e.target)
    push(e.target, e.source)
  }
  const prev = new Map<string, { node: string; edgeId: string }>()
  const q: string[] = [start]
  const seen = new Set<string>([start])
  while (q.length) {
    const u = q.shift()
    if (u === undefined) break
    if (u === goal) break
    for (const { n, edgeId } of adj.get(u) ?? []) {
      if (seen.has(n)) continue
      seen.add(n)
      prev.set(n, { node: u, edgeId })
      q.push(n)
    }
  }
  if (!prev.has(goal)) return []
  const edgeIds: string[] = []
  let cur = goal
  while (cur !== start) {
    const p = prev.get(cur)
    if (!p) return []
    edgeIds.push(p.edgeId)
    cur = p.node
  }
  return edgeIds.reverse()
}

/** Union of undirected shortest-path edge sets for every unordered pair in `pageIds`. */
export function unionShortestPathEdgesUndirected(
  pageIds: string[],
  edges: Array<{ id: string; source: string; target: string }>
): string[] {
  if (pageIds.length < 2) return []
  const out = new Set<string>()
  for (let i = 0; i < pageIds.length; i++) {
    for (let j = i + 1; j < pageIds.length; j++) {
      for (const id of bfsShortestPathEdgesUndirected(pageIds[i], pageIds[j], edges)) {
        out.add(id)
      }
    }
  }
  return [...out]
}

/** Returns one simple directed cycle as ordered list of page ids, or null. */
export function findFirstDirectedCycle(pages: string[], edges: Array<{ source: string; target: string }>): string[] | null {
  const adj = new Map<string, string[]>()
  for (const p of pages) adj.set(p, [])
  for (const e of edges) {
    if (!adj.has(e.source) || !adj.has(e.target)) continue
    const arr = adj.get(e.source)
    if (arr) arr.push(e.target)
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []
  let cycle: string[] | null = null
  function dfs(u: string) {
    if (cycle) return
    if (visiting.has(u)) {
      const idx = stack.indexOf(u)
      if (idx >= 0) cycle = stack.slice(idx).concat(u)
      return
    }
    if (visited.has(u)) return
    visiting.add(u)
    stack.push(u)
    for (const v of adj.get(u) ?? []) dfs(v)
    stack.pop()
    visiting.delete(u)
    visited.add(u)
  }
  for (const p of pages) {
    if (!visited.has(p)) dfs(p)
    if (cycle) break
  }
  return cycle
}

/** Orphan = no incoming and no outgoing directed edges among catalog pages. */
export function orphanPageIds(pages: string[], edges: Array<{ source: string; target: string }>): string[] {
  const hasIn = new Set<string>()
  const hasOut = new Set<string>()
  for (const e of edges) {
    hasOut.add(e.source)
    hasIn.add(e.target)
  }
  return pages.filter(p => !hasIn.has(p) && !hasOut.has(p))
}

function sameFlowParent(n: Node, parentId: string | undefined): boolean {
  const p = n.parentId as string | undefined
  if (parentId === undefined) return p === undefined
  return p === parentId
}

function directChildCatalogPages(nodes: Node[], parentId: string | undefined): Node[] {
  return nodes.filter(n => n.type === 'catalogPage' && sameFlowParent(n, parentId))
}

function directChildCatalogGroups(nodes: Node[], parentId: string | undefined): Node[] {
  return nodes.filter(n => n.type === 'catalogGroup' && sameFlowParent(n, parentId))
}

function rootCatalogPages(nodes: Node[]): Node[] {
  return directChildCatalogPages(nodes, undefined)
}

function rootCatalogGroups(nodes: Node[]): Node[] {
  return directChildCatalogGroups(nodes, undefined)
}

export type CatalogMapLayoutAlgo = 'dagre-tb' | 'dagre-lr' | 'radial'

export type CatalogMapLayoutScope = { kind: 'all' } | { kind: 'group'; groupId: string }

function layoutPageCluster(pages: Node[], pageEdges: Edge[], algo: CatalogMapLayoutAlgo): Record<string, { x: number; y: number }> {
  if (!pages.length) return {}
  if (algo === 'radial') return layoutCatalogRadial(pages, pageEdges)
  if (algo === 'dagre-lr') return dagreLayout(pages, pageEdges, 'LR')
  return dagreLayout(pages, pageEdges, 'TB')
}

/** Depth-first post-order of group ids (children before parent). */
export function catalogGroupsPostOrderIds(nodes: Node[]): string[] {
  const roots = rootCatalogGroups(nodes).map(n => n.id)
  const out: string[] = []
  const seen = new Set<string>()
  function walk(gid: string) {
    if (seen.has(gid)) return
    for (const c of directChildCatalogGroups(nodes, gid)) walk(c.id)
    seen.add(gid)
    out.push(gid)
  }
  for (const r of roots) walk(r)
  return out
}

function childNodeSize(n: Node): { w: number; h: number } {
  const size = resolveFlowCanvasNodeLayoutSize(n)
  return { w: size.width, h: size.height }
}

function clusterBounds(
  positions: Record<string, { x: number; y: number }>,
  childIds: string[],
  nodes: Node[]
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const byId = new Map(nodes.map(n => [n.id, n]))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const id of childIds) {
    const p = positions[id]
    const n = byId.get(id)
    if (!p || !n) continue
    const { w, h } = childNodeSize(n)
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + w)
    maxY = Math.max(maxY, p.y + h)
  }
  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}

/** Shift direct children so their cluster is centered in the group frame. */
export function centerChildNodesInGroupFrame(
  positions: Record<string, { x: number; y: number }>,
  childIds: string[],
  nodes: Node[],
  groupId: string
): void {
  if (!childIds.length) return
  const gnode = nodes.find(n => n.id === groupId && n.type === 'catalogGroup')
  if (!gnode) return
  const bbox = clusterBounds(positions, childIds, nodes)
  if (!bbox) return
  const { w: groupW, h: groupH } = groupBox(gnode)
  const contentW = bbox.maxX - bbox.minX
  const contentH = bbox.maxY - bbox.minY
  const availW = Math.max(0, groupW - INNER_PAD * 2)
  const availH = Math.max(0, groupH - GROUP_TITLE_RESERVE - GROUP_FOOTER_RESERVE - INNER_PAD)
  const offsetX = INNER_PAD + Math.max(0, (availW - contentW) / 2) - bbox.minX
  const offsetY = GROUP_TITLE_RESERVE + Math.max(0, (availH - contentH) / 2) - bbox.minY
  for (const id of childIds) {
    const p = positions[id]
    if (p) positions[id] = { x: p.x + offsetX, y: p.y + offsetY }
  }
}

/** Minimum group frame that fits laid-out direct children (pages use NODE_W/H). */
export function computeSnugGroupFrameSize(
  positions: Record<string, { x: number; y: number }>,
  childIds: string[],
  nodes: Node[],
  minWidth = PAGE_MAP_GROUP_DEFAULT_W,
  minHeight = PAGE_MAP_GROUP_DEFAULT_H
): { width: number; height: number } {
  const bbox = clusterBounds(positions, childIds, nodes)
  if (!bbox) return { width: minWidth, height: minHeight }
  const contentW = bbox.maxX - bbox.minX
  const contentH = bbox.maxY - bbox.minY
  return {
    width: Math.max(minWidth, Math.ceil(contentW + INNER_PAD * 2)),
    height: Math.max(minHeight, Math.ceil(GROUP_TITLE_RESERVE + contentH + GROUP_FOOTER_RESERVE + INNER_PAD)),
  }
}

export type CatalogGroupLayoutPlan = {
  positions: Record<string, { x: number; y: number }>
  childIds: string[]
  groupSize?: { width: number; height: number }
}

/** Layout direct catalog children inside a group, center the cluster, and grow the frame if needed. */
export function planCatalogGroupChildLayout(
  nodes: Node[],
  edges: Edge[],
  groupId: string,
  algo: CatalogMapLayoutAlgo = 'dagre-tb'
): CatalogGroupLayoutPlan {
  const groupNode = nodes.find(n => n.id === groupId && n.type === 'catalogGroup')
  if (!groupNode) return { positions: {}, childIds: [] }

  const childIds = nodes
    .filter(n => n.parentId === groupId && (n.type === 'catalogPage' || n.type === 'catalogGroup'))
    .map(n => n.id)

  let layoutNodes = nodes
  let laid = computeCatalogPageMapLayout(layoutNodes, edges, algo, { kind: 'group', groupId })

  const curW = readNumericStyle(groupNode.style?.width, PAGE_MAP_GROUP_DEFAULT_W)
  const curH = readNumericStyle(groupNode.style?.height, PAGE_MAP_GROUP_DEFAULT_H)
  const snug = computeSnugGroupFrameSize(laid, childIds, layoutNodes, curW, curH)
  const nextW = Math.max(curW, snug.width)
  const nextH = Math.max(curH, snug.height)

  let groupSize: { width: number; height: number } | undefined
  if (nextW > curW || nextH > curH) {
    layoutNodes = layoutNodes.map(n =>
      n.id === groupId ? { ...n, style: { ...n.style, width: nextW, height: nextH } } : n
    )
    laid = computeCatalogPageMapLayout(layoutNodes, edges, algo, { kind: 'group', groupId })
    groupSize = { width: nextW, height: nextH }
  }

  return { positions: laid, childIds, groupSize }
}

function layoutInsideGroupContainer(nodes: Node[], edges: Edge[], algo: CatalogMapLayoutAlgo, groupId: string, positions: Record<string, { x: number; y: number }>) {
  const cPages = directChildCatalogPages(nodes, groupId)
  const cGroups = directChildCatalogGroups(nodes, groupId)
  const pageIdSet = new Set(cPages.map(p => p.id))
  const innerEdges = edges.filter(e => pageIdSet.has(e.source) && pageIdSet.has(e.target))
  const inner = layoutPageCluster(cPages, innerEdges, algo)

  for (const p of cPages) {
    const base = inner[p.id] ?? { x: 0, y: 0 }
    positions[p.id] = { x: base.x + INNER_PAD, y: base.y + GROUP_TITLE_RESERVE }
  }

  let maxPx = INNER_PAD
  let maxPy = INNER_PAD
  for (const p of cPages) {
    const pos = positions[p.id]
    if (pos) {
      const { w, h } = childNodeSize(p)
      maxPx = Math.max(maxPx, pos.x + w)
      maxPy = Math.max(maxPy, pos.y + h)
    }
  }

  let cy = maxPy + GROUP_GAP
  const cx0 = INNER_PAD
  let cx = cx0
  let rowGh = 0
  for (const sg of cGroups) {
    const { w, h } = groupBox(sg)
    positions[sg.id] = { x: cx, y: cy }
    cx += w + GROUP_GAP
    rowGh = Math.max(rowGh, h)
    if (cx > cx0 + 2000) {
      cx = cx0
      cy += rowGh + GROUP_GAP
      rowGh = 0
    }
  }

  const childIds = [...cPages.map(p => p.id), ...cGroups.map(g => g.id)]
  centerChildNodesInGroupFrame(positions, childIds, nodes, groupId)
}

/**
 * Positions for catalog map nodes: root pages + root groups (grid) + relative positions inside groups.
 * `scope.kind === 'group'` chỉ layout nội dung trong group được chọn (không đụng root canvas).
 */
export function computeCatalogPageMapLayout(nodes: Node[], edges: Edge[], algo: CatalogMapLayoutAlgo, scope: CatalogMapLayoutScope): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}

  if (scope.kind === 'group') {
    const gnode = nodes.find(n => n.id === scope.groupId && n.type === 'catalogGroup')
    if (!gnode) return positions
    layoutInsideGroupContainer(nodes, edges, algo, scope.groupId, positions)
    return positions
  }

  for (const gid of catalogGroupsPostOrderIds(nodes)) {
    layoutInsideGroupContainer(nodes, edges, algo, gid, positions)
  }

  const rp = rootCatalogPages(nodes)
  const rootPid = new Set(rp.map(p => p.id))
  const rootEdges = edges.filter(e => rootPid.has(e.source) && rootPid.has(e.target))
  const rootLay = layoutPageCluster(rp, rootEdges, algo)
  Object.assign(positions, rootLay)

  let minX = 0
  let minY = 0
  let maxX = 0
  let maxY = 0
  if (rp.length) {
    minX = Infinity
    minY = Infinity
    maxX = -Infinity
    maxY = -Infinity
    for (const p of rp) {
      const pos = positions[p.id] ?? p.position
      const { w, h } = childNodeSize(p)
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + w)
      maxY = Math.max(maxY, pos.y + h)
    }
  }

  const rgs = rootCatalogGroups(nodes)
  let gx = minX === Infinity ? 0 : minX
  let gy = (minY === Infinity ? 0 : maxY) + GROUP_GAP
  let rowH = 0
  for (const g of rgs) {
    const { w, h } = groupBox(g)
    positions[g.id] = { x: gx, y: gy }
    gx += w + GROUP_GAP
    rowH = Math.max(rowH, h)
    if (gx > (minX === Infinity ? 0 : minX) + 2600) {
      gx = minX === Infinity ? 0 : minX
      gy += rowH + GROUP_GAP
      rowH = 0
    }
  }

  return positions
}

export async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function runOne(): Promise<void> {
    while (i < items.length) {
      const idx = i++
      out[idx] = await worker(items[idx])
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1))
  await Promise.all(Array.from({ length: n }, () => runOne()))
  return out
}
