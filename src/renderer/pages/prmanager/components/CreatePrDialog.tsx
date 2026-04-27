'use client'

import { Loader2, GitPullRequest, Sparkles } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import toast from '@/components/ui-elements/Toast'
import type { PrRepo } from '../hooks/usePrData'
import { usePrOperationLog } from '../PrOperationLogContext'
import { buildIssueStylePrTitle, pickIssueKeyAndVersion } from '../utils/buildIssuePrTitle'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  repos: PrRepo[]
  initialRepoId?: string | null
  initialHead?: string | null
  initialBase?: string | null
  onCreated?: () => void
}

export function CreatePrDialog({ open, onOpenChange, projectId, repos, initialRepoId, initialHead, initialBase, onCreated }: Props) {
  const { t } = useTranslation()
  const opLog = usePrOperationLog()
  /** Mở từ nút trong table (có đủ 3 giá trị ban đầu) → khoá repo / head / base. */
  const isFromTable = initialRepoId != null && initialHead != null && initialBase != null
  const [repoId, setRepoId] = useState<string>(initialRepoId ?? repos[0]?.id ?? '')
  const [head, setHead] = useState(initialHead ?? '')
  const [base, setBase] = useState(initialBase ?? '')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(false)
  const [openBrowser, setOpenBrowser] = useState(true)
  const [branches, setBranches] = useState<string[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [generatingTitle, setGeneratingTitle] = useState(false)
  const draftCheckboxId = useId()
  const openBrowserCheckboxId = useId()

  const selectedRepo = useMemo(() => repos.find(r => r.id === repoId) ?? null, [repos, repoId])

  useEffect(() => {
    if (open) {
      setRepoId(initialRepoId ?? repos[0]?.id ?? '')
      setHead(initialHead ?? '')
      setBase(initialBase ?? '')
      setTitle('')
      setBody('')
      setDraft(false)
      setOpenBrowser(true)
    }
  }, [open, initialRepoId, initialHead, initialBase, repos])

  useEffect(() => {
    if (!selectedRepo) return
    if (!base && selectedRepo.defaultBaseBranch) setBase(selectedRepo.defaultBaseBranch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRepo])

  const loadBranches = async () => {
    if (!selectedRepo) return
    setLoadingBranches(true)
    try {
      const res = await window.api.pr.branchListRemote({ owner: selectedRepo.owner, repo: selectedRepo.repo })
      if (res.status === 'success' && res.data) {
        setBranches(res.data)
      } else {
        toast.error(res.message || t('prManager.createPr.toastLoadBranches'))
      }
    } finally {
      setLoadingBranches(false)
    }
  }

  useEffect(() => {
    if (open && selectedRepo) loadBranches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedRepo?.id])

  /** Tiêu đề mẫu: #123456-AME-XXX (max) (main|stage|...) từ commit trên head + base. */
  const handleGenerateIssueTitle = async () => {
    if (!selectedRepo) return
    const h = head.trim()
    const b = base.trim()
    if (!h || !b) {
      toast.error(t('prManager.createPr.toastSelectHeadBase'))
      return
    }
    if (!opLog.startOperation('prManager.operationLog.generateTitle')) return
    opLog.appendLine(t('prManager.operationLog.refCommit'))
    setGeneratingTitle(true)
    try {
      const res = await window.api.pr.refCommitMessages({
        owner: selectedRepo.owner,
        repo: selectedRepo.repo,
        ref: h,
        maxCommits: 500,
      })
      if (res.status !== 'success' || !res.data) {
        const msg = res.message || t('prManager.createPr.toastLoadHistory')
        opLog.finishError(msg)
        toast.error(msg)
        return
      }
      const picked = pickIssueKeyAndVersion(res.data, h)
      if (!picked) {
        opLog.finishError(t('prManager.createPr.toastPattern'))
        toast.error(t('prManager.createPr.toastPattern'))
        return
      }
      setTitle(buildIssueStylePrTitle(picked.key, picked.version, b))
      opLog.appendLine(t('prManager.operationLog.lineOk'))
      opLog.finishSuccess()
    } finally {
      setGeneratingTitle(false)
    }
  }

  const handleSubmit = async () => {
    if (!selectedRepo) return
    if (!head.trim() || !base.trim() || !title.trim()) {
      toast.error(t('prManager.createPr.toastFill'))
      return
    }
    if (head.trim() === base.trim()) {
      toast.error(t('prManager.createPr.toastSame'))
      return
    }
    if (!opLog.startOperation('prManager.operationLog.titleCreatePr')) return
    opLog.appendLine(
      t('prManager.operationLog.createSubmit', {
        head: head.trim(),
        base: base.trim(),
        draft: String(draft),
      })
    )
    setSubmitting(true)
    try {
      const res = await window.api.pr.prCreate({
        projectId,
        repoId: selectedRepo.id,
        owner: selectedRepo.owner,
        repo: selectedRepo.repo,
        title: title.trim(),
        body: body.trim(),
        head: head.trim(),
        base: base.trim(),
        draft,
        openInBrowser: openBrowser,
      })
      if (res.status === 'success') {
        opLog.appendLine(t('prManager.operationLog.lineOk'))
        if (res.trackingError) {
          opLog.appendLine(t('prManager.operationLog.lineError', { message: res.trackingError }))
        }
        opLog.finishSuccess()
        toast.success(t('prManager.createPr.toastCreated', { number: res.data?.number ?? 0 }))
        if (res.trackingError) {
          toast.error(t('prManager.createPr.toastTracking', { message: res.trackingError }))
        }
        onCreated?.()
        onOpenChange(false)
      } else {
        const msg = res.message || t('prManager.createPr.toastFail')
        opLog.finishError(msg)
        toast.error(msg)
      }
    } catch (e) {
      opLog.finishError(e instanceof Error ? e.message : t('prManager.bulk.toast.unexpected'))
    } finally {
      setSubmitting(false)
    }
  }

  const branchOptions = useMemo(() => branches.map(b => ({ value: b, label: b })), [branches])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitPullRequest className="h-5 w-5" /> {t('prManager.createPr.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          {/* Dòng 1: Repo */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t('prManager.createPr.repo')}</Label>
            <Combobox
              value={repoId}
              onValueChange={v => setRepoId(v)}
              options={repos.map(r => ({ value: r.id, label: `${r.owner}/${r.repo}` }))}
              placeholder={t('prManager.createPr.selectRepo')}
              emptyText={t('prManager.createPr.noRepos')}
              triggerClassName="w-full justify-between"
              disabled={isFromTable}
            />
          </div>

          {/* Dòng 2: Head → Base */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('prManager.createPr.head')}</Label>
              <Combobox
                value={head}
                onValueChange={v => setHead(v)}
                options={branchOptions}
                placeholder={t('prManager.createPr.sourceBranch')}
                emptyText={loadingBranches ? t('prManager.createPr.loading') : t('prManager.createPr.noBranches')}
                triggerClassName="w-full justify-between"
                disabled={isFromTable}
              />
            </div>
            <div className="flex items-center self-end pb-2 text-xs text-muted-foreground">
              →
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('prManager.createPr.base')}</Label>
              <Combobox
                value={base}
                onValueChange={v => setBase(v)}
                options={branchOptions}
                placeholder={t('prManager.createPr.targetBranch')}
                emptyText={loadingBranches ? t('prManager.createPr.loading') : t('prManager.createPr.noBranches')}
                triggerClassName="w-full justify-between"
                disabled={isFromTable}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs">{t('prManager.createPr.prTitle')}</Label>
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleGenerateIssueTitle()}
                  disabled={!selectedRepo || !head.trim() || !base.trim() || generatingTitle}
                  className="h-6 gap-1 text-xs"
                  title={t('prManager.createPr.generateTitle')}
                >
                  {generatingTitle ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {t('prManager.createPr.issueTitleButton')}
                </Button>
              </div>
            </div>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('prManager.createPr.prTitlePh')} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t('prManager.createPr.body')}</Label>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={t('prManager.createPr.bodyPh')}
              className="min-h-[120px]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Checkbox id={draftCheckboxId} checked={draft} onCheckedChange={v => setDraft(v === true)} />
              <Label htmlFor={draftCheckboxId} className="text-sm font-normal">
                {t('prManager.createPr.draft')}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id={openBrowserCheckboxId} checked={openBrowser} onCheckedChange={v => setOpenBrowser(v === true)} />
              <Label htmlFor={openBrowserCheckboxId} className="text-sm font-normal">
                {t('prManager.createPr.openBrowser')}
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('prManager.createPr.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('prManager.createPr.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
