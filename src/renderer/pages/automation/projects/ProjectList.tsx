import { ReactFlowProvider } from '@xyflow/react'
import type { LucideIcon } from 'lucide-react'
import { Copy, ExternalLink, Folder, FolderOpen, GitBranch, Globe, Info, LayoutDashboard, Link2, Loader2, Plus, Trash2 } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TestProject, TestProjectTaskLink } from 'shared/automation/types'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { PageMapActionBarLayoutToggle } from '@/pages/automation/map/PageMapActionBarLayoutToggle'
import { PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE } from '@/pages/prmanager/prManagerButtonStyles'
import { useAutomationStore } from '@/stores/useAutomationStore'
import { AutomationDashboard } from '../dashboard/AutomationDashboard'
import { PageNavigationMapView } from '../map/PageNavigationMapView'
import { LinkMasterProjectDialog } from './LinkMasterProjectDialog'
import { ProjectForm } from './ProjectForm'

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
  railOpen: boolean
  onOpenRuns?: () => void
  onOpenCasesForPage?: (pageId: string) => void
}

function hashHue(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 360
}

/** Compact URL for the project rail: host + pathname (no query/hash). Not only hostname — subpaths like /app/ are visible. */
function displayBaseUrlRail(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    const host = u.host || url
    if (u.pathname && u.pathname !== '/') {
      const path = u.pathname.replace(/\/$/, '') || u.pathname
      return `${host}${path}`
    }
    return host
  } catch {
    const rest = url.replace(/^https?:\/\//i, '')
    return rest.split(/[?#]/)[0] ?? url
  }
}

function toOpenableUrl(url: string): string {
  const t = url.trim()
  if (!t) return t
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

type HoverPathAction = { key: string; label: string; icon: LucideIcon; onClick: () => void }

function HoverPathBubble({ children, actions }: { children: ReactNode; actions: HoverPathAction[] }) {
  return (
    <div className="group relative min-h-8 w-full rounded-xl bg-muted/25 px-4 py-3 pr-12 sm:pr-14">
      {children}
      <div
        className={cn(
          'absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-full bg-background/95 px-0.5 py-0.5 shadow-md ring-1 ring-border/30 backdrop-blur-sm transition-opacity duration-150 dark:ring-border/50',
          'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
          'max-sm:pointer-events-auto max-sm:opacity-100'
        )}
      >
        {actions.map(a => (
          <Tooltip key={a.key}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-8 shrink-0 border-0 shadow-none"
                onClick={e => {
                  e.stopPropagation()
                  a.onClick()
                }}
                aria-label={a.label}
              >
                <a.icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {a.label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

function projectMatchesQuery(p: TestProject, q: string): boolean {
  if (!q) return true
  const rail = displayBaseUrlRail(p.baseUrl).toLowerCase()
  return p.name.toLowerCase().includes(q) || p.baseUrl.toLowerCase().includes(q) || rail.includes(q) || (p.description?.toLowerCase().includes(q) ?? false)
}

const projectRailTransition =
  'transition-[width,max-height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-150 motion-reduce:transition-[width,max-height,opacity]'

function projectRailShellClass(railOpen: boolean) {
  return cn(
    projectRailTransition,
    'flex shrink-0 flex-col overflow-hidden bg-muted/10',
    railOpen ? 'max-h-[44vh] w-full opacity-100 lg:max-h-none lg:w-[min(380px,38%)]' : 'max-h-0 w-full opacity-0 lg:max-h-none lg:w-0'
  )
}

/** Fixed width on lg; padding stays constant so close animation only clips, no layout jump. */
function projectRailInnerClass(railOpen: boolean) {
  return cn('flex h-full min-h-0 w-full shrink-0 flex-col gap-2 pr-3 lg:w-[380px]', !railOpen && 'pointer-events-none')
}

type ProjectDetailTab = 'dashboard' | 'pageMap' | 'information'

export function ProjectList({ selectedId, onSelect, railOpen, onOpenRuns, onOpenCasesForPage }: Props) {
  const { t } = useTranslation()
  const projects = useAutomationStore(s => s.projects)
  const projectsLoading = useAutomationStore(s => s.projectsLoading)
  const setProjects = useAutomationStore(s => s.setProjects)
  const setProjectsLoading = useAutomationStore(s => s.setProjectsLoading)
  const removeProject = useAutomationStore(s => s.removeProject)

  const [openForm, setOpenForm] = useState(false)
  const [editing, setEditing] = useState<TestProject | null>(null)
  const [pendingDelete, setPendingDelete] = useState<TestProject | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [detailTab, setDetailTab] = useState<ProjectDetailTab>('information')
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [taskLinks, setTaskLinks] = useState<TestProjectTaskLink[]>([])
  const [taskLinksLoading, setTaskLinksLoading] = useState(false)

  const loadTaskLinks = useCallback(async (testProjectId: string) => {
    setTaskLinksLoading(true)
    try {
      const res = await window.api.automation.project.listTaskLinks(testProjectId)
      setTaskLinks(res.status === 'success' && res.data ? res.data : [])
    } finally {
      setTaskLinksLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setTaskLinks([])
      return
    }
    void loadTaskLinks(selectedId)
  }, [selectedId, loadTaskLinks])

  const openNewProject = useCallback(() => {
    setEditing(null)
    setOpenForm(true)
  }, [])

  const refresh = async () => {
    setProjectsLoading(true)
    try {
      const res = await window.api.automation.project.list()
      if (res.status === 'success' && res.data) setProjects(res.data)
    } finally {
      setProjectsLoading(false)
    }
  }

  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => (q ? projects.filter(p => projectMatchesQuery(p, q)) : projects), [projects, q])

  const railProjects = useMemo(() => {
    if (!selectedId) return filtered
    const selected = projects.find(p => p.id === selectedId)
    if (!selected) return filtered
    if (filtered.some(p => p.id === selectedId)) return filtered
    return [selected, ...filtered]
  }, [filtered, projects, selectedId])

  const selected = useMemo(() => (selectedId ? (projects.find(p => p.id === selectedId) ?? null) : null), [projects, selectedId])

  const handleRailKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (projectsLoading || railProjects.length === 0) return
      const idx = railProjects.findIndex(p => p.id === selectedId)
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (idx === -1) {
          onSelect(railProjects[0].id)
          return
        }
        if (idx < railProjects.length - 1) onSelect(railProjects[idx + 1].id)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (idx <= 0) {
          if (idx === -1 && railProjects[0]) onSelect(railProjects[0].id)
          return
        }
        onSelect(railProjects[idx - 1].id)
      } else if (e.key === 'Home') {
        e.preventDefault()
        onSelect(railProjects[0].id)
      } else if (e.key === 'End') {
        e.preventDefault()
        onSelect(railProjects[railProjects.length - 1].id)
      }
    },
    [onSelect, projectsLoading, railProjects, selectedId]
  )

  const copyText = async (text: string, successToast: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(successToast)
    } catch {
      toast.error(t('automation.projects.copyFailed'))
    }
  }

  const openBaseUrlInBrowser = useCallback(
    async (raw: string) => {
      try {
        await window.api.system.open_external_url(toOpenableUrl(raw))
      } catch {
        toast.error(t('automation.projects.openInBrowserFailed'))
      }
    },
    [t]
  )

  const openWorkspaceFolder = async (folderPath: string) => {
    const p = folderPath?.trim()
    if (!p) {
      toast.error(t('automation.projects.openWorkspaceFolderFailed'))
      return
    }
    try {
      const res = await window.api.system.open_folder_in_explorer(p)
      if (res?.ok === false) {
        if (res.error === 'not_found') toast.error(t('automation.projects.openFolderNotFound'))
        else if (res.error && res.error !== 'no_path' && res.error.length < 160) toast.error(res.error)
        else toast.error(t('automation.projects.openWorkspaceFolderFailed'))
      }
    } catch {
      toast.error(t('automation.projects.openWorkspaceFolderFailed'))
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const res = await window.api.automation.project.delete(pendingDelete.id)
      if (res.status === 'success') {
        removeProject(pendingDelete.id)
        toast.success(t('automation.projects.deleted'))
      } else {
        toast.error(res.message ?? 'Delete failed')
      }
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  const loadingShell = (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className={projectRailShellClass(railOpen)} aria-hidden={!railOpen}>
        <div className={cn(projectRailInnerClass(railOpen), 'space-y-3')}>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 min-w-0 flex-1 rounded-md" />
            <Skeleton className="h-8 w-[7.5rem] shrink-0 rounded-md" />
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-3 rounded-xl bg-muted/25 p-3">
              <Skeleton className="w-1 shrink-0 self-stretch rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <div className="flex gap-1">
                  <Skeleton className="h-5 w-12 rounded-md" />
                  <Skeleton className="h-5 w-12 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
        <Skeleton className="h-8 w-1/2 max-w-md" />
        <Skeleton className="h-8 w-full max-w-xl" />
        <Skeleton className="h-24 w-full max-w-2xl rounded-xl" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>
    </div>
  )

  const emptyAll = (
    <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center gap-4 rounded-xl bg-muted/20 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/50">
        <Folder className="size-7 text-muted-foreground" aria-hidden />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{t('automation.projects.empty')}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE, '!border-0 shadow-none')}
        onClick={openNewProject}
      >
        <Plus className="h-3.5 w-3.5 shrink-0" />
        {t('automation.projects.new')}
      </Button>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {projectsLoading && projects.length === 0 ? (
        loadingShell
      ) : projects.length === 0 ? (
        emptyAll
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className={projectRailShellClass(railOpen)} aria-hidden={!railOpen}>
            <div className={projectRailInnerClass(railOpen)}>
              <div className="flex shrink-0 items-center gap-2">
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('automation.projects.railSearchPlaceholder')}
                  className="h-8 min-w-0 flex-1 bg-background text-sm md:text-sm"
                  aria-label={t('automation.projects.railSearchPlaceholder')}
                  tabIndex={railOpen ? 0 : -1}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(PR_MANAGER_ACCENT_OUTLINE_BTN, PR_MANAGER_ACCENT_OUTLINE_SURFACE, 'shrink-0 shadow-none')}
                  onClick={openNewProject}
                  tabIndex={railOpen ? 0 : -1}
                >
                  <Plus className="size-4 shrink-0" />
                  {t('automation.projects.new')}
                </Button>
              </div>
              <div
                role="listbox"
                aria-label={t('automation.projects.title')}
                tabIndex={railOpen ? 0 : -1}
                onKeyDown={handleRailKeyDown}
                className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {railProjects.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">{t('automation.projects.noSearchResults')}</p>
                ) : (
                  railProjects.map(p => {
                    const hue = hashHue(p.id)
                    const active = selectedId === p.id
                    return (
                      <button
                        key={p.id}
                        id={`project-rail-${p.id}`}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => onSelect(p.id)}
                        tabIndex={railOpen ? 0 : -1}
                        className={cn('flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition', active ? 'bg-primary/10 shadow-none' : 'bg-transparent hover:bg-muted/50')}
                      >
                        <div className="w-1 shrink-0 self-stretch rounded-full" style={{ background: `hsl(${hue} 58% 46%)` }} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium leading-tight">{p.name}</div>
                          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{displayBaseUrlRail(p.baseUrl)}</div>
                          <div className="mt-1.5 flex flex-wrap gap-0.5">
                            {p.browsers.slice(0, 2).map(b => (
                              <Badge key={b} variant="secondary" className="px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide">
                                {b}
                              </Badge>
                            ))}
                            {p.browsers.length > 2 ? (
                              <Badge variant="secondary" className="px-1.5 py-0 text-[9px] tabular-nums">
                                {t('automation.projects.moreBrowsers', { count: p.browsers.length - 2 })}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background/50">
            {selected ? (
              <Tabs value={detailTab} onValueChange={v => setDetailTab(v as ProjectDetailTab)} className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 space-y-4">
                  <header className="space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="mt-0.5 size-3 shrink-0 rounded-full" style={{ background: `hsl(${hashHue(selected.id)} 58% 46%)` }} aria-hidden />
                        <h2 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">{selected.name}</h2>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <Button type="button" size="sm" variant="secondary" className="gap-1.5 border-0 shadow-none" onClick={() => setLinkDialogOpen(true)}>
                          <Link2 className="size-3.5 shrink-0" />
                          {t('automation.projects.linkMaster.button')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="border-0 shadow-none"
                          onClick={() => {
                            setEditing(selected)
                            setOpenForm(true)
                          }}
                        >
                          {t('automation.projects.edit')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="border-0 text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setPendingDelete(selected)}
                        >
                          <Trash2 className="mr-1 size-3.5" />
                          {t('automation.common.delete')}
                        </Button>
                      </div>
                    </div>
                  </header>

                  <div className="flex w-full max-w-xl shrink-0 flex-wrap items-center gap-2">
                    <TabsList className="grid h-9 min-w-0 flex-1 grid-cols-3 rounded-lg bg-muted/50 p-1">
                      <TabsTrigger value="dashboard" className="text-xs shadow-none data-[state=active]:shadow-sm sm:text-sm">
                        <LayoutDashboard aria-hidden />
                        {t('automation.tabs.dashboard')}
                      </TabsTrigger>
                      <TabsTrigger value="pageMap" className="text-xs shadow-none data-[state=active]:shadow-sm sm:text-sm">
                        <GitBranch aria-hidden />
                        {t('automation.tabs.pageMap')}
                      </TabsTrigger>
                      <TabsTrigger value="information" className="text-xs shadow-none data-[state=active]:shadow-sm sm:text-sm">
                        <Info aria-hidden />
                        {t('automation.projects.tabInformation')}
                      </TabsTrigger>
                    </TabsList>
                    {detailTab === 'pageMap' ? (
                      <div className="flex shrink-0 items-center self-center">
                        <PageMapActionBarLayoutToggle className="h-9 w-9" />
                      </div>
                    ) : null}
                  </div>
                </div>

                <TabsContent
                  value="dashboard"
                  className="mt-3 min-h-0 flex-1 overflow-hidden outline-none data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col"
                >
                  <AutomationDashboard projectId={selected.id} />
                </TabsContent>
                <TabsContent
                  value="pageMap"
                  className="mt-3 min-h-0 flex-1 overflow-hidden outline-none data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col"
                >
                  <ReactFlowProvider>
                    <PageNavigationMapView projectId={selected.id} project={selected} onOpenCasesForPage={onOpenCasesForPage} onOpenRuns={onOpenRuns} />
                  </ReactFlowProvider>
                </TabsContent>
                <TabsContent value="information" className="mt-3 min-h-0 flex-1 overflow-y-auto outline-none data-[state=inactive]:hidden data-[state=active]:block">
                  <div className="mx-auto flex w-full flex-col gap-5 pb-2">
                    <section className="space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('automation.projects.fields.baseUrl')}</div>
                      <HoverPathBubble
                        actions={[
                          {
                            key: 'copy-url',
                            label: t('common.copy'),
                            icon: Copy,
                            onClick: () => void copyText(selected.baseUrl, t('automation.projects.urlCopied')),
                          },
                          {
                            key: 'open-url',
                            label: t('automation.projects.openInBrowser'),
                            icon: ExternalLink,
                            onClick: () => void openBaseUrlInBrowser(selected.baseUrl),
                          },
                        ]}
                      >
                        <div className="flex min-w-0 items-center gap-2 font-mono text-sm leading-relaxed text-foreground">
                          <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0 break-all">{selected.baseUrl}</span>
                        </div>
                      </HoverPathBubble>
                    </section>

                    <section className="space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('automation.projects.fields.browsers')}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.browsers.map(b => (
                          <Badge key={b} variant="secondary" className="px-2 py-0.5 text-[11px] uppercase">
                            {b}
                          </Badge>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('automation.projects.linkMaster.linkedHeading')}</div>
                      {taskLinksLoading ? (
                        <div className="flex items-center gap-2 rounded-xl bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          {t('common.loading')}
                        </div>
                      ) : taskLinks.length === 0 ? (
                        <div className="flex flex-col items-start gap-2 rounded-xl bg-muted/25 px-4 py-3">
                          <p className="text-sm text-muted-foreground">{t('automation.projects.linkMaster.noneLinkedHint')}</p>
                          <Button type="button" size="sm" variant="secondary" className="gap-1.5 border-0 shadow-none" onClick={() => setLinkDialogOpen(true)}>
                            <Link2 className="size-3.5 shrink-0" />
                            {t('automation.projects.linkMaster.button')}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 rounded-xl bg-muted/25 px-4 py-3">
                          {taskLinks.map(link => (
                            <Badge key={link.id} variant="secondary" className="font-normal">
                              {link.taskProjectName ?? link.taskProjectId}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('automation.projects.fields.description')}</div>
                      <p className="rounded-xl bg-muted/25 px-4 py-3 text-sm leading-relaxed text-foreground">
                        {selected.description?.trim() ? selected.description : <span className="text-muted-foreground">—</span>}
                      </p>
                    </section>

                    <section className="space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('automation.projects.workspacePath')}</div>
                      <HoverPathBubble
                        actions={[
                          {
                            key: 'copy-path',
                            label: t('automation.projects.copyWorkspacePath'),
                            icon: Copy,
                            onClick: () => void copyText(selected.workspacePath, t('automation.projects.pathCopied')),
                          },
                          {
                            key: 'open-folder',
                            label: t('automation.projects.openWorkspaceFolder'),
                            icon: FolderOpen,
                            onClick: () => void openWorkspaceFolder(selected.workspacePath),
                          },
                        ]}
                      >
                        <div className="min-w-0 font-mono text-sm leading-relaxed text-foreground">
                          <span className="break-all text-muted-foreground">{selected.workspacePath}</span>
                        </div>
                      </HoverPathBubble>
                    </section>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-4 py-12 text-center">
                <Folder className="size-10 text-muted-foreground/60" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-foreground">{t('automation.projects.previewPlaceholder')}</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">{t('automation.projects.previewPlaceholderHint')}</p>
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      <LinkMasterProjectDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        testProjectId={selected?.id ?? ''}
        onLinksChanged={() => {
          if (selected?.id) void loadTaskLinks(selected.id)
        }}
      />

      <ProjectForm
        open={openForm}
        onOpenChange={setOpenForm}
        initial={editing}
        onSaved={async () => {
          setOpenForm(false)
          await refresh()
        }}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={open => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('automation.projects.delete')}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{t('automation.projects.deleteConfirm', { name: pendingDelete?.name ?? '' })}</p>
            {pendingDelete?.baseUrl ? (
              <p className="break-all font-mono text-xs text-foreground/80">{t('automation.projects.deleteConfirmDetail', { url: pendingDelete.baseUrl })}</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('automation.common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : t('automation.common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
