'use client'

import { Key, Loader2, Trash2 } from 'lucide-react'
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

interface GitCredential {
  host: string
  username?: string
  source: string
  targetName?: string
}

interface VcsGitStoredCredentialsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const VcsGitStoredCredentialsDialog = memo(function VcsGitStoredCredentialsDialog({
  open,
  onOpenChange,
}: VcsGitStoredCredentialsDialogProps) {
  const { t } = useTranslation()
  const [gitCredentials, setGitCredentials] = useState<GitCredential[]>([])
  const [loading, setLoading] = useState(false)
  const [removeConfirm, setRemoveConfirm] = useState<GitCredential | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  const loadGitCredentials = useCallback(async () => {
    setLoading(true)
    try {
      const creds = await window.api.vcs.git_list_credentials()
      setGitCredentials(creds)
    } catch (_err) {
      toast.error(t('settings.vcsUsers.loadError', 'Failed to load Git credentials'))
      setGitCredentials([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (open) loadGitCredentials()
  }, [open, loadGitCredentials])

  const handleRemove = async () => {
    if (!removeConfirm) return
    setRemoveLoading(true)
    try {
      const result = await window.api.vcs.git_remove_credential(removeConfirm)
      if (result.success) {
        toast.success(t('settings.vcsUsers.removed', 'Credential removed'))
        loadGitCredentials()
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
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              {t('settings.vcsUsers.gitStoredCredentials', 'Git Stored Credentials')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('common.loading', 'Loading...')}
              </div>
            ) : gitCredentials.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">{t('settings.vcsUsers.noGitCredentials', 'No stored Git credentials')}</p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">{t('settings.vcsUsers.host', 'Host')}</th>
                      <th className="px-3 py-2 text-left font-medium">{t('settings.vcsUsers.username', 'Username')}</th>
                      <th className="px-3 py-2 text-left font-medium">{t('settings.vcsUsers.source', 'Source')}</th>
                      <th className="px-3 py-2 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {gitCredentials.map((c, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2">{c.host}</td>
                        <td className="px-3 py-2">{c.username || '-'}</td>
                        <td className="px-3 py-2">{c.source}</td>
                        <td className="px-3 py-2">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setRemoveConfirm({ host: c.host, username: c.username, source: c.source, targetName: c.targetName })}
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
