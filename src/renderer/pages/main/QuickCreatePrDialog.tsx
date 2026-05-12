'use client'

import { GitPullRequest, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from '@/components/ui-elements/Toast'
import { buildIssueStylePrTitle, pickIssueKeyAndVersion } from '@/pages/prmanager/utils/buildIssuePrTitle'

const VERSION_SUFFIX_RE = /\(\d+\)\s*$/

function withDefaultVersion(prefix: string): string {
  const p = prefix.trim()
  if (!p) return ''
  return VERSION_SUFFIX_RE.test(p) ? p : `${p} (1)`
}

function buildSuggestedPrTitle(prefix: string, targetBranch: string): string {
  const p = prefix.trim()
  const t = targetBranch.trim()
  if (!p) return t ? `(${t})` : ''
  if (!t) return p
  return `${p} (${t})`
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  cwd: string | undefined
  /** Optional — chỉ để truyền vào API app user; không cần đăng ký repo trong PR Manager */
  projectId: string | null
  userId: string | null
  onCreated?: () => void
}

export function QuickCreatePrDialog({ open, onOpenChange, cwd, projectId, userId, onCreated }: Props) {
  const { t } = useTranslation()
  const [ownerRepo, setOwnerRepo] = useState<{ owner: string; repo: string } | null>(null)
  const [head, setHead] = useState('')
  const [base, setBase] = useState('')
  const [remoteBranches, setRemoteBranches] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [logEntries, setLogEntries] = useState<{ subject: string; body: string }[]>([])
  const [prTitle, setPrTitle] = useState('')
  const [titleDirty, setTitleDirty] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadingBranches(false)
      setHead('')
      setBase('')
      setRemoteBranches([])
      setOwnerRepo(null)
      setLogEntries([])
      setPrTitle('')
      setTitleDirty(false)
      try {
        if (!userId?.trim()) return
        if (!cwd?.trim()) return

        const gh = await window.api.pr.githubOwnerRepoFromCwd(cwd.trim())
        if (cancelled) return
        if (gh.status !== 'success' || !gh.data) {
          toast.error(gh.message || t('git.quickCreatePr.detectRemoteFail'))
          onOpenChange(false)
          return
        }
        setOwnerRepo(gh.data)

        const br = await window.api.git.get_branches(cwd)
        if (cancelled) return
        if (br.status !== 'success' || !br.data?.current) {
          toast.error(br.message || t('git.branchManage.loadError'))
          onOpenChange(false)
          return
        }
        const cur = br.data.current as string
        setHead(cur)

        setLoadingBranches(true)
        const remoteRes = await window.api.pr.branchListRemote({ owner: gh.data.owner, repo: gh.data.repo })
        if (cancelled) return
        setLoadingBranches(false)
        if (remoteRes.status !== 'success' || !remoteRes.data) {
          toast.error(remoteRes.message || t('prManager.createPr.toastLoadBranches'))
          return
        }
        setRemoteBranches(remoteRes.data)
        const opts = remoteRes.data.filter(b => b !== cur)
        const def = opts.find(b => b === 'main' || b === 'master') ?? opts[0] ?? ''
        setBase(def)
        if (opts.length === 0) {
          toast.warning(t('git.quickCreatePr.noTargetBranch'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, cwd, userId, t, onOpenChange])

  useEffect(() => {
    if (!open || !cwd?.trim() || !head) {
      setLogEntries([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await window.api.git.log('.', { cwd: cwd.trim(), maxCount: 500, messagesOnly: true })
        if (cancelled) return
        if (res.status !== 'success' || !res.data) {
          setLogEntries([])
          return
        }
        const parsed = JSON.parse(res.data as string) as { subject: string; body: string }[]
        setLogEntries(Array.isArray(parsed) ? parsed : [])
      } catch {
        if (!cancelled) setLogEntries([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, cwd, head])

  useEffect(() => {
    if (!open || !cwd?.trim()) return
    const refreshHead = async () => {
      const br = await window.api.git.get_branches(cwd.trim())
      if (br.status === 'success' && br.data?.current) {
        setTitleDirty(false)
        setHead(br.data.current as string)
      }
    }
    const onBranchChanged = () => {
      void refreshHead()
    }
    window.addEventListener('git-branch-changed', onBranchChanged)
    return () => window.removeEventListener('git-branch-changed', onBranchChanged)
  }, [open, cwd])

  const suggestedTitle = useMemo(() => {
    const messages = logEntries.map(e => {
      const sub = e.subject ?? ''
      const body = e.body?.trim() ? e.body : ''
      const full = body ? `${sub}\n${body}` : sub
      return full.trim()
    })
    const picked = pickIssueKeyAndVersion(messages, head)
    const t = base.trim()
    if (picked) {
      if (!t) return `${picked.key} (${picked.version})`
      return buildIssueStylePrTitle(picked.key, picked.version, base)
    }
    return buildSuggestedPrTitle(withDefaultVersion(head), base)
  }, [logEntries, head, base])

  useEffect(() => {
    if (!titleDirty) setPrTitle(suggestedTitle)
  }, [suggestedTitle, titleDirty])

  const baseOptions = useMemo(() => remoteBranches.filter(b => b !== head).map(b => ({ value: b, label: b })), [remoteBranches, head])

  const handleSubmit = async () => {
    if (!ownerRepo || !head.trim() || !base.trim() || !prTitle.trim()) {
      toast.error(t('prManager.createPr.toastFill'))
      return
    }
    if (head.trim() === base.trim()) {
      toast.error(t('prManager.createPr.toastSame'))
      return
    }
    if (!userId?.trim()) {
      toast.error(t('git.quickCreatePr.needLogin'))
      return
    }
    setSubmitting(true)
    try {
      const res = await window.api.pr.prCreate({
        projectId: projectId?.trim() ?? '',
        repoId: '',
        owner: ownerRepo.owner,
        repo: ownerRepo.repo,
        title: prTitle.trim(),
        body: '',
        head: head.trim(),
        base: base.trim(),
        draft: false,
        openInBrowser: true,
        userId: userId.trim(),
        skipPrManagerTracking: true,
      })
      if (res.status === 'success') {
        toast.success(t('prManager.createPr.toastCreated', { number: res.data?.number ?? 0 }))
        onCreated?.()
        onOpenChange(false)
      } else {
        toast.error(res.message || t('prManager.createPr.toastFail'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-3 sm:max-w-[22rem] sm:p-3">
        <DialogHeader className="space-y-0 pb-2">
          <DialogTitle className="flex items-center gap-1.5 text-sm font-medium leading-tight">
            <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            {t('git.quickCreatePr.title')}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-5">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-2">
            <div className="space-y-0.5">
              <Label className="text-[11px] text-muted-foreground">{t('git.quickCreatePr.currentBranch')}</Label>
              <Input value={head} disabled readOnly className="h-8 font-mono text-xs" />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[11px] text-muted-foreground">{t('git.quickCreatePr.targetBranch')}</Label>
              <Combobox
                value={base}
                onValueChange={setBase}
                options={baseOptions}
                placeholder={t('prManager.createPr.targetBranch')}
                emptyText={loadingBranches ? t('prManager.createPr.loading') : t('prManager.createPr.noBranches')}
                triggerClassName="h-8 min-h-8 w-full justify-between px-2 text-xs"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[11px] text-muted-foreground">{t('git.quickCreatePr.prName')}</Label>
              <Input
                value={prTitle}
                onChange={e => {
                  setTitleDirty(true)
                  setPrTitle(e.target.value)
                }}
                placeholder={t('git.quickCreatePr.prNamePlaceholder')}
                className="h-8 text-xs"
                spellCheck={false}
              />
            </div>
          </div>
        )}
        <DialogFooter className="mt-3 pt-0 sm:justify-end">
          <Button
            type="button"
            size="sm"
            className="h-8 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
            onClick={() => void handleSubmit()}
            disabled={submitting || loading || !head || !base || !prTitle.trim()}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('prManager.createPr.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
