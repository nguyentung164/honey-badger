'use client'

import { GitMerge, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import toast from '@/components/ui-elements/Toast'
import type { PrRepo } from '../hooks/usePrData'
import { CommitMessagePicker } from './CommitMessagePicker'

type Method = 'squash' | 'merge' | 'rebase'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  repo: PrRepo | null
  prNumber: number | null
  onMerged?: () => void
}

export function MergePrDialog({ open, onOpenChange, projectId, repo, prNumber, onMerged }: Props) {
  const { t } = useTranslation()
  const [method, setMethod] = useState<Method>('squash')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setMethod('squash')
      setTitle('')
      setMessage('')
    }
  }, [open])

  const handlePick = (line: string, body: string) => {
    setTitle(line)
    setMessage(body)
  }

  const handleSubmit = async () => {
    if (!repo || !prNumber) return
    if (!title.trim()) {
      toast.error(t('prManager.mergePr.toastTitleRequired'))
      return
    }
    setSubmitting(true)
    try {
      const res = await window.api.pr.prMerge({
        projectId,
        repoId: repo.id,
        owner: repo.owner,
        repo: repo.repo,
        number: prNumber,
        method,
        commitTitle: title.trim(),
        commitMessage: message.trim(),
      })
      if (res.status === 'success' && res.data?.merged) {
        toast.success(t('prManager.mergePr.toastMerged', { number: prNumber }))
        onMerged?.()
        onOpenChange(false)
      } else {
        toast.error(res.message || res.data?.message || t('prManager.mergePr.toastMergeFailed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" /> {t('prManager.mergePr.title')} {prNumber ? `#${prNumber}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-w-0 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">{t('prManager.mergePr.mergeMethod')}</Label>
            <RadioGroup value={method} onValueChange={v => setMethod(v as Method)} className="grid grid-cols-3 gap-2">
              {(['squash', 'merge', 'rebase'] as const).map(m => (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 data-[selected=true]:border-primary data-[selected=true]:bg-primary/5"
                  data-selected={method === m}
                >
                  <RadioGroupItem value={m} id={`merge-${m}`} />
                  <span>{t(`prManager.mergePr.method.${m}`)}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {repo && prNumber && (
            <div className="space-y-1">
              <Label className="text-xs">{t('prManager.mergePr.pickCommitLabel')}</Label>
              <CommitMessagePicker owner={repo.owner} repo={repo.repo} prNumber={prNumber} onPick={handlePick} variant="picker" />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">{t('prManager.mergePr.commitTitle')}</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('prManager.mergePr.commitTitlePlaceholder')} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('prManager.mergePr.commitMessage')}</Label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t('prManager.mergePr.commitMessageOptional')}
              className="min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !repo || !prNumber}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('prManager.mergePr.merge')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
