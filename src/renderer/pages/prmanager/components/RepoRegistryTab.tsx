'use client'

import { FolderSearch, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import type { PrRepo } from '../hooks/usePrData'
import { PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE } from '../prManagerButtonStyles'

type Props = {
  projectId: string
  userId: string | null
  repos: PrRepo[]
  onRefresh: () => void
}

export function RepoRegistryTab({ projectId, userId, repos, onRefresh }: Props) {
  const { t } = useTranslation()
  const [addOpen, setAddOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [autodetecting, setAutodetecting] = useState(false)

  const [name, setName] = useState('')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const resetForm = () => {
    setName('')
    setRemoteUrl('')
    setLocalPath('')
  }

  const handleAutodetect = async () => {
    if (!userId) return
    setAutodetecting(true)
    try {
      const res = await window.api.pr.repoAutodetect(userId, projectId)
      if (res.status === 'success') {
        const added = res.data?.added ?? []
        const skipped = res.data?.skipped ?? []
        toast.success(
          t('prManager.repoRegistry.autodetectSuccess', { added: added.length, skipped: skipped.length })
        )
        onRefresh()
      } else {
        toast.error(res.message || t('prManager.repoRegistry.autodetectFail'))
      }
    } finally {
      setAutodetecting(false)
    }
  }

  const handleSubmit = async () => {
    if (!name.trim() || !remoteUrl.trim()) {
      toast.error(t('prManager.repoRegistry.toastNameUrl'))
      return
    }
    setSubmitting(true)
    try {
      const res = await window.api.pr.repoUpsert({
        userId: userId!,
        projectId,
        name: name.trim(),
        remoteUrl: remoteUrl.trim(),
        localPath: localPath.trim() || null,
        defaultBaseBranch: null,
      })
      if (res.status === 'success') {
        toast.success(t('prManager.repoRegistry.saveOk'))
        setAddOpen(false)
        resetForm()
        onRefresh()
      } else {
        toast.error(res.message || t('prManager.repoRegistry.saveFail'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const res = await window.api.pr.repoRemove(userId!, deleteId)
    if (res.status === 'success') {
      toast.success(t('prManager.repoRegistry.deleteOk'))
      setDeleteId(null)
      onRefresh()
    } else toast.error(res.message || t('prManager.repoRegistry.deleteFail'))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={handleAutodetect} disabled={autodetecting || !userId} className="gap-1">
          {autodetecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderSearch className="h-3.5 w-3.5" />}
          {t('prManager.repoRegistry.autodetectBtn')}
        </Button>
        <Button size="sm" variant="outline" onClick={onRefresh} className="gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> {t('prManager.repoRegistry.refresh')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddOpen(true)}
          className={cn('ml-auto', PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE)}
        >
          <Plus className="h-3.5 w-3.5" /> {t('prManager.repoRegistry.addRepo')}
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('prManager.repoRegistry.colName')}</TableHead>
              <TableHead>{t('prManager.repoRegistry.colOwnerRepo')}</TableHead>
              <TableHead>{t('prManager.repoRegistry.colRemote')}</TableHead>
              <TableHead>{t('prManager.repoRegistry.colLocal')}</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {repos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  {t('prManager.repoRegistry.empty')}
                </TableCell>
              </TableRow>
            ) : (
              repos.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.owner}/{r.repo}
                  </TableCell>
                  <TableCell className="max-w-[320px] truncate font-mono text-xs text-muted-foreground">{r.remoteUrl}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">{r.localPath ?? '—'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(r.id)} className="h-7 w-7 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={v => {
          setAddOpen(v)
          if (!v) resetForm()
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{t('prManager.repoRegistry.addTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('prManager.repoRegistry.displayName')}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('prManager.repoRegistry.displayNamePh')} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('prManager.repoRegistry.remoteUrl')}</Label>
              <Input
                value={remoteUrl}
                onChange={e => setRemoteUrl(e.target.value)}
                placeholder={t('prManager.repoRegistry.remoteUrlPh')}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('prManager.repoRegistry.localPath')}</Label>
              <Input value={localPath} onChange={e => setLocalPath(e.target.value)} placeholder={t('prManager.repoRegistry.localPathPh')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t('prManager.repoRegistry.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('prManager.repoRegistry.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('prManager.repoRegistry.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('prManager.repoRegistry.deleteDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('prManager.repoRegistry.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
