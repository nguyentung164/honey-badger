'use client'

import { Bot, FileText, FolderKanban, LayoutDashboard, ListChecks, Minus, Play, Settings, Square, SquareArrowOutDownLeft, X } from 'lucide-react'
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { TestProject } from 'shared/automation/types'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAutomationToolbarPortalTarget } from '@/pages/main/AutomationToolbarPortalContext'
import { useAutomationStore } from '@/stores/useAutomationStore'
import {
  type AutomationSubTab,
  readStoredAutomationProjectId,
  readStoredAutomationSubTab,
  writePersistedAutomationProjectId,
  writePersistedAutomationSubTab,
} from './automationStorage'
import { CaseTable } from './cases/CaseTable'
import { AutomationDashboard } from './dashboard/AutomationDashboard'
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
  const [projectId, setProjectId] = useState<string | null>(() => readStoredAutomationProjectId())
  const projectsLoadedRef = useRef(false)

  useEffect(() => {
    writePersistedAutomationSubTab(activeTab)
  }, [activeTab])
  useEffect(() => {
    writePersistedAutomationProjectId(projectId)
  }, [projectId])

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true)
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
      setProjectsLoading(false)
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
  const compactBtn = embedded ? 'h-[25px] w-[25px]' : 'h-6 w-6'

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
        <div className="shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <Combobox
            variant="ghost"
            value={projectId ?? ''}
            onValueChange={v => setProjectId(v || null)}
            options={projects.map(p => ({ value: p.id, label: p.name }))}
            placeholder={t('automation.common.noProjectSelected')}
            emptyText={t('automation.projects.empty')}
            searchPlaceholder={t('automation.projects.title')}
            onOpen={loadProjects}
            triggerClassName={cn('px-2 py-0 font-medium hover:bg-muted', embedded ? 'h-5 text-[11px]' : 'h-6 text-xs')}
            contentClassName="min-w-[200px]"
          />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 h-full self-stretch">
          <div className="min-w-0 shrink" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as AutomationSubTab)} className="min-w-0">
              <TabsList className={tabListClass}>
                <TabsTrigger value="projects" className={cn('gap-0.5', triggerClass)}>
                  <FolderKanban className={iconClass} /> {t('automation.tabs.projects')}
                </TabsTrigger>
                <TabsTrigger value="cases" className={cn('gap-0.5', triggerClass)}>
                  <ListChecks className={iconClass} /> {t('automation.tabs.cases')}
                </TabsTrigger>
                <TabsTrigger value="runs" className={cn('gap-0.5', triggerClass)}>
                  <Play className={iconClass} /> {t('automation.tabs.runs')}
                </TabsTrigger>
                <TabsTrigger value="dashboard" className={cn('gap-0.5', triggerClass)}>
                  <LayoutDashboard className={iconClass} /> {t('automation.tabs.dashboard')}
                </TabsTrigger>
                <TabsTrigger value="settings" className={cn('gap-0.5', triggerClass)}>
                  <Settings className={iconClass} /> {t('automation.tabs.settings')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="min-h-0 min-w-[20px] flex-1 self-stretch" style={{ WebkitAppRegion: 'drag' } as CSSProperties} aria-hidden />
          <div className="ml-auto flex shrink-0 items-center gap-0.5 pr-0.5" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            {!embedded ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className={compactBtn} onClick={() => window.api.automation.requestDock()} aria-label={t('automation.dock')}>
                    <SquareArrowOutDownLeft className={iconClass} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('automation.dock')}</TooltipContent>
              </Tooltip>
            ) : null}
            {!embedded ? (
              <>
                <Button type="button" variant="ghost" size="icon" className={compactBtn} onClick={() => handleWindow('minimize')} aria-label="minimize">
                  <Minus className={iconClass} />
                </Button>
                <Button type="button" variant="ghost" size="icon" className={compactBtn} onClick={() => handleWindow('maximize')} aria-label="maximize">
                  <Square className={iconClass} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(compactBtn, 'hover:bg-destructive hover:text-destructive-foreground')}
                  onClick={() => handleWindow('close')}
                  aria-label="close"
                >
                  <X className={iconClass} />
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )

  const tabsContent = (
    <Tabs value={activeTab} onValueChange={v => setActiveTab(v as AutomationSubTab)} className="flex min-h-0 flex-1 flex-col">
      <TabsContent value="projects" className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col">
        <ProjectList selectedId={projectId} onSelect={setProjectId} />
      </TabsContent>
      <TabsContent value="cases" className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col">
        {selectedProject ? (
          <CaseTable projectId={selectedProject.id} />
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
      <TabsContent value="dashboard" className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col">
        {selectedProject ? (
          <AutomationDashboard projectId={selectedProject.id} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{t('automation.projects.selectHint')}</div>
        )}
      </TabsContent>
      <TabsContent value="settings" className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col">
        <AutomationSettings selectedProject={selectedProject} />
      </TabsContent>
    </Tabs>
  )

  return (
    <div className={cn('flex w-full flex-col overflow-hidden bg-background', embedded ? 'h-full min-h-0' : 'h-screen')}>
      {embedded && portal.host ? createPortal(topBar, portal.host) : null}
      {!embedded ? topBar : null}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-3">{tabsContent}</div>
    </div>
  )
}

export default AutomationPage
