'use client'

import { XIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TaskChangeHistorySection } from '@/components/dialogs/task/TaskChangeHistorySection'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function TaskChangeHistoryDialog({
  open,
  onOpenChange,
  taskId,
  resolveUserLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string
  resolveUserLabel: (userId: string | null | undefined) => string
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} overlayClassName="z-[100]" className="z-[100] flex max-h-[min(90vh,36rem)] max-w-2xl flex-col gap-3 overflow-hidden p-4 sm:max-w-2xl">
        <DialogHeader className="flex shrink-0 flex-row flex-wrap items-center gap-2 space-y-0 p-0 text-left sm:text-left">
          <DialogTitle className="min-w-0 flex-1 basis-[min(100%,10rem)] text-lg font-semibold leading-tight sm:basis-auto">{t('taskManagement.changeHistoryTitle')}</DialogTitle>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon" className="ml-auto h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" aria-label={t('common.close')}>
              <XIcon className="h-4 w-4" />
            </Button>
          </DialogClose>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <TaskChangeHistorySection taskId={taskId} resolveUserLabel={resolveUserLabel} variant="dialog" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
