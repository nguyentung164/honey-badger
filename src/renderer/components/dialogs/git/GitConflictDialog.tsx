'use client'

import { useTranslation } from 'react-i18next'
import { GitConflictPanel } from '@/components/conflict/GitConflictPanel'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfigurationStore } from '@/stores/useConfigurationStore'

interface GitConflictDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onResolved?: () => void
}

export function GitConflictDialog({ open, onOpenChange, onResolved }: GitConflictDialogProps) {
  const { t } = useTranslation()
  const sourceFolder = useConfigurationStore(s => s.sourceFolder)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{t('git.conflict.title')}</DialogTitle>
          <DialogDescription>{t('git.conflict.description')}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <GitConflictPanel
            sourceFolder={sourceFolder || undefined}
            onResolved={() => {
              onResolved?.()
              onOpenChange(false)
              window.dispatchEvent(new CustomEvent('git-branch-changed'))
            }}
            onAbort={() => {
              onResolved?.()
              onOpenChange(false)
              window.dispatchEvent(new CustomEvent('git-branch-changed'))
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
