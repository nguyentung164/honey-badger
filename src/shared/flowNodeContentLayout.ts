import type { FlowNodeVisualStyle } from './flowDiagramStyle'
import { PIPELINE_GROUP_DEFAULT_H, PIPELINE_GROUP_DEFAULT_W } from './devPipelines/graphLayout'

export type FlowNodeContentLayoutKind =
  | 'inline'
  | 'stacked'
  | 'iconBlock'
  | 'badgeLeading'
  | 'compact'
  | 'metadata'

export type FlowNodeContentDensity = 'compact' | 'comfortable' | 'spacious'

export type FlowNodeContentMetadataMode = 'hidden' | 'toggle' | 'always'

export type FlowNodeContentLayoutContext = 'catalogPage' | 'pipelineStep'

export const FLOW_NODE_CONTENT_LAYOUT_KINDS: readonly FlowNodeContentLayoutKind[] = [
  'inline',
  'stacked',
  'iconBlock',
  'badgeLeading',
  'compact',
  'metadata',
]

export const FLOW_NODE_CONTENT_DENSITIES: readonly FlowNodeContentDensity[] = ['compact', 'comfortable', 'spacious']

export const FLOW_NODE_CONTENT_METADATA_MODES: readonly FlowNodeContentMetadataMode[] = ['hidden', 'toggle', 'always']

const LAYOUT_SET = new Set<string>(FLOW_NODE_CONTENT_LAYOUT_KINDS)
const DENSITY_SET = new Set<string>(FLOW_NODE_CONTENT_DENSITIES)
const METADATA_MODE_SET = new Set<string>(FLOW_NODE_CONTENT_METADATA_MODES)

export type ResolvedFlowNodeContentLayout = {
  contentLayout: FlowNodeContentLayoutKind
  contentDensity: FlowNodeContentDensity
  metadataMode: FlowNodeContentMetadataMode
}

export type FlowNodeContentLayoutSize = {
  width: number
  height: number
}

const CONTEXT_DEFAULTS: Record<FlowNodeContentLayoutContext, ResolvedFlowNodeContentLayout> = {
  catalogPage: { contentLayout: 'inline', contentDensity: 'comfortable', metadataMode: 'toggle' },
  pipelineStep: { contentLayout: 'stacked', contentDensity: 'comfortable', metadataMode: 'hidden' },
}

/** Base W×H at comfortable density, before metadata height bump. */
const BASE_SIZE: Record<FlowNodeContentLayoutKind, FlowNodeContentLayoutSize> = {
  inline: { width: 200, height: 72 },
  stacked: { width: 180, height: 64 },
  iconBlock: { width: 120, height: 100 },
  badgeLeading: { width: 200, height: 72 },
  compact: { width: 140, height: 36 },
  metadata: { width: 220, height: 120 },
}

const DENSITY_SCALE: Record<FlowNodeContentDensity, number> = {
  compact: 0.85,
  comfortable: 1,
  spacious: 1.2,
}

export function normalizeContentLayout(value: unknown): FlowNodeContentLayoutKind | undefined {
  if (typeof value === 'string' && LAYOUT_SET.has(value)) return value as FlowNodeContentLayoutKind
  return undefined
}

export function normalizeContentDensity(value: unknown): FlowNodeContentDensity | undefined {
  if (typeof value === 'string' && DENSITY_SET.has(value)) return value as FlowNodeContentDensity
  return undefined
}

export function normalizeMetadataMode(value: unknown): FlowNodeContentMetadataMode | undefined {
  if (typeof value === 'string' && METADATA_MODE_SET.has(value)) return value as FlowNodeContentMetadataMode
  return undefined
}

export function resolveFlowNodeContentLayout(
  style: Partial<FlowNodeVisualStyle> | null | undefined,
  context: FlowNodeContentLayoutContext,
): ResolvedFlowNodeContentLayout {
  const defaults = CONTEXT_DEFAULTS[context]
  const contentLayout = normalizeContentLayout(style?.contentLayout) ?? defaults.contentLayout
  const contentDensity = normalizeContentDensity(style?.contentDensity) ?? defaults.contentDensity
  let metadataMode = normalizeMetadataMode(style?.metadataMode) ?? defaults.metadataMode

  if (contentLayout === 'compact') {
    metadataMode = 'hidden'
  } else if (contentLayout === 'metadata' && metadataMode === 'hidden') {
    metadataMode = 'always'
  }

  return { contentLayout, contentDensity, metadataMode }
}

export function contentLayoutSupportsMetadata(
  layout: FlowNodeContentLayoutKind,
  metadataMode: FlowNodeContentMetadataMode,
): boolean {
  if (metadataMode === 'hidden' || layout === 'compact') return false
  return true
}

export function getFlowNodeContentLayoutSize(
  layout: FlowNodeContentLayoutKind,
  density: FlowNodeContentDensity,
  metadataMode: FlowNodeContentMetadataMode,
  context: FlowNodeContentLayoutContext,
): FlowNodeContentLayoutSize {
  const base = BASE_SIZE[layout]
  const scale = DENSITY_SCALE[density]
  let width = Math.round(base.width * scale)
  let height = Math.round(base.height * scale)

  if (layout === 'inline' && metadataMode === 'toggle' && context === 'catalogPage') {
    height += Math.round(20 * scale)
  }
  if (layout === 'metadata' || metadataMode === 'always') {
    height += Math.round(32 * scale)
  }
  if (layout === 'stacked' && metadataMode === 'always' && context === 'pipelineStep') {
    height += Math.round(40 * scale)
  }

  return { width, height }
}

export function getFlowNodeContentLayoutSizeFromStyle(
  style: Partial<FlowNodeVisualStyle> | null | undefined,
  context: FlowNodeContentLayoutContext,
): FlowNodeContentLayoutSize {
  const resolved = resolveFlowNodeContentLayout(style, context)
  return getFlowNodeContentLayoutSize(resolved.contentLayout, resolved.contentDensity, resolved.metadataMode, context)
}

/** React Flow node sizing for auto-layout (catalog pages + pipeline steps). */
export function flowCanvasNodeLayoutSize(node: { type?: string; data?: unknown }): FlowNodeContentLayoutSize {
  const data = node.data as { diagramVisual?: Partial<FlowNodeVisualStyle> } | undefined
  const visual = data?.diagramVisual
  if (node.type === 'pipelineStep') return getFlowNodeContentLayoutSizeFromStyle(visual, 'pipelineStep')
  if (node.type === 'catalogPage') return getFlowNodeContentLayoutSizeFromStyle(visual, 'catalogPage')
  return { width: 200, height: 72 }
}

export const FLOW_CANVAS_DEFAULT_NODE_SIZE: FlowNodeContentLayoutSize = { width: 200, height: 72 }

export const FLOW_CATALOG_GROUP_DEFAULT_SIZE: FlowNodeContentLayoutSize = { width: 420, height: 280 }

export const FLOW_PIPELINE_GROUP_DEFAULT_SIZE: FlowNodeContentLayoutSize = {
  width: PIPELINE_GROUP_DEFAULT_W,
  height: PIPELINE_GROUP_DEFAULT_H,
}

export type FlowCanvasLayoutSizeSource = {
  type?: string
  data?: unknown
  measured?: { width?: number; height?: number }
  width?: number
  height?: number
  style?: { width?: number | string; height?: number | string }
}

export function readFlowNodeLayoutDimension(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return undefined
}

/**
 * Resolve W×H for Dagre / radial layout.
 * Priority (React Flow + Dagre best practice): measured DOM → node width/height → style → content-layout estimate.
 */
export function resolveFlowCanvasNodeLayoutSize(node: FlowCanvasLayoutSizeSource): FlowNodeContentLayoutSize {
  const estimated = flowCanvasNodeLayoutSize(node)

  const measuredW = readFlowNodeLayoutDimension(node.measured?.width)
  const measuredH = readFlowNodeLayoutDimension(node.measured?.height)
  const nodeW = readFlowNodeLayoutDimension(node.width)
  const nodeH = readFlowNodeLayoutDimension(node.height)
  const styleW = readFlowNodeLayoutDimension(node.style?.width)
  const styleH = readFlowNodeLayoutDimension(node.style?.height)

  if (node.type === 'catalogGroup') {
    const def = FLOW_CATALOG_GROUP_DEFAULT_SIZE
    return {
      width: measuredW ?? styleW ?? nodeW ?? def.width,
      height: measuredH ?? styleH ?? nodeH ?? def.height,
    }
  }

  if (node.type === 'pipelineGroup') {
    const def = FLOW_PIPELINE_GROUP_DEFAULT_SIZE
    return {
      width: measuredW ?? styleW ?? nodeW ?? def.width,
      height: measuredH ?? styleH ?? nodeH ?? def.height,
    }
  }

  if (node.type === 'mapAnnotation' || node.type === 'pipelineNote') {
    return {
      width: measuredW ?? styleW ?? nodeW ?? estimated.width,
      height: measuredH ?? styleH ?? nodeH ?? estimated.height,
    }
  }

  return {
    width: measuredW ?? nodeW ?? styleW ?? estimated.width,
    height: measuredH ?? nodeH ?? styleH ?? estimated.height,
  }
}
