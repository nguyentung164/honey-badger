import type { Edge, Node } from '@xyflow/react'
import { resolveFlowCanvasNodeLayoutSize } from 'shared/flowNodeContentLayout'
import { PIPELINE_GROUP_DEFAULT_H, PIPELINE_GROUP_DEFAULT_W } from 'shared/devPipelines/graphLayout'
import {
  GROUP_FOOTER_RESERVE,
  GROUP_TITLE_RESERVE,
  layoutCatalogWithDagre,
} from '@/pages/automation/map/pageMapLayout'
import { PAGE_MAP_GROUP_INNER_PAD } from '@/pages/automation/map/pageMapGraph'

const INNER_PAD = PAGE_MAP_GROUP_INNER_PAD

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
    w: readNumericStyle(n.style?.width, PIPELINE_GROUP_DEFAULT_W),
    h: readNumericStyle(n.style?.height, PIPELINE_GROUP_DEFAULT_H),
  }
}

function stepSize(n: Node): { w: number; h: number } {
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
    const { w, h } = stepSize(n)
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + w)
    maxY = Math.max(maxY, p.y + h)
  }
  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}

function centerPipelineStepsInGroup(
  positions: Record<string, { x: number; y: number }>,
  childIds: string[],
  nodes: Node[],
  groupId: string
): void {
  if (!childIds.length) return
  const gnode = nodes.find(n => n.id === groupId && n.type === 'pipelineGroup')
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

function computeSnugPipelineGroupFrameSize(
  positions: Record<string, { x: number; y: number }>,
  childIds: string[],
  nodes: Node[],
  minWidth = PIPELINE_GROUP_DEFAULT_W,
  minHeight = PIPELINE_GROUP_DEFAULT_H
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

export type PipelineGroupLayoutPlan = {
  positions: Record<string, { x: number; y: number }>
  childIds: string[]
  groupSize?: { width: number; height: number }
}

/** Layout pipeline steps inside a group and center the cluster in the frame. */
export function planPipelineGroupChildLayout(nodes: Node[], edges: Edge[], groupId: string): PipelineGroupLayoutPlan {
  const groupNode = nodes.find(n => n.id === groupId && n.type === 'pipelineGroup')
  if (!groupNode) return { positions: {}, childIds: [] }

  const childIds = nodes.filter(n => n.parentId === groupId && n.type === 'pipelineStep').map(n => n.id)
  if (!childIds.length) return { positions: {}, childIds: [] }

  const steps = nodes.filter(n => childIds.includes(n.id))
  const stepIdSet = new Set(childIds)
  const innerEdges = edges.filter(e => stepIdSet.has(e.source) && stepIdSet.has(e.target))
  const inner = layoutCatalogWithDagre(steps, innerEdges)

  const positions: Record<string, { x: number; y: number }> = {}
  for (const step of steps) {
    const base = inner[step.id] ?? { x: 0, y: 0 }
    positions[step.id] = { x: base.x + INNER_PAD, y: base.y + GROUP_TITLE_RESERVE }
  }
  centerPipelineStepsInGroup(positions, childIds, nodes, groupId)

  const curW = readNumericStyle(groupNode.style?.width, PIPELINE_GROUP_DEFAULT_W)
  const curH = readNumericStyle(groupNode.style?.height, PIPELINE_GROUP_DEFAULT_H)
  const snug = computeSnugPipelineGroupFrameSize(positions, childIds, nodes, curW, curH)
  const nextW = Math.max(curW, snug.width)
  const nextH = Math.max(curH, snug.height)

  if (nextW <= curW && nextH <= curH) {
    return { positions, childIds, groupSize: undefined }
  }

  const expandedNodes = nodes.map(n =>
    n.id === groupId ? { ...n, style: { ...n.style, width: nextW, height: nextH } } : n
  )
  centerPipelineStepsInGroup(positions, childIds, expandedNodes, groupId)
  return { positions, childIds, groupSize: { width: nextW, height: nextH } }
}
