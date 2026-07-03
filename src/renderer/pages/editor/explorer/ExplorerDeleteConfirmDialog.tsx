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

type DeleteTarget = { relativePath: string; isDir: boolean; name: string }

type ExplorerDeleteConfirmDialogProps = {
  targets: DeleteTarget[] | null
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}

export function ExplorerDeleteConfirmDialog({ targets, onConfirm, onOpenChange }: ExplorerDeleteConfirmDialogProps) {
  const { t } = useTranslation()
  const open = targets !== null && targets.length > 0

  const description =
    targets && targets.length === 1
      ? t('editor.explorerMenu.deleteConfirm', { name: targets[0].name })
      : targets && targets.length > 1
        ? t('editor.explorerMenu.deleteMultipleConfirm', { count: targets.length })
        : null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('editor.explorerMenu.delete')}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {t('editor.explorerMenu.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
