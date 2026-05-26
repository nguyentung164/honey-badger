'use client'

import { BaseEdge, EdgeLabelRenderer, type EdgeProps, useReactFlow, useStore } from '@xyflow/react'
import { Settings2, Trash2 } from 'lucide-react'
import type { CSSProperties } from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FlowConnectionStyle } from 'shared/flowDiagramStyle'
import { FLOW_EDGE_LABEL_TOOLBAR_Z_INDEX, FLOW_EDGE_LABEL_Z_INDEX } from 'shared/flowCanvasDefaults'
import { connectionStrokeWidthPx, dashArrayForKind, isMultiColorGradient, mergeConnectionStyle } from 'shared/flowDiagramStyle'
import { useFlowCanvasAnyNodeSelected } from '@/components/flow-inspector/FlowCanvasNodeSelectionContext'
import { useFlowEdgeActions } from '@/components/flow-inspector/FlowEdgeActionsContext'
import { FlowEdgeLabelChrome } from '@/components/flow-inspector/FlowEdgeLabelChrome'
import { getFlowEdgePath } from '@/components/flow-inspector/flowEdgeGeometry'
import {
  FlowEdgeFireflyMarkers,
  FlowEdgeQuantumHopMarker,
  FlowEdgeSpotlightSweep,
  FlowEdgeShuttleMarker,
} from '@/components/flow-inspector/flowEdgeAnimationSvg'
import { ensureFlowEdgePathAnimStyles } from '@/components/flow-inspector/flowEdgePathAnimCss'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type StyledFlowEdgeData = {
  connectionStyle?: Partial<FlowConnectionStyle>
  label?: string
  /** When true, render an animated dot traveling along the path. */
  animateDot?: boolean
  /** Dev Pipelines — when this edge is traversable. */
  condition?: 'always' | 'on-success' | 'on-failure'
}

/** Debounce ẩn toolbar khi rời edge — giống node map (NODE_TOOLBAR_HOVER_LEAVE_MS). */
const EDGE_TOOLBAR_HOVER_LEAVE_MS = 200

/** Khoảng hở giữa cạnh dưới nhãn và cạnh trên toolbar (theo không gian màn hình; chia zoom vì nhãn nằm trong hệ tọa độ pane, toolbar có scale 1/zoom). */
const EDGE_LABEL_TOOLBAR_GAP_SCREEN_PX = 8

/** Nửa chiều cao badge nhãn (text 10px + padding) ~ theo không gian màn hình. */
const EDGE_LABEL_BADGE_VERTICAL_HALF_SCREEN_PX = 8

/**
 * Ước lượng nửa chiều cao toolbar khi đã áp counter-scale zoom (đủ chỗ chứa một hàng nút icon).
 * Toolbar có `scale(1/zoom)` nên chia `zoom` khi đổi offset sang toạ độ pane.
 */
const EDGE_TOOLBAR_VERTICAL_HALF_SCREEN_PX = 22

ensureFlowEdgePathAnimStyles()

// ---------------------------------------------------------------------------

export const StyledFlowEdge = memo(function StyledFlowEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, markerStart, style: propStyle, data } = props
  const d = (data ?? {}) as StyledFlowEdgeData
  const cs = mergeConnectionStyle(d.connectionStyle)
  const actions = useFlowEdgeActions()
  const { deleteElements } = useReactFlow()
  /** Chỉ đăng ký zoom (transform[2]); không dùng useViewport() để tránh cập nhật mỗi lần pan (x/y). */
  const zoom = Math.max(
    useStore(s => s.transform[2]),
    0.05
  )
  /** Từ provider — tránh N edge × useStore(nodes.some…) */
  const anyNodeSelected = useFlowCanvasAnyNodeSelected()

  const [toolbarHover, setToolbarHover] = useState(false)
  const toolbarHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToolbar = useCallback(() => {
    if (toolbarHideTimer.current) {
      clearTimeout(toolbarHideTimer.current)
      toolbarHideTimer.current = null
    }
    setToolbarHover(true)
  }, [])

  const hideToolbarSoon = useCallback(() => {
    if (toolbarHideTimer.current) clearTimeout(toolbarHideTimer.current)
    toolbarHideTimer.current = setTimeout(() => {
      toolbarHideTimer.current = null
      setToolbarHover(false)
    }, EDGE_TOOLBAR_HOVER_LEAVE_MS)
  }, [])

  useEffect(
    () => () => {
      if (toolbarHideTimer.current) clearTimeout(toolbarHideTimer.current)
    },
    []
  )

  useEffect(() => {
    if (anyNodeSelected) setToolbarHover(false)
  }, [anyNodeSelected])

  /** Hover edge (giống node); ẩn khi có node đang được chọn trên canvas. */
  const showActionPill = toolbarHover && !anyNodeSelected

  const { path, labelX, labelY } = useMemo(
    () =>
      getFlowEdgePath(cs.curve, {
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
      }),
    [cs.curve, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition]
  )

  const strokeColor = (propStyle && (propStyle as CSSProperties).stroke) ?? cs.color
  const strokeWidth = (propStyle && (propStyle as CSSProperties).strokeWidth) ?? connectionStrokeWidthPx(cs.width)

  // 'flow' animation overrides dash pattern with its own via CSS class
  const dash = cs.animation === 'flow' ? undefined : ((propStyle && (propStyle as CSSProperties).strokeDasharray) ?? dashArrayForKind(cs.dash))

  const labelVerticalOffsetPy = showActionPill ? (EDGE_TOOLBAR_VERTICAL_HALF_SCREEN_PX + EDGE_LABEL_BADGE_VERTICAL_HALF_SCREEN_PX + EDGE_LABEL_TOOLBAR_GAP_SCREEN_PX) / zoom : 0

  const isNeon = cs.animation === 'neon'
  const isShimmer = cs.animation === 'shimmer'
  const animSpeed = Math.max(0.1, cs.animationSpeed ?? 1)
  const animClassName = cs.animation === 'flow' ? 'rf-anim-flow' : undefined
  /** Scale a base duration (seconds) by animSpeed. */
  const asd = (base: number) => `${(base / animSpeed).toFixed(2)}s`

  const hasColorGradient = cs.colorGradient != null && isMultiColorGradient(cs.colorGradient)
  // Sanitize ID: SVG/CSS url(#id) requires no spaces or special chars in the ID
  const colorGradientId = `rf-edge-cg-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`

  const solidStroke = typeof strokeColor === 'string' || typeof strokeColor === 'number' ? strokeColor : cs.color
  const condition = d.condition ?? 'always'
  const conditionStroke = condition === 'on-failure' ? 'hsl(var(--destructive))' : solidStroke
  const effectiveStroke: string = hasColorGradient ? `url(#${colorGradientId})` : conditionStroke

  const edgeStyle: CSSProperties = {
    ...((propStyle as CSSProperties) ?? {}),
    stroke: effectiveStroke,
    strokeWidth: typeof strokeWidth === 'number' || typeof strokeWidth === 'string' ? strokeWidth : connectionStrokeWidthPx(cs.width),
    strokeDasharray: condition === 'on-failure' ? dash ?? '6 4' : dash,
    ...(isShimmer ? { strokeOpacity: 0.28 } : {}),
    // Override CSS-class animation duration for 'flow' when speed ≠ 1
    ...(cs.animation === 'flow' && animSpeed !== 1 ? { animationDuration: asd(0.5) } : {}),
  }

  /** Neon: giữ màu cạnh rõ — glow quanh stroke + lớp halo SVG, không dùng stroke trắng. */
  const neonEdgeStyle: CSSProperties | undefined = isNeon
    ? {
      ...edgeStyle,
      stroke: effectiveStroke,
      strokeWidth: connectionStrokeWidthPx(cs.width),
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      filter: `drop-shadow(0 0 1.5px ${cs.color}) drop-shadow(0 0 5px ${cs.color})`,
      strokeDasharray: dash,
    }
    : undefined

  const strokeW = connectionStrokeWidthPx(cs.width)

  const text = cs.labelVisible ? (d.label ?? cs.label)?.trim() : ''
  const showLabel = Boolean(text)

  const showDotAnim = cs.animation === 'dot' || d.animateDot

  return (
    <>
      {/* ── Color gradient defs — must be in SVG before the path that references it ── */}
      {hasColorGradient ? (
        <defs>
          <linearGradient
            id={colorGradientId}
            gradientUnits="userSpaceOnUse"
            x1={sourceX}
            y1={sourceY}
            x2={targetX}
            y2={targetY}
          >
            {(cs.colorGradient ?? []).map((s, i) => (
              <stop key={i} offset={`${s.position}%`} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>
      ) : null}

      {/* ── Neon glow layers — rendered BEFORE BaseEdge (SVG z-order = behind) ── */}
      {isNeon ? (
        <>
          <defs>
            <filter id={`rf-neon-dot-${id}`} x="-150%" y="-150%" width="400%" height="400%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* outer halo */}
          <path d={path} fill="none" stroke={cs.color} strokeWidth={strokeW * 6} strokeLinecap="round" strokeLinejoin="round" opacity={0.04} />
          {/* mid glow */}
          <path d={path} fill="none" stroke={cs.color} strokeWidth={strokeW * 3} strokeLinecap="round" strokeLinejoin="round" opacity={0.13} />
          {/* inner glow */}
          <path d={path} fill="none" stroke={cs.color} strokeWidth={strokeW * 1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.42} />
          {/* signal rect 1 — cùng màu cạnh, blur tạo “tia neon” thay vì khối trắng */}
          <rect
            x={-(strokeW * 3 + 3) / 2}
            y={-(strokeW + 0.25) / 2}
            width={strokeW * 3 + 3}
            height={strokeW + 0.25}
            rx={(strokeW + 0.25) / 4}
            fill={cs.color}
            opacity="0.88"
            filter={`url(#rf-neon-dot-${id})`}
          >
            <animateMotion dur={asd(1.8)} begin="0s" repeatCount="indefinite" path={path} rotate="auto" />
          </rect>
          {/* signal rect 2 — offset by half cycle */}
          <rect
            x={-(strokeW * 3 + 3) / 2}
            y={-(strokeW + 0.25) / 2}
            width={strokeW * 3 + 3}
            height={strokeW + 0.25}
            rx={(strokeW + 0.25) / 4}
            fill={cs.color}
            opacity="0.88"
            filter={`url(#rf-neon-dot-${id})`}
          >
            <animateMotion dur={asd(1.8)} begin={`${(-0.9 / animSpeed).toFixed(2)}s`} repeatCount="indefinite" path={path} rotate="auto" />
          </rect>
        </>
      ) : null}

      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={neonEdgeStyle ?? edgeStyle}
        className={animClassName}
        interactionWidth={26}
        onMouseEnter={showToolbar}
        onMouseLeave={hideToolbarSoon}
      />

      {/* biome-ignore lint/a11y/noStaticElementInteractions: transparent SVG hit-area for hover relay — not focusable, no keyboard role needed */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={26}
        style={{ pointerEvents: 'stroke', cursor: 'default' }}
        onMouseEnter={showToolbar}
        onMouseLeave={hideToolbarSoon}
      />

      {/* Animations that travel along path */}
      {showDotAnim ? (
        /* dot — rect aligned to path direction */
        <rect x={-(strokeW * 3 + 3) / 2} y={-(strokeW + 0.25) / 2} width={strokeW * 3 + 3} height={strokeW + 0.25} rx={(strokeW + 0.25) / 4} fill={cs.color} opacity="0.9">
          <animateMotion dur={asd(1.6)} repeatCount="indefinite" path={path} rotate="auto" />
        </rect>
      ) : null}

      {/* Arc sparks — strobing dots */}
      {cs.animation === 'arcSparks' ? (
        [0, -0.4, -0.8].map((begin, i) => (
            <circle key={i} r={Math.max(2, strokeW * 0.45)} fill={cs.color} opacity={0.95}>
              <animateMotion dur={asd(1.5)} begin={`${(begin / animSpeed).toFixed(2)}s`} repeatCount="indefinite" path={path} />
              <animate attributeName="opacity" values="0.15;1;0.15" dur={asd(0.45)} repeatCount="indefinite" begin={`${(begin / animSpeed).toFixed(2)}s`} />
            </circle>
          ))
      ) : null}

      {cs.animation === 'shuttle' ? (
        <FlowEdgeShuttleMarker path={path} color={cs.color} strokeW={strokeW} animSpeed={animSpeed} />
      ) : null}

      {isShimmer ? (
        <FlowEdgeSpotlightSweep path={path} stroke={effectiveStroke} color={cs.color} strokeW={strokeW} animSpeed={animSpeed} />
      ) : null}

      {cs.animation === 'serpent' ? (
        <FlowEdgeQuantumHopMarker path={path} color={cs.color} strokeW={strokeW} animSpeed={animSpeed} />
      ) : null}

      {cs.animation === 'firefly' ? (
        <FlowEdgeFireflyMarkers path={path} color={cs.color} strokeW={strokeW} animSpeed={animSpeed} />
      ) : null}

      <EdgeLabelRenderer>
        {/* Label */}
        {showLabel ? (
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - labelVerticalOffsetPy}px)`,
              zIndex: FLOW_EDGE_LABEL_Z_INDEX,
            }}
            onPointerEnter={showToolbar}
            onPointerLeave={hideToolbarSoon}
            className={cn('nodrag nopan pointer-events-auto absolute', showActionPill && 'pointer-events-none')}
          >
            <FlowEdgeLabelChrome connectionStyle={cs}>{text}</FlowEdgeLabelChrome>
          </div>
        ) : null}

        <div
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, zIndex: FLOW_EDGE_LABEL_Z_INDEX }}
          onPointerEnter={showToolbar}
          onPointerLeave={hideToolbarSoon}
          className="nodrag nopan pointer-events-auto absolute h-8 w-14"
          aria-hidden
        />

        {/* Action pill — hiện khi hover (Path interaction + label/toolbar); counter-scale theo zoom như NodeToolbar. */}
        {showActionPill ? (
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px) scale(${1 / zoom})`,
              zIndex: FLOW_EDGE_LABEL_TOOLBAR_Z_INDEX,
            }}
            onPointerEnter={showToolbar}
            onPointerLeave={hideToolbarSoon}
            className="nodrag nopan pointer-events-auto absolute flex items-center gap-0.5 rounded-lg bg-popover px-1 py-0.5 text-popover-foreground shadow-lg backdrop-blur-md dark:shadow-black/50"
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title="Properties"
              className="nodrag nopan size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation()
                actions?.openInspector(id)
              }}
            >
              <Settings2 className="size-3.5" aria-hidden />
            </Button>
            <div className="h-3.5 w-px shrink-0 bg-border" aria-hidden />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title="Delete"
              className="nodrag nopan size-7 text-destructive hover:bg-destructive/15 hover:text-destructive"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation()
                void deleteElements({ edges: [{ id }] })
              }}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          </div>
        ) : null}
      </EdgeLabelRenderer>
    </>
  )
})
