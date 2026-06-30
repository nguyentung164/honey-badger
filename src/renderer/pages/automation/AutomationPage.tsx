'use client'

import { ReactFlowProvider } from '@xyflow/react'
import { Bot, Briefcase, FileText, ListChecks, MapPinned, Minus, PanelLeftClose, PanelLeftOpen, Play, Settings, Square, SquareArrowOutDownLeft, X } from 'lucide-react'
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { TestProject } from 'shared/automation/types'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { PageMapActionBarLayoutToggle } from '@/pages/automation/map/PageMapActionBarLayoutToggle'
import { PageMapAutosaveStatus } from '@/pages/automation/map/PageMapAutosaveStatus'
import { useAutomationToolbarPortalTarget } from '@/pages/main/AutomationToolbarPortalContext'
import { useAutomationStore } from '@/stores/useAutomationStore'
import {
  type AutomationSubTab,
  readPersistedProjectRailOpen,
  readStoredAutomationProjectId,
  readStoredAutomationSubTab,
  writePersistedAutomationProjectId,
  writePersistedAutomationSubTab,
  writePersistedProjectRailOpen,
} from './automationStorage'
import { CasesWorkspace } from './cases/CasesWorkspace'
import { PageNavigationMapView } from './map/PageNavigationMapView'
import { ProjectList } from './projects/ProjectList'
import { RunsView } from './runs/RunsView'
import { AutomationSettings } from './settings/AutomationSettings'

export type AutomationPageProps = {
  mode?: 'embedded' | 'standalone'
}

export function AutomationPage({ mode = 'standalone' }: AutomationPageProps) {
  const { t } = useTranslation()
  const embedded = mode === 'embedded'
  const portal = useAutomationToolbarPortalTarget()

  const projects = useAutomationStore(s => s.projects)
  const setProjects = useAutomationStore(s => s.setProjects)
  const setProjectsLoading = useAutomationStore(s => s.setProjectsLoading)
  const handleStreamEvent = useAutomationStore(s => s.handleStreamEvent)

  const [activeTab, setActiveTab] = useState<AutomationSubTab>(() => readStoredAutomationSubTab())
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [projectRailOpen, setProjectRailOpen] = useState(() => readPersistedProjectRailOpen())
  const [projectId, setProjectId] = useState<string | null>(() => readStoredAutomationProjectId())
  const [casesIntentPageId, setCasesIntentPageId] = useState<string | null>(null)
  const [casesIntentGroupId, setCasesIntentGroupId] = useState<string | null>(null)
  const projectsLoadedRef = useRef(false)

  const setProjectRailOpenPersist = useCallback((open: boolean) => {
    setProjectRailOpen(open)
    writePersistedProjectRailOpen(open)
  }, [])

  const handleMainTabChange = useCallback((v: string) => {
    setSettingsDialogOpen(false)
    setActiveTab(v as AutomationSubTab)
  }, [])

  useEffect(() => {
    writePersistedAutomationSubTab(activeTab)
  }, [activeTab])
  useEffect(() => {
    writePersistedAutomationProjectId(projectId)
  }, [projectId])

  useEffect(() => {
    setCasesIntentPageId(null)
    setCasesIntentGroupId(null)
  }, [projectId])

  const openCasesForPage = useCallback((pageId: string) => {
    setSettingsDialogOpen(false)
    setCasesIntentGroupId(null)
    setCasesIntentPageId(pageId)
    setActiveTab('cases')
  }, [])

  const openCasesForGroup = useCallback((groupId: string) => {
    setSettingsDialogOpen(false)
    setCasesIntentPageId(null)
    setCasesIntentGroupId(groupId)
    setActiveTab('cases')
  }, [])

  const clearCasesIntent = useCallback(() => {
    setCasesIntentPageId(null)
    setCasesIntentGroupId(null)
  }, [])

  const loadProjects = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true && projectsLoadedRef.current
    if (!silent) setProjectsLoading(true)
    try {
      const res = await window.api.automation.project.list()
      if (res.status === 'success' && res.data) {
        setProjects(res.data)
        setProjectId(prev => {
          if (prev && res.data?.some(p => p.id === prev)) return prev
          return res.data?.[0]?.id ?? null
        })
      }
    } finally {
      if (!silent) setProjectsLoading(false)
      projectsLoadedRef.current = true
    }
  }, [setProjects, setProjectsLoading])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  useEffect(() => {
    const off = window.api.automation.onRunStream(event => {
      handleStreamEvent(event)
    })
    return () => off()
  }, [handleStreamEvent])

  const selectedProject: TestProject | null = useMemo(() => (projectId ? (projects.find(p => p.id === projectId) ?? null) : null), [projectId, projects])

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  const tabListClass = embedded ? 'h-5! rounded-md p-0.5' : 'h-6! rounded-md p-0.5'
  const triggerClass = embedded ? 'h-4 gap-0.5 px-1.5 text-[11px] data-[state=active]:shadow-none' : 'h-5 gap-1 px-2 text-xs data-[state=active]:shadow-none'
  const iconClass = embedded ? 'h-3 w-3' : 'h-3.5 w-3.5'

  const showProjectRailToggle = activeTab === 'projects' && projects.length > 0

  const projectCombobox = (
    <div className="shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
      <Combobox
        variant="ghost"
        value={projectId ?? ''}
        onValueChange={v => setProjectId(v || null)}
        options={projects.map(p => ({ value: p.id, label: p.name }))}
        placeholder={t('automation.common.noProjectSelected')}
        emptyText={t('automation.projects.empty')}
        searchPlaceholder={t('automation.projects.title')}
        onOpen={() => void loadProjects({ silent: true })}
        className="w-[min(11rem,28vw)]"
        triggerClassName={cn('px-2 py-0 font-medium hover:bg-muted', embedded ? 'h-5 text-[11px]' : 'h-6 text-xs')}
        contentClassName="min-w-[200px]"
      />
    </div>
  )

  const topBar = (
    <div
      className={cn('flex select-none items-center gap-1.5 pl-1 text-sm', embedded ? 'h-full min-h-0 w-full max-h-8 min-w-0 flex-1' : 'h-9 w-full shrink-0')}
      style={
        {
          WebkitAppRegion: 'drag',
          backgroundColor: 'var(--main-bg)',
          color: 'var(--main-fg)',
        } as CSSProperties
      }
    >
      <div className="flex h-full min-w-0 flex-1 items-center gap-2">
        {!embedded && (
          <div className="w-10 h-6 flex justify-center items-center shrink-0">
            <img src="logo.png" alt="logo" draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
          </div>
        )}
        {!embedded && (
          <div className="flex items-center gap-1 text-xs font-medium shrink-0">
            <Bot className={iconClass} /> {t('automation.title')}
          </div>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 h-full self-stretch">
          <div className="min-w-0 shrink" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            <Tabs value={activeTab} onValueChange={handleMainTabChange} className="min-w-0">
              <TabsList className={tabListClass}>
                <TabsTrigger value="projects" className={cn('gap-0.5', triggerClass)}>
                  <Briefcase className={iconClass} /> {t('automation.tabs.projects')}
                </TabsTrigger>
                <TabsTrigger value="cases" className={cn('gap-0.5', triggerClass)}>
                  <ListChecks className={iconClass} /> {t('automation.tabs.cases')}
                </TabsTrigger>
                <TabsTrigger value="runs" className={cn('gap-0.5', triggerClass)}>
                  <Play className={iconClass} /> {t('automation.tabs.runs')}
                </TabsTrigger>
                <TabsTrigger value="map" className={cn('gap-0.5', triggerClass)}>
                  <MapPinned className={iconClass} /> {t('automation.tabs.pageMap')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="min-h-0 min-w-[20px] flex-1 self-stretch" style={{ WebkitAppRegion: 'drag' } as CSSProperties} aria-hidden />
          <div className="ml-auto flex shrink-0 items-center gap-0.5 pr-0.5" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            {showProjectRailToggle ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-[25px] w-[25px] shrink-0 rounded-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    onClick={() => setProjectRailOpenPersist(!projectRailOpen)}
                    aria-label={projectRailOpen ? t('automation.projects.hideProjectList') : t('automation.projects.showProjectList')}
                    aria-expanded={projectRailOpen}
                  >
                    {projectRailOpen ? (
                      <PanelLeftClose strokeWidth={1.25} absoluteStrokeWidth className="h-4 w-4" />
                    ) : (
                      <PanelLeftOpen strokeWidth={1.25} absoluteStrokeWidth className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{projectRailOpen ? t('automation.projects.hideProjectList') : t('automation.projects.showProjectList')}</TooltipContent>
              </Tooltip>
            ) : null}
            {activeTab === 'map' ? (
              <>
                <PageMapAutosaveStatus />
                <PageMapActionBarLayoutToggle />
              </>
            ) : null}
            {projectCombobox}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className={cn('h-[25px] w-[25px] shrink-0 rounded-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0', settingsDialogOpen && 'bg-muted')}
                  onClick={() => setSettingsDialogOpen(true)}
                  aria-label={t('automation.tabs.settings')}
                  aria-expanded={settingsDialogOpen}
                >
                  <Settings strokeWidth={1.25} absoluteStrokeWidth className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('automation.tabs.settings')}</TooltipContent>
            </Tooltip>
            {!embedded ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-[25px] w-[25px] shrink-0 rounded-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    onClick={() => window.api.automation.requestDock()}
                    aria-label={t('automation.dock')}
                  >
                    <SquareArrowOutDownLeft strokeWidth={1.25} absoluteStrokeWidth className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('automation.dock')}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
      </div>
      {!embedded ? (
        <div className="flex h-full shrink-0 items-center" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <button type="button" onClick={() => handleWindow('minimize')} className="flex h-full w-10 items-center justify-center hover:bg-white/10" aria-label="minimize">
            <Minus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => handleWindow('maximize')} className="flex h-full w-10 items-center justify-center hover:bg-white/10" aria-label="maximize">
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => window.api.automation.closeWindow()}
            className="flex h-full w-10 items-center justify-center hover:bg-red-600 hover:text-white"
            aria-label="close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  )

  const tabsContent = (
    <Tabs value={activeTab} onValueChange={handleMainTabChange} className="flex min-h-0 flex-1 flex-col">
      <TabsContent value="projects" className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col">
        <ProjectList
          selectedId={projectId}
          onSelect={setProjectId}
          railOpen={projectRailOpen}
          onOpenRuns={() => {
            setSettingsDialogOpen(false)
            setActiveTab('runs')
          }}
          onOpenCasesForPage={openCasesForPage}
        />
      </TabsContent>
      <TabsContent value="cases" className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col">
        {selectedProject ? (
          <CasesWorkspace
            projectId={selectedProject.id}
            projectName={selectedProject.name}
            initialCatalogPageId={casesIntentPageId}
            initialCatalogGroupId={casesIntentGroupId}
            onInitialCatalogIntentConsumed={clearCasesIntent}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <FileText className="mr-2 size-4" /> {t('automation.projects.selectHint')}
          </div>
        )}
      </TabsContent>
      <TabsContent value="runs" className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col">
        {selectedProject ? (
          <RunsView project={selectedProject} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{t('automation.projects.selectHint')}</div>
        )}
      </TabsContent>
      <TabsContent value="map" className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col">
        {selectedProject ? (
          <ReactFlowProvider>
            <PageNavigationMapView
              projectId={selectedProject.id}
              project={selectedProject}
              onOpenCasesForPage={openCasesForPage}
              onOpenCasesForGroup={openCasesForGroup}
              onOpenRuns={() => {
                setSettingsDialogOpen(false)
                setActiveTab('runs')
              }}
            />
          </ReactFlowProvider>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{t('automation.projects.selectHint')}</div>
        )}
      </TabsContent>
    </Tabs>
  )

  return (
    <div className={cn('flex w-full flex-col overflow-hidden bg-background', embedded ? 'h-full min-h-0' : 'h-screen')}>
      {embedded && portal.host ? createPortal(topBar, portal.host) : null}
      {!embedded ? topBar : null}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-3">{tabsContent}</div>

      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent
          className="flex max-h-[min(90vh,900px)] w-[min(100%-2rem,720px)] max-w-[min(100%-2rem,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[720px]"
          showCloseButton
        >
          <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
            <DialogTitle>{t('automation.tabs.settings')}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <AutomationSettings />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AutomationPage
