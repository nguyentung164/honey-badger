'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const fieldVariants = cva(
  'group/field flex w-full min-w-0 flex-col gap-1 data-[invalid=true]:text-destructive',
  {
    variants: {
      orientation: {
        vertical: '',
        horizontal: 'flex-row items-center gap-3 [&>[data-slot=field-label]]:shrink-0',
      },
    },
    defaultVariants: { orientation: 'vertical' },
  }
)

function Field({
  className,
  orientation,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof fieldVariants>) {
  return <div data-slot="field" className={cn(fieldVariants({ orientation }), className)} {...props} />
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn('text-xs font-normal leading-none text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Field, FieldLabel }
