'use client'

import { GitBranchPlus, GitPullRequest, LayoutDashboard, ListOrdered, Minus, Settings, ShieldCheck, Square, Workflow, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitCherryPickBranchesDialog } from '@/components/dialogs/git/GitCherryPickBranchesDialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { OverlayLoader } from '@/components/ui-elements/OverlayLoader'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'
import { AutomationsTab } from './components/AutomationsTab'
import { CheckpointTemplatesTab } from './components/CheckpointTemplatesTab'
import { GitHubTokenDialog } from './components/GitHubTokenDialog'
import { PrManagerGithubRateLimit } from './components/PrManagerGithubRateLimit'
import { PrBoard } from './components/PrBoard'
import { RepoRegistryTab } from './components/RepoRegistryTab'
import { usePrData } from './hooks/usePrData'

type Tab = 'board' | 'repos' | 'templates' | 'automations'

export function PrManager() {
  const { t } = useTranslation()
  const user = useTaskAuthStore(s => s.user)
  const verifySession = useTaskAuthStore(s => s.verifySession)

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('board')
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const [cherryPickOpen, setCherryPickOpen] = useState(false)

  const { loading, repos, templates, tracked, automations, tokenStatus, refresh, refreshToken } = usePrData(projectId)

  useEffect(() => {
    verifySession()
  }, [verifySession])

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true)
    try {
      const res = await window.api.task.getProjectsForUser()
      if (res.status === 'success' && res.data) {
        const list = res.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
        setProjects(list)
        setProjectId(prev => prev ?? list[0]?.id ?? null)
      }
    } catch {
      // ignore
    } finally {
      setLoadingProjects(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    const offAuto = window.api.pr.onAutomationFired(payload => {
      toast.success(
        t('prManager.shell.automationToast', {
          prNumber: payload.prNumber,
          sourceBranch: payload.sourceBranch,
          to: payload.to,
        })
      )
    })
    return () => {
      offAuto()
    }
  }, [t])

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <div
        className="flex h-9 shrink-0 select-none items-center justify-between gap-2 pl-2 text-sm"
        style={
          {
            WebkitAppRegion: 'drag',
            backgroundColor: 'var(--main-bg)',
            color: 'var(--main-fg)',
          } as CSSProperties
        }
      >
        <div className="flex h-full min-w-0 flex-1 items-center gap-3">
          <div className="flex h-6 w-15 shrink-0 justify-center pt-1.5 pl-1">
            <img src="logo.png" alt={t('prManager.shell.logoAlt')} draggable="false" className="h-3.5 w-10 dark:brightness-130" />
          </div>
          <div className="flex items-center gap-1 text-xs font-medium">
            <GitPullRequest className="h-3.5 w-3.5" /> {t('prManager.shell.appTitle')}
          </div>
          <div className="shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            <Combobox
              variant="ghost"
              value={projectId ?? ''}
              onValueChange={v => setProjectId(v || null)}
              options={projects.map(p => ({ value: p.id, label: p.name }))}
              placeholder={t('prManager.shell.projectPlaceholder')}
              emptyText={loadingProjects ? t('prManager.shell.projectLoading') : t('prManager.shell.projectEmpty')}
              searchPlaceholder={t('prManager.shell.projectSearchPlaceholder')}
              onOpen={loadProjects}
              disabled={loadingProjects && projects.length === 0}
              triggerClassName="h-6 px-2 py-0 text-xs font-medium hover:bg-muted"
              contentClassName="min-w-[200px]"
            />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 shrink" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
              <Tabs value={activeTab} onValueChange={v => setActiveTab(v as Tab)} className="min-w-0">
                <TabsList className="h-6! rounded-md p-0.5">
                  <TabsTrigger value="board" className="h-5 gap-1 px-2 text-xs data-[state=active]:shadow-none">
                    <LayoutDashboard className="h-3.5 w-3.5" /> {t('prManager.shell.tabBoard')}
                  </TabsTrigger>
                  <TabsTrigger value="repos" className="h-5 gap-1 px-2 text-xs data-[state=active]:shadow-none">
                    <GitBranchPlus className="h-3.5 w-3.5" /> {t('prManager.shell.tabRepos')}
                  </TabsTrigger>
                  <TabsTrigger value="templates" className="h-5 gap-1 px-2 text-xs data-[state=active]:shadow-none">
                    <Settings className="h-3.5 w-3.5" /> {t('prManager.shell.tabCheckpoints')}
                  </TabsTrigger>
                  <TabsTrigger value="automations" className="h-5 gap-1 px-2 text-xs data-[state=active]:shadow-none">
                    <Workflow className="h-3.5 w-3.5" /> {t('prManager.shell.tabAutomations')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div
              className="min-h-9 min-w-6 flex-1 self-stretch"
              style={{ WebkitAppRegion: 'drag' } as CSSProperties}
              aria-hidden
            />
            <div
              className="flex shrink-0 items-center gap-1.5"
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    id="pr-manager-git-cherry-pick-branches-button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setCherryPickOpen(true)}
                    className="h-6 w-6 shrink-0 rounded-sm text-emerald-600 hover:bg-muted hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                  >
                    <ListOrdered strokeWidth={1.25} className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('git.cherryPickBranches.tooltip')}</TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTokenDialogOpen(true)}
                className={cn(
                  'h-6 gap-1 px-2 text-xs',
                  tokenStatus?.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                )}
                title={
                  tokenStatus?.ok
                    ? t('prManager.shell.tokenLoggedInTitle', { login: tokenStatus.login })
                    : t('prManager.shell.tokenNotConfiguredTitle')
                }
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {tokenStatus?.ok ? tokenStatus.login : t('prManager.shell.tokenConfigure')}
              </Button>
            </div>
          </div>
        </div>
        <div
          className="flex h-full shrink-0 items-center gap-0.5 pr-0.5"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          <PrManagerGithubRateLimit tokenStatus={tokenStatus} />
        </div>
        <div className="flex h-full shrink-0 items-center" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <button
            type="button"
            onClick={() => handleWindow('minimize')}
            className="flex h-full w-10 items-center justify-center hover:bg-white/10"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleWindow('maximize')}
            className="flex h-full w-10 items-center justify-center hover:bg-white/10"
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => handleWindow('close')}
            className="flex h-full w-10 items-center justify-center hover:bg-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        {!projectId ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t('prManager.shell.selectProjectHint')}
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as Tab)} className="flex min-h-0 flex-1 flex-col">
            <TabsContent value="board" className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col">
              <PrBoard
                projectId={projectId}
                repos={repos}
                templates={templates}
                tracked={tracked}
                loading={loading}
                onRefresh={refresh}
                githubTokenOk={Boolean(tokenStatus?.ok)}
              />
            </TabsContent>
            <TabsContent value="repos" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden">
              <RepoRegistryTab projectId={projectId} userId={user?.id ?? null} repos={repos} onRefresh={refresh} />
            </TabsContent>
            <TabsContent value="templates" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden">
              <CheckpointTemplatesTab projectId={projectId} templates={templates} onRefresh={refresh} />
            </TabsContent>
            <TabsContent value="automations" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden">
              <AutomationsTab automations={automations} repos={repos} onRefresh={refresh} />
            </TabsContent>
          </Tabs>
        )}
        <OverlayLoader isLoading={loading} />
      </div>

      <GitHubTokenDialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen} currentStatus={tokenStatus} onChanged={refreshToken} />
      <GitCherryPickBranchesDialog
        open={cherryPickOpen}
        onOpenChange={setCherryPickOpen}
        selectedProjectId={projectId}
        onComplete={() => refresh()}
      />
    </div>
  )
}
