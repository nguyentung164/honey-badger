'use client'
import { FileArchive } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { DiffViewerPaneBadge } from './DiffViewerPaneBadge'

interface BinaryDiffPanelProps {
  kind: 'image' | 'binary'
  originalLabel: string
  modifiedLabel: string
  originalDataUrl?: string | null
  modifiedDataUrl?: string | null
  isLoading?: boolean
  fileTooLarge?: boolean
}

export function BinaryDiffPanel({
  kind,
  originalLabel,
  modifiedLabel,
  originalDataUrl,
  modifiedDataUrl,
  isLoading,
  fileTooLarge,
}: BinaryDiffPanelProps) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <GlowLoader className="w-10 h-10" />
      </div>
    )
  }

  if (kind === 'binary') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <FileArchive className="h-10 w-10 opacity-60" strokeWidth={1.25} />
        <p className="text-sm">{t('dialog.diffViewer.binaryFile')}</p>
      </div>
    )
  }

  if (fileTooLarge) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-sm">{t('dialog.diffViewer.fileTooLarge')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <p className="px-4 py-1 text-xs text-muted-foreground border-b">{t('dialog.diffViewer.imagePreview')}</p>
      <div className="flex flex-1 min-h-0">
        <ImageColumn label={originalLabel} dataUrl={originalDataUrl} />
        <div className="w-px bg-border shrink-0" />
        <ImageColumn label={modifiedLabel} dataUrl={modifiedDataUrl} />
      </div>
    </div>
  )
}

function ImageColumn({ label, dataUrl }: { label: string; dataUrl?: string | null }) {
  return (
    <div className="flex flex-1 flex-col min-w-0">
      <div className="flex items-center justify-center py-2 border-b bg-muted/20">
        <DiffViewerPaneBadge label={label} />
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/20">
        {dataUrl ? (
          <img src={dataUrl} alt={label} className="max-w-full max-h-full object-contain" draggable={false} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
    </div>
  )
}
