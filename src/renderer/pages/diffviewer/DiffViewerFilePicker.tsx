'use client'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DiffViewerStagingBadge } from '@/components/git/DiffViewerStagingBadge'
import { GitFileStatusBadge } from '@/components/git/GitFileStatusBadge'
import { Combobox } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'
import {
  diffViewerFileOptionId,
  normalizeGitPath,
  parseDiffViewerFileOptionIndex,
  pathsEqual,
} from './diffViewerGitFiles'
import type { DiffViewerFileEntry } from './diffViewerPayload'

interface DiffViewerFilePickerProps {
  filePath: string
  files: DiffViewerFileEntry[]
  activeEntry?: DiffViewerFileEntry
  showStageIndicators?: boolean
  disabled?: boolean
  isDirty?: boolean
  onSelectFile: (index: number) => void
}

function FilePickerRow({
  entry,
  showStaging,
  className,
}: {
  entry: DiffViewerFileEntry
  showStaging?: boolean
  className?: string
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <GitFileStatusBadge status={entry.fileStatus} />
      <span className="min-w-0 flex-1 truncate leading-none">{entry.filePath}</span>
      {showStaging && entry.stagingState ? <DiffViewerStagingBadge state={entry.stagingState} compact /> : null}
    </span>
  )
}

function buildFileSource(
  files: DiffViewerFileEntry[],
  activeEntry: DiffViewerFileEntry | undefined,
  filePath: string
): DiffViewerFileEntry[] {
  if (files.length > 0) return files
  if (activeEntry) return [activeEntry]
  if (filePath) return [{ filePath: normalizeGitPath(filePath) }]
  return []
}

export function DiffViewerFilePicker({
  filePath,
  files,
  activeEntry,
  showStageIndicators = false,
  disabled,
  isDirty,
  onSelectFile,
}: DiffViewerFilePickerProps) {
  const { t } = useTranslation()

  const source = useMemo(
    () => buildFileSource(files, activeEntry, filePath),
    [files, activeEntry, filePath]
  )

  const options = useMemo(
    () =>
      source.map((entry, index) => ({
        value: diffViewerFileOptionId(entry, index),
        label: entry.filePath,
        render: <FilePickerRow entry={entry} showStaging={showStageIndicators} />,
        listRender: <FilePickerRow entry={entry} showStaging={showStageIndicators} className="w-full pr-6" />,
      })),
    [source, showStageIndicators]
  )

  const selectedOptionId = useMemo(() => {
    if (!filePath) return ''
    const stagingState = activeEntry?.stagingState
    let index = -1
    if (stagingState) {
      index = source.findIndex(f => pathsEqual(f.filePath, filePath) && f.stagingState === stagingState)
    }
    if (index < 0) {
      index = source.findIndex(f => pathsEqual(f.filePath, filePath))
    }
    if (index < 0) return ''
    return diffViewerFileOptionId(source[index], index)
  }, [source, filePath, activeEntry?.stagingState])

  const handleValueChange = (optionId: string) => {
    if (!optionId || optionId === selectedOptionId) return
    const index = parseDiffViewerFileOptionIndex(optionId)
    if (index == null || index < 0 || index >= files.length) return
    onSelectFile(index)
  }

  return (
    <div className={cn('flex min-w-0 max-w-full items-center gap-1', disabled && 'opacity-60 pointer-events-none')}>
      <Combobox
        value={selectedOptionId}
        onValueChange={handleValueChange}
        options={options}
        disabled={disabled || options.length === 0}
        placeholder={t('dialog.diffViewer.selectFile')}
        searchPlaceholder={t('dialog.diffViewer.searchFile')}
        emptyText={t('dialog.diffViewer.noFileFound')}
        variant="ghost"
        size="sm"
        className="min-w-0 max-w-full"
        triggerClassName="h-7 max-w-full items-center border-0 bg-transparent px-2 py-0 text-xs font-medium leading-none shadow-none hover:bg-muted/60"
        contentClassName="min-w-[min(28rem,90vw)]"
        lazyList={{ maxResults: 80, enableWhenOptionCountAtLeast: 50 }}
        lazySearchHint={t('dialog.diffViewer.searchFileHint')}
      />
      {isDirty ? (
        <span className="shrink-0 text-amber-500 font-bold text-xs" title={t('dialog.diffViewer.unsavedChanges')}>
          *
        </span>
      ) : null}
    </div>
  )
}
