'use client'
import { CircleAlert, Loader2, MoveRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import toast from '@/components/ui-elements/Toast'
import logger from '@/services/logger'
import { useButtonVariant } from '@/stores/useAppearanceStore'

interface UpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentVersion: string
  newVersion: string
  releaseNotes: string
  isManuallyOpened?: boolean
}

export const UpdateDialog = ({ open, onOpenChange, currentVersion, newVersion, releaseNotes, isManuallyOpened = false }: UpdateDialogProps) => {
  const { t } = useTranslation()
  const _variant = useButtonVariant()
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
    if (open) {
      const dontShowUpdateDialog = localStorage.getItem('dont-show-update-dialog') === 'true'
      if (dontShowUpdateDialog && !isManuallyOpened) {
        onOpenChange(false)
      }
    }
  }, [open, onOpenChange, isManuallyOpened])

  useEffect(() => {
    const savedState = localStorage.getItem('dont-show-update-dialog') === 'true'
    setDontShowAgain(savedState)
  }, [])
  const handleInstall = async () => {
    setIsInstalling(true)
    try {
      onOpenChange(false)
      await window.api.updater.install_updates()
    } catch (error: unknown) {
      logger.error('Install update error:', error)
      toast.error(error instanceof Error ? error.message : String(error) || t('toast.updateError'))
    } finally {
      setIsInstalling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={t('dialog.updateApp.appVersion')}>
        <DialogHeader>
          <DialogTitle className="flex flex-row items-center gap-2">
            {t('dialog.updateApp.appVersion')}
            <div className="flex flex-row items-center gap-2">
              <span className="text-gray-500/100">{currentVersion}</span> <MoveRight className="w-4 h-4" /> {newVersion}
            </div>
          </DialogTitle>
          <DialogDescription>{t('dialog.updateApp.description')}</DialogDescription>
        </DialogHeader>

        <div className="mt-2 prose prose-sm dark:prose-invert max-h-[50vh] overflow-y-auto p-4 border rounded bg-muted/30 max-w-none">
          {releaseNotes ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{releaseNotes}</ReactMarkdown> : <p>{t('dialog.updateApp.noReleaseNotes')}</p>}
        </div>
        <div className="border rounded w-full p-3 items-center justify-center text-sm flex flex-row gap-2 dark:border-blue-400 border-blue-800">
          <CircleAlert className="w-4 h-4 dark:text-blue-400 text-blue-800" />
          {t('dialog.updateApp.message')}
        </div>
        <DialogFooter className="flex-col items-start sm:flex-row sm:items-center">
          <div className="flex items-center space-x-2 mb-4 sm:mb-0 w-full">
            <Checkbox
              id="dontShowUpdateDialog"
              checked={dontShowAgain}
              onCheckedChange={checked => {
                setDontShowAgain(checked === true)
                if (checked === true) {
                  localStorage.setItem('dont-show-update-dialog', 'true')
                } else {
                  localStorage.removeItem('dont-show-update-dialog')
                }
              }}
            />
            <Label htmlFor="dontShowUpdateDialog">{t('common.dontShowAgain')}</Label>
          </div>
          <div className="flex w-full justify-end space-x-2">
            <Button className="dark:bg-blue-400! bg-blue-800!" onClick={handleInstall} disabled={isInstalling}>
              {isInstalling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isInstalling ? t('common.loading', 'Đang cài đặt...') : t('common.install')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
