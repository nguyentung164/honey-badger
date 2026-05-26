'use client'

import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function BaseNode({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="base-node"
      className={cn('relative rounded-lg border border-border/70 bg-card/95 text-card-foreground shadow-sm', className)}
      {...props}
    />
  )
}

export function BaseNodeContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="base-node-content" className={cn('px-3 py-2', className)} {...props} />
}

export function BaseNodeFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="base-node-footer" className={cn('flex items-center border-t border-border/50 px-3 py-1.5', className)} {...props} />
}
