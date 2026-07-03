'use client'

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
import { useTranslation } from 'react-i18next'

type EditorCloseConfirmProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileName: string
  onSave: () => void | Promise<void>
  onDiscard: () => void
}

export function EditorCloseConfirm({ open, onOpenChange, fileName, onSave, onDiscard }: EditorCloseConfirmProps) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('editor.unsavedTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('editor.unsavedDescription', { file: fileName })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <Button type="button" variant="outline" onClick={onDiscard}>
            {t('editor.discard')}
          </Button>
          <AlertDialogAction onClick={() => void onSave()}>{t('common.save')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
