'use client'

import { Loader2, Pencil, Plus, Trash2, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import type { PrAutomation, PrRepo } from '../hooks/usePrData'
import { PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE } from '../prManagerButtonStyles'

type Props = {
  automations: PrAutomation[]
  repos: PrRepo[]
  onRefresh: () => void
}

export function AutomationsTab({ automations, repos, onRefresh }: Props) {
  const { t } = useTranslation()
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [repoId, setRepoId] = useState('')
  const [name, setName] = useState('')
  const [triggerEvent, setTriggerEvent] = useState<'pr_merged'>('pr_merged')
  const [sourcePattern, setSourcePattern] = useState('')
  const [targetBranch, setTargetBranch] = useState('')
  const [action, setAction] = useState<'create_pr'>('create_pr')
  const [nextTarget, setNextTarget] = useState('')
  const [prTitleTpl, setPrTitleTpl] = useState('')
  const [prBodyTpl, setPrBodyTpl] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const repoById = useMemo(() => {
    const m = new Map<string, PrRepo>()
    for (const r of repos) m.set(r.id, r)
    return m
  }, [repos])

  const resetForm = () => {
    setEditId(null)
    setRepoId(repos[0]?.id ?? '')
    setName('')
    setTriggerEvent('pr_merged')
    setSourcePattern('hotfix/*')
    setTargetBranch('stage')
    setAction('create_pr')
    setNextTarget('main')
    setPrTitleTpl('{chainedPrTitle}')
    setPrBodyTpl(t('prManager.automations.defaultBody'))
    setIsActive(true)
  }

  const openEdit = (a: PrAutomation) => {
    setEditId(a.id)
    setRepoId(a.repoId)
    setName(a.name ?? '')
    setTriggerEvent(a.triggerEvent as 'pr_merged')
    setSourcePattern(a.sourcePattern ?? '')
    setTargetBranch(a.targetBranch ?? '')
    setAction(a.action as 'create_pr')
    setNextTarget(a.nextTarget ?? '')
    setPrTitleTpl(a.prTitleTemplate ?? '')
    setPrBodyTpl(a.prBodyTemplate ?? '')
    setIsActive(a.isActive)
    setEditOpen(true)
  }

  const openCreate = () => {
    resetForm()
    setEditOpen(true)
  }

  const handleSubmit = async () => {
    if (!repoId) {
      toast.error(t('prManager.automations.toastSelectRepo'))
      return
    }
    setSubmitting(true)
    try {
      const res = await window.api.pr.automationUpsert({
        id: editId ?? undefined,
        repoId,
        name: name.trim() || null,
        triggerEvent,
        sourcePattern: sourcePattern.trim() || null,
        targetBranch: targetBranch.trim() || null,
        action,
        nextTarget: nextTarget.trim() || null,
        prTitleTemplate: prTitleTpl.trim() || null,
        prBodyTemplate: prBodyTpl.trim() || null,
        isActive,
      })
      if (res.status === 'success') {
        toast.success(editId ? t('prManager.automations.saveOkUpdate') : t('prManager.automations.saveOkCreate'))
        setEditOpen(false)
        onRefresh()
      } else {
        toast.error(res.message || t('prManager.automations.saveFail'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggle = async (a: PrAutomation) => {
    const res = await window.api.pr.automationToggle(a.id, !a.isActive)
    if (res.status === 'success') onRefresh()
    else toast.error(res.message || t('prManager.automations.toggleFail'))
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const res = await window.api.pr.automationDelete(deleteId)
    if (res.status === 'success') {
      toast.success(t('prManager.automations.deleteOk'))
      setDeleteId(null)
      onRefresh()
    } else toast.error(res.message || t('prManager.automations.deleteFail'))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="h-4 w-4" />
          <span>{t('prManager.automations.intro')}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={openCreate}
          className={cn('ml-auto', PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE)}
          disabled={repos.length === 0}
        >
          <Plus className="h-3.5 w-3.5" /> {t('prManager.automations.create')}
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px]">{t('prManager.automations.colOn')}</TableHead>
              <TableHead>{t('prManager.automations.colName')}</TableHead>
              <TableHead>{t('prManager.automations.colRepo')}</TableHead>
              <TableHead>{t('prManager.automations.colTrigger')}</TableHead>
              <TableHead>{t('prManager.automations.colSource')}</TableHead>
              <TableHead>{t('prManager.automations.colTargetNext')}</TableHead>
              <TableHead className="w-20 max-w-20">{t('prManager.automations.colActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {automations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  {t('prManager.automations.empty')}
                </TableCell>
              </TableRow>
            ) : (
              automations.map(a => {
                const repo = repoById.get(a.repoId)
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Switch checked={a.isActive} onCheckedChange={() => handleToggle(a)} />
                    </TableCell>
                    <TableCell className="font-medium">{a.name ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{repo ? `${repo.owner}/${repo.repo}` : a.repoId.substring(0, 8)}</TableCell>
                    <TableCell className="text-xs">{a.triggerEvent}</TableCell>
                    <TableCell className="font-mono text-xs">{a.sourcePattern ?? '*'}</TableCell>
                    <TableCell className="text-xs">
                      <span className="font-mono">{a.targetBranch ?? '?'}</span>
                      <span className="mx-1 text-muted-foreground">→</span>
                      <span className="font-mono">{a.nextTarget ?? '?'}</span>
                    </TableCell>
                    <TableCell className="w-20 max-w-20 px-1">
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(a)}
                          className="h-7 w-7"
                          aria-label={t('prManager.automations.edit')}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(a.id)} className="h-7 w-7 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editId ? t('prManager.automations.editTitle') : t('prManager.automations.newTitle')}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('prManager.automations.colRepo')}</Label>
              <Combobox
                value={repoId}
                onValueChange={setRepoId}
                options={repos.map(r => ({ value: r.id, label: `${r.owner}/${r.repo}` }))}
                placeholder={t('prManager.automations.selectRepo')}
                emptyText={t('prManager.automations.noRepos')}
                triggerClassName="w-full justify-between"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1">
                <Label className="text-xs">{t('prManager.automations.nameOptional')}</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('prManager.automations.namePh')} />
              </div>
              <div className="min-w-0 space-y-1">
                <Label className="text-xs">{t('prManager.automations.trigger')}</Label>
                <Select value={triggerEvent} onValueChange={v => setTriggerEvent(v as 'pr_merged')}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pr_merged">{t('prManager.automations.triggerPrMerged')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('prManager.automations.sourcePattern')}</Label>
                <Input value={sourcePattern} onChange={e => setSourcePattern(e.target.value)} placeholder="hotfix/*" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('prManager.automations.targetMerged')}</Label>
                <Input value={targetBranch} onChange={e => setTargetBranch(e.target.value)} placeholder={t('prManager.automations.targetPh')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1">
                <Label className="text-xs">{t('prManager.automations.action')}</Label>
                <Select value={action} onValueChange={v => setAction(v as 'create_pr')}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create_pr">{t('prManager.automations.actionCreatePr')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1">
                <Label className="text-xs">{t('prManager.automations.nextTarget')}</Label>
                <Input value={nextTarget} onChange={e => setNextTarget(e.target.value)} placeholder={t('prManager.automations.nextPh')} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t('prManager.automations.prTitleTemplate')}</Label>
              <Input
                value={prTitleTpl}
                onChange={e => setPrTitleTpl(e.target.value)}
                placeholder="{chainedPrTitle}"
              />
              <p className="text-[10px] text-muted-foreground">
                {t('prManager.automations.prTitleTemplateHint', {
                  chainedPrTitle: '{chainedPrTitle}',
                  mergedPrTitle: '{mergedPrTitle}',
                  sourceBranch: '{sourceBranch}',
                  targetBranch: '{targetBranch}',
                  nextTarget: '{nextTarget}',
                  prNumber: '{prNumber}',
                })}
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t('prManager.automations.prBodyTemplate')}</Label>
              <Textarea
                value={prBodyTpl}
                onChange={e => setPrBodyTpl(e.target.value)}
                placeholder={t('prManager.automations.prBodyPh')}
                className="min-h-[90px]"
              />
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Switch id="pr-automation-edit-active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="pr-automation-edit-active" className="cursor-pointer font-normal">
                {t('prManager.automations.active')}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t('prManager.automations.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('prManager.automations.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('prManager.automations.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('prManager.automations.deleteDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('prManager.automations.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
