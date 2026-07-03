'use client'

import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

type EditorFileChangeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileName: string
  onReload: () => void
  onKeepLocal: () => void
}

export function EditorFileChangeDialog({ open, onOpenChange, fileName, onReload, onKeepLocal }: EditorFileChangeDialogProps) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('editor.fileChangedTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('editor.fileChangedDescription', { file: fileName })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <Button type="button" variant="outline" onClick={onKeepLocal}>
            {t('editor.keepLocalVersion')}
          </Button>
          <AlertDialogAction onClick={onReload}>{t('editor.reloadFromDisk')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
