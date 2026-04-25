import { GripVerticalIcon } from 'lucide-react'
import { forwardRef } from 'react'
import type { PanelSize } from 'react-resizable-panels'
import * as ResizablePrimitive from 'react-resizable-panels'

import { cn } from '@/lib/utils'

type ResizablePanelGroupProps = ResizablePrimitive.GroupProps & {
  /** @deprecated Use orientation instead. Maps to orientation for backwards compatibility. */
  direction?: 'horizontal' | 'vertical'
}

function ResizablePanelGroup({ className, direction, orientation = direction, ...props }: ResizablePanelGroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn('flex h-full w-full aria-[orientation=vertical]:flex-col', className)}
      orientation={orientation}
      {...props}
    />
  )
}

type ResizablePanelProps = Omit<ResizablePrimitive.PanelProps, 'onResize' | 'panelRef'> & {
  onResize?: (size: number) => void
  ref?: React.Ref<ResizablePrimitive.PanelImperativeHandle | null>
}

const ResizablePanel = forwardRef<ResizablePrimitive.PanelImperativeHandle | null, ResizablePanelProps>(({ onResize, ...props }, ref) => {
  const wrappedOnResize = onResize ? (size: PanelSize) => onResize(size.asPercentage) : undefined
  return <ResizablePrimitive.Panel data-slot="resizable-panel" panelRef={ref} onResize={wrappedOnResize} {...props} tabIndex={props.tabIndex ?? -1} />
})
ResizablePanel.displayName = 'ResizablePanel'

function ResizableHandle({
  withHandle,
  className,
  onPointerUp,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
}) {
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    onPointerUp?.(e)
    ;(document.activeElement as HTMLElement)?.blur?.()
  }
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      onPointerUp={handlePointerUp}
      className={cn(
        'bg-border focus-visible:ring-ring relative z-10 flex shrink-0 w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2',
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
