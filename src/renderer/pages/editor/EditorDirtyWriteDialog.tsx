'use client'

import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

type EditorDirtyWriteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileName: string
  onOverwrite: () => void
  onRevert: () => void
  onCompare: () => void
}

export function EditorDirtyWriteDialog({
  open,
  onOpenChange,
  fileName,
  onOverwrite,
  onRevert,
  onCompare,
}: EditorDirtyWriteDialogProps) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('editor.dirtyWriteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('editor.dirtyWriteDescription', { file: fileName })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap">
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <Button type="button" variant="outline" onClick={onCompare}>
            {t('editor.dirtyWriteCompare')}
          </Button>
          <Button type="button" variant="outline" onClick={onRevert}>
            {t('editor.dirtyWriteRevert')}
          </Button>
          <Button type="button" onClick={onOverwrite}>
            {t('editor.dirtyWriteOverwrite')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
