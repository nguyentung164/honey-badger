'use client'

import { ChevronRight, FileDown, FolderTree, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TestCatalogGroup, TestCatalogPage, TestFlow } from 'shared/automation/types'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { filterPagesByCatalogGroupSubtree } from '@/pages/automation/map/pageMapGraph'
import { CaseTable } from './CaseTable'

function flatGroupOptions(groups: TestCatalogGroup[]): Array<{ id: string; depth: number; name: string }> {
  const children = new Map<string | null, TestCatalogGroup[]>()
  for (const g of groups) {
    const p = g.parentGroupId ?? null
    if (!children.has(p)) children.set(p, [])
    const bucket = children.get(p)
    if (bucket) bucket.push(g)
  }
  for (const [, arr] of children) arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const out: Array<{ id: string; depth: number; name: string }> = []
  function walk(pid: string | null, depth: number) {
    for (const g of children.get(pid) ?? []) {
      out.push({ id: g.id, depth, name: g.name })
      walk(g.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

interface Props {
  projectId: string
  /** Khi mở từ Page map / shell: chọn catalog page này sau khi load danh sách. */
  initialCatalogPageId?: string | null
  /** Khi mở từ Page map: lọc theo nhóm catalog (expand cây con). */
  initialCatalogGroupId?: string | null
  onInitialCatalogIntentConsumed?: () => void
}

export function CasesWorkspace({ projectId, initialCatalogPageId, initialCatalogGroupId, onInitialCatalogIntentConsumed }: Props) {
  const { t } = useTranslation()
  const [pages, setPages] = useState<TestCatalogPage[]>([])
  const [groups, setGroups] = useState<TestCatalogGroup[]>([])
  const [flows, setFlows] = useState<TestFlow[]>([])
  const [pageId, setPageId] = useState<string | null>(null)
  const [flowId, setFlowId] = useState<string | null>(null)
  const [catalogGroupFilterId, setCatalogGroupFilterId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [newPageOpen, setNewPageOpen] = useState(false)
  const [newPageName, setNewPageName] = useState('')
  const [newFlowOpen, setNewFlowOpen] = useState(false)
  const [newFlowName, setNewFlowName] = useState('')
  const [deletePageTarget, setDeletePageTarget] = useState<TestCatalogPage | null>(null)
  const [deleteFlowTarget, setDeleteFlowTarget] = useState<TestFlow | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const pageIdRef = useRef<string | null>(null)
  const flowIdRef = useRef<string | null>(null)
  pageIdRef.current = pageId
  flowIdRef.current = flowId

  const loadCatalogGraph = useCallback(async () => {
    const res = await window.api.automation.catalogGroup.listGraph(projectId)
    if (res.status === 'success' && res.data) {
      setPages(res.data.pages)
      setGroups(res.data.groups)
      return { pages: res.data.pages, groups: res.data.groups }
    }
    setPages([])
    setGroups([])
    return { pages: [] as TestCatalogPage[], groups: [] as TestCatalogGroup[] }
  }, [projectId])

  const loadFlows = useCallback(async (pid: string) => {
    const res = await window.api.automation.flow.list(pid)
    if (res.status === 'success' && res.data) {
      setFlows(res.data)
      return res.data
    }
    setFlows([])
    return []
  }, [])

  const selectPage = useCallback(async (pid: string) => {
    setPageId(pid)
    const flist = await loadFlows(pid)
    setFlowId(flist[0]?.id ?? null)
  }, [loadFlows])

  const refreshCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const { pages: plist, groups: glist } = await loadCatalogGraph()
      let nextPageId = pageIdRef.current
      const visible = filterPagesByCatalogGroupSubtree(plist, glist, catalogGroupFilterId)
      if (!nextPageId || !plist.some(p => p.id === nextPageId)) nextPageId = plist[0]?.id ?? null
      else if (catalogGroupFilterId && !visible.some(p => p.id === nextPageId)) nextPageId = visible[0]?.id ?? null
      setPageId(nextPageId)
      if (!nextPageId) {
        setFlows([])
        setFlowId(null)
        return
      }
      const flist = await loadFlows(nextPageId)
      let nextFlowId = flowIdRef.current
      if (!nextFlowId || !flist.some(f => f.id === nextFlowId)) nextFlowId = flist[0]?.id ?? null
      setFlowId(nextFlowId)
    } finally {
      setLoading(false)
    }
  }, [loadFlows, loadCatalogGraph, catalogGroupFilterId])

  useEffect(() => {
    void refreshCatalog()
  }, [projectId, refreshCatalog])

  useEffect(() => {
    if (!initialCatalogPageId || loading) return
    if (pages.length === 0) return
    if (!pages.some(p => p.id === initialCatalogPageId)) {
      onInitialCatalogIntentConsumed?.()
      return
    }
    void (async () => {
      await selectPage(initialCatalogPageId)
      onInitialCatalogIntentConsumed?.()
    })()
  }, [initialCatalogPageId, loading, pages, onInitialCatalogIntentConsumed, selectPage])

  useEffect(() => {
    if (!initialCatalogGroupId || loading) return
    if (groups.length === 0) return
    if (!groups.some(g => g.id === initialCatalogGroupId)) {
      onInitialCatalogIntentConsumed?.()
      return
    }
    setCatalogGroupFilterId(initialCatalogGroupId)
    onInitialCatalogIntentConsumed?.()
  }, [initialCatalogGroupId, loading, groups, onInitialCatalogIntentConsumed])

  useEffect(() => {
    setCatalogGroupFilterId(null)
  }, [projectId])

  const selectedPage = useMemo(() => pages.find(p => p.id === pageId) ?? null, [pages, pageId])
  const selectedFlow = useMemo(() => flows.find(f => f.id === flowId) ?? null, [flows, flowId])

  const filteredPages = useMemo(() => filterPagesByCatalogGroupSubtree(pages, groups, catalogGroupFilterId), [pages, groups, catalogGroupFilterId])

  useEffect(() => {
    if (loading) return
    if (!catalogGroupFilterId) return
    const visible = filteredPages
    if (pageId && visible.length > 0 && !visible.some(p => p.id === pageId)) {
      const next = visible[0]?.id
      if (next) void selectPage(next)
    }
  }, [catalogGroupFilterId, loading, filteredPages, pageId, selectPage])

  const handleCreatePage = async () => {
    const name = newPageName.trim()
    if (!name) {
      toast.error(t('automation.catalog.errors.pageName'))
      return
    }
    const res = await window.api.automation.catalogPage.create({
      projectId,
      name,
      sortOrder: pages.length,
    })
    if (res.status !== 'success' || !res.data) {
      toast.error(res.message ?? t('automation.catalog.pageCreateFailed'))
      return
    }
    toast.success(t('automation.catalog.pageCreated'))
    setNewPageOpen(false)
    setNewPageName('')
    pageIdRef.current = res.data.id
    flowIdRef.current = null
    await refreshCatalog()
  }

  const handleCreateFlow = async () => {
    if (!pageId) return
    const name = newFlowName.trim()
    if (!name) {
      toast.error(t('automation.catalog.errors.flowName'))
      return
    }
    const res = await window.api.automation.flow.create({ pageId, name, sortOrder: flows.length })
    if (res.status !== 'success' || !res.data) {
      toast.error(res.message ?? t('automation.catalog.flowCreateFailed'))
      return
    }
    toast.success(t('automation.catalog.flowCreated'))
    setNewFlowOpen(false)
    setNewFlowName('')
    await loadFlows(pageId)
    setFlowId(res.data.id)
  }

  const confirmDeletePage = async () => {
    if (!deletePageTarget) return
    const res = await window.api.automation.catalogPage.delete(deletePageTarget.id)
    if (res.status !== 'success') {
      toast.error(res.message ?? t('automation.catalog.deleteFailed'))
      return
    }
    toast.success(t('automation.catalog.pageDeleted'))
    setDeletePageTarget(null)
    if (pageId === deletePageTarget.id) {
      setPageId(null)
      setFlowId(null)
    }
    await refreshCatalog()
  }

  const confirmDeleteFlow = async () => {
    if (!deleteFlowTarget) return
    const res = await window.api.automation.flow.delete(deleteFlowTarget.id)
    if (res.status !== 'success') {
      toast.error(res.message ?? t('automation.catalog.deleteFailed'))
      return
    }
    toast.success(t('automation.catalog.flowDeleted'))
    setDeleteFlowTarget(null)
    if (pageId) {
      const flist = await loadFlows(pageId)
      setFlowId(prev => (prev === deleteFlowTarget.id ? (flist[0]?.id ?? null) : prev))
    }
  }

  const handleExport = async () => {
    setExportBusy(true)
    try {
      const res = await window.api.automation.exportCasesByPage(projectId)
      if (res.status !== 'success') {
        toast.error(res.message ?? t('automation.export.failed'))
        return
      }
      const data = res.data
      if (!data) return
      if (data.cancelled) {
        toast.info(t('automation.export.cancelled'))
        return
      }
      toast.success(t('automation.export.done', { count: data.files.length }))
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 gap-3">
      <aside className="flex w-[min(100%,280px)] shrink-0 flex-col overflow-hidden rounded-lg border bg-card/40" aria-label={t('automation.catalog.railAria')}>
        <div className="flex items-center justify-between gap-2 border-b px-2 py-2">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FolderTree className="size-3.5 shrink-0" />
            <span className="truncate">{t('automation.catalog.title')}</span>
          </div>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-xs" onClick={() => setNewPageOpen(true)}>
            <Plus className="size-3.5" />
            {t('automation.catalog.addPage')}
          </Button>
        </div>
        <div className="border-b px-2 py-2">
          <Label className="mb-1 block text-[10px] text-muted-foreground">{t('automation.catalog.filterByGroup')}</Label>
          <Select
            value={catalogGroupFilterId ?? '__all__'}
            onValueChange={v => setCatalogGroupFilterId(v === '__all__' ? null : v)}
            disabled={groups.length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={t('automation.catalog.allGroups')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('automation.catalog.allGroups')}</SelectItem>
              {flatGroupOptions(groups).map(g => (
                <SelectItem key={g.id} value={g.id}>
                  {`${'\u00A0\u00A0'.repeat(g.depth)}${g.name}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-1.5">
            {loading ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">{t('automation.common.loading')}</p>
            ) : pages.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">{t('automation.catalog.emptyPages')}</p>
            ) : filteredPages.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">{t('automation.catalog.emptyPagesInGroup')}</p>
            ) : (
              <ul className="space-y-0.5">
                {filteredPages.map(p => (
                  <li key={p.id}>
                    <div
                      className={cn(
                        'flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors',
                        p.id === pageId ? 'bg-primary/15 font-medium text-foreground' : 'hover:bg-muted/80'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void selectPage(p.id)}
                        className="min-w-0 flex-1 truncate rounded-sm text-left text-sm"
                      >
                        {p.name}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                        onClick={() => setDeletePageTarget(p)}
                        aria-label={t('automation.catalog.deletePage')}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    {p.id === pageId && flows.length > 0 ? (
                      <ul className="ml-2 mt-0.5 space-y-0.5 border-l border-border pl-2">
                        {flows.map(f => (
                          <li key={f.id}>
                            <div
                              className={cn(
                                'flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
                                f.id === flowId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60'
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => setFlowId(f.id)}
                                className="min-w-0 flex-1 truncate rounded-sm text-left text-xs"
                              >
                                {f.name}
                              </button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                                onClick={() => setDeleteFlowTarget(f)}
                                aria-label={t('automation.catalog.deleteFlow')}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {p.id === pageId ? (
                      <div className="mt-1 pl-2">
                        <Button type="button" variant="outline" size="sm" className="h-7 w-full text-xs" onClick={() => setNewFlowOpen(true)}>
                          <Plus className="mr-1 size-3" />
                          {t('automation.catalog.addFlow')}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1" aria-label={t('automation.catalog.breadcrumbAria')}>
            <span className="font-medium text-foreground">{t('automation.catalog.breadcrumbProject')}</span>
            <ChevronRight className="size-3 shrink-0 opacity-60" />
            <span className={cn('truncate', selectedPage ? 'text-foreground' : '')}>{selectedPage?.name ?? '—'}</span>
            <ChevronRight className="size-3 shrink-0 opacity-60" />
            <span className={cn('truncate', selectedFlow ? 'text-foreground' : '')}>{selectedFlow?.name ?? '—'}</span>
          </nav>
          <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1.5" disabled={exportBusy || pages.length === 0} onClick={() => void handleExport()}>
            <FileDown className="size-3.5" />
            {exportBusy ? t('automation.common.saving') : t('automation.export.byPage')}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <CaseTable projectId={projectId} flowId={flowId} defaultFlowId={flowId} flowOptions={flows.map(f => ({ id: f.id, name: f.name }))} />
        </div>
      </div>

      <Dialog open={newPageOpen} onOpenChange={setNewPageOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('automation.catalog.newPageTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-page-name">{t('common.name')}</Label>
            <Input id="new-page-name" value={newPageName} onChange={e => setNewPageName(e.target.value)} placeholder={t('automation.catalog.pageNamePlaceholder')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewPageOpen(false)}>
              {t('automation.common.cancel')}
            </Button>
            <Button type="button" onClick={() => void handleCreatePage()}>
              {t('automation.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newFlowOpen} onOpenChange={setNewFlowOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('automation.catalog.newFlowTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-flow-name">{t('common.name')}</Label>
            <Input id="new-flow-name" value={newFlowName} onChange={e => setNewFlowName(e.target.value)} placeholder={t('automation.catalog.flowNamePlaceholder')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewFlowOpen(false)}>
              {t('automation.common.cancel')}
            </Button>
            <Button type="button" onClick={() => void handleCreateFlow()}>
              {t('automation.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletePageTarget} onOpenChange={o => !o && setDeletePageTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('automation.catalog.deletePageTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('automation.catalog.deletePageHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('automation.common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeletePage()}>{t('automation.common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteFlowTarget} onOpenChange={o => !o && setDeleteFlowTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('automation.catalog.deleteFlowTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('automation.catalog.deleteFlowHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('automation.common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteFlow()}>{t('automation.common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
