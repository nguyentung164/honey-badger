'use client'

import { Loader2, Trash2, User } from 'lucide-react'
import { memo, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import toast from '@/components/ui-elements/Toast'

interface VcsSvnCredentialsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const VcsSvnCredentialsDialog = memo(function VcsSvnCredentialsDialog({
  open,
  onOpenChange,
}: VcsSvnCredentialsDialogProps) {
  const { t } = useTranslation()
  const [svnUsers, setSvnUsers] = useState<{ realm: string; username: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  const loadSvnUsers = useCallback(async () => {
    setLoading(true)
    try {
      const users = await window.api.vcs.svn_list_users()
      setSvnUsers(users)
    } catch (_err) {
      toast.error(t('settings.vcsUsers.loadError', 'Failed to load SVN users'))
      setSvnUsers([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (open) loadSvnUsers()
  }, [open, loadSvnUsers])

  const handleRemove = async () => {
    if (!removeConfirm) return
    setRemoveLoading(true)
    try {
      const result = await window.api.vcs.svn_remove_credential(removeConfirm)
      if (result.success) {
        toast.success(t('settings.vcsUsers.removed', 'Credential removed'))
        loadSvnUsers()
      } else {
        toast.error(result.error || t('settings.vcsUsers.removeError', 'Failed to remove'))
      }
    } catch (_err) {
      toast.error(t('settings.vcsUsers.removeError', 'Failed to remove credential'))
    } finally {
      setRemoveLoading(false)
      setRemoveConfirm(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              {t('settings.vcsUsers.svnCredentials', 'SVN Credentials')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('common.loading', 'Loading...')}
              </div>
            ) : svnUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">{t('settings.vcsUsers.noSvnCredentials', 'No SVN credentials cached')}</p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">{t('settings.vcsUsers.realm', 'Realm')}</th>
                      <th className="px-3 py-2 text-left font-medium">{t('settings.vcsUsers.username', 'Username')}</th>
                      <th className="px-3 py-2 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {svnUsers.map((u, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 truncate max-w-[200px]" title={u.realm}>
                          {u.realm}
                        </td>
                        <td className="px-3 py-2">{u.username}</td>
                        <td className="px-3 py-2">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setRemoveConfirm(u.realm)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeConfirm} onOpenChange={open => !open && setRemoveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.vcsUsers.removeConfirm', 'Remove this credential?')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeLoading}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={removeLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {removeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})
