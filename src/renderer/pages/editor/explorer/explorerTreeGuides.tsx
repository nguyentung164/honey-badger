'use client'

import { memo } from 'react'
import { explorerTreeGuideLeft } from '@/pages/editor/explorer/explorerTreeConstants'

export const ExplorerIndentGuides = memo(function ExplorerIndentGuides({ depth }: { depth: number }) {
  if (depth <= 0) return null
  return (
    <div className="pointer-events-none absolute inset-y-0 left-0" aria-hidden>
      {Array.from({ length: depth }, (_, level) => (
        <span key={level} className="absolute top-0 bottom-0 w-px bg-border/55 dark:bg-border/40" style={{ left: explorerTreeGuideLeft(level) }} />
      ))}
    </div>
  )
})
