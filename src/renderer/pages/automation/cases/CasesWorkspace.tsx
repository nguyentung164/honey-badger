'use client'

import { ChevronRight, FileText, FolderTree, GitBranch, Plus, Trash2 } from 'lucide-react'
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { filterPagesByCatalogGroupSubtree } from '@/pages/automation/map/pageMapGraph'
import { catalogHierarchyBadgeClass, catalogHierarchyIconClass, catalogBreadcrumbAnimateClass, catalogHierarchyTone } from './catalogHierarchyStyles'
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

type CatalogPageGroupSection = {
  key: string
  label: string
  depth: number
  pages: TestCatalogPage[]
}

function sortCatalogPages(a: TestCatalogPage, b: TestCatalogPage) {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
}

function buildCatalogPageSections(pages: TestCatalogPage[], groups: TestCatalogGroup[], ungroupedLabel: string): CatalogPageGroupSection[] {
  const knownGroupIds = new Set(groups.map(g => g.id))
  const sections: CatalogPageGroupSection[] = []

  for (const g of flatGroupOptions(groups)) {
    const groupPages = pages.filter(p => p.groupId === g.id).sort(sortCatalogPages)
    if (groupPages.length > 0) {
      sections.push({ key: g.id, label: g.name, depth: g.depth, pages: groupPages })
    }
  }

  const ungrouped = pages.filter(p => !p.groupId || !knownGroupIds.has(p.groupId)).sort(sortCatalogPages)
  if (ungrouped.length > 0) {
    sections.push({ key: '__ungrouped__', label: ungroupedLabel, depth: 0, pages: ungrouped })
  }

  return sections
}

interface Props {
  projectId: string
  projectName: string
  /** Khi mở từ Page map / shell: chọn catalog page này sau khi load danh sách. */
  initialCatalogPageId?: string | null
  /** Khi mở từ Page map: lọc theo nhóm catalog (expand cây con). */
  initialCatalogGroupId?: string | null
  onInitialCatalogIntentConsumed?: () => void
}

export function CasesWorkspace({ projectId, projectName, initialCatalogPageId, initialCatalogGroupId, onInitialCatalogIntentConsumed }: Props) {
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
    setFlows([])
    setFlowId(null)
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

  const catalogPageSections = useMemo(() => {
    if (catalogGroupFilterId) return null
    return buildCatalogPageSections(pages, groups, t('automation.catalog.ungroupedPages'))
  }, [catalogGroupFilterId, pages, groups, t])

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

  const renderCatalogPage = (p: TestCatalogPage) => {
    const isOpen = p.id === pageId
    const pageSubtitle = isOpen
      ? t('automation.catalog.flowCount', { count: flows.length })
      : (p.description?.trim() || p.slug?.trim() || null)

    return (
      <li key={p.id}>
        <Collapsible
          open={isOpen}
          onOpenChange={open => {
            if (open) void selectPage(p.id)
          }}
        >
          <div
            className={cn(
              'group relative flex w-full items-center gap-1 rounded-lg text-sm transition-colors duration-200',
              isOpen
                ? catalogHierarchyTone.page.itemSelected
                : cn('text-foreground/95', catalogHierarchyTone.page.itemHover),
            )}
          >
            <CollapsibleTrigger asChild>
              <button type="button" className="flex min-w-0 flex-1 items-start gap-1.5 rounded-lg px-2.5 py-2 text-left">
                <ChevronRight
                  className={cn(
                    'mt-0.5 size-3.5 shrink-0 transition-transform duration-200 ease-out',
                    isOpen ? cn('rotate-90', catalogHierarchyTone.page.icon) : 'text-muted-foreground',
                  )}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm">{p.name}</span>
                  {pageSubtitle ? (
                    <span className="truncate text-[10px] font-normal leading-snug text-muted-foreground">{pageSubtitle}</span>
                  ) : null}
                </span>
              </button>
            </CollapsibleTrigger>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mr-0.5 h-7 w-7 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100"
              onClick={() => setDeletePageTarget(p)}
              aria-label={t('automation.catalog.deletePage')}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <CollapsibleContent
            className={cn(
              'overflow-hidden',
              'data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:animate-none',
            )}
          >
            <div className={cn('ml-2.5 mt-1 space-y-1 border-l-2 pl-2.5', catalogHierarchyTone.flow.rail)}>
              {flows.length > 0 ? (
                <ul className="space-y-1">
                  {flows.map(f => (
                    <li key={f.id}>
                      <div
                        className={cn(
                          'group relative flex w-full items-center gap-1 rounded-md text-xs transition-colors duration-150',
                          f.id === flowId
                            ? catalogHierarchyTone.flow.itemSelected
                            : cn('text-foreground/90', catalogHierarchyTone.flow.itemHover),
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setFlowId(f.id)}
                          className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-xs"
                        >
                          {f.name}
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mr-0.5 h-6 w-6 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100"
                          onClick={() => setDeleteFlowTarget(f)}
                          aria-label={t('automation.catalog.deleteFlow')}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-1.5 text-[10px] text-muted-foreground">{t('automation.catalog.emptyFlows')}</p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn('h-7 w-full text-xs', catalogHierarchyTone.flow.addButton)}
                onClick={() => setNewFlowOpen(true)}
              >
                <Plus className="mr-1 size-3" />
                {t('automation.catalog.addFlow')}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </li>
    )
  }

  return (
    <div className="flex h-full min-h-0 gap-3">
      <aside
        className="flex w-[min(100%,280px)] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-muted/10 shadow-sm dark:bg-muted/5"
        aria-label={t('automation.catalog.railAria')}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-muted/85 px-2.5 py-2 dark:bg-muted/55">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/90">
            <FolderTree className={cn('size-3.5 shrink-0', catalogHierarchyTone.project.icon)} />
            <span className="truncate">{t('automation.catalog.title')}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn('h-7 shrink-0 px-2 text-xs', catalogHierarchyTone.page.addButton)}
            onClick={() => setNewPageOpen(true)}
          >
            <Plus className="size-3.5" />
            {t('automation.catalog.addPage')}
          </Button>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-muted/30 px-2.5 py-1.5 dark:bg-muted/20">
          <Label
            htmlFor="catalog-group-filter"
            className="shrink-0 whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {t('automation.catalog.filterByGroup')}
          </Label>
          <Select
            value={catalogGroupFilterId ?? '__all__'}
            onValueChange={v => setCatalogGroupFilterId(v === '__all__' ? null : v)}
            disabled={groups.length === 0}
          >
            <SelectTrigger id="catalog-group-filter" className="h-7 min-w-0 flex-1 border-border/60 bg-background/80 text-xs shadow-none">
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
        <ScrollArea className="min-h-0 flex-1 bg-muted/25 dark:bg-muted/15">
          <div className="flex flex-col gap-1.5 p-2">
            {loading ? (
              <p className="rounded-md px-2 py-4 text-center text-xs text-muted-foreground">{t('automation.common.loading')}</p>
            ) : pages.length === 0 ? (
              <p className="rounded-md px-2 py-4 text-center text-xs text-muted-foreground">{t('automation.catalog.emptyPages')}</p>
            ) : filteredPages.length === 0 ? (
              <p className="rounded-md px-2 py-4 text-center text-xs text-muted-foreground">{t('automation.catalog.emptyPagesInGroup')}</p>
            ) : catalogPageSections ? (
              <div className="flex flex-col gap-3">
                {catalogPageSections.map(section => (
                  <section key={section.key} className="flex flex-col gap-1.5">
                    <h3
                      className={cn(
                        'truncate px-1 text-[10px] font-semibold uppercase tracking-wide',
                        catalogHierarchyTone.page.icon,
                      )}
                      style={{ paddingLeft: `${0.25 + section.depth * 0.625}rem` }}
                      title={section.label}
                    >
                      {section.label}
                    </h3>
                    <ul className="flex flex-col gap-1.5">{section.pages.map(renderCatalogPage)}</ul>
                  </section>
                ))}
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">{filteredPages.map(renderCatalogPage)}</ul>
            )}
          </div>
        </ScrollArea>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <Breadcrumb className="shrink-0" aria-label={t('automation.catalog.breadcrumbAria')}>
          <BreadcrumbList className="flex-nowrap gap-1.5 px-0.5 text-xs sm:gap-2">
            <BreadcrumbItem>
              <span
                key={projectId}
                className={cn(catalogHierarchyBadgeClass('project'), catalogBreadcrumbAnimateClass)}
                title={projectName}
              >
                <FolderTree className={catalogHierarchyIconClass('project')} aria-hidden />
                <span className="truncate">{projectName}</span>
              </span>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-muted-foreground/40" />
            <BreadcrumbItem>
              {selectedPage ? (
                <span
                  key={pageId ?? 'page'}
                  className={cn(catalogHierarchyBadgeClass('page'), catalogBreadcrumbAnimateClass)}
                  title={selectedPage.name}
                >
                  <FileText className={catalogHierarchyIconClass('page')} aria-hidden />
                  <span className="truncate">{selectedPage.name}</span>
                </span>
              ) : (
                <span className="px-1 text-muted-foreground">—</span>
              )}
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-muted-foreground/40" />
            <BreadcrumbItem>
              {selectedFlow ? (
                <BreadcrumbPage
                  key={flowId ?? 'flow'}
                  className={cn(catalogHierarchyBadgeClass('flow'), catalogBreadcrumbAnimateClass)}
                  title={selectedFlow.name}
                >
                  <GitBranch className={catalogHierarchyIconClass('flow')} aria-hidden />
                  <span className="truncate">{selectedFlow.name}</span>
                </BreadcrumbPage>
              ) : (
                <span className="px-1 text-muted-foreground">—</span>
              )}
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="min-h-0 flex-1 overflow-hidden">
          <CaseTable
            projectId={projectId}
            flowId={flowId}
            defaultFlowId={flowId}
            flowOptions={flows.map(f => ({ id: f.id, name: f.name }))}
            canExport={pages.length > 0}
          />
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
