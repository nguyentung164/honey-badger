'use client'
import { AlertCircle, FileQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface DiffViewerLoadStateProps {
  variant: 'empty' | 'error'
  errorMessage?: string
  onRetry?: () => void
}

export function DiffViewerLoadState({ variant, errorMessage, onRetry }: DiffViewerLoadStateProps) {
  const { t } = useTranslation()

  if (variant === 'empty') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <FileQuestion className="h-10 w-10 opacity-60" strokeWidth={1.25} />
        <p className="text-sm">{t('dialog.diffViewer.noFileSelected')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 max-w-lg w-full">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" strokeWidth={1.5} />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-destructive">{t('dialog.diffViewer.loadError')}</p>
          {errorMessage ? <p className="text-xs text-muted-foreground break-words">{errorMessage}</p> : null}
        </div>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('dialog.diffViewer.retry')}
        </Button>
      ) : null}
    </div>
  )
}
