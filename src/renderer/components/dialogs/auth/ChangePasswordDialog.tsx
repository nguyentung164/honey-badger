'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from '@/components/ui-elements/Toast'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const token = useTaskAuthStore(s => s.token)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!token) {
      toast.error('Chưa đăng nhập')
      return
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Vui lòng nhập đầy đủ thông tin')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Mật khẩu mới và xác nhận không khớp')
      return
    }
    if (newPassword.length < 6) {
      toast.error('Mật khẩu mới phải có ít nhất 6 ký tự')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await window.api.user.changePassword(token, currentPassword, newPassword)
      if (res.status === 'success') {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        onOpenChange(false)
        toast.success('Đổi mật khẩu thành công')
      } else {
        toast.error(res.message || 'Đổi mật khẩu thất bại')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đổi mật khẩu thất bại')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('taskManagement.changePasswordTitle')}</DialogTitle>
          <DialogDescription>{t('taskManagement.changePasswordDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="current-password">{t('taskManagement.currentPassword')}</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder={t('taskManagement.currentPassword')}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">{t('taskManagement.newPassword')}</Label>
            <Input id="new-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('taskManagement.newPassword')} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">{t('taskManagement.confirmPassword')}</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder={t('taskManagement.confirmPassword')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant={buttonVariant} onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button variant={buttonVariant} onClick={handleSubmit} disabled={!currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || isSubmitting}>
            {isSubmitting ? t('common.sending') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
