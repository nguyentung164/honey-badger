'use client'

import { ExternalLink, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from '@/components/ui-elements/Toast'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  currentStatus: { ok: boolean; login?: string; message?: string } | null
  onChanged: () => void
}

export function GitHubTokenDialog({ open, onOpenChange, currentStatus, onChanged }: Props) {
  const { t } = useTranslation()
  const [token, setToken] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      setToken('')
      setShow(false)
    }
  }, [open])

  const handleSave = async () => {
    if (!token.trim()) {
      toast.error(t('prManager.tokenDialog.toastEmpty'))
      return
    }
    setSaving(true)
    try {
      const res = await window.api.pr.tokenSet(token.trim())
      if (res.status === 'success') {
        toast.success(t('prManager.tokenDialog.toastSaved', { login: res.login ?? '' }))
        onChanged()
        onOpenChange(false)
      } else {
        toast.error(res.message || t('prManager.tokenDialog.toastInvalid'))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    await window.api.pr.tokenRemove()
    toast.success(t('prManager.tokenDialog.toastRemoved'))
    onChanged()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> {t('prManager.tokenDialog.title')}
          </DialogTitle>
          <DialogDescription>{t('prManager.tokenDialog.description')}</DialogDescription>
        </DialogHeader>

        {currentStatus?.ok && (
          <div className="rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            {t('prManager.tokenDialog.loggedIn')} <b>{currentStatus.login}</b>
          </div>
        )}
        {currentStatus && !currentStatus.ok && currentStatus.message && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
            {currentStatus.message}
          </div>
        )}

        <div className="space-y-2">
          <Label>{t('prManager.tokenDialog.label')}</Label>
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder={t('prManager.tokenDialog.placeholder')}
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() =>
              void window.api.system.open_external_url(
                'https://github.com/settings/tokens/new?scopes=repo,workflow&description=honey-badger',
              )
            }
            className="inline-flex items-center gap-1 text-xs text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
          >
            {t('prManager.tokenDialog.createNew')} <ExternalLink className="h-3 w-3" />
          </button>
        </div>

        <DialogFooter>
          {currentStatus?.ok && (
            <Button variant="ghost" onClick={handleRemove} className="mr-auto text-destructive hover:text-destructive">
              {t('prManager.tokenDialog.remove')}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('prManager.tokenDialog.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !token.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('prManager.tokenDialog.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
