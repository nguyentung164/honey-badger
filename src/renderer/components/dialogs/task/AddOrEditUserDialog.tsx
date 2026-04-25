'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface User {
  id: string
  userCode: string
  name: string
  email: string
  receiveCommitNotification?: boolean
  createdAt: string
}

interface AddOrEditUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  hasPlRole?: boolean
  onSubmit: (input: { userCode: string; name: string; email?: string; receiveCommitNotification?: boolean }) => void | Promise<void>
}

export function AddOrEditUserDialog({ open, onOpenChange, user, hasPlRole = false, onSubmit }: AddOrEditUserDialogProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const [userCode, setUserCode] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [receiveCommitNotification, setReceiveCommitNotification] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isEdit = !!user

  useEffect(() => {
    if (open) {
      if (user) {
        setUserCode(user.userCode || '')
        setName(user.name)
        setEmail(user.email || '')
        setReceiveCommitNotification(user.receiveCommitNotification ?? true)
      } else {
        setUserCode('')
        setName('')
        setEmail('')
        setReceiveCommitNotification(true)
      }
    }
  }, [open, user])

  const handleSubmit = async () => {
    if (!userCode.trim() || !name.trim()) return
    if (!isEdit && !email.trim()) return
    setIsSubmitting(true)
    try {
      await onSubmit({
        userCode: userCode.trim(),
        name: name.trim(),
        email: email.trim() || undefined,
        ...(isEdit && hasPlRole ? { receiveCommitNotification } : {}),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('taskManagement.editUser') : t('taskManagement.addUser')}</DialogTitle>
          <DialogDescription>{isEdit ? t('taskManagement.editUserDescription') : t('taskManagement.addUserDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="user-code">{t('taskManagement.userCode')}</Label>
            <Input id="user-code" value={userCode} onChange={e => setUserCode(e.target.value)} placeholder={t('taskManagement.userCodePlaceholder')} disabled={isEdit} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-name">{t('taskManagement.userName')}</Label>
            <Input id="user-name" value={name} onChange={e => setName(e.target.value)} placeholder={t('taskManagement.userNamePlaceholder')} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-email">
              {isEdit ? t('taskManagement.userEmail') : t('taskManagement.userEmailRequired')}
            </Label>
            <Input id="user-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('taskManagement.userEmailPlaceholder')} />
          </div>
          {isEdit && hasPlRole && (
            <div className="flex items-center justify-between space-x-2 py-2">
              <Label htmlFor="receive-commit-notification" className="cursor-pointer flex-1">
                {t('taskManagement.receiveCommitNotification', 'Nhận thông báo commit qua email')}
              </Label>
              <Switch
                id="receive-commit-notification"
                checked={receiveCommitNotification}
                onCheckedChange={setReceiveCommitNotification}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant={buttonVariant} onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={buttonVariant}
            onClick={handleSubmit}
            disabled={!userCode.trim() || !name.trim() || (!isEdit && !email.trim()) || isSubmitting}
          >
            {isSubmitting ? t('common.sending') : isEdit ? t('common.save') : t('taskManagement.addUser')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
