'use client'

import { AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import type { PrCheckpointTemplate, PrRepo, TrackedBranchRow } from '../hooks/usePrData'
import { buildIssueStylePrTitle, pickIssueKeyAndVersion } from '../utils/buildIssuePrTitle'
import {
  activePrTemplates,
  type BulkActionKind,
  type BulkCreatePrTarget,
  type BulkDeleteBranchTarget,
  type BulkPrRowTarget,
  resolveBulkCreatePrTargets,
  resolveBulkDeleteBranchTargets,
  resolveBulkPrTargets,
} from './prBoardBulkResolve'

type MergeMethod = 'squash' | 'merge' | 'rebase'

type RowResult = { ok: boolean; message?: string }

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  kind: BulkActionKind
  projectId: string
  selectedRows: TrackedBranchRow[]
  repos: PrRepo[]
  activeTemplates: PrCheckpointTemplate[]
  remoteExistMap: Record<string, boolean> | null
  onlyExistingOnRemote: boolean
  githubTokenOk: boolean
  onAfterBatch: () => void
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export function PrBulkActionsDialog({
  open,
  onOpenChange,
  kind,
  projectId,
  selectedRows,
  repos,
  activeTemplates,
  remoteExistMap,
  onlyExistingOnRemote,
  githubTokenOk,
  onAfterBatch,
}: Props) {
  const { t } = useTranslation()
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>('squash')
  const [enabledIds, setEnabledIds] = useState<Set<string>>(() => new Set())
  const [running, setRunning] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, RowResult>>({})

  const prTemplates = useMemo(() => activePrTemplates(activeTemplates), [activeTemplates])
  const [createTemplateId, setCreateTemplateId] = useState<string>(() => prTemplates[0]?.id ?? '')
  const [createBaseOverride, setCreateBaseOverride] = useState('')
  const [createDraft, setCreateDraft] = useState(false)
  const [createTitles, setCreateTitles] = useState<Record<string, string>>({})
  const [suggestingTitles, setSuggestingTitles] = useState(false)

  useEffect(() => {
    if (open && prTemplates.length > 0 && !prTemplates.some(x => x.id === createTemplateId)) {
      setCreateTemplateId(prTemplates[0].id)
    }
  }, [open, prTemplates, createTemplateId])

  const createTemplate = useMemo(() => prTemplates.find(x => x.id === createTemplateId) ?? prTemplates[0] ?? null, [prTemplates, createTemplateId])

  const prTargets: BulkPrRowTarget[] = useMemo(() => {
    if (kind === 'deleteRemoteBranch' || kind === 'createPr' || !githubTokenOk) return []
    return resolveBulkPrTargets(kind, selectedRows, activeTemplates, repos)
  }, [kind, selectedRows, activeTemplates, repos, githubTokenOk])

  const deleteTargets: BulkDeleteBranchTarget[] = useMemo(() => {
    if (kind !== 'deleteRemoteBranch' || !githubTokenOk) return []
    return resolveBulkDeleteBranchTargets(selectedRows, repos, activeTemplates, remoteExistMap, onlyExistingOnRemote)
  }, [kind, selectedRows, repos, activeTemplates, remoteExistMap, onlyExistingOnRemote, githubTokenOk])

  const createTargets: BulkCreatePrTarget[] = useMemo(() => {
    if (kind !== 'createPr' || !createTemplate || !githubTokenOk) return []
    const base = createBaseOverride.trim() || null
    return resolveBulkCreatePrTargets(selectedRows, createTemplate, base, repos, remoteExistMap, onlyExistingOnRemote)
  }, [kind, createTemplate, createBaseOverride, selectedRows, repos, remoteExistMap, onlyExistingOnRemote, githubTokenOk])

  useEffect(() => {
    if (!open) return
    if (kind === 'createPr') {
      const next = new Set(createTargets.filter(x => x.eligible).map(x => x.id))
      setEnabledIds(next)
      const titles: Record<string, string> = {}
      for (const x of createTargets) {
        if (x.eligible) titles[x.id] = x.suggestedTitle
      }
      setCreateTitles(titles)
      setResults({})
      setCurrentId(null)
      return
    }
    if (kind === 'deleteRemoteBranch') {
      setEnabledIds(new Set(deleteTargets.filter(x => x.eligible).map(x => x.id)))
    } else {
      setEnabledIds(new Set(prTargets.filter(x => x.eligible).map(x => x.id)))
    }
    setResults({})
    setCurrentId(null)
  }, [open, kind, prTargets, deleteTargets, createTargets])

  const titleKey = useMemo(() => `prManager.bulk.title.${kind}` as const, [kind])

  const eligibleCount = useMemo(() => {
    if (kind === 'deleteRemoteBranch') return deleteTargets.filter(x => x.eligible && enabledIds.has(x.id)).length
    if (kind === 'createPr') return createTargets.filter(x => x.eligible && enabledIds.has(x.id)).length
    return prTargets.filter(x => x.eligible && enabledIds.has(x.id)).length
  }, [kind, prTargets, deleteTargets, createTargets, enabledIds])

  const toggleId = useCallback(
    (id: string, eligible: boolean) => {
      if (!eligible || running) return
      setEnabledIds(prev => {
        const n = new Set(prev)
        if (n.has(id)) n.delete(id)
        else n.add(id)
        return n
      })
    },
    [running]
  )

  const runBatch = async () => {
    if (!githubTokenOk || running) return
    setRunning(true)
    setResults({})
    try {
      if (kind === 'merge') {
        const list = prTargets.filter(x => x.eligible && enabledIds.has(x.id))
        for (const item of list) {
          setCurrentId(item.id)
          const commitTitle = (item.ghTitle?.trim() || `PR #${item.prNumber}`).slice(0, 256)
          const res = await window.api.pr.prMerge({
            projectId,
            repoId: item.repoId,
            owner: item.owner,
            repo: item.repo,
            number: item.prNumber,
            method: mergeMethod,
            commitTitle,
            commitMessage: '',
          })
          if (res.status === 'success' && res.data?.merged) {
            setResults(prev => ({ ...prev, [item.id]: { ok: true } }))
          } else {
            setResults(prev => ({
              ...prev,
              [item.id]: { ok: false, message: res.message || res.data?.message || t('prManager.bulk.toast.mergeFail') },
            }))
          }
          await sleep(200)
        }
      } else if (kind === 'close') {
        const list = prTargets.filter(x => x.eligible && enabledIds.has(x.id))
        for (const item of list) {
          setCurrentId(item.id)
          const res = await window.api.pr.prClose({ owner: item.owner, repo: item.repo, number: item.prNumber })
          if (res.status === 'success') {
            setResults(prev => ({ ...prev, [item.id]: { ok: true } }))
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
          }
          await sleep(200)
        }
      } else if (kind === 'draft') {
        const list = prTargets.filter(x => x.eligible && enabledIds.has(x.id))
        for (const item of list) {
          setCurrentId(item.id)
          const res = await window.api.pr.prMarkDraft({ owner: item.owner, repo: item.repo, number: item.prNumber })
          if (res.status === 'success') {
            setResults(prev => ({ ...prev, [item.id]: { ok: true } }))
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
          }
          await sleep(200)
        }
      } else if (kind === 'ready') {
        const list = prTargets.filter(x => x.eligible && enabledIds.has(x.id))
        for (const item of list) {
          setCurrentId(item.id)
          const res = await window.api.pr.prMarkReady({ owner: item.owner, repo: item.repo, number: item.prNumber })
          if (res.status === 'success') {
            setResults(prev => ({ ...prev, [item.id]: { ok: true } }))
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
          }
          await sleep(200)
        }
      } else if (kind === 'updateBranch') {
        const list = prTargets.filter(x => x.eligible && enabledIds.has(x.id))
        for (const item of list) {
          setCurrentId(item.id)
          const g = await window.api.pr.prGet({ owner: item.owner, repo: item.repo, number: item.prNumber })
          if (g.status !== 'success' || !g.data?.headSha) {
            setResults(prev => ({
              ...prev,
              [item.id]: { ok: false, message: g.message || t('prManager.bulk.toast.noHeadSha') },
            }))
            await sleep(200)
            continue
          }
          const res = await window.api.pr.prUpdateBranch({
            owner: item.owner,
            repo: item.repo,
            number: item.prNumber,
            expectedHeadSha: g.data.headSha as string,
          })
          if (res.status === 'success') {
            setResults(prev => ({ ...prev, [item.id]: { ok: true } }))
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
          }
          await sleep(200)
        }
      } else if (kind === 'deleteRemoteBranch') {
        const list = deleteTargets.filter(x => x.eligible && enabledIds.has(x.id))
        for (const item of list) {
          setCurrentId(item.id)
          const res = await window.api.pr.githubDeleteRemoteBranch({
            owner: item.owner,
            repo: item.repo,
            branch: item.branch,
            repoId: item.repoId,
          })
          if (res.status === 'success') {
            setResults(prev => ({ ...prev, [item.id]: { ok: true } }))
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
          }
          await sleep(250)
        }
      } else if (kind === 'createPr') {
        const list = createTargets.filter(x => x.eligible && enabledIds.has(x.id))
        for (const item of list) {
          setCurrentId(item.id)
          const title = (createTitles[item.id] ?? item.suggestedTitle).trim()
          if (!title) {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: t('prManager.bulk.toast.emptyTitle') } }))
            await sleep(100)
            continue
          }
          const res = await window.api.pr.prCreate({
            projectId,
            repoId: item.repoId,
            owner: item.owner,
            repo: item.repo,
            title,
            body: '',
            head: item.head,
            base: item.base,
            draft: createDraft,
            openInBrowser: false,
          })
          if (res.status === 'success') {
            setResults(prev => ({ ...prev, [item.id]: { ok: true } }))
          } else {
            setResults(prev => ({ ...prev, [item.id]: { ok: false, message: res.message } }))
          }
          await sleep(200)
        }
      }

      onAfterBatch()
      toast.success(t('prManager.bulk.toast.doneToast'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('prManager.bulk.toast.unexpected'))
    } finally {
      setCurrentId(null)
      setRunning(false)
    }
  }

  const handleSuggestAllTitles = async () => {
    if (!createTemplate || suggestingTitles) return
    setSuggestingTitles(true)
    try {
      const list = createTargets.filter(x => x.eligible && enabledIds.has(x.id))
      for (const item of list) {
        const res = await window.api.pr.refCommitMessages({
          owner: item.owner,
          repo: item.repo,
          ref: item.head,
          maxCommits: 500,
        })
        if (res.status === 'success' && res.data) {
          const picked = pickIssueKeyAndVersion(res.data, item.head)
          if (picked) {
            setCreateTitles(prev => ({
              ...prev,
              [item.id]: buildIssueStylePrTitle(picked.key, picked.version, item.base),
            }))
          }
        }
        await sleep(120)
      }
    } finally {
      setSuggestingTitles(false)
    }
  }

  const closeDialog = () => {
    if (running) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => !running && onOpenChange(v)}>
      <DialogContent className="font-sans flex max-h-[min(90dvh,720px)] min-h-0 w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 text-left">
          <DialogTitle className="text-base">{t(titleKey)}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t('prManager.bulk.summary', {
              rows: selectedRows.length,
              run: eligibleCount,
            })}
          </p>
          {!githubTokenOk ? (
            <p className="mt-1 flex items-center gap-1 text-sm text-amber-800 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {t('prManager.bulk.noToken')}
            </p>
          ) : null}
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3">
          {kind === 'createPr' ? (
            <div className="shrink-0 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('prManager.bulk.createTemplate')}</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={createTemplateId}
                  onChange={e => setCreateTemplateId(e.target.value)}
                  disabled={running || prTemplates.length === 0}
                >
                  {prTemplates.map(tpl => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.label} ({tpl.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('prManager.bulk.baseOverride')}</Label>
                <Input
                  value={createBaseOverride}
                  onChange={e => setCreateBaseOverride(e.target.value)}
                  placeholder={t('prManager.bulk.basePlaceholder')}
                  disabled={running}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox id="bulk-create-draft" checked={createDraft} onCheckedChange={v => setCreateDraft(v === true)} disabled={running} />
                <Label htmlFor="bulk-create-draft" className="cursor-pointer text-sm font-normal">
                  {t('prManager.bulk.createAsDraft')}
                </Label>
              </div>
              <div className="sm:col-span-2">
                <Button type="button" variant="outline" size="sm" className="gap-1" disabled={running || suggestingTitles} onClick={() => void handleSuggestAllTitles()}>
                  {suggestingTitles ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {t('prManager.bulk.suggestTitles')}
                </Button>
              </div>
            </div>
          ) : null}

          {kind === 'merge' ? (
            <div className="shrink-0 space-y-2">
              <Label className="text-xs">{t('prManager.bulk.mergeMethod')}</Label>
              <RadioGroup value={mergeMethod} onValueChange={v => setMergeMethod(v as MergeMethod)} className="flex flex-wrap gap-3">
                {(['squash', 'merge', 'rebase'] as const).map(m => (
                  <div key={m} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={m} id={`bulk-merge-${m}`} disabled={running} />
                    <Label htmlFor={`bulk-merge-${m}`} className="cursor-pointer font-normal">
                      {t(`prManager.mergePr.method.${m}`)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ) : null}

          <div className="max-h-[min(52dvh,420px)] w-full overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 px-2" />
                  <TableHead className="text-xs">{t('prManager.bulk.colWhat')}</TableHead>
                  <TableHead className="w-[100px] text-xs">{t('prManager.bulk.colStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kind === 'deleteRemoteBranch'
                  ? deleteTargets.map(item => (
                    <TableRow key={item.id} className={cn(!item.eligible && 'opacity-60')}>
                      <TableCell className="px-2">
                        <Checkbox checked={enabledIds.has(item.id)} disabled={!item.eligible || running} onCheckedChange={() => toggleId(item.id, item.eligible)} />
                      </TableCell>
                      <TableCell className="max-w-[1px] p-2 text-xs">
                        <div className="truncate font-mono" title={`${item.owner}/${item.repo}@${item.branch}`}>
                          {item.owner}/{item.repo}
                        </div>
                        <div className="truncate text-muted-foreground">{item.branch}</div>
                        {!item.eligible && item.skipReasonKey ? <div className="mt-0.5 text-[10px] text-amber-800 dark:text-amber-200">{t(item.skipReasonKey)}</div> : null}
                      </TableCell>
                      <TableCell className="p-2 text-xs">
                        {running && currentId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {results[item.id] ? (
                          results[item.id].ok ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <span className="text-[10px] text-rose-600" title={results[item.id].message}>
                              {t('prManager.bulk.error')}
                            </span>
                          )
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                  : null}

                {kind === 'createPr'
                  ? createTargets.map(item => (
                    <TableRow key={item.id} className={cn(!item.eligible && 'opacity-60')}>
                      <TableCell className="px-2">
                        <Checkbox checked={enabledIds.has(item.id)} disabled={!item.eligible || running} onCheckedChange={() => toggleId(item.id, item.eligible)} />
                      </TableCell>
                      <TableCell className="max-w-[1px] p-2 text-xs">
                        <div className="truncate">
                          {item.owner}/{item.repo} · {item.head} → {item.base}
                        </div>
                        <Input
                          value={createTitles[item.id] ?? ''}
                          onChange={e => setCreateTitles(prev => ({ ...prev, [item.id]: e.target.value }))}
                          disabled={!item.eligible || running}
                          className="mt-1 h-8 text-xs"
                          placeholder={item.suggestedTitle}
                        />
                        {!item.eligible && item.skipReasonKey ? <div className="mt-0.5 text-[10px] text-amber-800 dark:text-amber-200">{t(item.skipReasonKey)}</div> : null}
                      </TableCell>
                      <TableCell className="p-2 text-xs">
                        {running && currentId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {results[item.id] ? (
                          results[item.id].ok ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <span className="text-[10px] text-rose-600" title={results[item.id].message}>
                              {t('prManager.bulk.error')}
                            </span>
                          )
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                  : null}

                {kind !== 'deleteRemoteBranch' && kind !== 'createPr'
                  ? prTargets.map(item => (
                    <TableRow key={item.id} className={cn(!item.eligible && 'opacity-60')}>
                      <TableCell className="px-2">
                        <Checkbox checked={enabledIds.has(item.id)} disabled={!item.eligible || running} onCheckedChange={() => toggleId(item.id, item.eligible)} />
                      </TableCell>
                      <TableCell className="max-w-[1px] p-2 text-xs">
                        <div className="truncate">
                          #{item.prNumber} · {item.templateLabel}
                        </div>
                        <div className="truncate text-muted-foreground">
                          {item.owner}/{item.repo} · {item.headBranch}
                          {item.baseBranch ? ` → ${item.baseBranch}` : ''}
                        </div>
                        {!item.eligible && item.skipReasonKey ? <div className="mt-0.5 text-[10px] text-amber-800 dark:text-amber-200">{t(item.skipReasonKey)}</div> : null}
                      </TableCell>
                      <TableCell className="p-2 text-xs">
                        {running && currentId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {results[item.id] ? (
                          results[item.id].ok ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <span className="text-[10px] text-rose-600" title={results[item.id].message}>
                              {t('prManager.bulk.error')}
                            </span>
                          )
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                  : null}

                {kind === 'deleteRemoteBranch' && deleteTargets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      {t('prManager.bulk.empty')}
                    </TableCell>
                  </TableRow>
                ) : null}
                {kind === 'createPr' && createTargets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      {t('prManager.bulk.empty')}
                    </TableCell>
                  </TableRow>
                ) : null}
                {kind !== 'deleteRemoteBranch' && kind !== 'createPr' && prTargets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      {t('prManager.bulk.emptyPr')}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t px-4 py-3">
          <Button type="button" variant="outline" onClick={closeDialog} disabled={running}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void runBatch()} disabled={running || !githubTokenOk || eligibleCount === 0}>
            {running ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                {t('prManager.bulk.running')}
              </>
            ) : (
              t('prManager.bulk.runButton', { count: eligibleCount })
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
