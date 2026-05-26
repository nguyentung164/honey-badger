import type { Node } from '@xyflow/react'
import { effectiveAccentColor, mergeNodeVisualStyle } from 'shared/flowDiagramStyle'
import { resolveFlowNodeShellVisual } from '@/components/flow-inspector/flowNodeShellVisual'
import { mixHexColors } from '@/pages/automation/map/pageMapMinimap'
import type { PipelineStepRunVisual } from '@/pages/dev-pipelines/PipelineStepNode'

const RUN_VISUAL_STROKE: Record<PipelineStepRunVisual, string | null> = {
  idle: null,
  pending: '#f59e0b',
  running: '#0ea5e9',
  'awaiting-approval': '#eab308',
  success: '#10b981',
  error: '#ef4444',
  skipped: '#94a3b8',
}

function cardBg(isDark: boolean): string {
  return isDark ? '#0f172a' : '#ffffff'
}

function mutedFill(isDark: boolean): string {
  return isDark ? '#334155' : '#f1f5f9'
}

function runVisual(node: Node): PipelineStepRunVisual {
  const v = (node.data as { runVisual?: PipelineStepRunVisual } | undefined)?.runVisual
  return v ?? 'idle'
}

/** Minimap node fill — approximates pipeline step card + accent tint on the main canvas. */
export function devPipelineMiniMapNodeColor(node: Node, isDark: boolean): string {
  if (node.type !== 'pipelineStep') return mutedFill(isDark)

  const merged = mergeNodeVisualStyle((node.data as { diagramVisual?: Parameters<typeof mergeNodeVisualStyle>[0] } | undefined)?.diagramVisual)
  const shell = resolveFlowNodeShellVisual(merged, { accentBackground: true })

  if (shell.hasAccent) {
    return mixHexColors(effectiveAccentColor(merged), cardBg(isDark), 0.3)
  }

  return mutedFill(isDark)
}

/** Minimap node stroke — run status ring or accent border like the main pipeline canvas. */
export function devPipelineMiniMapNodeStrokeColor(node: Node, isDark: boolean): string {
  if (node.type !== 'pipelineStep') return isDark ? '#475569' : '#cbd5e1'

  const statusStroke = RUN_VISUAL_STROKE[runVisual(node)]
  if (statusStroke) return statusStroke

  const merged = mergeNodeVisualStyle((node.data as { diagramVisual?: Parameters<typeof mergeNodeVisualStyle>[0] } | undefined)?.diagramVisual)
  const shell = resolveFlowNodeShellVisual(merged, { accentBackground: true })
  if (shell.hasAccent) return shell.accentCol

  return isDark ? '#475569' : '#cbd5e1'
}

export function devPipelineMiniMapNodeStrokeWidth(node: Node): number {
  if (node.type !== 'pipelineStep') return 1.5
  return runVisual(node) !== 'idle' ? 2.5 : 1.5
}
