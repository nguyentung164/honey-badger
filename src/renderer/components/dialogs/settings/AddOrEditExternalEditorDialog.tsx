'use client'
import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useButtonVariant } from '@/stores/useAppearanceStore'

interface AddOrEditExternalEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editorName: string
  editorPath: string
  setEditorName: (value: string) => void
  setEditorPath: (value: string) => void
  onAdd: () => void
  onUpdate: () => void
  isEditMode?: boolean
}

export const AddOrEditExternalEditorDialog = memo(function AddOrEditExternalEditorDialog({
  open,
  onOpenChange,
  editorName,
  editorPath,
  setEditorName,
  setEditorPath,
  onAdd,
  onUpdate,
  isEditMode = false,
}: AddOrEditExternalEditorDialogProps) {
  const [errorName, setErrorName] = useState(false)
  const [errorPath, setErrorPath] = useState(false)
  const variant = useButtonVariant()
  const { t } = useTranslation()

  useEffect(() => {
    if (open && !isEditMode) {
      setEditorName('')
      setEditorPath('')
      setErrorName(false)
      setErrorPath(false)
    }
  }, [open, isEditMode, setEditorName, setEditorPath])

  const handleSave = () => {
    const nameValid = editorName.trim().length > 0
    const pathValid = editorPath.trim().length > 0

    setErrorName(!nameValid)
    setErrorPath(!pathValid)

    if (nameValid && pathValid) {
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
          <DialogTitle>{isEditMode ? t('dialog.externalEditor.editTitle') : t('dialog.externalEditor.addTitle')}</DialogTitle>
          <DialogDescription>{isEditMode ? t('dialog.externalEditor.editDescription') : t('dialog.externalEditor.addDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="editor-name">{t('dialog.externalEditor.name')}</Label>
            <Input
              id="editor-name"
              value={editorName}
              onChange={e => setEditorName(e.target.value)}
              placeholder={t('dialog.externalEditor.namePlaceholder')}
              className={errorName ? 'border-red-500' : ''}
              disabled={isEditMode}
            />
            {errorName && <p className="text-sm text-red-500">{t('dialog.externalEditor.msgRequiredName')}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="editor-path">{t('dialog.externalEditor.path')}</Label>
            <Input
              id="editor-path"
              value={editorPath}
              onChange={e => setEditorPath(e.target.value)}
              placeholder={t('dialog.externalEditor.pathPlaceholder')}
              className={errorPath ? 'border-red-500' : ''}
            />
            {errorPath && <p className="text-sm text-red-500">{t('dialog.externalEditor.msgRequiredPath')}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant={variant} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant={variant} onClick={handleSave}>
            {isEditMode ? t('common.update') : t('common.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
