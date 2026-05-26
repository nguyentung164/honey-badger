'use client'

import { Loader2 } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { BorderGradientRing, ensureRainbowStyle, SpinningGrad, themeRadiusPx } from '@/components/flow-inspector/borderGradientRing'
import { cn } from '@/lib/utils'

export type NodeStatusIndicatorStatus = 'loading' | 'success' | 'error' | 'initial'
export type NodeStatusIndicatorVariant = 'border' | 'overlay'

type Props = {
  status: NodeStatusIndicatorStatus
  variant?: NodeStatusIndicatorVariant
  children: ReactNode
  className?: string
  /** Status frame radius — keep in sync with node shell (default rounded-lg). */
  roundedClassName?: string
}

const STATUS_FRAME = 'pointer-events-none absolute z-[2] h-[calc(100%)] w-[calc(100%)]'

/** Match Tailwind `border` (1px) used by success/error status frames. */
const LOADING_BORDER_PX = 1
const LOADING_GRADIENT = 'conic-gradient(at 50% 50%, var(--primary) 0deg, transparent 300deg, transparent 360deg)'

function LoadingBorderRing() {
  useEffect(() => {
    ensureRainbowStyle()
  }, [])

  return (
    <BorderGradientRing bw={LOADING_BORDER_PX} rx={themeRadiusPx()}>
      <SpinningGrad gradient={LOADING_GRADIENT} dur="2s" />
    </BorderGradientRing>
  )
}

/**
 * Status chrome for flow nodes. Loading uses `rf-rainbow-mask` so the spinner
 * only paints on the border strip — safe with semi-transparent card fills.
 *
 * @see https://reactflow.dev/ui/components/node-status-indicator
 */
export function NodeStatusIndicator({ status, variant = 'border', children, className, roundedClassName = 'rounded-lg' }: Props) {
  if (status === 'initial') return <>{children}</>

  if (variant === 'overlay') {
    return (
      <div className={cn('relative', roundedClassName, className)}>
        {children}
        {status === 'loading' ? (
          <div className={cn('pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]', roundedClassName)}>
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        ) : status === 'success' ? (
          <div className={cn('pointer-events-none absolute inset-0 z-10 bg-emerald-500/10', roundedClassName)} />
        ) : status === 'error' ? (
          <div className={cn('pointer-events-none absolute inset-0 z-10 bg-destructive/10', roundedClassName)} />
        ) : null}
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      {status === 'loading' ? <LoadingBorderRing /> : null}
      {status === 'success' ? <div aria-hidden className={cn(STATUS_FRAME, 'border border-emerald-500', roundedClassName)} /> : null}
      {status === 'error' ? <div aria-hidden className={cn(STATUS_FRAME, 'border border-destructive', roundedClassName)} /> : null}
      <div className="relative z-[1] h-full w-full min-h-0 min-w-0">{children}</div>
    </div>
  )
}
