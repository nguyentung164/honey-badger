import { GripVerticalIcon } from 'lucide-react'
import { forwardRef } from 'react'
import type { PanelSize } from 'react-resizable-panels'
import * as ResizablePrimitive from 'react-resizable-panels'

import { cn } from '@/lib/utils'

/** Library hit padding around the separator element (measured box should stay ~0 — see ResizableHandle). */
const DEFAULT_RESIZE_TARGET_MINIMUM_SIZE = { fine: 8, coarse: 20 } as const

/** Visual/interactive grip thickness; keep in sync with `DEFAULT_RESIZE_TARGET_MINIMUM_SIZE.fine`. */
const RESIZE_GRIP_SIZE_PX = DEFAULT_RESIZE_TARGET_MINIMUM_SIZE.fine

/** @deprecated Prefer `showGrip={false}` — keeps cursor while hiding grip visuals. */
const INVISIBLE_RESIZE_HANDLE_CLASS = 'bg-transparent'

type ResizablePanelGroupProps = ResizablePrimitive.GroupProps & {
  /** @deprecated Use orientation instead. Maps to orientation for backwards compatibility. */
  direction?: 'horizontal' | 'vertical'
}

function ResizablePanelGroup({
  className,
  direction,
  orientation = direction,
  disableCursor = true,
  resizeTargetMinimumSize = DEFAULT_RESIZE_TARGET_MINIMUM_SIZE,
  ...props
}: ResizablePanelGroupProps) {
  return (
    <ResizablePrimitive.Group
      // react-resizable-panels caches resizeTargetMinimumSize in a ref on first mount only.
      key={`resize-target-${resizeTargetMinimumSize.fine}-${resizeTargetMinimumSize.coarse}`}
      data-slot="resizable-panel-group"
      className={cn('flex h-full w-full aria-[orientation=vertical]:flex-col', className)}
      orientation={orientation}
      disableCursor={disableCursor}
      resizeTargetMinimumSize={resizeTargetMinimumSize}
      {...props}
    />
  )
}

type ResizablePanelProps = Omit<ResizablePrimitive.PanelProps, 'onResize' | 'panelRef'> & {
  onResize?: (size: number) => void
  ref?: React.Ref<ResizablePrimitive.PanelImperativeHandle | null>
}

const ResizablePanel = forwardRef<ResizablePrimitive.PanelImperativeHandle | null, ResizablePanelProps>(({ className, onResize, ...props }, ref) => {
  const wrappedOnResize = onResize ? (size: PanelSize) => onResize(size.asPercentage) : undefined
  return (
    <ResizablePrimitive.Panel
      data-slot="resizable-panel"
      panelRef={ref}
      onResize={wrappedOnResize}
      className={cn('outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0', className)}
      {...props}
      tabIndex={props.tabIndex ?? -1}
    />
  )
})
ResizablePanel.displayName = 'ResizablePanel'

function ResizableHandle({
  withHandle,
  showGrip = true,
  className,
  onPointerUp,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
  /** When false, hides grip icon/lines; separator remains draggable via resize hit target. */
  showGrip?: boolean
}) {
  const invisibleGrip = !withHandle && !showGrip
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    onPointerUp?.(e)
    ;(document.activeElement as HTMLElement)?.blur?.()
  }
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      onPointerUp={handlePointerUp}
      className={cn(
        'relative z-10 shrink-0 overflow-visible outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
        // Collapse measured box so resizeTargetMinimumSize controls the drag band (not separator CSS size).
        'aria-[orientation=horizontal]:h-0 aria-[orientation=horizontal]:w-full',
        'aria-[orientation=vertical]:h-full aria-[orientation=vertical]:w-0',
        '[&[aria-orientation=horizontal]>.resize-grip]:h-[var(--resize-grip-size)]',
        '[&[aria-orientation=vertical]>.resize-grip]:w-[var(--resize-grip-size)]',
        '[&[aria-orientation=horizontal]>.resize-grip]:inset-x-0 [&[aria-orientation=horizontal]>.resize-grip]:top-1/2 [&[aria-orientation=horizontal]>.resize-grip]:-translate-y-1/2 [&[aria-orientation=horizontal]>.resize-grip]:cursor-row-resize',
        '[&[aria-orientation=vertical]>.resize-grip]:w-[var(--resize-grip-size)]',
        '[&[aria-orientation=vertical]>.resize-grip]:inset-y-0 [&[aria-orientation=vertical]>.resize-grip]:left-1/2 [&[aria-orientation=vertical]>.resize-grip]:-translate-x-1/2 [&[aria-orientation=vertical]>.resize-grip]:cursor-col-resize',
        '[&[aria-orientation=horizontal]_.resize-grip-line-h]:block [&[aria-orientation=horizontal]_.resize-grip-line-v]:hidden',
        '[&[aria-orientation=vertical]_.resize-grip-line-h]:hidden [&[aria-orientation=vertical]_.resize-grip-line-v]:block',
        '[&[aria-orientation=horizontal][data-separator=active]]:cursor-row-resize',
        '[&[aria-orientation=vertical][data-separator=active]]:cursor-col-resize',
        '[&[aria-orientation=horizontal][data-separator=hover]_.resize-grip-sash-h]:block',
        '[&[aria-orientation=vertical][data-separator=hover]_.resize-grip-sash-v]:block',
        '[&[aria-orientation=horizontal][data-separator=active]_.resize-grip-sash-h]:block',
        '[&[aria-orientation=vertical][data-separator=active]_.resize-grip-sash-v]:block',
        '[&[data-separator=hover]_.resize-grip-line-h]:hidden',
        '[&[data-separator=hover]_.resize-grip-line-v]:hidden',
        '[&[data-separator=active]_.resize-grip-line-h]:hidden',
        '[&[data-separator=active]_.resize-grip-line-v]:hidden',
        '[&[data-separator=active]_.resize-grip-sash-h]:h-0.5',
        '[&[data-separator=active]_.resize-grip-sash-v]:w-0.5',
        invisibleGrip && 'aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=vertical]:cursor-col-resize',
        className
      )}
      {...props}
    >
      <div
        className="resize-grip absolute flex items-center justify-center"
        style={
          {
            '--resize-grip-size': `${RESIZE_GRIP_SIZE_PX}px`,
          } as React.CSSProperties
        }
        aria-hidden={!withHandle && !showGrip ? true : undefined}
      >
        {withHandle ? (
          <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
            <GripVerticalIcon className="size-2.5" />
          </div>
        ) : showGrip ? (
          <>
            <span className="resize-grip-line-h pointer-events-none absolute inset-x-0 top-1/2 hidden h-px -translate-y-1/2 bg-border" />
            <span className="resize-grip-line-v pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border" />
          </>
        ) : null}
        <span className="resize-grip-sash-h pointer-events-none absolute inset-x-0 top-1/2 hidden h-px -translate-y-1/2 bg-[var(--hb-sash-active)]" />
        <span className="resize-grip-sash-v pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-[var(--hb-sash-active)]" />
      </div>
    </ResizablePrimitive.Separator>
  )
}

export { DEFAULT_RESIZE_TARGET_MINIMUM_SIZE, INVISIBLE_RESIZE_HANDLE_CLASS, ResizableHandle, ResizablePanel, ResizablePanelGroup, RESIZE_GRIP_SIZE_PX }
