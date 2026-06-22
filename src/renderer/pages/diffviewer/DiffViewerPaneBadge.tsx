import { cn } from '@/lib/utils'
import { diffViewerPaneBadgeClassName } from './diffViewerPaneLabel'

interface DiffViewerPaneBadgeProps {
  label: string
  className?: string
}

export function DiffViewerPaneBadge({ label, className }: DiffViewerPaneBadgeProps) {
  return (
    <span className={cn(diffViewerPaneBadgeClassName(label), className)} title={label}>
      {label}
    </span>
  )
}
