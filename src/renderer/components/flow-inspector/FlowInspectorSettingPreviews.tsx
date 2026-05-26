'use client'

import type { CSSProperties, ReactNode } from 'react'
import { memo, useEffect, useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { FlowConnectionStyle, FlowEdgeHandleSide, FlowNodeAnimationKind, FlowNodeVisualStyle, GradientStop } from 'shared/flowDiagramStyle'
import {
  connectionStrokeWidthPx,
  dashArrayForKind,
  effectiveAccentColor,
  effectiveConnectionColor,
  effectiveConnectionColorStops,
  isMultiColorGradient,
  mergeNodeVisualStyle,
  hasEdgeLabelChromeSettings,
  resolvedHandleSidesFromMerged,
} from 'shared/flowDiagramStyle'
import { FlowEdgeLabelChrome } from '@/components/flow-inspector/FlowEdgeLabelChrome'
import { FlowNodeVisualShell } from '@/components/flow-inspector/FlowNodeVisualShell'
import { FlowNodeContentLayout } from '@/components/flow-inspector/FlowNodeContentLayout'
import { FlowNodeMetadataRows } from '@/components/flow-inspector/FlowNodeMetadataRows'
import { flowNodeContentLayoutShellClasses, shouldShowInlineBadge } from '@/components/flow-inspector/flowNodeContentLayoutUi'
import { FLOW_INSPECTOR_SECTION_LABEL } from '@/components/flow-inspector/flowInspectorUi'
import {
  FlowEdgeFireflyMarkers,
  FlowEdgeQuantumHopMarker,
  FlowEdgeSpotlightSweep,
  FlowEdgeShuttleMarker,
} from '@/components/flow-inspector/flowEdgeAnimationSvg'
import { ensureFlowEdgePathAnimStyles } from '@/components/flow-inspector/flowEdgePathAnimCss'
import { FlowNodeHandleDot } from '@/components/flow-inspector/FlowNodeHandleDot'
import { resolveFlowNodeShellVisual } from '@/components/flow-inspector/flowNodeShellVisual'
import { FLOW_INSPECTOR_EDGE_PREVIEW_VB, getFlowInspectorEdgePreviewPath } from '@/components/flow-inspector/inspectorEdgePreviewLayout'
import { NodeBorderOrbitSvg } from '@/components/flow-inspector/NodeBorderOrbitSvg'
import { FlowNodeDiagramIcon } from '@/components/flow-inspector/nodeIconUtils'
import { cn } from '@/lib/utils'
import { resolveFlowNodeContentLayout } from 'shared/flowNodeContentLayout'
import { Badge } from '@/components/ui/badge'
import { Circle } from 'lucide-react'

/** Mirrors StyledFlowEdge sizing, marker spec, and animation tempo exactly. */
export function FlowEdgeSettingPreview({
  value,
  headerRight,
}: {
  value: FlowConnectionStyle
  headerRight?: ReactNode
}) {
  const { t } = useTranslation()
  const uid = useId().replace(/:/g, '')
  const { path: pathD, labelX, labelY } = getFlowInspectorEdgePreviewPath(value.curve)

  const strokeW = connectionStrokeWidthPx(value.width)
  const dashArr = value.animation === 'flow' ? undefined : dashArrayForKind(value.dash)
  const color = effectiveConnectionColor(value)
  const colorStops = effectiveConnectionColorStops(value)
  const hasColorGradient = isMultiColorGradient(colorStops)
  const gradientId = `rf-preview-edge-cg-${uid}`
  const anim = value.animation ?? 'none'
  const isNeon = anim === 'neon'
  const isShimmer = anim === 'shimmer'
  const strokeFilterNeon = isNeon ? `drop-shadow(0 0 1.5px ${color}) drop-shadow(0 0 5px ${color})` : undefined

  // Mirror StyledFlowEdge speed scaling
  const animSpeed = Math.max(0.1, value.animationSpeed ?? 1)
  const asd = (base: number) => `${(base / animSpeed).toFixed(2)}s`

  const trimmed = value.label.trim()
  const showLabel = value.labelVisible && (trimmed.length > 0 || hasEdgeLabelChromeSettings(value))
  const labelLine =
    trimmed.length > 0 ? (trimmed.length > 40 ? `${trimmed.slice(0, 37)}…` : trimmed) : t('flowInspector.label')

  useEffect(() => {
    ensureFlowEdgePathAnimStyles()
  }, [])

  const pathMarkerEnd = `url(#fm-end-${uid})`
  const pathMarkerStart = value.bidirectional ? `url(#fm-start-${uid})` : undefined

  const vb = FLOW_INSPECTOR_EDGE_PREVIEW_VB
  const viewBoxStr = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`

  // Mirror flowDiagramArrowMarkerEnd/Start: userSpaceOnUse, 28×9, ArrowClosed path
  const markerElems = (
    <>
      <marker id={`fm-end-${uid}`} markerWidth="28" markerHeight="9" viewBox="-10 -10 20 20" markerUnits="userSpaceOnUse" orient="auto" refX="0" refY="0">
        <path d="M -5 -4 L 0 0 L -5 4 Z" fill={color} />
      </marker>
      {value.bidirectional ? (
        <marker id={`fm-start-${uid}`} markerWidth="28" markerHeight="9" viewBox="-10 -10 20 20" markerUnits="userSpaceOnUse" orient="auto-start-reverse" refX="0" refY="0">
          <path d="M -5 -4 L 0 0 L -5 4 Z" fill={color} />
        </marker>
      ) : null}
    </>
  )

  const strokePaint = hasColorGradient ? `url(#${gradientId})` : color

  function MainEdgePath(extra?: { filter?: string; className?: string; style?: CSSProperties; forceColor?: string }) {
    const stroke = extra?.forceColor ?? strokePaint
    return (
      <path
        d={pathD}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashArr}
        markerEnd={pathMarkerEnd}
        markerStart={pathMarkerStart}
        className={extra?.className}
        style={extra?.filter ? { filter: extra.filter, ...extra.style } : extra?.style}
      />
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-[18px] items-center justify-between gap-2">
        <div className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.preview')}</div>
        {headerRight ? <div className="flex shrink-0 items-center justify-end">{headerRight}</div> : null}
      </div>
      <div
        className={cn(
          'rounded-lg border border-border/70 bg-muted/15 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--border)_85%,transparent)]',
          'bg-[linear-gradient(color-mix(in_srgb,var(--muted)_42%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_srgb,var(--muted)_42%,transparent)_1px,transparent_1px)] bg-size-[12px_12px]'
        )}
        role="img"
        aria-label={t('flowInspector.preview')}
      >
        <div className="relative px-2 py-2">
          <svg viewBox={viewBoxStr} className="block h-[112px] w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
            <defs>
              {markerElems}
              {hasColorGradient ? (
                <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="82" y1="48" x2="202" y2="12">
                  {colorStops.map((s, i) => (
                    <stop key={i} offset={`${s.position}%`} stopColor={s.color} />
                  ))}
                </linearGradient>
              ) : null}
              {anim === 'neon' ? (
                <filter id={`rf-preview-neon-rect-${uid}`} x="-150%" y="-150%" width="400%" height="400%">
                  <feGaussianBlur stdDeviation="1.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              ) : null}
            </defs>

            {anim === 'neon' ? (
              <>
                <path d={pathD} fill="none" stroke={color} strokeWidth={strokeW * 6} strokeLinecap="round" strokeLinejoin="round" opacity={0.04} />
                <path d={pathD} fill="none" stroke={color} strokeWidth={strokeW * 3} strokeLinecap="round" strokeLinejoin="round" opacity={0.13} />
                <path d={pathD} fill="none" stroke={color} strokeWidth={strokeW * 1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.42} />
                <rect
                  x={-(strokeW * 3 + 3) / 2}
                  y={-(strokeW + 0.25) / 2}
                  width={strokeW * 3 + 3}
                  height={strokeW + 0.25}
                  rx={(strokeW + 0.25) / 4}
                  fill={color}
                  opacity={0.88}
                  filter={`url(#rf-preview-neon-rect-${uid})`}
                >
                  <animateMotion dur={asd(1.8)} begin="0s" repeatCount="indefinite" path={pathD} rotate="auto" />
                </rect>
                <rect
                  x={-(strokeW * 3 + 3) / 2}
                  y={-(strokeW + 0.25) / 2}
                  width={strokeW * 3 + 3}
                  height={strokeW + 0.25}
                  rx={(strokeW + 0.25) / 4}
                  fill={color}
                  opacity={0.88}
                  filter={`url(#rf-preview-neon-rect-${uid})`}
                >
                  <animateMotion dur={asd(1.8)} begin={`${(-0.9 / animSpeed).toFixed(2)}s`} repeatCount="indefinite" path={pathD} rotate="auto" />
                </rect>
                <MainEdgePath filter={strokeFilterNeon} />
              </>
            ) : null}

            {(anim === 'none' || anim === 'flow' || anim === 'shimmer') && !isNeon ? (
              <MainEdgePath
                className={anim === 'flow' ? 'rf-anim-flow' : undefined}
                style={{
                  ...(anim === 'flow' && animSpeed !== 1 ? { animationDuration: asd(0.5) } : {}),
                  ...(isShimmer ? { strokeOpacity: 0.28 } : {}),
                }}
              />
            ) : null}

            {isShimmer ? (
              <FlowEdgeSpotlightSweep path={pathD} stroke={strokePaint} color={color} strokeW={strokeW} animSpeed={animSpeed} />
            ) : null}

            {anim === 'dot' ? (
              <>
                <MainEdgePath />
                <rect x={-(strokeW * 3 + 3) / 2} y={-(strokeW + 0.25) / 2} width={strokeW * 3 + 3} height={strokeW + 0.25} rx={(strokeW + 0.25) / 4} fill={color} opacity={0.9}>
                  <animateMotion dur={asd(1.6)} repeatCount="indefinite" path={pathD} rotate="auto" />
                </rect>
              </>
            ) : null}

            {anim === 'arcSparks' ? (
              <>
                <MainEdgePath />
                {[0, -0.4, -0.8].map((begin, i) => (
                  <circle key={i} r={Math.max(2, strokeW * 0.45)} fill={color} opacity={0.95}>
                    <animateMotion dur={asd(1.5)} begin={`${(begin / animSpeed).toFixed(2)}s`} repeatCount="indefinite" path={pathD} />
                    <animate attributeName="opacity" values="0.15;1;0.15" dur={asd(0.45)} repeatCount="indefinite" begin={`${(begin / animSpeed).toFixed(2)}s`} />
                  </circle>
                ))}
              </>
            ) : null}

            {anim === 'shuttle' ? (
              <>
                <MainEdgePath />
                <FlowEdgeShuttleMarker path={pathD} color={color} strokeW={strokeW} animSpeed={animSpeed} />
              </>
            ) : null}

            {anim === 'serpent' ? (
              <>
                <MainEdgePath />
                <FlowEdgeQuantumHopMarker path={pathD} color={color} strokeW={strokeW} animSpeed={animSpeed} />
              </>
            ) : null}

            {anim === 'firefly' ? (
              <>
                <MainEdgePath />
                <FlowEdgeFireflyMarkers path={pathD} color={color} strokeW={strokeW} animSpeed={animSpeed} />
              </>
            ) : null}
          </svg>

          {showLabel ? (
            <div
              className="pointer-events-none absolute z-[1]"
              style={{
                left: `${((labelX - vb.x) / vb.w) * 100}%`,
                top: `${((labelY - vb.y) / vb.h) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <FlowEdgeLabelChrome connectionStyle={value} preview>
                {labelLine}
              </FlowEdgeLabelChrome>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const NODE_ANIM_PREVIEW_RX = 6

/** Mini preview tiles — same renderer as map nodes (accent + gradient). */
export function FlowNodeBorderAnimPreviewSvg({
  kind,
  accent,
  gradient,
  speed = 1,
  borderPx,
}: {
  kind: FlowNodeAnimationKind
  accent: string
  gradient?: GradientStop[]
  speed?: number
  borderPx?: number
}) {
  const orbitPx = borderPx ?? resolveFlowNodeShellVisual({ accentColor: accent, accentGradient: gradient }).orbitBorderPx
  return (
    <div className="relative mx-auto h-7 w-[58px] shrink-0" aria-hidden>
      <NodeBorderOrbitSvg kind={kind} accent={accent} gradient={gradient} speed={speed} borderPx={orbitPx} rx={NODE_ANIM_PREVIEW_RX} />
    </div>
  )
}

/** Khớp node React Flow qua `FlowNodeVisualShell` — accent, viền, animation, handles. */
export const FlowNodeSettingPreview = memo(function FlowNodeSettingPreview({
  value,
  displayName,
  headerRight,
  accentBackground = true,
  layoutContext = 'catalogPage',
}: {
  value: FlowNodeVisualStyle
  displayName?: string
  /** e.g. reset control — aligned end on the Preview label row */
  headerRight?: ReactNode
  /** Catalog groups: accent tints the frame border only (matches {@link CatalogGroupNode}). */
  accentBackground?: boolean
  layoutContext?: 'catalogPage' | 'pipelineStep'
}) {
  const { t } = useTranslation()
  const accentCol = effectiveAccentColor(value)
  const shell = resolveFlowNodeShellVisual(value, { selected: false, accentBackground })

  const merged = mergeNodeVisualStyle(value)
  const handleSides = resolvedHandleSidesFromMerged(merged)

  const HANDLE_CUE_POSE: Record<FlowEdgeHandleSide, string> = {
    top: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2',
    right: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
    bottom: 'bottom-0 left-1/2 translate-y-1/2 -translate-x-1/2',
    left: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
  }

  function MagnetCue({ side }: { side: FlowEdgeHandleSide }) {
    return (
      <span className={cn('pointer-events-none absolute z-10 flex items-center justify-center', HANDLE_CUE_POSE[side])} aria-hidden>
        <FlowNodeHandleDot kind={merged.handleStyle} accentColor={accentCol} />
      </span>
    )
  }

  const dnTrim = displayName?.trim()
  const hasName = Boolean(dnTrim)
  let nameLine = t('flowInspector.iconPlaceholder')
  if (dnTrim && dnTrim.length > 0) nameLine = dnTrim.length > 36 ? `${dnTrim.slice(0, 33)}…` : dnTrim

  const contentLayout = resolveFlowNodeContentLayout(value, layoutContext)
  const shellClasses = flowNodeContentLayoutShellClasses(contentLayout.contentLayout, contentLayout.contentDensity)
  const showBadge = shouldShowInlineBadge(contentLayout.contentLayout)
  const previewSubtitle =
    layoutContext === 'pipelineStep' ? t('flowInspector.previewSubtitle') : undefined
  const previewMeta =
    contentLayout.metadataMode !== 'hidden' || contentLayout.contentLayout === 'metadata' ? (
      <FlowNodeMetadataRows
        rows={[
          {
            label: layoutContext === 'pipelineStep' ? t('flowInspector.pipelineMetaKind') : t('automation.pageMap.nodePanelRowTests'),
            value: layoutContext === 'pipelineStep' ? 'shell' : '12',
          },
        ]}
      />
    ) : undefined

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-[18px] items-center justify-between gap-2">
        <div className={FLOW_INSPECTOR_SECTION_LABEL}>{t('flowInspector.preview')}</div>
        {headerRight ? <div className="flex shrink-0 items-center justify-end">{headerRight}</div> : null}
      </div>
      <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5 shadow-inner" role="img" aria-label={t('flowInspector.preview')}>
        <div className="flex h-[112px] w-full flex-col items-center justify-center py-1">
          <div className="relative mx-auto min-w-[188px] max-w-[284px] shrink-0">
            {(value.showConnectionHandles !== false ? handleSides : []).map(side => (
              <MagnetCue key={side} side={side} />
            ))}
            <FlowNodeVisualShell
              diagramVisual={value}
              selected={false}
              showHandles={false}
              accentBackground={accentBackground}
              cardClassName={cn(shellClasses.cardClassName, 'min-h-[56px] min-w-0', !accentBackground && 'bg-card/50')}
              innerClassName={shellClasses.innerClassName}
            >
              <FlowNodeContentLayout
                layout={contentLayout.contentLayout}
                density={contentLayout.contentDensity}
                metadataMode={contentLayout.metadataMode}
                context={layoutContext}
                metadataExpanded={contentLayout.metadataMode === 'toggle'}
                slots={{
                  icon: value.iconKey ? (
                    <FlowNodeDiagramIcon iconKey={value.iconKey} className="size-4" style={{ color: shell.iconColor } satisfies CSSProperties} />
                  ) : undefined,
                  title: <span className={cn(hasName ? 'text-foreground' : 'text-muted-foreground')}>{nameLine}</span>,
                  subtitle: previewSubtitle,
                  statusIcon: layoutContext === 'pipelineStep' ? <Circle className="size-4 text-muted-foreground/60" aria-hidden /> : undefined,
                  statusBadge: showBadge ? (
                    <Badge variant="outline" className="h-4 px-1.5 text-[8px] uppercase">
                      {t('flowInspector.previewStatus')}
                    </Badge>
                  ) : undefined,
                  metadata: previewMeta,
                }}
              />
            </FlowNodeVisualShell>
          </div>
        </div>
      </div>
    </div>
  )
})
