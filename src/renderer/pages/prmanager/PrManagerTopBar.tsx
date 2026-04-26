'use client'

import {
  GitBranchPlus,
  GitPullRequest,
  LayoutDashboard,
  ListOrdered,
  Minus,
  Settings,
  ShieldCheck,
  Square,
  SquareArrowOutDownLeft,
  SquareArrowOutUpRight,
  Workflow,
  X,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { PrManagerGithubRateLimit } from './components/PrManagerGithubRateLimit'

type Tab = 'board' | 'repos' | 'templates' | 'automations'

type TokenStatus = { ok: boolean; login?: string; message?: string } | null

export type PrManagerTopBarProps = {
  variant: 'window' | 'embedded'
  activeTab: Tab
  onActiveTabChange: (tab: Tab) => void
  projects: { id: string; name: string }[]
  projectId: string | null
  onProjectIdChange: (id: string | null) => void
  loadProjects: () => void
  loadingProjects: boolean
  tokenStatus: TokenStatus
  onCherryPick: () => void
  onOpenToken: () => void
  /** Cửa sổ riêng: gộp vào app chính */
  onDockToMain?: () => void
  /** Nhúng title bar: tách sang cửa sổ */
  onDetachToWindow?: () => void
}

export function PrManagerTopBar({
  variant,
  activeTab,
  onActiveTabChange,
  projects,
  projectId,
  onProjectIdChange,
  loadProjects,
  loadingProjects,
  tokenStatus,
  onCherryPick,
  onOpenToken,
  onDockToMain,
  onDetachToWindow,
}: PrManagerTopBarProps) {
  const { t } = useTranslation()
  const embedded = variant === 'embedded'
  /** Nhúng title bar main = h-8 — phải khớp chiều cao, tránh lệch dọc so với icon/text còn lại */
  const barHeight = embedded ? 'h-full min-h-0' : 'h-9'
  const tabListClass = embedded ? 'h-5! rounded-md p-0.5' : 'h-6! rounded-md p-0.5'
  const triggerClass = embedded
    ? 'h-4 gap-0.5 px-1.5 text-[11px] data-[state=active]:shadow-none'
    : 'h-5 gap-1 px-2 text-xs data-[state=active]:shadow-none'
  const iconClass = embedded ? 'h-3 w-3' : 'h-3.5 w-3.5'
  const compactBtn = embedded ? 'h-[25px] w-[25px]' : 'h-6 w-6'

  const handleWindow = (action: string) => {
    window.api.electron.send('window:action', action)
  }

  const tokenTooltip = tokenStatus?.ok
    ? t('prManager.shell.tokenLoggedInTitle', { login: tokenStatus.login })
    : t('prManager.shell.tokenNotConfiguredTitle')

  return (
    <div
      className={cn(
        'flex select-none items-center gap-1.5 pl-1 text-sm',
        barHeight,
        embedded ? 'min-w-0 w-full flex-1 max-h-8' : 'w-full shrink-0'
      )}
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
          <div className="w-10 h-6 flex justify-center pt-1.5 pl-1 shrink-0">
            <img src="logo.png" alt={t('prManager.shell.logoAlt')} draggable="false" className="w-3.5 h-3.5 dark:brightness-130" />
          </div>
        )}
        {!embedded && (
          <div className="flex items-center gap-1 text-xs font-medium shrink-0">
            <GitPullRequest className={iconClass} /> {t('prManager.shell.appTitle')}
          </div>
        )}
        <div className="shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <Combobox
            variant="ghost"
            value={projectId ?? ''}
            onValueChange={v => onProjectIdChange(v || null)}
            options={projects.map(p => ({ value: p.id, label: p.name }))}
            placeholder={t('prManager.shell.projectPlaceholder')}
            emptyText={loadingProjects ? t('prManager.shell.projectLoading') : t('prManager.shell.projectEmpty')}
            searchPlaceholder={t('prManager.shell.projectSearchPlaceholder')}
            onOpen={loadProjects}
            disabled={loadingProjects && projects.length === 0}
            triggerClassName={cn('px-2 py-0 font-medium hover:bg-muted', embedded ? 'h-5 text-[11px]' : 'h-6 text-xs')}
            contentClassName="min-w-[200px]"
          />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 h-full self-stretch">
          <div className="min-w-0 shrink" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            <Tabs value={activeTab} onValueChange={v => onActiveTabChange(v as Tab)} className="min-w-0">
              <TabsList className={tabListClass}>
                <TabsTrigger value="board" className={cn('gap-0.5', triggerClass)}>
                  <LayoutDashboard className={iconClass} /> {t('prManager.shell.tabBoard')}
                </TabsTrigger>
                <TabsTrigger value="repos" className={cn('gap-0.5', triggerClass)}>
                  <GitBranchPlus className={iconClass} /> {t('prManager.shell.tabRepos')}
                </TabsTrigger>
                <TabsTrigger value="templates" className={cn('gap-0.5', triggerClass)}>
                  <Settings className={iconClass} /> {t('prManager.shell.tabCheckpoints')}
                </TabsTrigger>
                <TabsTrigger value="automations" className={cn('gap-0.5', triggerClass)}>
                  <Workflow className={iconClass} /> {t('prManager.shell.tabAutomations')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div
            className="min-h-0 min-w-[20px] flex-1 self-stretch"
            style={{ WebkitAppRegion: 'drag' } as CSSProperties}
            aria-hidden
          />
          <div className="ml-auto flex shrink-0 items-center gap-0.5 pr-0.5" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  id="pr-manager-git-cherry-pick-branches-button"
                  variant="ghost"
                  size="icon"
                  onClick={onCherryPick}
                  className={cn('shrink-0 rounded-sm text-emerald-600 hover:bg-muted hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300', compactBtn)}
                >
                  <ListOrdered strokeWidth={1.25} className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('git.cherryPickBranches.tooltip')}</TooltipContent>
            </Tooltip>
            <PrManagerGithubRateLimit tokenStatus={tokenStatus} />
            {embedded ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onOpenToken}
                    className={cn(
                      'shrink-0 rounded-sm',
                      compactBtn,
                      tokenStatus?.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                    )}
                    aria-label={tokenTooltip}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{tokenTooltip}</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onOpenToken}
                className={cn(
                  'h-6 shrink-0 gap-1 px-2 text-xs whitespace-nowrap',
                  tokenStatus?.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                )}
                title={tokenTooltip}
              >
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span>{tokenStatus?.ok ? tokenStatus.login : t('prManager.shell.tokenConfigure')}</span>
              </Button>
            )}
            {embedded && onDetachToWindow && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className={cn('shrink-0 rounded-sm', compactBtn)} onClick={onDetachToWindow}>
                    <SquareArrowOutUpRight strokeWidth={1.25} className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('mainShell.prManagerDetachTooltip')}</TooltipContent>
              </Tooltip>
            )}
            {!embedded && onDockToMain && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className={cn('shrink-0 rounded-sm', compactBtn)} onClick={onDockToMain}>
                    <SquareArrowOutDownLeft strokeWidth={1.25} className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('mainShell.prManagerDockTooltip')}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
      {!embedded && (
        <div className="flex h-full shrink-0 items-center" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <button type="button" onClick={() => handleWindow('minimize')} className="flex h-full w-10 items-center justify-center hover:bg-white/10">
            <Minus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => handleWindow('maximize')} className="flex h-full w-10 items-center justify-center hover:bg-white/10">
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => window.api.prManager.closeWindow()}
            className="flex h-full w-10 items-center justify-center hover:bg-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
