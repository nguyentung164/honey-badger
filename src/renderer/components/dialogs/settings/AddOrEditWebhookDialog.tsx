'use client'
import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useButtonVariant } from '@/stores/useAppearanceStore'

interface AddOrEditWebhookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  webhookName: string
  webhookUrl: string
  setWebhookName: (value: string) => void
  setWebhookUrl: (value: string) => void
  onAdd: () => void
  onUpdate: () => void
  isEditMode?: boolean
}

export const AddOrEditWebhookDialog = memo(function AddOrEditWebhookDialog({
  open,
  onOpenChange,
  webhookName,
  webhookUrl,
  setWebhookName,
  setWebhookUrl,
  onAdd,
  onUpdate,
  isEditMode = false,
}: AddOrEditWebhookDialogProps) {
  const [errorName, setErrorName] = useState(false)
  const [errorUrl, setErrorUrl] = useState(false)
  const variant = useButtonVariant()
  const { t } = useTranslation()

  useEffect(() => {
    if (open && !isEditMode) {
      setWebhookName('')
      setWebhookUrl('')
      setErrorName(false)
      setErrorUrl(false)
    }
  }, [open, isEditMode, setWebhookName, setWebhookUrl])

  const handleSave = () => {
    const nameValid = webhookName.trim().length > 0
    const urlValid = webhookUrl.trim().length > 0

    setErrorName(!nameValid)
    setErrorUrl(!urlValid)

    if (nameValid && urlValid) {
      if (isEditMode) {
        onUpdate()
      } else {
        onAdd()
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEditMode ? t('dialog.editWebhook.title', 'Edit Webhook') : t('dialog.newWebhook.title')}</DialogTitle>
          <DialogDescription>{isEditMode ? t('dialog.editWebhook.description', 'Update the webhook details.') : t('dialog.newWebhook.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-name">{t('dialog.newWebhook.name', 'Webhook Name')}</Label>
            <Input
              id="webhook-name"
              value={webhookName}
              onChange={e => setWebhookName(e.target.value)}
              placeholder={t('dialog.newWebhook.placeholderName')}
              className={errorName ? 'border-red-500' : ''}
              disabled={isEditMode}
            />
            {errorName && <p className="text-sm text-red-500">{t('dialog.newWebhook.msgRequiredName')}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-url">{t('dialog.newWebhook.url', 'Webhook URL')}</Label>
            <Input
              id="webhook-url"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder={t('dialog.newWebhook.placeholderUrl')}
              className={errorUrl ? 'border-red-500' : ''}
            />
            {errorUrl && <p className="text-sm text-red-500">{t('dialog.newWebhook.msgRequiredUrl')}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant={variant} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant={variant} onClick={handleSave}>
            {isEditMode ? t('common.update', 'Update') : t('common.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
