'use client'

import { CloudAlert, CloudCheck } from 'lucide-react'
import { memo, useEffect, useState } from 'react'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { cn } from '@/lib/utils'
import { githubScopedSyncIdleVisual, type GithubScopedSyncIdleVisual } from './prBoardSyncStorage'

export function GithubScopedSyncIdleGlyph({ visual }: { visual: GithubScopedSyncIdleVisual }) {
  if (visual === 'stale') {
    return <CloudAlert className="h-3 w-3 text-amber-500 dark:text-amber-400" />
  }
  if (visual === 'fresh') {
    return <CloudCheck className="h-3 w-3 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300" />
  }
  return <CloudCheck className="h-3 w-3 text-muted-foreground" />
}

type PrBoardScopedSyncIconProps = {
  syncMs: number | null
  isSyncing: boolean
  className?: string
}

export const PrBoardScopedSyncIcon = memo(function PrBoardScopedSyncIcon({ syncMs, isSyncing, className }: PrBoardScopedSyncIconProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTick(c => c + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  if (isSyncing) {
    return <GlowLoader className={cn('h-3 w-3 animate-spin', className)} />
  }

  const visual = githubScopedSyncIdleVisual(syncMs, Date.now())
  return <GithubScopedSyncIdleGlyph visual={visual} />
})

export function PrSyncStatusChangeDot({ title }: { title: string }) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className="pointer-events-none absolute right-0.5 top-0.5 z-[1] h-2 w-2 rounded-full bg-lime-500 ring-2 ring-background dark:bg-lime-400"
    />
  )
}
