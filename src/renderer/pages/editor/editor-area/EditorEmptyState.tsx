'use client'

import { FileCode2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function EditorEmptyState() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <FileCode2 className="h-12 w-12 opacity-40" />
      <p className="text-sm">{t('editor.emptyState')}</p>
      <p className="max-w-sm text-center text-xs">{t('editor.emptyStateHint')}</p>
    </div>
  )
}
