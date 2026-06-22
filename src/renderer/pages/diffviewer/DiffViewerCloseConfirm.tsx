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

interface DiffViewerCloseConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaveAndClose: () => void | Promise<void>
  onDiscard: () => void
}

export function DiffViewerCloseConfirm({ open, onOpenChange, onSaveAndClose, onDiscard }: DiffViewerCloseConfirmProps) {
  const { t } = useTranslation()

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('dialog.diffViewer.closeConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('dialog.diffViewer.closeConfirmDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-row flex-nowrap justify-between gap-2 sm:justify-between">
          <AlertDialogCancel className="mr-auto sm:mr-auto">{t('common.cancel')}</AlertDialogCancel>
          <div className="flex gap-2">
            <Button type="button" onClick={() => void onSaveAndClose()} className="bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-600">
              {t('dialog.diffViewer.saveAndClose')}
            </Button>
            <AlertDialogAction onClick={onDiscard} className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600">
              {t('dialog.diffViewer.discardAndClose')}
            </AlertDialogAction>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
