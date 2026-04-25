'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from '@/components/ui-elements/Toast'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'

const TASK_LOGIN_REMEMBER_KEY = 'taskLoginRemember'

function getSavedUserCode(): string {
  try {
    const raw = localStorage.getItem(TASK_LOGIN_REMEMBER_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { userCode?: string }
    return typeof parsed?.userCode === 'string' ? parsed.userCode.trim() : ''
  } catch {
    return ''
  }
}

function saveUserCode(userCode: string): void {
  try {
    localStorage.setItem(TASK_LOGIN_REMEMBER_KEY, JSON.stringify({ userCode: userCode.trim() }))
  } catch {
    // ignore
  }
}

function clearSavedUserCode(): void {
  try {
    localStorage.removeItem(TASK_LOGIN_REMEMBER_KEY)
  } catch {
    // ignore
  }
}

interface LoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function LoginDialog({ open, onOpenChange, onSuccess }: LoginDialogProps) {
  const { t } = useTranslation()
  const setSession = useTaskAuthStore(s => s.setSession)
  const setGuestMode = useTaskAuthStore(s => s.setGuestMode)
  const [userCode, setUserCode] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setShowPassword(false)
      const saved = getSavedUserCode()
      if (saved) {
        setUserCode(saved)
        setRemember(true)
      } else {
        setRemember(false)
      }
    }
  }, [open])

  const handleGuestLogin = () => {
    setGuestMode(true)
    onOpenChange(false)
    onSuccess()
  }

  const handleSubmit = async () => {
    if (!userCode.trim() || !password) {
      toast.error(t('taskManagement.passwordPlaceholder') || 'Vui lòng nhập đầy đủ thông tin')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await window.api.user.login(userCode.trim(), password)
      if (res.status === 'success' && res.data) {
        setSession(res.data.token, res.data.user)
        if (remember) saveUserCode(userCode.trim())
        else clearSavedUserCode()
        setUserCode('')
        setPassword('')
        setShowPassword(false)
        onOpenChange(false)
        onSuccess()
      } else {
        toast.error(res.message || 'Đăng nhập thất bại')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đăng nhập thất bại')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('taskManagement.loginTitle')}</DialogTitle>
          <DialogDescription>{t('taskManagement.loginDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="login-user-code">{t('taskManagement.userCodeOrEmail')}</Label>
            <Input
              id="login-user-code"
              value={userCode}
              onChange={e => setUserCode(e.target.value)}
              placeholder={t('taskManagement.userCodeOrEmailPlaceholder')}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="login-password">{t('taskManagement.password')}</Label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t('taskManagement.passwordPlaceholder')}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                className="pr-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-muted/50"
                onClick={() => setShowPassword(prev => !prev)}
                tabIndex={-1}
                aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
              >
                {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="login-remember" checked={remember} onCheckedChange={v => setRemember(v === true)} />
            <Label htmlFor="login-remember" className="text-sm font-normal cursor-pointer">
              {t('taskManagement.rememberMe')}
            </Label>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="sm:mr-auto">
            {t('common.cancel')}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleGuestLogin} disabled={isSubmitting}>
              {t('taskManagement.guest')}
            </Button>
            <Button onClick={handleSubmit} disabled={!userCode.trim() || !password || isSubmitting}>
              {isSubmitting ? t('common.sending') : t('taskManagement.login')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
