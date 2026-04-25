'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from '@/components/ui-elements/Toast'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

interface SetPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userName: string
}

export function SetPasswordDialog({ open, onOpenChange, userId, userName }: SetPasswordDialogProps) {
  const { t } = useTranslation()
  const token = useTaskAuthStore(s => s.token)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!token) {
      toast.error('Chưa đăng nhập')
      return
    }
    if (!newPassword || !confirmPassword) {
      toast.error('Vui lòng nhập đầy đủ thông tin')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Mật khẩu và xác nhận không khớp')
      return
    }
    if (newPassword.length < 6) {
      toast.error('Mật khẩu phải có ít nhất 6 ký tự')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await window.api.user.setUserPassword(token, userId, newPassword)
      if (res.status === 'success') {
        setNewPassword('')
        setConfirmPassword('')
        onOpenChange(false)
        toast.success('Đã đặt mật khẩu thành công')
      } else {
        toast.error(res.message || 'Đặt mật khẩu thất bại')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đặt mật khẩu thất bại')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('taskManagement.changePassword')} - {userName}
          </DialogTitle>
          <DialogDescription>Đặt mật khẩu đăng nhập cho người dùng này.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="set-new-password">{t('taskManagement.newPassword')}</Label>
            <Input id="set-new-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('taskManagement.newPassword')} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="set-confirm-password">{t('taskManagement.confirmPassword')}</Label>
            <Input
              id="set-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder={t('taskManagement.confirmPassword')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!newPassword || !confirmPassword || newPassword !== confirmPassword || isSubmitting}>
            {isSubmitting ? t('common.sending') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
