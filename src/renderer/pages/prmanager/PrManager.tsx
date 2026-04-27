'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { GitCherryPickBranchesDialog } from '@/components/dialogs/git/GitCherryPickBranchesDialog'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { OverlayLoader } from '@/components/ui-elements/OverlayLoader'
import toast from '@/components/ui-elements/Toast'
import { cn } from '@/lib/utils'
import { usePrManagerToolbarPortalTarget } from '@/pages/main/PrManagerToolbarPortalContext'
import { useTaskAuthStore } from '@/stores/useTaskAuthStore'
import { GitHubTokenDialog } from './components/GitHubTokenDialog'
import { PrBoard } from './components/PrBoard'
import { PrManagerSettingsPanel } from './components/PrManagerSettingsPanel'
import { usePrData } from './hooks/usePrData'
import { PrManagerTopBar } from './PrManagerTopBar'
import { PrOperationLogProvider } from './PrOperationLogContext'

type Tab = 'board' | 'settings'

export type PrManagerProps = {
  embedded?: boolean
  /** Khi nhúng trong main: tách sang cửa sổ PR Manager riêng */
  onDetachToWindow?: () => void
}

export function PrManager({ embedded = false, onDetachToWindow }: PrManagerProps) {
  const { t } = useTranslation()
  const user = useTaskAuthStore(s => s.user)
  const verifySession = useTaskAuthStore(s => s.verifySession)
  const portal = usePrManagerToolbarPortalTarget()

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

  const topBar = (
    <PrManagerTopBar
      variant={embedded ? 'embedded' : 'window'}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      projects={projects}
      projectId={projectId}
      onProjectIdChange={setProjectId}
      loadProjects={loadProjects}
      loadingProjects={loadingProjects}
      tokenStatus={tokenStatus}
      onCherryPick={() => setCherryPickOpen(true)}
      onOpenToken={() => setTokenDialogOpen(true)}
      onDockToMain={!embedded ? () => window.api.prManager.requestDock() : undefined}
      onDetachToWindow={embedded ? onDetachToWindow : undefined}
    />
  )

  return (
    <PrOperationLogProvider>
      <div className={cn('flex w-full flex-col overflow-hidden bg-background', embedded ? 'h-full min-h-0' : 'h-screen')}>
        {embedded && portal.host ? createPortal(topBar, portal.host) : null}
        {!embedded ? topBar : null}

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          {!projectId ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{t('prManager.shell.selectProjectHint')}</div>
          ) : (
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as Tab)} className="flex min-h-0 flex-1 flex-col">
              <TabsContent value="board" className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col">
                <PrBoard projectId={projectId} repos={repos} templates={templates} tracked={tracked} loading={loading} onRefresh={refresh} githubTokenOk={Boolean(tokenStatus?.ok)} />
              </TabsContent>
              <TabsContent value="settings" className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col">
                <PrManagerSettingsPanel
                  projectId={projectId}
                  userId={user?.id ?? null}
                  repos={repos}
                  templates={templates}
                  automations={automations}
                  onRefresh={refresh}
                />
              </TabsContent>
            </Tabs>
          )}
          <OverlayLoader isLoading={loading} />
        </div>

        <GitHubTokenDialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen} currentStatus={tokenStatus} onChanged={refreshToken} />
        <GitCherryPickBranchesDialog open={cherryPickOpen} onOpenChange={setCherryPickOpen} selectedProjectId={projectId} onComplete={() => refresh()} />
      </div>
    </PrOperationLogProvider>
  )
}
