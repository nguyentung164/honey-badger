'use client'

import { Handle, Position } from '@xyflow/react'
import type { CSSProperties } from 'react'
import { Fragment, memo } from 'react'
import type { FlowEdgeHandleSide, FlowNodeVisualStyle } from 'shared/flowDiagramStyle'
import { effectiveAccentColor, mergeNodeVisualStyle, resolvedHandleSidesFromMerged } from 'shared/flowDiagramStyle'
import { getFlowNodeHandleRfProps } from '@/components/flow-inspector/flowNodeHandleAppearance'

const POS: Record<FlowEdgeHandleSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

/** Đặt source + target **trùng nhau** giữa mỗi cạnh → chỉ thấy một chấm mỗi phía. DOM vẫn có đủ id `t-*` / `s-*` cho edgeHandleIds. */
function stackOffset(side: FlowEdgeHandleSide, role: 'target' | 'source'): CSSProperties {
  /** Trên các node có vành orbit (`::before` z-[1]), handle phải nổi phía trên overlay. */
  const zIndex = role === 'source' ? 22 : 21
  if (side === 'top') return { left: '50%', top: 0, transform: 'translate(-50%, -50%)', zIndex }
  if (side === 'bottom') return { left: '50%', bottom: 0, transform: 'translate(-50%, 50%)', zIndex }
  if (side === 'left') return { top: '50%', left: 0, transform: 'translate(-50%, -50%)', zIndex }
  return { top: '50%', right: 0, transform: 'translate(50%, -50%)', zIndex }
}

/** Hai đến bốn cạnh × (source + target chồng nhau) — id `s-*` / `t-*` khớp `edgeHandleIds` trong shared/flowDiagramStyle. */
export const FlowNodeMultiHandles = memo(function FlowNodeMultiHandles({
  sides,
  diagramVisual,
}: {
  sides?: readonly FlowEdgeHandleSide[]
  diagramVisual?: Partial<FlowNodeVisualStyle> | null
}) {
  const merged = mergeNodeVisualStyle(diagramVisual)
  const list = sides ?? resolvedHandleSidesFromMerged(merged)
  const rf = getFlowNodeHandleRfProps(merged.handleStyle, effectiveAccentColor(merged))

  return (
    <>
      {list.map(side => (
        <Fragment key={side}>
          <Handle id={`t-${side}`} type="target" position={POS[side]} style={{ ...stackOffset(side, 'target'), ...rf.style }} className={rf.className} />
          <Handle id={`s-${side}`} type="source" position={POS[side]} style={{ ...stackOffset(side, 'source'), ...rf.style }} className={rf.className} />
        </Fragment>
      ))}
    </>
  )
})
