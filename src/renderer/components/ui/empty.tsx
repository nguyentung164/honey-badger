import type * as React from 'react'
import { cn } from '@/lib/utils'

function Empty({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="empty" className={cn('flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg p-6 text-center md:p-12', className)} {...props} />
}

function EmptyHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="empty-header" className={cn('flex max-w-sm flex-col items-center gap-2 text-center', className)} {...props} />
}

function EmptyMedia({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="empty-media" className={cn('mb-2 flex size-12 items-center justify-center rounded-lg bg-muted text-foreground [&_svg]:size-6', className)} {...props} />
}

function EmptyTitle({ className, ...props }: React.ComponentProps<'h1'>) {
  return <h1 data-slot="empty-title" className={cn('text-lg font-medium tracking-tight', className)} {...props} />
}

function EmptyDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="empty-description" className={cn('text-sm text-muted-foreground', className)} {...props} />
}

function EmptyContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="empty-content" className={cn('flex w-full max-w-sm min-w-0 flex-col items-center gap-4', className)} {...props} />
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle }
