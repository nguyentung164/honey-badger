'use client'

import { memo, type ReactNode, useRef } from 'react'
import type { FlowNodeVisualStyle } from 'shared/flowDiagramStyle'
import { gradientToCss } from 'shared/flowDiagramStyle'
import { FlowNodeMultiHandles } from '@/components/flow-inspector/FlowNodeMultiHandles'
import {
  FLOW_NODE_SHELL_RADIUS_PX,
  resolveFlowNodeShellVisual,
  stripTailwindCardBackground,
} from '@/components/flow-inspector/flowNodeShellVisual'
import { NodeBorderOrbitSvg } from '@/components/flow-inspector/NodeBorderOrbitSvg'
import { NodeInlineRimOverlay } from '@/components/flow-inspector/NodeInlineRimOverlay'
import { cn } from '@/lib/utils'

type Props = {
  diagramVisual?: Partial<FlowNodeVisualStyle> | null
  selected?: boolean
  className?: string
  cardClassName?: string
  innerClassName?: string
  showHandles?: boolean
  accentBackground?: boolean
  suppressGradientRimUnderlay?: boolean
  interiorBackground?: 'group-card' | 'transparent'
  /** When true, node is excluded from group/flow runs — muted shell. */
  executionDisabled?: boolean
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  children: ReactNode
}

export const FlowNodeVisualShell = memo(function FlowNodeVisualShell({
  diagramVisual,
  selected = false,
  className,
  cardClassName,
  innerClassName,
  showHandles = true,
  accentBackground = true,
  suppressGradientRimUnderlay = false,
  interiorBackground = 'group-card',
  executionDisabled = false,
  onPointerEnter,
  onPointerLeave,
  children,
}: Props) {
  const v = resolveFlowNodeShellVisual(diagramVisual, {
    selected,
    accentBackground,
    suppressGradientRimUnderlay,
    interiorBackground,
  })
  const frameRef = useRef<HTMLDivElement>(null)
  const fillsParent = /\bh-full\b/.test(className ?? '')
  const rimPx = v.inlineRim?.strokePx ?? 0

  const panelHasFill = Boolean(v.panelStyle.backgroundColor || v.panelStyle.backgroundImage)
  const applyPanelOnFrame = rimPx === 0 && panelHasFill
  const shouldStripCardBg = v.stripCardBgClass || applyPanelOnFrame

  const resolvedCardClassName = shouldStripCardBg
    ? stripTailwindCardBackground(cardClassName)
    : cardClassName

  return (
    <div
      className={cn(
        'relative rounded-lg',
        className,
        executionDisabled && 'opacity-55 [&_.rf-node-frame]:border-dashed',
      )}
      style={{
        borderRadius: FLOW_NODE_SHELL_RADIUS_PX,
        ...(v.selectionBoxShadow ? { boxShadow: v.selectionBoxShadow } : undefined),
      }}
    >
      {v.borderMode === 'gradientFill' ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ borderRadius: FLOW_NODE_SHELL_RADIUS_PX, background: gradientToCss(v.accentStops) }}
        />
      ) : null}

      <div
        ref={frameRef}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        className={cn(
          'rf-node-frame relative isolate box-border rounded-lg',
          fillsParent && 'h-full w-full min-h-0',
          (rimPx > 0 || v.borderMode === 'orbit') && 'overflow-visible',
          rimPx === 0 &&
            !panelHasFill &&
            (accentBackground
              ? !v.accentHasAlpha && !suppressGradientRimUnderlay && 'bg-card/95'
              : interiorBackground === 'group-card' && 'bg-card/50'),
          rimPx === 0 && !selected && !v.inlineRim && 'shadow-sm',
          resolvedCardClassName,
        )}
        style={{
          ...v.frameStyle,
          ...(applyPanelOnFrame ? v.panelStyle : undefined),
          borderRadius: FLOW_NODE_SHELL_RADIUS_PX,
        }}
      >
        {showHandles ? <FlowNodeMultiHandles diagramVisual={diagramVisual} /> : null}

        {v.borderMode === 'orbit' && diagramVisual?.nodeAnimation && diagramVisual.nodeAnimation !== 'none' ? (
          <NodeBorderOrbitSvg
            key={`${diagramVisual.nodeAnimation}-${v.orbitBorderPx}`}
            measureRef={frameRef}
            kind={diagramVisual.nodeAnimation}
            accent={v.accentCol}
            gradient={v.accentStops}
            speed={diagramVisual.nodeAnimationSpeed ?? 1}
            borderPx={v.orbitBorderPx}
          />
        ) : null}

        {rimPx > 0 ? (
          <NodeInlineRimOverlay
            key={`${rimPx}-${v.inlineRim?.solidColor ?? 'g'}`}
            measureRef={frameRef}
            strokePx={rimPx}
            solidColor={v.inlineRim?.solidColor}
            gradientStops={v.inlineRim?.gradientStops}
            panelFill={panelHasFill ? v.panelStyle : undefined}
          />
        ) : null}

        <div
          className={cn(
            'relative z-[2] min-h-0',
            fillsParent && 'h-full w-full',
            rimPx === 0 && 'overflow-hidden rounded-lg',
            innerClassName,
          )}
          style={
            rimPx === 0 && !applyPanelOnFrame
              ? { ...v.panelStyle, borderRadius: FLOW_NODE_SHELL_RADIUS_PX }
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </div>
  )
})
