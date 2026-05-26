'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  children: ReactNode
  className?: string
}

/**
 * Renders supplementary content below a node card without extending the
 * card's draggable area. Pointer events are disabled at this level so child
 * interactive elements must opt-in with `pointer-events-auto`.
 */
export function NodeAppendix({ children, className }: Props) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: stops pointer bubbling to ReactFlow node drag
    <div
      className={cn('nodrag nopan pointer-events-none select-none', className)}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => {
        e.stopPropagation()
        e.preventDefault()
      }}
    >
      {children}
    </div>
  )
}
