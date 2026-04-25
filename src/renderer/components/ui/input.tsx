import * as React from 'react'

import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        /* Chỉ đổi viền khi focus — ring/box-shadow dễ chồng với border (nhìn dày), và globals có thể không thắng utilities Tailwind v4 */
        'focus-visible:border-ring',
        'disabled:hover:border-input disabled:focus-visible:border-input disabled:focus-visible:ring-0',
        '[&[readonly]]:hover:border-input [&[readonly]]:focus-visible:border-input [&[readonly]]:focus-visible:ring-0',
        'aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  )
})

Input.displayName = 'Input'

export { Input }
