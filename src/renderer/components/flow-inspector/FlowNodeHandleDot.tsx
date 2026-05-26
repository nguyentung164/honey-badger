import type { FlowNodeHandleStyleKind } from 'shared/flowDiagramStyle'
import { cn } from '@/lib/utils'
import { getFlowNodeHandleRfProps } from '@/components/flow-inspector/flowNodeHandleAppearance'

/** Decorative handle dot (inspector preview) — same DOM look as map handles. */
export function FlowNodeHandleDot({
  kind,
  accentColor,
  className,
}: {
  kind?: FlowNodeHandleStyleKind
  accentColor?: string
  className?: string
}) {
  const rf = getFlowNodeHandleRfProps(kind, accentColor)
  return <span className={cn(rf.className, className)} style={rf.style} />
}
