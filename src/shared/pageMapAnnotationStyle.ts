/** Visual style for page-map annotation nodes (stored in style_json). */

import type {
  FlowNodeAnimationKind,
  FlowNodeVisualStyle,
  FlowStrokeWidthPreset,
  GradientStop,
} from './flowDiagramStyle'
import { normalizeNodeAnimation, normalizeNodeBorderWidth } from './flowDiagramStyle'

export type PageMapAnnotationFontFamily = 'system' | 'serif' | 'mono' | 'rounded'

export type PageMapAnnotationStyle = {
  color?: string
  /** Font size in CSS px. */
  fontSize?: number
  fontFamily?: PageMapAnnotationFontFamily
  /** Border / ring accent (same model as catalog node). */
  accentColor?: string
  accentGradient?: GradientStop[]
  /** Card border width preset — same as catalog node. */
  borderWidth?: FlowStrokeWidthPreset
  nodeAnimation?: FlowNodeAnimationKind
  nodeAnimationSpeed?: number
}

export const PAGE_MAP_ANNOTATION_FONT_FAMILIES: readonly PageMapAnnotationFontFamily[] = ['system', 'serif', 'mono', 'rounded'] as const

export const PAGE_MAP_ANNOTATION_FONT_SIZES = [10, 12, 14, 16, 18, 20] as const

export const PAGE_MAP_ANNOTATION_DEFAULT_W = 200
export const PAGE_MAP_ANNOTATION_DEFAULT_H = 72
export const PAGE_MAP_ANNOTATION_MIN_W = 120
export const PAGE_MAP_ANNOTATION_MIN_H = 48

export const PAGE_MAP_ANNOTATION_STYLE_DEFAULT = {
  color: '#ffffff',
  fontSize: 14,
  fontFamily: 'system' as PageMapAnnotationFontFamily,
  accentColor: '',
  accentGradient: undefined as GradientStop[] | undefined,
  borderWidth: undefined as FlowStrokeWidthPreset | undefined,
  nodeAnimation: undefined as FlowNodeAnimationKind | undefined,
  nodeAnimationSpeed: undefined as number | undefined,
}

function mergedAnnotationColor(partial: Partial<PageMapAnnotationStyle>): string {
  const raw = partial.color
  if (raw == null || typeof raw !== 'string') return PAGE_MAP_ANNOTATION_STYLE_DEFAULT.color
  const t = raw.trim()
  return t || PAGE_MAP_ANNOTATION_STYLE_DEFAULT.color
}

/** After {@link mergePageMapAnnotationStyle}, `color` is always a concrete hex (default white). */
export type PageMapAnnotationStyleMerged = PageMapAnnotationStyle & { color: string }

export function mergePageMapAnnotationStyle(partial?: Partial<PageMapAnnotationStyle> | null): PageMapAnnotationStyleMerged {
  if (!partial) return { ...PAGE_MAP_ANNOTATION_STYLE_DEFAULT } as PageMapAnnotationStyleMerged
  return {
    color: mergedAnnotationColor(partial),
    fontSize: partial.fontSize ?? PAGE_MAP_ANNOTATION_STYLE_DEFAULT.fontSize,
    fontFamily: partial.fontFamily ?? PAGE_MAP_ANNOTATION_STYLE_DEFAULT.fontFamily,
    accentColor: partial.accentColor ?? PAGE_MAP_ANNOTATION_STYLE_DEFAULT.accentColor,
    accentGradient:
      Array.isArray(partial.accentGradient) && partial.accentGradient.length >= 2 ? partial.accentGradient : undefined,
    borderWidth: normalizeNodeBorderWidth(partial.borderWidth),
    nodeAnimation: normalizeNodeAnimation(partial.nodeAnimation),
    nodeAnimationSpeed:
      typeof partial.nodeAnimationSpeed === 'number' && Number.isFinite(partial.nodeAnimationSpeed)
        ? partial.nodeAnimationSpeed
        : PAGE_MAP_ANNOTATION_STYLE_DEFAULT.nodeAnimationSpeed,
  } as PageMapAnnotationStyleMerged
}

/** Whether the note should render a custom accent ring / fill (transparent / empty = off). */
export function pageMapAnnotationHasAccent(style: PageMapAnnotationStyle): boolean {
  if (style.accentGradient && style.accentGradient.length >= 2) return true
  const c = style.accentColor?.trim().toLowerCase()
  return Boolean(c && c !== 'transparent')
}

/**
 * Maps note style to node shell visual input so {@link resolveFlowNodeShellVisual} / {@link FlowNodeVisualShell}
 * render the same gradient fill, gradient rim, border width, and orbit animation as catalog nodes.
 */
export function pageMapAnnotationStyleToDiagramVisual(style: PageMapAnnotationStyle): Partial<FlowNodeVisualStyle> {
  const m = mergePageMapAnnotationStyle(style)
  const out: Partial<FlowNodeVisualStyle> = {}
  if (m.borderWidth !== undefined) out.borderWidth = m.borderWidth
  if (m.nodeAnimation) {
    out.nodeAnimation = m.nodeAnimation
    out.nodeAnimationSpeed = m.nodeAnimationSpeed ?? 1
  }
  if (!pageMapAnnotationHasAccent(m)) return out
  if (m.accentGradient && m.accentGradient.length >= 2) {
    out.accentGradient = m.accentGradient
    out.accentColor = (m.accentColor?.trim() || m.accentGradient[0]?.color || '#94a3b8').trim()
  } else {
    out.accentColor = m.accentColor?.trim() || '#94a3b8'
  }
  return out
}

export function parsePageMapAnnotationStyleJson(raw: string | null | undefined): PageMapAnnotationStyle | undefined {
  if (!raw?.trim()) return undefined
  try {
    const o = JSON.parse(raw) as Partial<PageMapAnnotationStyle>
    return mergePageMapAnnotationStyle(o)
  } catch {
    return undefined
  }
}

export function stringifyPageMapAnnotationStyle(style: PageMapAnnotationStyle | undefined): string | null {
  if (!style) return null
  const merged = mergePageMapAnnotationStyle(style)
  const payload: PageMapAnnotationStyle = {}
  if (merged.color && merged.color !== PAGE_MAP_ANNOTATION_STYLE_DEFAULT.color) payload.color = merged.color
  if (merged.fontSize !== PAGE_MAP_ANNOTATION_STYLE_DEFAULT.fontSize) payload.fontSize = merged.fontSize
  if (merged.fontFamily !== PAGE_MAP_ANNOTATION_STYLE_DEFAULT.fontFamily) payload.fontFamily = merged.fontFamily
  if (merged.accentColor?.trim()) payload.accentColor = merged.accentColor.trim()
  if (merged.accentGradient && merged.accentGradient.length >= 2) payload.accentGradient = merged.accentGradient
  if (merged.borderWidth !== undefined) payload.borderWidth = merged.borderWidth
  if (merged.nodeAnimation) payload.nodeAnimation = merged.nodeAnimation
  if (
    merged.nodeAnimation &&
    merged.nodeAnimationSpeed !== undefined &&
    merged.nodeAnimationSpeed !== 1
  )
    payload.nodeAnimationSpeed = merged.nodeAnimationSpeed
  return Object.keys(payload).length ? JSON.stringify(payload) : null
}

export function pageMapAnnotationFontFamilyCss(family: PageMapAnnotationFontFamily): string {
  switch (family) {
    case 'serif':
      return 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif'
    case 'mono':
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
    case 'rounded':
      return '"Segoe UI", "SF Pro Rounded", "Helvetica Neue", system-ui, sans-serif'
    default:
      return 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  }
}

/** Resolved text color for rendering (default white on map notes). */
export function resolvedPageMapAnnotationTextColor(style: PageMapAnnotationStyle): string {
  return mergePageMapAnnotationStyle(style).color
}
