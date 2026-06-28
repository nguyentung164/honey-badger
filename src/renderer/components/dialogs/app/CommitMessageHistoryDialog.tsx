'use client'

import { Loader2, RefreshCw, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CommitMessageHistoryContent } from '@/pages/commitmessagehistory/CommitMessageHistoryContent'

type CommitMessageHistoryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommitMessageHistoryDialog({ open, onOpenChange }: CommitMessageHistoryDialogProps) {
  const { t } = useTranslation()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[min(90vh,40rem)] max-w-3xl flex-col gap-3 overflow-hidden p-4 sm:max-w-3xl">
        <DialogHeader className="flex shrink-0 flex-row flex-wrap items-center gap-2 space-y-0 p-0 text-left sm:text-left">
          <DialogTitle className="min-w-0 flex-1 text-lg font-semibold leading-tight">{t('dialog.commitMessageHistroy.title')}</DialogTitle>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setReloadNonce(n => n + 1)}
                disabled={isRefreshing}
                aria-label={t('common.refresh')}
              >
                {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('common.refresh')}</TooltipContent>
          </Tooltip>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" aria-label={t('common.close')}>
              <XIcon className="h-4 w-4" />
            </Button>
          </DialogClose>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <CommitMessageHistoryContent enabled={open} reloadNonce={reloadNonce} onLoadingChange={setIsRefreshing} variant="dialog" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
