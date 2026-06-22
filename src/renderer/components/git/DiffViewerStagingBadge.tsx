'use client'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface DiffViewerStagingBadgeProps {
  state: 'staged' | 'unstaged'
  className?: string
  compact?: boolean
}

export function DiffViewerStagingBadge({ state, className, compact = false }: DiffViewerStagingBadgeProps) {
  const { t } = useTranslation()
  const isStaged = state === 'staged'

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded font-medium',
        compact ? 'px-1 py-0 text-[9px] leading-4' : 'px-1.5 py-0.5 text-[10px] leading-4',
        isStaged ? 'bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-muted text-muted-foreground',
        className
      )}
    >
      {isStaged ? t('dialog.diffViewer.stagingStaged') : t('dialog.diffViewer.stagingUnstaged')}
    </span>
  )
}
