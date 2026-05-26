import type { CSSProperties } from 'react'
import type { FlowNodeVisualStyle, GradientStop } from 'shared/flowDiagramStyle'
import {
  effectiveAccentColor,
  effectiveAccentStops,
  gradientToCss,
  isMultiColorGradient,
  mergeNodeVisualStyle,
  nodeOrbitBorderPxFromWidth,
  nodeStaticBorderWidthPx,
} from 'shared/flowDiagramStyle'
import { flowColorCss, flowColorHasAlpha } from 'shared/flowColor'
import { NODE_SELECTION_BOX_SHADOW } from '@/components/flow-inspector/nodeSelectionGlow'

export type FlowNodeShellBorderMode = 'orbit' | 'solid' | 'gradientRing' | 'gradientFill' | 'none'

export const FLOW_NODE_SHELL_RADIUS_PX = 8

export type FlowNodeInlineRim = {
  strokePx: number
  solidColor?: string
  gradientStops?: GradientStop[]
}

export type ResolvedFlowNodeShellVisual = {
  accentCol: string
  accentStops: GradientStop[]
  iconColor: string
  hasAccent: boolean
  hasGradientBorder: boolean
  borderMode: FlowNodeShellBorderMode
  accentHasAlpha: boolean
  staticBorderWidthPx: number
  orbitBorderPx: number
  shellBorderColor: string
  /** Inline SVG rim on the card border box — does not change layout size. */
  inlineRim: FlowNodeInlineRim | null
  frameStyle: CSSProperties
  panelStyle: CSSProperties
  stripCardBgClass: boolean
  selectionBoxShadow: string | undefined
}

type DiagramVisualInput = Partial<FlowNodeVisualStyle> | null | undefined

const THEME_CARD = 'var(--card)'
const GROUP_CARD_SEMI = 'color-mix(in oklab, var(--card) 50%, transparent)'

function accentInteriorSolid(accentCol: string, strengthPercent: number): string {
  return `color-mix(in oklab, ${accentCol} ${strengthPercent}%, ${THEME_CARD})`
}

function accentInteriorGradient(stops: GradientStop[], strengthPercent: number): string {
  const a = stops[0]?.color ?? '#94a3b8'
  const b = stops[stops.length - 1]?.color ?? a
  const tail = Math.max(8, Math.round(strengthPercent * 0.65))
  return `linear-gradient(145deg, color-mix(in oklab, ${a} ${strengthPercent}%, ${THEME_CARD}), color-mix(in oklab, ${b} ${tail}%, ${THEME_CARD}))`
}

function resolveBorderMode(input: {
  hasOrbitAnimation: boolean
  presetBorderPx: number
  hasGradientBorder: boolean
  accentBackground: boolean
  suppressGradientRimUnderlay?: boolean
}): FlowNodeShellBorderMode {
  if (input.hasOrbitAnimation) return 'orbit'
  if (input.presetBorderPx <= 0) {
    if (
      input.hasGradientBorder &&
      !input.accentBackground &&
      !input.suppressGradientRimUnderlay
    ) {
      return 'gradientFill'
    }
    return 'none'
  }
  if (input.hasGradientBorder) return 'gradientRing'
  return 'solid'
}

function applyPanelInterior(target: CSSProperties, fill: string, asGradient: boolean) {
  if (asGradient) target.backgroundImage = fill
  else target.backgroundColor = fill
}

export function stripTailwindCardBackground(className?: string): string {
  if (!className) return ''
  return className
    .replace(/\bbg-card(?:\/\d+)?\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function flowNodePanelRadiusPx(rimStrokePx: number): number {
  return Math.max(0, FLOW_NODE_SHELL_RADIUS_PX - rimStrokePx)
}

export function resolveFlowNodeShellVisual(
  diagramVisual: DiagramVisualInput,
  options?: {
    selected?: boolean
    accentBackground?: boolean
    suppressGradientRimUnderlay?: boolean
    /** When `accentBackground` is false: group uses semi card; notes stay transparent. */
    interiorBackground?: 'group-card' | 'transparent'
  },
): ResolvedFlowNodeShellVisual {
  const selected = options?.selected ?? false
  const accentBackground = options?.accentBackground !== false
  const interiorBackground = options?.interiorBackground ?? 'group-card'
  const directAccentFill = options?.suppressGradientRimUnderlay === true
  const style = mergeNodeVisualStyle(diagramVisual)
  const accentStops = effectiveAccentStops(style)
  const accentCol = flowColorCss(effectiveAccentColor(style), effectiveAccentColor(style))
  const accentHasAlpha =
    flowColorHasAlpha(style.accentColor) ||
    Boolean(style.accentGradient?.some(stop => flowColorHasAlpha(stop.color)))
  const hasAccent = Boolean(style.accentColor || style.accentGradient)
  const hasGradientBorder = hasAccent && isMultiColorGradient(accentStops)
  const hasOrbitAnimation = Boolean(style.nodeAnimation && style.nodeAnimation !== 'none')
  const presetBorderPx = nodeStaticBorderWidthPx(style.borderWidth, hasAccent)

  const borderMode = resolveBorderMode({
    hasOrbitAnimation,
    presetBorderPx,
    hasGradientBorder,
    accentBackground,
    suppressGradientRimUnderlay: options?.suppressGradientRimUnderlay,
  })

  const staticBorderWidthPx =
    borderMode === 'solid' || borderMode === 'gradientRing' ? presetBorderPx : 0
  const orbitBorderPx = borderMode === 'orbit' ? nodeOrbitBorderPxFromWidth(style.borderWidth) : 0
  const shellBorderColor = accentCol

  let inlineRim: FlowNodeInlineRim | null = null
  if (staticBorderWidthPx > 0) {
    inlineRim =
      borderMode === 'gradientRing'
        ? { strokePx: staticBorderWidthPx, gradientStops: accentStops }
        : { strokePx: staticBorderWidthPx, solidColor: shellBorderColor }
  }

  const stripCardBgClass = Boolean(inlineRim)

  const frameStyle: CSSProperties = {
    boxSizing: 'border-box',
    '--rf-node-accent-solid': accentCol,
    '--rf-node-accent': `${accentCol}55`,
  } as CSSProperties

  const panelStyle: CSSProperties = {}

  const applyGroupCardFill = () => {
    if (!accentBackground && interiorBackground === 'group-card') {
      panelStyle.backgroundColor = GROUP_CARD_SEMI
    }
  }

  const applyNodeInteriorFromAccent = () => {
    if (!accentBackground || !hasAccent) return
    if (directAccentFill) {
      if (hasGradientBorder) applyPanelInterior(panelStyle, gradientToCss(accentStops), true)
      else panelStyle.backgroundColor = accentCol
      return
    }
    if (hasGradientBorder) {
      applyPanelInterior(panelStyle, accentInteriorGradient(accentStops, 24), true)
    } else if (accentHasAlpha) {
      panelStyle.backgroundColor = accentCol
    } else {
      panelStyle.backgroundColor = accentInteriorSolid(accentCol, 24)
    }
  }

  if (borderMode === 'solid' || borderMode === 'gradientRing') {
    if (accentBackground) {
      if (directAccentFill) {
        if (hasGradientBorder) applyPanelInterior(panelStyle, gradientToCss(accentStops), true)
        else panelStyle.backgroundColor = accentCol
      } else if (hasGradientBorder) {
        applyPanelInterior(panelStyle, accentInteriorGradient(accentStops, 24), true)
      } else if (accentHasAlpha) {
        panelStyle.backgroundColor = accentCol
      } else {
        panelStyle.backgroundColor = accentInteriorSolid(accentCol, 24)
      }
    } else if (interiorBackground === 'group-card') {
      panelStyle.backgroundColor = GROUP_CARD_SEMI
    }
  } else if (borderMode === 'none') {
    applyNodeInteriorFromAccent()
    applyGroupCardFill()
  } else {
    applyNodeInteriorFromAccent()
    applyGroupCardFill()
  }

  return {
    accentCol,
    accentStops,
    iconColor: flowColorCss(style.iconColor ?? accentCol, accentCol),
    hasAccent,
    hasGradientBorder,
    borderMode,
    accentHasAlpha,
    staticBorderWidthPx,
    orbitBorderPx,
    shellBorderColor,
    inlineRim,
    frameStyle,
    panelStyle,
    stripCardBgClass,
    selectionBoxShadow: selected ? NODE_SELECTION_BOX_SHADOW : undefined,
  }
}
