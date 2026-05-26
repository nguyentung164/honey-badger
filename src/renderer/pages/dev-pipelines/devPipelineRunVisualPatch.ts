import type { Edge, Node } from '@xyflow/react'
import type { CSSProperties } from 'react'
import type { DevPipelineStepRunStatus, DevPipelineStepStatusEntry } from 'shared/devPipelines/types'
import { connectionStrokeWidthPx, dashArrayForKind, mergeConnectionStyle } from 'shared/flowDiagramStyle'
import { flowDiagramArrowMarkerEnd, flowDiagramArrowMarkerStart } from 'shared/flowEdgeMarkers'
import type { PipelineStepRunVisual } from '@/pages/dev-pipelines/PipelineStepNode'
import {
  PAGE_MAP_PATH_HIGHLIGHT_COLOR,
  PAGE_MAP_PATH_HIGHLIGHT_EDGE_STYLE,
  PAGE_MAP_PATH_HIGHLIGHT_RUNNING_COLOR,
  PAGE_MAP_PATH_HIGHLIGHT_RUNNING_EDGE_STYLE,
} from '@/pages/automation/map/pageMapPathHighlight'

export const PIPELINE_EDGE_IDLE_STYLE: CSSProperties = {
  strokeWidth: 2,
  stroke: 'hsl(var(--muted-foreground) / 0.45)',
}

export const PIPELINE_EDGE_ACTIVE_STYLE: CSSProperties = {
  strokeWidth: 3,
  stroke: 'hsl(var(--primary))',
}

export function streamStatusToVisual(s: DevPipelineStepRunStatus | undefined): PipelineStepRunVisual {
  if (!s) return 'idle'
  if (s === 'pending') return 'pending'
  if (s === 'running') return 'running'
  if (s === 'awaiting-approval') return 'awaiting-approval'
  if (s === 'success') return 'success'
  if (s === 'error') return 'error'
  if (s === 'skipped') return 'skipped'
  return 'idle'
}

function edgeNeedsIdleReset(edge: Edge): boolean {
  return Boolean(edge.animated) || edge.style?.strokeWidth === PIPELINE_EDGE_ACTIVE_STYLE.strokeWidth
}

function edgeMatchesActive(edge: Edge): boolean {
  return edge.animated === true && edge.style?.strokeWidth === PIPELINE_EDGE_ACTIVE_STYLE.strokeWidth && edge.style?.stroke === PIPELINE_EDGE_ACTIVE_STYLE.stroke
}

function edgeMatchesIdle(edge: Edge): boolean {
  return edge.animated === false && edge.style?.strokeWidth === PIPELINE_EDGE_IDLE_STYLE.strokeWidth && edge.style?.stroke === PIPELINE_EDGE_IDLE_STYLE.stroke
}

/** Returns patched nodes or null when nothing changed (skip setState). */
export function patchPipelineNodesRunVisual(nodes: Node[], stepStatus: Record<string, DevPipelineStepStatusEntry>): Node[] | null {
  let changed = false
  const next = nodes.map(n => {
    const visual = streamStatusToVisual(stepStatus[n.id]?.status)
    const current = (n.data as { runVisual?: PipelineStepRunVisual }).runVisual ?? 'idle'
    if (current === visual) return n
    changed = true
    return { ...n, data: { ...n.data, runVisual: visual } }
  })
  return changed ? next : null
}

/** Returns patched edges or null when nothing changed (skip setState). */
export function patchPipelineEdgesActive(edges: Edge[], activeEdgeId: string | null | undefined, prevActiveEdgeId?: string | null): Edge[] | null {
  const active = activeEdgeId ?? null
  const prev = prevActiveEdgeId ?? null

  const idsToTouch = new Set<string>()
  if (active) idsToTouch.add(active)
  if (prev && prev !== active) idsToTouch.add(prev)

  let changed = false
  const next = edges.map(e => {
    const shouldBeActive = active !== null && e.id === active
    const touched = idsToTouch.has(e.id)

    if (!touched) {
      if (shouldBeActive || edgeNeedsIdleReset(e)) {
        changed = true
        return shouldBeActive ? { ...e, animated: true, style: { ...PIPELINE_EDGE_ACTIVE_STYLE } } : { ...e, animated: false, style: { ...PIPELINE_EDGE_IDLE_STYLE } }
      }
      return e
    }

    if (shouldBeActive) {
      if (edgeMatchesActive(e)) return e
      changed = true
      return { ...e, animated: true, style: { ...PIPELINE_EDGE_ACTIVE_STYLE } }
    }

    if (edgeMatchesIdle(e)) return e
    changed = true
    return { ...e, animated: false, style: { ...PIPELINE_EDGE_IDLE_STYLE } }
  })

  return changed ? next : null
}

type PipelineEdgePresentationOpts = {
  pathEdgeIds?: Set<string>
  pathRunPulse?: boolean
  activeEdgeId?: string | null
}

function pipelineEdgeBaseMarkers(cs: ReturnType<typeof mergeConnectionStyle>) {
  return {
    markerEnd: flowDiagramArrowMarkerEnd(cs.color),
    markerStart: cs.bidirectional ? flowDiagramArrowMarkerStart(cs.color) : undefined,
  }
}

function pipelineEdgeBaseStyle(cs: ReturnType<typeof mergeConnectionStyle>): CSSProperties {
  return {
    stroke: cs.color,
    strokeWidth: connectionStrokeWidthPx(cs.width),
    strokeDasharray: dashArrayForKind(cs.dash),
  }
}

/** Compose path highlight + run-active styling for canvas edges (does not mutate persisted graph). */
export function applyPipelineEdgePresentation(edges: Edge[], opts: PipelineEdgePresentationOpts = {}): Edge[] {
  const pathEdgeIds = opts.pathEdgeIds ?? new Set<string>()
  const pathRunPulse = opts.pathRunPulse ?? false
  const active = opts.activeEdgeId ?? null

  return edges.map(e => {
    const cs = mergeConnectionStyle((e.data as { connectionStyle?: Parameters<typeof mergeConnectionStyle>[0] } | undefined)?.connectionStyle)
    const baseStyle = pipelineEdgeBaseStyle(cs)
    const baseMarkers = pipelineEdgeBaseMarkers(cs)

    if (active && e.id === active) {
      return {
        ...e,
        animated: true,
        style: { ...PIPELINE_EDGE_ACTIVE_STYLE },
        markerEnd: flowDiagramArrowMarkerEnd(PIPELINE_EDGE_ACTIVE_STYLE.stroke as string),
        markerStart: cs.bidirectional ? flowDiagramArrowMarkerStart(PIPELINE_EDGE_ACTIVE_STYLE.stroke as string) : undefined,
      }
    }

    if (pathEdgeIds.has(e.id)) {
      const highlightStroke = pathRunPulse ? PAGE_MAP_PATH_HIGHLIGHT_RUNNING_COLOR : PAGE_MAP_PATH_HIGHLIGHT_COLOR
      const highlightStyle = pathRunPulse ? PAGE_MAP_PATH_HIGHLIGHT_RUNNING_EDGE_STYLE : PAGE_MAP_PATH_HIGHLIGHT_EDGE_STYLE
      return {
        ...e,
        animated: pathRunPulse,
        style: { ...baseStyle, ...highlightStyle },
        markerEnd: flowDiagramArrowMarkerEnd(highlightStroke),
        markerStart: cs.bidirectional ? flowDiagramArrowMarkerStart(highlightStroke) : undefined,
      }
    }

    if (active) {
      return {
        ...e,
        animated: false,
        style: { ...PIPELINE_EDGE_IDLE_STYLE },
        ...baseMarkers,
      }
    }

    return {
      ...e,
      animated: false,
      style: undefined,
      markerEnd: baseMarkers.markerEnd,
      markerStart: baseMarkers.markerStart,
    }
  })
}
