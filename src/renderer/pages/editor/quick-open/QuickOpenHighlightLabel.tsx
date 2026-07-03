'use client'

import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'

type Segment = { text: string; highlight: boolean }

function buildSegments(label: string, matchIndices: readonly number[]): Segment[] {
  if (matchIndices.length === 0) return [{ text: label, highlight: false }]

  const matchSet = new Set(matchIndices)
  const segments: Segment[] = []
  let text = ''
  let highlight = matchSet.has(0)

  for (let i = 0; i < label.length; i++) {
    const nextHighlight = matchSet.has(i)
    if (i > 0 && nextHighlight !== highlight) {
      segments.push({ text, highlight })
      text = label[i]!
      highlight = nextHighlight
    } else {
      text += label[i]
    }
  }

  if (text) segments.push({ text, highlight })
  return segments.length > 0 ? segments : [{ text: label, highlight: false }]
}

type QuickOpenHighlightLabelProps = {
  label: string
  matchIndices: readonly number[]
  className?: string
}

export const QuickOpenHighlightLabel = memo(function QuickOpenHighlightLabel({ label, matchIndices, className }: QuickOpenHighlightLabelProps) {
  const segments = useMemo(() => buildSegments(label, matchIndices), [label, matchIndices])

  return (
    <span className={cn('shrink-0', className)}>
      {segments.map((segment, index) =>
        segment.highlight ? (
          <span key={index} className="text-[var(--hb-quick-open-highlight)]">
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </span>
  )
})
