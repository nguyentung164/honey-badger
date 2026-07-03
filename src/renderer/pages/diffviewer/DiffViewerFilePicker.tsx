'use client'

import { useMemo } from 'react'
import { DiffViewerStagingBadge } from '@/components/git/DiffViewerStagingBadge'
import { GitFileStatusBadge } from '@/components/git/GitFileStatusBadge'
import { MaterialFileIcon } from '@/components/icons/MaterialFileIcon'
import { cn } from '@/lib/utils'
import { normalizeGitPath } from './diffViewerGitFiles'
import type { DiffViewerFileEntry } from './diffViewerPayload'

interface DiffViewerFilePickerProps {
  filePath: string
  files?: DiffViewerFileEntry[]
  activeEntry?: DiffViewerFileEntry
  showStageIndicators?: boolean
  disabled?: boolean
  onSelectFile?: (index: number) => void
}

function fileNameFromPath(filePath: string): string {
  const parts = normalizeGitPath(filePath).split('/').filter(Boolean)
  return parts[parts.length - 1] ?? filePath
}

export function DiffViewerFilePicker({
  filePath,
  activeEntry,
  showStageIndicators = false,
  disabled,
}: DiffViewerFilePickerProps) {
  const entry = useMemo((): DiffViewerFileEntry | null => {
    if (activeEntry) return activeEntry
    if (filePath) return { filePath: normalizeGitPath(filePath) }
    return null
  }, [activeEntry, filePath])

  if (!entry?.filePath) {
    return <span className="px-2 text-xs text-muted-foreground">—</span>
  }

  const fileName = fileNameFromPath(entry.filePath)

  return (
    <div
      className={cn(
        'flex min-w-0 max-w-full items-center gap-1.5 px-2 text-xs font-medium leading-none',
        disabled && 'pointer-events-none opacity-60'
      )}
      title={entry.filePath}
    >
      <MaterialFileIcon name={fileName} kind="file" className="h-4.5 w-4.5" />
      <span className="min-w-0 flex-1 truncate">{fileName}</span>
      <GitFileStatusBadge status={entry.fileStatus} variant="trailing" />
      {showStageIndicators && entry.stagingState ? (
        <DiffViewerStagingBadge state={entry.stagingState} compact />
      ) : null}
    </div>
  )
}
