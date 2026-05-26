import type { FlowNodeContentLayoutContext } from './flowNodeContentLayout'
import type { FlowNodeVisualStyle } from './flowDiagramStyle'

export type FlowNodeBoardKind = 'pageMap' | 'devPipelines'

export type FlowNodeContentDefaults = Pick<FlowNodeVisualStyle, 'contentLayout' | 'contentDensity' | 'metadataMode'>

const LS_KEYS: Record<FlowNodeBoardKind, string> = {
  pageMap: 'page-map-node-content-defaults',
  devPipelines: 'dev-pipelines-node-content-defaults',
}

export function boardKindForLayoutContext(context: FlowNodeContentLayoutContext): FlowNodeBoardKind {
  return context === 'pipelineStep' ? 'devPipelines' : 'pageMap'
}

export function readBoardContentDefaults(board: FlowNodeBoardKind): FlowNodeContentDefaults | null {
  try {
    const raw = localStorage.getItem(LS_KEYS[board])
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const o = parsed as Record<string, unknown>
    const out: FlowNodeContentDefaults = {}
    if (typeof o.contentLayout === 'string') out.contentLayout = o.contentLayout as FlowNodeContentDefaults['contentLayout']
    if (typeof o.contentDensity === 'string') out.contentDensity = o.contentDensity as FlowNodeContentDefaults['contentDensity']
    if (typeof o.metadataMode === 'string') out.metadataMode = o.metadataMode as FlowNodeContentDefaults['metadataMode']
    return Object.keys(out).length > 0 ? out : null
  } catch {
    return null
  }
}

export function writeBoardContentDefaults(board: FlowNodeBoardKind, defaults: FlowNodeContentDefaults): void {
  try {
    localStorage.setItem(LS_KEYS[board], JSON.stringify(defaults))
  } catch {
    /* ignore quota */
  }
}

export function clearBoardContentDefaults(board: FlowNodeBoardKind): void {
  try {
    localStorage.removeItem(LS_KEYS[board])
  } catch {
    /* ignore */
  }
}

export function pickContentDefaultsFromVisual(style: FlowNodeVisualStyle): FlowNodeContentDefaults {
  const out: FlowNodeContentDefaults = {}
  if (style.contentLayout) out.contentLayout = style.contentLayout
  if (style.contentDensity) out.contentDensity = style.contentDensity
  if (style.metadataMode) out.metadataMode = style.metadataMode
  return out
}

export function mergeBoardDefaultsIntoVisual(
  partial: Partial<FlowNodeVisualStyle> | undefined,
  board: FlowNodeBoardKind,
): Partial<FlowNodeVisualStyle> {
  const defaults = readBoardContentDefaults(board)
  if (!defaults) return partial ?? {}
  return { ...defaults, ...partial }
}

export function applyContentDefaultsToVisual(
  style: FlowNodeVisualStyle,
  defaults: FlowNodeContentDefaults,
): FlowNodeVisualStyle {
  return {
    ...style,
    ...defaults,
  }
}
