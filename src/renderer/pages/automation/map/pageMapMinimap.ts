import type { Node } from '@xyflow/react'
import { effectiveAccentColor, mergeNodeVisualStyle, type FlowNodeVisualStyle } from 'shared/flowDiagramStyle'
import { mergePageMapAnnotationStyle } from 'shared/pageMapAnnotationStyle'
import { resolveFlowNodeShellVisual } from '@/components/flow-inspector/flowNodeShellVisual'
import type { CatalogGroupNodeData, CatalogPageNodeDataForGraph, PageMapAnnotationNodeDataForGraph, PageMapNodeStatus } from '@/pages/automation/map/pageMapGraph'

const STATUS_STROKE: Record<PageMapNodeStatus, string | null> = {
  idle: null,
  queued: '#f59e0b',
  running: '#0ea5e9',
  done: '#10b981',
  error: '#ef4444',
  cancelled: '#94a3b8',
}

function expandHex(hex: string): string | null {
  const h = hex.replace('#', '').trim()
  if (h.length === 3) return h.split('').map(c => c + c).join('')
  if (h.length === 6) return h
  return null
}

/** Mix two hex colors; `fgRatio` = weight of foreground (0–1). */
export function mixHexColors(fg: string, bg: string, fgRatio: number): string {
  const f = expandHex(fg)
  const b = expandHex(bg)
  if (!f || !b) return fg
  const t = Math.min(1, Math.max(0, fgRatio))
  const r = Math.round(parseInt(f.slice(0, 2), 16) * t + parseInt(b.slice(0, 2), 16) * (1 - t))
  const g = Math.round(parseInt(f.slice(2, 4), 16) * t + parseInt(b.slice(2, 4), 16) * (1 - t))
  const bl = Math.round(parseInt(f.slice(4, 6), 16) * t + parseInt(b.slice(4, 6), 16) * (1 - t))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}

function cardBg(isDark: boolean): string {
  return isDark ? '#0f172a' : '#ffffff'
}

function mutedFill(isDark: boolean): string {
  return isDark ? '#334155' : '#f1f5f9'
}

function diagramVisualFromNode(node: Node): Partial<FlowNodeVisualStyle> | undefined {
  if (node.type === 'catalogGroup') return (node.data as CatalogGroupNodeData | undefined)?.diagramVisual
  if (node.type === 'catalogPage') return (node.data as CatalogPageNodeDataForGraph | undefined)?.diagramVisual
  return undefined
}

function nodeStatus(node: Node): PageMapNodeStatus {
  const s = (node.data as { status?: PageMapNodeStatus } | undefined)?.status
  return s ?? 'idle'
}

/** Minimap node fill — approximates card fill + accent tint on the main canvas. */
export function pageMapMiniMapNodeColor(node: Node, isDark: boolean): string {
  const bg = cardBg(isDark)
  if (node.type === 'mapAnnotation') {
    const merged = mergePageMapAnnotationStyle((node.data as PageMapAnnotationNodeDataForGraph | undefined)?.style)
    const c = merged.color?.trim()
    return c?.startsWith('#') ? mixHexColors(c, bg, 0.22) : mutedFill(isDark)
  }

  const merged = mergeNodeVisualStyle(diagramVisualFromNode(node))
  const hasAccent = Boolean(merged.accentColor || merged.accentGradient)
  const shell = resolveFlowNodeShellVisual(merged, {
    accentBackground: node.type !== 'catalogGroup' || hasAccent,
  })

  if (shell.hasAccent) {
    const accent = effectiveAccentColor(merged)
    const ratio = node.type === 'catalogGroup' ? 0.14 : 0.3
    return mixHexColors(accent, bg, ratio)
  }

  if (node.type === 'catalogGroup') {
    return mixHexColors(bg, isDark ? '#020617' : '#e2e8f0', 0.55)
  }

  return mutedFill(isDark)
}

/** Minimap node stroke — run-status ring or accent border like the main map. */
export function pageMapMiniMapNodeStrokeColor(node: Node, isDark: boolean): string {
  if (node.type === 'mapAnnotation') return isDark ? '#64748b' : '#94a3b8'

  const statusStroke = STATUS_STROKE[nodeStatus(node)]
  if (statusStroke) return statusStroke

  const merged = mergeNodeVisualStyle(diagramVisualFromNode(node))
  const hasAccent = Boolean(merged.accentColor || merged.accentGradient)
  const shell = resolveFlowNodeShellVisual(merged, {
    accentBackground: node.type !== 'catalogGroup' || hasAccent,
  })
  if (shell.hasAccent) return shell.accentCol

  return isDark ? '#475569' : '#cbd5e1'
}

export function pageMapMiniMapNodeStrokeWidth(node: Node): number {
  const status = nodeStatus(node)
  if (status !== 'idle') return 2.5
  return 1.5
}
