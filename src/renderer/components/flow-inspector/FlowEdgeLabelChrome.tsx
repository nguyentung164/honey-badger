'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { FlowConnectionStyle } from 'shared/flowDiagramStyle'
import { gradientToCss, mergeConnectionStyle, resolvedEdgeLabelChrome } from 'shared/flowDiagramStyle'
import { cn } from '@/lib/utils'

type Props = {
  connectionStyle: FlowConnectionStyle
  preview?: boolean
  className?: string
  children: ReactNode
}

/** Shared edge label pill chrome for map (`StyledFlowEdge`) and inspector preview. */
export function FlowEdgeLabelChrome({ connectionStyle, preview = false, className, children }: Props) {
  const cs = mergeConnectionStyle(connectionStyle)
  const chrome = resolvedEdgeLabelChrome(cs, { preview })
  const chromeKey = `${chrome.staticBorderPx}-${chrome.borderColor}-${chrome.useAccentGradient}`

  const innerClassName = cn(
    'box-border max-w-[160px] truncate rounded-sm px-1 py-px leading-tight',
    chrome.className,
  )
  const innerStyle = chrome.style as CSSProperties

  if (chrome.useAccentGradient && chrome.staticBorderPx > 0) {
    return (
      <div
        key={chromeKey}
        className={cn('inline-block max-w-full rounded-sm', className)}
        style={{
          background: gradientToCss(chrome.accentStops),
          padding: chrome.staticBorderPx,
        }}
      >
        <div className={innerClassName} style={innerStyle}>
          {children}
        </div>
      </div>
    )
  }

  return (
    <div key={chromeKey} className={cn(innerClassName, className)} style={innerStyle}>
      {children}
    </div>
  )
}
