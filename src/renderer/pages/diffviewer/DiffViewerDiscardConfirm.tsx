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

interface DiffViewerDiscardConfirmProps {
  open: boolean
  filePath?: string | null
  filePaths?: string[]
  isDirty?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
}

export function DiffViewerDiscardConfirm({
  open,
  filePath = null,
  filePaths,
  isDirty = false,
  onOpenChange,
  onConfirm,
}: DiffViewerDiscardConfirmProps) {
  const { t } = useTranslation()
  const paths = filePaths?.length ? filePaths : filePath ? [filePath] : []

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="min-w-3xl! overflow-x-hidden">
        <AlertDialogHeader className="min-w-0 w-full max-w-full">
          <AlertDialogTitle className="min-w-0 max-w-full break-words">{t('dialog.discardChanges.title')}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="min-w-0 w-full max-w-full overflow-hidden">
              <p className="min-w-0 break-words">{t('dialog.discardChanges.description')}</p>
              {isDirty ? (
                <p className="mt-2 min-w-0 break-words text-amber-700 dark:text-amber-300 font-medium">
                  {t('dialog.diffViewer.unsavedChangesRevertHint')}
                </p>
              ) : null}
              {paths.length > 0 ? (
                <ul className="mt-2 max-h-40 min-w-0 w-full max-w-full overflow-y-auto overflow-x-hidden space-y-1 text-left text-destructive font-medium">
                  {paths.map(path => (
                    <li key={path} className="min-w-0 max-w-full break-all [overflow-wrap:anywhere]" title={path}>
                      {path}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void onConfirm()}>
            {t('dialog.discardChanges.action')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
