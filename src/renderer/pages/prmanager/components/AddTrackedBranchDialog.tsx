'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from '@/components/ui-elements/Toast'
import type { PrRepo } from '../hooks/usePrData'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  userId: string | null
  repos: PrRepo[]
  onAdded?: () => void
}

export function AddTrackedBranchDialog({ open, onOpenChange, projectId, userId, repos, onAdded }: Props) {
  const { t } = useTranslation()
  const [repoId, setRepoId] = useState('')
  const [branchName, setBranchName] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setRepoId(repos[0]?.id ?? '')
      setBranchName('')
      setNote('')
    }
  }, [open, repos])

  const handleSubmit = async () => {
    if (!userId?.trim()) {
      toast.error(t('prManager.addTrackedBranch.toastRepoBranch'))
      return
    }
    if (!repoId || !branchName.trim()) {
      toast.error(t('prManager.addTrackedBranch.toastRepoBranch'))
      return
    }
    setSubmitting(true)
    try {
      const res = await window.api.pr.trackedUpsert({
        userId: userId.trim(),
        projectId,
        repoId,
        branchName: branchName.trim(),
        note: note.trim() || null,
      })
      if (res.status === 'success') {
        toast.success(t('prManager.addTrackedBranch.toastSuccess'))
        onAdded?.()
        onOpenChange(false)
      } else {
        toast.error(res.message || t('prManager.addTrackedBranch.toastFail'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('prManager.addTrackedBranch.title')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs">{t('prManager.addTrackedBranch.repo')}</Label>
            <Combobox
              value={repoId}
              onValueChange={setRepoId}
              options={repos.map(r => ({ value: r.id, label: `${r.owner}/${r.repo}` }))}
              placeholder={t('prManager.addTrackedBranch.selectRepo')}
              emptyText={t('prManager.addTrackedBranch.noRepos')}
              triggerClassName="w-full justify-between"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('prManager.addTrackedBranch.branchName')}</Label>
            <Input
              value={branchName}
              onChange={e => setBranchName(e.target.value)}
              placeholder={t('prManager.addTrackedBranch.branchPlaceholder')}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('prManager.addTrackedBranch.noteOptional')}</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder={t('prManager.addTrackedBranch.notePlaceholder')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('prManager.addTrackedBranch.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('prManager.addTrackedBranch.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
