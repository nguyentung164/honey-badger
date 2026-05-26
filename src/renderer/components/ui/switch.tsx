'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

type SwitchProps = Omit<React.ComponentProps<'button'>, 'role' | 'type' | 'aria-checked' | 'data-state' | 'children'> & {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  size?: 'sm' | 'default'
}

/** Native switch — avoids Radix storing the button node in React state + unstable composed refs (infinite update loop in React 19 / some hosts like React Flow `Panel`). */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { className, size = 'default', checked: checkedProp, defaultChecked, onCheckedChange, disabled, onClick, ...props },
  ref
) {
  const isControlled = checkedProp !== undefined
  const [uncontrolled, setUncontrolled] = React.useState(!!defaultChecked)
  const checked = isControlled ? !!checkedProp : uncontrolled

  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-size={size}
      data-state={checked ? 'checked' : 'unchecked'}
      disabled={disabled}
      className={cn(
        'peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6',
        className
      )}
      onClick={e => {
        onClick?.(e)
        if (e.defaultPrevented || disabled) return
        const next = !checked
        if (!isControlled) setUncontrolled(next)
        onCheckedChange?.(next)
      }}
      {...props}
    >
      <span
        data-slot="switch-thumb"
        data-state={checked ? 'checked' : 'unchecked'}
        className={cn(
          'bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block rounded-full ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0'
        )}
      />
    </button>
  )
})

Switch.displayName = 'Switch'

export { Switch }
